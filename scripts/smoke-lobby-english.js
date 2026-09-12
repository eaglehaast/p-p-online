#!/usr/bin/env node
'use strict';

// Smoke test: лобби говорит с игроком по-английски.
//
// Игра англоязычная: Settings, Score, Round, «cells» у самолёта, все шесть подсказок
// инвентаря. А лобби писалось по ходу разговора и получилось русским целиком — от
// «Комната создаётся…» до кнопки «Войти». На витрине вроде itch.io это выглядит так:
// человек открывает английскую игру, жмёт Online и упирается в текст на языке, которого
// не знает. Причём упирается ровно там, где ему надо позвать друга.
//
// От самой панели с тех пор ничего не осталось: лобби стало двумя состояниями меню —
// «Send link» и «Cancel» у хозяина, «Waiting…» и «Cancel» у гостя. Надписи на них
// нарисованы картинками, то есть по-английски они уже потому, что так нарисованы. Зато
// появилось новое место, где легко проговориться: подписи для экранного диктора, alt у
// картинок и единственный оставшийся текст — про поломки связи.
//
// Проверяется не перевод как таковой, а то, что игроку нигде не показывают русского.
// Комментарии и сообщения в консоль — русские, как и во всём проекте: их читаем мы.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const CYRILLIC = /[Ѐ-ӿ]/;
const source = fs.readFileSync('script.js', 'utf8');
const markup = fs.readFileSync('index.html', 'utf8');

function extractBlock(text, opener){
  const start = text.indexOf(opener);
  if(start === -1) throw new Error(`Не найдено в script.js: ${opener}`);
  const bodyStart = text.indexOf('{', start + opener.length - 1);
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец блока: ${opener}`);
}

// Строковые литералы куска кода — без комментариев и без консоли: и то и другое наше.
function textLiterals(block){
  const withoutNoise = block
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/console\.\w+\([\s\S]*?\);/g, '');
  const found = [];
  for(const match of withoutNoise.matchAll(/"([^"\\]*)"|`([^`\\]*)`/g)){
    found.push(match[1] ?? match[2]);
  }
  return found;
}

// === 1. Единственный текст, который в лобби остался, — про поломки ===
//
// Девять строк состояния из десяти ушли вместе с панелью: что соперник пришёл, видно по
// загоревшемуся «Play», а чего мы ждём — по самому экрану. Осталось то, чего глазами не
// увидеть.
{
  const troubleFn = extractBlock(source, 'function getOnlineTroubleText(');
  const lines = textLiterals(troubleFn).filter((text) => text.trim().length > 0);

  assert(lines.length >= 3,
    `1: строк про поломки найдено ${lines.length} — проверять почти нечего, разбор сломался`);
  for(const line of lines){
    assert(!CYRILLIC.test(line), `1b: игроку сообщают о поломке по-русски: «${line}»`);
  }
}

// === 2. Кнопки лобби и то, что они отправляют наружу ===
//
// У «Send link» есть текст, которого нет ни в разметке, ни в стилях: заголовок и подпись
// для системной шторки «поделиться». Их увидит не только игрок, но и тот, кому он пишет.
{
  const blocks = {
    'отправка ссылки': extractBlock(source, 'if(onlineSendLinkBtn instanceof HTMLElement){'),
    'отмена': extractBlock(source, 'if(onlineCancelBtn instanceof HTMLElement){'),
    'кнопка Online': extractBlock(source, 'if(onlineBtn instanceof HTMLElement){'),
  };
  for(const [name, block] of Object.entries(blocks)){
    for(const line of textLiterals(block)){
      assert(!CYRILLIC.test(line), `2: «${name}» говорит игроку по-русски: «${line}»`);
    }
  }
}

// === 3. Разметка пунктов лобби ===
//
// Видимого текста у них нет вовсе — надписи нарисованы. Значит вся речь к игроку тут
// прячется в атрибутах, и заметить в них русский глазами невозможно.
{
  const start = markup.indexOf('<button id="onlineSendLinkBtn"');
  assert(start !== -1, '3: пункты лобби не найдены в index.html');
  const end = markup.indexOf('<!--', markup.indexOf('id="onlineWaitingSpinner"'));
  assert(end > start, '3a: конец разметки лобби не найден');
  const кусок = markup.slice(start, end).replace(/<!--[\s\S]*?-->/g, '');

  for(const chunk of кусок.split(/<[^>]*>/)){
    const text = chunk.trim();
    if(!text) continue;
    assert(!CYRILLIC.test(text), `3b: на экране написано по-русски: «${text}»`);
  }
  for(const match of кусок.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*)"/g)){
    assert(!CYRILLIC.test(match[1]),
      `3c: подпись «${match[1]}» по-русски — её читает игроку экранный диктор`);
  }
}

// === 4. Проверять было что ===
//
// Три проверки выше устроены так, что пустой разбор их не роняет: не нашли строк — не
// нашли и русского. Поэтому отдельно убеждаемся, что живой текст лобби действительно
// прочитан.
{
  const start = markup.indexOf('<button id="onlineSendLinkBtn"');
  const кусок = markup.slice(start, markup.indexOf('<!--', markup.indexOf('id="onlineWaitingSpinner"')));
  assert(/aria-label="Send link"/.test(кусок) && /aria-label="Cancel"/.test(кусок),
    '4: разметка лобби прочитана целиком (обе кнопки на месте)');
  assert(/alt="Waiting for the host to start"/.test(кусок),
    '4b: экран ожидания прочитан');

  const troubleFn = extractBlock(source, 'function getOnlineTroubleText(');
  assert(/Connection lost/.test(troubleFn), '4c: строки про поломки прочитаны');
}

console.log('smoke-lobby-english: OK');
