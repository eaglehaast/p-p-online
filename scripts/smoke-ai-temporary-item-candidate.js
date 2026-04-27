#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found: ${fnName}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const buildFnSource = extractFunctionSource(source, 'buildAiSelectedPlanInventoryEnhancements');
assert(!buildFnSource.includes('buildBestPlanForPlane('), 'buildAiSelectedPlanInventoryEnhancements must not call buildBestPlanForPlane.');

const snippets = [
  extractFunctionSource(source, 'shouldAiUseCrosshairForSelectedPlan'),
  extractFunctionSource(source, 'shouldAiUseWingsForSelectedPlan'),
  extractFunctionSource(source, 'shouldAiUseInvisibilityForSelectedPlan'),
  buildFnSource,
];

const context = {
  Math,
  Number,
  Array,
  Object,
  Set,
  CELL_SIZE: 10,
  turnColors: ['blue'],
  turnIndex: 0,
  points: [
    { id: 'blue-1', color: 'blue', active: true, x: 0, y: 0, activeTurnBuffs: {} },
    { id: 'blue-2', color: 'blue', active: true, x: 20, y: 0, activeTurnBuffs: {} },
  ],
  aiScores: { blue: 10, green: 8 },
  colliders: [],
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
    WINGS: 'wings',
    CROSSHAIR: 'crosshair',
    INVISIBILITY: 'invisibility',
    MINE: 'mine',
    DYNAMITE: 'dynamite',
  },
  dist(a, b){
    return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
  },
  evaluateInventoryState(){
    return {
      counts: {
        fuel: 1,
        crosshair: 1,
        wings: 1,
        invisibility: 1,
        mine: 1,
        dynamite: 1,
      },
    };
  },
  getEffectiveFlightRangeCells(plane){
    return plane?.activeTurnBuffs?.fuel ? 10 : 8;
  },
  applyItemToOwnPlane(type, _color, plane){
    if(!plane.activeTurnBuffs || typeof plane.activeTurnBuffs !== 'object') plane.activeTurnBuffs = {};
    plane.activeTurnBuffs[type] = true;
    return true;
  },
  getCargoVisualCenter(cargo){
    return { x: cargo.x, y: cargo.y };
  },
  isPlayerInvisibilityActive(){
    return false;
  },
};

vm.createContext(context);
vm.runInContext(snippets.join('\n'), context);

const basePlane = { id: 'blue-1', color: 'blue', x: 0, y: 0, activeTurnBuffs: {} };

const nearMaxRangePlan = {
  plane: basePlane,
  color: 'blue',
  landingX: 58,
  landingY: 0,
  planDistance: 58,
  goalName: 'simple_step2_attack_enemy',
  decisionReason: 'range_pressure',
  routeClass: 'direct',
};
const nearMaxRangeSequence = context.buildAiSelectedPlanInventoryEnhancements({ color: 'blue', enemies: [] }, nearMaxRangePlan);
assert(nearMaxRangeSequence.some((entry) => entry.itemType === 'fuel'), 'Expected fuel for near-max-range selected plan.');

const precisionPlan = {
  plane: basePlane,
  color: 'blue',
  landingX: 40,
  landingY: 0,
  planDistance: 40,
  goalName: 'simple_step2_attack_enemy',
  decisionReason: 'precision',
  routeClass: 'ricochet',
  bounceCount: 1,
  score: 0.4,
  targetPoint: { x: 70, y: 0 },
};
const precisionSequence = context.buildAiSelectedPlanInventoryEnhancements({ color: 'blue', enemies: [{ x: 70, y: 0 }] }, precisionPlan);
assert(precisionSequence.some((entry) => entry.itemType === 'crosshair'), 'Expected crosshair for precision ricochet/bounce selected plan.');

const closeContactPlan = {
  plane: basePlane,
  color: 'blue',
  landingX: 20,
  landingY: 10,
  planDistance: 22,
  goalName: 'simple_step2_pickup_cargo',
  decisionReason: 'close_pass',
  routeClass: 'direct',
};
const closeContactSequence = context.buildAiSelectedPlanInventoryEnhancements({ color: 'blue', enemies: [{ x: 24, y: 12 }], readyCargo: [{ x: 22, y: 9 }] }, closeContactPlan);
assert(closeContactSequence.some((entry) => entry.itemType === 'wings'), 'Expected wings for close-contact cargo/attack selected plan.');

const comboSequence = context.buildAiSelectedPlanInventoryEnhancements({ color: 'blue', enemies: [{ x: 70, y: 0 }] }, {
  ...precisionPlan,
  planDistance: 60,
  routeClass: 'ricochet',
  bounceCount: 2,
});
assert(comboSequence.some((entry) => entry.itemType === 'fuel'), 'Expected combo sequence to include fuel when range pressure exists.');
assert(comboSequence.some((entry) => entry.itemType === 'crosshair'), 'Expected combo sequence to include crosshair for precision.');

const lowValuePlan = {
  plane: basePlane,
  color: 'blue',
  landingX: 8,
  landingY: 0,
  planDistance: 8,
  goalName: 'simple_step2_center',
  decisionReason: 'plain_move',
  routeClass: 'direct',
};
const lowValueSequence = context.buildAiSelectedPlanInventoryEnhancements({ color: 'blue', enemies: [] }, lowValuePlan);
assert(!lowValueSequence.some((entry) => entry.itemType === 'mine' || entry.itemType === 'dynamite'), 'Expected no blind mine/dynamite spending in selected-plan enhancement sequence.');

console.log('Smoke test passed: selected-plan inventory enhancements are deterministic and avoid heavy candidate rebuilds.');
