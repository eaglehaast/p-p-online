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
const extracted = extractFunctionSource(source, 'maybeUseInventoryBeforeLaunch');

let defensiveMineCalls = 0;
let nearBaseMineCalls = 0;
const decisionLogs = [];

const context = {
  Math,
  Number,
  Boolean,
  Infinity,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 2,
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
    CROSSHAIR: 'crosshair',
    MINE: 'mine',
    DYNAMITE: 'dynamite',
  },
  aiRoundState: {
    lastInventorySoftFallbackUsed: false,
    inventoryIdleTurns: 0,
    inventorySoftFallbackCooldown: 0,
  },
  evaluateBlueInventoryState: () => ({
    total: 1,
    counts: {
      fuel: 0,
      crosshair: 0,
      mine: 1,
      dynamite: 0,
    },
  }),
  getBluePriorityEnemy: () => ({ id: 'enemy-1', x: 140, y: 0, shieldActive: false }),
  getAiMoveLandingPoint: () => ({ x: 120, y: 0 }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => {
    throw new Error('Mine should not be removed when direct hit chance is good.');
  },
  tryPlaceBlueDefensiveMine: () => {
    defensiveMineCalls += 1;
    return true;
  },
  tryPlaceBlueMineNearEnemyBase: () => {
    nearBaseMineCalls += 1;
    return true;
  },
  logAiDecision: (reason, details) => {
    decisionLogs.push({ reason, details });
  },
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  isPathClear: () => true,
  getDynamiteCandidateForCurrentRoute: () => null,
  getNearestDynamiteTargetToPoint: () => null,
  isDynamiteTargetUsefulForCurrentRoute: () => false,
  placeBlueDynamiteAt: () => false,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plannedMove = {
  plane: { id: 'plane-1', x: 0, y: 0 },
  vx: 0,
  vy: 0,
  totalDist: 140,
};

const used = context.maybeUseInventoryBeforeLaunch({ aiRiskProfile: { profile: 'balanced' } }, plannedMove);

assert(used === false, 'Direct hit chance should keep mine for launch, so inventory action must return false.');
assert(defensiveMineCalls === 0 && nearBaseMineCalls === 0,
  'Mine placement attempts must be skipped when direct hit chance is good.');

const savedLog = decisionLogs.find((entry) => entry.reason === 'mine_saved_for_direct_attack');
assert(Boolean(savedLog), 'AI must log mine_saved_for_direct_attack when skipping mine placement.');
assert(savedLog.details.enemyShieldActive === false, 'Log should capture enemy shield state for traceability.');

console.log('Smoke test passed: direct attack chance skips mine placement and logs mine_saved_for_direct_attack.');
