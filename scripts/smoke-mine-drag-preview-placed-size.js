#!/usr/bin/env node
'use strict';

// Smoke test: the mine DRAG preview matches the PLACED mine, not the inventory icon.
// The placed mine is drawn at mineSizeRuntime.LOGICAL_PX in WORLD units, then the board is
// scaled to boardRect.width on screen — so its on-screen size is LOGICAL_PX × (boardWidth /
// WORLD.width). getPlacedMineOnScreenSizePx returns exactly that, so the dragged mine
// previews its real field footprint. It falls back to the inventory SCREEN_PX only before
// the board is laid out (board rect not measurable yet).

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
  boardRect: { width: 360 },
  getBoardCssRect(){ return context.boardRect; },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getPlacedMineOnScreenSizePx'), context);
const size = () => context.getPlacedMineOnScreenSizePx();

// 1. Board rendered at its native world width (scale 1): preview == LOGICAL_PX.
context.boardRect = { width: 360 };
assert(size() === 22, `1: at board scale 1, the drag preview equals the placed mine (22px), got ${size()}.`);

// 2. Board displayed LARGER than world (e.g. 540px CSS for a 360-unit world, scale 1.5):
//    the placed mine looks 33px on screen, so the drag preview must be 33px too — this is
//    exactly the case where the old inventory-sized (22px) ghost looked too small.
context.boardRect = { width: 540 };
assert(size() === 33, `2: at board scale 1.5, the preview grows with the placed mine (22 × 1.5 = 33), got ${size()}.`);
assert(size() !== context.mineSizeRuntime.SCREEN_PX,
  '2b: the scaled preview no longer equals the inventory-icon SCREEN_PX (that was the bug).');

// 3. Board displayed SMALLER than world (scale 0.5): preview shrinks to match too.
context.boardRect = { width: 180 };
assert(size() === 11, `3: at board scale 0.5, the preview shrinks with the placed mine (22 × 0.5 = 11), got ${size()}.`);

// 4. The preview tracks a live-resized mine: grow LOGICAL_PX -> preview grows with it.
context.boardRect = { width: 360 };
context.mineSizeRuntime.LOGICAL_PX = 30;
assert(size() === 30, `4: resizing the mine (LOGICAL_PX 30) grows the preview to match, got ${size()}.`);
context.mineSizeRuntime.LOGICAL_PX = 22;

// 5. Board not laid out yet (zero / missing width) -> safe fallback to inventory SCREEN_PX.
context.boardRect = { width: 0 };
assert(size() === 22, '5: before the board is measurable, the preview falls back to the inventory SCREEN_PX.');
context.getBoardCssRect = () => { throw new Error('board rect not ready'); };
assert(size() === 22, '5b: a throwing board-rect lookup also falls back to SCREEN_PX (no crash).');

console.log('Smoke test passed: the mine drag preview matches the placed mine on screen (LOGICAL_PX × board scale) at any board scale and tracks a resized mine, falling back to the inventory size only before layout.');
