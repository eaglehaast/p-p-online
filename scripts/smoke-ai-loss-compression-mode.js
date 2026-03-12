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

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found in script.js: ${name}`);
  return vm.runInNewContext(match[1], extraContext);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');
const ATTACK_RANGE_PX = extractConstValue(source, 'ATTACK_RANGE_PX');
const FIELD_LEFT = 0;
const FIELD_TOP = 0;
const FIELD_WIDTH = 1024;
const FIELD_HEIGHT = 768;
const FIELD_FLIGHT_DURATION_SEC = 1;

const context = {
  Math,
  MAX_DRAG_DISTANCE,
  ATTACK_RANGE_PX,
  FIELD_LEFT,
  FIELD_TOP,
  FIELD_WIDTH,
  FIELD_HEIGHT,
  FIELD_FLIGHT_DURATION_SEC,
  flyingPoints: [],
  cargoState: [],
  aiRoundState: { lossCompressionMode: false },
  isPlaneLaunchStateReady: () => true,
  getCriticalBlueBaseThreat: () => null,
  getEarlyBaseWarningThreat: () => null,
  getBaseAnchor: () => ({ x: FIELD_LEFT + 40, y: FIELD_TOP + 40 }),
  getFlagAnchor: (flag) => flag,
  getEmergencyBaseHoldPositionMove: () => null,
  isPathClear: () => true,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  getAiMoveLandingPoint: (move) => ({
    x: move.plane.x + move.vx * FIELD_FLIGHT_DURATION_SEC,
    y: move.plane.y + move.vy * FIELD_FLIGHT_DURATION_SEC,
  }),
};
vm.createContext(context);

const fnNames = [
  'evaluateLossCompressionMode',
  'applyLossCompressionScoreAdjustments',
];
vm.runInContext(fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n'), context);

const aiSolo = [{ id: 'b1', x: 120, y: 120, isAlive: true }];
const enemyDuo = [
  { id: 'g1', x: FIELD_LEFT + FIELD_WIDTH * 0.55, y: FIELD_TOP + FIELD_HEIGHT * 0.5, isAlive: true },
  { id: 'g2', x: FIELD_LEFT + FIELD_WIDTH * 0.7, y: FIELD_TOP + FIELD_HEIGHT * 0.52, isAlive: true },
];

// Кейc 1: безнадёжная позиция -> режим включается, агрессивный ход лучше пассивного
context.getEmergencyBaseHoldPositionMove = () => null;
context.isPathClear = () => true;
context.cargoState = [{ state: 'idle', x: FIELD_LEFT + FIELD_WIDTH * 0.62, y: FIELD_TOP + FIELD_HEIGHT * 0.46 }];
const hopeless = context.evaluateLossCompressionMode({
  aiPlanes: aiSolo,
  enemies: enemyDuo,
  shouldUseFlagsMode: false,
  availableEnemyFlags: [],
  homeBase: { x: FIELD_LEFT + 30, y: FIELD_TOP + 30 },
});
assert(hopeless.enabled === true, 'Expected lossCompressionMode enabled in hopeless 1v2+ scenario.');
context.aiRoundState.lossCompressionMode = true;

const aggressiveCandidate = context.applyLossCompressionScoreAdjustments({
  plane: aiSolo[0],
  enemy: enemyDuo[0],
  vx: 120,
  vy: 10,
  score: 220,
  goalName: 'loss_compression_cargo',
  decisionReason: 'loss_compression_intercept_attempt',
  candidateType: 'gap',
}, { homeBase: { x: FIELD_LEFT + 30, y: FIELD_TOP + 30 } });
const passiveFallback = context.applyLossCompressionScoreAdjustments({
  plane: aiSolo[0],
  vx: 0,
  vy: 0,
  score: 220,
  goalName: 'safe_short_fallback_progress',
  decisionReason: 'fallback_rotation_hold',
  candidateType: 'direct',
}, { homeBase: { x: FIELD_LEFT + 30, y: FIELD_TOP + 30 } });
assert(aggressiveCandidate.score < passiveFallback.score, 'Expected aggressive candidate to outrank passive fallback in loss compression mode.');

// Кейc 2: есть forced defensive intercept угроза -> режим не включается
context.getCriticalBlueBaseThreat = () => ({ enemy: enemyDuo[0] });
const forcedThreat = context.evaluateLossCompressionMode({
  aiPlanes: aiSolo,
  enemies: enemyDuo,
  shouldUseFlagsMode: false,
  availableEnemyFlags: [],
  homeBase: { x: FIELD_LEFT + 30, y: FIELD_TOP + 30 },
  criticalBaseThreat: { enemy: enemyDuo[0] },
});
assert(forcedThreat.enabled === false, 'Expected lossCompressionMode disabled when forced defensive intercept exists.');

// Кейc 3: сбалансированная позиция -> режим выключен
context.getCriticalBlueBaseThreat = () => null;
const balanced = context.evaluateLossCompressionMode({
  aiPlanes: [
    { id: 'b1', x: 120, y: 120, isAlive: true },
    { id: 'b2', x: 160, y: 140, isAlive: true },
  ],
  enemies: [
    { id: 'g1', x: 260, y: 240, isAlive: true },
    { id: 'g2', x: 280, y: 210, isAlive: true },
  ],
  shouldUseFlagsMode: false,
  availableEnemyFlags: [],
  homeBase: { x: FIELD_LEFT + 30, y: FIELD_TOP + 30 },
});
assert(balanced.enabled === false, 'Expected lossCompressionMode disabled in balanced setup.');

console.log('Smoke test passed: loss compression mode detects hopeless state, keeps emergency safety, and stays off in balanced state.');
console.log(`hopeless.enabled=${hopeless.enabled} reason=${hopeless.reason}`);
console.log(`forcedThreat.enabled=${forcedThreat.enabled} reason=${forcedThreat.reason}`);
console.log(`balanced.enabled=${balanced.enabled} reason=${balanced.reason}`);
console.log(`aggressiveScore=${aggressiveCandidate.score.toFixed(3)} passiveScore=${passiveFallback.score.toFixed(3)}`);
