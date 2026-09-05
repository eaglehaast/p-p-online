#!/usr/bin/env node
'use strict';

// Smoke test: картинку гасят снятием атрибута, а не пустой строкой в src.
//
// `img.src = ''` выглядит как «убрать картинку», но делает не это. По правилам HTML пустая
// строка разрешается ОТНОСИТЕЛЬНО АДРЕСА СТРАНИЦЫ, поэтому картинка начинает грузить саму
// страницу, получает HTML вместо изображения и роняет ошибку в консоль. Замер в браузере,
// событие error снималось прямо с элементов:
//
//   #arcade_preview_gif                     src стал http://…/  — ошибка при загрузке меню
//   img.transfer-frame--back                src стал http://…/  — ошибка в конце раунда
//   img.transfer-frame--color               src стал http://…/  — ошибка в конце раунда
//
// Экран передачи хода гасится после каждого хода, так что две последние повторялись всю
// партию.
//
// Вторая половина той же истории — откуда вообще брался путь. Гифки превью стояли в
// разметке в атрибуте src, и браузер начинал их качать при разборе страницы, а settings.js
// тут же гасил те, чей тумблер выключен. В браузере это видно как оборванный запрос:
//
//   ОБОРВАН  ui_controlpanel/cp_adds/cp_arcade_on2.gif  net::ERR_ABORTED
//
// Поэтому путь переехал в data-src: пока тумблер не включён, за гифкой никто не идёт.
//
// Оговорка про favicon: в консоли на своей машине остаётся 404 на /p-p-online/favicon.ico.
// Это НЕ ошибка — на GitHub Pages сайт лежит по адресу /p-p-online/, и там путь верный.
// Локальный сервер отдаёт корень, поэтому мимо. Чинить нельзя: сломается на Pages.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');
const settings = fs.readFileSync('settings.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const settingsHtml = fs.readFileSync('settings.html', 'utf8');

// Пояснения в комментариях сами содержат разбираемую строку, поэтому сверяем по коду.
function stripComments(source){
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

// === 1. ГЛАВНОЕ: пустая строка в src больше нигде не присваивается ===
{
  for(const [name, source] of [['script.js', script], ['settings.js', settings]]){
    const code = stripComments(source);
    const hit = /\.src\s*=\s*(''|"")/.exec(code);
    assert(!hit,
      `1: в ${name} вернулось присваивание пустой строки в src. Это не «убрать картинку»: `
      + 'пустая строка разрешается относительно адреса страницы, и картинка пойдёт грузить '
      + 'саму страницу. Гасить надо removeAttribute("src")');
  }
}

// === 2. Гашение идёт через снятие атрибута ===
//
// Без этого пункт 1 прошёл бы и на варианте «строку просто удалили», а картинка осталась бы
// висеть на экране после того, как её должны были убрать.
{
  assert(/function detachImageSource\(image\) \{[\s\S]{0,320}image\.removeAttribute\("src"\)/.test(script),
    '2: в script.js нет отцепления источника через removeAttribute');
  assert(/function clearPreviewGif\(img\)\{[\s\S]{0,200}img\.removeAttribute\('src'\)/.test(settings),
    '2b: в settings.js нет отцепления источника через removeAttribute');

  // И обе стороны переключателя пользуются именно им.
  const clearBack = /clearTransferFrameContent\(\) \{[\s\S]*?detachImageSource\(transferFrameState\.backImage\)/;
  assert(clearBack.test(script),
    '2c: подложка экрана передачи хода гасится не через detachImageSource');
  assert((script.match(/detachImageSource\(/g) || []).length >= 4,
    '2d: detachImageSource зовут реже, чем в трёх местах гашения плюс объявление — '
    + 'значит какое-то место снова гасит картинку по-своему');
  // У превью гашение спрятано ещё на уровень глубже: три анимации ходят через один
  // applyPreviewGif, а гасит их всех clearPreviewGif внутри него. Проверяем эту связку, а
  // не число упоминаний: считать вызовы бессмысленно, когда места гашения схлопываются в одно.
  const applyPreview = /function applyPreviewGif\([^)]*\)\{[\s\S]*?\n\}/.exec(settings);
  assert(applyPreview && /clearPreviewGif\(img\)/.test(applyPreview[0]),
    '2e: превью гасятся не через clearPreviewGif — значит опять кто-то делает это по-своему');
}

// === 3. Гифки превью не качаются, пока их тумблер выключен ===
//
// Путь живёт в data-src. Если он вернётся в src, браузер снова начнёт качать гифку при
// разборе разметки, а скрипт снова оборвёт загрузку на полпути.
{
  const PREVIEWS = [
    ['arcade_preview_gif', 'ui_controlpanel/cp_adds/cp_arcade_on2.gif'],
    ['flags_preview_on', 'ui_controlpanel/cp_adds/cp_flags_on.gif'],
  ];
  for(const [name, page] of [['index.html', indexHtml], ['settings.html', settingsHtml]]){
    const markup = stripComments(page);
    for(const [id, path] of PREVIEWS){
      const at = markup.indexOf(`id="${id}"`);
      assert(at !== -1, `3: в ${name} не найден ${id} — проверка устарела`);
      const tag = markup.slice(markup.lastIndexOf('<img', at), markup.indexOf('/>', at) + 2);

      assert(!/\ssrc=/.test(tag),
        `3b: у ${id} в ${name} снова есть src — браузер начнёт качать гифку при разборе `
        + 'страницы, а скрипт оборвёт загрузку');
      assert(tag.includes(`data-src="${path}"`),
        `3c: у ${id} в ${name} потерялся data-src — превью просто не появится, когда `
        + 'тумблер включат');
      assert(fs.existsSync(path), `3d: нет файла ${path}, на который смотрит ${id}`);
    }
  }

  // И код читает путь именно оттуда.
  assert(/getAttribute\('data-src'\)/.test(settings),
    '3e: settings.js больше не читает путь из data-src — превью останутся пустыми');
}

console.log('smoke-no-empty-img-src: OK');
