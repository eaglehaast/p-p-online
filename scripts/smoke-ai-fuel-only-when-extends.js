#!/usr/bin/env node
'use strict';

// Smoke test: fuel is wasted ONLY when the TOTAL flight (strike + any return) stays
// within base range — i.e. the objective was reachable without fuel. Otherwise fuel
// is fine on anything (a return, a ricochet, cargo, reach): it bought real distance.
//
// So the harpy gate is just "the round trip does NOT fit without fuel but fits with
// it" — no exposure/smartness checks. A <30-cell strike WITH a return whose total
// exceeds base range is allowed; an out-and-back that already fits in base range is
// not. Drives the real caller pickAiBuffsForSelectedPlan.

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
let homeY = 0; // controls getBaseAnchor (the harpy return point) per scenario

// base range 30 cells * 20 = 600px; fuel doubles to 60 cells = 1200px.
const context = {
  Math,
  Number,
  CELL_SIZE: 20,
  AI_FUEL_MIN_REACH_RATIO: 1.0,
  AI_FUEL_EXTEND_MIN_EXTRA_TARGETS: 1,
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: (p) => (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.FUEL] ? 60 : 30),
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: homeY }),
  // For the "capture more targets" extension probe.
  getPlaneBeneficialGeometry: () => ({ hitbox: { width: 36 } }), // half-width 18 (+10 margin)
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  isPathClear: () => true,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

const fuelReason = (targetDist, landingDist, { home = 0, enemies = [], readyCargo = [] } = {}) => {
  homeY = home;
  plane.activeTurnBuffs = {};
  const out = context.pickAiBuffsForSelectedPlan({
    plane,
    color: 'blue',
    context: { enemies, readyCargo },
    selectedPlan: {
      plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
      bounceCount: 0, landingX: 0, landingY: landingDist, planDistance: landingDist,
      targetPoint: { x: 0, y: targetDist }, score: 0.5,
    },
    availableCounts: { fuel: 1 },
  }).find((c) => c.itemType === 'fuel');
  return out ? out.reason : null;
};

// 1. The whole out-and-back fits WITHOUT fuel (total <= base range) -> NO fuel.
//    This is the only real waste: the objective was reachable without fuel.
assert(fuelReason(200, 200, { home: 0 }) === null,
  '1: an out-and-back that fits within base range must NOT spend fuel.');

// 2. A <30-cell strike but the round trip exceeds base range -> harpy. Fuel bought a
//    real out-and-back the base move could not make (the user-approved case).
assert(fuelReason(420, 420, { home: 0 }) === 'harpy_strike_return',
  '2: a short strike with a return whose total exceeds base range should use fuel.');

// 3. A deep out-and-back (well over base range) -> harpy, regardless of "smartness".
assert(fuelReason(540, 540, { home: 0 }) === 'harpy_strike_return',
  '3: a deep out-and-back over base range should use fuel.');

// 4. Round trip too long even WITH fuel -> NO fuel (can't make it anyway).
assert(fuelReason(540, 540, { home: -700 }) === null,
  '4: no fuel when even the boosted round trip does not fit.');

// 5. Capture more targets: a short shot, but an enemy sits ON the launch line beyond
//    base range and within fuel range -> extend with fuel to sweep it.
assert(fuelReason(300, 300, { home: 0, enemies: [{ x: 0, y: 900, isAlive: true }] }) === 'extend_range_more_targets',
  '5: fuel should extend the move to sweep a target beyond base range on the line.');

// 6. A target beyond range but OFF the launch line -> not swept -> NO extend fuel.
assert(fuelReason(300, 300, { home: 0, enemies: [{ x: 500, y: 900, isAlive: true }] }) === null,
  '6: a target off the launch line must NOT trigger extension fuel.');

// 7. A target already WITHIN base range -> base move reaches it -> NO extend fuel.
assert(fuelReason(300, 300, { home: 0, enemies: [{ x: 0, y: 400, isAlive: true }] }) === null,
  '7: a target the base move already reaches must NOT trigger extension fuel.');

// 8. Distant target, home too far for a harpy round trip -> reach the distant target.
assert(fuelReason(800, 600, { home: -700 }) === 'selected_plan_reach_distant_target',
  '8: fuel should reach a target beyond base range.');

// 9. Target beyond even the fuel-boosted range -> unreachable, NO fuel.
assert(fuelReason(1300, 600, { home: -700 }) === null, '9: do not spend fuel on an unreachable target.');

console.log('Smoke test passed: fuel is spent on anything whose TOTAL flight exceeds base range, and never when the whole move already fits within base range.');
