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
const helperSrc = extractFunctionSource(source, 'isAiRepeatPlaneCriticalCandidate');
const compareSrc = extractFunctionSource(source, 'compareAiCandidateByScoreAndRotation');

const context = {
  Math,
  Number,
  AI_REPEAT_FORCE_SCORE_MARGIN: 25,
  AI_REPEAT_OPENING_FORCE_TURN_LIMIT: 2,
  AI_OPENING_SOFT_RANDOM_TURN_LIMIT: 2,
  AI_OPENING_SOFT_RANDOM_SCORE_MARGIN: 3.5,
  AI_OPENING_SOFT_RANDOM_MAX_SHIFT: 0.045,
  AI_REPEAT_ALLOWED_REASON_CODES: ['direct_finisher', 'opening_center_cargo', 'mode_flag_pressure', 'fallback_flag_pressure', 'emergency_base_defense', 'emergency_hold_position', 'critical_base_threat'],
  AI_REPEAT_ALLOWED_REASON_TOKENS: ['intercept', 'finisher', 'defense', 'flag', 'cargo', 'critical', 'emergency', 'protect', 'hold'],
  aiRoundState: { lastLaunchedPlaneId: 'b1', turnNumber: 7 },
  scoreMoveForPlane: () => ({ idleTurns: 0, repeatInWindow: 0, rotationBonus: 0 }),
  getStableHashFromParts: (parts) => String(parts).length,
};

vm.createContext(context);
vm.runInContext(`${helperSrc}\n${compareSrc}`, context);

const chooseFreshPlane = context.compareAiCandidateByScoreAndRotation(
  { plane: { id: 'b1' }, score: 100, decisionReason: 'attrition' },
  { plane: { id: 'b2' }, score: 95, decisionReason: 'attrition' }
);
assert(chooseFreshPlane === false, 'AI should avoid repeating the same plane when score gap is small and no critical reason exists.');

// In critical mode, repeated plane can still win by score.
const criticalWinsByScore = context.compareAiCandidateByScoreAndRotation(
  { plane: { id: 'b1' }, score: 90, decisionReason: 'direct_finisher' },
  { plane: { id: 'b2' }, score: 95, decisionReason: 'attrition' }
);
assert(criticalWinsByScore === true, 'Critical reason should allow repeated plane when it is clearly better by score.');

console.log('Smoke test passed: repeat-plane guard prefers rotation unless repeat is critical.');
