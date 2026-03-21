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
function assert(condition, message){ if(!condition) throw new Error(message); }

const source = fs.readFileSync('script.js', 'utf8');
const extracted = extractFunctionSource(source, 'shouldAiBluePlanePickUpEnemyFlag');
const logs = [];
let mineCount = 0;

const context = {
  Math, Number, Boolean, Infinity,
  gameMode: 'computer',
  INVENTORY_ITEM_TYPES: { MINE: 'mine' },
  points: [{ id: 'enemy-1', color: 'green', isAlive: true, burning: false, x: 180, y: 30 }],
  getFlagInteractionTarget: () => ({ x: 200, y: 0 }),
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  evaluateFlagPickupContinuation: () => ({ hasSafeEscape: false, hasReturnRoute: false, statusLabel: 'flag_available_but_escape_unsafe', statusReason: 'pickup_without_safe_escape', immediateThreatCount: 2, immediateThreatNearestDist: 20 }),
  evaluateMineEnabledFlagPickupContinuation: () => mineCount > 0 ? ({ after: { hasSafeEscape: true, statusLabel: 'flag_available_and_safe_to_continue' }, threatEnemyId: 'enemy-1' }) : null,
  evaluateBlueInventoryState: () => ({ counts: { mine: mineCount } }),
  logAiDecision: (reason, details) => logs.push({ reason, details }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plane = { id: 'plane-1', color: 'blue' };
const flag = { id: 'flag-1', color: 'green' };

mineCount = 0;
assert(context.shouldAiBluePlanePickUpEnemyFlag(plane, flag) === false,
  'Without a mine, the same flag pickup should stay blocked as unsafe.');
mineCount = 1;
assert(context.shouldAiBluePlanePickUpEnemyFlag(plane, flag) === true,
  'With a mine available, the same flag pickup should become allowed.');
assert(logs.some((entry) => entry.reason === 'auto_flag_pickup_blocked'), 'Blocked case should be logged.');
assert(logs.some((entry) => entry.reason === 'auto_flag_pickup_allowed'), 'Allowed-by-mine case should be logged.');

console.log('Smoke test passed: identical flag pickup is rejected without mine and accepted when mine can secure the escape.');
