#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found: ${fnName}`);
}

function extractConstObject(source, constName){
  const signature = `const ${constName} = {`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Const object not found: ${constName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0){
      end = i;
      break;
    }
  }
  if(end === -1) throw new Error(`Const object end not found: ${constName}`);
  const literal = source.slice(bodyStart, end + 1);
  return vm.runInNewContext(`(${literal})`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const INVENTORY_ITEM_TYPES = extractConstObject(source, 'INVENTORY_ITEM_TYPES');

const sandbox = {
  Math,
  INVENTORY_ITEM_TYPES,
  aiRoundState: { currentGoal: 'attack_enemy_plane' },
  aiMoveScheduled: true,
  logAiDecision: () => {},
  maybeUseInventoryBeforeLaunch: () => false,
  failSafeAdvanceTurn: () => {},
  advanceTurn: () => {},
};
vm.createContext(sandbox);

const fnNames = [
  'classifyAiMoveStageException',
  'isSafeMineRecoveryCandidate',
  'runAiTechnicalRecoveryWithSafeMine',
];
vm.runInContext(fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n'), sandbox);

let appliedMine = false;
let failSafePayload = null;
let recoveryLogSeen = false;

const plannedMove = {
  plane: { id: 'blue-1' },
  goalName: 'defend_lane',
  inventoryCandidates: [
    {
      itemType: INVENTORY_ITEM_TYPES.MINE,
      placementMode: 'defensive',
      safeAfterPlacement: true,
      reason: 'defensive_mine_cover',
      minePlan: { scenario: 'defensive' },
    },
  ],
};

const recoveryResult = sandbox.runAiTechnicalRecoveryWithSafeMine({ shouldUseFlagsMode: false }, plannedMove, {
  source: 'smoke_main_branch_exception',
  stage: 'inventory_usage_exception_recovery',
  errorPayload: {
    reasonCode: 'base_launch_execution_exception',
    primaryCauseType: 'invalid_move_object',
  },
  errorObj: new Error('forced_main_branch_exception_for_smoke'),
  maybeUseInventoryFn: (_context, move, opts) => {
    const forcedMine = opts?.tacticalSurplusPolicy?.forcedItemType === INVENTORY_ITEM_TYPES.MINE;
    const selectedMine = move?.selectedInventoryCandidate?.itemType === INVENTORY_ITEM_TYPES.MINE;
    appliedMine = forcedMine && selectedMine;
    return appliedMine;
  },
  failSafeAdvanceTurnFn: (_reason, payload) => {
    failSafePayload = payload;
  },
  logAiDecisionFn: (eventName) => {
    if(eventName === 'ai_technical_recovery_safe_mine_applied') recoveryLogSeen = true;
  },
});

assert(recoveryResult?.recovered === true, 'Recovery should be successful.');
assert(recoveryResult?.reasonCode === 'technical_recovery_with_safe_mine', 'Reason code must indicate technical recovery with safe mine.');
assert(appliedMine, 'Safe mine branch should be executed even after forced exception in main branch.');
assert(Boolean(failSafePayload), 'Turn should be completed via fail-safe payload (non-empty turn).');
assert(failSafePayload?.reasonCode === 'technical_recovery_with_safe_mine', 'Fail-safe reasonCode should match technical recovery.');
assert(recoveryLogSeen, 'Recovery-specific diagnostic log should be emitted.');

console.log('Smoke test passed: forced main branch exception still ends turn via safe mine technical recovery.');
