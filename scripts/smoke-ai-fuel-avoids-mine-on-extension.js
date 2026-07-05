#!/usr/bin/env node
'use strict';

// Smoke test: aiFuelBoostedFlightMineEntry — fuel must not extend a flight THROUGH a
// mine. From a real caught move (aiDumpBadMove, turn 9): blue #4 built a great 2-bounce
// ricochet kill and added FUEL for a harpy strike-and-return. The base attack path was
// mine-checked and clear, but the fuel EXTENSION (flying the launch angle to the boosted
// range, back toward the mined home row) rammed a green mine and self-detonated at the
// tail of the move. simulateAIShot's own ownMinePathHit only checks the plane's OWN
// colour mines, so an enemy mine on the extension slipped through.
//
// This helper simulates the flight at the FUEL-BOOSTED range and returns the ARC-LENGTH
// at which it first reaches ANY mine (owner-agnostic), so the caller can CLIP the flight
// to stop just short of the mine (keeping fuel's reach up to that point) instead of
// dropping the fuel outright.

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

const BASE_RANGE = 200;
const BOOSTED_RANGE = 400; // fuel doubles it
const context = {
  Math, Number, Array, Boolean,
  MINE_TRIGGER_RADIUS: 28,
  INVENTORY_ITEM_TYPES: { FUEL: 'fuel' },
  mines: [],
  // Applying fuel adds the buff; simulateAIShot then reports the boosted range.
  applyItemToOwnPlane: (type, _color, plane, _opts) => {
    plane.activeTurnBuffs = { ...(plane.activeTurnBuffs || {}), [type]: true };
    return true;
  },
  // Straight hop whose LENGTH depends on whether fuel is active — models "boosted range".
  simulateAIShot: (plane, lv, _opts) => {
    const boosted = Boolean(plane.activeTurnBuffs && plane.activeTurnBuffs.fuel);
    const dist = boosted ? BOOSTED_RANGE : BASE_RANGE;
    const path = [];
    for(let d = 0; d <= dist; d += 20){ path.push({ x: plane.x + lv.dx * d, y: plane.y + lv.dy * d }); }
    return { predictedPath: path };
  },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'aiFuelBoostedFlightMineEntry'), context);

const makePlane = (buffs) => ({ x: 100, y: 100, color: 'blue', activeTurnBuffs: buffs ? { ...buffs } : {} });
const rightDir = { x: 1, y: 0 }; // fly +x

// 1. A green mine at x=380 is BEYOND base range (x<=300) but on the fuel EXTENSION
//    (x<=500). It is detected, and the reported entry distance (~252px = 280 - trigger)
//    lets the caller clip the flight to stop short of it. Detection here proves the
//    check uses the BOOSTED range, not the base range the plane would otherwise stop at.
context.mines = [{ id: 'g', owner: 'green', x: 380, y: 100 }];
const p1 = makePlane();
const r1 = context.aiFuelBoostedFlightMineEntry(p1, rightDir);
assert(r1.crosses === true, '1: a mine on the fuel EXTENSION (beyond base range) is detected.');
assert(Math.abs(r1.entryDistPx - 252) <= 6,
  `1b: entry distance is the arc-length to the mine's near edge (~252px), got ${r1.entryDistPx}.`);
assert(JSON.stringify(p1.activeTurnBuffs) === '{}',
  '1c: the plane buffs are restored after the probe (temporary fuel removed).');

// 2. Same mine but off the flight line -> not reached.
context.mines = [{ id: 'g', owner: 'green', x: 380, y: 300 }];
const r2 = context.aiFuelBoostedFlightMineEntry(makePlane(), rightDir);
assert(r2.crosses === false && r2.entryDistPx === Infinity,
  '2: a mine well off the extended path is not flagged.');

// 3. No mines -> nothing to hit.
context.mines = [];
assert(context.aiFuelBoostedFlightMineEntry(makePlane(), rightDir).crosses === false,
  '3: no mines, no crossing.');

// 4. An OWN (blue) mine on the extension is flagged too (owner-agnostic).
context.mines = [{ id: 'own', owner: 'blue', x: 380, y: 100 }];
assert(context.aiFuelBoostedFlightMineEntry(makePlane(), rightDir).crosses === true,
  '4: an own-team mine on the extension is flagged too.');

// 5. A pre-existing (non-fuel) buff is preserved across the probe.
context.mines = [{ id: 'g', owner: 'green', x: 380, y: 100 }];
const p5 = makePlane({ wings: true });
context.aiFuelBoostedFlightMineEntry(p5, rightDir);
assert(p5.activeTurnBuffs.wings === true && !p5.activeTurnBuffs.fuel,
  '5: an existing buff (wings) survives the probe and the temporary fuel is removed.');

// 6. The entry distance is well beyond base range (252 > 200), so the caller can clip
//    the fuel flight to ~240px and STILL fly further than base range -> keep the fuel.
const r6 = context.aiFuelBoostedFlightMineEntry(makePlane(), rightDir);
assert(r6.entryDistPx > BASE_RANGE,
  '6: the mine is on the extension beyond base range, so clipping short of it still beats base range (fuel kept).');

console.log('Smoke test passed: aiFuelBoostedFlightMineEntry reports the arc-length to the first mine on the fuel-EXTENDED flight (own or enemy, beyond base range), so the caller can clip short of it; clears when mine-free; restores plane buffs.');
