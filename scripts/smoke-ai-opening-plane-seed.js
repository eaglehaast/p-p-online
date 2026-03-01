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
const hashSrc = extractFunctionSource(source, 'getStableHashFromParts');
const rankSrc = extractFunctionSource(source, 'rankAiPlanesForCurrentTurn');

const context = {
  Math,
  aiRoundState: { turnNumber: 1, tieBreakerSeed: 100 },
  scoreMoveForPlane: () => ({ finalScore: 1 }),
  getAiPlaneIdleTurns: () => 0,
};

vm.createContext(context);
vm.runInContext(`${hashSrc}\n${rankSrc}`, context);

const planes = [{ id: 'left' }, { id: 'right' }];
let sawDifferentOrder = false;
let previousOrder = null;

for(let seed = 1; seed <= 200; seed += 1){
  context.aiRoundState.tieBreakerSeed = seed;
  const order = context.rankAiPlanesForCurrentTurn(planes).map((plane) => plane.id).join(',');
  if(previousOrder === null){
    previousOrder = order;
    continue;
  }
  if(order !== previousOrder){
    sawDifferentOrder = true;
    break;
  }
}

assert(sawDifferentOrder,
  'Per-round tieBreakerSeed should eventually produce a different order for equal planes.');

console.log('Smoke test passed: opening plane tie-break now depends on per-round seed.');
