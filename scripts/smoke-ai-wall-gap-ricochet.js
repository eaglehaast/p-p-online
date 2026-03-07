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

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const progressMetaSrc = extractFunctionSource(source, 'getAiNoticeableProgressMeta');
const routeNearbySrc = extractFunctionSource(source, 'countRouteNearbyColliders');
const planPathSrc = extractFunctionSource(source, 'planPathToPoint');
const openingSrc = extractFunctionSource(source, 'tryPlanOpeningCenterControlMove');

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
  colliders: [
    { id: 'wall-top', cx: 130, cy: 50, halfWidth: 20, halfHeight: 20, rotation: 0 },
    { id: 'wall-bottom', cx: 130, cy: 150, halfWidth: 20, halfHeight: 20, rotation: 0 },
  ],
  aiRoundState: { currentGoal: 'capture_enemy_flag', recentLaunchAnglesDeg: [], angleRepeatStreakCount: 0, turnNumber: 1, tieBreakerSeed: 7 },
  getRandomDeviation(){ return 0; },
  applyAiMinLaunchScale(v){ return v; },
  tryGetAiTacticalMediumScale(){ return null; },
  applyAiAntiRepeatAngleGuard(baseAngle){ return { adjustedAngleRad: baseAngle, usedSafeFan: false, safeFanOffsetDeg: 0, spreadDeg: 0, sampleCount: 0, repeatStreakCount: 0 }; },
  getAiDirectionSectorDeg(){ return 0; },
  getAiStuckRepeatSectorPenalty(){ return 0; },
  markAiStuckSectorUsed(){},
  updateAiStuckAttempt(){},
  isEmergencyDefenseStageGoal(){ return false; },
  isAttackContext(){ return false; },
  isDefenseOrRetreatContext(){ return false; },
  isDirectFinisherScenario(){ return false; },
  isMirrorPressureTarget(){ return false; },
  AI_MIRROR_PATH_PRESSURE_BONUS: 0,
  getDistanceFromPointToSegment(px, py, x1, y1, x2, y2){
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq <= 1e-6 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    return Math.hypot(px - cx, py - cy);
  },
  getImmediateResponseThreatMeta(){ return { count: 0, nearestDist: Number.POSITIVE_INFINITY }; },
  getFallbackCandidateResponseRisk(){ return 0; },
  findMirrorShot(plane, enemy){
    if(enemy && enemy.x < 0){
      return {
        mirrorTarget: { x: enemy.x, y: enemy.y },
        totalDist: Math.hypot(enemy.x - plane.x, enemy.y - plane.y),
      };
    }
    return null;
  },
  logAiDecision(){},
  isPathClear(x1, y1, x2, y2){
    const steps = 80;
    for(let i = 0; i <= steps; i += 1){
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const inUpper = x >= 85 && x <= 175 && y >= 0 && y <= 80;
      const inLower = x >= 85 && x <= 175 && y >= 120 && y <= 220;
      if(inUpper || inLower) return false;
    }
    return true;
  },
};

vm.createContext(context);
vm.runInContext(progressMetaSrc, context);
vm.runInContext(routeNearbySrc, context);
vm.runInContext(planPathSrc, context);

const plane = { id: 'p1', x: 30, y: 100 };

const directMove = context.planPathToPoint(plane, 240, 100, { routeClass: 'direct', goalName: 'capture_enemy_flag' });
const gapMove = context.planPathToPoint(plane, 240, 100, { routeClass: 'gap', decisionReason: 'flag_capture_gap_candidate' });
const ricochetMove = context.planPathToPoint(plane, -240, 100, { routeClass: 'ricochet', decisionReason: 'flag_capture_bounce_candidate' });

assert(directMove && directMove.routeMetrics, 'Expected direct candidate to be valid with route metrics.');
assert(gapMove && gapMove.routeMetrics, 'Expected gap candidate to be valid with route metrics.');
assert(ricochetMove && ricochetMove.routeMetrics, 'Expected ricochet candidate to be valid with route metrics.');

assert(typeof directMove.routeMetrics.clearance === 'number', 'Missing clearance metric on direct candidate.');
assert(typeof gapMove.routeMetrics.corridorTightness === 'number', 'Missing corridor tightness metric on gap candidate.');
assert(typeof ricochetMove.routeMetrics.responseRisk === 'number', 'Missing response risk metric on ricochet candidate.');

const context2 = {
  Math,
  turnAdvanceCount: 1,
  AI_OPENING_CENTER_TURN_LIMIT: 8,
  AI_CENTER_CONTROL_DISTANCE: 10,
  CELL_SIZE: 20,
  ATTACK_RANGE_PX: 180,
  AI_CARGO_RISK_ACCEPTANCE: 0.5,
  aiRoundState: { currentGoal: 'opening_center_control' },
  cargoState: [{ id: 'c1', x: 240, y: 100, state: 'ready' }],
  getCenterControlAnchor(){ return { x: 200, y: 100 }; },
  getGroundedAiPlanes(planes){ return planes || []; },
  evaluateCargoPickupRisk(){ return { isSafePath: true, totalRisk: 0 }; },
  evaluateFavorableCargoCandidate(){ return { isFavorableCargo: true }; },
  getAiPlaneAdjustedScore(v){ return v; },
  getAiPlaneIdleTurns(){ return 0; },
  compareAiCandidateByScoreAndRotation(next, current){ return !current || next.score < current.score; },
  logAiDecision(){},
  isEmergencyDefenseStageGoal(){ return false; },
  dist(a, b){ return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)); },
  planPathToPoint(){
    context2.planPathToPoint.lastRejectCode = 'blocked_after_bounce';
    return null;
  },
};
vm.createContext(context2);
vm.runInContext(openingSrc, context2);
const openingResult = context2.tryPlanOpeningCenterControlMove({ aiPlanes: [{ id: 'p2', x: 30, y: 100 }] });
assert(openingResult && openingResult.rejectReason === 'blocked_after_bounce', 'Expected route-level reject code instead of no_candidate_after_path_check.');

console.log('Smoke test passed: wall+gap+ricochet candidates validated and route-level reject code preserved.');
