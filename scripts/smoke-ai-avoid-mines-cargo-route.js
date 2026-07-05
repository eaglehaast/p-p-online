#!/usr/bin/env node
'use strict';

// Smoke test: cargo routes also avoid mines. #2868 covered attack/sweep shots
// (simulateAIShot paths); this covers the CARGO pipeline (buildAiCargoRouteCandidate
// -> planPathToPoint), which threads a "gap" route straight through a mine. From a
// real caught move (aiDumpBadMove, turn 5): blue #4 (62,48) took a cargo_reach gap
// route whose path passes a green mine at (63.42,134.67) directly below it. The
// candidate must flag pathCrossesMine so the selector drops it.

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

let currentPredictedPath = null; // set per scenario
const context = {
  Math, Number, Array, Boolean,
  FIELD_FLIGHT_DURATION_SEC: 1.5,
  MINE_TRIGGER_RADIUS: 28,
  mines: [],
  getDistanceFromPointToSegment,
  planPathToPoint: (plane, tx, ty) => ({ vx: (tx - plane.x) / 1.5, vy: (ty - plane.y) / 1.5, routeClass: 'gap' }),
  getAiPlannedMovePredictedPath: () => currentPredictedPath,
  doesCargoIntersectBeneficialZoneAlongPath: () => true,
  doesCargoIntersectBeneficialZoneAlongSegment: () => true,
  getAiCargoHomeBase: () => ({ x: 180, y: 31 }),
  getCargoVisualCenter: (c) => c.center || { x: c.x, y: c.y },
  dist: (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)),
  evaluateCargoPickupRisk: () => ({ isSafePath: true, totalRisk: 0 }),
  evaluateFavorableCargoCandidate: () => ({ isFavorableCargo: false }),
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'doesFlightPathCrossMine'), context);
vm.runInContext(extractFunctionSource(source, 'buildAiCargoRouteCandidate'), context);

const plane = { x: 62, y: 48, color: 'blue' };
const cargo = { x: 75.41, y: 274.25, center: { x: 90.91, y: 287.75 } };
const routeTarget = { targetX: 90.91, targetY: 287.75, name: 'cargo_reach', targetKind: 'near' };
const build = () => context.buildAiCargoRouteCandidate(plane, cargo, context, routeTarget);

// 1. THE CAUGHT MOVE: a gap route from (62,48) down toward the cargo, and a green
//    mine at (63.42,134.67) sits on that path -> pathCrossesMine.
currentPredictedPath = [{ x: 62, y: 48 }, { x: 33.82, y: 179.17 }, { x: 90.91, y: 287.75 }];
context.mines = [{ id: 'g', owner: 'green', x: 63.42, y: 134.67 }];
const hit = build();
assert(hit && hit.pathCrossesMine === true, '1: a cargo route whose path crosses a mine must be flagged.');

// 2. Same route, mine moved well off the path -> not flagged.
context.mines = [{ id: 'g', owner: 'green', x: 300, y: 134.67 }];
const clear = build();
assert(clear && clear.pathCrossesMine === false, '2: a cargo route clear of mines is not flagged.');

// 3. No mines -> not flagged.
context.mines = [];
assert(build().pathCrossesMine === false, '3: no mines, not flagged.');

// 4. Own-team mine on the path is flagged too (owner-agnostic).
context.mines = [{ id: 'own', owner: 'blue', x: 63.42, y: 134.67 }];
assert(build().pathCrossesMine === true, '4: an own mine on the cargo path is flagged too.');

console.log('Smoke test passed: cargo route candidates flag pathCrossesMine (own or enemy) so the selector drops a route that would drive into a mine.');
