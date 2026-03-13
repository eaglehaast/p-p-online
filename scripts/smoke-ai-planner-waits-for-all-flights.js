#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  let headerDepth = 0;
  let headerEnd = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') headerDepth += 1;
    if(ch === ')'){
      headerDepth -= 1;
      if(headerDepth === 0){
        headerEnd = i;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', headerEnd);
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
const fnSrc = extractFunctionSource(source, 'tryStartAiPlanningFromCommittedState');

const context = {
  Math,
  Number,
  Boolean,
  isGameOver: false,
  gameMode: 'computer',
  turnColors: ['green', 'blue'],
  turnIndex: 1,
  aiMoveScheduled: false,
  flyingPoints: [{ plane: { color: 'green' } }],
  lastPlayerMoveCommitMeta: { finished: true, turnCommitSequence: 10 },
  turnCommitSequence: 10,
  turnAdvanceCount: 4,
  aiCachedTargetMemory: null,
  buildCommittedEnemySnapshot(){ throw new Error('should not build snapshot while planes are flying'); },
  logAiDecision(){ throw new Error('should not log planner start while planes are flying'); },
  scheduleComputerMoveWithCargoGate(){ throw new Error('should not schedule while planes are flying'); },
};

vm.createContext(context);
vm.runInContext(fnSrc, context);

const started = context.tryStartAiPlanningFromCommittedState('smoke_test');
assert(started === false, 'Planner must not start while any plane is still flying.');

console.log('Smoke test passed: AI planner waits until all planes stop flying.');
