#!/usr/bin/env node
'use strict';

// Smoke test: когда список карт не доехал, игрок видит это в самой игре.
//
// Список карт — единственный файл, без которого игра не запускается. Всё остальное она
// переживает: проверено в браузере, с оборванной загрузкой по одному файлу за раз.
//
//   нет фона игрового экрана     запускается
//   нет одного кадра взрыва      запускается
//   нет всех шрифтов             запускается
//   нет одной карты              запускается
//   нет settings.js              запускается
//   НЕТ manifest.json            НЕ запускается
//
// Игра и раньше об этом сообщала, но плохо, и ровно тремя способами сразу:
//
//   1. Двумя окнами alert подряд — одно при загрузке страницы, второе на каждое нажатие
//      Play. Одна беда, два разных текста.
//   2. По-русски, хотя весь интерфейс английский.
//   3. Словами для разработчика: «Проверьте manifest.json и JSON-файлы карт». Игроку это
//      не говорит ни что случилось, ни что делать.
//
// И кнопка Play при этом оставалась живой: нажать можно сколько угодно раз, каждый раз
// получая окно и оставаясь в меню.
//
// Теперь это панель в самом меню — одна, по-английски, с кнопкой Reload, а Play погашена.
// Панель, а не alert, ещё и потому, что игру открывают внутри рамки на чужой странице
// (itch.io) и как мини-приложение телеграма: там модальное окно браузера могут не
// показать вовсе, и тогда игрок остался бы совсем без объяснения.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

function stripComments(source){
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

const code = stripComments(script);
const markup = stripComments(indexHtml);

// === 1. ГЛАВНОЕ: сообщение живёт в странице, а не в модальном окне ===
{
  const notice = /<div id="mapsErrorNotice"[\s\S]*?<\/div>\s*<\/div>/.exec(markup);
  assert(notice, '1: в меню нет панели про несработавшую загрузку карт');

  assert(/\shidden\b/.test(notice[0]),
    '1b: панель не скрыта по умолчанию — она будет висеть в исправной игре');
  assert(/role="alert"/.test(notice[0]),
    '1c: у панели нет role="alert" — читалка промолчит о том, что игра сломалась');
  assert(/id="mapsErrorNoticeReload"/.test(notice[0]),
    '1d: с панели пропала кнопка Reload, а перезагрузка — это и есть починка');

  // Про alert: их в коде игры остаётся два, оба в редакторе карт, и оба про спрайты.
  // Ни один не должен снова заговорить про карты.
  for(const m of code.match(/alert\((?:'|"|\[)[^\n]*/g) || []){
    assert(!/карт|maps|manifest/i.test(m),
      `1e: про карты снова говорят модальным окном: ${m.slice(0, 80)}`);
  }
}

// === 2. Текст написан игроку, а не разработчику ===
{
  const text = /<p id="mapsErrorNoticeText"[^>]*>([\s\S]*?)<\/p>/.exec(markup);
  assert(text, '2: у панели нет текста');
  const message = text[1].trim();

  assert(!/[а-яА-ЯёЁ]/.test(message),
    `2b: сообщение по-русски, а интерфейс английский: «${message}»`);
  assert(!/manifest|\.json|ui_gamescreen|JSON/i.test(message),
    `2c: игроку показывают внутренние имена файлов: «${message}»`);
  assert(/reload|refresh|connection/i.test(message),
    `2d: сообщение не говорит, что делать: «${message}»`);
  assert(message.length >= 25 && message.length <= 160,
    `2e: длина сообщения ${message.length} — либо не объясняет, либо не читается`);

  assert(/#menuLayer #modeMenu \.menu-notice \{/.test(styles),
    '2f: панель не оформлена — покажется голым текстом поверх меню');
  assert(/#menuLayer #modeMenu \.menu-notice\[hidden\] \{ display: none; \}/.test(styles),
    '2g: у панели нет правила для hidden — она может остаться видимой');
}

// === 3. Одно место решает, и оно срабатывает один раз ===
//
// Два alert подряд получились именно потому, что решали два места по отдельности.
{
  const fn = /function showMapsUnavailableNotice\(reason\)\{[\s\S]*?\n\}/.exec(code);
  assert(fn, '3: не найдено общее место, которое показывает панель');
  assert(/if\(mapsUnavailable\) return;/.test(fn[0]),
    '3b: показ не защищён от повтора — сообщение выстрелит на каждое нажатие');
  assert(/mapsErrorNotice\.hidden = false/.test(fn[0]),
    '3c: панель не показывается');

  const calls = code.match(/showMapsUnavailableNotice\(/g) || [];
  assert(calls.length >= 3,
    `3d: показ зовут ${calls.length - 1} раз вместо двух (загрузка и нажатие Play) — `
    + 'какой-то из путей снова остался без сообщения');
  assert(/showMapsUnavailableNotice\('bootstrap'\)/.test(code),
    '3e: при загрузке страницы про отказ больше не сообщают');
  assert(/showMapsUnavailableNotice\('match-start'\)/.test(code),
    '3f: при нажатии Play про отказ больше не сообщают');
}

// === 4. Кнопка Play гаснет, а не обманывает ===
//
// Живая кнопка, которая ничего не делает, — худшее из состояний: игрок думает, что
// сломался он.
{
  const sync = /function syncPlayButtonSkin\(isReady\)\{[\s\S]*?\n\}/.exec(code);
  assert(sync, '4: не найдено место, где решается доступность Play');
  assert(/if\(ready && mapsUnavailable\) ready = false;/.test(sync[0]),
    '4b: доступность Play не смотрит на то, приехали ли карты');

  // Флаг, а не MAPS.length на месте: пока список едет, он пуст совершенно законно.
  assert(/let mapsUnavailable = false;/.test(code),
    '4c: признак «карты не приехали» больше не отдельный флаг. Проверять MAPS.length '
    + 'напрямую нельзя: пока список едет по сети, он пуст, и кнопка гасла бы на ровном месте');

  assert(/mapsErrorNoticeReloadBtn\.addEventListener\("click", \(\) => \{\s*window\.location\.reload\(\);/.test(script),
    '4d: кнопка Reload ничего не перезагружает');
}

console.log('smoke-maps-failure-is-visible: OK');
