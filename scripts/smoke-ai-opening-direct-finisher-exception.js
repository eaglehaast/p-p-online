#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function extractConstSource(source, constName){
  const re = new RegExp(`const ${constName} = [^;]+;`);
  const match = source.match(re);
  if(!match) throw new Error(`Const not found in script.js: ${constName}`);
  return match[0];
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const code = [
  'AI_OPENING_CENTER_TURN_LIMIT',
  'AI_OPENING_DIRECT_FINISHER_MIN_LEAD',
  'AI_OPENING_DIRECT_FINISHER_EXCEPTION_DISTANCE',
  'AI_OPENING_DIRECT_FINISHER_EXCEPTION_THREAT_COUNT',
  'AI_OPENING_DIRECT_FINISHER_EXCEPTION_NEAREST_THREAT_DISTANCE',
  'AI_IMMEDIATE_RESPONSE_DANGER_RADIUS',
].map((name) => extractConstSource(source, name)).join('\n')
  + '\n\n'
  + [
    'isDirectFinisherScenario',
    'isExplicitDefensiveGoal',
    'getImmediateResponseThreatMeta',
    'findDirectFinisherMove',
    'shouldSkipDirectFinisherInOpening',
  ].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math,
  Number,
  Boolean,
  Object,
  Array,
  MAX_DRAG_DISTANCE: 100,
  CELL_SIZE: 20,
  ATTACK_RANGE_PX: 100,
  FIELD_FLIGHT_DURATION_SEC: 1,
  turnAdvanceCount: 1,
  blueScore: 0,
  greenScore: 0,
  flyingPoints: [],
  cargoState: [],
  currentMapName: 'clear sky',
  aiRoundState: { currentGoal: null },
  getDistanceFromPointToSegment: () => Number.POSITIVE_INFINITY,
  getAiTargetPriority: () => 'normal',
  getAiPlaneAdjustedScore: (v) => v,
  dist: (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)),
  getAiMoveLandingPoint: (move) => ({
    x: (move?.plane?.x || 0) + (move?.vx || 0),
    y: (move?.plane?.y || 0) + (move?.vy || 0),
  }),
  resolveCurrentMapForExport: () => ({ id: 'clearsky', name: 'Clear Sky', tier: 'easy' }),
  isPathClear: () => true,
  planPathToPoint: (plane, x, y) => ({ vx: x - plane.x, vy: y - plane.y, totalDist: Math.hypot(x - plane.x, y - plane.y) }),
  logAiDecision: () => {},
  isOpeningAggressionBiasAllowed: () => false,
  applyOpeningAggressionBias: (score) => ({ score, applied: false }),
};

vm.createContext(context);
vm.runInContext(code, context);

const aiPlane = { id: 'b1', x: 0, y: 0, isAlive: true };

const closeEnemy = { id: 'g1', x: 40, y: 0, isAlive: true, shieldActive: false };
const farEnemy = { id: 'g2', x: 80, y: 0, isAlive: true, shieldActive: false };
const responder = { id: 'g3', x: 36, y: 0, isAlive: true, shieldActive: false };

const noThreatContext = {
  aiPlanes: [aiPlane],
  enemies: [closeEnemy],
};
assert(context.shouldSkipDirectFinisherInOpening(noThreatContext) === false,
  'Expected opening exception to allow close direct finisher without critical threat.');

const criticalThreatContext = {
  aiPlanes: [aiPlane],
  enemies: [closeEnemy],
  criticalBaseThreat: { enemy: closeEnemy },
};
assert(context.shouldSkipDirectFinisherInOpening(criticalThreatContext) === true,
  'Expected opening restriction to stay active when critical_base_threat is present.');

const highImmediateThreatContext = {
  aiPlanes: [aiPlane],
  enemies: [closeEnemy, responder],
};
assert(context.shouldSkipDirectFinisherInOpening(highImmediateThreatContext) === true,
  'Expected opening restriction to stay active when immediate response threat is high.');

const farTargetContext = {
  aiPlanes: [aiPlane],
  enemies: [farEnemy],
};
assert(context.shouldSkipDirectFinisherInOpening(farTargetContext) === true,
  'Expected opening restriction to keep blocking far direct finisher target.');

console.log('Smoke test passed: opening direct finisher exception is narrow and threat-aware.');
