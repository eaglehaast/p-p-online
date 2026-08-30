#!/usr/bin/env node
'use strict';

// Smoke test: провод между двумя игроками.
//
// Сервера пока нет — есть BroadcastChannel и две вкладки. Но проверять надо не «две
// вкладки видят друг друга» (это увидит и глаз), а те четыре вещи, на которых онлайн
// разъезжается ТИХО:
//
//   1. Своё эхо. BroadcastChannel себе не отвечает, а сервер-ретранслятор обычно шлёт
//      всем, включая отправителя. Без проверки отправителя мы разыграли бы собственный
//      ход второй раз — и заметили бы это не сразу, а через ход.
//   2. Повтор пакета. После обрыва провод досылает пропущенное; ход, применённый дважды,
//      хуже неполученного.
//   3. Момент применения. Снимок, приехавший посреди полёта, обрывает его на середине:
//      у отправителя полёт уже кончился, у нас ещё нет.
//   4. Порядок «предметы, потом запуск». Топливо и крылья меняют САМ полёт: приехав
//      после запуска, они опоздали бы, и самолёт у соперника улетел бы не туда.
//
// Плюс то, ради чего затевался слой «место за столом»: чужой стороной нельзя ходить
// руками, но и запускать её не надо — она не ИИ.

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

// Стенд: два «устройства», соединённых через общую шину. Каждое — свой мир с четырьмя
// самолётами; на каждом крутится своя копия онлайн-слоя из script.js.
function buildTable(){
  const bus = { subscribers: [], delivered: [] };

  const makeSeat = (seat) => {
    const points = ['blue', 'blue', 'green', 'green'].map((color, index) => ({
      color, x: 40 + index * 10, y: color === 'blue' ? 40 : 600,
      angle: 0, isAlive: true, burning: false, activeTurnBuffs: {},
    }));

    const log = [];
    const sandbox = {
      Object, Array, Number, Math, JSON, Date, URLSearchParams,
      console: { log(){}, warn(...args){ log.push(['warn', ...args]); } },
      points,
      flyingPoints: [],
      turnColors: ['green', 'blue'],
      turnIndex: 0,
      lastFirstTurn: 0,
      gameMode: 'hotSeat',
      // Настройки комнаты (шаг 4) — их подробная проверка в smoke-online-relay.js,
      // здесь они нужны лишь для того, чтобы стенд поднялся целиком.
      selectedRuleset: 'classic',
      settings: { flightRangeCells: 30, aimingAmplitude: 80, addAA: false, sharpEdges: true,
                  flagsEnabled: true, addCargo: true, arcadeMode: false, mapIndex: 0,
                  randomizeMapEachRound: false },
      loadMapTesterPlacements: () => ({}),
      loadSettingsForRuleset: () => {},
      syncRulesButtonSkins: () => {},
      randomMapPairSequenceNumber: null,
      randomMapPairIndex: null,
      mines: [],
      inventoryState: { blue: [], green: [] },
      isAimSessionActive: () => false,
      // Последствия реванша в стенде только записываются: сам он проверяется отдельно,
      // в smoke-online-rematch.js.
      HTMLElement: function HTMLElement(){},
      endGameDiv: null,
      onlineLobbyDiv: null, onlineLobbyStatusEl: null,
      syncPlayButtonSkin(){},
      handlePlayStart(){ log.push(['handlePlayStart']); },
      hideOnlineLobby(){},
      resetGame(){ log.push(['resetGame']); },
      startRematchRound(){ log.push(['startRematchRound']); },
      // Заглушки того, что онлайн-слой вызывает наружу. Всё записываем: тест смотрит
      // не на возвращаемые значения, а на то, ЧТО и в каком порядке было вызвано.
      runLaunchReleaseStage({ plane, vx, vy, actor }){
        log.push(['launch', points.indexOf(plane), vx, vy, actor]);
        sandbox.flyingPoints.push({ plane, vx, vy });
        return { ok: true };
      },
      useInventoryItemOnPlane(color, type, plane, options){
        log.push(['item-plane', color, type, points.indexOf(plane), options?.actor ?? null]);
        return true;
      },
      applyInventoryItemAtBoardPlacement(item, placement, context, options){
        log.push(['item-board', item.color, item.type, placement.boardX, placement.boardY,
                  options?.actor ?? null]);
        return true;
      },
      removeItemFromInventory(color, type){ log.push(['inventory-remove', color, type]); },
      applyMatchState(state){ log.push(['state', JSON.stringify(state)]); return true; },
      serializeMatchState(){ return { v: 1, seat, turnIndex: sandbox.turnIndex }; },
      window: { location: { search: `?seat=${seat}&room=stand` } },
    };
    vm.createContext(sandbox);

    // Провод стенда: та же форма, что у BroadcastChannel-транспорта, но с общей шиной,
    // которая — в отличие от настоящего BroadcastChannel — отдаёт пакет ВСЕМ, включая
    // отправителя. Так проверка на своё эхо оказывается под нагрузкой.
    sandbox.createStandTransport = (room) => {
      const handlers = [];
      const entry = { room, handlers };
      bus.subscribers.push(entry);
      return {
        kind: 'stand',
        post(envelope){
          bus.delivered.push(envelope);
          const frozen = JSON.parse(JSON.stringify(envelope));
          for(const sub of bus.subscribers){
            if(sub.room !== room) continue;
            for(const handler of sub.handlers) handler(frozen);
          }
        },
        receive(handler){ handlers.push(handler); },
        close(){ entry.handlers = []; },
      };
    };

    vm.runInContext([
      source.match(/const COLOR_CONTROLLERS = Object\.freeze\(\{[^}]*\}\);/)[0],
      source.match(/const AI_PLAYER_COLOR = "[^"]*";/)[0],
      source.match(/const ONLINE_SEAT_COLORS = Object\.freeze\(\[[^\]]*\]\);/)[0],
      source.match(/const ONLINE_ROOM_FALLBACK = "[^"]*";/)[0],
      source.match(/const ONLINE_ROOM_MAX_LENGTH = \d+;/)[0],
      source.match(/const ONLINE_CHANNEL_PREFIX = "[^"]*";/)[0],
      source.match(/const ONLINE_PROTOCOL_VERSION = \d+;/)[0],
      source.match(/const ONLINE_RELAY_URL = "[^"]*";/)[0],
      source.match(/const ONLINE_HOST_SEAT = "[^"]*";/)[0],
      source.match(/const ONLINE_ROOM_SETTING_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/)[0],
      'let onlineSession = null; let onlineInbox = []; let onlineTurnDraft = null;',
      'let onlineRoomPlacements = null;',
      extractFunctionSource(source, 'getColorController'),
      extractFunctionSource(source, 'isLocalColor'),
      extractFunctionSource(source, 'isAiColor'),
      extractFunctionSource(source, 'isRemoteColor'),
      extractFunctionSource(source, 'resolveOnlineRelayAddress'),
      extractFunctionSource(source, 'parseOnlineSeatFromSearch'),
      extractFunctionSource(source, 'getOnlineSeatColor'),
      extractFunctionSource(source, 'getSharedRandomFraction'),
      extractFunctionSource(source, 'isOnlineMatchActive'),
      extractFunctionSource(source, 'startOnlineSession'),
      extractFunctionSource(source, 'stopOnlineSession'),
      extractFunctionSource(source, 'sendMove'),
      extractFunctionSource(source, 'sendState'),
      extractFunctionSource(source, 'onRemoteMove'),
      extractFunctionSource(source, 'onRemoteState'),
      extractFunctionSource(source, 'sendSettings'),
      extractFunctionSource(source, 'onRemoteSettings'),
      extractFunctionSource(source, 'sendRematchAnswer'),
      extractFunctionSource(source, 'onRemoteRematch'),
      extractFunctionSource(source, 'resetOnlineRematchAnswers'),
      extractFunctionSource(source, 'answerOnlineRematch'),
      extractFunctionSource(source, 'receiveOnlineRematchAnswer'),
      extractFunctionSource(source, 'resolveOnlineRematch'),
      extractFunctionSource(source, 'applyRematchWaitingUi'),
      // Лобби: присутствие и готовность. Подробно проверяются в smoke-online-lobby.js.
      extractFunctionSource(source, 'isOnlineTableFull'),
      extractFunctionSource(source, 'receiveOnlinePresence'),
      extractFunctionSource(source, 'sendOnlineReady'),
      extractFunctionSource(source, 'receiveOnlineReady'),
      extractFunctionSource(source, 'maybeStartOnlineMatch'),
      extractFunctionSource(source, 'refreshOnlineLobbyUi'),
      extractFunctionSource(source, 'getOnlineLobbyStatusText'),
      'let onlinePresence = null; let onlineReady = { mine: false, theirs: false };',
      extractFunctionSource(source, 'isOnlineHostSeat'),
      extractFunctionSource(source, 'collectOnlineRoomSettings'),
      extractFunctionSource(source, 'publishOnlineRoomSettings'),
      extractFunctionSource(source, 'applyOnlineRoomSettings'),
      extractFunctionSource(source, 'postOnlineEnvelope'),
      extractFunctionSource(source, 'receiveOnlineEnvelope'),
      extractFunctionSource(source, 'recordOnlineTurnAction'),
      extractFunctionSource(source, 'publishOnlineTurnMove'),
      extractFunctionSource(source, 'publishOnlineStateAfterTurn'),
      extractFunctionSource(source, 'isBoardIdleForRemoteInput'),
      extractFunctionSource(source, 'drainOnlineInbox'),
      extractFunctionSource(source, 'applyRemoteTurnMove'),
      extractFunctionSource(source, 'applyRemoteInventoryAction'),
      'this.api = {',
      '  startOnlineSession, stopOnlineSession, sendMove, sendState,',
      '  onRemoteMove, onRemoteState, receiveOnlineEnvelope,',
      '  recordOnlineTurnAction, publishOnlineTurnMove, publishOnlineStateAfterTurn,',
      '  drainOnlineInbox, applyRemoteTurnMove, applyRemoteInventoryAction,',
      '  getColorController, isLocalColor, isAiColor, isRemoteColor,',
      '  parseOnlineSeatFromSearch, isBoardIdleForRemoteInput, getSharedRandomFraction,',
      '  firstTurn: () => lastFirstTurn,',
      '  inboxSize: () => onlineInbox.length,',
      '  session: () => onlineSession,',
      '};',
    ].join('\n'), sandbox);

    sandbox.api.startOnlineSession({ createTransport: sandbox.createStandTransport });
    return { seat, sandbox, log, api: sandbox.api, points };
  };

  return { bus, blue: makeSeat('blue'), green: makeSeat('green') };
}

