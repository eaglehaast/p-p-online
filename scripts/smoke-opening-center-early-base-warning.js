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
  'getCriticalBlueBaseThreat',
  'getEarlyBaseWarningThreat',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math,
  ATTACK_RANGE_PX: 100,
  turnAdvanceCount: 2,
  AI_OPENING_CENTER_TURN_LIMIT: 6,
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  isPathClear: () => true,
};

vm.createContext(context);
vm.runInContext(extracted, context);

const warningEnemy = { id: 'enemy-warning', x: 150, y: 0 };
const scenario = { enemies: [warningEnemy] };

const criticalThreat = context.getCriticalBlueBaseThreat(scenario);
const warningThreat = context.getEarlyBaseWarningThreat(scenario);

assert(criticalThreat === null,
  'Control scenario: enemy near base on early half-turn must stay non-critical.');
assert(Boolean(warningThreat),
  'Control scenario: same enemy must trigger early warning threat.');

const warningBranchIndex = source.indexOf('else if(hasEarlyBaseWarningThreat)');
const openingCallIndex = source.indexOf('const openingCenterMove = tryPlanOpeningCenterControlMove(modeContext);');
assert(warningBranchIndex !== -1, 'doComputerMove must include early warning branch before opening-center plan.');
assert(openingCallIndex !== -1, 'doComputerMove opening-center call not found.');
assert(warningBranchIndex < openingCallIndex,
  'Early warning branch must appear before opening-center plan call to block opening_center_control.');
assert(source.includes('logAiDecision("early_base_warning_center_skipped"'),
  'doComputerMove must log dedicated early warning skip event.');

console.log('Smoke test passed: early base warning blocks opening_center_control and keeps critical logic unchanged.');
