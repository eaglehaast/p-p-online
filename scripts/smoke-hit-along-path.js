#!/usr/bin/env node
'use strict';

// Smoke test: попадания считаются по ПРОЙДЕННОМУ ПУТИ, а не по точке.
//
// Самолёт пролетает около 600 пикселей за полторы секунды — это примерно 15 пикселей за
// кадр на ровном ходу и втрое больше на просевшем. Мина и ящик шириной по 20 пикселей.
// Значит проверка «где самолёт сейчас», сделанная раз в кадр, их просто перепрыгивает.
//
// Защита от этого в игре БЫЛА: handleMineForPlane честно считает расстояние до отрезка
// prevX,prevY -> x,y. Только строчка `p.prevX = p.x` стояла ВЫШЕ проверок попаданий, и к
// моменту проверки начало отрезка уже равнялось концу. Замер в браузере: вырожденный
// отрезок в 100% кадров полёта, длина 0.0 px. Механизм был мёртв, а тест на него —
// зелёный, потому что собирал самолёт руками, с prevX ≠ x, чего в игре не бывало.
//
// Отсюда и главная проверка здесь: не «функция умеет в отрезок» (умела и раньше), а
// ПОРЯДОК строк в цикле полёта, из-за которого она получала вырожденный отрезок.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');

// === 1. ГЛАВНОЕ: прошлое положение обновляется ПОСЛЕ проверок попаданий ===
//
// Ровно на этом всё и держалось. Если строчка снова уедет наверх, обе проверки молча
// станут точечными: ничего не упадёт, просто самолёты начнут пролетать сквозь мины.
{
  const loop = source.slice(source.indexOf('// трейл'), source.indexOf('// трейл') + 3000);
  const trailAt = loop.indexOf('p.segments.push(seg)');
  const mineAt = loop.indexOf('handleMineForPlane(p, fp)');
  const aaAt = loop.indexOf('handleAAForPlane(p, fp)');
  const hitsAt = loop.indexOf('checkPlaneHits(p, fp)');
  const updateAt = loop.indexOf('p.prevX = p.x; p.prevY = p.y;');

  assert(trailAt !== -1 && mineAt !== -1 && aaAt !== -1 && hitsAt !== -1 && updateAt !== -1,
    '1: цикл полёта на месте и все проверки попаданий найдены');
  assert(updateAt > mineAt && updateAt > aaAt && updateAt > hitsAt,
    '1b: прошлое положение обновляется ПОСЛЕ проверок попаданий. Если поднять эту ' +
    'строчку выше, отрезок «откуда — куда» выродится в точку, и самолёт снова начнёт ' +
    'перепрыгивать мины — молча, при зелёных тестах');
  assert(updateAt > trailAt,
    '1c: и после следа полёта, который тоже строится от прошлого положения');
}

// === 2. Мина ловит самолёт, перепрыгнувший её за один кадр ===
//
// Тот же стенд, что у smoke-mine-segment-hit-large-step.js, но здесь важно другое: что
// разница между «по точке» и «по пути» вообще есть, и она размером с целую мину.
{
  const context = {
    Math, Number,
    POINT_RADIUS: 10,
    MINE_TRIGGER_RADIUS: 10,
    PLANE_GEOMETRY_TRUTH: { DANGER_HITBOX_WIDTH: 36, BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96, HITBOX_HEIGHT: 36 },
    INVENTORY_ITEM_TYPES: { WINGS: 'wings', CROSSHAIR: 'crosshair', FUEL: 'fuel', INVISIBILITY: 'invisibility' },
    isPlayerInvisibilityActive: () => false,
    isPlaneTargetable: () => true,
    // Радиус срабатывания мины: настоящий считается от размаха крыльев, здесь достаточно
    // постоянного — проверяется не он, а точка против отрезка.
    getMineEffectiveTriggerRadius: () => 10,
    mines: [{ owner: 'blue', x: 50, y: 0 }],
    flyingPoints: [],
    canAwardKillPointForPlane: () => true,
    markPlaneKillPointAwarded: () => {},
    awardPoint: () => {}, checkVictory: () => {},
    dropActiveFlagFromPlane: () => {},
    eliminatePlane: (plane) => { plane.wasEliminated = true; },
    spawnExplosionForPlane: () => {},
    advanceTurn: () => {},
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
  };
  vm.createContext(context);
  vm.runInContext([
    'getPlaneActiveTurnBuffs', 'planeHasActiveTurnBuff', 'getPlaneDangerGeometry',
    'getDistanceFromPointToSegment', 'getMineThreatMetaForSegment', 'handleMineForPlane',
  ].map((name) => extractFunctionSource(source, name)).join('\n\n'), context);

  // Кадр, за который самолёт прошёл 100 px мимо мины, стоящей на полпути.
  const jumper = { color: 'green', activeTurnBuffs: {}, prevX: 0, prevY: 0, x: 100, y: 0 };
  const mine = context.mines[0];
  const triggerRadius = Math.max(context.MINE_TRIGGER_RADIUS,
    context.getPlaneDangerGeometry(jumper).radius);

  const pointOnly = Math.hypot(jumper.x - mine.x, jumper.y - mine.y) <= triggerRadius;
  assert(pointOnly === false,
    '2: по точке такой самолёт мину НЕ задевает — он уже пролетел мимо');
  assert(context.handleMineForPlane(jumper, null) === true,
    '2b: по пройденному пути — задевает');

  // А тот, кто действительно пролетел стороной, по-прежнему цел.
  const passerby = { color: 'green', activeTurnBuffs: {}, prevX: 0, prevY: 200, x: 100, y: 200 };
  assert(context.handleMineForPlane(passerby, null) === false,
    '2c: пролетевший стороной не подрывается — проверка по пути не превращается в «всё подряд»');
}

