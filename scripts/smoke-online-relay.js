#!/usr/bin/env node
'use strict';

// Smoke test: ретранслятор, настройки комнаты и возвращение после обрыва.
//
// Шаг 3 научил две вкладки играть друг с другом. Здесь между ними появляется сервер — и
// вместе с ним три вещи, каждая из которых ломается по-своему тихо:
//
//   1. Комната. Она НЕ ЗНАЕТ игру: для неё пакет — непрозрачный конверт. Проверяется не
//      «пересылает», а что она придерживает ровно то, без чего вернувшийся игрок не
//      сможет продолжить, и что занятое место она отдаёт, а не защищает.
//
//   2. Настройки создателя. Общий жребий из шага 3 выбирает карту одинаково — но ИЗ
//      СВОЕГО НАБОРА у каждого. Раскладка карт по тирам живёт в localStorage, и если у
//      гостя она другая, «одинаковый жребий» выберет разные карты. Это не гипотеза: ровно
//      так и было записано в дырках шага 3.
//
//   3. Возвращение после обрыва. Тут есть ловушка, которую видно только если про неё
//      знать: перезагрузившийся игрок начинает нумерацию пакетов заново с единицы, а у
//      соперника счётчик уже дошёл до восьми — и все его ходы отбрасываются как
//      «отставшие», молча и навсегда.

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

// Клиентский стенд: одно «устройство» со своей копией онлайн-слоя.
function makeClient(seat, { room = 'stand', placements = {}, ruleset = 'classic', settings = null } = {}){
  const log = [];
  const sent = [];
  const sandbox = {
    Object, Array, Number, Math, JSON, Date, URLSearchParams,
    console: { log(){}, warn(...a){ log.push(['warn', ...a]); }, error(...a){ log.push(['error', ...a]); } },
    points: ['blue', 'blue', 'green', 'green'].map((color, i) => ({
      color, x: 40 + i * 10, y: color === 'blue' ? 40 : 600, isAlive: true, burning: false,
    })),
    flyingPoints: [],
    turnColors: ['green', 'blue'],
    turnIndex: 0,
    lastFirstTurn: 0,
    gameMode: 'hotSeat',
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
    runLaunchReleaseStage(){ return { ok: true }; },
    useInventoryItemOnPlane(){ return true; },
    applyInventoryItemAtBoardPlacement(){ return true; },
    removeItemFromInventory(){},
    applyMatchState(state){ log.push(['state', JSON.stringify(state)]); return true; },
    serializeMatchState(){ return { v: 1, seat, turnIndex: sandbox.turnIndex }; },
    // Настройки этого устройства.
    selectedRuleset: ruleset,
    settings: settings || {
      flightRangeCells: 30, accuracyPercent: 80, addAA: false, sharpEdges: true,
      flagsEnabled: true, addCargo: true, arcadeMode: false, mapIndex: 0,
      randomizeMapEachRound: false, flameStyle: 'icy',
    },
    storedPlacements: placements,
    loadSettingsForRuleset(next){ log.push(['loadSettingsForRuleset', next]); },
    syncRulesButtonSkins(next){ log.push(['syncRulesButtonSkins', next]); },
    randomMapPairSequenceNumber: 3,
    randomMapPairIndex: 11,
    window: { location: { search: `?seat=${seat}&room=${room}` } },
  };
  vm.createContext(sandbox);

  // Провод стенда: пакеты не уходят никуда сами — их переносит комната, как настоящий
  // ретранслятор, а не общая шина.
  sandbox.makeTransport = () => {
    const handlers = [];
    return {
      kind: 'stand',
      status: () => 'online',
      post(envelope){ sent.push(JSON.parse(JSON.stringify(envelope))); },
      receive(handler){ handlers.push(handler); },
      close(){ handlers.length = 0; },
      deliver(envelope){ for(const h of handlers) h(JSON.parse(JSON.stringify(envelope))); },
      handlers,
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
    source.match(/const ONLINE_ROOM_SETTING_LEGACY_KEYS = Object\.freeze\(\{[\s\S]*?\}\);/)[0],
    'let onlineSession = null; let onlineInbox = []; let onlineTurnDraft = null;',
    'let onlineRoomPlacements = null;',
    // Настоящая loadMapTesterPlacements: именно её подмена раскладкой комнаты и
    // проверяется, поэтому берём её из script.js, а не пишем заглушку.
    extractFunctionSource(source, 'loadMapTesterPlacements')
      .replace('getStoredSetting(MAP_TESTER_PLACEMENTS_STORAGE_KEY)', 'JSON.stringify(storedPlacements)'),
    extractFunctionSource(source, 'getColorController'),
    extractFunctionSource(source, 'isLocalColor'),
    extractFunctionSource(source, 'isAiColor'),
    extractFunctionSource(source, 'isRemoteColor'),
    extractFunctionSource(source, 'resolveOnlineRelayAddress'),
    extractFunctionSource(source, 'parseOnlineSeatFromSearch'),
    extractFunctionSource(source, 'isOnlineHostSeat'),
    extractFunctionSource(source, 'getOnlineSeatColor'),
    extractFunctionSource(source, 'getSharedRandomFraction'),
    extractFunctionSource(source, 'isOnlineMatchActive'),
    extractFunctionSource(source, 'startOnlineSession'),
    extractFunctionSource(source, 'stopOnlineSession'),
    extractFunctionSource(source, 'sendMove'),
    extractFunctionSource(source, 'sendState'),
    extractFunctionSource(source, 'sendSettings'),
    extractFunctionSource(source, 'onRemoteMove'),
    extractFunctionSource(source, 'onRemoteState'),
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
    '  startOnlineSession, stopOnlineSession, receiveOnlineEnvelope, drainOnlineInbox,',
    '  publishOnlineTurnMove, publishOnlineStateAfterTurn, publishOnlineRoomSettings,',
    '  collectOnlineRoomSettings, applyOnlineRoomSettings, loadMapTesterPlacements,',
    '  isOnlineHostSeat, isLocalColor, getSharedRandomFraction,',
    '  parseOnlineSeatFromSearch, resolveOnlineRelayAddress,',
    '  session: () => onlineSession,',
    '  inboxSize: () => onlineInbox.length,',
    '  mapCache: () => [randomMapPairSequenceNumber, randomMapPairIndex],',
    '};',
  ].join('\n'), sandbox);

  const transport = sandbox.makeTransport();
  sandbox.api.startOnlineSession({ seat, room, createTransport: () => transport });
  return { seat, sandbox, log, sent, transport, api: sandbox.api };
}

