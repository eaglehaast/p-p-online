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

const source = fs.readFileSync('script.js', 'utf8');
const extracted = [
  'getPlaneActiveTurnBuffs',
  'planeHasActiveTurnBuff',
  'getPlaneDangerGeometry',
  'handleMineForPlane',
  'planeBuildingCollision',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

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
  mines: [{ owner: 'blue', x: 25, y: 0 }],
  flyingPoints: [],
  canAwardKillPointForPlane: () => false,
  markPlaneKillPointAwarded: () => {},
  awardPoint: () => {},
  checkVictory: () => {},
  eliminatePlane: (plane) => { plane.wasEliminated = true; },
  spawnExplosionForPlane: () => {},
  advanceTurn: () => {},
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  SLIDE_THRESHOLD: 0.3,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const planeWithWings = { x: 0, y: 0, color: 'green', activeTurnBuffs: { wings: true } };
assert(context.handleMineForPlane(planeWithWings, null) === false,
  'Mine should not trigger early from wings-only extension.');
assert(planeWithWings.wasEliminated !== true,
  'Danger checks must use base radius, so wings do not cause early mine penalty.');

const fp = { plane: { x: 25, y: 0, activeTurnBuffs: { wings: true } }, vx: 0, vy: 0 };
const collider = { type: 'rect', cx: 0, cy: 0, rotation: 0, halfWidth: 10, halfHeight: 10 };
assert(context.planeBuildingCollision(fp, collider) === false,
  'Obstacle collision should still use danger radius and ignore wings extension.');

console.log('Smoke test passed: wings do not cause early dangerous penalties (mine/obstacle).');
