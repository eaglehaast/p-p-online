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
  'reflectPointAcrossLine',
  'lineSegmentIntersection',
  'evaluateFuelTacticalPlans',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

function buildContext({ enemyBase, homeBase, priorityEnemy, flagAnchor, enemies = [] }){
  const context = {
    Math,
    Number,
    MAX_DRAG_DISTANCE: 100,
    CELL_SIZE: 40,
    ATTACK_RANGE_PX: 60,
    FIELD_LEFT: 0,
    FIELD_TOP: 0,
    FIELD_WIDTH: 400,
    FIELD_HEIGHT: 300,
    dist: (a, b) => Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0)),
    isPathClear: () => true,
    getBaseAnchor: (color) => (color === 'green' ? enemyBase : homeBase),
    getBluePriorityEnemy: () => priorityEnemy,
    getAvailableFlagsByColor: () => (flagAnchor ? [{ id: 'flag-1', color: 'green' }] : []),
    getFlagAnchor: () => flagAnchor,
  };
  vm.createContext(context);
  vm.runInContext(extracted, context);
  return {
    fnContext: context,
    run: (moveContext, plannedMove) => context.evaluateFuelTacticalPlans(moveContext, plannedMove),
    enemies,
  };
}

(function testFuelUsedWhenSafeReturnExists(){
  const plane = { id: 'p-safe', x: 0, y: 0 };
  const setup = buildContext({
    enemyBase: { x: 120, y: 0 },
    homeBase: { x: 0, y: 0 },
    priorityEnemy: { id: 'e-safe', x: 140, y: 20, isAlive: true, burning: false },
    flagAnchor: null,
    enemies: [{ id: 'threat-far', x: 320, y: 250, isAlive: true, burning: false }],
  });
  const result = setup.run({ shouldUseFlagsMode: false, homeBase: { x: 0, y: 0 }, enemies: setup.enemies }, { plane });
  assert(result.selectedCandidate, 'Ожидался хотя бы один выбранный fuel-сценарий при безопасном возврате.');
})();

(function testFuelSavedWhenReturnUnsafe(){
  const plane = { id: 'p-unsafe', x: 0, y: 0 };
  const setup = buildContext({
    enemyBase: { x: 185, y: 0 },
    homeBase: { x: 0, y: 0 },
    priorityEnemy: { id: 'e-unsafe', x: 185, y: 0, isAlive: true, burning: false },
    flagAnchor: null,
    enemies: [
      { id: 'threat-home', x: 0, y: 0, isAlive: true, burning: false },
      { id: 'threat-mid', x: 90, y: 0, isAlive: true, burning: false },
    ],
  });
  const result = setup.run({ shouldUseFlagsMode: false, homeBase: { x: 0, y: 0 }, enemies: setup.enemies }, { plane });
  assert(!result.selectedCandidate, 'Fuel должен сохраняться, если возврат небезопасен.');
  assert(result.blockedByReturnSafety === true, 'Ожидалась причина отказа из-за небезопасного возврата.');
})();

(function testFlagStealScenarioPreferredWithFuelAndReturn(){
  const plane = { id: 'p-flag', x: 0, y: 0 };
  const flagAnchor = { x: 150, y: 0 };
  const setup = buildContext({
    enemyBase: { x: 210, y: 20 },
    homeBase: { x: 0, y: 0 },
    priorityEnemy: { id: 'e-flag', x: 220, y: 40, isAlive: true, burning: false },
    flagAnchor,
    enemies: [{ id: 'threat-far', x: 300, y: 260, isAlive: true, burning: false }],
  });
  const result = setup.run({ shouldUseFlagsMode: true, homeBase: { x: 0, y: 0 }, enemies: setup.enemies }, { plane });
  assert(Math.hypot(flagAnchor.x - plane.x, flagAnchor.y - plane.y) > 100,
    'Контроль: флаг должен быть вне базовой дальности без fuel.');
  assert(result.selectedCandidate?.scenario === 'fuel_flag_steal_return',
    'Ожидался выбор сценария кражи флага при достижимости с fuel и безопасном пути домой.');
})();

console.log('Smoke test passed: fuel tactical plans choose/safe/reject scenarios as expected.');
