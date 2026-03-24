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
const AI_FALLBACK_RETRY_LIMIT_PER_TURN = extractConstValue(source, 'AI_FALLBACK_RETRY_LIMIT_PER_TURN');

const decisionLog = [];
const analyzerLog = [];
let forcedLaunchCount = 0;
let directAdvanceCount = 0;

const fallbackMove = {
  plane: { id: 'b1' },
  vx: 22,
  vy: 4,
  totalDist: 120,
  goalName: 'fail_safe_minimal_targeted_move',
  decisionReason: 'fail_safe_minimal_targeted_move',
};

const context = {
  Math,
  performance: { now: () => 1000 },
  AI_FALLBACK_RETRY_LIMIT_PER_TURN,
  aiRoundState: {
    turnNumber: 17,
    currentGoal: 'attack_enemy_plane',
    fallbackRetryState: {
      turnNumber: 17,
      launchSessionId: null,
      retriesUsed: 0,
      limit: AI_FALLBACK_RETRY_LIMIT_PER_TURN,
      exhausted: false,
      exhaustedReason: null,
      exhaustedAt: null,
      lastIncrementReason: null,
    },
  },
  aiLaunchSession: null,
  turnAdvanceCount: 17,
  turnColors: ['blue', 'green'],
  turnIndex: 0,
  aiMoveScheduled: true,
  isPlaneLaunchStateReady: () => true,
  getFailSafeMinimalTargetedMove: () => fallbackMove,
  getForcedProgressLaunchMove: () => null,
  getGuaranteedAnyLegalLaunch: () => null,
  issueAIMove: () => { forcedLaunchCount += 1; },
  advanceTurn: () => { directAdvanceCount += 1; },
  recordAiSelfAnalyzerDecision: (stage, payload) => analyzerLog.push({ stage, payload }),
  logAiDecision: (reason, payload) => decisionLog.push({ reason, payload }),
};

vm.createContext(context);
const fnNames = [
  'getAiFallbackRetryLimit',
  'getAiLaunchSessionScopeId',
  'ensureAiFallbackRetryStateScope',
  'incrementAiFallbackRetryUsage',
  'isAiFallbackRetryBudgetExhausted',
  'isFailSafeSpecialRouteCandidate',
  'normalizeFailSafeLaunchCandidate',
  'failSafeAdvanceTurn',
];
vm.runInContext(fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n'), context);

for(let i = 0; i < AI_FALLBACK_RETRY_LIMIT_PER_TURN + 1; i += 1){
  context.failSafeAdvanceTurn('v2_safe_turn_resolution', {
    goal: 'attack_enemy_plane',
    reasonCodes: ['v2_shot_plan_not_found'],
    rejectReasons: ['no_v2_shot_plan_move', 'weak_fallback_candidates'],
    modeContext: {
      aiPlanes: [fallbackMove.plane],
      enemies: [{ id: 'g1' }],
    },
  });
}

const forcedLaunchLogs = decisionLog.filter((entry) => entry.reason === 'fail_safe_forced_launch_selected');
const exhaustedDecision = decisionLog.find((entry) => entry.reason === 'fallback_retry_budget_exhausted');
const exhaustedAnalyzer = analyzerLog.find((entry) => entry.stage === 'fallback_retry_budget_exhausted');

assert(forcedLaunchCount === AI_FALLBACK_RETRY_LIMIT_PER_TURN, 'Forced launch count must match retry budget limit.');
assert(forcedLaunchLogs.length === AI_FALLBACK_RETRY_LIMIT_PER_TURN, 'Expected forced launch decision logs before budget exhaustion.');
assert(directAdvanceCount === 1, 'Expected a single direct turn advance once retry budget is exhausted.');
assert(Boolean(exhaustedDecision), 'Expected dedicated decision log for fallback_retry_budget_exhausted.');
assert(Boolean(exhaustedAnalyzer), 'Expected self-analyzer record for fallback_retry_budget_exhausted.');

console.log('Smoke test passed: repeated no_v2_shot_plan_move / weak fallback candidates stop after retry budget exhaustion.');
console.log(`retryLimit=${AI_FALLBACK_RETRY_LIMIT_PER_TURN}`);
console.log(`forcedLaunchCount=${forcedLaunchCount}`);
console.log(`directAdvanceCount=${directAdvanceCount}`);
