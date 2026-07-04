#!/usr/bin/env node
'use strict';

// Smoke test: AI last-plane fallback chain.
//
// Covers, in priority order, what the per-plane planner does when the normal
// shot simulation (<=3 bounces) finds NO hit on the enemy:
//   A. deeper ricochet search (maxBounces 5) connects        -> attack
//   B. nothing connects, no cargo, no ricochet to center     -> direct center-control
//   C. no shot, only a navigable-but-risky cargo route        -> cargo_reach
//   D. no shot, no cargo, a ricochet reaches center closer    -> smart center (ricochet)
// Plus Step 1 (attack landing-point safety):
//   E. exposed attack landing + safe cargo  -> safe cargo wins (attack demoted)
//   F. exposed attack landing, no safer option -> attack still fires (aggression kept)
//   G. safe attack landing -> attack chosen, not demoted (no false positives)
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

const cargoItem = { id: 'cargo-1', state: 'ready', x: 20, y: 60 };
const cargoA = { id: 'cargo-a', state: 'ready', x: 30, y: 40 };
const cargoB = { id: 'cargo-b', state: 'ready', x: 30, y: 60 };
const cargoC = { id: 'cargo-c', state: 'ready', x: 30, y: 80 };

const capturedMoves = [];
const simCalls = [];
const loggedReasons = [];
let pendingPromise = null;
let deepPassHits = true;            // toggled per scenario below
let centerRicochetAvailable = false; // planPathToPoint ricochet route toward center
let unsafeCargoAvailable = false;    // a navigable cargo route that exceeds the safe risk cap
let normalPassHits = false;          // normal (<=3 bounce) shot connects -> bestAttackCandidate
let safeCargoAvailable = false;      // a SAFE cargo route (under the risk cap), placed far
let currentAttackLandingRisk = 0;    // 0..1 exposure of the attack/sweep landing
// Step 2 (multi-target sweep) flags:
let cargoOnPath = false;             // doesCargoIntersectBeneficialZoneAlongPath result
let enemyOnPath = false;             // enemy within sweep tolerance of the path
let sweepBounce = false;             // simulated trajectory has a wall ricochet

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
  logAiDecision: (reason) => { loggedReasons.push(reason); },

  // Step 1: landing-point safety constants + risk fns (module-scope in script.js,
  // so they must be supplied to the extracted-function VM context).
  AI_ATTACK_SCORE_TOLERANCE: 80,
  AI_LANDING_RISK_DISTANCE_PENALTY: 160,
  AI_ATTACK_LANDING_RISK_DEMOTE: 0.8,
  getImmediateResponseThreatMeta: () => ({ __risk: currentAttackLandingRisk }),
  getFallbackCandidateResponseRisk: (meta) => (meta && Number.isFinite(meta.__risk) ? meta.__risk : 0),
  getAiAllowedMoveRisk: () => 0.7,

  // Step 2: multi-target sweep constants + reused geometry/sim fns (module-scope).
  AI_MULTI_TARGET_DOMINATE_MIN: 3,
  AI_MULTI_TARGET_PAIR_MIN: 2,
  AI_FLAG_SWEEP_TARGET_WEIGHT: 3,
  AI_SWEEP_ANGLE_STEP_DEG: 90,        // coarse (fewer sims) for the test
  AI_SWEEP_MAX_BOUNCES: 2,
  AI_SWEEP_ANCHOR_SCALES: [1],
  AI_SWEEP_ENEMY_HIT_TOLERANCE_PX: 20,
  simulateAIShot: (plane, lv) => ({
    predictedPath: [{ x: plane.x, y: plane.y }, { x: plane.x + (lv.dx || 0) * 10, y: plane.y + (lv.dy || 0) * 10 }],
    travelDistance: 50,
    bounceCount: sweepBounce ? 1 : 0,
  }),
  doesCargoIntersectBeneficialZoneAlongPath: () => cargoOnPath,
  getDistanceFromPointToSegment: () => (enemyOnPath ? 5 : 9999),

  // world helpers
  hasAnimatingCargo: () => false,
  recordAiMoveDump: () => {}, // diagnostic hook; no-op in tests
  extendDirectMoveToMaxTargets: async () => false, // launch enhancer; no-op in tests
  isDefensiveIntruderThreat: () => false, // no intruder promotion in these scenarios
  AI_DEFENSIVE_KILL_INTRUDER_PX: 240,
  tryBuildAiFlagDeliveryPlan: () => null, // no flag carrier in these scenarios
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

  // smart-center approach reuse
  getCenterControlAnchor: () => ({ x: 50, y: 50 }),
  getAiMoveLandingPoint: (move) => (move && move.plane && Number.isFinite(move.vx) && Number.isFinite(move.vy)
    ? { x: move.plane.x + move.vx * 1, y: move.plane.y + move.vy * 1 }
    : null),
  planPathToPoint: (plane, tx, ty, opts) => {
    if(opts?.routeClass === 'ricochet' && centerRicochetAvailable){
      // lands at (50, 62): 52px travel (passes the >=5-cell gate) and closer to
      // the center anchor (50,50) than the direct stub at (50,75).
      return { vx: 0, vy: 52, bounceCount: 1, routeClass: 'ricochet' };
    }
    return null;
  },

  // cargo-route reuse
  AI_CARGO_RISK_ACCEPTANCE: 0.42,
  AI_CARGO_REACH_RISK_ACCEPTANCE: 1,
  getAiCargoRicochetPreferenceBonus: () => 0,
  collectAiCargoRouteCandidatesAsync: async () => {
    if(safeCargoAvailable){
      // SAFE but FARTHER (totalDist 200 > the attack's 80) so it only wins once
      // an exposed-landing attack is penalised/demoted (Step 1).
      return [{
        move: { vx: 0, vy: 100, totalDist: 200, routeClass: 'direct', bounceCount: 0 },
        riskInfo: { isSafePath: true, totalRisk: 0.1 },
        favorableInfo: { isFavorableCargo: false },
        usefulCarryAfterPickup: 0,
        usedRicochet: false,
      }];
    }
    if(unsafeCargoAvailable){
      return [{
        move: { vx: -30, vy: 50, totalDist: 58.3, routeClass: 'ricochet', bounceCount: 1 },
        riskInfo: { isSafePath: true, totalRisk: 0.9 }, // navigable but exceeds the 0.42 safe cap
        favorableInfo: { isFavorableCargo: false },
        usefulCarryAfterPickup: 0,
        usedRicochet: true,
      }];
    }
    return [];
  },

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
    if(options?.maxBounces === 3 && normalPassHits){
      // direct (no-bounce) hit -> bestAttackCandidate exists; landing exposure is
      // driven by currentAttackLandingRisk via the threat-meta mock.
      return {
        score: 1150,
        sim: {
          hitTarget: true,
          bounceCount: 0,
          predictedOutcome: 'target_hit_direct',
          launchVector: { dx: 0, dy: 1, scale: 0.5 },
        },
      };
    }
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

