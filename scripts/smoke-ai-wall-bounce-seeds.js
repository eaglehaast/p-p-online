#!/usr/bin/env node
'use strict';

// Smoke test: computeAiWallBounceSeeds — analytic "bank shot" seeds for the shot search.
// The coarse 6deg angle grid can straddle a narrow ricochet window, so a clean 1-2
// bounce bank off a side wall (a shot a human would just "bank off the wall") gets
// missed and the AI degrades to a passive center move. This helper computes the EXACT
// launch angle for a 1-bounce (and 2-bounce corner) reflection off the outer walls via
// the mirror method, fed as refinement seeds so the real sim polishes the true angle.
// Reflect line = playable edge (field + border) + POINT_RADIUS (where the plane CENTER
// bounces). Out-of-range banks are dropped.

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

const context = {
  Math, Number,
  POINT_RADIUS: 13.5,
  WORLD: { width: 360, height: 640 },
  FIELD_LEFT: 0, FIELD_TOP: 0, FIELD_WIDTH: 360, FIELD_HEIGHT: 640,
  FIELD_BORDER_OFFSET_X: 20, FIELD_BORDER_OFFSET_Y: 20,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'computeAiWallBounceSeeds'), context);

const deg = (rad) => (rad * 180 / Math.PI + 360) % 360;

// plane top-right, target near the LEFT wall (a left-wall bank is the natural shot).
const plane = { x: 300, y: 100 };
const target = { x: 60, y: 300 };
const range = 600;
const seeds = context.computeAiWallBounceSeeds(plane, target, range);

// Reflect lines: xL = 0+20+13.5 = 33.5. Left-wall mirror of target = (2*33.5-60, 300) = (7,300).
// angle = atan2(300-100, 7-300) = atan2(200,-293) ~ 145.7deg, scale = hypot(293,200)/600 ~ 0.591.
const leftBank = seeds.find((s) => Math.abs(deg(s.angle) - 145.7) < 1.5);
assert(leftBank, '1: a 1-bounce LEFT-wall bank seed is produced aimed at the wall mirror (~145.7deg).');
assert(Math.abs(leftBank.scale - 0.591) < 0.02, `1b: its power (scale) matches the bank path length (~0.591), got ${leftBank.scale.toFixed(3)}.`);

// Every seed is a real, in-range shot (scale in (0.05, 1]).
assert(seeds.length >= 3, '2: several bank seeds are produced (1-bounce walls + 2-bounce corners).');
assert(seeds.every((s) => s.scale > 0.05 && s.scale <= 1.0 && Number.isFinite(s.angle)),
  '2b: every seed is within flight range (scale in (0.05, 1]) with a finite angle.');

// The bottom-wall bank for this geometry is OUT of range (mirror at y=913 -> scale ~1.41)
// and must be filtered: no seed should aim steeply DOWN toward a >range mirror.
assert(!seeds.some((s) => s.scale > 1.0), '3: an out-of-range bank (bottom wall here) is dropped, not seeded.');

// A far target where EVERY wall mirror is out of range -> no seeds (nothing to bank onto).
const farSeeds = context.computeAiWallBounceSeeds({ x: 30, y: 300 }, { x: 330, y: 300 }, 90);
assert(farSeeds.length === 0, '4: when all wall banks exceed flight range, no seeds are produced.');

// Degenerate inputs are handled.
assert(context.computeAiWallBounceSeeds(null, target, range).length === 0, '5: null plane -> no seeds.');
assert(context.computeAiWallBounceSeeds(plane, target, 0).length === 0, '5b: non-positive range -> no seeds.');

console.log('Smoke test passed: computeAiWallBounceSeeds emits exact 1-bounce (and 2-bounce corner) wall-bank launch angles within flight range, and drops out-of-range banks.');
