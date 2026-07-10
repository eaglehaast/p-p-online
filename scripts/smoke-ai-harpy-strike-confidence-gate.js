#!/usr/bin/env node
'use strict';

// Smoke test: a harpy strike (spend FUEL to fly out, strike, and return home) is only
// committed when the STRIKE is a confident kill. From a real aiDumpBadMove: the AI stacked
// fuel (harpy strike/return) AND crosshair on a 3-BOUNCE ricochet "kill" that whiffed —
// netting only a cargo, i.e. 2 items for nothing. A deep ricochet is a low-confidence hit
// (the shot sim diverges from the real bounced flight), so the harpy gate now caps the
// bounce depth it will spend fuel on (AI_HARPY_STRIKE_MAX_BOUNCES). This is a CONFIDENCE
// gate, not a ricochet penalty — a direct or shallow ricochet harpy strike is still allowed.
// Drives the real caller pickAiBuffsForSelectedPlan (only fuel available, so the aim-buff
// gates aren't reached).

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

// base range 30 cells * 20 = 600px; fuel doubles to 60 cells = 1200px. A strike+return of
// 840px (out 420 + back 420) does NOT fit without fuel (>600) but fits with it (<1200) —
// so the round-trip gate passes and only the CONFIDENCE gate decides.
const context = {
  Math, Number, Boolean,
  CELL_SIZE: 20,
  AI_FUEL_MIN_REACH_RATIO: 1.0,
  AI_FUEL_EXTEND_MIN_EXTRA_TARGETS: 1,
  AI_HARPY_STRIKE_MAX_BOUNCES: 2,
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: (p) => (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.FUEL] ? 60 : 30),
  getAiSelectedPlanIntentText: (pl) =>
    `${pl?.goalName || ''} ${pl?.decisionReason || ''} ${pl?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _c, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: 0 }), // home at origin -> legBack == landing distance
  getPlaneBeneficialGeometry: () => ({ hitbox: { width: 36 } }),
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  isPathClear: () => true,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

// A ricochet enemy strike whose out-and-back (420 + 420 = 840px) needs fuel. Only the
// bounce depth varies. targetPoint left unset so the "reach distant target" fuel branch
// stays out of the way — the harpy branch is the only fuel option in play.
const harpyReasonForBounces = (bounceCount) => {
  plane.activeTurnBuffs = {};
  const out = context.pickAiBuffsForSelectedPlan({
    plane, color: 'blue', context: { enemies: [], readyCargo: [] },
    selectedPlan: {
      plane, routeClass: 'ricochet', goalName: 'attack', decisionReason: 'simple_step2_ricochet_enemy',
      bounceCount, landingX: 0, landingY: 420, planDistance: 420, score: 0.5,
    },
    availableCounts: { fuel: 1 },
  }).find((c) => c.itemType === 'fuel');
  return out ? out.reason : null;
};

// 1. A confident kill (direct / shallow ricochet) still gets the harpy strike.
assert(harpyReasonForBounces(0) === 'harpy_strike_return', '1: a direct strike-and-return still spends fuel (confident).');
assert(harpyReasonForBounces(1) === 'harpy_strike_return', '1b: a single-bounce ricochet harpy strike is allowed.');
assert(harpyReasonForBounces(2) === 'harpy_strike_return', '1c: a 2-bounce ricochet is at the cap and still allowed.');

// 2. THE FIX: a deep 3-bounce ricochet "kill" is too low-confidence to commit fuel to a
//    strike-and-return -> no harpy fuel (no "harpy strike for its own sake" that whiffs).
assert(harpyReasonForBounces(3) === null, '2: a 3-bounce ricochet does NOT get the harpy fuel (confidence gate).');
assert(harpyReasonForBounces(4) === null, '2b: an even deeper ricochet is likewise gated out.');

// 3. It is a CONFIDENCE gate, not a ricochet penalty: the allowed cases above include
//    single- and double-bounce RICOCHETS, not just the direct shot.
assert(harpyReasonForBounces(2) === harpyReasonForBounces(0),
  '3: a shallow ricochet harpy strike is treated the same as a direct one (no ricochet penalty).');

console.log('Smoke test passed: the harpy strike commits fuel only to a confident (shallow) kill — direct and shallow ricochets allowed, deep speculative ricochets gated out — so the AI stops spending fuel (+precision) on a harpy strike that whiffs.');
