#!/usr/bin/env node
'use strict';

// Smoke test: кто управляет стороной на этом устройстве.
//
// До этой правки такого понятия в игре не было. Она знала только «чей сейчас ход», а
// «ходит ИИ» было записано шестью одинаковыми условиями вида
//
//     gameMode === "computer" && цвет === "blue"
//
// — в блокировке захвата самолёта, в причине отказа, в планировщике хода ИИ и так далее.
// Хот-сит держался на том, что оба игрока за одним экраном.
//
// Правка сводит их в getColorController. Поэтому главное, что здесь проверяется, —
// ЭКВИВАЛЕНТНОСТЬ: новый предикат обязан давать ровно то же, что старое условие, во всех
// сочетаниях режима и цвета. Плюс то, ради чего всё затевалось: понятие должно быть
// пригодно для онлайна, а не только для ИИ.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');

const build = ({ gameMode, turnColor, seat = null }) => {
  const sandbox = {
    gameMode,
    turnColors: ['green', 'blue'],
    turnIndex: turnColor === 'blue' ? 1 : 0,
    Object,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const COLOR_CONTROLLERS = Object\.freeze\(\{[^}]*\}\);/)[0],
    source.match(/const AI_PLAYER_COLOR = "[^"]*";/)[0],
    // Место за столом — часть решения «чья это сторона», поэтому в стенде оно настоящее,
    // а не заглушка.
    `let onlineSession = ${seat ? `{ seat: ${JSON.stringify(seat)} }` : 'null'};`,
    extractFunctionSource(source, 'getOnlineSeatColor'),
    extractFunctionSource(source, 'getColorController'),
    extractFunctionSource(source, 'isLocalColor'),
    extractFunctionSource(source, 'isAiColor'),
    extractFunctionSource(source, 'isRemoteColor'),
    extractFunctionSource(source, 'isAiControlledTurn'),
    'this.api = { getColorController, isLocalColor, isAiColor, isRemoteColor,',
    '             isAiControlledTurn, AI_PLAYER_COLOR };',
  ].join('\n'), sandbox);
  return sandbox.api;
};

const MODES = ['hotSeat', 'computer', 'online'];
const COLORS = ['blue', 'green'];

// === 1. Эквивалентность старому условию во ВСЕХ сочетаниях ===
{
  // Ровно то выражение, что стояло в шести местах до правки.
  const wasAiSide = (gameMode, color) => gameMode === 'computer' && color === 'blue';

  for(const gameMode of MODES){
    for(const color of COLORS){
      const api = build({ gameMode, turnColor: color });
      assert(api.isAiColor(color) === wasAiSide(gameMode, color),
        `1: «${gameMode}/${color}» — isAiColor совпадает со старым условием ` +
        `(${api.isAiColor(color)} против ${wasAiSide(gameMode, color)})`);
      // Блокировка захвата раньше срабатывала ровно на том же условии.
      assert(api.isLocalColor(color) === !wasAiSide(gameMode, color),
        `1b: «${gameMode}/${color}» — блокировка ввода срабатывает там же, где раньше`);
      assert(api.isAiControlledTurn() === wasAiSide(gameMode, color),
        `1c: «${gameMode}/${color}» — «сейчас ходит ИИ» совпадает со старым условием`);
    }
  }
}

// === 2. Хот-сит: обе стороны за этим устройством ===
{
  for(const color of COLORS){
    const api = build({ gameMode: 'hotSeat', turnColor: color });
    assert(api.isLocalColor(color), `2: в хот-сите «${color}» — своя сторона`);
    assert(!api.isAiColor(color), `2b: в хот-сите ИИ не играет ни за кого`);
  }
}

// === 3. Против компьютера: ИИ за синих, человек за зелёных ===
{
  const api = build({ gameMode: 'computer', turnColor: 'blue' });
  assert(api.AI_PLAYER_COLOR === 'blue',
    '3: цвет ИИ вынесен в константу и остался синим');
  assert(api.isAiColor('blue') && !api.isLocalColor('blue'),
    '3b: синий — сторона ИИ, руками не берётся');
  assert(api.isLocalColor('green') && !api.isAiColor('green'),
    '3c: зелёный — сторона человека');
}

