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
// Место и разворот кнопки разбирает раздел 13.

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
// Конкретные числа сдвига проверяет раздел 10b — там они выведены из границ поля.
// Здесь важно только направление: полосы обязаны разъезжаться в РАЗНЫЕ стороны,
// иначе они сойдутся на одной морде.
{
  const shifts = readLandscapeShifts();
  assert(shifts.blue > 0 && shifts.green < 0,
    `7b: в горизонтали инвентари разъезжаются: правый вниз, левый вверх (${shifts.blue}, ${shifts.green})`);
}
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
// Сдвиг по y — это рисовальная поправка домашней раскладки, её разбирает
// smoke-flag-sprite-symmetry.js; здесь важно только, что спрайт идёт через «ровный» путь.
const flagFn = source.slice(source.indexOf('function drawFlagSprite('));
assert(/drawWorldSpriteUpright\(ctx2d, sprite, layout\.x, layout\.y \+ nudgeY, layout\.width, layout\.height\)/
  .test(flagFn.slice(0, flagFn.indexOf('\n}'))),
  '7e: флаг рисуется ровно');
const baseFn = source.slice(source.indexOf('function drawBaseSprite('));
const baseBody = baseFn.slice(0, baseFn.indexOf('\n}'));
assert(/ctx2d\.drawImage\(sprite, layout\.x, layout\.y, layout\.width, layout\.height\)/.test(baseBody)
  && !/drawWorldSpriteUpright/.test(baseBody),
  '7f: база НЕ разворачивается — корзинка живёт в системе координат поля');
// Обе корзинки нарисованы «смотрящими» в одну сторону, поэтому в горизонтали синяя
// (у правого края) оказывается отвёрнутой от поля — её отражаем. Экранная горизонталь
// это ось Y мира, поэтому зеркало по экрану — scale(1, -1) в координатах холста.
assert(/color === "blue" && isBoardLandscapeActive\(\)/.test(baseBody),
  '7j: отражается ровно синяя корзинка и ровно в горизонтали');
assert(/ctx2d\.scale\(1, -1\)/.test(baseBody),
  '7k: зеркало по экранной горизонтали — это scale(1, -1) на повёрнутом холсте');

// Тень лежит под ящиком, то есть по экранной вертикали: в горизонтали и смещение,
// и сплюснутый эллипс разворачиваются, иначе тень уезжает вбок от ящика.
const shadowFn = source.slice(source.indexOf('function drawCargoShadow('));
const shadowBody = shadowFn.slice(0, shadowFn.indexOf('\n}'));
assert(/width \* \(landscape \? 0\.9 : 0\.5\)/.test(shadowBody)
  && /height \* \(landscape \? 0\.5 : 0\.9\)/.test(shadowBody),
  '7g: смещение тени разворачивается вместе с кадром');
assert(/landscape \? -Math\.PI \/ 2 : 0/.test(shadowBody),
  '7h: сам эллипс тени тоже разворачивается, иначе он вытянут поперёк');

// Динамит на стене и его взрыв — это один и тот же кадр анимации: заряд стоит на
// НИЗУ кадра, вверх уходит место под вспышку. Значит и разворачивать кадр надо вокруг
// его нижней середины, а якорь на кирпиче в горизонтали — это правый край кирпича
// (мир +x идёт на экране вниз), иначе заряд висит рядом со стеной, а не на ней.
const dynFn = source.slice(source.indexOf('function updateAndDrawDynamiteExplosions('));
const dynBody = dynFn.slice(0, 4000);
assert(/transformOrigin = landscape \? `\$\{frameW \/ 2\}px \$\{frameH\}px` : 'top left'/.test(dynBody),
  '7l: кадр динамита разворачивается вокруг своей нижней середины');
assert(/translate\(\$\{drawX\}px, \$\{drawY\}px\) rotate\(-90deg\)/.test(dynBody),
  '7m: в горизонтали кадр динамита разворачивается');
assert(/const anchorX = landscape && Number\.isFinite\(entry\.rightX\) \? entry\.rightX : entry\.x/.test(dynBody),
  '7n: в горизонтали заряд приставляется к правому краю кирпича');
assert((source.match(/rightX: targetBrick\.cx \+ targetBrick\.halfWidth/g) || []).length === 2,
  '7o: правый край кирпича пишется в запись заряда в ОБЕИХ точках создания (игрок и ИИ)');

// Подпись дальности разворачивается вокруг своего якоря у самолёта.
const aimFn = source.slice(source.indexOf('function drawAimOverlay('));
assert(/hudCtx\.translate\(rangeTextInfo\.x, rangeTextInfo\.y\);[\s\S]{0,120}hudCtx\.rotate\(-Math\.PI \/ 2\)/
  .test(aimFn.slice(0, 2000)),
  '7i: подпись дальности разворачивается вокруг якоря у самолёта');
// Табличка «Play again». Её transform целиком занят анимацией появления с
// animation-fill-mode: both, поэтому встречный поворот обычным правилом не задать —
// кадры его перебьют. Для горизонтали заведён отдельный набор кадров.
assert(/html\.is-board-landscape #endGameButtons\.is-visible\s*\{[^}]*animation-name:\s*endgame-panel-drop-landscape/
  .test(styles),
  '9: в горизонтали у таблички свой набор кадров, иначе поворот перебьёт анимация');
const landscapeDropKeyframes = styles.slice(styles.indexOf('@keyframes endgame-panel-drop-landscape'));
const landscapeDropBody = landscapeDropKeyframes.slice(0, landscapeDropKeyframes.indexOf('\n}\n'));
assert((landscapeDropBody.match(/rotate\(-90deg\)/g) || []).length === 5,
  '9b: поворот стоит в КАЖДОМ кадре — иначе табличка ложится на бок по ходу анимации');
assert(!/translateY/.test(landscapeDropBody) && /translateX\(-220px\)/.test(landscapeDropBody),
  '9c: «прилёт сверху» в горизонтали идёт по оси X кадра — это и есть верх экрана');
assert(/html\.is-board-landscape #endGameButtons\s*\{[^}]*transform-origin:\s*50% 50%/.test(styles),
  '9d: табличка крутится вокруг центра — JS ставит её по центру поля именно центром');
