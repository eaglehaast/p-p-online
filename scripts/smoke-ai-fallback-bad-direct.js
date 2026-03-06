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
  return vm.runInNewContext(match[1], extraContext);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');
const ATTACK_RANGE_PX = extractConstValue(source, 'ATTACK_RANGE_PX');
const context = {
  Math,
  MAX_DRAG_DISTANCE,
  FIELD_FLIGHT_DURATION_SEC: 1,
  AI_FALLBACK_DIRECT_QUALITY_MIN: extractConstValue(source, 'AI_FALLBACK_DIRECT_QUALITY_MIN'),
  AI_FALLBACK_SAFE_ANGLE_SHORT_SCALE: extractConstValue(source, 'AI_FALLBACK_SAFE_ANGLE_SHORT_SCALE'),
  AI_FALLBACK_SAFE_ANGLE_CANDIDATE_DEG: extractConstValue(source, 'AI_FALLBACK_SAFE_ANGLE_CANDIDATE_DEG', { Object }),
  AI_FALLBACK_RICOCHET_PREP_SCALE: extractConstValue(source, 'AI_FALLBACK_RICOCHET_PREP_SCALE'),
  AI_MIRROR_PATH_PRESSURE_BONUS: 0,
  AI_MIRROR_SCORE_BLOCKED_DIRECT_BONUS: 0,
  AI_MIRROR_SCORE_PRESSURE_BONUS: 0,
  AI_WALL_LOCKED_TARGET_COMBAT_RADIUS: extractConstValue(source, 'AI_WALL_LOCKED_TARGET_COMBAT_RADIUS', { ATTACK_RANGE_PX }),
  AI_WALL_LOCKED_MIRROR_BONUS: extractConstValue(source, 'AI_WALL_LOCKED_MIRROR_BONUS'),
  AI_WALL_LOCKED_POOR_DIRECT_SCORE_PENALTY: extractConstValue(source, 'AI_WALL_LOCKED_POOR_DIRECT_SCORE_PENALTY', { ATTACK_RANGE_PX }),
  AI_WALL_LOCKED_POOR_DIRECT_QUALITY_PENALTY: extractConstValue(source, 'AI_WALL_LOCKED_POOR_DIRECT_QUALITY_PENALTY'),
  AI_MAX_ANGLE_DEVIATION: 0,
  AI_MULTI_KILL_PRIMARY_BONUS: 0,
  AI_IMMEDIATE_RESPONSE_DANGER_RADIUS: MAX_DRAG_DISTANCE,
  AI_FALLBACK_ATTACK_SCORE_TIE_EPSILON: 0.001,
  settings: { flightRangeCells: 20 },
  CELL_SIZE: 16,
  flyingPoints: [],
  hasBlueDynamiteAvailable: () => false,
  getRandomDeviation: () => 0,
  findDirectFinisherMove: () => null,
  getFlagById: () => null,
  getFlagAnchor: () => ({ x: 0, y: 0 }),
  getFlagCarrierForColor: () => null,
  planPathToPoint: () => null,
  isMirrorPressureTarget: () => false,
  findMirrorShot: () => null,
  getAiTargetPriority: () => 'normal',
  getAiLongShotPenaltyMultiplier: () => 1,
  getAiPlaneAdjustedScore: (dist) => dist,
  getAiPlaneIdleTurns: () => 0,
  compareAiCandidateByScoreAndRotation: (candidate, best) => !best || candidate.score < best.score,
  getImmediateResponseThreatMeta: () => ({ count: 0, nearestDist: Number.POSITIVE_INFINITY }),
  getAiMultiKillPotentialContext: () => ({ multiKillPotential: 0, secondaryEnemyId: null, lineDistance: Number.NaN, contactDistance: Number.NaN }),
  isDefenseOrRetreatContext: () => false,
  applyAiMinLaunchScale: (scale) => scale,
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  isPathClear: () => true,
  getAiNoticeableProgressMeta: () => ({ hasProgress: true, progressRatio: 0.5, beforeDist: 100, afterDist: 50, improvement: 50, noticeableThreshold: 10 }),
  logAiDecision: () => {},
  isCurrentMapClearSky: () => false,
};

