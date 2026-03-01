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

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found in script.js: ${name}`);
  return Number(vm.runInNewContext(match[1], extraContext));
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const hashSrc = extractFunctionSource(source, 'getStableHashFromParts');
const repeatCriticalSrc = extractFunctionSource(source, 'isAiRepeatPlaneCriticalCandidate');
const compareSrc = extractFunctionSource(source, 'compareAiCandidateByScoreAndRotation');

const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');

const context = {
  Math,
  aiRoundState: {
    turnNumber: 1,
    tieBreakerSeed: 1,
    lastLaunchedPlaneId: null,
  },
  scoreMoveForPlane: () => ({ idleTurns: 0, repeatInWindow: 0, rotationBonus: 0 }),
  isAiRepeatPlaneCriticalCandidate: null,
  AI_REPEAT_OPENING_FORCE_TURN_LIMIT: extractConstValue(source, 'AI_REPEAT_OPENING_FORCE_TURN_LIMIT'),
  AI_REPEAT_FORCE_SCORE_MARGIN: extractConstValue(source, 'AI_REPEAT_FORCE_SCORE_MARGIN', { MAX_DRAG_DISTANCE }),
  AI_OPENING_SOFT_RANDOM_TURN_LIMIT: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_TURN_LIMIT'),
  AI_OPENING_SOFT_RANDOM_SCORE_MARGIN: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_SCORE_MARGIN', { MAX_DRAG_DISTANCE }),
  AI_OPENING_SOFT_RANDOM_MAX_SHIFT: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_MAX_SHIFT'),
  AI_REPEAT_ALLOWED_REASON_CODES: [],
  AI_REPEAT_ALLOWED_REASON_TOKENS: [],
};

vm.createContext(context);
vm.runInContext(`${hashSrc}\n${repeatCriticalSrc}\n${compareSrc}`, context);

const a = { plane: { id: 'A' }, enemy: { id: 'E' }, score: 10 };
const b = { plane: { id: 'B' }, enemy: { id: 'E' }, score: 10 };

const winners = { A: 0, B: 0 };
for(let seed = 1; seed <= 400; seed += 1){
  context.aiRoundState.tieBreakerSeed = seed;
  context.aiRoundState.turnNumber = 1;
  const aBeatsB = context.compareAiCandidateByScoreAndRotation(a, b, ['smoke']);
  winners[aBeatsB ? 'A' : 'B'] += 1;
}
assert(winners.A > 0 && winners.B > 0,
  'Near-tie opening candidates should alternate winner depending on tieBreakerSeed.');

const clearBest = { plane: { id: 'A' }, enemy: { id: 'E' }, score: 10 };
const clearWorse = { plane: { id: 'B' }, enemy: { id: 'E' }, score: 10 + context.AI_OPENING_SOFT_RANDOM_SCORE_MARGIN * 2 };
for(let seed = 1; seed <= 100; seed += 1){
  context.aiRoundState.tieBreakerSeed = seed;
  const bestWins = context.compareAiCandidateByScoreAndRotation(clearBest, clearWorse, ['smoke']);
  assert(bestWins, 'Clearly stronger move should stay preferred (no degradation from soft randomization).');
}

console.log('Smoke test passed: candidate tie-break is diversified only in near-tie opening corridor.');
console.log('Opening near-tie winners:', winners);