// === 4. Онлайн: своя сторона одна, вторая — у соперника ===
//
// «Не моя сторона» и «сторона ИИ» — разные вещи: удалённого игрока не надо запускать,
// его ход приедет сам. Поэтому предикатов три, и они не должны сливаться в один.
{
  const controllers = source.match(/const COLOR_CONTROLLERS = Object\.freeze\(\{([^}]*)\}\);/)[1];
  assert(/LOCAL:/.test(controllers) && /AI:/.test(controllers) && /REMOTE:/.test(controllers),
    '4: у стороны есть «своя», «ИИ» и «соперник»');

  const localFn = extractFunctionSource(source, 'isLocalColor');
  const aiFn = extractFunctionSource(source, 'isAiColor');
  const remoteFn = extractFunctionSource(source, 'isRemoteColor');
  assert(/COLOR_CONTROLLERS\.LOCAL/.test(localFn)
      && /COLOR_CONTROLLERS\.AI/.test(aiFn)
      && /COLOR_CONTROLLERS\.REMOTE/.test(remoteFn),
    '4b: предикаты сравнивают с разными значениями, а не дублируют друг друга');

  for(const seat of COLORS){
    const other = seat === 'blue' ? 'green' : 'blue';
    const api = build({ gameMode: 'hotSeat', turnColor: seat, seat });
    assert(api.isLocalColor(seat) && !api.isRemoteColor(seat),
      `4c: за столом «${seat}» своя сторона — своя`);
    assert(api.isRemoteColor(other) && !api.isLocalColor(other),
      `4d: за столом «${seat}» сторона «${other}» — соперника, руками не берётся`);
    assert(!api.isAiColor(other),
      `4e: сторона соперника — НЕ ИИ: её не надо запускать, ход приедет сам`);

    // Сев за стол, ИИ не играет ни за кого: иначе синими ходили бы двое — удалённый
    // игрок и местный компьютер.
    const withAiSetting = build({ gameMode: 'computer', turnColor: seat, seat });
    assert(!withAiSetting.isAiColor('blue') && !withAiSetting.isAiColor('green'),
      `4f: за столом «${seat}» ИИ не играет ни за кого, даже если в настройках он выбран`);
  }
}

// === 5. Старое условие больше нигде не живёт ===
//
// Иначе онлайн придётся чинить в шести местах вместо одного.
//
// Пробелы вокруг === здесь не по вкусу, а по необходимости: одно такое условие было
// записано слитно (gameMode==="computer"), пережило первую сборку в getColorController и
// продолжало в одиночку блокировать ввод — а в онлайне блокировать надо не только ИИ.
{
  const strays = source
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /gameMode\s*===\s*"computer"/.test(line))
    .filter(({ line }) => /"blue"|"green"|AI_PLAYER_COLOR|turnColors/.test(line))
    // Само определение — единственное законное место.
    .filter(({ line }) => !/COLOR_CONTROLLERS\.AI/.test(line));

  assert(strays.length === 0,
    `5: решение «чья это сторона» осталось только в getColorController; ` +
    `найдено ещё: ${strays.map((s) => s.number).join(', ')}`);
}

// === 6. Места, которые раньше решали это сами, теперь спрашивают ===
{
  const uses = [
    ['isAiTurnStillApplicable', /isAiControlledTurn\(\)/],
    ['isPlaneGrabbableAt', /!isLocalColor\(currentColor\)/],
    ['getGrabRejectReason', /isAiColor\(currentColor\)/],
    // Захват самолёта на поле: единственное место, где ввод отбивается по-настоящему.
    ['handleStart', /!isLocalColor\(currentColor\)/],
  ];
  for(const [fnName, pattern] of uses){
    assert(pattern.test(extractFunctionSource(source, fnName)),
      `6: ${fnName} спрашивает про управление стороной, а не проверяет режим сам`);
  }

  // Инвентарь: раньше проверялась только очерёдность, поэтому в ход ИИ его инвентарь
  // оказывался кликабельным.
  const inventoryGate = source.slice(source.indexOf('function onInventoryItemPointerDown'));
  assert(/if \(color !== activeColor \|\| !isLocalColor\(color\)\)/.test(inventoryGate.slice(0, 4000)),
    '6b: инвентарь проверяет и очерёдность, и принадлежность стороны');
}

console.log('Smoke test passed: «кто управляет стороной» собрано в одном месте, решает ровно то же, что прежние шесть условий, и различает свою сторону, сторону ИИ и сторону соперника по сети.');
