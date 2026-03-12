#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function end not found: ${fnName}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const script = [
  extractFunctionSource(source, 'validateAiLaunchMoveCandidate'),
  extractFunctionSource(source, 'issueAIMoveWithInventoryUsage'),
].join('\n\n');

const logs = [];
const launches = [];
let forcedProgressCalls = 0;

const context = {
  Math,
  Number,
  Boolean,
  Array,
  AI_POST_INVENTORY_LAUNCH_DELAY_MS: 5,
  AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX: 90,
  INVENTORY_ITEM_TYPES: { DYNAMITE: 'dynamite' },
  INVENTORY_ITEMS: [{ type: 'dynamite' }],
  aiRoundState: { currentGoal: 'fallback_legacy_logic' },
  aiMoveScheduled: true,
  aiPostInventoryLaunchTimeout: null,
  flyingPoints: [],
  dynamiteState: [],
  isPlaneLaunchStateReady: (plane) => plane?.isAlive === true,
  isPlaneTargetable: (plane) => plane?.isAlive === true,
  getAiMoveLandingPoint: (move) => ({ x: move.plane.x + move.vx, y: move.plane.y + move.vy }),
  isPathClear: () => true,
  evaluateBlueInventoryState: () => ({ counts: { dynamite: 0 } }),
  maybeUseInventoryBeforeLaunch: () => false,
  consumeAiDynamiteIntentIfUsed(){},
  detectConsumedInventoryType: () => null,
  registerAiInventoryUsageAfterMove(){},
  playInventoryConsumeFx(){},
  getAiDynamiteIntentScoreAdjustment: () => ({ usedIntent: true }),
  clearAiDynamiteIntent(){},
  addItemToInventory(){},
  advanceTurn(){},
  recordAiSelfAnalyzerDecision(){},
  getFallbackAiMove(){ return null; },
  getGuaranteedAnyLegalLaunch(){ return null; },
  getForcedProgressLaunchMove(){
    forcedProgressCalls += 1;
    return {
      plane: { id: 'blue-fp', x: 0, y: 0, isAlive: true },
      vx: 24,
      vy: 18,
      goalName: 'forced_progress_launch',
      decisionReason: 'forced_progress_launch',
    };
  },
  issueAIMove(plane, vx, vy){
    launches.push({ planeId: plane?.id ?? null, vx, vy });
    return { ok: true };
  },
  logAiDecision(event, payload){ logs.push({ event, payload }); },
};

vm.createContext(context);
vm.runInContext(script, context);

context.issueAIMoveWithInventoryUsage(
  {},
  {
    plane: { id: 'blue-main', x: 0, y: 0, isAlive: true },
    targetEnemy: { id: 'green-1', x: 120, y: 0, isAlive: false },
    enemy: { id: 'green-1', x: 120, y: 0, isAlive: false },
    vx: 30,
    vy: 0,
    goalName: 'fallback_legacy_logic',
    decisionReason: 'fallback_rotation',
    fallbackChainStage: 'fallback_selected',
  }
);

assert(forcedProgressCalls === 1, 'Expected forced progress fallback to be attempted as final replan stage.');
assert(launches.length === 1, 'Expected fallback replan to launch exactly one move.');
assert(launches[0].planeId === 'blue-fp', 'Expected forced progress launch to be committed.');
assert(logs.some((entry) => entry.event === 'fallback_replan_execution_started' && entry.payload?.stage === 'fallback_forced_progress_replan'),
  'Expected log for fallback forced-progress execution start.');
assert(logs.some((entry) => entry.event === 'fallback_replan_execution_committed' && entry.payload?.stage === 'fallback_forced_progress_replan'),
  'Expected log for fallback forced-progress execution commit.');
assert(logs.some((entry) => entry.event === 'fallback_execution_aborted' && entry.payload?.fallbackStage === 'fallback_selected'),
  'Expected aborted fallback execution log with fallback stage metadata.');

console.log('Smoke test passed: fallback replan chain now reaches forced progress and emits execution diagnostics.');
