#!/usr/bin/env node
'use strict';

// Smoke test: маршрут, найденный ЗАПРАВЛЕННЫМ перебором сметающих направлений.
//
// Перебор направлений идёт на базовой дальности, поэтому направление, которое на
// 30 клетках пусто, а на 60 прошивает скопление врагов, невидимо в принципе. Когда
// такой маршрут найден, план несёт aiFuelSweepRoute — и топливо для него не
// «улучшение», а часть плана: без бака самолёт пролетит вдвое меньше и соберёт
// ничего. Значит pickAiBuffsForSelectedPlan обязан выдать бак (reason
// "fuel_sweep_route") и делать это наравне с захватом флага, а планировщик —
// пометить план fuelReplanned, чтобы не сбить тщательно просимулированный угол.

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
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

const plane = { id: 'b1', color: 'blue', x: 0, y: 0, activeTurnBuffs: {} };
const context = {
  console, Math, Number, Array, Object, Set,
  CELL_SIZE: 20,
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisibility', MINE: 'mine', DYNAMITE: 'dynamite' },
  AI_FUEL_MIN_REACH_RATIO: 1.0,
  AI_FUEL_EXTEND_MIN_EXTRA_TARGETS: 1,
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.6,
  AI_CROSSHAIR_BOLD_RATIO_FLOOR: 0.35,
  AI_CROSSHAIR_ABUNDANCE_RELAX: 0.08,
  AI_WINGS_LONG_SHOT_RATIO: 0.6,
  AI_WINGS_BOLD_RATIO_FLOOR: 0.35,
  AI_WINGS_ABUNDANCE_RELAX: 0.08,
  AI_WINGS_MIN_PICKUPS: 2,
  AI_WINGS_BOLD_SINGLE_TARGET_COUNT: 3,
  getEffectiveFlightRangeCells: (p) => (p.activeTurnBuffs?.fuel ? 60 : 30),
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  getFallbackCandidateResponseRisk: () => 0,
  getImmediateResponseThreatMeta: () => ({ risk: 0 }),
  getPlaneBeneficialGeometry: () => ({ hitbox: { width: 36 } }),
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  isPathClear: () => true,
  isAiRicochetRoutePlan: (plan) => `${plan?.routeClass || ''}`.includes('ricochet') || Number(plan?.bounceCount) > 0,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

const fuelReason = ({ sweepRoute = null, extend = null, fuel = 1, bounceCount = 2 } = {}) => {
  plane.activeTurnBuffs = {};
  const picked = context.pickAiBuffsForSelectedPlan({
    plane,
    color: 'blue',
    context: { enemies: [], readyCargo: [] },
    selectedPlan: {
      plane, routeClass: 'ricochet', goalName: 'simple_step2_multi_target',
      decisionReason: 'simple_step2_multi_target_ricochet', bounceCount,
      landingX: 0, landingY: 300, planDistance: 300,
      targetPoint: { x: 0, y: 300 }, score: 0.5,
      aiFuelRicochetExtend: extend,
      aiFuelSweepRoute: sweepRoute,
    },
    availableCounts: { fuel },
  }).find((c) => c.itemType === 'fuel');
  return picked ? picked.reason : null;
};

// 1. Маршрут существует ТОЛЬКО с баком (на базе такого направления нет) -> топливо.
assert(fuelReason({ sweepRoute: { baseCount: 0, boostedCount: 3, onlyWithFuel: true } }) === 'fuel_sweep_route',
  '1: a route that only exists boosted must get the fuel — it IS the plan.');

// 2. Заправленный перебор нашёл заметно более ценный маршрут -> топливо.
assert(fuelReason({ sweepRoute: { baseCount: 2, boostedCount: 4, onlyWithFuel: false } }) === 'fuel_sweep_route',
  '2: a boosted route that beats the base one must get the fuel.');

// 3. Одиночного бака достаточно: это часть плана, а не трата излишка.
assert(fuelReason({ sweepRoute: { baseCount: 0, boostedCount: 3 }, fuel: 1 }) === 'fuel_sweep_route',
  '3: a single can is enough for a route that needs it.');

// 4. Без топлива в инвентаре — никакой заправки (и план такой не построится).
assert(fuelReason({ sweepRoute: { baseCount: 0, boostedCount: 3 }, fuel: 0 }) === null,
  '4: no fuel in inventory -> no fuel spent.');

// 5. Обычный сметающий план без заправленного маршрута ведёт себя как раньше:
//    равный счёт целей бак не покупает.
assert(fuelReason({ sweepRoute: null, extend: { baseCount: 3, boostedCount: 3 } }) === null,
  '5: an ordinary sweep with no boosted gain must not spend fuel.');

// 6. Приоритет: заправленный маршрут важнее удлинения обычного сметающего плана —
//    иначе выбранный угол потеряет смысл.
assert(fuelReason({ sweepRoute: { baseCount: 1, boostedCount: 4 }, extend: { baseCount: 3, boostedCount: 5 } })
  === 'fuel_sweep_route',
  '6: the boosted-search route wins over the plain sweep extension.');

// Планировщик обязан помечать такой план fuelReplanned, иначе замена хода собьёт угол.
const schedulerMarks = source.includes('entry?.reason === "fuel_sweep_route"');
assert(schedulerMarks,
  'scheduler must mark fuel_sweep_route plans as fuelReplanned so the replan keeps the simulated angle');

console.log('Smoke test passed: a sweep route found by the fuel-boosted direction search always gets its can (even the last one), outranks the plain sweep extension, and keeps its simulated angle.');
