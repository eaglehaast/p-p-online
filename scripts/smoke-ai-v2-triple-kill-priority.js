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
const logs = [];
let issuedMove = null;

const bluePlane = { id: 'blue-1', color: 'blue', x: 20, y: 50, isAlive: true };
const enemies = [
  { id: 'green-1', color: 'green', x: 140, y: 50, isAlive: true, burning: false },
  { id: 'green-2', color: 'green', x: 165, y: 50, isAlive: true, burning: false },
  { id: 'green-3', color: 'green', x: 190, y: 50, isAlive: true, burning: false },
];

const context = {
  Math,
  Number,
  Object,
  Array,
  gameMode: 'computer',
  isGameOver: false,
  AI_V2_INVENTORY_PHASE: 2,
  aiRoundState: {},
  points: [bluePlane, ...enemies],
  cargoState: [{ id: 'cargo-1', state: 'ready' }],
  getAvailableFlagsByColor: () => [{ id: 'flag-1', color: 'green' }],
  isFlagsModeEnabled: () => true,
  getAvailableInventoryCount: () => 1,
  rankAiPlanesForCurrentTurn: (planes) => planes,
  isPlaneLaunchStateReady: () => true,
  getAiRiskProfile: () => ({ profile: 'balanced' }),
  getBlueDefensivePriority: () => ({ hasQuickFlagPickupThreat: false, quickFlagPickupThreat: null }),
  logAiDecision: (reason, details) => logs.push({ reason, details }),
  recordAiSelfAnalyzerDecision: (reason, details) => logs.push({ reason, details, analyzer: true }),
  issueAIMoveFromDoComputerMove: (_modeContext, move, meta) => {
    issuedMove = { move, meta };
    return { ok: true, move, meta };
  },
  getScoreGap: () => 0,
  getFlagCarrierForColor: () => null,
  window: {
    PaperWingsGoalPriorityModel: {
      evaluate(){
        return {
          selectedGoalClass: 'cargo_swing_pickup',
          selectedMode: 'resource_first',
          selectedPriorities: ['pickup_cargo', 'capture_enemy_flag'],
          selectedWeight: 0.66,
        };
      },
    },
  },
  shouldKeepV2GroupKillPriority: () => ({ allowed: false, reason: 'triple_kill_priority_preserved' }),
  buildShotPlan: (goalSelection) => {
    if(goalSelection.goalName === 'triple_kill_priority'){
      return {
        goalName: 'triple_kill_priority',
        decisionReason: 'v2_direct_candidate__goal_triple_kill_priority',
        killCountOnTrajectory: 3,
        multiKillContext: { affectedEnemyIds: enemies.map((enemy) => enemy.id) },
        shotPreview: { killCountOnTrajectory: 3, affectedEnemyIds: enemies.map((enemy) => enemy.id) },
        move: { plane: bluePlane, enemy: enemies[0], routeClass: 'direct', vx: 10, vy: 0 },
      };
    }
    return null;
  },
};
vm.createContext(context);
vm.runInContext([
  extractFunctionSource(source, 'chooseGoal'),
  extractFunctionSource(source, 'runAiTurnV2'),
].join('\n\n'), context);

const result = context.runAiTurnV2();

assert(result && result.ok === true, 'Expected V2 to issue a move immediately.');
assert(issuedMove && issuedMove.move.goalName === 'triple_kill_priority', `Expected forced triple_kill_priority move, got ${issuedMove && issuedMove.move.goalName}.`);
assert(logs.some((entry) => entry.reason === 'triple_kill_priority_preserved'), 'Expected explicit triple-kill preservation log.');
assert(context.aiRoundState.currentGoal === 'triple_kill_priority', `Expected aiRoundState.currentGoal to stay on triple_kill_priority, got ${context.aiRoundState.currentGoal}.`);

console.log('Smoke test passed: V2 keeps the triple-kill route on the direct V2 path.');
console.log(`issuedGoal=${issuedMove.move.goalName} affected=${issuedMove.move.shotPreview ? issuedMove.move.shotPreview.affectedEnemyIds.join(',') : 'n/a'}`);
