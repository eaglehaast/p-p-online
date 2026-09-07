#!/usr/bin/env node
'use strict';

// Smoke test: компьютер играет за СВОЮ сторону, а не «за синего».
//
// Выбор края поля меняет и то, за кого играет человек: компьютеру достаётся верхний.
// При обычном крае это по-прежнему синий, при своём крае снизу — зелёный.
//
// Пока сторона была прибита намертво, весь планировщик писал её цветом: «мои самолёты
// синие», «моя база синяя», «чужой флаг зелёный», «мои мины синие». С выбором края такие
// места молча начинают работать за соперника — а самое первое из них, ворота хода, просто
// не пропускало компьютер: при своём крае снизу ИИ не ходил вовсе.
//
// Замер в браузере, игра против компьютера:
//
//   обычный край   ИИ синий,  взлетает через 5.5 с
//   свой край      ИИ зелёный, двенадцать секунд тишины
//
// После правки взлетает на обоих краях, и по четыре хода подряд летит ВПЕРЁД — проекция
// скорости на «своя база -> чужая база» от 130 до 570 px/с, ни одного назад.
//
// Главное свойство правки: при обычном крае она не меняет ничего. getAiPlayerColor() там
// возвращает "blue", getAiEnemyColor() — "green", то есть каждая подстановка сводится ровно
// к прежнему литералу.

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
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// === 1. Сторона компьютера и сторона человека — противоположны и следуют за краем ===
{
  const sandbox = { boardViewSeat: 'green', запрошено: [] };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFn(source, 'getBoardViewSeat'),
    extractFn(source, 'getOpposingSeat'),
    extractFn(source, 'getAiPlayerColor'),
    extractFn(source, 'getAiEnemyColor'),
    'function getBaseAnchor(color){ запрошено.push(color); return { color }; }',
    extractFn(source, 'getAiHomeBaseAnchor'),
    extractFn(source, 'getAiEnemyBaseAnchor'),
    'this.стороны = (seat) => { boardViewSeat = seat;',
    '  return { ии: getAiPlayerColor(), человек: getAiEnemyColor(),',
    '           своя: getAiHomeBaseAnchor().color, чужая: getAiEnemyBaseAnchor().color }; };',
  ].join('\n'), sandbox);

  const обычный = sandbox.стороны('green');
  assert(обычный.ии === 'blue' && обычный.человек === 'green',
    `1: при обычном крае компьютер обязан остаться синим, а человек зелёным `
    + `(вышло ${обычный.ии} и ${обычный.человек}) — иначе изменилась игра, в которую играли`);

  const свой = sandbox.стороны('blue');
  assert(свой.ии === 'green' && свой.человек === 'blue',
    `1b: при своём крае снизу компьютер обязан играть за зелёного (вышло ${свой.ии})`);

  for(const [край, стороны] of [['обычном', обычный], ['своём', свой]]){
    assert(стороны.ии !== стороны.человек,
      `1c: при ${край} крае компьютер и человек оказались одной стороной`);
    assert(стороны.своя === стороны.ии && стороны.чужая === стороны.человек,
      `1d: при ${край} крае базы разъехались со сторонами: своя ${стороны.своя}, `
      + `чужая ${стороны.чужая}`);
  }
}

// === 2. ГЛАВНОЕ: ворота хода сравнивают ход со стороной компьютера ===
//
// Это то самое место, из-за которого ИИ не ходил вовсе: ворота пропускали только «ход
// синего», а при своём крае снизу компьютеру доставался зелёный.
{
  const тело = extractFn(source, 'scheduleComputerMoveWithCargoGate');
  const ворота = (тело.match(/turnColors\?\.\[turnIndex\] !== getAiPlayerColor\(\)/g) || []).length;
  assert(ворота === 2,
    `2: ворота хода компьютера сравнивают ход со стороной ИИ ${ворота} раз вместо двух `
    + '(при постановке и в отложенном обработчике) — значит где-то снова стоит цвет');
  assert(!/turnColors\?\.\[turnIndex\] !== "(blue|green)"/.test(тело),
    '2b: ворота хода снова прибиты к цвету — при своём крае снизу компьютер перестанет ходить');

  assert(/const aiTurnColor = getAiPlayerColor\(\);/.test(тело)
    && /const aiTurnEnemyColor = getAiEnemyColor\(\);/.test(тело),
    '2c: разбор хода не берёт обе стороны у общего источника');
  assert(/plane\.color !== aiTurnColor/.test(тело),
    '2d: компьютер снова выбирает самолёты для взлёта по цвету, а не по своей стороне');
  assert(/plane\?\.color === aiTurnEnemyColor/.test(тело),
    '2e: компьютер снова ищет противника по цвету');
}

// === 3. Ни одна сторона больше не пишется цветом ===
//
// Дальше идут места, каждое из которых по отдельности тихо ломает игру за другой край:
// база, флаги, инвентарь, владелец мины. Проверяем разом: этих вызовов с цветом в коде
// быть не должно вовсе.
{
  const запреты = [
    ['getBaseAnchor("', 'база', 'компьютер полетит к чужой базе как к своей'],
    ['getFlagCarrierForColor("', 'носильщик флага', 'компьютер будет ловить не того'],
    ['getAvailableFlagsByColor("', 'доступные флаги', 'компьютер пойдёт за своим же флагом'],
    ['addItemToInventory("', 'выдача предмета', 'предмет уйдёт сопернику'],
    ['playInventoryConsumeFx("', 'эффект предмета', 'вспышка мигнёт у соперника'],
    ['owner: "', 'владелец мины и динамита', 'свои же мины начнут взрывать самого компьютера'],
  ];
  for(const [шаблон, что, беда] of запреты){
    const n = (code.match(new RegExp(шаблон.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(blue|green)"', 'g')) || []).length;
    assert(n === 0,
      `3: ${что} — ${n} раз задано цветом. При своём крае снизу ${беда}`);
  }

  // Инвентарь компьютера — единственное исключение: в СНИМКЕ для отладки перечислены обе
  // стороны нарочно, потому и не запрещено целиком.
  const снимок = extractFn(source, 'buildAiMoveDumpDynamic');
  const всего = (code.match(/evaluateInventoryState\("(blue|green)"\)/g) || []).length;
  const вСнимке = (снимок.match(/evaluateInventoryState\("(blue|green)"\)/g) || []).length;
  assert(всего === вСнимке && вСнимке === 2,
    `3b: инвентарь запрашивают цветом ${всего} раз, из них в отладочном снимке ${вСнимке} — `
    + 'значит цвет утёк в решения');
  assert(/return evaluateInventoryState\(getAiPlayerColor\(\)\);/.test(code),
    '3c: инвентарь компьютера снова берётся по цвету');
}

// === 4. Где сторона выводится из самолёта — там она и остаётся ===
//
// Половина планировщика и раньше брала цвет у самолёта или у хода, а не писала его. Такие
// места трогать было не нужно, и они обязаны остаться: это и есть правильный образец.
{
  for(const [имя, образец] of [
    ['buildAiMineEscapeMove', /const enemyColor = \(plane\.color === "green"\) \? "blue" : "green";/],
    ['findAiDynamitePathOpeningOpportunity', /const enemyColor = color === "green" \? "blue" : "green";/],
  ]){
    assert(образец.test(extractFn(source, имя)),
      `4: ${имя} перестал выводить сторону противника из цвета самолёта`);
  }
}

console.log('smoke-ai-side-follows-seat: OK');
