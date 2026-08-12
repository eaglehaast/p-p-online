#!/usr/bin/env node
'use strict';

// Smoke test: ИИ знает про правило «острые края».
//
// settings.sharpEdges (включено по умолчанию) означает: касание ГРАНИЦЫ ПОЛЯ убивает
// самолёт. В физике это учтено ровно в одном месте — resolveFlightSurfaceCollision. В ИИ
// не учитывалось нигде: simulateAIShot отражал траекторию от границы как от зеркала,
// поэтому весь перебор строил рикошеты от «боковых стен», которых нет. На картах без
// рамки (sharpedge*) это самоубийство: замер на живой игре показывал 73.5% симуляций с
// отскоком от границы и все четыре самолёта ИИ разбитыми о край за 7 вылетов.
//
// Кирпич у борта к правилу отношения не имеет: от него рикошет обычный. Значит опасен
// ровно ОТКРЫТЫЙ край — весь периметр на карте без рамки и дыра, пробитая динамитом,
// на обычной карте.

const fs = require('fs');
const vm = require('vm');

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

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');

// Поле 360x640 с отступом границы 14px: играбельная зона [14..346] x [14..626].
const buildContext = ({ sharpEdges = true, shieldedSides = [] } = {}) => {
  const context = {
    console, Math, Number, Array, Object, Boolean,
    settings: { sharpEdges },
    CELL_SIZE: 20,
    POINT_RADIUS: 11,
    SLIDE_THRESHOLD: 0.2,
    FIELD_LEFT: 0, FIELD_TOP: 0, FIELD_WIDTH: 360, FIELD_HEIGHT: 640,
    FIELD_BORDER_OFFSET_X: 14, FIELD_BORDER_OFFSET_Y: 14,
    AI_SHARP_EDGE_DEATH_PENALTY: 2400,
    AI_SHARP_EDGE_FLIGHT_CLIP_MARGIN_PX: 40,
    AI_SHARP_EDGE_CHECK_MAX_BOUNCES: 8,
    AI_SHARP_EDGE_DANGER_MARGIN_PX: 30,
    AI_OWN_MINE_PATH_PENALTY: 900,
    AI_OWN_MINE_LANDING_PENALTY: 1100,
    // Кирпич вдоль перечисленных сторон: путь до самой границы «не свободен».
    isPathClear: (x1, y1, x2, y2) => {
      if(shieldedSides.includes('left') && x2 <= 14 && x1 < 60) return false;
      if(shieldedSides.includes('right') && x2 >= 346 && x1 > 300) return false;
      if(shieldedSides.includes('top') && y2 <= 14 && y1 < 60) return false;
      if(shieldedSides.includes('bottom') && y2 >= 626 && y1 > 580) return false;
      return true;
    },
  };
  vm.createContext(context);
  for(const fn of [
    'isAiSharpEdgeLethal',
    'isAiSimSharpEdgeSuicide',
    'doesAiPathGrazeSharpEdge',
    'getAiSharpEdgeSafeFlightDistancePx',
    'scoreAISimulatedCandidate',
  ]) vm.runInContext(extractFunctionSource(source, fn), context);
  return context;
};

// === 1. Предикат «симуляция кончилась смертью о край» ===
{
  const ctx = buildContext();
  assert(ctx.isAiSimSharpEdgeSuicide({ sharpEdgeDeath: true }) === true, '1: смертельная симуляция распознаётся');
  assert(ctx.isAiSimSharpEdgeSuicide({ sharpEdgeDeath: false }) === false, '1: обычная симуляция — не смерть');
  assert(ctx.isAiSimSharpEdgeSuicide(null) === false, '1: пустая симуляция — не смерть');
}

// === 2. Полоса опасности вдоль края — прямой аналог радиуса мины ===
{
  const open = buildContext();
  assert(open.doesAiPathGrazeSharpEdge([{ x: 180, y: 300 }, { x: 180, y: 400 }]) === false,
    '2: маршрут посреди поля края не задевает');
  assert(open.doesAiPathGrazeSharpEdge([{ x: 180, y: 300 }, { x: 25, y: 400 }]) === true,
    '2: маршрут, идущий впритирку к открытому краю, обязан считаться опасным');
  assert(open.doesAiPathGrazeSharpEdge([{ x: 180, y: 20 }]) === true,
    '2: верхний край опаснее не меньше боковых');

  // Тот же маршрут, но вдоль борта, закрытого кирпичом: это обычная стена.
  const shielded = buildContext({ shieldedSides: ['left'] });
  assert(shielded.doesAiPathGrazeSharpEdge([{ x: 180, y: 300 }, { x: 25, y: 400 }]) === false,
    '2: вдоль борта с кирпичом лететь безопасно — такие маршруты штрафовать нельзя');

  // Правило выключено — никакой полосы нет вовсе.
  const off = buildContext({ sharpEdges: false });
  assert(off.doesAiPathGrazeSharpEdge([{ x: 25, y: 400 }]) === false,
    '2: при выключенном правиле край безопасен и полосы нет');
}

