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

const extracted = [
  extractConstBlock(source, 'AI_FALLBACK_STAGES'),
  extractConstBlock(source, 'AI_FALLBACK_REASON_CODES'),
  extractFunctionSource(source, 'hasStructuredFallbackDiagnostics'),
  extractFunctionSource(source, 'collectAiDecisionReasonCodes'),
  extractFunctionSource(source, 'isAiFallbackDecisionEvent'),
  extractFunctionSource(source, 'getAiInventoryRecentMatchSignals'),
  extractFunctionSource(source, 'maybeUseInventoryBeforeLaunch'),
].join('\n\n');

const logs = [];
const removed = [];
let dynamitePlaced = 0;
let minePlaced = 0;

const context = {
  Math,
  Number,
  Boolean,
  Object,
  Set,
  AI_INVENTORY_PLAN_B_NO_SHOT_THRESHOLD,
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
  getAiSelfAnalyzerSnapshot: () => ({
    activeMatch: {
      events: [
        { type: 'ai_decision', stage: 'v2_shot_plan_not_found', goal: 'attack_enemy_plane' },
        { type: 'ai_decision', stage: 'v2_shot_plan_not_found', goal: 'attack_enemy_plane' },
      ],
    },
  }),
  getBluePriorityEnemy: () => null,
  getBaseAnchor: () => ({ x: 300, y: 0 }),
  getAiMoveLandingPoint: () => ({ x: 60, y: 0 }),
  getPlaneEffectiveRangePx: () => 120,
  getEffectiveFlightRangeCells: () => 30,
  shouldProbeInventoryPreparedShotPlan: () => false,
  getAiItemSpendStyle: () => 'balanced',
  getAiStrategicTargetPoint: () => null,
  getAiStrategicGoalAnchor: () => null,
  getFallbackAiMove: () => null,
  getDefensiveFallbackMove: () => null,
  evaluateBlueInventoryState: () => ({
    total: 1,
    counts: { fuel: 0, crosshair: 0, mine: 0, dynamite: 1, invisible: 0, wings: 0 },
  }),
  dist: (a, b) => Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)),
  isPathClear: () => true,
  evaluateAiDynamiteTacticalTarget: (_ctx, _move, options = {}) => (
    options?.allowStrategicProbeWhenRouteAware === false
      ? {
        routeAwareTarget: {
          cx: 88,
          cy: 16,
          collider: { id: 'c-1' },
          replanResult: {
            moderateValidGain: true,
            noticeableImprovement: true,
            accumulatedValue2Turns: 0.31,
            expectedRoute: { id: 'r-1' },
          },
        },
      }
      : { routeAwareTarget: null }
  ),
  placeBlueDynamiteAt: () => {
    dynamitePlaced += 1;
    return true;
  },
  setAiDynamiteIntentFromCandidate: () => true,
  tryPlaceBlueDefensiveMine: () => {
    minePlaced += 1;
    return true;
  },
  evaluatePostLaunchSafetyWithMine: () => ({ afterSafe: true }),
  buildAiMineSeriesPlan: () => null,
  buildAiDynamiteSeriesPlan: () => null,
  shouldUseStrategicDynamiteForPlannedMove: () => ({ allowStrategicProbe: false, allowStrategicSetup: false, strongPlanReason: null }),
  doesStrategicDynamiteShowFutureAdvantage: () => false,
  removeItemFromInventory: (_color, itemType) => removed.push(itemType),
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  logTacticalItemFinalDecision: () => null,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, blockedByReturnSafety: false }),
  evaluateCrosshairBestUse: () => null,
  tryPlaceBlueMineNearEnemyBase: () => null,
  getFlagAnchor: () => null,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plannedMove = {
  plane: { id: 'blue-1', x: 0, y: 0, activeTurnBuffs: {} },
  vx: 80,
  vy: 0,
  totalDist: 80,
  goalName: 'attack_enemy_plane',
  decisionReason: 'standard_attack',
};

const used = context.maybeUseInventoryBeforeLaunch({ shouldUseFlagsMode: false, availableEnemyFlags: [] }, plannedMove);
assert(used === true, 'Expected forced inventory plan B to spend an item.');
assert(dynamitePlaced === 1, 'Forced plan B must prioritize safe dynamite first.');
assert(minePlaced === 0, 'Mine must not be attempted after successful dynamite in forced plan B mode.');
assert(removed.includes('dynamite'), 'Dynamite should be removed from inventory.');
assert(logs.some((entry) => entry.reason === 'inventory_plan_b_forced_mode'), 'Forced plan B activation must be logged.');
assert(logs.some((entry) => entry.reason === 'inventory_plan_b_forced_item_used' && entry.details?.itemType === 'dynamite'), 'Forced plan B item usage must be logged for dynamite.');
assert(logs.some((entry) => entry.details?.reasonCode === 'inventory_plan_b_forced_after_repeated_no_shot'), 'Dedicated reason_code must be present in diagnostics.');

console.log('Smoke test passed: two repeated v2_shot_plan_not_found signals force plan B and spend safe preparatory dynamite before fallback.');
