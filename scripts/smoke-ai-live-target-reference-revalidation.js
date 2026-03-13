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

const source = fs.readFileSync('script.js', 'utf8');
const aiRadiusConst = extractConstSource(source, 'AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX');
const fns = [
  'validateAiLaunchMoveCandidate',
  'getAiDynamiteIntentScoreAdjustment',
  'detectConsumedInventoryType',
  'issueAIMoveWithInventoryUsage',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const enemyLive = { id: 'green-1', x: 280, y: 120, isAlive: true, burning: false, lifeState: 'alive' };
const plannedMove = {
  plane: { id: 'blue-1', x: 100, y: 100, isAlive: true, burning: false, lifeState: 'alive' },
  enemy: enemyLive,
  targetEnemy: enemyLive,
  vx: 180,
  vy: 0,
  goalName: 'direct_finisher',
};

const fallbackMove = {
  plane: { id: 'blue-2', x: 120, y: 120, isAlive: true, burning: false, lifeState: 'alive' },
  enemy: { id: 'green-2', x: 200, y: 130, isAlive: true, burning: false, lifeState: 'alive' },
  vx: 80,
  vy: 10,
  goalName: 'fallback_rotation',
};

const launches = [];
const logs = [];
const timeouts = [];
const context = {
  Math,
  Number,
  Boolean,
  Infinity,
  ATTACK_RANGE_PX: 200,
  AI_POST_INVENTORY_LAUNCH_DELAY_MS: 1,
  INVENTORY_ITEM_TYPES: { DYNAMITE: 'dynamite' },
  INVENTORY_ITEMS: [{ type: 'dynamite' }],
  aiRoundState: { currentGoal: 'direct_finisher' },
  aiPostInventoryLaunchTimeout: null,
  aiMoveScheduled: true,
  dynamiteState: [],
  flyingPoints: [],
  allPlanes: [plannedMove.plane, enemyLive, fallbackMove.plane, fallbackMove.enemy],
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
  findActualPlaneById(id, pool){
    const source = Array.isArray(pool) ? pool : context.allPlanes;
    return source.find((plane) => plane?.id === id) || null;
  },
  getAiMoveLandingPoint(move){ return { x: move.plane.x + move.vx, y: move.plane.y + move.vy }; },
  isPathClear(){ return true; },
  getFallbackAiMove(){ return { ...fallbackMove }; },
  getGuaranteedAnyLegalLaunch(){ return null; },
  issueAIMove(plane, vx, vy){ launches.push({ planeId: plane?.id ?? null, vx, vy }); },
  recordAiSelfAnalyzerDecision(){},
  advanceTurn(){},
  logAiDecision(event, payload){ logs.push({ event, payload }); },
  setTimeout(fn){ timeouts.push(fn); return timeouts.length; },
  clearTimeout(){},
};

vm.createContext(context);
vm.runInContext(`${aiRadiusConst}\n${fns}`, context);

context.issueAIMoveWithInventoryUsage({ enemies: [enemyLive, fallbackMove.enemy] }, plannedMove);
assert(timeouts.length === 1, 'Expected delayed launch timeout to be scheduled.');

// Имитируем «призрачную» проблему: цель смещается после планирования,
// но plannedMove хранит живую ссылку на этот же объект.
enemyLive.x = 420;
enemyLive.y = 120;

timeouts[0]();

assert(launches.length === 1, 'Expected exactly one launch.');
assert(launches[0].planeId === 'blue-2', 'Expected fallback launch, not stale direct launch.');
assert(logs.some((entry) => entry.event === 'stale_target_replanned'), 'Expected stale_target_replanned event in logs.');

console.log('Smoke test passed: live enemy reference drift is detected via immutable target snapshot.');
