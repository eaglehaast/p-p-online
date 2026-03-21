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

const scriptSource = fs.readFileSync('script.js', 'utf8');
const modelSource = fs.readFileSync('ai/v2/goalPriorityModel.js', 'utf8');

const snippets = [
  'getDistanceFromPointToSegment',
  'getMineThreatMetaForSegment',
  'getMineControlSummaryForPlane',
  'getBluePriorityEnemy',
  'getAiStrategicTargetPoint',
  'buildSimulatedFlagCarrierFromPickup',
  'buildFlagContinuationStatusLabel',
  'getImmediateResponseThreatMeta',
  'evaluateFlagPickupContinuation',
].map((name) => extractFunctionSource(scriptSource, name)).join('\n\n');

const context = {
  Math,
  Number,
  console,
  mines: [],
  CELL_SIZE: 20,
  MAX_DRAG_DISTANCE: 360,
  MINE_TRIGGER_RADIUS: 18,
  AI_IMMEDIATE_RESPONSE_DANGER_RADIUS: 90,
  ATTACK_RANGE_PX: 120,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  FIELD_WIDTH: 600,
  FIELD_HEIGHT: 400,
  FIELD_BORDER_OFFSET_X: 0,
  FIELD_BORDER_OFFSET_Y: 0,
  aiRoundState: { currentGoal: 'capture_enemy_flag' },
  dist(a, b){ return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0)); },
  getPlaneDangerGeometry(){ return { radius: 0 }; },
  getPlaneEffectiveRangePx(){ return 110; },
  isPathClear(){ return true; },
  getBaseAnchor(color){ return color === 'blue' ? { x: 40, y: 200 } : { x: 560, y: 200 }; },
  getFlagCarrierForColor(){ return null; },
  getFlagAnchor(flag){ return flag; },
  getAiMoveLandingPoint(plannedMove){ return plannedMove?.landingPoint || null; },
  planPathToPoint(plane, x, y){
    return { vx: x - plane.x, vy: y - plane.y, totalDist: Math.hypot(x - plane.x, y - plane.y), landingPoint: { x, y } };
  },
};
vm.createContext(context);
vm.runInContext(snippets, context);
vm.runInContext(modelSource, context);

// 1. Цель откладывается из-за мины на главном коридоре.
context.mines = [{ owner: 'green', x: 160, y: 200 }];
const plane = { id: 'blue-1', color: 'blue', x: 40, y: 200 };
const pickupPoint = { x: 260, y: 200 };
const continuation = context.evaluateFlagPickupContinuation(plane, pickupPoint, {
  homeBase: { x: 40, y: 200 },
  enemies: [{ id: 'enemy-1', color: 'green', x: 290, y: 200, isAlive: true }],
  context: { enemies: [{ id: 'enemy-1', color: 'green', x: 290, y: 200, isAlive: true }], homeBase: { x: 40, y: 200 } },
  goalName: 'smoke_flag_pressure',
});
assert(continuation.statusReason === 'objective_delayed_due_to_mine_control', 'Mine on main corridor should delay flag objective.');

// 2. ИИ выбирает обход вместо прямой точки.
context.aiRoundState.currentGoal = 'capture_enemy_flag';
const detourTarget = context.getAiStrategicTargetPoint({
  availableEnemyFlags: [{ x: 300, y: 200 }],
  enemies: [{ id: 'enemy-2', color: 'green', x: 320, y: 220, isAlive: true }],
  homeBase: { x: 40, y: 200 },
}, { plane });
assert(detourTarget && Number.isFinite(detourTarget.x) && Math.abs(detourTarget.y - 200) > 1, 'Strategic target should become a detour point when direct route is mined.');

// 3. ИИ видит минную ловушку и уходит в режим перестроения.
const selection = context.PaperWingsGoalPriorityModel.evaluate({
  shouldUseFlagsMode: true,
  availableEnemyFlagsCount: 1,
  aiAliveCount: 1,
  enemyAliveCount: 1,
  hasSafePostPickupEscape: false,
  hasReturnRouteOpportunity: false,
  expectedRetreatChance: 0.2,
  returnLaneThreat: 0.4,
  postPickupEscapeValue: 0.2,
  flagReturnValue: 0.1,
  cargoAlternativeValue: 0.1,
  attackAlternativeValue: 0.1,
  mineRoutePressure: 0.6,
  mineDetourValue: 0.1,
  mineDefensiveUrgency: 0.52,
  trappedByMines: true,
  enemyMineCoverAfterAdvance: true,
});
assert(selection.selectedGoalClass === 'survival_reposition', 'Mine trap should switch strategic model into survival/reposition.');
assert(selection.goalClassEvaluations.some((entry) => entry.reason === 'reposition_due_to_mine_trap'), 'Mine trap reason should be exposed in diagnostics.');

console.log('Smoke test passed: mine strategy devalues objectives, prefers detours, and triggers trap repositioning.');
