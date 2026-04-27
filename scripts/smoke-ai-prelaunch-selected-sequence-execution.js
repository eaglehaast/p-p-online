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
const maybeUseSource = extractFunctionSource(source, 'maybeUseInventoryBeforeLaunch');

assert(maybeUseSource.includes('INVENTORY_ITEM_TYPES.FUEL'), 'PRE_LAUNCH_ALLOWED_ITEM_TYPES must include FUEL.');
assert(maybeUseSource.includes('INVENTORY_ITEM_TYPES.CROSSHAIR'), 'PRE_LAUNCH_ALLOWED_ITEM_TYPES must include CROSSHAIR.');
assert(maybeUseSource.includes('INVENTORY_ITEM_TYPES.WINGS'), 'PRE_LAUNCH_ALLOWED_ITEM_TYPES must include WINGS.');
assert(maybeUseSource.includes('INVENTORY_ITEM_TYPES.INVISIBILITY'), 'PRE_LAUNCH_ALLOWED_ITEM_TYPES must include INVISIBILITY.');

const useCalls = [];

const context = {
  Math,
  Number,
  Boolean,
  String,
  Array,
  Object,
  Set,
  turnColors: ['green'],
  turnIndex: 0,
  aiRoundState: { currentGoal: 'attack_enemy' },
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
    CROSSHAIR: 'crosshair',
    WINGS: 'wings',
    MINE: 'mine',
    DYNAMITE: 'dynamite',
    INVISIBILITY: 'invisibility',
  },
  evaluateInventoryState(color){
    if(color === 'green'){
      return {
        total: 1,
        counts: {
          fuel: 1,
          crosshair: 0,
          wings: 0,
          mine: 0,
          dynamite: 0,
          invisibility: 0,
        },
      };
    }
    return {
      total: 0,
      counts: {
        fuel: 0,
        crosshair: 0,
        wings: 0,
        mine: 0,
        dynamite: 0,
        invisibility: 0,
      },
    };
  },
  useInventoryItemOnPlane(color, type, plane){
    useCalls.push({ color, type, planeId: plane?.id || null });
    return true;
  },
  removeItemFromInventory(){
    return true;
  },
  queueInvisibilityEffectForPlayer(){
    return false;
  },
  isMinePlacementValid(){
    return false;
  },
  placeMine(){
    return false;
  },
  placeBlueDynamiteAt(){
    return false;
  },
  setAiDynamiteIntentFromCandidate(){
    return false;
  },
  getAiMoveLandingPoint(){
    return null;
  },
  getBaseAnchor(){
    return null;
  },
  buildAiSelectedPlanInventoryEnhancements(){
    return [];
  },
  logAiDecision(){},
};

vm.createContext(context);
vm.runInContext(maybeUseSource, context);

const plannedMove = {
  plane: { id: 'green-plane', color: 'green', x: 10, y: 10 },
  color: 'green',
  goalName: 'simple_step2_attack_enemy',
  decisionReason: 'integration_smoke',
  preAppliedInventoryItemType: null,
  selectedInventorySequence: [
    { itemType: 'fuel', reason: 'test_selected_plan_fuel' },
  ],
};

const selected = context.maybeUseInventoryBeforeLaunch({ color: 'green', enemies: [] }, plannedMove, {
  allowForcedInventorySpend: false,
  usedBuffTypesThisTurn: new Set(),
});

assert(selected === true, 'Expected maybeUseInventoryBeforeLaunch to apply selected sequence fuel item.');
assert(useCalls.length === 1, 'Expected exactly one inventory application call.');
assert(useCalls[0].color === 'green', 'Expected inventory usage to target AI color inventory (green).');
assert(useCalls[0].type === 'fuel', 'Expected fuel item usage from selectedInventorySequence.');
assert(useCalls[0].planeId === 'green-plane', 'Expected selected sequence fuel to apply to plannedMove.plane.');
assert(plannedMove?.inventoryDecisionMadeMeta?.selected === true, 'Expected inventoryDecisionMadeMeta.selected === true.');

console.log('Smoke test passed: selected sequence prelaunch execution uses real AI color inventory and applies fuel.');
