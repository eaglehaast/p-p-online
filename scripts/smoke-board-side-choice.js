#!/usr/bin/env node
'use strict';

// Smoke test: игрок выбирает, с какого края поля он сидит.
//
// Логично, что играющий за синего видит своих внизу, носом вверх, а соперника наверху.
// Ради этого и сделан выбор стороны: клик по любому самолёту в главном меню.
//
// ГЛАВНОЕ РЕШЕНИЕ, из которого всё остальное следует: переворот — это ВИД, а не
// расстановка. В модели зелёный всегда внизу, синий всегда наверху, что бы игрок ни выбрал.
// Если бы вместо этого менялись местами стартовые позиции, то в онлайне у двух телефонов
// оказались бы РАЗНЫЕ ПАРТИИ, а не разные виды на одну, и разъехались бы они молча — каждый
// был бы уверен, что соперник жульничает. Поэтому переворот живёт ровно в двух местах:
// преобразование холста и ввод. Правила игры, карты, ИИ и снимок партии о нём не знают.
//
// Проверено в браузере:
//
//   клик по любому из четырёх самолётов меняет сторону, обе пары синхронно
//   при зелёном крае снизу компьютер играет за синего, при синем — за зелёного
//   низ ЭКРАНА попадает в точку мира y=51 (это верх поля), и ближайший там самолёт синий
//   подпись дальности стоит ровно: матрица холста в момент текста единичная
//   горизонталь и переворот складываются, поле остаётся согласованным

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
const markup = fs.readFileSync('index.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

function stripComments(text){
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const code = stripComments(source);

// === 1. ГЛАВНОЕ: расстановка не зависит от выбора стороны ===
//
// Это и есть условие, при котором онлайн вообще возможен.
{
  const init = extractFn(source, 'initPoints');
  for(const name of ['getBoardViewSeat', 'isBoardFlipped', 'boardViewSeat', 'getOpposingSeat']){
    assert(!init.includes(name),
      `1: расстановка смотрит на выбранную сторону («${name}»). Тогда у двух телефонов будут `
      + 'разные партии, а не разные виды на одну — и разъедутся они молча');
  }
  assert(/startPositions\.green\.forEach/.test(init) && /startPositions\.blue\.forEach/.test(init),
    '1b: расстановка перестала раскладывать обе стороны из одного набора позиций');

  // Снимок партии тоже обязан оставаться в общих координатах.
  const snapshot = extractFn(source, 'serializeMatchState');
  for(const name of ['isBoardFlipped', 'getBoardViewSeat']){
    assert(!snapshot.includes(name),
      `1c: снимок партии пересчитывается под свой край («${name}») — соперник получит `
      + 'зеркальную доску');
  }
}

// === 2. Переворот — ПОВОРОТ, а не зеркало ===
//
// У зеркала знак меняется на одной оси: доска стала бы отражением, и карта, честно
// несимметричная, начала бы читаться неверно. Проверяем не текст, а саму матрицу.
{
  const sandbox = { Math, WORLD: { width: 360, height: 640 }, boardViewSeat: 'green' };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFn(source, 'getBoardViewSeat'),
    extractFn(source, 'isBoardFlipped'),
    extractFn(source, 'setFieldTransform'),
    'this.calc = (seat, sx, sy, ox, oy) => { boardViewSeat = seat; let m = null;',
    '  setFieldTransform({ setTransform: (a,b,c,d,e,f) => { m = {a,b,c,d,e,f}; } }, sx, sy, ox, oy);',
    '  return m; };',
  ].join('\n'), sandbox);

  const прямо = sandbox.calc('green', 2, 3, 10, 20);
  assert(прямо.a === 2 && прямо.d === 3 && прямо.e === 10 && прямо.f === 20,
    '2: без переворота преобразование должно остаться прежним');

  const наоборот = sandbox.calc('blue', 2, 3, 10, 20);
  assert(наоборот.a === -2 && наоборот.d === -3,
    '2b: знак поменялся не на обеих осях — это зеркало, а не поворот. Доска станет '
    + 'отражением, и несимметричная карта будет читаться неверно');
  assert(наоборот.b === 0 && наоборот.c === 0, '2c: в преобразование затесался сдвиг');

  // Точка мира (x, y) обязана оказаться там, где была (W - x, H - y).
  const где = (m, x, y) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
  const угол = где(наоборот, 0, 0);
  const другой = где(прямо, 360, 640);
  assert(Math.abs(угол.x - другой.x) < 1e-9 && Math.abs(угол.y - другой.y) < 1e-9,
    '2d: начало поля не встаёт на место противоположного угла — поле сдвинуто, а не '
    + `перевёрнуто (${JSON.stringify(угол)} вместо ${JSON.stringify(другой)})`);
}

