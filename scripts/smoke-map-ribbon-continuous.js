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


// easeOutBack — стрелочная константа, а не объявление функции: достаём отдельно.
// Объявленная через const внутри vm-контекста, она НЕ становится его свойством, поэтому
// при запуске её приходится явно класть в globalThis (та же ловушка уже ловила нас раньше).
function extractEaseOutBack(source){
  const start = source.indexOf('const easeOutBack = (t, s = 1.1) => {');
  if(start === -1) throw new Error('easeOutBack не найдена');
  const open = source.indexOf('{', source.indexOf('=>', start));
  let d = 0;
  for(let i = open; i < source.length; i += 1){
    if(source[i] === '{') d += 1;
    if(source[i] === '}'){ d -= 1; if(d === 0) return source.slice(start, i + 2); }
  }
  throw new Error('easeOutBack не закрыта');
}

const settings = fs.readFileSync('settings.js', 'utf8');
const animate = extractFn(settings, 'animateFieldLabelChange');
const code = animate.replace(/\/\/.*$/gm, '');

// === 1. ГЛАВНОЕ: один проход на всю дистанцию, а не цепочка шагов ===
{
  assert(/const totalDurationMs = stepDurationMs \* stepCount;/.test(code),
    '1: длительность считается на ВСЮ дистанцию — иначе это снова анимация по шагу');
  assert(/const travelled = stepCount \* easedProgress;/.test(code),
    '1b: пройденное расстояние — дробь от общего числа шагов, а не от одного');
  assert(/easeOutBack\(progress, overshootStrength\)/.test(code),
    '1c: сглаживание применяется к общему прогрессу');

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
  assert(/applyCrossing\(Math\.floor\(travelled\)\)/.test(code),
    '2: переклейка привязана к целой части пройденного пути');
  assert(/syncFieldLabelSlots\(currentIndex, token\)/.test(code),
    '2b: при переклейке подписи пересобираются');
  assert(/const offsetPx = stepOffsetPx \* \(travelled - crossedSteps\);/.test(code),
    '2c: смещение трека — дробный остаток; целые шаги уже отражены в подписях');
}

// === 3. Арифметика переклейки: индекс и смещение всегда согласованы ===
//
// Главная опасность такой ленты — рассинхрон: подписи ушли на шаг, а трек нет (или
// наоборот). Тогда лента дёрнется ровно на слот. Проверяем счётом.
{
  const context = { Math };
  vm.createContext(context);
  // Настоящий easeOutBack из settings.js.
  vm.runInContext(extractEaseOutBack(settings) + '\nglobalThis.easeOutBack = easeOutBack;', context);

  const SLOT = 58;
  const simulate = (stepCount) => {
    const overshootStrength = 0.9 * Math.min(1, 1 / stepCount);
    const stepOffsetPx = -SLOT;
    let crossed = 0;
    const visible = [];
    let prevVisible = 0;
    for(let frame = 0; frame <= 60; frame += 1){
      const progress = Math.min(1, frame / 60);
      const eased = context.easeOutBack(progress, overshootStrength);
      const travelled = stepCount * eased;
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

// === 4. Сглаживание: отдача есть на коротком ходе и почти нет на длинном ===
//
// Та же формула, что у дальности. Без этого «плавность» была бы просто линейной.
{
  const context = { Math };
  vm.createContext(context);
  vm.runInContext(extractEaseOutBack(settings) + '\nglobalThis.easeOutBack = easeOutBack;', context);

  const overshootOf = (stepCount) => {
    const strength = 0.9 * Math.min(1, 1 / stepCount);
    let maxOver = 0;
    for(let i = 0; i <= 100; i += 1){
      const v = context.easeOutBack(i / 100, strength);
      if(v > 1) maxOver = Math.max(maxOver, v - 1);
    }
    return maxOver;
  };

  assert(overshootOf(1) > 0.02,
    '4: на одном шаге отдача обязана быть заметной — так ведут себя дальность и точность');
  assert(overshootOf(10) < overshootOf(1) / 4,
    '4b: на длинной протяжке отдача почти исчезает, иначе лента будет качаться в конце');
  assert(/const overshootStrength = 0\.9 \* Math\.min\(1, 1 \/ stepCount\);/.test(settings),
    '4c: сила отдачи считается от ЧИСЛА ШАГОВ по той же формуле, что у дальности');
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
