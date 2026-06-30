#!/usr/bin/env node
'use strict';

// Smoke test: inventory boldness — abundance lowers the bar to use a buff.
//
// Crosshair only guarantees a hit and wings only widen a span; neither wastes the
// move, so hoarding a stack while shooting timidly is itself a waste. With spares, the
// distance bar drops (crosshair/wings fire on mid shots), and a full stack of wings is
// worth slapping onto even a single target on a long shot (miss-insurance). With a
// single copy the strict thresholds are unchanged.

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

const INVENTORY_ITEM_TYPES = { FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisible', MINE: 'mine', DYNAMITE: 'dynamite' };
const plane = { x: 0, y: 0, color: 'blue', activeTurnBuffs: {} };

const context = {
  Math,
  Number,
  Array,
  CELL_SIZE: 20,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_FUEL_MIN_REACH_RATIO: 1.0,
  AI_FUEL_EXTEND_MIN_EXTRA_TARGETS: 1,
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.6,
  AI_CROSSHAIR_ABUNDANCE_RELAX: 0.15,
  AI_CROSSHAIR_BOLD_RATIO_FLOOR: 0.2,
  AI_WINGS_MIN_PICKUPS: 2,
  AI_WINGS_LONG_SHOT_RATIO: 0.6,
  AI_WINGS_ABUNDANCE_RELAX: 0.15,
  AI_WINGS_BOLD_RATIO_FLOOR: 0.2,
  AI_WINGS_BOLD_SINGLE_TARGET_COUNT: 3,
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: () => 30, // effectiveRangePx = 600
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  getPlaneBeneficialGeometry: (p) => ({ hitbox: { width: (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.WINGS] === true) ? 96 : 36 } }),
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  getDistanceFromPointToSegment: (px) => px, // enemy.x encodes perpendicular distance
  doesCargoIntersectBeneficialZoneAlongPath: () => false,
  getAiPlannedMovePredictedPath: () => [{ x: 0, y: 0 }, { x: 0, y: 420 }],
  isPathClear: () => true,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseCrosshairForSelectedPlan'), context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseWingsForSelectedPlan'), context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

const picks = (selectedPlan, availableCounts, enemies = []) => {
  plane.activeTurnBuffs = {};
  return context.pickAiBuffsForSelectedPlan({ plane, color: 'blue', context: { enemies, readyCargo: [] }, selectedPlan, availableCounts })
    .map((c) => c.itemType);
};

// --- Crosshair: a MID-range attack (ratio 0.4) ---
const midShot = {
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, landingX: 0, landingY: 240, planDistance: 240, targetPoint: { x: 0, y: 240 }, score: 0.5,
};
assert(!picks(midShot, { crosshair: 1 }).includes('crosshair'),
  '1: a single crosshair must NOT be spent on a mid-range shot (strict bar).');
assert(picks(midShot, { crosshair: 4 }).includes('crosshair'),
  '2: a stack of crosshairs SHOULD be spent on the mid-range shot (bold bar).');

// --- Wings: a LONG shot over a SINGLE wide-only enemy (x=50 -> only the wide span hits) ---
const longSingle = {
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, landingX: 0, landingY: 420, planDistance: 420, targetPoint: { x: 0, y: 420 }, score: 0.5,
};
const oneEnemy = [{ id: 'e1', isAlive: true, x: 50, y: 0 }];
assert(!picks(longSingle, { wings: 1 }, oneEnemy).includes('wings'),
  '3: a single wing must NOT be spent on a lone target (needs >= 2 targets).');
assert(picks(longSingle, { wings: 3 }, oneEnemy).includes('wings'),
  '4: a stack of wings SHOULD be spent on a lone target on a long shot (miss-insurance).');

console.log('Smoke test passed: abundant crosshairs/wings are used boldly (mid shots, lone long-shot targets); a single copy keeps the strict thresholds.');
