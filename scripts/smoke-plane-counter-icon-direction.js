#!/usr/bin/env node
'use strict';

// Smoke test: самолётик в счётчике смотрит туда же, куда летает его сторона.
//
// Значок в полосе счётчика — это тот же самолёт, что и на поле, только маленький. Смотреть
// он обязан так же: ВДОЛЬ поля — туда, куда эта сторона летит, а ПОПЕРЁК — в сторону поля.
// Ровно вдоль ставить нельзя: так значок сливается с самолётами на поле.
//
// Замер положений в браузере (центры на экране, поле в 600x480):
//
//   портрет   полосы счётчиков слева от поля, обе: x=356
//             обычный край  зелёный ниже (y=671) и летит вверх, синий выше и летит вниз
//             свой край     наоборот
//   горизонт  полосы над полем, обе: y=176
//             обычный край  зелёный слева (x=361) и летит вправо, синий справа и летит влево
//             свой край     наоборот
//
// Отсюда и правило, и оно одно на все четыре сочетания.
//
// Раньше в портрете значок брался из готовой картинки, где самолёт УЖЕ повёрнут по
// диагонали, а тень запечена внутрь. Пока сторона была прибита намертво, этого хватало,
// хотя направление и там было чужое: зелёный смотрел вверх-влево, то есть от поля. С
// выбором края повернуть такую картинку нельзя — тень поедет вслед и станет светить снизу.
// Поэтому значок теперь собирается из полевого спрайта в ОБЕИХ ориентациях: он нарисован
// носом вверх и без тени, тень рисуется отдельно.

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

// Стенд: настоящая таблица углов и настоящий выбор угла по цвету и краю.
function углы(flipped){
  const sandbox = { Math, isBoardFlipped: () => flipped };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const COUNTER_PLANE_FIELD_SPRITE_ROTATION = Object\.freeze\(\{[\s\S]*?\}\);/)[0],
    extractFn(source, 'getCounterPlaneRotation'),
  ].join('\n'), sandbox);
  return { green: sandbox.getCounterPlaneRotation('green'), blue: sandbox.getCounterPlaneRotation('blue') };
}

// Куда смотрит нос на ЭКРАНЕ при таком повороте холста.
//
// Полевой спрайт нарисован носом вверх, значит поворот холста на r ставит нос в (sin r,
// -cos r) — ровно так же холст поворачивает самолёты на поле. В горизонтали весь кадр
// повёрнут ещё на +90° (styles.css: html.is-board-landscape #uiFrame), а поворот на +90°
// переводит (x, y) в (-y, x).
function носНаЭкране(r, landscape){
  const v = { x: Math.sin(r), y: -Math.cos(r) };
  return landscape ? { x: -v.y, y: v.x } : v;
}

// === 1. ГЛАВНОЕ: нос смотрит вдоль полёта своей стороны и в сторону поля ===
{
  for(const landscape of [false, true]){
    for(const flipped of [false, true]){
      const таблица = углы(flipped);
      for(const color of ['green', 'blue']){
        // Куда эта сторона летит на экране. Зелёный на обычном крае идёт от своего края к
        // чужому: в портрете вверх, в горизонтали вправо. Свой край снизу меняет знак.
        const свой = (color === 'green') !== flipped;
        const вдоль = landscape
          ? { x: свой ? 1 : -1, y: 0 }
          : { x: 0, y: свой ? -1 : 1 };
        // Куда от полосы счётчика лежит поле.
        const кПолю = landscape ? { x: 0, y: 1 } : { x: 1, y: 0 };

        const надо = { x: вдоль.x + кПолю.x, y: вдоль.y + кПолю.y };
        const длина = Math.hypot(надо.x, надо.y);
        const есть = носНаЭкране(таблица[color], landscape);
        const скалярно = (есть.x * надо.x + есть.y * надо.y) / длина;

        assert(скалярно > 0.999,
          `1: горизонт=${landscape}, свой край снизу=${flipped}, ${color}: значок смотрит в `
          + `(${есть.x.toFixed(2)}, ${есть.y.toFixed(2)}), а обязан в `
          + `(${(надо.x / длина).toFixed(2)}, ${(надо.y / длина).toFixed(2)}) — вдоль полёта `
          + 'своей стороны и в сторону поля');
      }
    }
  }

  // И по диагонали, а не вдоль: иначе значок сливается с самолётами на поле.
  for(const flipped of [false, true]){
    const таблица = углы(flipped);
    for(const color of ['green', 'blue']){
      const доля = Math.abs(Math.sin(таблица[color]));
      assert(доля > 0.3 && доля < 0.95,
        `1b: ${color} при крае=${flipped} стоит почти вдоль поля — так значок сливается с `
        + 'самолётами на поле');
    }
  }
}

// === 2. Свой край снизу меняет цвета местами ===
//
// Полосы счётчиков меняются краями вместе с половинами поля, и значок обязан поехать за
// своей стороной.
{
  const прямо = углы(false);
  const наоборот = углы(true);
  assert(Math.abs(прямо.green - наоборот.blue) < 1e-9
    && Math.abs(прямо.blue - наоборот.green) < 1e-9,
    '2: при своём крае снизу углы значков не поменялись местами');
  assert(Math.abs(прямо.green - прямо.blue) > 1e-9,
    '2b: у сторон одинаковый угол — тогда и менять нечего, проверка устарела');
}

// === 3. Значок собирается из полевого спрайта в ОБЕИХ ориентациях ===
{
  const тело = extractFn(source, 'drawPlaneCounterIcon');
  assert(/const fieldSprite = getCounterPlaneFieldSprite\(color\);/.test(тело),
    '3: полевой спрайт снова берут только в горизонтали — в портрете значок вернётся к '
    + 'готовой картинке с запечённой тенью, которую нельзя повернуть');
  assert(/const rotation = getCounterPlaneRotation\(color\);/.test(тело),
    '3b: угол значка берётся мимо общего выбора по цвету и краю');
}

// === 4. Тень падает влево-вниз ЭКРАНА и от края не зависит ===
//
// Свет во всей графике идёт сверху справа, и переворот доски его не двигает: полоса
// счётчика живёт в экранных координатах, а не на поле.
{
  const тело = extractFn(source, 'drawPlaneCounterIcon');
  assert(/const landscape = isBoardLandscapeActive\(\);/.test(тело),
    '4: смещение тени перестало зависеть от ориентации');
  assert(/\? COUNTER_PLANE_SHADOW_SCREEN_OFFSET\.y\s*\n\s*: COUNTER_PLANE_SHADOW_SCREEN_OFFSET\.x\)/.test(тело)
    && /\? -COUNTER_PLANE_SHADOW_SCREEN_OFFSET\.x\s*\n\s*: COUNTER_PLANE_SHADOW_SCREEN_OFFSET\.y\)/.test(тело),
    '4b: экранный сдвиг тени переводится в координаты кадра неверно');

  const сдвиг = тело.slice(тело.indexOf('const shadowFrameX'), тело.indexOf('const pairX'));
  assert(!/isBoardFlipped/.test(сдвиг),
    '4c: тень поехала за краем поля — свет станет падать снизу');

  // Сдвиг живёт СНАРУЖИ поворота спрайта: самолёт разворачивается, тень остаётся на месте.
  assert(/ctx2d\.translate\(pairX \+ shadowFrameX, pairY \+ shadowFrameY\);\s*\n\s*ctx2d\.rotate\(rotation\);/
    .test(тело),
    '4d: тень сдвигают внутри поворота — она поедет вслед за носом');
}

console.log('smoke-plane-counter-icon-direction: OK');
