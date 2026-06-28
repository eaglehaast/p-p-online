#!/usr/bin/env node
'use strict';

// Smoke test: Step 5 — fuel is only spent when it actually extends the move.
//
// Fuel doubles range. It is worth spending only when the move USES more than the
// base range: an attack-then-retreat (harpy) or reaching a target the base move
// can't. Applying fuel to a move that already fits in base range is pure waste
// (the reported "fuel + 30-cell move"). Drives the real caller
// pickAiBuffsForSelectedPlan.

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
let homeY = 0; // controls getBaseAnchor per scenario

// base range 30 cells * 20 = 600px; fuel doubles to 60 cells = 1200px.
const context = {
  Math,
  Number,
  CELL_SIZE: 20,
  AI_FUEL_MIN_REACH_RATIO: 1.0, // module-scope const in script.js
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: (p) => (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.FUEL] ? 60 : 30),
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: homeY }),
  getImmediateResponseThreatMeta: () => ({ count: 0 }),
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

const fuelReason = (targetDist, landingDist, home = 0) => {
  homeY = home;
  plane.activeTurnBuffs = {};
  const out = context.pickAiBuffsForSelectedPlan({
    plane,
    color: 'blue',
    context: {},
    selectedPlan: {
      plane, routeClass: 'direct', goalName: 'attack', decisionReason: 'simple_step2_direct_enemy',
      landingX: 0, landingY: landingDist, planDistance: landingDist,
      targetPoint: { x: 0, y: targetDist }, score: 0.5,
    },
    availableCounts: { fuel: 1 },
  }).find((c) => c.itemType === 'fuel');
  return out ? out.reason : null;
};

// 1. Move that fits in base range, round trip home fits WITHOUT fuel -> NO fuel
//    (this is the wasteful "fuel + short move" the change kills).
assert(fuelReason(300, 300, 0) === null, '1: a within-range move must NOT spend fuel.');

// 2. Deep attack: round trip home needs fuel and fits with it -> harpy strike+retreat.
assert(fuelReason(500, 500, 0) === 'harpy_strike_return', '2: a deep attack should use fuel to strike and retreat.');

// 3. Target beyond base range, home too far for a harpy round trip -> reach the
//    distant target (fuel genuinely extends the reach).
assert(fuelReason(800, 600, -700) === 'selected_plan_reach_distant_target', '3: fuel should reach a target beyond base range.');

// 4. Target beyond even the fuel-boosted range -> unreachable, NO fuel.
assert(fuelReason(1300, 600, -700) === null, '4: do not spend fuel on an unreachable target.');

console.log('Smoke test passed: fuel spent only to strike+retreat or reach a distant target; never on a within-range move.');
