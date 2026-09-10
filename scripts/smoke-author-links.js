#!/usr/bin/env node
'use strict';

// Smoke test: окошко со ссылками автора за подписью внизу меню.
//
// Крестика у окошка нет нарочно: закрывается оно нажатием мимо. Значит вся конструкция
// держится на затемнении — оно растянуто на кадр, ловит нажатие и заодно закрывает собой
// кнопки меню. Стоит ему уехать по слоям под кнопки, и получится худшее из возможного:
// окошко открыто, а нажатие проваливается в «Play» под ним.
//
// Второе, что тут легко потерять: строка без адреса. Пустой href — это ссылка в никуда,
// на вид рабочая. Она обязана не показываться вовсе.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

// === 1. Разметка: подпись — кнопка, окошко и затемнение спрятаны ===
{
  const кнопка = /<button id="menuSignature"[\s\S]*?<\/button>/.exec(html);
  assert(кнопка, '1: подпись перестала быть кнопкой — окошко открывать нечем');
  assert(/aria-expanded="false"/.test(кнопка[0]) && /aria-controls="authorLinks"/.test(кнопка[0]),
    '1b: у подписи нет aria-expanded / aria-controls — читалка не узнает, что за ней окошко');

  assert(/<div id="authorLinksBackdrop"[^>]*\shidden\b/.test(html),
    '1c: затемнение не спрятано в разметке — меню откроется уже затемнённым');
  assert(/<div id="authorLinks"[^>]*\shidden\b/.test(html),
    '1d: окошко не спрятано в разметке');

  // Ссылки уводят наружу, в новую вкладку. rel обязателен: без него открытая страница
  // получает доступ к окну игры через window.opener.
  const строки = html.match(/<a class="author-links__row"[\s\S]*?<\/a>/g) || [];
  assert(строки.length >= 1, '1e: в окошке не осталось ни одной строки');
  for(const строка of строки){
    assert(/target="_blank"/.test(строка), '1f: строка ссылок открывается не в новой вкладке');
    assert(/rel="noopener noreferrer"/.test(строка),
      '1g: у строки ссылок нет rel="noopener noreferrer" — чужая страница получит окно игры');
  }
}

