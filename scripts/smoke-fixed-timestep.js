#!/usr/bin/env node
'use strict';

// Smoke test: полёт считается порциями одной длины, а не «сколько прошло с прошлого кадра».
//
// Раньше шаг физики равнялся времени кадра. Значит траектория зависела от того, насколько
// быстрая у игрока машина. Замер в браузере, один и тот же бросок:
//
//     та же частота кадров (45 против 47) — посадка разошлась на  4.8 px
//     кадры медленнее вчетверо           — на 11.7 px
//     кадры медленнее в восемь раз       — на 10.8 px
//
// Ящик и мина — 20 px, самолёт — 36 px. То есть у двоих игроков это буквально разные
// полёты, а в одиночной игре на слабой машине — другая физика. После правки: 0.00 px при
// любой частоте кадров.
//
// Свойство, которое здесь проверяется, одно и главное: ЗА ОДНО И ТО ЖЕ ВРЕМЯ ДЕЛАЕТСЯ
// ОДНО И ТО ЖЕ ЧИСЛО ШАГОВ, как бы это время ни было нарезано на кадры. Из него и следует
// одинаковая траектория.

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

// Стенд: настоящий накопитель из script.js, а шаг симуляции подменён счётчиком.
function buildStand(){
  const sandbox = { Math, calls: [] };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const SIMULATION_STEP_SEC = [^;]+;/)[0],
    source.match(/const SIMULATION_MAX_STEPS_PER_FRAME = \d+;/)[0],
    'let simulationStepAccumulator = 0;',
    'function stepSimulation(deltaSec){ calls.push(deltaSec); }',
    extractFunctionSource(source, 'runSimulationSteps'),
    'this.api = { runSimulationSteps, STEP: SIMULATION_STEP_SEC,',
    '             MAX: SIMULATION_MAX_STEPS_PER_FRAME,',
    '             acc: () => simulationStepAccumulator };',
  ].join('\n'), sandbox);
  return { api: sandbox.api, calls: sandbox.calls };
}

// === 1. Шаг всегда одной длины ===
{
  const stand = buildStand();
  // Кадры разной длины, как в жизни.
  for(const frame of [0.016, 0.033, 0.008, 0.05, 0.021, 0.017]){
    stand.api.runSimulationSteps(frame, 0);
  }
  assert(stand.calls.length > 0, '1: шаги вообще делаются');
  assert(stand.calls.every((step) => step === stand.api.STEP),
    `1b: КАЖДЫЙ шаг ровно ${stand.api.STEP} с — на этом и держится одинаковость ` +
    `траектории (встретились: ${[...new Set(stand.calls)].join(', ')})`);
  assert(stand.api.STEP > 0 && stand.api.STEP <= 1 / 30,
    '1c: шаг не крупнее 1/30 с — иначе самолёт за шаг проходит больше, чем размер мины');
}

// === 2. Одно и то же время — одно и то же число шагов (с точностью до одного) ===
//
// Ровного равенства тут быть не может, и это важно понимать. Накопитель складывает
// времена кадров, а сложение дробных чисел не точно: за секунду рваных кадров остаток
// может не дотянуть до последнего шага. Разброс при этом ОГРАНИЧЕН одним шагом и не
// растёт — вот это и проверяется.
//
// На траекторию расхождение в один шаг не влияет: длительность полёта отсчитывается
// в ШАГАХ (fp.timeLeft уменьшается ровно на шаг, см. раздел 1), а не в секундах. Поэтому
// полёт длится одно и то же число шагов у всех, и точка посадки совпадает — замер в
// браузере даёт 0.00 px при разнице частоты кадров в восемь раз. Разъезжается лишь то,
// за сколько РЕАЛЬНОГО времени этот полёт отыграется, а это никого не касается.
{
  const patterns = {
    'ровно 60 кадров/с': Array.from({ length: 60 }, () => 1 / 60),
    '30 кадров/с': Array.from({ length: 30 }, () => 1 / 30),
    '20 кадров/с (просевшие)': Array.from({ length: 20 }, () => 0.05),
    '120 кадров/с': Array.from({ length: 120 }, () => 1 / 120),
    'рваные кадры': (() => {
      // Ровно секунда, нарезанная как попало — но воспроизводимо.
      const chunks = [];
      let left = 1;
      const sizes = [0.007, 0.031, 0.012, 0.048, 0.019, 0.004, 0.026, 0.038, 0.011, 0.022];
      let i = 0;
      while(left > 1e-9){
        const take = Math.min(sizes[i % sizes.length], left);
        chunks.push(take);
        left -= take;
        i += 1;
      }
      return chunks;
    })(),
  };

  const counts = {};
  for(const [name, frames] of Object.entries(patterns)){
    const stand = buildStand();
    for(const frame of frames) stand.api.runSimulationSteps(frame, 0);
    counts[name] = stand.calls.length;
  }

  const values = Object.values(counts);
  const spread = Math.max(...values) - Math.min(...values);
  assert(spread <= 1,
    '2: за одну и ту же секунду число шагов расходится не больше чем на один, как бы ' +
    'она ни была нарезана на кадры. Сейчас: ' +
    Object.entries(counts).map(([k, v]) => `${k} → ${v}`).join('; '));
  assert(counts['ровно 60 кадров/с'] === 60,
    `2b: за секунду — 60 шагов (сейчас ${counts['ровно 60 кадров/с']})`);

  // И разброс не копится: за десять секунд он остаётся тем же одним шагом, а не
  // превращается в десять.
  const longCounts = {};
  for(const [name, frames] of Object.entries(patterns)){
    const stand = buildStand();
    for(let repeat = 0; repeat < 10; repeat += 1){
      for(const frame of frames) stand.api.runSimulationSteps(frame, 0);
    }
    longCounts[name] = stand.calls.length;
  }
  const longValues = Object.values(longCounts);
  const longSpread = Math.max(...longValues) - Math.min(...longValues);
  assert(longSpread <= 1,
    '2c: за десять секунд разброс всё тот же — не копится. Сейчас: ' +
    Object.entries(longCounts).map(([k, v]) => `${k} → ${v}`).join('; '));
  console.log(`  за секунду: ${Math.min(...values)}–${Math.max(...values)} шагов; ` +
    `за десять: ${Math.min(...longValues)}–${Math.max(...longValues)}`);
}

