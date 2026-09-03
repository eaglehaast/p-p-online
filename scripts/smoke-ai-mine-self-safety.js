#!/usr/bin/env node
'use strict';

// Smoke test: фильтры самобезопасности оборонительных мин.
//
// Предыстория. Расстояние до отрезка в этом планировщике считала distancePointToSegment,
// у которой имя было занято дважды, и она возвращала NaN. Сравнение `d < буфер` с NaN
// всегда ложно — четыре фильтра самобезопасности не отсеивали НИЧЕГО. Самоподрывы шли,
// причину искали в ширине буферов, и за четыре PR подряд их расширяли: 2.0×→3.0×,
// 2.5×→3.0×, 2.5×→3.5×, а коридорный — 2.0×→3.5× с прямой записью в комментарии
// «gate never fired with 2.0×». Расширяли то, что не работало.
//
// Имя расшили (PR про динамит) — фильтры ожили, и с раздутыми буферами не проходило уже
// ни одно место: 378 проб за партию, принято ноль, мин ИИ не ставил вовсе.
//
// Здесь две правки. Множители возвращены к до-компенсационным. И два фильтра из четырёх
// перестали быть вето: они судят не о факте, а о ДОГАДКЕ — куда союзник полетит в
// следующий ход. Догадка теперь понижает место в очереди, а не запрещает его; настоящую
// проверку по союзникам делает симуляция на реальной физике.
//
// Замер, по три партии на вариант:
//
//                          main    после расшивки   эта правка
//   мин поставлено ИИ        6            0           5 / 6 / 4
//   сбито самолётов игрока   3            0           4 / 5 / 3
//   ИИ подорвался на своей   1            0           0 / 0 / 0

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Функция не найдена: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const planner = extractFunctionSource(source, 'findAiDefensiveMineOpportunityAsync');
const code = planner.replace(/\/\/.*$/gm, '');

// === 1. Буферы не раздуты обратно ===
//
// Каждое из этих чисел когда-то подняли, объясняя самоподрывы шириной. Причина была в
// NaN. Если числа поползут вверх снова — фильтры опять перекроют поле целиком.
{
  for(const [name, mult] of [
    ['landingSafe', '2.0'],
    ['trajBuf', '2.5'],
    ['ownSafe', '2.5'],
    ['futureTrajBuf', '2.5'],
  ]){
    const m = new RegExp(`const ${name} = [^;]*effRadius \\* ([\\d.]+)`).exec(code);
    assert(m, `1: буфер ${name} не найден`);
    assert(m[1] === mult,
      `1: ${name} = ${m[1]}× триггера вместо ${mult}× — раздутие вернулось, а оно и перекрывало поле`);
  }
  const ap = /const approachBuf = MINE_TRIGGER_RADIUS \* ([\d.]+)/.exec(code);
  assert(ap, '1b: коридорный буфер не найден');
  assert(ap[1] === '2.0',
    `1b: approachBuf = ${ap[1]}× вместо 2.0× — его подняли до 3.5× с объяснением «gate never fired», `
    + 'а не срабатывал он из-за NaN');
}

// === 2. ГЛАВНОЕ: догадки о союзниках не запрещают место ===
//
// ownFutureSegments и ownApproachCorridors — предположения о чужом ходе. Вето по ним
// отсеивало все пробы до единой. Проверяем, что за проверкой НЕ идёт continue.
{
  for(const [flag, counter] of [
    ['blocksFutureTraj', 'future_traj_too_close'],
    ['blocksOwnCorridor', 'own_approach_corridor'],
  ]){
    const m = new RegExp(`if\\(${flag}\\) \\{[^}]*\\}`).exec(code);
    assert(m, `2: проверка ${flag} на месте не найдена`);
    assert(new RegExp(`rejects\\.${counter} \\+= 1`).test(m[0]),
      `2b: счётчик ${counter} должен остаться — по нему видно, как часто догадка срабатывает`);
    assert(!/continue/.test(m[0]),
      `2c: ${flag} — догадка о ходе союзника, а не факт; вето по ней отсеивало все пробы `
      + 'и ИИ переставал ставить мины вовсе');
  }
}

