#!/usr/bin/env node
'use strict';

// Smoke test: грубый отсев поверхностей не меняет ответа.
//
// findFirstSurfaceHit ищет первое касание отрезка движения со стенами. Раньше она честно
// считала точное касание для КАЖДОЙ поверхности карты. Замер на настоящей партии: 244
// поверхности, 76.7 млн точных расчётов за четыре хода ИИ, и лишь 2.18% из них кончались
// попаданием. Остальное — перебор заведомо далёких стен.
//
// Теперь перед точным расчётом стоит проверка габаритов: если прямоугольник поверхности не
// пересекается с прямоугольником отрезка, расширенным на радиус, — считать нечего. Стало
// 24.5 расчёта на вызов вместо 228.
//
// Ускорение здесь не главное. Главное — что ответ обязан остаться ТЕМ ЖЕ. Поэтому тест не
// меряет скорость: он тысячу раз сравнивает быстрый ответ с медленным эталоном, который
// перебирает всё подряд. Эталон живёт прямо здесь и намеренно тупой.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Функция не найдена: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');

const context = {
  Math, Number,
  colliderSurfaces: [],
};
vm.createContext(context);
vm.runInContext([
  source.match(/^const SURFACE_PRIORITY = \{[^}]*\};/m)[0],
  extractFunctionSource(source, 'getSurfaceKindForPriority'),
  extractFunctionSource(source, 'isPointOnSegment'),
  extractFunctionSource(source, 'getEndpointHit'),
  extractFunctionSource(source, 'getSurfaceHit'),
  extractFunctionSource(source, 'findFirstSurfaceHit'),
  extractFunctionSource(source, 'annotateSurfaceBounds'),
].join('\n\n'), context);

// Поле из стен: решётка кирпичей плюс рамка. Похоже на настоящую карту — важно, чтобы
// поверхностей было много и они лежали в разных местах, иначе отсев нечего отсеивать.
function buildSurfaces(){
  const out = [];
  const push = (x1, y1, x2, y2, nx, ny, kind, id) => out.push({
    p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 },
    normal: { x: nx, y: ny }, kind, type: 'brick', id,
  });
  let n = 0;
  for(let gx = 0; gx < 8; gx += 1){
    for(let gy = 0; gy < 8; gy += 1){
      const x = 20 + gx * 42;
      const y = 20 + gy * 74;
      push(x, y, x + 30, y, 0, -1, 'H', `b${n++}`);
      push(x, y + 20, x + 30, y + 20, 0, 1, 'H', `b${n++}`);
      push(x, y, x, y + 20, -1, 0, 'V', `b${n++}`);
      push(x + 30, y, x + 30, y + 20, 1, 0, 'V', `b${n++}`);
    }
  }
  push(0, 0, 360, 0, 0, 1, 'H', 'border-top');
  push(0, 640, 360, 640, 0, -1, 'H', 'border-bottom');
  push(0, 0, 0, 640, 1, 0, 'V', 'border-left');
  push(360, 0, 360, 640, -1, 0, 'V', 'border-right');
  return out;
}

// Медленный эталон: тот же разбор одновременных касаний, но БЕЗ отсева по габаритам.
// Намеренно повторяет логику руками — чтобы сравнивать было с чем.
function bruteForceFirstHit(p0, p1, radius){
  const moveX = p1.x - p0.x;
  const moveY = p1.y - p0.y;
  const EPS_T = 1e-4;
  const EPS_DOT = 1e-6;
  const priority = { DIAG: 3, V: 2, H: 1 };
  const dot = (entry) => Math.abs(moveX * entry.normal.x + moveY * entry.normal.y);
  let best = null;
  for(const surface of context.colliderSurfaces){
    const hit = context.getSurfaceHit(p0, p1, radius, surface);
    if(!hit) continue;
    if(!best){ best = hit; continue; }
    if(hit.t < best.t - EPS_T){ best = hit; continue; }
    if(Math.abs(hit.t - best.t) <= EPS_T){
      const hd = dot(hit);
      const bd = dot(best);
      if(hd > bd + EPS_DOT){ best = hit; continue; }
      if(Math.abs(hd - bd) <= EPS_DOT
        && (priority[context.getSurfaceKindForPriority(hit.surface)] ?? 0)
         > (priority[context.getSurfaceKindForPriority(best.surface)] ?? 0)){
        best = hit;
      }
    }
  }
  return best;
}

