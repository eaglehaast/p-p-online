#!/usr/bin/env node
'use strict';

// Smoke test: карта «random» в Advanced Settings.
//
// Это не поле, а пункт меню: выбрав её, игрок играет обычную ротацию по правилам
// Classic — первые раунды easy, дальше hard. Сама она в ротацию не попадает и в
// Map Tester не показывается.
//
// Механика для неё в коде была написана давно, но никогда не срабатывала: script.js
// искал карту с ИМЕНЕМ 'random map' (такой не было ни одной), а settings.js — карту с
// ID 'random' (её тоже не было). Отсюда главный инвариант: обе стороны обязаны искать
// одно и то же, и это «одно и то же» обязано существовать.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found: ${fnName}`);
}

const mapsSource = fs.readFileSync('maps.js', 'utf8');
const gameSource = fs.readFileSync('script.js', 'utf8');
const settingsSource = fs.readFileSync('settings.js', 'utf8');

const idMatch = mapsSource.match(/const RANDOM_MAP_ID = '([^']+)';/);
assert(idMatch, '0: maps.js задаёт id карты-пункта одной константой');
const RANDOM_MAP_ID = idMatch[1];

// === 1. Карта существует, лежит в манифесте и её id уникален ===
{
  const manifest = JSON.parse(fs.readFileSync('ui_gamescreen/maps/manifest.json', 'utf8')).maps;

  const byId = new Map();
  const walk = (dir) => {
    for(const name of fs.readdirSync(dir)){
      const full = path.join(dir, name);
      if(fs.statSync(full).isDirectory()){ walk(full); continue; }
      if(!name.endsWith('.json') || name === 'manifest.json') continue;
      const map = JSON.parse(fs.readFileSync(full, 'utf8'))?.map;
      if(!map?.id) continue;
      if(!byId.has(map.id)) byId.set(map.id, []);
      byId.get(map.id).push(full);
    }
  };
  walk('ui_gamescreen/maps');

  const files = byId.get(RANDOM_MAP_ID);
  assert(files && files.length === 1,
    `1: карта с id «${RANDOM_MAP_ID}» существует ровно в одном файле (нашлось ${files ? files.length : 0})`);
  assert(manifest.includes(files[0]),
    `1b: карта «${RANDOM_MAP_ID}» перечислена в манифесте, иначе её просто не загрузят`);

  const map = JSON.parse(fs.readFileSync(files[0], 'utf8')).map;
  assert(map.name === RANDOM_MAP_ID,
    `1c: игрок видит подпись «${RANDOM_MAP_ID}» (сейчас «${map.name}»)`);
  assert(Array.isArray(map.sprites) && map.sprites.length > 0,
    '1d: у карты есть кирпичи — в меню по ней летают мини-самолёты и врезаются в них');
  assert(map.archived !== true,
    '1e: карта-пункт не архивная, иначе уедет в конец карусели');

  // Тот самый косяк, из-за которого id пришлось разводить.
  const collisions = [...byId.entries()].filter(([, list]) => list.length > 1);
  const loaded = new Set(manifest);
  const loadedCollisions = collisions.filter(([, list]) => list.filter(f => loaded.has(f)).length > 1);
  assert(loadedCollisions.length === 0,
    `1f: у загружаемых карт не должно быть одинаковых id: ${loadedCollisions.map(([id]) => id).join(', ')}`);
}

// === 2. Обе стороны ищут карту по одному и тому же id ===
{
  const sentinel = extractFunctionSource(gameSource, 'getRandomMapSentinelIndex');
  assert(/map\?\.id === RANDOM_MAP_ID/.test(sentinel),
    '2: script.js ищет карту-пункт по id');
  assert(!/name/.test(sentinel),
    '2b: поиск по имени вернулся бы к прежней болезни — имя видно игроку и может измениться');
  assert(/const RANDOM_MAP_ID = mapDataBridge\.RANDOM_MAP_ID/.test(gameSource),
    '2c: script.js берёт id из maps.js, а не заводит свою копию');
  assert(/RANDOM_MAP_ID,/.test(mapsSource.slice(mapsSource.indexOf('window.paperWingsMapsData = {'))),
    '2d: maps.js отдаёт id наружу');

  const settingsCheck = settingsSource.match(/function isRandomMap\(map\)\{\s*return map\?\.id === '([^']+)';/);
  assert(settingsCheck, '2e: settings.js опознаёт карту-пункт по id');
  assert(settingsCheck[1] === RANDOM_MAP_ID,
    `2f: settings.js и maps.js обязаны искать один id («${settingsCheck[1]}» против «${RANDOM_MAP_ID}»)`);
}

