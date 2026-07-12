#!/usr/bin/env node
'use strict';

// Smoke test: a ricochet attack must not buy harpy-strike-return fuel.
//
// Repeated bad move: the AI added "harpy_strike_return" fuel to a RICOCHET that already kills
// (bounceCount 3, target_hit_after_ricochet, 320px < 600px range). The harpy gate measured the
// round trip from selectedPlan.landingX/Y — the launch vector projected STRAIGHT, which for a
// ricochet is off-field (453, -25) — so the math is bogus; and the fuel is executed as
// forceFuelMoveToMaxRange, which rams the BOUNCED path FORWARD past the kill. Across turns that
// landed the plane off-field, into a broken replan, and (this dump) straight into the AI's OWN
// mine. isAiRicochetRoutePlan gates ricochets out of the harpy fuel decision (the same reason
// the sibling fuelExtendCapturesMoreTargets gate excludes ricochets).

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
vm.runInContext(extractFunctionSource(source, 'isAiRicochetRoutePlan'), context);
const isRicochet = (plan) => context.isAiRicochetRoutePlan(plan);

// --- The dump case: a bounced kill is a ricochet (harpy fuel blocked) ----------------------
const bouncedKill = { routeClass: 'ricochet', bounceCount: 3, predictedOutcome: 'target_hit_after_ricochet' };
assert(isRicochet(bouncedKill) === true, '1: a 3-bounce ricochet kill is a ricochet route (harpy fuel blocked).');

// Either signal alone flags it (routeClass OR a positive bounce count).
assert(isRicochet({ routeClass: 'ricochet', bounceCount: 0 }) === true, '1b: routeClass "ricochet" alone flags it.');
assert(isRicochet({ routeClass: 'direct', bounceCount: 2 }) === true, '1c: a positive bounceCount alone flags it.');
assert(isRicochet({ routeClass: 'gap', bounceCount: 1 }) === true, '1d: any bounced route is flagged.');

// --- A DIRECT attack is NOT a ricochet (harpy fuel still allowed for those) -----------------
assert(isRicochet({ routeClass: 'direct', bounceCount: 0 }) === false, '2: a straight direct attack is not a ricochet.');
assert(isRicochet({ routeClass: 'direct' }) === false, '2b: direct with no bounceCount field is not a ricochet.');

// --- Degenerate inputs never throw and default to "not a ricochet" (don't over-block) -------
assert(isRicochet(null) === false, '3: null plan -> not a ricochet.');
assert(isRicochet({}) === false, '3b: empty plan -> not a ricochet.');
assert(isRicochet({ bounceCount: 'x' }) === false, '3c: a non-numeric bounceCount is treated as 0.');

console.log('Smoke test passed: isAiRicochetRoutePlan flags any bounced route (by routeClass or bounceCount) so a ricochet attack is excluded from harpy-strike fuel — no more ramming the fuel-extended bounce path into the AI\'s own mine — while direct attacks are unaffected.');
