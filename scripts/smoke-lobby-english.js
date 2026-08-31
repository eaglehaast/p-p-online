#!/usr/bin/env node
'use strict';

// Smoke test: лобби говорит с игроком по-английски.
//
// Игра англоязычная: Settings, Score, Round, «cells» у самолёта, все шесть подсказок
// инвентаря. А лобби писалось по ходу разговора и получилось русским целиком — от
// «Комната создаётся…» до кнопки «Войти». На витрине вроде itch.io это выглядит так:
// человек открывает английскую игру, жмёт Online и упирается в панель на языке, которого
// не знает. Причём упирается ровно в том месте, где ему надо позвать друга.
//
// Проверяется не перевод как таковой, а то, что в ЛОБЛИ не осталось русского текста,
// который увидит игрок. Комментарии в коде и сообщения в консоль — русские, как и во всём
// проекте: их читаем мы, а не игрок, и трогать их незачем.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const CYRILLIC = /[Ѐ-ӿ]/;

const source = fs.readFileSync('script.js', 'utf8');
const markup = fs.readFileSync('index.html', 'utf8');

// Кусок кода от метки до её закрывающей скобки.
function extractBlock(text, marker){
  const start = text.indexOf(marker);
  if(start === -1) throw new Error(`Не найдено в script.js: ${marker}`);
  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец блока: ${marker}`);
}

// Строковые литералы без комментариев: комментарии у нас русские везде, и ловить надо не
// их, а то, что попадает на экран.
function textLiterals(code){
  const withoutComments = code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const found = [];
  for(const match of withoutComments.matchAll(/"([^"\\]*)"|`([^`\\]*)`/g)){
    found.push(match[1] ?? match[2]);
  }
  return found;
}

// === 1. Строки состояния лобби ===
{
  const statusFn = extractBlock(source, 'function getOnlineLobbyStatusText(');
  const lines = textLiterals(statusFn).filter((text) => text.trim().length > 0);

  assert(lines.length >= 6,
    `1: строк состояния найдено ${lines.length} — проверять почти нечего, разбор сломался`);
  for(const line of lines){
    assert(!CYRILLIC.test(line), `1b: строка состояния по-русски: «${line}»`);
  }
}

// === 2. Кнопки лобби и то, что они говорят в ответ ===
//
// Ответы кнопок живут не в разметке, а в коде: «Copied» после копирования, жалоба на
// непонятый код. Их легко перевести в разметке и забыть здесь.
{
  const blocks = {
    'вход по коду': extractBlock(source, 'if(onlineLobbyJoinBtn instanceof HTMLElement){'),
    'копирование ссылки': extractBlock(source, 'if(onlineLobbyCopyBtn instanceof HTMLElement){'),
    'кнопка Online': extractBlock(source, 'if(onlineBtn instanceof HTMLElement){'),
  };
  for(const [name, block] of Object.entries(blocks)){
    for(const line of textLiterals(block)){
      assert(!CYRILLIC.test(line), `2: «${name}» отвечает игроку по-русски: «${line}»`);
    }
  }
}

// === 3. Разметка лобби ===
{
  const start = markup.indexOf('<div id="onlineLobby"');
  assert(start !== -1, '3: панель лобби не найдена в index.html');
  const end = markup.indexOf('</div>', markup.indexOf('online-lobby__link--join'));
  const panel = markup.slice(start, end).replace(/<!--[\s\S]*?-->/g, '');

  // Текст между тегами — то, что написано на панели и на кнопках.
  for(const chunk of panel.split(/<[^>]*>/)){
    const text = chunk.trim();
    if(!text) continue;
    assert(!CYRILLIC.test(text), `3b: на панели написано по-русски: «${text}»`);
  }

  // Подписи для экранного диктора и подсказка в пустом поле — тоже речь к игроку,
  // просто её не видно, пока не понадобится.
  for(const match of panel.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*)"/g)){
    assert(!CYRILLIC.test(match[1]),
      `3c: подпись «${match[1]}» по-русски — её читает игроку экранный диктор`);
  }
}

// === 4. Проверять было что ===
//
// Три проверки выше устроены так, что пустой разбор их не роняет: не нашли строк — не
// нашли и русского. Поэтому отдельно убеждаемся, что живой текст лобби действительно
// прочитан, иначе тест зеленел бы, даже перестав что-либо видеть.
{
  const panel = markup.slice(markup.indexOf('<div id="onlineLobby"'),
                             markup.indexOf('</div>', markup.indexOf('online-lobby__link--join')));
  assert(/Copy link/.test(panel) && /Join/.test(panel),
    '4: разметка лобби прочитана целиком (кнопки на месте)');

  const statusFn = extractBlock(source, 'function getOnlineLobbyStatusText(');
  assert(/Hit Play/.test(statusFn), '4b: строки состояния прочитаны');
}

console.log('smoke-lobby-english: OK');
