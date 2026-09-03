#!/usr/bin/env node
'use strict';

// Smoke test: настройка точности называется по смыслу, и старые сохранения не пропадают.
//
// Поле звалось aimingAmplitude, потому что когда-то задавало АМПЛИТУДУ отклонения при
// прицеливании — в градусах. Потом смысл поменяли на ПРОЦЕНТ ТОЧНОСТИ, то есть на шкалу
// ПРОТИВОПОЛОЖНУЮ (больше — лучше, а не хуже), а имя оставили. В коде это выглядело так:
//
//   DEFAULT_SETTINGS.aimingAmplitude = 80     // 80% точности, а не 80 градусов
//
// Имя переименовано в accuracyPercent. Опасных мест ровно два, и оба проверяются здесь:
// сохранения игроков в localStorage и пакет настроек комнаты в онлайне.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const settings = fs.readFileSync('settings.js', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

// === 1. Старое имя не осталось живым полем ===
//
// Разрешено ровно два вида упоминаний: константа со старым ключом хранилища и таблица
// прежних имён для сети. Всё прочее означало бы, что переименование сделано наполовину.
{
  for(const [file, source] of [['settings.js', settings], ['script.js', script]]){
    const code = source.replace(/\/\/.*$/gm, '');
    const hits = [...code.matchAll(/^.*\baimingAmplitude\b.*$/gm)].map((m) => m[0].trim());
    const allowed = hits.filter((line) => (
      /ACCURACY_STORAGE_KEY_LEGACY\s*=\s*'settings\.aimingAmplitude'/.test(line)
      || /accuracyPercent:\s*"aimingAmplitude"/.test(line)
    ));
    assert(hits.length === allowed.length,
      `1: в ${file} осталось живое упоминание старого имени: `
      + hits.filter((l) => !allowed.includes(l)).slice(0, 3).join(' | '));
  }
  assert(/\baccuracyPercent\b/.test(settings) && /\baccuracyPercent\b/.test(script),
    '1b: новое имя должно использоваться в обоих файлах');
}

// === 2. ГЛАВНОЕ: сохранение игрока переживает переименование ===
//
// Читается настоящий код чтения настройки из settings.js — на подставном хранилище.
function readAccuracy(stored){
  const decl = /const ACCURACY_STORAGE_KEY = [\s\S]*?const ACCURACY_STORAGE_KEY_LEGACY = [^\n]*/.exec(settings);
  assert(decl, '2: константы ключей хранения не найдены');

  // Граница блока — по последней его строке, а не по первой закрывающей скобке: внутри
  // три ветки подряд, и нежадное `\n}` обрывало разбор на первой же (проверено — падало
  // на случае «сохранений нет»).
  // Начало блока ищется С НАЧАЛА СТРОКИ: такое же присваивание есть и с отступом внутри
  // запасной ветки, и без якоря разбор мог начаться с середины — получался неразбираемый
  // огрызок и краш вместо внятного отказа.
  const readBlock = /^sharedSettings\.accuracyPercent = parseFloat\(getStoredItem\((\w+)\)\);[\s\S]*?accuracyPercent \*= 5;\n\}/m.exec(settings);
  assert(readBlock && readBlock[1] === 'ACCURACY_STORAGE_KEY',
    `2b0: первым читается ${readBlock ? readBlock[1] : 'ничего'} — нынешний ключ обязан быть первым, `
    + 'иначе старое сохранение перебьёт новое');
  assert(readBlock, '2b: блок чтения точности не найден');

  const context = {
    Number, parseFloat,
    sharedSettings: {},
    DEFAULT_SETTINGS: { accuracyPercent: 80 },
    getStoredItem: (key) => (key in stored ? stored[key] : null),
  };
  vm.createContext(context);
  vm.runInContext(`${decl[0]}\n${readBlock[0]}`, context);
  return context.sharedSettings.accuracyPercent;
}

