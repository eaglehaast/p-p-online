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
    INVENTORY_LANDSCAPE_SHIFT_PX: { blue: 42, green: -48 },
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
      const slotCenterX = container.x + shift + tipCtx.INVENTORY_UI_CONFIG.slots[
        tipCtx.INVENTORY_UI_CONFIG.slotOrder[slotIndex]
      ].frame.x + 55 / 2;
      assert(Math.abs(centerX - slotCenterX) <= 0.5,
        `11c: подсказка стоит вровень со своим предметом (${color} ${slotIndex}): ${centerX} против ${slotCenterX}`);

      // Со стороны поля: зелёный столбец слева на экране — подсказка правее, то есть
      // МЕНЬШЕ по Y кадра; синий столбец справа — подсказка левее, то есть больше.
      const nearEdge = color === 'green' ? centerY + W / 2 : centerY - W / 2;
      const containerEdge = color === 'green' ? container.y : container.y + container.h;
      assert(Math.abs(Math.abs(containerEdge - nearEdge) - GAP) <= 0.5,
        `11d: между подсказкой и полосой инвентаря ровно зазор (${color} ${slotIndex})`);
      const overlaps = color === 'green'
        ? nearEdge > container.y
        : nearEdge < container.y + container.h;
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
  // Выход за грань — тоже портретный: в портрете за край уходит 15px.
  const portraitPeek = -px(base, 'left');
  assert(Math.abs((-(centerV - halfAlongV)) - portraitPeek) <= 0.5,
    `12f: за грань уходит столько же, сколько в портрете: ${-(centerV - halfAlongV)} против ${portraitPeek}`);
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

// Уходя в меню, возвращаемся в портрет: иначе повёрнутым окажется и меню.
assert(/if\(mode !== 'GAME' && typeof setBoardLandscape === "function"\)/.test(source),
  '8: при уходе с игрового экрана разворот сбрасывается');

console.log('Smoke test passed: кадр поворачивается целиком, ввод возвращается в координаты дизайна, мировые спрайты рисуются ровно вокруг своего центра, инвентари разъезжаются от морд, а кнопка живёт только на игровом экране и только для мыши.');
