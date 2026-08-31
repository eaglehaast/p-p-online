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
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
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
  'isBaseInvulnerabilityEnabled',
  'isPlaneAtBase',
  'isPlaneRespawnPenaltyActive',
  'isPlaneRespawnComplete',
  'isPlaneRespawnBlockedByEnemy',
  'isPlaneLaunchStateReady',
  'isPlaneTargetable',
  'setPlaneReadyAtBase',
  'markPlaneLaunchedFromBase',
  'notifyTurnAdvanced',
  'getPlaneLifeState',
  'advanceTurn',
];


// Набор состояний берём из игры, а не переписываем: переписанный список живёт своей
// жизнью и однажды разойдётся с настоящим, а тест этого не заметит.
function extractConstSource(source, name){
  const match = new RegExp(`^const ${name}\\s*=\\s*[^;]+;`, 'm').exec(source);
  if(!match) throw new Error(`Константа не найдена в script.js: ${name}`);
  return match[0];
}
const planeLifeStates = extractConstSource(gameSource, 'PLANE_LIFE_STATES');
// POINT_RADIUS считается из масштаба самолёта, поэтому тянем и его основу.
const pointRadius = [
  'PLANE_DRAW_W',
  'PLANE_METRIC_SCALE',
].map((name) => extractConstSource(gameSource, name)).join('\n')
  + '\n' + extractFunctionSource(gameSource, 'planeMetric')
  + '\n' + extractConstSource(gameSource, 'POINT_RADIUS');
const extracted = functionNames.map((name) => extractFunctionSource(gameSource, name)).join('\n\n');

const context = {
  // Слушателей смены хода в стенде нет: проверяем возрождение, а не рассылку.
  turnAdvanceListeners: new Set(),
  // Учёт ходов для самоанализа ИИ к возрождению отношения не имеет.
  recordAiSelfAnalyzerTurnAdvance: () => {},
  syncAiRoundStateTurnNumber: () => {},
  aiRoundState: { turnNumber: 0 },
  resetPlaneKillPointAwardMarker: () => {},
  isAiControlledTurn: () => false,
  publishOnlineStateAfterTurn: () => {},
  invalidateAiPlanningState: () => {},
  turnCommitSequence: 0,
  performance: { now: () => 0 },
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
vm.runInContext(`${planeLifeStates}\n${pointRadius}\n\n${extracted}`, context);

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
  context.isPlaneTargetable(arcadePlane) === true,
  'Arcade: plane at base should stay targetable when base invulnerability flag is disabled.'
);

context.settings.arcadeBaseInvulnerability = true;
assert(
  context.isPlaneTargetable(arcadePlane) === false,
  'Arcade: plane at base must become non-targetable only when base invulnerability flag is enabled.'
);
context.settings.arcadeBaseInvulnerability = false;

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

// Враг, усевшийся на точке возрождения, не выпускает самолёт наружу.
//
// Правило это существовало в игре, а тест его не трогал: isPlaneRespawnBlockedByEnemy
// извлекалась в стенд, но ни одна проверка не ставила рядом с базой врага. Мутация
// показала это прямо — убираешь правило из условия готовности, и тест молчит. Значит
// правило можно было потерять при любой правке, и никто бы не заметил, пока игрок не
// вылетел бы сквозь противника, стоящего у него на точке.
{
  context.settings.arcadeMode = true;
  context.selectedRuleset = 'advanced';

  // Радиус берём ИЗ песочницы, а не через context: объявленный там через const, снаружи
  // он не виден, и расстояния считались бы от NaN. Сравнение с NaN всегда ложно, поэтому
  // проверка зеленела бы при любом радиусе блокировки — то есть не проверяла бы его.
  const pointRadiusValue = vm.runInContext('POINT_RADIUS', context);
  assert(Number.isFinite(pointRadiusValue) && pointRadiusValue > 0,
    'Sandbox must expose a real POINT_RADIUS, otherwise the distance checks are vacuous.');

  const reborn = {
    color: 'blue',
    isAlive: true,
    burning: false,
    respawnState: 'at_base',
    respawnStage: 3,
    respawnPenaltyActive: false,
    x: 100, y: 100, homeX: 100, homeY: 100,
  };
  // Враг стоит РЯДОМ с точкой, а не ровно в ней. Ровно в ней его поймал бы и радиус,
  // сжатый до нуля, — то есть проверка прошла бы для правила «блокирует только вплотную»,
  // которое к настоящему отношения не имеет.
  const enemy = {
    color: 'green',
    isAlive: true,
    burning: false,
    respawnState: 'in_flight',
    respawnStage: 3,
    x: 100 + pointRadiusValue * 1.5, y: 100,
  };
  context.points = [reborn, enemy];

  assert(
    context.isPlaneRespawnBlockedByEnemy(reborn) === true,
    'Arcade: enemy near the respawn point must block the reborn plane.'
  );
  assert(
    context.isPlaneLaunchStateReady(reborn) === false,
    'Arcade: blocked plane must not be launch-ready even with respawn complete.'
  );

  // Отошёл — путь свободен. Без этой половины проверка прошла бы и на правиле
  // «заблокирован всегда», которое так же далеко от истины.
  enemy.x = 100 + pointRadiusValue * 4;
  assert(
    context.isPlaneRespawnBlockedByEnemy(reborn) === false,
    'Arcade: enemy far from the respawn point must not block anything.'
  );
  assert(
    context.isPlaneLaunchStateReady(reborn) === true,
    'Arcade: with the point clear and respawn complete the plane is launch-ready.'
  );

  // Сбитый враг на точке — не помеха: правило про тех, кто ещё в игре. Без этой проверки
  // тест прошёл бы и на правиле «блокирует любой самолёт рядом, хоть горящий».
  const downed = { color: 'green', isAlive: false, burning: true,
                   respawnState: 'in_flight', respawnStage: 3,
                   x: 100 + pointRadiusValue * 1.5, y: 100 };
  context.points = [reborn, downed];
  assert(
    context.isPlaneRespawnBlockedByEnemy(reborn) === false,
    'Arcade: a downed enemy on the respawn point must not block the reborn plane.'
  );

  // Свой рядом с точкой — не помеха: правило про врага, а не про тесноту.
  const ally = { color: 'blue', isAlive: true, burning: false,
                 respawnState: 'in_flight', respawnStage: 3,
                 x: 100 + pointRadiusValue * 1.5, y: 100 };
  context.points = [reborn, ally];
  assert(
    context.isPlaneRespawnBlockedByEnemy(reborn) === false,
    'Arcade: an ally on the respawn point must not block the reborn plane.'
  );
}

console.log('Smoke test passed: arcade respawn gating regression shield is active, '
  + 'including the enemy-on-respawn-point block.');
