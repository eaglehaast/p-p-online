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

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const decisionLog = [];

const plane = { id: 'b1', x: 80, y: 0, color: 'blue' };
const enemies = [
  { id: 'g1', x: 170, y: -30, isAlive: true },
  { id: 'g2', x: 170, y: 40, isAlive: true },
];

const context = {
  Math,
  CELL_SIZE: 20,
  MAX_DRAG_DISTANCE: 300,
  AI_IMMEDIATE_RESPONSE_DANGER_RADIUS: 120,
  FIELD_FLIGHT_DURATION_SEC: 1,
  colliders: [
    { cx: 190, cy: 80, halfWidth: 14, halfHeight: 14 },
  ],
  getAvailableFlagsByColor: () => [{ id: 'flag-green' }],
  getFlagAnchor: () => ({ x: 240, y: 0 }),
  getBaseAnchor: () => ({ x: 200, y: 0 }),
  getAiFlightRangeProfile: () => ({ flightDistancePx: 150 }),
  planPathToPoint: (p, x, y) => ({ plane: p, vx: x - p.x, vy: y - p.y, totalDist: Math.hypot(x - p.x, y - p.y) }),
  isFailSafeSpecialRouteCandidate: () => false,
  validateAiLaunchMoveCandidate: () => ({ ok: true }),
  getAiMoveLandingPoint: (move) => ({ x: move.plane.x + move.vx, y: move.plane.y + move.vy }),
  getAiNoticeableProgressMeta: () => ({ hasNoticeableProgress: true }),
  getImmediateResponseThreatMeta: () => ({ count: 0, nearestDist: 180 }),
  getFallbackCandidateResponseRisk: () => 0,
  isPathClear: (x1, y1, x2, y2) => {
    // Provide cover on upper staging point by blocking enemy line of sight to it.
    if((x1 === 170 && y1 === -30) && Math.abs(x2 - 200) < 1 && Math.abs(y2 - 80) < 1) return false;
    // Allow movement and flag line checks in this smoke setup.
    return true;
  },
  logAiDecision: (reason, payload) => decisionLog.push({ reason, payload }),
};

vm.createContext(context);
const fnNames = [
  'normalizeFailSafeLaunchCandidate',
  'estimateFallbackInterceptionRisk',
  'getCoverMetaAtLandingPoint',
  'getPreFlagStagingPointsNearEnemyBase',
  'findPreFlagCautiousAdvanceMove',
];
vm.runInContext(fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n'), context);

const selected = context.findPreFlagCautiousAdvanceMove({ enemies }, [plane], enemies);
assert(selected, 'Expected cautious base progression move to be selected.');
assert(selected.goalName === 'cautious_progress_to_enemy_base', 'Expected dedicated cautious progression goal name.');
assert(selected.coverMeta && selected.coverMeta.hasCover === true, 'Expected selected move to require cover.');
assert(Number.isFinite(selected.interceptionRisk), 'Expected interception risk to be calculated.');
assert(selected.targetPoint && selected.targetPoint.y > 0, 'Expected covered upper staging point to win over more open alternatives.');

const selectedLog = decisionLog.find((entry) => entry.reason === 'cautious_progress_to_base_selected');
assert(Boolean(selectedLog), 'Expected dedicated audit log for cautious progression selection.');
assert(selectedLog.payload?.stage === 'cautious_progress_to_base', 'Expected stage marker for cautious progression.');

const unavailableDecisionLog = [];
context.colliders = [];
context.isPathClear = () => true;
context.logAiDecision = (reason, payload) => unavailableDecisionLog.push({ reason, payload });
const unavailable = context.findPreFlagCautiousAdvanceMove({ enemies }, [plane], enemies);
assert(unavailable === null, 'Expected no cautious move when there is no cover.');
const unavailableLog = unavailableDecisionLog.find((entry) => entry.reason === 'cautious_progress_to_base_unavailable');
assert(Boolean(unavailableLog), 'Expected dedicated audit log when cautious progression is unavailable.');

console.log('Smoke test passed: cautious base progression prefers covered low-risk pre-flag points and logs dedicated audit markers.');
