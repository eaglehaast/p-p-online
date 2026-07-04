#!/usr/bin/env node
'use strict';

// Smoke test: isDefensiveIntruderThreat — the gate for promoting a defensive kill
// above cargo. From a real caught move (aiDumpBadMove, turn 3, round 2): green #0
// (34,77) had pushed into blue's half right by the blue flag (180,51) and base
// (180,31), threatening a flag-steal and the back line. Blue could kill it point-
// blank (blue #5, ~92px) but flew for a cargo instead. Only an enemy that is BOTH
// in our half AND within striking distance of our flag/base counts — so ordinary
// enemies (center / their own half) never trigger cargo-ignoring.

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
const context = { Math };
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'isDefensiveIntruderThreat'), context);
const isThreat = (enemy, ownBase, flags, midY, px) => context.isDefensiveIntruderThreat(enemy, ownBase, flags, midY, px);

const MID = 320;              // field midline (height 640)
const TH = 20 * 12;           // AI_DEFENSIVE_KILL_INTRUDER_PX = 12 cells = 240
const blueBase = { x: 180, y: 31 };
const blueFlag = { x: 180, y: 51 };
const greenBase = { x: 180, y: 609 };
const greenFlag = { x: 180, y: 578 };

// 1. THE CAUGHT MOVE: green #0 (34,77) — blue's half, next to blue flag/base.
assert(isThreat({ x: 34, y: 76.93 }, blueBase, [blueFlag], MID, TH) === true,
  '1: an enemy in our half by our flag/base is an intruder.');

// 2. In our half but far from our flag/base -> NOT an intruder (no cargo-ignoring).
assert(isThreat({ x: 180, y: 300 }, blueBase, [blueFlag], MID, TH) === false,
  '2: an enemy in our half but far from our assets is not promoted.');

// 3. In the enemy's own half -> never an intruder.
assert(isThreat({ x: 180, y: 500 }, blueBase, [blueFlag], MID, TH) === false,
  '3: an enemy in its own half is not an intruder.');

// 4. Near our flag but wrong half (enemy half) -> not an intruder.
assert(isThreat({ x: 180, y: 560 }, blueBase, [blueFlag], MID, TH) === false,
  '4: proximity alone (wrong half) does not make an intruder.');

// 5. Symmetry: green AI, an enemy deep in GREEN's half near green base -> intruder.
assert(isThreat({ x: 180, y: 560 }, greenBase, [greenFlag], MID, TH) === true,
  '5: the rule is symmetric for the green AI.');

// 6. Flags mode off (no flag anchors): the base check still catches the intrusion.
assert(isThreat({ x: 34, y: 76.93 }, blueBase, [], MID, TH) === true,
  '6: with no flags, an enemy near our base is still an intruder.');

// 7. Near our flag only (out of base range) -> intruder via the flag check.
assert(isThreat({ x: 60, y: 250 }, blueBase, [{ x: 60, y: 60 }], MID, TH) === true,
  '7: an enemy within striking distance of our flag is an intruder even if far from base.');

// 8. Guard against bad input.
assert(isThreat(null, blueBase, [blueFlag], MID, TH) === false, '8: null enemy is safe.');
assert(isThreat({ x: 34, y: 77 }, null, [blueFlag], MID, TH) === false, '8b: null base is safe.');

console.log('Smoke test passed: isDefensiveIntruderThreat flags an enemy in our half near our flag/base (both colors, with or without flags), and never a center / own-half / far enemy.');
