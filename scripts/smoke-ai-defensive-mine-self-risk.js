#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') paramsDepth += 1;
    if(ch === ')') paramsDepth -= 1;
    if(ch === '{' && paramsDepth === 0){
      bodyStart = i;
      break;
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
const extracted = extractFunctionSource(source, 'tryPlaceBlueDefensiveMine');

const logs = [];
let placeMineCalls = 0;

const context = {
  Math,
  Number,
  MINE_EFFECT_RADIUS: 40,
  MINE_TRIGGER_RADIUS: 40,
  AI_MINE_SELF_RISK_CONFIG: {
    SELF_RISK_ASSESSMENT: {
      DANGER_RADIUS_MULTIPLIER: 1.1,
      HARD_IMMEDIATE_RADIUS_MULTIPLIER: 0.78,
      HARD_LANDING_RADIUS_MULTIPLIER: 0.6,
      SUPER_CRITICAL_RADIUS_MULTIPLIER: 0.4,
    },
  },
  MAX_DRAG_DISTANCE: 300,
  getAiItemSpendStyle: () => 'balanced',
  getMineRiskStyleConfig: () => ({ GOAL_RISK_PENALTY_MULTIPLIER: 0.4, MODERATE_SELF_RISK_PENALTY_MULTIPLIER: 1, SELF_RISK_PENALTY_BASE: 1.35 }),
  getPlaneEffectiveRangePx: () => 140,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  CELL_SIZE: 40,
  getAiMoveLandingPoint: () => ({ x: 24, y: 0 }),
  isPathClear: () => true,
  isMinePlacementValid: () => true,
  placeMine: () => { placeMineCalls += 1; },
  logAiDecision: (reason, details) => logs.push({ reason, details }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const didPlace = context.tryPlaceBlueDefensiveMine({
  enemies: [{ id: 'enemy-1', x: 30, y: 0 }],
}, {
  plane: { id: 'plane-1', x: 0, y: 0 },
  goalName: 'capture_enemy_flag',
});

assert(didPlace === false, 'Defensive mine must still be skipped when it can instantly blow up own corridor.');
assert(placeMineCalls === 0, 'Mine placement should not occur in self-risk corridor case.');
assert(logs.some((entry) => entry.reason === 'mine_skipped_self_risk'),
  'mine_skipped_self_risk log is required for traceability.');
assert(logs.some((entry) => entry.details?.reason === 'defensive_mine_immediate_self_destruction_risk'),
  'Critical self-destruction skip reason should be logged.');
assert(logs.some((entry) => entry.details?.reasonCode === 'mine_hard_risk_reject'),
  'Hard-risk reject code must be present in mine logs.');

console.log('Smoke test passed: defensive mine is rejected by hard risk with explicit decision code.');
