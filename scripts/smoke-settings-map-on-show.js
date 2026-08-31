#!/usr/bin/env node
'use strict';

// Smoke test: панель настроек при показе перечитывает карту — и подписью, и картинкой.
//
// Кнопка «Advanced Settings» первым делом зовёт loadSettings(), а та достаёт из
// localStorage карту, выбранную в прошлый раз (script.js). Панель показывается уже ПОСЛЕ
// этого. Значит всё, что она рисует, обязано читаться в момент показа, а не остаться от
// загрузки страницы.
//
// Раньше так делала только картинка: холст с кирпичами читает settings.mapIndex прямо
// при отрисовке. Подпись же оставалась от той минуты, когда страницу открыли, и панель
// расходилась сама с собой: написано «random», нарисовано другое поле, а игра грузила
// третье. Разошлись они молча — по экрану видно только, что подпись и картинка не про
// одно и то же.
//
// Проверяется здесь не текст, а источник: обе половины панели обязаны читать ОДНУ
// настройку и обязаны перечитывать её на каждом показе.

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

const settings = fs.readFileSync('settings.js', 'utf8');
const game = fs.readFileSync('script.js', 'utf8');

// === 1. Показ панели перечитывает карту ===
{
  const onShow = extractFunctionSource(settings, 'handleSettingsLayerShow');

  assert(/syncFieldSelectorState\(\)/.test(onShow),
    '1: при показе панели подпись карты перечитывается заново');
  assert(/updateMapPreviewIndex\(sharedSettings\.mapIndex, \{ force: true \}\)/.test(onShow),
    '1b: и картинка тоже — принудительно, иначе перерисовку пропустят');

  // Обе строки должны стоять после включения признака активности: и перерисовка
  // картинки, и запуск превью молча выходят, пока панель считается закрытой.
  assert(onShow.indexOf('isSettingsActive = true') < onShow.indexOf('syncFieldSelectorState()'),
    '1c: перечитывание идёт после того, как панель отмечена активной');
}

// === 2. «force» действительно обходит пропуск перерисовки ===
//
// Без этого пункт 1b был бы обманом: вызов есть, а рисования нет. Индекс между двумя
// показами часто совпадает с прошлым показанным — например, панель просто открыли второй
// раз, — и обычная проверка «тот же индекс, рисовать нечего» пропустила бы перерисовку,
// хотя карта под этим индексом успела смениться.
{
  const update = extractFunctionSource(settings, 'updateMapPreviewIndex');
  assert(/if\(!force && lastPreviewMapIndex === resolvedIndex\)/.test(update),
    '2: пропуск перерисовки отключается флагом force');
  assert(/force = false/.test(update),
    '2b: по умолчанию force выключен — обычные вызовы работают как раньше');
}

// === 3. Подпись и картинка читают ОДНУ настройку ===
//
// Главное. Пока источник один, они не могут разойтись; два источника разойдутся рано или
// поздно, и именно это и случилось.
{
  const labels = extractFunctionSource(settings, 'syncFieldSelectorLabels');
  assert(/const resolvedIndex = sharedSettings\.mapIndex;/.test(labels),
    '3: подпись берёт карту из sharedSettings.mapIndex');

  const bricks = extractFunctionSource(settings, 'drawMapPreviewBricks');
  assert(/MAPS\[sharedSettings\.mapIndex\]/.test(bricks),
    '3b: кирпичи берут карту оттуда же');

  const preview = extractFunctionSource(settings, 'updateMapPreview');
  assert(/const map = MAPS\[sharedSettings\.mapIndex\];/.test(preview),
    '3c: и признак «случайная карта» — оттуда же');
}

// === 4. Настройка успевает восстановиться до показа ===
//
// Порядок в обработчике кнопки: сначала loadSettings(), потом показ панели. Если однажды
// их поменяют местами, панель снова будет показывать карту, которой уже нет.
{
  const start = game.indexOf('if(advancedSettingsBtn){');
  assert(start !== -1, '4: обработчик кнопки Advanced Settings не найден');
  const handler = game.slice(start, game.indexOf('\n}\n', start));

  assert(/loadSettings\(\);/.test(handler), '4b: обработчик восстанавливает настройки');
  assert(/showSettingsLayer\(\)/.test(handler), '4c: и показывает панель');
  assert(handler.indexOf('loadSettings();') < handler.indexOf('showSettingsLayer()'),
    '4d: настройки восстанавливаются ДО показа панели, иначе панель покажет прошлое');
}

console.log('smoke-settings-map-on-show: OK');
