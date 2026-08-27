#!/usr/bin/env node
'use strict';

// Smoke test: снимок партии переживает круг «сохранить — испортить — восстановить».
//
// Снимок нужен онлайну и восстановлению после обрыва. Его цена ошибки особенная: если
// какое-то поле не попадёт в снимок или попадёт, но не будет прочитано обратно, игра не
// сломается — она просто РАЗЪЕДЕТСЯ у двух игроков, тихо и не сразу.
//
// Поэтому главная проверка тут круговая: serialize(apply(serialize(s))) обязан совпасть
// с serialize(s) побайтово. Она ловит всё, что снимок пишет, но не читает обратно.
//
// Обратное — поле, которого нет ни в записи, ни в чтении, — круг не ловит: оно просто
// невидимо. От этого защищает MATCH_STATE_SKIPPED_PLANE_FIELDS: каждое поле самолёта
// обязано быть либо в снимке, либо в этом списке с причиной, а полнота списка сверяется
// с живым объектом в браузере (см. scratchpad/roundtrip.js).

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

// Мир-стенд: два самолёта на сторону, мины, груз, флаги (один несут, второй уронили),
// предметы у обеих сторон.
function buildWorld(){
  const plane = (color, x, y) => ({
    x, y, angle: 0, color,
    isAlive: true, lifeState: 'alive', burning: false, shieldActive: false,
    flagColor: null, carriedFlagId: null, killAwardedThisLife: false,
    respawnState: 'at_base', respawnStage: 3, respawnPenaltyActive: false,
    respawnHalfTurnsRemaining: 0, respawnBlockedByEnemy: false,
    homeX: x, homeY: y, homeAngle: 0,
    activeTurnBuffs: {},
    // Кадровое, в снимок идти не должно.
    segments: [{ x, y }], prevX: x - 1, prevY: y - 1,
    collisionX: 5, collisionY: 6, glow: 0.5, crashStart: 1234.5,
  });

  const points = [plane('blue', 60, 40), plane('blue', 120, 40),
                  plane('green', 60, 600), plane('green', 120, 600)];
  points[0].burning = true;
  points[2].activeTurnBuffs = { wings: true, fuel: true };
  points[3].shieldActive = true;

  const flags = [
    { id: 'blue-0', color: 'blue', state: 'captured', carrier: points[2], droppedAt: null, layout: {} },
    { id: 'green-1', color: 'green', state: 'active', carrier: null, droppedAt: { x: 200, y: 400 }, layout: {} },
  ];

  const INVENTORY_ITEMS = [
    { type: 'fuel', iconPath: 'a.png' },
    { type: 'wings', iconPath: 'b.png' },
    { type: 'mine', iconPath: 'c.png' },
  ];

  const context = {
    Object, Array, Number, JSON, Math,
    points,
    flags,
    mines: [{ id: 'm1', owner: 'green', x: 180, y: 300 }, { id: 'm2', owner: 'blue', x: 120, y: 220 }],
    cargoState: [
      { x: 150.456, y: 320.123, state: 'idle', animStartedAt: 999, animDurationMs: 500, pickedAt: 7 },
      // Ящик в падении: он появляется в тот же миг, что и ход, поэтому в снимок попадает
      // регулярно.
      { x: 210.5, y: 280.25, state: 'animating', animStartedAt: 1000, animDurationMs: 500, pickedAt: null },
    ],
    aaUnits: [],
    flyingPoints: [{ plane: points[0] }],
    inventoryState: { blue: [INVENTORY_ITEMS[1]], green: [INVENTORY_ITEMS[0], INVENTORY_ITEMS[0], INVENTORY_ITEMS[2]] },
    INVENTORY_ITEMS,
    turnIndex: 1, roundNumber: 3, blueScore: 7, greenScore: 4,
    phase: 'TURN', currentPlacer: null, isGameOver: false,
    hasShotThisRound: true, duelModeActive: false,
    pendingInventoryUse: { color: 'blue', type: 'mine' },
    settings: { mapIndex: 5 },
    clampMapIndex: (index) => index,
    syncInventoryUI: () => {},
    invalidateHudCanvas: () => {},
  };
  vm.createContext(context);
  vm.runInContext([
    source.match(/const MATCH_STATE_VERSION = \d+;/)[0],
    source.match(/const MATCH_STATE_PLANE_FIELDS = Object\.freeze\(\[[\s\S]*?\]\);/)[0],
    source.match(/const MATCH_STATE_SKIPPED_PLANE_FIELDS = Object\.freeze\(\{[\s\S]*?\n\}\);/)[0],
    extractFunctionSource(source, 'serializeMatchState'),
    extractFunctionSource(source, 'applyMatchState'),
    'this.serializeMatchState = serializeMatchState;',
    'this.applyMatchState = applyMatchState;',
    'this.MATCH_STATE_VERSION = MATCH_STATE_VERSION;',
    'this.MATCH_STATE_PLANE_FIELDS = MATCH_STATE_PLANE_FIELDS;',
    'this.MATCH_STATE_SKIPPED_PLANE_FIELDS = MATCH_STATE_SKIPPED_PLANE_FIELDS;',
  ].join('\n'), context);
  return context;
}

