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
  if(headerEnd === -1) throw new Error(`Function header end not found for: ${fnName}`);

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

function makeSeededRandom(seed){
  let state = seed >>> 0;
  return function rnd(){
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeGapPathClear(){
  const CELL_SIZE = 20;
  const upperWall = { x1: 120, x2: 180, y1: 0, y2: 80 };
  const lowerWall = { x1: 120, x2: 180, y1: 120, y2: 240 };

  function pointInRect(x, y, r){
    return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
  }

  return function isPathClear(x1, y1, x2, y2){
    const steps = 80;
    for(let i = 0; i <= steps; i += 1){
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if(pointInRect(x, y, upperWall) || pointInRect(x, y, lowerWall)) return false;
    }
    return true;
  };
}

function runAttemptBatch(planPathToPoint, repeatCount){
  const plane = { id: 'smoke-plane', x: 40, y: 100 };
  const target = { x: 260, y: 118 };
  let successCount = 0;
  let aliveMoves = 0;
  let nearAngleRepeats = 0;
  let nearLandingRepeats = 0;
  const nearAngleThresholdRad = Math.PI / 180 * 6;
  const nearLandingThresholdPx = 16;
  let prevAngle = null;
  let prevLanding = null;

  for(let i = 1; i <= repeatCount; i += 1){
    const move = planPathToPoint(plane, target.x, target.y);
    if(move){
      aliveMoves += 1;
      const landingX = plane.x + move.vx * 1;
      const landingY = plane.y + move.vy * 1;
      const angle = Math.atan2(move.vy, move.vx);
      if(prevAngle !== null && Math.abs(angle - prevAngle) <= nearAngleThresholdRad) nearAngleRepeats += 1;
      if(prevLanding && Math.hypot(landingX - prevLanding.x, landingY - prevLanding.y) <= nearLandingThresholdPx) nearLandingRepeats += 1;
      prevAngle = angle;
      prevLanding = { x: landingX, y: landingY };
      if(landingX > 180 && landingY >= 80 && landingY <= 120) successCount += 1;
    }
  }

  const pairCount = Math.max(1, aliveMoves - 1);
  return {
    successCount,
    aliveMoves,
    ratio: successCount / repeatCount,
    nearAngleRepeatRatio: nearAngleRepeats / pairCount,
    nearLandingRepeatRatio: nearLandingRepeats / pairCount,
  };
}

const source = fs.readFileSync('script.js', 'utf8');
const progressMetaSrc = extractFunctionSource(source, 'getAiNoticeableProgressMeta');
const planPathSrc = extractFunctionSource(source, 'planPathToPoint');

const deterministicBeforeSteps = [
  0,
  Math.PI / 72,
  Math.PI / 48,
  Math.PI / 36,
  Math.PI / 24,
];

const logs = [];
const random = makeSeededRandom(20260302);

const context = {
  Math,
  settings: { flightRangeCells: 18, mapIndex: 0 },
  CELL_SIZE: 20,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_MAX_ANGLE_DEVIATION: Math.PI / 6,
  MAX_DRAG_DISTANCE: 360,
  colliders: Array.from({ length: 30 }, (_, index) => ({ id: index + 1 })),
  isPathClear: makeGapPathClear(),
  getRandomDeviation(distance, maxDeviation){
    const centered = random() * 2 - 1;
    return centered * maxDeviation;
  },
  applyAiMinLaunchScale(baseScale){
    return baseScale;
  },
  tryGetAiTacticalMediumScale(){
    return null;
  },
  applyAiAntiRepeatAngleGuard(baseAngle){
    return {
      adjustedAngleRad: baseAngle,
      usedSafeFan: false,
      safeFanOffsetDeg: 0,
      spreadDeg: 0,
      sampleCount: 0,
      repeatStreakCount: 0,
    };
  },
  aiRoundState: { recentLaunchAnglesDeg: [], angleRepeatStreakCount: 0, turnNumber: 1, tieBreakerSeed: 1 },
  isMirrorPressureTarget(){
    return false;
  },
  AI_MIRROR_PATH_PRESSURE_BONUS: 0,
  findMirrorShot(){
    return null;
  },
  logAiDecision(event, payload){
    logs.push({ event, payload });
  },
  isAttackContext(){
    return false;
  },
  isDefenseOrRetreatContext(){
    return false;
  },
  AI_FINISHER_OVERSHOOT_FACTOR: 1,
  isDirectFinisherScenario(){
    return false;
  },
};

vm.createContext(context);
vm.runInContext(progressMetaSrc, context);
vm.runInContext(planPathSrc, context);

function planPathBefore(plane, tx, ty){
  const flightDistancePx = context.settings.flightRangeCells * context.CELL_SIZE;
  const speedPxPerSec = flightDistancePx / context.FIELD_FLIGHT_DURATION_SEC;
  const dx = tx - plane.x;
  const dy = ty - plane.y;
  const dist = Math.hypot(dx, dy);
  const scale = Math.min(dist / context.MAX_DRAG_DISTANCE, 1);
  const baseAngle = Math.atan2(dy, dx);

  const attemptDeviation = context.getRandomDeviation(dist, context.AI_MAX_ANGLE_DEVIATION);
  const deviations = [attemptDeviation, attemptDeviation * 0.5, attemptDeviation * 0.25];

  function tryDeviation(dev){
    const actualAngle = baseAngle + dev;
    const vx = Math.cos(actualAngle) * scale * speedPxPerSec;
    const vy = Math.sin(actualAngle) * scale * speedPxPerSec;
    const landingX = plane.x + vx;
    const landingY = plane.y + vy;
    return context.isPathClear(plane.x, plane.y, landingX, landingY) ? { vx, vy } : null;
  }

  for(const dev of deviations){
    const move = tryDeviation(dev);
    if(move) return move;
  }

  const deterministicDeviations = [];
  for(const step of deterministicBeforeSteps){
    if(step === 0) deterministicDeviations.push(0);
    else deterministicDeviations.push(-step, step);
  }

  for(const dev of deterministicDeviations){
    const move = tryDeviation(dev);
    if(move) return move;
  }

  return null;
}

const repeatCount = 30;
const before = runAttemptBatch(planPathBefore, repeatCount);
const after = runAttemptBatch(context.planPathToPoint, repeatCount);

assert(after.ratio > before.ratio,
  `Expected narrow corridor success ratio to improve. before=${before.ratio}, after=${after.ratio}`);
assert(after.aliveMoves === repeatCount,
  `Expected AI to keep producing moves in the narrow corridor scenario. got=${after.aliveMoves}/${repeatCount}`);

const reasonProbePlane = { id: 'probe', x: 0, y: 0 };
context.isPathClear = function probePathClear(x1, y1, x2, y2){
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const expectedNarrow = Math.PI / 90;
  const nearDirect = Math.abs(angle) < 0.0006;
  const nearNarrow = Math.abs(angle - expectedNarrow) < 0.0006;
  return nearDirect || nearNarrow;
};
context.planPathToPoint(reasonProbePlane, 200, 0);
context.isPathClear = function rejectedPathClear(x1, y1, x2, y2){
  return Math.abs(x2 - 200) < 0.0001 && Math.abs(y2) < 0.0001;
};
context.planPathToPoint(reasonProbePlane, 200, 0);

const selected = logs.filter((entry) => entry.event === 'narrow_corridor_selected').length;
const rejected = logs.filter((entry) => entry.event === 'narrow_corridor_rejected').length;
assert(selected > 0, 'Expected narrow corridor selected reason code to appear in logs.');
console.log('Smoke test passed: narrow corridor branch improves 2-cell gap traversal ratio.');
console.log('Before ratio:', before.ratio.toFixed(3), `(${before.successCount}/${repeatCount})`);
console.log('After ratio :', after.ratio.toFixed(3), `(${after.successCount}/${repeatCount})`);
console.log('Near-repeat angle ratio before/after:', before.nearAngleRepeatRatio.toFixed(3), '/', after.nearAngleRepeatRatio.toFixed(3));
console.log('Near-repeat landing ratio before/after:', before.nearLandingRepeatRatio.toFixed(3), '/', after.nearLandingRepeatRatio.toFixed(3));
console.log('Reason code logs:', { narrow_corridor_selected: selected, narrow_corridor_rejected: rejected });
