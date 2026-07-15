#!/usr/bin/env node
'use strict';

// Smoke test: архивные карты (пометка «удалить» в Map Tester или "archived": true
// в JSON карты) не должны попадать в ротацию случайных карт (classic и
// randomizeMapEachRound). При этом они остаются в MAPS и выбираются вручную
// через Advanced Settings — тут проверяется только пул ротации.

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

const MAPS = [
  { id: 'easyA', name: 'easyA', tier: 'easy' },
  { id: 'easyB', name: 'easyB', tier: 'easy' },
  { id: 'easyMarked', name: 'easyMarked', tier: 'easy' },              // помечена «удалить»
  { id: 'hardA', name: 'hardA', tier: 'hard' },
  { id: 'hardJsonArchived', name: 'hardJsonArchived', tier: 'hard', archived: true }
];

const context = {
  MAPS,
  // Пометки тестера: easyMarked в архиве через localStorage-пометку.
  loadMapTesterMarks: () => ({ easyMarked: 'delete' })
};
vm.createContext(context);

for(const fnName of ['isMapArchived', 'getRandomMapSentinelIndex', 'getPlayableMapIndices', 'normalizeMapTier', 'getMapTierForRound', 'getPlayableMapIndicesForRound']){
  vm.runInContext(extractFunctionSource(source, fnName), context);
}

const playable = vm.runInContext('getPlayableMapIndices()', context);
assert(JSON.stringify(playable) === JSON.stringify([0, 1, 3]),
  `rotation pool must exclude archived maps, got [${playable}]`);

const easyRound = vm.runInContext('getPlayableMapIndicesForRound(1)', context);
assert(JSON.stringify(easyRound) === JSON.stringify([0, 1]),
  `easy rounds must exclude the marked easy map, got [${easyRound}]`);

const hardRound = vm.runInContext('getPlayableMapIndicesForRound(5)', context);
assert(JSON.stringify(hardRound) === JSON.stringify([3]),
  `hard rounds must exclude the json-archived map, got [${hardRound}]`);

// Все hard-карты в архиве → fallback на общий пул без архивных, а не пустота.
vm.runInContext('MAPS[3].archived = true', context);
const hardAllArchived = vm.runInContext('getPlayableMapIndicesForRound(5)', context);
assert(JSON.stringify(hardAllArchived) === JSON.stringify([0, 1]),
  `with every hard map archived the pool must fall back to non-archived maps, got [${hardAllArchived}]`);

console.log('Smoke test passed: archived maps are excluded from random rotation (marked and json-archived), fallback stays non-archived.');
