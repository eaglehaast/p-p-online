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
  'isPlaneRespawnComplete',
  'isPlaneLaunchStateReady',
  'isPlaneTargetable',
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

// REGRESSION SHIELD (arcade mode edits): base restrictions must not leak into non-arcade.
const nonArcadePlane = {
  isAlive: true,
  burning: false,
  isInvulnerable: false,
  respawnState: 'at_base',
  respawnStage: 1,
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
  isInvulnerable: true,
  respawnState: 'at_base',
  respawnStage: 1,
};
context.markPlaneLaunchedFromBase(nonArcadeLaunchPlane);
assert(
  nonArcadeLaunchPlane.respawnState === 'at_base' && nonArcadeLaunchPlane.respawnStage === 1,
  'Regression: markPlaneLaunchedFromBase must not force respawn stage/state outside arcade.'
);
assert(
  nonArcadeLaunchPlane.isInvulnerable === false,
  'markPlaneLaunchedFromBase should still disable invulnerability after launch.'
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
  isInvulnerable: false,
  respawnState: 'at_base',
  respawnStage: 2,
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
  isInvulnerable: true,
  respawnState: 'at_base',
  respawnStage: 1,
};
context.markPlaneLaunchedFromBase(arcadeLaunchPlane);
assert(
  arcadeLaunchPlane.respawnState === 'in_flight' && arcadeLaunchPlane.respawnStage === 3,
  'Arcade: markPlaneLaunchedFromBase should move plane to in_flight stage 3.'
);
assert(
  arcadeLaunchPlane.isInvulnerable === false,
  'Arcade: markPlaneLaunchedFromBase should disable invulnerability.'
);

context.points = [
  { color: 'blue', respawnState: 'at_base', respawnStage: 1 },
  { color: 'blue', respawnState: 'at_base', respawnStage: 2 },
  { color: 'green', respawnState: 'at_base', respawnStage: 1 },
  { color: 'blue', respawnState: 'in_flight', respawnStage: 1 },
];
context.turnIndex = 0; // next turn is blue
context.turnAdvanceCount = 0;
context.advanceTurn();
assert(
  context.points[0].respawnStage === 2 && context.points[1].respawnStage === 3,
  'Arcade: advanceTurn should increment respawnStage for next-turn color planes at base.'
);
assert(
  context.points[2].respawnStage === 1 && context.points[3].respawnStage === 1,
  'Arcade: advanceTurn should not touch other colors or in_flight planes.'
);

console.log('Smoke test passed: arcade respawn gating regression shield is active.');
