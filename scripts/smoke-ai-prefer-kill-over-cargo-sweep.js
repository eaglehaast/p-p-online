#!/usr/bin/env node
'use strict';

// Smoke test: a cargo-only pair sweep must not steal the turn from an enemy KILL.
//
// Bug (from an aiDumpBadMove): blue #6 had a clean direct kill of green #2 — the ONLY
// remaining enemy — but the selector overrode it with a 2-target ricochet sweep that grabs
// 2 CARGO and 0 kills (multiTargetEnemy: 0), then placed a defensive mine against that same
// green. The pair-sweep override ("prefer a 2-target sweep over any single-target plan")
// treated "2 boxes" as beating "1 kill".
//
// aiPlanKillsEnemy identifies a plan that removes an enemy plane; the selector now blocks the
// pair-sweep override when the current plan kills AND the sweep brings no kill of its own.
// (Killing the enemy also lets the defensive-mine planner drop it from the threat set — see
// getAiPlanRemovedEnemies / #2897 — so no mine is wasted either.)

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
vm.runInContext(extractFunctionSource(source, 'aiPlanKillsEnemy'), context);
const kills = (plan) => context.aiPlanKillsEnemy(plan);

// The selector's guard, reproduced against the helper: block the pair sweep when the current
// plan kills and the sweep brings no kill.
const sweepWouldTradeAwayKill = (currentPlan, sweep) =>
  kills(currentPlan) && (Number(sweep?.multiTargetEnemy) || 0) === 0;

// --- aiPlanKillsEnemy ----------------------------------------------------------------------
assert(kills({ predictedOutcome: 'target_hit_direct' }) === true, '1: a confirmed direct hit kills an enemy.');
assert(kills({ predictedOutcome: 'target_hit_after_ricochet' }) === true, '1b: a confirmed ricochet hit kills.');
assert(kills({ multiTargetEnemy: 1 }) === true, '1c: a sweep that sweeps an enemy kills.');
assert(kills({ predictedOutcome: 'range_end' }) === false, '2: a range_end (miss) is not a kill.');
assert(kills({ multiTargetEnemy: 0, multiTargetCargo: 2 }) === false, '2b: a cargo-only sweep is not a kill.');
assert(kills(null) === false, '2c: no plan -> not a kill.');
assert(kills({}) === false, '2d: empty plan -> not a kill.');

// --- The override guard --------------------------------------------------------------------
const directKill = { predictedOutcome: 'target_hit_direct', targetPoint: { x: 297, y: 333 } };
const cargoOnlySweep = { multiTargetCount: 2, multiTargetCargo: 2, multiTargetEnemy: 0 };

// The dump case: a clean kill vs a cargo-only sweep -> keep the kill (block the override).
assert(sweepWouldTradeAwayKill(directKill, cargoOnlySweep) === true,
  '3: a cargo-only pair sweep is blocked from overriding a confirmed kill.');

// A sweep that ALSO kills is NOT blocked (strictly better than the single kill).
const killingSweep = { multiTargetCount: 2, multiTargetCargo: 1, multiTargetEnemy: 1 };
assert(sweepWouldTradeAwayKill(directKill, killingSweep) === false,
  '3b: a sweep that also kills still wins (not blocked).');

// When the current plan is NOT a kill (cargo / center), the sweep override still applies.
const cargoGrab = { decisionReason: 'simple_step2_pickup_cargo', predictedOutcome: 'range_end' };
assert(sweepWouldTradeAwayKill(cargoGrab, cargoOnlySweep) === false,
  '3c: a cargo-only sweep still overrides a non-kill plan (more cargo is better than one box).');

console.log('Smoke test passed: aiPlanKillsEnemy flags plans that remove an enemy, and the pair-sweep override is blocked only when it would trade a kill for cargo-only pickups — so the AI directly kills the (last) enemy instead of grabbing two boxes and mining it.');
