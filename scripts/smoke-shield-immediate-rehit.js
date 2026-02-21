#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
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

const gameSource = fs.readFileSync('script.js', 'utf8');
const extracted = [
  'resolveFlightSurfaceCollision',
  'checkPlaneHits',
].map((name) => extractFunctionSource(gameSource, name)).join('\n\n');

let shieldHitUsed = false;
const defender = {
  color: 'blue',
  isAlive: true,
  burning: false,
  shieldActive: true,
  lifeState: 'destroyed_arcade_ready',
  respawnPenaltyActive: false,
  respawnHalfTurnsRemaining: 0,
  respawnStage: 3,
  respawnState: 'at_base',
  x: 5,
  y: 0,
};
const attacker = { color: 'green', isAlive: true, burning: false, x: 0, y: 0 };
const fp = { plane: attacker, vx: 20, vy: 0, lastHitPlane: null, lastHitCooldown: 0 };

const context = {
  Math,
  Number,
  settings: { sharpEdges: false, arcadeMode: true },
  selectedRuleset: 'advanced',
  isAdvancedLikeRuleset: (ruleset) => ruleset === 'advanced',
  isArcadePlaneRespawnEnabled: () => context.settings.arcadeMode === true && context.isAdvancedLikeRuleset(context.selectedRuleset),
  PLANE_LIFE_STATES: {
    ALIVE: 'alive',
    DESTROYED_ARCADE_READY: 'destroyed_arcade_ready',
  },
  getPlaneLifeState: (plane) => plane?.lifeState || (plane?.isAlive ? 'alive' : 'destroyed_classic'),
  POINT_RADIUS: 10,
  SLIDE_THRESHOLD: 0.3,
  PLANE_HIT_COOLDOWN_SEC: 0.2,
  currentMapName: 'smoke-test',
  DEBUG_COLLISIONS_VERBOSE: false,
  DEBUG_COLLISIONS_TOI: false,
  points: [defender],
  flyingPoints: [],
  isGameOver: false,
  findFirstSurfaceHit: () => null,
  findFirstShieldHit: () => {
    if(shieldHitUsed) return null;
    shieldHitUsed = true;
    return {
      t: 0.25,
      surface: { type: 'shield' },
      victim: defender,
      normal: { x: -1, y: 0 },
    };
  },
  isPointIntersectingSurface: () => false,
  destroyPlane: () => {
    throw new Error('destroyPlane should not be called in this smoke scenario');
  },
  logCollisionVerbose: () => {},
  logCollisionTOI: () => {},
  getPlaneDebugId: () => 'smoke-plane',
  isPlaneTargetable: (plane) => Boolean(plane && plane.isAlive && !plane.burning),
  getPlaneHitbox: (plane) => ({ x: plane.x, y: plane.y, radius: 10 }),
  planeHitboxesIntersect: () => true,
  getPlaneHitContactPoint: (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
  eliminatePlaneCalls: 0,
  eliminatePlane: (plane) => {
    context.eliminatePlaneCalls += 1;
    plane.isAlive = false;
  },
  spawnExplosionForPlane: () => {},
  awardPoint: () => {},
  checkVictory: () => {},
  canAwardKillPointForPlane: () => false,
  markPlaneKillPointAwarded: () => {},
  getFlagById: () => null,
  isFlagActive: () => false,
  dropFlagAtPosition: () => {},
  clearFlagFromPlane: () => {},
};

vm.createContext(context);
vm.runInContext(extracted, context);

context.resolveFlightSurfaceCollision(fp, attacker.x, attacker.y, 1);
assert(defender.shieldActive === false, 'Shield hit should disable defender shield.');
assert(defender._shieldAlphaCurrent === 0, 'Shield hit should reset shield alpha.');
assert(fp.lastHitPlane === null, 'Shield reflection must not set lastHitPlane anti-repeat marker.');
assert(fp.lastHitCooldown === 0, 'Shield reflection must not set lastHitCooldown.');
assert(defender.lifeState === context.PLANE_LIFE_STATES.ALIVE, 'Shield break should convert respawn-ready plane into normal alive state.');

context.checkPlaneHits(attacker, fp);
assert(context.eliminatePlaneCalls === 1, 'Immediate re-hit after shield break should eliminate defender.');
assert(fp.lastHitPlane === defender, 'Combat plane hit should set anti-repeat marker.');
assert(fp.lastHitCooldown === context.PLANE_HIT_COOLDOWN_SEC, 'Combat plane hit should set anti-repeat cooldown.');

console.log('Smoke test passed: shield hit clears shield, immediate re-hit still eliminates target, cooldown is set only on combat hit.');