// === 1. Место за столом читается из адреса ===
{
  const table = buildTable();
  const parse = table.blue.api.parseOnlineSeatFromSearch;
  assert(parse('?seat=green&room=abc').seat === 'green', '1: сторона берётся из адреса');
  assert(parse('?seat=green&room=abc').room === 'abc', '1b: комната берётся из адреса');
  assert(parse('?seat=BLUE').seat === 'blue', '1c: регистр не важен');
  assert(parse('?seat=green').room === 'local',
    '1d: без комнаты играем в комнате по умолчанию — иначе две пары игроков слышали бы друг друга');
  assert(parse('?seat=red') === null, '1e: третьей стороны за столом нет');
  assert(parse('') === null, '1f: без места за столом онлайна нет — обычная игра');
  assert(parse('?seat=green&room=' + 'x'.repeat(500)).room.length === 64,
    '1g: длина комнаты ограничена');
}

// === 2. Своя сторона, чужая сторона и сторона ИИ — три разные вещи ===
{
  const table = buildTable();
  const blue = table.blue.api;
  assert(blue.isLocalColor('blue'), '2: за своё место ходим руками');
  assert(!blue.isLocalColor('green'), '2b: за чужое место руками не ходим');
  assert(blue.isRemoteColor('green'), '2c: чужое место — удалённый игрок');
  assert(!blue.isAiColor('green'),
    '2d: удалённый игрок — НЕ ИИ: его не надо запускать, его ход приедет сам');

  // Сев за стол, ИИ не играет ни за кого — даже если в настройках осталась игра против
  // компьютера. Иначе синими ходили бы двое: удалённый игрок и местный ИИ.
  table.blue.sandbox.gameMode = 'computer';
  assert(!blue.isAiColor('blue') && !blue.isAiColor('green'),
    '2e: за онлайновым столом ИИ не играет ни за кого');
  assert(blue.isLocalColor('blue') && blue.isRemoteColor('green'),
    '2f: места за столом от режима игры не зависят');
}

