#!/usr/bin/env node
'use strict';

// Smoke test: в обычной игре консоль молчит, а по просьбе — рассказывает всё.
//
// Игра печатала 661 строку к началу партии, из них 451 — ещё до того, как меню станет
// доступным: по две на каждый загруженный файл, а файлов у неё под три сотни.
//
//   [IMG]      428
//   [asset]    214
//   остальное   19
//
// Беда не в самих строках, а в том, что в этом потоке не разглядеть предупреждение — а
// именно за ним в консоль и заходят, когда у игрока что-то не работает. Плюс три
// подсистемы представлялись в продакшене с инструкцией, что у них можно вызвать
// (`[MINE_DEBUG] ready. Try: ...`).
//
// Замер в браузере после правки:
//
//                              было    стало   с ?debug=1
//   до появления меню           451       6        550
//   всего к началу партии       661      16        660
//
// Выключатель один на всё подробное и включается двумя способами: ?debug=1 в адресе — на
// один заход, чтобы попросить игрока прислать снимок консоли; тот же ?debug=1 запоминается
// в localStorage и переживает перезагрузку, а ?debug=0 его снимает. Проверено в браузере
// всеми четырьмя переходами, и отдельно — приватный режим, где хранилище бросает
// исключение: флаг из адреса работает, ошибок нет.
//
// Предупреждения и ошибки НЕ трогали и трогать нельзя: ради них всё и делалось.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');

function stripComments(source){
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const code = stripComments(script);

// === 1. ГЛАВНОЕ: подробное по умолчанию молчит ===
{
  assert(!/const DEBUG_ASSETS = true;/.test(code),
    '1: выключатель подробных логов снова заколочен во включённом положении — игра будет '
    + 'печатать сотни строк на каждом запуске');
  assert(/const DEBUG_ASSETS = readVerboseLoggingFlag\(\);/.test(code),
    '1b: DEBUG_ASSETS больше не читает флаг — проверка устарела');

  const reader = /function readVerboseLoggingFlag\(\)\{[\s\S]*?\n\}/.exec(code);
  assert(reader, '1c: не найдено чтение флага подробных логов');
  assert(/get\("debug"\)/.test(reader[0]),
    '1d: флаг больше не включается через ?debug= в адресе');
  assert(/return fromQuery === true;/.test(reader[0]),
    '1e: без флага и без хранилища подробные логи обязаны быть выключены');
}

// === 2. Шумные логи ходят через выключатель ===
//
// Их две пачки, и обе печатались на каждый файл: одна из отслеживания загрузки картинок,
// вторая из учёта повторных запросов.
{
  const gated = [
    ['[IMG] pending', 'ожидание картинки'],
    ['[IMG] load', 'загрузка картинки'],
    ['[asset][create]', 'создание картинки'],
    ['[asset][summary]', 'итог по картинкам'],
  ];
  for(const [tag, what] of gated){
    const escaped = tag.replace(/[[\]]/g, '\\$&');
    const direct = new RegExp(`console\\.log\\(\\s*["'\`]${escaped}`).exec(code);
    assert(!direct,
      `2: ${what} снова печатается напрямую (${tag}) — это строка на каждый файл, а файлов `
      + 'почти три сотни');
    assert(new RegExp(`debugLog\\(\\s*["'\`]${escaped}`).test(code),
      `2b: ${what} (${tag}) больше не печатается даже по просьбе — с ?debug=1 смотреть будет нечего`);
  }

  // Подсистемы больше не представляются в продакшене с инструкцией по применению.
  for(const banner of ['INVENTORY_TOOLTIP_DEBUG', 'MINE_DEBUG', 'EXPLOSION_DEBUG']){
    const at = code.indexOf(`[${banner}] ready.`);
    assert(at > 0, `2c: не найдено представление ${banner} — проверка устарела`);
    const before = code.slice(Math.max(0, at - 60), at);
    assert(/debugInfo\(/.test(before),
      `2d: ${banner} снова объявляет о себе в обычной игре, да ещё с перечнем команд`);
  }
}

// === 3. Сам выключатель действительно выключает ===
{
  for(const [fn, method] of [['debugLog', 'log'], ['debugInfo', 'info']]){
    const body = new RegExp(`function ${fn}\\(\\.\\.\\.args\\)\\{[\\s\\S]*?\\n\\}`).exec(code);
    assert(body, `3: не найдено ${fn}`);
    assert(new RegExp(`if\\(DEBUG_ASSETS\\) console\\.${method}\\(\\.\\.\\.args\\);`).test(body[0]),
      `3b: ${fn} печатает мимо выключателя — тогда он ничего не выключает`);
  }
}

// === 4. Предупреждения и ошибки НЕ приглушены ===
//
// Ради них всё и делалось: тихая консоль нужна, чтобы в ней было ВИДНО настоящую беду.
{
  assert(!/function debugWarn\(|function debugError\(/.test(code),
    '4: завели приглушённые предупреждения. Их приглушать нельзя — тихая консоль нужна '
    + 'ровно для того, чтобы предупреждение было заметно');

  // Спорные места — те же самые пути загрузки, где рядом стоят приглушённые логи.
  const loud = [
    ['[IMG] error', 'картинка не загрузилась'],
    ['[IMG] timeout', 'картинка не пришла вовремя'],
    ['[asset][stuck]', 'загрузка застряла'],
    ['[asset][error]', 'ошибка загрузки'],
  ];
  for(const [tag, what] of loud){
    const escaped = tag.replace(/[[\]]/g, '\\$&');
    assert(new RegExp(`console\\.warn\\(\\s*["'\`]${escaped}`).test(code),
      `4b: «${what}» (${tag}) больше не предупреждение — заодно приглушили и его`);
  }

  const warns = (code.match(/console\.warn\(/g) || []).length;
  const errors = (code.match(/console\.error\(/g) || []).length;
  assert(warns >= 60 && errors >= 8,
    `4c: предупреждений ${warns}, ошибок ${errors} — их стало заметно меньше, проверь, что `
    + 'вместе с шумом не убрали и полезное');
}

// === 5. Запрет на localStorage не роняет игру ===
//
// Приватный режим и браузеры с запретом на хранилище: обращение там БРОСАЕТ исключение,
// а не возвращает пустоту. Без обёртки игра падала бы на первой же строке.
{
  const reader = /function readVerboseLoggingFlag\(\)\{[\s\S]*?\n\}/.exec(code);
  const tries = (reader[0].match(/try \{/g) || []).length;
  assert(tries >= 2,
    '5: чтение флага не обёрнуто в try/catch. И разбор адреса, и хранилище умеют бросать '
    + 'исключение, а это самая первая строка запуска');
  assert(/catch\(_error\)\{[\s\S]{0,200}\}\s*\n\s*return fromQuery === true;/.test(reader[0]),
    '5b: после отказа хранилища флаг из адреса перестал работать');
}

console.log('smoke-console-is-quiet: OK');
