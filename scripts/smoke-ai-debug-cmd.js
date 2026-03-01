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
const requiredFunctions = [
  'getAiSelfAnalyzerSnapshot',
  'formatAiDebugClock',
  'buildAiDebugDecisionCompactLine',
  'getAiDebugLastDecisions',
  'printAiDebugSnapshot',
  'printAiDebugStatus',
  'printAiDebugLastDecisions',
  'AI_DEBUG_CMD',
];

const fnBundle = requiredFunctions.map((name) => extractFunctionSource(source, name)).join('\n\n');

const logs = [];
const context = {
  Boolean,
  Number,
  Math,
  JSON,
  roundNumber: 7,
  turnIndex: 1,
  turnColors: ['green', 'blue'],
  aiMoveScheduled: true,
  gameMode: 'computer',
  selectedMode: 'computer',
  aiRoundState: {
    mode: 'attrition',
    turnNumber: 11,
    currentGoal: 'capture_enemy_flag',
  },
  aiSelfAnalyzerState: {
    activeMatch: {
      startedAt: '2026-02-01T12:00:00.000Z',
      mode: 'computer',
      ruleset: 'flags',
      mapIndex: 2,
      rounds: [{ roundNumber: 7 }],
      turns: [{}, {}],
      events: [
        {
          type: 'ai_decision',
          at: '2026-02-01T12:01:00.000Z',
          roundNumber: 7,
          turnColor: 'blue',
          stage: 'score_candidates',
          goal: 'capture_enemy_flag',
          planeId: 'plane_4',
          reasonCodes: ['best_score'],
          rejectReasons: ['too_risky'],
        },
        {
          type: 'ai_decision',
          at: '2026-02-01T12:01:20.000Z',
          roundNumber: 7,
          turnColor: 'blue',
          stage: 'fallback_move',
          goal: 'preserve_planes',
          planeId: 'plane_2',
          reasonCodes: ['fallback'],
        },
      ],
    },
  },
  getAnalyticsHistoryFromStorage: () => [],
  console: {
    info: (...args) => logs.push(args.join(' ')),
  },
};

vm.createContext(context);
vm.runInContext(fnBundle, context);

const status = context.AI_DEBUG_CMD('status');
assert(status && status.goal === 'capture_enemy_flag', 'status should expose current AI goal.');
assert(status.aiMoveScheduled === true, 'status should expose aiMoveScheduled flag.');

const snapshot = context.AI_DEBUG_CMD('snapshot');
assert(snapshot && snapshot.roundsCount === 1, 'snapshot should include compact rounds count.');
assert(typeof snapshot.lastDecision === 'string' && snapshot.lastDecision.includes('goal:preserve_planes'), 'snapshot should include latest decision compact line.');

const lastDecisions = context.AI_DEBUG_CMD('last-decisions', 2);
assert(Array.isArray(lastDecisions) && lastDecisions.length === 2, 'last-decisions should return requested number of compact rows.');
assert(lastDecisions[0].includes('score_candidates'), 'last-decisions should include earlier decision in compact output.');
assert(lastDecisions[1].includes('fallback_move'), 'last-decisions should include latest decision in compact output.');

assert(logs.some((line) => line.includes('[AI_DEBUG] status')), 'status command should write readable console line.');
assert(logs.some((line) => line.includes('[AI_DEBUG] snapshot')), 'snapshot command should write readable console line.');
assert(logs.some((line) => line.includes('last-decisions (2)')), 'last-decisions command should print compact header.');

console.log('Smoke test passed: AI_DEBUG_CMD exposes compact runtime introspection for active match.');
