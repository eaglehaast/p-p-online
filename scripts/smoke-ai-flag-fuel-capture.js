#!/usr/bin/env node
'use strict';

// Smoke test: B2 — a fuel flag capture. With fuel, launch AT a flag; the boosted flight
// grabs it and heads to base. Success = DELIVER (crosses base after the grab, tier -1) OR
// ADVANCE (the flag lands meaningfully closer to base, tier 0). A launch that grabs the
// flag but carries it no closer to base — or no fuel / no flag / out of reach — yields null.

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
const dist = (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));

const context = {
  Math,
  Number,
  CELL_SIZE: 20,
  INVENTORY_ITEM_TYPES,
  AI_FLAG_FUEL_CAPTURE_ANGLE_STEP_DEG: 15,
  AI_FLAG_FUEL_CAPTURE_FAN_DEG: 75,
  AI_FLAG_FUEL_CAPTURE_MAX_BOUNCES: 3,
  AI_FLAG_FUEL_CAPTURE_MIN_ADVANCE_PX: 120,
  dist,
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  getBaseInteractionTarget: () => ({ anchor: { x: 0, y: 0 }, radius: 40 }),
  getFlagInteractionTarget: (flag) => ({ anchor: flag.anchor, radius: 30 }),
  applyItemToOwnPlane: (type, _color, p) => { p.activeTurnBuffs = { ...(p.activeTurnBuffs || {}), [type]: true }; return true; },
  getPlaneEffectiveRangePx: (p) => (p?.activeTurnBuffs?.[INVENTORY_ITEM_TYPES.FUEL] ? 1200 : 600),
  doesPlaneZoneIntersectTargetZone: (p, target) => dist(p, target.anchor) <= target.radius,
  // straight sampled flight along the launch direction at the plane's (boosted) range.
  simulateAIShot: (p, launch) => {
    const range = context.getPlaneEffectiveRangePx(p);
    const path = [];
    for(let d = 0; d <= range; d += 40){ path.push({ x: p.x + launch.dx * d, y: p.y + launch.dy * d }); }
    return { predictedPath: path, bounceCount: 0, travelDistance: range };
  },
  logAiDecision: () => {},
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'tryBuildAiFlagFuelCapturePlan'), context);

const plane = (x, y, carriedFlagId = null) => ({ id: 'p', color: 'blue', x, y, carriedFlagId, activeTurnBuffs: {} });
const flagAt = (x, y) => ({ id: 'g', color: 'green', anchor: { x, y } });
const run = (p, opts) => context.tryBuildAiFlagFuelCapturePlan(p, opts);
const base = { flagsMode: true, fuelAvailable: true, readyCargoCount: 0 };

// 1. DELIVER: plane above base, flag between -> launch down grabs flag then crosses base.
const p1 = run(plane(0, 800), { ...base, availableEnemyFlags: [flagAt(0, 400)] });
assert(p1 && p1.planTier === -1 && p1.decisionReason === 'flag_fuel_capture_deliver',
  '1: grab-and-deliver should be a tier -1 fuel capture.');
assert(p1.aiFlagFuelCapture === true, '1b: the plan must flag itself for fuel.');

// 2. ADVANCE: grabs the flag and ends much closer to base, but misses the base zone.
const p2 = run(plane(100, 1000), { ...base, availableEnemyFlags: [flagAt(50, 700)] });
assert(p2 && p2.planTier === 0 && p2.decisionReason === 'flag_fuel_capture_advance',
  '2: grab-and-advance should be a tier 0 fuel capture.');

// 3. NO PROGRESS: plane near base, flag away -> launching at it carries the flag FURTHER
//    from base -> null.
assert(run(plane(0, 100), { ...base, availableEnemyFlags: [flagAt(0, 700)] }) === null,
  '3: a grab that carries the flag away from base must NOT be taken.');

// 4. No fuel -> null.
assert(run(plane(0, 800), { flagsMode: true, fuelAvailable: false, availableEnemyFlags: [flagAt(0, 400)] }) === null,
  '4: no fuel, no fuel capture.');

// 5. Already carrying -> null (delivery plan handles it).
assert(run(plane(0, 800, 'g'), { ...base, availableEnemyFlags: [flagAt(0, 400)] }) === null,
  '5: a carrier is handled by the delivery plan, not here.');

// 6. No flags -> null.
assert(run(plane(0, 800), { ...base, availableEnemyFlags: [] }) === null, '6: no flags, no capture.');

// 7. Flag out of even the boosted reach -> null.
assert(run(plane(0, 800), { ...base, availableEnemyFlags: [flagAt(0, 3000)] }) === null,
  '7: an unreachable flag is not chased.');

console.log('Smoke test passed: fuel flag capture delivers (tier -1) or advances the flag toward base (tier 0); never spent to carry a flag nowhere, without fuel, or on an unreachable flag.');