// === 3. Все холсты поля идут через ОДНО преобразование ===
//
// Их четыре: доска, самолёты, прицел и наложение HUD. Разъехавшись, они дали бы прицел,
// съехавший относительно доски, — а заметить это можно было бы только глазами. Одно из
// четырёх я уже забыл однажды: самолёты остались неперевёрнутыми.
{
  const calls = code.match(/setFieldTransform\(/g) || [];
  assert(calls.length >= 5,
    `3: setFieldTransform зовут ${calls.length - 1} раз вместо четырёх — какой-то холст поля `
    + 'снова задаёт преобразование сам');
  for(const ctxName of ['planeCtx', 'aimCtx', 'hudCtx']){
    assert(new RegExp(`setFieldTransform\\(${ctxName},`).test(code),
      `3b: ${ctxName} больше не идёт через общее преобразование`);
  }
  assert(/function applyViewTransform\(ctx\) \{\s*setFieldTransform\(ctx, VIEW\.scaleX, VIEW\.scaleY\);/.test(code),
    '3c: холсты доски и самолётов идут мимо общего преобразования');

  // И никто не выставляет масштаб поля напрямую в обход.
  assert(!/\.setTransform\(\s*VIEW\.scaleX/.test(code),
    '3d: где-то снова выставляют преобразование поля напрямую, мимо setFieldTransform');
}

// === 4. Ввод разворачивается в той же единственной точке ===
{
  const toBoard = extractFn(source, 'designToBoardCoords');
  assert(/flipBoardPointIfNeeded\(/.test(toBoard),
    '4: ввод не разворачивается. Восемнадцать мест зовут эту функцию, и пропустить её '
    + 'значит получить игру, где часть кликов уезжает в противоположный угол');

  const flip = extractFn(source, 'flipBoardPointIfNeeded');
  assert(/WORLD\.width - x/.test(flip) && /WORLD\.height - y/.test(flip),
    '4b: обратное преобразование ввода не совпадает с прямым');
}

// === 5. HUD меняется КРАЯМИ, а не переворачивается ===
//
// Вверх ногами он не читается, поэтому его блоки не поворачиваются вместе с полем, а
// занимают место соперника.
{
  const edge = extractFn(source, 'getHudEdgeSeat');
  assert(/isBoardFlipped\(\)/.test(edge), '5: выбор края HUD не смотрит на переворот');

  for(const table of ['PLANE_COUNTER_CONTAINERS', 'MATCH_SCORE_CONTAINERS',
                      'ARCADE_SCORE_CONTAINERS', 'INVENTORY_UI_CONFIG.containers']){
    assert(new RegExp(`${table.replace('.', '\\.')}[?.]*\\[getHudEdgeSeat\\(color\\)\\]`).test(code),
      `5b: ${table} берётся по цвету, а не по краю — блок останется у соперника`);
  }

  // То, что стоит в стилях, меняется классом на корне.
  assert(/function syncBoardFlipClass\(\)\{[\s\S]{0,240}is-board-flipped/.test(code),
    '5c: класс переворота не ставится на корень — стили о выборе не узнают');
  for(const rule of ['#gs_planecounter_blue', '#gs_planecounter_green']){
    assert(new RegExp(`html\\.is-board-flipped ${rule}`).test(styles),
      `5d: ${rule} не меняет край — счётчики останутся у соперника`);
  }
  assert(/html\.is-board-flipped #gameBackground \{ transform: rotate\(180deg\); \}/.test(styles),
    '5e: фон не разворачивается — цветные половины перестанут совпадать со сторонами');
}

// === 6. Свой край — своя сторона ===
//
// Иначе выбор был бы декоративным: сел поудобнее, а играешь всё равно за того, кто напротив.
{
  const ai = extractFn(source, 'getAiPlayerColor');
  assert(/getOpposingSeat\(\)/.test(ai),
    '6: компьютер больше не играет за верхнего');
  assert(!/const AI_PLAYER_COLOR/.test(code),
    '6b: цвет ИИ снова прибит намертво');
  assert(/color === getAiPlayerColor\(\)/.test(code),
    '6c: решение «чья это сторона» перестало спрашивать сторону ИИ');
}

// === 7. Переключатель в меню: четыре самолёта, одно действие ===
{
  const toggle = extractFn(source, 'toggleBoardViewSeat');
  assert(/setBoardViewSeat\(getOpposingSeat\(\)\)/.test(toggle), '7: клик не меняет сторону');
  assert(/syncMenuPlaneSides\(\)/.test(toggle),
    '7b: картинки самолётов не переставляются — меню будет показывать прежнюю сторону');

  const sync = extractFn(source, 'syncMenuPlaneSides');
  for(const plane of ['leftModePlane', 'leftRulesPlane', 'rightModePlane', 'rightRulesPlane']){
    assert(sync.includes(plane),
      `7c: пара ${plane} осталась в стороне — две пары изображают одних и тех же соперников `
      + 'и разъехавшись показывали бы разное про одно и то же');
  }

  const handlers = /for\(const plane of \[leftModePlane, rightModePlane, leftRulesPlane, rightRulesPlane\]\)\{[\s\S]{0,260}toggleBoardViewSeat\(\)/;
  assert(handlers.test(code), '7d: клик по самолётам меню больше не переключает сторону');
  assert(/#menuLayer #modeMenu \.mm-plane \{\s*pointer-events: auto;/.test(styles),
    '7e: по самолётам меню нельзя попасть мышью');

  // Механика нарочно неприметная, поэтому у неё есть и доступный вход: без него выбор
  // стороны — а он меняет и то, за кого играешь, — был бы недоступен без мыши.
  assert(/<button id="swapSidesBtn"[^>]*>/.test(markup),
    '7f: пропала кнопка выбора стороны для тех, кто играет без мыши');
  assert(/swapSidesBtn\?\.addEventListener\?\.\('click'/.test(code),
    '7g: кнопка выбора стороны ничего не делает');
}

// === 8. Выбор переживает перезагрузку ===
{
  const setter = extractFn(source, 'setBoardViewSeat');
  assert(/localStorage\?\.setItem\(BOARD_VIEW_SEAT_STORAGE_KEY/.test(setter),
    '8: выбор стороны не сохраняется');
  assert(/catch\(_error\)\{/.test(setter),
    '8b: запись не обёрнута в try/catch, а в приватном режиме хранилище бросает исключение');
  assert(/loadBoardViewSeat\(\);/.test(code),
    '8c: сохранённый выбор не читается при запуске');
}

console.log('smoke-board-side-choice: OK');
