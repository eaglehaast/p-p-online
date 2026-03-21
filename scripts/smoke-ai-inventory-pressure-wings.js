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
function assert(condition, message){ if(!condition) throw new Error(message); }

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

let turn = 0;
const logs = [];
const context = {
  Math, Number, Boolean, Object,
  AI_ENGINE_MODE: 'v2',
  AI_V2_INVENTORY_PHASE: 3,
  FIELD_FLIGHT_DURATION_SEC: 1,
  MAX_DRAG_DISTANCE: 300,
  CELL_SIZE: 10,
  ATTACK_RANGE_PX: 120,
  INVENTORY_ITEM_TYPES: { MINE: 'mine', DYNAMITE: 'dynamite', FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisible' },
  settings: { flightRangeCells: 30, aimingAmplitude: 80 },
  aiRoundState: {
    turnNumber: 0,
    currentGoal: 'capture_enemy_flag',
    inventoryPhase: 3,
    inventoryPressure: null,
  },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { mine: 1, dynamite: 0, fuel: 0, crosshair: 0, wings: 0, invisible: 0 } }),
  getBluePriorityEnemy: () => ({ id: 'enemy-2', x: 240, y: 40 }),
  getBaseAnchor: (color) => color === 'green' ? ({ x: 250, y: 50 }) : ({ x: 0, y: 0 }),
  getAiMoveLandingPoint: () => ({ x: 90, y: 30 }),
  getPlaneEffectiveRangePx: () => 120,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  isPathClear: () => true,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, blockedByReturnSafety: false }),
  evaluateCrosshairBestUse: () => null,
  tryPlaceBlueDefensiveMine: () => null,
  tryPlaceBlueMineNearEnemyBase: () => ({ placement: { x: 180, y: 55 }, scenario: 'mine_cover_plan', score: 4.6, blockedEscapeCount: 0, cutRouteCount: 0, trapCount: 0, totalDirectionLoss: 2.2 }),
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
  getDynamiteCandidateForCurrentRoute: () => null,
  getNearestDynamiteTargetToPoint: () => null,
  isDynamiteTargetUsefulForCurrentRoute: () => false,
  logAiDecision: (reason, details) => logs.push({ turn, reason, details }),
};
vm.createContext(context);
vm.runInContext(extracted, context);

for(turn = 1; turn <= 3; turn += 1){
  context.aiRoundState.turnNumber = turn;
  const result = context.buildAiInventoryCandidatePlans({
    shouldUseFlagsMode: true,
    availableEnemyFlags: [{ id: 'flag-1' }],
    enemies: [{ id: 'enemy-2', x: 240, y: 40 }],
    aiPlanes: [{ id: 'plane-2' }],
  }, {
    plane: { id: 'plane-2', x: 0, y: 0 },
    totalDist: 85,
    vx: 85,
    vy: 25,
    goalName: 'capture_enemy_flag',
  });
  if(turn < 3){
    assert(!result.selectedCandidate, `Mine(base) should still wait on turn ${turn}.`);
  }
  if(turn === 3){
    assert(result.selectedCandidate?.itemType === 'mine', 'Mine(base) should be selected after pressure buildup.');
    assert(result.selectedCandidate?.chosenBecauseOfPressure === true, 'Mine(base) selection should also be pressure-driven.');
  }
}

assert(logs.some((entry) => entry.reason === 'inventory_pressure_state' && entry.details?.itemType === 'mine' && entry.turn === 3), 'Expected mine pressure diagnostics on the winning turn.');
console.log('Smoke test passed: repeated weak mine plans near enemy base eventually become actionable under pressure.');
