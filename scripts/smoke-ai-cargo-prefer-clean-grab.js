#!/usr/bin/env node
'use strict';

// Smoke test: getAiCargoPlanDistance — cross-plane cargo ranking prefers a CLEAN direct
// grab over a convoluted bouncy one. A "gap"-class bounce route to a cargo reports an
// unreliable (often tiny) totalDist; ranking by that made a 2-bounce grab by one plane
// sort AHEAD of a clean direct grab by another (cross-plane sort is by planDistance).
// From a real caught move (aiDumpBadMove, turn 2): plane #5 took a 1-2 bounce grab of a
// nearer cargo (~239px) while plane #7 had a dead-center DIRECT grab of a farther cargo
// (~360px) — the clean, purposeful move. Ranking by real distance + a per-bounce penalty
// makes the clean grab win.

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
const context = { Math, Number, CELL_SIZE: 20, AI_CARGO_BOUNCE_DISTANCE_PENALTY: 160 };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getAiCargoPlanDistance'), context);
const D = context.getAiCargoPlanDistance;

// A clean (0-bounce) grab ranks at exactly its distance.
assert(D(360, 0) === 360, '1: a clean direct grab ranks at its straight-line distance.');
// Each bounce adds the penalty.
assert(D(239, 1) === 239 + 160, '2: one bounce adds the penalty.');
assert(D(239, 2) === 239 + 320, '2b: two bounces add twice the penalty.');

// THE CAUGHT CASE: plane #7 clean grab of a farther cargo (360, 0 bounce) must rank
// BELOW (win over) plane #5 bouncy grab of a nearer cargo (239, 1-2 bounces).
assert(D(360, 0) < D(239, 1), '3: a clean direct grab beats a 1-bounce grab of a nearer cargo.');
assert(D(360, 0) < D(239, 2), '3b: ...and beats a 2-bounce grab of a nearer cargo.');

// A bounce grab still wins when the cargo is MUCH closer than the nearest clean grab
// (the penalty is a threshold, not an absolute veto of bounces).
assert(D(120, 1) < D(360, 0), '4: a bounce grab of a MUCH-closer cargo still wins (bounces are not vetoed).');

// Degenerate inputs are handled.
assert(D(undefined, 0) === 0 && D(200, undefined) === 200, '5: non-finite inputs are clamped, not NaN.');
assert(D(-50, -1) === 0, '5b: negatives are clamped to zero.');

console.log('Smoke test passed: getAiCargoPlanDistance ranks cargo grabs by real distance + a per-bounce penalty, so a clean direct grab beats a convoluted bouncy one unless the bouncy cargo is much closer.');
