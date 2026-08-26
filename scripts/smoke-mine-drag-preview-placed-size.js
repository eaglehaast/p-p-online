#!/usr/bin/env node
'use strict';

// Smoke test: перетаскиваемая мина того же размера, что и поставленная.
//
// Размер поставленной мины на экране складывается из ДВУХ множителей:
//   1) mineSizeRuntime.LOGICAL_PX в мировых единицах, отмасштабированный отношением
//      ширины поля к ширине мира (getBoardCssRect / WORLD.width);
//   2) масштаб всего кадра на экране — CSS-переменная --ui-scale, умноженная на щипок.
//
// Прежняя версия этого теста учитывала только первый и моделировала getBoardCssRect как
// экранные пиксели. В жизни она отдаёт единицы ДИЗАЙНА и всегда равна ширине мира,
// поэтому первый множитель всегда 1, а весь масштаб сидит во втором. Тест проходил, а
// перетаскиваемая мина в горизонтали была 22px против 35px у поставленной: там --ui-scale
// равен 1.6 против 1.075 в портрете, и потому расхождение бросалось в глаза именно там.

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
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

const context = {
  Number,
  WORLD: { width: 360, height: 640 },
  CANVAS_BASE_WIDTH: 360,
  mineSizeRuntime: { LOGICAL_PX: 22, SCREEN_PX: 22 },
  // Поле в единицах дизайна — ровно то, что отдаёт настоящая getBoardCssRect.
  boardRect: { width: 360 },
  uiScale: 1,
  pinchScale: 1,
  getBoardCssRect(){ return context.boardRect; },
  getEffectivePinchScale(){ return context.pinchScale; },
  window: {
    getComputedStyle: () => ({ getPropertyValue: () => String(context.uiScale) }),
  },
  document: { documentElement: {} },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getUiFrameScales'), context);
vm.runInContext(extractFunctionSource(source, 'getPlacedMineOnScreenSizePx'), context);
const size = () => Math.round(context.getPlacedMineOnScreenSizePx() * 1000) / 1000;

// === 1. Кадр не растянут: превью равно логическому размеру ===
{
  context.boardRect = { width: 360 };
  context.uiScale = 1;
  assert(size() === 22, `1: при масштабе кадра 1 превью равно поставленной мине (22px), получилось ${size()}`);
}

// === 2. Настоящие масштабы кадра из игры ===
//
// Это и есть тот случай, из-за которого правка: в горизонтали кадр растянут заметно
// сильнее, и превью в 22px выглядело почти вдвое меньше поставленной мины.
{
  context.boardRect = { width: 360 };

  context.uiScale = 1.075; // портрет
  assert(size() === 23.65, `2: в портрете превью 22 × 1.075 = 23.65, получилось ${size()}`);

  context.uiScale = 1.6;   // горизонталь
  assert(size() === 35.2, `2b: в горизонтали превью 22 × 1.6 = 35.2, получилось ${size()}`);
  assert(size() !== context.mineSizeRuntime.SCREEN_PX,
    '2c: превью больше не равно размеру иконки в инвентаре — в этом и была ошибка');
}

// === 3. Щипок тоже растягивает мину ===
{
  context.boardRect = { width: 360 };
  context.uiScale = 1.6;
  context.pinchScale = 1.5;
  assert(size() === 52.8, `3: щипок домножает превью (22 × 1.6 × 1.5 = 52.8), получилось ${size()}`);
  context.pinchScale = 1;
}

// === 4. Отношение поля к миру по-прежнему учитывается ===
//
// Сейчас поле нарисовано ровно в ширину мира, но если это когда-нибудь разойдётся,
// множитель обязан остаться.
{
  context.uiScale = 1;
  context.boardRect = { width: 540 };
  assert(size() === 33, `4: поле шире мира в 1.5 раза — превью 22 × 1.5 = 33, получилось ${size()}`);
  context.boardRect = { width: 180 };
  assert(size() === 11, `4b: поле уже мира вдвое — превью 22 × 0.5 = 11, получилось ${size()}`);
}

// === 5. Превью следует за живой правкой размера мины ===
{
  context.boardRect = { width: 360 };
  context.uiScale = 1.6;
  context.mineSizeRuntime.LOGICAL_PX = 30;
  assert(size() === 48, `5: мина выросла до 30 — превью 30 × 1.6 = 48, получилось ${size()}`);
  context.mineSizeRuntime.LOGICAL_PX = 22;
}

// === 6. До раскладки поля — безопасный откат ===
{
  context.uiScale = 1.6;
  context.boardRect = { width: 0 };
  assert(size() === 22, '6: пока поле не измерить, превью откатывается к размеру иконки инвентаря');
  context.getBoardCssRect = () => { throw new Error('board rect not ready'); };
  assert(size() === 22, '6b: падение при замере поля тоже уводит в откат, а не роняет отрисовку');
  context.getBoardCssRect = () => context.boardRect;
}

// === 7. Масштаб кадра читается там же, где и для ввода ===
//
// Если размер мины начнёт считать свой масштаб отдельно от toDesignCoords, они разъедутся
// ровно так же, как разъехались getBoardCssRect и --ui-scale.
{
  const sizeFn = extractFunctionSource(source, 'getPlacedMineOnScreenSizePx');
  assert(/getUiFrameScales\(\)/.test(sizeFn),
    '7: размер мины берёт масштаб кадра общей функцией');
  const inputFn = extractFunctionSource(source, 'toDesignCoords');
  assert(/getUiFrameScales\(\)/.test(inputFn),
    '7b: пересчёт ввода берёт масштаб той же функцией');
}

console.log('Smoke test passed: перетаскиваемая мина совпадает с поставленной при любом масштабе кадра, включая щипок, и откатывается к иконке только до раскладки поля.');
