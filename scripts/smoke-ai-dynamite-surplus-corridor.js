#!/usr/bin/env node
'use strict';

// Smoke test: surplus-scaled dynamite economics + kill-aware acceptance.
//
// The AI hoarded dynamite: a flat 3-brick cap and a fixed acceptance threshold meant that
// holding 10 charges behaved exactly like holding 1 — it never carved deep corridors and
// never spent a charge to open a KILL the current plan missed. Now:
//   - getAiDynamiteSurplusPolicy scales the per-lane brick cap (3 -> up to 6) and fades the
//     per-brick cost toward ~0 as the stock grows, while staying conservative when scarce
//     (so #2888 "don't burn a charge for one box" is preserved with a small stock).
//   - evaluateDynamiteAugmentedAcceptance, when aggressive (plenty of stock), accepts a
//     carved lane that ADDS a kill the current plan misses — the "взорви кирпичи и убей" case.

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
const context = {
  Math, Number,
  AI_DYNAMITE_SURPLUS_THRESHOLD: 5,
  AI_DYNAMITE_MAX_BRICKS_CAP: 6,
  AI_DYNAMITE_BASE_BRICK_COST: 0.04,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getAiDynamiteSurplusPolicy'), context);
vm.runInContext(extractFunctionSource(source, 'evaluateDynamiteAugmentedAcceptance'), context);
const policy = (n) => context.getAiDynamiteSurplusPolicy(n);
const accept = (alt, altScore, cur, curStats, opts) =>
  context.evaluateDynamiteAugmentedAcceptance(alt, altScore, cur, curStats, opts);

// ---------------------------------------------------------------------------
// 1. getAiDynamiteSurplusPolicy — cap + cost + aggression scale with the stock.
// ---------------------------------------------------------------------------
// Scarce stock behaves exactly like the OLD flat cap (min(3, charges)) — no regression.
assert(policy(1).maxBricks === 1, '1: 1 charge -> cap 1 (== old min(3,1)).');
assert(policy(2).maxBricks === 2, '1b: 2 charges -> cap 2.');
assert(policy(3).maxBricks === 3, '1c: 3 charges -> cap 3 (unchanged).');
// Surplus deepens the corridor, clamped to the cap.
assert(policy(5).maxBricks === 4, '1d: 5 charges -> cap 4 (deeper corridor).');
assert(policy(10).maxBricks === 6, '1e: 10 charges -> cap 6 (clamped to MAX_BRICKS_CAP).');
assert(policy(50).maxBricks === 6, '1f: cap never exceeds MAX_BRICKS_CAP.');

// Aggression flips on at the surplus threshold.
assert(policy(4).aggressive === false, '1g: below threshold -> not aggressive.');
assert(policy(5).aggressive === true, '1h: at threshold -> aggressive.');
assert(policy(10).aggressive === true, '1i: well above -> aggressive.');

// Per-brick cost fades as the surplus grows (a spare charge is nearly free) but never 0.
assert(Math.abs(policy(3).costPerBlocker - 0.04) < 1e-9, '1j: scarce -> full per-brick cost.');
assert(policy(10).costPerBlocker < policy(3).costPerBlocker, '1k: a big surplus makes bricks cheaper.');
assert(policy(10).costPerBlocker > 0, '1l: cost never drops to exactly 0 (a pointless detour still costs).');

// ---------------------------------------------------------------------------
// 2. evaluateDynamiteAugmentedAcceptance — aggressive accepts an ADDED kill.
// ---------------------------------------------------------------------------
// The dump case: current plan is a fat 4-cargo sweep (0 kills); the dynamite lane kills 2
// greens but collects fewer boxes and scores lower. Killing is worth a charge WITH a surplus.
const curSweep = { score: 1072, multiTargetCount: 4, multiTargetEnemy: 0 };
const curStats = { totalPickups: 4, enemyHits: 0, threatsNearLanding: 0 };
const dynKillStats = { totalPickups: 2, enemyHits: 2, threatsNearLanding: 1 };
const dynKillScore = 503; // lower than current

assert(accept(dynKillStats, dynKillScore, curSweep, curStats, { aggressive: true }).accepted === true,
  '2: with a surplus, a lane that ADDS kills is accepted over a higher-scoring cargo sweep.');
assert(accept(dynKillStats, dynKillScore, curSweep, curStats, { aggressive: false }).accepted === false,
  '2b: WITHOUT a surplus, the same lane is rejected (a scarce charge is not spent for it).');
// The old 4-arg call site (no options) must still behave as the non-aggressive path.
assert(accept(dynKillStats, dynKillScore, curSweep, curStats).accepted === false,
  '2c: legacy 4-arg call defaults to conservative (backward compatible).');

// ---------------------------------------------------------------------------
// 3. Guardrails preserved regardless of aggression.
// ---------------------------------------------------------------------------
// Never trade AWAY a kill the current plan already lines up.
const curHasKill = { score: 400, multiTargetEnemy: 1 };
const curKillStats = { totalPickups: 1, enemyHits: 1, threatsNearLanding: 0 };
const altDropsKill = { totalPickups: 3, enemyHits: 0, threatsNearLanding: 0 };
assert(accept(altDropsKill, 999, curHasKill, curKillStats, { aggressive: true }).accepted === false,
  '3: dropping a kill the current plan has is rejected even when aggressive.');

// Collecting strictly more is still accepted without a surplus (pre-existing behavior).
const altMoreCargo = { totalPickups: 5, enemyHits: 0, threatsNearLanding: 0 };
assert(accept(altMoreCargo, 100, curSweep, curStats, { aggressive: false }).accepted === true,
  '3b: collecting more targets is accepted regardless of surplus.');

console.log('Smoke test passed: getAiDynamiteSurplusPolicy scales the corridor depth/cost with the dynamite stock (conservative when scarce, deep + cheap when hoarding), and evaluateDynamiteAugmentedAcceptance spends a surplus charge to open a kill the current plan misses while never trading away a kill it already has.');
