#!/usr/bin/env node
'use strict';

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

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found in script.js: ${name}`);
  return vm.runInNewContext(match[1], extraContext);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const CELL_SIZE = extractConstValue(source, 'CELL_SIZE');
const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');
const BOUNCE_FRAMES = extractConstValue(source, 'BOUNCE_FRAMES');
const FIELD_FLIGHT_DURATION_SEC = extractConstValue(source, 'FIELD_FLIGHT_DURATION_SEC', { BOUNCE_FRAMES });

const plane = { id: 'b1', x: 100, y: 100, isAlive: true };
const enemy = { id: 'g1', x: 240, y: 100, isAlive: true };

const context = {
  Math,
  CELL_SIZE,
  MAX_DRAG_DISTANCE,
  FIELD_FLIGHT_DURATION_SEC,
  flyingPoints: [],
  isPlaneLaunchStateReady: () => true,
  validateAiLaunchMoveCandidate: (move) => ({ ok: Boolean(move && Number.isFinite(move.vx) && Number.isFinite(move.vy)) }),
  countRouteNearbyColliders: () => 0,
  isPathClear: () => true,
  findMirrorShot: () => null,
  planPathToPoint: (_plane, _x, _y, options = {}) => {
    const isDirect = options.routeClass === 'direct';
    const distance = isDirect ? MAX_DRAG_DISTANCE : MAX_DRAG_DISTANCE * 0.55;
    return {
      plane,
      vx: distance / FIELD_FLIGHT_DURATION_SEC,
      vy: 0,
      totalDist: distance,
      routeClass: options.routeClass,
    };
  },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'buildShotPlan'), context);

const result = context.buildShotPlan({ goalName: 'attack_enemy_plane' }, {
  aiPlanes: [plane],
  enemies: [enemy],
});

assert(result, 'Expected buildShotPlan to return a candidate.');
assert(result.move.routeClass === 'direct', `Expected direct route to win, got ${result.move.routeClass}.`);
assert(result.shotPreview && result.shotPreview.powerRatio >= 0.99,
  `Expected selected shot to keep near-max power, got ${result.shotPreview && result.shotPreview.powerRatio}.`);

console.log('Smoke test passed: buildShotPlan now prefers a near-maximum launch when risk is equal.');
console.log(`routeClass=${result.move.routeClass} powerRatio=${result.shotPreview.powerRatio}`);
