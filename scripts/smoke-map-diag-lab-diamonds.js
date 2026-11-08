#!/usr/bin/env node
'use strict';

// Smoke test: на карте diag_lab внутри поля стоят только ромбы.
//
// Вся карта — лабиринт из ромбов (brick_6_45), выстроенных в диагональные шевроны, плюс
// обычная рамка по краям. Один прямой кирпич затесался внутрь, в (20, 220), вплотную к
// рамочному, — и читался на экране как «сдвоенная стена»: на обложке это сразу бросилось
// в глаза. Автор говорит: там всегда был ромб.
//
// Что это был промах, а не замысел, видно по трём вещам: он был ЕДИНСТВЕННЫМ прямым
// кирпичом внутри поля среди тридцати четырёх ромбов, в зеркальной точке (320, 180..260)
// пусто, и ни с одним соседом он не складывался — вокруг только рамка и ромбы на
// (80, 160) и (80, 280).
//
// Проверка сторожит класс ошибки, а не одну точку: прямой кирпич внутри этого поля
// означает, что в лабиринт из ромбов опять уронили кирпич из рамки.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Размеры спрайтов берём из самой игры: правило «ромб влезает» должно считаться по тем
// же числам, по которым игра его рисует.
function readConstValue(source, name, context){
  const signature = `const ${name} = `;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Не найдено объявление ${name}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth !== 0) continue;
    const end = source.indexOf(';', i);
    if(end === -1) break;
    return vm.runInContext(`(${source.slice(start + signature.length, end)})`, context);
  }
  throw new Error(`Не найден конец объявления ${name}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const context = vm.createContext({ Object });
const WORLD = readConstValue(source, 'WORLD', context);
const РАЗМЕРЫ = readConstValue(source, 'MAP_SPRITE_BASE_SIZES', context);
const РОМБ = 'brick_6_45';
const РАМКА = 'brick_1_default';

const путь = 'ui_gamescreen/maps/maps_9_august/gs_maps_hard_diag_lab.json';
const карта = JSON.parse(fs.readFileSync(путь, 'utf8')).map;
const спрайты = Array.isArray(карта?.sprites) ? карта.sprites : [];
assert(карта?.id === 'diag_lab', `1: ${путь} должен держать карту diag_lab, получено ${карта?.id}`);

const ромбы = спрайты.filter((с) => с.spriteName === РОМБ);
assert(ромбы.length >= 30,
  `1b: diag_lab — лабиринт из ромбов, их тут всего ${ромбы.length}`);

// === 2. Внутри поля прямых кирпичей нет ===
//
// Рамка стоит по самому краю: столбцы на x = 0 и 340, строки на y = 0 и 620 — то есть
// отступ 0 или «ширина поля минус толщина кирпича» (20). Всё, что из прямых кирпичей
// оказалось не там, — тот самый случай.
const ТОЛЩИНА = РАЗМЕРЫ[РАМКА].width;
const наКраю = (с) => с.x === 0 || с.x === WORLD.width - ТОЛЩИНА
  || с.y === 0 || с.y === WORLD.height - ТОЛЩИНА;
const внутри = спрайты.filter((с) => с.spriteName === РАМКА && !наКраю(с));
assert(внутри.length === 0,
  `2: в лабиринт из ромбов попали прямые кирпичи из рамки: `
  + `${JSON.stringify(внутри.map((с) => [с.x, с.y]))} — на экране это читается сдвоенной стеной`);

// === 3. В той самой точке — ромб ===
assert(ромбы.some((с) => с.x === 20 && с.y === 220),
  '3: в (20, 220) больше не ромб — именно туда и уронили кирпич');

// === 4. Он влезает: ни на кого не налезает и не торчит за поле ===
//
// Ромб вдвое шире прямого кирпича (40 против 20), поэтому замена — не только про вид:
// встань он на занятое место, игрок получил бы стену, которой не видно.
{
  const короб = (с) => {
    const { width, height } = РАЗМЕРЫ[с.spriteName];
    return { x0: с.x, y0: с.y, x1: с.x + width, y1: с.y + height };
  };
  const наш = спрайты.find((с) => с.x === 20 && с.y === 220);
  const к = короб(наш);
  assert(к.x1 <= WORLD.width && к.y1 <= WORLD.height,
    `4: ромб (20, 220) торчит за поле ${WORLD.width}x${WORLD.height}`);
  const налезает = спрайты.filter((с) => {
    if(с === наш) return false;
    const д = короб(с);
    return д.x0 < к.x1 && к.x0 < д.x1 && д.y0 < к.y1 && к.y0 < д.y1;
  });
  assert(налезает.length === 0,
    `4b: ромб (20, 220) налезает на ${JSON.stringify(налезает.map((с) => [с.spriteName, с.x, с.y]))}`);
}

console.log(`smoke-map-diag-lab-diamonds: OK (${ромбы.length} ромбов, прямых внутри поля нет)`);
