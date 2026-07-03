#!/usr/bin/env node
'use strict';

// Smoke test: "don't stop short on the target" — extendDirectMoveToMaxTargets.
// A straight launch that lands ON its target while range is left over is flown to
// full range along the SAME line when doing so sweeps an extra target (more cargo,
// or a KILL). A gained kill accepts an exposed landing (bold); a cargo-only gain
// must keep a safe landing. Scenario 1 is the real caught bad move (aiDumpBadMove
// dump, turn 7): blue plane #6 (239,48) fired a dynamite-augmented run that STOPPED
// on cargo #2 (145,285) at 255px of 600, when flying the same line to full range
// clips green #2 (100.57,448.65) for a kill.

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

const CELL_SIZE = 20;
const INVENTORY_ITEM_TYPES = { FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisible', MINE: 'mine', DYNAMITE: 'dynamite' };

function getDistanceFromPointToSegment(px, py, ax, ay, bx, by){
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Controls the risk mock for the cargo-only safety gate.
let mockLandingRisk = 0;

const context = {
  Math, Number, Array, Object,
  CELL_SIZE,
  INVENTORY_ITEM_TYPES,
  AI_SWEEP_ENEMY_HIT_TOLERANCE_PX: CELL_SIZE,
  AI_SWEEP_MAX_BOUNCES: 2,
  AI_EXTEND_MOVE_MIN_GAIN_PX: CELL_SIZE * 2,
  getPlaneEffectiveRangePx: () => 600,
  getDistanceFromPointToSegment,
  // Straight sampled flight along the (already-unit) launch dir at the given scale.
  simulateAIShot: (plane, lv, _opts) => {
    const scale = Number.isFinite(lv.scale) ? Math.max(0.02, Math.min(1, lv.scale)) : 1;
    const range = 600 * scale;
    const path = [];
    for(let d = 0; d <= range; d += 20){ path.push({ x: plane.x + lv.dx * d, y: plane.y + lv.dy * d }); }
    if(path.length < 2) path.push({ x: plane.x + lv.dx * range, y: plane.y + lv.dy * range });
    return { predictedPath: path, bounceCount: 0, travelDistance: range };
  },
  doesCargoIntersectBeneficialZoneAlongPath: (cargo, _plane, path) => {
    const cx = cargo.center ? cargo.center.x : cargo.x;
    const cy = cargo.center ? cargo.center.y : cargo.y;
    for(let i = 0; i < path.length - 1; i += 1){
      if(getDistanceFromPointToSegment(cx, cy, path[i].x, path[i].y, path[i + 1].x, path[i + 1].y) <= CELL_SIZE) return true;
    }
    return false;
  },
  withTemporarilyIgnoredColliderIdsAsync: async (_ids, cb) => cb(),
  getImmediateResponseThreatMeta: () => ({ count: 1 }),
  getFallbackCandidateResponseRisk: () => mockLandingRisk,
  getAiAllowedMoveRisk: () => 0.7,
  logAiDecision: () => {},
};
vm.createContext(context);
// extractFunctionSource anchors on "function <name>(", dropping a leading "async";
// this function is async, so restore the keyword before evaluating.
vm.runInContext('async ' + extractFunctionSource(source, 'extendDirectMoveToMaxTargets'), context);

const plane6 = { id: 'blue-6', color: 'blue', x: 239, y: 48 };
const run = (plan, ctx, cargo) => context.extendDirectMoveToMaxTargets(plan, ctx, cargo);

(async () => {
  // 1. THE CAUGHT BAD MOVE: dynamite run stops on cargo #2 (145,285) at 255px;
  //    flying the same line to full range clips green #2 for a kill -> extend.
  {
    mockLandingRisk = 0.9; // deliberately "unsafe" — a KILL must ignore this
    const plan = {
      plane: plane6, bounceCount: 0, landingX: 145.25, landingY: 285.32, multiTargetCount: 2,
      selectedInventorySequence: [{ itemType: 'dynamite', target: { colliderId: 'brick1' } }],
    };
    const ctx = { enemies: [{ id: 'green-2', isAlive: true, x: 100.57, y: 448.65 }] };
    const cargo = [{ state: 'ready', x: 145.25, y: 285.32 }];
    const extended = await run(plan, ctx, cargo);
    assert(extended === true, '1: the short dynamite run must be extended to full range for the kill.');
    assert(plan.moveExtendedToMaxTargets && plan.moveExtendedToMaxTargets.addedEnemyKills === 1,
      '1b: the extension must record the gained kill.');
    assert(Math.round(plan.planDistance) === 600, '1c: the extended launch uses the full range.');
    assert(plan.landingX > 10 && plan.landingX < 30 && plan.landingY > 595 && plan.landingY < 615,
      '1d: the launch vector points to the full-range endpoint down the same line.');
  }

  // 2. No extra target down the line -> no extension (enemy off the line).
  {
    mockLandingRisk = 0;
    const plan = { plane: plane6, bounceCount: 0, landingX: 145.25, landingY: 285.32, selectedInventorySequence: [] };
    const ctx = { enemies: [{ id: 'g', isAlive: true, x: 300, y: 448 }] };
    const cargo = [{ state: 'ready', x: 145.25, y: 285.32 }];
    const extended = await run(plan, ctx, cargo);
    assert(extended === false, '2: nothing new down the line -> do not extend.');
    assert(plan.landingX === 145.25 && plan.landingY === 285.32, '2b: landing left untouched.');
  }

  // 3. Already using (almost) the whole range -> nothing to extend.
  {
    const plan = { plane: plane6, bounceCount: 0, landingX: 239 - 0.3673 * 590, landingY: 48 + 0.930 * 590, selectedInventorySequence: [] };
    const ctx = { enemies: [{ id: 'g', isAlive: true, x: 100.57, y: 448.65 }] };
    const cargo = [{ state: 'ready', x: 145.25, y: 285.32 }];
    assert(await run(plan, ctx, cargo) === false, '3: a near-max-range launch is not extended.');
  }

  // 4. A ricochet (bounce) launch is not a single line to lengthen -> skip.
  {
    const plan = { plane: plane6, bounceCount: 2, landingX: 145.25, landingY: 285.32, selectedInventorySequence: [] };
    const ctx = { enemies: [{ id: 'green-2', isAlive: true, x: 100.57, y: 448.65 }] };
    const cargo = [{ state: 'ready', x: 145.25, y: 285.32 }];
    assert(await run(plan, ctx, cargo) === false, '4: bounce routes are not extended.');
  }

  // 5. Cargo-only gain: extend only when the farther landing is safe.
  {
    const straightDown = { plane: { id: 'p', color: 'blue', x: 100, y: 100 }, bounceCount: 0, landingX: 100, landingY: 300, selectedInventorySequence: [] };
    const ctx = { enemies: [] };
    const cargo = [{ state: 'ready', x: 100, y: 300 }, { state: 'ready', x: 100, y: 550 }];

    mockLandingRisk = 0.9; // unsafe
    const unsafePlan = { ...straightDown };
    assert(await run(unsafePlan, ctx, cargo) === false, '5: cargo-only extension into an unsafe landing is refused.');
    assert(unsafePlan.landingY === 300, '5b: unsafe cargo-only landing left untouched.');

    mockLandingRisk = 0.1; // safe
    const safePlan = { ...straightDown };
    const extended = await run(safePlan, ctx, cargo);
    assert(extended === true, '5c: cargo-only extension into a safe landing is taken.');
    assert(safePlan.moveExtendedToMaxTargets.addedCargo === 1 && safePlan.moveExtendedToMaxTargets.addedEnemyKills === 0,
      '5d: the extension records the gained cargo, no kill.');
    assert(Math.round(safePlan.planDistance) === 600, '5e: safe cargo extension flies to full range.');
  }

  console.log('Smoke test passed: extendDirectMoveToMaxTargets flies a short straight launch to full range to sweep a gained kill (accepting exposure) or extra cargo (only when safe); leaves near-max, bounce, and no-gain launches untouched.');
})().catch((err) => { console.error(err); process.exit(1); });
