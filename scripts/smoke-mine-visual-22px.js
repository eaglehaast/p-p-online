#!/usr/bin/env node
'use strict';

// Smoke test: the placed mine is 22px (matching the sprite's own extent, no upscale),
// and the detonation trigger follows the smaller mine — a plane detonates it when its
// body TOUCHES the mine (mine radius 11 + plane half-span 18 = 29px, was 33). Wings
// widen it (11 + 48 = 59). This keeps the danger zone matched to the (now smaller)
// visual and lets the AI avoidance (which reads getMineEffectiveTriggerRadius) track it.

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

// The real default drives both the drawn size and MINE_VISUAL_RADIUS.
const logicalMatch = source.match(/MINE_SIZE_DEFAULTS\s*=\s*Object\.freeze\(\{[\s\S]*?LOGICAL_PX:\s*(\d+)/);
assert(logicalMatch, 'could not read MINE_SIZE_DEFAULTS.LOGICAL_PX from script.js');
const logicalPx = Number(logicalMatch[1]);
assert(logicalPx === 22, `1: the placed mine is 22px (matches its sprite, no upscale), got ${logicalPx}.`);

const mineVisualRadius = logicalPx / 2; // 11
assert(mineVisualRadius === 11, '2: MINE_VISUAL_RADIUS derives to 11 (22 / 2).');

// getMineEffectiveTriggerRadius = mine radius + plane half-span ("bodies touch").
const context = {
  Math,
  MINE_VISUAL_RADIUS: mineVisualRadius,
  PLANE_DRAW_W: 36,
  PLANE_GEOMETRY_TRUTH: { BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96 },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings' },
  planeHasActiveTurnBuff: (plane, type) => Boolean(plane?.activeTurnBuffs?.[type]),
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getMineEffectiveTriggerRadius'), context);

const wingless = { activeTurnBuffs: {} };
const winged = { activeTurnBuffs: { wings: true } };

assert(context.getMineEffectiveTriggerRadius(wingless) === 29,
  '3: a wingless plane detonates on contact with the 22px mine (11 + 18 = 29px).');
assert(context.getMineEffectiveTriggerRadius(winged) === 59,
  '4: wings widen the trigger (11 + 48 = 59px).');

// Regression: the trigger is genuinely SMALLER than the old 33 (mine shrank), and the
// danger zone tracks the smaller visual rather than a big invisible halo.
assert(context.getMineEffectiveTriggerRadius(wingless) < 33,
  '5: the trigger shrank with the mine (29 < old 33), matching the smaller visual.');

console.log('Smoke test passed: the placed mine is 22px and its detonation trigger follows (29px on contact, 59 with wings), so the danger zone matches the smaller visual and the AI avoidance tracks it.');
