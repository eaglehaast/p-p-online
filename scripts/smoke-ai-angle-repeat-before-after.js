#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found in script.js: ${name}`);
  return Number(vm.runInNewContext(match[1], extraContext));
}

function angleDeltaDeg(aDeg, bDeg){
  const direct = Math.abs(aDeg - bDeg) % 360;
  return Math.min(direct, 360 - direct);
}

function repeatedShare(angles, thresholdDeg){
  if(!Array.isArray(angles) || angles.length < 2) return 0;
  let repeats = 0;
  for(let i = 1; i < angles.length; i += 1){
    if(angleDeltaDeg(angles[i], angles[i - 1]) <= thresholdDeg){
      repeats += 1;
    }
  }
  return repeats / (angles.length - 1);
}

const source = fs.readFileSync('script.js', 'utf8');
const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');
const context = {
  Math,
  MAX_DRAG_DISTANCE,
  AI_ANGLE_REPEAT_TIGHT_SPREAD_DEG: extractConstValue(source, 'AI_ANGLE_REPEAT_TIGHT_SPREAD_DEG'),
  AI_ANGLE_REPEAT_HISTORY_LIMIT: extractConstValue(source, 'AI_ANGLE_REPEAT_HISTORY_LIMIT'),
  AI_ANGLE_SAFE_FAN_MIN_DEG: extractConstValue(source, 'AI_ANGLE_SAFE_FAN_MIN_DEG'),
  AI_ANGLE_SAFE_FAN_MAX_DEG: extractConstValue(source, 'AI_ANGLE_SAFE_FAN_MAX_DEG'),
  AI_ANGLE_REPEAT_STREAK_ALERT_COUNT: extractConstValue(source, 'AI_ANGLE_REPEAT_STREAK_ALERT_COUNT'),
};

const fnNames = [
  'getStableHashFromParts',
  'normalizeAngleDeg',
  'getAngleDeltaDeg',
  'getAiRecentAngleSpreadMeta',
  'applyAiAntiRepeatAngleGuard',
];
vm.createContext(context);
vm.runInContext(fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n'), context);

const baseAnglesDeg = [42, 43.5, 41.8, 42.2, 43.1, 42.4, 42.0, 42.6, 41.9, 42.3, 42.1, 42.5];

const beforeAngles = [...baseAnglesDeg];
const afterAngles = [];
const aiState = { recentLaunchAnglesDeg: [], angleRepeatStreakCount: 0, turnNumber: 0, tieBreakerSeed: 77 };

for(let i = 0; i < baseAnglesDeg.length; i += 1){
  const baseAngleDeg = baseAnglesDeg[i];
  const guard = context.applyAiAntiRepeatAngleGuard(baseAngleDeg * Math.PI / 180, {
    recentAnglesDeg: aiState.recentLaunchAnglesDeg,
    repeatStreakCount: aiState.angleRepeatStreakCount,
    seedParts: [aiState.turnNumber, aiState.tieBreakerSeed, 'plane_blue_1', i],
  });
  const angleDeg = context.normalizeAngleDeg(guard.adjustedAngleRad * 180 / Math.PI);
  afterAngles.push(angleDeg);

  aiState.recentLaunchAnglesDeg.push(angleDeg);
  if(aiState.recentLaunchAnglesDeg.length > context.AI_ANGLE_REPEAT_HISTORY_LIMIT){
    aiState.recentLaunchAnglesDeg.splice(0, aiState.recentLaunchAnglesDeg.length - context.AI_ANGLE_REPEAT_HISTORY_LIMIT);
  }
  const spreadMeta = context.getAiRecentAngleSpreadMeta(aiState.recentLaunchAnglesDeg);
  aiState.angleRepeatStreakCount = spreadMeta.clustered ? aiState.angleRepeatStreakCount + 1 : 0;
  aiState.turnNumber += 1;
}

const threshold = context.AI_ANGLE_REPEAT_TIGHT_SPREAD_DEG;
const beforeShare = repeatedShare(beforeAngles, threshold);
const afterShare = repeatedShare(afterAngles, threshold);

if(!(afterShare < beforeShare)){
  throw new Error(`Expected lower repeated-angle share after guard. before=${beforeShare.toFixed(3)}, after=${afterShare.toFixed(3)}`);
}

console.log('Smoke test passed: repeated-angle share is lower after anti-repeat guard.');
console.log(`Before repeat share (<= ${threshold}°): ${beforeShare.toFixed(3)}`);
console.log(`After repeat share  (<= ${threshold}°): ${afterShare.toFixed(3)}`);
console.log('Before angles:', beforeAngles.map((value) => value.toFixed(2)).join(', '));
console.log('After angles :', afterAngles.map((value) => value.toFixed(2)).join(', '));
