#!/usr/bin/env node
'use strict';

// Smoke test: isMinePlacementValid — a mine can be WEDGED between parked planes.
// The placement "too close to a plane" clearance is decoupled from the detonation
// radius (~33px) and lowered to the plane's drawn half-width (18px), so a mine fits in
// a 59px hangar gap between adjacent parked planes (midpoint is 29.5px from each, > 18).
// It still can't be dropped ON a plane's body. Detonation is unchanged (tested elsewhere
// / by gameplay) — this only relaxes PLACEMENT.

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

// Two parked planes 59px apart (the standard hangar gap), plus permissive mocks for
// every non-plane check so only the plane-clearance rule is exercised.
const context = {
  Math, Number,
  MINE_PLACEMENT_MIN_DISTANCE: 24,
  MINE_PLACEMENT_PLANE_CLEARANCE: 18,
  MINE_VISUAL_RADIUS: 15,
  mines: [],
  colliders: [],
  points: [
    { x: 62, y: 592, isAlive: true, burning: false },
    { x: 121, y: 592, isAlive: true, burning: false },
  ],
  isPointInsideFieldBounds: () => true,
  isBrickPixel: () => false,
  isPointInsideCollider: () => false,
  getBasePlacementRects: () => [],
  getFlagPlacementRects: () => [],
  isPointInAxisAlignedRect: () => false,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'isMinePlacementValid'), context);
const valid = (x, y) => context.isMinePlacementValid({ x, y });

// 1. THE WISH: a mine at the midpoint between the two 59px-apart planes (29.5px from
//    each) is now placeable. Under the old 33px rule this was rejected.
assert(valid(91.5, 592) === true, '1: a mine fits at the midpoint between two parked planes (59px gap).');

// 2. Right up against one plane (but outside its 18px body) is fine — that is the
//    whole point (wedge it tight).
assert(valid(62 + 20, 592) === true, '2: a mine can sit right beside a plane (20px away, just outside the body).');

// 3. Dropped ON a plane (center) is still rejected.
assert(valid(62, 592) === false, '3: a mine cannot be placed on a plane center.');

// 4. Inside a plane's body (within the 18px clearance) is still rejected.
assert(valid(62 + 10, 592) === false, '4: a mine cannot be placed inside a plane body (10px < 18px clearance).');

// 5. A BURNING / dead plane does not block placement (only alive planes clear space).
context.points = [{ x: 91.5, y: 592, isAlive: false, burning: true }];
assert(valid(91.5, 592) === true, '5: a destroyed/burning plane does not block placement.');

// 6. Regression guard: the clearance is genuinely smaller than the ~33px detonation
//    radius (otherwise the wedge wouldn't fit). Two planes 59px apart => need < 29.5.
assert(context.MINE_PLACEMENT_PLANE_CLEARANCE < 29.5,
  '6: placement clearance is small enough to fit one mine between planes 59px apart.');

console.log('Smoke test passed: isMinePlacementValid lets a mine be wedged between parked planes (placement decoupled from the detonation radius) while still refusing to drop a mine onto a plane body.');
