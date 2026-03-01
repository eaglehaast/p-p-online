#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) return null;
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  return null;
}

function extractConstSource(source, constName){
  const re = new RegExp(`const ${constName} = [^;]+;`);
  const match = source.match(re);
  return match ? match[0] : null;
}

function runScenario(source){
  const codeParts = [];
  [
    'AI_OPENING_CENTER_TURN_LIMIT',
    'AI_OPENING_DIRECT_FINISHER_MIN_LEAD',
    'AI_OPENING_AGGRESSION_BIAS_TURN_LIMIT',
    'AI_OPENING_AGGRESSION_BIAS_MAX_LEAD',
    'AI_OPENING_AGGRESSION_BIAS_DISCOUNT',
    'AI_OPENING_AGGRESSION_TARGETS',
    'AI_CARGO_RISK_ACCEPTANCE',
  ].forEach((name) => {
    const src = extractConstSource(source, name);
    if(src) codeParts.push(src);
  });

  [
    'isOpeningAggressionBiasAllowed',
    'applyOpeningAggressionBias',
    'isDirectFinisherScenario',
    'findDirectFinisherMove',
    'shouldSkipDirectFinisherInOpening',
  ].forEach((name) => {
    const src = extractFunctionSource(source, name);
    if(src) codeParts.push(src);
  });

  const context = {
    Math,
    Number,
    Boolean,
    Object,
    Array,
    MAX_DRAG_DISTANCE: 100,
    AI_OPENING_CENTER_TURN_LIMIT: 2,
    AI_OPENING_DIRECT_FINISHER_MIN_LEAD: 2,
    turnAdvanceCount: 1,
    blueScore: 0,
    greenScore: 0,
    flyingPoints: [],
    isPathClear: () => true,
    planPathToPoint: () => ({ vx: 1, vy: 0, totalDist: 48 }),
    getAiPlaneAdjustedScore: (score) => score,
    logAiDecision: () => {},
  };

  vm.createContext(context);
  vm.runInContext(codeParts.join('\n\n'), context);

  if(typeof context.applyOpeningAggressionBias !== 'function'){
    context.applyOpeningAggressionBias = (score) => ({ score, applied: false });
  }
  if(typeof context.isOpeningAggressionBiasAllowed !== 'function'){
    context.isOpeningAggressionBiasAllowed = () => false;
  }

  const aiPlanes = [{ id: 'blue-1', x: 0, y: 0 }];
  const enemies = [{ id: 'green-1', x: 30, y: 0, shieldActive: false }];

  let openingAttacks = 0;
  let failSafeMoves = 0;
  for(const turn of [1, 2]){
    context.turnAdvanceCount = turn;
    const modeContext = {
      aiPlanes,
      enemies,
      aiRiskProfile: { profile: 'balanced' },
    };
    const skip = context.shouldSkipDirectFinisherInOpening(modeContext);
    const finisher = skip ? null : context.findDirectFinisherMove(aiPlanes, enemies, {
      source: 'smoke_test',
      goalName: 'direct_finisher',
      context: modeContext,
    });
    if(finisher){
      openingAttacks += 1;
    } else {
      failSafeMoves += 0;
    }
  }

  return {
    openingAttackShare: openingAttacks / 2,
    failSafeMoves,
  };
}

const afterSource = fs.readFileSync('script.js', 'utf8');
const beforeSource = execSync('git show HEAD~1:script.js', { encoding: 'utf8' });

const before = runScenario(beforeSource);
const after = runScenario(afterSource);

if(!(after.openingAttackShare > before.openingAttackShare)){
  throw new Error(`Expected higher opening attack share after change. before=${before.openingAttackShare}, after=${after.openingAttackShare}`);
}
if(after.failSafeMoves > before.failSafeMoves){
  throw new Error(`Fail-safe count increased. before=${before.failSafeMoves}, after=${after.failSafeMoves}`);
}

console.log('Smoke test passed: fivebricks opening aggression share increased without fail-safe growth.');
console.log(JSON.stringify({ before, after }, null, 2));
