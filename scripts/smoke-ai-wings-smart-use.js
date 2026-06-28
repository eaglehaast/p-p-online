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
  AI_WINGS_MIN_PICKUPS: 2, // module-scope const in script.js
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
const usesWings = (cargos = [], enemies = []) => context.pickAiBuffsForSelectedPlan({
  plane,
  color: 'blue',
  context: { readyCargo: cargos, enemies },
  selectedPlan: {
    plane, routeClass: 'direct', goalName: 'cargo', decisionReason: 'simple_step2_pickup_cargo',
    landingX: 0, landingY: 400, planDistance: 400,
  },
  availableCounts: { wings: 1 },
}).some((c) => c.itemType === 'wings');

// A: 1 cargo on a normal span + 1 cargo only reachable with the wide span ->
//    wings turn it into a 2-pickup -> USE.
assert(usesWings([cargo('both'), cargo('wide')]) === true, 'A: wings should be used when they enable a 2nd cargo.');

// B: 2 cargo already reachable on a normal span -> wings add nothing -> NO.
assert(usesWings([cargo('both'), cargo('both')]) === false, 'B: wings add nothing when both are already reachable.');

// C: a single reachable cargo -> not a multi-target -> NO (the "short, one target" waste).
assert(usesWings([cargo('both')]) === false, 'C: a single target must NOT use wings.');

// D: a single cargo that only the wide span reaches -> still only 1 -> NO.
assert(usesWings([cargo('wide')]) === false, 'D: one wings-only target is not enough.');

// E: 2 cargo that ONLY the wide span reaches -> wings enable a 2-pickup -> USE.
assert(usesWings([cargo('wide'), cargo('wide')]) === true, 'E: wings should be used when they enable two cargo.');

// F: ENEMIES count too. 1 enemy in either span + 1 enemy only the wide span
//    kills -> wings enable a 2nd kill -> USE.
assert(usesWings([], [enemy('both'), enemy('wide')]) === true, 'F: wings should be used when the wide span enables a 2nd enemy kill.');

// G: MIXED — 1 cargo (wide-only) + 1 enemy (wide-only) -> wings enable a
//    2-target run (1 cargo + 1 kill) -> USE.
assert(usesWings([cargo('wide')], [enemy('wide')]) === true, 'G: wings should be used for a wide-span cargo+enemy run.');

// H: a single enemy already killable on the normal span -> NO (single target,
//    wings add nothing).
assert(usesWings([], [enemy('both')]) === false, 'H: a single normal-span enemy must NOT use wings.');

console.log('Smoke test passed: wings only when the wide span enables a multi-target run (cargo AND enemies).');
