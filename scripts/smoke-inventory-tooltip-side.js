#!/usr/bin/env node
'use strict';

// Smoke test: подсказка инвентаря стоит у СВОЕЙ полосы, а не у той, где её цвет был бы
// без переворота доски.
//
// Полосы инвентаря меняются краями вместе с половинами поля: свой край всегда снизу.
// Сами полосы это учитывают — место берут по getHudEdgeSeat(color). А подсказка брала по
// цвету, и на перевёрнутой доске получалось:
//
//   портрет      подсказка нижнего игрока выезжала СВЕРХУ, в чужой половине;
//   горизонталь  вынос считался в сторону прежнего края, и плашка уходила ЗА грань кадра
//                (замер: след 785..951 при кадре высотой 800, и -151..15 у второго).
//
// Ошибка эта тихая: без переворота всё сходится, потому что цвет и край совпадают.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');

const КАДР = { w: 460, h: 800 };

function число(имя){
  const m = new RegExp(`${имя}\\s*=\\s*([-\\d./ *]+);`).exec(script);
  assert(m, `не найдено ${имя} в script.js`);
  // eslint-disable-next-line no-new-func
  return Function(`return (${m[1]});`)();
}

function коробкаПолосы(край){
  const m = new RegExp(`${край}: Object\\.freeze\\(\\{ x: (\\d+), y: (\\d+), w: (\\d+), h: (\\d+) \\}\\)`)
    .exec(script);
  assert(m, `не найдена полоса инвентаря ${край}`);
  return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
}

const ПОЛОСЫ = { blue: коробкаПолосы('blue'), green: коробкаПолосы('green') };

// === 1. Портрет: таблица мест подсказки описывает КРАЯ, и берут её по краю ===
//
// Числа в ней стоят рядом с числами полос: 22 против 19 сверху и 736 против 733 снизу.
// Значит ключи в обеих таблицах означают одно и то же — край, а не цвет.
{
  const таблица = /INVENTORY_TOOLTIP_FIXED_RECT = Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(script);
  assert(таблица, '1: не найдена таблица мест подсказки');
  for(const край of ['blue', 'green']){
    const m = new RegExp(`${край}: Object\\.freeze\\(\\{\\s*y: (\\d+)`).exec(таблица[1]);
    assert(m, `1: в таблице подсказки нет края ${край}`);
    const y = Number(m[1]);
    const рядом = Math.abs(y - ПОЛОСЫ[край].y);
    assert(рядом <= 8,
      `1b: подсказка края ${край} стоит на ${y}, а полоса инвентаря — на ${ПОЛОСЫ[край].y}: `
      + 'они разъехались, и ключи в таблицах больше не про один и тот же край');
  }

  assert(/INVENTORY_TOOLTIP_FIXED_RECT\[getHudEdgeSeat\(slotColor\)\]/.test(script),
    '1c: место подсказки в портрете снова берётся по цвету, а не по краю — на '
    + 'перевёрнутой доске она выедет в чужой половине');
}

// === 2. Горизонталь: вынос считается от своей полосы и не уходит за кадр ===
//
// Функция вынимается и гоняется на заглушке: настоящая нужна только тем, что решает, в
// какую сторону от полосы отступать. Геометрия слота тут не проверяется — она своя и
// проверяется глазами, — поэтому слот взят один и простой.
{
  const кусок = /function getInventoryTooltipLandscapeRect\([\s\S]*?\n\}/.exec(script);
  assert(кусок, '2: не найдена раскладка подсказки для горизонтали');

  const ШИРИНА = 166, ВЫСОТА = 48;
  let край = 'blue';
  const песочница = {
    isBoardLandscapeActive: () => true,
    getHudEdgeSeat: () => край,
    INVENTORY_UI_CONFIG: {
      containers: ПОЛОСЫ,
      slotOrder: ['crosshair'],
      slots: { crosshair: { frame: { x: 0, y: 0, w: 55, h: 55 } } }
    },
    INVENTORY_LANDSCAPE_SCALE: число('INVENTORY_LANDSCAPE_SCALE'),
    INVENTORY_TOOLTIP_LANDSCAPE_GAP_PX: число('INVENTORY_TOOLTIP_LANDSCAPE_GAP_PX'),
    INVENTORY_TOOLTIP_LANDSCAPE_EDGE_PAD_PX: число('INVENTORY_TOOLTIP_LANDSCAPE_EDGE_PAD_PX'),
    FRAME_BASE_WIDTH: КАДР.w,
    Math
  };
  // Сдвиги полос — по краям, как и всё остальное здесь.
  const сдвиги = /INVENTORY_LANDSCAPE_SHIFT_PX = Object\.freeze\(\{ blue: (-?\d+), green: (-?\d+) \}\)/
    .exec(script);
  assert(сдвиги, '2b: не найдены сдвиги полос в горизонтали');
  песочница.INVENTORY_LANDSCAPE_SHIFT_PX = { blue: Number(сдвиги[1]), green: Number(сдвиги[2]) };
  песочница.globalThis = песочница;
  vm.createContext(песочница);
  vm.runInContext(`${кусок[0]}\nglobalThis.__место = getInventoryTooltipLandscapeRect;`, песочница);
  const место = песочница.__место;

  for(const цвет of ['blue', 'green']){
    for(const свой of ['blue', 'green']){
      // Тот самый случай: цвет один, а край — какой достался после переворота.
      край = свой;
      const r = место(цвет, 0, ШИРИНА, ВЫСОТА);
      assert(r, `2c: подсказка ${цвет} на краю ${свой} не получила места`);

      // Плашка развёрнута на -90° вокруг центра: по осям кадра габариты меняются местами.
      const cx = r.left + ШИРИНА / 2, cy = r.top + ВЫСОТА / 2;
      const след = {
        x0: cx - ВЫСОТА / 2, x1: cx + ВЫСОТА / 2,
        y0: cy - ШИРИНА / 2, y1: cy + ШИРИНА / 2
      };
      assert(след.x0 >= 0 && след.y0 >= 0 && след.x1 <= КАДР.w && след.y1 <= КАДР.h,
        `2d: на краю ${свой} подсказка ушла за кадр: след ${JSON.stringify(след)} `
        + `при кадре ${КАДР.w}x${КАДР.h}`);

      // И сторона: от своей полосы подсказка отступает В ПОЛЕ, а не наружу.
      const полоса = ПОЛОСЫ[свой];
      const вПоле = свой === 'blue' ? след.y0 >= полоса.y : след.y1 <= полоса.y + полоса.h;
      assert(вПоле,
        `2e: на краю ${свой} подсказка вынесена не в сторону поля: след по y `
        + `${след.y0}..${след.y1}, полоса ${полоса.y}..${полоса.y + полоса.h}`);
    }
  }
}

console.log('smoke-inventory-tooltip-side: OK');
