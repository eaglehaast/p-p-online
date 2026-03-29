#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found: ${fnName}`);
  let paramDepth = 0;
  let bodyStart = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') paramDepth += 1;
    else if(ch === ')') paramDepth -= 1;
    else if(ch === '{' && paramDepth === 0){
      bodyStart = i;
      break;
    }
  }
  if(bodyStart === -1) throw new Error(`Function body start not found: ${fnName}`);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found: ${fnName}`);
}

function extractConstBlock(source, constName){
  const signature = `const ${constName} =`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Const not found: ${constName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0){
      const semicolonIndex = source.indexOf(';', i);
      return source.slice(start, semicolonIndex + 1);
    }
  }
  throw new Error(`Const body end not found: ${constName}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const extracted = [
  extractConstBlock(source, 'AI_INVENTORY_PRESSURE_CONFIG'),
  extractFunctionSource(source, 'createInitialInventoryPressureState'),
  extractFunctionSource(source, 'ensureAiInventoryPressureState'),
  extractFunctionSource(source, 'isAiInventoryPressureWeakChance'),
  extractFunctionSource(source, 'getAiInventoryPressureBonus'),
  extractFunctionSource(source, 'updateAiInventoryPressureForTurn'),
  extractFunctionSource(source, 'buildAiInventoryCandidatePlans'),
].join('\n\n');