// === 3. Общий штраф в переборе выстрелов ===
{
  const ctx = buildContext();
  const target = { x: 180, y: 300 };
  const opts = { target, targetDistance: 200 };
  const safeSim = {
    hitTarget: false, travelDistance: 200, bounceCount: 0,
    impactPoint: { x: 180, y: 300 }, predictedPath: [{ x: 180, y: 200 }, { x: 180, y: 300 }],
  };
  const suicideSim = { ...safeSim, sharpEdgeDeath: true };
  // Самоубийственный маршрут, который ПОПАДАЕТ в цель, всё равно хуже безопасного промаха:
  // размен «убил одного и разбился» не должен выигрывать сам собой.
  const suicideKill = { ...suicideSim, hitTarget: true };
  const safeScore = ctx.scoreAISimulatedCandidate(safeSim, opts);
  const suicideScore = ctx.scoreAISimulatedCandidate(suicideSim, opts);
  const suicideKillScore = ctx.scoreAISimulatedCandidate(suicideKill, opts);
  assert(suicideScore < safeScore - 2000, '3: маршрут в край штрафуется тяжелее любого выигрыша по дистанции');
  assert(suicideKillScore < safeScore, '3: даже с убийством самоубийственный маршрут проигрывает безопасному');

  // Полоса опасности штрафуется, но вдвое мягче: это «возьми линию подальше», не запрет.
  const grazingSim = { ...safeSim, predictedPath: [{ x: 180, y: 200 }, { x: 25, y: 300 }] };
  const grazingScore = ctx.scoreAISimulatedCandidate(grazingSim, opts);
  assert(grazingScore < safeScore, '3: маршрут по кромке хуже маршрута в глубине поля');
  assert(grazingScore > suicideScore, '3: но всё же лучше гарантированной смерти');
}

// === 4. Клип дистанции: ход не отменяется, а укорачивается ===
{
  const ctx = buildContext();
  // Подставная геометрия: единственная поверхность — правый край поля.
  ctx.findFirstSurfaceHit = (p0, p1) => {
    const edgeX = 346;
    if(!(p1.x > edgeX - 11) || p0.x > edgeX - 11) return null;
    const t = (edgeX - 11 - p0.x) / (p1.x - p0.x);
    return { t, surface: { type: 'field' }, normal: { x: -1, y: 0 } };
  };
  ctx.getPlaneEffectiveRangePx = () => 600;
  const plane = { x: 100, y: 300 };
  // Летим вправо на 400px: край (335 для центра самолёта) на 235px — обрезаем до 235-40.
  const safe = ctx.getAiSharpEdgeSafeFlightDistancePx(plane, 1, 0, 400);
  assert(Math.abs(safe - 195) < 1.5, `4: ход обрезается до точки перед краем, получено ${safe}`);
  // Влево — край далеко, ход не трогаем.
  assert(ctx.getAiSharpEdgeSafeFlightDistancePx(plane, -1, 0, 80) === 80,
    '4: безопасный ход не укорачивается');
  // Дистанция ДЛИННЕЕ дальности самолёта (топливо применяется после планирования):
  // проверка обязана видеть весь вектор, а не обрезанный дальностью кусок.
  assert(ctx.getAiSharpEdgeSafeFlightDistancePx(plane, 1, 0, 1200) < 250,
    '4: вектор длиннее дальности проверяется целиком');
  // Правило выключено — не вмешиваемся вообще.
  const off = buildContext({ sharpEdges: false });
  off.findFirstSurfaceHit = ctx.findFirstSurfaceHit;
  off.getPlaneEffectiveRangePx = ctx.getPlaneEffectiveRangePx;
  assert(off.getAiSharpEdgeSafeFlightDistancePx(plane, 1, 0, 400) === 400,
    '4: при выключенном правиле ход не трогается');
}

// === 5. Инварианты по исходнику: где именно правило вшито ===
{
  assert(source.includes('outcomeType = "sharp_edge_death"'),
    '5: сама симуляция обязана заканчивать полёт смертью о край, а не отражать его');
  assert(source.includes('const lethalEdgeAhead = sharpEdgeLethal && hit?.surface?.type === "field"'),
    '5: смертелен именно край поля — кирпич у борта остаётся обычной стеной');
  assert(source.includes('sharp_edge_launch_clipped'),
    '5: клип стоит на общем чокпойнте запуска, иначе вынужденные ходы его обходят');
  assert(source.includes('if(isAiSimSharpEdgeSuicide(boostedSim) && !isAiSimSharpEdgeSuicide(currentSim)) return false;'),
    '5: «долететь до упора» не должно превращать безопасный ход в удар о край');
}

console.log('Smoke test passed: симуляция ИИ знает, что открытый край убивает; перебор штрафует и маршрут в край, и полёт по его кромке; вынужденный ход укорачивается, а не отменяется; борт, закрытый кирпичом, по-прежнему обычная стена.');
