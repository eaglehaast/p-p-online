#!/usr/bin/env node
'use strict';

// Smoke test: всё, что видят оба игрока, разыгрывается ОДНИМИ костями.
//
// Это уже четвёртый раз, когда одна и та же ошибка вылезает в новом месте:
//
//   шаг 3 — карта выбиралась на каждом устройстве своя;
//   шаг 3 — кто ходит первым, тоже решалось порознь;
//   шаг 4 — набор карт для жребия был у каждого свой (раскладка из localStorage);
//   сейчас — ящик падал в разные места, и из него выпадали разные предметы.
//
// Каждый раз это не «разошлись на кадр», а разные партии: один летит подбирать ящик туда,
// где у второго пусто, применяет предмет, которого у второго нет, — и снимок партии потом
// затирает расхождение вместе с уже сделанным ходом.
//
// Поэтому здесь не только проверка двух конкретных мест, но и УЧЁТ: каждый Math.random()
// в игре обязан быть в этом списке с объяснением, почему ему можно быть своим. Новый
// необъяснённый — сразу красный тест. Это единственный способ не ловить одно и то же в
// пятый раз.

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

// === 1. Учёт: у каждого Math.random() записано, почему ему можно быть своим ===
//
// Разрешены ровно три причины: жребий сам по себе, «этого второй игрок не видит»
// (оформление, ИИ, отладка) и «это должно быть РАЗНЫМ» (уникальные номера).
const ALLOWED = {
  // Сам жребий: без комнаты он и есть обычная случайность.
  getSharedRandomFraction: 'сам общий жребий; вне комнаты — обычный Math.random()',

  // Обязано быть разным у двоих.
  startOnlineSession: 'свой номер участника: он для того и нужен, чтобы не совпасть',

  // Непрозрачные номера сущностей. Едут в снимке и заменяются на номера отправителя,
  // так что расходятся ровно до ближайшего снимка и ни на что не влияют.
  placeMine: 'номер мины: непрозрачный, снимок привозит номера отправителя',
  placeAA: 'номер зенитки: непрозрачный (зенитки к тому же выключены)',
  applyInventoryItemAtBoardPlacement: 'номер заряда динамита: непрозрачный',

  // Второй игрок этого не видит.
  pickRandomBurningFlame: 'какое пламя горит: оформление, у каждого своё',
  startNewRound: 'зерно для развязки ничьих у ИИ; в онлайне ИИ не играет',
  randomSignedOffset: 'разброс прицела ИИ',
  getRandomDeviation: 'разброс прицела ИИ',
  randomInRange: 'тайминги ИИ',
  tryGetAiTacticalMediumScale: 'вероятность тактического выбора ИИ',
  applyAiLaunchStageBaseSmoothing: 'сглаживание анимации прицела ИИ',
  getAiLaunchStageTransitionDurationMs: 'длительность стадии прицеливания ИИ',
  getAiLaunchOscillationRampDurationMs: 'длительность раскачки прицела ИИ',
  runAiLaunchSessionTick: 'тайминги «человеческого» прицеливания ИИ',
  placeBlueDynamiteAt: 'симуляция ИИ: настоящее поле не трогает',
  withTemporaryBlueMine: 'симуляция ИИ: настоящее поле не трогает',
  withTemporaryBlueMines: 'симуляция ИИ: настоящее поле не трогает',
  giveOpponentItemFromConsole: 'консольный инструмент разработки',
};

