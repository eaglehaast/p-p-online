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

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found: ${name}`);
  return vm.runInNewContext(match[1], extraContext);
}

function extractConstBlock(source, constName){
  const signature = `const ${constName} =`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Const not found: ${constName}`);
  const bodyStart = source.indexOf('[', start) >= 0 && source.indexOf('[', start) < source.indexOf(';', start)
    ? source.indexOf('[', start)
    : source.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{' || source[i] === '[' || source[i] === '(') depth += 1;
    if(source[i] === '}' || source[i] === ']' || source[i] === ')') depth -= 1;
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
const AI_INVENTORY_PLAN_B_NO_SHOT_THRESHOLD = extractConstValue(source, 'AI_INVENTORY_PLAN_B_NO_SHOT_THRESHOLD');
const AI_MINE_FORCED_CADENCE_IDLE_TURN_THRESHOLD = extractConstValue(source, 'AI_MINE_FORCED_CADENCE_IDLE_TURN_THRESHOLD');
const AI_MINE_FORCED_CADENCE_NO_SHOT_THRESHOLD = extractConstValue(source, 'AI_MINE_FORCED_CADENCE_NO_SHOT_THRESHOLD');
const AI_MINE_FORCED_CADENCE_SOFT_RISK_BENEFIT_SCORE_MIN = extractConstValue(source, 'AI_MINE_FORCED_CADENCE_SOFT_RISK_BENEFIT_SCORE_MIN');

const extracted = [
  extractConstBlock(source, 'AI_FALLBACK_STAGES'),
  extractConstBlock(source, 'AI_FALLBACK_REASON_CODES'),
  extractConstBlock(source, 'AI_MINE_PLAN_THRESHOLDS'),
  extractFunctionSource(source, 'hasStructuredFallbackDiagnostics'),
  extractFunctionSource(source, 'collectAiDecisionReasonCodes'),
  extractFunctionSource(source, 'isAiFallbackDecisionEvent'),
  extractFunctionSource(source, 'getAiInventoryRecentMatchSignals'),
  extractFunctionSource(source, 'evaluateAiMineTacticalPlanDecision'),
  extractFunctionSource(source, 'maybeUseInventoryBeforeLaunch'),
].join('\n\n');

const logs = [];
const removed = [];
let minePlaced = 0;
let mineCount = 1;

const context = {
  Math,
  Number,
  Boolean,
  Object,
  Set,
  AI_INVENTORY_PLAN_B_NO_SHOT_THRESHOLD,
  AI_MINE_FORCED_CADENCE_IDLE_TURN_THRESHOLD,
  AI_MINE_FORCED_CADENCE_NO_SHOT_THRESHOLD,
  AI_MINE_FORCED_CADENCE_SOFT_RISK_BENEFIT_SCORE_MIN,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 99,
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
    CROSSHAIR: 'crosshair',
    MINE: 'mine',
    DYNAMITE: 'dynamite',
    INVISIBILITY: 'invisible',
    WINGS: 'wings',
  },
  settings: { flightRangeCells: 30, aimingAmplitude: 80 },
  CELL_SIZE: 10,
  ATTACK_RANGE_PX: 120,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  aiRoundState: {
    currentGoal: 'attack_enemy_plane',
    inventoryIdleTurns: 0,
    inventorySoftFallbackCooldown: 0,
    lastInventorySoftFallbackUsed: false,
  },
  getAiSelfAnalyzerSnapshot: () => ({ activeMatch: { events: [] } }),
  getBluePriorityEnemy: () => null,
  getBaseAnchor: () => ({ x: 300, y: 0 }),
  getAiMoveLandingPoint: () => ({ x: 60, y: 0 }),
  getPlaneEffectiveRangePx: () => 120,
  getEffectiveFlightRangeCells: () => 30,
  shouldProbeInventoryPreparedShotPlan: () => false,
  getAiItemSpendStyle: () => 'balanced',
  getMineRiskStyleConfig: () => ({ ALLOW_MODERATE_RISK_WITH_ROUTE_DENIAL: false }),
  getMineRiskAcceptedBecause: () => null,
  isAiCriticalMineGoal: () => false,
  getAiStrategicTargetPoint: () => null,
  getAiStrategicGoalAnchor: () => null,
  getFallbackAiMove: () => null,
  getDefensiveFallbackMove: () => null,
  evaluateBlueInventoryState: () => ({
    total: mineCount,
    counts: { fuel: 0, crosshair: 0, mine: mineCount, dynamite: 0, invisible: 0, wings: 0 },
  }),
  dist: (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)),
  isPathClear: () => true,
  evaluateAiDynamiteTacticalTarget: () => ({ routeAwareTarget: null, strategicMoveGate: { allowStrategicProbe: false, allowStrategicSetup: false } }),
  placeBlueDynamiteAt: () => false,
  setAiDynamiteIntentFromCandidate: () => true,
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    if(options?.evaluateOnly) return { plan: { score: 2.9, blockedEscapeCount: 1, cutRouteCount: 1, trapCount: 0, totalDirectionLoss: 0.62, projectedContactDelta: 0.22, forcedBadPathCount: 0, controlledBasePassCount: 0, controlledTurnPointCount: 1, placement: { x: 42, y: 12 }, scenario: 'forced_cadence_probe' } };
    minePlaced += 1;
    return true;
  },
  tryPlaceBlueMineNearEnemyBase: () => null,
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
  buildAiMineSeriesPlan: () => null,
  buildAiDynamiteSeriesPlan: () => null,
  shouldUseStrategicDynamiteForPlannedMove: () => ({ allowStrategicProbe: false, allowStrategicSetup: false, strongPlanReason: null }),
  doesStrategicDynamiteShowFutureAdvantage: () => false,
  removeItemFromInventory: (_color, itemType) => {
    removed.push(itemType);
    if(itemType === 'mine') mineCount = Math.max(0, mineCount - 1);
  },
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  logTacticalItemFinalDecision: () => null,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, blockedByReturnSafety: false }),
  evaluateCrosshairBestUse: () => null,
  getFlagAnchor: () => null,
};

