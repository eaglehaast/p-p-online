#!/usr/bin/env node
'use strict';

// Smoke test: полоса инвентаря стоит по своему КРАЮ, а не по своему цвету.
//
// Полосы меняются краями вместе с половинами поля. Геометрию полосы брали по краю, а
// горизонтальный сдвиг — по цвету, хотя сдвиг принадлежит МЕСТУ: он подгоняет полосу к
// своей грани поля и к своей морде. Пока сторона была прибита намертво, край и цвет
// совпадали, и разницы не было; при своём крае снизу цветной сдвиг тянул каждую полосу к
// чужому углу — прямо на морду.
//
// Замер в браузере, площадь пересечения полосы и морды в точках экрана:
//
//                          обычный край   свой край снизу
//   до правки, горизонт          0             6192 + 6192
//   после правки                 0                  0
//
// В портрете морды занимают половину кадра целиком, и габаритные рамки пересекаются всегда
// — но там полосы лежат поперёк, между мордами, и наезда не видно ни при каком крае.
//
// Проверено снимками: при своём крае снизу полоса кончается выше воробья, как и на обычном.

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

// Стенд: настоящие числа полос и сдвигов, настоящий выбор края и настоящая раскладка.
const containers = /containers: Object\.freeze\(\{\s*blue: Object\.freeze\(\{ x: (-?\d+), y: (-?\d+), w: (-?\d+), h: (-?\d+) \}\),\s*green: Object\.freeze\(\{ x: (-?\d+), y: (-?\d+), w: (-?\d+), h: (-?\d+) \}\),/
  .exec(source);
assert(containers, 'не найдены координаты полос инвентаря — проверка устарела');
const полосы = {
  blue: { x: +containers[1], y: +containers[2], w: +containers[3], h: +containers[4] },
  green: { x: +containers[5], y: +containers[6], w: +containers[7], h: +containers[8] },
};

function разложить(seat, landscape, color){
  const host = { style: {} };
  const sandbox = {
    boardViewSeat: seat,
    HTMLElement: Object,
    INVENTORY_UI_CONFIG: { containers: полосы },
    isBoardLandscapeActive: () => landscape,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const INVENTORY_LANDSCAPE_SHIFT_PX = Object\.freeze\(\{[^}]*\}\);/)[0],
    extractFn(source, 'getBoardViewSeat'),
    extractFn(source, 'isBoardFlipped'),
    extractFn(source, 'getHudEdgeSeat'),
    extractFn(source, 'applyInventoryContainerLayout'),
  ].join('\n'), sandbox);
  sandbox.applyInventoryContainerLayout(color, host);
  return { left: host.style.left, top: host.style.top, width: host.style.width };
}

// === 1. ГЛАВНОЕ: при смене края полосы просто меняются местами ===
//
// Мест всего два, и они выверены каждое под свой угол. Значит при любом крае на экране
// обязаны стоять ровно те же две полосы — меняется только, чья из них какая.
{
  for(const landscape of [false, true]){
    const обычныйСиний = разложить('green', landscape, 'blue');
    const обычныйЗелёный = разложить('green', landscape, 'green');
    const свойСиний = разложить('blue', landscape, 'blue');
    const свойЗелёный = разложить('blue', landscape, 'green');

    const где = (о) => `${о.left}/${о.top}`;
    assert(где(свойСиний) === где(обычныйЗелёный),
      `1: горизонт=${landscape}: при своём крае снизу синяя полоса встала в ${где(свойСиний)}, `
      + `а на этом месте была зелёная — ${где(обычныйЗелёный)}. Полоса уехала в чужой угол`);
    assert(где(свойЗелёный) === где(обычныйСиний),
      `1b: горизонт=${landscape}: зелёная полоса встала в ${где(свойЗелёный)} вместо `
      + `${где(обычныйСиний)}`);
    assert(где(обычныйСиний) !== где(обычныйЗелёный),
      '1c: обе полосы стоят в одном месте — проверка устарела');
  }
}

// === 2. На обычном крае не изменилось ничего ===
{
  const синий = разложить('green', true, 'blue');
  const зелёный = разложить('green', true, 'green');
  const сдвиг = /const INVENTORY_LANDSCAPE_SHIFT_PX = Object\.freeze\(\{ blue: (-?\d+), green: (-?\d+) \}\);/
    .exec(source);
  assert(сдвиг, '2: не найдены сдвиги полос — проверка устарела');
  assert(синий.left === `${полосы.blue.x + Number(сдвиг[1])}px` && синий.top === `${полосы.blue.y}px`,
    `2b: на обычном крае синяя полоса переехала в ${синий.left}/${синий.top} — изменилась `
    + 'игра, в которую уже играли');
  assert(зелёный.left === `${полосы.green.x + Number(сдвиг[2])}px` && зелёный.top === `${полосы.green.y}px`,
    `2c: на обычном крае зелёная полоса переехала в ${зелёный.left}/${зелёный.top}`);
}

// === 3. В портрете сдвига нет вовсе ===
//
// Он нужен только в горизонтали, где полосы упираются в грани поля.
{
  const п = разложить('green', false, 'blue');
  assert(п.left === `${полосы.blue.x}px`,
    `3: в портрете к полосе прибавился сдвиг (${п.left} вместо ${полосы.blue.x}px)`);
}

// === 4. Сдвиг берётся по краю и в раскладке, и в подсказке ===
//
// Подсказка считает центр слота по координатам полосы. Разойдясь с ней хоть в одном
// слагаемом, она уедет от предмета — а заметить это можно только наведясь мышью.
{
  for(const имя of ['applyInventoryContainerLayout', 'getInventoryTooltipLandscapeRect']){
    const тело = extractFn(source, имя);
    assert(/INVENTORY_LANDSCAPE_SHIFT_PX\[getHudEdgeSeat\(color\)\]/.test(тело),
      `4: ${имя} берёт сдвиг полосы по цвету, а не по краю`);
    assert(!/INVENTORY_LANDSCAPE_SHIFT_PX\[color\]/.test(тело),
      `4b: ${имя} где-то ещё берёт сдвиг по цвету`);
  }
  assert(/INVENTORY_UI_CONFIG\.containers\[getHudEdgeSeat\(color\)\]/.test(source),
    '4c: сама геометрия полосы перестала браться по краю');
}

// === 5. Смена края пересчитывает раскладку ===
//
// Раскладка стоит инлайновыми left/top: сама она не пересчитается, а край меняют кликом
// прямо в меню.
{
  const setter = extractFn(source, 'setBoardViewSeat');
  assert(/refreshInventoryContainerLayouts\(\)/.test(setter),
    '5: смена края не пересобирает полосы инвентаря — они останутся стоять по прежнему краю');
}

console.log('smoke-inventory-strip-follows-edge: OK');
