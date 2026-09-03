#!/usr/bin/env node
'use strict';

// Smoke test: щипковый зум — одна система на всю игру.
//
// Было две, полные копии: в script.js и в settings.js. Обе вешали обработчики
// touch/wheel/gesture на window с capture, обе писали transform в ОДИН И ТОТ ЖЕ
// #uiFrameInner (settings.js его создаёт, script.js находит готовый), и у каждой было своё
// состояние.
//
// Мешали они молча и по-настоящему. settings.js грузится раньше, значит его слушатели
// стояли первыми, а onTouchMove звал stopImmediatePropagation() — обработчики script.js не
// выполнялись вовсе. Отсюда два последствия, оба измеренные:
//
//   1. Игра не знала о зуме. При видимом scale(2.5) getUiFrameScales() докладывал
//      pinchScale: 1, потому что pinchScale в script.js так и оставался единицей.
//      toDesignCoords делила на один только --ui-scale, и координаты указателя при зуме
//      уезжали на весь множитель.
//
//   2. Панорамирование при зуме не работало вовсе. Копия из settings.js его не умеет, а
//      та, что умеет, до событий не доходила. Замер: провёл пальцем при зуме 3.5× —
//      сдвиг 0 px, и зум схлопнулся в 1. После сведения — сдвиг 108 px, зум держится.
//
// Копия из settings.js убрана. Осталась одна система, в script.js.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const settings = fs.readFileSync('settings.js', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

// === 1. ГЛАВНОЕ: settings.js больше не заводит свой зум ===
//
// Проверяются именно те части, из-за которых копии дрались: состояние, обработчики и
// установка. Не «нет слова pinch», а нет второго владельца.
{
  const code = settings.replace(/\/\/.*$/gm, '');

  for(const decl of [
    'let pinchActive',
    'let pinchScale',
    'let pinchPanX',
    'let pinchPanY',
    'let pinchResetTimer',
  ]){
    assert(!code.includes(decl),
      `1: settings.js снова завёл своё состояние зума (${decl}). Два состояния на один `
      + '#uiFrameInner — это и была причина, по которой игра не видела масштаба');
  }

  for(const fn of [
    'installTouchPinchZoom',
    'installPinchExitOnGameplayInput',
    'applyPinchTransform',
    'resetPinchState',
    'schedulePinchReset',
  ]){
    assert(!new RegExp(`function ${fn}\\s*\\(`).test(code),
      `1b: settings.js снова объявляет ${fn} — система зума обязана быть одна, в script.js`);
  }

  // Слушатели жестов — то, чем копия перехватывала события у настоящей системы.
  for(const listener of ['gesturestart', 'gestureend', 'wheel', 'touchmove']){
    assert(!new RegExp(`addEventListener\\(\\s*['"]${listener}['"]`).test(code),
      `1c: settings.js снова слушает «${listener}» на уровне окна. Он грузится раньше, `
      + 'значит его обработчик встанет первым и снова перехватит событие у script.js');
  }

  assert(!/stopImmediatePropagation/.test(code),
    '1d: settings.js снова глушит распространение события — ровно так обработчики '
    + 'script.js и переставали выполняться');
}

// === 2. Система на месте в script.js ===
//
// Без этого пункт 1 прошёл бы и после того, как зум снесли целиком у обоих.
{
  for(const fn of [
    'installTouchPinchZoom',
    'installPinchExitOnGameplayInput',
    'applyPinchTransform',
    'resetPinchState',
    'getEffectivePinchScale',
    'getUiFrameScales',
  ]){
    assert(new RegExp(`^function ${fn}\\s*\\(`, 'm').test(script),
      `2: ${fn} обязана остаться в script.js — там теперь единственная система зума`);
  }
  assert(/^installTouchPinchZoom\(\);$/m.test(script),
    '2b: установка обработчиков щипка вызывается — без вызова система мертва');
  assert(/^installPinchExitOnGameplayInput\(\);$/m.test(script),
    '2c: выход из зума по нажатию тоже устанавливается');
  // Панорамирование — то, что не работало из-за перехвата. Оно живёт в onTouchEnd.
  assert(/panActive\s*=\s*true/.test(script),
    '2d: режим панорамы при зуме обязан остаться — из-за перехвата он не работал вовсе');
}

// === 3. settings.js учитывает масштаб щипка в координатах ===
//
// Трансформа висит на #uiFrameInner, а прямоугольник берётся у родителя #uiFrame — зум в
// него не входит. Делить надо на оба масштаба, иначе при зуме ползунки считают позицию
// пальца мимо на весь множитель.
{
  const toDesign = /function toDesignCoords\(clientX, clientY\) \{[\s\S]*?\n\}/.exec(settings);
  assert(toDesign, '3: toDesignCoords в settings.js не найдена');
  const body = toDesign[0];

  assert(/effectiveScale/.test(body),
    '3b: toDesignCoords обязана делить на effectiveScale (--ui-scale × масштаб щипка), '
    + 'а не на один только --ui-scale');
  assert(!/\/\s*uiScale\b/.test(body),
    '3c: деление на один uiScale вернулось — при зуме координаты снова уедут');

  assert(/function getSharedUiFrameScales\(\)/.test(settings),
    '3d: масштаб берётся у единственной системы через getSharedUiFrameScales');
  assert(/window\.getUiFrameScales/.test(settings),
    '3e: и спрашивается он именно у script.js, а не считается заново');
}

// === 4. Состояние зума не дублируется, а спрашивается ===
{
  const isActive = /function isPinchActive\(\) \{[\s\S]*?\n\}/.exec(settings);
  assert(isActive, '4: isPinchActive в settings.js не найдена');
  assert(/window\.PINCH_ACTIVE === true/.test(isActive[0]),
    '4b: settings.js обязан спрашивать состояние зума у общего флага, а не хранить своё');
}

console.log('smoke-single-pinch-zoom: OK');
