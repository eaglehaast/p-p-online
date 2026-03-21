#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') paramsDepth += 1;
    if(ch === ')') paramsDepth -= 1;
    if(ch === '{' && paramsDepth === 0){
      bodyStart = i;
      break;
    }
  }
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
const extracted = extractFunctionSource(source, 'evaluateBlueMinePlacementImpact');
const mines = [];

const context = {
  Math,
  Number,
  Date,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  FIELD_WIDTH: 200,
  FIELD_HEIGHT: 200,
  FIELD_BORDER_OFFSET_X: 0,
  FIELD_BORDER_OFFSET_Y: 0,
  CELL_SIZE: 20,
  MAX_DRAG_DISTANCE: 120,
  mines,
  getAiMoveLandingPoint: (move) => ({ x: move.targetX, y: move.targetY }),
  getPlaneEffectiveRangePx: () => 80,
  getBaseAnchor: () => null,
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  getImmediateResponseThreatMeta: (_ctx, landingX, landingY) => {
    const mineCount = mines.filter((mine) => (
      Math.hypot(mine.x - landingX, mine.y - landingY) <= 18
      || (mine.x <= landingX && Math.abs(mine.y - landingY) <= 18)
    )).length;
    return {
      count: mineCount,
      nearestDist: mineCount > 0 ? 0 : Number.POSITIVE_INFINITY,
      enemyCount: 0,
      mineCount,
      reasonCodes: mineCount > 0 ? ['post_landing_mine_threat'] : [],
    };
  },
  planPathToPoint: (plane, tx, ty) => {
    if(plane.id !== 'enemy-trap') return { vx: tx - plane.x, vy: ty - plane.y, targetX: tx, targetY: ty };
    const isRight = tx > plane.x + 10 && Math.abs(ty - plane.y) < 12;
    const isUp = ty > plane.y + 10 && Math.abs(tx - plane.x) < 12;
    if(!isRight && !isUp) return null;
    return { vx: tx - plane.x, vy: ty - plane.y, targetX: tx, targetY: ty };
  },
};

vm.createContext(context);
vm.runInContext(extracted, context);

const setupContext = {
  enemies: [{ id: 'enemy-trap', x: 40, y: 40, isAlive: true }],
  aiPlanes: [],
};
const plannedMove = { plane: { id: 'blue-1', x: 100, y: 100 }, vx: 0, vy: 0 };

const firstImpact = context.evaluateBlueMinePlacementImpact(setupContext, plannedMove, {
  x: 24,
  y: 84,
  cellX: 1,
  cellY: 4,
});
assert(firstImpact, 'First impact evaluation must exist.');
mines.push({ id: 'existing-1', owner: 'blue', x: 24, y: 84, cellX: 1, cellY: 4 });

const secondImpact = context.evaluateBlueMinePlacementImpact(setupContext, plannedMove, {
  x: 76,
  y: 40,
  cellX: 3,
  cellY: 2,
});
assert(secondImpact, 'Second impact evaluation must exist.');
assert(secondImpact.score > firstImpact.score, 'Two consecutive mines should create stronger lock pressure than one mine.');
assert(secondImpact.blockedEscapeCount >= 1, 'Second mine should remove the last safe escape.');

console.log('Smoke test passed: second mine increases trap pressure more than the first mine alone.');
