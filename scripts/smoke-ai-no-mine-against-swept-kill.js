#!/usr/bin/env node
'use strict';

// Smoke test: getAiPlanRemovedEnemies — a defensive mine must not be spent guarding an
// enemy the SAME move removes, for a MULTI-TARGET SWEEP as well as a direct attack.
//
// #2889 stopped the AI wasting a defensive mine on an enemy a DIRECT attack kills, keyed on
// predictedOutcome "target_hit". But a multi-target sweep reports predictedOutcome: null and
// only a COUNT of kills — so getAiPlanKillTargetEnemy can't see the swept plane, and the
// mine planner still counted it as a threat (observed: plane sweeps 2 cargo + green #2, yet a
// defensive mine is placed partly to guard green #2). The sweep now carries
// multiTargetEnemyRefs (the planes its flown path removes); getAiPlanRemovedEnemies unions
// the direct kill with those refs so every removed plane is dropped from the threat set.

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

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const context = { Math, Number, Set, Array, CELL_SIZE: 20 };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getAiPlanKillTargetEnemy'), context);
vm.runInContext(extractFunctionSource(source, 'getAiPlanRemovedEnemies'), context);
const removed = (plan, enemies) => context.getAiPlanRemovedEnemies(plan, enemies);

// The dump's enemies: green #1 (bottom), green #2 (the swept one), green #3 (bottom).
const g1 = { x: 121, y: 592 };
const g2 = { x: 100.04, y: 344.38 };
const g3 = { x: 60.42, y: 600.24 };
const enemies = [g1, g2, g3];

// --- The reported case: a multi-target SWEEP that removes green #2 -------------------------
const sweepPlan = {
  goalName: 'simple_step2_multi_target',
  decisionReason: 'simple_step2_multi_target_ricochet',
  predictedOutcome: null,          // sweeps don't set this — the #2889 gap
  multiTargetEnemy: 1,
  multiTargetEnemyRefs: [{ x: 100.04, y: 344.38 }], // the plane the flown path sweeps
  targetPoint: { x: 132.6, y: 253.5 },              // ricochet END, NOT an enemy
};
const out = removed(sweepPlan, enemies);
assert(out.length === 1, '1: exactly one enemy is recognised as removed by the sweep.');
assert(out[0] === g2, '2: the removed enemy is green #2 (the plane the sweep sweeps), matched by position.');
assert(!out.includes(g1) && !out.includes(g3), '2b: the OTHER greens (not swept) stay in the threat set.');

// The mine planner filters these out; green #2 is no longer a mineable threat.
const remainingThreats = enemies.filter((e) => !out.includes(e));
assert(remainingThreats.length === 2 && remainingThreats.includes(g1) && remainingThreats.includes(g3),
  '3: after exclusion the threat set is the two un-swept greens (mine not justified by the swept kill).');

// --- A direct attack still works (backward compatible with #2889) --------------------------
const directPlan = { predictedOutcome: 'target_hit_after_ricochet', targetPoint: { x: 100, y: 344 } };
const directOut = removed(directPlan, enemies);
assert(directOut.length === 1 && directOut[0] === g2, '4: a direct target_hit still removes its kill target.');

// --- A non-hitting, non-sweep plan removes nobody ------------------------------------------
const passivePlan = { predictedOutcome: 'range_end', targetPoint: { x: 300, y: 300 } };
assert(removed(passivePlan, enemies).length === 0, '5: a plan that neither hits nor sweeps removes no enemy.');

// --- A sweep whose ref matches NO live enemy (already dead / moved) removes nobody ----------
const staleSweep = { multiTargetEnemy: 1, multiTargetEnemyRefs: [{ x: 999, y: 999 }] };
assert(removed(staleSweep, enemies).length === 0, '6: a swept ref far from every live enemy removes nobody.');

// --- A sweep that removes TWO enemies drops both -------------------------------------------
const doubleSweep = { multiTargetEnemy: 2, multiTargetEnemyRefs: [{ x: 121, y: 592 }, { x: 60.42, y: 600.24 }] };
const doubleOut = removed(doubleSweep, enemies);
assert(doubleOut.length === 2 && doubleOut.includes(g1) && doubleOut.includes(g3),
  '7: a sweep that removes two planes drops both from the threat set.');

console.log('Smoke test passed: getAiPlanRemovedEnemies unions a direct kill with a sweep\'s multiTargetEnemyRefs, so a defensive mine is never wasted guarding a plane the same multi-target sweep removes — extending #2889 to sweeps.');
