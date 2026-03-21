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
function assert(condition, message){ if(!condition) throw new Error(message); }

const source = fs.readFileSync('script.js', 'utf8');
const extracted = extractFunctionSource(source, 'maybeUseInventoryBeforeLaunch');
const logs = [];
let placed = 0;

const context = {
  Math, Number, Boolean, Infinity, Set,
  CELL_SIZE: 10,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 99,
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', MINE: 'mine', DYNAMITE: 'dynamite', INVISIBILITY: 'invisible', WINGS: 'wings' },
  aiRoundState: { currentGoal: 'capture_enemy_flag', lastInventorySoftFallbackUsed: false, inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0 },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 0, crosshair: 0, mine: 1, dynamite: 0, invisible: 0, wings: 0 } }),
  getBluePriorityEnemy: () => null,
  getAiMoveLandingPoint: () => ({ x: 80, y: 0 }),
  getAiStrategicTargetPoint: () => ({ x: 200, y: 0 }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, rejectedScenarios: [], returnSafetyScore: 0, requiredReturnSafetyThreshold: 0, actualReturnSafetyScore: 0 }),
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: (flag) => flag.anchor,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => { throw new Error('Mine should stay in inventory when it gives no benefit.'); },
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    if(options.evaluateOnly) return { placement: { x: 125, y: 0 }, scenario: 'mine_between_objective_and_threat', score: 4, blockedEscapeCount: 0, cutRouteCount: 0, trapCount: 0, totalDirectionLoss: 0 };
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
  evaluateMineEnabledFlagPickupContinuation: () => null,
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const used = context.maybeUseInventoryBeforeLaunch({
  shouldUseFlagsMode: true,
  availableEnemyFlags: [{ id: 'flag-1', anchor: { x: 200, y: 0 } }],
  enemies: [{ id: 'enemy-side', x: 190, y: 30 }],
  homeBase: { x: 0, y: 0 },
  aiRiskProfile: { profile: 'balanced' },
}, {
  plane: { id: 'plane-1', x: 0, y: 0 },
  totalDist: 80,
  goalName: 'capture_enemy_flag',
});

assert(used === false, 'Mine should not be used when it does not improve escape or return route.');
assert(placed === 0, 'Mine placement must not happen without a measurable benefit.');
assert(!logs.some((entry) => entry.reason === 'mine_enables_flag_pickup'), 'No enabling log should appear when mine is useless.');

console.log('Smoke test passed: mine is not spent when it does not improve post-objective safety.');