// === 3. Порядок карусели: random, easy, hard, архив ===
{
  const sandbox = { Object };
  vm.createContext(sandbox);
  const ranksStart = mapsSource.indexOf('const MAP_ORDER_RANKS');
  assert(ranksStart !== -1, '3-стенд: не нашёл таблицу групп');
  vm.runInContext([
    `const RANDOM_MAP_ID = ${JSON.stringify(RANDOM_MAP_ID)};`,
    mapsSource.slice(ranksStart, mapsSource.indexOf(');', ranksStart) + 2),
    extractFunctionSource(mapsSource, 'getMapOrderRank'),
    extractFunctionSource(mapsSource, 'sortMapsForCarousel'),
    'this.getMapOrderRank = getMapOrderRank; this.sortMapsForCarousel = sortMapsForCarousel;',
  ].join('\n'), sandbox);
  const { getMapOrderRank, sortMapsForCarousel } = sandbox;

  const rank = (map) => getMapOrderRank(map);
  assert(rank({ id: RANDOM_MAP_ID, tier: 'hard', archived: true }) === 0,
    '3: карта-пункт идёт первой, что бы ни стояло у неё в tier/archived');
  assert(rank({ id: 'a', tier: 'easy' }) === 1 && rank({ id: 'b', tier: 'hard' }) === 2,
    '3b: easy идёт раньше hard');
  assert(rank({ id: 'c', tier: 'easy', archived: true }) === 3,
    '3c: архив идёт последним, даже если карта easy');

  // Порядок внутри группы — манифестный: мелкую очерёдность задаёт человек.
  const sample = [
    { id: 'h1', tier: 'hard' }, { id: 'z', tier: 'easy', archived: true },
    { id: 'e1', tier: 'easy' }, { id: RANDOM_MAP_ID, tier: 'easy' },
    { id: 'e2', tier: 'easy' }, { id: 'h2', tier: 'hard' },
    { id: 'y', tier: 'hard', archived: true },
  ];
  assert(sortMapsForCarousel(sample).map(m => m.id).join(',') === `${RANDOM_MAP_ID},e1,e2,h1,h2,z,y`,
    `3d: сортировка стабильна внутри группы (получилось ${sortMapsForCarousel(sample).map(m => m.id).join(',')})`);
  assert(sample[0].id === 'h1',
    '3e: сортировка не должна портить исходный массив');

  // И то же самое на настоящем манифесте.
  const manifest = JSON.parse(fs.readFileSync('ui_gamescreen/maps/manifest.json', 'utf8')).maps;
  const real = manifest.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).map);
  const sorted = sortMapsForCarousel(real);
  assert(sorted[0].id === RANDOM_MAP_ID,
    `3f: на настоящем манифесте карта-пункт стоит ПЕРВОЙ (сейчас «${sorted[0].id}»)`);
  const ranks = sorted.map(rank);
  assert(ranks.every((value, i) => i === 0 || ranks[i - 1] <= value),
    '3g: группы идут подряд, без чересполосицы');
  assert(new Set(ranks).size >= 3,
    '3h: в манифесте должны быть все группы, иначе тест ничего не проверяет');

  // Правильная сортировка бесполезна, если её не применяют к загруженному списку.
  const init = extractFunctionSource(mapsSource, 'initializeImportedJsonMaps');
  assert(/sortMapsForCarousel\(await loadMapsFromManifest\(\)\)/.test(init),
    '3i: список из манифеста проходит через сортировку, иначе порядок остаётся манифестным');
}

// === 4. Стартовый выбор попадает именно на неё ===
//
// Сброс выполняется синхронно, когда MAPS ещё пуст, поэтому опереться можно только на
// порядок карусели: карта-пункт стоит первой, значит индекс 0 верен и до загрузки.
{
  const resolve = extractFunctionSource(gameSource, 'resolveStartupMapIndex');
  assert(/getRandomMapSentinelIndex\(\)/.test(resolve) && /: 0;/.test(resolve),
    '4: стартовый индекс — карта-пункт, а до загрузки списка просто 0');
  const apply = extractFunctionSource(gameSource, 'applyTemporaryMenuStartupDefaults');
  assert(/settings\.mapIndex = clampMapIndex\(resolveStartupMapIndex\(\)\);/.test(apply),
    '4b: стартовый сброс ставит именно этот индекс');
  assert(!/resolveClearSkyMapIndex/.test(gameSource),
    '4c: прежний поиск Clear Sky убран — он всё равно никогда не срабатывал');
}

// === 5. В игру и в Map Tester карта-пункт не попадает ===
{
  const playable = extractFunctionSource(gameSource, 'getPlayableMapIndices');
  assert(/index !== getRandomMapSentinelIndex\(\)/.test(playable),
    '5: карта-пункт исключена из ротации — играть по ней нечего');
  assert(/isMapArchived/.test(playable),
    '5b: архивные карты по-прежнему вне ротации');

  const tester = extractFunctionSource(gameSource, 'renderMapTesterLists');
  assert(/if\(isRandomMapSentinel\(map\)\) return;/.test(tester),
    '5c: Map Tester пропускает карту-пункт');

  // Выбрав её, игрок получает обычную ротацию, а тир зависит от номера раунда.
  const gameplay = extractFunctionSource(gameSource, 'resolveMapIndexForGameplay');
  assert(/clamped === getRandomMapSentinelIndex\(\)[\s\S]{0,120}getRandomPlayableMapIndex/.test(gameplay),
    '5d: выбранная карта-пункт разворачивается в случайную играбельную');
  const tier = extractFunctionSource(gameSource, 'getMapTierForRound');
  assert(/roundNumber <= 4[\s\S]{0,60}'easy'/.test(tier) && /return 'hard'/.test(tier),
    '5e: первые раунды easy, дальше hard');
}

console.log('Smoke test passed: карта «random» есть, ищется по одному id из maps.js/script.js/settings.js, стоит первой в карусели и выбрана на старте, а в ротацию и в Map Tester не попадает.');
