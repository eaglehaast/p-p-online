const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function extractFunctionSource(source, name){
  const start = source.indexOf(`function ${name}`);
  if(start < 0) throw new Error(`Function not found: ${name}`);
  let depth = 0;
  let started = false;
  for(let i = start; i < source.length; i++){
    const ch = source[i];
    if(ch === '{'){
      depth += 1;
      started = true;
    } else if(ch === '}'){
      depth -= 1;
      if(started && depth === 0){
        return source.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Unclosed function: ${name}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const context = {
  Math,
  Number,
  MAX_DRAG_DISTANCE: 300,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'buildAiCoarsePullPoint'), context);

const plane = { x: 100, y: 50 };
const targetAim = { angleRad: Math.PI / 6, powerRatio: 0.66, pullX: 0, pullY: 0 };
const coarse = context.buildAiCoarsePullPoint(plane, targetAim);
const coarseDistance = Math.hypot(coarse.x - plane.x, coarse.y - plane.y);

assert(Math.abs(coarseDistance - context.MAX_DRAG_DISTANCE) < 0.0001,
  'AI should start from maximum pull distance instead of probing intermediate distances.');

console.log('Smoke test passed: AI launch starts from maximum pull distance before any optional release-time weakening.');
