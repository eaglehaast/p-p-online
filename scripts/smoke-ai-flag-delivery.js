#!/usr/bin/env node
'use strict';

// Smoke test: a flag carrier that can reach base this turn gets a TOP-priority
// delivery plan (planTier -1), with fuel when home is just out of base range — but
// only on a DIRECT line, and only when the planned move genuinely lands in the base
// zone. No carried (enemy) flag, or no reachable base, yields null (normal logic runs).

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

const flags = { green1: { color: 'green' }, blue1: { color: 'blue' } };
let baseRangeMove = null; // what the base-range route probe returns
let boostedMove = null;   // what the fuel-boosted route probe returns

const context = {
  Math,
  Number,
  getFlagById: (id) => flags[id] || null,
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  getBaseInteractionTarget: () => ({ anchor: { x: 0, y: 0 }, radius: 40 }),
  getAiMoveLandingPoint: (move) => move?.landing || null,
  // base zone hit = the (fake) plane at the landing is within the base radius.
  doesPlaneZoneIntersectTargetZone: (p, target) =>
    Math.hypot(p.x - target.anchor.x, p.y - target.anchor.y) <= target.radius,
  planPathWithSpecialRouteProbe: (plane, tx, ty, opts) => (opts?.useFuelBoostedRange ? boostedMove : baseRangeMove),
  logAiDecision: () => {},
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'tryBuildAiFlagDeliveryPlan'), context);

const carrier = (carriedFlagId) => ({ id: 'p1', color: 'blue', x: 200, y: 0, carriedFlagId });
const plan = (plane, opts, base, boosted) => {
  baseRangeMove = base;
  boostedMove = boosted;
  return context.tryBuildAiFlagDeliveryPlan(plane, opts);
};
const reaching = { landing: { x: 5, y: 5 }, totalDist: 300, bounceCount: 0, routeClass: 'direct' };
const farMiss = { landing: { x: 500, y: 0 }, totalDist: 600, bounceCount: 0, routeClass: 'direct' };

// 1. Carrier + base reachable at base range -> top-priority delivery, no fuel.
const p1 = plan(carrier('green1'), { flagsMode: true, readyCargoCount: 2 }, reaching, null);
assert(p1 && p1.planTier === -1, '1: a reachable carrier should get a planTier -1 delivery.');
assert(p1.goalName === 'return_with_flag' && p1.decisionReason === 'return_with_flag_deliver',
  '1b: the delivery plan should be a no-fuel return_with_flag.');

// 2. Not flags mode -> null.
assert(plan(carrier('green1'), { flagsMode: false }, reaching, null) === null, '2: no delivery outside flags mode.');

// 3. Not carrying a flag -> null.
assert(plan(carrier(null), { flagsMode: true }, reaching, null) === null, '3: no flag, no delivery.');

// 4. Carrying our OWN-coloured flag (not the enemy green) -> null.
assert(plan(carrier('blue1'), { flagsMode: true }, reaching, null) === null, '4: only the enemy (green) flag scores.');

// 5. Base out of base range but a DIRECT fuel-boosted route reaches -> delivery with fuel.
const p5 = plan(carrier('green1'), { flagsMode: true }, farMiss, reaching);
assert(p5 && p5.planTier === -1 && p5.decisionReason === 'return_with_flag_deliver_fuel',
  '5: a direct fuel-boosted reach should deliver with fuel.');

// 6. Base unreachable even with fuel -> null.
assert(plan(carrier('green1'), { flagsMode: true }, farMiss, farMiss) === null,
  '6: no delivery when even the boosted route falls short.');

// 7. Boosted route reaches but via a RICOCHET (bounce) -> NOT trusted -> null.
const ricochetReach = { landing: { x: 5, y: 5 }, totalDist: 1100, bounceCount: 2, routeClass: 'ricochet' };
assert(plan(carrier('green1'), { flagsMode: true }, farMiss, ricochetReach) === null,
  '7: a ricochet fuel-boosted reach is not trusted to deliver.');

console.log('Smoke test passed: a flag carrier that can reach base delivers at top priority (fuel only on a direct over-range reach); otherwise normal logic runs.');
