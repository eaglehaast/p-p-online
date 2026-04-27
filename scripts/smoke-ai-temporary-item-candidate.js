#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractConstSource(source, constName){
  const signature = `const ${constName} =`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Const not found: ${constName}`);
  const semicolon = source.indexOf(';', start);
  if(semicolon === -1) throw new Error(`Const end not found: ${constName}`);
  return source.slice(start, semicolon + 1);
}

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
const snippets = [
  extractConstSource(source, 'AI_USABLE_ITEM_TYPES'),
  extractFunctionSource(source, 'getAiUsableInventoryItems'),
  extractFunctionSource(source, 'evaluateAiCandidateWithTemporaryItem'),
];

const context = {
  Math,
  Number,
  Array,
  Object,
  Set,
  inventoryState: {
    blue: [
      { type: 'fuel' },
      { type: 'wings' },
      { type: 'crosshair' },
      { type: 'mine' },
      { type: 'fuel' },
    ],
  },
  INVENTORY_ITEM_TYPES: {
    FUEL: 'fuel',
    WINGS: 'wings',
    CROSSHAIR: 'crosshair',
  },
  applyItemToOwnPlane(type, color, plane){
    if(!plane.activeTurnBuffs || typeof plane.activeTurnBuffs !== 'object'){
      plane.activeTurnBuffs = {};
    }
    plane.activeTurnBuffs[type] = true;
    return true;
  },
};

vm.createContext(context);
vm.runInContext(snippets.join('\n'), context);

const usable = context.getAiUsableInventoryItems('blue');
assert(Array.isArray(usable) && usable.length === 3, 'Expected unique usable AI item list (fuel, wings, crosshair).');

const plane = { id: 'blue-1', activeTurnBuffs: { stale: true } };
const built = context.evaluateAiCandidateWithTemporaryItem('blue', plane, 'fuel', () => ({
  planeId: plane.id,
  duringFuel: plane.activeTurnBuffs?.fuel === true,
}));

assert(built && built.itemType === 'fuel', 'Expected candidate tagged with selected item type.');
assert(built.color === 'blue', 'Expected candidate tagged with AI color.');
assert(built.duringFuel === true, 'Expected temporary item effect during candidate build.');
assert(plane.activeTurnBuffs.fuel !== true, 'Expected temporary fuel buff rollback after candidate build.');
assert(plane.activeTurnBuffs.stale === true, 'Expected original buffs to be restored.');

console.log('Smoke test passed: AI temporary inventory candidates are generated and temporary buffs rollback.');
