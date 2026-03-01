#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
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
const extractedDoComputerMove = extractFunctionSource(source, 'doComputerMove');

let issueMoveCalls = 0;
let advanceTurnCalls = 0;
let scheduledStateBeforeAdvance = null;
let lastLogEvent = null;

const context = {
  Math,
  gameMode: 'computer',
  isGameOver: false,
  aiMoveScheduled: true,
  aiRoundState: {
    turnNumber: 3,
    mode: 'balanced',
    currentGoal: null,
  },
  points: [
    { id: 'b1', color: 'blue', isAlive: true, burning: false },
    { id: 'g1', color: 'green', isAlive: true, burning: false },
  ],
  isFlagsModeEnabled: () => false,
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  getAvailableFlagsByColor: () => [],
  updateAiPlaneIdleCounters: () => {},
  getFlagCarrierForColor: () => null,
  rankAiPlanesForCurrentTurn: (planes) => planes,
  getAvailableInventoryCount: () => 0,
  getAiRiskProfile: () => ({ profile: 'balanced' }),
  logAiDecision: (event, payload) => {
    lastLogEvent = { event, payload };
  },
  selectAiModeForCurrentTurn: () => {},
  getCriticalBlueBaseThreat: () => null,
  getEarlyBaseWarningThreat: () => null,
  tryPlanOpeningCenterControlMove: () => null,
  findDirectFinisherMove: () => null,
  shouldSkipDirectFinisherInOpening: () => false,
  assignAiRolesForTurn: () => null,
  planRoleDrivenAiMove: () => null,
  planModeDrivenAiMove: () => null,
  tryPlanEarlyCargoPickupMove: () => null,
  getFallbackAiMove: () => null,
  issueAIMoveWithInventoryUsage: () => {
    issueMoveCalls += 1;
  },
  recordAiSelfAnalyzerDecision: () => {},
  advanceTurn: () => {
    scheduledStateBeforeAdvance = context.aiMoveScheduled;
    advanceTurnCalls += 1;
  },
};

vm.createContext(context);
vm.runInContext(extractedDoComputerMove, context);

context.doComputerMove();

assert(issueMoveCalls === 0, 'Fail-safe scenario must not issue a move when no move exists.');
assert(advanceTurnCalls === 1, 'Fail-safe scenario must advance turn exactly once.');
assert(scheduledStateBeforeAdvance === false, 'aiMoveScheduled must be reset to false before advanceTurn call.');
assert(lastLogEvent && lastLogEvent.event === 'ai_no_move_fail_safe',
  'Fail-safe scenario must emit ai_no_move_fail_safe log event.');
assert(lastLogEvent.payload && lastLogEvent.payload.counts && lastLogEvent.payload.counts.aiPlanes === 1,
  'Fail-safe log must include aiPlanes count in counts payload.');

const fallbackBranch = source.indexOf('if(fallbackMove){');
const failSafeBranch = source.indexOf('recordDecisionEvent("no_move_found"');
assert(fallbackBranch !== -1, 'Fallback branch must exist in doComputerMove.');
assert(failSafeBranch !== -1, 'Fail-safe no_move_found branch must exist in doComputerMove.');
assert(fallbackBranch < failSafeBranch, 'Fail-safe branch must execute after fallback branch attempt.');

console.log('Smoke test passed: no_move_found fail-safe logs diagnostics and advances the half-turn.');
