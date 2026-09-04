#!/usr/bin/env node
'use strict';

// Smoke test: шрифты лежат рядом с игрой, а не на чужом домене.
//
// В index.html и settings.html стояла ссылка на fonts.googleapis.com. Это таблица стилей
// с чужого домена, и она render-blocking: браузер не выполнит ни одного скрипта, пока её
// не получит. Пока хост отвечает — незаметно. Когда он отвечает долго (в РФ обычное дело),
// вместе с ним ждёт запуск ВСЕЙ игры. Замер с висящим доменом:
//
//   было:  DOMContentLoaded 20162 мс │ игра доступна 20393 мс
//   стало: DOMContentLoaded   277 мс │ игра доступна   519 мс │ обращений к Google: 0
//
// Ничего не подбиралось «на похожее»: в fonts/ лежат ТЕ ЖЕ woff2, что отдавал Google, и
// правила @font-face повторяют его собственные — с теми же unicode-range. Проверка после
// правки: ширины текста в трёх семействах совпали до третьего знака, снимок образца
// разошёлся на 55 пикселей из 288 900 при том, что два прогона ОДНОГО И ТОГО ЖЕ кода
// расходятся на 53 — то есть на уровне шума сглаживания.
//
// Главная ловушка, которую этот тест и стережёт: подмножеств у Google девятнадцать, и
// соблазн взять «только нужные» велик. Но ▸ ✓ ✎ → ≥ приезжают из подмножеств Roboto
// symbols и math, которые по названию кажутся лишними. Выкинь их — и символы в интерфейсе
// молча поедут на системный шрифт.

const fs = require('fs');
const path = require('path');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const styles = fs.readFileSync('styles.css', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const settingsHtml = fs.readFileSync('settings.html', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

// === 1. ГЛАВНОЕ: чужого домена в загрузке страницы нет ===
{
  // В самих стилях чужой домен назван в объяснении, почему его там больше нет. Ищем
  // настоящие обращения, а не рассказ о них.
  const stylesCode = styles.replace(/\/\*[\s\S]*?\*\//g, '');

  for(const [name, source] of [['index.html', indexHtml], ['settings.html', settingsHtml], ['styles.css', stylesCode]]){
    assert(!/fonts\.googleapis\.com/.test(source),
      `1: ${name} снова тянет таблицу стилей с fonts.googleapis.com — это render-blocking `
      + 'запрос к чужому домену, и запуск игры встанет вместе с ним');
    assert(!/fonts\.gstatic\.com/.test(source),
      `1b: ${name} снова тянет файлы шрифтов с fonts.gstatic.com`);
  }

  // Обе страницы подключают styles.css — значит правила @font-face достаточно держать там,
  // и лишнего запроса не появляется вовсе.
  for(const [name, source] of [['index.html', indexHtml], ['settings.html', settingsHtml]]){
    assert(/<link rel="stylesheet" href="styles\.css"/.test(source),
      `1c: ${name} перестал подключать styles.css — вместе с ним отвалятся и шрифты`);
  }
}

// === 2. Каждое правило указывает на существующий файл, и это настоящий woff2 ===
const faces = [];
{
  const re = /@font-face \{([\s\S]*?)\}/g;
  let m;
  while((m = re.exec(styles))){
    const block = m[1];
    const family = /font-family: '([^']+)'/.exec(block);
    const src = /src: url\('([^']+)'\)/.exec(block);
    const range = /unicode-range: ([^;]+);/.exec(block);
    assert(family, `2: у правила @font-face нет семейства:\n${block}`);
    // В стилях есть и правило только с local(): оно подхватывает шрифт, если он стоит в
    // системе, и файла у него нет по замыслу. Такие пропускаем — проверять там нечего.
    if(!src) continue;
    faces.push({
      family: family[1],
      file: src[1],
      ranges: range ? range[1].split(',').map(s => s.trim()) : [],
      block
    });
  }

  assert(faces.length > 0, '2b: правил @font-face не осталось вовсе — шрифтов у игры нет');

  for(const face of faces){
    assert(fs.existsSync(face.file),
      `2c: ${face.family} ссылается на ${face.file}, а такого файла нет`);
    const head = Buffer.alloc(4);
    const fd = fs.openSync(face.file, 'r');
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    assert(head.toString('latin1') === 'wOF2',
      `2d: ${face.file} не woff2 — вместо шрифта скачалась страница с ошибкой?`);
    assert(fs.statSync(face.file).size > 2000,
      `2e: ${face.file} подозрительно мал (${fs.statSync(face.file).size} байт)`);
  }

  // Файлы в папке и правила в стилях не должны расходиться: лишний файл — это мусор,
  // которого никто не грузит.
  const listed = new Set(faces.map(f => path.basename(f.file)));
  for(const name of fs.readdirSync('fonts').filter(n => n.endsWith('.woff2'))){
    assert(listed.has(name), `2f: fonts/${name} лежит, но ни одно правило на него не ссылается`);
  }
}