const runScenario = (tacticalItemType) => {
  const logs = [];
  const inventoryCounts = { mine: 0, dynamite: 0, crosshair: 1, fuel: 0, wings: 0, invisible: 0 };
  inventoryCounts[tacticalItemType] = 2;

  const context = {
    Math, Number, Boolean, Object,
    AI_ENGINE_MODE: 'v2',
    AI_V2_INVENTORY_PHASE: 3,
    AI_INVENTORY_ACTION_DEBT_CONFIG: { triggerStreak: 3, maxDiscount: 0.05, recoverPerTurn: 0.01, growthPerReject: 0.02 },
    AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 2,
    FIELD_FLIGHT_DURATION_SEC: 1,
    MAX_DRAG_DISTANCE: 300,
    CELL_SIZE: 10,
    ATTACK_RANGE_PX: 120,
    INVENTORY_ITEM_TYPES: { MINE: 'mine', DYNAMITE: 'dynamite', FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisible' },
    settings: { flightRangeCells: 30, aimingAmplitude: 80 },
    aiRoundState: {
      turnNumber: 3,
      currentGoal: 'attack_enemy_plane',
      inventoryPhase: 3,
      inventoryPressure: null,
      inventoryIdleTurns: 2,
    },
    evaluateBlueInventoryState: () => ({ total: 3, counts: inventoryCounts }),
    getAiInventoryRecentMatchSignals: () => ({
      fallbackSelectedCount: 3,
      shotPlanNotFoundCount: 2,
      emergencyBaseDefenseCount: 0,
      repeatedFallbackSelected: true,
      repeatedShotPlanNotFound: true,
      emergencyPressure: false,
      softReleaseReady: true,
      softReleaseGuardScenario: { fallbackChainTurns: 3 },
    }),
    getBluePriorityEnemy: () => ({ id: 'enemy-1', x: 220, y: 0 }),
    getBaseAnchor: () => ({ x: 240, y: 0 }),
    getAiMoveLandingPoint: () => ({ x: 100, y: 0 }),
    getPlaneEffectiveRangePx: () => 120,
    isAiInventoryTooSmallRejectReason: () => false,
    getAiInventorySelectionFloor: () => ({
      baseSelectionFloor: 0.48,
      adjustedSelectionFloor: 0.48,
      unlockReasons: [],
    }),
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    isPathClear: () => true,
    evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, blockedByReturnSafety: false }),
    evaluateCrosshairBestUse: () => ({
      totalValue: 0.61,
      distanceToEnemy: 100,
      hasCleanPath: true,
      hitChance: 0.55,
      enemy: { id: 'enemy-1', x: 220, y: 0 },
    }),
    evaluateAiMineTacticalPlanDecision: () => ({
      minePlan: { placement: { x: 120, y: 0 }, score: 10.4 },
      mineImpactScore: 10.4,
      mineBlockedEscapeCount: 0,
      mineCutRouteCount: 0,
      mineTrapCount: 0,
      mineTotalDirectionLoss: 0.62,
      mineProjectedContactDelta: 0.21,
      mineForcedBadPathCount: 0,
      mineHasZoneControl: true,
      mineCreatesRouteDenial: false,
      minePlanProvidesNoticeableImprovement: false,
      mineModerateImprovement: true,
      mineRejectedBySelfRisk: false,
      mineRejectedByHardSelfRisk: false,
      mineRejectedByModerateSelfRisk: false,
      mineForcedSpendSurplus: true,
      aiItemSpendStyle: 'balanced',
      riskAcceptedBecause: null,
      mineMapControlSignal: true,
      mineRepeatedTurnThresholdRelief: true,
    }),
    tryPlaceBlueDefensiveMine: () => ({ plan: { placement: { x: 120, y: 0 }, score: 10.4 }, rejectReason: null }),
    tryPlaceBlueMineNearEnemyBase: () => ({ plan: null, rejectReason: 'no_install_window' }),
    buildAiMineSeriesPlan: () => null,
    evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: true, afterSafe: true }),
    isAiCriticalMineGoal: () => false,
    getAiItemSpendStyle: () => 'balanced',
    evaluateAiDynamiteTacticalTarget: () => ({
      routeAwareTarget: tacticalItemType === 'dynamite' ? { cx: 140, cy: 0, collider: { id: 'wall-1' }, replanResult: { expectedRoute: 'opened', usesOpenedCorridor: true, noticeableImprovement: true, moderateValidGain: true, scoreGain: 0.2, distanceGain: 15, accumulatedValue2Turns: 0.45, accumulatedValue3Turns: 0.52 } } : null,
      strategicMoveGate: { strongPlanReason: null, allowStrategicSetup: true },
      strategicDynamite: null,
      strategicTarget: null,
      futureAdvantageSignal: false,
      fallbackTarget: tacticalItemType === 'dynamite' ? { cx: 140, cy: 0, collider: { id: 'wall-1' } } : null,
    }),
    buildAiDynamiteSeriesPlan: () => null,
    shouldUseStrategicDynamiteForPlannedMove: () => ({ allowStrategicSetup: true, allowStrategicProbe: true, strongPlanReason: null }),
    getDynamiteCandidateForCurrentRoute: () => null,
    evaluateStrategicDynamiteTargets: () => null,
    doesStrategicDynamiteShowFutureAdvantage: () => false,
    getNearestDynamiteTargetToPoint: () => null,
    isDynamiteTargetUsefulForCurrentRoute: () => false,
    recordInventoryAiDecision: () => {},
    logAiDecision: (reason, details) => logs.push({ reason, details }),
  };

  vm.createContext(context);
  vm.runInContext(extracted, context);

  const planning = context.buildAiInventoryCandidatePlans({ enemies: [{ id: 'enemy-1', x: 220, y: 0 }], aiPlanes: [{ id: 'plane-1' }] }, {
    plane: { id: 'plane-1', x: 0, y: 0 },
    totalDist: 90,
    vx: 90,
    vy: 0,
    goalName: 'attack_enemy_plane',
  });

  assert(planning.selectedCandidate, `Expected selected candidate for ${tacticalItemType}.`);
  assert(planning.selectedCandidate.itemType === tacticalItemType,
    `Expected ${tacticalItemType} to win close competition against crosshair, got ${planning.selectedCandidate.itemType}.`);
  assert(planning.selectedCandidate.tacticalSurplusPriorityBonus > 0,
    `Expected tactical surplus bonus for ${tacticalItemType}.`);

  return { planning, logs };
};

const mineScenario = runScenario('mine');
const dynamiteScenario = runScenario('dynamite');

assert(mineScenario.planning.selectedCandidate.pressureReasonCode === 'tactical_pressure_choice',
  'Mine tactical pressure reason code must be set.');
assert(dynamiteScenario.planning.selectedCandidate.pressureReasonCode === 'tactical_pressure_choice',
  'Dynamite tactical pressure reason code must be set.');

console.log('Smoke test passed: tactical surplus bonus lets mine/dynamite beat close crosshair candidates under controlled risk.');
