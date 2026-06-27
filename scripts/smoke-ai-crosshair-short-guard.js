#!/usr/bin/env node
'use strict';

// Smoke test: Step 3 — crosshair only on near-max-range shots.
//
// Exercises the real caller (pickAiBuffsForSelectedPlan), since the bug was its
// `precisionRoute ||` bypass that handed a crosshair to ANY ricochet/gap route
// regardless of distance. Crosshair (guaranteed hit) only matters near max
// range; below ~80% of range it's pointless — including short ricochets.

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
const INVENTORY_ITEM_TYPES = { FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisible', MINE: 'mine', DYNAMITE: 'dynamite' };

const context = {
  Math,
  Number,
  CELL_SIZE: 20,
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.8, // module-scope const in script.js
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: () => 30, // effectiveRangePx = 600
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
};
vm.createContext(context);
// Both functions share the VM context (pickAiBuffs calls shouldAiUseCrosshair).
vm.runInContext(extractFunctionSource(source, 'shouldAiUseCrosshairForSelectedPlan'), context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

// Only crosshair is in inventory, so only the crosshair branch can fire.
const usesCrosshair = (selectedPlan) => context.pickAiBuffsForSelectedPlan({
  plane: selectedPlan.plane,
  color: 'blue',
  context: {},
  selectedPlan,
  availableCounts: { crosshair: 1 },
}).some((c) => c.itemType === 'crosshair');

// 1. Near-max DIRECT attack (ratio 0.85) -> crosshair.
assert(usesCrosshair({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 510, targetPoint: { x: 0, y: 510 }, score: 0.5,
}) === true, '1: near-max direct attack should use crosshair.');

// 2. Short DIRECT attack (ratio 0.2) -> NO crosshair.
assert(usesCrosshair({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 120, targetPoint: { x: 0, y: 120 }, score: 0.5,
}) === false, '2: short direct attack must NOT use crosshair.');

// 3. Short RICOCHET (ratio 0.2) -> NO crosshair (the reported bug: the
//    precisionRoute bypass used to grant it regardless of distance).
assert(usesCrosshair({
  plane, routeClass: 'ricochet', goalName: 'attack', decisionReason: 'simple_step2_ricochet_enemy',
  bounceCount: 1, planDistance: 120, targetPoint: { x: 40, y: 90 }, score: 0.5,
}) === false, '3: short ricochet must NOT use crosshair (bypass removed).');

// 4. Near-max RICOCHET (ratio 0.9) -> crosshair.
assert(usesCrosshair({
  plane, routeClass: 'ricochet', goalName: 'attack', decisionReason: 'simple_step2_ricochet_enemy',
  bounceCount: 1, planDistance: 540, targetPoint: { x: 100, y: 500 }, score: 0.5,
}) === true, '4: near-max ricochet should use crosshair.');

// 5. Mid-range DIRECT attack (ratio 0.5) -> NO crosshair (below the 0.8 floor).
assert(usesCrosshair({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 300, targetPoint: { x: 0, y: 300 }, score: 0.5,
}) === false, '5: mid-range attack below 0.8 must NOT use crosshair.');

// 6. Near-max aimless CENTER drift (ratio 0.9, no attack/pickup intent) -> NO crosshair.
assert(usesCrosshair({
  plane, routeClass: 'direct', goalName: 'simple_step2_center', decisionReason: 'simple_step2_center_control',
  bounceCount: 0, planDistance: 540, targetPoint: { x: 0, y: 540 }, score: 0.1,
}) === false, '6: a near-max aimless center drift must NOT use crosshair.');

console.log('Smoke test passed: crosshair only on near-max meaningful shots; short/ricochet/mid suppressed.');
