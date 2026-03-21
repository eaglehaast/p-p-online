#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extract(source, name){
  const sig = `function ${name}(`;
  const start = source.indexOf(sig);
  if(start === -1) throw new Error(`Function not found: ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body not found: ${name}`);
}

function assert(condition, message){ if(!condition) throw new Error(message); }

const source = fs.readFileSync('script.js', 'utf8');
const extracted = [
  'buildAiInventoryCandidatePlans',
  'maybeUseInventoryBeforeLaunch',
].map((name) => extract(source, name)).join('\n\n');

const logs = [];
let appliedItem = null;
const context = {
  Math,
  Number,
  Boolean,
  Infinity,
  FIELD_FLIGHT_DURATION_SEC: 1,
  MAX_DRAG_DISTANCE: 100,
  CELL_SIZE: 40,
  ATTACK_RANGE_PX: 60,
  AI_ENGINE_MODE: 'v2',
  AI_V2_INVENTORY_PHASE: 3,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 2,
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', MINE: 'mine', DYNAMITE: 'dynamite', INVISIBILITY: 'invisible', WINGS: 'wings' },
  aiRoundState: { inventoryPhase: 3, inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0, lastInventorySoftFallbackUsed: false, currentGoal: 'capture_enemy_flag' },
  settings: { flightRangeCells: 2, aimingAmplitude: 80 },
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 1, crosshair: 0, mine: 0, dynamite: 0, invisible: 0, wings: 0 } }),
  getBluePriorityEnemy: () => ({ id: 'enemy-1', x: 130, y: 0, isAlive: true, burning: false }),
  getBaseAnchor: (color) => color === 'green' ? ({ x: 150, y: 0 }) : ({ x: 0, y: 0 }),
  getAiMoveLandingPoint: () => ({ x: 70, y: 0 }),
  getPlaneEffectiveRangePx: () => 70,
  getEffectiveFlightRangeCells: () => 4,
  getAvailableFlagsByColor: () => [{ id: 'flag-1', color: 'green' }],
  getFlagAnchor: () => ({ x: 150, y: 0 }),
  evaluateFuelTacticalPlans: (_ctx, _move, options = {}) => options.useFuel
    ? { selectedCandidate: { scenario: 'fuel_flag_steal_return', targetPoint: { x: 150, y: 0 }, targetName: 'enemy_flag', returnSafetyScore: 0.82 }, returnSafetyScore: 0.82, blockedByReturnSafety: false }
    : { selectedCandidate: null, returnSafetyScore: 0.1, blockedByReturnSafety: false },
  evaluateCrosshairBestUse: () => null,
  tryPlaceBlueDefensiveMine: () => null,
  tryPlaceBlueMineNearEnemyBase: () => null,
  evaluatePostLaunchSafetyWithMine: () => ({ afterSafe: true }),
  getDynamiteCandidateForCurrentRoute: () => null,
  getNearestDynamiteTargetToPoint: () => null,
  isDynamiteTargetUsefulForCurrentRoute: () => false,
  placeBlueDynamiteAt: () => false,
  queueInvisibilityEffectForPlayer: () => false,
  applyItemToOwnPlane: (itemType) => { appliedItem = itemType; return true; },
  removeItemFromInventory: () => {},
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  dist: (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0)),
  isPathClear: () => true,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plannedMove = { plane: { id: 'plane-1', x: 0, y: 0 }, vx: 70, vy: 0, totalDist: 70, goalName: 'capture_enemy_flag' };
const planning = context.buildAiInventoryCandidatePlans({ shouldUseFlagsMode: true, availableEnemyFlags: [{ id: 'flag-1' }], enemies: [{ x: 120, y: 0 }], aiPlanes: [{ id: 'plane-1' }] }, plannedMove);
assert(planning.selectedCandidate, 'Ожидался ранний выбор inventory-плана.');
assert(planning.selectedCandidate.itemType === 'fuel', 'Ранний план должен выбрать fuel как более сильный вариант.');
plannedMove.selectedInventoryCandidate = planning.selectedCandidate;
const used = context.maybeUseInventoryBeforeLaunch({ shouldUseFlagsMode: true, availableEnemyFlags: [{ id: 'flag-1' }], enemies: [{ x: 120, y: 0 }], aiPlanes: [{ id: 'plane-1' }], aiRiskProfile: { profile: 'balanced' } }, plannedMove);
assert(used === true, 'Поздний этап должен только исполнить уже выбранный inventory-план.');
assert(appliedItem === 'fuel', 'Должен быть применён именно заранее выбранный fuel-план.');
assert(logs.some((entry) => entry.reason === 'inventory_candidate_generated' && entry.details.itemType === 'fuel'), 'Нужен лог генерации inventory-кандидата.');
assert(logs.some((entry) => entry.reason === 'inventory_decision' && entry.details.source === 'selected_inventory_candidate'), 'Нужен лог исполнения заранее выбранного inventory-плана.');

console.log('Smoke test passed: AI selects inventory plan early and later only executes the chosen fuel plan.');