// === 3. Семейства, которые раньше приезжали от Google, объявлены все три ===
{
  const declared = new Set(faces.map(f => f.family));
  for(const family of ['Inter', 'Patrick Hand', 'Roboto']){
    assert(declared.has(family),
      `3: семейство ${family} больше не объявлено — текст поедет на системный шрифт`);
  }

  // Эти же имена стоят в стилях и в надписях на холсте. Если семейство исчезнет, а имя
  // останется, поедет молча: холст просто нарисует запасным шрифтом.
  assert(/font-family: 'Patrick Hand'/.test(styles) || /'Patrick Hand'/.test(styles),
    '3b: Patrick Hand пропал из стилей');
  assert(/'Patrick Hand', cursive/.test(script),
    '3c: надписи на холсте больше не просят Patrick Hand — проверка устарела, обнови её');
}

// === 4. ГЛАВНАЯ ЛОВУШКА: символы интерфейса покрыты ===
//
// ▸ ✓ ✎ → ≥ лежат в подмножествах Roboto symbols и math. Их легко принять за ненужные.
{
  const inRange = (cp, range) => {
    const m = /^U\+([0-9A-Fa-f]+)(?:-([0-9A-Fa-f]+))?$/.exec(range);
    if(!m) return false;
    const from = parseInt(m[1], 16);
    const to = m[2] ? parseInt(m[2], 16) : from;
    return cp >= from && cp <= to;
  };

  const covered = (family, ch) => faces.some(f => f.family === family
    && f.ranges.some(r => inRange(ch.codePointAt(0), r)));

  for(const ch of ['▸', '✓', '✎', '→', '≥']){
    assert(covered('Roboto', ch),
      `4: символ ${ch} не покрыт ни одним подмножеством Roboto — в интерфейсе он поедет `
      + 'на системный шрифт; именно за это отвечают подмножества symbols и math');
  }

  // Кириллица в игре есть — панель карт и редактор.
  for(const family of ['Inter', 'Roboto']){
    assert(covered(family, 'К') && covered(family, 'я'),
      `4b: кириллица не покрыта для ${family}, а в интерфейсе она есть`);
  }
  // Латиница и типографские знаки — везде.
  for(const family of ['Inter', 'Patrick Hand', 'Roboto']){
    assert(covered(family, 'W') && covered(family, '—') && covered(family, '…'),
      `4c: базовая латиница или типографика не покрыты для ${family}`);
  }
}

// === 5. Текст не прячется, пока шрифт едет ===
//
// Без font-display: swap браузер до трёх секунд показывает пустоту вместо надписей.
{
  for(const face of faces){
    assert(/font-display: swap;/.test(face.block),
      `5: у правила для ${face.family} (${face.file}) нет font-display: swap`);
  }
}

// === 6. Лицензии лежат рядом ===
//
// Все три семейства под SIL Open Font License 1.1. Она разрешает размещать шрифты у себя,
// но требует, чтобы текст лицензии ехал вместе с ними.
{
  for(const file of ['fonts/OFL-Inter.txt', 'fonts/OFL-PatrickHand.txt', 'fonts/OFL-Roboto.txt']){
    assert(fs.existsSync(file), `6: нет файла лицензии ${file}`);
    const text = fs.readFileSync(file, 'utf8');
    assert(/SIL OPEN FONT LICENSE Version 1\.1/.test(text),
      `6b: ${file} не похож на текст OFL 1.1`);
  }
}

console.log('smoke-fonts-are-local: OK');
