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
    'buildAiV2ReserveDiagnosticsReport',
    'getAiSelfAnalyzerSnapshot',
    'exportAiV2ReserveDiagnosticsReportJson',
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
  };

  vm.createContext(context);
  vm.runInContext(script, context);
  return context;
}

const source = fs.readFileSync('script.js', 'utf8');
assert(
  source.includes('window.exportAiV2ReserveDiagnosticsReportJson = exportAiV2ReserveDiagnosticsReportJson;'),
  'window export for exportAiV2ReserveDiagnosticsReportJson must be registered in script.js.'
);

const activeMatch = {
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
  events: [
    {
      type: 'ai_decision',
      roundNumber: 1,
      stage: 'mode_move_rejected',
      goal: 'capture_enemy_flag',
      reasonCodes: ['mode_strategy_failed'],
      rejectReasons: ['mode_strategy_failed'],
      initialCandidateSetDiagnostics: {
        directCount: 2,
        gapCount: 1,
        ricochetCount: 1,
        shortlistDiagnostics: {
          direct: { initialReachable: 2, shortlistCount: 1, rejectedBetweenInitialAndShortlist: 1, rejectReasons: { blocked_path: 1 } },
          gap: { initialReachable: 1, shortlistCount: 0, rejectedBetweenInitialAndShortlist: 1, rejectReasons: { blocked_at_gap_entry: 1 } },
          ricochet: { initialReachable: 1, shortlistCount: 0, rejectedBetweenInitialAndShortlist: 1, rejectReasons: { blocked_after_bounce: 1 } },
        },
      },
    },
    {
      type: 'ai_decision',
      roundNumber: 1,
      stage: 'safe_short_fallback_selected',
      goal: 'safe_short_fallback_progress',
      reasonCodes: ['safe_short_reposition'],
      selectedMove: { goalName: 'safe_short_fallback_progress', decisionReason: 'safe_short_reposition' },
      fallbackDiagnostics: {
        stageBeforeFallback: 'mode_move_rejected',
        fallbackGoal: 'safe_short_fallback_progress',
        fallbackDecisionReason: 'safe_short_reposition',
        rootCauseHint: 'mode_strategy_failed',
      },
      initialCandidateSetDiagnostics: {
        directCount: 1,
        gapCount: 0,
        ricochetCount: 0,
        shortlistDiagnostics: {
          direct: { initialReachable: 1, shortlistCount: 0, rejectedBetweenInitialAndShortlist: 1, rejectReasons: { shortlist_score_cutoff: 1 } },
          gap: { initialReachable: 0, shortlistCount: 0, rejectedBetweenInitialAndShortlist: 0, rejectReasons: {} },
          ricochet: { initialReachable: 0, shortlistCount: 0, rejectedBetweenInitialAndShortlist: 0, rejectReasons: {} },
        },
      },
    },
    {
      type: 'ai_decision',
      roundNumber: 2,
      stage: 'ai_move_exception',
      goal: 'capture_enemy_flag',
      reasonCodes: ['ai_move_exception', 'fail_safe_turn_advance'],
      rejectReasons: ['do_computer_move_exception'],
      errorMessage: 'Synthetic planner crash',
    },
  ],
};

const report = buildRuntime(source, activeMatch).exportAiV2ReserveDiagnosticsReportJson();
assert(report && report.reportType === 'ai_v2_reserve_diagnostics_report', 'Expected reserve diagnostics report type.');
assert(report.fallbackRootCauseStats && typeof report.fallbackRootCauseStats === 'object', 'Expected fallbackRootCauseStats block.');
assert(report.candidateGenerationStats?.direct, 'Expected candidateGenerationStats.direct block.');
assert(report.candidateFunnelStats?.direct, 'Expected candidateFunnelStats.direct block.');
assert(report.firstBlockingObjectStats?.gap, 'Expected firstBlockingObjectStats.gap block.');
assert(report.blockedSegmentStats?.ricochet, 'Expected blockedSegmentStats.ricochet block.');
assert(report.specialRouteFailureStats?.gap, 'Expected specialRouteFailureStats.gap block.');
assert(Array.isArray(report.fallbackEpisodeSamples), 'Expected fallbackEpisodeSamples array.');
assert(Array.isArray(report.failSafeEpisodeSamples), 'Expected failSafeEpisodeSamples array.');
assert(report.fallbackEpisodeDiagnostics && typeof report.fallbackEpisodeDiagnostics === 'object', 'Expected fallbackEpisodeDiagnostics block.');
assert(report.fallbackEpisodeDiagnostics.aiMoveExceptionEvents >= 1, 'Expected ai_move_exception events to be counted.');
assert(report.fallbackEpisodeDiagnostics.failSafeTurnAdvanceEpisodes >= 1, 'Expected fail-safe episodes to be counted.');
assert(report.summary.some((line) => line.includes('ai_move_exception')), 'Expected summary line with ai_move_exception count.');
assert(report.summary.some((line) => line.includes('fail-safe')), 'Expected summary line with fail-safe turn share/count.');
assert(Array.isArray(report.summary) && report.summary.length > 0, 'Expected non-empty summary block.');
const rootCauseTotal = Object.values(report.fallbackRootCauseStats).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
assert(rootCauseTotal >= 1, 'Expected at least one normalized root-cause reserve episode.');

const reserveReport = buildRuntime(source, null).exportAiV2ReserveDiagnosticsReportJson();
assert(reserveReport && reserveReport.status === 'insufficient_data', 'Expected insufficient_data for empty source.');

console.log('Smoke test passed: exportAiV2ReserveDiagnosticsReportJson returns normalized reserve diagnostics report.');
