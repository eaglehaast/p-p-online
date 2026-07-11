#!/usr/bin/env node
'use strict';

// Smoke test: best-effort attack ATTEMPT.
//
// The AI used to offer an attack ONLY when its own sim CONFIRMED a kill
// (`buildSimulatedEnemyCandidate` returned null unless `sim.hitTarget`). When the search
// missed a hard, deep brick-threading ricochet, no attack candidate existed at all and the
// plane degraded to passive play — hold center, or grab an exposed cargo and sit under the
// enemy's guns. Per the user: "если он попытается но промахнется — не страшно… нам нужно
// симулировать хорошего противника, а не убийцу." So a near-miss now comes back as a
// purposeful ATTEMPT, gated on two pure pieces this test exercises:
//
//   1. getSimPathClosestApproachToPoint — how close the flown path ever came to the enemy.
//      Only a path that actually passes near the enemy (within
//      AI_BEST_EFFORT_ATTEMPT_MAX_APPROACH_PX) counts as "trying to hit it", not a random lob.
//   2. shouldKeepBestEffortAttemptOverCargo — a purposeful attempt is KEPT over a cargo grab
//      ONLY when that cargo would land exposed above the allowed risk AND the attempt lands no
//      more exposed. A SAFE cargo still wins (no artificial attack-over-cargo preference).

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

function extractConstNumber(source, name){
  // Handles `const NAME = <expr>;` where <expr> may reference CELL_SIZE etc.
  const re = new RegExp(`const ${name}\\s*=\\s*([^;]+);`);
  const m = source.match(re);
  if(!m) throw new Error(`Const not found in script.js: ${name}`);
  return m[1].trim();
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const context = { Math, Number, CELL_SIZE: 20, AI_ATTACK_LANDING_RISK_DEMOTE: 0.8 };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getDistanceFromPointToSegment'), context);
vm.runInContext(extractFunctionSource(source, 'getSimPathClosestApproachToPoint'), context);
vm.runInContext(extractFunctionSource(source, 'shouldKeepBestEffortAttemptOverCargo'), context);
// The near-miss threshold constant, evaluated in the same context (it references CELL_SIZE).
vm.runInContext(`var __MAX_APPROACH = ${extractConstNumber(source, 'AI_BEST_EFFORT_ATTEMPT_MAX_APPROACH_PX')};`, context);

const closest = (path, point) => context.getSimPathClosestApproachToPoint(path, point);
const keep = (cargoRisk, attemptRisk, allowed) => context.shouldKeepBestEffortAttemptOverCargo(cargoRisk, attemptRisk, allowed);
const MAX_APPROACH = context.__MAX_APPROACH;

// ---------------------------------------------------------------------------
// 1. getSimPathClosestApproachToPoint — min distance across ALL path segments.
// ---------------------------------------------------------------------------
const enemy = { x: 100, y: 100 };

// A straight path that passes exactly 8px to the side of the enemy -> ~8.
const grazing = [{ x: 0, y: 108 }, { x: 200, y: 108 }];
assert(Math.abs(closest(grazing, enemy) - 8) < 1e-6, '1: a grazing path reports its 8px side clearance.');

// The closest approach can be on a LATER (bounced) segment, not the first — a ricochet
// that only nears the enemy after banking must still be measured correctly.
const bounced = [
  { x: 0, y: 0 },       // segment 1: far from the enemy
  { x: 300, y: 0 },
  { x: 300, y: 100 },   // segment 3 passes at x=300, still far
  { x: 100, y: 100 },   // segment 3 END lands ON the enemy
];
assert(closest(bounced, enemy) < 1e-6, '2: closest approach is found on a LATER segment (the ricochet leg).');

// A path that never comes near the enemy -> large distance (NOT a purposeful attempt).
const faraway = [{ x: 0, y: 500 }, { x: 200, y: 520 }];
assert(closest(faraway, enemy) > 300, '3: a path far from the enemy reports a large approach.');

// Degenerate inputs never throw and never masquerade as a hit.
assert(closest(null, enemy) === Number.POSITIVE_INFINITY, '4: null path -> +Infinity (no attempt).');
assert(closest([{ x: 0, y: 0 }], enemy) === Number.POSITIVE_INFINITY, '4b: a single point is not a segment.');

// ---------------------------------------------------------------------------
// 1b. Threshold wiring: a grazing near-miss is within the "attempt" window, a far
//     miss is outside it. This is exactly the gate buildSimulatedEnemyCandidate applies.
// ---------------------------------------------------------------------------
assert(MAX_APPROACH >= 40 && MAX_APPROACH <= 140,
  `1b: the near-miss threshold is a sane recognizable window (got ${MAX_APPROACH}).`);
assert(closest(grazing, enemy) <= MAX_APPROACH, '1c: an 8px near-miss counts as a purposeful attempt.');
assert(closest(faraway, enemy) > MAX_APPROACH, '1d: a far miss is rejected (not aimed at the enemy).');

// ---------------------------------------------------------------------------
// 2. shouldKeepBestEffortAttemptOverCargo — safety-driven carve-out.
// ---------------------------------------------------------------------------
const allowed = 0.5;

// The flagged scenario: cargo parks the plane EXPOSED (0.9 > 0.5) while the attempt is not
// more exposed (0.6 <= 0.9) -> KEEP the purposeful attempt over the exposed cargo grab.
assert(keep(0.9, 0.6, allowed) === true,
  '2: a purposeful attempt is kept over a cargo grab that would land exposed.');

// A SAFE cargo (risk within the allowed bar) always wins — no attack-over-cargo preference.
assert(keep(0.4, 0.1, allowed) === false, '2b: a SAFE cargo grab still overrides the attempt.');
assert(keep(0.5, 0.1, allowed) === false, '2c: a cargo exactly at the allowed bar is not "exposed".');

// The attempt must not be a WORSE landing than the cargo it displaces — if the attempt is
// even more exposed than the (exposed) cargo, don't keep it; grabbing the box is no worse.
assert(keep(0.7, 0.95, allowed) === false,
  '2d: an attempt MORE exposed than the exposed cargo is not kept (no gain).');

// Equal exposure -> keep the attempt (it at least TRIES the enemy; the box is a wash on safety).
assert(keep(0.8, 0.8, allowed) === true, '2e: equal exposure keeps the purposeful attempt.');

// Robust to non-finite attempt risk (treated as 0, the safest reading).
assert(keep(0.9, undefined, allowed) === true, '2f: a missing attempt risk is treated as safe (0).');

console.log('Smoke test passed: a near-miss becomes a purposeful best-effort attempt (getSimPathClosestApproachToPoint gates "did it actually try to hit the enemy"), and shouldKeepBestEffortAttemptOverCargo keeps that attempt over ONLY an exposed cargo grab — a safe cargo still wins.');
