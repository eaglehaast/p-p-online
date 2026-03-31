#!/usr/bin/env node
'use strict';

function hasMineOrDynamiteUsageInMatchEvents(events){
  const sourceEvents = Array.isArray(events) ? events : [];
  return sourceEvents.some((event) => {
    if(!event || typeof event !== 'object' || event.type !== 'ai_decision') return false;
    const itemType = typeof event.itemType === 'string' ? event.itemType.trim().toLowerCase() : '';
    if(itemType === 'mine' || itemType === 'dynamite') return true;
    const reasonCode = typeof event.reasonCode === 'string' ? event.reasonCode.trim().toLowerCase() : '';
    if(reasonCode.includes('mine') || reasonCode.includes('dynamite')) return true;
    const reasonCodes = Array.isArray(event.reasonCodes) ? event.reasonCodes : [];
    if(reasonCodes.some((code) => {
      const safeCode = typeof code === 'string' ? code.trim().toLowerCase() : '';
      return safeCode.includes('mine') || safeCode.includes('dynamite');
    })) return true;
    const decisionReason = typeof event?.selectedMove?.decisionReason === 'string'
      ? event.selectedMove.decisionReason.trim().toLowerCase()
      : '';
    return decisionReason.includes('mine') || decisionReason.includes('dynamite');
  });
}

function countShotPlanNotFoundRepeats(events){
  const sourceEvents = Array.isArray(events) ? events : [];
  return sourceEvents.reduce((acc, event) => {
    if(!event || typeof event !== 'object' || event.type !== 'ai_decision') return acc;
    if(event.stage === 'v2_shot_plan_not_found') return acc + 1;
    if(event.reasonCode === 'v2_shot_plan_not_found') return acc + 1;
    const reasonCodes = Array.isArray(event.reasonCodes) ? event.reasonCodes : [];
    return reasonCodes.includes('v2_shot_plan_not_found') ? acc + 1 : acc;
  }, 0);
}

function normalizeStableDiagnosticsMetrics(report, turnsReport = null){
  const stable = report?.summary?.stableMetrics || report?.stableMetrics || null;
  const events = Array.isArray(turnsReport?.source?.events) ? turnsReport.source.events : [];

  return {
    technical_exceptions_per_match: Number.isFinite(stable?.technical_exceptions_per_match)
      ? stable.technical_exceptions_per_match
      : (Number.isFinite(report?.summary?.technicalExceptionEvents)
        ? report.summary.technicalExceptionEvents
        : (Number.isFinite(report?.reports?.reserveDiagnostics?.fallbackEpisodeDiagnostics?.technicalExceptionEvents)
          ? report.reports.reserveDiagnostics.fallbackEpisodeDiagnostics.technicalExceptionEvents
          : 0)),
    no_meaningful_action_turn_share: Number.isFinite(stable?.no_meaningful_action_turn_share)
      ? stable.no_meaningful_action_turn_share
      : (Number.isFinite(report?.summary?.noMoveRate)
        ? report.summary.noMoveRate
        : (Number.isFinite(report?.reports?.qualityGap?.gapMetrics?.aiDecisionMetrics?.noMoveRate)
          ? report.reports.qualityGap.gapMetrics.aiDecisionMetrics.noMoveRate
          : 0)),
    matches_with_mine_or_dynamite_share: Number.isFinite(stable?.matches_with_mine_or_dynamite_share)
      ? stable.matches_with_mine_or_dynamite_share
      : (hasMineOrDynamiteUsageInMatchEvents(events) ? 1 : 0),
    shot_plan_not_found_repeats: Number.isFinite(stable?.shot_plan_not_found_repeats)
      ? stable.shot_plan_not_found_repeats
      : countShotPlanNotFoundRepeats(events),
  };
}

function aggregateStableDiagnosticsMetrics(metricsByScenario){
  const rows = Array.isArray(metricsByScenario) ? metricsByScenario : [];
  const matches = rows.length;
  if(matches === 0){
    return {
      technical_exceptions_per_match: 0,
      no_meaningful_action_turn_share: 0,
      matches_with_mine_or_dynamite_share: 0,
      shot_plan_not_found_repeats: 0,
    };
  }

  const sums = rows.reduce((acc, row) => {
    acc.technical += Number(row.technical_exceptions_per_match || 0);
    acc.noMoveShare += Number(row.no_meaningful_action_turn_share || 0);
    acc.mineShare += Number(row.matches_with_mine_or_dynamite_share || 0);
    acc.shotPlan += Number(row.shot_plan_not_found_repeats || 0);
    return acc;
  }, { technical: 0, noMoveShare: 0, mineShare: 0, shotPlan: 0 });

  return {
    technical_exceptions_per_match: Number((sums.technical / matches).toFixed(4)),
    no_meaningful_action_turn_share: Number((sums.noMoveShare / matches).toFixed(4)),
    matches_with_mine_or_dynamite_share: Number((sums.mineShare / matches).toFixed(4)),
    shot_plan_not_found_repeats: Number(sums.shotPlan.toFixed(4)),
  };
}

module.exports = {
  hasMineOrDynamiteUsageInMatchEvents,
  countShotPlanNotFoundRepeats,
  normalizeStableDiagnosticsMetrics,
  aggregateStableDiagnosticsMetrics,
};
