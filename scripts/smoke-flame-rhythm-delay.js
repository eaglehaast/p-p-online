#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractConstSource(source, constName){
  const pattern = new RegExp(`const ${constName} = [^;]+;`);
  const match = source.match(pattern);
  if(!match) throw new Error(`Constant not found in script.js: ${constName}`);
  return match[0];
}

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
  'FLAME_FRAME_DURATION_MS',
  'FLAME_RHYTHM_FRAME_GROUP',
  'FLAME_RHYTHM_EXTRA_DELAY_MS',
].map((name) => extractConstSource(gameSource, name)).join('\n')
  + '\n\n'
  + extractFunctionSource(gameSource, 'getFlameFrameDelayMs');

const context = { Number, Math };
vm.createContext(context);
vm.runInContext(extracted, context);

assert(context.getFlameFrameDelayMs(0, 16) === 140,
  'Frame 1 should keep the base flame duration.');
assert(context.getFlameFrameDelayMs(3, 16) === 162,
  'Frame 4 should receive a subtle extra delay.');
assert(context.getFlameFrameDelayMs(7, 16) === 162,
  'Frame 8 should receive the same rhythm delay.');
assert(context.getFlameFrameDelayMs(15, 16) === 162,
  'Frame 16 should also receive the rhythm delay.');
assert(context.getFlameFrameDelayMs(16, 16) === 140,
  'Looped frame 1 should return to the base duration after frame 16.');

console.log('Smoke test passed: flame rhythm adds a subtle delay to every fourth frame.');
