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
assert(
  source.includes('window.exportAiV2DecisionAuditReportJson = exportAiV2DecisionAuditReportJson;'),
  'window export for exportAiV2DecisionAuditReportJson must be registered in script.js.'
);
assert(
  source.includes('window.exportAiV2DecisionAuditCompactReportJson = exportAiV2DecisionAuditCompactReportJson;'),
  'window export for exportAiV2DecisionAuditCompactReportJson must be registered in script.js.'
);
assert(
  source.includes('if(normalized === "v2-report")'),
  'AI_DEBUG_CMD must support v2-report command.'
);
assert(
  source.includes('if(normalized === "v2-report-compact")'),
  'AI_DEBUG_CMD must support v2-report-compact command.'
);

const fnSrc = extractFunctionSource(source, 'exportAiV2DecisionAuditReportJson');
const compactFnSrc = extractFunctionSource(source, 'exportAiV2DecisionAuditCompactReportJson');
const hasMineOrDynamiteUsageInMatchEventsSrc = extractFunctionSource(source, 'hasMineOrDynamiteUsageInMatchEvents');
const countShotPlanNotFoundRepeatsSrc = extractFunctionSource(source, 'countShotPlanNotFoundRepeats');
const buildStableDiagnosticsMetricsBundleSrc = extractFunctionSource(source, 'buildStableDiagnosticsMetricsBundle');

const context = {
  safeNowIso: () => '2026-03-16T00:00:00.000Z',
  AI_ENGINE_MODE: 'v2',
  exportAiSelfAnalyzerTurnsJson: () => ({
    reportType: 'active_turns_report',
    sourceStartedAt: '2026-03-16T00:00:00.000Z',
    sourceFinishedAt: null,
    aiDecisionEventsCount: 5,
    humanDecisionEventsCount: 4,
    source: {
      events: [
        { type: 'ai_decision', itemType: 'mine', stage: 'v2_shot_plan_not_found', reasonCodes: ['v2_shot_plan_not_found'] },
      ],
    },
  }),
  exportPlayerVsAiGapReportJson: () => ({
    reportType: 'human_vs_ai_gap_report',
    gapMetrics: {
      aiDecisionMetrics: {
        fallbackRate: 0,
        noMoveRate: 0.1,
      },
    },
  }),
  exportAiV2ReserveDiagnosticsReportJson: () => ({
    reportType: 'ai_v2_reserve_diagnostics_report',
    fallbackEpisodeSamples: [{ id: 1 }, { id: 2 }],
    fallbackEpisodeDiagnostics: {
      aiMoveExceptionEvents: 3,
      failSafeTurnAdvanceEpisodes: 2,
      failSafeTurnShareAmongAiTurns: 0.4,
    },
  }),
  document: undefined,
  Number,
  JSON,
};

vm.createContext(context);
vm.runInContext(`${hasMineOrDynamiteUsageInMatchEventsSrc}\n${countShotPlanNotFoundRepeatsSrc}\n${buildStableDiagnosticsMetricsBundleSrc}\n${fnSrc}\n${compactFnSrc}\nthis.exportAiV2DecisionAuditReportJson = exportAiV2DecisionAuditReportJson;\nthis.exportAiV2DecisionAuditCompactReportJson = exportAiV2DecisionAuditCompactReportJson;`, context);

const report = context.exportAiV2DecisionAuditReportJson();
assert(report && report.reportType === 'ai_v2_decision_audit_report', 'Must return ai_v2_decision_audit_report.');
assert(report.engineMode === 'v2', 'Must contain engine mode.');
assert(report.summary && report.summary.status === 'ok', 'Must have ok summary status with sufficient data.');
assert(report.summary.aiDecisionEventsCount === 5, 'Must expose aiDecisionEventsCount in summary.');
assert(report.summary.reserveEpisodes === 2, 'Must expose reserve episodes count in summary.');
assert(report.summary.fallbackRate === 0, 'Fallback rate in qualityGap can be 0 for this case.');
assert(report.summary.aiMoveExceptionEvents === 3, 'Must expose ai_move_exception count in summary.');
assert(report.summary.failSafeTurnAdvanceEpisodes === 2, 'Must expose fail-safe episode count in summary.');
assert(report.summary.failSafeTurnShareAmongAiTurns === 0.4, 'Must expose fail-safe turn share in summary.');
assert(report.summary.stableMetrics.technical_exceptions_per_match === 0, 'Must expose stable technical exception key.');
assert(report.summary.stableMetrics.no_meaningful_action_turn_share === 0.1, 'Must expose stable no meaningful action key.');
assert(report.summary.stableMetrics.matches_with_mine_or_dynamite_share === 1, 'Must expose stable mine/dynamite share key.');
assert(report.summary.stableMetrics.shot_plan_not_found_repeats === 1, 'Must expose stable shot-plan repeat key.');
assert(report.reports && report.reports.turns && report.reports.qualityGap && report.reports.reserveDiagnostics, 'Must include all nested reports.');

const compactReport = context.exportAiV2DecisionAuditCompactReportJson();
assert(compactReport && compactReport.reportType === 'ai_v2_decision_audit_compact_report', 'Must return ai_v2_decision_audit_compact_report.');
assert(compactReport.summary && compactReport.summary.aiDecisionEventsCount === 5, 'Compact report must expose aiDecisionEventsCount.');
assert(compactReport.summary.stableMetrics.shot_plan_not_found_repeats === 1, 'Compact report summary must expose stable metrics.');
assert(compactReport.stableMetrics.matches_with_mine_or_dynamite_share === 1, 'Compact report root must expose stable metrics.');
assert(Array.isArray(compactReport.lastAiDecisions), 'Compact report must expose compact decision trail.');
assert(compactReport.difficultyDigest && Array.isArray(compactReport.difficultyDigest.reserveSummaryLines), 'Compact report must expose fallback summary digest.');
assert(compactReport.usageHint && compactReport.usageHint.command === 'window.exportAiV2DecisionAuditCompactReportJson()', 'Compact report must explain its direct command.');

console.log('Smoke test passed: v2 full and compact AI decision audit reports are wired.');
