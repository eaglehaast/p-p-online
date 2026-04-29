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
function assert(condition, message){ if(!condition) throw new Error(message); }

const source = fs.readFileSync('script.js', 'utf8');
const fnNames = [
  'normalizeInventoryItemType',
  'getInventoryItemType',
  'removeItemFromInventory',
  'applyItemToOwnPlane',
  'useInventoryItemOnPlane',
  'evaluateInventoryState',
  'maybeUseInventoryBeforeLaunch',
];
const code = fnNames.map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math, Number, String, Array, Object, Set,
  INVENTORY_ITEM_TYPES: { FUEL:'fuel', CROSSHAIR:'crosshair', WINGS:'wings', MINE:'mine', DYNAMITE:'dynamite', INVISIBILITY:'invisibility' },
  inventoryState: { blue: [{ type: 'fuel' }], green: [] },
  turnColors: ['blue'], turnIndex: 0,
  aiRoundState: { currentGoal: 'simple_step2_selector' },
  syncInventoryUI(){}, logAiDecision(){},
  queueInvisibilityEffectForPlayer(){ return false; },
  isMinePlacementValid(){ return false; },
  placeMine(){ return false; },
  placeBlueDynamiteAt(){ return false; },
  setAiDynamiteIntentFromCandidate(){},
  getAiMoveLandingPoint(){ return null; },
  getBaseAnchor(){ return null; },
  buildAiSelectedPlanInventoryEnhancements(){ return []; },
};
vm.createContext(context);
vm.runInContext(code, context);

const plannedMove = {
  plane: { id: 'blue-plane', color: 'blue', x: 10, y: 10, activeTurnBuffs: {} },
  color: 'blue',
  selectedInventorySequence: [{ itemType: 'fuel', reason: 'test_real_selected_plan_fuel' }],
  preAppliedInventoryItemType: null,
  goalName: 'simple_step2_selector',
  decisionReason: 'real_execution_smoke',
  routeClass: 'direct',
};

const result = context.maybeUseInventoryBeforeLaunch({ color:'blue', enemies:[] }, plannedMove, {
  allowForcedInventorySpend: false,
  usedBuffTypesThisTurn: new Set(),
});

assert(result === true, 'Expected real maybeUseInventoryBeforeLaunch to return true.');
assert(plannedMove.inventoryDecisionMadeMeta?.selected === true, 'Expected selected meta true.');
assert(plannedMove.plane.activeTurnBuffs?.fuel === true, 'Expected activeTurnBuffs.fuel true.');
assert(context.inventoryState.blue.length === 0, 'Expected inventoryState.blue fuel to be consumed once.');
assert(context.evaluateInventoryState('blue').counts.fuel === 0, 'Expected evaluateInventoryState fuel count to be zero.');

console.log('Smoke test passed: real prelaunch execution consumes real inventory and applies fuel buff.');
