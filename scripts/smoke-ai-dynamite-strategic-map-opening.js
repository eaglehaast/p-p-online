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
  'isPathClearIgnoringColliderById',
  'getDynamiteCandidateForCurrentRoute',
  'countDynamiteStrategicRouteOptions',
  'evaluateStrategicDynamiteTargets',
  'buildAiInventoryCandidatePlans',
  'maybeUseInventoryBeforeLaunch',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const logs = [];
let removed = 0;
let planted = 0;

const plane = { id: 'plane-2', x: 80, y: 0 };
const landing = { x: 120, y: 0 };
const homeBase = { x: 0, y: 0 };
const enemyBase = { x: 260, y: 0 };
const enemy = { id: 'enemy-2', x: 260, y: 80, shieldActive: false, isAlive: true };
const collider = { id: 'wall-home', blockedTargets: ['home'] };
const geometry = { id: 'sprite-home', cx: 40, cy: 0, collider };

const context = {
  Math, Number, Boolean, Infinity, Set,
  CELL_SIZE: 10,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  ATTACK_RANGE_PX: 100,
  AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD: 99,
  AI_ENGINE_MODE: 'v2',
  AI_V2_INVENTORY_PHASE: 3,
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR: 'crosshair', MINE: 'mine', DYNAMITE: 'dynamite', INVISIBILITY: 'invisible', WINGS: 'wings' },
  AI_INVENTORY_PRESSURE_CONFIG: { dynamite: { selectionFloor: 0.19 } },
  aiRoundState: { currentGoal: 'return_with_flag', inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0, lastInventorySoftFallbackUsed: false, turnNumber: 8 },
  settings: { aimingAmplitude: 80, flightRangeCells: 30 },
  currentMapSprites: ['home-wall'],
  colliders: [collider],
  getMapSpriteGeometry: () => geometry,
  getAiMoveLandingPoint: () => landing,
  getAiStrategicTargetPoint: () => ({ x: 200, y: 0 }),
  getBluePriorityEnemy: () => enemy,
  getBaseAnchor: (color) => color === 'green' ? enemyBase : homeBase,
  getFlagAnchor: () => null,
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 0, crosshair: 0, mine: 0, dynamite: 1, invisible: 0, wings: 0 } }),
  getPlaneEffectiveRangePx: () => 100,
  getEffectiveFlightRangeCells: () => 30,
  evaluateFuelTacticalPlans: () => ({ selectedCandidate: null, rejectedScenarios: [], returnSafetyScore: 0, requiredReturnSafetyThreshold: 0, actualReturnSafetyScore: 0 }),
  evaluateCrosshairBestUse: () => null,
  getAvailableFlagsByColor: () => [],
  applyItemToOwnPlane: () => false,
  queueInvisibilityEffectForPlayer: () => false,
  removeItemFromInventory: () => { removed += 1; },
  tryPlaceBlueDefensiveMine: () => null,
  tryPlaceBlueMineNearEnemyBase: () => null,
  evaluateFlagPickupContinuation: () => null,
  evaluateMineEnabledFlagPickupContinuation: () => null,
  evaluatePostLaunchSafetyWithMine: () => ({ beforeSafe: false, afterSafe: false }),
  updateAiInventoryPressureForTurn: () => ({ byItem: {}, stalestItemType: null }),
  getAiInventoryPressureBonus: () => 0,
  isAiInventoryPressureWeakChance: () => false,
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  findFirstColliderHit: () => null,
  checkLineIntersectionWithCollider(x1, y1, x2, y2, testCollider){
    if(testCollider?.id !== 'wall-home') return false;
    return x2 === homeBase.x && y2 === homeBase.y;
  },
  isPathClear(x1, y1, x2, y2){
    if(x2 === homeBase.x && y2 === homeBase.y) return !(x1 === plane.x && y1 === plane.y);
    return true;
  },
  placeBlueDynamiteAt(){ planted += 1; return true; },
};

vm.createContext(context);
vm.runInContext(extracted, context);

const gameContext = {
  aiRiskProfile: { profile: 'balanced' },
  homeBase,
  enemies: [enemy],
  availableEnemyFlags: [],
  shouldUseFlagsMode: false,
  aiPlanes: [plane],
};
const plannedMove = { plane, totalDist: 40, goalName: 'return_with_flag' };

const planning = context.buildAiInventoryCandidatePlans(gameContext, plannedMove);
plannedMove.selectedInventoryCandidate = planning.selectedCandidate;
const used = context.maybeUseInventoryBeforeLaunch(gameContext, plannedMove);

assert(planning.selectedCandidate, 'Expected a dynamite candidate for strategic map opening.');
assert(planning.selectedCandidate.reason === 'dynamite_used_for_map_opening', `Expected map-opening reason, got ${planning.selectedCandidate.reason}.`);
assert(planning.selectedCandidate.strategicDynamiteReasons.opensPathToBase === true, 'Candidate must explicitly open the path to base.');
assert(used === true, 'AI should spend dynamite to reopen the base corridor.');
assert(removed === 1 && planted === 1, 'Dynamite should be planted exactly once.');
assert(logs.some((entry) => entry.reason === 'dynamite_used_for_map_opening'), 'Strategic map-opening log must be written.');

console.log('Smoke test passed: AI uses strategic dynamite to reopen the base corridor even when the current route is already possible.');
