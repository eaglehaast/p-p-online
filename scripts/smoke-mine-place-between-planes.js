#!/usr/bin/env node
'use strict';

// Smoke test: isMinePlacementValid — a mine may NOT be placed where it would instantly
// detonate a plane. Stationary planes detonate mines too (handleMineForPlane runs on
// parked planes every frame, firing on any mine within getMineEffectiveTriggerRadius), so
// the placement clearance is COUPLED to each plane's actual detonation trigger: a spot
// within (or exactly on) that radius of ANY alive plane — yours or the enemy's — is
// rejected. A mine can still be WEDGED between parked planes where it is geometrically
// safe: a 59px hangar gap leaves the ~29.5px midpoint just OUTSIDE the 29px bare trigger.
// Wings widen a plane's trigger (to 59px), so placements near a winged plane are rejected
// out to that wider radius.

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

// Two parked planes 59px apart (the standard hangar gap), plus permissive mocks for every
// non-plane check so only the plane-clearance rule is exercised. getMineEffectiveTriggerRadius
// returns the real triggers: 29px bare, 59px with wings.
const context = {
  Math, Number,
  MINE_PLACEMENT_MIN_DISTANCE: 24,
  MINE_PLACEMENT_PLANE_CLEARANCE: 29,
  MINE_VISUAL_RADIUS: 11,
  getMineEffectiveTriggerRadius: (plane) => (plane?.activeTurnBuffs?.wings ? 59 : 29),
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

// 1. The wedge still works where it is SAFE: the midpoint between the two 59px-apart planes
//    is 29.5px from each — just outside the 29px trigger — so it is placeable and will not
//    detonate them.
assert(valid(91.5, 592) === true, '1: a mine still fits at the safe midpoint between two parked planes (29.5px > 29px trigger).');

// 2. THE FIX: a mine 20px from a plane (inside its 29px trigger) is now REJECTED — placing
//    it there would instantly detonate the plane. (This was wrongly allowed before.)
assert(valid(62 + 20, 592) === false, '2: a mine cannot be placed within a plane detonation trigger (20px < 29px) — it would instantly blow it up.');

// 3. Dropped ON a plane center is rejected.
assert(valid(62, 592) === false, '3: a mine cannot be placed on a plane center.');

// Isolate a single bare plane to probe the trigger boundary cleanly.
context.points = [{ x: 200, y: 300, isAlive: true, burning: false }];

// 4. Inside the trigger (25px) -> rejected.
assert(valid(225, 300) === false, '4: a mine 25px away (inside the 29px trigger) is rejected.');

// 5. Just outside the trigger (30px) -> allowed.
assert(valid(230, 300) === true, '5: a mine 30px away (just outside the 29px trigger) is allowed.');

// 6. Exactly ON the trigger (29px) -> rejected, because a mine at exactly the trigger
//    distance DOES detonate (handleMineForPlane fires on dist <= trigger).
assert(valid(229, 300) === false, '6: a mine exactly on the trigger boundary (29px) is rejected (it would fire).');

// 7. A destroyed/burning plane does not block placement.
context.points = [{ x: 91.5, y: 592, isAlive: false, burning: true }];
assert(valid(91.5, 592) === true, '7: a destroyed/burning plane does not block placement.');

// 8. Wings widen a plane's trigger to 59px, so the no-instant-detonation rule extends with
//    it: a mine 40px from a winged plane is rejected (safe for a bare plane, not a winged
//    one), while 60px clears.
context.points = [{ x: 200, y: 300, isAlive: true, burning: false, activeTurnBuffs: { wings: true } }];
assert(valid(240, 300) === false, '8: near a WINGED plane (59px trigger), a mine 40px away is rejected.');
assert(valid(260, 300) === true, '8b: beyond the winged 59px trigger (60px), placement is allowed.');

console.log('Smoke test passed: isMinePlacementValid couples placement to the real detonation trigger — no placement can instantly detonate a plane (bare or winged) — while the between-planes wedge still works at the safe midpoint.');
