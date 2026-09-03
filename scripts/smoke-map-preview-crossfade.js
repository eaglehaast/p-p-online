#!/usr/bin/env node
'use strict';

// Smoke test: превью карты меняется растворением, а не встык.
//
// После того как лента подписей поехала непрерывно, стала заметна картинка: за одну
// протяжку пальцем на 240 px превью пересобиралось ДЕСЯТЬ раз, и каждый раз резкой
// подменой. Замер показал, что дело не в цене — кадры не проседали, — а именно в стыке.
//
// Отдельно проверено, ЧТО меняется при смене карты: из десяти объектов превью (самолёты и
// флаги — это divы, а не пиксели холста) не сдвигается НИ ОДИН. Меняется только холст с
// кирпичами. Поэтому растворяется он один, а копия всего превью не делается — и это
// важно: стили превью привязаны к id, и клон с вырезанными id потерял бы вид.
//
// Замер после первой правки: копия на странице ровно одна даже при быстрой прокрутке,
// кадров длиннее 24 мс — ноль (до правки был один, 50 мс).
//
// ВТОРАЯ правка — про то, ЧЕМ ведётся растворение. Переход по времени (110 мс) на
// последнем шаге выглядел вспышкой посреди тишины: последняя карта появлялась в t=2254,
// копия догасала в t=2420, а лента вставала только в t=2854. Картинка заканчивала
// проявляться на 434 мс раньше, чем прекращалось движение.
//
// Теперь на прокате ленты прозрачность — функция ПОЛОЖЕНИЯ: копия снимается, но гаснет
// покадрово, по мере того как подпись новой карты идёт к центру. Замер после:
// растворение длится 550 мс вместо 110 и заканчивается за 50 мс до остановки ленты.
// Вне проката (когда анимации нет) остаётся переход по времени.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFn(source, name){
  const re = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
  const m = re.exec(source);
  if(!m) throw new Error(`не найдено: ${name}`);
  const start = m.index;
  const open = source.indexOf('{', source.indexOf(')', start));
  let d = 0;
  for(let i = open; i < source.length; i += 1){
    if(source[i] === '{') d += 1;
    if(source[i] === '}'){ d -= 1; if(d === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`не закрыто: ${name}`);
}

const settings = fs.readFileSync('settings.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

// === 1. ГЛАВНОЕ: растворение включено в единственную точку смены карты ===
//
// updateMapPreviewIndex — общий проход для стрелок, перетаскивания и проката ленты.
// Достаточно вставить растворение здесь, чтобы оно работало везде.
{
  const fn = extractFn(settings, 'updateMapPreviewIndex');
  const code = fn.replace(/\/\/.*$/gm, '');

  assert(/crossfadeMapPreviewBricks\(\)/.test(code),
    '1: смена карты обязана начинаться с растворения — иначе картинка снова меняется встык');

  // Порядок решает всё: снимок берётся с ЖИВОГО холста, значит до перерисовки.
  const fadeAt = code.indexOf('crossfadeMapPreviewBricks()');
  const drawAt = code.indexOf('updateMapPreview()');
  assert(fadeAt !== -1 && drawAt !== -1 && fadeAt < drawAt,
    '1b: снимок снимается ДО перерисовки холста, иначе копия будет уже новой картой '
    + 'и растворять станет нечего');

  // Мигать на перерисовке той же карты незачем.
  assert(/if\(lastPreviewMapIndex !== resolvedIndex\)\{[\s\S]*?crossfadeMapPreviewBricks\(\);/.test(code),
    '1c: растворение только при настоящей СМЕНЕ карты, а не при любой перерисовке');
}

// === 2. Копия одна и переиспользуется ===
//
// При быстрой прокрутке смены идут чаще, чем длится растворение. Если на каждую смену
// создавать новый слой, они начнут копиться поверх друг друга.
{
  const fn = extractFn(settings, 'ensureMapPreviewGhostCanvas');
  assert(/if\(mapPreviewGhostCanvas && mapPreviewGhostCanvas\.parentNode === mapPreview\)/.test(fn),
    '2: готовая копия переиспользуется, а не создаётся заново на каждую смену');
  assert(/createElement\('canvas'\)/.test(fn),
    '2b: копия — это холст, на него переносятся пиксели уходящего кадра');

  const capture = extractFn(settings, 'captureMapPreviewGhost');
  assert(/clearTimeout\(mapPreviewGhostTimer\)/.test(capture),
    '2c: таймер прошлого растворения снимается при снятии новой копии, иначе он погасит её');
}

// === 3. Снимок берётся с живого холста ===
{
  const capture = extractFn(settings, 'captureMapPreviewGhost');
  assert(/const live = mapPreviewBricksCanvas;/.test(capture),
    '3: источник снимка — живой холст кирпичей');
  assert(/ctx\.drawImage\(live, 0, 0\)/.test(capture),
    '3b: пиксели переносятся честно; клонирование узла холст НЕ копирует');
  assert(/try \{[\s\S]*?ctx\.drawImage\(live, 0, 0\);[\s\S]*?\} catch/.test(capture),
    '3c: перенос обёрнут — «запачканный» холст бросает исключение, и оно не должно '
    + 'ронять смену карты');
  assert(/ghost\.width = live\.width;/.test(capture) && /ghost\.height = live\.height;/.test(capture),
    '3d: размеры копии берутся у живого холста, иначе снимок растянет');
}

// === 4. Растворение действительно запускается ===
//
// Установить непрозрачность и тут же перевести её в ноль в одном кадре — значит не
// получить перехода вовсе: браузер склеит два изменения в одно.
{
  const capture = extractFn(settings, 'captureMapPreviewGhost');
  assert(/ghost\.style\.transition = 'none';[\s\S]*?ghost\.style\.opacity = '1';/.test(capture),
    '4: копия сначала показывается целиком и без перехода');

  const timed = extractFn(settings, 'startMapPreviewGhostFade');
  assert(/requestAnimationFrame\(\(\) => \{[\s\S]*?opacity = '0';/.test(timed),
    '4b: гасить переходом начинаем со СЛЕДУЮЩЕГО кадра, иначе перехода не будет');
  assert(/transition = `opacity \$\{fade\}ms/.test(timed),
    '4c: гашение по времени идёт переходом по прозрачности');
}

// === 5. Длительность ограничена ===
//
// Растворение длиннее шага превратит быструю прокрутку в кашу из полупрозрачных карт.
{
  const decl = /const MAP_PREVIEW_CROSSFADE_MS = (\d+);/.exec(settings);
  assert(decl, '5: длительность растворения не объявлена');
  const ms = Number(decl[1]);
  assert(ms > 0 && ms <= 200,
    `5b: растворение ${ms} мс — на шаг приходится около 200 мс, длиннее нельзя, `
    + 'иначе карты будут накладываться друг на друга');

  const timed = extractFn(settings, 'startMapPreviewGhostFade');
  assert(/Math\.min\(MAP_PREVIEW_CROSSFADE_MS, durationMs\)/.test(timed),
    '5c: переданная длительность ограничивается сверху тем же пределом');
}

// === 6. Слой копии лежит поверх и не ловит события ===
{
  assert(/\.map-preview-bricks--ghost \{[^}]*z-index: 2;/.test(styles),
    '6: копия обязана лежать НАД живым холстом (у него z-index: 1)');
  assert(/\.map-preview-bricks--ghost \{[^}]*opacity: 0;/.test(styles),
    '6b: в покое копия невидима, иначе она закроет живое превью');
  // pointer-events снимается общим классом .map-preview-bricks — проверяем, что он на месте.
  assert(/\.map-preview-bricks \{[^}]*pointer-events: none;/.test(styles),
    '6c: холсты превью не ловят события; копия наследует это от общего класса');

  const ensure = extractFn(settings, 'ensureMapPreviewGhostCanvas');
  assert(/className = 'map-preview-bricks map-preview-bricks--ghost'/.test(ensure),
    '6d: копия несёт оба класса — геометрию берёт от общего, слой от своего');
}

// === 7. ГЛАВНОЕ: на прокате ленты растворением управляет ДВИЖЕНИЕ, а не таймер ===
//
// Переход по времени не знает, сколько ещё ехать ленте. На последнем шаге, где кривая
// пологая, он успевал отработать и оставить 434 мс тишины — картинка появлялась вспышкой
// и дальше ничего не менялось. Привязка к положению делает растворение ровно таким же
// длинным, как остаток движения.
{
  const animate = extractFn(settings, 'animateFieldLabelChange');
  const code = animate.replace(/\/\/.*$/gm, '');

  // Вложенная скобка в аргументе: [^)]* через неё не перешагнёт.
  assert(/updateMapPreviewIndex\([\s\S]*?\{ holdGhost: true \}\)/.test(code),
    '7: на прокате копия ПРИДЕРЖИВАЕТСЯ — гасить её будет движение, а не переход');

  assert(/const fromSwitch = previewSteps - travelled;/.test(code),
    '7b: прозрачность считается от того, сколько осталось до центра');
  assert(/setMapPreviewGhostOpacity\(fromSwitch \* 2\);/.test(code),
    '7c: полшага пути — это весь путь растворения: 0.5 → полностью видна, 0 → прозрачна');

  // Гасится покадрово, значит вызов обязан стоять внутри кадрового цикла.
  const tick = code.slice(code.indexOf('const tick ='));
  assert(/setMapPreviewGhostOpacity/.test(tick),
    '7d: прозрачность выставляется каждый кадр, иначе это снова переход по времени');

  assert(/hideMapPreviewGhost\(\);/.test(code),
    '7e: в конце копия обязательно снимается — иначе оборванная анимация оставит её висеть');
}

// === 8. Вне проката остаётся переход по времени ===
//
// Без этого пункт 7 прошёл бы и на варианте, где растворение вообще выкинули.
{
  const cross = extractFn(settings, 'crossfadeMapPreviewBricks');
  assert(/captureMapPreviewGhost\(\)/.test(cross) && /startMapPreviewGhostFade\(durationMs\)/.test(cross),
    '8: обычный путь — снять копию и погасить её переходом по времени');

  const update = extractFn(settings, 'updateMapPreviewIndex');
  assert(/if\(holdGhost\) captureMapPreviewGhost\(\);/.test(update)
    && /else crossfadeMapPreviewBricks\(\);/.test(update),
    '8b: режим выбирается вызывающим: прокат придерживает копию, всё остальное гасит по времени');
}

console.log('smoke-map-preview-crossfade: OK');
