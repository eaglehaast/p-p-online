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

// === 5. Панорама при зуме идёт ЗА пальцем, а не поперёк ===
//
// Сдвиг задаётся экранным движением пальца, а ложится на #uiFrameInner — то есть в оси
// КАДРА. В горизонтали кадр повёрнут на 90°, и сырой экранный сдвиг поворачивался вместе
// с ним: ведёшь вверх — картинка едет вправо. Заметить это можно только пальцем на
// повёрнутой доске, поэтому проверка считает саму формулу и стережёт все три места, где
// сдвиг берётся с экрана.
{
  const исходник = /function panFromScreenDelta\(dx, dy\) \{[\s\S]*?\n\}/.exec(script);
  assert(исходник, '5: panFromScreenDelta не найдена — перевод экранного сдвига в оси кадра '
    + 'обязан быть в одном месте, иначе его снова забудут в одном из трёх');

  let горизонталь = false;
  const fn = new Function('isBoardLandscapeActive',
    `${исходник[0]}\nreturn panFromScreenDelta;`)(() => горизонталь);

  // Кадр повёрнут на +90°: сдвиг кадра (u,v) виден на экране как (-v, u). Значит перевод
  // верен ровно тогда, когда обратно получается исходное движение пальца.
  const наЭкране = (с) => ({ x: -с.y, y: с.x });
  for(const [dx, dy] of [[7, 0], [0, -11], [-3, 5], [12, 9]]){
    горизонталь = false;
    const прямо = fn(dx, dy);
    assert(прямо.x === dx && прямо.y === dy,
      `5b: в портрете сдвиг (${dx}, ${dy}) перевёлся в (${прямо.x}, ${прямо.y}) — там кадр `
      + 'не повёрнут, и трогать сдвиг нечем');

    горизонталь = true;
    const боком = наЭкране(fn(dx, dy));
    assert(боком.x === dx && боком.y === dy,
      `5c: в горизонтали палец ведёт на (${dx}, ${dy}), а картинка едет на `
      + `(${боком.x}, ${боком.y}) — движение поперёк пальца`);
  }

  // И все три места, где сдвиг приходит с экрана, обязаны идти через перевод. Сырые
  // разности клиентских координат — это ровно то, что и было сломано.
  const мест = (script.match(/panFromScreenDelta\(/g) || []).length;
  assert(мест >= 4,
    `5d: panFromScreenDelta зовётся ${мест - 1} раз вместо трёх — колесо, щипок двумя `
    + 'пальцами и протяжка одним обязаны переводить сдвиг одинаково');
  for(const сырое of [
    /pinchPanX = pinchPanX - event\.deltaX/,
    /pinchPanX = touchPinchState\.startPanX \+ \(center\.x/,
    /pinchPanX = touchPinchState\.panBaseX \+ \(touch\.clientX/,
  ]){
    assert(!сырое.test(script),
      `5e: сдвиг снова берётся с экрана напрямую (${сырое.source}) — в горизонтали он `
      + 'поедет поперёк пальца');
  }
}

// === 6. Щипок растёт от пальцев, а не от чужого угла ===
//
// Проценты точки роста уходят на #uiFrameInner, а он живёт в осях КАДРА. Прямоугольник же
// берётся у #uiFrame, и в горизонтали это габаритная коробка ПОВЁРНУТОГО кадра, 800x460.
// Пока проценты считались прямо по ней, зум расходился мимо пальцев: замер на щипке вокруг
// (300, 300) показывал промах на 822 точки. Проверка гоняет перевод туда и обратно.
{
  const исходник = /function getTouchCenterInPercents\(touchA, touchB, rect\) \{[\s\S]*?\n\}/
    .exec(script);
  assert(исходник, '6: getTouchCenterInPercents в script.js не найдена');

  let горизонталь = false;
  const fn = new Function('isBoardLandscapeActive', 'clamp',
    `${исходник[0]}\nreturn getTouchCenterInPercents;`)(
    () => горизонталь,
    (v, min, max) => Math.min(max, Math.max(min, v)));

  // Кадр 460x800 повёрнут: доля вдоль оси u видна вдоль экранного Y, а доля вдоль v —
  // вдоль экранного X, но задом наперёд. Обратный ход обязан вернуть точку пальцев.
  const обратно = (о, rect) => (горизонталь
    ? { x: rect.left + (1 - о.originY / 100) * rect.width,
        y: rect.top + (о.originX / 100) * rect.height }
    : { x: rect.left + (о.originX / 100) * rect.width,
        y: rect.top + (о.originY / 100) * rect.height });

  for(const [гор, rect] of [[false, { left:60, top:0, width:460, height:800 }],
                            [true, { left:0, top:60, width:800, height:460 }]]){
    горизонталь = гор;
    for(const [x, y] of [[200, 300], [400, 120], [90, 400]]){
      const касание = (cx, cy) => ({ clientX: cx, clientY: cy });
      const о = fn(касание(x - 20, y), касание(x + 20, y), rect);
      const назад = обратно(о, rect);
      assert(Math.abs(назад.x - x) < 0.001 && Math.abs(назад.y - y) < 0.001,
        `6b: ${гор ? 'в горизонтали' : 'в портрете'} точка роста щипка (${x}, ${y}) `
        + `отдаётся как (${назад.x.toFixed(1)}, ${назад.y.toFixed(1)}) — зум поедет `
        + 'не от пальцев');
    }
  }
}

console.log('smoke-single-pinch-zoom: OK');
