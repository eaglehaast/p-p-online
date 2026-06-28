#!/usr/bin/env node
'use strict';

// Smoke test: Step 4 — wide wings only when they enable a multi-pickup.
//
// Wings widen the BENEFICIAL pickup span (96px vs 36px). They should be used
// only when the route collects MORE cargo with the wide span than without — a
// multi-pickup the plane couldn't make otherwise ("impossible without them") —
// never on a short single-target hop. Drives the real caller
// pickAiBuffsForSelectedPlan (the bug was its `contactIntent ||` bypass).

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

const plane = { x: 0, y: 0, color: 'blue', activeTurnBuffs: {} };
const INVENTORY_ITEM_TYPES = { FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisible', MINE: 'mine', DYNAMITE: 'dynamite' };

const context = {
  Math,
  Number,
  Array,
  CELL_SIZE: 20,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_WINGS_MIN_PICKUPS: 2,    // module-scope consts in script.js
  AI_WINGS_LONG_SHOT_RATIO: 0.6,
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: () => 30,
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  getAiPlannedMovePredictedPath: () => [{ x: 0, y: 0 }, { x: 0, y: 400 }],
  // A cargo's `reach` says whether the path collects it: 'both' (either span),
  // 'wide' (only with wings), or 'none'.
  doesCargoIntersectBeneficialZoneAlongPath: (cargo, p) => {
    const hasWings = p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.WINGS] === true;
    if(cargo.reach === 'both') return true;
    if(cargo.reach === 'wide') return hasWings;
    return false;
  },
  // Enemy kill span = beneficial geometry (wings-widened, like checkPlaneHits).
  // Mock: enemy.x encodes the perpendicular distance to the path; the segment
  // distance mock just returns that x. bare threshold = 18+18=36, wide = 48+18=66.
  getPlaneBeneficialGeometry: (p) => ({ hitbox: { width: (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.WINGS] === true) ? 96 : 36 } }),
  getDistanceFromPointToSegment: (px) => px,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseWingsForSelectedPlan'), context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

const cargo = (reach) => ({ id: `c-${reach}-${Math.random()}`, state: 'ready', reach, x: 10, y: 100 });
// Enemy reach encoded as perpendicular distance to the path (mock returns x):
// 20 -> within either span; 50 -> only the wide span; 200 -> neither.
const enemyDist = { both: 20, wide: 50, none: 200 };
const enemy = (reach) => ({ id: `e-${reach}-${Math.random()}`, isAlive: true, x: enemyDist[reach], y: 0 });
// long shot: travel 400/600 = 0.67 >= 0.6 ; short shot: 120/600 = 0.2.
const usesWings = (cargos = [], enemies = [], { long = true } = {}) => {
  const d = long ? 400 : 120;
  return context.pickAiBuffsForSelectedPlan({
    plane,
    color: 'blue',
    context: { readyCargo: cargos, enemies },
    selectedPlan: {
      plane, routeClass: 'direct', goalName: 'cargo', decisionReason: 'simple_step2_pickup_cargo',
      landingX: 0, landingY: d, planDistance: d,
    },
    availableCounts: { wings: 1 },
  }).some((c) => c.itemType === 'wings');
};

// (1) Wings ENABLE extra targets — used at any distance.
// A: 1 cargo on a normal span + 1 only the wide span reaches -> USE.
assert(usesWings([cargo('both'), cargo('wide')]) === true, 'A: enable a 2nd cargo -> use.');
// A-short: same but a short shot -> still USE (wings genuinely enable the 2nd).
assert(usesWings([cargo('both'), cargo('wide')], [], { long: false }) === true, 'A-short: enabling an extra works even short.');
// E: 2 cargo only the wide span reaches -> USE.
assert(usesWings([cargo('wide'), cargo('wide')]) === true, 'E: enable two cargo -> use.');
// F: enemies count — wide span enables a 2nd kill -> USE.
assert(usesWings([], [enemy('both'), enemy('wide')]) === true, 'F: enable a 2nd enemy kill -> use.');
// G: mixed cargo+enemy, both wide-only -> USE.
assert(usesWings([cargo('wide')], [enemy('wide')]) === true, 'G: wide-span cargo+enemy run -> use.');

// (2) LONG-shot insurance — wide span sweeps >= 2 targets even if the normal
// span would also reach them.
// B-long: 2 cargo both reachable, but a LONG shot -> USE (widen the kill zone).
assert(usesWings([cargo('both'), cargo('both')]) === true, 'B-long: long shot over 2 targets -> use (mass zone).');
// B-short: same 2 reachable cargo but a SHORT shot -> NO (no miss-risk, wings add nothing).
assert(usesWings([cargo('both'), cargo('both')], [], { long: false }) === false, 'B-short: short shot, nothing extra -> no wings.');

// Never on a single target.
assert(usesWings([cargo('both')]) === false, 'C: single cargo -> no wings.');
assert(usesWings([], [enemy('both')]) === false, 'H: single enemy -> no wings.');
// Long shot but only ONE target on the path -> NO (nothing to mass-capture).
assert(usesWings([cargo('both')], []) === false, 'I: long shot, single target -> no wings.');

console.log('Smoke test passed: wings enable extra targets (any distance) OR widen a long multi-target run; never single-target.');
