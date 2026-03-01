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

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found in script.js: ${name}`);
  return Number(vm.runInNewContext(match[1], extraContext));
}

const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');

const context = {
  Math,
  aiRoundState: { turnNumber: 1, tieBreakerSeed: 100 },
  scoreMoveForPlane: () => ({ finalScore: 1 }),
  getAiPlaneIdleTurns: () => 0,
  AI_OPENING_SOFT_RANDOM_TURN_LIMIT: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_TURN_LIMIT'),
  AI_OPENING_SOFT_RANDOM_SCORE_MARGIN: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_SCORE_MARGIN', { MAX_DRAG_DISTANCE }),
  AI_OPENING_SOFT_RANDOM_MAX_SHIFT: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_MAX_SHIFT'),
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

const distribution = { left: 0, right: 0 };
for(let seed = 1; seed <= 400; seed += 1){
  context.aiRoundState.tieBreakerSeed = seed;
  context.aiRoundState.turnNumber = 1;
  const firstId = context.rankAiPlanesForCurrentTurn(planes)[0].id;
  distribution[firstId] += 1;
}

assert(distribution.left > 0 && distribution.right > 0,
  'Opening tie corridor should produce diversified first-plane picks across seeds.');

context.scoreMoveForPlane = (_, plane) => ({ finalScore: plane.id === 'left' ? 1 : 1 + context.AI_OPENING_SOFT_RANDOM_SCORE_MARGIN * 2 });
for(let seed = 1; seed <= 50; seed += 1){
  context.aiRoundState.tieBreakerSeed = seed;
  const firstId = context.rankAiPlanesForCurrentTurn(planes)[0].id;
  assert(firstId === 'left', 'Clearly better opening move must stay first even with soft randomization.');
}

console.log('Smoke test passed: opening tie-break is diversified in near-ties and stable for clearly better moves.');
console.log('Opening first-plane distribution (equal score):', distribution);
