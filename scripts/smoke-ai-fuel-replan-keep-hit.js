#!/usr/bin/env node
'use strict';

// Smoke test: a fuel replan must not trade a working kill for a miss.
//
// Recurrence of the fuel-replan bug after #2896. #2896 stopped the replan aiming at an
// OFF-FIELD phantom point; the aim now resolves to the enemy. But the replan still planned a
// NEW fuel-boosted route to that point which MISSED (predictedOutcome "range_end", landing
// short of the enemy) and the scheduler applied it UNCONDITIONALLY — so a confirmed
// defensive-intruder KILL became a useless range_end move, with fuel spent.
//
// doesFuelReplanBreakKill flags exactly that case (base hits, replan doesn't) so the
// scheduler keeps the clean base kill and drops the fuel.

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
const context = { String };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'doesFuelReplanBreakKill'), context);
const breaks = (base, replan) => context.doesFuelReplanBreakKill(base, replan);

// --- The dump case: base DIRECT kill, replan lands range_end (miss) ------------------------
const baseKill = { predictedOutcome: 'target_hit_direct' };
const replanMiss = { predictedOutcome: 'range_end' };
assert(breaks(baseKill, replanMiss) === true,
  '1: a base kill + a replan that lands range_end -> reject (the fuel bought a miss).');

// A base RICOCHET kill is protected the same way.
assert(breaks({ predictedOutcome: 'target_hit_after_ricochet' }, replanMiss) === true,
  '1b: a base ricochet kill degraded to a miss is also rejected.');

// --- The replan is kept when it STILL hits ------------------------------------------------
assert(breaks(baseKill, { predictedOutcome: 'target_hit_after_ricochet' }) === false,
  '2: a replan that still hits (extends the kill) is accepted.');
assert(breaks(baseKill, { predictedOutcome: 'target_hit_direct' }) === false,
  '2b: a replan that keeps a direct hit is accepted.');

// --- A base plan that does NOT hit is not protected (fuel is free to re-aim it) ------------
assert(breaks({ predictedOutcome: 'range_end' }, replanMiss) === false,
  '3: a non-hitting base plan (cargo/reposition) never triggers the guard.');
assert(breaks({ predictedOutcome: 'bounce_limit_reached' }, { predictedOutcome: 'range_end' }) === false,
  '3b: a non-hit base with any replan is not guarded.');

// --- Degenerate inputs never throw and never falsely reject --------------------------------
assert(breaks(null, replanMiss) === false, '4: no base plan -> not a break.');
assert(breaks(baseKill, null) === false, '4b: no replan move -> not a break (nothing to apply).');
assert(breaks({}, {}) === false, '4c: missing outcomes -> not a break.');

console.log('Smoke test passed: doesFuelReplanBreakKill rejects a fuel replan that turns a confirmed kill into a range_end miss (keep the base kill, drop the fuel), while accepting a replan that still hits and never firing on a non-hitting base plan.');