{
  assert(readAccuracy({ 'settings.accuracyPercent': '65' }) === 65,
    '2c: новый ключ читается');

  assert(readAccuracy({ 'settings.aimingAmplitude': '65' }) === 65,
    '2d: сохранение под ПРЕЖНИМ ключом обязано читаться — иначе у всех, кто уже играл, '
    + 'точность молча сбросится к умолчанию');

  // Когда лежат оба, нынешний ключ главнее: он записан позже.
  assert(readAccuracy({ 'settings.accuracyPercent': '30', 'settings.aimingAmplitude': '90' }) === 30,
    '2e: при обоих ключах берётся нынешний');

  assert(readAccuracy({}) === 80,
    '2f: без сохранений берётся значение по умолчанию');

  // Давняя миграция градусов в проценты: значение из старой шкалы домножается на пять.
  // Она относится к ещё более ранней настройке и обязана пережить переименование.
  assert(readAccuracy({ 'settings.aimingAmplitude': '16' }) === 80,
    '2g: значение из градусной шкалы (<= 20) по-прежнему переводится в проценты');
  assert(readAccuracy({ 'settings.accuracyPercent': '20' }) === 100,
    '2h: перевод градусов применяется по значению, а не по имени ключа');
}

// === 3. Пишем только под новым ключом ===
//
// Иначе прежний ключ будет жить вечно и переименование останется на бумаге.
{
  assert(/setStoredItem\(ACCURACY_STORAGE_KEY, sharedSettings\.accuracyPercent\)/.test(settings),
    '3: settings.js сохраняет точность под новым ключом');
  assert(/setStoredSetting\('settings\.accuracyPercent', clamped\)/.test(script),
    '3b: script.js тоже сохраняет под новым ключом');
  assert(!/setStoredItem\(ACCURACY_STORAGE_KEY_LEGACY/.test(settings),
    '3c: в прежний ключ писать не нужно — он только для чтения старых сохранений');
}

// === 4. Настройки комнаты: отправляем новое имя, принимаем и старое ===
{
  const keys = /const ONLINE_ROOM_SETTING_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/.exec(script);
  assert(keys, '4: список настроек комнаты не найден');
  assert(/"accuracyPercent"/.test(keys[0]), '4b: по сети уходит новое имя');
  assert(!/"aimingAmplitude"/.test(keys[0]), '4c: старое имя по сети больше не отправляется');

  const legacy = /const ONLINE_ROOM_SETTING_LEGACY_KEYS = Object\.freeze\(\{[\s\S]*?\}\);/.exec(script);
  assert(legacy, '4d: таблица прежних имён обязана существовать');
  assert(/accuracyPercent:\s*"aimingAmplitude"/.test(legacy[0]),
    '4e: для точности указано её прежнее имя');

  // Проверяем не текст, а поведение разбора пакета.
  const applyBlock = /const incoming = roomSettings\.settings \?\? \{\};[\s\S]*?\n  \}/.exec(script);
  assert(applyBlock, '4f: разбор настроек комнаты не найден');

  const run = (incomingSettings) => {
    const context = {
      ONLINE_ROOM_SETTING_KEYS: ['flightRangeCells', 'accuracyPercent'],
      ONLINE_ROOM_SETTING_LEGACY_KEYS: { accuracyPercent: 'aimingAmplitude' },
      settings: { flightRangeCells: 30, accuracyPercent: 80 },
      roomSettings: { settings: incomingSettings },
    };
    vm.createContext(context);
    vm.runInContext(applyBlock[0], context);
    return context.settings;
  };

  assert(run({ accuracyPercent: 55 }).accuracyPercent === 55,
    '4g: точность из пакета применяется');
  assert(run({ aimingAmplitude: 55 }).accuracyPercent === 55,
    '4h: пакет со СТАРЫМ именем тоже применяется — иначе гость доиграет со своей '
    + 'точностью вместо правил комнаты, и молча');
  assert(run({ accuracyPercent: 55, aimingAmplitude: 99 }).accuracyPercent === 55,
    '4i: при обоих именах побеждает нынешнее');
  assert(run({}).accuracyPercent === 80,
    '4j: чего в пакете нет — то не трогаем');
  assert(run({ flightRangeCells: 44 }).flightRangeCells === 44,
    '4k: прочие настройки комнаты по-прежнему применяются');
}

console.log('smoke-accuracy-setting-rename: OK');
