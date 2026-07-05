#!/usr/bin/env node
'use strict';

// Smoke test: precision (crosshair) PRIORITIZES multi-target moves.
// shouldAiUseCrosshairForSelectedPlan normally gates on a long-shot distance ratio,
// but a MULTI-TARGET sweep (a chained multikill / multi-pickup) is exactly where
// perfect aim pays off, so it must bypass the distance gate and always get the
// crosshair — even when short. Fuel-extended sweeps (aiFuelRicochetExtend) count
// too. A plain guaranteed direct hit still gets none (precision isn't wasted on a
// sure thing), and a SHORT single ricochet is still gated out.

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

const plane = { x: 0, y: 0, activeTurnBuffs: {} };
const context = {
  Math,
  Number,
  Boolean,
  CELL_SIZE: 20,
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.6,
  AI_CROSSHAIR_ABUNDANCE_RELAX: 0.15,
  AI_CROSSHAIR_BOLD_RATIO_FLOOR: 0.2,
  getEffectiveFlightRangeCells: () => 30, // effectiveRangePx = 600
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseCrosshairForSelectedPlan'), context);
const uses = (selectedPlan) => context.shouldAiUseCrosshairForSelectedPlan({}, selectedPlan, { availableCount: 1 });

// 1. SHORT multi-target sweep (ratio 0.2, would be gated out as a single shot) ->
//    crosshair, because a multikill chain is precision's best use.
assert(uses({
  plane, routeClass: 'ricochet', goalName: 'simple_step2_multi_target',
  decisionReason: 'simple_step2_multi_target_ricochet', bounceCount: 2,
  planDistance: 120, multiTargetCount: 3, landingX: 40, landingY: 90,
}) === true, '1: a short multi-target sweep must still get the crosshair (priority bypasses the distance gate).');

// 2. Fuel-extended sweep: fuel would add targets on the same line -> crosshair,
//    even if short and only nominally single-target before the boost.
assert(uses({
  plane, routeClass: 'ricochet', goalName: 'simple_step2_multi_target', bounceCount: 1,
  planDistance: 100, multiTargetCount: 1, landingX: 20, landingY: 90,
  aiFuelRicochetExtend: { baseCount: 1, boostedCount: 2 },
}) === true, '2: a fuel-extended sweep (more targets with fuel) gets the crosshair too.');

// 3. A plain guaranteed direct hit -> NO crosshair, even at long range (precision
//    is not spent on a sure thing).
assert(uses({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, predictedOutcome: 'target_hit_direct', planDistance: 510, landingX: 0, landingY: 510,
}) === false, '3: a plain guaranteed direct hit does not get a crosshair.');

// 4. Single-target SHORT move (multiTargetCount 1) -> still gated out by distance.
assert(uses({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 120, multiTargetCount: 1, landingX: 0, landingY: 120,
}) === false, '4: a short single-target move is still gated out (priority is for multi-target only).');

// 5. A multi-target sweep that is ALSO long -> crosshair (both paths agree).
assert(uses({
  plane, routeClass: 'ricochet', goalName: 'simple_step2_multi_target', bounceCount: 2,
  planDistance: 540, multiTargetCount: 2, landingX: 100, landingY: 500,
}) === true, '5: a long multi-target sweep gets the crosshair.');

// 6. fuelExtend present but NOT adding targets (boosted == base) -> not a priority;
//    falls back to the normal gate (short -> none).
assert(uses({
  plane, routeClass: 'ricochet', goalName: 'attack', bounceCount: 1, planDistance: 120,
  multiTargetCount: 1, landingX: 20, landingY: 90,
  aiFuelRicochetExtend: { baseCount: 2, boostedCount: 2 },
}) === false, '6: a fuel probe that adds no targets is not force-prioritized.');

// 7. A mine-trap escape that THREADS a tight gap (threadsMineGap) gets the crosshair
//    even though it is short and single-target: spread near a mine is fatal, so
//    precision guarantees the thread (bypasses the distance gate like a multikill).
assert(uses({
  plane, routeClass: 'direct', goalName: 'simple_step2_mine_escape',
  decisionReason: 'mine_escape_reposition', bounceCount: 0,
  planDistance: 120, multiTargetCount: 1, landingX: 40, landingY: 90,
  threadsMineGap: true,
}) === true, '7: a tight mine-gap thread escape gets the crosshair (spread near a mine is fatal).');

// 8. A roomy escape (threadsMineGap false) is NOT force-prioritized -> normal gate
//    applies, and a short one stays gated out (precision not wasted on a safe hop).
assert(uses({
  plane, routeClass: 'direct', goalName: 'simple_step2_mine_escape',
  decisionReason: 'mine_escape_reposition', bounceCount: 0,
  planDistance: 120, multiTargetCount: 1, landingX: 40, landingY: 90,
  threadsMineGap: false,
}) === false, '8: a roomy short escape is not force-prioritized (no crosshair wasted).');

console.log('Smoke test passed: precision prioritizes multi-target / fuel-extended sweeps and tight mine-gap threads (even short ones), still skips sure direct hits, short single shots, and roomy escapes.');
