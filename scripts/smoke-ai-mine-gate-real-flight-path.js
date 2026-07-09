#!/usr/bin/env node
'use strict';

// Smoke test: getRicochetFlightMineThreatMeta — the launch gate must see a mine on the
// BENT part of a ricochet's real flight, which the straight start->landing check misses.
// The gate simulated the shot with few bounces and stopped at the target, so the plane
// flew its full bounced range PAST the target and self-detonated on a mine nobody checked.
// This helper re-simulates the real bounced flight (via simulateAIShot, mocked here to
// supply a known bent path) and folds the per-segment mine threat over ALL mines. It is a
// no-op when there are no mines on the field.

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

function getDistanceFromPointToSegment(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const source = fs.readFileSync('script.js', 'utf8');

const plane = { x: 0, y: 0, color: 'blue', activeTurnBuffs: {} };
const context = {
  Math, Number, Array, Boolean,
  FIELD_FLIGHT_DURATION_SEC: 1.5,
  MINE_TRIGGER_RADIUS: 28,
  AI_FLIGHT_MINE_GATE_MAX_BOUNCES: 6,
  mineSizeRuntime: { LOGICAL_PX: 22 },          // radius 11
  mineTriggerRuntime: { WING_HALF_SPAN_PX: 18 },// bare trigger 11 + 18 = 29
  PLANE_GEOMETRY_TRUTH: { BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96 },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings' },
  planeHasActiveTurnBuff: (p, type) => Boolean(p?.activeTurnBuffs?.[type]),
  getDistanceFromPointToSegment,
  getPlaneEffectiveRangePx: () => 600,
  mines: [],
  mockPath: null,
  // Mocked: returns the bent path the caller wants to test, regardless of launch vector.
  simulateAIShot: () => ({ predictedPath: context.mockPath }),
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getMineEffectiveTriggerRadius'), context);
vm.runInContext(extractFunctionSource(source, 'getMineThreatMetaForSegment'), context);
vm.runInContext(extractFunctionSource(source, 'getRicochetFlightMineThreatMeta'), context);

// An L-shaped bounced path: right along y=0, then up along x=200. The straight
// start->end line (0,0)->(200,200) is the diagonal; a mine on the vertical leg sits ~70px
// off that diagonal, so a straight-segment check would MISS it.
context.mockPath = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }];
const call = () => context.getRicochetFlightMineThreatMeta(plane, 100, 100);

// Sanity: the straight diagonal is far from the mine on the bent leg.
assert(getDistanceFromPointToSegment(200, 100, 0, 0, 200, 200) > 40,
  'setup: the bent-leg mine is well off the straight start->end diagonal (a straight check misses it).');

// 1. THE FIX: a mine on the BENT leg (200,100) is detected as a path hit.
context.mines = [{ owner: 'green', x: 200, y: 100 }];
const r1 = call();
assert(r1 && r1.pathHit === true, '1: a mine on the ricochet bent leg is caught (pathHit) even though the straight check would miss it.');
assert(r1.viaRicochetFlight === true, '1b: the result is tagged as coming from the real bounced-flight check.');

// 2. An ENEMY mine is caught too (owner-agnostic) — same as above but assert ownerless.
context.mines = [{ owner: 'green', x: 200, y: 105 }];
assert(call()?.pathHit === true, '2: an enemy (green) mine on the bent path is caught (owner-agnostic).');

// 3. A mine well off the whole path -> no threat.
context.mines = [{ owner: 'green', x: 500, y: 500 }];
assert(call() === null, '3: a mine off the entire bounced path is not flagged.');

// 4. No mines on the field -> no-op (only check when mines exist).
context.mines = [];
assert(call() === null, '4: with no mines on the field the check is a no-op (returns null).');

// 5. A mine at the FINAL landing endpoint (200,200) -> landingThreat.
context.mines = [{ owner: 'green', x: 200, y: 200 }];
const r5 = call();
assert(r5 && r5.landingThreat === true, '5: a mine at the final landing endpoint is flagged as a landing threat.');

// 6. A degenerate / missing path -> null (no crash).
context.mockPath = [{ x: 0, y: 0 }];
context.mines = [{ owner: 'green', x: 0, y: 0 }];
assert(call() === null, '6: a path with fewer than two points yields no threat (no crash).');

console.log('Smoke test passed: getRicochetFlightMineThreatMeta catches a mine on the real bounced flight (bent leg or landing, own or enemy) that the straight start->landing check misses, and is a no-op with no mines.');
