#!/usr/bin/env node
'use strict';

// Smoke test: getAiSelfSabotageLandingPenalty — penalize an attack that lands our
// plane deep in the enemy's base, scaled by how few planes we have left. From a
// real caught move (aiDumpBadMove, turn 5): blue's LAST plane (62,48) flew the
// whole field (544px) to kill green at its base and ram the bottom wall, landing
// at (62,624) — dead next turn. The penalty makes that suicidal far shot lose to a
// safer kill; with a full fleet an aggressive push is barely penalized.

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
vm.runInContext(extractFunctionSource(source, 'getAiSelfSabotageLandingPenalty'), context);
const penalty = (lx, ly, base, mid, alive, max) => context.getAiSelfSabotageLandingPenalty(lx, ly, base, mid, alive, max);

const MID = 320;                       // field midline (height 640)
const MAX = 400;                       // AI_SELF_SABOTAGE_LANDING_PENALTY
const greenBase = { x: 180, y: 609 };  // enemy base for the blue AI
const blueBase = { x: 180, y: 31 };    // enemy base for the green AI

// 1. THE CAUGHT MOVE: last plane lands at (62,624), the enemy base row -> full penalty.
assert(Math.round(penalty(62, 624, greenBase, MID, 1, MAX)) === 400,
  '1: the last plane landing in the enemy base row is penalized to the max.');

// 2. Same landing with a full fleet (3 planes) -> barely penalized (aggression preserved).
assert(Math.round(penalty(62, 624, greenBase, MID, 3, MAX)) === 80,
  '2: with a full fleet the same push is only lightly penalized.');

// 3. Two planes -> half penalty.
assert(Math.round(penalty(62, 624, greenBase, MID, 2, MAX)) === 200, '3: two planes = half penalty.');

// 4. Landing in OUR OWN half -> no penalty (retreat / defense is never self-sabotage).
assert(penalty(180, 100, greenBase, MID, 1, MAX) === 0, '4: a landing in our own half is never penalized.');

// 5. Landing exactly on the midline -> no penalty.
assert(penalty(180, 320, greenBase, MID, 1, MAX) === 0, '5: the midline is the zero point.');

// 6. Mid enemy-half landing scales between (last plane).
{
  const p = penalty(180, 460, greenBase, MID, 1, MAX); // depth (460-320)/289 ~ 0.48
  assert(p > 150 && p < 240, `6: a mid enemy-half landing scales partway (got ${Math.round(p)}).`);
}

// 7. Symmetry: for the green AI (enemy base at the TOP) a deep landing there is penalized.
assert(penalty(180, 50, blueBase, MID, 1, MAX) > 300, '7: the rule is symmetric for the green AI.');

// 8. Guards.
assert(penalty(62, 624, null, MID, 1, MAX) === 0, '8: no enemy base -> no penalty.');
assert(penalty(62, 624, greenBase, MID, 1, 0) === 0, '8b: zero max -> no penalty.');

console.log('Smoke test passed: getAiSelfSabotageLandingPenalty penalizes our last plane landing deep in the enemy base, scales down with more planes / shallower landings, and never penalizes own-half landings.');
