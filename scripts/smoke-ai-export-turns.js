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
  'getAiSelfAnalyzerSnapshot',
  'exportAiSelfAnalyzerTurnsJson',
];

const script = fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n');

const activeMatch = {
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  rounds: [{ roundNumber: 1 }],
  turns: [{}, {}],
  events: [
    { type: 'launch' },
    {
      type: 'ai_decision',
      stage: 'mode_move_selected',
      selectedMove: { planeId: 'blue_1', vx: 12, vy: 4 },
      reasonCodes: ['mode_strategy'],
    },
  ],
};

const finishedHistory = [{ startedAt: '2025-12-30T00:00:00.000Z', finishedAt: '2025-12-30T00:05:00.000Z', rounds: [], turns: [], events: [] }];

const context = {
  Boolean,
  JSON,
  Date,
  Array,
  aiSelfAnalyzerState: { activeMatch },
  getAnalyticsHistoryFromStorage: () => finishedHistory,
};

vm.createContext(context);
vm.runInContext(script, context);

const report = context.exportAiSelfAnalyzerTurnsJson();
assert(report && report.reportType === 'active_turns_report', 'Must export active turns report when match is active.');
assert(report.turnsCount === 2, 'Must include turns count from active match.');
assert(report.aiDecisionEventsCount === 1, 'Must count ai_decision events.');
assert(report.aiMotivation && Array.isArray(report.aiMotivation.decisionEvents), 'Must include aiMotivation decision events array.');
assert(report.aiMotivation.decisionEvents[0].selectedMove.planeId === 'blue_1', 'Must preserve selectedMove details in aiMotivation.');

context.aiSelfAnalyzerState.activeMatch = null;
const finishedReport = context.exportAiSelfAnalyzerTurnsJson();
assert(finishedReport && finishedReport.reportType === 'finished_match_turns_report', 'Must fallback to latest finished match report.');

console.log('Smoke test passed: exportAiSelfAnalyzerTurnsJson exports active or finished match turn report.');
