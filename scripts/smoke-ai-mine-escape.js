#!/usr/bin/env node
'use strict';

// Smoke test: buildAiMineEscapeMove — the "slip out of a mine trap" fallback.
// When a player seals the AI in with mines and every sensible move is rejected for
// crossing one, the AI should take the safest MINE-FREE hop instead of ramming a
// mine on a blind fallback. Best-effort: it returns a mine-free reposition when any
// direction is open, and null only when every sampled direction is sealed.

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
  mines: [],
  getDistanceFromPointToSegment,
  getPlaneEffectiveRangePx: () => 600,
  getBaseAnchor: (color) => (color === 'blue' ? { x: 180, y: 31 } : { x: 180, y: 609 }),
  // straight sampled hop along the (unit) direction at the given scale.
  simulateAIShot: (plane, lv, _opts) => {
    const dist = 600 * (Number.isFinite(lv.scale) ? lv.scale : 1);
    const path = [];
    for(let d = 0; d <= dist; d += 20){ path.push({ x: plane.x + lv.dx * d, y: plane.y + lv.dy * d }); }
    if(path.length < 2) path.push({ x: plane.x + lv.dx * dist, y: plane.y + lv.dy * dist });
    return { predictedPath: path };
  },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'doesFlightPathCrossMine'), context);
vm.runInContext(extractFunctionSource(source, 'buildAiMineEscapeMove'), context);

const plane = { x: 180, y: 320, color: 'blue' };
const pathCrosses = (move) =>
  context.doesFlightPathCrossMine([{ x: plane.x, y: plane.y }, { x: move.landingX, y: move.landingY }], plane);

// 1. Mines below + left of the plane; up/right open -> a mine-free escape exists.
context.mines = [
  { owner: 'green', x: 180, y: 360 }, { owner: 'green', x: 180, y: 400 }, { owner: 'green', x: 180, y: 440 },
  { owner: 'green', x: 100, y: 320 }, { owner: 'green', x: 60, y: 320 },
];
const esc = context.buildAiMineEscapeMove(plane, {});
assert(esc && Number.isFinite(esc.landingX) && Number.isFinite(esc.landingY), '1: an escape move is found when a direction is open.');
assert(esc.decisionReason === 'mine_escape_reposition', '1b: it is tagged as a mine escape.');
assert(pathCrosses(esc) === false, '1c: the escape hop itself does NOT cross a mine.');

// 2. FULLY SEALED: a mine planted straight down every sampled 30 deg direction ->
//    every hop rams its own mine -> no escape.
context.mines = [];
for(let deg = 0; deg < 360; deg += 30){
  const r = deg * Math.PI / 180;
  context.mines.push({ owner: 'green', x: plane.x + Math.cos(r) * 100, y: plane.y + Math.sin(r) * 100 });
}
assert(context.buildAiMineEscapeMove(plane, {}) === null, '2: fully sealed in -> no escape (null), caller keeps its move.');

// 3. No mines -> nothing to escape.
context.mines = [];
assert(context.buildAiMineEscapeMove(plane, {}) === null, '3: no mines, no escape move.');

// 4. The escape leans AWAY from the mines: with a wall of mines only to the south,
//    the chosen landing is not deeper south than the plane.
context.mines = [
  { owner: 'green', x: 140, y: 380 }, { owner: 'green', x: 180, y: 380 }, { owner: 'green', x: 220, y: 380 },
];
const esc4 = context.buildAiMineEscapeMove(plane, {});
assert(esc4 && esc4.landingY <= plane.y + 1, '4: the escape does not dive deeper into the mine wall to the south.');

console.log('Smoke test passed: buildAiMineEscapeMove finds a safe mine-free reposition when a direction is open, leans away from mines / toward base, and returns null only when fully sealed.');
