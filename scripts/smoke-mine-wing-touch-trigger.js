#!/usr/bin/env node
'use strict';

// Smoke test: mine detonation = "the plane's WING touches the mine's EDGE" (contact),
// NOT "the plane reaches the mine's centre". getMineEffectiveTriggerRadius returns
//   mineRadius (live, mineSizeRuntime.LOGICAL_PX / 2) + wingHalfSpan
// where the wingless wing half-span is ONE green-keyed value applied to BOTH colours
// (mineTriggerRuntime.WING_HALF_SPAN_PX). This asserts:
//   - the trigger is edge-to-edge (radius + half-span), strictly bigger than the mine
//     radius alone, so a wing grazing the rim fires it (centre-touch would be too late);
//   - blue and green get the IDENTICAL trigger (same rule, measured by green's wing);
//   - the trigger TRACKS the live mine size (resize the mine -> danger zone follows);
//   - the wing half-span is live-tunable (calibration lever for the exact green wing tip);
//   - wings widen the trigger to the broadwing half-span, still colour-uniform.

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

// Live, mutable runtime objects (mirrors the game's mineSizeRuntime / mineTriggerRuntime).
const context = {
  Math,
  mineSizeRuntime: { LOGICAL_PX: 22 },       // radius 11
  mineTriggerRuntime: { WING_HALF_SPAN_PX: 18 }, // green wing tip, default = box edge
  PLANE_GEOMETRY_TRUTH: { BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96 },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings' },
  planeHasActiveTurnBuff: (plane, type) => Boolean(plane?.activeTurnBuffs?.[type]),
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getMineEffectiveTriggerRadius'), context);

const bluePlane = { color: 'blue', activeTurnBuffs: {} };
const greenPlane = { color: 'green', activeTurnBuffs: {} };
const winged = { color: 'blue', activeTurnBuffs: { wings: true } };
const trigger = (p) => context.getMineEffectiveTriggerRadius(p);

// 1. Contact, not centre: the trigger is mine radius (11) + wing half-span (18) = 29,
//    which is strictly GREATER than the mine radius alone -> a wing grazing the rim fires
//    it. A centre-based rule would use ~11 and never detonate on a wingtip graze.
const mineRadius = context.mineSizeRuntime.LOGICAL_PX / 2; // 11
assert(trigger(greenPlane) === 29, `1: wingless trigger = mine radius + wing half-span (11 + 18 = 29), got ${trigger(greenPlane)}.`);
assert(trigger(greenPlane) > mineRadius,
  '1b: the trigger is edge-to-edge (wing touches the mine EDGE), strictly bigger than the mine radius (not centre-based).');

// 2. ONE rule for both colours, measured by green: blue and green get the identical trigger.
assert(trigger(bluePlane) === trigger(greenPlane),
  '2: blue and green share the SAME detonation trigger (one green-keyed wing half-span for both).');

// 3. The trigger TRACKS the live mine size: grow the mine -> the danger zone follows.
context.mineSizeRuntime.LOGICAL_PX = 30; // radius 15
assert(trigger(greenPlane) === 15 + 18,
  '3: resizing the mine moves the trigger with it (radius 15 + 18 = 33).');
context.mineSizeRuntime.LOGICAL_PX = 22; // restore radius 11

// 4. The wing half-span is live-tunable (calibration lever): dialling it changes the
//    trigger for both colours together.
context.mineTriggerRuntime.WING_HALF_SPAN_PX = 16; // e.g. green's real wing tip is a touch inside the box
assert(trigger(greenPlane) === 11 + 16 && trigger(bluePlane) === 11 + 16,
  '4: tuning the wing half-span retargets the trigger for both colours (11 + 16 = 27).');
context.mineTriggerRuntime.WING_HALF_SPAN_PX = 18; // restore default

// 5. Wings widen the trigger to the broadwing half-span (96 / 2 = 48), still colour-uniform.
assert(trigger(winged) === 11 + 48, `5: wings widen the trigger (11 + 48 = 59), got ${trigger(winged)}.`);
const wingedGreen = { color: 'green', activeTurnBuffs: { wings: true } };
assert(trigger(winged) === trigger(wingedGreen),
  '5b: the winged trigger is the same for both colours too.');

console.log('Smoke test passed: mine detonation is wing-touches-edge (contact, not centre), one green-keyed rule for both colours, tracking the live mine size and tunable for calibration.');
