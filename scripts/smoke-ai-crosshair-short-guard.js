#!/usr/bin/env node
'use strict';

// Smoke test: Step 3 — crosshair short-shot negative guard.
//
// shouldAiUseCrosshairForSelectedPlan must NOT request a guaranteed-hit crosshair
// on a very short, non-precision shot (spread barely deflects it), but must still
// use it on long shots and on genuine bounce/gap/ricochet routes (precision
// matters there even when short).

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
const fnSrc = extractFunctionSource(source, 'shouldAiUseCrosshairForSelectedPlan');

const plane = { x: 0, y: 0 };
const context = {
  Math,
  Number,
  CELL_SIZE: 20,
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.3, // module-scope const in script.js
  getEffectiveFlightRangeCells: () => 30, // effectiveRangePx = 600
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
};
vm.createContext(context);
vm.runInContext(fnSrc, context);

const callFor = (plan) => context.shouldAiUseCrosshairForSelectedPlan(context, plan);

// 1. Very short DIRECT shot at a target with a decent score -> NO crosshair.
assert(callFor({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 100, targetPoint: { x: 0, y: 100 }, score: 0.5,
}) === false, '1: very short direct shot must NOT use crosshair.');

// 2. Long DIRECT shot at a target -> crosshair.
assert(callFor({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 350, targetPoint: { x: 0, y: 350 }, score: 0.5,
}) === true, '2: long direct shot should use crosshair.');

// 3. Very short RICOCHET (bounce) -> crosshair (precision needed even when short).
assert(callFor({
  plane, routeClass: 'ricochet', goalName: 'attack', decisionReason: 'simple_step2_ricochet_enemy',
  bounceCount: 1, planDistance: 100, targetPoint: { x: 50, y: 80 }, score: 0.5,
}) === true, '3: short ricochet must still use crosshair.');

// 4. Very short GAP route (no bounce, but a precision route) -> crosshair.
assert(callFor({
  plane, routeClass: 'gap', goalName: 'pickup_cargo', decisionReason: 'simple_step2_pickup_cargo',
  bounceCount: 0, planDistance: 100, targetPoint: { x: 30, y: 90 }, score: 0.4,
}) === true, '4: short gap (precision) route must still use crosshair.');

// 5. Medium shot (ratio 0.35, between the short floor and 0.45) at a target ->
//    still crosshair via target+score (only < floor is suppressed).
assert(callFor({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 210, targetPoint: { x: 0, y: 210 }, score: 0.5,
}) === true, '5: a medium (>= floor) targeted shot keeps crosshair.');

console.log('Smoke test passed: crosshair short-shot guard suppresses waste, keeps long + precision shots.');
