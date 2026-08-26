#!/usr/bin/env node
'use strict';

// Smoke test: счёт матча набирается от своего борта к центру.
//
// В портрете полосы счёта стоят одна под другой в правой колонке, и обе набираются
// сверху вниз — так и было, так и остаётся.
//
// В горизонтали кадр повёрнут: точка кадра (u,v) видна в (800 - v, u). Полосы ложатся
// вдоль нижнего края, полоса с БОЛЬШИМ y кадра оказывается ЛЕВЕЕ. Ряды нумеруются по
// возрастанию y, то есть по экрану идут справа налево — правая полоса сама собой
// набирается от своего края к центру, а левая шла от центра наружу.
//
// Проверяется не текст, а геометрия: drawMatchScore исполняется в песочнице, ловятся
// координаты нарисованных иконок, и по ним считается, с какого конца полосы лёг счёт.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

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

const source = fs.readFileSync('script.js', 'utf8');

const constantBlock = (name) => {
  const start = source.indexOf(`const ${name} =`);
  assert(start !== -1, `не нашёл константу ${name}`);
  const end = source.indexOf('\n};', start);
  return end === -1
    ? source.slice(start, source.indexOf(';', start) + 1)
    : source.slice(start, end + 3);
};

const GHOST_ALPHA = Number(source.match(/const MATCH_SCORE_GHOST_ALPHA = ([\d.]+);/)[1]);
const POINTS_TO_WIN = Number(source.match(/const POINTS_TO_WIN = (\d+);/)[1]);

// Холст, который запоминает центр каждой нарисованной иконки и её прозрачность:
// призраки рисуются с MATCH_SCORE_GHOST_ALPHA, заполненные — в полную силу.
function makeRecordingCtx(){
  let tx = 0;
  let ty = 0;
  const stack = [];
  const draws = [];
  const ctx = {
    globalAlpha: 1,
    save(){ stack.push({ tx, ty, alpha: ctx.globalAlpha }); },
    restore(){ const s = stack.pop(); if(s){ tx = s.tx; ty = s.ty; ctx.globalAlpha = s.alpha; } },
    translate(x, y){ tx += x; ty += y; },
    rotate(){},
    drawImage(){ draws.push({ x: tx, y: ty, alpha: ctx.globalAlpha }); },
    depth: () => stack.length,
  };
  return { ctx, draws };
}

function run({ landscape, blueScore, greenScore }){
  const { ctx, draws } = makeRecordingCtx();
  const sprite = { naturalWidth: 20, naturalHeight: 20 };
  const sandbox = {
    Math, Number, console,
    FRAME_BASE_HEIGHT: 800,
    POINTS_TO_WIN,
    blueScore,
    greenScore,
    matchScoreImages: { blue: sprite, green: sprite },
    matchScoreGhostImages: { blue: sprite, green: sprite },
    isSpriteReady: () => true,
    loadMatchScoreImagesIfNeeded: () => {},
    getMatchScoreScale: () => 1,
    isBoardLandscapeActive: () => landscape,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    constantBlock('MATCH_SCORE_CONTAINERS'),
    source.match(/const MATCH_SCORE_ICON_RENDER_SIZE = \d+;/)[0],
    source.match(/const MATCH_SCORE_ICON_SOURCE_INSET = \d+;/)[0],
    source.match(/const MATCH_SCORE_GHOST_ALPHA = [\d.]+;/)[0],
    source.match(/const MATCHSCORE_OFFSET_X = -?\d+;/)[0],
    extractFunctionSource(source, 'withUprightHudIcon'),
    extractFunctionSource(source, 'buildMatchScoreFrame'),
    extractFunctionSource(source, 'drawMatchScore'),
    'this.MATCH_SCORE_CONTAINERS = MATCH_SCORE_CONTAINERS; this.drawMatchScore = drawMatchScore;',
  ].join('\n'), sandbox);

  sandbox.drawMatchScore(ctx, 1, 1, 0);
  assert(ctx.depth() === 0, 'внутренний стенд: холст не оставляет незакрытый save()');

  // Полосы стоят в разных диапазонах y кадра — по ним и разводим цвета.
  const spec = sandbox.MATCH_SCORE_CONTAINERS;
  const inSpec = (draw, s) => draw.y >= s.y - 1 && draw.y <= s.y + s.height + 1;
  const byColor = {};
  for(const color of ['blue', 'green']){
    const mine = draws.filter((d) => inSpec(d, spec[color]));
    byColor[color] = {
      filled: mine.filter((d) => d.alpha > GHOST_ALPHA + 1e-6),
      ghosts: mine.filter((d) => d.alpha <= GHOST_ALPHA + 1e-6),
      spec: spec[color],
    };
  }
  return byColor;
}

