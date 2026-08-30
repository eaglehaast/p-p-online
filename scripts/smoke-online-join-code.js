#!/usr/bin/env node
'use strict';

// Smoke test: вход в чужую комнату по коду.
//
// До сих пор позвать друга можно было только ссылкой, а ссылка работает не везде. На
// itch.io и подобных витринах игра открывается внутри чужой рамки, и параметры адреса до
// неё не доезжают вовсе: друг переходит по ссылке с комнатой — и попадает в свою пустую.
// Код же можно продиктовать голосом, и он не зависит от того, чей адрес в строке браузера.
//
// Проверяется четыре вещи, и каждая ломается молча:
//
//   1. Код разбирается так, как его вводит живой человек: с пробелами, заглавными,
//      целиком вставленной ссылкой. Ошибка выглядит как «ввёл правильный код — не пускает».
//   2. Вход в чужую комнату бросает свою. Иначе остаются два провода сразу, и ходы уезжают
//      в комнату, где никого нет.
//   3. Садиться надо на СВОБОДНОЕ место. Двое на одном — и комната выгонит первого.
//   4. «Подключаемся» и «связь потеряна» — разные состояния. Пока сокет только
//      открывается, терять ещё нечего, и пугать человека нечем.

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
const markup = fs.readFileSync('index.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

// Стенд: настоящие функции входа, а вместо провода — запись того, что с ним делали.
function makeStand({ relay = 'wss://relay.example', session = null } = {}){
  const log = [];
  const sandbox = {
    Object, Array, Math, JSON, String, Number, Date, RegExp, decodeURIComponent, URLSearchParams,
    console: { log: () => {}, warn: () => {} },
    onlineSession: session,
    onlineInbox: [],
    onlineTurnDraft: null,
    onlineRoomPlacements: null,
    window: { location: { search: relay ? `?relay=${relay}` : '', protocol: 'https:', host: 'x.test' } },
    showOnlineLobby: () => log.push(['showOnlineLobby']),
    // Настоящий startOnlineSession тянет за собой пол-игры; здесь важно не что он делает
    // внутри, а с какими местом и комнатой его позвали.
    startOnlineSession: (options) => {
      log.push(['startOnlineSession', options]);
      const started = { seat: options.seat, room: options.room, relay: options.relay,
                        transport: { kind: 'stand', status: () => 'online', close(){} } };
      sandbox.onlineSession = started;
      return started;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_HOST_SEAT = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_MAX_LENGTH = \d+;/)[0],
    'let onlinePresence = { blue: true, green: false };',
    'let onlineReady = { mine: true, theirs: true };',
    extractFunctionSource(source, 'resolveOnlineRelayAddress'),
    extractFunctionSource(source, 'getConfiguredRelayUrl'),
    extractFunctionSource(source, 'stopOnlineSession'),
    extractFunctionSource(source, 'normalizeOnlineRoomCode'),
    extractFunctionSource(source, 'joinOnlineRoomByCode'),
    'this.api = { normalizeOnlineRoomCode, joinOnlineRoomByCode,',
    '             session: () => onlineSession, presence: () => onlinePresence,',
    '             ready: () => onlineReady };',
    'this.ONLINE_RELAY_URL = "";',
  ].join('\n'), sandbox);
  return { api: sandbox.api, log, sandbox };
}

// === 1. Код разбирается так, как его вводит человек ===
{
  const { api } = makeStand();
  const maxLength = Number(source.match(/const ONLINE_ROOM_MAX_LENGTH = (\d+);/)[1]);

  assert(api.normalizeOnlineRoomCode('barsuk') === 'barsuk', '1: чистый код проходит как есть');
  assert(api.normalizeOnlineRoomCode('  barsuk  ') === 'barsuk', '1b: пробелы по краям не мешают');
  assert(api.normalizeOnlineRoomCode('BARSUK') === 'barsuk',
    '1c: заглавные приводятся к строчным — имена комнат строчные');
  assert(api.normalizeOnlineRoomCode('bar suk') === 'barsuk',
    '1d: пробел внутри — то, как код диктуют вслух и записывают');

  // Вставленная целиком ссылка — самый частый способ «передать код».
  assert(api.normalizeOnlineRoomCode('https://x.test/g/?room=barsuk&seat=green&relay=auto') === 'barsuk',
    '1e: из ссылки достаётся имя комнаты');
  assert(api.normalizeOnlineRoomCode('https://x.test/g/?seat=green&room=barsuk') === 'barsuk',
    '1f: комната в ссылке не обязана быть первой');
  assert(api.normalizeOnlineRoomCode('https://x.test/g/?room=bar%2Dsuk') === 'bar-suk',
    '1g: из ссылки код приходит закодированным — его надо раскодировать');

  // Мусор обязан отличаться от кода, а не превращаться в него.
  assert(api.normalizeOnlineRoomCode('???') === '', '1h: из мусора кода не получается');
  assert(api.normalizeOnlineRoomCode('   ') === '', '1i: из пробелов тоже');
  assert(api.normalizeOnlineRoomCode(null) === '' && api.normalizeOnlineRoomCode(undefined) === '',
    '1j: пустого ввода бояться не надо');

  const long = api.normalizeOnlineRoomCode('a'.repeat(maxLength + 40));
  assert(long.length === maxLength,
    `1k: длина ограничена ${maxLength} — иначе в адрес комнаты уедет что угодно (сейчас ${long.length})`);
}

