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
  'getImmediateResponseThreatMeta',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math,
  Number,
  POINT_RADIUS: 10,
  MINE_TRIGGER_RADIUS: 10,
  AI_IMMEDIATE_RESPONSE_DANGER_RADIUS: 120,
  PLANE_GEOMETRY_TRUTH: {
    DANGER_HITBOX_WIDTH: 36,
    BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96,
    HITBOX_HEIGHT: 36,
  },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings', CROSSHAIR: 'crosshair', FUEL: 'fuel', INVISIBILITY: 'invisibility' },
  mines: [{ owner: 'green', x: 100, y: 100 }],
  isPathClear: () => true,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const plane = { x: 20, y: 20, activeTurnBuffs: {} };
const landingMeta = context.getMineThreatMetaForSegment(100, 100, 100, 100, plane);
assert(landingMeta.landingThreat === true, 'Landing directly inside mine trigger radius must be blocked.');
assert(landingMeta.reason === 'landing_blocked_by_mine', 'Landing rejection reason must be landing_blocked_by_mine.');

const threatMeta = context.getImmediateResponseThreatMeta({ enemies: [], plane }, 100, 100, null);
assert(threatMeta.mineCount === 1, 'Mine near landing must count as immediate threat.');
assert(threatMeta.reasonCodes.includes('post_landing_mine_threat'), 'Threat reasons must include post_landing_mine_threat.');

console.log('Smoke test passed: landing near mine is blocked and counted as post_landing_mine_threat.');
