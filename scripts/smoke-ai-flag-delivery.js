#!/usr/bin/env node
'use strict';

// Smoke test: a flag carrier that can reach base this turn gets a TOP-priority
// delivery plan (planTier -1), with fuel when home is just out of base range — but
// only on a DIRECT line, and only when the planned move genuinely lands in the base
// zone. No carried (enemy) flag yields null (normal logic runs).
//
// А если донести за один ход нельзя — носильщик всё равно летит К БАЗЕ («поднести
// ближе», planTier 0). Раньше здесь был выход в null, и носильщик проваливался в
// обычное планирование: летел за грузом, в атаку, куда угодно, только не домой.
// Плюс план обязан нести точку приземления: без landingX/landingY планировщик молча
// заменяет его «гарантированным сдвигом», и доставка не выполняется вообще.

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

const flags = { green1: { color: 'green' }, blue1: { color: 'blue' } };
let baseRangeMove = null; // what the base-range route probe returns
let boostedMove = null;   // what the fuel-boosted route probe returns

const context = {
  Math,
  Number,
  AI_FLAG_FUEL_CAPTURE_MIN_ADVANCE_PX: 120,
  getFlagById: (id) => flags[id] || null,
  getBaseAnchor: () => ({ x: 0, y: 0 }),
  getBaseInteractionTarget: () => ({ anchor: { x: 0, y: 0 }, radius: 40 }),
  getAiMoveLandingPoint: (move) => move?.landing || null,
  // base zone hit = the (fake) plane at the landing is within the base radius.
  doesPlaneZoneIntersectTargetZone: (p, target) =>
    Math.hypot(p.x - target.anchor.x, p.y - target.anchor.y) <= target.radius,
  planPathWithSpecialRouteProbe: (plane, tx, ty, opts) => (opts?.useFuelBoostedRange ? boostedMove : baseRangeMove),
  logAiDecision: () => {},
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'tryBuildAiFlagDeliveryPlan'), context);

const carrier = (carriedFlagId) => ({ id: 'p1', color: 'blue', x: 200, y: 0, carriedFlagId });
const plan = (plane, opts, base, boosted) => {
  baseRangeMove = base;
  boostedMove = boosted;
  return context.tryBuildAiFlagDeliveryPlan(plane, opts);
};
const reaching = { landing: { x: 5, y: 5 }, totalDist: 300, bounceCount: 0, routeClass: 'direct' };
const farMiss = { landing: { x: 500, y: 0 }, totalDist: 600, bounceCount: 0, routeClass: 'direct' };

// 1. Carrier + base reachable at base range -> top-priority delivery, no fuel.
const p1 = plan(carrier('green1'), { flagsMode: true, readyCargoCount: 2 }, reaching, null);
assert(p1 && p1.planTier === -1, '1: a reachable carrier should get a planTier -1 delivery.');
assert(p1.goalName === 'return_with_flag' && p1.decisionReason === 'return_with_flag_deliver',
  '1b: the delivery plan should be a no-fuel return_with_flag.');

// 2. Not flags mode -> null.
assert(plan(carrier('green1'), { flagsMode: false }, reaching, null) === null, '2: no delivery outside flags mode.');

// 3. Not carrying a flag -> null.
assert(plan(carrier(null), { flagsMode: true }, reaching, null) === null, '3: no flag, no delivery.');

// 4. Carrying our OWN-coloured flag (not the enemy green) -> null.
assert(plan(carrier('blue1'), { flagsMode: true }, reaching, null) === null, '4: only the enemy (green) flag scores.');

// 5. Base out of base range but a DIRECT fuel-boosted route reaches -> delivery with fuel.
const p5 = plan(carrier('green1'), { flagsMode: true }, farMiss, reaching);
assert(p5 && p5.planTier === -1 && p5.decisionReason === 'return_with_flag_deliver_fuel',
  '5: a direct fuel-boosted reach should deliver with fuel.');

// 6. Base unreachable even with fuel, и ход УВОДИТ от базы -> null (работает обычный отбор).
assert(plan(carrier('green1'), { flagsMode: true }, farMiss, farMiss) === null,
  '6: no delivery when even the boosted route falls short and leads away from home.');

// 7. Boosted route reaches but via a RICOCHET (bounce) -> NOT trusted -> null.
const ricochetReach = { landing: { x: 5, y: 5 }, totalDist: 1100, bounceCount: 2, routeClass: 'ricochet' };
assert(plan(carrier('green1'), { flagsMode: true }, farMiss, ricochetReach) === null,
  '7: a ricochet fuel-boosted reach is not trusted to deliver.');

// 8. Донести нельзя, но ход подносит флаг ЗАМЕТНО ближе к базе -> «поднести ближе».
const closer = { landing: { x: 60, y: 0 }, totalDist: 140, bounceCount: 0, routeClass: 'direct' };
const p8 = plan(carrier('green1'), { flagsMode: true }, closer, closer);
assert(p8, '8: носильщик, который не долетает до базы, обязан всё равно лететь к ней');
assert(p8.decisionReason === 'return_with_flag_advance',
  '8b: это именно «поднести ближе», а не доставка');
assert(p8.planTier === 0,
  '8c: подношение идёт ниже настоящей доставки, но выше обычных целей');

// 9. Приближение меньше порога -> плана нет: ход в никуда носильщику не нужен.
const barely = { landing: { x: 130, y: 0 }, totalDist: 70, bounceCount: 0, routeClass: 'direct' };
assert(plan(carrier('green1'), { flagsMode: true }, barely, barely) === null,
  '9: сдвиг к базе меньше порога — обычный отбор, а не имитация доставки');

// 10. Любой план доставки обязан нести точку приземления.
for(const [label, p] of [['доставка', p1], ['доставка с баком', p5], ['подношение', p8]]){
  assert(Number.isFinite(p.landingX) && Number.isFinite(p.landingY),
    `10: план (${label}) без landingX/landingY планировщик молча заменит «гарантированным сдвигом»`);
}

// 11. Контекст ИИ обязан читать НАСТОЯЩИЙ признак режима флагов. Настройки с именем
//     flagsMode не существует: из-за неё shouldUseFlagsMode был всегда false и весь
//     флаговый слой ИИ (доставка, заправленный захват, флаги как цели) не работал.
assert(!/shouldUseFlagsMode:\s*Boolean\(settings\?\.flagsMode\)/.test(source),
  '11: shouldUseFlagsMode не должен читать несуществующую settings.flagsMode');
assert(/shouldUseFlagsMode:[\s\S]{0,200}isFlagsModeEnabled\(\)/.test(source),
  '11b: режим флагов для ИИ должен определяться через isFlagsModeEnabled()');

console.log('Smoke test passed: носильщик доставляет флаг верхним приоритетом, а когда донести за ход нельзя — всё равно летит к базе; план несёт точку приземления, и режим флагов читается настоящим признаком.');
