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
const fnSrc = extractFunctionSource(source, 'issueAIMoveWithInventoryUsage');

let advanced = 0;
let launched = 0;
let decisionStage = null;

const context = {
  Number,
  aiRoundState: { currentGoal: 'test_goal' },
  recordAiSelfAnalyzerDecision: (stage) => { decisionStage = stage; },
  logAiDecision: () => {},
  aiMoveScheduled: true,
  advanceTurn: () => { advanced += 1; },
  evaluateBlueInventoryState: () => ({ counts: {} }),
  maybeUseInventoryBeforeLaunch: () => false,
  detectConsumedInventoryType: () => null,
  playInventoryConsumeFx: () => {},
  registerAiInventoryUsageAfterMove: () => {},
  issueAIMove: () => { launched += 1; },
};

vm.createContext(context);
vm.runInContext(fnSrc, context);

context.issueAIMoveWithInventoryUsage({}, { plane: { id: 'b1' }, vx: Number.NaN, vy: 12 });

assert(launched === 0, 'Invalid move must not call issueAIMove.');
assert(advanced === 1, 'Invalid move must advance turn exactly once.');
assert(context.aiMoveScheduled === false, 'Invalid move fail-safe must reset aiMoveScheduled flag.');
assert(decisionStage === 'invalid_move_fail_safe', 'Invalid move must be recorded in analyzer decision log.');

console.log('Smoke test passed: invalid planned move triggers fail-safe turn advance.');
