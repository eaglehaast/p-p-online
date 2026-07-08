#!/usr/bin/env node
'use strict';

// Smoke test: the AI does NOT switch on wide wings when doing so drives the plane into a
// mine. Wings widen the mine trigger (getMineEffectiveTriggerRadius jumps from the bare
// span, 11 + 18 = 29, to the broad-wing span, 11 + 48 = 59). shouldAiUseWingsForSelectedPlan
// now refuses wings when the WIDE span sweeps the flight path into a mine that the BARE span
// clears — the "unluckily turned on wide wings next to a mine and blew up" case. A move that
// already rams a mine WITHOUT wings is a separate problem (wings add no NEW mine risk), so the
// guard fires only on the wings-caused detonation, and never when the field is mine-free.

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

function getDistanceFromPointToSegment(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

const source = fs.readFileSync('script.js', 'utf8');

const plane = { x: 0, y: 0, color: 'blue', activeTurnBuffs: {} };
// The plane flies straight down its launch line to (0, 200).
const straightPath = [{ x: 0, y: 0 }, { x: 0, y: 200 }];

const context = {
  Math, Number, Array, Boolean,
  CELL_SIZE: 20,
  FIELD_FLIGHT_DURATION_SEC: 1.5,
  AI_WINGS_MIN_PICKUPS: 2,
  AI_WINGS_LONG_SHOT_RATIO: 0.6,
  AI_WINGS_ABUNDANCE_RELAX: 0.15,
  AI_WINGS_BOLD_RATIO_FLOOR: 0.2,
  AI_WINGS_BOLD_SINGLE_TARGET_COUNT: 3,
  INVENTORY_ITEM_TYPES: { WINGS: 'wings' },
  // Mine geometry: radius 11 (LOGICAL_PX/2) + wing half-span. Bare trigger 11 + 18 = 29,
  // wide 11 + 48 = 59 (broad-wing span).
  mineSizeRuntime: { LOGICAL_PX: 22 },
  mineTriggerRuntime: { WING_HALF_SPAN_PX: 18 },
  PLANE_GEOMETRY_TRUTH: { BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96 },
  MINE_TRIGGER_RADIUS: 28,
  planeHasActiveTurnBuff: (p, type) => Boolean(p?.activeTurnBuffs?.[type]),
  getEffectiveFlightRangeCells: () => 15, // range 300px
  getDistanceFromPointToSegment,
  getAiPlannedMovePredictedPath: () => straightPath,
  // Two cargos that ONLY the wide span sweeps (wideCount 2 > bareCount 0): without the mine
  // guard this returns true — wings would be used.
  doesCargoIntersectBeneficialZoneAlongPath: (cargo, p) => Boolean(p?.activeTurnBuffs?.wings),
  mines: [],
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'getMineEffectiveTriggerRadius'), context);
vm.runInContext(extractFunctionSource(source, 'doesFlightPathCrossMine'), context);
vm.runInContext(extractFunctionSource(source, 'shouldAiUseWingsForSelectedPlan'), context);

// Sanity: the extracted geometry gives the expected bare/wide triggers.
assert(context.getMineEffectiveTriggerRadius({ activeTurnBuffs: {} }) === 29, 'setup: bare trigger is 29.');
assert(context.getMineEffectiveTriggerRadius({ activeTurnBuffs: { wings: true } }) === 59, 'setup: wide trigger is 59.');

const selectedPlan = {
  plane, landingX: 0, landingY: 200, planDistance: 200,
  routeClass: 'direct', goalName: 'attack_multi_cargo',
};
const twoCargos = [{ x: 45, y: 100 }, { x: -45, y: 110 }];
const decide = () => context.shouldAiUseWingsForSelectedPlan(
  { readyCargo: twoCargos, enemies: [] }, selectedPlan, { availableCount: 1 });

// 1. No mines -> the multi-cargo sweep uses wings (baseline: the guard does not block).
context.mines = [];
assert(decide() === true, '1: with no mines, wings are used for the multi-cargo sweep (baseline).');

// 2. A mine 40px off the launch line: BARE span (29) clears it, WIDE span (59) sweeps into
//    it -> wings would self-detonate. The AI refuses wings.
context.mines = [{ owner: 'green', x: 40, y: 100 }];
assert(decide() === false,
  '2: a mine the bare span clears but the wide span hits -> wings refused (would self-detonate).');

// 3. A mine right ON the path (10px off): BOTH spans hit it, so wings add no NEW mine risk
//    (the move rams the mine regardless — a separate problem). The guard does not fire, and
//    wings are still used for the sweep.
context.mines = [{ owner: 'green', x: 10, y: 100 }];
assert(decide() === true,
  '3: a mine the bare span already hits does not veto wings (wings add no new mine risk).');

// 4. A mine well clear of even the wide span (80px off): neither span hits -> no danger,
//    wings used.
context.mines = [{ owner: 'green', x: 80, y: 100 }];
assert(decide() === true, '4: a mine clear of even the wide span leaves wings enabled.');

console.log('Smoke test passed: the AI refuses wings when the widened mine trigger would drive the plane into a mine the bare span clears, but keeps them when the field is clear or the mine is hit regardless of wings.');
