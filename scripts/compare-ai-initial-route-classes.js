#!/usr/bin/env node
'use strict';

const fs = require('fs');
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
      if(headerDepth === 0){ headerEnd = i; break; }
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
  const fnSrc = extractFunctionSource(source, 'buildFlagCaptureBaseCandidates');
  const context = {
    Math,
    FIELD_LEFT: 0,
    FIELD_WIDTH: 400,
    FIELD_BORDER_OFFSET_X: 10,
    CELL_SIZE: 20,
    FIELD_FLIGHT_DURATION_SEC: 1,
    MAX_DRAG_DISTANCE: 360,
    flyingPoints: [],
    aiRoundState: {},
    getFlagAnchor(flag){ return { x: flag.x, y: flag.y }; },
    getAiPlaneAdjustedScore(value){ return value; },
    getAiPlaneIdleTurns(){ return 0; },
    getAiCandidateClassComparableScore(){ return { normalizedClassScore: 0, classScoreBreakdown: {} }; },
    isPathClear(fromX, fromY, toX){
      return !(fromX < 100 && toX > 180);
    },
    logAiDecision(){},
    planPathToPoint(plane, tx, ty, options = {}){
      const routeClass = options.routeClass || 'direct';
      const directBlocked = !context.isPathClear(plane.x, plane.y, tx, ty);
      if(routeClass === 'direct' && directBlocked) return null;
      if(routeClass === 'gap' && Math.abs(ty - plane.y) < 1) return null;
      if(routeClass === 'ricochet' && tx >= 0 && !directBlocked) return null;
      const classBias = routeClass === 'direct' ? 0 : routeClass === 'gap' ? 40 : 65;
      const dist = Math.hypot(tx - plane.x, ty - plane.y) + classBias;
      return {
        vx: (tx - plane.x) / 100,
        vy: (ty - plane.y) / 100,
        totalDist: dist,
        routeQualityScore: Math.max(0.1, 1 - dist / 500),
      };
    },
  };

  vm.createContext(context);
  vm.runInContext(fnSrc, context);
  return context;
}

function runScenario(source){
  const rt = buildRuntime(source);
  const planes = [
    { id: 'p1', x: 40, y: 100 },
    { id: 'p2', x: 60, y: 120 },
  ];
  const flags = [
    { id: 'f1', x: 260, y: 100 },
  ];

  const goals = [
    'capture_enemy_flag',
    'critical_base_threat',
    'emergency_base_defense',
  ];

  const decisions = goals.map((goalName) => {
    const candidates = rt.buildFlagCaptureBaseCandidates(planes, flags, { goalName, maxCandidatesPerClass: 2 });
    const counts = candidates.reduce((acc, item) => {
      const key = item?.selectedClass;
      if(key === 'direct' || key === 'gap' || key === 'ricochet') acc[key] += 1;
      return acc;
    }, { direct: 0, gap: 0, ricochet: 0 });
    const best = candidates[0] || null;
    return {
      goalName,
      directCount: counts.direct,
      gapCount: counts.gap,
      ricochetCount: counts.ricochet,
      hasGap: counts.gap > 0,
      hasRicochet: counts.ricochet > 0,
      selectedClass: best?.selectedClass || null,
    };
  });

  const total = decisions.length;
  const missingGapOrRicochet = decisions.filter((d) => !d.hasGap || !d.hasRicochet).length;
  const withGap = decisions.filter((d) => d.hasGap).length;
  const withRicochet = decisions.filter((d) => d.hasRicochet).length;
  const noMove = decisions.filter((d) => d.selectedClass === null).length;
  const fallback = decisions.filter((d) => d.selectedClass && d.selectedClass !== 'direct').length;
  const critical = decisions.filter((d) => d.goalName !== 'capture_enemy_flag');
  const criticalNoMove = critical.filter((d) => d.selectedClass === null).length;

  return {
    decisions,
    summary: {
      decisionsTotal: total,
      gapPresentRate: withGap / total,
      ricochetPresentRate: withRicochet / total,
      missingGapOrRicochetRate: missingGapOrRicochet / total,
      noMoveRate: noMove / total,
      fallbackRate: fallback / total,
      criticalBaseThreatNoMoveRate: critical.length > 0 ? criticalNoMove / critical.length : 0,
    },
  };
}

const currentSource = fs.readFileSync('script.js', 'utf8');
const baselineSource = execSync('git show HEAD:script.js', { encoding: 'utf8' });

const baseline = runScenario(baselineSource);
const updated = runScenario(currentSource);

console.log(JSON.stringify({ baseline, updated }, null, 2));