vm.createContext(context);
const fnNames = [
  'findSafePreparationMoveForAttack',
  'getFallbackDirectAttackQuality',
  'findFallbackSafeAngleRepositionMove',
  'findFallbackRicochetPreparationMove',
  'getFallbackCandidateResponseRisk',
  'buildFallbackAttackScoreDetails',
  'getFallbackAiMove',
];
vm.runInContext(fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n'), context);


function runWallLockedMirrorShareBatch(basePlane){
  const distances = [];
  for(let distance = 70; distance <= 220; distance += 5){
    distances.push(distance);
  }

  let mirrorSelectedCount = 0;
  const rows = [];

  const originalSafeCandidates = context.AI_FALLBACK_SAFE_ANGLE_CANDIDATE_DEG;
  const originalRicochetScale = context.AI_FALLBACK_RICOCHET_PREP_SCALE;
  context.AI_FALLBACK_SAFE_ANGLE_CANDIDATE_DEG = [];
  context.AI_FALLBACK_RICOCHET_PREP_SCALE = 0;

  for(const distance of distances){
    const scenarioEnemy = { id: `g-${distance}`, x: basePlane.x + distance, y: basePlane.y, shieldActive: false };
    context.isPathClear = () => false;
    context.findMirrorShot = () => ({
      mirrorTarget: { x: basePlane.x + Math.max(60, distance * 0.9), y: basePlane.y + 40 },
      totalDist: Math.max(60, distance * 0.72),
    });

    const scenarioMove = context.getFallbackAiMove({
      aiPlanes: [basePlane],
      enemies: [scenarioEnemy],
      shouldUseFlagsMode: false,
      availableEnemyFlags: [],
      homeBase: { x: 30, y: 100 },
      aiRiskProfile: { profile: 'balanced' },
    });

    const selectedMirror = scenarioMove?.decisionReason === 'fallback_mirror_attack';
    if(selectedMirror) mirrorSelectedCount += 1;

    rows.push({
      distance,
      selectedMirror,
      decisionReason: scenarioMove?.decisionReason || null,
    });
  }

  context.AI_FALLBACK_SAFE_ANGLE_CANDIDATE_DEG = originalSafeCandidates;
  context.AI_FALLBACK_RICOCHET_PREP_SCALE = originalRicochetScale;

  const share = distances.length > 0 ? mirrorSelectedCount / distances.length : 0;
  return {
    total: distances.length,
    mirrorSelectedCount,
    mirrorSelectedShare: share,
    rows,
  };
}
const plane = { id: 'b1', x: 100, y: 100 };
const enemy = { id: 'g1', x: 390, y: 100, shieldActive: false };

const move = context.getFallbackAiMove({
  aiPlanes: [plane],
  enemies: [enemy],
  shouldUseFlagsMode: false,
  availableEnemyFlags: [],
  homeBase: { x: 30, y: 100 },
  aiRiskProfile: { profile: 'balanced' },
});

assert(Boolean(move), 'Expected fallback move to exist.');
assert(move.decisionReason !== 'fallback_direct_attack', 'Bad direct fallback should not return direct attack.');
assert(move.decisionReason === 'fallback_safe_angle_reposition', 'Expected first fallback priority: short safe angle reposition.');
assert(move.allowInventoryUsage === true, 'Bad direct fallback must allow inventory usage.');
assert(move.inventoryUsageReason === 'bad_direct_fallback', 'Inventory gate reason must be bad_direct_fallback.');

const quality = context.getFallbackDirectAttackQuality(plane, enemy, Math.hypot(enemy.x - plane.x, enemy.y - plane.y), 'balanced');
assert(quality < context.AI_FALLBACK_DIRECT_QUALITY_MIN, 'Scenario must represent low direct quality.');

const wallLockedBatch = runWallLockedMirrorShareBatch(plane);

console.log('Smoke test passed: low-quality direct shot switches to fallback priority and unlocks inventory only for that case.');
console.log(`directQuality=${quality.toFixed(3)} threshold=${context.AI_FALLBACK_DIRECT_QUALITY_MIN}`);
console.log(`decisionReason=${move.decisionReason}`);
console.log(`wallLockedMirrorSelected=${wallLockedBatch.mirrorSelectedCount}/${wallLockedBatch.total}`);
console.log(`wallLockedMirrorSelectedShare=${wallLockedBatch.mirrorSelectedShare.toFixed(4)}`);
