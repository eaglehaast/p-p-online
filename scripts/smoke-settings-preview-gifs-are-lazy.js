#!/usr/bin/env node
'use strict';

// Smoke test: гифки превью в настройках не грузятся, пока панель не открыли.
//
// Три анимации показывают, как выглядят груз, флаги и аркада. Все три лежат внутри
// скрытого #settingsMenu и весят вместе около полумегабайта:
//
//   cp_cargo on_gif.gif   460 КБ   второй по весу файл во всей игре
//   cp_flags_on.gif        27 КБ
//   cp_arcade_on2.gif      16 КБ
//
// Раньше путь стоял в атрибуте src, поэтому браузер качал их при разборе страницы — на
// каждом запуске, даже если игрок в настройки не заходил ни разу, и в самый неудачный
// момент: одновременно с кодом игры, на который и уходит всё ожидание.
//
// Замер на 600 кбит/с с задержкой 300 мс (со сжатием, как отдаёт GitHub Pages):
//
//                          было      стало
//   меню доступно          24.5 с    19.8 с
//   страница догрузилась   66.2 с    60.0 с
//   всего скачано          4.46 МБ   3.98 МБ
//
// Ленивость сделана НЕ через loading="lazy": браузеры решают сами, что считать «скоро
// понадобится», и на скрытом блоке это поведение не гарантировано. Здесь момент задан
// явно — панель открыли, значит пора.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const settings = fs.readFileSync('settings.js', 'utf8');
const pages = [['index.html', fs.readFileSync('index.html', 'utf8')],
               ['settings.html', fs.readFileSync('settings.html', 'utf8')]];

function stripComments(source){
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

const PREVIEWS = [
  ['cargo_preview_on', 'ui_controlpanel/cp_adds/cp_cargo on_gif.gif'],
  ['flags_preview_on', 'ui_controlpanel/cp_adds/cp_flags_on.gif'],
  ['arcade_preview_gif', 'ui_controlpanel/cp_adds/cp_arcade_on2.gif'],
];

// === 1. ГЛАВНОЕ: ни одна гифка превью не стоит в src разметки ===
{
  for(const [name, page] of pages){
    const markup = stripComments(page);
    for(const [id, path] of PREVIEWS){
      const at = markup.indexOf(`id="${id}"`);
      assert(at !== -1, `1: в ${name} не найден ${id} — проверка устарела`);
      const tag = markup.slice(markup.lastIndexOf('<img', at), markup.indexOf('/>', at) + 2);

      assert(!/\ssrc=/.test(tag),
        `1b: у ${id} в ${name} снова есть src — браузер начнёт качать гифку при разборе `
        + 'страницы, то есть на каждом запуске игры, даже если в настройки никто не зайдёт');
      assert(tag.includes(`data-src="${path}"`),
        `1c: у ${id} в ${name} потерялся data-src — превью останется пустым`);
      assert(fs.existsSync(path), `1d: нет файла ${path}`);
    }
  }
}

// === 2. Момент загрузки задан показом панели, а не чем-то ещё ===
//
// Без этого пункт 1 прошёл бы и на варианте «пути убрали, а ставить их забыли»: панель
// открылась бы с тремя пустыми рамками, и заметить это можно только глазами.
{
  const code = stripComments(settings);

  assert(/let settingsPreviewsAwake = document\.body\.classList\.contains\('settings-page'\);/.test(code),
    '2: флаг «панель открывали» инициализируется иначе. На обычной странице он обязан '
    + 'начинаться выключенным, а на отдельной странице настроек — включённым: там панель и '
    + 'есть вся страница, показывать её нечем и onShow не придёт никогда');

  const wake = /function wakeSettingsPreviewGifs\(\)\{[\s\S]*?\n\}/.exec(code);
  assert(wake, '2b: не найдено включение гифок превью');
  assert(/settingsPreviewsAwake = true;/.test(wake[0]),
    '2c: включение не взводит флаг — гифки останутся погашенными навсегда');
  for(const fn of ['syncCargoPreview', 'syncFlagsPreview', 'syncArcadeCargoPreview']){
    assert(wake[0].includes(`${fn}(`),
      `2d: при показе панели не пересобирается ${fn} — соответствующее превью останется пустым`);
  }

  const show = /function handleSettingsLayerShow\(\)\{[\s\S]{0,400}/.exec(code);
  assert(show && /wakeSettingsPreviewGifs\(\);/.test(show[0]),
    '2e: показ панели больше не включает гифки превью');
}

// === 3. Решение про src в ОДНОМ месте, и оно смотрит на флаг ===
//
// Раньше каждое превью решало за себя, и одно из трёх про гашение просто забыли.
{
  const code = stripComments(settings);

  const apply = /function applyPreviewGif\(img, src, shouldShow\)\{[\s\S]*?\n\}/.exec(code);
  assert(apply, '3: не найдено общее место, где превью получает src');
  assert(/shouldShow && settingsPreviewsAwake/.test(apply[0]),
    '3b: src ставится без оглядки на флаг — гифки поедут снова при загрузке страницы');
  assert(/clearPreviewGif\(img\)/.test(apply[0]),
    '3c: выключенное превью больше не гасится');

  for(const fn of ['syncCargoPreview', 'syncFlagsPreview', 'syncArcadeCargoPreview']){
    const body = new RegExp(`function ${fn}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`).exec(code);
    assert(body, `3d: не найдено ${fn}`);
    assert(/applyPreviewGif\(/.test(body[0]),
      `3e: ${fn} ставит src мимо общего места — значит опять решает за себя`);
    assert(!/\.src = /.test(body[0]),
      `3f: в ${fn} вернулось прямое присваивание src`);
  }
}

console.log('smoke-settings-preview-gifs-are-lazy: OK');
