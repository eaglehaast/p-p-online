#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Body not found: ${fnName}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const issueSrc = extractFunctionSource(source, 'issueAIMoveWithInventoryUsage');

const plane = { id: 'blue-bridge', color: 'blue', x: 0, y: 0, isAlive: true, activeTurnBuffs: {} };
const launchRecords = [];

const context = {
  Math, Number, Boolean, Array, Object, JSON, Set,
  FIELD_FLIGHT_DURATION_SEC: 1,
  CELL_SIZE: 10,
  AI_INVENTORY_PHASE_DEFAULT: 0,
  AI_POST_TACTICAL_INVENTORY_LAUNCH_DELAY_MS: 0,
  AI_POST_INVENTORY_LAUNCH_DELAY_MS: 0,
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel', CROSSHAIR:'crosshair', WINGS:'wings', MINE:'mine', DYNAMITE:'dynamite', INVISIBILITY:'invisibility' },
  aiRoundState: { currentGoal: 'smoke_goal', inventoryPhase: 0 },
  dynamiteState: [],
  mines: [],
  turnColors: ['blue'],
  turnIndex: 0,
  getAiTurnTimingSnapshot: () => ({}),
  resolveAiFallbackMoveFlag: () => false,
  failSafeAdvanceTurn: () => {},
  getLatestPendingAiFuelTrainingAttempt: () => null,
  updateAiFuelTrainingOutcome: () => {},
  registerAiInventoryUsageAfterMove: () => {},
  consumeAiDynamiteIntentIfUsed: () => {},
  validateAiDynamiteIntentAgainstMove: () => ({ valid: true }),
  clearAiDynamiteIntent: () => {},
  buildAiDynamiteExpectedRouteSnapshot: () => null,
  playInventoryConsumeFx: () => {},
  evaluateBlueInventoryState: () => ({ total: 1, counts: { fuel: 1 } }),
  validateAiLaunchMoveCandidate: () => ({ ok: true }),
  markAiLinearLaunchEvent: () => {},
  shouldProbeInventoryPreparedShotPlan: () => false,
  logAiDecision: () => {},
  recordInventoryAiDecision: () => {},
  markAiInventoryItemUsed: () => {},
  resolveFinalAiLaunchMoveWithMineGate: (plannedMove) => ({ ok: true, move: plannedMove, reasonCode: 'ok', gateResult: { ok: true } }),
  isAiLaunchExistingSessionReason: () => false,
  registerAiLaunchExistingSessionCooldown: () => ({ suppressedByCooldown: true, attempts: 0, turnNumber: 0 }),
  clearAiLaunchSessionWatchdog: () => {},
  aiLaunchSession: null,
  getAiMoveLandingPoint: () => ({ x: 10, y: 0 }),
  getEffectiveFlightRangeCells: (p) => p?.activeTurnBuffs?.fuel ? 8 : 4,
  settings: { flightRangeCells: 4 },
  maybeUseInventoryBeforeLaunch: (_ctx, plannedMove) => {
    plannedMove.plane.activeTurnBuffs.fuel = true;
    plannedMove.inventoryDecisionMadeMeta = { selected: true };
    return true;
  },
  issueAIMove: (p, vx, vy) => {
    launchRecords.push({ p, vx, vy, fuelAtLaunch: p?.activeTurnBuffs?.fuel === true });
    return { ok: true };
  },
  setTimeout(fn){ fn(); return 1; },
  clearTimeout(){},
  aiPostInventoryLaunchTimeout: null,
};

vm.createContext(context);
vm.runInContext(issueSrc, context);

const plannedMove = { plane, vx: 20, vy: 0, goalName: 'smoke_goal' };
context.issueAIMoveWithInventoryUsage({ color: 'blue' }, plannedMove);

assert(launchRecords.length === 1, 'Expected one launch call.');
assert(launchRecords[0].fuelAtLaunch === true, 'Expected fuel to be active at launch moment.');
assert(plannedMove.inventoryDecisionMadeMeta?.selected === true, 'Expected selected inventory decision meta.');
console.log('Smoke test passed: prelaunch inventory bridge keeps fuel active at launch moment.');
