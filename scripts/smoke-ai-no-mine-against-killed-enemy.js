#!/usr/bin/env node
'use strict';

// Smoke test: getAiPlanKillTargetEnemy — a defensive mine must not be spent guarding
// against an enemy that THIS move already kills. From a real aiDumpBadMove: the AI's move
// was a predicted kill of green #1 (the last enemy, an intruder near the blue flag), yet it
// also placed a defensive mine against green #1 — a plane about to die. The planner drops
// the plan's kill target from the threat set (findAiDefensiveMineOpportunityAsync), which
// makes the mine disappear when the only threat is the one being killed. The match is
// conservative: it fires ONLY when the plan PREDICTS a hit and its target coincides with an
// enemy, so a shot that might miss never drops a real threat.

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
const context = { Math, Number, Array, String, CELL_SIZE: 20 };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getAiPlanKillTargetEnemy'), context);
const kill = (plan, enemies) => context.getAiPlanKillTargetEnemy(plan, enemies);

const green1 = { id: 'g1', x: 194.49, y: 188.72 };
const green2 = { id: 'g2', x: 60, y: 500 };

// 1. THE BUG: the dumped move — a predicted ricochet kill of green #1 (targetPoint at green
//    #1) — identifies green #1 as the kill target, so the mine planner drops it.
const dumpPlan = {
  predictedOutcome: 'target_hit_after_ricochet',
  goalName: 'simple_step2_attack_enemy',
  decisionReason: 'simple_step2_defensive_intruder_kill',
  targetPoint: { x: 194.48765719714524, y: 188.72443123705932 },
};
assert(kill(dumpPlan, [green1]) === green1,
  '1: the predicted-kill target (green #1) is identified, so no mine is spent against it.');

// 2. Only that enemy is dropped: with a second, still-living enemy, it survives as a threat.
const both = kill(dumpPlan, [green1, green2]);
assert(both === green1, '2: only the killed enemy (green #1) is flagged; a second enemy stays a threat.');

// 3. A move that does NOT predict a hit (e.g. a cargo run, or a shot that would miss) must
//    NOT drop the threat — the enemy is still alive to menace the flag.
assert(kill({ predictedOutcome: 'range_end', targetPoint: { x: 194, y: 189 } }, [green1]) === null,
  '3: a non-hit move does not drop the enemy from the threat set.');
assert(kill({ goalName: 'simple_step2_cargo', targetPoint: { x: 194, y: 189 } }, [green1]) === null,
  '3b: a cargo move (no predicted hit) keeps the enemy as a threat.');

// 4. A predicted hit whose target does NOT coincide with any enemy -> no drop (don't strip a
//    threat that isn't actually the one being hit).
assert(kill({ predictedOutcome: 'target_hit_direct', targetPoint: { x: 20, y: 20 } }, [green1]) === null,
  '4: a hit aimed away from every enemy drops nobody.');

// 5. An explicit targetEnemy reference is matched too (preferred over targetPoint).
assert(kill({ predictedOutcome: 'target_hit_direct', targetEnemy: { x: 60, y: 500 } }, [green1, green2]) === green2,
  '5: an explicit targetEnemy is matched to the right enemy.');

// 6. No enemies / no plan -> null (no crash).
assert(kill(dumpPlan, []) === null, '6: with no enemies there is nothing to drop.');
assert(kill(null, [green1]) === null, '6b: a missing plan drops nobody.');

console.log('Smoke test passed: getAiPlanKillTargetEnemy flags the enemy a predicted-kill move removes (so no defensive mine is wasted on it), while never dropping a threat on a non-hit or an aim that misses every enemy.');
