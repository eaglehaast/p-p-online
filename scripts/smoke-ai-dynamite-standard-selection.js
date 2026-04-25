#!/usr/bin/env node
'use strict';

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
const fnSrc = extractFunctionSource(source, 'buildAiInventoryCandidatePlans');

const context = {
  Math,
  Number,
  Array,
  Object,
  Set,
  aiRoundState: { currentGoal: 'attack_enemy_plane' },
  settings: { flightRangeCells: 30, aimingAmplitude: 80 },
  CELL_SIZE: 40,
  MAX_DRAG_DISTANCE: 300,
  FIELD_FLIGHT_DURATION_SEC: 1,
  ATTACK_RANGE_PX: 180,
  FIELD_LEFT: 0,
  FIELD_TOP: 0,
  FIELD_RIGHT: 800,
  FIELD_BOTTOM: 800,
  MINE_TRIGGER_RADIUS: 18,
  INVENTORY_ITEM_TYPES: {
    MINE: 'mine',
    CROSSHAIR: 'crosshair',
    FUEL: 'fuel',
    WINGS: 'wings',
    DYNAMITE: 'dynamite',
    INVISIBILITY: 'invisible',
  },
  colliders: [
    { id: 'near-invalid', cx: 120, cy: 120 },
    { id: 'valid-farther', cx: 220, cy: 220 },
  ],
  evaluateBlueInventoryState(){
    return {
      total: 1,
      counts: {
        mine: 0,
        crosshair: 0,
        fuel: 0,
        wings: 0,
        dynamite: 1,
        invisible: 0,
      },
    };
  },
  getBluePriorityEnemy(){ return { id: 'green-1', x: 300, y: 300 }; },
  getBaseAnchor(){ return { x: 360, y: 360 }; },
  getAiMoveLandingPoint(){ return { x: 180, y: 180 }; },
  getPlaneEffectiveRangePx(){ return 280; },
  buildAiItemUnlockMoveMetrics(){ return { unlocksNewDistanceZone: false, trajectoryCargoTouches: 0, trajectoryEnemyTouches: 0, safetyScore: 0.5 }; },
  compareAiItemUnlockMoveClass(){ return { unlocked: false, reasons: [], unlockScore: 0 }; },
  dist(a, b){ return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)); },
  isMinePlacementValid(){ return true; },
  isPathClear(){ return true; },
  getFlagAnchor(){ return null; },
  logAiDecision(){},
  recordInventoryAiDecision(){},
  findMapSpriteForDynamiteDrop({ boardX, boardY }){
    const roundedX = Math.round(boardX);
    const roundedY = Math.round(boardY);
    if(roundedX === 220 && roundedY === 220){
      return { id: 'brick-1', cx: 220, cy: 220, colliderId: 'valid-farther' };
    }
    return null;
  },
};

vm.createContext(context);
vm.runInContext(fnSrc, context);

const plannedMove = {
  plane: { id: 'blue-1', color: 'blue', x: 100, y: 100 },
  vx: 10,
  vy: 0,
  totalDist: 10,
  routeClass: 'direct',
  goalName: 'attack_enemy_plane',
};

const result = context.buildAiInventoryCandidatePlans({ enemies: [{ x: 300, y: 300 }], aiPlanes: [{ id: 'blue-1' }] }, plannedMove);
assert(result && typeof result === 'object', 'Expected inventory planning result object.');
assert(Array.isArray(result.candidates) && result.candidates.length > 0, 'Expected at least one inventory candidate.');
const dynamiteCandidate = result.candidates.find((candidate) => candidate?.itemType === 'dynamite');
assert(dynamiteCandidate, 'Expected dynamite candidate in standard selection flow.');
assert(dynamiteCandidate.target?.x === 220 && dynamiteCandidate.target?.y === 220,
  'Expected dynamite candidate target to be executable map sprite center, not nearest invalid collider.');
assert(result.selectedCandidate?.itemType === 'dynamite', 'Expected dynamite to be selected when it is the only available item.');

console.log('Smoke test passed: standard dynamite selection picks executable sprite target.');
