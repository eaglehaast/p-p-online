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
const functionNames = [
  'isArcadePlaneRespawnEnabled',
  'isBaseInvulnerabilityEnabled',
  'isPlaneAtBase',
  'isPlaneTargetable',
  'angleDiffDeg',
  'handleAAForPlane',
  'handleMineForPlane',
  'checkPlaneHits',
];
const extracted = functionNames.map((name) => extractFunctionSource(gameSource, name)).join('\n\n');

const context = {
  settings: { arcadeMode: true, arcadeBaseInvulnerability: false },
  selectedRuleset: 'advanced',
  isAdvancedLikeRuleset: (ruleset) => ruleset === 'advanced',
  isGameOver: false,
  aaUnits: [],
  mines: [],
  points: [],
  flyingPoints: [],
  AA_HIT_RADIUS: 15,
  MINE_TRIGGER_RADIUS: 20,
  POINT_RADIUS: 10,
  PLANE_HIT_COOLDOWN_SEC: 0.5,
  eliminatePlaneCalls: 0,
  eliminatePlane(plane){
    context.eliminatePlaneCalls += 1;
    plane.wasEliminated = true;
  },
  spawnExplosionForPlane: () => {},
  awardPoint: () => {},
  checkVictory: () => {},
  advanceTurn: () => {},
  isPathClear: () => true,
  getPlaneHitbox: (plane) => ({ x: plane.x, y: plane.y, radius: 10 }),
  planeHitboxesIntersect: (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= (a.radius + b.radius),
  getPlaneHitContactPoint: (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
  _timeNow: 1000,
  performance: { now: () => ++context._timeNow },
  Math,
  Number,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const basePlane = { color: 'green', isAlive: true, burning: false, respawnState: 'at_base', x: 0, y: 0 };
assert(context.isPlaneTargetable(basePlane) === true, 'Arcade base plane should be targetable by default.');

context.aaUnits = [{ id: 'aa-1', owner: 'blue', x: 0, y: 25, radius: 40, sweepAngleDeg: 270, beamWidthDeg: 180, dwellTimeMs: 0, cooldownMs: 0 }];
assert(context.handleAAForPlane(basePlane, null) === false, 'AA first dwell check should arm tracking for at_base plane.');
assert(context.handleAAForPlane(basePlane, null) === true, 'AA should be able to eliminate at_base plane in arcade.');
assert(basePlane.wasEliminated === true, 'AA elimination path should run for at_base plane.');

const minePlane = { color: 'green', isAlive: true, burning: false, respawnState: 'at_base', x: 0, y: 0 };
context.mines = [{ owner: 'blue', x: 0, y: 10 }];
assert(context.handleMineForPlane(minePlane, null) === true, 'Mine should be able to eliminate at_base plane in arcade.');
assert(minePlane.wasEliminated === true, 'Mine elimination path should run for at_base plane.');

const attacker = { color: 'green', isAlive: true, burning: false, respawnState: 'in_flight', x: 0, y: 0 };
const defender = { color: 'blue', isAlive: true, burning: false, respawnState: 'at_base', x: 5, y: 0 };
context.points = [defender];
context.checkPlaneHits(attacker, null);
assert(defender.wasEliminated === true, 'Plane-vs-plane hit should eliminate defender even when defender is at_base.');

context.settings.arcadeBaseInvulnerability = true;
assert(context.isPlaneTargetable({ isAlive: true, burning: false, respawnState: 'at_base' }) === false,
  'Optional flag should restore at_base invulnerability when explicitly enabled.');

console.log('Smoke test passed: arcade at_base planes can be eliminated unless base invulnerability flag is enabled.');
