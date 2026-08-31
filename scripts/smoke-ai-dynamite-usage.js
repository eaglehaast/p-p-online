#!/usr/bin/env node
'use strict';

// Smoke test: ИИ пользуется динамитом.
//
// Замер до правок: партия против компьютера, ИИ выдавали по 3 динамита каждый ход,
// двенадцать ходов — установлено НОЛЬ зарядов. После — восемь, десять и снова восемь
// зарядов в трёх подряд партиях, и без выдачи топлива.
//
// Причина оказалась не в правилах, а в тихой поломке. В script.js жили ДВЕ функции с
// именем distancePointToSegment: ранняя принимала шесть чисел, поздняя — точку и две
// точки. Объявления функций поднимаются, позднее затирает раннее, поэтому все тринадцать
// вызовов вида (px, py, ax, ay, bx, by) уходили в четырёхаргументную и читали .x у числа:
// undefined → NaN. Молча, без единой ошибки в консоли.
//
// Больнее всего это било по countTargetsAndSafetyOnSegment: расстояние до отрезка полёта
// всегда выходило NaN, проверка Number.isFinite(d) не проходила, и ЛЮБАЯ трасса
// отчитывалась «целей ноль». А приёмка коридора с динамитом («собирает больше»,
// «добавляет сбитие») сравнивала ноль с нулём и отвечала «нет» всегда.
//
// Поэтому главная защита здесь — не текст правил, а счёт: функция обязана видеть цель,
// лежащую на отрезке полёта.

const fs = require('fs');
const vm = require('vm');

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

// === 1. Имя distancePointToSegment занято ровно один раз ===
//
// Самая дешёвая и самая надёжная защита от возврата поломки: пока объявление одно,
// перекрывать нечего.
{
  const decls = source.match(/^function distancePointToSegment\(/gm) || [];
  assert(decls.length === 1,
    `1: distancePointToSegment объявлена ${decls.length} раз(а) — второе объявление затрёт первое, `
    + 'и все вызовы с шестью числами начнут возвращать NaN');

  const decl = extractFunctionSource(source, 'distancePointToSegment');
  const params = decl.slice(decl.indexOf('(') + 1, decl.indexOf(')')).split(',').map((s) => s.trim());
  assert(params.length === 6,
    `1b: уцелеть обязана шестиаргументная версия — её зовут тринадцать мест (сейчас ${params.length} аргументов)`);
}

// === 2. ГЛАВНОЕ: цель на отрезке полёта считается ===
//
// Именно это и было сломано. Проверяем не текст, а ответ: враг, лежащий прямо на линии
// полёта, обязан попасть в enemyHits, а не потеряться в NaN.
{
  const context = {
    Math, Number, Array,
    POINT_RADIUS: 15,
    CELL_SIZE: 20,
    cargoState: [],
    getPlaneEffectiveRangePx: () => 600,
    getCargoVisualCenter: (cargo) => ({ x: cargo.x, y: cargo.y }),
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunctionSource(source, 'distancePointToSegment'),
    extractFunctionSource(source, 'countTargetsAndSafetyOnSegment'),
  ].join('\n\n'), context);

  const plane = { x: 100, y: 100 };
  const onLane = { isAlive: true, x: 300, y: 300 };   // ровно на линии (100,100)→(500,500)
  const offLane = { isAlive: true, x: 300, y: 60 };   // далеко в стороне

  const d = context.distancePointToSegment(300, 300, 100, 100, 500, 500);
  assert(Number.isFinite(d),
    '2: расстояние до отрезка обязано быть числом — NaN здесь и обнулял все подсчёты целей');
  assert(d < 0.001, `2b: точка лежит на отрезке, расстояние должно быть нулевым (получено ${d})`);

  const hit = context.countTargetsAndSafetyOnSegment(plane, 500, 500, 'blue', {}, [onLane]);
  assert(hit.enemyHits === 1 && hit.totalPickups === 1,
    `2c: враг на линии полёта обязан считаться (получено enemyHits=${hit.enemyHits})`);

  const miss = context.countTargetsAndSafetyOnSegment(plane, 500, 500, 'blue', {}, [offLane]);
  assert(miss.enemyHits === 0,
    '2d: враг в стороне от линии не считается — иначе «видим» мы всех подряд');

  // Груз считается тем же расстоянием, и ломалось оно так же.
  context.cargoState = [{ state: 'ready', x: 200, y: 200 }];
  const cargoHit = context.countTargetsAndSafetyOnSegment(plane, 500, 500, 'blue', {}, []);
  assert(cargoHit.cargoPickups === 1 && cargoHit.totalPickups === 1,
    `2e: груз на линии полёта обязан считаться (получено ${cargoHit.cargoPickups})`);
}

// Стенд для правил приёмки коридора.
const acceptCtx = { Math, Number };
vm.createContext(acceptCtx);
vm.runInContext([
  extractFunctionSource(source, 'isAiDynamiteBreakoutAccepted'),
  extractFunctionSource(source, 'evaluateDynamiteAugmentedAcceptance'),
].join('\n\n'), acceptCtx);

const stats = (pickups, kills, threats) => ({
  totalPickups: pickups, enemyHits: kills, cargoPickups: 0, threatsNearLanding: threats,
});
const judge = (alt, altScore, plan, cur, opts = {}) => acceptCtx.evaluateDynamiteAugmentedAcceptance(
  alt, altScore, plan, cur, { aggressive: false, ...opts });

