#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const paramsStart = source.indexOf('(', start);
  let parenDepth = 0;
  let bodyStart = -1;
  for(let i = paramsStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') parenDepth += 1;
    if(ch === ')'){
      parenDepth -= 1;
      if(parenDepth === 0){
        bodyStart = source.indexOf('{', i);
        break;
      }
    }
  }
  if(bodyStart === -1) throw new Error(`Function body start not found for: ${fnName}`);
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
  'countDynamiteStrategicRouteOptions',
  'evaluateStrategicDynamiteTargets',
  'doesStrategicDynamiteShowFutureAdvantage',
  'evaluateAiDynamiteTacticalTarget',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const plane = { id: 'plane-medium', x: 0, y: 0 };
const landing = { x: 40, y: 0 };
const enemyBase = { x: 220, y: 60 };
const homeBase = { x: -220, y: 0 };
const enemy = { id: 'enemy-1', x: 220, y: -60, shieldActive: false, isAlive: true };
const colliders = [{ id: 'wall-main' }];
const geometries = { wall: { id: 'sprite-main', cx: 110, cy: 0, collider: colliders[0] } };

const logs = [];

const context = {
  Math, Number, Boolean, Infinity,
  CELL_SIZE: 10,
  ATTACK_RANGE_PX: 100,
  aiRoundState: { currentGoal: 'neutral_positioning' },
  settings: { flightRangeCells: 30 },
  INVENTORY_ITEM_TYPES: { DYNAMITE: 'dynamite' },
  currentMapSprites: ['wall'],
  colliders,
  getMapSpriteGeometry: (sprite) => geometries[sprite] || null,
  getAiMoveLandingPoint: () => landing,
  getAiItemSpendStyle: () => 'balanced',
  getAiStrategicTargetPoint: () => ({ x: 170, y: 0 }),
  getBluePriorityEnemy: () => enemy,
  getBaseAnchor: (color) => (color === 'green' ? enemyBase : homeBase),
  getFlagAnchor: () => null,
  evaluateBlueInventoryState: () => ({ counts: { dynamite: 1 } }),
  getPlaneEffectiveRangePx: () => 100,
  getAiInventoryRecentMatchSignals: () => ({
    repeatedFallbackSelected: false,
    repeatedShotPlanNotFound: false,
    softReleaseReady: false,
    softReleaseGuardScenario: { fallbackChainTurns: 0 },
  }),
  isPathClear(x1, y1, x2, y2){
    if(x1 === plane.x && y1 === plane.y){
      if((x2 === enemyBase.x && y2 === enemyBase.y) || (x2 === enemy.x && y2 === enemy.y)) return false;
      if(x2 === 170 && y2 === 0) return true;
    }
    if(x1 === landing.x && y1 === landing.y){
      if((x2 === enemyBase.x && y2 === enemyBase.y) || (x2 === enemy.x && y2 === enemy.y)) return false;
    }
    return true;
  },
  checkLineIntersectionWithCollider(x1, y1, x2, y2, collider){
    if(!collider || collider.id !== 'wall-main') return false;
    if(x1 === plane.x && y1 === plane.y){
      if((x2 === enemyBase.x && y2 === enemyBase.y) || (x2 === enemy.x && y2 === enemy.y)) return true;
    }
    if(x1 === landing.x && y1 === landing.y){
      if((x2 === enemyBase.x && y2 === enemyBase.y) || (x2 === enemy.x && y2 === enemy.y)) return true;
    }
    return false;
  },
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  logAiDecision: (reason, details) => logs.push({ reason, details }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const gameContext = {
  homeBase,
  enemies: [enemy],
  availableEnemyFlags: [],
  shouldUseFlagsMode: false,
};
const plannedMove = {
  plane,
  totalDist: 50,
  score: 0.29,
  goalName: 'neutral_positioning',
  decisionReason: 'reposition_for_next_lane',
  routeClass: 'curve',
};

const decision = context.evaluateAiDynamiteTacticalTarget(gameContext, plannedMove, {
  allowStrategicProbeWhenRouteAware: false,
  availableCharges: 1,
});

assert(decision.routeAwareTarget === null, 'Scenario should avoid current-route dynamite target.');
assert(decision.strategicTarget, 'Expected strategic target for medium move follow-up route.');
assert((decision.strategicTarget.nextTurnRouteGain || 0) >= 2, 'Expected clear next-turn route gain from the blast.');
assert(context.doesStrategicDynamiteShowFutureAdvantage(decision.strategicDynamite) === true,
  'Future-advantage signal should be true for this medium move scenario.');

// Имитация применения в рамках smoke-проверки.
const applied = Boolean(decision.strategicTarget?.collider?.id);
assert(applied === true, 'Dynamite should be applicable in medium move follow-up scenario.');

console.log('Smoke test passed: medium move has strategic dynamite target that opens a clear short follow-up route.');
