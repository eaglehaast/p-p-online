#!/usr/bin/env node
'use strict';

// Smoke test: динамитный прорыв из-под запертой стены.
//
// Игрок затыкает узкие проходы минами. Сами проходы геометрически чисты, поэтому цель
// «видна» — а лететь туда нельзя, и обычный планировщик такие маршруты уже отбросил.
// ИИ уходит в фолбек (побег от мин / подход к центру) и топчется у базы с полным
// инвентарём динамита: прорубленный коридор ничего не собирает В ЭТОТ ход, а все
// критерии приёмки альтернативного плана меряют только сиюминутный улов —
// «собрал больше», «сел безопаснее», «счёт выше» (последний вообще выключен при
// currentScore === 0, а у фолбека счёт ровно 0). Итог: заряд не тратится никогда.
//
// Прорыв — отдельный критерий: ИИ заперт, коридор реально выводит ЗА стену в этот же
// ход и приближает к цели. Только тогда взрыв стены оправдан сам по себе.

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const context = { console, Math, Number, Boolean, Object, Array };
vm.createContext(context);
for(const fn of ['isAiStuckFallbackPlan', 'isAiDynamiteBreakoutAccepted', 'evaluateDynamiteAugmentedAcceptance']){
  vm.runInContext(extractFunctionSource(source, fn), context);
}
const { isAiStuckFallbackPlan, isAiDynamiteBreakoutAccepted, evaluateDynamiteAugmentedAcceptance } = context;

const NO_TARGETS = { totalPickups: 0, enemyHits: 0, threatsNearLanding: 3 };

// === 1. «ИИ топчется»: распознаём именно фолбек без улова ===

assert(isAiStuckFallbackPlan('simple_step2_mine_escape mine_escape_reposition', 0, NO_TARGETS) === true,
  '1: побег от мин с нулевым счётом и без целей — это топтание');
assert(isAiStuckFallbackPlan('simple_step2_center simple_step2_center_control', 0, NO_TARGETS) === true,
  '1: подход к центру без единой цели — тоже топтание');
assert(isAiStuckFallbackPlan('simple_step2_attack_enemy simple_step2_direct_enemy', 0, NO_TARGETS) === false,
  '1: настоящий план атаки топтанием не считается, даже если счёт не выставлен');
assert(isAiStuckFallbackPlan('simple_step2_mine_escape', 120, NO_TARGETS) === false,
  '1: у плана есть собственная ценность (счёт) — не топтание');
assert(isAiStuckFallbackPlan('simple_step2_mine_escape', 0, { totalPickups: 1, enemyHits: 0 }) === false,
  '1: фолбек, который всё же что-то подбирает, ломать динамитом не за чем');

// === 2. Сам критерий прорыва ===

const breakoutOk = (stuck, progressGainPx) => isAiDynamiteBreakoutAccepted({ stuck, progressGainPx, minProgressPx: 80 });
assert(breakoutOk(true, 300) === true,
  '2: заперт + коридор выводит на 300px ближе к цели -> прорыв');
assert(breakoutOk(false, 300) === false,
  '2: не заперт — прорыв не применяется, работают обычные критерии');
assert(breakoutOk(true, 40) === false,
  '2: сдвиг меньше порога — это не прорыв, а трата заряда впустую');
assert(breakoutOk(true, Number.NaN) === false,
  '2: коридор не выводит за стену (прогресс не посчитан) -> не прорыв');
assert(breakoutOk(true, -200) === false,
  '2: коридор уводит ОТ цели -> не прорыв');

// === 3. Приёмка альтернативного плана целиком ===

const accept = (opts = {}) => evaluateDynamiteAugmentedAcceptance(
  opts.altStats || { totalPickups: 0, enemyHits: 0, threatsNearLanding: 3 },
  Number.isFinite(opts.altScore) ? opts.altScore : 600,
  opts.currentPlan || { goalName: 'simple_step2_mine_escape', decisionReason: 'mine_escape_reposition', score: 0 },
  opts.currentStats || NO_TARGETS,
  {
    aggressive: opts.aggressive !== false,
    stuck: opts.stuck === true,
    progressGainPx: opts.progressGainPx,
    minProgressPx: 80,
  },
);

// Ровно воспроизведённый случай из игры: заперт, коридор в 2 кирпича, ноль улова.
const stuckCase = accept({ stuck: true, progressGainPx: 432 });
assert(stuckCase.accepted === true && stuckCase.breakout === true,
  '3: запертый ИИ обязан принять коридор, который выводит его за стену');
assert(stuckCase.collectsMore === false && stuckCase.scoreSignificantlyBetter === false,
  '3: и принять именно по прорыву — остальные критерии здесь молчат (это и был баг)');

// Без прорыва тот же самый расклад по-прежнему отвергается — старое поведение цело.
assert(accept({ stuck: false, progressGainPx: 432 }).accepted === false,
  '3: без признака «заперт» ничего не меняется — прорыв не расширяет обычные случаи');

// Прорыв не должен перебивать защиту от размена убийства.
const dropsKill = accept({
  stuck: true,
  progressGainPx: 432,
  currentStats: { totalPickups: 1, enemyHits: 1, threatsNearLanding: 3 },
  currentPlan: { goalName: 'simple_step2_mine_escape', decisionReason: 'mine_escape_reposition', score: 0, multiTargetEnemy: 1 },
});
assert(dropsKill.accepted === false && dropsKill.dropsAKill === true,
  '3: коридор, теряющий уже готовое убийство, не принимается даже как прорыв');

// Обычные критерии продолжают работать без всякого прорыва.
assert(accept({ altStats: { totalPickups: 2, enemyHits: 1, threatsNearLanding: 3 } }).accepted === true,
  '3: план, собирающий больше целей, принимается как и раньше');

// === 4. Инварианты самого поиска коридора (проверяем по исходнику) ===

const planner = source.slice(source.indexOf('async function findAiDynamiteAugmentedAlternativePlanAsync'));
assert(planner.includes('if(laneCrossesMine(altLandingX, altLandingY)) return null;'),
  '4: коридор, ведущий в мину, обязан отбрасываться — иначе ИИ взрывает стену и подрывается');
assert(planner.includes('if(directClear && !directMined) continue;'),
  '4: цель за миной нельзя пропускать как «путь свободен» — иначе прорубать нечего');
assert(planner.includes('AI_DYNAMITE_MINED_LANE_OFFSET_CELLS'),
  '4: должны перебираться боковые линии — проход рубится РЯДОМ с миной, а не сквозь неё');
assert(planner.includes('clearsBlockers'),
  '4: прорыв засчитывается только если приземление дальше взорванного кирпича');
assert(planner.includes('AI_DYNAMITE_BREAKOUT_LANDING_MARGIN_PX'),
  '4: прорыв садится СРАЗУ за проёмом — иначе он ныряет в тыл врага под все стволы');
assert(planner.includes('stuck: stuck && track === "breakout"'),
  '4: прорыв разрешён только короткой дорожке, длинный «ценный» коридор его не получает');

console.log('Smoke test passed: запертый минами ИИ рубит проход рядом с миной и вылетает за стену, не трогая ни мину, ни прежние критерии приёмки.');
