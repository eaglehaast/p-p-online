#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for(let i = start; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') paramsDepth += 1;
    if(ch === ')') paramsDepth -= 1;
    if(ch === '{' && paramsDepth === 0){
      bodyStart = i;
      break;
    }
  }
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
const extracted = extractFunctionSource(source, 'tryPlaceBlueDefensiveMine');

const logs = [];
let placeMineCalls = 0;
const recordedImpacts = [];

const context = {
  Math,
  Number,
  MINE_EFFECT_RADIUS: 40,
  MINE_TRIGGER_RADIUS: 40,
  MAX_DRAG_DISTANCE: 300,
  getPlaneEffectiveRangePx: () => 140,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  CELL_SIZE: 40,
  aiRoundState: { currentGoal: 'capture_enemy_flag' },
  getAiMoveLandingPoint: () => ({ x: 100, y: 0 }),
  isPathClear: () => true,
  isMinePlacementValid: () => true,
  evaluateBlueMinePlacementImpact: (_ctx, _move, placement) => {
    const impact = {
      placement,
      scenario: 'mine_blocks_escape_lane',
      score: 2.6,
      totalDirectionLoss: 0.4,
      blockedEscapeCount: 1,
      cutRouteCount: 0,
      trapCount: 0,
      enemyReports: [],
    };
    recordedImpacts.push(impact);
    return impact;
  },
  placeMine: () => { placeMineCalls += 1; },
  logAiDecision: (reason, details) => logs.push({ reason, details }),
};

vm.createContext(context);
vm.runInContext(extracted, context);

const evalImpact = context.tryPlaceBlueDefensiveMine({
  enemies: [{ id: 'enemy-1', x: 130, y: 0 }],
}, {
  plane: { id: 'plane-1', x: 0, y: 0 },
  goalName: 'capture_enemy_flag',
}, { evaluateOnly: true });

assert(Boolean(evalImpact), 'Moderate self-risk defensive mine should stay available for planning.');
assert(evalImpact.selfRiskDowngraded === true, 'Moderate self-risk case should be downgraded with a penalty.');
assert(evalImpact.selfRiskPenalty > 0 && evalImpact.selfRiskPenalty < 1.35,
  'Flag-focused goal should apply a lighter self-risk penalty.');

const didPlace = context.tryPlaceBlueDefensiveMine({
  enemies: [{ id: 'enemy-1', x: 130, y: 0 }],
}, {
  plane: { id: 'plane-1', x: 0, y: 0 },
  goalName: 'capture_enemy_flag',
});

assert(didPlace === true, 'Mine should now be placed for moderate self-risk defensive cover case.');
assert(placeMineCalls === 1, 'Mine placement should occur exactly once in soft-risk case.');
assert(!logs.some((entry) => entry.reason === 'mine_skipped_self_risk'),
  'Soft-risk case should no longer be rejected as hard self-risk skip.');
assert(recordedImpacts[0].blockedEscapeCount >= 1,
  'Placed mine should still represent a defensive next-turn lane protection value.');

console.log('Smoke test passed: moderate self-risk defensive mine is downgraded, selected, and provides next-turn cover value.');
