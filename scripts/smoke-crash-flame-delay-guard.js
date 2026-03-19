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

const gameSource = fs.readFileSync('script.js', 'utf8');
const extracted = [
  'ensurePlaneFlameFx',
].map((name) => extractFunctionSource(gameSource, name)).join('\n\n');

function createContext(){
  const context = {
    Map,
    Object,
    planeFlameFx: new Map(),
    planeFlameTimers: new Map(),
    spawnCalls: 0,
    scheduleCalls: 0,
    resetCalls: 0,
    clearTimeout: () => {},
    spawnBurningFlameFx: () => {
      context.spawnCalls += 1;
    },
    schedulePlaneFlameFx: (plane) => {
      context.scheduleCalls += 1;
      context.planeFlameTimers.set(plane, { timer: true });
    },
    hasCrashDelayElapsed: () => false,
    resetPlaneFlameFxDisabled: () => {
      context.resetCalls += 1;
    },
  };

  vm.createContext(context);
  vm.runInContext(extracted, context);
  return context;
}

{
  const context = createContext();
  const plane = { burning: true, flameFxDisabled: false };

  context.ensurePlaneFlameFx(plane);

  assert(context.spawnCalls === 0,
    'Flame FX must not spawn before crash delay elapses.');
  assert(context.scheduleCalls === 1,
    'Flame FX should schedule delayed spawn while waiting for crash delay.');
}

{
  const context = createContext();
  context.hasCrashDelayElapsed = () => true;
  const plane = { burning: true, flameFxDisabled: false };

  context.ensurePlaneFlameFx(plane);

  assert(context.spawnCalls === 1,
    'Flame FX should spawn immediately after crash delay elapses.');
}

console.log('Smoke test passed: ensurePlaneFlameFx respects crash delay before spawning flame FX.');