// === 1. Стенд действительно ловит то, что нарисовано ===
{
  const r = run({ landscape: false, blueScore: 5, greenScore: 3 });
  assert(r.blue.ghosts.length === POINTS_TO_WIN,
    `1: призраки рисуются на все ячейки (${r.blue.ghosts.length} из ${POINTS_TO_WIN})`);
  assert(r.blue.filled.length === 5 && r.green.filled.length === 3,
    `1b: заполненных иконок ровно по счёту (${r.blue.filled.length} и ${r.green.filled.length})`);
}

// === 2. Портрет: обе полосы набираются сверху вниз, как было ===
{
  const r = run({ landscape: false, blueScore: 4, greenScore: 4 });
  for(const color of ['blue', 'green']){
    const { filled, ghosts, spec } = r[color];
    const filledMax = Math.max(...filled.map((d) => d.y));
    const emptyMin = Math.min(...ghosts.filter((g) => !filled.some((f) => f.x === g.x && f.y === g.y)).map((g) => g.y));
    assert(filledMax <= emptyMin,
      `2: в портрете ${color} набирается от верха полосы вниз (последняя занятая ${filledMax}, первая пустая ${emptyMin})`);
    assert(Math.min(...filled.map((d) => d.y)) < spec.y + spec.height / 2,
      `2b: в портрете первые очки ${color} лежат в верхней половине полосы`);
  }
}

// === 3. Горизонталь: обе полосы набираются от своего борта к центру ===
//
// Экранный x = 800 - y кадра. «Свой борт» — дальний от центра экрана край полосы.
{
  const r = run({ landscape: true, blueScore: 4, greenScore: 4 });
  const screenX = (frameY) => 800 - frameY;
  const centreX = screenX(800 / 2);

  for(const color of ['blue', 'green']){
    const { filled, ghosts, spec } = r[color];
    const bandCentre = screenX(spec.y + spec.height / 2);
    const onLeft = bandCentre < centreX;

    const filledX = filled.map((d) => screenX(d.y));
    const emptyX = ghosts
      .filter((g) => !filled.some((f) => f.x === g.x && f.y === g.y))
      .map((g) => screenX(g.y));

    // Занятые ячейки обязаны лежать ДАЛЬШЕ от центра экрана, чем свободные.
    const filledFromCentre = Math.min(...filledX.map((x) => Math.abs(x - centreX)));
    const filledFarthest = Math.max(...filledX.map((x) => Math.abs(x - centreX)));
    const emptyNearest = Math.min(...emptyX.map((x) => Math.abs(x - centreX)));

    assert(filledFarthest >= emptyNearest,
      `3: ${color} набирается со стороны своего борта (дальняя занятая ${filledFarthest}, ближняя пустая ${emptyNearest})`);
    assert(filledFromCentre >= emptyNearest - 1e-6,
      `3b: ${color} — ни одна занятая ячейка не ближе к центру, чем свободная`);

    // И то же самое прямым замером: у левой полосы счёт лежит слева, у правой справа.
    const filledMid = filledX.reduce((a, b) => a + b, 0) / filledX.length;
    const emptyMid = emptyX.reduce((a, b) => a + b, 0) / emptyX.length;
    assert(onLeft ? filledMid < emptyMid : filledMid > emptyMid,
      `3c: ${color} лежит на ${onLeft ? 'левом' : 'правом'} борту (счёт ${Math.round(filledMid)}, пусто ${Math.round(emptyMid)})`);
  }
}

// === 4. Полосы разъезжаются в РАЗНЫЕ стороны, а не в одну ===
//
// До правки обе набирались справа налево, и зелёная росла от центра наружу.
{
  const r = run({ landscape: true, blueScore: 2, greenScore: 2 });
  const screenX = (frameY) => 800 - frameY;
  const blueMid = r.blue.filled.map((d) => screenX(d.y)).reduce((a, b) => a + b, 0) / r.blue.filled.length;
  const greenMid = r.green.filled.map((d) => screenX(d.y)).reduce((a, b) => a + b, 0) / r.green.filled.length;
  assert(greenMid < 400 && blueMid > 400,
    `4: первые очки лежат по разные стороны от центра (зелёный ${Math.round(greenMid)}, синий ${Math.round(blueMid)})`);
}

// === 5. Ячейки те же самые, просто заняты с другого конца ===
//
// Разворот не должен ни сдвигать сетку, ни терять ячейки.
{
  const portrait = run({ landscape: false, blueScore: 0, greenScore: 0 });
  const land = run({ landscape: true, blueScore: 0, greenScore: 0 });
  for(const color of ['blue', 'green']){
    const key = (list) => list.map((d) => `${Math.round(d.x)},${Math.round(d.y)}`).sort().join(' ');
    assert(key(portrait[color].ghosts) === key(land[color].ghosts),
      `5: набор ячеек ${color} в обеих ориентациях один и тот же`);
  }
}

console.log('Smoke test passed: в портрете счёт набирается сверху вниз, в горизонтали обе полосы набираются от своего борта к центру, сетка ячеек при этом не меняется.');