// === 1. Круг: сохранить, испортить всё, восстановить — снимок тот же ===
{
  const world = buildWorld();
  const before = JSON.stringify(world.serializeMatchState());

  // Портим состояние до неузнаваемости.
  world.blueScore = 0; world.greenScore = 0; world.roundNumber = 1;
  world.turnIndex = 0; world.hasShotThisRound = false; world.isGameOver = true;
  world.mines.length = 0; world.cargoState.length = 0; world.aaUnits.length = 0;
  world.inventoryState.blue.length = 0; world.inventoryState.green.length = 0;
  for(const plane of world.points){
    plane.x = 1; plane.y = 1; plane.burning = false; plane.shieldActive = false;
    plane.activeTurnBuffs = {}; plane.isAlive = false; plane.lifeState = 'dead';
  }
  for(const flag of world.flags){ flag.carrier = null; flag.state = 'active'; flag.droppedAt = null; }

  assert(world.applyMatchState(JSON.parse(before)) === true,
    '1: снимок применяется');
  const after = JSON.stringify(world.serializeMatchState());
  assert(before === after,
    `1b: после восстановления снимок совпадает побайтово.\n  было:  ${before}\n  стало: ${after}`);
}

// === 2. Ссылки восстанавливаются ссылками, а не номерами ===
//
// Носитель флага в игре — ССЫЛКА на самолёт. По проводу едет номер, но обратно обязан
// превратиться в тот же объект: иначе проверки вида flag.carrier === plane развалятся.
{
  const world = buildWorld();
  const snapshot = world.serializeMatchState();
  assert(snapshot.flags[0].carrier === 2,
    `2: в снимке носитель флага — номер самолёта (сейчас ${JSON.stringify(snapshot.flags[0].carrier)})`);
  assert(snapshot.flags[1].carrier === -1,
    '2b: «никто не несёт» это -1, а не пропущенное поле');

  for(const flag of world.flags) flag.carrier = null;
  world.applyMatchState(JSON.parse(JSON.stringify(snapshot)));
  assert(world.flags[0].carrier === world.points[2],
    '2c: обратно носитель становится тем же объектом самолёта');
  assert(world.flags[1].carrier === null,
    '2d: «никто не несёт» восстанавливается как null');
}

// === 3. Отметок времени в снимке нет ===
//
// crashStart и подобные считаются от performance.now(), который у второго игрока свой:
// приехавшее число означало бы там совсем другой момент.
{
  const world = buildWorld();
  const snapshot = world.serializeMatchState();
  const timeFields = ['crashStart', 'respawnHudCrossStart', 'invisibilityFadeStartAtMs',
                      'animStartedAt', 'pickedAt', 'lastTriggerAt'];
  const text = JSON.stringify(snapshot);
  for(const field of timeFields){
    assert(!text.includes(`"${field}"`),
      `3: поля времени «${field}» в снимке нет`);
    assert(field in world.MATCH_STATE_SKIPPED_PLANE_FIELDS
        || !world.MATCH_STATE_PLANE_FIELDS.includes(field),
      `3b: «${field}» не числится среди переносимых полей самолёта`);
  }
  // И конкретное значение из стенда не утекло.
  assert(!text.includes('1234.5'), '3c: отметка времени падения не уехала в снимок');
}