// === 3. Фильтры по ИЗВЕСТНОМУ пути по-прежнему запрещают ===
//
// Граница пункта 2. Свой сегодняшний полёт, свой рикошет, своя посадка и зона у цели —
// это факты, а не догадки. Если снять вето и с них, ИИ начнёт подрываться на своих.
{
  for(const [flag, counter] of [
    ['blocksOwn', 'other_own_too_close'],
    ['onSelfRicochet', 'own_ricochet_path'],
    ['nearOwnObjective', 'own_objective_vicinity'],
  ]){
    const m = new RegExp(`if\\(${flag}\\) \\{[^}]*\\}`).exec(code);
    assert(m, `3: проверка ${flag} не найдена`);
    assert(/continue/.test(m[0]),
      `3b: ${flag} судит о известном, а не о догадке — вето обязано остаться`);
  }
  assert(/if\(trajDist < trajBuf\) \{[^}]*continue;[^}]*\}/.test(code),
    '3c: мина на собственной траектории этого хода запрещена');
  assert(/if\(landingDist < landingSafe\) \{[^}]*continue;[^}]*\}/.test(code),
    '3d: мина в своей точке посадки запрещена');
}

// === 4. Штраф ранжирует, а не отсеивает ===
//
// Если штраф окажется больше запаса над порогом, «не вето» превратится в вето окольным
// путём: место просто не пройдёт по счёту.
{
  const penaltyDecl = /const AI_DEFENSIVE_MINE_OWN_PATH_PENALTY = ([\d.]+);/.exec(source);
  assert(penaltyDecl, '4: штраф за догадку о пути своих не объявлен');
  const penalty = Number(penaltyDecl[1]);

  const floorDecl = /const AI_DEFENSIVE_MINE_MIN_SCORE = ([\d.]+);/.exec(source);
  assert(floorDecl, '4b: порог принятия места не найден');
  const floor = Number(floorDecl[1]);

  // Счёт места ограничен сверху 2.5 (тот же потолок стоит в scoreMinePlacementByProjection).
  // Худший случай — оба штрафа сразу.
  const cap = 2.5;
  assert(cap - penalty * 2 >= floor,
    `4c: два штрафа (${penalty} × 2) опускают лучшее место с ${cap} до ${cap - penalty * 2}, `
    + `а порог ${floor} — тогда догадка снова становится вето, только молча`);

  assert(/const ownPathPenalty = \(blocksFutureTraj \? AI_DEFENSIVE_MINE_OWN_PATH_PENALTY : 0\)/.test(code),
    '4d: штраф начисляется за догадку о будущей траектории союзника');
  assert(/\+ \(blocksOwnCorridor \? AI_DEFENSIVE_MINE_OWN_PATH_PENALTY : 0\)/.test(code),
    '4e: и за догадку о коридоре союзника');
  assert(/const finalScore = Math\.min\(2\.5, scoreRes\.score \* prior\) - ownPathPenalty;/.test(code),
    '4f: штраф обязан вычитаться из счёта места, иначе он ни на что не влияет');
  assert(/if\(finalScore < AI_DEFENSIVE_MINE_MIN_SCORE\)/.test(code),
    '4g: порог применяется к счёту УЖЕ со штрафом');
}

// === 5. Точная проверка на реальной физике осталась ===
//
// Именно она, а не буферы, отвечает за то, что ИИ не подрывается на своих. Пункты 1-2
// ослабляют грубый отсев ровно потому, что за ним стоит эта проверка.
{
  assert(/liveMinesArr\.push\(simMine\)/.test(code),
    '5: кандидат по-прежнему кладётся в живой массив мин для симуляции');
  assert(/getMineThreatMetaForSegment\(plane\.x, plane\.y, ctx\.landing\.x, ctx\.landing\.y, plane/.test(code),
    '5b: свой полёт этого хода проверяется той же физикой, что и пусковой контроль');
  assert(/for\(const own of ctx\.ownPlanesToAvoid\)/.test(code)
    && /getMineThreatMetaForSegment\(own\.x, own\.y, corridor\.ex, corridor\.ey, own/.test(code),
    '5c: коридоры союзников проверяются физикой — это замена снятому вето');
  assert(/rejects\.sim_self_hit \+= 1/.test(code) && /continue/.test(code),
    '5d: симуляция по-прежнему отклоняет опасное место');
  assert(/liveMinesArr\.pop\(\)/.test(code),
    '5e: пробная мина убирается из живого массива в любом случае');
}

console.log('smoke-ai-mine-self-safety: OK');
