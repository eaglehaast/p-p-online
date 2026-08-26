#!/usr/bin/env node
'use strict';

// Smoke test: с чего игра открывается на старте.
//
// applyTemporaryMenuStartupDefaults вызывается ПОСЛЕ loadSettings и перекрывает
// сохранённый выбор игрока — это принудительный сброс, а не «значение по умолчанию».
// Поэтому что в нём записано, то игрок и видит, открыв игру.

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
const markup = fs.readFileSync('index.html', 'utf8');

// Читаем таблицу целиком и исполняем её, а не сверяем строки по одной.
const tableStart = source.indexOf('const TEMP_MENU_STARTUP_DEFAULTS = Object.freeze({');
assert(tableStart !== -1, '0: не нашёл таблицу стартовых умолчаний');
const tableSource = source.slice(tableStart, source.indexOf('});', tableStart) + 3);
const sandbox = { Object, CLEAR_SKY_MAP_ID: 'clearsky', CLEAR_SKY_MAP_NAME: 'clear sky' };
vm.createContext(sandbox);
// const в vm остаётся лексической переменной и в sandbox не попадает — забираем значением.
const DEFAULTS = vm.runInContext(`${tableSource}\nTEMP_MENU_STARTUP_DEFAULTS;`, sandbox);
assert(DEFAULTS && typeof DEFAULTS === 'object', '0b: таблица стартовых умолчаний не разобралась');

// === 1. Игра открывается на Hot Seat и Classic Rules ===
{
  assert(DEFAULTS.enabled === true,
    '1: принудительный стартовый выбор включён — иначе игрок увидит прошлый сохранённый');
  assert(DEFAULTS.mode === 'hotSeat',
    `1b: режим на старте — Hot Seat (сейчас «${DEFAULTS.mode}»)`);
  assert(DEFAULTS.ruleset === 'classic',
    `1c: правила на старте — Classic Rules (сейчас «${DEFAULTS.ruleset}»)`);
}

// === 2. Обе половины выбора реально доезжают до состояния меню ===
//
// Кнопки подсвечиваются из selectedMode и selectedRuleset, поэтому мало записать
// значения в таблицу — их надо ещё присвоить.
{
  const apply = extractFunctionSource(source, 'applyTemporaryMenuStartupDefaults');
  assert(/selectedMode = TEMP_MENU_STARTUP_DEFAULTS\.mode;/.test(apply),
    '2: режим из таблицы присваивается selectedMode');
  assert(/selectedRuleset = TEMP_MENU_STARTUP_DEFAULTS\.ruleset;/.test(apply),
    '2b: правила из таблицы присваиваются selectedRuleset');

  // Порядок важен: сброс обязан идти ПОСЛЕ загрузки настроек, иначе его затрёт.
  const loadAt = source.indexOf('\nloadSettings();');
  const applyAt = source.indexOf('\napplyTemporaryMenuStartupDefaults();');
  assert(loadAt !== -1 && applyAt !== -1, '2c: не нашёл вызовы loadSettings/applyTemporary...');
  assert(loadAt < applyAt,
    '2d: стартовый сброс обязан идти после loadSettings, иначе сохранённый выбор его перекроет');

  // И подсветка кнопок обязана пересчитаться уже после сброса.
  const syncAt = source.indexOf('\nsyncModeButtonSkins(selectedMode);');
  assert(syncAt !== -1 && applyAt < syncAt,
    '2e: скины кнопок пересчитываются после стартового сброса, иначе подсветится прошлый выбор');
}

// === 3. Обе кнопки в меню есть, и по ним игра действительно стартует ===
{
  assert(/id="hotSeatBtn"/.test(markup), '3: кнопка Hot Seat есть в меню');
  assert(/id="classicRulesBtn"/.test(markup), '3b: кнопка Classic Rules есть в меню');

  // Режим и правила подсвечиваются разными механизмами — проверяем оба.
  assert(/applyMenuButtonSkin\(hotSeatBtn, "hotSeat", mode === "hotSeat"\)/.test(source),
    '3c: подсветка Hot Seat завязана на selectedMode');
  assert(/applyMenuButtonSkin\(classicRulesBtn, "classicRules", selection === "classic"\)/.test(source),
    '3d: подсветка Classic Rules завязана на selectedRuleset');
}

console.log('Smoke test passed: игра открывается на Hot Seat и Classic Rules, и обе половины выбора доезжают до подсветки кнопок.');
