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

const source = fs.readFileSync('script.js', 'utf8');
const extracted = [
  'getCargoSpriteSize',
  'findCargoSpawnTarget',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Number,
  Set,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  FIELD_WIDTH: 120,
  FIELD_HEIGHT: 120,
  FIELD_BORDER_OFFSET_X: 10,
  FIELD_BORDER_OFFSET_Y: 10,
  CARGO_MAX_SPAWN_ATTEMPTS: 1,
  CARGO_FALLBACK_SIZE_PX: 20,
  cargoSprite: { naturalWidth: 20, naturalHeight: 20 },
  colliders: [
    { cx: 54, cy: 52, halfWidth: 16, halfHeight: 16, rotation: 0 },
  ],
  points: [],
  PLANE_DRAW_W: 0,
  PLANE_DRAW_H: 0,
  planeHitboxesIntersect: () => false,
};

context.Math = Object.create(Math);
context.Math.random = () => 0.5; // всегда попадаем в заблокированную точку

vm.createContext(context);
vm.runInContext(extracted, context);

const spawn = context.findCargoSpawnTarget();
assert(spawn, 'Expected fallback scan to find a spawn point even when random attempt is blocked.');

const cargoSize = context.getCargoSpriteSize();
const cargoRect = {
  left: spawn.x,
  right: spawn.x + cargoSize.width,
  top: spawn.targetY,
  bottom: spawn.targetY + cargoSize.height,
};

const blockedRect = {
  left: 38,
  right: 70,
  top: 36,
  bottom: 68,
};

const intersectsBlocked = (
  cargoRect.left <= blockedRect.right
  && cargoRect.right >= blockedRect.left
  && cargoRect.top <= blockedRect.bottom
  && cargoRect.bottom >= blockedRect.top
);

assert(!intersectsBlocked, 'Spawn point should not intersect blocked collider area.');

console.log('Smoke test passed: cargo spawn uses deterministic fallback scan when random attempts are exhausted.');
