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

function buildRuntime(source, activeMatch){
  const fnNames = [
    'safeNowIso',
    'buildAiSelfAnalyzerGapReport',
    'getAiSelfAnalyzerSnapshot',
    'exportPlayerVsAiGapReportJson',
  ];

  const script = fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n');
  const context = {
    Boolean,
    JSON,
    Date,
    Array,
    Number,
    Math,
    Set,
    aiSelfAnalyzerState: { activeMatch: JSON.parse(JSON.stringify(activeMatch)) },
    getAnalyticsHistoryFromStorage: () => [],
    ATTACK_RANGE_PX: 100,
  };

  vm.createContext(context);
  vm.runInContext(script, context);
  return context;
}

const source = fs.readFileSync('script.js', 'utf8');
assert(
  source.includes('window.exportPlayerVsAiGapReportJson = exportPlayerVsAiGapReportJson;'),
  'window export for exportPlayerVsAiGapReportJson must be registered in script.js.'
);

const activeMatch = {
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  rounds: [{ eliminationsByColor: { blue: 1, green: 0 } }],
  result: { blueScore: 2, greenScore: 1 },
  events: [
    {
      type: 'human_decision',
      risk: { score: 0.1 },
      nearestTarget: { kind: 'enemy_plane', distance: 80 },
      selectedMove: { totalDist: 60 },
    },
    {
      type: 'ai_decision',
      at: '2026-01-01T00:00:01.000Z',
      roundNumber: 1,
      turnColor: 'blue',
      stage: 'candidate_rejected',
      reasonCodes: ['fallback_priority'],
      rejectReasons: ['blocked_fallback_route'],
    },
    {
      type: 'ai_decision',
      at: '2026-01-01T00:00:02.000Z',
      roundNumber: 1,
      turnColor: 'blue',
      stage: 'attack_move',
      reasonCodes: ['best_score'],
      selectedMove: { totalDist: 45, goalName: 'attack_enemy', decisionReason: 'primary_attack' },
      rejectReasons: ['blocked'],
    },
    { type: 'launch', actor: 'human', color: 'blue' },
    { type: 'launch', actor: 'computer', color: 'green' },
  ],
};

const report = buildRuntime(source, activeMatch).exportPlayerVsAiGapReportJson();
assert(report && report.status === 'ok', 'Expected status=ok for valid comparison source.');
assert(Array.isArray(report.humanStrengths), 'Expected humanStrengths section in report root.');
assert(Array.isArray(report.aiWeaknesses), 'Expected aiWeaknesses section in report root.');
assert(report.gapMetrics && typeof report.gapMetrics === 'object', 'Expected gapMetrics section in report root.');
assert(Array.isArray(report.improvementBacklog), 'Expected improvementBacklog section in report root.');
assert(report.gapMetrics.aiDecisionMetrics?.pipelineDiagnostics, 'Expected pipeline diagnostics in AI decision metrics.');
assert(report.gapMetrics.aiDecisionMetrics?.turnOutcomeMetrics, 'Expected turn outcome metrics in AI decision metrics.');
assert(
  report.gapMetrics.aiDecisionMetrics.turnOutcomeMetrics.noMoveRate < report.gapMetrics.aiDecisionMetrics.pipelineDiagnostics.noMoveRate,
  'Expected turn outcome noMoveRate to be lower than pipeline noMoveRate for mixed-stage turn.'
);
assert(
  report.gapMetrics.aiDecisionMetrics.turnOutcomeMetrics.fallbackRate < report.gapMetrics.aiDecisionMetrics.pipelineDiagnostics.fallbackRate,
  'Expected turn outcome fallbackRate to be lower than pipeline fallbackRate when final move is not fallback.'
);

const previousSource = require('child_process').execSync('git show HEAD:script.js', { encoding: 'utf8' });
const oldReport = buildRuntime(previousSource, activeMatch).exportPlayerVsAiGapReportJson();
assert(oldReport?.gapMetrics?.aiDecisionMetrics, 'Expected baseline report from HEAD version of script.js.');
assert(
  report.gapMetrics.aiDecisionMetrics.noMoveRate < oldReport.gapMetrics.aiDecisionMetrics.noMoveRate,
  'Expected new noMoveRate to be lower than baseline noMoveRate on the same match sample.'
);
assert(
  report.gapMetrics.factualConsequences.ai.launches === oldReport.gapMetrics.factualConsequences.ai.launches,
  'Expected AI launch count to remain unchanged between baseline and updated report.'
);

buildRuntime(source, {
  startedAt: '2026-01-01T01:00:00.000Z',
  events: [{ type: 'launch', actor: 'human', color: 'blue' }],
});

const fallbackContext = buildRuntime(source, {
  startedAt: '2026-01-01T01:00:00.000Z',
  events: [{ type: 'launch', actor: 'human', color: 'blue' }],
});
const fallbackReport = fallbackContext.exportPlayerVsAiGapReportJson();
assert(fallbackReport && fallbackReport.status === 'insufficient_data', 'Expected fallback status when data is insufficient.');
assert(
  typeof fallbackReport.statusMessage === 'string' && fallbackReport.statusMessage.length > 0,
  'Expected human-readable fallback status message.'
);

console.log('Smoke test passed: exportPlayerVsAiGapReportJson reports pipeline/outcome metrics and reduces noMoveRate for final-turn outcomes.');
