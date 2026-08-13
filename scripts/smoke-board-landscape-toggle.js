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

// === 4. Разметка и стили: то, что нельзя проверить вычислением ===

assert(/id="orientationToggleBtn"/.test(markup),
  '4: на игровом экране должна быть кнопка разворота');
assert(markup.indexOf('id="orientationToggleBtn"') > markup.indexOf('id="gsFrame"'),
  '4b: кнопка живёт внутри игрового экрана — на меню её быть не должно');

assert(/html\.is-board-landscape #uiFrame\s*\{[^}]*rotate\(90deg\)/.test(styles),
  '5: сам кадр поворачивается на 90° — иначе поле не станет горизонтальным');
assert(/html\.is-board-landscape \.inventory-slot\s*\{[^}]*rotate\(-90deg\)/.test(styles),
  '5b: каждый квадратик инвентаря разворачивается отдельно');
assert(/html\.is-board-landscape \.orientation-toggle\s*\{[^}]*rotate\(-90deg\)/.test(styles),
  '5c: кнопка остаётся в правом нижнем углу и стоит ровно');
assert(/html\.is-board-landscape #goatIndicator\s*\{[\s\S]*?bottom:\s*0/.test(styles),
  '5d: воробей прижат к углу кадра (460,800) — это левый нижний угол экрана');
assert(/@media \(hover: hover\) and \(pointer: fine\)/.test(styles),
  '5e: кнопка только для мыши — на тач-устройствах ориентацию задаёт система');

// Масштаб кадра обязан считаться от переставленных габаритов, иначе в горизонтали
// поле либо не влезет, либо останется крошечным.
assert(/landscape \? FRAME_BASE_HEIGHT : FRAME_BASE_WIDTH/.test(source),
  '6: --ui-scale должен вписывать повёрнутую габаритную коробку');
// Уходя в меню, возвращаемся в портрет: иначе повёрнутым окажется и меню.
assert(/if\(mode !== 'GAME' && typeof setBoardLandscape === "function"\)/.test(source),
  '7: при уходе с игрового экрана разворот сбрасывается');

console.log('Smoke test passed: кадр поворачивается целиком, ввод возвращается в координаты дизайна (углы и центр сходятся), кнопка живёт только на игровом экране и только для мыши.');