{
  // Комментарии и строки не в счёт: слово Math.random() в объяснении — не вызов.
  const lines = source.split('\n').map((line) => line
    .replace(/\/\/.*$/, '')
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''"));

  const declaration = /^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/;
  const assigned = /^\s*(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/;

  let current = '(верхний уровень)';
  const seen = new Map();
  lines.forEach((line, index) => {
    const match = declaration.exec(line) || assigned.exec(line);
    if(match) current = match[1];
    if(line.includes('Math.random()')){
      if(!seen.has(current)) seen.set(current, []);
      seen.get(current).push(index + 1);
    }
  });

  const unexplained = [...seen.keys()].filter((name) => !(name in ALLOWED));
  assert(unexplained.length === 0,
    '1: свои кости в необъяснённом месте: ' +
    unexplained.map((name) => `${name} (строки ${seen.get(name).join(', ')})`).join('; ') +
    '.\n     Если это видят ОБА игрока — жребий должен быть общий (getSharedRandomFraction).\n' +
    '     Если нет — впиши в ALLOWED причину, почему своим костям тут можно.');

  // Список не должен зарастать: разрешение на давно исчезнувшую функцию однажды прикроет
  // новую с тем же именем.
  const stale = Object.keys(ALLOWED).filter((name) => !seen.has(name));
  assert(stale.length === 0,
    `1b: в списке разрешённых остались функции, где Math.random() больше нет: ${stale.join(', ')}`);

  for(const [name, reason] of Object.entries(ALLOWED)){
    assert(typeof reason === 'string' && reason.trim().length > 10,
      `1c: у «${name}» записана внятная причина, а не отписка`);
  }

  console.log(`  своих костей: ${seen.size} мест, все объяснены`);
}

// === 2. Ящик падает у обоих в одно место ===
{
  const spawn = extractFunctionSource(source, 'findCargoSpawnTarget');
  assert(!/Math\.random\(\)/.test(spawn),
    '2: у выбора места для ящика больше нет своих костей');
  assert(/getSharedRandomFraction\(`\$\{seed\}:x`\)/.test(spawn)
      && /getSharedRandomFraction\(`\$\{seed\}:y`\)/.test(spawn),
    '2b: обе координаты берутся из общего жребия');
  assert(/cargo:\$\{roundNumber\}:\$\{turnAdvanceCount\}:\$\{attempt\}/.test(spawn),
    '2c: повод жребия — раунд, номер хода и номер попытки: всё это у обоих одинаково, ' +
    'а ящик появляется ровно раз на ход');
}

// === 3. Из ящика выпадает у обоих одно и то же ===
{
  const pick = extractFunctionSource(source, 'getRandomInventoryItem');
  assert(!/Math\.random\(\)/.test(pick),
    '3: у выбора предмета больше нет своих костей');
  assert(/getSharedRandomFraction\(/.test(pick),
    '3b: предмет выбирается общим жребием');

  // Повод жребия — координаты САМОГО ЯЩИКА, а не счётчик. Счётчик, разъехавшийся один
  // раз, разъезжается дальше навсегда; координаты же одинаковы по построению, и один и
  // тот же ящик подобрать дважды нельзя.
  assert(/item:\$\{roundNumber\}:\$\{cargo\.x\.toFixed\(2\)\}:\$\{cargo\.y\.toFixed\(2\)\}/.test(source),
    '3c: повод жребия — сам ящик, а не счётчик начислений');
}

// === 4. Два устройства в одной комнате получают одно и то же ===
//
// Проверка не на «код выглядит правильно», а на настоящем жребии, дважды.
{
  const build = (room) => {
    const INVENTORY_ITEMS = [{ type: 'fuel' }, { type: 'wings' }, { type: 'mine' },
                             { type: 'crosshair' }, { type: 'dynamite' }];
    const sandbox = { Math, Object, String, INVENTORY_ITEMS, onlineSession: room ? { room } : null };
    vm.createContext(sandbox);
    vm.runInContext([
      extractFunctionSource(source, 'getSharedRandomFraction'),
      extractFunctionSource(source, 'getRandomInventoryItem'),
      'this.api = { getSharedRandomFraction, getRandomInventoryItem };',
    ].join('\n'), sandbox);
    return sandbox.api;
  };

  const first = build('barsuk');
  const second = build('barsuk');
  const other = build('lisica');

  // Один и тот же ящик — один и тот же предмет у обоих.
  const labels = ['item:1:150.25:320.50', 'item:1:200.00:280.75', 'item:3:99.10:410.00'];
  for(const label of labels){
    assert(first.getRandomInventoryItem(label).type === second.getRandomInventoryItem(label).type,
      `4: из ящика «${label}» у обоих выпадает одно и то же`);
  }

  // Разные ящики — разные предметы (иначе жребий вырожден и всегда даёт одно).
  const types = new Set(labels.map((label) => first.getRandomInventoryItem(label).type));
  const manyTypes = new Set(Array.from({ length: 40 }, (_, i) =>
    first.getRandomInventoryItem(`item:1:${i}.00:1.00`).type));
  assert(manyTypes.size >= 3,
    `4b: из разных ящиков выпадает разное (сейчас видов: ${manyTypes.size})`);

  // Разные комнаты — свои жребии: две пары игроков не должны играть под копирку.
  const differs = labels.some((label) =>
    first.getRandomInventoryItem(label).type !== other.getRandomInventoryItem(label).type);
  assert(differs, '4c: в другой комнате жребий свой');

  // Место для ящика — тоже.
  for(const label of ['cargo:1:1:0:x', 'cargo:1:1:0:y', 'cargo:2:5:3:x']){
    assert(first.getSharedRandomFraction(label) === second.getSharedRandomFraction(label),
      `4d: «${label}» выпадает одинаково у обоих`);
  }

  // Вне комнаты — обычная случайность: приколачивать одиночную игру к чему-либо незачем.
  const offline = build(null);
  const rolls = new Set(Array.from({ length: 12 }, () => offline.getSharedRandomFraction('cargo:1:1:0:x')));
  assert(rolls.size > 1, '4e: без комнаты жребий обычный случайный');
  void types;
}

console.log('Smoke test passed: всё, что видят оба, разыгрывается общими костями, и каждый оставшийся Math.random() объяснён.');
