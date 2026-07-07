#!/usr/bin/env node
'use strict';

// Smoke test: getAiSweepEnemyHitTolerancePx — the multi-target sweep's enemy hit
// tolerance widens when the plane can spend WINGS this turn. Wings roughly double the
// beneficial span (36 -> 96), so a spray that only GRAZES an enemy still kills with
// wings; widening the sweep tolerance lets the AI find and take a "поколотиться в щель"
// multikill it would otherwise miss. Without wings it stays at the conservative base.

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
  CELL_SIZE: 20,
  AI_SWEEP_ENEMY_HIT_TOLERANCE_PX: 20,
  PLANE_GEOMETRY_TRUTH: { DANGER_HITBOX_WIDTH: 36, BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96 },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getAiSweepEnemyHitTolerancePx'), context);

// Without wings -> the conservative base tolerance (danger half-width + margin).
assert(context.getAiSweepEnemyHitTolerancePx(false) === 20, '1: no wings -> base tolerance (20).');

// With wings -> wide half-span (96/2 = 48) + the same margin the base kept (20 - 18 = 2) = 50.
assert(context.getAiSweepEnemyHitTolerancePx(true) === 50, '2: wings -> widened tolerance (48 + margin 2 = 50).');

// The widened tolerance must be strictly larger (so grazing kills newly count) but stay
// BELOW the buff picker's own threshold (attacker 48 + enemy 18 = 66) so the sweep never
// over-counts relative to what the picker will actually grant wings for.
const wide = context.getAiSweepEnemyHitTolerancePx(true);
assert(wide > 20, '3: the wings tolerance is wider than the base (grazing kills now count).');
assert(wide < 66, '3b: it stays below the buff picker attacker+enemy threshold (66), so no over-count.');

// Robust to a missing geometry table -> falls back to sane constants (48 + 2 = 50).
const ctx2 = { Math, Number, CELL_SIZE: 20, AI_SWEEP_ENEMY_HIT_TOLERANCE_PX: 20 };
vm.createContext(ctx2);
vm.runInContext(extractFunctionSource(source, 'getAiSweepEnemyHitTolerancePx'), ctx2);
assert(ctx2.getAiSweepEnemyHitTolerancePx(false) === 20 && ctx2.getAiSweepEnemyHitTolerancePx(true) === 50,
  '4: missing PLANE_GEOMETRY_TRUTH -> safe fallback constants.');

console.log('Smoke test passed: getAiSweepEnemyHitTolerancePx widens the enemy sweep tolerance with wings (grazing kills count) and stays below the buff picker threshold, base otherwise.');