vm.createContext(context);
vm.runInContext(extracted, context);

function makePlannedMove(){
  return {
    plane: { id: 'blue-1', x: 0, y: 0, activeTurnBuffs: {} },
    vx: 80,
    vy: 0,
    totalDist: 80,
    goalName: 'attack_enemy_plane',
    decisionReason: 'standard_attack',
  };
}

context.aiRoundState.inventoryIdleTurns = AI_MINE_FORCED_CADENCE_IDLE_TURN_THRESHOLD - 1;
mineCount = 1;
const logsBeforeThreshold = logs.length;
context.maybeUseInventoryBeforeLaunch({ shouldUseFlagsMode: false, availableEnemyFlags: [] }, makePlannedMove());
assert(
  !logs.slice(logsBeforeThreshold).some((entry) => entry.reason === 'inventory_forced_cadence_item_used'),
  'Mine forced cadence should not fire before idle threshold.',
);

context.aiRoundState.inventoryIdleTurns = AI_MINE_FORCED_CADENCE_IDLE_TURN_THRESHOLD;
mineCount = 1;
const usedOnSecondIdleTurn = context.maybeUseInventoryBeforeLaunch({ shouldUseFlagsMode: false, availableEnemyFlags: [] }, makePlannedMove());
assert(usedOnSecondIdleTurn === true, 'Mine forced cadence must spend single mine on 2nd empty turn.');

context.aiRoundState.inventoryIdleTurns = AI_MINE_FORCED_CADENCE_IDLE_TURN_THRESHOLD + 1;
mineCount = 1;
const usedOnThirdIdleTurn = context.maybeUseInventoryBeforeLaunch({ shouldUseFlagsMode: false, availableEnemyFlags: [] }, makePlannedMove());
assert(usedOnThirdIdleTurn === true, 'Mine forced cadence must spend single mine on 3rd empty turn.');

const forcedCadenceUsageLogs = logs.filter((entry) => entry.reason === 'inventory_forced_cadence_item_used' && entry.details?.reasonCode === 'mine_forced_cadence');
assert(forcedCadenceUsageLogs.length >= 2, 'Forced cadence should spend mine on both 2nd and 3rd empty turns when one mine is available.');
assert(removed.filter((item) => item === 'mine').length >= 2, 'Single mine should be consumed on each forced cadence trigger turn.');

console.log('Smoke test passed: mine_forced_cadence_mode spends a single mine on 2nd/3rd empty turns and logs reasonCode mine_forced_cadence.');
