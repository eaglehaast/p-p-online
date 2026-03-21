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
const extracted = [
  'evaluateBlueMinePlacementImpact',
  'tryPlaceBlueDefensiveMine',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const logs = [];
const mines = [];

const context = {
  Math,
  Number,
  Date,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  FIELD_WIDTH: 200,
  FIELD_HEIGHT: 160,
  FIELD_BORDER_OFFSET_X: 0,
  FIELD_BORDER_OFFSET_Y: 0,
  CELL_SIZE: 20,
  MAX_DRAG_DISTANCE: 120,
  MINE_TRIGGER_RADIUS: 15,
  aiRoundState: {},
  mines,
  getAiMoveLandingPoint: (move) => ({
    x: Number.isFinite(move.targetX) ? move.targetX : move.plane.x + (move.vx || 0),
    y: Number.isFinite(move.targetY) ? move.targetY : move.plane.y + (move.vy || 0),
  }),
  getPlaneEffectiveRangePx: () => 80,
  isPathClear: () => true,
  isMinePlacementValid: () => true,
  placeMine: (mine) => mines.push(mine),
  logAiDecision: (reason, details) => logs.push({ reason, details }),
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
    if(plane.id !== 'enemy-wall') return { vx: tx - plane.x, vy: ty - plane.y, targetX: tx, targetY: ty };
    if(tx <= plane.x + 2) return null;
    if(Math.abs(ty - plane.y) > 12) return null;
    return { vx: tx - plane.x, vy: ty - plane.y, targetX: tx, targetY: ty };
  },
};

vm.createContext(context);
vm.runInContext(extracted, context);

const didPlace = context.tryPlaceBlueDefensiveMine({
  enemies: [{ id: 'enemy-wall', x: 20, y: 40, isAlive: true }],
  aiPlanes: [],
}, {
  plane: { id: 'blue-1', x: 80, y: 40 },
  vx: 0,
  vy: 0,
});

assert(didPlace === true, 'Defensive mine should be placed when it blocks the only safe escape lane.');
assert(mines.length === 1, 'Exactly one mine should be placed in the corridor.');
assert(context.aiRoundState.lastMinePlacementMeta?.scenario === 'mine_blocks_escape_lane', 'Scenario must be classified as mine_blocks_escape_lane.');
assert(context.aiRoundState.lastMinePlacementMeta?.blockedEscapeCount >= 1, 'Blocked escape count must be recorded.');

console.log('Smoke test passed: defensive mine blocks the only safe escape lane near a wall.');
