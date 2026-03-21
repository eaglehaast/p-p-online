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
const extracted = extractFunctionSource(source, 'maybeUseInventoryBeforeLaunch');
const logs = [];
let removed = 0;
let placed = 0;

const context = {
  Math,
  Number,
  Boolean,
  Infinity,
  Set,
  CELL_SIZE: 10,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 99,
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', MINE: 'mine', DYNAMITE: 'dynamite', INVISIBILITY: 'invisible', WINGS: 'wings' },
  aiRoundState: { currentGoal: 'capture_enemy_flag', lastInventorySoftFallbackUsed: false, inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0 },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 0, crosshair: 0, mine: 1, dynamite: 0, invisible: 0, wings: 0 } }),
  getBluePriorityEnemy: () => null,
  getAiMoveLandingPoint: () => ({ x: 80, y: 0 }),
  getAiStrategicTargetPoint: (_ctx, _move) => ({ x: 200, y: 0 }),
  getBaseAnchor: (color) => color === 'blue' ? ({ x: 0, y: 0 }) : ({ x: 200, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, rejectedScenarios: [], returnSafetyScore: 0, requiredReturnSafetyThreshold: 0, actualReturnSafetyScore: 0 }),
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: (flag) => flag.anchor,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => { removed += 1; },
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    if(options.evaluateOnly) return { placement: { x: 125, y: 0 }, scenario: 'mine_between_objective_and_threat', score: 9, blockedEscapeCount: 1, cutRouteCount: 1, trapCount: 0, totalDirectionLoss: 2 };
    placed += 1;
    return true;
  },
  tryPlaceBlueMineNearEnemyBase: () => null,
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  getPlaneEffectiveRangePx: () => 100,
  getEffectiveFlightRangeCells: () => 30,
  settings: { aimingAmplitude: 80, flightRangeCells: 30 },
  ATTACK_RANGE_PX: 100,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  isPathClear: () => true,
  getDynamiteCandidateForCurrentRoute: () => null,
  getNearestDynamiteTargetToPoint: () => null,
  isDynamiteTargetUsefulForCurrentRoute: () => false,
  placeBlueDynamiteAt: () => false,
  evaluateFlagPickupContinuation: () => ({ hasSafeEscape: false, hasReturnRoute: false, statusLabel: 'flag_available_but_escape_unsafe', statusReason: 'pickup_without_safe_escape' }),
  evaluateMineEnabledFlagPickupContinuation: () => ({
    placement: { x: 125, y: 0 },
    threatEnemyId: 'enemy-side',
    threatDistance: 22,
    after: { hasSafeEscape: true, hasReturnRoute: true },
    logReason: 'mine_enables_flag_pickup',
  }),
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plannedMove = {
  plane: { id: 'plane-1', x: 0, y: 0 },
  totalDist: 80,
  goalName: 'capture_enemy_flag',
};
const gameContext = {
  shouldUseFlagsMode: true,
  availableEnemyFlags: [{ id: 'flag-1', anchor: { x: 200, y: 0 } }],
  enemies: [{ id: 'enemy-side', x: 190, y: 30 }],
  homeBase: { x: 0, y: 0 },
  aiRiskProfile: { profile: 'balanced' },
};

const used = context.maybeUseInventoryBeforeLaunch(gameContext, plannedMove);
assert(used === true, 'Mine should be used when it turns unsafe flag pickup into safe pickup.');
assert(removed === 1 && placed === 1, 'Mine must be placed and removed from inventory exactly once.');
assert(plannedMove.inventoryUsageReason === 'mine_enables_flag_pickup', 'Move should remember that mine was used to enable flag pickup.');
assert(plannedMove.preservedStrategicTargetPoint && plannedMove.preservedStrategicTargetPoint.x === 200,
  'Target point must be preserved for the launch after mine placement.');
assert(logs.some((entry) => entry.reason === 'mine_enables_flag_pickup'), 'Dedicated mine_enables_flag_pickup log is required.');
assert(logs.some((entry) => entry.reason === 'mine_between_objective_and_threat'), 'Dedicated mine_between_objective_and_threat log is required.');

console.log('Smoke test passed: mine is selected to unlock a previously unsafe flag pickup and target intent is preserved.');
