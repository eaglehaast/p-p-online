#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
  if(bodyStart === -1) throw new Error(`Function body start not found for: ${fnName}`);
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

function buildColliderAabb(collider){
  const hw = Number.isFinite(collider?.halfWidth) ? collider.halfWidth : 0;
  const hh = Number.isFinite(collider?.halfHeight) ? collider.halfHeight : 0;
  const rotation = Number.isFinite(collider?.rotation) ? collider.rotation : 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const aabbHalfWidth = Math.abs(cos) * hw + Math.abs(sin) * hh;
  const aabbHalfHeight = Math.abs(sin) * hw + Math.abs(cos) * hh;
  return {
    left: collider.cx - aabbHalfWidth,
    right: collider.cx + aabbHalfWidth,
    top: collider.cy - aabbHalfHeight,
    bottom: collider.cy + aabbHalfHeight,
  };
}

function intersectsRectAabb(a, b){
  return (
    a.left <= b.right
    && a.right >= b.left
    && a.top <= b.bottom
    && a.bottom >= b.top
  );
}

const source = fs.readFileSync('script.js', 'utf8');
const extracted = [
  'getCargoSpriteSize',
  'findCargoSpawnTarget',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const randomValues = [];
for(let i = 0; i < 4000; i += 1){
  if(i % 16 < 4){
    randomValues.push(0.49); // часто пытаемся попасть в зону препятствия
  } else {
    randomValues.push((i % 997) / 996);
  }
}
let randomIndex = 0;

const context = {
  Number,
  Set,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  FIELD_WIDTH: 300,
  FIELD_HEIGHT: 300,
  FIELD_BORDER_OFFSET_X: 20,
  FIELD_BORDER_OFFSET_Y: 20,
  CARGO_MAX_SPAWN_ATTEMPTS: 300,
  CARGO_FALLBACK_SIZE_PX: 20,
  cargoSprite: { naturalWidth: 20, naturalHeight: 20 },
  colliders: [
    { cx: 150, cy: 150, halfWidth: 45, halfHeight: 30, rotation: 0 },
    { cx: 90, cy: 220, halfWidth: 35, halfHeight: 20, rotation: Math.PI / 4 },
  ],
  points: [],
  PLANE_DRAW_W: 0,
  PLANE_DRAW_H: 0,
};

context.Math = Object.create(Math);
context.Math.random = () => {
  const value = randomValues[randomIndex % randomValues.length];
  randomIndex += 1;
  return value;
};

vm.createContext(context);
vm.runInContext(extracted, context);

const cargoSize = context.getCargoSpriteSize();
const playableRect = {
  left: context.FIELD_LEFT + context.FIELD_BORDER_OFFSET_X,
  right: context.FIELD_LEFT + context.FIELD_WIDTH - context.FIELD_BORDER_OFFSET_X,
  top: context.FIELD_TOP + context.FIELD_BORDER_OFFSET_Y,
  bottom: context.FIELD_TOP + context.FIELD_HEIGHT - context.FIELD_BORDER_OFFSET_Y,
};

for(let i = 0; i < 500; i += 1){
  const spawn = context.findCargoSpawnTarget();
  assert(spawn, `Expected spawn candidate at iteration ${i}`);

  const cargoRect = {
    left: spawn.x,
    right: spawn.x + cargoSize.width,
    top: spawn.targetY,
    bottom: spawn.targetY + cargoSize.height,
  };

  assert(cargoRect.left >= playableRect.left, `Spawn left out of playable field at iteration ${i}`);
  assert(cargoRect.right <= playableRect.right, `Spawn right out of playable field at iteration ${i}`);
  assert(cargoRect.top >= playableRect.top, `Spawn top out of playable field at iteration ${i}`);
  assert(cargoRect.bottom <= playableRect.bottom, `Spawn bottom out of playable field at iteration ${i}`);

  for(const collider of context.colliders){
    const colliderAabb = buildColliderAabb(collider);
    assert(!intersectsRectAabb(cargoRect, colliderAabb),
      `Cargo rect intersects collider AABB at iteration ${i}`);
  }
}

console.log('Smoke test passed: cargo spawn avoids collider AABBs and playable field borders.');