// === 3. Ящик подбирается по пути ===
{
  const context = {
    Math, Number,
    getCargoSpriteSize: () => ({ width: 20, height: 20 }),
    getPlaneBeneficialGeometry: (plane) => ({
      hitbox: {
        width: 36, height: 36,
        left: plane.x - 18, right: plane.x + 18,
        top: plane.y - 18, bottom: plane.y + 18,
      },
    }),
    lineSegmentIntersection: null,
  };
  vm.createContext(context);
  vm.runInContext([
    extractFunctionSource(source, 'lineSegmentIntersection'),
    extractFunctionSource(source, 'doesCargoIntersectPlaneBeneficialZone'),
    extractFunctionSource(source, 'doesCargoIntersectBeneficialZoneAlongSegment'),
    extractFunctionSource(source, 'getCargoSweepStart'),
    extractFunctionSource(source, 'markCargoSweepChecked'),
    'this.api = { doesCargoIntersectPlaneBeneficialZone, doesCargoIntersectBeneficialZoneAlongSegment,' +
    ' getCargoSweepStart, markCargoSweepChecked };',
  ].join('\n'), context);
  const api = context.api;

  const cargo = { x: 100, y: 0 };
  // Самолёт за кадр прошёл от x=0 до x=200 — ящик остался далеко позади.
  const jumper = { x: 200, y: 10, cargoSweepX: 0, cargoSweepY: 10 };
  assert(api.doesCargoIntersectPlaneBeneficialZone(cargo, jumper) === false,
    '3: по точке ящик не подобран — самолёт уже пролетел мимо');
  assert(api.doesCargoIntersectBeneficialZoneAlongSegment(
      cargo, jumper, api.getCargoSweepStart(jumper), jumper) === true,
    '3b: по пройденному пути — подобран');

  // Пролетевший в стороне — не подбирает.
  const passerby = { x: 200, y: 300, cargoSweepX: 0, cargoSweepY: 300 };
  assert(api.doesCargoIntersectBeneficialZoneAlongSegment(
      cargo, passerby, api.getCargoSweepStart(passerby), passerby) === false,
    '3c: пролетевший стороной ящик не подбирает');

  // Отметка: без неё начало отрезка — текущее место, то есть точечная проверка.
  const fresh = { x: 200, y: 10 };
  assert(api.getCargoSweepStart(fresh).x === 200,
    '3d: без отметки отрезок начинается там же, где кончается — как и должно быть у самолёта, который никуда не летел');
  api.markCargoSweepChecked(fresh);
  fresh.x = 400;
  assert(api.getCargoSweepStart(fresh).x === 200,
    '3e: после отметки отрезок считается от места прошлой проверки');
}

// === 4. Отметка двигается КАЖДЫЙ кадр, даже когда груза на поле нет ===
//
// Иначе она осталась бы там, где самолёт был много кадров назад, и первый же появившийся
// ящик оказался бы «подобран» на пути, пройденном ещё до его появления.
{
  const update = extractFunctionSource(source, 'updateCargoState');
  const emptyReturn = update.indexOf('return;');
  const markBeforeReturn = update.lastIndexOf('markCargoSweepChecked', emptyReturn);
  assert(markBeforeReturn !== -1 && markBeforeReturn < emptyReturn,
    '4: когда груза нет, отметка всё равно двигается — иначе она копит путь ' +
    'и первый же ящик соберёт всё, мимо чего самолёт пролетал до его появления');
  assert(update.lastIndexOf('markCargoSweepChecked') > update.indexOf('doesCargoIntersectBeneficialZoneAlongSegment'),
    '4b: и после проверки всех ящиков — иначе второй ящик в том же кадре проверялся бы уже точкой');

  // Подбор идёт по пути, а не по точке.
  assert(/doesCargoIntersectBeneficialZoneAlongSegment\(cargo, plane, from, plane\)/.test(update),
    '4c: подбор груза считается по отрезку');
  assert(!/doesCargoIntersectPlaneBeneficialZone\(cargo, plane\)/.test(update),
    '4d: точечной проверки в подборе не осталось');
}

// === 5. Новые поля самолёта учтены в снимке партии ===
//
// Снимок требует, чтобы каждое поле самолёта было либо в нём, либо в списке пропущенных с
// причиной. Новое поле, забытое там, ломает не снимок, а доверие к этой проверке.
{
  const skipped = source.match(/const MATCH_STATE_SKIPPED_PLANE_FIELDS = Object\.freeze\(\{[\s\S]*?\n\}\);/)[0];
  for(const field of ['cargoSweepX', 'cargoSweepY']){
    assert(new RegExp(`${field}:\\s*"`).test(skipped),
      `5: поле «${field}» числится среди осознанно не переносимых`);
  }

  const apply = extractFunctionSource(source, 'applyMatchState');
  assert(/plane\.cargoSweepX = plane\.x;/.test(apply) && /plane\.cargoSweepY = plane\.y;/.test(apply),
    '5b: при восстановлении снимка отметка сбрасывается на текущее место — иначе ' +
    'самолёт «пролетит» от старого места к новому и подберёт всё по дороге');
}

console.log('Smoke test passed: попадания считаются по пройденному пути, прошлое положение обновляется после проверок, а отметка для груза двигается каждый кадр.');
