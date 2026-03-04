#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

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

const source = fs.readFileSync('script.js', 'utf8');
const findDirectFinisherMoveSrc = extractFunctionSource(source, 'findDirectFinisherMove');
if(!findDirectFinisherMoveSrc){
  throw new Error('findDirectFinisherMove source not found');
}

function runScenario({ withCargoOnPath }){
  const context = {
    Math,
    Number,
    Boolean,
    Object,
    Array,
    CELL_SIZE: 100,
    ATTACK_RANGE_PX: 300,
    MAX_DRAG_DISTANCE: 500,
    FIELD_FLIGHT_DURATION_SEC: 1,
    flyingPoints: [],
    aiRoundState: { currentGoal: 'direct_finisher' },
    cargoState: withCargoOnPath
      ? [{ id: 'cargo-path', x: 70, y: 0, state: 'ready' }]
      : [],
    isExplicitDefensiveGoal: () => false,
    getDistanceFromPointToSegment: (px, py, x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if(lenSq <= 0) return Math.hypot(px - x1, py - y1);
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      const cx = x1 + dx * t;
      const cy = y1 + dy * t;
      return Math.hypot(px - cx, py - cy);
    },
    isDirectFinisherScenario: (_plane, enemy) => enemy?.id === 'target',
    dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
    getAiPlaneAdjustedScore: (score) => score,
    applyOpeningAggressionBias: (score) => ({ score, applied: false }),
    isPathClear: () => true,
    planPathToPoint: (plane) => {
      if(plane.id === 'danger') return { vx: 100, vy: 0, totalDist: 100 };
      if(plane.id === 'safe') return { vx: 130, vy: 0, totalDist: 132 };
      return null;
    },
    aiLogs: [],
    logAiDecision: (reason, details) => {
      context.aiLogs.push({ reason, details });
    },
  };

  vm.createContext(context);
  vm.runInContext(findDirectFinisherMoveSrc, context);

  const aiPlanes = [
    { id: 'danger', x: 0, y: 0, isAlive: true },
    { id: 'safe', x: 0, y: 260, isAlive: true },
  ];
  const enemies = [
    { id: 'target', x: 350, y: 0, isAlive: true, carriedFlagId: null },
    { id: 'threat', x: 140, y: 0, isAlive: true, carriedFlagId: null },
  ];

  const selectedMove = context.findDirectFinisherMove(aiPlanes, enemies, {
    context: { aiRiskProfile: { profile: 'balanced' } },
    goalName: 'direct_finisher',
  });

  if(!selectedMove){
    throw new Error(`Scenario withCargoOnPath=${withCargoOnPath}: expected a direct finisher move`);
  }

  return {
    selectedPlaneId: selectedMove.plane.id,
    selectedEnemyId: selectedMove.enemy.id,
    penaltyLogs: context.aiLogs.filter((entry) => entry.reason === 'direct_finisher_unprofitable_trade_penalty').length,
  };
}

const noCargoScenario = runScenario({ withCargoOnPath: false });
const withCargoScenario = runScenario({ withCargoOnPath: true });

if(noCargoScenario.selectedPlaneId !== 'safe'){
  throw new Error(`Expected safer plane without cargo, got ${noCargoScenario.selectedPlaneId}`);
}
if(withCargoScenario.selectedPlaneId !== 'danger'){
  throw new Error(`Expected risky 1-for-1 move to become acceptable with cargo, got ${withCargoScenario.selectedPlaneId}`);
}
if(noCargoScenario.penaltyLogs === 0){
  throw new Error('Expected unprofitable-trade penalty log in scenario without cargo');
}

console.log('Smoke test passed: without cargo AI avoids unprofitable direct 1-for-1, with cargo on path it can choose it.');
console.log(JSON.stringify({
  noCargoScenario,
  withCargoScenario,
}, null, 2));
