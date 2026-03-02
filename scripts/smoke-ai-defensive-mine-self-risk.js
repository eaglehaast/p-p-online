#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
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
  MAX_DRAG_DISTANCE: 300,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  CELL_SIZE: 40,
  getAiMoveLandingPoint: () => ({ x: 100, y: 0 }),
  isPathClear: () => true,
  isMinePlacementValid: () => true,
  placeMine: () => { placeMineCalls += 1; },
  logAiDecision: (reason, details) => logs.push({ reason, details }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const didPlace = context.tryPlaceBlueDefensiveMine({
  enemies: [{ id: 'enemy-1', x: 130, y: 0 }],
}, {
  plane: { id: 'plane-1', x: 0, y: 0 },
});

assert(didPlace === false, 'Defensive mine must be skipped when it blocks own movement corridor.');
assert(placeMineCalls === 0, 'Mine placement should not occur in self-risk corridor case.');
assert(logs.some((entry) => entry.reason === 'mine_skipped_self_risk'),
  'mine_skipped_self_risk log is required for traceability.');

console.log('Smoke test passed: defensive mine is skipped when self-risk corridor is detected.');
