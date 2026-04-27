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
const scheduleSrc = extractFunctionSource(source, 'scheduleComputerMoveWithCargoGate');

const selectedPlanPlane = { id: 'blue-selected', color: 'blue', x: 10, y: 10 };
const capturedMoves = [];

const context = {
  Math,
  Number,
  Boolean,
  Array,
  Object,
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
  points: [selectedPlanPlane],
  flyingPoints: [],
  cargoState: [],
  colliders: [],
  settings: { flagsMode: false },
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
  },
  markAiTurnStarted: () => {},
  hasAnimatingCargo: () => false,
  getBaseAnchor: () => ({ x: 10, y: 90 }),
  getAvailableFlagsByColor: () => [],
  isPlaneLaunchStateReady: () => true,
  isPlaneTargetable: () => true,
  buildAiShotSimulationQualityProfile: () => ({
    coarseAngleStepDeg: 6,
    fineAngleStepDeg: 2,
    coarseScaleStep: 0.08,
    fineScaleStep: 0.03,
    seedCount: 8,
    coarsePoolSize: 20,
    maxEnemyCandidatesPerPlane: 3,
    profileName: 'smoke',
  }),
  getAiFlightRangeProfile: () => ({ flightDistancePx: 40 }),
  getEffectiveFlightRangeCells: () => 4,
  getCargoVisualCenter: (cargo) => ({ x: cargo.x || 0, y: cargo.y || 0 }),
  dist: (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)),
  getNearestPointInCenterControlZone: () => ({ x: 10, y: 50 }),
  getNearestReachableCenterControlPoint: () => ({ x: 10, y: 50 }),
  isPathClear: () => true,
  getMandatoryTurnMove: () => null,
  collectAiCargoRouteCandidates: () => [],
  getAiCargoRicochetPreferenceBonus: () => 0,
  AI_CARGO_RISK_ACCEPTANCE: 1,
  getPlaneEffectiveRangePx: () => 40,
  findBestSimulatedShot: () => null,
  advanceTurn: () => {},
  logAiDecision: () => {},
  buildAiSelectedPlanInventoryEnhancements: () => ([
    { itemType: 'fuel', reason: 'selected_plan_range_pressure' },
  ]),
  issueAIMoveFromDoComputerMove: (_ctx, plannedMove, meta) => {
    if(meta?.source === 'simple_step2_selector'){
      capturedMoves.push(plannedMove);
      return { selected: true, reason: 'ok' };
    }
    return { selected: false, reason: 'unexpected_source' };
  },
  setTimeout(fn){ fn(); return 1; },
};

vm.createContext(context);
vm.runInContext(scheduleSrc, context);
context.scheduleComputerMoveWithCargoGate();

assert(capturedMoves.length === 1, 'Expected exactly one simple_step2_selector launch attempt.');
const plannedMove = capturedMoves[0];
assert(plannedMove?.plane === selectedPlanPlane, 'Expected selectedPlan.plane to be preserved as plannedMove.plane.');
assert(Array.isArray(plannedMove?.selectedInventorySequence), 'Expected selectedInventorySequence to be forwarded into planned move.');
assert(
  plannedMove.selectedInventorySequence.some((entry) => entry?.itemType === 'fuel'),
  'Expected selectedInventorySequence to include FUEL from selected-plan enhancements.'
);

console.log('Smoke test passed: selected-plan inventory sequence and plane survive schedule -> tryIssue handoff.');
