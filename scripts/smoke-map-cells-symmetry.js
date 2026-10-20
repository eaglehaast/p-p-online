#!/usr/bin/env node
'use strict';

// Smoke test: карта «cells» — ромбовая решётка, одинаковая у синей и зелёной базы.
//
// На карте стоял лишний ромб: brick_6_45 в точке (160, 60), прямо у базы синего —
// у гнезда. Зеркальной пары (160, 540) у зелёного не было, и половины поля
// получались разными: у синего ромб перекрывал подход к гнезду, у зелёного нет.
// Ромб убран, в решётке осталось 16 штук, и все они теперь разбиваются на пары.
//
// Проверяется именно решётка препятствий, а не рамка: кирпичи рамки
// (brick_1_default, 20x40) расставляет генератор рамки, и его координаты зеркалу не
// подчиняются — замерено, 18 кирпичей из 44 без пары, и ровно столько же на всех
// сорока картах с такой же рамкой. Это общая мелочь рамки, а не перекос этой карты.
//
// Геометрия берётся из самой игры (WORLD и MAP_SPRITE_BASE_SIZES из script.js), чтобы
// проверка не разъехалась с полем, если размеры поля или спрайта когда-нибудь поменяют.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Прочитать значение объявления `const ИМЯ = {...};` из script.js. Объект может быть
// завёрнут в Object.freeze(...), поэтому после закрывающей фигурной скобки добираем
// хвост до `;`, а потом считаем выражение целиком.
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

assert(Number.isFinite(WORLD?.width) && Number.isFinite(WORLD?.height),
  `1: из script.js должны читаться размеры поля, получено ${JSON.stringify(WORLD)}`);
assert(РАЗМЕРЫ?.[РОМБ]?.width > 0 && РАЗМЕРЫ[РОМБ].height > 0,
  `2: из script.js должен читаться размер ромба, получено ${JSON.stringify(РАЗМЕРЫ?.[РОМБ])}`);

const путь = 'ui_gamescreen/maps/maps_9_august/gs_maps_easy_cells.json';
const карта = JSON.parse(fs.readFileSync(путь, 'utf8')).map;
const спрайты = Array.isArray(карта?.sprites) ? карта.sprites : [];
assert(карта?.id === 'cells', `3: ${путь} должен держать карту cells, получено ${карта?.id}`);

function размер(спрайт){
  const база = РАЗМЕРЫ[спрайт.spriteName];
  assert(база, `4: у спрайта ${спрайт.spriteName} нет известного размера`);
  return база;
}

// x, y спрайта — левый верхний угол, поэтому зеркало считается от дальнего края.
const ключ = (спрайт) => `${спрайт.spriteName}@${спрайт.x},${спрайт.y}`;
const переворот = (спрайт) => {           // поворот поля на 180°: базы меняются местами
  const { width, height } = размер(спрайт);
  return `${спрайт.spriteName}@${WORLD.width - width - спрайт.x},${WORLD.height - height - спрайт.y}`;
};
const отражение = (спрайт) => {           // зеркало поперёк поля: половина к половине
  const { height } = размер(спрайт);
  return `${спрайт.spriteName}@${спрайт.x},${WORLD.height - height - спрайт.y}`;
};

const препятствия = спрайты.filter((спрайт) => спрайт.spriteName !== РАМКА);
const стоят = new Set(препятствия.map(ключ));

assert(препятствия.length >= 8 && препятствия.every((с) => с.spriteName === РОМБ),
  `5: решётка cells — это ромбы, их должно быть много; получено ${препятствия.length} штук `
  + `типов ${JSON.stringify([...new Set(препятствия.map((с) => с.spriteName))])}`);

// Главное: лишнего ромба у синей базы больше нет.
assert(!стоят.has(`${РОМБ}@160,60`),
  '6: ромб (160, 60) у базы синего — тот самый лишний, его зеркальной пары (160, 540) на карте нет');

const безПарыПоворот = препятствия.filter((с) => !стоят.has(переворот(с)));
assert(безПарыПоворот.length === 0,
  `7: при повороте поля на 180° у каждого ромба должна найтись пара; без пары остались `
  + `${JSON.stringify(безПарыПоворот.map(ключ))}`);

const безПарыЗеркало = препятствия.filter((с) => !стоят.has(отражение(с)));
assert(безПарыЗеркало.length === 0,
  `8: половины поля должны читаться одинаково; без пары поперёк поля остались `
  + `${JSON.stringify(безПарыЗеркало.map(ключ))}`);

// Зеркало имеет смысл только если спрайты вообще лежат внутри поля: вылези ромб за край,
// пара считалась бы от неверной оси и проверка выше молча перестала бы что-то значить.
const заКраем = препятствия.filter((с) => {
  const { width, height } = размер(с);
  return с.x < 0 || с.y < 0 || с.x + width > WORLD.width || с.y + height > WORLD.height;
});
assert(заКраем.length === 0,
  `9: ромбы должны лежать внутри поля ${WORLD.width}x${WORLD.height}; за краем ${JSON.stringify(заКраем.map(ключ))}`);

const уСинего = препятствия.filter((с) => с.y + размер(с).height / 2 < WORLD.height / 2).length;
const уЗелёного = препятствия.filter((с) => с.y + размер(с).height / 2 > WORLD.height / 2).length;
assert(уСинего === уЗелёного,
  `10: у баз должно стоять поровну ромбов; у синего ${уСинего}, у зелёного ${уЗелёного}`);

console.log(`Smoke test passed: карта cells симметрична — ${препятствия.length} ромбов, `
  + `по ${уСинего} у каждой базы, лишнего ромба у гнезда синего нет.`);
