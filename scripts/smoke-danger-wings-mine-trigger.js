#!/usr/bin/env node
'use strict';

// Smoke test: раскрытые крылья расширяют радиус подрыва мины.
//
// Раньше этот тест требовал обратного — «мина не должна срабатывать раньше от одних
// крыльев» — и потому падал. Но падал он не на баге: правило игры именно такое. Нечего
// раскрывать крылья рядом с миной; раскрыл там, где она лежит, — пусть взрывает. Тест
// хранил устаревшее ожидание, а не находил ошибку.
//
// Проверяется поэтому не число, а само правило, и с обеих сторон. Числа берутся из игры:
// вписанные руками, они разойдутся с ней при первой же перенастройке, и тест этого не
// заметит.
//
// Отдельно проверяется, что на ПРЕПЯТСТВИЯ это не распространяется: там столкновение
// считается по обычной опасной геометрии, крылья её не расширяют. Правило про мину — про
// мину, а не про всё подряд.

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  if(bodyStart === -1) throw new Error(`Function body start not found for: ${fnName}`);
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
// Значения берём из игры, а не переписываем: переписанное число живёт своей жизнью и
// однажды разойдётся с настоящим, а тест этого не заметит.
function extractConstSource(source, name){
  const match = new RegExp(`^const ${name}\\s*=\\s*[^;]+;`, 'm').exec(source);
  if(!match) throw new Error(`Константа не найдена в script.js: ${name}`);
  return match[0];
}

const mineRuntime = [
  'PLANE_DRAW_W',
  'MINE_SIZE_DEFAULTS',
  'mineSizeRuntime',
  'MINE_TRIGGER_WING_HALF_SPAN_DEFAULT',
  'mineTriggerRuntime',
].map((name) => extractConstSource(source, name)).join('\n');
const extracted = [
  'getPlaneActiveTurnBuffs',
  'planeHasActiveTurnBuff',
  'getPlaneDangerGeometry',
  'getDistanceFromPointToSegment',
  'getMineEffectiveTriggerRadius',
  'getMineThreatMetaForSegment',
  'dropActiveFlagFromPlane',
  'handleMineForPlane',
  'planeBuildingCollision',
].map((name) => extractFunctionSource(source, name)).join('\n\n');

const context = {
  Math,
  Number,
  POINT_RADIUS: 10,
  MINE_TRIGGER_RADIUS: 10,
  PLANE_GEOMETRY_TRUTH: {
    DANGER_HITBOX_WIDTH: 36,
    BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96,
    HITBOX_HEIGHT: 36,
  },
  INVENTORY_ITEM_TYPES: { WINGS: 'wings', CROSSHAIR: 'crosshair', FUEL: 'fuel', INVISIBILITY: 'invisibility' },
  isPlayerInvisibilityActive: () => false,
  isPlaneTargetable: () => true,
  mines: [{ owner: 'blue', x: 25, y: 0 }],
  flyingPoints: [],
  canAwardKillPointForPlane: () => false,
  markPlaneKillPointAwarded: () => {},
  awardPoint: () => {},
  checkVictory: () => {},
  eliminatePlane: (plane) => { plane.wasEliminated = true; },
  spawnExplosionForPlane: () => {},
  advanceTurn: () => {},
  clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  SLIDE_THRESHOLD: 0.3,
};

vm.createContext(context);
vm.runInContext(`${mineRuntime}\n\n${extracted}`, context);

const planeNoWings = () => ({ x: 0, y: 0, color: 'green', activeTurnBuffs: {} });
const planeWings = () => ({ x: 0, y: 0, color: 'green', activeTurnBuffs: { wings: true } });

const baseRadius = context.getMineEffectiveTriggerRadius(planeNoWings());
const wingsRadius = context.getMineEffectiveTriggerRadius(planeWings());

assert(Number.isFinite(baseRadius) && baseRadius > 0,
  'Base mine trigger radius must be a real number.');
assert(wingsRadius > baseRadius,
  `Wings must widen the mine trigger radius (base ${baseRadius}, with wings ${wingsRadius}).`);

// Каждый случай — на СВЕЖЕМ поле: сработавшая мина снимается с него, и общий стенд
// превратил бы следующий замер в проверку пустоты.
function triggersAt(distance, withWings){
  context.mines = [{ owner: 'blue', x: distance, y: 0 }];
  const plane = withWings ? planeWings() : planeNoWings();
  const triggered = context.handleMineForPlane(plane, null);
  return { triggered, eliminated: plane.wasEliminated === true };
}

// Вплотную мина срабатывает в обоих случаях: крылья тут ни при чём.
{
  const near = baseRadius / 2;
  assert(triggersAt(near, false).triggered === true,
    'Mine must trigger at close range without wings.');
  assert(triggersAt(near, true).triggered === true,
    'Mine must trigger at close range with wings too.');
}

// ГЛАВНОЕ: полоса между обычным радиусом и расширенным. Здесь мина срабатывает ТОЛЬКО
// с крыльями — в этом и состоит правило, и только здесь его видно.
{
  const between = (baseRadius + wingsRadius) / 2;
  const without = triggersAt(between, false);
  const withWings = triggersAt(between, true);
  assert(without.triggered === false && without.eliminated === false,
    `Without wings the mine must stay quiet at ${between}px (base radius ${baseRadius}).`);
  assert(withWings.triggered === true && withWings.eliminated === true,
    `With wings the mine must go off at ${between}px (wings radius ${wingsRadius}).`);
}

// За расширенным радиусом молчат обе: правило расширяет зону, а не отменяет её границу.
{
  const far = wingsRadius * 1.5;
  assert(triggersAt(far, false).triggered === false,
    'Far from the mine nothing happens without wings.');
  assert(triggersAt(far, true).triggered === false,
    'Far from the mine nothing happens with wings either — the zone is wider, not endless.');
}

// Взрывается ТА мина, до которой дотянулись, а не первая попавшаяся в списке.
//
// Без этой проверки радиус внутри перебора мин можно снять целиком, и никто не заметит:
// дальний одиночный случай отсекается раньше, общей проверкой пути. Ставим дальнюю мину
// ПЕРВОЙ, ближнюю второй — и смотрим, какая осталась на поле.
{
  const near = baseRadius / 2;
  const far = wingsRadius * 1.5;
  context.mines = [
    { owner: 'blue', x: far, y: 0, метка: 'дальняя' },
    { owner: 'blue', x: near, y: 0, метка: 'ближняя' },
  ];
  const plane = planeNoWings();
  assert(context.handleMineForPlane(plane, null) === true,
    'A mine within reach must still go off when a far one sits earlier in the list.');
  assert(context.mines.length === 1 && context.mines[0].метка === 'дальняя',
    'The mine that went off must be the one within reach, not the first one in the list.');
}

// Препятствия — отдельная история: там крылья зону не расширяют.
{
  const fp = { plane: { x: 25, y: 0, activeTurnBuffs: { wings: true } }, vx: 0, vy: 0 };
  const collider = { type: 'rect', cx: 0, cy: 0, rotation: 0, halfWidth: 10, halfHeight: 10 };
  assert(context.planeBuildingCollision(fp, collider) === false,
    'Obstacle collision should still use danger radius and ignore wings extension.');
}

console.log('Smoke test passed: wings widen the mine trigger radius (and only the mine).');
