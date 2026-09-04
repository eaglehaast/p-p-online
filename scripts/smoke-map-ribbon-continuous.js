#!/usr/bin/env node
'use strict';

// Smoke test: лента карт едет одним ходом, а не рывками по шагу.
//
// Дальность и точность прокручиваются одним проходом: позиция идёт непрерывной дробью от
// начала до конца, easeOutBack применяется КО ВСЕЙ дистанции, лента двигается каждый кадр.
//
// У карт было иначе: анимировался каждый шаг ОТДЕЛЬНО, в конце шага трансформа жёстко
// возвращалась в базовую, подписи переклеивались, и следующий шаг начинался с места.
// Замер протяжки пальцем на 260 px:
//
//                        дальность (эталон)      карты (было)      карты (стало)
//   рывков на слот               0                    10                 0
//   длительность              905 мс               2319 мс            2010 мс
//
// «Рывок» здесь — сдвиг ведущего элемента на целую ширину слота (58 px) за один кадр.
//
// Список карт бесконечный, поэтому длинной ленты-картинки, как у дальности, тут быть не
// может: три слота (prev/current/next) переклеиваются НА ЛЕТУ, когда непрерывная позиция
// пересекает целый шаг. Трек при этом обязан прыгнуть на слот назад — это и гасит сдвиг
// подписей, глаз видит непрерывный ход.
//
// ВТОРАЯ правка — про РИТМ конца. Непрерывность одной кривой easeOutBack дала гладкий
// ход, но всё торможение свалила в один последний шаг. Замер той же протяжки:
//
//   было:  100 67 67 83 100 100 133 150 233 767 мс   последний / предпоследний = 3.3
//   стало: 100 83 67 83 67 117 167 250 383 567 мс    последний / предпоследний = 1.5
//
// Разница на глаз: у любой кривой вида easeOut скорость гаснет асимптотически, поэтому
// последняя карта не приезжала, а бесконечно замедляясь вползала в центр — 600 мс уже
// после того, как её картинка появилась в превью. «Приездом» глаз читал ПРЕДпоследнюю
// подпись: она вставала по центру, замирала и уезжала.
//
// Теперь время раздаётся по шагам явно: каждый шаг в полтора раза длиннее следующего за
// ним, пока не упрётся в пол мелькания. Последний шаг проходится с живой скоростью и
// кончается настоящей остановкой с отдачей меньше двух пикселей.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFn(source, name){
  const re = new RegExp(`^(?:async )?function ${name}\\(`, 'm');
  const m = re.exec(source);
  if(!m) throw new Error(`не найдено: ${name}`);
  const start = m.index;
  const open = source.indexOf('{', source.indexOf(')', start));
  let d = 0;
  for(let i = open; i < source.length; i += 1){
    if(source[i] === '{') d += 1;
    if(source[i] === '}'){ d -= 1; if(d === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`не закрыто: ${name}`);
}


const settings = fs.readFileSync('settings.js', 'utf8');
const animate = extractFn(settings, 'animateFieldLabelChange');
const code = animate.replace(/\/\/.*$/gm, '');

// Настоящий расчёт хода из settings.js — константы плюс четыре функции. Константы,
// объявленные через const внутри vm-контекста, НЕ становятся его свойствами, поэтому
// нужное кладём в globalThis явно (эта ловушка уже ловила нас дважды).
function loadTravelMath(){
  const constants = /const FIELD_LAST_STEP_WEIGHT[\s\S]*?const FIELD_LANDING_SETTLE_MAX_SHARE = [\d.]+;/
    .exec(settings);
  if(!constants) throw new Error('не найден блок констант ритма');
  const context = { Math };
  vm.createContext(context);
  vm.runInContext([
    constants[0],
    extractFn(settings, 'getFieldLandingSettleShare'),
    extractFn(settings, 'buildFieldStepSchedule'),
    extractFn(settings, 'getFieldScheduleSlope'),
    extractFn(settings, 'easeFieldRibbonTravel'),
    'globalThis.math = { getFieldLandingSettleShare, buildFieldStepSchedule, easeFieldRibbonTravel };'
  ].join('\n'), context);
  return context.math;
}

const travelMath = loadTravelMath();

// Длительности шагов в миллисекундах — ровно то, что видит глаз как ритм.
function stepDurations(stepCount, totalDurationMs){
  const settleShare = travelMath.getFieldLandingSettleShare(totalDurationMs);
  const times = travelMath.buildFieldStepSchedule(stepCount, settleShare);
  const out = [];
  for(let k = 1; k < times.length; k += 1) out.push((times[k] - times[k - 1]) * totalDurationMs);
  return out;
}

// === 1. ГЛАВНОЕ: один проход на всю дистанцию, а не цепочка шагов ===
{
  assert(/const totalDurationMs = stepDurationMs \* stepCount;/.test(code),
    '1: длительность считается на ВСЮ дистанцию — иначе это снова анимация по шагу');
  assert(/const travelled = easeFieldRibbonTravel\(progress, stepSchedule, settleShare\);/.test(code),
    '1b: пройденное расстояние берётся из общего расчёта хода, а не считается по шагу');

  // Расписание строится ОДИН раз на прокат. Внутри кадрового цикла оно означало бы, что
  // ритм пересчитывается на каждом кадре — и достаточно любой мелочи, чтобы он поехал.
  const beforeTick = code.slice(0, code.indexOf('const tick ='));
  assert(/const stepSchedule = buildFieldStepSchedule\(stepCount, settleShare\);/.test(beforeTick),
    '1c: расписание шагов строится один раз до начала анимации');

  // Цепочка узнаётся по перезапуску шага из самого себя.
  assert(!/requestAnimationFrame\(runStep\)/.test(code),
    '1d: перезапуск следующего шага вернулся — это и давало рывок на слот между шагами');
  assert(!/remainingSteps/.test(code),
    '1e: счётчик оставшихся шагов вернулся — признак пошаговой цепочки');

  // Сброс трансформы в базовую посреди хода — второй признак рывка.
  const ticks = code.slice(code.indexOf('const tick ='));
  assert(!/transform: baseTransform/.test(ticks),
    '1f: внутри кадрового цикла трансформа возвращается в базовую — это жёсткий сброс');
}

// === 2. Подписи переклеиваются на лету, по пересечению целого шага ===
//
// Это и есть замена бесконечной ленте: трёх слотов хватает, пока переклейка происходит
// ровно в момент пересечения.
{
  assert(/applyRecycle\(Math\.floor\(travelled\)\)/.test(code),
    '2: переклейка привязана к ЦЕЛОЙ части пройденного пути');
  assert(/syncFieldLabelSlots\(currentIndex, token\)/.test(code),
    '2b: при переклейке подписи пересобираются');
  assert(/const offsetPx = stepOffsetPx \* \(travelled - crossedSteps\);/.test(code),
    '2c: смещение трека — дробный остаток; целые шаги уже отражены в подписях');
}

// === 2bis. Превью следует за той картой, что стоит ПО ЦЕНТРУ ===
//
// Переклейка идёт по целой части, а по центру окошка подпись меняется на СЕРЕДИНЕ шага.
// Если вести превью по той же целой части, картинка отстаёт на полшага. На пологом хвосте
// кривой это отставание растягивается: замер показывал серии расхождения 2, 2, 3, 3, 3, 3,
// 4, 5, 8 и наконец 36 кадров — около 600 мс, когда имя конечной карты уже в центре, а
// картинка держит предыдущую и потом резко переключается. Всего расходилось 53% кадров.
//
// После разделения — 18%, и вся оставшаяся доля приходится на само перетаскивание пальцем
// (там превью не следует за лентой вовсе — это другой путь в коде).
{
  assert(/applyPreview\(Math\.round\(travelled\)\)/.test(code),
    '2bis: превью ведётся по БЛИЖАЙШЕМУ шагу — это и есть карта по центру окошка');
  assert(!/applyPreview\(Math\.floor/.test(code),
    '2bis-b: по целой части превью отстаёт на полшага, и на хвосте это тянется ~600 мс');

  const recycle = /const applyRecycle = \(k\) => \{[\s\S]*?\n  \};/.exec(code);
  const preview = /const applyPreview = \(k\) => \{[\s\S]*?\n  \};/.exec(code);
  assert(recycle && preview, '2bis-c: переклейка и превью разведены на две функции');
  assert(/syncFieldLabelSlots/.test(recycle[0]) && !/updateMapPreviewIndex/.test(recycle[0]),
    '2bis-d: переклейка занимается подписями и не трогает превью');
  assert(/updateMapPreviewIndex/.test(preview[0]) && !/syncFieldLabelSlots/.test(preview[0]),
    '2bis-e: превью занимается картинкой и не трогает подписи');

  // У каждой своя отметка пройденного, иначе одна погасит вызовы другой.
  assert(/if\(clamped === crossedSteps\) return;/.test(recycle[0])
    && /if\(clamped === previewSteps\) return;/.test(preview[0]),
    '2bis-f: счётчики раздельные — общий сделал бы вторую функцию немой');
}

// === 3. Арифметика переклейки: индекс и смещение всегда согласованы ===
//
// Главная опасность такой ленты — рассинхрон: подписи ушли на шаг, а трек нет (или
// наоборот). Тогда лента дёрнется ровно на слот. Проверяем счётом.
{
  const SLOT = 58;
  const simulate = (stepCount) => {
    const totalDurationMs = 180 * stepCount;
    const settleShare = travelMath.getFieldLandingSettleShare(totalDurationMs);
    const times = travelMath.buildFieldStepSchedule(stepCount, settleShare);
    const stepOffsetPx = -SLOT;
    let crossed = 0;
    const visible = [];
    let prevVisible = 0;
    for(let frame = 0; frame <= 60; frame += 1){
      const progress = Math.min(1, frame / 60);
      const travelled = travelMath.easeFieldRibbonTravel(progress, times, settleShare);
      const nextCrossed = Math.max(0, Math.min(stepCount, Math.floor(travelled)));
      crossed = nextCrossed;
      const offsetPx = stepOffsetPx * (travelled - crossed);
      // Видимое положение = смещение трека плюс уже переклеенные шаги.
      const visiblePos = offsetPx + stepOffsetPx * crossed;
      visible.push(+(visiblePos - prevVisible).toFixed(4));
      prevVisible = visiblePos;
    }
    return visible.slice(1);
  };

  for(const stepCount of [1, 2, 5, 10]){
    const deltas = simulate(stepCount);
    const worst = Math.max(...deltas.map(Math.abs));
    const perFrameLimit = (SLOT * stepCount) / 8; // заведомо больше плавного хода
    assert(worst < perFrameLimit,
      `3: при ${stepCount} шагах видимое положение прыгает на ${worst.toFixed(1)} px за кадр `
      + `(порог ${perFrameLimit.toFixed(1)}) — переклейка и смещение разошлись`);
    // И ни один кадр не должен двигать ленту на целый слот.
    assert(worst < SLOT * 0.9,
      `3b: при ${stepCount} шагах есть кадр со сдвигом почти на слот (${worst.toFixed(1)} px) — это рывок`);
  }
}

// === 4. ГЛАВНОЕ: ритм конца — торможение начинается ЗАРАНЕЕ, а не в последнем шаге ===
//
// Это и есть суть второй правки. Числа взяты не с потолка: на замере старая кривая давала
// последний шаг в 3.3 раза длиннее предпоследнего, и именно этот провал читался как
// «предпоследнюю карту показали и убрали».
{
  const long = stepDurations(10, 1800);
  const lastRatio = long[9] / long[8];
  assert(lastRatio < 2,
    `4: последний шаг длиннее предпоследнего в ${lastRatio.toFixed(2)} раза — торможение снова `
    + 'свалено в один шаг, последняя карта будет вползать в центр вместо приезда');

  // Три последние доли обязаны РАЗЛИЧАТЬСЯ: без этого конец сливается в одну паузу.
  assert(long[9] / long[8] > 1.25 && long[8] / long[7] > 1.25,
    `4b: хвост ${long.slice(-3).map(v => Math.round(v)).join(' → ')} мс — доли слишком близки, `
    + 'ритма «предпред — пред — последний» не получится');

  // И торможение обязано начинаться РАНЬШЕ последнего шага: предпредпоследний уже заметно
  // длиннее мелькания.
  assert(long[7] > long[0] * 2,
    `4c: предпредпоследний шаг ${Math.round(long[7])} мс против ${Math.round(long[0])} мс `
    + 'в мелькании — замедление начинается слишком поздно');

  // Мелькание при этом остаётся мельканием: голова идёт ровно, без разнобоя.
  const head = long.slice(0, 5);
  assert(Math.max(...head) - Math.min(...head) < 1,
    `4d: голова ${head.map(v => Math.round(v)).join(' ')} мс идёт неровно — мелькание должно быть ровным`);
  assert(head[0] < 100,
    `4e: шаг мелькания ${Math.round(head[0])} мс — это уже не мелькание`);

  // Общая длительность не изменилась: ритм перераспределяет время, а не добавляет его.
  const total = long.reduce((sum, v) => sum + v, 0);
  const settleShare = travelMath.getFieldLandingSettleShare(1800);
  assert(Math.abs(total + settleShare * 1800 - 1800) < 1,
    `4f: шаги плюс приземление дают ${Math.round(total + settleShare * 1800)} мс вместо 1800 — `
    + 'ход стал длиннее или короче, а должен был только перераспределиться');

  // Короткий ход берёт хвост с конца и остаётся осмысленным.
  const two = stepDurations(2, 360);
  assert(two[1] / two[0] > 1.25,
    `4g: на двух шагах ${two.map(v => Math.round(v)).join(' → ')} мс — второй шаг обязан быть длиннее`);
}

// === 4bis. Приземление: лента ОСТАНАВЛИВАЕТСЯ, а не затухает ===
//
// У любой кривой easeOut скорость на финише стремится к нулю — приезда не видно. Здесь
// последний шаг проходится с живой скоростью, лента по инерции проскакивает на волосок
// и возвращается точно в центр.
{
  const SLOT = 58;
  const probe = (stepCount, totalDurationMs) => {
    const settleShare = travelMath.getFieldLandingSettleShare(totalDurationMs);
    const times = travelMath.buildFieldStepSchedule(stepCount, settleShare);
    const at = (p) => travelMath.easeFieldRibbonTravel(p, times, settleShare);
    const arriveAt = times[stepCount];
    let overshoot = 0;
    let backwards = 0;
    let prev = 0;
    const frames = Math.max(4, Math.round(totalDurationMs / 16.7));
    for(let f = 0; f <= frames; f += 1){
      const v = at(f / frames);
      if(v > stepCount) overshoot = Math.max(overshoot, v - stepCount);
      // Назад лента отыгрывает ТОЛЬКО на приземлении, возвращаясь из отдачи.
      if(v < prev - 1e-9 && f / frames < arriveAt) backwards += 1;
      prev = v;
    }
    // Скорость на подходе к центру: сколько остаётся пройти за 40 мс до приезда.
    const lead = at(arriveAt) - at(Math.max(0, arriveAt - 40 / totalDurationMs));

    // Отдача — это пружина, а не отскок: уходит в неё лента с полной скоростью, а
    // возвращается заметно мягче и в самом конце уже почти стоит.
    const settle = 1 - arriveAt;
    const eps = settle / 4000;
    const speedAt = (p) => (at(p + eps) - at(p - eps)) / (2 * eps);
    const enter = speedAt(arriveAt + eps * 2);
    let back = 0;
    for(let i = 1; i < 200; i += 1){
      back = Math.max(back, -speedAt(arriveAt + settle * (i / 200)));
    }
    return { overshoot, backwards, lead, end: at(1), arriveAt, enter, back };
  };

  for(const [stepCount, totalDurationMs] of [[1, 180], [2, 360], [5, 900], [10, 1800]]){
    const r = probe(stepCount, totalDurationMs);
    assert(r.backwards === 0,
      `4bis: при ${stepCount} шагах лента отыгрывает назад до приезда — ход обязан быть монотонным`);
    assert(Math.abs(r.end - stepCount) < 1e-9,
      `4bis-b: при ${stepCount} шагах ход заканчивается на ${r.end}, а обязан ровно на ${stepCount} — `
      + 'иначе подпись встанет мимо центра');
    assert(r.overshoot * SLOT > 0.3 && r.overshoot * SLOT < 4,
      `4bis-c: отдача ${(r.overshoot * SLOT).toFixed(2)} px при ${stepCount} шагах — `
      + 'должна быть заметна глазу, но не превращаться в качание');
    // Вот это и отличает приезд от вползания: за последние 40 мс лента проходит
    // осязаемое расстояние, а не микрон.
    assert(r.lead * SLOT > 2,
      `4bis-d: за 40 мс до остановки лента проходит ${(r.lead * SLOT).toFixed(2)} px при `
      + `${stepCount} шагах — это затухание, последняя карта не «приедет», а вползёт`);
    assert(r.back < r.enter * 0.5,
      `4bis-e: из отдачи лента возвращается со скоростью ${r.back.toFixed(1)} против `
      + `${r.enter.toFixed(1)} на входе (${stepCount} шагов) — это отскок с ударом в конце, `
      + 'а не мягкая посадка');
  }

  // На СТЫКАХ шагов лента тормозить не должна вовсе. Ноль скорости в этих точках — это
  // ровно та пошаговая дёрганость, ради устранения которой писалась первая правка:
  // расписание с ней осталось бы прежним, а ход снова стал бы рваным.
  {
    const settleShare = travelMath.getFieldLandingSettleShare(1800);
    const times = travelMath.buildFieldStepSchedule(10, settleShare);
    const eps = 1e-4;
    for(let k = 1; k < 10; k += 1){
      const speed = (travelMath.easeFieldRibbonTravel(times[k] + eps, times, settleShare)
        - travelMath.easeFieldRibbonTravel(times[k] - eps, times, settleShare)) / (2 * eps);
      const slower = Math.min(1 / (times[k] - times[k - 1]), 1 / (times[k + 1] - times[k]));
      assert(speed > slower * 0.9,
        `4bis-e: на стыке шага ${k} скорость ${speed.toFixed(1)} против ${slower.toFixed(1)} — `
        + 'лента притормаживает на каждой подписи, это и есть рывки по шагу');
    }
  }
}

// === 5. Служебная обвязка не потеряна ===
//
// У этой ленты, в отличие от двух других, есть слой сессий и токенов. Он проверяется
// отдельно: правка движения не должна была его выключить.
{
  assert(/if\(FIELD_EXCLUSIVE_MODE && !token\) return;/.test(code),
    '5: проверка исключительного доступа осталась на входе');
  assert(/assertFieldControlToken\(token, 'animateFieldLabelChange'\)/.test(code),
    '5b: токен по-прежнему проверяется');
  assert(/if\(animationToken !== fieldAnimationToken\) return;/.test(code),
    '5c: отмена анимации по устаревшему токену осталась');
  assert(/markFieldAnimationStart\(animationToken\)/.test(code)
    && /markFieldAnimationEnd\(animationToken\)/.test(code),
    '5d: отметки начала и конца анимации остались');
  assert(/finalizeFieldExclusiveSession\(token\)/.test(code),
    '5e: сессия закрывается в конце');
  assert(/setFieldSelectorStylesAuthorized\(token, track,/.test(code),
    '5f: стили ставятся только через авторизованный доступ');
}

// === 6. Отладочный вывод не сыплется в консоль у игрока ===
//
// Раньше строка «[map selector] X -> Y» печаталась на КАЖДУЮ прокрутку, без всякого флага.
//
// Считаем не «есть ли где-то флаг», а что КАЖДЫЙ вывод стоит прямо под ним. Первая
// редакция проверки этого не ловила: один незакрытый вывод прикрывался вторым, который
// остался под флагом (поймано мутацией).
{
  const logs = [...code.matchAll(/console\.log\(/g)].length;
  const guarded = [...code.matchAll(/if\(debugMotion\)\s*\{\s*console\.log\(/g)].length;
  assert(logs === guarded,
    `6: выводов в консоль ${logs}, а под флагом отладки только ${guarded} — `
    + 'незакрытый вывод печатается у игрока на каждую прокрутку');
}

console.log('smoke-map-ribbon-continuous: OK');
