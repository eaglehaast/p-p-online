#!/usr/bin/env node
'use strict';

// Smoke test: doesFlightPathCrossMine — the AI must not route a flight straight
// through a mine. Mines aren't colliders, so the shot simulator flies through
// them; a "best" shot then self-detonates mid-flight. From a real caught move
// (aiDumpBadMove, turn 1): blue #6 (239,48) fired a direct shot to (96.75,70.38)
// whose path passes ~13px from a green mine at (156.36,47.72) — inside the 28px
// trigger radius — i.e. straight into it. Owner-agnostic (own mines detonate too).

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
  MINE_TRIGGER_RADIUS: 28,
  getDistanceFromPointToSegment,
  mines: [],                    // reassigned per scenario
  getMineEffectiveTriggerRadius: null, // set per scenario when testing plane-scaled radius
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'doesFlightPathCrossMine'), context);
const crosses = (path, plane) => context.doesFlightPathCrossMine(path, plane);

const dumpPath = [{ x: 239, y: 48 }, { x: 96.75, y: 70.38 }];
const greenMine = { id: 'm', owner: 'green', x: 156.36, y: 47.72 };

// 1. THE CAUGHT MOVE: the direct shot path passes ~13px from the mine (< 28) -> crosses.
context.mines = [greenMine];
assert(crosses(dumpPath) === true, '1: the caught direct shot must be detected as crossing the mine.');

// 2. A path that stays well clear of the mine -> does not cross.
context.mines = [greenMine];
assert(crosses([{ x: 239, y: 48 }, { x: 239, y: 500 }]) === false, '2: a path clear of the mine does not cross.');

// 3. No mines on the field -> never crosses.
context.mines = [];
assert(crosses(dumpPath) === false, '3: no mines, no crossing.');

// 4. OWN mine on the path is detected too (owner-agnostic).
context.mines = [{ id: 'own', owner: 'blue', x: 156.36, y: 47.72 }];
assert(crosses(dumpPath) === true, '4: an own-team mine on the path is detected too.');

// 5. Multi-segment (bounce) path where a LATER segment crosses -> detected.
context.mines = [{ id: 'm2', owner: 'green', x: 200, y: 300 }];
assert(crosses([{ x: 0, y: 0 }, { x: 0, y: 300 }, { x: 220, y: 300 }]) === true,
  '5: a mine crossed on a later (bounced) segment is detected.');

// 6. A mine just outside the trigger radius (~40px away) -> not a crossing.
context.mines = [{ id: 'far', owner: 'green', x: 156.36, y: 8 }]; // ~40px above the path
assert(crosses(dumpPath) === false, '6: a mine beyond the trigger radius is not a crossing.');

// 7. Plane-scaled trigger radius (wings widen the hitbox) catches a slightly farther mine.
context.mines = [{ id: 'edge', owner: 'green', x: 156.36, y: 12 }]; // ~48px above; > 28 but < 55
context.getMineEffectiveTriggerRadius = () => 55;
assert(crosses(dumpPath, { activeTurnBuffs: { wings: true } }) === true,
  '7: a wider plane trigger radius catches a mine the base radius would miss.');
context.getMineEffectiveTriggerRadius = null;

console.log('Smoke test passed: doesFlightPathCrossMine flags a flight that rams a mine (direct or bounced, own or enemy), respects the trigger radius, and clears a mine-free path.');
