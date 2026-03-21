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
  extractFunctionSource(source, 'buildAiInventoryCandidatePlans'),
  extractFunctionSource(source, 'maybeUseInventoryBeforeLaunch'),
].join('\n\n');

let chosenPlan = null;
const logs = [];

const context = {
  Math,
  Number,
  Boolean,
  Infinity,
  CELL_SIZE: 10,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 2,
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
    CROSSHAIR: 'crosshair',
    MINE: 'mine',
    DYNAMITE: 'dynamite',
  },
  aiRoundState: {
    lastInventorySoftFallbackUsed: false,
    inventoryIdleTurns: 0,
    inventorySoftFallbackCooldown: 0,
  },
  evaluateBlueInventoryState: () => ({
    total: 1,
    counts: { fuel: 0, crosshair: 0, mine: 1, dynamite: 0 },
  }),
  getBluePriorityEnemy: () => ({ id: 'enemy-1', x: 200, y: 0, shieldActive: false }),
  getAiMoveLandingPoint: () => ({ x: 120, y: 0 }),
  getAiStrategicTargetPoint: () => ({ x: 200, y: 0 }),
  evaluateFlagPickupContinuation: () => null,
  evaluateMineEnabledFlagPickupContinuation: () => null,
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: true, afterSafe: true }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateCrosshairBestUse: () => null,
  getAvailableFlagsByColor: () => [],
  getFlagAnchor: () => null,
  applyItemToOwnPlane: () => false,
  removeItemFromInventory: () => { chosenPlan = chosenPlan || 'removed'; },
  tryPlaceBlueDefensiveMine: (_ctx, _move, options = {}) => {
    if(options.evaluateOnly) return { scenario: 'mine_creates_trap', score: 18, blockedEscapeCount: 1, cutRouteCount: 1, trapCount: 1, totalDirectionLoss: 3 };
    chosenPlan = 'defensive';
    return true;
  },
  tryPlaceBlueMineNearEnemyBase: (_ctx, _move, options = {}) => {
    if(options.evaluateOnly) return { scenario: 'mine_cuts_best_route', score: 5, blockedEscapeCount: 0, cutRouteCount: 1, trapCount: 0, totalDirectionLoss: 1 };
    chosenPlan = 'base';
    return true;
  },
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  getPlaneEffectiveRangePx: () => 100,
  getEffectiveFlightRangeCells: () => 30,
  settings: { aimingAmplitude: 80, flightRangeCells: 30 },
  ATTACK_RANGE_PX: 100,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  isPathClear: () => false,
  getDynamiteCandidateForCurrentRoute: () => null,
  getNearestDynamiteTargetToPoint: () => null,
  isDynamiteTargetUsefulForCurrentRoute: () => false,
  placeBlueDynamiteAt: () => false,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plannedMove = {
  plane: { id: 'plane-1', x: 0, y: 0 },
  vx: 0,
  vy: 0,
  totalDist: 80,
};
const planning = context.buildAiInventoryCandidatePlans({ aiRiskProfile: { profile: 'balanced' }, enemies: [] }, plannedMove);
assert(planning.selectedCandidate, 'Mine plan should be selected during early inventory candidate generation.');
plannedMove.selectedInventoryCandidate = planning.selectedCandidate;
const used = context.maybeUseInventoryBeforeLaunch({ aiRiskProfile: { profile: 'balanced' }, enemies: [] }, plannedMove);

assert(used === true, 'Mine should be used when trap plan is much stronger than base mine.');
assert(chosenPlan === 'defensive', 'AI must choose the trapping defensive mine over the weaker base mine.');
const placementLog = logs.find((entry) => entry.reason === 'inventory_decision');
assert(Boolean(placementLog), 'Execution log for the preselected mine plan must be recorded.');
assert(placementLog.details.itemType === 'mine', 'Execution log must report the mine item.');

console.log('Smoke test passed: inventory logic prefers a trapping mine over a weaker base mine.');
