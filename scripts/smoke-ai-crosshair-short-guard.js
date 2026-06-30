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
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.6, // module-scope consts in script.js
  AI_CROSSHAIR_ABUNDANCE_RELAX: 0.15,
  AI_CROSSHAIR_BOLD_RATIO_FLOOR: 0.2,
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

// 5. Short DIRECT attack (ratio 0.3) -> NO crosshair (below the 0.6 floor).
assert(usesCrosshair({
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, planDistance: 180, targetPoint: { x: 0, y: 180 }, score: 0.5,
}) === false, '5: short attack below 0.6 must NOT use crosshair.');

// 6. Near-max aimless CENTER drift (no attack/pickup intent) -> NO crosshair.
assert(usesCrosshair({
  plane, routeClass: 'direct', goalName: 'simple_step2_center', decisionReason: 'simple_step2_center_control',
  bounceCount: 0, planDistance: 540, targetPoint: { x: 0, y: 540 }, score: 0.1,
}) === false, '6: a near-max aimless center drift must NOT use crosshair.');

// 7. LONG ricochet whose straight-line planDistance is short (100) but whose
//    actual launch travel is long (landing far) -> crosshair, via the launch-
//    travel metric (these long bouncy shots were under-measured before).
assert(usesCrosshair({
  plane, routeClass: 'ricochet', goalName: 'attack', decisionReason: 'simple_step2_ricochet_enemy',
  bounceCount: 2, planDistance: 100, landingX: 0, landingY: 420, targetPoint: { x: 60, y: 90 }, score: 0.5,
}) === true, '7: a long-travel ricochet should use crosshair even if the straight-line distance is short.');

console.log('Smoke test passed: crosshair on long shots (incl. long ricochets), suppressed on short/mid/aimless.');