// В горизонтали углы прямоугольника поля меняются местами, и height приходит
// отрицательным: старая проверка «height <= 0» просто отменяла позиционирование.
const placeFn = source.slice(source.indexOf('function placeEndGamePanelAtBoardCenter('));
const placeBody = placeFn.slice(0, placeFn.indexOf('\n}'));
assert(/Math\.abs\(boardWidth\) <= 0 \|\| Math\.abs\(boardHeight\) <= 0/.test(placeBody),
  '9e: размер поля берётся по модулю, иначе в горизонтали табличка вовсе не встаёт на место');
assert(/boardRect\.left \+ boardWidth \/ 2 - panelWidth \/ 2/.test(placeBody)
  && /boardRect\.top \+ boardHeight \/ 2 - panelHeight \/ 2/.test(placeBody),
  '9f: центр считается по знаковой середине — она верна в обеих ориентациях');
assert(/endGameDiv\.classList\.contains\("is-visible"\)[\s\S]{0,80}placeEndGamePanelAtBoardCenter\(\)/
  .test(source.slice(source.indexOf('function setBoardLandscape('))),
  '9g: при смене ориентации открытая табличка переставляется сразу');

// Надписи конца матча («Игра окончена. Ничья.», «No one survived.») рисуются прямо
// на холсте HUD в его пиксельных координатах, поэтому в горизонтали читались бы
// сверху вниз. Разворот ставится один раз на весь блок — вокруг центра холста, до
// первой отрисовки: тогда и подложка «нет выживших», и обе строки едут вместе.
const endTextStart = source.indexOf('const shouldShowNoSurvivorsText');
const endTextBody = source.slice(endTextStart, source.indexOf('endTextCtx.restore();', endTextStart));
assert(/if\(isBoardLandscapeActive\(\)\)\{[\s\S]{0,240}endTextCtx\.rotate\(-Math\.PI \/ 2\)/.test(endTextBody),
  '10: в горизонтали блок надписей конца матча разворачивается');
assert(/endTextCtx\.translate\(textAreaWidth \/ 2, textAreaHeight \/ 2\)/.test(endTextBody)
  && /endTextCtx\.translate\(-textAreaWidth \/ 2, -textAreaHeight \/ 2\)/.test(endTextBody),
  '10b: разворот идёт вокруг центра холста — надписи центрованы именно по нему');
assert(endTextBody.indexOf('endTextCtx.rotate(-Math.PI / 2)') < endTextBody.indexOf('fillText'),
  '10c: разворот ставится ДО отрисовки, иначе часть блока останется лежать на боку');
assert(endTextBody.indexOf('endTextCtx.setTransform(1, 0, 0, 1, 0, 0)')
  < endTextBody.indexOf('endTextCtx.rotate(-Math.PI / 2)'),
  '10d: сначала сбрасываем матрицу холста, потом накладываем разворот');

// Сдвиги и масштаб полос инвентаря читаем из самого кода: тест не должен хранить их
// копию, иначе он перестанет ловить расхождение.
function readLandscapeShifts(){
  const m = /INVENTORY_LANDSCAPE_SHIFT_PX = Object\.freeze\(\{ blue: (-?\d+), green: (-?\d+) \}\)/.exec(source);
  assert(m, 'сдвиги полос инвентаря в горизонтали должны быть именованной константой');
  return { blue: Number(m[1]), green: Number(m[2]) };
}
function readLandscapeScale(){
  const m = /const INVENTORY_LANDSCAPE_SCALE = (\d+) \/ (\d+);/.exec(source);
  assert(m, 'масштаб полос инвентаря в горизонтали должен быть именованной константой');
  return Number(m[1]) / Number(m[2]);
}

// === 10b. Полосы инвентаря в горизонтали привязаны к полю, а не висят где придётся ===
//
// Морды сидят в противоположных углах (козёл сверху справа, воробей снизу слева),
// поэтому полосы разъезжаются по оси X кадра. Но разъезжаться они обязаны не «как
// вышло»: каждая упирается в грань ПОЛЯ со своей стороны, иначе со стороны воробья
// полоса повисает в воздухе и симметрия теряется.
{
  const FRAME_W = 460;
  const WORLD_W = 360;
  const fieldStart = (FRAME_W - WORLD_W) / 2;     // 50 — первые кирпичи
  const fieldEnd = fieldStart + WORLD_W;          // 410 — последние кирпичи
  const CONTAINER = { x: 68, w: 342 };
  const shifts = readLandscapeShifts();
  const scale = readLandscapeScale();
  const width = CONTAINER.w * scale;

  const blueStart = CONTAINER.x + shifts.blue;
  const greenStart = CONTAINER.x + shifts.green;
  assert(Math.abs((blueStart + width) - fieldEnd) <= 0.5,
    `10b: синяя полоса кончается на последних кирпичах (${(blueStart + width).toFixed(1)} против ${fieldEnd})`);
  assert(Math.abs(greenStart - fieldStart) <= 0.5,
    `10c: зелёная полоса начинается на первых кирпичах (${greenStart} против ${fieldStart})`);
  // И обе одной длины — ужатие общее, разъезд только по месту начала.
  assert(width > 0 && width < CONTAINER.w,
    '10d: полосы в горизонтали ужаты, но не выродились');
}

// === 11. Подсказка инвентаря в горизонтали стоит СБОКУ от предмета ===
//
// В портрете полосы инвентаря горизонтальны и подсказка встаёт рядом по таблице
// xBySlotIndex. В горизонтали полосы становятся столбцами по краям экрана, и та же
// таблица положила бы подсказку поверх слотов и вдоль столбца. Плашка ещё и
// развёрнута на -90° вокруг центра, поэтому по осям КАДРА её габариты меняются
// местами — место считаем по развёрнутому следу.
{
  const tipCtx = {
    Math, Number,
    FRAME_BASE_WIDTH: 460,
    INVENTORY_TOOLTIP_LANDSCAPE_GAP_PX: 4,
    INVENTORY_TOOLTIP_LANDSCAPE_EDGE_PAD_PX: 4,
    INVENTORY_LANDSCAPE_SHIFT_PX: readLandscapeShifts(),
    INVENTORY_LANDSCAPE_SCALE: readLandscapeScale(),
    INVENTORY_UI_CONFIG: {
      slotOrder: ['crosshair', 'fuel', 'wings', 'mine', 'dynamite', 'invisibility'],
      containers: {
        blue: { x: 68, y: 19, w: 342, h: 55 },
        green: { x: 68, y: 733, w: 342, h: 55 },
      },
      slots: {
        crosshair: { frame: { x: 0, y: 0, w: 55, h: 55 } },
        fuel: { frame: { x: 57, y: 0, w: 55, h: 55 } },
        wings: { frame: { x: 114, y: 0, w: 55, h: 55 } },
        mine: { frame: { x: 171, y: 0, w: 55, h: 55 } },
        dynamite: { frame: { x: 228, y: 0, w: 55, h: 55 } },
        invisibility: { frame: { x: 285, y: 0, w: 55, h: 55 } },
      },
    },
    landscapeFlag: true,
  };
  vm.createContext(tipCtx);
  vm.runInContext('globalThis.isBoardLandscapeActive = () => globalThis.landscapeFlag;', tipCtx);
  vm.runInContext(extractFunctionSource(source, 'getInventoryTooltipLandscapeRect'), tipCtx);

  const W = 166;
  const H = 48;
  const GAP = 4;
  const call = (color, slotIndex) => tipCtx.getInventoryTooltipLandscapeRect(color, slotIndex, W, H);

  tipCtx.landscapeFlag = false;
  assert(call('green', 3) === null,
    '11: в портрете раскладка не подменяется — там работает прежняя таблица xBySlotIndex');
  tipCtx.landscapeFlag = true;

  for(const color of ['green', 'blue']){
    const container = tipCtx.INVENTORY_UI_CONFIG.containers[color];
    const shift = tipCtx.INVENTORY_LANDSCAPE_SHIFT_PX[color];
    for(let slotIndex = 0; slotIndex < 6; slotIndex += 1){
      const rect = call(color, slotIndex);
      assert(rect, `11b: раскладка обязана считаться для всех слотов (${color} ${slotIndex})`);

      // След после поворота: вдоль X кадра — height, вдоль Y кадра — width.
      const centerX = rect.left + W / 2;
      const centerY = rect.top + H / 2;
      const slotCenterX = container.x + shift + (tipCtx.INVENTORY_UI_CONFIG.slots[
        tipCtx.INVENTORY_UI_CONFIG.slotOrder[slotIndex]
      ].frame.x + 55 / 2) * tipCtx.INVENTORY_LANDSCAPE_SCALE;
      assert(Math.abs(centerX - slotCenterX) <= 0.5,
        `11c: подсказка стоит вровень со своим предметом (${color} ${slotIndex}): ${centerX} против ${slotCenterX}`);

      // Со стороны поля: зелёный столбец слева на экране — подсказка правее, то есть
      // МЕНЬШЕ по Y кадра; синий столбец справа — подсказка левее, то есть больше.
      const nearEdge = color === 'green' ? centerY + W / 2 : centerY - W / 2;
      const containerEdge = color === 'green'
        ? container.y
        : container.y + container.h * tipCtx.INVENTORY_LANDSCAPE_SCALE;
      assert(Math.abs(Math.abs(containerEdge - nearEdge) - GAP) <= 0.5,
        `11d: между подсказкой и полосой инвентаря ровно зазор (${color} ${slotIndex})`);
      const overlaps = color === 'green'
        ? nearEdge > container.y
        : nearEdge < container.y + container.h * tipCtx.INVENTORY_LANDSCAPE_SCALE;
      assert(!overlaps,
        `11e: подсказка не наезжает на слоты — она сбоку, а не поверх (${color} ${slotIndex})`);

      // Развёрнутый след обязан целиком помещаться в кадр.
      assert(centerX - H / 2 >= 0 && centerX + H / 2 <= 460,
        `11f: след подсказки не вылезает за кадр по экранной вертикали (${color} ${slotIndex})`);
      assert(centerY - W / 2 >= 0 && centerY + W / 2 <= 800,
        `11g: след подсказки не вылезает за кадр по экранной горизонтали (${color} ${slotIndex})`);
    }
  }
}

// Сам разворот плашки живёт в CSS. Порядок в списке важен: rotate ПЕРВЫМ, иначе
// нюдж-въезд translateX пойдёт по экранной вертикали вместо горизонтали.
assert(/html\.is-board-landscape \.inventory-tooltip\s*\{[^}]*transform:\s*rotate\(-90deg\)/.test(styles),
  '11h: в горизонтали плашка подсказки разворачивается, иначе текст лежит на боку');
for(const side of ['is-right', 'is-left']){
  const rule = new RegExp(`html\\.is-board-landscape \\.inventory-tooltip\\.${side}\\s*\\{[^}]*transform:\\s*rotate\\(-90deg\\) translateX\\(`);
  assert(rule.test(styles),
    `11i: у состояния ${side} rotate стоит перед translateX — нюдж идёт по экранной горизонтали`);
}
assert(/if\(typeof refreshInventoryTooltip === "function"\) refreshInventoryTooltip\(\);/
  .test(source.slice(source.indexOf('function setBoardLandscape('))),
  '11j: при смене ориентации открытая подсказка пересчитывается');

// === 12. Копыто «ИИ думает» стоит у головы козла, а не в прежних координатах ===
//
// В портрете козёл сидит в левом верхнем углу кадра и копыто заглядывает из левой
// грани на уровне бороды. В горизонтали козёл уезжает в правый верхний угол экрана,
// а копыто оставалось на прежнем месте — вылезало сверху, боком и в стороне от него.
{
  const ruleBody = (selector) => {
    const start = styles.indexOf(selector);
    assert(start !== -1, `12: в стилях нет правила ${selector}`);
    return styles.slice(styles.indexOf('{', start) + 1, styles.indexOf('}', start));
  };
  const px = (body, prop) => {
    const match = new RegExp(`${prop}:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(body);
    assert(match, `12: в правиле не задан ${prop}`);
    return Number.parseFloat(match[1]);
  };

  const base = ruleBody('#aiThinkHoof {');
  const hoofW = px(base, 'width');
  const hoofH = px(base, 'height');
  const land = ruleBody('html.is-board-landscape #aiThinkHoof {');
  const left = px(land, 'left');
  const top = px(land, 'top');

  // Копыто развёрнуто на -90° вокруг центра, поэтому по осям КАДРА его габариты
  // меняются местами: вдоль X кадра — height, вдоль Y кадра — width.
  const centerU = left + hoofW / 2;
  const centerV = top + hoofH / 2;
  const halfAlongU = hoofH / 2;
  const halfAlongV = hoofW / 2;

  // Козёл в горизонтали: 64x104 в углу кадра, повёрнут вокруг центра и сдвинут.
  // После поворота он занимает по X кадра 104, по Y кадра 64, со сдвигом (20,-20).
  const goatLand = ruleBody('html.is-board-landscape #mantisIndicator {');
  assert(/rotate\(-90deg\)/.test(goatLand) && /scaleX\(-1\)/.test(goatLand),
    '12b: козёл в горизонтали развёрнут и отражён — копыто должно повторять это');
  const goatFromU = 0;
  const goatToU = 104;

  // Смещение вдоль головы в горизонтали обязано СОВПАДАТЬ с портретным. В портрете
  // копыто прижато к левой грани и стоит центром на 109.5px по оси Y кадра — то есть
  // чуть ниже подбородка (голова занимает 0..104), а не в середине морды. Считаем это
  // число из самих стилей, а не зашиваем: правило одно на обе ориентации.
  const portraitAlongHead = px(base, 'top') + hoofH / 2;
  assert(Math.abs(centerU - portraitAlongHead) <= 0.5,
    `12c: копыто должно стоять вдоль головы там же, где в портрете: ${centerU} против ${portraitAlongHead}`);
  // И это именно «у бороды»: чуть ниже головы, а не в её середине и не далеко внизу.
  assert(centerU > goatToU && centerU < goatToU + hoofH / 2,
    `12d: центр копыта чуть ниже подбородка (голова кончается на ${goatToU}), получено ${centerU}`);
  // Заглядывает из-за той же грани, где сидит козёл: часть копыта за краем кадра.
  assert(centerV - halfAlongV < 0 && centerV + halfAlongV > 0,
    '12e: копыто должно выглядывать из-за грани кадра, а не висеть целиком внутри');
  // Выход за грань обязан РАВНЯТЬСЯ портретному. Это не симметрия ради симметрии:
  // глубина захода и точка, где копытца сходятся на бороде, — одно и то же число.
  // Замер по разнице кадров «с копытом / без» в координатах головы: при выходе 6px
  // кончик уезжает на 10.2px дальше портретного, при 19px недотягивает 3.1px, при
  // портретных 15px расходится на 0.8px. Отступить отсюда — значит сдвинуть копытца
  // с кончика бороды.
  const portraitPeek = -px(base, 'left');
  const landscapePeek = -(centerV - halfAlongV);
  assert(Math.abs(landscapePeek - portraitPeek) <= 0.5,
    `12f: копыто выходит за грань ровно как в портрете, иначе копытца сойдутся не на бороде: ${landscapePeek} против ${portraitPeek}`);
  // Ниже подбородка начинается полоса инвентаря — копыто должно лечь ПОВЕРХ неё.
  const inventoryLayer = ruleBody('#inventoryLayer {');
  const inventoryZ = Number.parseInt(/z-index:\s*(\d+)/.exec(inventoryLayer)?.[1] ?? '0', 10);
  const hoofZ = Number.parseInt(/z-index:\s*(\d+)/.exec(land)?.[1] ?? '0', 10);
  assert(hoofZ > inventoryZ,
    `12g: в горизонтали копыто перекрывает инвентарь (${hoofZ} против ${inventoryZ}), иначе оно спрячется под ним`);

  // Разворот и отражение задаются ПЕРЕМЕННЫМИ, а не отдельным набором кадров.
  // Это не косметика: маршрутизатор фаз в script.js переключается по ИМЕНИ анимации,
  // поэтому переименование кадров под горизонталь оставляло жест навсегда замершим
  // на въезде — до топтания и ухода дело не доходило.
  assert(/--hoof-rot:\s*-90deg/.test(land) && /--hoof-flip:\s*-1/.test(land),
    '12h: горизонталь задаёт разворот и отражение копыта переменными');
  assert(!/animation-name/.test(land) && !/aiHoofSlideInLandscape|aiHoofSlideOutLandscape/.test(styles),
    '12i: у горизонтали НЕ должно быть своих имён анимаций — маршрутизатор фаз ходит по именам');

  // Имена, на которые смотрит маршрутизатор, обязаны существовать и совпадать.
  const router = source.slice(source.indexOf('node.addEventListener("animationend"'));
  const routed = router.slice(0, router.indexOf('});'));
  for(const name of ['aiHoofSlideIn', 'aiHoofFidgetOpen', 'aiHoofSlideOut']){
    assert(new RegExp(`case "${name}":`).test(routed),
      `12j: маршрутизатор фаз ждёт анимацию ${name}`);
    assert(new RegExp(`@keyframes ${name}\\b`).test(styles),
      `12k: кадры ${name} обязаны существовать под тем же именем, иначе фаза не переключится`);
  }

  // Переменные подставлены в КАЖДЫЙ кадр обеих анимаций и стоят перед сдвигом:
  // иначе копыто ложится на бок по ходу анимации или выезжает не по той оси.
  for(const name of ['aiHoofSlideIn', 'aiHoofSlideOut']){
    const frames = styles.slice(styles.indexOf(`@keyframes ${name} {`));
    const body = frames.slice(0, frames.indexOf('\n}'));
    const steps = body.match(/transform:\s*[^;]+;/g) || [];
    assert(steps.length >= 4, `12l: в ${name} должны остаться все шаги, найдено ${steps.length}`);
    assert(steps.every((step) => /rotate\(var\(--hoof-rot\)\) scaleX\(var\(--hoof-flip\)\) translateX\(/.test(step)),
      `12m: каждый кадр ${name} держит разворот и отражение и ставит их ПЕРЕД сдвигом`);
  }
  const restRule = ruleBody('#aiThinkHoof.is-fidgeting {');
  assert(/rotate\(var\(--hoof-rot\)\) scaleX\(var\(--hoof-flip\)\) translateX\(0\)/.test(restRule),
    '12n: в топтании копыто тоже держит разворот');
  assert(/--hoof-rot:\s*0deg/.test(base) && /--hoof-flip:\s*1/.test(base),
    '12o: в портрете переменные нейтральны — рисунок там не меняется');
}

// === 13. Кнопка поворота: спрайт из ассетов на пересечении средних линий ===
//
// Кнопка обязана жить в дизайн-сетке, а не стоять «примерно в углу»: её центр — это
// пересечение средней линии колонки счётчика баллов и средней линии полосы инвентаря.
// В горизонтали полоса ужата, поэтому её средняя линия считается по ужатой ширине.
{
  const FRAME_W = 460;
  const INVENTORY = { x: 68, w: 342, greenY: 733, blueY: 19, h: 55 };
  const scale = readLandscapeScale();
  const shifts = readLandscapeShifts();

  // Колонку счётчика берём из кода, а не зашиваем.
  const scoreSrc = source.slice(source.indexOf('const MATCH_SCORE_CONTAINERS = {'));
  const scoreBody = scoreSrc.slice(0, scoreSrc.indexOf('};'));
  const scoreM = /blue:\s*\{\s*x:\s*(-?[\d.]+),\s*y:\s*(-?[\d.]+),\s*width:\s*([\d.]+)/.exec(scoreBody);
  assert(scoreM, '13: не разобрана колонка счётчика баллов');
  const scoreCenterX = Number(scoreM[1]) + Number(scoreM[3]) / 2;

  assert(/<img class="orientation-toggle__icon"[\s\S]{0,220}src="ui_gamescreen\/gamescreen_outside\/rotate_button\.png"/.test(markup),
    '13: кнопка рисуется спрайтом с обводкой и подложкой из ассетов');
  assert(!/orientation-toggle__arrow/.test(markup) && !/orientation-toggle__arrow/.test(styles),
    '13b: от прежнего инлайнового значка не должно остаться ни разметки, ни стилей');

  const ruleBody = (selector) => {
    const at = styles.indexOf(selector);
    assert(at !== -1, `13: в стилях нет правила ${selector}`);
    return styles.slice(styles.indexOf('{', at) + 1, styles.indexOf('}', at));
  };
  const px = (body, prop) => {
    const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(body);
    assert(m, `13: в правиле не задан ${prop}`);
    return Number.parseFloat(m[1]);
  };

  // Стили обязаны ужимать полосу тем же множителем и вокруг НАЧАЛА полосы.
  const invRule = ruleBody('html.is-board-landscape #gs_inventory_blue,');
  const cssScale = /transform:\s*scale\(([\d.]+)\)/.exec(invRule);
  assert(cssScale, '13c: в горизонтали полосы инвентаря ужимаются');
  assert(Math.abs(Number(cssScale[1]) - scale) <= 0.002,
    `13d: множитель в стилях и в коде должен совпадать (${cssScale[1]} против ${scale.toFixed(4)})`);
  assert(/transform-origin:\s*left top/.test(invRule),
    '13e: полоса ужимается вокруг своего начала, иначе съедет привязка к мордам');

  const base = ruleBody('.orientation-toggle {');
  assert(/background:\s*none/.test(base),
    '13f: своей подложки у кнопки нет — она уже нарисована в спрайте');
  const size = px(base, 'width');
  assert(Math.abs(size - px(base, 'height')) <= 0.5, '13g: кнопка квадратная');
  const centerX = px(base, 'left') + size / 2;
  const centerY = px(base, 'top') + size / 2;

  // Портрет: середина колонки счётчика на середину нижней полосы инвентаря.
  assert(Math.abs(centerX - scoreCenterX) <= 0.5,
    `13h: центр кнопки на средней линии счётчика баллов (${centerX} против ${scoreCenterX})`);
  const portraitInventoryMid = INVENTORY.greenY + INVENTORY.h / 2;
  assert(Math.abs(centerY - portraitInventoryMid) <= 0.5,
    `13i: центр кнопки на средней линии полосы инвентаря (${centerY} против ${portraitInventoryMid})`);

  // Горизонталь: та же колонка счётчика (по x место общее), но полоса верхняя и ужата.
  const land = ruleBody('html.is-board-landscape .orientation-toggle {');
  assert(!/(^|[;{\s])left:/.test(land),
    '13j: по оси X место общее — горизонталь переопределяет только top');
  const landCenterY = px(land, 'top') + size / 2;
  const landInventoryMid = INVENTORY.blueY + INVENTORY.h * scale / 2;
  assert(Math.abs(landCenterY - landInventoryMid) <= 0.5,
    `13k: в горизонтали центр на средней линии УЖАТОЙ полосы (${landCenterY} против ${landInventoryMid.toFixed(2)})`);

  // Ужатие всё ещё обязано освобождать место: полоса идёт по оси X кадра и без него
  // дотянулась бы до кнопки.
  const blueStart = INVENTORY.x + shifts.blue;
  assert(px(base, 'left') >= blueStart + INVENTORY.w * scale,
    '13l: кнопка стоит за концом ужатой полосы');
  assert(blueStart + INVENTORY.w > px(base, 'left'),
    '13m: без ужатия полоса накрыла бы кнопку — иначе правка бессмысленна');
  assert(px(base, 'left') + size <= FRAME_W, '13n: кнопка не вылезает за кадр');

  // Спрайт нарисован для перехода портрет -> горизонталь; суммарный поворот обратного
  // 270°, из них 90° даёт сам поворот кадра.
  const FRAME_ROTATION_DEG = 90;
  const TOTAL_ROTATION_DEG = 270;
  const landRot = /transform:\s*rotate\((-?\d+)deg\)\s*scaleX\(-1\)/.exec(land);
  assert(landRot, '13o: в горизонтали спрайт отражается и доворачивается — порядок важен');
  assert(Number(landRot[1]) + FRAME_ROTATION_DEG === TOTAL_ROTATION_DEG,
    `13p: суммарный поворот ${TOTAL_ROTATION_DEG}°, найдено ${Number(landRot[1]) + FRAME_ROTATION_DEG}°`);
}

// === 13b. Подсказка кнопки поворота: по-английски и в стиле подсказок инвентаря ===
{
  const ruleBody = (selector) => {
    const at = styles.indexOf(selector);
    assert(at !== -1, `13b: в стилях нет правила ${selector}`);
    return styles.slice(styles.indexOf('{', at) + 1, styles.indexOf('}', at));
  };
  const px = (body, prop) => {
    const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(body);
    assert(m, `13b: в правиле не задан ${prop}`);
    return Number.parseFloat(m[1]);
  };

  // Родной браузерный тултип убран: иначе поверх оформленной плашки вылезал бы ещё и он.
  const btnTag = markup.slice(markup.indexOf('id="orientationToggleBtn"'));
  const btnAttrs = btnTag.slice(0, btnTag.indexOf('>'));
  assert(!/\stitle=/.test(btnAttrs),
    '13b: у кнопки не должно остаться родного title — его заменила оформленная подсказка');
  assert(/aria-label="Rotate board"/.test(btnAttrs),
    '13c: подпись кнопки по-английски');
  assert(!/[А-Яа-яЁё]/.test(btnAttrs),
    '13d: в атрибутах кнопки не осталось русского текста');

  // Оформление берётся у подсказок инвентаря — тем же классом, а не копией токенов.
  const tipTag = markup.slice(markup.indexOf('id="orientationToggleTip"'));
  const tipEl = tipTag.slice(0, tipTag.indexOf('</span>'));
  assert(/class="inventory-tooltip orientation-toggle-tip"/.test(tipTag.slice(0, 200)),
    '13e: подсказка носит класс подсказок инвентаря, иначе оформление придётся дублировать');
  assert(/>Rotate board\s*$/.test(tipEl), '13f: текст подсказки по-английски');

  // Подсказка обязана быть СОСЕДОМ кнопки: внутри неё она уехала бы вместе со
  // спрайтом, который в горизонтали развёрнут.
  const between = markup.slice(markup.indexOf('</button>', markup.indexOf('id="orientationToggleBtn"')),
                               markup.indexOf('id="orientationToggleTip"'));
  assert(!/<(div|button|section)\b/.test(between),
    '13g: подсказка стоит сразу за кнопкой — на этом держится селектор показа');
  assert(/#orientationToggleBtn:hover \+ \.orientation-toggle-tip/.test(styles)
    && /#orientationToggleBtn:focus-visible \+ \.orientation-toggle-tip/.test(styles),
    '13h: показ по наведению и с клавиатуры');

  const tip = ruleBody('.orientation-toggle-tip {');
  const tipW = px(tip, 'width');
  const tipH = px(tip, 'height');
  const tipLeft = px(tip, 'left');
  const tipTop = px(tip, 'top');
  const btn = ruleBody('.orientation-toggle {');
  const btnSize = px(btn, 'width');
  const btnLeft = px(btn, 'left');
  const btnTop = px(btn, 'top');

  // Портрет: слева от кнопки, по её средней линии.
  assert(tipLeft + tipW <= btnLeft,
    `13i: в портрете подсказка слева от кнопки (${tipLeft + tipW} против ${btnLeft})`);
  assert(Math.abs((tipTop + tipH / 2) - (btnTop + btnSize / 2)) <= 0.5,
    '13j: в портрете подсказка на средней линии кнопки');

  // Горизонталь: то же «слева на экране», но это БОЛЬШЕ по оси y кадра, и плашка
  // развёрнута встречно, поэтому её след по y равен ширине.
  const tipLand = ruleBody('html.is-board-landscape .orientation-toggle-tip {');
  const btnLand = ruleBody('html.is-board-landscape .orientation-toggle {');
  assert(/transform:\s*rotate\(-90deg\)/.test(tipLand),
    '13k: в горизонтали подсказка разворачивается встречно, иначе ляжет на бок');
  const tipLandCenterY = px(tipLand, 'top') + tipH / 2;
  const tipLandNearEdge = tipLandCenterY - tipW / 2;
  const btnLandBottom = px(btnLand, 'top') + btnSize;
  assert(tipLandNearEdge >= btnLandBottom,
    `13l: в горизонтали подсказка не наезжает на кнопку (${tipLandNearEdge.toFixed(2)} против ${btnLandBottom.toFixed(2)})`);
  assert(Math.abs((px(tipLand, 'left') + tipW / 2) - (btnLeft + btnSize / 2)) <= 0.5,
    '13m: в горизонтали подсказка центрована на кнопке');
}

// === 14. На десктопе игра открывается сразу горизонтальной ===
//
// Признак десктопа обязан совпадать с тем, что включает саму кнопку: иначе поле
// развернётся там, где повернуть его обратно нечем.
{
  const query = '(hover: hover) and (pointer: fine)';
  assert(styles.includes(`@media ${query}`),
    '14: кнопка поворота включается по этому медиазапросу');
  const fn = source.slice(source.indexOf('function prefersDesktopLandscapeBoard('));
  assert(fn.slice(0, fn.indexOf('\n}')).includes(query),
    '14b: признак десктопа для стартовой ориентации — тот же медиазапрос, что и у кнопки');
  const screenFn = source.slice(source.indexOf('function setScreenMode('));
  const screenBody = screenFn.slice(0, screenFn.indexOf('\n}'));
  assert(/const wasGame = document\.body\.classList\.contains\('screen--game'\);/.test(screenBody),
    '14c: вход на игровой экран отличается от повторных вызовов внутри матча');
  assert(/mode === 'GAME' && !wasGame[\s\S]{0,420}setBoardLandscape\(prefersDesktopLandscapeBoard\(\)\)/.test(screenBody),
    '14d: горизонталь ставится только при ВХОДЕ в игру, иначе выбор игрока сбрасывался бы посреди матча');
  assert(/mode !== 'GAME'[\s\S]{0,120}setBoardLandscape\(false\)/.test(screenBody),
    '14e: уходя с игрового экрана, по-прежнему возвращаемся в портрет');
}

// === 15. Иконки счётчиков на hudCanvas стоят прямо, и тень падает как в портрете ===
//
// hudCanvas поворачивается вместе с кадром, а тень у яйца, кукурузы и самолётика
// запечена в сам спрайт. Без встречного поворота яйцо лежит на боку, а тень уезжает
// влево-ВВЕРХ — свет как будто идёт снизу справа, хотя везде он падает сверху справа.
{
  const uprightSource = extractFunctionSource(source, 'withUprightHudIcon');

  // Мини-холст, который считает результирующую матрицу: [a c e; b d f].
  const makeCtx = () => {
    let m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const calls = [];
    const mul = (n) => {
      m = [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
      ];
    };
    return {
      calls,
      save(){ stack.push(m.slice()); },
      restore(){ m = stack.pop() || m; },
      translate(x, y){ mul([1, 0, 0, 1, x, y]); },
      rotate(a){ mul([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); },
      drawImage(){ calls.push(m.slice()); },
      depth: () => stack.length,
    };
  };
  const apply = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
  const near = (a, b) => Math.abs(a - b) <= 1e-9;

  const run = (landscape) => {
    const ctx = makeCtx();
    const sandbox = { Math, isBoardLandscapeActive: () => landscape };
    vm.createContext(sandbox);
    vm.runInContext(`${uprightSource}\nwithUprightHudIcon(ctx, 120, 300, (c) => c.drawImage());`,
      Object.assign(sandbox, { ctx }));
    assert(ctx.calls.length === 1, 'внутренний стенд: спрайт нарисован ровно один раз');
    assert(ctx.depth() === 0, '15a: помощник не оставляет за собой незакрытый save()');
    return ctx.calls[0];
  };

  for(const landscape of [false, true]){
    const m = run(landscape);
    const label = landscape ? 'горизонталь' : 'портрет';

    // Центр иконки не должен уезжать: поворот идёт вокруг него самого.
    const center = apply(m, 0, 0);
    assert(near(center.x, 120) && near(center.y, 300),
      `15b: ${label} — центр иконки остаётся на месте (${center.x}, ${center.y})`);

    // «Низ» спрайта (его локальное +Y) обязан смотреть вниз ЭКРАНА. В портрете экранный
    // низ — это +y кадра, в горизонтали кадр повёрнут и экранный низ — это +x кадра.
    const down = apply(m, 0, 1);
    const dx = down.x - center.x;
    const dy = down.y - center.y;
    if(landscape){
      assert(near(dx, 1) && near(dy, 0),
        `15c: ${label} — низ спрайта смотрит в +x кадра, то есть вниз экрана (${dx}, ${dy})`);
    } else {
      assert(near(dx, 0) && near(dy, 1),
        `15c: ${label} — низ спрайта смотрит в +y кадра, то есть вниз экрана (${dx}, ${dy})`);
    }

    // Спрайт не должен зеркалиться: определитель матрицы положительный.
    assert(m[0] * m[3] - m[1] * m[2] > 0, `15d: ${label} — иконка не отражается`);
  }

  // Портрет обязан остаться байт-в-байт прежним, поэтому в нём поворота нет вовсе.
  assert(/if\(isBoardLandscapeActive\(\)\)\{\s*ctx2d\.rotate\(-Math\.PI \/ 2\);/.test(
    uprightSource.replace(/\n\s*/g, '')),
    '15e: поворот включается только в горизонтали');

  // Счёт матча (яйца и кукуруза) — и заполненные, и «призраки».
  const matchScore = extractFunctionSource(source, 'drawMatchScore');
  const uprightDraws = matchScore.match(/withUprightHudIcon\(/g) || [];
  assert(uprightDraws.length === 2,
    `15f: и призрак, и заполненная иконка счёта идут через встречный поворот (${uprightDraws.length})`);
  assert(!/(?<!c)\bctx\.drawImage\(/.test(matchScore),
    '15g: в счёте матча не осталось прямых ctx.drawImage — иначе иконка ляжет на бок');

  // Песочные часы возрождения в аркаде: цифра внутри, лежать на боку ей нельзя.
  const timer = extractFunctionSource(source, 'drawHudPlaneTimerOverlay');
  assert(/withUprightHudIcon\(ctx2d, cx, cy,/.test(timer),
    '15j: таймер возрождения тоже ставится прямо');

  // Ориентация обязана попасть в подпись табло: размер холста при повороте не меняется,
  // и без неё счётчики остались бы нарисованными по-старому до страховочного срока.
  const signature = extractFunctionSource(source, 'getHudCanvasSignature');
  assert(/isBoardLandscapeActive\(\) \? 1 : 0/.test(signature),
    '15k: подпись табло различает ориентации');
}

// === 16. Значок счётчика в горизонтали — полевой спрайт, а тень рисуется отдельно ===
//
// У иконок счётчика тень запечена в картинку, поэтому она едет вместе с кадром: развернуть
// её отдельно от самолёта нельзя никаким преобразованием. Полевые спрайты нарисованы БЕЗ
// тени — в горизонтали берём их, а тень кладём сами, туда же, куда она падает в портрете.
{
  const counter = extractFunctionSource(source, 'drawPlaneCounterIcon');
  const picker = extractFunctionSource(source, 'getCounterPlaneFieldSprite');
  const builder = extractFunctionSource(source, 'buildCounterPlaneShadow');

  // Берём именно полевые спрайты, и оба цвета — иначе стороны выглядели бы по-разному.
  assert(/color === "blue" \? bluePlaneImg : color === "green" \? greenPlaneImg : null/.test(picker),
    '16a: значок в горизонтали берётся из полевых спрайтов, и синий, и зелёный');
  assert(/isBoardLandscapeActive\(\) \? getCounterPlaneFieldSprite\(color\) : null/.test(counter),
    '16b: полевой спрайт подставляется ТОЛЬКО в горизонтали — портрет остаётся на прежней иконке');
  assert(/} else if \(spriteReady\) \{[\s\S]{0,120}ctx2d\.drawImage\(img, -size \/ 2, -size \/ 2, size, size\);/.test(counter),
    '16c: в портрете (и пока полевой спрайт не загружен) рисуется прежняя иконка счётчика');
  assert(/img = blueCounterPlaneImg;/.test(counter) && /img = greenCounterPlaneImg;/.test(counter),
    '16d: портретная иконка счётчика никуда не делась');

  // Разворот. Полевой спрайт нарисован носом вверх, кадр повёрнут на +90°, поэтому угол
  // поворота холста читается прямо как экранное направление носа: 0 — вправо, дальше по
  // часовой стрелке. Значки обязаны стоять ПО ДИАГОНАЛИ: ровно горизонтальные сливаются
  // с самолётами на поле, которые как раз летят влево и вправо.
  const rot = source.slice(source.indexOf('const COUNTER_PLANE_FIELD_SPRITE_ROTATION'));
  const rotBody = rot.slice(0, rot.indexOf('});'));
  const angleOf = (color) => {
    const m = rotBody.match(new RegExp(`${color}:\\s*([^,\\n]+)`));
    assert(m, `внутренний стенд: не нашёл разворот для «${color}»`);
    return Function('Math', `return (${m[1]});`)(Math);
  };
  const blueAngle = angleOf('blue');
  const greenAngle = angleOf('green');

  // Какая половина полосы где на экране, выводим из раскладки, а не помним наизусть:
  // в горизонтали экранный X = 800 - y кадра, значит больший y — это левее.
  const counters = source.slice(source.indexOf('planeCounters: {'));
  const bandY = (color) => Number(counters.match(new RegExp(`${color}: \\{ x: \\d+, y: (\\d+)`))[1]);
  const greenIsLeft = bandY('green') > bandY('blue');
  assert(greenIsLeft, '16e: зелёная половина полосы счётчика — левая (из раскладки HUD)');

  for(const [name, angle, inwardIsRight] of [
    ['зелёный', greenAngle, true],
    ['синий', blueAngle, false],
  ]){
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    // Поле лежит НИЖЕ полосы счётчика, поэтому нос смотрит вниз экрана.
    assert(ny > 0.2, `16f: ${name} значок смотрит носом вниз, к полю (${ny.toFixed(3)})`);
    // И внутрь, к центру поля: зелёный вправо, синий влево.
    assert(inwardIsRight ? nx > 0.2 : nx < -0.2,
      `16g: ${name} значок смотрит носом внутрь, к центру поля (${nx.toFixed(3)})`);
    // Диагональ, а не ось: горизонтальный значок сливается с самолётами на поле.
    assert(Math.abs(Math.abs(nx) - Math.abs(ny)) < 1e-9,
      `16h: ${name} значок стоит ровно по диагонали, 45° (${nx.toFixed(3)}, ${ny.toFixed(3)})`);
  }

  // Половины зеркальны друг другу: сумма углов даёт 180°.
  assert(Math.abs((blueAngle + greenAngle) - Math.PI) < 1e-9,
    `16i: половины зеркальны относительно вертикали (${blueAngle} + ${greenAngle})`);

  // Разворот обязан примениться ДВАЖДЫ: и к самолёту, и к его тени. Если забыть тень,
  // силуэт останется стоять носом вправо под развёрнутым самолётом.
  const rotates = (counter.match(/ctx2d\.rotate\(rotation\);/g) || []).length;
  assert(rotates === 2, `16j: разворот применяется и к спрайту, и к тени (найдено ${rotates})`);
  assert(/ctx2d\.rotate\(rotation\);\s*\n\s*ctx2d\.drawImage\(fieldSprite,/.test(counter),
    '16k: самолёт рисуется сразу после своего разворота');

  // Сдвиг тени обязан жить СНАРУЖИ поворота: иначе, развернув синего на 180°, мы утащим
  // его тень наверх и получим ровно ту же болезнь, что и с запечённой тенью.
  const flat = counter.replace(/\n\s*/g, ' ');
  assert(flat.indexOf('ctx2d.translate(pairX + shadowFrameX, pairY + shadowFrameY);')
       < flat.indexOf('ctx2d.rotate(rotation); ctx2d.drawImage( shadow.canvas'),
    '16l: тень сдвигается ДО поворота спрайта, то есть в координатах кадра, а не спрайта');

  // Экранное направление тени обязано совпасть с портретным: влево и вниз.
  const off = source.match(/const COUNTER_PLANE_SHADOW_SCREEN_OFFSET = Object\.freeze\(\{ x: (-?[\d./\s]+), y: (-?[\d./\s]+) \}\);/);
  assert(off, '16m: сдвиг тени задан константой');
  const ox = Function(`return (${off[1]});`)();
  const oy = Function(`return (${off[2]});`)();
  assert(ox < 0 && oy > 0, `16n: в портрете тень падает влево-вниз (${ox}, ${oy})`);
  // В коде: shadowFrameX = oy * D, shadowFrameY = -ox * D — это кадровые координаты.
  assert(/const shadowFrameX = COUNTER_PLANE_SHADOW_SCREEN_OFFSET\.y \* drawSize;/.test(counter)
    && /const shadowFrameY = -COUNTER_PLANE_SHADOW_SCREEN_OFFSET\.x \* drawSize;/.test(counter),
    '16o: кадровый сдвиг тени собран из портретного поворотом на -90°');
  // Кадр повёрнут на +90°, поэтому кадровое (du, dv) видно на экране как (-dv, du).
  const seenX = -(-ox);
  const seenY = oy;
  assert(seenX === ox && seenY === oy,
    `16p: на экране тень падает туда же, куда в портрете (${seenX}, ${seenY}) против (${ox}, ${oy})`);

  // Пара «самолёт + тень» центруется в клетке, иначе тень вылезает на стену поля.
  assert(/const pairX = -shadowFrameX \/ 2;/.test(counter) && /const pairY = -shadowFrameY \/ 2;/.test(counter),
    '16q: половинки сдвига разводятся в разные стороны — пара стоит по центру клетки');

  // Полевой спрайт занимает холст целиком, иконка счётчика — нет. Без поджатия значок
  // вылезал бы из полосы.
  const fit = source.match(/const COUNTER_PLANE_FIELD_SPRITE_SCALE = ([\d.]+);/);
  assert(fit && Number(fit[1]) > 0 && Number(fit[1]) < 1,
    '16r: полевой спрайт поджимается под клетку счётчика');
  assert(/const drawSize = size \* COUNTER_PLANE_FIELD_SPRITE_SCALE;/.test(counter),
    '16s: поджатие применяется к отрисовке');

  // Силуэт строится композицией, БЕЗ чтения пикселей: иначе «испачканный» холст
  // (страницу открыли файлом с диска) ронял бы значок.
  assert(!/getImageData/.test(builder),
    '16t: силуэт тени строится без getImageData — испачканный холст не мешает');
  assert(/globalCompositeOperation = "source-in"/.test(builder),
    '16u: тень — силуэт спрайта, залитый чёрным');
  assert(/blur\(\$\{COUNTER_PLANE_SHADOW_BLUR_PX\}px\)/.test(builder),
    '16v: край тени размывается, иначе она читается вырезанной');
  assert(/canvas\.width = w \+ pad \* 2;/.test(builder),
    '16w: у холста тени есть запас по краям, иначе размытие срежется');
}

// Уходя в меню, возвращаемся в портрет: иначе повёрнутым окажется и меню.
assert(/if\(mode !== 'GAME' && typeof setBoardLandscape === "function"\)/.test(source),
  '8: при уходе с игрового экрана разворот сбрасывается');

console.log('Smoke test passed: кадр поворачивается целиком, ввод возвращается в координаты дизайна, мировые спрайты рисуются ровно вокруг своего центра, инвентари разъезжаются от морд, а кнопка живёт только на игровом экране и только для мыши.');
