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
  'buildAiInventoryCandidatePlans',
  'maybeUseInventoryBeforeLaunch',
].map((name) => extractFunctionSource(source, name)).join('\n\n');
const logs = [];
let removed = 0;
let placed = 0;

const context = {
  Math, Number, Boolean, Infinity, Set,
  CELL_SIZE: 10,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 99,
  AI_INVENTORY_PRESSURE_CONFIG: { mine: { selectionFloor: 0.108 } },
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', MINE: 'mine', DYNAMITE: 'dynamite', INVISIBILITY: 'invisible', WINGS: 'wings' },
  aiRoundState: { currentGoal: 'capture_enemy_flag', lastInventorySoftFallbackUsed: false, inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0 },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 0, crosshair: 0, mine: 1, dynamite: 0, invisible: 0, wings: 0 } }),
  getBluePriorityEnemy: () => ({ id: 'enemy-2', x: 145, y: 18, shieldActive: false }),
  getAiMoveLandingPoint: () => ({ x: 118, y: 4 }),
  getAiStrategicTargetPoint: () => ({ x: 145, y: 18 }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, rejectedScenarios: [], returnSafetyScore: 0, requiredReturnSafetyThreshold: 0, actualReturnSafetyScore: 0 }),
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => { removed += 1; },
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    if(options.evaluateOnly) return {
      placement: { x: 132, y: 8 },
      scenario: 'mine_covers_post_flag_counter',
      score: 2.3,
      blockedEscapeCount: 0,
      cutRouteCount: 0,
      trapCount: 0,
      totalDirectionLoss: 0.5,
    };
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
  evaluateFlagPickupContinuation: () => null,
  evaluateMineEnabledFlagPickupContinuation: () => null,
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: true }),
  isPlannedMoveLikelyProfitableTrade: () => false,
  evaluateDirectAttackWindow: () => null,
  getAiInventoryRecentMatchSignals: () => ({ fallbackSelectedCount: 0, shotPlanNotFoundCount: 0, emergencyBaseDefenseCount: 0, softReleaseReady: true }),
  updateAiInventoryPressureForTurn: () => ({ byItem: {}, stalestItemType: null }),
  getAiInventoryPressureBonus: () => 0,
  getAiInventorySelectionFloor: () => 0,
  isAiInventoryPressureWeakChance: () => false,
  recordInventoryAiDecision: () => {},
  shouldProbeInventoryPreparedShotPlan: () => false,
  AI_ENGINE_MODE: 'v2',
  AI_V2_INVENTORY_PHASE: 3,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const gameContext = {
  aiRiskProfile: { profile: 'balanced' },
  enemies: [{ id: 'enemy-2', x: 145, y: 18 }],
};
const plannedMove = {
  plane: { id: 'plane-2', x: 0, y: 0 },
  totalDist: 118,
  goalName: 'capture_enemy_flag',
};
const planning = context.buildAiInventoryCandidatePlans(gameContext, plannedMove);

assert(planning.selectedCandidate && planning.selectedCandidate.itemType === context.INVENTORY_ITEM_TYPES.MINE,
  'Mine must become selected even for moderate impact when it makes the next turn safer.');

plannedMove.selectedInventoryCandidate = planning.selectedCandidate;
const used = context.maybeUseInventoryBeforeLaunch(gameContext, plannedMove);

assert(used === true, 'Mine should be used when it gives safety for the immediate enemy response turn.');
assert(removed === 1 && placed === 1, 'Mine must be spent exactly once in moderate safety scenario.');
assert(logs.some((entry) => entry.reason === 'mine_used_for_safe_aggressive_follow_up'),
  'Safety-driven aggressive follow-up mine usage must be logged explicitly.');

console.log('Smoke test passed: moderate mine plan is selected when it secures the next turn after an aggressive action.');
