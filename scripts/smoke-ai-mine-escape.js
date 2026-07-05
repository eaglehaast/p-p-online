#!/usr/bin/env node
'use strict';

// Smoke test: buildAiMineEscapeMove — the "slip out of a mine trap" fallback.
// When a player seals the AI in with mines and every sensible move is rejected for
// crossing one, the AI should take the safest MINE-FREE hop toward the most OPEN
// spot (far from BOTH mines and field walls) — so it actually BREAKS OUT of the trap
// instead of shuffling along the wall it is pinned to. It returns a mine-free
// reposition when any direction is open, null only when every sampled direction is
// sealed, and flags threadsMineGap when the winning hop squeezes through a tight
// corridor (so precision can be spent to keep aim spread from nudging it into a mine).

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
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

const source = fs.readFileSync('script.js', 'utf8');

const context = {
  Math, Number, Array,
  FIELD_FLIGHT_DURATION_SEC: 1.5,
  MINE_TRIGGER_RADIUS: 28,
  AI_MINE_ESCAPE_THREAD_MARGIN_PX: 22,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  FIELD_WIDTH: 360,
  FIELD_HEIGHT: 640,
  WORLD: { width: 360, height: 640 },
  mines: [],
  getDistanceFromPointToSegment,
  getPlaneEffectiveRangePx: () => 600,
  getBaseAnchor: (color) => (color === 'blue' ? { x: 180, y: 31 } : { x: 180, y: 609 }),
  // A straight sampled hop that STOPS at the field wall (planes don't fly off-field),
  // so the last point is on-field and wall clearance is meaningful.
  simulateAIShot: (plane, lv, _opts) => {
    const dist = 600 * (Number.isFinite(lv.scale) ? lv.scale : 1);
    const path = [];
    for(let d = 0; d <= dist; d += 20){
      const rawX = plane.x + lv.dx * d;
      const rawY = plane.y + lv.dy * d;
      const cx = Math.max(0, Math.min(360, rawX));
      const cy = Math.max(0, Math.min(640, rawY));
      path.push({ x: cx, y: cy });
      if(cx !== rawX || cy !== rawY) break; // hit a wall — land here
    }
    if(path.length < 2){
      path.push({
        x: Math.max(0, Math.min(360, plane.x + lv.dx * dist)),
        y: Math.max(0, Math.min(640, plane.y + lv.dy * dist)),
      });
    }
    return { predictedPath: path };
  },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'doesFlightPathCrossMine'), context);
vm.runInContext(extractFunctionSource(source, 'buildAiMineEscapeMove'), context);

const centerPlane = { x: 180, y: 320, color: 'blue' };
const pathCrosses = (plane, move) =>
  context.doesFlightPathCrossMine([{ x: plane.x, y: plane.y }, { x: move.landingX, y: move.landingY }], plane);

// 1. Mines below + left of the plane; up/right open -> a mine-free escape exists.
context.mines = [
  { owner: 'green', x: 180, y: 360 }, { owner: 'green', x: 180, y: 400 }, { owner: 'green', x: 180, y: 440 },
  { owner: 'green', x: 100, y: 320 }, { owner: 'green', x: 60, y: 320 },
];
const esc = context.buildAiMineEscapeMove(centerPlane, {});
assert(esc && Number.isFinite(esc.landingX) && Number.isFinite(esc.landingY), '1: an escape move is found when a direction is open.');
assert(esc.decisionReason === 'mine_escape_reposition', '1b: it is tagged as a mine escape.');
assert(pathCrosses(centerPlane, esc) === false, '1c: the escape hop itself does NOT cross a mine.');

// 2. FULLY SEALED: a dense ring of mines (every 10deg at 80px) blocks every sampled
//    direction -> no escape. (Denser than the 15deg fan, so no gap slips through.)
context.mines = [];
for(let deg = 0; deg < 360; deg += 10){
  const r = deg * Math.PI / 180;
  context.mines.push({ owner: 'green', x: centerPlane.x + Math.cos(r) * 80, y: centerPlane.y + Math.sin(r) * 80 });
}
assert(context.buildAiMineEscapeMove(centerPlane, {}) === null, '2: fully sealed in -> no escape (null), caller keeps its move.');

// 3. No mines -> nothing to escape.
context.mines = [];
assert(context.buildAiMineEscapeMove(centerPlane, {}) === null, '3: no mines, no escape move.');

// 4. The escape leans AWAY from the mines: with a wall of mines only to the south,
//    the chosen landing is not deeper south than the plane.
context.mines = [
  { owner: 'green', x: 140, y: 380 }, { owner: 'green', x: 180, y: 380 }, { owner: 'green', x: 220, y: 380 },
];
const esc4 = context.buildAiMineEscapeMove(centerPlane, {});
assert(esc4 && esc4.landingY <= centerPlane.y + 1, '4: the escape does not dive deeper into the mine wall to the south.');

// 5. THE CAUGHT CASE (aiDumpBadMove, turn 17): blue #7 is pinned against the TOP wall
//    with a wall of green mines just below it and its own base above — the OLD scoring
//    pulled it toward the base (into the corner) so it just shuffled laterally along
//    the top. The gap between the two middle mines is the way out. The escape must now
//    thread DOWN through that gap into open field, NOT hug the top wall.
const pinnedPlane = { x: 133, y: 48, color: 'blue' };
context.mines = [
  { owner: 'green', x: 66, y: 96 }, { owner: 'green', x: 130, y: 106 },
  { owner: 'green', x: 225, y: 110 }, { owner: 'green', x: 291, y: 105 },
];
const escBreakout = context.buildAiMineEscapeMove(pinnedPlane, {});
assert(escBreakout && escBreakout.decisionReason === 'mine_escape_reposition', '5: an escape is found for the pinned plane.');
assert(escBreakout.landingY > pinnedPlane.y + 80, '5b: the escape breaks DOWNWARD through the gap toward open field, not laterally along the top wall.');
assert(pathCrosses(pinnedPlane, escBreakout) === false, '5c: the break-out hop itself does NOT cross a mine.');
assert(escBreakout.threadsMineGap === true, '5d: squeezing past the pinning mines is flagged as a tight thread (so precision is spent).');

// 6. Wide-open escape (a single distant mine, plenty of clearance) is NOT flagged as a
//    tight thread -> precision is not wasted when the corridor is roomy.
const openPlane = { x: 180, y: 150, color: 'blue' };
context.mines = [{ owner: 'green', x: 180, y: 470 }];
const escOpen = context.buildAiMineEscapeMove(openPlane, {});
assert(escOpen && escOpen.threadsMineGap === false, '6: a roomy escape far from any mine is not flagged as a tight thread.');

console.log('Smoke test passed: buildAiMineEscapeMove breaks out toward the most OPEN reachable spot (threading a gap when pinned), leans away from mines, flags a tight thread for precision, and returns null only when fully sealed.');
