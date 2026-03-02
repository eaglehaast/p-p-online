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

function loadMaps(){
  const mapsSource = fs.readFileSync('maps.js', 'utf8');
  const mapsContext = {
    window: {},
    document: {
      querySelectorAll: () => [],
    },
    XMLHttpRequest: undefined,
    console,
  };
  vm.createContext(mapsContext);
  vm.runInContext(mapsSource, mapsContext);
  return mapsContext.window?.paperWingsMapsData?.MAPS || [];
}

function createMapResolver(context){
  return function resolveCurrentMapForExport(){
    return context.MAPS.find((map) => map?.name === context.currentMapName || map?.id === context.currentMapName) || null;
  };
}

function runScenario(source, maps){
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
    MAPS: maps,
    currentMapName: 'unknown map',
  };
  context.resolveCurrentMapForExport = createMapResolver(context);

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

  const perMap = maps.map((map) => {
    context.currentMapName = map?.name || map?.id || 'unknown map';
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
      } else if(!skip){
        failSafeMoves += 1;
      }
    }

    return {
      id: map?.id || null,
      name: map?.name || null,
      openingAttackShare: openingAttacks / 2,
      failSafeMoves,
    };
  });

  const totals = perMap.reduce((acc, row) => {
    acc.openingAttackShare += row.openingAttackShare;
    acc.failSafeMoves += row.failSafeMoves;
    return acc;
  }, { openingAttackShare: 0, failSafeMoves: 0 });

  return {
    perMap,
    averageOpeningAttackShare: perMap.length > 0 ? totals.openingAttackShare / perMap.length : 0,
    totalFailSafeMoves: totals.failSafeMoves,
  };
}

const maps = loadMaps();
if(maps.length === 0){
  throw new Error('No maps were loaded from maps.js');
}

const afterSource = fs.readFileSync('script.js', 'utf8');
const beforeSource = execSync('git show HEAD~1:script.js', { encoding: 'utf8' });

const before = runScenario(beforeSource, maps);
const after = runScenario(afterSource, maps);

const clearSkyBefore = before.perMap.find((row) => (row.id || '').toLowerCase() === 'clearsky' || (row.name || '').toLowerCase() === 'clear sky');
const clearSkyAfter = after.perMap.find((row) => (row.id || '').toLowerCase() === 'clearsky' || (row.name || '').toLowerCase() === 'clear sky');
if(!clearSkyBefore || !clearSkyAfter){
  throw new Error('Clear Sky map is required for this smoke test.');
}
if(clearSkyAfter.openingAttackShare !== clearSkyBefore.openingAttackShare){
  throw new Error(`Expected Clear Sky opening behavior to remain unchanged. before=${clearSkyBefore.openingAttackShare}, after=${clearSkyAfter.openingAttackShare}`);
}

for(const beforeMap of before.perMap){
  const afterMap = after.perMap.find((row) => row.id === beforeMap.id && row.name === beforeMap.name);
  if(!afterMap){
    throw new Error(`Map not found in after results: ${beforeMap.id || beforeMap.name}`);
  }
  if(afterMap.failSafeMoves > beforeMap.failSafeMoves){
    throw new Error(`Fail-safe count increased on map ${beforeMap.name}. before=${beforeMap.failSafeMoves}, after=${afterMap.failSafeMoves}`);
  }
}

if(after.averageOpeningAttackShare < before.averageOpeningAttackShare){
  throw new Error(`Expected opening attack share not to drop in average. before=${before.averageOpeningAttackShare}, after=${after.averageOpeningAttackShare}`);
}

console.log('Smoke test passed: opening attack share on first 2 turns is stable/improved per map with no fail-safe growth; Clear Sky unchanged.');
console.log(JSON.stringify({ before, after }, null, 2));
