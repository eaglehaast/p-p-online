#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
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
  'getDistanceFromPointToSegment',
  'getMineThreatMetaForSegment',
  'revalidatePlannedMove',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const plane = { id: 'blue-1', x: 0, y: 0, activeTurnBuffs: {} };
const move = { plane, vx: 100, vy: 0 };
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
  mines: [],
  flyingPoints: [],
  isPlaneLaunchStateReady: () => true,
  isPathClear: () => true,
  getAiMoveLandingPoint: (plannedMove) => ({ x: plannedMove.plane.x + plannedMove.vx, y: plannedMove.plane.y + plannedMove.vy }),
  isPlaneTargetable: () => true,
  findActualPlaneById: () => null,
  AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX: 30,
  context: { enemies: [] },
};

vm.createContext(context);
vm.runInContext(extracted, context);

const beforeMine = context.revalidatePlannedMove(move);
assert(beforeMine.ok === true, 'Plan should be valid before mine appears.');

context.mines.push({ owner: 'green', x: 50, y: 0 });
const afterMine = context.revalidatePlannedMove(move);
assert(afterMine.ok === false, 'Plan must be rejected after mine appears on route.');
assert(afterMine.reason === 'path_crosses_mine', 'Late revalidation must report path_crosses_mine.');

console.log('Smoke test passed: revalidatePlannedMove rejects stale plan after mine appears on path.');
