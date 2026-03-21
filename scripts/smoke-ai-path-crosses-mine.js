#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
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
  'getDistanceFromPointToSegment',
  'getMineThreatMetaForSegment',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math,
  Number,
  POINT_RADIUS: 10,
  MINE_TRIGGER_RADIUS: 10,
  PLANE_GEOMETRY_TRUTH: {
    DANGER_HITBOX_WIDTH: 36,
    BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96,
    HITBOX_HEIGHT: 36,
  },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings', CROSSHAIR: 'crosshair', FUEL: 'fuel', INVISIBILITY: 'invisibility' },
  mines: [{ owner: 'blue', x: 50, y: 0 }],
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plane = {
  x: 0,
  y: 0,
  activeTurnBuffs: {},
};

const meta = context.getMineThreatMetaForSegment(0, 0, 100, 0, plane);
assert(meta.pathHit === true, 'Route that flies through mine trigger radius must be rejected.');
assert(meta.reason === 'path_crosses_mine', 'Route rejection reason must be path_crosses_mine.');
assert(meta.count === 1, 'Exactly one mine should be reported on the route.');

console.log('Smoke test passed: route through mine is rejected with path_crosses_mine.');
