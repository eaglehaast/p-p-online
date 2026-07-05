#!/usr/bin/env node
'use strict';

// Smoke test: buildAiMineEscapeMove — the "slip out of a mine trap" fallback, made
// PURPOSEFUL. When a player boxes the AI in with mines and every sensible move is
// rejected for crossing one, the escape must not shuffle in empty space and re-escape
// forever. It picks a MINE-FREE hop that, ideally, OPENS a mine-free in-range firing
// line onto a real objective (enemy / cargo / flag) — so next turn the normal planner
// takes that shot ("get out, then keep playing"). When no line can open this turn it
// advances toward the fight instead of shuffling. It flags a tight thread so precision
// can be spent, and returns null only when every sampled direction is sealed.

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
  cargoState: [],
  getDistanceFromPointToSegment,
  getPlaneEffectiveRangePx: () => 600,
  getBaseAnchor: (color) => (color === 'blue' ? { x: 180, y: 31 } : { x: 180, y: 609 }),
  getCargoVisualCenter: (c) => c.center || { x: c.x, y: c.y },
  isPathClear: () => true,
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

// 1. Mines below + left of the plane; a mine-free escape exists.
context.cargoState = [];
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

// 4. PURPOSEFUL ESCAPE (aiDumpBadMove, turn 17 shape + an enemy): blue #7 is pinned
//    against the TOP wall by a wall of green mines with a gap in the middle, and an
//    enemy sits below the gap in open field. The escape must reposition DOWN through
//    the gap to a spot from which a mine-free line onto that enemy OPENS — not shuffle
//    laterally along the top wall.
const pinnedPlane = { x: 133, y: 48, color: 'blue' };
context.cargoState = [];
context.mines = [
  { owner: 'green', x: 66, y: 96 }, { owner: 'green', x: 130, y: 106 },
  { owner: 'green', x: 225, y: 110 }, { owner: 'green', x: 291, y: 105 },
];
const enemyBelowGap = { x: 180, y: 300, isAlive: true };
const escLane = context.buildAiMineEscapeMove(pinnedPlane, { enemies: [enemyBelowGap] });
assert(escLane && escLane.decisionReason === 'mine_escape_reposition', '4: an escape is found for the pinned plane.');
assert(escLane.opensLane === true, '4b: the escape lands where a mine-free firing line onto the enemy OPENS (purposeful, not a shuffle).');
assert(escLane.landingY > pinnedPlane.y + 40, '4c: it repositions DOWN toward the enemy, not laterally along the top wall.');
assert(pathCrosses(pinnedPlane, escLane) === false, '4d: the reposition hop itself does NOT cross a mine.');

// 5. ADVANCE, DON'T SHUFFLE: same pin but NO objectives to line up (no enemies / cargo /
//    flags). With nothing to open a line onto, the escape must still advance toward the
//    fight (the enemy base is to the south) instead of shuffling in place.
const escAdvance = context.buildAiMineEscapeMove(pinnedPlane, { enemies: [] });
assert(escAdvance && escAdvance.opensLane === false, '5: no objective -> no lane opened, but an escape is still made.');
assert(escAdvance.landingY > pinnedPlane.y + 40, '5b: with nothing to line up, the escape ADVANCES toward the fight (south), not a shuffle.');
assert(pathCrosses(pinnedPlane, escAdvance) === false, '5c: the advance hop itself does NOT cross a mine.');

// 6. THREAD FLAG: squeezing past the pinning mines is flagged (precision spent). The
//    down-through-the-gap escape passes a mine within trigger+margin.
assert(escLane.threadsMineGap === true, '6: squeezing past the pinning mines is flagged as a tight thread (so precision is spent).');

// 7. ROOMY escape (a single distant mine, plenty of clearance) is NOT flagged as a
//    tight thread -> precision is not wasted when the corridor is roomy.
const openPlane = { x: 180, y: 150, color: 'blue' };
context.cargoState = [];
context.mines = [{ owner: 'green', x: 180, y: 470 }];
const escOpen = context.buildAiMineEscapeMove(openPlane, { enemies: [] });
assert(escOpen && escOpen.threadsMineGap === false, '7: a roomy escape far from any mine is not flagged as a tight thread.');

console.log('Smoke test passed: buildAiMineEscapeMove repositions to OPEN a firing lane (or advances toward the fight when it cannot), stays mine-free, flags a tight thread for precision, and returns null only when fully sealed.');