// === 1. Комната ретранслятора ===
(async () => {
const relay = await import('../worker/room.js');

{
  const { createRoom, joinRoom, routeEnvelope, leaveRoom, isRoomEmpty,
          RELAY_PROTOCOL_VERSION, RELAY_KEPT_TYPES, RELAY_ERRORS, parseJoinRequest } = relay;

  const room = createRoom();
  const blueSocket = { id: 'blue-1' };
  const greenSocket = { id: 'green-1' };

  assert(joinRoom(room, { seat: 'red', version: RELAY_PROTOCOL_VERSION, connection: blueSocket }).error
    === RELAY_ERRORS.BAD_SEAT, '1: третьего места за столом нет');
  assert(joinRoom(room, { seat: 'blue', version: 999, connection: blueSocket }).error
    === RELAY_ERRORS.BAD_VERSION,
    '1b: клиент чужой версии не пускают — иначе он молча сидел бы в комнате и не понимал пакетов');

  const blueJoin = joinRoom(room, { seat: 'blue', version: RELAY_PROTOCOL_VERSION, connection: blueSocket });
  assert(blueJoin.ok && blueJoin.replay.length === 0,
    '1c: первому в пустой комнате показывать нечего');
  joinRoom(room, { seat: 'green', version: RELAY_PROTOCOL_VERSION, connection: greenSocket });

  // Пересылка — ровно одному, второму месту.
  const move = { p: 1, t: 'move', from: 'blue-a', seat: 'blue', seq: 1, payload: {} };
  const routed = routeEnvelope(room, 'blue', move);
  assert(routed.connection === greenSocket,
    '1d: пакет уходит второму месту, а не рассылается всем — при третьем игроке разница станет видна');
  assert(routed.kept === false, '1e: ход комната не придерживает: он одноразовый');

  // Придерживается то, без чего вернувшийся не сможет продолжить.
  const settings = { p: 1, t: 'settings', from: 'blue-a', seat: 'blue', seq: 2, payload: { ruleset: 'classic' } };
  const state = { p: 1, t: 'state', from: 'blue-a', seat: 'blue', seq: 3, payload: { v: 1 } };
  assert(routeEnvelope(room, 'blue', settings).kept === true, '1f: настройки комнаты придерживаются');
  assert(routeEnvelope(room, 'blue', state).kept === true, '1g: снимок партии придерживается');
  assert(RELAY_KEPT_TYPES.length === 2,
    '1h: придерживается ровно то, без чего не продолжить, и ничего сверх');

  // Занятое место ОТДАЁТСЯ, а не защищается.
  const greenAgain = { id: 'green-2' };
  const retake = joinRoom(room, { seat: 'green', version: RELAY_PROTOCOL_VERSION, connection: greenAgain });
  assert(retake.ok, '1i: вернувшийся садится на своё место');
  assert(retake.evicted === greenSocket,
    '1j: прежнее соединение вытесняется — оборвавшийся сокет сервер замечает не сразу, ' +
    'и отказ означал бы «подождите, пока мы заметим, что вас нет»');
  assert(retake.replay.length === 2,
    '1k: вернувшемуся показывают и настройки, и снимок');
  assert(retake.replay[0].t === 'settings',
    '1l: настройки ПЕРЕД снимком — иначе гость на миг окажется со снимком чужой партии на своей карте');
  assert(retake.replay.every((envelope) => envelope.replay === true),
    '1l2: досланное помечено — без пометки вернувшийся отвергнет собственный снимок ' +
    'как «чужую вкладку на нашем месте» (см. раздел 5a)');
  assert(state.replay === undefined,
    '1l3: пометка ставится на копии: придержанный оригинал ею не портится');

  // Уход с места — только своим соединением.
  assert(leaveRoom(room, 'green', greenSocket) === false,
    '1m: закрывшийся старый сокет не выгоняет вернувшегося игрока');
  assert(leaveRoom(room, 'green', greenAgain) === true, '1n: своё соединение место освобождает');
  assert(!isRoomEmpty(room), '1o: синий ещё в комнате');
  leaveRoom(room, 'blue', blueSocket);
  assert(isRoomEmpty(room), '1p: комната опустела');

  const parsed = parseJoinRequest('wss://relay.example/room/abc?seat=green&v=1');
  assert(parsed.room === 'abc' && parsed.seat === 'green' && parsed.version === 1,
    '1q: адрес подключения разбирается');
  assert(parseJoinRequest('wss://relay.example/nope?seat=green&v=1').room === null,
    '1r: чужой адрес комнатой не считается');
}

// === 2. Комната не знает игру ===
//
// Иначе правила пришлось бы держать в двух местах и обновлять синхронно — а забытое
// обновление сервера выглядело бы как ошибка в игре.
{
  const roomSource = fs.readFileSync('worker/room.js', 'utf8');
  for(const word of ['plane', 'самолёт', 'turnIndex', 'mine', 'cargo', 'flag', 'inventory']){
    assert(!new RegExp(word, 'i').test(roomSource),
      `2: комната ничего не знает про «${word}» — для неё пакет непрозрачен`);
  }
  // Слова в комментариях не считаются: проверять надо вызов, а не рассказ о нём.
  const workerSource = fs.readFileSync('worker/index.js', 'utf8')
    .split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');
  assert(/state\.blockConcurrencyWhile\(/.test(workerSource),
    '2b: после сна состояние восстанавливается до того, как придёт первый пакет');
  assert(/state\.getWebSockets\(\)/.test(workerSource),
    '2c: места после сна восстанавливаются по живым сокетам — память сон не переживает');
  assert(/storage\.put/.test(workerSource) && /storage\.get/.test(workerSource),
    '2d: придержанные пакеты лежат в хранилище, а не в памяти: иначе сон стирал бы их');
  assert(/acceptWebSocket/.test(workerSource),
    '2e: спящий режим включён — без него платить пришлось бы за круглосуточно висящий сокет');

  const config = fs.readFileSync('worker/wrangler.toml', 'utf8');
  assert(/new_sqlite_classes/.test(config) && !/new_classes\s*=/.test(config),
    '2f: миграция на SQLite — на бесплатном плане другие Durable Objects не создать');
}

// === 3. Настройки комнаты: играем по правилам создателя ===
{
  // У гостя ДРУГАЯ раскладка карт и другие настройки — ровно тот случай, из-за которого
  // общий жребий выбрал бы разные карты.
  const host = makeClient('blue', {
    placements: { cells: 'hard', turtle: 'easy' },
    settings: { flightRangeCells: 44, accuracyPercent: 60, addAA: false, sharpEdges: false,
                flagsEnabled: false, addCargo: false, arcadeMode: true, mapIndex: 5,
                randomizeMapEachRound: true, flameStyle: 'icy' },
  });
  const guest = makeClient('green', {
    placements: { hallways: 'archive' },
    ruleset: 'advanced',
    settings: { flightRangeCells: 12, accuracyPercent: 99, addAA: true, sharpEdges: true,
                flagsEnabled: true, addCargo: true, arcadeMode: false, mapIndex: 1,
                randomizeMapEachRound: false, flameStyle: 'inferno' },
  });

  assert(host.api.isOnlineHostSeat() === true && guest.api.isOnlineHostSeat() === false,
    '3: создатель комнаты один, и выбран он заранее');

  const settingsEnvelope = host.sent.find((e) => e.t === 'settings');
  assert(settingsEnvelope,
    '3b: создатель шлёт настройки сам, сразу — они лягут в комнату и дождутся гостя');
  assert(guest.sent.every((e) => e.t !== 'settings'),
    '3c: гость своих настроек не шлёт: решает один');
  assert(guest.api.publishOnlineRoomSettings() === false,
    '3c2: и не пошлёт, даже если позвать напрямую — отказ живёт в самой отправке, ' +
    'а не только в том месте, откуда её зовут');

  guest.transport.deliver(settingsEnvelope);

  assert(guest.sandbox.settings.flightRangeCells === 44
      && guest.sandbox.settings.arcadeMode === true
      && guest.sandbox.settings.flagsEnabled === false
      && guest.sandbox.settings.mapIndex === 5,
    '3d: гость играет по настройкам создателя');
  assert(guest.sandbox.selectedRuleset === 'classic',
    '3e: и по его правилам');
  assert(guest.log.some(([name, arg]) => name === 'loadSettingsForRuleset' && arg === 'classic'),
    '3f: правила перечитываются ДО значений — иначе перечитывание затёрло бы применённое');

  // Оформление не навязывается: пусть гость смотрит на свой огонь.
  assert(guest.sandbox.settings.flameStyle === 'inferno',
    '3g: стиль огня остаётся своим — навязывается только то, что меняет поле');
  assert(settingsEnvelope.payload.settings.flameStyle === undefined,
    '3h: и по проводу он даже не едет');

  // Главное: набор карт для жребия стал общим.
  assert(JSON.stringify(guest.api.loadMapTesterPlacements()) === JSON.stringify({ cells: 'hard', turtle: 'easy' }),
    '3i: РАСКЛАДКА КАРТ у гостя стала как у создателя — иначе одинаковый жребий ' +
    'выбирал бы карту из разных наборов, и это снова две разные партии');
  assert(JSON.stringify(host.api.loadMapTesterPlacements()) === JSON.stringify({ cells: 'hard', turtle: 'easy' }),
    '3j: у создателя она своя же и осталась');

  // Кэш выбранной карты выброшен: набор только что сменился.
  assert(guest.api.mapCache()[0] === null,
    '3k: запомненный выбор карты сброшен — иначе гость доиграл бы раунд на карте из своего набора');

  // Второй раз настройки не применяются: партия уже идёт.
  guest.sandbox.settings.flightRangeCells = 7;
  guest.transport.deliver({ ...settingsEnvelope, seq: settingsEnvelope.seq + 5 });
  assert(guest.sandbox.settings.flightRangeCells === 7,
    '3l: приехав второй раз (например, после переподключения), настройки уже не трогают идущую партию');

  // И создатель своих же настроек обратно не принимает.
  assert(host.api.applyOnlineRoomSettings(settingsEnvelope.payload) === false,
    '3m: создатель себе ничего не навязывает');
}

// === 4. Настройки комнаты не переживают выход из неё ===
{
  const guest = makeClient('green', {});
  guest.transport.deliver({
    p: 1, t: 'settings', from: 'blue-x', seat: 'blue', seq: 1,
    payload: { ruleset: 'classic', settings: {}, placements: { cells: 'archive' } },
  });
  assert(JSON.stringify(guest.api.loadMapTesterPlacements()) === JSON.stringify({ cells: 'archive' }),
    '4: в комнате действует её раскладка');
  guest.api.stopOnlineSession();
  assert(JSON.stringify(guest.api.loadMapTesterPlacements()) === JSON.stringify({}),
    '4b: вышли из комнаты — вернулась своя: чужие настройки не должны оседать в localStorage');
}

// === 5. Возвращение после обрыва: счёт пакетов ведётся по каждому отправителю ===
//
// Ловушка, ради которой этот раздел и написан.
//
// Соперник перезагрузил страницу. У него новый номер отправителя и нумерация пакетов с
// единицы — а у нас счётчик уже дошёл до восьми. Один общий счётчик отбросил бы все его
// ходы как «отставшие»: молча, навсегда, и выглядело бы это как «соперник не ходит».
{
  const me = makeClient('blue', {});
  const deliverFromPeer = (peerId, seq, payload) => me.transport.deliver({
    p: 1, t: 'move', from: peerId, seat: 'green', seq, payload,
  });

  for(let seq = 1; seq <= 8; seq += 1){
    deliverFromPeer('green-old', seq, { color: 'green', plane: 2, vx: 1, vy: 1, items: [] });
  }
  assert(me.api.inboxSize() === 8, '5: восемь ходов от соперника приняты');

  // Тот же соперник, но после перезагрузки: новый номер, нумерация с единицы.
  deliverFromPeer('green-new', 1, { color: 'green', plane: 3, vx: 2, vy: 2, items: [] });
  assert(me.api.inboxSize() === 9,
    '5b: ПЕРВЫЙ ход вернувшегося соперника принят, хотя его номер (1) меньше уже виденных восьми');

  // А повторы от прежнего отправителя по-прежнему отбрасываются.
  deliverFromPeer('green-old', 5, {});
  assert(me.api.inboxSize() === 9, '5c: повтор от прежнего отправителя всё так же отбрасывается');
  deliverFromPeer('green-new', 1, {});
  assert(me.api.inboxSize() === 9, '5d: и повтор от нового тоже');

  const seen = me.api.session().lastSeenSeqByPeer;
  assert(seen['green-old'] === 8 && seen['green-new'] === 1,
    '5e: счёт ведётся по каждому отправителю отдельно');
}

// === 5a. Вернувшийся принимает СВОЙ ЖЕ снимок, отправленный до обрыва ===
//
// Это нашла настоящая игра, а не этот тест — и на нём же он потом чуть не остановился.
//
// Придержанный комнатой снимок вполне может быть твоим собственным: последним ходил ты, а
// потом у тебя пропал интернет. Это самое свежее состояние партии, какое вообще есть. Но
// приезжает оно с ТВОИМ ЖЕ местом в конверте — и защита «за одну сторону вдвоём не
// играют» отвергала его, оставляя вернувшегося при пустой доске.
//
// Отличает их пометка комнаты, а не догадка клиента: у досланного пакета replay = true.
{
  const returning = makeClient('green', {});
  const beforeCrash = { p: 1, t: 'state', from: 'green-before-crash', seat: 'green', seq: 6,
                        payload: { v: 1, turnIndex: 1 } };

  // Живой пакет с нашего места — чужая вкладка, севшая на нашу сторону. Не принимаем.
  returning.transport.deliver(beforeCrash);
  assert(returning.api.inboxSize() === 0,
    '5a: живой пакет с нашего же места отвергается — играть за одну сторону вдвоём нельзя');

  // Тот же пакет, но досланный комнатой при встрече, — наш прошлый снимок. Принимаем.
  returning.transport.deliver({ ...beforeCrash, replay: true });
  assert(returning.api.inboxSize() === 1,
    '5a2: ДОСЛАННЫЙ комнатой снимок с нашего места принимается: это наше же состояние ' +
    'до обрыва, и отказаться от него значит вернуться к пустой доске');

  // А своё эхо остаётся своим эхом, даже с пометкой: пакет от самого себя разыгрывать
  // второй раз незачем.
  const selfId = returning.api.session().selfId;
  returning.transport.deliver({ ...beforeCrash, from: selfId, seq: 99, replay: true });
  assert(returning.api.inboxSize() === 1,
    '5a3: пакет от себя самого не принимается даже с пометкой');
}

// === 6. Вернувшийся догоняет партию придержанным снимком ===
{
  const room = createRoomFor(relay);
  const other = makeClient('green', {});
  // Соперник сыграл несколько ходов, пока нас не было.
  other.sandbox.turnIndex = 1;
  other.api.publishOnlineStateAfterTurn('green');
  const keptState = other.sent.find((e) => e.t === 'state');
  assert(keptState, '6: снимок ушёл в комнату');
  relay.routeEnvelope(room, 'green', keptState);

  // Мы подключаемся заново — с нуля, как после перезагрузки страницы.
  const returning = makeClient('blue', {});
  const join = relay.joinRoom(room, {
    seat: 'blue', version: relay.RELAY_PROTOCOL_VERSION, connection: { id: 'blue-2' },
  });
  for(const envelope of join.replay) returning.transport.deliver(envelope);

  assert(returning.api.inboxSize() === 1,
    '6b: придержанный снимок принят — на нём и держится возвращение после обрыва');
  returning.api.drainOnlineInbox();
  assert(returning.log.some(([kind]) => kind === 'state'),
    '6c: и применён, как только поле оказалось пустым');
}

// === 7. Провод сам поднимается после обрыва ===
//
// «У нас в рашке инет ща говно» — это не оговорка, а требование. Игра про обрыв знать не
// должна: пошаговой игре всё равно нечего показывать сопернику, пока ход не сделан.
{
  const transport = extractFunctionSource(source, 'createWebSocketTransport');
  assert(/scheduleReconnect/.test(transport), '7: после обрыва провод пробует снова');
  assert(/ONLINE_RECONNECT_DELAYS_MS/.test(transport),
    '7b: с нарастающей паузой, а не в цикле без передышки');

  const delays = JSON.parse(source.match(/const ONLINE_RECONNECT_DELAYS_MS = Object\.freeze\((\[[^\]]*\])\);/)[1]);
  assert(delays.length > 1 && delays.every((d, i) => i === 0 || d >= delays[i - 1]),
    '7c: паузы не убывают');
  assert(delays.at(-1) <= 30000,
    '7d: но не растут бесконечно — пропавший на полчаса интернет не повод переставать проверять');

  assert(/outbox\.push\(envelope\)/.test(transport),
    '7e: пока связи нет, пакеты копятся, а не теряются');
  assert(/event\?\.code === 4000/.test(transport),
    '7f: отказ комнаты (не то место, не та версия) — не повод пробовать снова: откажет и в следующий раз');
}

// === 8. Провод выбирается адресом, и выше по коду разницы не видно ===
{
  const starter = extractFunctionSource(source, 'startOnlineSession');
  assert(/createWebSocketTransport/.test(starter) && /createBroadcastTransport/.test(starter),
    '8: есть оба провода');
  assert(/seatInfo\.relay/.test(starter),
    '8b: выбирает между ними адрес ретранслятора');

  const parse = extractFunctionSource(source, 'parseOnlineSeatFromSearch');
  assert(/params\.get\("relay"\)/.test(parse) && /ONLINE_RELAY_URL/.test(parse),
    '8c: адрес берётся из ссылки, а по умолчанию — из настройки в коде');

  // Обе реализации обязаны быть одинаковыми снаружи: иначе «заменить один провод другим»
  // окажется не заменой, а переписыванием.
  const shape = ['kind', 'status', 'post', 'receive', 'close'];
  for(const fnName of ['createBroadcastTransport', 'createWebSocketTransport']){
    const body = extractFunctionSource(source, fnName);
    for(const key of shape){
      assert(new RegExp(`(^|[^\\w])${key}\\s*[:(]`, 'm').test(body),
        `8d: у провода «${fnName}» есть «${key}» — снаружи провода неотличимы`);
    }
  }
}

// === 8a. relay=auto: адрес сокета выводится из того, как открыли страницу ===
//
// Нужно, когда сервером работает чей-то компьютер. Одна и та же ссылка открывается с
// localhost, по локальной сети и через туннель, а адрес сокета каждый раз разный.
// Вписанный руками, он верен ровно для одного из этих случаев — и это тот сорт ошибки,
// где всё выглядит правильно, а соединения нет.
{
  const client = makeClient('blue', {});
  const parse = client.api.parseOnlineSeatFromSearch;

  assert(parse('?seat=blue&relay=auto', { protocol: 'http:', host: '192.168.1.5:8080' }).relay
    === 'ws://192.168.1.5:8080',
    '8a: по локальной сети адрес берётся из того, откуда открыта страница');
  assert(parse('?seat=blue&relay=auto', { protocol: 'http:', host: 'localhost:8080' }).relay
    === 'ws://localhost:8080',
    '8a2: и с localhost тоже — та же ссылка, другой адрес');
  assert(parse('?seat=blue&relay=auto', { protocol: 'https:', host: 'x.trycloudflare.com' }).relay
    === 'wss://x.trycloudflare.com',
    '8a3: через https — ОБЯЗАТЕЛЬНО wss: страница по https незашифрованный сокет не откроет, ' +
    'браузер молча его отвергнет');

  // Явный адрес не трогаем, и без relay остаётся настройка из кода.
  assert(parse('?seat=blue&relay=wss://relay.example', { protocol: 'https:', host: 'x' }).relay
    === 'wss://relay.example', '8a4: явно указанный адрес остаётся как есть');
  const configured = source.match(/const ONLINE_RELAY_URL = "([^"]*)";/)[1];
  assert(parse('?seat=blue', { protocol: 'https:', host: 'x' }).relay === configured,
    '8a5: без relay в ссылке берётся настройка из кода');
}

// === 8b. Локальный сервер крутит ТУ ЖЕ комнату, что и облако ===
//
// Иначе «поиграть на своём компе» и «поиграть через облако» стали бы двумя разными
// онлайнами, и починенное в одном не чинилось бы в другом.
{
  const local = fs.readFileSync('worker/local-server.js', 'utf8');
  assert(/from "\.\/room\.js"/.test(local),
    '8b: локальный сервер берёт комнату из того же room.js, что и Worker');
  for(const fn of ['joinRoom', 'routeEnvelope', 'leaveRoom', 'parseJoinRequest']){
    assert(new RegExp(`\\b${fn}\\(`).test(local), `8b2: и пользуется её ${fn}`);
  }
  // Ни одной зависимости: запуск должен быть одной командой на любой машине с node.
  const imports = [...local.matchAll(/^import .*? from "([^"]+)";/gm)].map((m) => m[1]);
  assert(imports.every((name) => name.startsWith('node:') || name.startsWith('./')),
    `8b3: локальный сервер обходится без npm install (нашлось: ${imports.join(', ')})`);

  const frames = fs.readFileSync('worker/ws-frames.js', 'utf8');
  assert(!/\bimport\b/.test(frames) && !/require\(/.test(frames),
    '8b4: разбор кадров ни от чего не зависит и ничего не поднимает — иначе его нельзя ' +
    'было бы проверить, не запустив сервер');
}

// === 9. Настройки отправляются оттуда, откуда их видно ===
//
// Тоже нашла настоящая игра, и провалиться это может только молча.
//
// Создатель, садясь за стол, сразу шлёт свои настройки — вместе с раскладкой карт. Но
// раскладку читает функция, объявленная НИЖЕ по файлу, и её ключ на момент посадки ещё в
// «мёртвой зоне». Обращение к нему падает — внутри try/catch, который стоит там ради
// испорченного localStorage. Ошибка превращается в «раскладки нет»: создатель шлёт
// пустую, гость остаётся при своей, и дырка, которую этот шаг закрывает, открывается
// заново — только теперь незаметно.
{
  const seatAt = source.indexOf('\nstartOnlineSession();');
  const placementsKeyAt = source.indexOf('const MAP_TESTER_PLACEMENTS_STORAGE_KEY');
  const placementsFnAt = source.indexOf('function loadMapTesterPlacements(');
  assert(seatAt !== -1 && placementsKeyAt !== -1 && placementsFnAt !== -1,
    '9: посадка за стол и чтение раскладки — на месте');
  assert(seatAt > placementsKeyAt && seatAt > placementsFnAt,
    '9b: за стол садятся ПОСЛЕ того, как объявлена раскладка карт — иначе создатель ' +
    'отправит пустую, и ошибку проглотит try/catch');

  // И сама пряталка ошибок больше не молчит.
  const loader = extractFunctionSource(source, 'loadMapTesterPlacements');
  assert(/console\.warn/.test(loader),
    '9c: не сумев прочитать раскладку, игра хотя бы говорит об этом вслух');
}

console.log('Smoke test passed: комната пересылает не зная игры, придерживает настройки и снимок, отдаёт занятое место вернувшемуся; гость играет по настройкам создателя, включая раскладку карт; счёт пакетов ведётся по каждому отправителю, поэтому перезагрузка соперника не хоронит его ходы.');
})().catch((error) => { console.error(error); process.exit(1); });

function createRoomFor(relay){
  return relay.createRoom();
}
