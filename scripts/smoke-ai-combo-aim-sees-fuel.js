#!/usr/bin/env node
'use strict';

// Smoke test: combo synergy — crosshair (and wings) judge the FUEL-EXTENDED move.
//
// When fuel is applied, the launch stretches the move to the boosted max range along
// the same angle. So a shot that is too short for a crosshair on the BASE move becomes
// a long shot once fuel extends it, and should then get the crosshair. pickAiBuffs must
// evaluate the aim/span buffs on that extended plan (planForAimBuffs), not the base one.

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

// base range 30 cells * 20 = 600px; fuel doubles to 60 cells = 1200px.
const context = {
  Math,
  Number,
  CELL_SIZE: 20,
  AI_FUEL_MIN_REACH_RATIO: 1.0,
  AI_FUEL_EXTEND_MIN_EXTRA_TARGETS: 1,
  AI_CROSSHAIR_MIN_DISTANCE_RATIO: 0.6,
  AI_CROSSHAIR_ABUNDANCE_RELAX: 0.15,
  AI_CROSSHAIR_BOLD_RATIO_FLOOR: 0.2,
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: (p) => (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.FUEL] ? 60 : 30),
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  // direct fuel-extend probe deps (unused here — context has no enemies/cargo)
  getPlaneBeneficialGeometry: () => ({ hitbox: { width: 36 } }),
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  isPathClear: () => true,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseCrosshairForSelectedPlan'), context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

// A short attack (15 cells out) whose harpy round trip needs fuel. landingY 320 ->
// base ratio 320/600 = 0.53 (< 0.6, no crosshair on base), but a harpy fires (round
// trip 640 > base 600), so fuel extends it to 1200 (ratio 2.0 -> crosshair).
const plan = {
  plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
  bounceCount: 0, landingX: 0, landingY: 320, planDistance: 320,
  targetPoint: { x: 0, y: 320 }, score: 0.5,
};
const buffs = (availableCounts) => {
  plane.activeTurnBuffs = {};
  return context.pickAiBuffsForSelectedPlan({ plane, color: 'blue', context: {}, selectedPlan: plan, availableCounts })
    .map((c) => c.itemType);
};

// 1. fuel + crosshair available: fuel (harpy) fires AND extends the move, so crosshair
//    is judged on the long extended shot and is granted -> both present.
const withFuel = buffs({ fuel: 1, crosshair: 1 });
assert(withFuel.includes('fuel'), '1a: the harpy round trip should spend fuel.');
assert(withFuel.includes('crosshair'), '1b: crosshair should be granted on the fuel-extended (long) shot.');

// 2. crosshair only (no fuel): nothing extends the move, so the short base shot does
//    NOT clear the crosshair distance gate -> no crosshair.
const noFuel = buffs({ crosshair: 1 });
assert(!noFuel.includes('crosshair'), '2: a short shot with no fuel must NOT get a crosshair.');

// 3. control: an already-long base shot still gets a crosshair without any fuel.
const longPlan = { ...plan, landingY: 540, planDistance: 540, targetPoint: { x: 0, y: 540 } };
plane.activeTurnBuffs = {};
const longShot = context.pickAiBuffsForSelectedPlan({ plane, color: 'blue', context: {}, selectedPlan: longPlan, availableCounts: { crosshair: 1 } })
  .map((c) => c.itemType);
assert(longShot.includes('crosshair'), '3: a long base shot still gets a crosshair without fuel.');

console.log('Smoke test passed: crosshair/wings are judged on the fuel-extended move — a short fuel shot now earns the crosshair, a short non-fuel shot does not.');