// === 3. Ход доезжает до соперника и разыгрывается у него ===
{
  const table = buildTable();
  // Синий использует топливо на своём самолёте и запускает его.
  table.blue.api.recordOnlineTurnAction('blue', { kind: 'plane', type: 'fuel', plane: 1 });
  table.blue.api.publishOnlineTurnMove(table.blue.points[1], 3.5, -2.25);

  assert(table.green.api.inboxSize() === 1, '3: ход приехал сопернику');
  table.green.api.drainOnlineInbox();

  const greenLog = table.green.log;
  const itemAt = greenLog.findIndex(([kind]) => kind === 'item-plane');
  const launchAt = greenLog.findIndex(([kind]) => kind === 'launch');
  assert(itemAt >= 0, '3b: предмет соперника применился');
  assert(launchAt >= 0, '3c: самолёт соперника взлетел');
  assert(itemAt < launchAt,
    '3d: ПРЕДМЕТЫ ПРИМЕНЯЮТСЯ ДО ЗАПУСКА — топливо и крылья меняют сам полёт, ' +
    'приехав после запуска они опоздали бы');

  assert(greenLog[launchAt][1] === 1, '3e: взлетел тот же самолёт (номер в points)');
  assert(greenLog[launchAt][2] === 3.5 && greenLog[launchAt][3] === -2.25,
    '3f: вектор запуска доехал без потерь');
  assert(greenLog[launchAt][4] === 'remote',
    '3g: запуск помечен чужим — иначе он уехал бы обратно и зациклился');
  assert(greenLog[itemAt][4] === 'remote',
    '3h: применение предмета помечено чужим — иначе оно уехало бы обратно');
}

