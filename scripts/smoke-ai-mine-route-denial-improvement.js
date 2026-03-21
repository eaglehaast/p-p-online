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
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', MINE: 'mine', DYNAMITE: 'dynamite', INVISIBILITY: 'invisible', WINGS: 'wings' },
  aiRoundState: { currentGoal: 'pressure_enemy', lastInventorySoftFallbackUsed: false, inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0 },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 0, crosshair: 0, mine: 1, dynamite: 0, invisible: 0, wings: 0 } }),
  getBluePriorityEnemy: () => ({ id: 'enemy-1', x: 155, y: 10, shieldActive: false }),
  getAiMoveLandingPoint: () => ({ x: 118, y: 0 }),
  getAiStrategicTargetPoint: () => ({ x: 155, y: 10 }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, rejectedScenarios: [], returnSafetyScore: 0, requiredReturnSafetyThreshold: 0, actualReturnSafetyScore: 0 }),
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => { removed += 1; },
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    if(options.evaluateOnly) return {
      placement: { x: 136, y: 0 },
      scenario: 'mine_cuts_best_route',
      score: 6.2,
      blockedEscapeCount: 1,
      cutRouteCount: 1,
      trapCount: 0,
      totalDirectionLoss: 1,
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
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
  isPlannedMoveLikelyProfitableTrade: () => false,
  evaluateDirectAttackWindow: () => null,
  AI_ENGINE_MODE: 'v2',
  AI_V2_INVENTORY_PHASE: 3,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const gameContext = {
  aiRiskProfile: { profile: 'balanced' },
  enemies: [{ id: 'enemy-1', x: 155, y: 10 }],
};
const plannedMove = {
  plane: { id: 'plane-1', x: 0, y: 0 },
  totalDist: 118,
  goalName: 'pressure_enemy',
};
const planning = context.buildAiInventoryCandidatePlans(gameContext, plannedMove);
plannedMove.selectedInventoryCandidate = planning.selectedCandidate;
const used = context.maybeUseInventoryBeforeLaunch(gameContext, plannedMove);

assert(used === true, 'Mine should be used when it noticeably denies the enemy route even if landing is not fully safe.');
assert(removed === 1 && placed === 1, 'Mine must be spent exactly once for route denial.');
assert(logs.some((entry) => entry.reason === 'mine_used_for_route_denial'), 'Route denial usage must be logged explicitly.');
assert(!logs.some((entry) => entry.reason === 'mine_skipped_self_risk'), 'Mine should no longer be skipped only because the position is not already safe.');

console.log('Smoke test passed: mine is used for route denial even when post-landing safety is still imperfect.');
