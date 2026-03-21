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

function extractConstSource(source, constName){
  const re = new RegExp(`const ${constName} = [^;]+;`);
  const match = source.match(re);
  return match ? match[0] : null;
}

const source = fs.readFileSync('script.js', 'utf8');
const codeParts = [];
[
  'AI_OPENING_CENTER_TURN_LIMIT',
  'AI_OPENING_DIRECT_FINISHER_MIN_LEAD',
  'AI_OPENING_DIRECT_FINISHER_EXCEPTION_DISTANCE_RATIO',
  'AI_OPENING_DIRECT_FINISHER_EXCEPTION_THREAT_COUNT',
  'AI_OPENING_DIRECT_FINISHER_EXCEPTION_NEAREST_THREAT_DISTANCE',
  'AI_OPENING_AGGRESSION_BIAS_TURN_LIMIT',
  'AI_OPENING_AGGRESSION_BIAS_MAX_LEAD',
  'AI_OPENING_AGGRESSION_BIAS_DISCOUNT',
  'AI_OPENING_AGGRESSION_TARGETS',
  'AI_MULTI_KILL_PRIMARY_BONUS',
].forEach((name) => {
  const src = extractConstSource(source, name);
  if(src) codeParts.push(src);
});

[
  'isOpeningAggressionBiasAllowed',
  'applyOpeningAggressionBias',
  'isDirectFinisherScenario',
  'isExplicitDefensiveGoal',
  'findDirectFinisherMove',
  'shouldSkipDirectFinisherInOpening',
].forEach((name) => {
  const src = extractFunctionSource(source, name);
  if(!src) throw new Error(`Missing function source: ${name}`);
  codeParts.push(src);
});

const context = {
  Math,
  Number,
  Boolean,
  Object,
  Array,
  MAX_DRAG_DISTANCE: 500,
  ATTACK_RANGE_PX: 300,
  CELL_SIZE: 100,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_OPENING_CENTER_TURN_LIMIT: 2,
  AI_OPENING_DIRECT_FINISHER_MIN_LEAD: 2,
  AI_OPENING_DIRECT_FINISHER_EXCEPTION_DISTANCE_RATIO: 0.75,
  AI_OPENING_DIRECT_FINISHER_EXCEPTION_THREAT_COUNT: 2,
  AI_OPENING_DIRECT_FINISHER_EXCEPTION_NEAREST_THREAT_DISTANCE: 150,
  AI_MULTI_KILL_PRIMARY_BONUS: 20,
  CLEAR_SKY_MAP_ID: 'clear-sky',
  CLEAR_SKY_MAP_NAME: 'Clear Sky',
  turnAdvanceCount: 1,
  blueScore: 0,
  greenScore: 0,
  flyingPoints: [],
  cargoState: [{ id: 'cargo-1', x: 120, y: 0, state: 'ready' }],
  aiRoundState: { currentGoal: null },
  currentMapName: 'Open Field',
  resolveCurrentMapForExport: () => ({ id: 'openfield', name: 'Open Field', tier: 'easy' }),
  getDistanceFromPointToSegment: (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if(lenSq <= 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    return Math.hypot(px - cx, py - cy);
  },
  getAiPlaneAdjustedScore: (score) => score,
  isPathClear: () => true,
  dist: (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)),
  getPlaneEffectiveRangePx: () => 1200,
  getImmediateResponseThreatMeta: () => ({ count: 0, nearestDist: Number.POSITIVE_INFINITY }),
  planPathToPoint: () => ({ vx: 220, vy: 0, totalDist: 220 }),
  logAiDecision: () => {},
};

vm.createContext(context);
vm.runInContext(codeParts.join('\n\n'), context);

const aiPlanes = [{ id: 'blue-1', x: 0, y: 0, isAlive: true }];
const enemies = [{ id: 'green-1', x: 220, y: 0, isAlive: true, shieldActive: false }];
const modeContext = {
  aiPlanes,
  enemies,
  aiRiskProfile: { profile: 'balanced' },
};

const finisher = context.findDirectFinisherMove(aiPlanes, enemies, {
  goalName: 'direct_finisher',
  context: modeContext,
});
if(!finisher){
  throw new Error('Expected direct finisher candidate to exist.');
}
if(finisher.hasCargoAlongPath !== true){
  throw new Error('Expected direct finisher to mark cargo along path.');
}

const shouldSkip = context.shouldSkipDirectFinisherInOpening(modeContext);
if(shouldSkip){
  throw new Error('Expected opening restriction to allow cargo-value direct finisher.');
}

console.log('Smoke test passed: opening direct finisher is allowed when the route also collects cargo without immediate counter-threat.');