// === 4. Своё эхо не разыгрывается второй раз ===
//
// Шина стенда отдаёт пакет всем, включая отправителя, — как это делает сервер.
{
  const table = buildTable();
  table.blue.api.publishOnlineTurnMove(table.blue.points[0], 1, 1);
  assert(table.blue.api.inboxSize() === 0,
    '4: собственный ход не встаёт в свою же очередь');
  assert(table.green.api.inboxSize() === 1, '4b: а до соперника доезжает');

  // Отдельно — что своё узнаётся именно ПО ОТПРАВИТЕЛЮ.
  //
  // Проверок тут две, и в обычной жизни они перекрываются: свой пакет всегда и с нашего
  // же места. Но перекрываются они только пока игроков двое и место у каждого одно, а
  // держится на этом ни много ни мало «не разыграть собственный ход дважды». Поэтому
  // проверяем отправителя там, где место сбито и подстраховать некому.
  const envelope = table.bus.delivered.at(-1);
  assert(table.blue.api.receiveOnlineEnvelope({
    ...JSON.parse(JSON.stringify(envelope)),
    seat: 'green',
    seq: envelope.seq + 10,
  }) === false, '4c: пакет от себя не принимается, даже если место в нём чужое');
}

// === 5. Повтор пакета отбрасывается ===
//
// После обрыва провод досылает пропущенное. Ход, разыгранный дважды, — это два взлёта
// вместо одного.
{
  const table = buildTable();
  table.blue.api.publishOnlineTurnMove(table.blue.points[0], 1, 1);
  const envelope = table.bus.delivered[table.bus.delivered.length - 1];

  const copy = JSON.parse(JSON.stringify(envelope));
  assert(table.green.api.receiveOnlineEnvelope(copy) === false,
    '5: тот же пакет второй раз не принимается');
  assert(table.green.api.inboxSize() === 1, '5b: в очереди по-прежнему один ход');

  // И отставший пакет с меньшим номером тоже.
  assert(table.green.api.receiveOnlineEnvelope({ ...copy, seq: envelope.seq - 1 }) === false,
    '5c: отставший пакет не принимается');
}

