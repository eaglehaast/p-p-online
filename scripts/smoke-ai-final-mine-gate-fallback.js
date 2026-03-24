#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const argsStart = source.indexOf('(', start);
  let argsDepth = 0;
  let bodyStart = -1;
  for(let i = argsStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') argsDepth += 1;
    if(ch === ')'){
      argsDepth -= 1;
      if(argsDepth === 0){
        bodyStart = source.indexOf('{', i);
        break;
      }
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
const extracted = [
  'getDistanceFromPointToSegment',
  'getMineThreatMetaForSegment',
  'validateAiLaunchMoveCandidate',
  'getFinalAiLaunchMineThreatCheck',
  'resolveFinalAiLaunchMoveWithMineGate',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const plane = { id: 'blue-1', x: 0, y: 0, activeTurnBuffs: {} };
const staleMove = { plane, vx: 100, vy: 0, goalName: 'test_goal' };
const safeFallbackMove = { plane, vx: 0, vy: 100, goalName: 'safe_fallback', decisionReason: 'safe_fallback_replan' };

const decisionLogs = [];
const context = {
  Math,
  Number,
  POINT_RADIUS: 10,
  MINE_TRIGGER_RADIUS: 10,
  PLANE_GEOMETRY_TRUTH: {
    DANGER_HITBOX_WIDTH: 36,
    BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96,
    HITBOX_HEIGHT: 36,
  },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings', CROSSHAIR: 'crosshair', FUEL: 'fuel', INVISIBILITY: 'invisibility' },
  getPlaneDangerGeometry: () => ({ radius: 18 }),
  mines: [],
  aiRoundState: { currentGoal: 'test_goal' },
  getAiMoveLandingPoint: (move) => ({ x: move.plane.x + move.vx, y: move.plane.y + move.vy }),
  isPlaneLaunchStateReady: () => true,
  getFailSafeMinimalTargetedMove: () => safeFallbackMove,
  getFailSafeGuaranteedDirectMove: () => null,
  logAiDecision: (event, payload) => decisionLogs.push({ event, payload }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

context.mines.push({ owner: 'green', x: 50, y: 0 });

const resolution = context.resolveFinalAiLaunchMoveWithMineGate(staleMove, { marker: 'smoke' }, { stage: 'post_inventory_delay_launch' });
assert(resolution.ok === true, 'Final mine gate should avoid launching stale route.');
assert(resolution.fallbackUsed === true, 'Final mine gate should switch to fallback move.');
assert(resolution.reasonCode === 'final_mine_check_safe_fallback_selected', 'Fallback reasonCode must be explicit.');
assert(resolution.move === safeFallbackMove, 'Fallback move should replace stale route.');

const blockedEvent = decisionLogs.find((entry) => entry.event === 'ai_final_mine_gate_blocked');
const fallbackEvent = decisionLogs.find((entry) => entry.event === 'ai_final_mine_gate_fallback_selected');
assert(Boolean(blockedEvent), 'Diagnostics should log explicit stale-route mine block event.');
assert(Boolean(fallbackEvent), 'Diagnostics should log explicit fallback selection event.');
assert(blockedEvent.payload?.reasonCode === 'final_mine_check_rejected_stale_route', 'Blocked event must expose stale-route reasonCode.');

console.log('Smoke test passed: final mine gate blocks stale route and replaces it with explicit safe fallback.');
