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
  'evaluateAiMineTacticalPlanDecision',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const logs = [];

const context = {
  Math, Number, Boolean, Infinity, Set,
  CELL_SIZE: 10,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 2,
  AI_INVENTORY_PRESSURE_CONFIG: {},
  AI_MINE_PLAN_THRESHOLDS: {
    MIN_NOTICEABLE_DIRECTION_LOSS: 1.3,
    MIN_NOTICEABLE_IMPACT_SCORE: 5.2,
    EXTRA_NOTICEABLE_IMPACT_SCORE: 1.6,
    MIN_MODERATE_IMPACT_SCORE: 4.3,
    MIN_MODERATE_SAFE_IMPACT_SCORE: 4.9,
    MIN_MODERATE_SAFE_IMPROVEMENT_IMPACT_SCORE: 4.5,
    MIN_MODERATE_SAFE_IMPROVEMENT_DIRECTION_LOSS: 0.95,
  },
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', MINE: 'mine', DYNAMITE: 'dynamite', INVISIBILITY: 'invisible', WINGS: 'wings' },
  aiRoundState: { currentGoal: 'pressure_enemy', lastInventorySoftFallbackUsed: false, inventoryIdleTurns: 3, inventorySoftFallbackCooldown: 0 },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 0, crosshair: 0, mine: 1, dynamite: 0, invisible: 0, wings: 0 } }),
  getBluePriorityEnemy: () => ({ id: 'enemy-1', x: 155, y: 8, shieldActive: false }),
  getAiMoveLandingPoint: () => ({ x: 118, y: 0 }),
  getAiStrategicTargetPoint: () => ({ x: 155, y: 8 }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, rejectedScenarios: [], returnSafetyScore: 0, requiredReturnSafetyThreshold: 0, actualReturnSafetyScore: 0 }),
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => {},
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    if(options.evaluateOnly) return {
      placement: { x: 134, y: 0 },
      scenario: 'mine_cuts_best_route',
      score: 6.15,
      blockedEscapeCount: 1,
      cutRouteCount: 1,
      trapCount: 0,
      forcedBadPathCount: 1,
      totalDirectionLoss: 1.18,
      projectedContactDelta: 0.61,
    };
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
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
  isPlannedMoveLikelyProfitableTrade: () => false,
  evaluateDirectAttackWindow: () => null,
  getAiItemSpendStyle: () => 'balanced',
  getMineRiskStyleConfig: () => ({ ALLOW_MODERATE_RISK_WITH_ROUTE_DENIAL: true }),
  getMineRiskAcceptedBecause: () => 'map_control_relief',
  isAiCriticalMineGoal: () => false,
  buildAiMineSeriesPlan: () => null,
  buildAiDynamiteSeriesPlan: () => null,
  evaluateAiDynamiteTacticalTarget: () => ({ routeAwareTarget: null, strategicMoveGate: null, strategicDynamite: null, strategicTarget: null, fallbackTarget: null }),
  isAiInventoryPressureWeakChance: () => false,
  ensureAiInventoryPressureState: () => ({ byItem: {}, stalestItemType: null }),
  getAiInventoryPressureBonus: () => 0,
  getAiInventorySelectionFloor: () => ({ baseSelectionFloor: 0.05, adjustedSelectionFloor: 0.05, unlockReasons: [] }),
  recordInventoryAiDecision: () => {},
  updateAiInventoryPressureForTurn: () => {},
  chooseAiInventoryCandidateFromPressure: (_candidates) => null,
  getAiInventoryRecentMatchSignals: () => ({
    fallbackSelectedCount: 2,
    shotPlanNotFoundCount: 2,
    emergencyBaseDefenseCount: 0,
    repeatedFallbackSelected: true,
    repeatedShotPlanNotFound: true,
    emergencyPressure: false,
    softReleaseReady: true,
    softReleaseGuardScenario: { fallbackChainTurns: 0 },
  }),
  AI_ENGINE_MODE: 'v2',
  AI_V2_INVENTORY_PHASE: 3,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const decision = context.evaluateAiMineTacticalPlanDecision({
  preferredMinePlan: {
    plan: {
      score: 6.15,
      blockedEscapeCount: 1,
      cutRouteCount: 1,
      trapCount: 0,
      forcedBadPathCount: 1,
      totalDirectionLoss: 1.18,
      projectedContactDelta: 0.61,
      controlledBasePassCount: 0,
      controlledTurnPointCount: 1,
    },
  },
  safeAfterPlacement: false,
  safetyImprovesAfterPlacement: false,
  isCriticalGoalForDefensiveMine: false,
  repeatedEmptyTurns: true,
  context: { enemies: [{ id: 'enemy-1', x: 155, y: 8 }] },
  plannedMove: { goalName: 'pressure_enemy' },
  aiItemSpendStyle: 'balanced',
  strategicGoalName: 'pressure_enemy',
});

assert(decision.mineTrapCount === 0, 'Smoke scenario must validate non-trap mine path.');
assert(decision.mineCreatesRouteDenial === true, 'Mine should still overlap and deny enemy route.');
assert(decision.mineMapControlSignal === true, 'Map-control signal should be detected for route overlap case.');
assert(decision.mineRejectedBySelfRisk === false,
  'Route-overlap map-control mine should not be hard-rejected in repeated empty-turn mode.');
assert(decision.minePlanProvidesNoticeableImprovement === true || decision.mineModerateImprovement === true,
  'Mine should be promoted into usable tactical quality (noticeable or moderate).');

console.log('Smoke test passed: non-trap mine with strong route overlap is accepted as map-control decision.');