// === 2. Слои: затемнение выше кнопок меню, окошко выше затемнения ===
{
  const слой = (селектор) => {
    const m = new RegExp(`${селектор}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(styles);
    assert(m, `2: не найден z-index у ${селектор}`);
    return Number(m[1]);
  };
  const кнопки = слой('#modeMenu button');
  const затемнение = слой('#menuLayer #modeMenu \\.author-links__backdrop');
  const окно = слой('#menuLayer #modeMenu \\.author-links');

  assert(затемнение > кнопки,
    `2b: затемнение (${затемнение}) лежит не выше кнопок меню (${кнопки}) — нажатие мимо `
    + 'окошка провалится в меню под ним');
  assert(окно > затемнение,
    `2c: окошко (${окно}) лежит не выше затемнения (${затемнение}) — само себя и закроет`);
}

// === 3. Зона касания подписи — не меньше 44 точек ===
//
// Рисунок подписи мелкий нарочно, и попасть по нему пальцем было бы нечем. Место нажатия
// растянуто невидимой накладкой, и вот её и проверяем: высота коробки плюс поля.
{
  const правило = /#menuLayer #modeMenu \.mode-menu__signature\s*\{([^}]*)\}/.exec(styles);
  assert(правило, '3: нет правила подписи');
  const высота = Number(/height:\s*(\d+)px/.exec(правило[1])[1]);

  const накладка = /#menuLayer #modeMenu \.mode-menu__signature::before\s*\{([^}]*)\}/.exec(styles);
  assert(накладка, '3b: у подписи нет накладки с зоной касания');
  const поле = (имя) => {
    const m = new RegExp(`${имя}:\\s*(-?\\d+)px`).exec(накладка[1]);
    return m ? -Number(m[1]) : 0;
  };
  const зона = высота + поле('top') + поле('bottom');
  assert(зона >= 44,
    `3c: по подписи можно нажать только в ${зона} точек по высоте — пальцем не попасть`);
}

// === 4. Поведение: открылось, закрылось, пустая строка не показана ===
//
// Обработчики живут в script.js, а не в разметке, поэтому кусок вынимается и гоняется на
// заглушке. Проверяются ровно те пути, которыми окошко закрывают: мимо, Escape и сама
// ссылка — после неё игрок вернётся в меню, а не к забытой панели.
{
  const кусок = /\(function ссылкиАвтора\(\)\{[\s\S]*?\n\}\)\(\);/.exec(script);
  assert(кусок, '4: не найден код ссылок автора в script.js');

  const слушатели = [];
  function Узел(опции){
    Object.assign(this, { hidden: false, атрибуты: {}, дети: [], сфокусирован: 0 }, опции);
  }
  Узел.prototype.getAttribute = function(имя){
    return имя === 'href' ? (this.href || null) : (this.атрибуты[имя] || null);
  };
  Узел.prototype.setAttribute = function(имя, значение){ this.атрибуты[имя] = значение; };
  Узел.prototype.focus = function(){ this.сфокусирован += 1; };
  Узел.prototype.querySelector = function(){ return this.где || null; };
  Узел.prototype.querySelectorAll = function(){ return this.дети; };
  Узел.prototype.addEventListener = function(тип, fn){ слушатели.push({ узел: this, тип, fn }); };
  Узел.prototype.closest = function(){ return this.строка ? this : null; };

  const строки = [
    new Узел({ href: '', где: new Узел({}) }),
    new Узел({ href: 'https://github.com/eaglehaast/p-p-online', где: new Узел({}) }),
    new Узел({ href: '   ', где: new Узел({}) })
  ];
  const кнопка = new Узел({});
  const окно = new Узел({ дети: строки });
  const затемнение = new Узел({});
  const узлы = { menuSignature: кнопка, authorLinks: окно, authorLinksBackdrop: затемнение };

  const песочница = {
    document: {
      getElementById: (id) => узлы[id] || null,
      addEventListener: (тип, fn) => слушатели.push({ узел: 'document', тип, fn })
    },
    window: { location: { href: 'https://eaglehaast.github.io/p-p-online/' } },
    URL,
    Array,
    HTMLElement: Узел,
    console
  };
  песочница.globalThis = песочница;
  vm.createContext(песочница);
  vm.runInContext(кусок[0], песочница);

  assert(строки[0].hidden === true && строки[2].hidden === true,
    '4b: строка с пустым адресом показана — это ссылка в никуда, на вид рабочая');
  assert(строки[1].hidden === false, '4c: строка с адресом спрятана');
  assert(строки[1].где.textContent === 'github.com',
    `4d: рядом со ссылкой не написано, куда она ведёт (${строки[1].где.textContent})`);

  const позвать = (узел, тип, событие = {}) => {
    const найдено = слушатели.filter((с) => с.узел === узел && с.тип === тип);
    assert(найдено.length, `4: некому обработать ${тип}`);
    for(const с of найдено) с.fn(Object.assign({ preventDefault(){}, target: узел }, событие));
  };

  позвать(кнопка, 'click');
  assert(окно.hidden === false && затемнение.hidden === false,
    '4e: нажатие по подписи не открыло окошко');
  assert(кнопка.атрибуты['aria-expanded'] === 'true', '4f: aria-expanded не переключился');
  assert(строки[1].сфокусирован === 1,
    '4g: фокус не ушёл в окошко — с клавиатуры до ссылок будет не добраться');

  позвать('document', 'keydown', { key: 'Escape' });
  assert(окно.hidden === true && затемнение.hidden === true, '4h: Escape не закрыл окошко');
  assert(кнопка.сфокусирован === 1, '4i: после Escape фокус не вернулся на подпись');

  позвать(кнопка, 'click');
  позвать(затемнение, 'click');
  assert(окно.hidden === true, '4j: нажатие мимо окошка его не закрыло — а крестика нет');

  позвать(кнопка, 'click');
  позвать(окно, 'click', { target: Object.assign(new Узел({ строка: true }), {}) });
  assert(окно.hidden === true,
    '4k: после нажатия на саму ссылку окошко осталось открытым — вернувшись из вкладки, '
    + 'игрок упрётся в него, а не в меню');
}

console.log('smoke-author-links: OK');
