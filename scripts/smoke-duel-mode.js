#!/usr/bin/env node
'use strict';

// Smoke test: дуэль (счёт 23:23 перед началом раунда).
// Проверяем три вещи, от которых зависит режим:
//   1) условие входа — ровно матч-пойнт с обеих сторон, и не в аркадном
//      режиме бесконечного счёта;
//   2) расстановка — по одному самолёту на сторону, по центру своего ряда,
//      Y тот же, что у обычной расстановки;
//   3) флаги и базы выключены (getFlagConfigsForMap пуст, isFlagsModeEnabled
//      false), а баннер раунда показывает DUEL вместо ROUND N.

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

const FIELD_LEFT = 50;
const FIELD_WIDTH = 360;
const ROW_Y = { blue: 98, green: 642 };

const context = {
  console,
  POINTS_TO_WIN: 24,
  DUEL_MODE_BANNER_TEXT: 'DUEL',
  FIELD_LEFT,
  FIELD_WIDTH,
  WORLD: { width: 360, height: 640 },
  FLAG_LAYOUTS: { blue: { x: 170, y: 41 }, green: { x: 170, y: 568 } },
  // Обычная расстановка: 4 самолёта на сторону.
  getStartPlaneWorldPositions: () => ({
    blue: [62, 121, 239, 298].map((x) => ({ x, y: ROW_Y.blue })),
    green: [62, 121, 239, 298].map((x) => ({ x, y: ROW_Y.green }))
  }),
  // Состояние, которое режим читает.
  blueScore: 0,
  greenScore: 0,
  duelModeActive: false,
  settings: { flagsEnabled: true },
  isArcadeInfiniteScoreMode: () => false
};
vm.createContext(context);

for(const fnName of ['isDuelModeActive', 'isDuelScoreTie', 'shouldStartDuelRound', 'getDuelPlaneWorldPositions', 'getFlagConfigsForMap', 'isFlagsModeEnabled', 'buildTransferTurnTexts']){
  vm.runInContext(extractFunctionSource(source, fnName), context);
}

// --- 1. Условие входа ---
const setScore = (blue, green) => {
  context.blueScore = blue;
  context.greenScore = green;
};

setScore(23, 23);
assert(vm.runInContext('shouldStartDuelRound()', context) === true,
  'duel must arm at 23:23');

for(const [blue, green] of [[23, 22], [22, 23], [24, 23], [0, 0], [22, 22]]){
  setScore(blue, green);
  assert(vm.runInContext('shouldStartDuelRound()', context) === false,
    `duel must stay off at ${blue}:${green}`);
}

setScore(23, 23);
context.isArcadeInfiniteScoreMode = () => true;
assert(vm.runInContext('shouldStartDuelRound()', context) === false,
  'duel must stay off in arcade infinite score mode');
context.isArcadeInfiniteScoreMode = () => false;

// --- 2. Расстановка ---
context.duelModeActive = true;
const duelPositions = vm.runInContext('getDuelPlaneWorldPositions()', context);
assert(duelPositions.blue.length === 1 && duelPositions.green.length === 1,
  `duel must place exactly one plane per side, got ${duelPositions.blue.length}/${duelPositions.green.length}`);

const expectedCenterX = FIELD_LEFT + FIELD_WIDTH / 2;
assert(duelPositions.blue[0].x === expectedCenterX && duelPositions.green[0].x === expectedCenterX,
  `duel planes must sit at the row centre (${expectedCenterX}), got ${duelPositions.blue[0].x}/${duelPositions.green[0].x}`);
assert(duelPositions.blue[0].y === ROW_Y.blue && duelPositions.green[0].y === ROW_Y.green,
  'duel planes must keep the normal row Y');

// --- 3. Флаги, базы и баннер ---
assert(vm.runInContext('getFlagConfigsForMap()', context).length === 0,
  'duel must drop every flag config (fallback included)');
assert(vm.runInContext('getFlagConfigsForMap({ flags: [{ color: "blue", x: 1, y: 2 }] })', context).length === 0,
  'duel must drop flags declared by the map too');
assert(vm.runInContext('isFlagsModeEnabled()', context) === false,
  'duel must disable flags/bases rendering and interaction');
assert(vm.runInContext('buildTransferTurnTexts("green", 25)', context).topText === 'DUEL',
  'duel banner must replace ROUND N');

// Обычный раунд ничего из этого не теряет.
context.duelModeActive = false;
assert(vm.runInContext('getFlagConfigsForMap()', context).length === 2,
  'normal round keeps the fallback flags');
assert(vm.runInContext('isFlagsModeEnabled()', context) === true,
  'normal round keeps flags enabled');
assert(vm.runInContext('buildTransferTurnTexts("green", 25)', context).topText === 'ROUND 25',
  'normal round keeps the ROUND banner');
assert(vm.runInContext('getStartPlaneWorldPositions().blue.length', context) === 4,
  'normal round keeps four planes per side');

console.log('Smoke test passed: duel arms only at 23:23 (never in arcade infinite), places one centred plane per side, and strips flags/bases plus the ROUND banner.');
