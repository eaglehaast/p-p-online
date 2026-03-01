#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
  if(bodyStart === -1) throw new Error(`Function body start not found for: ${fnName}`);
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

function distanceOnlyMineTrigger(plane, mine, mineTriggerRadius){
  const dx = plane.x - mine.x;
  const dy = plane.y - mine.y;
  return Math.hypot(dx, dy) <= mineTriggerRadius;
}

const source = fs.readFileSync('script.js', 'utf8');
const extracted = [
  'getPlaneActiveTurnBuffs',
  'planeHasActiveTurnBuff',
  'getPlaneDangerGeometry',
  'handleMineForPlane',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const eliminationLog = [];
const explosionLog = [];

const context = {
  Math,
  Number,
  POINT_RADIUS: 10,
  MINE_TRIGGER_RADIUS: 10,
  PLANE_GEOMETRY_TRUTH: {
    DANGER_HITBOX_WIDTH: 36,
    BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96,
    HITBOX_HEIGHT: 36,
  },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings', CROSSHAIR: 'crosshair', FUEL: 'fuel', INVISIBILITY: 'invisibility' },
  isPlayerInvisibilityActive: () => false,
  isPlaneTargetable: () => true,
  mines: [{ owner: 'blue', x: 50, y: 0 }],
  flyingPoints: [],
  canAwardKillPointForPlane: () => true,
  markPlaneKillPointAwarded: () => {},
  awardPoint: () => {},
  checkVictory: () => {},
  eliminatePlane: (plane) => { eliminationLog.push(plane.color); plane.wasEliminated = true; },
  spawnExplosionForPlane: (_, x, y) => { explosionLog.push({ x, y }); },
  advanceTurn: () => {},
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plane = {
  color: 'green',
  activeTurnBuffs: {},
  prevX: 0,
  prevY: 0,
  x: 100,
  y: 0,
};

const dangerRadius = context.getPlaneDangerGeometry(plane).radius;
const mineTriggerRadius = Math.max(context.MINE_TRIGGER_RADIUS, dangerRadius);
const mine = context.mines[0];

const beforeMissedContacts = distanceOnlyMineTrigger(plane, mine, mineTriggerRadius) ? 0 : 1;
const afterHit = context.handleMineForPlane(plane, null);
const afterMissedContacts = afterHit ? 0 : 1;

assert(beforeMissedContacts === 1,
  'Before (distance-only) this large-step fly-through should miss mine contact.');
assert(afterHit === true,
  'After segment check plane must be destroyed when path crosses mine trigger radius.');
assert(plane.wasEliminated === true,
  'Plane should be eliminated after crossing a mine on a large movement step.');
assert(context.mines.length === 0,
  'Mine should be removed after triggering on a fly-through.');
assert(afterMissedContacts === 0,
  'After segment hit support missed mine contacts metric should drop to zero.');

console.log('Smoke test passed: mine segment hit catches large-step fly-through.');
console.log(`Missed contacts before: ${beforeMissedContacts}; after: ${afterMissedContacts}.`);
