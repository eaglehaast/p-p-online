#!/usr/bin/env node
'use strict';

// Smoke test: shouldDemoteRiskyAttackFromTier1 — the death-trap landing-risk demotion must
// treat a DIRECT kill and a RICOCHET kill of the same enemy IDENTICALLY. The old guard used
// `isInvestedShot = bounceCount > 0`, which demoted a risky direct single-kill while shielding
// an equally risky ricochet single-kill — an artificial ricochet-over-direct preference. Now
// a single-target kill is judged purely on landing SAFETY regardless of bounce; only a genuine
// MULTI-target kill (worth the risk) is spared. So attacks rank by targets / safety, not by
// ricochet-vs-direct.

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
const context = { Math, Number, AI_ATTACK_LANDING_RISK_DEMOTE: 0.8 };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'shouldDemoteRiskyAttackFromTier1'), context);
const demote = (move, risk, allowed) => context.shouldDemoteRiskyAttackFromTier1(move, risk, allowed);

const allowed = 0.3; // bar = max(0.3, 0.8) = 0.8
const directSingle = { bounceCount: 0, routeClass: 'direct' };
const ricochetSingle = { bounceCount: 1, routeClass: 'ricochet' };

// 1. SYMMETRY: a risky (0.9 > 0.8) single-target kill is demoted whether direct OR ricochet.
assert(demote(directSingle, 0.9, allowed) === true, '1: a risky DIRECT single-kill is demoted (safety).');
assert(demote(ricochetSingle, 0.9, allowed) === true,
  '1b: a risky RICOCHET single-kill is demoted TOO — no ricochet exemption (the fix).');
assert(demote(directSingle, 0.9, allowed) === demote(ricochetSingle, 0.9, allowed),
  '1c: direct and ricochet single-kills are treated identically at the same landing risk.');

// 2. A genuine MULTI-target kill is spared (worth the risky landing), direct or ricochet.
assert(demote({ bounceCount: 0, multiTargetCount: 2 }, 0.95, allowed) === false,
  '2: a multi-target kill is not demoted (worth the risk).');
assert(demote({ bounceCount: 2, multiKillCount: 3 }, 0.95, allowed) === false,
  '2b: a multi-kill ricochet is spared too.');

// 3. Below the bar -> never demoted (a safe landing keeps its tier), either type.
assert(demote(directSingle, 0.5, allowed) === false, '3: a safe-landing direct kill is not demoted.');
assert(demote(ricochetSingle, 0.5, allowed) === false, '3b: a safe-landing ricochet kill is not demoted.');

// 4. The allowedRisk raises the bar when it exceeds the floor: risk 0.85 with allowed 0.9
//    -> bar 0.9 -> not demoted.
assert(demote(directSingle, 0.85, 0.9) === false, '4: a higher allowedRisk raises the bar (0.85 < 0.9).');

// 5. Exactly at the bar is NOT demoted (strict greater-than).
assert(demote(directSingle, 0.8, allowed) === false, '5: risk exactly at the bar is not demoted.');

console.log('Smoke test passed: shouldDemoteRiskyAttackFromTier1 demotes risky single-target kills by landing safety alone — direct and ricochet identically — and spares only genuine multi-kills, removing the artificial ricochet-over-direct exemption.');