const snapshot = (hit) => (hit
  ? `${hit.t.toFixed(9)}|${hit.hitPoint.x.toFixed(6)},${hit.hitPoint.y.toFixed(6)}`
    + `|${hit.normal.x.toFixed(6)},${hit.normal.y.toFixed(6)}|${hit.surface.id}`
  : 'нет');

// Броски повторяемы: тест, который иногда падает, никому не нужен.
let seed = 20260419;
const random = () => {
  seed ^= seed << 13; seed |= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5; seed |= 0;
  return ((seed >>> 0) % 1000000) / 1000000;
};

// === 1. Габариты проставляются и они верные ===
{
  const surface = context.annotateSurfaceBounds({
    p1: { x: 30, y: 90 }, p2: { x: 10, y: 20 }, normal: { x: 0, y: -1 },
  });
  assert(surface.minX === 10 && surface.maxX === 30 && surface.minY === 20 && surface.maxY === 90,
    '1: габариты берутся по обоим концам, в любом порядке');
  assert(/\.map\(annotateSurfaceBounds\)/.test(extractFunctionSource(source, 'rebuildCollisionSurfaces')),
    '1b: при перестройке карты габариты проставляются всем поверхностям');
}

// === 2. ГЛАВНОЕ: ответ не изменился ===
{
  context.colliderSurfaces = buildSurfaces().map(context.annotateSurfaceBounds);
  assert(context.colliderSurfaces.length > 200,
    `2: поверхностей должно быть много, иначе отсеивать нечего (сейчас ${context.colliderSurfaces.length})`);

  let checked = 0;
  let hits = 0;
  for(let i = 0; i < 1500; i += 1){
    const p0 = { x: random() * 360, y: random() * 640 };
    const p1 = { x: random() * 360, y: random() * 640 };
    const radius = 2 + random() * 18;
    const fast = context.findFirstSurfaceHit(p0, p1, radius);
    const slow = bruteForceFirstHit(p0, p1, radius);
    assert(snapshot(fast) === snapshot(slow),
      `2b: отсев изменил ответ на броске ${i}: быстрый «${snapshot(fast)}», эталон «${snapshot(slow)}»`);
    checked += 1;
    if(fast) hits += 1;
  }
  assert(checked === 1500, '2c: сверены все броски');
  assert(hits > 200,
    `2d: попаданий должно быть много, иначе сверялась пустота (сейчас ${hits})`);
}

// === 3. Короткие отрезки у самой стены — там отсев опаснее всего ===
//
// Габариты нулевой длины и касание ровно на границе радиуса: если расширение на радиус
// забыть, отсев начнёт выбрасывать настоящие касания именно здесь.
{
  for(let i = 0; i < 400; i += 1){
    const wall = context.colliderSurfaces[(i * 7) % context.colliderSurfaces.length];
    const radius = 1 + random() * 20;
    const near = {
      x: wall.p1.x + (random() - 0.5) * radius * 2.2,
      y: wall.p1.y + (random() - 0.5) * radius * 2.2,
    };
    const p1 = { x: near.x + (random() - 0.5) * 2, y: near.y + (random() - 0.5) * 2 };
    assert(snapshot(context.findFirstSurfaceHit(near, p1, radius)) === snapshot(bruteForceFirstHit(near, p1, radius)),
      `3: отсев изменил ответ вплотную к стене, бросок ${i}`);
  }
}

// === 4. Отсев вообще работает ===
//
// Без этой проверки предыдущие прошли бы и на «фильтре», который никого не отсеивает:
// ответы совпадут, а смысла в правке не будет.
{
  let precise = 0;
  const original = context.getSurfaceHit;
  context.getSurfaceHit = function(...args){
    precise += 1;
    return original.apply(this, args);
  };
  const p0 = { x: 40, y: 40 };
  const p1 = { x: 60, y: 60 };
  context.findFirstSurfaceHit(p0, p1, 10);
  context.getSurfaceHit = original;

  const total = context.colliderSurfaces.length;
  assert(precise < total / 4,
    `4: короткий отрезок в углу карты считается точно лишь с немногими стенами `
    + `(посчитано ${precise} из ${total})`);
}

console.log('smoke-collider-broadphase: OK');
