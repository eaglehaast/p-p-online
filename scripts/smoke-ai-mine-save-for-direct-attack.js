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
let removed = 0;
const decisionLogs = [];

const context = {
  Math,
  Number,
  Boolean,
  Infinity,
  CELL_SIZE: 10,
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
  getAiStrategicTargetPoint: () => ({ x: 140, y: 0 }),
  evaluateFlagPickupContinuation: () => null,
  evaluateMineEnabledFlagPickupContinuation: () => null,
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: true, afterSafe: true }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => {
    removed += 1;
  },
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    defensiveMineCalls += 1;
    if(options.evaluateOnly) return { scenario: 'mine_creates_trap', score: 9, blockedEscapeCount: 1, cutRouteCount: 0, trapCount: 1, totalDirectionLoss: 2 };
    return true;
  },
  tryPlaceBlueMineNearEnemyBase: (_ctx, _move, options = {}) => {
    nearBaseMineCalls += 1;
    if(options.evaluateOnly) return { scenario: 'mine_cuts_best_route', score: 5, blockedEscapeCount: 0, cutRouteCount: 1, trapCount: 0, totalDirectionLoss: 1 };
    return true;
  },
  logAiDecision: (reason, details) => {
    decisionLogs.push({ reason, details });
  },
  getPlaneEffectiveRangePx: () => 140,
  getEffectiveFlightRangeCells: () => 30,
  settings: { aimingAmplitude: 80, flightRangeCells: 30 },
  ATTACK_RANGE_PX: 100,
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

assert(used === true, 'If mine has a useful placement, AI should spend it immediately even with a good direct attack window.');
assert(defensiveMineCalls >= 2, 'AI should evaluate and then execute the defensive mine plan.');
assert(nearBaseMineCalls >= 1, 'AI should still compare mine plans before choosing one.');
assert(removed === 1, 'Mine should be removed from inventory after successful placement.');
assert(!decisionLogs.some((entry) => entry.reason === 'mine_skipped_due_to_attack_window'),
  'Old attack-window skip log must not appear when mine is successfully placed.');
assert(!decisionLogs.some((entry) => entry.reason === 'mine_saved_for_direct_attack'),
  'Mine must not be marked as saved for direct attack when a useful placement exists.');

const placementLog = decisionLogs.find((entry) => entry.reason === 'mine_placed_for_cover');
assert(Boolean(placementLog), 'AI must record the actual mine placement.');
assert(placementLog.details.scenario === 'mine_creates_trap', 'AI should pick the stronger defensive mine plan.');

console.log('Smoke test passed: a useful mine is spent immediately even if direct attack also looks attractive.');
