#!/usr/bin/env node
'use strict';

// Smoke test: разворот игрового поля в горизонталь (десктоп).
//
// Весь дизайн живёт в кадре 460x800, поэтому разворот сделан ОДНИМ поворотом самого
// кадра на 90° по часовой: поле, фон-подложка, самолёты и счёт на hudCanvas, инвентари
// едут вместе с ним. Точка кадра (u,v) после поворота видна в (X, Y) = (800 - v, u).
//
// Главное, что здесь проверяется, — обратное преобразование ввода. getBoundingClientRect
// у повёрнутого кадра возвращает его габаритную коробку (800x460), а не сам кадр, поэтому
// без инверсии клики уезжают: игрок целится в одну точку, а игра получает другую.

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');
const markup = fs.readFileSync('index.html', 'utf8');

// Стенд: кадр 460x800, масштаб 1, в горизонтали габаритная коробка 800x460.
const buildContext = ({ landscape, scale = 1, frameLeft = 0, frameTop = 0 } = {}) => {
  const context = {
    Math, Number,
    FRAME_BASE_WIDTH: 460,
    FRAME_BASE_HEIGHT: 800,
    uiFrameEl: { getBoundingClientRect: () => ({ left: frameLeft, top: frameTop }) },
    getEffectivePinchScale: () => 1,
    window: {
      getComputedStyle: () => ({ getPropertyValue: () => String(scale) }),
    },
    document: {
      documentElement: {
        classList: { contains: (name) => landscape && name === 'is-board-landscape' },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(extractFunctionSource(source, 'isBoardLandscapeActive'), context);
  vm.runInContext(extractFunctionSource(source, 'toDesignCoords'), context);
  return context;
};

// === 1. Портрет: преобразование остаётся прежним ===
{
  const ctx = buildContext({ landscape: false });
  const p = ctx.toDesignCoords(120, 300);
  assert(Math.abs(p.x - 120) < 1e-6 && Math.abs(p.y - 300) < 1e-6,
    '1: в портрете координаты дизайна совпадают с экранными (при масштабе 1)');
  const scaled = buildContext({ landscape: false, scale: 2, frameLeft: 50, frameTop: 30 })
    .toDesignCoords(50 + 240, 30 + 600);
  assert(Math.abs(scaled.x - 120) < 1e-6 && Math.abs(scaled.y - 300) < 1e-6,
    '1b: смещение кадра и масштаб учитываются как раньше');
}

// === 2. Горизонталь: углы кадра ложатся туда, куда обещает раскладка ===
{
  const ctx = buildContext({ landscape: true });
  const at = (X, Y) => {
    const p = ctx.toDesignCoords(X, Y);
    return [Math.round(p.x), Math.round(p.y)];
  };
  // Видимый верх-право — это угол кадра (0,0): туда по ТЗ уезжает козёл.
  assert(String(at(800, 0)) === String([0, 0]),
    '2: видимый правый верхний угол — это (0,0) кадра (там козёл)');
  // Видимый низ-лево — угол кадра (460,800): там по ТЗ остаётся воробей.
  assert(String(at(0, 460)) === String([460, 800]),
    '2b: видимый левый нижний угол — это (460,800) кадра (там воробей)');
  // Видимый низ-право — угол кадра (460,0): там живёт кнопка разворота.
  assert(String(at(800, 460)) === String([460, 0]),
    '2c: видимый правый нижний угол — это (460,0) кадра (там кнопка)');
  // Центр остаётся центром.
  assert(String(at(400, 230)) === String([230, 400]),
    '2d: центр кадра остаётся центром');
}

// === 3. Горизонталь с масштабом и смещением кадра ===
{
  const ctx = buildContext({ landscape: true, scale: 1.6, frameLeft: 100, frameTop: 40 });
  const p = ctx.toDesignCoords(100 + 400 * 1.6, 40 + 230 * 1.6);
  assert(Math.abs(p.x - 230) < 1e-6 && Math.abs(p.y - 400) < 1e-6,
    '3: масштаб и смещение кадра учитываются и в горизонтали');
}

// === 4. Мировые спрайты (ящики, базы, флаги) рисуются ровно ===
{
  const calls = [];
  const ctx = {
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (x, y) => calls.push(['translate', Math.round(x), Math.round(y)]),
    rotate: (a) => calls.push(['rotate', Number(a.toFixed(4))]),
    drawImage: (_s, x, y, w, h) => calls.push(['drawImage', Math.round(x), Math.round(y), w, h]),
  };
  const sprite = { ready: true };

  const portrait = buildContext({ landscape: false });
  portrait.drawImageCalls = calls;
  vm.runInContext(extractFunctionSource(source, 'drawWorldSpriteUpright'), portrait);
  portrait.drawWorldSpriteUpright(ctx, sprite, 100, 200, 20, 40);
  assert(calls.length === 1 && calls[0][0] === 'drawImage',
    '4: в портрете спрайт рисуется как раньше, без лишних преобразований');
  assert(String(calls[0]) === String(['drawImage', 100, 200, 20, 40]),
    '4b: и ровно в той же точке');

  calls.length = 0;
  const land = buildContext({ landscape: true });
  vm.runInContext(extractFunctionSource(source, 'drawWorldSpriteUpright'), land);
  land.drawWorldSpriteUpright(ctx, sprite, 100, 200, 20, 40);
  assert(String(calls[0]) === String(['save']) && String(calls[calls.length - 1]) === String(['restore']),
    '4c: поворот не должен утекать на остальную отрисовку');
  assert(String(calls[1]) === String(['translate', 110, 220]),
    '4d: поворот идёт вокруг ЦЕНТРА спрайта, иначе он уедет с места');
  assert(calls[2][0] === 'rotate' && Math.abs(calls[2][1] + Math.PI / 2) < 1e-3,
    '4e: встречный поворот ровно на -90°');
  assert(String(calls[3]) === String(['drawImage', -10, -20, 20, 40]),
    '4f: спрайт рисуется от центра — размер и пропорции не меняются');
}

// === 5. Разметка и стили: то, что нельзя проверить вычислением ===

assert(/id="orientationToggleBtn"/.test(markup),
  '5: на игровом экране должна быть кнопка разворота');
assert(markup.indexOf('id="orientationToggleBtn"') > markup.indexOf('id="gsFrame"'),
  '5b: кнопка живёт внутри игрового экрана — на меню её быть не должно');

assert(/html\.is-board-landscape #uiFrame\s*\{[^}]*rotate\(90deg\)/.test(styles),
  '6: сам кадр поворачивается на 90° — иначе поле не станет горизонтальным');
assert(/html\.is-board-landscape \.inventory-slot\s*\{[^}]*rotate\(-90deg\)/.test(styles),
  '6b: каждый квадратик инвентаря разворачивается отдельно');
assert(/html\.is-board-landscape \.orientation-toggle\s*\{[^}]*rotate\(-90deg\)/.test(styles),
  '6c: в горизонтали разворачивается только значок кнопки, чтобы стоять ровно');
// У кнопки ОДНО место в обеих ориентациях — разрыв между группами самолётов в счётчике
// (кадр по y 384..416 при x 3..51). Она просто едет вместе с кадром.
assert(/\.orientation-toggle\s*\{[\s\S]*?left:\s*10px;[\s\S]*?top:\s*383px/.test(styles),
  '6d: базовое место кнопки — разрыв счётчика самолётов');
assert(!/html\.is-board-landscape \.orientation-toggle\s*\{[^}]*(left|top|right|bottom):/.test(styles),
  '6e: в горизонтали кнопка НЕ переезжает — иначе у неё два разных места на двух экранах');
assert(/html\.is-board-landscape #goatIndicator\s*\{[\s\S]*?bottom:\s*0/.test(styles),
  '6f: воробей прижат к углу кадра (460,800) — это левый нижний угол экрана');
assert(/html\.is-board-landscape #mantisIndicator\s*\{[\s\S]*?scaleX\(-1\)/.test(styles),
  '6g: козёл отражён по горизонтали — в правом верхнем углу он смотрит внутрь поля');
// Огонь прижат к самолёту своим низом, поэтому и поворачиваться должен вокруг низа.
assert(/html\.is-board-landscape \.fx-flame\s*\{[^}]*transform-origin:\s*50% 100%/.test(styles),
  '6h: огонь разворачивается вокруг своего основания, иначе отъезжает от самолёта');
assert(/@media \(hover: hover\) and \(pointer: fine\)/.test(styles),
  '6i: кнопка только для мыши — на тач-устройствах ориентацию задаёт система');

// Масштаб кадра обязан считаться от переставленных габаритов, иначе в горизонтали
// поле либо не влезет, либо останется крошечным.
assert(/landscape \? FRAME_BASE_HEIGHT : FRAME_BASE_WIDTH/.test(source),
  '7: --ui-scale должен вписывать повёрнутую габаритную коробку');
// Инвентари разъезжаются по экранной вертикали, иначе упираются в морды в углах.
assert(/INVENTORY_LANDSCAPE_SHIFT_PX = Object\.freeze\(\{ blue: 42, green: -48 \}\)/.test(source),
  '7b: в горизонтали инвентари сдвигаются: левый вверх, правый вниз');
assert(/refreshInventoryContainerLayouts/.test(source),
  '7c: раскладка инвентарей пересобирается при смене ориентации');
// Эффекты поля позиционируются инлайновым transform — поворот дописывается в коде.
assert(/withLandscapeUprightTransform\('translate\(-50%, -100%\)'\)/.test(source),
  '7d: огонь сбитого самолёта разворачивается ровно');
// У взрыва transform переписывается на каждом обновлении — поворот обязан быть и там,
// иначе взрыв так и остаётся лежать на боку.
assert(/element\.style\.transform = withLandscapeUprightTransform\('translate\(-50%, -50%\)'\)/.test(source)
  && /element\.style\.transform = withLandscapeUprightTransform\(`translate\(-50%, -50%\) scale/.test(source),
  '7f: взрыв разворачивается и при обновлении масштаба, а не только при создании');
// Падающий груз обязан крутиться вокруг точки приземления ящика, иначе анимация
// садится в одном месте, а готовый ящик появляется в другом.
assert(/originX = \(-CARGO_ANIM_OFFSET_X \+ crateSize\.width \/ 2\) \* scaleX/.test(source),
  '7g: анимация груза разворачивается вокруг точки приземления ящика');
// Флаг разворачивается ровно (на боку он читается плохо), а БАЗА намеренно едет
// вместе с полем — в той же системе координат, что самолёты: развёрнутая корзинка
// не помещается в свою клетку, а боком читается нормально.
const flagFn = source.slice(source.indexOf('function drawFlagSprite('));
assert(/drawWorldSpriteUpright\(ctx2d, sprite, layout\.x, layout\.y, layout\.width, layout\.height\)/
  .test(flagFn.slice(0, flagFn.indexOf('\n}'))),
  '7e: флаг рисуется ровно');
const baseFn = source.slice(source.indexOf('function drawBaseSprite('));
const baseBody = baseFn.slice(0, baseFn.indexOf('\n}'));
assert(/ctx2d\.drawImage\(sprite, layout\.x, layout\.y, layout\.width, layout\.height\)/.test(baseBody)
  && !/drawWorldSpriteUpright/.test(baseBody),
  '7f: база НЕ разворачивается — корзинка живёт в системе координат поля');

// Тень лежит под ящиком, то есть по экранной вертикали: в горизонтали и смещение,
// и сплюснутый эллипс разворачиваются, иначе тень уезжает вбок от ящика.
const shadowFn = source.slice(source.indexOf('function drawCargoShadow('));
const shadowBody = shadowFn.slice(0, shadowFn.indexOf('\n}'));
assert(/width \* \(landscape \? 0\.9 : 0\.5\)/.test(shadowBody)
  && /height \* \(landscape \? 0\.5 : 0\.9\)/.test(shadowBody),
  '7g: смещение тени разворачивается вместе с кадром');
assert(/landscape \? -Math\.PI \/ 2 : 0/.test(shadowBody),
  '7h: сам эллипс тени тоже разворачивается, иначе он вытянут поперёк');

// Подпись дальности разворачивается вокруг своего якоря у самолёта.
const aimFn = source.slice(source.indexOf('function drawAimOverlay('));
assert(/hudCtx\.translate\(rangeTextInfo\.x, rangeTextInfo\.y\);[\s\S]{0,120}hudCtx\.rotate\(-Math\.PI \/ 2\)/
  .test(aimFn.slice(0, 2000)),
  '7i: подпись дальности разворачивается вокруг якоря у самолёта');
// Уходя в меню, возвращаемся в портрет: иначе повёрнутым окажется и меню.
assert(/if\(mode !== 'GAME' && typeof setBoardLandscape === "function"\)/.test(source),
  '8: при уходе с игрового экрана разворот сбрасывается');

console.log('Smoke test passed: кадр поворачивается целиком, ввод возвращается в координаты дизайна, мировые спрайты рисуются ровно вокруг своего центра, инвентари разъезжаются от морд, а кнопка живёт только на игровом экране и только для мыши.');
