#!/usr/bin/env node
'use strict';

// Smoke test: Step 6 — fuel extends a RICOCHET sweep into a bigger multikill.
//
// The sweep builder re-simulates the winning launch line at fuel-boosted range and,
// when the doubled range catches strictly MORE targets along the bounces, attaches
// `aiFuelRicochetExtend` to the plan. pickAiBuffsForSelectedPlan must then spend fuel
// (reason "ricochet_sweep_extend_more_targets") — and prefer that over a harpy
// retreat, since for a sweep the extra kills are the point. No gain, or no fuel in
// inventory, must NOT spend fuel.

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
  AI_FUEL_HARPY_MIN_STRIKE_RISK: 0.5,
  AI_FUEL_HARPY_MIN_SAFETY_GAIN: 0.2,
  AI_FUEL_HARPY_DEEP_FORWARD_RATIO: 0.8,
  AI_FUEL_EXTEND_MIN_EXTRA_TARGETS: 1,
  INVENTORY_ITEM_TYPES,
  getEffectiveFlightRangeCells: (p) => (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.FUEL] ? 60 : 30),
  getAiSelectedPlanIntentText: (plan) =>
    `${plan?.goalName || ''} ${plan?.decisionReason || ''} ${plan?.routeClass || ''}`.toLowerCase(),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  getFallbackCandidateResponseRisk: (meta) => (meta && Number.isFinite(meta.risk) ? meta.risk : 0),
  getImmediateResponseThreatMeta: () => ({ risk: 0, count: 0 }),
  getPlaneBeneficialGeometry: () => ({ hitbox: { width: 36 } }),
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  isPathClear: () => true,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'pickAiBuffsForSelectedPlan'), context);

// A ricochet multi-target sweep plan. landingY controls "deep forward" (for the
// harpy-ordering test); aiFuelRicochetExtend carries the boosted re-sim result.
const fuelReason = ({ landingY = 300, extend = null, fuel = 1 } = {}) => {
  plane.activeTurnBuffs = {};
  const out = context.pickAiBuffsForSelectedPlan({
    plane,
    color: 'blue',
    context: { enemies: [], readyCargo: [] },
    selectedPlan: {
      plane, routeClass: 'ricochet', goalName: 'simple_step2_multi_target',
      decisionReason: 'simple_step2_multi_target_ricochet', bounceCount: 2,
      landingX: 0, landingY, planDistance: landingY,
      targetPoint: { x: 0, y: landingY }, score: 0.5,
      aiFuelRicochetExtend: extend,
    },
    availableCounts: { fuel },
  }).find((c) => c.itemType === 'fuel');
  return out ? out.reason : null;
};

// 1. Boosted re-sim catches MORE (5 > 3) -> spend fuel to extend the multikill.
assert(fuelReason({ extend: { baseCount: 3, boostedCount: 5 } }) === 'ricochet_sweep_extend_more_targets',
  '1: fuel should extend a ricochet sweep that catches more targets boosted.');

// 2. No extra targets with fuel (5 == 5) -> NO fuel.
assert(fuelReason({ extend: { baseCount: 5, boostedCount: 5 } }) === null,
  '2: no fuel when the boosted ricochet sweep catches no more than the base.');

// 3. Extra targets, but NO fuel in inventory -> NO fuel.
assert(fuelReason({ extend: { baseCount: 3, boostedCount: 5 }, fuel: 0 }) === null,
  '3: no fuel spent when there is none in inventory.');

// 4. No aiFuelRicochetExtend flag at all -> NO ricochet-extend fuel.
assert(fuelReason({ extend: null }) === null,
  '4: a sweep with no boosted gain flag must not trigger ricochet-extend fuel.');

// 5. Ordering: a DEEP sweep (would also be a harpy) with a boosted gain must pick the
//    multikill extend, NOT the harpy retreat (the kills are the point).
assert(fuelReason({ landingY: 540, extend: { baseCount: 3, boostedCount: 5 } }) === 'ricochet_sweep_extend_more_targets',
  '5: multikill-extend should win over a harpy retreat on a deep sweep.');

console.log('Smoke test passed: fuel extends a ricochet sweep only when the boosted range catches more targets, never without a gain or without fuel, and the multikill wins over a retreat.');
