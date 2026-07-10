#!/usr/bin/env node
'use strict';

// Smoke test: pruneStaleAimBuffsAfterRouteRewrite — after a dynamite replan straightens and
// SHORTENS a route, a crosshair that was justified for the ORIGINAL long ricochet must be
// dropped from the plan's inventory sequence (precision is wasted on a tiny direct hop).
// From a real aiDumpBadMove: blue #4 spent dynamite (clear a brick to a single cargo) AND a
// crosshair on the resulting ~230px flight (ratio 0.38, well under the 0.6 gate) — the
// crosshair was picked on the pre-replan long route and left stranded. Drives the real
// gate (shouldAiUseCrosshairForSelectedPlan) so the prune matches live behavior.

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

const context = {
  Math, Number, Boolean, Array,
  CELL_SIZE: 20,
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.6,
  AI_CROSSHAIR_ABUNDANCE_RELAX: 0.15,
  AI_CROSSHAIR_BOLD_RATIO_FLOOR: 0.2,
  settings: { flightRangeCells: 30 }, // effectiveRangePx = 600
  INVENTORY_ITEM_TYPES: { CROSSHAIR: 'crosshair', FUEL: 'fuel', DYNAMITE: 'dynamite' },
  planeHasActiveTurnBuff: (p, t) => Boolean(p?.activeTurnBuffs?.[t]),
  getAiSelectedPlanIntentText: (p) =>
    `${p?.goalName || ''} ${p?.decisionReason || ''} ${p?.routeClass || ''}`.toLowerCase(),
  logAiDecision: () => {},
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getEffectiveFlightRangeCells'), context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseCrosshairForSelectedPlan'), context);
vm.runInContext(extractFunctionSource(source, 'pruneStaleAimBuffsAfterRouteRewrite'), context);

const plane = { id: 'p4', color: 'blue', x: 62, y: 48, activeTurnBuffs: {} };
const counts = { crosshair: 1 };

// 1. THE BUG: the dumped post-replan plan is short (planDistance 229.95 / 600 = 0.38 < 0.6),
//    a dynamite+crosshair combo. The crosshair must be pruned; dynamite must stay.
const shortPlan = {
  plane, landingX: 170.94123885195182, landingY: 250.50832203141013,
  planDistance: 229.951764538947, routeClass: 'direct', bounceCount: 1,
  goalName: 'simple_step2_cargo', decisionReason: 'simple_step2_pickup_cargo',
  selectedInventorySequence: [
    { itemType: 'dynamite', reason: 'dynamite_clear_path_to_base' },
    { itemType: 'crosshair', reason: 'selected_plan_precision_support' },
  ],
};
const removed = context.pruneStaleAimBuffsAfterRouteRewrite(shortPlan, counts);
assert(removed === 1, `1: exactly one stale buff (the crosshair) is removed, got ${removed}.`);
assert(shortPlan.selectedInventorySequence.some((e) => e.itemType === 'dynamite'),
  '1b: the dynamite (which did real work clearing the brick) is kept.');
assert(!shortPlan.selectedInventorySequence.some((e) => e.itemType === 'crosshair'),
  '1c: the crosshair is dropped from a short direct flight (precision no longer justified).');

// 2. A LONG route that still justifies the crosshair keeps it (no over-pruning).
const longPlan = {
  plane, landingX: 62 + 400, landingY: 48 + 300, // ~500px, ratio 0.83
  planDistance: 500, routeClass: 'ricochet', bounceCount: 2,
  goalName: 'simple_step2_cargo', decisionReason: 'cargo_ricochet',
  selectedInventorySequence: [{ itemType: 'crosshair', reason: 'selected_plan_precision_support' }],
};
assert(context.pruneStaleAimBuffsAfterRouteRewrite(longPlan, counts) === 0,
  '2: a still-long route keeps its crosshair (not over-pruned).');
assert(longPlan.selectedInventorySequence.length === 1, '2b: the crosshair survives on the long route.');

// 3. A guaranteed plain direct hit (bounce 0, direct, target_hit_direct) never needs a
//    crosshair -> pruned even though it might be long.
const directHit = {
  plane, landingX: 62, landingY: 48 + 500, planDistance: 500,
  routeClass: 'direct', bounceCount: 0, predictedOutcome: 'target_hit_direct',
  goalName: 'simple_step2_attack', decisionReason: 'simple_step2_direct_enemy',
  selectedInventorySequence: [{ itemType: 'crosshair', reason: 'selected_plan_precision_support' }],
};
assert(context.pruneStaleAimBuffsAfterRouteRewrite(directHit, counts) === 1,
  '3: a plain guaranteed direct hit drops the crosshair (precision wasted on a sure thing).');

// 4. No crosshair in the sequence -> nothing removed, other items untouched.
const noCrosshair = {
  plane, landingX: 170, landingY: 250, planDistance: 229, routeClass: 'direct', bounceCount: 1,
  goalName: 'simple_step2_cargo',
  selectedInventorySequence: [{ itemType: 'dynamite', reason: 'dynamite_clear_path_to_base' }],
};
assert(context.pruneStaleAimBuffsAfterRouteRewrite(noCrosshair, counts) === 0,
  '4: with no crosshair there is nothing to prune.');
assert(noCrosshair.selectedInventorySequence.length === 1, '4b: the dynamite entry is untouched.');

// 5. Abundance: a stack of spare crosshairs lowers the bar, so a mid-length shot can keep
//    it even after a replan (matches the gate's abundance relax) — the prune respects that.
const midPlanBoldCounts = { crosshair: 4 }; // bar drops toward the floor
const midPlan = {
  plane, landingX: 62 + 200, landingY: 48 + 150, planDistance: 250, // 250/600 = 0.42
  routeClass: 'ricochet', bounceCount: 1,
  goalName: 'simple_step2_cargo', decisionReason: 'cargo_ricochet',
  selectedInventorySequence: [{ itemType: 'crosshair', reason: 'selected_plan_precision_support' }],
};
assert(context.pruneStaleAimBuffsAfterRouteRewrite(midPlan, midPlanBoldCounts) === 0,
  '5: with a stack of spare crosshairs the bar is lower, so a mid-length ricochet keeps it.');

console.log('Smoke test passed: pruneStaleAimBuffsAfterRouteRewrite drops a crosshair stranded on a dynamite-shortened flight (and a plain direct hit) while keeping it on still-long routes and respecting crosshair abundance.');
