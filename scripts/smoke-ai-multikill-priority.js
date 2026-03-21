#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found in script.js: ${name}`);
  return vm.runInNewContext(match[1], extraContext);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const CELL_SIZE = extractConstValue(source, 'CELL_SIZE');
const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');

const context = {
  Math,
  Number,
  Object,
  Array,
  CELL_SIZE,
  MAX_DRAG_DISTANCE,
  AI_MULTI_KILL_DOUBLE_BONUS: extractConstValue(source, 'AI_MULTI_KILL_DOUBLE_BONUS', { CELL_SIZE }),
  AI_MULTI_KILL_TRIPLE_BONUS: extractConstValue(source, 'AI_MULTI_KILL_TRIPLE_BONUS', { CELL_SIZE }),
  AI_MULTI_KILL_QUAD_BONUS: extractConstValue(source, 'AI_MULTI_KILL_QUAD_BONUS', { CELL_SIZE }),
  AI_MULTI_KILL_LINE_TOLERANCE: extractConstValue(source, 'AI_MULTI_KILL_LINE_TOLERANCE', { CELL_SIZE }),
  AI_MULTI_KILL_CONTACT_TOLERANCE: extractConstValue(source, 'AI_MULTI_KILL_CONTACT_TOLERANCE', { CELL_SIZE }),
  getDistanceFromPointToSegment: (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if(lenSq <= 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    return Math.hypot(px - cx, py - cy);
  },
  getAiPlaneAdjustedScore: (score) => score,
  isDefenseOrRetreatContext: () => false,
  applyLossCompressionScoreAdjustments: ({ score }) => ({ score }),
};

vm.createContext(context);
vm.runInContext([
  extractFunctionSource(source, 'getAiMultiKillPotentialContext'),
  extractFunctionSource(source, 'getAiMultiKillScoreBonus'),
  extractFunctionSource(source, 'buildFallbackAttackScoreDetails'),
].join('\n\n'), context);

const plane = { id: 'blue-1', x: 0, y: 0 };

function buildEnemies(count){
  const enemies = [{ id: 'green-1', x: 120, y: 0 }];
  for(let i = 1; i < count; i += 1){
    enemies.push({ id: `green-${i + 1}`, x: 120 + i * 20, y: 4 * i });
  }
  return enemies;
}

function analyzeScenario(count){
  const enemies = buildEnemies(count);
  const meta = context.getAiMultiKillPotentialContext({
    plane,
    enemy: enemies[0],
    enemies,
    lineEndX: 220,
    lineEndY: 0,
  });
  return meta;
}

const single = analyzeScenario(1);
assert(single.killCountOnTrajectory === 1, 'Single target scenario must keep killCountOnTrajectory = 1.');
assert(single.multiKillPotential === 0, 'Single target scenario must not report extra kills.');
assert(single.opportunityReason === null, 'Single target scenario must not create a multi-kill reason.');
assert(context.getAiMultiKillScoreBonus(single) === 0, 'Single target scenario must not receive a multi-kill bonus.');

const double = analyzeScenario(2);
assert(double.killCountOnTrajectory === 2, 'Double target scenario must report two kills on trajectory.');
assert(double.multiKillPotential === 1, 'Double target scenario must report one extra victim.');
assert(double.opportunityReason === 'double_kill_opportunity', 'Double target scenario must emit double_kill_opportunity.');
assert(double.affectedEnemyIds.length === 2, 'Double target scenario must remember both affected enemies.');
assert(context.getAiMultiKillScoreBonus(double) === context.AI_MULTI_KILL_DOUBLE_BONUS, 'Double target scenario must use the double bonus tier.');

const triple = analyzeScenario(3);
assert(triple.killCountOnTrajectory === 3, 'Triple target scenario must report three kills on trajectory.');
assert(triple.multiKillPotential === 2, 'Triple target scenario must report two extra victims.');
assert(triple.opportunityReason === 'triple_kill_priority', 'Triple target scenario must emit triple_kill_priority.');
assert(triple.affectedEnemyIds.length === 3, 'Triple target scenario must remember all three affected enemies.');
assert(context.getAiMultiKillScoreBonus(triple) === context.AI_MULTI_KILL_TRIPLE_BONUS, 'Triple target scenario must use the triple bonus tier.');

const quad = analyzeScenario(4);
assert(quad.killCountOnTrajectory === 4, 'Four-target scenario must report four kills on trajectory.');
assert(quad.opportunityReason === 'quadruple_kill_window', 'Four-target scenario must emit quadruple_kill_window.');
assert(context.getAiMultiKillScoreBonus(quad) === context.AI_MULTI_KILL_QUAD_BONUS, 'Four-target scenario must use the 4+ bonus tier.');

const cargoScore = context.buildFallbackAttackScoreDetails({
  plane,
  weightedDistance: 150,
  multiKillPotential: single,
  safetyContext: { goalName: 'collect_cargo', decisionReason: 'cargo_route' },
});
const flagScore = context.buildFallbackAttackScoreDetails({
  plane,
  weightedDistance: 145,
  multiKillPotential: single,
  safetyContext: { goalName: 'capture_enemy_flag', decisionReason: 'flag_capture' },
});
const tripleAttackScore = context.buildFallbackAttackScoreDetails({
  plane,
  weightedDistance: 148,
  multiKillPotential: triple,
  safetyContext: { goalName: 'attack_enemy_plane', decisionReason: 'fallback_direct_attack' },
});
assert(tripleAttackScore.scoreAfter < cargoScore.scoreAfter, 'Triple-kill attack must outrank a close cargo option by score.');
assert(tripleAttackScore.scoreAfter < flagScore.scoreAfter, 'Triple-kill attack must outrank a close flag option by score.');

console.log('Smoke test passed: single/double/triple/quad scenarios use kill counts instead of a binary flag.');
console.log(`single killCount=${single.killCountOnTrajectory} reason=${single.opportunityReason}`);
console.log(`double killCount=${double.killCountOnTrajectory} reason=${double.opportunityReason} affected=${double.affectedEnemyIds.join(',')}`);
console.log(`triple killCount=${triple.killCountOnTrajectory} reason=${triple.opportunityReason} affected=${triple.affectedEnemyIds.join(',')}`);
console.log(`quad killCount=${quad.killCountOnTrajectory} reason=${quad.opportunityReason} affected=${quad.affectedEnemyIds.join(',')}`);
console.log(`scoreComparison triple=${tripleAttackScore.scoreAfter.toFixed(2)} cargo=${cargoScore.scoreAfter.toFixed(2)} flag=${flagScore.scoreAfter.toFixed(2)}`);