// === 6. Пакет чужой версии отвергается целиком ===
{
  const table = buildTable();
  table.blue.api.publishOnlineTurnMove(table.blue.points[0], 1, 1);
  const envelope = JSON.parse(JSON.stringify(table.bus.delivered.at(-1)));

  const fresh = buildTable();
  assert(fresh.green.api.receiveOnlineEnvelope({ ...envelope, p: 999, seq: 50 }) === false,
    '6: пакет чужой версии не принимается — иначе он разложился бы наполовину');
  assert(fresh.green.api.inboxSize() === 0, '6b: и в очередь не встаёт');

  // Чужая вкладка на нашем же месте: играть за одну сторону вдвоём нельзя.
  assert(fresh.green.api.receiveOnlineEnvelope({
    ...envelope, seat: 'green', from: 'someone-else', seq: 51,
  }) === false, '6c: пакет с нашего же места не принимается');
}

// === 7. Снимок ждёт, пока поле опустеет ===
//
// Это главное про момент применения: у отправителя полёт кончился, у нас ещё нет.
{
  const table = buildTable();
  table.blue.api.publishOnlineTurnMove(table.blue.points[0], 1, 1);
  table.blue.sandbox.turnIndex = 1;
  table.blue.api.publishOnlineStateAfterTurn('blue');

  assert(table.green.api.inboxSize() === 2, '7: приехали и ход, и снимок');

  // Поле занято — не применяем НИЧЕГО.
  table.green.sandbox.flyingPoints.push({});
  assert(table.green.api.drainOnlineInbox() === 0,
    '7b: пока на поле что-то летит, чужой ход и снимок ждут');
  assert(table.green.log.length === 0, '7c: и ничего не сделано');

  // Поле опустело — разыгрывается ход, и на этом цикл останавливается сам: самолёт
  // поднялся в воздух.
  table.green.sandbox.flyingPoints.length = 0;
  table.green.api.drainOnlineInbox();
  assert(table.green.log.some(([kind]) => kind === 'launch'), '7d: ход разыгран');
  assert(!table.green.log.some(([kind]) => kind === 'state'),
    '7e: снимок ЖДЁТ конца полёта, а не обрывает его на середине');
  assert(table.green.api.inboxSize() === 1, '7f: снимок остался в очереди');

  // Полёт кончился — снимок встаёт.
  table.green.sandbox.flyingPoints.length = 0;
  table.green.api.drainOnlineInbox();
  assert(table.green.log.some(([kind]) => kind === 'state'), '7g: снимок применён после полёта');
  assert(table.green.api.inboxSize() === 0, '7h: очередь пуста');
}

// === 8. Снимок шлёт тот, кто ходил ===
//
// Иначе оба отправляют своё состояние друг другу, и каждый затирает другому настоящее
// состояние пересчитанным.
{
  const table = buildTable();
  assert(table.blue.api.publishOnlineStateAfterTurn('blue') === true,
    '8: после своего хода снимок уходит');
  assert(table.blue.api.publishOnlineStateAfterTurn('green') === false,
    '8b: после чужого хода снимок не уходит — состояние соперника не наше дело');
}

// === 9. Предметы копятся до запуска и уезжают вместе с ним ===
{
  const table = buildTable();
  table.blue.api.recordOnlineTurnAction('blue', { kind: 'plane', type: 'wings', plane: 0 });
  table.blue.api.recordOnlineTurnAction('blue', { kind: 'board', type: 'mine', x: 180, y: 300 });
  assert(table.green.api.inboxSize() === 0,
    '9: пока ход не сделан, соперник ничего не получает — один пакет на ход, а не на жест');

  table.blue.api.publishOnlineTurnMove(table.blue.points[0], 2, 2);
  const move = table.bus.delivered.at(-1).payload;
  assert(move.items.length === 2, '9b: оба предмета уехали вместе с ходом');
  assert(move.items[0].type === 'wings' && move.items[1].type === 'mine',
    '9c: в том же порядке, в каком применялись');

  // Следующий ход начинается с чистого листа.
  table.blue.api.publishOnlineTurnMove(table.blue.points[1], 1, 1);
  assert(table.bus.delivered.at(-1).payload.items.length === 0,
    '9d: предметы прошлого хода не уезжают второй раз');
}