async function runScenario({
  deep = false,
  ricochetCenter = false,
  unsafeCargo = false,
  normalHit = false,
  safeCargo = false,
  attackLandingRisk = 0,
  cargos = null,
  sweepCargoOnPath = false,
  sweepEnemyOnPath = false,
  sweepRicochet = false,
} = {}){
  deepPassHits = deep;
  centerRicochetAvailable = ricochetCenter;
  unsafeCargoAvailable = unsafeCargo;
  normalPassHits = normalHit;
  safeCargoAvailable = safeCargo;
  currentAttackLandingRisk = attackLandingRisk;
  cargoOnPath = sweepCargoOnPath;
  enemyOnPath = sweepEnemyOnPath;
  sweepBounce = sweepRicochet;
  context.cargoState = cargos
    ? cargos
    : ((unsafeCargo || safeCargo) ? [cargoItem] : []);
  capturedMoves.length = 0;
  simCalls.length = 0;
  loggedReasons.length = 0;
  pendingPromise = null;
  context.aiMoveScheduled = false;
  context.aiLaunchSession = null;
  context.scheduleComputerMoveWithCargoGate();
  await pendingPromise;
  return capturedMoves[0] || null;
}

(async () => {
  // Scenario A: deep ricochet pass connects -> attack instead of center hop.
  const hitMove = await runScenario({ deep: true });
  assert(simCalls.includes(3), 'A: expected a normal shot-sim pass with maxBounces 3.');
  assert(simCalls.includes(5), 'A: expected a last-resort deep shot-sim pass with maxBounces 5.');
  assert(hitMove, 'A: expected exactly one simple_step2_selector launch attempt.');
  assert(hitMove.plane === bluePlane, 'A: expected the blue plane to be the launching plane.');
  assert(
    hitMove.decisionReason === 'simple_step2_ricochet_enemy_last_resort',
    `A: expected last-resort ricochet decisionReason, got "${hitMove.decisionReason}".`
  );
  assert(hitMove.goalName === 'simple_step2_attack_enemy', `A: expected attack goal, got "${hitMove.goalName}".`);
  assert(hitMove.routeClass === 'ricochet', `A: expected ricochet routeClass, got "${hitMove.routeClass}".`);
  assert(hitMove.hasDirectEnemy === true, 'A: expected hasDirectEnemy to be true.');

  // Scenario B: no shot, no cargo, no ricochet route to center -> direct
  // center-control fallback (chain intact, not regressed).
  const centerDirect = await runScenario({ deep: false });
  assert(simCalls.includes(5), 'B: expected the deep pass to still be attempted.');
  assert(centerDirect, 'B: expected a center-control launch when no shot connects.');
  assert(
    centerDirect.decisionReason === 'simple_step2_center_control',
    `B: expected direct center-control fallback, got "${centerDirect.decisionReason}".`
  );

  // Scenario C: no enemy shot, cargo route exists but exceeds the SAFE risk cap
  // -> lean toward cargo ("cargo_reach") instead of holding center.
  const cargoReach = await runScenario({ deep: false, unsafeCargo: true });
  assert(cargoReach, 'C: expected a launch when an unsafe cargo route exists.');
  assert(
    cargoReach.decisionReason === 'simple_step2_cargo_reach',
    `C: expected cargo_reach when no shot and only an unsafe cargo route, got "${cargoReach.decisionReason}".`
  );
  assert(cargoReach.goalName === 'simple_step2_cargo', `C: expected cargo goal, got "${cargoReach.goalName}".`);

  // Scenario D: no shot, no cargo, a ricochet route lands closer to center than
  // the direct stub -> smart center prefers the ricochet.
  const centerRicochet = await runScenario({ deep: false, ricochetCenter: true });
  assert(centerRicochet, 'D: expected a center-control launch.');
  assert(
    centerRicochet.decisionReason === 'simple_step2_center_control_ricochet',
    `D: expected smart center to pick the ricochet route, got "${centerRicochet.decisionReason}".`
  );
  assert(centerRicochet.routeClass === 'ricochet', `D: expected ricochet routeClass, got "${centerRicochet.routeClass}".`);

  // Step 1 — attack landing-point safety.
  // Scenario E: a normal hit whose landing is near-certain death (risk 0.95),
  // with a SAFE (but farther) cargo available -> the exposed attack is penalised/
  // demoted and the safe cargo wins.
  const exposedWithCargo = await runScenario({ normalHit: true, attackLandingRisk: 0.95, safeCargo: true });
  assert(exposedWithCargo, 'E: expected a launch.');
  assert(
    exposedWithCargo.decisionReason === 'simple_step2_pickup_cargo',
    `E: expected the safe cargo to win over an exposed attack, got "${exposedWithCargo.decisionReason}".`
  );
  assert(
    loggedReasons.includes('attack_landing_exposed_demoted'),
    'E: expected the exposed attack to be demoted (logged).'
  );

  // Scenario F: same death-trap attack but NO safer option -> the attack STILL
  // fires (demotion is not a veto; aggression preserved).
  const exposedNoAlt = await runScenario({ normalHit: true, attackLandingRisk: 0.95 });
  assert(exposedNoAlt, 'F: expected a launch.');
  assert(
    exposedNoAlt.decisionReason === 'simple_step2_direct_enemy',
    `F: expected the attack to still fire when no safer option exists, got "${exposedNoAlt.decisionReason}".`
  );
  assert(
    loggedReasons.includes('attack_landing_exposed_demoted'),
    'F: expected the exposed attack to be demoted (logged) even though it still fires.'
  );

  // Scenario G: a normal hit with a SAFE landing (risk 0.1) -> attack chosen
  // normally, NOT demoted (no false positives).
  const safeAttack = await runScenario({ normalHit: true, attackLandingRisk: 0.1 });
  assert(safeAttack, 'G: expected a launch.');
  assert(
    safeAttack.decisionReason === 'simple_step2_direct_enemy',
    `G: expected the safe attack to be chosen, got "${safeAttack.decisionReason}".`
  );
  assert(
    !loggedReasons.includes('attack_landing_exposed_demoted'),
    'G: a safe-landing attack must NOT be demoted.'
  );

  // Step 2 — maximize targets on a route.
  // Scenario H: 3 cargos swept by one direct route -> DOMINATE (top priority),
  // landing safety ignored.
  const dominate = await runScenario({ cargos: [cargoA, cargoB, cargoC], sweepCargoOnPath: true, attackLandingRisk: 0.95 });
  assert(dominate, 'H: expected a launch.');
  assert(
    dominate.decisionReason === 'simple_step2_multi_target_direct',
    `H: expected a dominate multi-target route, got "${dominate.decisionReason}".`
  );
  assert(dominate.goalName === 'simple_step2_multi_target', `H: expected multi-target goal, got "${dominate.goalName}".`);
  assert(loggedReasons.includes('multi_target_dominate_route'), 'H: expected dominate route logged.');

  // Scenario H2: same but the route ricochets -> labelled as a ricochet sweep.
  const dominateRic = await runScenario({ cargos: [cargoA, cargoB, cargoC], sweepCargoOnPath: true, sweepRicochet: true });
  assert(dominateRic, 'H2: expected a launch.');
  assert(
    dominateRic.decisionReason === 'simple_step2_multi_target_ricochet',
    `H2: expected a ricochet sweep, got "${dominateRic.decisionReason}".`
  );
  assert(dominateRic.routeClass === 'ricochet', `H2: expected ricochet routeClass, got "${dominateRic.routeClass}".`);

  // Scenario J: 2 cargos + 1 enemy on the path = 3 targets -> DOMINATE (enemies
  // count toward the total just like cargo).
  const dominateMixed = await runScenario({ cargos: [cargoA, cargoB], sweepCargoOnPath: true, sweepEnemyOnPath: true });
  assert(dominateMixed, 'J: expected a launch.');
  assert(loggedReasons.includes('multi_target_dominate_route'), 'J: expected enemy+cargo to reach the dominate threshold.');

  // Scenario I: exactly 2 cargos, safe landing -> PAIR route preferred over a
  // single-target plan.
  const pair = await runScenario({ cargos: [cargoA, cargoB], sweepCargoOnPath: true, attackLandingRisk: 0 });
  assert(pair, 'I: expected a launch.');
  assert(loggedReasons.includes('multi_target_pair_route'), 'I: expected a safe 2-target pair route.');
  assert(
    pair.goalName === 'simple_step2_multi_target',
    `I: expected multi-target goal for the pair route, got "${pair.goalName}".`
  );

  // Scenario I2: a 2-target sweep whose landing is exposed (risk 0.9) -> NOT
  // chased (pairs stay safety-aware; only >=3 ignores exposure).
  const pairExposed = await runScenario({ cargos: [cargoA, cargoB], sweepCargoOnPath: true, attackLandingRisk: 0.9 });
  assert(pairExposed, 'I2: expected a launch.');
  assert(!loggedReasons.includes('multi_target_pair_route'), 'I2: an exposed 2-target sweep must not be chosen.');
  assert(
    pairExposed.goalName !== 'simple_step2_multi_target',
    'I2: exposed pair must fall back to the existing logic, not a multi-target route.'
  );

  console.log('Smoke test passed: fallback chain + cargo-reach + smart center + landing-safety + multi-target sweep.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
