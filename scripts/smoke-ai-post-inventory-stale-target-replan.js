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

function extractConstSource(source, constName){
  const escaped = constName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`^const\\s+${escaped}\\s*=\\s*.+;$`, 'm'));
  if(!match) throw new Error(`Const not found in script.js: ${constName}`);
  return match[0];
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function createScenario(){
  return {
    plannedMove: {
      plane: { id: 'blue-1', x: 0, y: 0, isAlive: true, burning: false, lifeState: 'alive' },
      enemy: { id: 'green-target', x: 100, y: 0, isAlive: true, burning: false, lifeState: 'alive' },
      targetEnemy: { id: 'green-target', x: 100, y: 0, isAlive: true, burning: false, lifeState: 'alive' },
      vx: 100,
      vy: 0,
      goalName: 'direct_finisher',
    },
    movedEnemy: { id: 'green-target', x: 340, y: 0, isAlive: true, burning: false, lifeState: 'alive' },
    fallbackMove: {
      plane: { id: 'blue-2', x: 0, y: 0, isAlive: true, burning: false, lifeState: 'alive' },
      enemy: { id: 'green-fresh', x: 40, y: 120 },
      vx: 40,
      vy: 120,
      goalName: 'safe_fallback_lane',
    },
  };
}

function createRuntime(scenario){
  const launches = [];
  const logs = [];
  const timeouts = [];

  const allPlanes = [
    scenario.plannedMove.plane,
    scenario.movedEnemy,
    scenario.fallbackMove.plane,
    { id: 'green-fresh', x: 40, y: 120, isAlive: true, burning: false, lifeState: 'alive' },
  ];

  const context = {
    Math,
    Number,
    Boolean,
    Infinity,
    ATTACK_RANGE_PX: 200,
    AI_POST_INVENTORY_LAUNCH_DELAY_MS: 1,
    AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX: 90,
    INVENTORY_ITEM_TYPES: { DYNAMITE: 'dynamite' },
    INVENTORY_ITEMS: [{ type: 'dynamite' }],
    aiRoundState: { currentGoal: 'direct_finisher' },
    aiPostInventoryLaunchTimeout: null,
    aiMoveScheduled: true,
    dynamiteState: [],
    flyingPoints: [],
    allPlanes,
    evaluateBlueInventoryState(){ return { total: 1, counts: { dynamite: 0 } }; },
    maybeUseInventoryBeforeLaunch(){ return true; },
    consumeAiDynamiteIntentIfUsed(){},
    getAiDynamiteIntentScoreAdjustment(){ return { usedIntent: true }; },
    detectConsumedInventoryType(){ return null; },
    clearAiDynamiteIntent(){},
    addItemToInventory(){},
    playInventoryConsumeFx(){},
    registerAiInventoryUsageAfterMove(){},
    isPlaneLaunchStateReady(plane){ return plane?.isAlive === true && plane?.burning !== true; },
    isPlaneTargetable(plane){ return plane?.isAlive === true && plane?.burning !== true && plane?.lifeState === 'alive'; },
    getAiMoveLandingPoint(move){ return { x: move.plane.x + move.vx, y: move.plane.y + move.vy }; },
    isPathClear(){ return true; },
    getFallbackAiMove(){ return { ...scenario.fallbackMove, plane: scenario.fallbackMove.plane }; },
    getGuaranteedAnyLegalLaunch(){ return null; },
    issueAIMove(plane, vx, vy){ launches.push({ planeId: plane?.id ?? null, vx, vy }); },
    recordAiSelfAnalyzerDecision(){},
    advanceTurn(){},
    logAiDecision(event, payload){ logs.push({ event, payload }); },
    setTimeout(fn){ timeouts.push(fn); return timeouts.length; },
    clearTimeout(){},
  };

  return { context, launches, logs, timeouts };
}

function runBeforeBehavior(scenario){
  const launches = [];
  const logs = [];
  const plannedMove = { ...scenario.plannedMove, plane: scenario.plannedMove.plane };

  logs.push({ event: 'before_selected_target', payload: { enemyId: plannedMove.enemy.id } });
  launches.push({ planeId: plannedMove.plane.id, vx: plannedMove.vx, vy: plannedMove.vy });
  return { launches, logs };
}

const source = fs.readFileSync('script.js', 'utf8');
const aiRadiusConst = extractConstSource(source, 'AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX');
const fns = [
  'getAiDynamiteIntentScoreAdjustment',
  'detectConsumedInventoryType',
  'issueAIMoveWithInventoryUsage',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const scenario = createScenario();
const before = runBeforeBehavior(scenario);

const runtime = createRuntime(scenario);
vm.createContext(runtime.context);
vm.runInContext(`${aiRadiusConst}\n${fns}`, runtime.context);

const plannedMoveAfter = {
  ...scenario.plannedMove,
  plane: scenario.plannedMove.plane,
  enemy: { ...scenario.plannedMove.enemy },
  targetEnemy: { ...scenario.plannedMove.targetEnemy },
};
runtime.context.issueAIMoveWithInventoryUsage({}, plannedMoveAfter);

assert(runtime.timeouts.length === 1, 'Expected delayed launch timeout to be scheduled.');
runtime.timeouts[0]();

assert(before.launches.length === 1, 'Before behavior should launch once.');
assert(before.launches[0].vx === 100 && before.launches[0].vy === 0,
  'Before behavior should launch into stale original point.');
assert(before.logs.some((entry) => entry.payload?.enemyId === 'green-target'),
  'Before behavior should keep original enemy id in logs.');

assert(runtime.launches.length === 1, 'After behavior should launch exactly once.');
assert(runtime.launches[0].planeId === 'blue-2',
  'After behavior should replan and launch fallback plane instead of stale original move.');
assert(runtime.launches[0].vx === 40 && runtime.launches[0].vy === 120,
  'After behavior should launch using fallback vector.');

const staleReplanned = runtime.logs.find((entry) => entry.event === 'stale_target_replanned');
assert(Boolean(staleReplanned), 'After behavior must emit stale_target_replanned log.');
assert(staleReplanned.payload?.previousEnemyId === 'green-target',
  'stale_target_replanned should include previous enemy id.');
assert(staleReplanned.payload?.fallbackGoal === 'safe_fallback_lane',
  'stale_target_replanned should include fallback goal.');

console.log('Smoke test passed: stale delayed target is revalidated and replanned.');
console.log('Before logs:', before.logs);
console.log('After logs :', runtime.logs.filter((entry) => entry.event === 'stale_target_replanned'));
