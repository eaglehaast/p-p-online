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
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseWingsForSelectedPlan'), context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

const cargo = (reach) => ({ id: `c-${reach}-${Math.random()}`, state: 'ready', reach, x: 10, y: 100 });
const usesWings = (cargos) => context.pickAiBuffsForSelectedPlan({
  plane,
  color: 'blue',
  context: { readyCargo: cargos },
  selectedPlan: {
    plane, routeClass: 'direct', goalName: 'cargo', decisionReason: 'simple_step2_pickup_cargo',
    landingX: 0, landingY: 400, planDistance: 400,
  },
  availableCounts: { wings: 1 },
}).some((c) => c.itemType === 'wings');

// A: 1 reachable on a normal span + 1 only reachable with the wide span ->
//    wings turn it into a 2-pickup -> USE.
assert(usesWings([cargo('both'), cargo('wide')]) === true, 'A: wings should be used when they enable a 2nd pickup.');

// B: 2 cargo already reachable on a normal span -> wings add nothing -> NO.
assert(usesWings([cargo('both'), cargo('both')]) === false, 'B: wings add nothing when both are already reachable.');

// C: a single reachable cargo -> not a multi-pickup -> NO (the "short, one target" waste).
assert(usesWings([cargo('both')]) === false, 'C: a single-target pickup must NOT use wings.');

// D: a single cargo that only the wide span reaches -> still only 1 pickup -> NO.
assert(usesWings([cargo('wide')]) === false, 'D: one wings-only pickup is not enough (needs a multi-pickup).');

// E: 2 cargo that ONLY the wide span reaches -> wings enable a 2-pickup -> USE.
assert(usesWings([cargo('wide'), cargo('wide')]) === true, 'E: wings should be used when they enable two pickups.');

console.log('Smoke test passed: wings only when the wide span enables a multi-pickup, never a single-target hop.');
