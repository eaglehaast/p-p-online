#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('ai/v2/goalPriorityModel.js', 'utf8');
const context = { window: {}, globalThis: {} };
vm.createContext(context);
vm.runInContext(source, context);
const model = context.window.PaperWingsGoalPriorityModel || context.globalThis.PaperWingsGoalPriorityModel;
assert(model && typeof model.evaluate === 'function', 'Goal priority model must expose evaluate().');

const triple = model.evaluate({
  shouldUseFlagsMode: true,
  availableEnemyFlagsCount: 1,
  aiAliveCount: 3,
  enemyAliveCount: 3,
  readyCargoCount: 2,
  blueInventoryCount: 0,
  scoreGap: 0,
  canReachEnemyFlag: true,
  hasReturnRouteOpportunity: true,
  hasSafePostPickupEscape: true,
  expectedRetreatChance: 0.8,
  returnLaneThreat: 0.3,
  postPickupEscapeValue: 0.7,
  flagReturnValue: 0.7,
  cargoAlternativeValue: 0.4,
  attackAlternativeValue: 0.5,
  massAttackMinTargets: 3,
  massAttackTripleTargets: 3,
  massAttackTrajectoryQuality: 0.79,
  massAttackCounterRisk: 0.21,
  homeDefensePressure: 0.22,
  criticalHomeDefenseThreat: false,
});
assert(triple.selectedGoalClass === 'triple_kill_window', 'Triple window must win over cargo and normal flag pressure.');
assert(triple.selectedCurrentGoal === 'triple_kill_window', 'Triple window must become currentGoal.');
assert(triple.selectedExecutionGoal === 'attack_enemy_plane', 'Triple window should still execute as an attack.');
const tripleReason = triple.goalClassEvaluations.find((entry) => entry.goalClassName === 'triple_kill_window');
assert(tripleReason && tripleReason.reason === 'triple_kill_window_open', 'Triple window must explain why it was chosen.');
const cargoRejected = triple.goalClassEvaluations.find((entry) => entry.goalClassName === 'cargo_swing_pickup');
assert(cargoRejected && cargoRejected.reason === 'cargo_rejected_due_to_mass_attack', 'Cargo should explain why it lost to the mass attack.');

const doubleEmergency = model.evaluate({
  shouldUseFlagsMode: true,
  availableEnemyFlagsCount: 1,
  aiAliveCount: 3,
  enemyAliveCount: 3,
  readyCargoCount: 1,
  blueInventoryCount: 0,
  scoreGap: 0,
  canReachEnemyFlag: true,
  hasReturnRouteOpportunity: true,
  hasSafePostPickupEscape: true,
  expectedRetreatChance: 0.84,
  returnLaneThreat: 0.2,
  postPickupEscapeValue: 0.8,
  flagReturnValue: 0.82,
  cargoAlternativeValue: 0.3,
  attackAlternativeValue: 0.55,
  massAttackMinTargets: 2,
  massAttackTripleTargets: 0,
  massAttackTrajectoryQuality: 0.74,
  massAttackCounterRisk: 0.37,
  homeDefensePressure: 0.93,
  criticalHomeDefenseThreat: true,
});
assert(doubleEmergency.selectedGoalClass !== 'double_kill_window', 'Critical flag emergency must be allowed to cancel the double-kill class.');
const doubleReason = doubleEmergency.goalClassEvaluations.find((entry) => entry.goalClassName === 'double_kill_window');
assert(doubleReason && doubleReason.reason === 'double_kill_but_flag_emergency', 'Double window must record that the flag emergency overruled it.');

console.log('Smoke test passed: goal priority model promotes mass attacks and documents emergency overrides.');
