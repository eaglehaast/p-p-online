#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1){
    throw new Error(`Function not found in script.js: ${fnName}`);
  }
  const bodyStart = source.indexOf('{', start);
  if(bodyStart === -1){
    throw new Error(`Function body start not found for: ${fnName}`);
  }
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0){
      return source.slice(start, i + 1);
    }
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function assert(condition, message){
  if(!condition){
    throw new Error(message);
  }
}

const gameSource = fs.readFileSync('script.js', 'utf8');
const functionNames = [
  'isArcadePlaneRespawnEnabled',
  'isPlaneAtBase',
  'isPlaneRespawnPenaltyActive',
  'isPlaneRespawnComplete',
  'isPlaneRespawnBlockedByEnemy',
  'isPlaneLaunchStateReady',
  'isPlaneTargetable',
  'setPlaneReadyAtBase',
  'markPlaneLaunchedFromBase',
  'advanceTurn',
];

const extracted = functionNames.map((name) => extractFunctionSource(gameSource, name)).join('\n\n');

const context = {
  settings: { arcadeMode: false },
  selectedRuleset: 'classic',
  isAdvancedLikeRuleset: (ruleset) => ruleset === 'advanced',
  turnColors: ['green', 'blue'],
  turnIndex: 0,
  turnAdvanceCount: 0,
  points: [],
  gameMode: 'hotseat',
  aiMoveScheduled: false,
  cancelPendingInventoryUse: () => {},
  cancelActiveInventoryPickup: () => {},
  expireInvisibilityAfterEnemyTurnEnded: () => {},
  clearPlaneActiveTurnBuffs: () => {},
  activateQueuedInvisibilityForEnemyTurn: () => {},
  spawnCargoForTurn: () => {},
  Number,
  Math,
};

vm.createContext(context);
vm.runInContext(extracted, context);

// REGRESSION SHIELD:
// Единый источник истины по «неуязвимости» — только наблюдаемое поведение через respawnState/respawnStage.
// В проверках ниже не читаем isInvulnerable: проверяем лишь targetable/launch-ready/блокировки.
// Дополнительно: arcade-ограничения базы не должны протекать в non-arcade режимы.
const nonArcadePlane = {
  isAlive: true,
  burning: false,
  respawnState: 'at_base',
  respawnStage: 1,
  respawnPenaltyActive: false,
};
assert(
  context.isPlaneLaunchStateReady(nonArcadePlane) === true,
  'Regression: non-arcade launch state should ignore base respawn gating.'
);
assert(
  context.isPlaneTargetable(nonArcadePlane) === true,
  'Regression: non-arcade plane should not be blocked only because it is at_base.'
);

const nonArcadeLaunchPlane = {
  isAlive: true,
  burning: false,
  respawnState: 'at_base',
  respawnStage: 1,
  respawnPenaltyActive: true,
};
context.markPlaneLaunchedFromBase(nonArcadeLaunchPlane);
assert(
  nonArcadeLaunchPlane.respawnState === 'at_base' && nonArcadeLaunchPlane.respawnStage === 1,
  'Regression: markPlaneLaunchedFromBase must not force respawn stage/state outside arcade.'
);
assert(
  nonArcadeLaunchPlane.respawnPenaltyActive === false,
  'Regression: launch from base should clear respawn penalty flag outside arcade too.'
);
assert(
  context.isPlaneTargetable(nonArcadeLaunchPlane) === true,
  'Regression: after launch outside arcade, plane should remain targetable when alive and not burning.'
);

const resetToBasePlane = {
  x: 10,
  y: 20,
  prevX: 11,
  prevY: 21,
  homeX: 30,
  homeY: 40,
  angle: 0,
  homeAngle: 1,
  burning: false,
  crashStart: null,
  killMarkerStart: null,
  collisionX: null,
  collisionY: null,
  respawnState: 'in_flight',
  respawnStage: 3,
  respawnPenaltyActive: false,
};
context.setPlaneReadyAtBase(resetToBasePlane);
assert(
  context.isPlaneRespawnPenaltyActive(resetToBasePlane) === true,
  'setPlaneReadyAtBase should enable explicit respawn penalty flag.'
);

context.points = [
  { color: 'blue', respawnState: 'at_base', respawnStage: 1 },
  { color: 'blue', respawnState: 'in_flight', respawnStage: 1 },
];
context.turnIndex = 0; // next turn is blue
context.turnAdvanceCount = 0;
context.advanceTurn();
assert(
  context.points[0].respawnStage === 1,
  'Regression: non-arcade advanceTurn must not update respawnStage.'
);

// Arcade mode: base restrictions and respawn staging must be active.
context.settings.arcadeMode = true;
context.selectedRuleset = 'advanced';

const arcadePlane = {
  isAlive: true,
  burning: false,
  respawnState: 'at_base',
  respawnStage: 2,
  respawnPenaltyActive: true,
};
assert(
  context.isPlaneLaunchStateReady(arcadePlane) === false,
  'Arcade: plane with incomplete respawn stage must not be launch-ready.'
);
arcadePlane.respawnStage = 3;
assert(
  context.isPlaneLaunchStateReady(arcadePlane) === true,
  'Arcade: plane at base with stage 3 must be launch-ready.'
);
assert(
  context.isPlaneTargetable(arcadePlane) === false,
  'Arcade: plane at base must be non-targetable.'
);

const arcadeLaunchPlane = {
  isAlive: true,
  burning: false,
  respawnState: 'at_base',
  respawnStage: 1,
  respawnPenaltyActive: true,
};
context.markPlaneLaunchedFromBase(arcadeLaunchPlane);
assert(
  arcadeLaunchPlane.respawnState === 'in_flight' && arcadeLaunchPlane.respawnStage === 3,
  'Arcade: markPlaneLaunchedFromBase should move plane to in_flight stage 3.'
);
assert(
  arcadeLaunchPlane.respawnPenaltyActive === false,
  'Arcade: launch from base should clear respawn penalty flag.'
);
assert(
  context.isPlaneTargetable(arcadeLaunchPlane) === true,
  'Arcade: after launch from base, in_flight plane should be targetable when alive and not burning.'
);

context.points = [
  { color: 'blue', respawnState: 'at_base', respawnStage: 1, respawnHalfTurnsRemaining: 4, respawnPenaltyActive: true },
  { color: 'blue', respawnState: 'at_base', respawnStage: 2, respawnHalfTurnsRemaining: 2, respawnPenaltyActive: true },
  { color: 'green', respawnState: 'at_base', respawnStage: 1, respawnHalfTurnsRemaining: 4, respawnPenaltyActive: true },
  { color: 'blue', respawnState: 'in_flight', respawnStage: 1, respawnHalfTurnsRemaining: 4, respawnPenaltyActive: true },
];
context.turnIndex = 0; // next turn is blue
context.turnAdvanceCount = 0;
context.advanceTurn();
assert(
  context.points[0].respawnHalfTurnsRemaining === 3 &&
  context.points[0].respawnStage === 1 &&
  context.points[1].respawnHalfTurnsRemaining === 1 &&
  context.points[1].respawnStage === 2,
  'Arcade: advanceTurn should tick respawn timer and derive respawnStage for at_base planes.'
);
assert(
  context.points[2].respawnHalfTurnsRemaining === 3 &&
  context.points[2].respawnStage === 1 &&
  context.points[3].respawnHalfTurnsRemaining === 4 &&
  context.points[3].respawnStage === 1,
  'Arcade: advanceTurn should update only at_base planes and leave in_flight planes untouched.'
);

console.log('Smoke test passed: arcade respawn gating regression shield is active.');
