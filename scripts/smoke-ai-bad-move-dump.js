#!/usr/bin/env node
'use strict';

// Smoke test: the reproducible bad-move dump (window.aiDumpBadMove backing).
// recordAiMoveDump(selectedPlan) must capture, at pre-launch time, the EXACT
// board the selector acted on — every plane/cargo/flag/mine position, both
// inventories, the static walls, both bases, the range settings — PLUS the
// finalized plan. The result must be JSON-safe (no functions/cycles/DOM), so a
// bad move sent as JSON can later be rebuilt into a regression test.

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

const INVENTORY_ITEM_TYPES = { FUEL: 'fuel', CROSSHAIR: 'crosshair', WINGS: 'wings', INVISIBILITY: 'invisible', MINE: 'mine', DYNAMITE: 'dynamite' };

// A mock world. Two blue planes (AI), one green (enemy), a ready cargo, an
// active green flag, one mine, and one wall collider.
const bluePlane = {
  id: 'blue-1', color: 'blue', x: 100, y: 800, angle: 3.14,
  homeX: 100, homeY: 820, homeAngle: 3.14,
  isAlive: true, burning: false, lifeState: 'alive', respawnState: 'at_base',
  carriedFlagId: null, flagColor: null, shieldActive: false,
  activeTurnBuffs: { fuel: true },
};
const bluePlane2 = {
  id: 'blue-2', color: 'blue', x: 300, y: 800, angle: 3.14,
  isAlive: true, burning: false, activeTurnBuffs: {},
};
const greenPlane = {
  id: 'green-1', color: 'green', x: 200, y: 200, angle: 0,
  isAlive: true, burning: false, activeTurnBuffs: {},
};
const points = [bluePlane, bluePlane2, greenPlane];
const cargoState = [{ id: 'c1', state: 'ready', x: 150, y: 500, heldBy: null, pickedAt: null }];
const greenFlag = { id: 'g-flag', color: 'green', state: 'active', droppedAt: null, carrier: null };
const flags = [greenFlag];
const mines = [{ id: 'm1', owner: 'blue', x: 400, y: 700, cellX: 20, cellY: 35 }];
const colliders = [{ id: 'wall-0', type: 'rect', cx: 250, cy: 450, halfWidth: 40, halfHeight: 10, rotation: 0 }];

const inventoryState = {
  blue: [{ type: 'fuel' }, { type: 'crosshair' }],
  green: [{ type: 'wings' }],
};

const context = {
  Math, Number, Date, Object, Array, JSON, Set, Boolean, String, console,
  points, cargoState, flags, mines, colliders, inventoryState,
  turnColors: ['green', 'blue'], turnIndex: 1, gameMode: 'computer', roundNumber: 4,
  aiRoundState: { turnNumber: 12 },
  settings: { flightRangeCells: 30 },
  CELL_SIZE: 20, MAX_DRAG_DISTANCE: 100, FIELD_FLIGHT_DURATION_SEC: 1.6,
  FIELD_LEFT: 0, FIELD_TOP: 0, FIELD_WIDTH: 500, FIELD_HEIGHT: 1000,
  INVENTORY_ITEM_TYPES,
  isPlaneLaunchStateReady: (p) => p && p.isAlive === true && !p.burning,
  getPlaneEffectiveRangePx: (p) => (p?.activeTurnBuffs?.fuel ? 1200 : 600),
  getCargoVisualCenter: (c) => ({ x: c.x, y: c.y }),
  getFlagAnchor: (f) => (f.droppedAt ? f.droppedAt : { x: 200, y: 100 }),
  getBaseInteractionTarget: (color) => ({ anchor: { x: 250, y: color === 'blue' ? 950 : 50 }, radius: 40 }),
  evaluateInventoryState: (color) => {
    const counts = { fuel: 0, crosshair: 0, mine: 0, dynamite: 0, invisible: 0, wings: 0 };
    for(const item of (inventoryState[color] || [])){ if(item.type in counts) counts[item.type] += 1; }
    return { total: (inventoryState[color] || []).length, counts };
  },
  isFlagsModeEnabled: () => true,
  getBufferedAiDecisionEvents: () => [],
  safeNowIso: () => '2026-07-03T00:00:00.000Z',
  // buffer + collider identity cache (module-scope state in script.js)
  AI_MOVE_DUMP_BUFFER: [],
  AI_MOVE_DUMP_MAX: 12,
  aiMoveDumpCollidersCacheRef: null,
  aiMoveDumpCollidersCacheJson: null,
};
vm.createContext(context);

for(const fn of [
  'aiDumpNum', 'aiDumpSafeClone', 'aiDumpPlaneRef',
  'aiDumpSerializePlane', 'aiDumpSerializeCargo', 'aiDumpSerializeFlag',
  'aiDumpSerializeMine', 'aiDumpSerializeColliders', 'aiDumpSerializePlan',
  'buildAiMoveDumpDynamic', 'recordAiMoveDump',
]){
  vm.runInContext(extractFunctionSource(source, fn), context);
}

