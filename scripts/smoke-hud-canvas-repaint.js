#!/usr/bin/env node
'use strict';

// Smoke test: холст табло перерисовывается только когда на нём что-то меняется.
//
// hudCanvas — это 460x800 на весь кадр, и до сих пор он очищался и рисовался заново
// в КАЖДОМ gameDraw, хотя табло меняется редко. В горизонтали холст растянут на весь
// экран, поэтому лишняя перерисовка стоит там дороже всего: замер композиции кадра
// дал 20.5мс против 17.7мс после правки (в портрете 8.3 против 7.5).
//
// Цена ошибки здесь — подвисшее табло, поэтому проверяем ровно две вещи:
//   1) подпись НЕ меняется, когда не изменилось ничего (иначе экономии нет);
//   2) подпись меняется от каждого входа, от которого зависит картинка.
// Плюс инварианты по исходнику: холст делят с табло ещё три рисовальщика, и
// пропускать очистку можно только когда их на холсте нет.

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

const buildContext = () => {
  const context = {
    Math, Number, String,
    hudCanvas: { width: 460, height: 800 },
    selectedRuleset: 'advanced',
    turnColors: ['blue', 'green'],
    turnIndex: 0,
    phase: 'TURN',
    currentPlacer: null,
    DEBUG_LAYOUT: false,
    blueScore: 3,
    greenScore: 5,
    arcadeUi: false,
    matchScoreAnimating: false,
    landscape: false,
    points: [
      { color: 'blue', isAlive: true, burning: false, penalty: false, timer: null },
      { color: 'blue', isAlive: true, burning: false, penalty: false, timer: null },
      { color: 'green', isAlive: true, burning: false, penalty: false, timer: null },
      { color: 'green', isAlive: false, burning: false, penalty: false, timer: null },
    ],
  };
  vm.createContext(context);
  vm.runInContext(`
    globalThis.isArcadeScoreUiActive = () => globalThis.arcadeUi;
    globalThis.isBoardLandscapeActive = () => globalThis.landscape;
    globalThis.hasActiveMatchScoreAnimations = () => globalThis.matchScoreAnimating;
    globalThis.isPlaneRespawnPenaltyActive = (plane) => Boolean(plane && plane.penalty);
    globalThis.getHudPlaneTimerFrameImage = (plane) => (plane && plane.timer) || null;
  `, context);
  vm.runInContext(extractFunctionSource(source, 'getHudCanvasSignature'), context);
  return context;
};

// === 1. Ничего не изменилось — подпись та же, даже в другой момент времени ===
{
  const ctx = buildContext();
  const first = ctx.getHudCanvasSignature(1000);
  const later = ctx.getHudCanvasSignature(9999);
  assert(first === later,
    '1: при неизменном состоянии подпись не должна зависеть от времени — иначе перерисовка идёт каждый кадр и экономии нет');
  assert(typeof first === 'string' && first.length > 0, '1b: подпись должна быть непустой строкой');
}

// === 2. Каждый вход, от которого зависит картинка, меняет подпись ===
{
  const inputs = [
    ['размер холста',      (c) => { c.hudCanvas.width = 920; }],
    ['высота холста',      (c) => { c.hudCanvas.height = 1600; }],
    ['режим правил',       (c) => { c.selectedRuleset = 'mapeditor'; }],
    ['чей ход',            (c) => { c.turnIndex = 1; }],
    ['фаза',               (c) => { c.phase = 'AA_PLACEMENT'; }],
    ['кто расставляет',    (c) => { c.currentPlacer = 'blue'; }],
    ['отладочная разметка',(c) => { c.DEBUG_LAYOUT = true; }],
    ['аркадное табло',     (c) => { c.arcadeUi = true; }],
    // Иконки счётчиков рисуются по-разному в двух ориентациях, а размер холста при
    // повороте не меняется — значит, сам поворот обязан быть в подписи.
    ['ориентация поля',    (c) => { c.landscape = true; }],
    ['счёт синих',         (c) => { c.blueScore += 1; }],
    ['счёт зелёных',       (c) => { c.greenScore += 1; }],
    ['самолёт погиб',      (c) => { c.points[0].isAlive = false; }],
    ['самолёт горит',      (c) => { c.points[1].burning = true; }],
    ['самолёт воскрес',    (c) => { c.points[3].isAlive = true; }],
  ];
  for(const [name, mutate] of inputs){
    const ctx = buildContext();
    const before = ctx.getHudCanvasSignature(1000);
    mutate(ctx);
    const after = ctx.getHudCanvasSignature(1000);
    assert(before !== after,
      `2: подпись обязана меняться при изменении входа «${name}» — иначе табло подвиснет`);
  }
}