// === 10. За чужую сторону ход не отправляется ===
//
// Ввод за чужую сторону и так заблокирован, но если он всё-таки просочится, наружу это
// уйти не должно: у соперника ход разыграется, и партии разъедутся.
{
  const table = buildTable();
  assert(table.blue.api.publishOnlineTurnMove(table.blue.points[2], 1, 1) === false,
    '10: ход за сторону соперника не отправляется');
  assert(table.blue.api.recordOnlineTurnAction('green', { kind: 'plane', type: 'fuel', plane: 2 }) === false,
    '10b: и предмет за сторону соперника не записывается');
}

// === 11. Чужой предмет на поле кладётся ТЕМ ЖЕ кодом, что и свой ===
//
// Раньше преобразование «пиксели курсора -> точка на поле» было переписано трижды.
// Онлайну нужен вход от готовой точки, и важно, чтобы это был тот же самый вход:
// «похожий» способ положить предмет — значит расходящийся.
{
  const table = buildTable();
  table.green.api.applyRemoteInventoryAction('blue', {
    kind: 'board', type: 'mine', x: 180, y: 300, cellX: 6, cellY: 11,
  });
  const placed = table.green.log.find(([kind]) => kind === 'item-board');
  assert(placed, '11: чужая мина легла через общий вход применения предмета');
  assert(placed[3] === 180 && placed[4] === 300, '11b: в приехавшую точку');
  assert(placed[5] === 'remote', '11c: помечена чужой, чтобы не уехать обратно');
  assert(table.green.log.some(([kind, color, type]) =>
    kind === 'inventory-remove' && color === 'blue' && type === 'mine'),
    '11d: и списалась из инвентаря соперника');

  assert(/function applyInventoryItemAtBoardPlacement\(/.test(source),
    '11e: общий вход от точки на поле существует');
  assert(!/function getMinePlacementFromDropPoint\(/.test(source)
      && !/function getDynamitePlacementFromDropPoint\(/.test(source),
    '11f: отдельных пересчётов координат под каждый предмет не осталось');
}

// === 12. Ход про несуществующий самолёт не роняет игру ===
{
  const table = buildTable();
  assert(table.green.api.applyRemoteTurnMove({ color: 'blue', plane: 99, vx: 1, vy: 1 }) === false,
    '12: ход про самолёт, которого нет, отвергается');
  assert(table.green.api.applyRemoteTurnMove(null) === false, '12b: пустой ход отвергается');
  assert(!table.green.log.some(([kind]) => kind === 'launch'),
    '12c: и ничего не запускает');
  assert(table.green.log.some(([kind]) => kind === 'warn'),
    '12d: но в консоль об этом сказано — молчаливая потеря хода хуже шумной');
}

// === 13. Провод — единственное место, которое знает, ЧЕМ соединены игроки ===
//
// Сервер должен заменить ровно одну функцию. Если BroadcastChannel просочился в игровой
// код, замена превратится в раскопки.
{
  const factory = extractFunctionSource(source, 'createBroadcastTransport');
  const strays = source
    .split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    // Не считаем упоминания в комментариях и в тексте сообщений: там оно объясняет, а
    // не вызывает.
    .filter(({ line }) => /BroadcastChannel/.test(line.replace(/\/\/.*$/, '').replace(/"[^"]*"/g, '""')))
    .filter(({ line }) => !factory.includes(line.trim()));
  assert(strays.length === 0,
    `13: BroadcastChannel упоминается только в createBroadcastTransport; ` +
    `найдено ещё: ${strays.map((s) => s.number).join(', ')}`);

  for(const fnName of ['sendMove', 'sendState', 'onRemoteMove', 'onRemoteState']){
    assert(new RegExp(`function ${fnName}\\(`).test(source),
      `13b: функция провода ${fnName} объявлена`);
  }
}

// === 14. Общий жребий: карта и первый ход выбираются одинаково у обоих ===
//
// Это НЕ мелочь про случайность. Игра бросает кости дважды — какая будет карта и кто
// ходит первым, — и оба броска происходили на каждом устройстве отдельно. В хот-сите это
// незаметно, а в онлайне даёт не «рассинхрон на кадр», а две разные партии: один играет
// на своём поле, другой на своём, и оба уверены, что соперник жульничает.
//
// Проверку писать пришлось после того, как это поймала настоящая игра в двух вкладках:
// стороны разошлись уже на первом ходе, потому что первым ходил у каждого свой.
{
  const table = buildTable();
  const roll = table.blue.api.getSharedRandomFraction;
  const rollGreen = table.green.api.getSharedRandomFraction;

  // Одна комната, один повод — один и тот же результат на обоих устройствах.
  for(const label of ['first-turn', 'map:1', 'map:2', 'map:7']){
    assert(roll(label) === rollGreen(label),
      `14: «${label}» выпадает одинаково у обоих — иначе это две разные партии`);
    assert(roll(label) === roll(label), `14b: «${label}» не меняется от броска к броску`);
    const value = roll(label);
    assert(value >= 0 && value < 1, `14c: «${label}» это доля от 0 до 1 (сейчас ${value})`);
  }

  // Разные поводы — разные броски, иначе карта была бы привязана к первому ходу.
  const rounds = new Set(['map:1', 'map:2', 'map:3', 'map:4', 'map:5'].map(roll));
  assert(rounds.size > 1, '14d: у разных раундов жребий разный, а не один на всю партию');

  // Первый ход выбран при посадке за стол, а не оставлен на волю Math.random().
  const starter = extractFunctionSource(source, 'startOnlineSession');
  assert(/firstTurnBase = getSharedRandomFraction\("first-turn"\)/.test(starter),
    '14e: садясь за стол, первый ход берут из общего жребия');
  assert(typeof table.blue.api.firstTurn() === 'number'
      && table.blue.api.firstTurn() === table.green.api.firstTurn(),
    '14f: и он совпал у обоих');

  // И дальше он считается ОТ НОМЕРА РАУНДА, а не прибавлением к прошлому значению.
  //
  // Чередование прибавлением зависит от того, сколько раз оно случилось, — а у гостя,
  // который садится за стол до загрузочного раунда, и у хозяина, который садится после,
  // это число разное. Одного лишнего прибавления хватало, чтобы стороны разошлись во
  // мнении, чей сейчас ход: поймано настоящим лобби в двух браузерах.
  const round = extractFunctionSource(source, 'startNewRound');
  assert(/lastFirstTurn = \(onlineSession\.firstTurnBase \+ upcomingRoundNumber\) % 2;/.test(round),
    '14j: в комнате первый ход считается от номера раунда');
  assert(/lastFirstTurn = 1 - lastFirstTurn;/.test(round),
    '14k: офлайн чередование осталось прежним');

  // Выбор карты, сделанный до входа в комнату, при посадке забывается: он бросался
  // своими костями, а в комнате кости общие.
  assert(/randomMapPairSequenceNumber = null;/.test(starter),
    '14l: садясь за стол, забываем карту, выбранную своими костями — иначе хозяин ' +
    'войдёт в комнату с уже запомненной картой, а гость посчитает жребий заново');

  // Карта тоже.
  const mapPick = extractFunctionSource(source, 'getRandomPlayableMapIndex');
  assert(/getSharedRandomFraction\(`map:/.test(mapPick),
    '14g: случайная карта выбирается общим жребием');
  assert(!/Math\.random\(\)/.test(mapPick),
    '14h: и своего Math.random() у неё не осталось');

  // Офлайн — обычная случайность: привязывать одиночную игру к комнате незачем.
  const offline = buildTable();
  offline.blue.api.stopOnlineSession();
  const offlineRolls = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(() => offline.blue.api.getSharedRandomFraction('map:1')));
  assert(offlineRolls.size > 1,
    '14i: без комнаты жребий обычный случайный, а не приколоченный');
}

console.log('Smoke test passed: ход и снимок доезжают до соперника, своё эхо и повторы отбрасываются, предметы применяются до запуска, снимок ждёт конца полёта, а карта и первый ход выпадают одинаково у обоих.');
