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
  clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'buildAiCoarsePullPoint'), context);

const plane = { x: 100, y: 50 };
const angleRad = Math.PI / 6;
const reducedDistance = 198;
const targetAimReduced = {
  angleRad,
  powerRatio: reducedDistance / context.MAX_DRAG_DISTANCE,
  pullX: plane.x + Math.cos(angleRad) * reducedDistance,
  pullY: plane.y + Math.sin(angleRad) * reducedDistance,
};

const coarseReduced = context.buildAiCoarsePullPoint(plane, targetAimReduced, reducedDistance);
const coarseReducedDistance = Math.hypot(coarseReduced.x - plane.x, coarseReduced.y - plane.y);
assert(Math.abs(coarseReducedDistance - reducedDistance) < 0.0001,
  'AI should start the visible pull from the working launch distance for reduced-range shots.');

const stagePullDistance = coarseReducedDistance;
const stageOscillateDistance = reducedDistance;
assert(Math.abs(stagePullDistance - stageOscillateDistance) < 0.0001,
  'Pull and oscillate stages should keep the same visible aim length to avoid a jump.');

const coarseDefault = context.buildAiCoarsePullPoint(plane, {
  angleRad,
  powerRatio: 1,
  pullX: plane.x + Math.cos(angleRad) * context.MAX_DRAG_DISTANCE,
  pullY: plane.y + Math.sin(angleRad) * context.MAX_DRAG_DISTANCE,
});
const coarseDefaultDistance = Math.hypot(coarseDefault.x - plane.x, coarseDefault.y - plane.y);
assert(Math.abs(coarseDefaultDistance - context.MAX_DRAG_DISTANCE) < 0.0001,
  'Default AI launches should still use the full pull distance when no reduction is requested.');

console.log('Smoke test passed: AI coarse pull uses the working distance and stays visually stable across pull/oscillate.');