// The chosen plan the AI committed to — including a function and a cycle, which
// MUST be stripped so the dump stays JSON-serializable.
const selectedPlan = {
  plane: bluePlane,
  color: 'blue',
  planTier: 1,
  goalName: 'attack_enemy',
  decisionReason: 'best_shot',
  whyChosen: 'highest score',
  routeClass: 'direct',
  bounceCount: 0,
  score: 1234.5,
  landingX: 200, landingY: 210,
  targetEnemy: greenPlane,
  targetPoint: { x: 200, y: 200, kind: 'enemy' },
  fuelReplanned: true,
  selectedInventorySequence: [{ itemType: 'fuel', reason: 'ricochet_sweep_extend_more_targets' }],
  aFunction: () => 42,        // must be stripped
};
selectedPlan.selfRef = selectedPlan; // cycle — must be stripped

context.recordAiMoveDump(selectedPlan);

const buf = context.AI_MOVE_DUMP_BUFFER;
assert(buf.length === 1, '1: exactly one move recorded.');
const dump = buf[0];

// It must round-trip through JSON without throwing (proves no cycles/functions).
let json;
try { json = JSON.stringify(dump); } catch(e){ throw new Error('2: dump is not JSON-serializable: ' + e.message); }
assert(typeof json === 'string' && json.length > 0, '2b: dump serializes to a non-empty string.');

// Meta / settings captured for reproduction.
assert(dump.schema === 'ai-move-dump/v1', '3: schema tag present.');
assert(dump.meta.aiColor === 'blue' && dump.meta.enemyColor === 'green', '3b: AI/enemy color captured.');
assert(dump.meta.turn === 12 && dump.meta.round === 4, '3c: turn/round captured.');
assert(dump.settings.flightRangeCells === 30 && dump.settings.flagsMode === true, '3d: range + flags mode captured.');
assert(dump.settings.cellSize === 20 && dump.settings.field.width === 500, '3e: cell size + field captured.');

// Every plane captured with an exact position (not just IDs).
assert(dump.planes.length === 3, '4: all three planes captured.');
const b1 = dump.planes[0];
assert(b1.id === 'blue-1' && b1.x === 100 && b1.y === 800, '4b: blue-1 exact position captured.');
assert(b1.activeTurnBuffs && b1.activeTurnBuffs.fuel === true, '4c: plane buffs captured.');
assert(b1.effectiveRangePx === 1200, '4d: fuel-boosted range captured.');
assert(dump.planes[2].color === 'green' && dump.planes[2].x === 200, '4e: enemy plane position captured (not just an ID).');

// Cargo / flag / mine positions captured.
assert(dump.cargo.length === 1 && dump.cargo[0].x === 150 && dump.cargo[0].y === 500, '5: cargo position captured.');
assert(dump.flags.length === 1 && dump.flags[0].color === 'green' && dump.flags[0].anchor.x === 200, '5b: flag anchor captured.');
assert(dump.mines.length === 1 && dump.mines[0].owner === 'blue' && dump.mines[0].x === 400, '5c: mine captured.');

// Both inventories captured.
assert(dump.inventory.blue.fuel === 1 && dump.inventory.blue.crosshair === 1, '6: blue inventory counts captured.');
assert(dump.inventory.green.wings === 1, '6b: green inventory counts captured.');

// Walls + bases captured.
assert(dump.colliders.length === 1 && dump.colliders[0].id === 'wall-0', '7: colliders captured.');
assert(dump.bases.blue.anchor.y === 950 && dump.bases.green.anchor.y === 50, '7b: both bases captured.');

// The plan decision captured, plane/targetEnemy compacted to refs, junk stripped.
assert(dump.decision.goalName === 'attack_enemy' && dump.decision.planTier === 1, '8: plan decision captured.');
assert(dump.decision.landingX === 200 && dump.decision.fuelReplanned === true, '8b: landing + replan flags captured.');
assert(dump.decision.plane && dump.decision.plane.index === 0 && dump.decision.plane.id === 'blue-1', '8c: plan plane compacted to a ref.');
assert(dump.decision.targetEnemy && dump.decision.targetEnemy.index === 2, '8d: plan targetEnemy compacted to a ref.');
assert(!('aFunction' in dump.decision), '8e: function fields stripped from the plan.');
assert(!('selfRef' in dump.decision), '8f: circular ref stripped from the plan.');
assert(Array.isArray(dump.decision.selectedInventorySequence)
  && dump.decision.selectedInventorySequence[0].itemType === 'fuel', '8g: inventory sequence captured.');

// The collider identity cache returns the SAME serialized array on a second dump.
context.recordAiMoveDump(selectedPlan);
assert(context.AI_MOVE_DUMP_BUFFER.length === 2, '9: second move recorded.');
assert(context.AI_MOVE_DUMP_BUFFER[1].colliders === context.AI_MOVE_DUMP_BUFFER[0].colliders,
  '9b: static colliders reuse the identity-cached serialization.');

// The ring buffer is bounded.
for(let i = 0; i < 20; i += 1) context.recordAiMoveDump(selectedPlan);
assert(context.AI_MOVE_DUMP_BUFFER.length === context.AI_MOVE_DUMP_MAX, '10: ring buffer capped at AI_MOVE_DUMP_MAX.');

console.log('Smoke test passed: bad-move dump captures a reproducible, JSON-safe pre-launch snapshot (planes/cargo/flags/mines/inventory/walls/bases/settings + finalized plan), strips functions/cycles, caches walls, and rings.');
