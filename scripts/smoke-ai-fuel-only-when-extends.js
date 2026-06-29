#!/usr/bin/env node
'use strict';

// Smoke test: Step 5 (+ follow-ups) — fuel is spent only when it does something the
// BASE range can't, never on a move the plane could have made without it.
//
// Three legitimate advantages, all gated so they never waste fuel:
//   1. Harpy strike+retreat — round trip needs fuel, AND either the strike reaches
//      deep forward OR the strike point is exposed while home is safer.
//   2. Capture more targets — flying the doubled distance along the launch line
//      sweeps enemies/cargo the base move stops short of.
//   3. Reach a distant target the base move falls short of.
// A SHALLOW, safe strike near our own base clears none of these -> no fuel (the
// reported "fuel + short move"). Drives the real caller pickAiBuffsForSelectedPlan.

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
let homeY = 0;          // controls getBaseAnchor per scenario
let homeThreatRisk = 0; // controls the (home) risk read by getImmediateResponseThreatMeta

// base range 30 cells * 20 = 600px; fuel doubles to 60 cells = 1200px.
const context = {
  Math,
  Number,
  CELL_SIZE: 20,
  AI_FUEL_MIN_REACH_RATIO: 1.0,             // module-scope consts in script.js
  AI_FUEL_HARPY_MIN_STRIKE_RISK: 0.5,
  AI_FUEL_HARPY_MIN_SAFETY_GAIN: 0.2,
  AI_FUEL_EXTEND_MIN_EXTRA_TARGETS: 1,
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: (p) => (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.FUEL] ? 60 : 30),
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: homeY }),
  // Harpy compares the strike-point exposure (selectedPlan.landingRisk, per scenario)
  // against the HOME exposure read here. Pass the risk straight through.
  getFallbackCandidateResponseRisk: (meta) => (meta && Number.isFinite(meta.risk) ? meta.risk : 0),
  getImmediateResponseThreatMeta: () => ({ risk: homeThreatRisk, count: homeThreatRisk > 0 ? 1 : 0 }),
  // For the "capture more targets" extension probe.
  getPlaneBeneficialGeometry: () => ({ hitbox: { width: 36 } }), // half-width 18 (+10 margin)
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  isPathClear: () => true,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

const fuelReason = (targetDist, landingDist, { home = 0, landingRisk = 0, homeRisk = 0, enemies = [], readyCargo = [] } = {}) => {
  homeY = home;
  homeThreatRisk = homeRisk;
  plane.activeTurnBuffs = {};
  const out = context.pickAiBuffsForSelectedPlan({
    plane,
    color: 'blue',
    context: { enemies, readyCargo },
    selectedPlan: {
      plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
      bounceCount: 0, landingX: 0, landingY: landingDist, planDistance: landingDist,
      landingRisk,
      targetPoint: { x: 0, y: targetDist }, score: 0.5,
    },
    availableCounts: { fuel: 1 },
  }).find((c) => c.itemType === 'fuel');
  return out ? out.reason : null;
};

// 1. Move that fits in base range, round trip home fits WITHOUT fuel -> NO fuel.
assert(fuelReason(300, 300, { home: 0 }) === null, '1: a within-range move must NOT spend fuel.');

// 2. SHALLOW strike whose round trip needs fuel but is NOT deep and lands somewhere
//    safe -> NO fuel. This is the reported waste: fuel on a strike reachable without it.
assert(fuelReason(420, 420, { home: 0, landingRisk: 0.0, homeRisk: 0.0 }) === null,
  '2: a shallow, safe strike must NOT spend fuel (the reported waste).');

// 3. DEEP but CALM strike that just darts out from base and back (safe landing) ->
//    NO fuel. The retreat protects nothing; the kill is within base range. This is
//    exactly the "out-and-back from base" waste we stopped spending fuel on.
assert(fuelReason(540, 540, { home: 0, landingRisk: 0.0 }) === null,
  '3: a deep but calm out-and-back from base must NOT spend fuel.');

// 4. Mid-range strike that is EXPOSED, with a safe home -> harpy (escape branch).
assert(fuelReason(420, 420, { home: 0, landingRisk: 0.8, homeRisk: 0.1 }) === 'harpy_strike_return',
  '4: an exposed mid strike with a safe home should use fuel to retreat.');

// 5. Exposed strike but home is just as exposed -> retreat gains nothing -> NO fuel.
assert(fuelReason(420, 420, { home: 0, landingRisk: 0.8, homeRisk: 0.75 }) === null,
  '5: no fuel when the retreat does not reach a meaningfully safer home.');

// 6. Capture more targets: a short shot (no harpy), but an enemy sits ON the launch
//    line BEYOND base range and within fuel range -> extend with fuel to sweep it.
assert(fuelReason(300, 300, { home: 0, enemies: [{ x: 0, y: 900, isAlive: true }] }) === 'extend_range_more_targets',
  '6: fuel should extend the move to sweep a target beyond base range on the line.');

// 6b. Ready cargo in the extension band on the line -> extend with fuel.
assert(fuelReason(300, 300, { home: 0, readyCargo: [{ x: 0, y: 1000, state: 'ready' }] }) === 'extend_range_more_targets',
  '6b: fuel should extend to sweep cargo beyond base range on the line.');

// 7. A target beyond range but OFF the launch line -> not swept -> NO extend fuel.
assert(fuelReason(300, 300, { home: 0, enemies: [{ x: 500, y: 900, isAlive: true }] }) === null,
  '7: a target off the launch line must NOT trigger extension fuel.');

// 8. A target already WITHIN base range -> base move reaches it -> NO extend fuel.
assert(fuelReason(300, 300, { home: 0, enemies: [{ x: 0, y: 400, isAlive: true }] }) === null,
  '8: a target the base move already reaches must NOT trigger extension fuel.');

// 9. Distant target, home too far for a harpy round trip -> reach the distant target.
assert(fuelReason(800, 600, { home: -700 }) === 'selected_plan_reach_distant_target',
  '9: fuel should reach a target beyond base range.');

// 10. Target beyond even the fuel-boosted range -> unreachable, NO fuel.
assert(fuelReason(1300, 600, { home: -700 }) === null, '10: do not spend fuel on an unreachable target.');

console.log('Smoke test passed: fuel spent only to retreat from an EXPOSED strike to a safer home, to sweep extra targets on the line, or to reach a distant target; never on a calm out-and-back the base range already covers.');
