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

function createSnapshot(){
  return {
    plannedMove: {
      plane: { id: 'blue-opener', x: 0, y: 0 },
      vx: 0,
      vy: 120,
      totalDist: 120,
      goalName: 'capture_enemy_flag',
    },
    inventoryBlue: [{ type: 'dynamite' }],
    dynamiteIntent: {
      colliderId: 'corridor-brick',
      spriteId: 'corridor-brick-sprite',
      x: 100,
      y: 0,
      expiresTurn: 2,
    },
    dynamiteState: [{ id: 'recent-dynamite', owner: 'blue', x: 100, y: 0, spriteId: 'corridor-brick-sprite', spriteRef: { collider: { id: 'corridor-brick' } } }],
  };
}

function createRuntime(snapshot){
  const logs = [];
  const launches = [];
  const inventoryFx = [];
  const inventoryUsage = [];
  const inventoryState = { blue: snapshot.inventoryBlue.map((item) => ({ ...item })) };
  const dynamiteState = snapshot.dynamiteState.map((entry) => ({ ...entry }));
  const aiRoundState = {
    turnNumber: 1,
    currentGoal: 'capture_enemy_flag',
    dynamiteIntent: snapshot.dynamiteIntent ? { ...snapshot.dynamiteIntent } : null,
  };

  const context = {
    Math,
    Number,
    Boolean,
    Infinity,
    performance: { now: () => 0 },
    AI_DYNAMITE_INTENT_LINE_TOLERANCE: 24,
    AI_DYNAMITE_INTENT_SCORE_BONUS: 1.25,
    AI_POST_INVENTORY_LAUNCH_DELAY_MS: 1,
    AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX: 90,
    INVENTORY_ITEM_TYPES: {
      DYNAMITE: 'dynamite',
    },
    INVENTORY_ITEMS: [{ type: 'dynamite' }],
    inventoryState,
    dynamiteState,
    aiRoundState,
    aiPostInventoryLaunchTimeout: null,
    aiMoveScheduled: true,
    evaluateBlueInventoryState(){
      const counts = { dynamite: 0 };
      for(const item of inventoryState.blue){
        if(item?.type === 'dynamite') counts.dynamite += 1;
      }
      return { total: inventoryState.blue.length, counts };
    },
    maybeUseInventoryBeforeLaunch(ctx, plannedMove){
      if(inventoryState.blue.length <= 0) return false;
      inventoryState.blue.pop();
      plannedMove.inventoryUsageReason = 'dynamite_route_opening';
      dynamiteState.push({ id: 'new-dynamite', owner: 'blue', x: 100, y: 0, spriteId: 'corridor-brick-sprite', spriteRef: { collider: { id: 'corridor-brick' } } });
      aiRoundState.dynamiteIntent = { ...snapshot.dynamiteIntent };
      logs.push({ event: 'dynamite_intent_set', payload: { colliderId: 'corridor-brick', turn: 1 } });
      return true;
    },
    getAiMoveLandingPoint(move){
      return { x: move.plane.x + move.vx, y: move.plane.y + move.vy };
    },
    getDistanceFromPointToSegment(px, py, x1, y1, x2, y2){
      const dx = x2 - x1;
      const dy = y2 - y1;
      if(dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      return Math.hypot(px - cx, py - cy);
    },
    consumeAiDynamiteIntentIfUsed(){ return false; },
    removeItemFromInventory(color, type){
      const idx = inventoryState[color].findIndex((item) => item?.type === type);
      if(idx >= 0) inventoryState[color].splice(idx, 1);
    },
    addItemToInventory(color, item){
      inventoryState[color].push(item);
    },
    playInventoryConsumeFx(color, type){ inventoryFx.push({ color, type }); },
    registerAiInventoryUsageAfterMove(value){ inventoryUsage.push(value); },
    logAiDecision(event, payload){ logs.push({ event, payload }); },
    recordAiSelfAnalyzerDecision(){},
    advanceTurn(){},
    clearAiDynamiteIntent(){ aiRoundState.dynamiteIntent = null; },
    isPlaneLaunchStateReady(){ return true; },
    isPlaneTargetable(){ return true; },
    isPathClear(){ return true; },
    getFallbackAiMove(){ return null; },
    getGuaranteedAnyLegalLaunch(){ return null; },
    allPlanes: [snapshot.plannedMove.plane],
    flyingPoints: [],
    issueAIMove(plane, vx, vy){ launches.push({ planeId: plane.id, vx, vy }); },
    setTimeout(fn){ fn(); return 1; },
    clearTimeout(){},
  };

  return { context, logs, launches, inventoryFx, inventoryUsage };
}

function runBefore(snapshot){
  const runtime = createRuntime(snapshot);
  const c = runtime.context;
  const move = { ...snapshot.plannedMove, plane: { ...snapshot.plannedMove.plane } };
  const beforeInv = c.evaluateBlueInventoryState();
  const itemUsed = c.maybeUseInventoryBeforeLaunch({}, move);
  if(itemUsed){
    const afterInv = c.evaluateBlueInventoryState();
    const consumed = beforeInv.counts.dynamite > afterInv.counts.dynamite ? 'dynamite' : null;
    if(consumed) c.playInventoryConsumeFx('blue', consumed);
  }
  c.registerAiInventoryUsageAfterMove(itemUsed);
  if(itemUsed === true){
    c.issueAIMove(move.plane, move.vx, move.vy);
    return runtime;
  }
  c.issueAIMove(move.plane, move.vx, move.vy);
  return runtime;
}

const source = fs.readFileSync('script.js', 'utf8');
const fnCode = [
  'getAiDynamiteIntentScoreAdjustment',
  'detectConsumedInventoryType',
  'issueAIMoveWithInventoryUsage',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const snapshot = createSnapshot();
const before = runBefore(snapshot);

const after = createRuntime(snapshot);
vm.createContext(after.context);
vm.runInContext(fnCode, after.context);
const moveAfter = { ...snapshot.plannedMove, plane: { ...snapshot.plannedMove.plane } };
after.context.issueAIMoveWithInventoryUsage({}, moveAfter);

const beforeSet = before.logs.filter((entry) => entry.event === 'dynamite_intent_set').length;
const beforeUsed = before.logs.filter((entry) => entry.event === 'dynamite_intent_used').length;
const beforeDesync = before.logs.filter((entry) => entry.event === 'dynamite_plan_desync_prevented').length;
const afterSet = after.logs.filter((entry) => entry.event === 'dynamite_intent_set').length;
const afterUsed = after.logs.filter((entry) => entry.event === 'dynamite_intent_used').length;
const afterDesync = after.logs.filter((entry) => entry.event === 'dynamite_plan_desync_prevented').length;

assert(beforeSet === 1 && afterSet === 1, 'Both runs must start from one intent-set event.');
assert(beforeDesync === 0, 'Before snapshot should not contain desync prevention log.');
assert(afterDesync === 1, 'After snapshot must log dynamite_plan_desync_prevented exactly once.');
assert(before.inventoryFx.length === 1, 'Before behavior should consume dynamite FX.');
assert(after.inventoryFx.length === 0, 'After behavior should cancel dynamite FX when route is desynced.');
assert(after.context.inventoryState.blue.length === 1,
  'After behavior should restore dynamite inventory when preventing desync.');
assert(after.context.dynamiteState.length === snapshot.dynamiteState.length,
  'After behavior should remove only newly planted dynamite on desync rollback.');
assert(beforeUsed === 0 && afterUsed === 0,
  'This scenario should not mark intent as used because flight misses intent lane.');

console.log('Smoke test passed: desynced dynamite plan is prevented and launch continues without dynamite.');
console.log('Before logs:', { dynamite_intent_set: beforeSet, dynamite_intent_used: beforeUsed, dynamite_plan_desync_prevented: beforeDesync });
console.log('After logs :', { dynamite_intent_set: afterSet, dynamite_intent_used: afterUsed, dynamite_plan_desync_prevented: afterDesync });
