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
  aiRoundState: { currentGoal: 'hold_lane', lastInventorySoftFallbackUsed: false, inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0 },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 0, crosshair: 0, mine: 1, dynamite: 0, invisible: 0, wings: 0 } }),
  getBluePriorityEnemy: () => ({ id: 'enemy-2', x: 145, y: 18, shieldActive: false }),
  getAiMoveLandingPoint: () => ({ x: 112, y: 0 }),
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
      placement: { x: 130, y: 6 },
      scenario: 'mine_blocks_escape_lane',
      score: 5.1,
      blockedEscapeCount: 0,
      cutRouteCount: 0,
      trapCount: 0,
      totalDirectionLoss: 3,
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
  enemies: [{ id: 'enemy-2', x: 145, y: 18 }],
};
const plannedMove = {
  plane: { id: 'plane-2', x: 0, y: 0 },
  totalDist: 112,
  goalName: 'hold_lane',
};
const planning = context.buildAiInventoryCandidatePlans(gameContext, plannedMove);
plannedMove.selectedInventoryCandidate = planning.selectedCandidate;
const used = context.maybeUseInventoryBeforeLaunch(gameContext, plannedMove);

assert(used === true, 'Mine should be used when it noticeably worsens enemy options even without full route denial.');
assert(removed === 1 && placed === 1, 'Mine must be spent exactly once for position improvement.');
assert(logs.some((entry) => entry.reason === 'mine_used_for_position_improvement'), 'Position improvement usage must be logged explicitly.');
assert(!logs.some((entry) => entry.reason === 'mine_not_used_no_benefit' && entry.details?.reason === 'mine_impact_below_noticeable_threshold'), 'Noticeable position improvement must not be treated as insignificant.');

console.log('Smoke test passed: mine is used for noticeable position improvement without requiring perfect safety.');
