#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

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
      if(headerDepth === 0){ headerEnd = i; break; }
    }
  }
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

function getPlanRejectCode(source){
  const planPathSrc = extractFunctionSource(source, 'planPathToPoint');
  const progressMetaSrc = extractFunctionSource(source, 'getAiNoticeableProgressMeta');
  const routeNearbySrc = extractFunctionSource(source, 'countRouteNearbyColliders');

  const context = {
    Math,
    settings: { flightRangeCells: 18, mapIndex: 1 },
    CELL_SIZE: 20,
    FIELD_FLIGHT_DURATION_SEC: 1,
    AI_MAX_ANGLE_DEVIATION: Math.PI / 10,
    MAX_DRAG_DISTANCE: 360,
    AI_LANE_PROGRESS_PRIMARY_THRESHOLD_SCALE: 0.45,
    AI_LANE_PROGRESS_RESERVE_THRESHOLD_SCALE: 0.2,
    AI_LANE_TIGHT_PASS_SCORE_PENALTY_SCALE: 0.35,
    AI_FINISHER_OVERSHOOT_FACTOR: 1,
    AI_IMMEDIATE_RESPONSE_DANGER_RADIUS: 120,
    colliders: [{ id: 'wall', cx: 120, cy: 100, halfWidth: 40, halfHeight: 80, rotation: 0 }],
    aiRoundState: { currentGoal: 'capture_enemy_flag', recentLaunchAnglesDeg: [], angleRepeatStreakCount: 0, turnNumber: 1, tieBreakerSeed: 7 },
    getRandomDeviation(){ return 0; },
    applyAiMinLaunchScale(v){ return v; },
    tryGetAiTacticalMediumScale(){ return null; },
    applyAiAntiRepeatAngleGuard(baseAngle){ return { adjustedAngleRad: baseAngle }; },
    getAiDirectionSectorDeg(){ return 0; },
    getAiStuckRepeatSectorPenalty(){ return 0; },
    markAiStuckSectorUsed(){},
    updateAiStuckAttempt(){},
    isEmergencyDefenseStageGoal(){ return false; },
    isAttackContext(){ return false; },
    isDefenseOrRetreatContext(){ return false; },
    isDirectFinisherScenario(){ return false; },
    isMirrorPressureTarget(){ return false; },
    isCurrentMapClearSky(){ return false; },
    AI_MIRROR_PATH_PRESSURE_BONUS: 0,
    AI_MIRROR_STUCK_RECOVERY_PRESSURE_BONUS: 0,
    AI_SHORT_DETOUR_COLLIDER_THRESHOLD: 0,
    getDistanceFromPointToSegment(){ return 999; },
    getImmediateResponseThreatMeta(){ return { count: 0, nearestDist: Number.POSITIVE_INFINITY }; },
    getFallbackCandidateResponseRisk(){ return 0; },
    findMirrorShot(){ return null; },
    getAiStuckStateForPlane(){ return null; },
    logAiDecision(){},
    isPathClear(){ return false; },
  };

  vm.createContext(context);
  vm.runInContext(progressMetaSrc, context);
  vm.runInContext(routeNearbySrc, context);
  vm.runInContext(planPathSrc, context);

  const plane = { id: 'p1', x: 30, y: 100 };
  const result = context.planPathToPoint(plane, 240, 100, { routeClass: 'direct', goalName: 'capture_enemy_flag' });
  return { hasMove: Boolean(result), code: context.planPathToPoint.lastRejectCode || null };
}

function getMirrorRejectCode(source){
  const mirrorSrc = extractFunctionSource(source, 'findMirrorShot');
  const context = {
    Math,
    colliders: [{ id: 'wall', cx: 80, cy: 120, halfWidth: 20, halfHeight: 20, rotation: 0 }],
    CELL_SIZE: 20,
    MAX_DRAG_DISTANCE: 360,
    AI_MIRROR_MAX_PATH_RATIO: 1.25,
    AI_MIRROR_FIRST_BOUNCE_MIN_DISTANCE: 30,
    AI_MIRROR_CLEARSKY_PATH_RATIO_BONUS: 0,
    AI_MIRROR_MIN_BOUNCE_DISTANCE_SCALE: 0.6,
    AI_MIRROR_STUCK_RELAX_MAX_PATH_RATIO_BONUS: 0,
    AI_MIRROR_STUCK_RELAX_MIN_BOUNCE_DISTANCE_SCALE: 1,
    getMirrorPathRatioLimit(){ return 1.25; },
    getColliderEdges(){ return [{ x1: 70, y1: 100, x2: 90, y2: 100, edgeIndex: 0 }]; },
    buildFieldBorderSurfaces(){ return []; },
    reflectPointAcrossLine(){ return { x: 200, y: 120 }; },
    lineSegmentIntersection(){ return null; },
    isPathClear(){ return true; },
    isPathClearExceptEdge(){ return true; },
    isCurrentMapClearSky(){ return false; },
    logAiDecision(){},
  };
  vm.createContext(context);
  vm.runInContext(mirrorSrc, context);
  const out = context.findMirrorShot({ id: 'p1', x: 10, y: 120 }, { id: 'e1', x: 220, y: 120 }, { logReject: true });
  return { hasMirror: Boolean(out), code: context.findMirrorShot.lastRejectCode || null };
}

const currentSource = fs.readFileSync('script.js', 'utf8');
const baselineSource = execSync('git show HEAD:script.js', { encoding: 'utf8' });

const report = {
  planPathToPoint: {
    baseline: getPlanRejectCode(baselineSource),
    updated: getPlanRejectCode(currentSource),
  },
  findMirrorShot: {
    baseline: getMirrorRejectCode(baselineSource),
    updated: getMirrorRejectCode(currentSource),
  },
};

console.log(JSON.stringify(report, null, 2));
