#!/usr/bin/env node
'use strict';

// Smoke test: isAiDynamiteOpeningWorthwhile — dynamite economics. Blowing a wall to reach a
// SINGLE cargo is a near-even item-for-item trade (plus a wasted turn), so it is skipped.
// From a real aiDumpBadMove: blue #4 dynamited a brick to grab one cargo. But dynamite must
// NOT go unused — it stays for the payoffs that justify it: a kill (enemy), the enemy flag
// or base, a finisher, or a lane that collects multiple targets. Only the lone-box case is cut.

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
const context = { Number, String };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'isAiDynamiteOpeningWorthwhile'), context);

const dyn = { target: { colliderId: 'brick1#1' }, finalDestination: { x: 164, y: 254, kind: 'point' } };
const worth = (plan) => context.isAiDynamiteOpeningWorthwhile(plan, dyn);

// 1. THE BUG: a single-cargo pickup (the dumped plan). goalName/decisionReason are cargo,
//    one cargo in play, no multi-target -> NOT worth a dynamite.
assert(worth({
  goalName: 'simple_step2_cargo', decisionReason: 'simple_step2_pickup_cargo',
  whyChosen: 'cargo_priority_equal_to_enemy_attack_with_ricochet_lane', readyCargoCount: 1,
}) === false, '1: a single-cargo pickup is NOT worth a dynamite (the reported bad trade).');

// 1b. The whyChosen mentions "enemy_attack", but we key on goalName + decisionReason, so a
//     cargo plan is not misread as an attack.
assert(worth({
  goalName: 'simple_step2_cargo', decisionReason: 'simple_step2_pickup_cargo',
  whyChosen: 'cargo_priority_equal_to_enemy_attack_with_ricochet_lane', readyCargoCount: 1,
}) === false, '1b: "enemy_attack" in whyChosen does not flip a cargo pickup to worthwhile.');

// 2. An enemy attack (a kill) justifies a charge.
assert(worth({ goalName: 'simple_step2_attack', decisionReason: 'simple_step2_direct_enemy' }) === true,
  '2: clearing a wall to reach an enemy (a kill) is worth a dynamite.');

// 3. An enemy-flag capture justifies it.
assert(worth({ goalName: 'simple_step2_flag', decisionReason: 'capture_enemy_flag' }) === true,
  '3: reaching the enemy flag is worth a dynamite.');

// 4. A base attack justifies it.
assert(worth({ goalName: 'simple_step2_base_rush', decisionReason: 'attack_enemy_base' }) === true,
  '4: reaching the enemy base is worth a dynamite.');

// 5. A multi-target lane (>= 2 targets) justifies it even if cargo-flavoured.
assert(worth({ goalName: 'simple_step2_cargo', decisionReason: 'cargo_multi', multiTargetCount: 3 }) === true,
  '5: a lane that collects multiple targets is worth a dynamite.');

// 6. Several ready cargo in play (a possible multi-pickup sweep) -> allowed.
assert(worth({ goalName: 'simple_step2_cargo', decisionReason: 'simple_step2_pickup_cargo', readyCargoCount: 3 }) === true,
  '6: with several cargo in play a dynamite pickup is allowed (possible multi-pickup).');

// 7. No opportunity -> not worthwhile (nothing to spend on).
assert(context.isAiDynamiteOpeningWorthwhile({ goalName: 'simple_step2_cargo' }, null) === false,
  '7: with no dynamite opportunity there is nothing to justify.');

// 8. A non-cargo, non-objective plan (e.g. advance) still keeps dynamite — we cut only the
//    lone-cargo case, not dynamite in general.
assert(worth({ goalName: 'simple_step2_advance', decisionReason: 'advance_toward_fight' }) === true,
  '8: a non-cargo plan keeps dynamite (only the lone-box pickup is cut, not dynamite itself).');

console.log('Smoke test passed: isAiDynamiteOpeningWorthwhile cuts only the blow-a-wall-for-one-box trade, keeping dynamite for kills / flags / base / multi-target and non-cargo plans.');
