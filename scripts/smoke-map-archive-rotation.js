#!/usr/bin/env node
'use strict';

// Smoke test: ротация случайных карт (classic и randomizeMapEachRound) должна
// уважать размещения Map Tester. Карта в архиве (перенесена кнопкой ⟳ или
// "archived": true в JSON) не попадает в пул вообще; карта, перенесённая между
// easy и hard, выпадает в раундах своего нового тира. Ручной выбор в Advanced
// Settings не ограничивается — тут проверяется только пул ротации.

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
  { id: 'easyMoved', name: 'easyMoved', tier: 'easy' },          // перенесена ⟳ в hard
  { id: 'easyArchivedLocal', name: 'easyArchivedLocal', tier: 'easy' }, // перенесена ⟳ в архив
  { id: 'hardA', name: 'hardA', tier: 'hard' },
  { id: 'hardJsonArchived', name: 'hardJsonArchived', tier: 'hard', archived: true }
];

const PLACEMENTS = { easyMoved: 'hard', easyArchivedLocal: 'archive' };

const context = {
  MAPS,
  MAP_TESTER_PLACEMENT_CYCLE: Object.freeze(['easy', 'hard', 'archive']),
  loadMapTesterPlacements: () => PLACEMENTS
};
vm.createContext(context);

for(const fnName of ['normalizeMapTier', 'getMapNaturalPlacement', 'getMapEffectivePlacement', 'isMapArchived', 'getRandomMapSentinelIndex', 'getPlayableMapIndices', 'getMapTierForRound', 'getPlayableMapIndicesForRound']){
  vm.runInContext(extractFunctionSource(source, fnName), context);
}

const playable = vm.runInContext('getPlayableMapIndices()', context);
assert(JSON.stringify(playable) === JSON.stringify([0, 1, 2, 4]),
  `rotation pool must exclude archived maps (local and json), got [${playable}]`);

const easyRound = vm.runInContext('getPlayableMapIndicesForRound(1)', context);
assert(JSON.stringify(easyRound) === JSON.stringify([0, 1]),
  `easy rounds must exclude archived and moved-to-hard maps, got [${easyRound}]`);

const hardRound = vm.runInContext('getPlayableMapIndicesForRound(5)', context);
assert(JSON.stringify(hardRound) === JSON.stringify([2, 4]),
  `hard rounds must include the map moved from easy, got [${hardRound}]`);

// Все hard-карты в архиве → fallback на общий пул без архивных, а не пустота.
PLACEMENTS.easyMoved = 'archive';
PLACEMENTS.hardA = 'archive';
const hardAllArchived = vm.runInContext('getPlayableMapIndicesForRound(5)', context);
assert(JSON.stringify(hardAllArchived) === JSON.stringify([0, 1]),
  `with every hard map archived the pool must fall back to non-archived maps, got [${hardAllArchived}]`);

console.log('Smoke test passed: rotation honours Map Tester placements (archive excluded, tier moves respected, fallback stays non-archived).');
