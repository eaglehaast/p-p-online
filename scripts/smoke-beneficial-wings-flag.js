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
  'getPlaneActiveTurnBuffs',
  'planeHasActiveTurnBuff',
  'getPlaneDangerGeometry',
  'getPlaneBeneficialGeometry',
  'getPlaneBeneficialInteractionZone',
  'doesPlaneZoneIntersectTargetZone',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math,
  Number,
  POINT_RADIUS: 10,
  PLANE_GEOMETRY_TRUTH: {
    DANGER_HITBOX_WIDTH: 36,
    BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96,
    HITBOX_HEIGHT: 36,
  },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings', CROSSHAIR: 'crosshair', FUEL: 'fuel', INVISIBILITY: 'invisibility' },
  isPlayerInvisibilityActive: () => false,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const planeNoWings = { x: 0, y: 0, activeTurnBuffs: {} };
const planeWithWings = { x: 0, y: 0, activeTurnBuffs: { wings: true } };
const target = { anchor: { x: 35, y: 0 }, radius: 10 };

assert(context.doesPlaneZoneIntersectTargetZone(planeNoWings, target) === false,
  'Without wings, plane should not pick flag/base from extended distance.');
assert(context.doesPlaneZoneIntersectTargetZone(planeWithWings, target) === true,
  'With wings, beneficial flag/base pickup distance should be larger.');

console.log('Smoke test passed: wings increase beneficial flag/base pickup distance.');
