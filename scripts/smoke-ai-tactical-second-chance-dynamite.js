#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extract(source, name){
  const signature = `function ${name}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found: ${name}`);
  let argsDepth = 0;
  let bodyStart = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') argsDepth += 1;
    if(ch === ')'){
      argsDepth -= 1;
      if(argsDepth === 0){
        bodyStart = source.indexOf('{', i);
        break;
      }
    }
  }
  if(bodyStart === -1) throw new Error(`Function start not closed: ${name}`);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body not closed: ${name}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const extracted = extract(source, 'maybeUseInventoryBeforeLaunch');

const decisionLogs = [];
const failedTargets = new Set([100]);
const placedTargets = [];

const sandbox = {
  Math,
  Number,
  Boolean,
  Infinity,
  FIELD_FLIGHT_DURATION_SEC: 1,
  MAX_DRAG_DISTANCE: 100,
  CELL_SIZE: 40,
  ATTACK_RANGE_PX: 70,
  AI_ENGINE_MODE: 'v2',
  AI_V2_INVENTORY_PHASE: 3,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 2,
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
    CROSSHAIR: 'crosshair',
    MINE: 'mine',
    DYNAMITE: 'dynamite',
    INVISIBILITY: 'invisible',
    WINGS: 'wings',
  },
  aiRoundState: {
    inventoryPhase: 3,
    inventoryIdleTurns: 0,
    inventorySoftFallbackCooldown: 0,
    lastInventorySoftFallbackUsed: false,
    currentGoal: 'direct_finisher',
    dynamiteIntent: null,
  },
  settings: { flightRangeCells: 2, aimingAmplitude: 80 },
  evaluateBlueInventoryState: () => ({
    total: 1,
    counts: { fuel: 0, crosshair: 0, mine: 0, dynamite: 1, invisible: 0, wings: 0 },
  }),
  getBluePriorityEnemy: () => ({ id: 'enemy-1', x: 120, y: 0, isAlive: true, burning: false }),
  getBaseAnchor: (color) => color === 'green' ? ({ x: 180, y: 0 }) : ({ x: 0, y: 0 }),
  getAiMoveLandingPoint: () => ({ x: 80, y: 0 }),
  getPlaneEffectiveRangePx: () => 80,
  getEffectiveFlightRangeCells: () => 3,
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  getAiInventoryRecentMatchSignals: () => ({
    repeatedFallbackSelected: false,
    repeatedShotPlanNotFound: false,
    softReleaseReady: false,
    fallbackSelectedCount: 0,
    shotPlanNotFoundCount: 0,
    emergencyBaseDefenseCount: 0,
    softReleaseGuardScenario: null,
  }),
  updateAiInventoryPressureForTurn: () => ({ byItem: {}, stalestItemType: null }),
  shouldProbeInventoryPreparedShotPlan: () => false,
  getAiInventoryPressureBonus: () => 0,
  getAiInventorySelectionFloor: () => ({ baseSelectionFloor: 0, adjustedSelectionFloor: 0, unlockReasons: [] }),
  recordInventoryAiDecision: () => {},
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, returnSafetyScore: 0, blockedByReturnSafety: false }),
  evaluateCrosshairBestUse: () => null,
  evaluateWingsBestUse: () => null,
  queueInvisibilityEffectForPlayer: () => false,
  tryPlaceBlueDefensiveMine: () => false,
  tryPlaceBlueMineNearEnemyBase: () => false,
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
  getAiStrategicTargetPoint: () => null,
  evaluateFlagPickupContinuation: () => null,
  evaluateMineEnabledFlagPickupContinuation: () => null,
  getDynamiteCandidateForCurrentRoute: () => null,
  shouldUseStrategicDynamiteForPlannedMove: () => ({ allowStrategicProbe: false }),
  evaluateStrategicDynamiteTargets: () => ({ bestTarget: null }),
  withTemporarilyIgnoredDynamiteColliders: (_ignored, callback) => callback(),
  getNearestDynamiteTargetToPoint: () => null,
  isDynamiteTargetUsefulForCurrentRoute: () => true,
  applyPlannedMoveAfterDynamiteRouteOpen: () => true,
  setAiDynamiteIntentForTurn: () => {},
  setAiDynamiteIntentFromCandidate: () => {},
  consumeAiDynamiteIntentIfUsed: () => {},
  placeBlueDynamiteAt: (x, y) => {
    if(failedTargets.has(Math.round(x))) return false;
    placedTargets.push({ x, y });
    return true;
  },
  withTemporaryBlueMine: (_placement, callback) => callback(),
  isPathClear: () => true,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => {},
  logAiDecision: (reason, details) => decisionLogs.push({ reason, details }),
  dist: (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0)),
};

vm.createContext(sandbox);
vm.runInContext(extracted, sandbox);

const failedCandidate = {
  itemType: 'dynamite',
  reason: 'dynamite_used_for_map_opening',
  adjustedComparableScore: 0.82,
  target: { x: 100, y: 0, colliderId: 'bad-target' },
};
const fallbackCandidate = {
  itemType: 'dynamite',
  reason: 'dynamite_used_for_map_opening',
  adjustedComparableScore: 0.79,
  target: { x: 140, y: 0, colliderId: 'good-target' },
};

const plannedMove = {
  plane: { id: 'plane-1', x: 0, y: 0 },
  vx: 80,
  vy: 0,
  totalDist: 80,
  goalName: 'direct_finisher',
  selectedInventoryCandidate: failedCandidate,
  inventoryCandidates: [failedCandidate, fallbackCandidate],
};

const used = sandbox.maybeUseInventoryBeforeLaunch({ enemies: [{ id: 'enemy-1', x: 120, y: 0 }], aiPlanes: [{ id: 'plane-1' }], aiRiskProfile: { profile: 'balanced' } }, plannedMove);

assert(used === true, 'После провала первого dynamite должен сработать второй тактический кандидат.');
assert(placedTargets.some((entry) => Math.round(entry.x) === 140), 'Второй валидный dynamite-таргет должен быть использован.');
assert(decisionLogs.some((entry) => entry.reason === 'tactical_second_chance_used'), 'Нужен отдельный лог tactical_second_chance_used.');
assert(!decisionLogs.some((entry) => entry.reason === 'tactical_second_chance_failed'), 'Не должно быть tactical_second_chance_failed при успешном втором шансе.');

console.log('Smoke test passed: tactical second chance uses a new valid dynamite target after first target fails.');
