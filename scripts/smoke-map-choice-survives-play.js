#!/usr/bin/env node
'use strict';

// Smoke test: выбранная игроком карта переживает игру, а случайная — не переживает.
//
// Это две РАЗНЫЕ вещи, и до сих пор они делили один ключ в хранилище:
//
//   * что человек выбрал в панели настроек — предпочтение, должно жить между запусками;
//   * на чём играем прямо сейчас — временное, живёт до конца раунда.
//
// Побеждало временное. Функция с именем setMapIndexAndPersist писала в хранилище каждый
// случайный бросок, а бросают его все: сброс партии, кнопка классических правил, начало
// каждого раунда. Выбор игрока умирал от одного клика по «Classic Rules», ещё до партии.
//
// Но и просто перестать писать нельзя: та запись оказалась несущей. startNewRound()
// перечитывает настройки из хранилища в начале КАЖДОГО раунда, и без записи он возвращал
// туда предпочтение игрока — шесть партий подряд шли на одной и той же карте, хотя
// классические правила обязаны давать случайную. Поэтому проверок здесь две, и они тянут
// в разные стороны: убери любую — вторая сломается незаметно.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Функция не найдена: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции: ${fnName}`);
}

const game = fs.readFileSync('script.js', 'utf8');
const settings = fs.readFileSync('settings.js', 'utf8');

// === 1. Случайный бросок в хранилище не уезжает ===
{
  const setter = extractFunctionSource(game, 'setCurrentMapIndex');
  assert(/persist: false/.test(setter),
    '1: карта текущей партии ставится без записи в хранилище');
  assert(!/persist: true/.test(setter),
    '1b: и записи там нет вовсе — иначе бросок затрёт выбор игрока');

  // Имя тоже часть защиты: пока функция звалась «...AndPersist», каждый её вызов выглядел
  // законным сохранением, и никто не замечал, что сохранять там нечего.
  assert(!/setMapIndexAndPersist/.test(game),
    '1c: старого имени не осталось — оно называло запись, которой быть не должно');
}

// === 2. Все случайные броски идут через этот путь ===
//
// Достаточно одного вызова в обход — и выбор игрока снова начнёт умирать, причём только
// в одном сценарии из нескольких, что искать тяжелее всего.
{
  const draws = game.match(/setCurrentMapIndex\(/g) || [];
  assert(draws.length >= 4,
    `2: броски карты идут через общий путь (нашлось ${draws.length})`);

  // Прямая запись мимо него разрешена ровно в одном месте — панели настроек, где человек
  // и выражает свой выбор. Она живёт в settings.js.
  const directPersists = (game.match(/setMapIndex\([^)]*persist:\s*true/g) || []);
  assert(directPersists.length === 0,
    `2b: в игре никто не пишет карту в хранилище напрямую (нашлось ${directPersists.length})`);
  assert(/setMapIndex\(sharedSettings\.mapIndex, \{ persist: true \}\)/.test(settings),
    '2c: сохраняет выбор только панель настроек');
}

// === 3. ГЛАВНОЕ: перечитывание настроек не меняет карту, которая уже на поле ===
//
// Здесь ломается всё остальное. loadSettings() достаёт из хранилища предпочтение игрока,
// а зовут его в начале каждого раунда — и без этой защиты выпавшая карта заменяется
// предпочтением, то есть случайные правила перестают быть случайными.
{
  const forRuleset = extractFunctionSource(game, 'loadSettingsForRuleset');

  assert(/const mapIndexInPlay = settings\.mapIndex;/.test(forRuleset),
    '3: карта на поле запоминается перед перечитыванием настроек');
  assert(/settingsBridge\.setMapIndex\(mapIndexInPlay, \{ persist: false \}\)/.test(forRuleset),
    '3b: и возвращается после — без записи в хранилище');
  // Порядок считаем по КОДУ: в пояснениях выше те же имена упомянуты словами, и без
  // очистки проверка меряла бы расстояние между комментариями.
  const code = forRuleset.replace(/\/\/.*$/gm, '');
  assert(code.indexOf('const mapIndexInPlay') < code.indexOf('loadSettings()')
      && code.indexOf('loadSettings()') < code.indexOf('setMapIndex(mapIndexInPlay'),
    '3c: порядок именно такой: запомнили → перечитали → вернули');

  // Редактор и тестер карт ставят свою карту сами, и их строки обязаны идти ПОСЛЕ
  // возврата: иначе возврат перекроет их выбор.
  const restoreAt = forRuleset.indexOf('setMapIndex(mapIndexInPlay');
  const editorAt = forRuleset.indexOf('getMapEditorReworkMapIndex');
  if(editorAt !== -1){
    assert(restoreAt < editorAt,
      '3d: редактор карт ставит свою карту после возврата, а не до');
  }
}

// === 4. Начало раунда действительно проходит через эту дверь ===
//
// Без этого пункт 3 охранял бы функцию, которую никто не зовёт.
{
  const round = extractFunctionSource(game, 'startNewRound');
  assert(/loadSettingsForRuleset\(/.test(round),
    '4: начало раунда перечитывает настройки именно через эту функцию');
}

console.log('smoke-map-choice-survives-play: OK');
