#!/usr/bin/env node
'use strict';

// Smoke test: текст кнопки «копировать пометки» в Map Tester.
//
// Раскладка карт по категориям живёт в localStorage браузера, и перенести её в json
// можно только переписав руками. Значит главное в этом тексте — сама раскладка: какая
// карта в какой категории лежит. Раньше она была размазана по строке «без пометки»
// вперемешку с пометками, и вытащить её оттуда было нечем.
//
// Проверяется не формулировка, а содержание: что раскладка идёт первой, что каждая
// карта попала ровно в одну категорию, что отдельно перечислено расхождение с json
// (это и есть список правок, который надо применить) и что пометки никуда не делись.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const RANDOM_MAP_ID = fs.readFileSync('maps.js', 'utf8').match(/const RANDOM_MAP_ID = '([^']+)';/)?.[1];
assert(RANDOM_MAP_ID, '0: не нашёл id карты-пункта в maps.js');

// Набор специально пёстрый: разные tier, архив из json, перетаскивания в обе стороны,
// карта с именем, отличным от id, и карта-пункт, которой в тексте быть не должно.
const MAPS = [
  { id: RANDOM_MAP_ID, name: 'random', tier: 'easy' },
  { id: 'easyA', name: 'easyA', tier: 'easy' },
  { id: 'easyNamed', name: 'easy named', tier: 'easy' },
  { id: 'easyToHard', name: 'easyToHard', tier: 'easy' },       // перетащена в hard
  { id: 'hardA', name: 'hardA', tier: 'hard' },
  { id: 'hardToArchive', name: 'hardToArchive', tier: 'hard' },  // перетащена в архив
  { id: 'archivedJson', name: 'archivedJson', tier: 'hard', archived: true },
  { id: 'archivedToEasy', name: 'archivedToEasy', tier: 'easy', archived: true }, // вынута из архива
];
const PLACEMENTS = { easyToHard: 'hard', hardToArchive: 'archive', archivedToEasy: 'easy' };
const MARKS = { easyA: 'keep', hardA: 'rework', archivedJson: 'delete' };

const context = {
  MAPS,
  RANDOM_MAP_ID,
  MAP_TESTER_PLACEMENTS: Object.freeze(['easy', 'hard', 'archive']),
  loadMapTesterPlacements: () => PLACEMENTS,
  loadMapTesterMarks: () => MARKS,
};
vm.createContext(context);
vm.runInContext(source.match(/const MAP_TESTER_MARK_LABELS = Object\.freeze\(\{[\s\S]*?\}\);/)[0], context);
vm.runInContext(source.match(/const MAP_TESTER_MARK_BUTTONS = Object\.freeze\(\[[\s\S]*?\]\);/)[0], context);
for(const fn of ['normalizeMapTier', 'getMapNaturalPlacement', 'getMapEffectivePlacement',
                 'isMapArchived', 'describeMapTesterMap', 'isRandomMapSentinel',
                 'buildMapTesterMarksSummary']){
  vm.runInContext(extractFunctionSource(source, fn), context);
}
// const в vm остаётся лексической переменной — забираем значения явно.
vm.runInContext([
  'this.summary = buildMapTesterMarksSummary();',
  'this.MARK_LABELS = MAP_TESTER_MARK_LABELS;',
  'this.MARK_BUTTONS = MAP_TESTER_MARK_BUTTONS;',
].join('\n'), context);
const summary = context.summary;
const lines = summary.split('\n');
const lineWith = (needle) => lines.find((line) => line.includes(needle));

// === 1. Раскладка идёт ПЕРВОЙ, до пометок ===
{
  const firstCategory = lines.findIndex((line) => /^Easy \(/.test(line));
  const marksAt = lines.findIndex((line) => /^Пометки:/.test(line));
  assert(firstCategory !== -1, '1: в тексте есть раздел с категориями');
  assert(marksAt !== -1, '1b: пометки тоже никуда не делись');
  assert(firstCategory < marksAt,
    '1c: раскладка идёт до пометок — ради неё кнопку и нажимают');
  assert(firstCategory <= 1,
    '1d: раскладка стоит в самом начале, а не в середине текста');
}

// === 2. Каждая категория перечислена со своим содержимым и счётчиком ===
{
  const expected = {
    'Easy': ['easyA', 'easy named', 'archivedToEasy'],
    'Hard': ['hardA', 'easyToHard'],
    'Archive': ['hardToArchive', 'archivedJson'],
  };
  for(const [category, members] of Object.entries(expected)){
    const line = lineWith(`${category} (`);
    assert(line, `2: в тексте есть строка категории ${category}`);
    assert(line.includes(`(${members.length})`),
      `2b: у ${category} проставлено число карт (${members.length}); строка: ${line}`);
    for(const member of members){
      assert(line.includes(member),
        `2c: карта «${member}» попала в ${category}; строка: ${line}`);
    }
  }
}

// === 3. Каждая карта ровно в одной категории, и карты-пункта в тексте нет ===
{
  for(const map of MAPS){
    if(map.id === RANDOM_MAP_ID) continue;
    const hits = ['Easy (', 'Hard (', 'Archive ('].filter((c) => lineWith(c).includes(map.name));
    assert(hits.length === 1,
      `3: карта «${map.name}» лежит ровно в одной категории (нашлась в ${hits.length})`);
  }
  assert(!summary.includes('random'),
    '3b: карта-пункт «random» в текст не попадает — её нет и в самом окне тестера');
}

// === 4. Отдельной строкой — чем раскладка отличается от json ===
//
// Это и есть список правок, который переносится в файлы карт.
{
  const line = lineWith('Отличается от json');
  assert(line, '4: расхождение с json вынесено отдельной строкой');
  assert(line.includes(`(${Object.keys(PLACEMENTS).length})`),
    `4b: у расхождения проставлено число карт (${Object.keys(PLACEMENTS).length}); строка: ${line}`);
  for(const [id, to] of Object.entries(PLACEMENTS)){
    const from = MAPS.find((m) => m.id === id).archived === true
      ? 'archive'
      : MAPS.find((m) => m.id === id).tier;
    assert(line.includes(`${from} → ${to}`),
      `4c: сказано, откуда и куда переехала «${id}» (${from} → ${to}); строка: ${line}`);
  }
  // Карта, стоящая там же, где в json, в расхождение попадать не должна.
  assert(!line.includes('easyA'),
    '4d: непередвинутая карта в расхождение не попадает');
}

// === 5. Пометки на месте, все четыре вида ===
{
  const marksAt = lines.findIndex((line) => /^Пометки:/.test(line));
  const tail = lines.slice(marksAt).join('\n');
  for(const [id, mark] of Object.entries(MARKS)){
    const label = context.MARK_LABELS[mark];
    const line = lines.slice(marksAt).find((l) => l.includes(label));
    assert(line && line.includes(id),
      `5: пометка «${label}» перечисляет карту «${id}»`);
  }
  for(const { glyph } of context.MARK_BUTTONS){
    assert(tail.includes(`(${glyph})`),
      `5b: в пометках виден значок кнопки «${glyph}» — по нему их и узнают в окне`);
  }
  assert(/без пометки: \d+/.test(tail),
    '5c: непомеченные сведены к числу — поимённо они уже перечислены в раскладке');
}

console.log('Smoke test passed: кнопка копирует сначала раскладку по категориям, затем расхождение с json, затем пометки; карта-пункт в текст не попадает.');
