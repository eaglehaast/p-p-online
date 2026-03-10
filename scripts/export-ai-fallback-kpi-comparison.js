#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  let headerDepth = 0;
  let headerEnd = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') headerDepth += 1;
    if(ch === ')'){
      headerDepth -= 1;
      if(headerDepth === 0){
        headerEnd = i;
        break;
      }
    }
  }
  const bodyStart = source.indexOf('{', headerEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function buildRuntime(source){
  const functionsToLoad = [
    'safeNowIso',
    'buildAiFallbackDiagnosticsReport',
    'buildFlagCaptureBaseCandidates',
  ];
  const code = functionsToLoad.map((name) => extractFunctionSource(source, name)).join('\n\n');

  const context = {
    Math,
    Date,
    JSON,
    Array,
    Number,
    Set,
    FIELD_LEFT: 0,
    FIELD_WIDTH: 540,
    FIELD_BORDER_OFFSET_X: 12,
    CELL_SIZE: 20,
    FIELD_FLIGHT_DURATION_SEC: 1,
    MAX_DRAG_DISTANCE: 440,
    flyingPoints: [],
    aiRoundState: {},
    roundNumber: 1,
    getFlagAnchor(flag){ return { x: flag.x, y: flag.y }; },
    getAiPlaneAdjustedScore(value){ return value; },
    getAiPlaneIdleTurns(){ return 0; },
    getAiCandidateClassComparableScore(){ return { normalizedClassScore: 0, classScoreBreakdown: {} }; },
    isPathClear(fromX, fromY, toX){
      return !(fromX < 130 && toX > 220) && !(fromX < 90 && toX > 250 && Math.abs(fromY - 100) < 30);
    },
    logAiDecision(){},
    planPathToPoint(plane, tx, ty, options = {}){
      const routeClass = options.routeClass || 'direct';
      const directBlocked = !context.isPathClear(plane.x, plane.y, tx, ty);
      if(routeClass === 'direct' && directBlocked) return null;
      if(routeClass === 'gap' && Math.abs(ty - plane.y) < 1) return null;
      if(routeClass === 'ricochet' && tx >= 0 && !directBlocked) return null;

      const classBias = routeClass === 'direct' ? 0 : routeClass === 'gap' ? 34 : 72;
      const distance = Math.hypot(tx - plane.x, ty - plane.y) + classBias;
      const goalName = `${options.goalName || ''}`;
      const emergency = goalName === 'critical_base_threat' || goalName === 'emergency_base_defense' || goalName === 'defense_override';
      const responseRisk = routeClass === 'ricochet'
        ? (emergency ? 0.24 : 0.14)
        : (routeClass === 'gap' ? 0.16 : 0.1);

      return {
        vx: (tx - plane.x) / 100,
        vy: (ty - plane.y) / 100,
        totalDist: distance,
        routeQualityScore: Math.max(0.05, 1 - distance / 620),
        responseRisk,
      };
    },
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

function buildSyntheticMatch(source){
  const rt = buildRuntime(source);
  const events = [];
  const emergencyRisk = {
    riskyRicochetSelected: 0,
    emergencyRicochetSelected: 0,
  };

  const goalsSeries = [
    'capture_enemy_flag',
    'capture_enemy_flag',
    'capture_enemy_flag',
    'critical_base_threat',
    'emergency_base_defense',
    'defense_override',
  ];

  let round = 1;
  for(let matchIndex = 0; matchIndex < 12; matchIndex += 1){
    for(const goalName of goalsSeries){
      rt.roundNumber = round;
      const planes = [
        { id: `pA-${round}`, x: 42 + (matchIndex % 3) * 8, y: 92 + ((round + 1) % 3) * 12 },
        { id: `pB-${round}`, x: 58 + (matchIndex % 2) * 10, y: 126 + (round % 2) * 10 },
      ];
      const flags = [
        { id: `f-${round}`, x: 276 - (matchIndex % 2) * 18, y: 96 + ((round + matchIndex) % 3 - 1) * 18 },
      ];

      const candidates = rt.buildFlagCaptureBaseCandidates(planes, flags, { goalName, maxCandidatesPerClass: 3 });
      const diagnostics = JSON.parse(JSON.stringify(rt.aiRoundState?.lastInitialCandidateSetDiagnostics || {}));
      const best = candidates[0] || null;

      const isEmergency = goalName === 'critical_base_threat' || goalName === 'emergency_base_defense' || goalName === 'defense_override';
      if(isEmergency && best?.selectedClass === 'ricochet'){
        emergencyRisk.emergencyRicochetSelected += 1;
        const risk = Number.isFinite(best?.routeMetrics?.responseRisk) ? best.routeMetrics.responseRisk : 0;
        if(risk >= 0.3) emergencyRisk.riskyRicochetSelected += 1;
      }

      events.push({
        type: 'ai_decision',
        roundNumber: round,
        stage: 'fallback_selected',
        goal: goalName,
        reasonCodes: ['fallback_strategy'],
        selectedMove: best ? {
          goalName,
          decisionReason: best.decisionReason || 'synthetic_series',
          routeClass: best.selectedClass || null,
          responseRisk: best?.routeMetrics?.responseRisk ?? null,
        } : null,
        fallbackDiagnostics: {
          stageBeforeFallback: 'mode_move_rejected',
          fallbackGoal: 'fallback_legacy_logic',
          fallbackDecisionReason: 'fallback_rotation',
          rootCauseHint: 'mode_strategy_failed',
        },
        initialCandidateSetDiagnostics: diagnostics,
      });
      round += 1;
    }
  }

  return {
    report: rt.buildAiFallbackDiagnosticsReport({
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T00:30:00.000Z',
      events,
    }),
    emergencyRisk,
    eventsCount: events.length,
  };
}

function calcKpi(snapshot){
  const report = snapshot.report;
  const rootCauseStats = report.fallbackRootCauseStats || {};
  const rootCauseTotal = Object.values(rootCauseStats).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

  const ricochetBlocked = report.blockedSegmentStats?.ricochet || {};
  const ricochetBlockedTotal = Object.values(ricochetBlocked).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

  return {
    candidateFunnelStats: {
      ricochet: {
        valid_generated: report.candidateFunnelStats?.ricochet?.valid_generated || 0,
        shortlistPass: report.candidateFunnelStats?.ricochet?.shortlistPass || 0,
      },
    },
    fallbackRootCauseStats: {
      raw_attempts_but_no_valid_candidates: rootCauseStats.raw_attempts_but_no_valid_candidates || 0,
      raw_attempts_but_no_valid_candidates_share: rootCauseTotal > 0
        ? (rootCauseStats.raw_attempts_but_no_valid_candidates || 0) / rootCauseTotal
        : 0,
      totalEpisodes: rootCauseTotal,
    },
    blockedSegmentStats: {
      ricochet: {
        before_bounce: ricochetBlocked.before_bounce || 0,
        before_bounce_share: ricochetBlockedTotal > 0
          ? (ricochetBlocked.before_bounce || 0) / ricochetBlockedTotal
          : 0,
        totalBlockedSegments: ricochetBlockedTotal,
      },
    },
    emergencyDefense: {
      riskyRicochetSelected: snapshot.emergencyRisk.riskyRicochetSelected,
      emergencyRicochetSelected: snapshot.emergencyRisk.emergencyRicochetSelected,
      riskyShare: snapshot.emergencyRisk.emergencyRicochetSelected > 0
        ? snapshot.emergencyRisk.riskyRicochetSelected / snapshot.emergencyRisk.emergencyRicochetSelected
        : 0,
    },
    eventsCount: snapshot.eventsCount,
  };
}

const baselineRef = process.argv[2] || '0eddead';
const outputPath = process.argv[3] || path.join('artifacts', 'ai_fallback_kpi_before_after.json');

const updatedSource = fs.readFileSync('script.js', 'utf8');
const baselineSource = execSync(`git show ${baselineRef}:script.js`, { encoding: 'utf8' });

const baselineSnapshot = buildSyntheticMatch(baselineSource);
const updatedSnapshot = buildSyntheticMatch(updatedSource);

const baselineKpi = calcKpi(baselineSnapshot);
const updatedKpi = calcKpi(updatedSnapshot);

const result = {
  baselineRef,
  generatedAt: new Date().toISOString(),
  scenario: {
    type: 'synthetic_match_series',
    description: '12 deterministic match-series cycles with normal + emergency/defense goals.',
    goalsPerCycle: ['capture_enemy_flag', 'capture_enemy_flag', 'capture_enemy_flag', 'critical_base_threat', 'emergency_base_defense', 'defense_override'],
    totalEvents: updatedKpi.eventsCount,
  },
  kpi: {
    baseline: baselineKpi,
    updated: updatedKpi,
    delta: {
      ricochet_valid_generated: updatedKpi.candidateFunnelStats.ricochet.valid_generated - baselineKpi.candidateFunnelStats.ricochet.valid_generated,
      ricochet_shortlistPass: updatedKpi.candidateFunnelStats.ricochet.shortlistPass - baselineKpi.candidateFunnelStats.ricochet.shortlistPass,
      raw_attempts_no_valid_share: Number((updatedKpi.fallbackRootCauseStats.raw_attempts_but_no_valid_candidates_share - baselineKpi.fallbackRootCauseStats.raw_attempts_but_no_valid_candidates_share).toFixed(6)),
      ricochet_before_bounce_share: Number((updatedKpi.blockedSegmentStats.ricochet.before_bounce_share - baselineKpi.blockedSegmentStats.ricochet.before_bounce_share).toFixed(6)),
      emergency_risky_ricochet_share: Number((updatedKpi.emergencyDefense.riskyShare - baselineKpi.emergencyDefense.riskyShare).toFixed(6)),
    },
  },
  reports: {
    baseline: baselineSnapshot.report,
    updated: updatedSnapshot.report,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(`Saved KPI comparison artifact: ${outputPath}`);
console.log(JSON.stringify(result.kpi, null, 2));
