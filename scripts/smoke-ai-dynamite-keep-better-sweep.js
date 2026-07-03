#!/usr/bin/env node
'use strict';

// Smoke test: evaluateDynamiteAugmentedAcceptance — the dynamite-augmented planner
// must not hijack a base plan that is already at least as good. From a real caught
// move (aiDumpBadMove, turn 6): the base multi-target SWEEP already lined up 1 cargo
// + 1 KILL (via ricochet), but its landing was recorded as a straight-line, off-field
// projection (539,567) -> the segment counter saw 0 pickups and score 0, so a 1-cargo
// dynamite grab "beat" that phantom baseline and threw the kill away. The fix trusts
// the plan's own reported coverage, ignores score wins over a 0 baseline, and never
// trades away a kill.

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
const context = { Math, Number };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'evaluateDynamiteAugmentedAcceptance'), context);
const evalAccept = (altStats, altScore, plan, curStats) =>
  context.evaluateDynamiteAugmentedAcceptance(altStats, altScore, plan, curStats);

// 1. THE CAUGHT MOVE (turn 6): base sweep already has 1 cargo + 1 kill; the dynamite
//    cargo grab reaches only the cargo -> must be REJECTED (don't drop the kill).
{
  const basePlan = { score: 0, multiTargetCount: 2, multiTargetCargo: 1, multiTargetEnemy: 1 };
  const currentStats = { totalPickups: 0, enemyHits: 0, threatsNearLanding: 1 };
  const altStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 1 };
  const res = evalAccept(altStats, 164.997, basePlan, currentStats);
  assert(res.accepted === false, '1: a dynamite cargo grab must NOT hijack a sweep that already lines up a kill.');
  assert(res.dropsAKill === true, '1b: the rejection is because the alt drops the base plan kill.');
}

// 2. Legit use: the base plan reaches nothing; opening a path collects 2 -> ACCEPTED.
{
  const basePlan = { score: 0 };
  const currentStats = { totalPickups: 0, enemyHits: 0, threatsNearLanding: 0 };
  const altStats = { totalPickups: 2, enemyHits: 0, threatsNearLanding: 0 };
  const res = evalAccept(altStats, 50, basePlan, currentStats);
  assert(res.accepted === true && res.collectsMore === true, '2: opening a path to more targets is still accepted.');
}

// 3. Cargo upgrade over a real plan (positive score) -> ACCEPTED.
{
  const basePlan = { score: 100 };
  const currentStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 0 };
  const altStats = { totalPickups: 2, enemyHits: 0, threatsNearLanding: 0 };
  assert(evalAccept(altStats, 105, basePlan, currentStats).accepted === true, '3: a genuine extra pickup is accepted.');
}

// 4. Never trade a DIRECT kill (counted on the segment) for cargo.
{
  const basePlan = { score: 90 };
  const currentStats = { totalPickups: 1, enemyHits: 1, threatsNearLanding: 0 }; // a kill on the line
  const altStats = { totalPickups: 2, enemyHits: 0, threatsNearLanding: 0 };     // 2 cargo, no kill
  const res = evalAccept(altStats, 300, basePlan, currentStats);
  assert(res.accepted === false && res.dropsAKill === true, '4: a cargo grab cannot trade away a direct kill.');
}

// 5. A score win must NOT fire against a degenerate 0-score baseline...
{
  const basePlan = { score: 0 };
  const currentStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 0 };
  const altStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 0 };
  assert(evalAccept(altStats, 200, basePlan, currentStats).accepted === false,
    '5: "200 > 0" must not hijack a 0-score sweep with equal pickups.');
}
// ...but a real score improvement over a positive baseline is still honored.
{
  const basePlan = { score: 100 };
  const currentStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 0 };
  const altStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 0 };
  assert(evalAccept(altStats, 200, basePlan, currentStats).scoreSignificantlyBetter === true,
    '5b: a real score win over a positive baseline still counts.');
}

// 6. Equal pickups but a safer landing -> ACCEPTED.
{
  const basePlan = { score: 80 };
  const currentStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 2 };
  const altStats = { totalPickups: 1, enemyHits: 0, threatsNearLanding: 0 };
  const res = evalAccept(altStats, 80, basePlan, currentStats);
  assert(res.accepted === true && res.sameCollectsButSafer === true, '6: same pickups, safer landing is accepted.');
}

console.log('Smoke test passed: dynamite augmentation keeps a base sweep that already lines up a kill, ignores score wins over a 0 baseline, still accepts genuine pickup/safety/score upgrades.');
