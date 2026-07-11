#!/usr/bin/env node
'use strict';

// Smoke test: a dynamite replan must NOT clobber a working ricochet KILL.
//
// Bug (from an aiDumpBadMove): blue #6 lined up a 2-bounce ricochet that HITS the green
// intruder (predictedOutcome "target_hit_after_ricochet"). The inventory layer then spent a
// dynamite to "clear a path" and REPLANNED the flight as a direct route — which lands ~53px
// SHORT of the target. The replan was accepted because the acceptance test compared the
// replanned route's distance-to-destination against `selectedPlan.landingX/Y` — but for a
// ricochet that landing is the launch vector projected STRAIGHT, which lands OFF-FIELD
// (x = -152!), NOT where the plane actually goes. So a working kill (real impact ON the
// enemy) looked "309px from the destination" and a short direct miss (53px) won "closerToDest".
// Result: blow the wall, then недолететь до цели.
//
// getAiReplanOriginalEndpoint judges the original plan by where it REALLY ends: a shot that
// hits its target ends at that target, not its off-field straight-line projection. Then the
// replan can only win by a genuine score improvement, never by a bogus "closer" short miss.

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
const context = { Math, Number };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getAiReplanOriginalEndpoint'), context);
const endpoint = (plan) => context.getAiReplanOriginalEndpoint(plan);

const CELL_SIZE = 20;
// The acceptance rule as implemented in the scheduler, reproduced against the helper's output.
const closerToDest = (plan, finalDest, newLanding) => {
  const orig = endpoint(plan);
  const distOld = Math.hypot(orig.x - finalDest.x, orig.y - finalDest.y);
  const distNew = Math.hypot(newLanding.x - finalDest.x, newLanding.y - finalDest.y);
  return distNew < distOld - CELL_SIZE;
};

// --- The exact dump scenario ---------------------------------------------------------------
// A ricochet that HITS the green intruder. Straight-line landing is OFF-FIELD.
const ricochetHit = {
  predictedOutcome: 'target_hit_after_ricochet',
  targetPoint: { x: 157.29, y: 282.63 },
  landingX: -152.1, landingY: 292.6,   // launch vector projected straight -> off-field
};
const finalDest = { x: 157.29, y: 282.63 }; // dynamite's finalDestination = the target enemy
const replanShortMiss = { x: 175.6, y: 232.8 }; // direct route, ~53px SHORT of the target

// 1. The helper returns the TARGET the shot hits, not the off-field projection.
const end = endpoint(ricochetHit);
assert(Math.abs(end.x - 157.29) < 1e-6 && Math.abs(end.y - 282.63) < 1e-6,
  '1: a hitting ricochet ends at the enemy it hits, not its off-field straight-line landing.');

// 2. The core fix: the short replan is NOT "closer to dest" than a shot that already hits.
assert(closerToDest(ricochetHit, finalDest, replanShortMiss) === false,
  '2: a direct replan that lands SHORT does not beat a ricochet that already HITS the target.');

// 2b. With the OLD (buggy) logic — using the off-field landing — it WOULD have looked closer.
//     Guards against a regression back to comparing the straight-line projection.
const buggyDistOld = Math.hypot(ricochetHit.landingX - finalDest.x, ricochetHit.landingY - finalDest.y);
const buggyDistNew = Math.hypot(replanShortMiss.x - finalDest.x, replanShortMiss.y - finalDest.y);
assert(buggyDistNew < buggyDistOld - CELL_SIZE,
  '2b: (sanity) the OLD projection-based compare WAS fooled — confirming the bug the fix removes.');

// --- The legitimate replan must still work -------------------------------------------------
// 3. A plan that does NOT reach its destination (blocked, range_end) is judged by its real
//    landing, so a dynamite route that genuinely gets closer is still accepted.
const blockedPlan = {
  predictedOutcome: 'range_end',
  targetPoint: { x: 300, y: 300 },
  landingX: 100, landingY: 100,   // stopped far from the destination (a wall blocked it)
};
const destBehindWall = { x: 300, y: 300 };
const replanReaches = { x: 290, y: 300 }; // dynamite cleared the wall -> route now nearly reaches
assert(closerToDest(blockedPlan, destBehindWall, replanReaches) === true,
  '3: a genuine path-opening replan (blocked plan gets far closer) is still accepted.');

// 4. A non-hitting plan uses its landing (no targetPoint hijack).
const cargoMove = { predictedOutcome: 'range_end', landingX: 42, landingY: 84 };
const e4 = endpoint(cargoMove);
assert(e4.x === 42 && e4.y === 84, '4: a non-hitting plan ends at its straight-line landing.');

// 5. A direct HIT (no ricochet) also ends at its target — same protection, no bounce needed.
const directHit = { predictedOutcome: 'target_hit_direct', targetPoint: { x: 200, y: 200 }, landingX: 400, landingY: 400 };
const e5 = endpoint(directHit);
assert(e5.x === 200 && e5.y === 200, '5: a direct hit is judged by the target too (not ricochet-specific).');

console.log('Smoke test passed: getAiReplanOriginalEndpoint judges a plan by where it really ends — a hitting shot by the enemy it hits — so a dynamite replan can no longer replace a working ricochet KILL with a direct route that falls short; genuine path-opening replans still work.');