// === 3. Сбить самолёт безопасно с динамитом — берём, даже когда зарядов мало ===
//
// Прежнее правило пускало сбитие только при избытке зарядов (пять и больше). Обычный
// запас в один-два динамита на сбитие не тратился НИКОГДА — при том что размен «заряд за
// самолёт» выгоден почти всегда.
//
// Считать целей коридор должен СТОЛЬКО ЖЕ, сколько текущий план, иначе решение примет
// повод «собирает больше» и про сбитие мы ничего не узнаем: сбитый самолёт тоже цель.
{
  const alt = stats(1, 1, 2);        // коридор: одно сбитие
  const cur = stats(1, 0, 2);        // текущий план: один груз, посадка та же
  const plan = { score: 0, multiTargetCount: 1, multiTargetEnemy: 0 };

  const v = judge(alt, 500, plan, cur);            // зарядов мало: aggressive = false
  assert(v.collectsMore === false && v.scoreSignificantlyBetter === false,
    '3: случай подобран так, чтобы решал именно повод про сбитие');
  assert(v.addsSafeKill === true, '3b: сбитие с посадкой не опаснее прежней — безопасное');
  assert(v.accepted === true,
    '3c: безопасное сбитие через стену берём и при скудном запасе, а не только при избытке');
}

// === 4. Сбить НЕСКОЛЬКО без динамита лучше, чем одного с динамитом ===
{
  const alt = stats(1, 1, 0);                                   // коридор: одно сбитие
  const cur = stats(0, 0, 0);
  const plan = { score: 900, multiTargetCount: 2, multiTargetEnemy: 2 }; // план и так бьёт двоих

  const v = judge(alt, 5000, plan, cur, { aggressive: true });
  assert(v.dropsAKill === true, '4: коридор теряет сбитие, которое текущий план уже даёт');
  assert(v.accepted === false,
    '4b: размен двух сбитий на одно не берём ни за какой счёт — это жёсткое вето, а не повод');
}

// === 5. Сбитие ценой худшей посадки при скудном запасе — не берём ===
//
// Граница правила из пункта 3: «безопасно» там не украшение. Подставить самолёт под
// лишние стволы ради одного сбития можно только с избытком зарядов.
{
  const alt = stats(1, 1, 3);   // одно сбитие, но посадка под тремя стволами
  const cur = stats(1, 0, 1);   // текущий план: один груз, посадка под одним
  const plan = { score: 0, multiTargetCount: 1, multiTargetEnemy: 0 };

  const scarce = judge(alt, 500, plan, cur);
  assert(scarce.addsKill === true && scarce.addsSafeKill === false,
    '5: сбитие есть, но посадка опаснее — «безопасным» оно не считается');
  assert(scarce.accepted === false,
    '5b: последний заряд не тратим на сбитие, после которого сбивают нас');

  const rich = judge(alt, 500, plan, cur, { aggressive: true });
  assert(rich.accepted === true,
    '5c: при избытке зарядов рискованное сбитие по-прежнему разрешено');
}

// === 6. Много грузов — повод ===
{
  const alt = stats(3, 0, 2);
  const cur = stats(1, 0, 2);
  const v = judge(alt, 100, { score: 900, multiTargetCount: 1, multiTargetEnemy: 0 }, cur);
  assert(v.collectsMore === true && v.accepted === true,
    '6: коридор, собирающий больше целей, берём даже когда по счёту он проигрывает');
}

// === 7. Пустой коридор не берём ===
//
// Без этой проверки правила выше прошли бы и на «принимать всегда».
{
  const alt = stats(0, 0, 3);
  const cur = stats(0, 0, 1);
  const v = judge(alt, 100, { score: 900, multiTargetCount: 0, multiTargetEnemy: 0 }, cur);
  assert(v.accepted === false,
    '7: коридор ничего не собирает, счётом не выигрывает и садится хуже — заряд тратить не на что');
}

// === 8. Запрет по топливу сузился до размена «самолёт за один флаг» ===
//
// Самый частый отказ во всей воронке: трасса за флагом отбрасывалась, если посадка под
// ударом, а топлива нет. Отбрасывались вместе с пустыми и те, что по дороге сбивают или
// собирают груз — а такой ход окупается не флагом.
{
  const fn = extractFunctionSource(source, 'findAiDynamiteAugmentedAlternativePlanAsync');
  const code = fn.replace(/\/\/.*$/gm, '');

  const guard = /if\(target\.kind === "flag" && ([^)]*?) && typeof getImmediateResponseThreatMeta/.exec(code);
  assert(guard, '8: запрет по топливу для цели-флага должен стоять на месте');
  assert(/flagIsTheOnlyPayoff/.test(guard[1]),
    '8b: запрет применяется только когда флаг — единственная выгода трассы');

  const defAt = code.indexOf('const flagIsTheOnlyPayoff');
  const statsAt = code.indexOf('const altStats =');
  assert(defAt > statsAt && statsAt !== -1,
    '8c: выгода трассы считается по altStats, значит объявление идёт после подсчёта');
  assert(/flagIsTheOnlyPayoff\s*=\s*\(altStats\?\.totalPickups \|\| 0\) === 0/.test(code),
    '8d: «единственная выгода» — это ровно ноль собранных целей на трассе');
}

console.log('smoke-ai-dynamite-usage: OK');
