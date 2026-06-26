#!/usr/bin/env node
'use strict';

// Smoke test: AI's last-resort deeper ricochet search.
//
// Verifies that when the normal shot simulation (<=3 bounces) finds NO hit on
// the enemy, the per-plane planner does NOT immediately fall back to the dumb
// straight "center control" hop. Instead it runs one deeper ricochet search
// (maxBounces 5, finer sampling) and, if that connects, launches that attack.
//
// The selector is the nested closure buildBestPlanForPlane inside
// scheduleComputerMoveWithCargoGate, so we run the whole scheduler against a
// mocked context and capture the planned move handed to
// issueAIMoveFromDoComputerMove. The scheduler body is async (setTimeout ->
// async fn), so we capture and await that promise.

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

const bluePlane = { id: 'blue-1', color: 'blue', x: 50, y: 10 };
const greenEnemy = { id: 'green-1', color: 'green', x: 50, y: 90 };

const capturedMoves = [];
const simCalls = [];
let pendingPromise = null;
let deepPassHits = true; // toggled per scenario below

const context = {
  Math,
  Number,
  Boolean,
  Array,
  Object,
  JSON,
  console,
  performance: { now: () => 0 },
  AI_MOVE_INITIAL_DELAY_MS: 0,
  AI_MOVE_CARGO_RETRY_DELAY_MS: 0,
  FIELD_FLIGHT_DURATION_SEC: 1,
  CELL_SIZE: 10,
  FIELD_TOP: 0,
  FIELD_HEIGHT: 100,
  AI_DEFENSIVE_MINE_ENABLED: false,
  isGameOver: false,
  gameMode: 'computer',
  turnColors: ['blue'],
  turnIndex: 0,
  aiLaunchSession: null,
  aiMoveScheduled: false,
  aiRoundState: {},
  points: [bluePlane, greenEnemy],
  flyingPoints: [],
  cargoState: [],
  settings: { flagsMode: false },
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', MINE: 'mine', DYNAMITE: 'dynamite' },

  // cooperative-yield + timing instrumentation (no-ops for the test)
  markAiTurnStarted: () => {},
  aiCoopResetBudget: () => {},
  aiCoopMaybeYield: async () => {},
  isAiTurnStillApplicable: () => true,
  aiThinkingTimingStageStart: () => {},
  aiThinkingTimingStageEnd: () => {},
  aiYieldToNextFrame: async () => {},
  logAiDecision: () => {},

  // world helpers
  hasAnimatingCargo: () => false,
  getBaseAnchor: () => ({ x: 50, y: 100 }),
  getAvailableFlagsByColor: () => [],
  isPlaneLaunchStateReady: () => true,
  isPlaneTargetable: () => true,
  dist: (a, b) => Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)),
  getCargoVisualCenter: (cargo) => ({ x: cargo.x || 0, y: cargo.y || 0 }),
  getEffectiveFlightRangeCells: () => 8,
  getPlaneEffectiveRangePx: () => 80,
  getAiFlightRangeProfile: () => ({ flightDistancePx: 80 }),
  // Center target >= 5 cells (CELL_SIZE*5 = 50px) away so the center-control
  // move is a valid genuine fallback rather than being rejected as too short.
  getNearestPointInCenterControlZone: () => ({ x: 50, y: 75 }),
  getNearestReachableCenterControlPoint: () => ({ x: 50, y: 75 }),
  isPathClear: () => true,
  getMineThreatMetaForSegment: () => null,
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

  // The crux: normal pass (maxBounces 3) misses; deep pass (maxBounces 5) hits
  // via a ricochet.
  findBestSimulatedShotAsync: async (plane, target, options) => {
    simCalls.push(options?.maxBounces);
    if(options?.maxBounces === 5 && deepPassHits){
      return {
        score: 0.9,
        sim: {
          hitTarget: true,
          bounceCount: 2,
          predictedOutcome: 'target_hit_after_ricochet',
          launchVector: { dx: 0, dy: 1, scale: 0.8 },
        },
      };
    }
    return null; // normal first pass (and, when deepPassHits is false, the deep pass too)
  },

  // inventory enhancement -> empty so dynamite/fuel/mine replan sections skip
  buildAiSelectedPlanInventoryEnhancements: () => [],

  issueAIMoveFromDoComputerMove: (_ctx, plannedMove, meta) => {
    if(meta?.source === 'simple_step2_selector'){
      capturedMoves.push(plannedMove);
      return { selected: true, reason: 'ok' };
    }
    return { selected: false, reason: `unexpected_source_${meta?.source}` };
  },

  setTimeout(fn){ pendingPromise = fn(); return 1; },
};

vm.createContext(context);
vm.runInContext(scheduleSrc, context);

async function runScenario(){
  capturedMoves.length = 0;
  simCalls.length = 0;
  pendingPromise = null;
  context.aiMoveScheduled = false;
  context.aiLaunchSession = null;
  context.scheduleComputerMoveWithCargoGate();
  await pendingPromise;
  return capturedMoves[0] || null;
}

(async () => {
  // Scenario 1: deep ricochet pass connects -> attack instead of center hop.
  deepPassHits = true;
  const hitMove = await runScenario();

  assert(simCalls.includes(3), 'Expected a normal shot-sim pass with maxBounces 3.');
  assert(simCalls.includes(5), 'Expected a last-resort deep shot-sim pass with maxBounces 5.');

  assert(hitMove, 'Expected exactly one simple_step2_selector launch attempt.');
  assert(hitMove.plane === bluePlane, 'Expected the blue plane to be the launching plane.');
  assert(
    hitMove.decisionReason === 'simple_step2_ricochet_enemy_last_resort',
    `Expected last-resort ricochet decisionReason, got "${hitMove.decisionReason}".`
  );
  assert(
    hitMove.goalName === 'simple_step2_attack_enemy',
    `Expected attack goal, got "${hitMove.goalName}".`
  );
  assert(hitMove.routeClass === 'ricochet', `Expected ricochet routeClass, got "${hitMove.routeClass}".`);
  assert(hitMove.hasDirectEnemy === true, 'Expected hasDirectEnemy to be true for the last-resort attack.');

  // Scenario 2: deep pass also misses -> the AI must still fall back to the
  // center-control move (fallback chain intact, not regressed).
  deepPassHits = false;
  const fallbackMove = await runScenario();

  assert(simCalls.includes(5), 'Expected the deep pass to still be attempted when it ultimately misses.');
  assert(fallbackMove, 'Expected a center-control launch when no shot connects.');
  assert(
    fallbackMove.decisionReason === 'simple_step2_center_control',
    `Expected center-control fallback when no shot connects, got "${fallbackMove.decisionReason}".`
  );

  console.log('Smoke test passed: last-resort ricochet preferred over center hop; center-control fallback intact.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
