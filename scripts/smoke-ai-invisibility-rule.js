#!/usr/bin/env node
'use strict';

// Smoke test: когда ИИ прячется невидимостью.
//
// Невидимость — эффект на ВЕСЬ цвет и на время следующего хода противника
// (shouldHidePlaneByInvisibility), а не бафф на один самолёт. Поэтому решение принимается
// по положению своих на поле, а не по одному выбранному.
//
// Правило: прятать стоит тех, кого могут сбить и кто не стоит на базе. Самолёт на своём
// стартовом месте укрывать незачем — соперник и так помнит, где он стоит. Отдельно
// считается тот, кто прямо сейчас взлетает: ход ещё не сделан, но место посадки известно,
// и опасность меряется по нему, иначе решение опаздывает ровно на ход.
//
// Прежнее условие требовало одного из трёх поводов, и два не работали НИКОГДА:
//
//   «несу цель»        читало hasCargo/hasFlag/carryingCargo/carryingFlag — таких полей у
//                      самолёта нет, настоящее называется carriedFlagId;
//   «впереди по очкам» читало context.scoreState, которого в контексте не бывает.
//
// Замер до правки: за шесть ходов решение спрашивали четыре раза и четыре раза отвечали
// «нет»; за двенадцать ходов не израсходовано ни одного заряда. После — четыре заряда за
// двенадцать ходов.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Функция не найдена: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const decisionSource = extractFunctionSource(source, 'shouldAiUseInvisibilityForSelectedPlan');

// === 1. Мёртвые поводы не вернулись ===
{
  const code = decisionSource.replace(/\/\/.*$/gm, '');
  for(const dead of ['hasCargo', 'hasFlag', 'carryingCargo', 'carryingFlag']){
    assert(!new RegExp(`\\b${dead}\\b`).test(code),
      `1: «${dead}» у самолёта не существует — условие по нему никогда не сработает`);
  }
  assert(!/scoreState|\bscores\b/.test(code),
    '1b: счёт к тому, собьют самолёт или нет, отношения не имеет');
  assert(!/\.active\s*!==\s*false/.test(code),
    '1c: поля active у самолёта нет — живость проверяется через isAlive');
  assert(/isAlive\s*!==\s*true/.test(code) || /\.isAlive\b/.test(code),
    '1d: живость союзников проверяется настоящим полем');
}

// Стенд: настоящая функция решения, вокруг — подставная игра.
function makeStand({ enemyReachCells = 30, invisibilityActive = false } = {}){
  const home = { x: 100, y: 500 };
  const mover = { color: 'blue', isAlive: true, burning: false,
                  x: home.x, y: home.y, homeX: home.x, homeY: home.y };
  const ally = { color: 'blue', isAlive: true, burning: false,
                 x: home.x + 40, y: home.y, homeX: home.x + 40, homeY: home.y };
  const context = {
    Math, Number,
    CELL_SIZE: 20,
    POINT_RADIUS: 10,
    turnColors: ['blue', 'green'],
    turnIndex: 0,
    points: [mover, ally],
    isPlayerInvisibilityActive: () => invisibilityActive,
    getEffectiveFlightRangeCells: () => enemyReachCells,
  };
  vm.createContext(context);
  vm.runInContext(decisionSource, context);
  return { context, mover, ally, home,
    ask: (enemies, landing) => context.shouldAiUseInvisibilityForSelectedPlan(
      { enemies }, { plane: mover, color: 'blue', landingX: landing.x, landingY: landing.y }) };
}

const enemyAt = (x, y) => ({ color: 'green', isAlive: true, burning: false, x, y });

// === 2. На базе не прячемся ===
//
// Соперник и так помнит, где стоят самолёты на своих местах: заряд ушёл бы впустую.
{
  const stand = makeStand();
  const near = enemyAt(stand.home.x + 60, stand.home.y + 60); // враг достаёт
  assert(stand.ask([near], stand.home) === false,
    '2: все дома и садимся дома — прятаться незачем, даже когда враг близко');
}

// === 3. ГЛАВНОЕ: вылет в поле под досягаемость врага ===
//
// Ход ещё не сделан, но место посадки известно. Решать надо по нему, иначе прятаться
// будем уже после того, как собьют.
{
  const stand = makeStand();
  const landing = { x: stand.home.x + 200, y: stand.home.y - 200 };
  const near = enemyAt(landing.x + 80, landing.y + 80);
  const far = enemyAt(landing.x + 5000, landing.y + 5000);

  assert(stand.ask([near], landing) === true,
    '3: самолёт садится туда, куда враг дотягивается — прячемся');
  assert(stand.ask([far], landing) === false,
    '3b: враг дотянуться не может — заряд не тратим');

  // Сбитый враг никого не догонит, даже стоя вплотную.
  const downed = { ...enemyAt(landing.x + 20, landing.y), isAlive: false, burning: true };
  assert(stand.ask([downed], landing) === false,
    '3c: сбитый враг поводом не является');
  assert(stand.ask([downed, near], landing) === true,
    '3d: но живой рядом со сбитым — является');
}

// === 4. Считается досягаемость, а не близость ===
//
// Именно на этом правило и не работало: готовая мерка считала опасным радиус 285 px, а
// долетают самолёты на 600 и вовсю отражаются от стен. Проверяем, что граница движется
// вместе с дальностью полёта врага.
{
  const landing = { x: 100 + 300, y: 500 };
  const enemy = enemyAt(landing.x + 400, landing.y);

  const short = makeStand({ enemyReachCells: 10 });   // 200 px — не достаёт
  const long = makeStand({ enemyReachCells: 30 });    // 600 px — достаёт
  assert(short.ask([enemy], landing) === false,
    '4: враг с малой дальностью до места посадки не дотягивается');
  assert(long.ask([enemy], landing) === true,
    '4b: тот же враг с обычной дальностью — дотягивается, и это повод спрятаться');
}

// === 5. Свой, уже стоящий в поле, тоже повод ===
//
// Невидимость укрывает весь цвет, поэтому важен не только тот, кто летит.
{
  const stand = makeStand();
  stand.ally.x = stand.home.x + 250;
  stand.ally.y = stand.home.y - 250;
  const near = enemyAt(stand.ally.x + 60, stand.ally.y + 60);

  assert(stand.ask([near], stand.home) === true,
    '5: сами садимся дома, но в поле стоит свой под ударом — прячемся');

  stand.ally.isAlive = false;
  assert(stand.ask([near], stand.home) === false,
    '5b: сбитый свой поводом не является');
}

// === 6. Дважды не прячемся ===
{
  const stand = makeStand({ invisibilityActive: true });
  const landing = { x: stand.home.x + 200, y: stand.home.y - 200 };
  assert(stand.ask([enemyAt(landing.x + 50, landing.y)], landing) === false,
    '6: уже невидимы — второй заряд ничего не добавит');
}

console.log('smoke-ai-invisibility-rule: OK');
