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
const fnNames = [
  'safeNowIso',
  'recordAiSelfAnalyzerEvent',
  'recordAiSelfAnalyzerDecision',
  'recordInventoryAiDecision',
  'formatAiDebugClock',
  'buildAiDebugDecisionCompactLine',
];
const script = fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  aiSelfAnalyzerState: { activeMatch: { events: [] } },
  AI_SELF_ANALYZER_MAX_DECISION_EVENTS: 50,
  roundNumber: 7,
  turnIndex: 0,
  turnColors: ['blue'],
  aiRoundState: { currentGoal: 'capture_enemy_flag' },
  safeNowIso: () => '2026-03-21T00:00:00.000Z',
  Number,
  Array,
  JSON,
  Date,
};
vm.createContext(context);
vm.runInContext(`${script}\nthis.recordInventoryAiDecision = recordInventoryAiDecision; this.buildAiDebugDecisionCompactLine = buildAiDebugDecisionCompactLine;`, context);

context.recordInventoryAiDecision('inventory_decision_made', {
  planeId: 'blue_2',
  goal: 'capture_enemy_flag',
  reasonCodes: ['no_inventory_items'],
  rejectReasons: ['inventory_empty'],
});
context.recordInventoryAiDecision('inventory_candidate_rejected', {
  planeId: 'blue_2',
  goal: 'capture_enemy_flag',
  itemType: 'fuel',
  reasonCodes: ['candidate_rejected'],
  rejectReasons: ['fuel_gain_too_small'],
});
context.recordInventoryAiDecision('inventory_decision', {
  planeId: 'blue_2',
  goal: 'capture_enemy_flag',
  itemType: 'mine',
  source: 'selected_inventory_candidate',
  reasonCodes: ['mine_used_for_route_denial'],
});

const events = context.aiSelfAnalyzerState.activeMatch.events;
assert(events.length === 3, 'Must record all inventory events into ai_decision stream.');
assert(events[0].stage === 'inventory_decision_made', 'Must preserve stage for inventory summary event.');
assert(events[0].reasonCodes[0] === 'no_inventory_items', 'Must preserve compact reasonCodes for empty inventory case.');
assert(events[1].itemType === 'fuel', 'Must preserve itemType for rejected candidate.');
assert(events[1].rejectReasons[0] === 'fuel_gain_too_small', 'Must preserve compact rejectReasons for rejected candidate.');
assert(events[2].source === 'selected_inventory_candidate', 'Must preserve source for applied inventory decision.');
assert(context.buildAiDebugDecisionCompactLine(events[2]).includes('item:mine'), 'Compact debug line must include itemType when present.');

console.log('Smoke test passed: inventory ai_decision events stay compact and include itemType.');
