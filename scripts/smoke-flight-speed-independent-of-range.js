#!/usr/bin/env node
'use strict';

// Smoke test: дальность из настроек меняет ДАЛЬНОСТЬ, а не скорость анимации.
//
// Самолёт летит по правилу «скорость × длительность = путь», и длительность была
// ПОСТОЯННОЙ. Значит, настройка дальности меняла не путь, а скорость:
//
//   дальность 10 клеток   путь  200 px   длительность 1.511 с   скорость 132 px/с
//   дальность 30 клеток   путь  600 px   длительность 1.511 с   скорость 397 px/с
//   дальность 50 клеток   путь 1000 px   длительность 1.511 с   скорость 662 px/с
//
// Пятикратный разброс, и это видно глазом: на большой дальности самолёты не летят дальше,
// а мечутся.
//
// Теперь постоянна СКОРОСТЬ, а длительность считается от дальности:
//
//   дальность 10   путь  200 px   длительность 0.504 с   скорость 397 px/с
//   дальность 30   путь  600 px   длительность 1.511 с   скорость 397 px/с
//   дальность 50   путь 1000 px   длительность 2.519 с   скорость 397 px/с
//
// Правило «скорость × длительность = путь» при этом НЕ ТРОНУТО: его знают полторы сотни
// мест в коде, включая всё планирование ИИ, и переписывать их значило бы переписать игру.
// Меняется одно число, а читают его по-прежнему как раньше.
//
// Замер настоящих полётов в браузере — от запуска до посадки, по часам:
//
//   дальность 10   0.50 с
//   дальность 30   1.50 с
//   дальность 50   2.52 с
//
// На дальности по умолчанию не изменилось ничего: те же 1.511 с, что и были раньше.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFn(source, name){
  const at = source.indexOf(`function ${name}(`);
  if(at === -1) throw new Error(`не найдено: ${name}`);
  const open = source.indexOf('{', source.indexOf(')', at));
  let depth = 0;
  for(let i = open; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}'){ depth -= 1; if(depth === 0) return source.slice(at, i + 1); }
  }
  throw new Error(`не закрыто: ${name}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// Стенд: настоящие константы и настоящий пересчёт, подставная настройка дальности.
const sandbox = { Number, Math, settings: { flightRangeCells: 30 } };
vm.createContext(sandbox);
vm.runInContext([
  source.match(/const BOUNCE_FRAMES\s*= \d+;/)[0],
  source.match(/const FIELD_FLIGHT_REFERENCE_RANGE_CELLS = \d+;/)[0],
  source.match(/const FIELD_FLIGHT_BASE_DURATION_SEC = [^;]+;/)[0],
  source.match(/let FIELD_FLIGHT_DURATION_SEC = [^;]+;/)[0],
  extractFn(source, 'syncFlightDurationToRange'),
  'this.durationFor = (cells) => { settings.flightRangeCells = cells;',
  '  syncFlightDurationToRange(); return FIELD_FLIGHT_DURATION_SEC; };',
  'this.BASE = FIELD_FLIGHT_BASE_DURATION_SEC;',
  'this.REFERENCE = FIELD_FLIGHT_REFERENCE_RANGE_CELLS;',
].join('\n'), sandbox);

const CELL = Number(/const CELL_SIZE\s*=\s*(\d+)/.exec(source)?.[1]);
const MIN = Number(/const MIN_FLIGHT_RANGE_CELLS = (\d+);/.exec(source)[1]);
const MAX = Number(/const MAX_FLIGHT_RANGE_CELLS = (\d+);/.exec(source)[1]);

// === 1. ГЛАВНОЕ: скорость одна и та же на любой дальности ===
{
  assert(Number.isFinite(CELL) && CELL > 0, '1: не удалось прочитать размер клетки');

  const speeds = [];
  for(let cells = MIN; cells <= MAX; cells += 1){
    const duration = sandbox.durationFor(cells);
    assert(Number.isFinite(duration) && duration > 0,
      `1b: на дальности ${cells} длительность вышла ${duration}`);
    speeds.push((cells * CELL) / duration);
  }

  const min = Math.min(...speeds);
  const max = Math.max(...speeds);
  assert((max - min) / max < 1e-9,
    `1c: скорость всё ещё зависит от дальности — от ${Math.round(min)} до ${Math.round(max)} px/с. `
    + 'Настройка называется «дальность полёта» и обязана менять путь, а не то, как быстро '
    + 'самолёт мечется по экрану');
}

// === 2. Длительность растёт ровно пропорционально дальности ===
//
// Без этого пункт 1 прошёл бы и на варианте «дальность вообще перестала влиять».
{
  const короткий = sandbox.durationFor(MIN);
  const длинный = sandbox.durationFor(MAX);
  assert(длинный > короткий,
    '2: дальний полёт длится не дольше ближнего — значит дальность больше ни на что не влияет');

  const ожидаемо = короткий * (MAX / MIN);
  assert(Math.abs(длинный - ожидаемо) < 1e-9,
    `2b: длительность растёт не пропорционально дальности (${длинный.toFixed(3)} вместо `
    + `${ожидаемо.toFixed(3)}) — значит скорость всё-таки плавает`);
}

// === 3. На дальности по умолчанию не изменилось НИЧЕГО ===
//
// Опорная точка выбрана так нарочно: игра, в которую играли, обязана остаться прежней.
{
  const обычная = sandbox.durationFor(sandbox.REFERENCE);
  assert(Math.abs(обычная - sandbox.BASE) < 1e-12,
    `3: на дальности по умолчанию длительность стала ${обычная.toFixed(4)} вместо `
    + `${sandbox.BASE.toFixed(4)} — изменилась игра, в которую уже играли`);
  assert(sandbox.REFERENCE === 30,
    '3b: опорная дальность разошлась со значением по умолчанию');
}

// === 4. Правило «скорость × длительность = путь» не тронуто ===
//
// Его знают полторы сотни мест, включая всё планирование ИИ: там из скорости и длительности
// считают точку посадки. Переписать их значило бы переписать игру.
{
  const profile = extractFn(source, 'getAiFlightRangeProfile');
  assert(/const speedPxPerSec = flightDistancePx \/ FIELD_FLIGHT_DURATION_SEC;/.test(profile),
    '4: скорость больше не выводится из пути и длительности — остальной код считает посадку '
    + 'именно так, и разойтись с ним нельзя');
  assert(/const flightDistancePx = effectiveFlightRangeCells \* CELL_SIZE;/.test(profile),
    '4b: путь больше не равен дальности в клетках — тогда настройка перестала быть дальностью');
}

// === 5. Длительность пересчитывается везде, где меняется дальность ===
//
// Значение хранится, а не считается на каждый чих: его читают полторы сотни мест по имени.
// Значит, оно может устареть — и не должно.
{
  assert(/let FIELD_FLIGHT_DURATION_SEC = /.test(code),
    '5: длительность снова константа — под дальность её уже не пересчитать');

  const load = extractFn(source, 'loadSettings');
  assert(/syncFlightDurationToRange\(\);/.test(load),
    '5b: чтение настроек не пересчитывает длительность — игрок поменяет дальность, а полёт '
    + 'останется прежним');

  // Один раз дальность выставляют напрямую, мимо чтения настроек.
  const calls = (code.match(/syncFlightDurationToRange\(\)/g) || []).length;
  assert(calls >= 3,
    `5c: пересчёт зовут ${calls - 1} раз вместо двух (чтение настроек и прямая установка) — `
    + 'какой-то путь снова оставляет длительность от прежней дальности');

  const direct = code.indexOf('settings.flightRangeCells = 30;');
  assert(direct > 0, '5d: не найдена прямая установка дальности — проверка устарела');
  assert(code.slice(direct, direct + 400).includes('syncFlightDurationToRange()'),
    '5e: после прямой установки дальности длительность не пересчитывается');
}

console.log('smoke-flight-speed-independent-of-range: OK');
