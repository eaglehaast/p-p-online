#!/usr/bin/env node
'use strict';

// Smoke test: САМ ПЕРЕБОР направлений видит маршрут, которого на базовой дальности нет.
//
// Ценность бака — не «дотянуться до цели подальше», а ДЛИНА МАРШРУТА: с топливом
// линия полёта вдвое длиннее, а значит пересекает больше врагов и грузов — в том
// числе «на удачу», по касательной. Перебор сметающих направлений всегда шёл на
// базовой дальности, поэтому направление, пустое на 30 клетках и прошивающее
// скопление на 60, было невидимо в принципе — бак не мог быть выбран, потому что
// плана под него не существовало.
//
// Здесь buildBestMultiTargetSweepCandidate прогоняется целиком, с подставным
// simulateAIShot: путь ровно вдвое длиннее, когда на самолёте бак. Проверяем, что
// заправленный проход находит скопление, что план несёт aiFuelSweepRoute и летит
// В СТОРОНУ скопления, что касательные пролёты считаются шансами, и что без бака в
// инвентаре поведение ровно прежнее.

const fs = require('fs');
const vm = require('vm');

function extractArrowSource(source, name){
  let start = source.indexOf(`const ${name} = async (`);
  if(start === -1) start = source.indexOf(`const ${name} = (`);
  if(start === -1) throw new Error(`Arrow function not found in script.js: ${name}`);
  const bodyStart = source.indexOf('{', source.indexOf('=>', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    // globalThis.<name> = ... : лексический const внутри vm-скрипта не попадает в
    // объект контекста, а нам нужно вызвать функцию снаружи.
    if(depth === 0) return `globalThis.${source.slice(start + 'const '.length, i + 1)};`;
  }
  throw new Error(`Arrow function body end not found for: ${name}`);
}

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
const BASE_RANGE_PX = 300; // 15 клеток — базовая дальность в этом стенде
const FUEL = 'fuel';

// Стенд: самолёт внизу, скопление врагов ровно вдвое дальше базовой дальности.
// Любая линия базовой длины до него не достаёт — маршрут существует только с баком.
function buildStand({ fuelInStock = 1, enemies, cargos = [], extraBaseEnemies = [] } = {}){
  const plane = { id: 'r1', color: 'red', x: 100, y: 560, isAlive: true, activeTurnBuffs: {} };
  const enemyPlanes = [...enemies, ...extraBaseEnemies];
  const sims = { base: 0, boosted: 0 };
  const context = {
    console, Math, Number, Array, Object, Set, Boolean, JSON,
    CELL_SIZE: 20,
    AI_MULTI_TARGET_PAIR_MIN: 2,
    AI_FLAG_SWEEP_TARGET_WEIGHT: 3,
    AI_SWEEP_ANGLE_STEP_DEG: 20,
    AI_SWEEP_MAX_BOUNCES: 2,
    AI_SWEEP_ANCHOR_SCALES: [1, 0.7],
    AI_SWEEP_ENEMY_HIT_TOLERANCE_PX: 20,
    AI_FUEL_SWEEP_BOOSTED_SIM_BUDGET: 48,
    AI_SWEEP_CHANCE_BAND_PX: 30,
    AI_SWEEP_CHANCE_WEIGHT: 0.35,
    AI_FUEL_SWEEP_MIN_VALUE_GAIN: 0.5,
    INVENTORY_ITEM_TYPES: { FUEL: FUEL, WINGS: 'wings', CROSSHAIR: 'crosshair', MINE: 'mine' },
    aiColor: 'red',
    aiExecutionContext: { plane },
    readyCargo: cargos,
    enemyPlanes,
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
    getPlaneEffectiveRangePx: () => BASE_RANGE_PX,
    // Подставная физика: прямая линия по направлению. С баком — ровно вдвое длиннее.
    // Именно это и есть предмет теста: длина маршрута, а не дальность до цели.
    simulateAIShot: (p, vec, _opts) => {
      const boosted = p.activeTurnBuffs?.[FUEL] === true;
      if(boosted) sims.boosted += 1; else sims.base += 1;
      const len = BASE_RANGE_PX * (boosted ? 2 : 1) * (Number.isFinite(vec.scale) ? vec.scale : 1);
      return {
        predictedPath: [{ x: p.x, y: p.y }, { x: p.x + vec.dx * len, y: p.y + vec.dy * len }],
        bounceCount: 0,
        travelDistance: len,
      };
    },
    evaluateInventoryState: () => ({ counts: { [FUEL]: fuelInStock, wings: 0 } }),
    applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
    doesCargoIntersectBeneficialZoneAlongPath: (cargo, _p, path) =>
      context.getDistanceFromPointToSegment(cargo.x, cargo.y, path[0].x, path[0].y, path[1].x, path[1].y) <= 20,
    doesFlightPathCrossMine: () => false,
    aiCoopMaybeYield: async () => {},
    isAiTurnStillApplicable: () => true,
    getImmediateResponseThreatMeta: () => ({ risk: 0 }),
    getFallbackCandidateResponseRisk: () => 0,
  };
  vm.createContext(context);
  vm.runInContext(extractFunctionSource(source, 'getDistanceFromPointToSegment'), context);
  vm.runInContext(extractArrowSource(source, 'isEnemyOnPredictedPath'), context);
  vm.runInContext(extractArrowSource(source, 'buildBestMultiTargetSweepCandidate'), context);
  return { context, plane, sims, run: () => context.buildBestMultiTargetSweepCandidate(plane, BASE_RANGE_PX) };
}

(async () => {
  // 1. Скопление на 400-500px по вертикали вверх: базовая линия (300px) до него не
  //    дотягивается вообще, заправленная (600px) прошивает все три самолёта.
  const cluster = [
    { id: 'b1', color: 'blue', isAlive: true, x: 100, y: 160 },
    { id: 'b2', color: 'blue', isAlive: true, x: 108, y: 120 },
    { id: 'b3', color: 'blue', isAlive: true, x: 95, y: 90 },
  ];
  const stand = buildStand({ enemies: cluster.map((e) => ({ ...e })) });
  const plan = await stand.run();

  assert(plan, '1: заправленный перебор обязан найти маршрут, которого на базе нет');
  assert(plan.aiFuelSweepRoute, '1: план обязан нести aiFuelSweepRoute — без бака он бессмыслен');
  assert(plan.aiFuelSweepRoute.onlyWithFuel === true,
    '1: на базовой дальности такого направления нет вовсе -> onlyWithFuel');
  assert(plan.aiFuelSweepRoute.baseCount === 0 && plan.aiFuelSweepRoute.boostedCount === 3,
    `1: ожидалось 0 целей на базе и 3 с баком, получено ${JSON.stringify(plan.aiFuelSweepRoute)}`);
  assert(plan.multiTargetCount === 3, `1: план должен заявлять 3 цели, получено ${plan.multiTargetCount}`);
  assert(plan.landingY < stand.plane.y - 100 && Math.abs(plan.landingX - stand.plane.x) < 60,
    `1: план обязан лететь В СТОРОНУ скопления, а не куда-то ещё: ${plan.landingX},${plan.landingY}`);
  assert(stand.sims.boosted > 0, '1: заправленные симуляции обязаны выполняться');
  assert(stand.sims.boosted <= 48, `1: бюджет заправленных симуляций превышен: ${stand.sims.boosted}`);
  console.log(`1 OK: маршрут только с баком — ${JSON.stringify(plan.aiFuelSweepRoute)}, симуляций base/boosted = ${stand.sims.base}/${stand.sims.boosted}`);

  // 2. Контроль: тот же стенд, но бака в инвентаре нет. Никаких заправленных
  //    симуляций и никакого маршрута — поведение ровно прежнее.
  const dry = buildStand({ enemies: cluster.map((e) => ({ ...e })), fuelInStock: 0 });
  const dryPlan = await dry.run();
  assert(dry.sims.boosted === 0, '2: без бака в инвентаре заправленных симуляций быть не должно');
  assert(!dryPlan || !dryPlan.aiFuelSweepRoute, '2: без бака маршрут «только с баком» не строится');
  console.log('2 OK: без бака в инвентаре перебор остаётся прежним');

  // 3. Базовый маршрут есть (2 цели рядом), но заправленный собирает больше —
  //    ход должен уйти заправленному, и в отчёте видно, что он вытеснил базовый.
  const nearEnemy = [{ id: 'n1', color: 'blue', isAlive: true, x: 260, y: 470 }];
  const nearCargo = [{ id: 'c1', x: 340, y: 425 }]; // на той же линии, что и n1 -> базовые 2 цели
  const mixed = buildStand({
    enemies: cluster.map((e) => ({ ...e })),
    extraBaseEnemies: nearEnemy,
    cargos: nearCargo,
  });
  const mixedPlan = await mixed.run();
  assert(mixedPlan && mixedPlan.aiFuelSweepRoute,
    '3: более ценный заправленный маршрут обязан вытеснить базовый');
  assert(mixedPlan.aiFuelSweepRoute.onlyWithFuel === false,
    '3: базовый маршрут существовал — значит это вытеснение, а не «нет вариантов»');
  assert(mixedPlan.aiFuelSweepRoute.boostedValueWithChance
    > mixedPlan.aiFuelSweepRoute.replacedBaseValueWithChance + 0.5,
    `3: вытеснение только при ощутимом выигрыше: ${JSON.stringify(mixedPlan.aiFuelSweepRoute)}`);
  console.log(`3 OK: вытеснение базового маршрута — ${JSON.stringify(mixedPlan.aiFuelSweepRoute)}`);

  // 4. «Ход на удачу»: цели по касательной к линии — не гарантированное попадание,
  //    но именно ради них строится длинный маршрут. Они обязаны считаться шансами.
  const grazing = [
    { id: 'b1', color: 'blue', isAlive: true, x: 100, y: 160 },
    { id: 'b2', color: 'blue', isAlive: true, x: 104, y: 120 },
    { id: 'g1', color: 'blue', isAlive: true, x: 138, y: 200 }, // мимо на 38px: полоса шанса
  ];
  const chance = buildStand({ enemies: grazing });
  const chancePlan = await chance.run();
  assert(chancePlan && chancePlan.aiFuelSweepRoute, '4: маршрут в скопление обязан найтись');
  assert(chancePlan.aiFuelSweepRoute.boostedChances >= 1,
    `4: касательный пролёт обязан считаться шансом, получено ${JSON.stringify(chancePlan.aiFuelSweepRoute)}`);
  console.log(`4 OK: касательные пролёты учтены — ${JSON.stringify(chancePlan.aiFuelSweepRoute)}`);

  console.log('Smoke test passed: перебор сметающих направлений видит маршруты, существующие только на заправленной дальности, берёт их только при ощутимом выигрыше и считает касательные пролёты как шансы.');
})().catch((err) => { console.error(String(err && err.message || err)); process.exit(1); });
