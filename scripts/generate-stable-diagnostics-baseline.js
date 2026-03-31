#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');
const path = require('path');
const {
  normalizeStableDiagnosticsMetrics,
  aggregateStableDiagnosticsMetrics,
} = require('./diagnostics-stable-metrics-utils');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) return null;
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

function buildScenarioSet(){
  return [
    {
      name: 'scenario_alpha',
      turns: {
        reportType: 'active_turns_report',
        source: { events: [
          { type: 'ai_decision', stage: 'v2_shot_plan_not_found', reasonCodes: ['v2_shot_plan_not_found'], itemType: 'mine' },
          { type: 'ai_decision', stage: 'fallback_selected', reasonCodes: ['fallback_selected'] },
        ] },
      },
      gap: { reportType: 'human_vs_ai_gap_report', gapMetrics: { aiDecisionMetrics: { noMoveRate: 0.2, fallbackRate: 0.1 } } },
      reserve: { reportType: 'ai_v2_reserve_diagnostics_report', fallbackEpisodeDiagnostics: { technicalExceptionEvents: 2 } },
    },
    {
      name: 'scenario_beta',
      turns: {
        reportType: 'active_turns_report',
        source: { events: [
          { type: 'ai_decision', stage: 'v2_shot_plan_not_found', reasonCode: 'v2_shot_plan_not_found' },
          { type: 'ai_decision', stage: 'inventory_decision_made', itemType: 'dynamite' },
        ] },
      },
      gap: { reportType: 'human_vs_ai_gap_report', gapMetrics: { aiDecisionMetrics: { noMoveRate: 0.4, fallbackRate: 0.3 } } },
      reserve: { reportType: 'ai_v2_reserve_diagnostics_report', fallbackEpisodeDiagnostics: { technicalExceptionEvents: 1 } },
    },
    {
      name: 'scenario_gamma',
      turns: {
        reportType: 'active_turns_report',
        source: { events: [
          { type: 'ai_decision', stage: 'normal_progress', reasonCodes: ['goal_keep_distance'] },
        ] },
      },
      gap: { reportType: 'human_vs_ai_gap_report', gapMetrics: { aiDecisionMetrics: { noMoveRate: 0.1, fallbackRate: 0 } } },
      reserve: { reportType: 'ai_v2_reserve_diagnostics_report', fallbackEpisodeDiagnostics: { technicalExceptionEvents: 0 } },
    },
  ];
}

function runAuditExport(sourceText, scenario){
  const fnSrc = extractFunctionSource(sourceText, 'exportAiV2DecisionAuditReportJson');
  if(!fnSrc) throw new Error('Function exportAiV2DecisionAuditReportJson not found in source.');

  const optionalHelpers = [
    'hasMineOrDynamiteUsageInMatchEvents',
    'countShotPlanNotFoundRepeats',
    'buildStableDiagnosticsMetricsBundle',
  ]
    .map((name) => extractFunctionSource(sourceText, name))
    .filter(Boolean)
    .join('\n');

  const context = {
    safeNowIso: () => '2026-03-31T00:00:00.000Z',
    AI_ENGINE_MODE: 'v2',
    exportAiSelfAnalyzerTurnsJson: () => scenario.turns,
    exportPlayerVsAiGapReportJson: () => scenario.gap,
    exportAiV2ReserveDiagnosticsReportJson: () => scenario.reserve,
    document: undefined,
    Number,
    JSON,
  };

  vm.createContext(context);
  vm.runInContext(`${optionalHelpers}\n${fnSrc}\nthis.exportAiV2DecisionAuditReportJson = exportAiV2DecisionAuditReportJson;`, context);
  return context.exportAiV2DecisionAuditReportJson();
}

function collectForSource(sourceText, scenarios){
  const perScenario = scenarios.map((scenario) => {
    const report = runAuditExport(sourceText, scenario);
    const metrics = normalizeStableDiagnosticsMetrics(report, scenario.turns);
    return { scenario: scenario.name, ...metrics };
  });
  return {
    scenarios: perScenario,
    aggregate: aggregateStableDiagnosticsMetrics(perScenario),
  };
}

function main(){
  const currentSource = fs.readFileSync(path.resolve('script.js'), 'utf8');
  const baselineSource = cp.execSync('git show HEAD:script.js', { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const scenarios = buildScenarioSet();

  const baseline = collectForSource(baselineSource, scenarios);
  const after = collectForSource(currentSource, scenarios);

  const output = {
    generatedAt: '2026-03-31T00:00:00.000Z',
    scenarioSet: scenarios.map((item) => item.name),
    formulas: {
      technical_exceptions_per_match: 'average(technicalExceptionEvents per scenario)',
      no_meaningful_action_turn_share: 'average(noMoveRate per scenario)',
      matches_with_mine_or_dynamite_share: 'average(matchHasMineOrDynamiteUsage ? 1 : 0)',
      shot_plan_not_found_repeats: 'sum(v2_shot_plan_not_found repeats across scenarios)',
    },
    baseline,
    after,
  };

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main();
