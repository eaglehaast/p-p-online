#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') paramsDepth += 1;
    if(ch === ')') paramsDepth -= 1;
    if(ch === '{' && paramsDepth === 0){
      bodyStart = i;
      break;
    }
  }
  if(bodyStart === -1) throw new Error(`Function body start not found for: ${fnName}`);
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
const extractedTryPlace = extractFunctionSource(source, 'tryPlaceBlueDefensiveMine');
const extractedDecision = extractFunctionSource(source, 'evaluateAiMineTacticalPlanDecision');

const logs = [];
let placeMineCalls = 0;
const recordedImpacts = [];

const context = {
  Math,
  Number,
  MINE_EFFECT_RADIUS: 40,
  MINE_TRIGGER_RADIUS: 40,
  AI_MINE_SELF_RISK_CONFIG: {
    SELF_RISK_ASSESSMENT: {
      DANGER_RADIUS_MULTIPLIER: 1.1,
      HARD_IMMEDIATE_RADIUS_MULTIPLIER: 0.78,
      HARD_LANDING_RADIUS_MULTIPLIER: 0.6,
      SUPER_CRITICAL_RADIUS_MULTIPLIER: 0.4,
    },
  },
  MAX_DRAG_DISTANCE: 300,
  getAiItemSpendStyle: () => 'balanced',
  getMineRiskStyleConfig: () => ({ GOAL_RISK_PENALTY_MULTIPLIER: 0.4, MODERATE_SELF_RISK_PENALTY_MULTIPLIER: 1, SELF_RISK_PENALTY_BASE: 1.35 }),
  getPlaneEffectiveRangePx: () => 140,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  CELL_SIZE: 40,
  aiRoundState: { currentGoal: 'capture_enemy_flag' },
  getAiMoveLandingPoint: () => ({ x: 100, y: 0 }),
  isPathClear: () => true,
  isMinePlacementValid: () => true,
  evaluateBlueMinePlacementImpact: (_ctx, _move, placement) => {
    const impact = {
      placement,
      scenario: 'mine_blocks_escape_lane',
      score: 2.6,
      totalDirectionLoss: 0.4,
      blockedEscapeCount: 1,
      cutRouteCount: 0,
      trapCount: 0,
      enemyReports: [],
    };
    recordedImpacts.push(impact);
    return impact;
  },
  evaluateMineFriendlyRisk: () => ({ highRisk: false, riskScore: 0.12, reasons: [] }),
  getMineRiskAcceptedBecause: () => null,
  canAcceptMineHighRiskByAggressiveMode: () => false,
  placeMine: () => { placeMineCalls += 1; },
  logAiDecision: (reason, details) => logs.push({ reason, details }),
};

vm.createContext(context);
vm.runInContext(extractedTryPlace, context);

const evalImpact = context.tryPlaceBlueDefensiveMine({
  enemies: [{ id: 'enemy-1', x: 130, y: 0 }],
}, {
  plane: { id: 'plane-1', x: 0, y: 0 },
  goalName: 'capture_enemy_flag',
}, { evaluateOnly: true });

assert(Boolean(evalImpact), 'Moderate self-risk defensive mine should stay available for planning.');
assert(evalImpact.selfRiskDowngraded === true, 'Moderate self-risk case should be downgraded with a penalty.');
assert(evalImpact.selfRiskPenalty > 0 && evalImpact.selfRiskPenalty < 1.35,
  'Flag-focused goal should apply a lighter self-risk penalty.');

const didPlace = context.tryPlaceBlueDefensiveMine({
  enemies: [{ id: 'enemy-1', x: 130, y: 0 }],
}, {
  plane: { id: 'plane-1', x: 0, y: 0 },
  goalName: 'capture_enemy_flag',
});

assert(didPlace === true, 'Mine should now be placed for moderate self-risk defensive cover case.');
assert(placeMineCalls === 1, 'Mine placement should occur exactly once in soft-risk case.');
assert(!logs.some((entry) => entry.reason === 'mine_skipped_self_risk'),
  'Soft-risk case should no longer be rejected as hard self-risk skip.');
assert(logs.some((entry) => entry.reason === 'mine_soft_risk_penalty_applied' && entry.details?.reasonCode === 'mine_soft_risk_penalty'),
  'Soft-risk path should emit explicit soft-risk code in logs.');
assert(recordedImpacts[0].blockedEscapeCount >= 1,
  'Placed mine should still represent a defensive next-turn lane protection value.');

const tacticalDecisionContext = {
  Math,
  Number,
  aiRoundState: { currentGoal: 'capture_enemy_flag' },
  AI_MINE_PLAN_THRESHOLDS: {
    MIN_NOTICEABLE_IMPACT_SCORE: 4.1,
    MIN_NOTICEABLE_DIRECTION_LOSS: 1.7,
    EXTRA_NOTICEABLE_IMPACT_SCORE: 1.5,
    MIN_MODERATE_IMPACT_SCORE: 2.6,
    MIN_MODERATE_SAFE_IMPACT_SCORE: 2.25,
    MIN_MODERATE_SAFE_IMPROVEMENT_IMPACT_SCORE: 1.9,
    MIN_MODERATE_SAFE_IMPROVEMENT_DIRECTION_LOSS: 0.75,
    MIN_SOFT_RISK_ACCEPT_BENEFIT_SCORE: 3.35,
  },
  getAiItemSpendStyle: () => 'balanced',
  getMineRiskStyleConfig: () => ({ ALLOW_MODERATE_RISK_WITH_ROUTE_DENIAL: false }),
  getMineRiskAcceptedBecause: () => null,
};

vm.createContext(tacticalDecisionContext);
vm.runInContext(extractedDecision, tacticalDecisionContext);

const decision = tacticalDecisionContext.evaluateAiMineTacticalPlanDecision({
  preferredMinePlan: {
    plan: {
      score: 2.9,
      blockedEscapeCount: 0,
      cutRouteCount: 0,
      trapCount: 0,
      totalDirectionLoss: 0.5,
      projectedContactDelta: 0.4,
      forcedBadPathCount: 0,
      controlledBasePassCount: 0,
      controlledTurnPointCount: 0,
    },
  },
  safeAfterPlacement: false,
  safetyImprovesAfterPlacement: false,
  isCriticalGoalForDefensiveMine: false,
  mineHasSurplusCharges: false,
  mineProtectsAfterAggressiveAction: false,
  repeatedEmptyTurns: false,
  context: {},
  plannedMove: { goalName: 'capture_enemy_flag' },
  aiItemSpendStyle: 'balanced',
  strategicGoalName: 'capture_enemy_flag',
});

assert(decision.mineRejectedByModerateSelfRisk === false,
  'Moderate self-risk should not auto-reject when benefit is high enough.');
assert(decision.mineSoftRiskAcceptedByBenefit === true,
  'Soft-risk acceptance by benefit should be explicitly marked.');
assert(decision.mineDecisionCode === 'mine_soft_risk_accept',
  'Decision code for accepted moderate risk should be mine_soft_risk_accept.');

console.log('Smoke test passed: moderate self-risk defensive mine is accepted with explicit soft-risk code when benefit is sufficient.');