// === 3. Пока идёт анимация — перерисовка каждый кадр, как раньше ===
{
  const animated = [
    ['анимация счёта матча', (c) => { c.matchScoreAnimating = true; }],
    ['штраф за возрождение', (c) => { c.points[0].penalty = true; }],
    ['таймер возрождения',   (c) => { c.points[2].timer = { src: 'timer.png' }; }],
  ];
  for(const [name, mutate] of animated){
    const ctx = buildContext();
    mutate(ctx);
    assert(ctx.getHudCanvasSignature(1000) !== ctx.getHudCanvasSignature(1016),
      `3: при «${name}» подпись обязана меняться со временем, иначе анимация замрёт`);
  }
}

// === 4. Инварианты по исходнику ===

// Холст табло делят с ним подпись дальности и текст конца матча. Оба рисуют ПОСЛЕ
// renderScoreboard и стираются только его clearRect, поэтому пропускать очистку можно
// ровно тогда, когда их на холсте нет.
//
// Раньше рисовальщиков было трое: подсказку инвентаря на канвасе удалили вместе со всей
// её мёртвой машинерией — она никогда ничего не рисовала, потому что тексты у неё были
// пустыми строками.
assert(/if\(signature === hudCanvasSignature && fresh && !hudCanvasHasOverlays\) return;/.test(source),
  '4: пропуск перерисовки обязан учитывать чужие рисунки на холсте, иначе они остаются висеть');
assert(/hudCtx\.clearRect\(0, 0, hudCanvas\.width, hudCanvas\.height\);\s*\n\s*hudCanvasHasOverlays = false;/.test(source),
  '4b: очистка холста снимает флаг чужих рисунков');
const overlayMarks = (source.match(/markHudCanvasOverlayDrawn\(\)/g) || []).length;
assert(overlayMarks === 3,
  `4c: флаг взводят ровно два рисовальщика поверх табло плюс сама функция-пометка, найдено ${overlayMarks}`);
const aimFn = source.slice(source.indexOf('function drawAimOverlay('));
assert(/markHudCanvasOverlayDrawn\(\)/.test(aimFn.slice(0, 400)),
  '4d: подпись дальности помечает холст как испачканный');
// Мёртвая система не должна вернуться незаметно: на канвасе подсказок инвентаря больше
// нет, они живут в DOM (INVENTORY_TOOLTIP_TEXT_BY_TYPE) и холста не касаются.
assert(!/drawInventoryHintOnHud|inventoryHintState/.test(source),
  '4e: канвасной подсказки инвентаря больше нет — она ничего не рисовала');
assert(/if\(endTextCtx === hudCtx\) markHudCanvasOverlayDrawn\(\);/.test(source),
  '4f: текст конца матча помечает холст как испачканный');

// Присвоение width/height стирает битмап — кэш обязан сбрасываться.
const syncFn = source.slice(source.indexOf('function syncHudCanvasLayout('));
assert(/invalidateHudCanvas\(\)/.test(syncFn.slice(0, syncFn.indexOf('\n}'))),
  '4g: смена размера холста сбрасывает кэш перерисовки, иначе табло остаётся пустым');

// Страховка от входа, который не попал в подпись: холст всё равно обновляется.
assert(/const HUD_CANVAS_MAX_STALE_MS = 200;/.test(source),
  '4h: должен быть страховочный срок обновления на случай пропущенного входа');
assert(/const fresh = painted && now - hudCanvasPaintedAtMs < HUD_CANVAS_MAX_STALE_MS;/.test(source),
  '4i: страховочный срок обязан участвовать в решении о перерисовке');

console.log('Smoke test passed: подпись табло не зависит от времени в покое, меняется от каждого входа картинки, на анимациях перерисовка идёт каждый кадр, а очистку холста нельзя пропустить, пока на нём есть чужие рисунки.');
