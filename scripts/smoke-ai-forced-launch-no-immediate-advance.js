#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
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
const fnSrc = extractFunctionSource(source, 'issueAIMoveWithInventoryUsage');

let advanceTurnCalls = 0;
let issueAIMoveCalls = 0;
let guaranteedFallbackCalls = 0;

const vmContext = {
  Number,
  Math,
  CELL_SIZE: 20,
  FIELD_FLIGHT_DURATION_SEC: 1,
  aiRoundState: { currentGoal: 'smoke_goal' },
  resolveAiFallbackMoveFlag: () => false,
  resolveAiFallbackAnalyzerStage: (reason) => reason,
  recordAiSelfAnalyzerDecision: () => {},
  logAiDecision: () => {},
  aiMoveScheduled: true,
  advanceTurn: () => { advanceTurnCalls += 1; },
  evaluateBlueInventoryState: () => ({ counts: {}, total: 0 }),
  maybeUseInventoryBeforeLaunch: () => false,
  detectConsumedInventoryType: () => null,
  playInventoryConsumeFx: () => {},
  registerAiInventoryUsageAfterMove: () => {},
  consumeAiDynamiteIntentIfUsed: () => {},
  getLatestPendingAiFuelTrainingAttempt: () => null,
  markAiLinearLaunchEvent: () => {},
  getFailSafeGuaranteedDirectMove: () => {
    guaranteedFallbackCalls += 1;
    return { plane: null, vx: Number.NaN, vy: Number.NaN };
  },
  validateAiLaunchMoveCandidate: (move) => {
    const ok = Boolean(move?.plane && Number.isFinite(move.vx) && Number.isFinite(move.vy));
    return ok ? { ok: true } : { ok: false, reason: 'invalid_move' };
  },
  issueAIMove: () => {
    issueAIMoveCalls += 1;
    return { ok: true };
  },
  resolveFinalAiLaunchMoveWithMineGate: () => ({ ok: false, reasonCode: 'blocked', gateResult: { reason: 'blocked' } }),
  points: [],
  context: {},
};

vm.createContext(vmContext);
vm.runInContext(fnSrc, vmContext);

const brokenPlannedMove = {
  plane: { id: 'blue-1', x: 100, y: 100, isAlive: true },
  vx: Number.NaN,
  vy: Number.NaN,
  goalName: 'smoke_goal',
};

vmContext.issueAIMoveWithInventoryUsage({ enemies: [] }, brokenPlannedMove);

assert(guaranteedFallbackCalls >= 1, 'Guaranteed fallback must be attempted at least once.');
assert(issueAIMoveCalls === 1, 'Forced launch fallback must call issueAIMove exactly once.');
assert(advanceTurnCalls === 0, 'Turn must not be advanced when forced launch succeeds.');

console.log('Smoke test passed: forced launch fallback issues one move and does not advance turn.');
