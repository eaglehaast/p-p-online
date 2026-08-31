#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
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

// Константы берём из игры, а не переписываем числом: переписанное число живёт своей
// жизнью и однажды разойдётся с настоящим, а тест этого не заметит.
function extractConstSource(source, name){
  const match = new RegExp(`^const ${name} = [^;]+;`, 'm').exec(source);
  if(!match) throw new Error(`Константа не найдена в script.js: ${name}`);
  return match[0];
}

const source = fs.readFileSync('script.js', 'utf8');
const constants = [
  'CARGO_FALLBACK_SIZE_PX',
  'CARGO_SAFE_MAX_DIM_PX',
].map((name) => extractConstSource(source, name)).join('\n');
const extracted = [
  'getPlaneActiveTurnBuffs',
  'planeHasActiveTurnBuff',
  'getPlaneBeneficialGeometry',
  'getCargoSpriteSize',
  'doesCargoIntersectPlaneBeneficialZone',
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
  cargoSprite: { naturalWidth: 20, naturalHeight: 20 },
};

vm.createContext(context);
vm.runInContext(`${constants}\n\n${extracted}`, context);

const cargo = { x: 30, y: -10 };
const planeNoWings = { x: 0, y: 0, activeTurnBuffs: {} };
const planeWithWings = { x: 0, y: 0, activeTurnBuffs: { wings: true } };

assert(context.doesCargoIntersectPlaneBeneficialZone(cargo, planeNoWings) === false,
  'Without wings, plane should not pick cargo from extended distance.');
assert(context.doesCargoIntersectPlaneBeneficialZone(cargo, planeWithWings) === true,
  'With wings, plane should pick cargo from wider beneficial geometry.');

console.log('Smoke test passed: wings increase beneficial cargo pickup distance.');
