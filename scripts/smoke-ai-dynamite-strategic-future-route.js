#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);

  let headerDepth = 0;
  let headerEnd = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') headerDepth += 1;
    if(ch === ')'){
      headerDepth -= 1;
      if(headerDepth === 0){
        headerEnd = i;
        break;
      }
    }
  }
  if(headerEnd === -1) throw new Error(`Function header end not found for: ${fnName}`);

  const bodyStart = source.indexOf('{', headerEnd);
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
  'classifyAiMoveForStrategicDynamite',
  'shouldUseStrategicDynamiteForPlannedMove',
  'doesStrategicDynamiteShowFutureAdvantage',
  'evaluateAiDynamiteTacticalTarget',
  'getAiInventorySeriesIntent',
  'withTemporarilyIgnoredDynamiteColliders',
  'buildAiDynamiteSeriesPlan',
  'getDynamiteCandidateForCurrentRoute',
  'countDynamiteStrategicRouteOptions',
  'evaluateStrategicDynamiteTargets',
  'buildDynamiteCandidateSubscores',
  'buildAiInventoryCandidatePlans',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const logs = [];
let removed = 0;
let planted = [];

const plane = { id: 'plane-1', x: 0, y: 0 };
const landing = { x: 40, y: 0 };
const contactEnemy = { id: 'enemy-1', x: 220, y: 0, shieldActive: false, isAlive: true };
const enemyBase = { x: 200, y: 50 };
const homeBase = { x: 0, y: 0 };
const flagAnchor = { x: 200, y: -50 };
const colliders = [
  { id: 'wall-route', blockedTargets: ['route'] },
  { id: 'wall-strategic', blockedTargets: ['enemy', 'flag', 'enemyBase'] },
];
const geometries = {
  strategic: { id: 'sprite-strategic', cx: 120, cy: 0, collider: colliders[1] },
  route: { id: 'sprite-route', cx: 80, cy: 0, collider: colliders[0] },
};

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
  aiRoundState: { currentGoal: 'pressure_enemy', inventoryIdleTurns: 0, inventorySoftFallbackCooldown: 0, lastInventorySoftFallbackUsed: false, turnNumber: 7 },
  settings: { aimingAmplitude: 80, flightRangeCells: 30 },
  currentMapSprites: ['strategic', 'route'],
  colliders,
  getMapSpriteGeometry: (sprite) => geometries[sprite] || null,
  getAiMoveLandingPoint: () => landing,
  getAiItemSpendStyle: () => 'balanced',
  getAiStrategicTargetPoint: () => ({ x: 160, y: 40 }),
  getBluePriorityEnemy: () => contactEnemy,
  getBaseAnchor: (color) => color === 'green' ? enemyBase : homeBase,
  getFlagAnchor: () => flagAnchor,
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
  getAiInventorySelectionFloor: () => ({ passes: true, floor: 0, adjustedBenefit: 0.9 }),
  isAiInventoryPressureWeakChance: () => false,
  AI_INVENTORY_PRESSURE_CONFIG: { dynamite: { selectionFloor: 0.19 } },
  recordInventoryAiDecision: () => {},
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  markSoftFallbackUse: () => false,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  findFirstColliderHit: () => ({ collider: colliders[0] }),
  checkLineIntersectionWithCollider(x1, y1, x2, y2, collider){
    if(!collider) return false;
    if(x1 === plane.x && y1 === plane.y && x2 === 160 && y2 === 40) return collider.id === 'wall-route';
    if(x1 === plane.x && y1 === plane.y && x2 === enemyBase.x && y2 === enemyBase.y) return collider.id === 'wall-strategic';
    if(x1 === plane.x && y1 === plane.y && x2 === flagAnchor.x && y2 === flagAnchor.y) return collider.id === 'wall-strategic';
    if(x1 === plane.x && y1 === plane.y && x2 === contactEnemy.x && y2 === contactEnemy.y) return collider.id === 'wall-strategic';
    if(x1 === landing.x && y1 === landing.y && (x2 === enemyBase.x || x2 === flagAnchor.x || x2 === contactEnemy.x)) return collider.id === 'wall-strategic';
    return false;
  },
  isPathClear(x1, y1, x2, y2){
    if(x1 === plane.x && y1 === plane.y && x2 === 160 && y2 === 40) return true;
    if((x1 === plane.x && y1 === plane.y) || (x1 === landing.x && y1 === landing.y)){
      if((x2 === enemyBase.x && y2 === enemyBase.y) || (x2 === flagAnchor.x && y2 === flagAnchor.y) || (x2 === contactEnemy.x && y2 === contactEnemy.y)) return false;
    }
    return true;
  },
  placeBlueDynamiteAt(x, y){ planted.push({ x, y }); return true; },
};

vm.createContext(context);
vm.runInContext(extracted, context);

const gameContext = {
  aiRiskProfile: { profile: 'balanced' },
  homeBase,
  enemies: [contactEnemy],
  availableEnemyFlags: [{ id: 'flag-1' }],
  shouldUseFlagsMode: true,
  aiPlanes: [plane],
};
const plannedMove = { plane, totalDist: 40, goalName: 'pressure_enemy' };

const planning = context.buildAiInventoryCandidatePlans(gameContext, plannedMove);

assert(planning.selectedCandidate, 'Expected a dynamite candidate to be generated.');
assert(planning.selectedCandidate.reason === 'dynamite_used_for_future_route_gain', `Expected future-route reason, got ${planning.selectedCandidate.reason}.`);
assert(planning.selectedCandidate.dynamiteUseClass === 'strategic_map_opening', 'Expected strategic dynamite class.');
assert((planning.selectedCandidate.dynamiteSubscores?.expectedNearTermWin || 0) >= 0.3,
  'Expected explicit near-term (2 turns) benefit score in diagnostics.');
assert((planning.selectedCandidate.dynamiteSubscores?.total || 0) >= (planning.selectedCandidate.dynamiteSubscores?.threshold || Infinity),
  'Future-route candidate must pass total subscore threshold.');
assert(logs.some((entry) => entry.reason === 'inventory_candidate_generated' && entry.details?.itemType === 'dynamite'),
  'Strategic future-route candidate should appear in diagnostics log.');

context.currentMapSprites = [];
const noEffectDecision = context.buildAiInventoryCandidatePlans(gameContext, {
  ...plannedMove,
  goalName: 'neutral_wait',
});
const noEffectReason = noEffectDecision.rejected.find((entry) => entry.itemType === context.INVENTORY_ITEM_TYPES.DYNAMITE)?.reason || null;
assert(noEffectDecision.selectedCandidate == null, 'When there is no effect target, dynamite must not be selected.');
assert(noEffectReason === 'dynamite_no_useful_target' || noEffectReason === 'dynamite_no_current_route_target',
  `Expected explicit no-benefit rejection reason, got ${noEffectReason}.`);

console.log('Smoke test passed: AI uses strategic dynamite to improve the next-turn route tree.');
