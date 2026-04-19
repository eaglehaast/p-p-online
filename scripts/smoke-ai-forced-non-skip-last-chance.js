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

function buildContext(overrides = {}){
  const aiLogs = [];
  let advanceTurnCount = 0;
  const context = {
    Math,
    Number,
    Boolean,
    Array,
    JSON,
    performance: { now: () => 0 },
    AI_MOVE_INITIAL_DELAY_MS: 0,
    AI_MOVE_CARGO_RETRY_DELAY_MS: 0,
    FIELD_FLIGHT_DURATION_SEC: 1,
    CELL_SIZE: 10,
    FIELD_TOP: 0,
    FIELD_HEIGHT: 100,
    isGameOver: false,
    gameMode: 'computer',
    turnColors: ['blue'],
    turnIndex: 0,
    aiLaunchSession: null,
    aiMoveScheduled: false,
    points: [],
    flyingPoints: [],
    cargoState: [],
    settings: { flagsMode: false },
    markAiTurnStarted: () => {},
    hasAnimatingCargo: () => false,
    getBaseAnchor: () => ({ x: 0, y: 0 }),
    getAvailableFlagsByColor: () => [],
    isPlaneLaunchStateReady: () => true,
    isPlaneTargetable: () => true,
    getAiFlightRangeProfile: () => ({ flightDistancePx: 30 }),
    getEffectiveFlightRangeCells: () => 3,
    getCargoVisualCenter: (cargo) => ({ x: cargo.x || 0, y: cargo.y || 0 }),
    dist: (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)),
    getNearestPointInCenterControlZone: () => ({ x: 0, y: 60 }),
    getNearestReachableCenterControlPoint: () => null,
    isPathClear: () => true,
    getMandatoryTurnMove: () => null,
    issueAIMoveFromDoComputerMove: () => ({ selected: true, reason: 'ok' }),
    get advanceTurnCount(){
      return advanceTurnCount;
    },
    advanceTurn(){
      advanceTurnCount += 1;
    },
    aiLogs,
    logAiDecision(stage, payload){
      aiLogs.push({ stage, payload });
    },
    setTimeout(fn){ fn(); return 1; },
    ...overrides,
  };
  vm.createContext(context);
  return context;
}

const source = fs.readFileSync('script.js', 'utf8');
const scheduleSrc = extractFunctionSource(source, 'scheduleComputerMoveWithCargoGate');

(function runNoSelectedPlanScenario(){
  const plane = { id: 'blue-1', color: 'blue', x: 10, y: 10 };
  const calls = [];
  const context = buildContext({
    points: [plane],
    isPathClear: () => false,
    getMandatoryTurnMove: ({ aiPlanes }) => ({
      plane: aiPlanes[0],
      vx: 2,
      vy: 0,
      goalName: 'forced_mandatory',
      decisionReason: 'forced_mandatory',
      routeClass: 'direct',
    }),
    issueAIMoveFromDoComputerMove: (_ctx, _plannedMove, meta) => {
      calls.push(meta?.source || null);
      if((meta?.source || '').includes('forced_non_skip_last_chance_mandatory')){
        return { selected: true, reason: 'forced_ok' };
      }
      return { selected: false, reason: 'blocked' };
    },
  });

  vm.runInContext(scheduleSrc, context);
  context.scheduleComputerMoveWithCargoGate();

  assert(calls.some((sourceName) => sourceName && sourceName.includes('forced_non_skip_last_chance_mandatory')), 'Expected mandatory forced-non-skip source call when no selected plan exists.');
  assert(context.advanceTurnCount === 0, 'Expected no immediate advanceTurn when mandatory forced fallback succeeds.');
  assert(
    context.aiLogs.some((entry) => entry?.payload?.reasonCode === 'forced_non_skip_last_chance_no_selected_plan'),
    'Expected forced_non_skip_last_chance_no_selected_plan reasonCode in AI logs.'
  );
})();

(function runLaunchFailureScenario(){
  const plane = { id: 'blue-2', color: 'blue', x: 10, y: 10 };
  const calls = [];
  const context = buildContext({
    points: [plane],
    issueAIMoveFromDoComputerMove: (_ctx, _plannedMove, meta) => {
      const sourceName = meta?.source || null;
      calls.push(sourceName);
      if(sourceName === 'simple_step2_selector'){
        return { selected: false, reason: 'primary_reject' };
      }
      if(sourceName === 'simple_step2_selector_forced_non_skip_last_chance'){
        return { selected: true, reason: 'forced_guaranteed_ok' };
      }
      return { selected: false, reason: 'reject' };
    },
  });

  vm.runInContext(scheduleSrc, context);
  context.scheduleComputerMoveWithCargoGate();

  assert(calls.includes('simple_step2_selector'), 'Expected primary selector launch attempt.');
  assert(calls.includes('simple_step2_selector_forced_non_skip_last_chance'), 'Expected forced non-skip launch attempt after launch failure.');
  assert(context.advanceTurnCount === 0, 'Expected no advanceTurn when forced non-skip fallback succeeds after launch failure.');
  assert(
    context.aiLogs.some((entry) => entry?.payload?.reasonCode === 'forced_non_skip_last_chance_launch_result_not_ok'),
    'Expected forced_non_skip_last_chance_launch_result_not_ok reasonCode in AI logs.'
  );
})();

console.log('Smoke test passed: scheduleComputerMoveWithCargoGate uses forced non-skip last chance before advanceTurn.');
