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
  source.includes('if(normalized === "v2-report")'),
  'AI_DEBUG_CMD must support v2-report command.'
);

const fnSrc = extractFunctionSource(source, 'exportAiV2DecisionAuditReportJson');

const context = {
  safeNowIso: () => '2026-03-16T00:00:00.000Z',
  AI_ENGINE_MODE: 'v2',
  exportAiSelfAnalyzerTurnsJson: () => ({
    reportType: 'active_turns_report',
    sourceStartedAt: '2026-03-16T00:00:00.000Z',
    sourceFinishedAt: null,
    aiDecisionEventsCount: 5,
    humanDecisionEventsCount: 4,
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
  exportAiFallbackDiagnosticsReportJson: () => ({
    reportType: 'ai_fallback_diagnostics_report',
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
vm.runInContext(`${fnSrc}\nthis.exportAiV2DecisionAuditReportJson = exportAiV2DecisionAuditReportJson;`, context);

const report = context.exportAiV2DecisionAuditReportJson();
assert(report && report.reportType === 'ai_v2_decision_audit_report', 'Must return ai_v2_decision_audit_report.');
assert(report.engineMode === 'v2', 'Must contain engine mode.');
assert(report.summary && report.summary.status === 'ok', 'Must have ok summary status with sufficient data.');
assert(report.summary.aiDecisionEventsCount === 5, 'Must expose aiDecisionEventsCount in summary.');
assert(report.summary.fallbackEpisodes === 2, 'Must expose fallback episodes count in summary.');
assert(report.summary.fallbackRate === 0, 'Fallback rate in qualityGap can be 0 for this case.');
assert(report.summary.aiMoveExceptionEvents === 3, 'Must expose ai_move_exception count in summary.');
assert(report.summary.failSafeTurnAdvanceEpisodes === 2, 'Must expose fail-safe episode count in summary.');
assert(report.summary.failSafeTurnShareAmongAiTurns === 0.4, 'Must expose fail-safe turn share in summary.');
assert(report.reports && report.reports.turns && report.reports.qualityGap && report.reports.fallbackDiagnostics, 'Must include all nested reports.');

console.log('Smoke test passed: exportAiV2DecisionAuditReportJson builds unified v2 report.');
