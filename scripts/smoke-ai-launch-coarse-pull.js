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

function extractConstValue(source, name){
  const match = source.match(new RegExp(`const ${name} = ([^;]+);`));
  if(!match) throw new Error(`Const not found: ${name}`);
  return vm.runInNewContext(match[1], {});
}

const source = fs.readFileSync('script.js', 'utf8');
const context = {
  Math,
  Number,
  MAX_DRAG_DISTANCE: 300,
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  getEffectiveFlightRangeCells: () => 30,
  AI_LAUNCH_MISS_ANGLE_DEG_NEAR: extractConstValue(source, 'AI_LAUNCH_MISS_ANGLE_DEG_NEAR'),
  AI_LAUNCH_MISS_ANGLE_DEG_FAR: extractConstValue(source, 'AI_LAUNCH_MISS_ANGLE_DEG_FAR'),
  AI_LAUNCH_MISS_POWER_NEAR: extractConstValue(source, 'AI_LAUNCH_MISS_POWER_NEAR'),
  AI_LAUNCH_MISS_POWER_FAR: extractConstValue(source, 'AI_LAUNCH_MISS_POWER_FAR'),
  AI_LAUNCH_MISS_DISTANCE_START_CELLS: extractConstValue(source, 'AI_LAUNCH_MISS_DISTANCE_START_CELLS'),
  AI_LAUNCH_COARSE_PULL_MAX_RATIO: extractConstValue(source, 'AI_LAUNCH_COARSE_PULL_MAX_RATIO'),
  AI_LAUNCH_COARSE_PULL_MIN_RATIO: extractConstValue(source, 'AI_LAUNCH_COARSE_PULL_MIN_RATIO'),
};
vm.createContext(context);
vm.runInContext([
  extractFunctionSource(source, 'randomSignedOffset'),
  extractFunctionSource(source, 'buildHumanizedAiTargetAim'),
  extractFunctionSource(source, 'buildAiCoarsePullPoint'),
].join('\n\n'), context);

const plane = { x: 100, y: 50 };
const targetAim = { angleRad: Math.PI / 6, powerRatio: 0.66, pullX: 0, pullY: 0 };
const humanized = context.buildHumanizedAiTargetAim(plane, targetAim);
const coarse = context.buildAiCoarsePullPoint(plane, humanized);
const targetDistance = Math.hypot(humanized.pullX - plane.x, humanized.pullY - plane.y);
const coarseDistance = Math.hypot(coarse.x - plane.x, coarse.y - plane.y);

assert(Math.abs(coarseDistance - targetDistance) > 0.0001,
  'Coarse pull point should differ from the final target distance so AI can keep adjusting power during oscillation.');
assert(coarseDistance >= 0 && coarseDistance <= context.MAX_DRAG_DISTANCE,
  'Coarse pull distance must stay within drag limits.');

console.log('Smoke test passed: AI launch uses an approximate pull distance before final oscillation power correction.');