// === 4. Кадровое в снимок не идёт, а при восстановлении обнуляется ===
{
  const world = buildWorld();
  const text = JSON.stringify(world.serializeMatchState());
  for(const field of ['segments', 'prevX', 'prevY', 'collisionX', 'collisionY', 'glow']){
    assert(!text.includes(`"${field}"`), `4: кадровое поле «${field}» в снимок не идёт`);
  }

  world.applyMatchState(JSON.parse(text));
  assert(world.points[0].segments.length === 0,
    '4b: след полёта после восстановления пуст');
  assert(world.points[0].prevX === world.points[0].x,
    '4c: предыдущий кадр совпадает с текущим — полёта нет');
  assert(world.flyingPoints.length === 0,
    '4d: летящих самолётов после восстановления нет: снимок берётся между ходами');
  assert(world.pendingInventoryUse === null,
    '4e: незавершённое применение предмета не переезжает');

  // Падающий ящик — тоже кадровое, только заметное не сразу.
  //
  // Груз появляется в том же месте кода, где переключается ход, поэтому в снимок он
  // попадает ровно в разгар своего падения. Координаты у него финальные с самого начала,
  // а «animating» всегда заканчивается одним и тем же «ready» — значит, записать надо
  // сразу «ready». Иначе у отправителя ящик ещё летит, а у получателя применённый снимок
  // кладёт его немедленно, и партии расходятся на время падения.
  const snapshot = JSON.parse(text);
  assert(snapshot.cargo[1].state === 'ready',
    `4f: падающий ящик записан упавшим (сейчас «${snapshot.cargo[1].state}»)`);
  assert(snapshot.cargo[1].x === 210.5 && snapshot.cargo[1].y === 280.25,
    '4g: и там же, где упадёт — координаты у него финальные с самого начала');
  assert(snapshot.cargo[0].state === 'idle',
    '4h: остальные состояния груза не трогаем');
}

// === 5. Эффекты предметов переносятся именами, а не ссылками ===
{
  const world = buildWorld();
  const snapshot = world.serializeMatchState();
  assert(JSON.stringify(snapshot.planes[2].buffs) === JSON.stringify(['fuel', 'wings']),
    `5: эффекты хода едут списком имён по алфавиту (сейчас ${JSON.stringify(snapshot.planes[2].buffs)})`);

  world.points[2].activeTurnBuffs = {};
  world.applyMatchState(JSON.parse(JSON.stringify(snapshot)));
  assert(world.points[2].activeTurnBuffs.wings === true
      && world.points[2].activeTurnBuffs.fuel === true,
    '5b: обратно эффекты становятся картой признаков');

  // Инвентарь тоже: по проводу типы, обратно — определения предметов из справочника.
  assert(JSON.stringify(snapshot.inventory.green) === JSON.stringify(['fuel', 'fuel', 'mine']),
    '5c: инвентарь едет типами предметов');
  assert(world.inventoryState.green.every((item) => item && typeof item.iconPath === 'string'),
    '5d: обратно в инвентаре лежат полноценные определения предметов, а не строки');
}

// === 6. Чужой формат отвергается ===
//
// Иначе снимок от другой версии игры тихо разложится наполовину.
{
  const world = buildWorld();
  assert(world.applyMatchState({ ...world.serializeMatchState(), v: 999 }) === false,
    '6: снимок другой версии не применяется');
  assert(world.applyMatchState(null) === false, '6b: пустой снимок не применяется');
  assert(world.applyMatchState('строка') === false, '6c: мусор вместо снимка не применяется');
}

// === 7. У каждого пропущенного поля записана причина ===
//
// Список — не свалка: по нему потом решают, надо ли поле переносить.
{
  const world = buildWorld();
  const skipped = world.MATCH_STATE_SKIPPED_PLANE_FIELDS;
  const names = Object.keys(skipped);
  assert(names.length > 0, '7: список пропущенных полей не пуст');
  for(const name of names){
    assert(typeof skipped[name] === 'string' && skipped[name].trim().length > 8,
      `7b: у поля «${name}» записана причина, почему оно не переносится`);
    assert(!world.MATCH_STATE_PLANE_FIELDS.includes(name),
      `7c: поле «${name}» не может быть одновременно и переносимым, и пропущенным`);
  }
}

console.log('Smoke test passed: снимок партии переживает круг «сохранить — испортить — восстановить» побайтово, ссылки остаются ссылками, отметки времени и кадровое в него не попадают.');