// === 2. Вход в чужую комнату бросает свою ===
{
  let closed = 0;
  const own = { seat: 'blue', room: 'moya',
                transport: { kind: 'stand', status: () => 'online', close(){ closed += 1; } } };
  const stand = makeStand({ session: own });

  const joined = stand.api.joinOnlineRoomByCode('CHUZHAYA');
  assert(joined !== null, '2: вход состоялся');
  assert(closed === 1,
    '2b: провод своей комнаты закрыт — иначе ходы уезжают туда, где никого нет');
  assert(stand.api.session().room === 'chuzhaya', '2c: сидим в названной комнате');

  // Присутствие и готовность относились к прошлой комнате и в новой не значат ничего.
  assert(stand.api.presence() === null,
    '2d: «кто за столом» забыто — иначе Play разблокируется без соперника');
  assert(stand.api.ready().mine === false && stand.api.ready().theirs === false,
    '2e: готовность забыта — иначе новый матч начнётся сам собой');
  assert(stand.log.some(([name]) => name === 'showOnlineLobby'), '2f: лобби показано');
}

// === 3. Садимся на свободное место ===
{
  const hostSeat = source.match(/const ONLINE_HOST_SEAT = "([^"]*)";/)[1];
  const stand = makeStand();
  stand.api.joinOnlineRoomByCode('barsuk');
  const [, options] = stand.log.find(([name]) => name === 'startOnlineSession');
  assert(options.seat !== hostSeat,
    `3: входящий садится не на место хозяина (просит «${options.seat}», хозяин «${hostSeat}»)`);
  assert(options.room === 'barsuk', '3b: в ту комнату, чей код назвали');
  assert(options.relay, '3c: через тот же ретранслятор');
}

// === 3a. Без кода и без ретранслятора вход не делается ===
{
  const nothing = makeStand();
  assert(nothing.api.joinOnlineRoomByCode('???') === null, '3d: из мусора комнаты не выйдет');
  assert(!nothing.log.some(([name]) => name === 'startOnlineSession'),
    '3e: и провод ради мусора не поднимается');

  const noRelay = makeStand({ relay: '' });
  assert(noRelay.api.joinOnlineRoomByCode('barsuk') === null,
    '3f: без адреса ретранслятора соединять нечем');
}

// === 4. «Подключаемся» — не «связь потеряна» ===
//
// Разница не косметическая. Панель показывается сразу после того, как позвали комнату, а
// сокет к этому мигу ещё открывается. Одно состояние на оба случая — и человек, впервые
// нажавший «Online», первым делом читает, что связь потеряна.
{
  const transport = extractFunctionSource(source, 'createWebSocketTransport');
  assert(/everOpened \? "reconnecting" : "connecting"/.test(transport),
    '4: до первого открытия состояние — «connecting», а не «reconnecting»');
  assert(/everOpened = true;/.test(transport),
    '4b: и «открывались» отмечается при открытии');

  const status = extractFunctionSource(source, 'getOnlineLobbyStatusText');
  assert(/connection === "connecting"/.test(status),
    '4c: у «connecting» своя строка в лобби');
  assert(status.indexOf('connecting') < status.indexOf('Связь потеряна'),
    '4d: и проверяется она раньше — иначе её строка недостижима');

  // Состояние связи меняется само, без нашего участия. Если о нём не сообщать, на экране
  // навсегда застынет то, что было в миг открытия панели.
  assert(/createWebSocketTransport\(room, seatInfo\.relay, seatInfo\.seat, refreshOnlineLobbyUi\)/
    .test(source), '4e: смена состояния связи перерисовывает лобби');
  const announces = (transport.match(/announce\(\);/g) || []).length;
  assert(announces >= 3,
    `4f: сообщается и об открытии, и об обрыве, и об отказе (нашлось ${announces})`);
}

// === 5. ГЛАВНОЕ: панель не дотягивается до «Play» ===
//
// Панель растёт вверх от нижнего края, а прямо над ней — кнопка, которой партия
// начинается. Стоило добавить в панель две строки, и она накрыла кнопку собой: кнопка
// видна, выглядит нажимаемой, но нажатие достаётся панели. Играть нельзя вообще, и по
// экрану этого не понять. Поэтому здесь считается арифметика, а не «выглядит нормально».
{
  const designHeight = Number(styles.match(/--design-h:\s*(\d+);/)[1]);
  const playRule = styles.match(/\.mode-menu__btn--play \{[^}]*\}/)[0];
  const playBottom = Number(playRule.match(/top:\s*(\d+)px/)[1])
    + Number(playRule.match(/height:\s*(\d+)px/)[1]);

  const lobbyRule = styles.match(/#menuLayer #modeMenu \.online-lobby \{[^}]*\}/)[0];
  const maxHeightMatch = lobbyRule.match(/max-height:\s*(\d+)px/);
  assert(maxHeightMatch,
    '5: у панели есть потолок высоты — без него её край не вычислить, он зависит от текста');
  const lobbyBottom = Number(lobbyRule.match(/bottom:\s*(\d+)px/)[1]);
  const lobbyMaxHeight = Number(maxHeightMatch[1]);

  const lobbyTop = designHeight - lobbyBottom - lobbyMaxHeight;
  // Считать надо от НИЖНЕГО края кнопки, а не от верхнего: панель, накрывшая нижнюю
  // половину «Play», отбирает нажатие ровно так же, как накрывшая её целиком.
  assert(lobbyTop >= playBottom,
    `5c: панель начинается ниже «Play» (панель с ${lobbyTop}px, «Play» кончается на ${playBottom}px)`);

  // Потолок высоты — то, что делает предыдущую строчку правдой. Без него панель растёт от
  // содержимого: перенос одной строки состояния на узком экране — и она снова наверху.
  assert(/overflow-y:\s*auto/.test(lobbyRule),
    '5b: содержимое выше потолка прокручивается, а не вылезает за него');
}

console.log('smoke-online-join-code: OK');
