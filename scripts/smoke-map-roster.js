#!/usr/bin/env node
'use strict';

// Smoke test: здоровье набора карт.
//
// Раскладка easy/hard/архив — живая: её тасуют руками в Map Tester и переносят в json.
// Поэтому конкретный состав групп тут НЕ заморожен, иначе обычная перетасовка карт
// ломала бы тест. Проверяется то, что ломает игру молча:
//
//   * поле archived читается кодом строго как === true, поэтому строка "true" или
//     false вместо отсутствия поля тихо переводит карту не в ту группу;
//   * tier нормализуется с падением в 'hard', поэтому опечатка в tier так же тихо
//     уносит карту в тяжёлые раунды;
//   * если в easy или hard не осталось ни одной неархивной карты, раунд молча берёт
//     весь пул и тир перестаёт что-либо значить.

const fs = require('fs');
const path = require('path');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const manifest = JSON.parse(fs.readFileSync('ui_gamescreen/maps/manifest.json', 'utf8')).maps;
const gameSource = fs.readFileSync('script.js', 'utf8');
const mapsSource = fs.readFileSync('maps.js', 'utf8');
const RANDOM_MAP_ID = mapsSource.match(/const RANDOM_MAP_ID = '([^']+)';/)?.[1];
assert(RANDOM_MAP_ID, '0: не нашёл id карты-пункта в maps.js');

const maps = manifest.map((file) => {
  assert(fs.existsSync(file), `0b: карта из манифеста существует: ${file}`);
  const map = JSON.parse(fs.readFileSync(file, 'utf8'))?.map;
  assert(map && typeof map.id === 'string' && map.id.length > 0,
    `0c: у карты есть id: ${file}`);
  return { file, ...map };
});

// === 1. tier и difficulty — только easy или hard, и они согласованы ===
{
  for(const map of maps){
    assert(map.tier === 'easy' || map.tier === 'hard',
      `1: у карты «${map.id}» tier это easy или hard (сейчас ${JSON.stringify(map.tier)}); ` +
      'опечатка молча упала бы в hard');
    assert(map.difficulty === map.tier,
      `1b: у карты «${map.id}» difficulty совпадает с tier (${map.difficulty} против ${map.tier})`);
  }
}

// === 2. archived: либо поля нет, либо ровно true ===
//
// getMapNaturalPlacement сравнивает через === true, поэтому "true" строкой или false
// вместо отсутствия поля читаются как «не архив» и «архив» соответственно — но уже
// не так, как выглядят в файле.
{
  for(const map of maps){
    assert(!('archived' in map) || map.archived === true,
      `2: у карты «${map.id}» archived либо отсутствует, либо равен true ` +
      `(сейчас ${JSON.stringify(map.archived)})`);
  }
  assert(/if\(map\?\.archived === true\) return "archive";/.test(gameSource),
    '2b: код по-прежнему читает archived строгим сравнением — на этом и держится проверка выше');
}

// === 3. В обеих группах ротации есть карты ===
//
// getPlayableMapIndicesForRound при пустой группе молча отдаёт весь пул, и деление на
// лёгкие и тяжёлые раунды перестаёт работать.
{
  const rotation = maps.filter((map) => map.archived !== true && map.id !== RANDOM_MAP_ID);
  const easy = rotation.filter((map) => map.tier === 'easy');
  const hard = rotation.filter((map) => map.tier === 'hard');

  assert(easy.length > 0, '3: в ротации есть хотя бы одна easy-карта — иначе первые раунды берут весь пул');
  assert(hard.length > 0, '3b: в ротации есть хотя бы одна hard-карта — иначе поздние раунды берут весь пул');

  // Карта-пункт в ротацию не входит — это проверяет smoke-random-map-entry.js, здесь
  // лишь убеждаемся, что она вообще есть в наборе.
  assert(maps.some((map) => map.id === RANDOM_MAP_ID),
    `3c: карта-пункт «${RANDOM_MAP_ID}» в наборе`);

  console.log(`  ротация: easy ${easy.length} (${easy.map((m) => m.name).join(', ')})`);
  console.log(`  ротация: hard ${hard.length} (${hard.map((m) => m.name).join(', ')})`);
  console.log(`  архив: ${maps.filter((m) => m.archived === true).length}`);
}

// === 4. Каждая карта пригодна к игре ===
{
  for(const map of maps){
    assert(Array.isArray(map.sprites) && map.sprites.length > 0,
      `4: у карты «${map.id}» есть кирпичи`);
    assert(map.mode === 'data',
      `4b: карта «${map.id}» в режиме data (сейчас ${JSON.stringify(map.mode)})`);
    assert(typeof map.name === 'string' && map.name.trim().length > 0,
      `4c: у карты «${map.id}» есть подпись для карусели`);
  }
}

// === 5. Удалённых карт не осталось нигде ===
//
// Файл, вычеркнутый из манифеста, но оставшийся на диске, — мёртвый груз (это уже
// проверяет smoke-random-map-entry.js). Здесь ловим обратное: ссылку на карту, которой
// больше нет.
{
  const known = new Set(maps.map((map) => map.id));
  for(const file of manifest){
    assert(fs.existsSync(file), `5: манифест не ссылается на удалённый файл: ${file}`);
  }

  const sources = ['script.js', 'settings.js', 'maps.js', 'index.html']
    .map((name) => fs.readFileSync(name, 'utf8')).join('\n');
  for(const goneId of ['fiveBricks', 'rooms', 'Pebbles']){
    assert(!known.has(goneId), `5b: карта «${goneId}» удалена из набора`);
    assert(!sources.includes(`'${goneId}'`) && !sources.includes(`"${goneId}"`),
      `5c: в коде не осталось ссылок на удалённую карту «${goneId}»`);
  }
}

console.log('Smoke test passed: у всех карт валидные tier/archived, обе группы ротации не пусты, и ссылок на удалённые карты не осталось.');