// === 3. Остаток не теряется и не удваивается ===
//
// Иначе за минуту полёта накопится расхождение и без всякой разницы в кадрах.
{
  const stand = buildStand();
  // Кадр чуть короче шага: шагов пока нет, но время копится.
  stand.api.runSimulationSteps(stand.api.STEP * 0.9, 0);
  assert(stand.calls.length === 0, '3: пока не набралось на шаг — шага нет');
  stand.api.runSimulationSteps(stand.api.STEP * 0.9, 0);
  assert(stand.calls.length === 1, '3b: набралось на один — сделан один');
  assert(Math.abs(stand.api.acc() - stand.api.STEP * 0.8) < 1e-9,
    '3c: остаток сохранён до следующего кадра, а не выброшен');
}

// === 4. Вкладка из фона не отыгрывает пропущенное разом ===
//
// Пролежав в фоне, браузер отдаёт один огромный кадр. Без ограничения игра попыталась бы
// нагнать всё сразу — и повисла бы.
{
  const stand = buildStand();
  stand.api.runSimulationSteps(30, 0); // полминуты одним кадром
  assert(stand.calls.length === stand.api.MAX,
    `4: за кадр делается не больше ${stand.api.MAX} шагов (сделано ${stand.calls.length})`);
  assert(stand.api.acc() === 0,
    '4b: непосильный остаток отбрасывается, а не копится — иначе следующие кадры ' +
    'тоже пойдут по потолку и игра застрянет в перемотке');
}

// === 5. Полёт считается внутри шага, а не в отрисовке ===
{
  const step = extractFunctionSource(source, 'stepSimulation');
  assert(/for\(const fp of current\)/.test(step) && /flyingPoints/.test(step),
    '5: сам полёт живёт внутри шага симуляции');
  assert(/handleMineForPlane\(p, fp\)/.test(step) && /checkPlaneHits\(p, fp\)/.test(step),
    '5b: и проверки попаданий вместе с ним — иначе они считались бы раз в кадр, ' +
    'то есть с разной частотой у разных игроков');

  const draw = extractFunctionSource(source, 'gameDraw');
  assert(/runSimulationSteps\(deltaSec, now\)/.test(draw),
    '5c: отрисовка вызывает шаги, а не считает физику сама');
  assert(!/for\(const fp of current\)/.test(draw),
    '5d: и сама полёт больше не считает');
}

// === 6. Ожидание игровых событий — по часам симуляции, а не по часам машины ===
//
// Ящик падает полсекунды и только потом становится «готов». Если этот срок мерить
// performance.now(), а прилёт самолёта считать шагами, у быстрой и медленной вкладки
// шкалы разъедутся: один увидит ящик готовым, второй — ещё падающим, и подбор случится
// только у одного.
{
  const step = extractFunctionSource(source, 'stepSimulation');
  assert(/simulationTimeSec \+= deltaSec;/.test(step),
    '6: часы симуляции идут шагами');

  const update = extractFunctionSource(source, 'updateCargoState');
  assert(/simulationTimeSec >= readyAtSim/.test(update),
    '6b: готовность ящика проверяется по часам симуляции');
  assert(!/now - cargo\.animStartedAt >= animDurationMs/.test(update),
    '6c: и больше не по часам машины');

  const spawn = extractFunctionSource(source, 'spawnCargoForTurn');
  assert(/readyAtSim: simulationTimeSec \+ animDurationMs \/ 1000/.test(spawn),
    '6d: срок готовности назначается от часов симуляции при появлении ящика');

  // Само падение по-прежнему рисуется от часов машины — это оформление, и оно у каждого
  // своё по праву.
  assert(/animStartedAt/.test(spawn),
    '6e: отметка для отрисовки падения осталась');
}

console.log('Smoke test passed: шаг симуляции всегда одной длины, полёт длится целое число шагов и потому не зависит от частоты кадров, остаток не теряется и не копится, вкладка из фона не отыгрывает пропущенное разом.');
