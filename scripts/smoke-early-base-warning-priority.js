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

const source = fs.readFileSync('script.js', 'utf8');
// Константу берём из игры, а не переписываем числом: переписанное число живёт своей
// жизнью и однажды разойдётся с настоящим, а тест этого не заметит.
function extractConstSource(source, name){
  const match = new RegExp(`^const ${name}\\s*=\\s*[^;]+;`, 'm').exec(source);
  if(!match) throw new Error(`Константа не найдена в script.js: ${name}`);
  return match[0];
}

const dragConstant = extractConstSource(source, 'MAX_DRAG_DISTANCE');
const turnLimitConstant = extractConstSource(source, 'AI_OPENING_CENTER_TURN_LIMIT');
const extracted = [
  'getCriticalBlueBaseThreat',
  'getEarlyBaseWarningThreat',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math,
  ATTACK_RANGE_PX: 100,
  turnAdvanceCount: 0,
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  isPathClear: () => true,
};

vm.createContext(context);
vm.runInContext(`${dragConstant}\n${turnLimitConstant}\n\n${extracted}`, context);

const warningEnemy = { id: 'enemy-warning', x: 150, y: 0 };
const scenario = { enemies: [warningEnemy] };

const turnLimit = vm.runInContext('AI_OPENING_CENTER_TURN_LIMIT', context);
assert(Number.isInteger(turnLimit) && turnLimit >= 0,
  'Sandbox must expose the real early-warning turn limit.');

context.turnAdvanceCount = turnLimit;
const criticalThreat = context.getCriticalBlueBaseThreat(scenario);
const warningThreat = context.getEarlyBaseWarningThreat(scenario);

assert(criticalThreat === null,
  'Control scenario: enemy near base on early half-turn must stay non-critical.');
assert(Boolean(warningThreat),
  'Control scenario: same enemy must trigger early warning threat.');

// Предупреждение — про ДЕБЮТ. За пределом ходов тот же самый враг у базы его больше не
// поднимает: дальше базу защищают обычные оборонительные ветки, а не скидка на начало
// партии. Без этой проверки предел можно снять целиком, и никто не заметит.
context.turnAdvanceCount = turnLimit + 1;
assert(context.getEarlyBaseWarningThreat(scenario) === null,
  'Past the opening turn limit the same enemy must no longer raise an early warning.');
context.turnAdvanceCount = turnLimit;

// Ветка раннего предупреждения на месте и стоит ВЫШЕ обычных режимов.
//
// Раньше здесь проверялось, что она стоит выше плана «занять центр в дебюте». Плана
// больше нет: tryPlanOpeningCenterControlMove была написана, но ни разу не вызвана — 157
// строк, к которым не вела ни одна дорога, — и удалена. Осталось то, что действительно
// работает: угроза базе переводит ИИ в оборону раньше, чем он начнёт выбирать по риску
// или по ресурсам.
const branchIndex = source.indexOf('} else if(defensivePriority?.hasEarlyBaseWarningThreat){');
assert(branchIndex !== -1,
  'AI mode selection must keep the early base warning branch.');

const riskProfileBranchIndex = source.indexOf("} else if(aiRiskProfile?.profile === \"conservative\"){");
assert(riskProfileBranchIndex !== -1, 'AI mode selection must keep the risk-profile branch.');
assert(branchIndex < riskProfileBranchIndex,
  'Early base warning must be checked before the risk-profile branches, otherwise the base is left open.');

assert(source.indexOf('const openingCenterMove = tryPlanOpeningCenterControlMove') === -1
    && source.indexOf('function tryPlanOpeningCenterControlMove') === -1,
  'The opening-center planner was never wired up and is deleted: it must not come back unwired.');

console.log('Smoke test passed: early base warning stays ahead of the risk/resource branches.');
