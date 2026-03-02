#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) return null;
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

const source = fs.readFileSync('script.js', 'utf8');
const findDirectFinisherMoveSrc = extractFunctionSource(source, 'findDirectFinisherMove');
if(!findDirectFinisherMoveSrc){
  throw new Error('findDirectFinisherMove source not found');
}

const context = {
  Math,
  Number,
  Boolean,
  Object,
  Array,
  CELL_SIZE: 100,
  ATTACK_RANGE_PX: 300,
  MAX_DRAG_DISTANCE: 500,
  FIELD_FLIGHT_DURATION_SEC: 1,
  flyingPoints: [],
  isDirectFinisherScenario: () => true,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  getAiPlaneAdjustedScore: (score) => score,
  applyOpeningAggressionBias: (score) => ({ score, applied: false }),
  isPathClear: () => true,
  planPathToPoint: (plane) => {
    if(plane.id === 'danger') return { vx: 100, vy: 0, totalDist: 100 };
    if(plane.id === 'safe') return { vx: 100, vy: 0, totalDist: 100 };
    return null;
  },
  aiLogs: [],
  logAiDecision: (reason, details) => {
    context.aiLogs.push({ reason, details });
  },
};

vm.createContext(context);
vm.runInContext(findDirectFinisherMoveSrc, context);

const aiPlanes = [
  { id: 'danger', x: 0, y: 0, isAlive: true },
  { id: 'safe', x: 0, y: 350, isAlive: true },
];
const enemies = [
  { id: 'target', x: 350, y: 0, isAlive: true, carriedFlagId: null },
  { id: 'threat', x: 120, y: 0, isAlive: true, carriedFlagId: null },
];

const beforeLike = context.findDirectFinisherMove(aiPlanes, enemies, {
  context: { aiRiskProfile: { profile: 'comeback' } },
});
const afterLike = context.findDirectFinisherMove(aiPlanes, enemies, {
  context: { aiRiskProfile: { profile: 'balanced' } },
});

if(!beforeLike || !afterLike){
  throw new Error('Expected direct finisher move in both modes');
}
if(beforeLike.plane.id !== 'danger'){
  throw new Error(`Before-like run should choose dangerous move by equal score tie, got ${beforeLike.plane.id}`);
}
if(afterLike.plane.id !== 'safe'){
  throw new Error(`After-like run should choose safer alternative, got ${afterLike.plane.id}`);
}
const penaltyLogs = context.aiLogs.filter((entry) => entry.reason === 'direct_finisher_post_risk_penalty_applied');
if(penaltyLogs.length === 0){
  throw new Error('Expected direct_finisher_post_risk_penalty_applied log entry');
}

console.log('Smoke test passed: in equal-score direct finisher scenario, balanced profile shifts choice to safer landing.');
console.log(JSON.stringify({
  beforePlaneId: beforeLike.plane.id,
  afterPlaneId: afterLike.plane.id,
  penaltyLogs: penaltyLogs.length,
}, null, 2));
