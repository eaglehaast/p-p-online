#!/usr/bin/env node
'use strict';

// Smoke test: the fuel replan never aims the launch at an off-field phantom point.
//
// Bug (from an aiDumpBadMove): blue #6 had a working last-resort ricochet KILL on the only
// green. Fuel ("harpy_strike_return") was added and the replan tried its aim targets; the
// "harpy_return_home" target failed to plan, so it fell through to "original_landing" —
// which for a ricochet is `plane + launch vector projected straight`, i.e. OFF-FIELD
// (x=462, y=-304). planPathWithSpecialRouteProbe happily aimed the fuel-boosted launch at
// that phantom point, so the plane flew a useless hop across its own side (landing ~288,42)
// instead of striking. A working kill became a "тупой бесполезный ход".
//
// buildAiFuelReplanAimTargets bakes in the dynamite-replan (#2894) lesson: the fallback aim
// uses the plan's REAL endpoint (a hitting shot ends at the enemy it strikes), and any aim
// point off the playable field is dropped outright.

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
  Math, Number, Set,
  FIELD_LEFT: 0, FIELD_TOP: 0, FIELD_WIDTH: 360, FIELD_HEIGHT: 640,
  FIELD_FLIGHT_DURATION_SEC: 1.5111111,
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getAiMoveLandingPoint'), context);
vm.runInContext(extractFunctionSource(source, 'buildAiFuelReplanAimTargets'), context);
const build = (mv, enemy) => context.buildAiFuelReplanAimTargets(mv, enemy);
const labels = (targets) => targets.map((t) => t.label);

// --- The exact dump scenario ---------------------------------------------------------------
// A ricochet that HITS green #2. Its launch vector projected straight lands OFF-FIELD.
const plane = { x: 51.54, y: 80.75 };
const enemy = { x: 264.85, y: 381.21 };
// vx/vy chosen so plane + v*dur = the off-field projection (~462.8, -304.3) from the dump.
const dur = context.FIELD_FLIGHT_DURATION_SEC;
const ricochetKill = {
  plane,
  vx: (462.8 - plane.x) / dur,
  vy: (-304.3 - plane.y) / dur,
  predictedOutcome: 'target_hit_after_ricochet',
  targetPoint: { x: enemy.x, y: enemy.y },
  aiFuelHarpyReturnTarget: { x: 180, y: 31, label: 'harpy_return_home' },
};

const targets = build(ricochetKill, null); // last-resort move carries no targetEnemy

// 1. The off-field straight-line projection is NEVER offered as an aim point.
for(const t of targets){
  assert(t.y >= 0 && t.y <= 640 && t.x >= 0 && t.x <= 360,
    `1: every aim target stays on the playable field (offender: ${t.label} ${t.x},${t.y}).`);
}

// 2. The fallback now aims at the enemy the shot actually hits (real endpoint), not the hop.
const fallback = targets.find((t) => t.label === 'original_landing');
assert(fallback, '2: an original_landing fallback target still exists.');
assert(Math.abs(fallback.x - enemy.x) < 1e-6 && Math.abs(fallback.y - enemy.y) < 1e-6,
  '2b: the fallback aims at the enemy the ricochet strikes, not its off-field projection.');

// 3. Home is still offered (on-field), before the fallback.
assert(labels(targets).includes('harpy_return_home'), '3: the harpy return-home aim is kept (on-field).');
assert(labels(targets).indexOf('harpy_return_home') < labels(targets).indexOf('original_landing'),
  '3b: order preserved — home is still tried before the fallback.');

// --- A non-hitting plan keeps its straight-line landing (only ON-field) --------------------
// 4. A cargo move (no target_hit) whose landing is on-field uses that landing as the fallback.
const cargoMove = {
  plane: { x: 100, y: 100 },
  vx: (200 - 100) / dur, vy: (150 - 100) / dur, // lands at (200,150) — on field
  predictedOutcome: 'range_end',
};
const cargoTargets = build(cargoMove, null);
const cargoFallback = cargoTargets.find((t) => t.label === 'original_landing');
assert(cargoFallback && Math.abs(cargoFallback.x - 200) < 1e-6 && Math.abs(cargoFallback.y - 150) < 1e-6,
  '4: a non-hitting plan still uses its (on-field) straight-line landing.');

// 5. A non-hitting plan whose straight-line landing is OFF-field yields no phantom fallback.
const offFieldCargo = {
  plane: { x: 100, y: 100 },
  vx: (900 - 100) / dur, vy: (100 - 100) / dur, // lands at (900,100) — off the right edge
  predictedOutcome: 'range_end',
};
const offTargets = build(offFieldCargo, null);
assert(!offTargets.some((t) => t.label === 'original_landing'),
  '5: an off-field straight-line landing is dropped (no phantom aim point).');

// 6. A real targetEnemy is offered and on-field enemies are de-duped against the fallback.
const withEnemy = build(ricochetKill, { x: enemy.x, y: enemy.y });
const enemyCount = withEnemy.filter((t) => Math.round(t.x) === Math.round(enemy.x) && Math.round(t.y) === Math.round(enemy.y)).length;
assert(enemyCount === 1, '6: the enemy point is de-duplicated across target_enemy + fallback.');

console.log('Smoke test passed: buildAiFuelReplanAimTargets never aims the fuel launch at an off-field phantom point, and its fallback uses the plan\'s real endpoint (the enemy a hitting ricochet strikes) — so a fuel replan can no longer turn a working kill into a useless own-side hop.');
