#!/usr/bin/env node
'use strict';

// Smoke test: коллайдер ромба brick_6_45.
// Картинка кирпича занимает 2×2 клетки (40×40), но сам кирпич — вписанный
// квадрат, повёрнутый на 45°, с вершинами в серединах сторон бокса; каждая
// сторона равна диагонали клетки. Коллайдер должен совпадать с ромбом, а не
// с боксом картинки: иначе прозрачные углы бокса сбивали бы самолёты.

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

function extractConstSource(source, constName){
  const signature = `const ${constName} = `;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Const not found in script.js: ${constName}`);
  const end = source.indexOf('});', start);
  if(end === -1) throw new Error(`Const end not found for: ${constName}`);
  return source.slice(start, end + 3);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');

const CELL_SIZE = 20;
const context = {
  console,
  CELL_SIZE,
  MAP_BRICK_THICKNESS: 20,
  MAP_DIAGONAL_SPRITE_NAME: 'brick_4_diagonal',
  MAP_VALID_SPRITE_NAMES: new Set(['brick_1_default', 'brick_3_mini', 'brick_4_diagonal', 'brick_5_corner', 'brick_6_45']),
  // Картинки в тесте не загружены — размеры берутся из MAP_SPRITE_BASE_SIZES.
  MAP_SPRITE_ASSETS: {},
  isSpriteReady: () => false,
  MAP_DEFAULT_SPRITE_NAME: 'brick_1_default',
  Math,
  Number,
  // Спрайт задаётся левым верхним углом — как в JSON карты.
  getSpriteColliderCenter: (sprite, baseWidth, baseHeight) => ({
    cx: sprite.x + baseWidth / 2,
    cy: sprite.y + baseHeight / 2
  }),
  getSpriteScale: (sprite) => ({
    scaleX: Number.isFinite(sprite?.scaleX) ? sprite.scaleX : 1,
    scaleY: Number.isFinite(sprite?.scaleY) ? sprite.scaleY : 1
  })
};
vm.createContext(context);

vm.runInContext(extractConstSource(source, 'MAP_SPRITE_BASE_SIZES'), context);
vm.runInContext(extractConstSource(source, 'MAP_SPRITE_COLLIDER_OVERRIDES'), context);
for(const fnName of ['getMapSpriteBaseSize', 'buildSpriteCollider', 'rotatePointToColliderLocal', 'isPointInsideCollider', 'isPointInPolygon', 'getColliderEdges']){
  vm.runInContext(extractFunctionSource(source, fnName), context);
}

// Кирпич кладём на клетки (100,100)..(140,140): центр — (120, 120).
context.sprite = { spriteName: 'brick_6_45', x: 100, y: 100 };
const collider = vm.runInContext('buildSpriteCollider(sprite, 0)', context);
const CX = 120;
const CY = 120;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

assert(collider && collider.type === 'rect', 'brick_6_45 must produce a rect collider');
assert(near(collider.cx, CX) && near(collider.cy, CY),
  `collider must be centred on the 2x2 box, got ${collider.cx}/${collider.cy}`);

// Половина стороны вписанного квадрата = CELL_SIZE * √2 / 2.
const expectedHalf = CELL_SIZE * Math.SQRT2 / 2;
assert(near(collider.halfWidth, expectedHalf) && near(collider.halfHeight, expectedHalf),
  `collider half-extents must be ${expectedHalf}, got ${collider.halfWidth}/${collider.halfHeight}`);
assert(near(collider.rotation, Math.PI / 4),
  `collider must be rotated 45°, got ${collider.rotation}`);

// Вершины ромба — середины сторон бокса.
const edges = vm.runInContext('getColliderEdges(buildSpriteCollider(sprite, 0), 0)', context);
const corners = edges.map((edge) => ({ x: edge.x1, y: edge.y1 }));
const expectedCorners = [
  { x: CX, y: CY - CELL_SIZE },
  { x: CX + CELL_SIZE, y: CY },
  { x: CX, y: CY + CELL_SIZE },
  { x: CX - CELL_SIZE, y: CY }
];
for(const expected of expectedCorners){
  const found = corners.some((corner) => near(corner.x, expected.x, 1e-9) && near(corner.y, expected.y, 1e-9));
  assert(found, `diamond vertex (${expected.x}, ${expected.y}) missing, got ${JSON.stringify(corners)}`);
}

// Точки внутри и снаружи: центр внутри, углы бокса — снаружи (там прозрачно).
const inside = (x, y) => vm.runInContext(`isPointInsideCollider(${x}, ${y}, buildSpriteCollider(sprite, 0))`, context);
assert(inside(CX, CY), 'centre must be inside the diamond');
assert(inside(CX, CY - CELL_SIZE + 1) && inside(CX + CELL_SIZE - 1, CY),
  'points just inside the vertices must be inside');
for(const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]){
  const x = CX + dx * (CELL_SIZE - 1);
  const y = CY + dy * (CELL_SIZE - 1);
  assert(!inside(x, y), `box corner (${x}, ${y}) must stay outside the diamond`);
}

// Грани ромба движок должен видеть диагональными, а не «V/H».
vm.runInContext(extractFunctionSource(source, 'getSurfaceNormal'), context);
vm.runInContext(extractFunctionSource(source, 'buildRectColliderSurfaces'), context);
context.sprite = { spriteName: 'brick_6_45', x: 100, y: 100 };
const diamondSurfaces = vm.runInContext('buildRectColliderSurfaces(buildSpriteCollider(sprite, 0))', context);
assert(diamondSurfaces.length === 4, 'diamond must expose four surfaces');
assert(diamondSurfaces.every((surface) => surface.kind === 'DIAG' && surface.type === 'diag'),
  `diamond surfaces must be diagonal, got ${diamondSurfaces.map((s) => s.kind).join(',')}`);
for(const surface of diamondSurfaces){
  assert(near(Math.abs(surface.normal.x), Math.SQRT1_2, 1e-9) && near(Math.abs(surface.normal.y), Math.SQRT1_2, 1e-9),
    `diamond normals must be 45°, got ${JSON.stringify(surface.normal)}`);
}

// Прямоугольные кирпичи переопределение не трогает.
context.sprite = { spriteName: 'brick_5_corner', x: 100, y: 100 };
const cornerCollider = vm.runInContext('buildSpriteCollider(sprite, 1)', context);
assert(near(cornerCollider.halfWidth, 20) && near(cornerCollider.halfHeight, 20) && near(cornerCollider.rotation, 0),
  'brick_5_corner must keep its plain 40x40 box collider');

const boxSurfaces = vm.runInContext('buildRectColliderSurfaces(buildSpriteCollider(sprite, 1))', context);
assert(boxSurfaces.every((surface) => surface.type === 'axis'),
  'plain bricks must keep axis-aligned surfaces');
assert(boxSurfaces.filter((s) => s.kind === 'V').length === 2 && boxSurfaces.filter((s) => s.kind === 'H').length === 2,
  'plain bricks must keep two vertical and two horizontal surfaces');

// Поворот на 90° тоже остаётся осевым (метка следует за мировой нормалью).
context.sprite = { spriteName: 'brick_1_default', x: 100, y: 100, rotate: 90 };
const rotatedSurfaces = vm.runInContext('buildRectColliderSurfaces(buildSpriteCollider(sprite, 2))', context);
assert(rotatedSurfaces.every((surface) => surface.type === 'axis'),
  '90°-rotated bricks must stay axis-aligned');

console.log('Smoke test passed: brick_6_45 collides as the inscribed 45° square (vertices at cell midpoints, box corners excluded); other bricks unchanged.');
