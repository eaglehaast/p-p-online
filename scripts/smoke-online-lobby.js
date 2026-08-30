#!/usr/bin/env node
'use strict';

// Smoke test: лобби — кнопка «Online», ссылка другу и «оба на месте».
//
// Кнопка «Online» в меню стояла выключенной с самого начала и никогда не работала:
// обработчик у неё был, но он лишь запоминал название режима и к проводу не прикасался.
// Комната задавалась адресом страницы, и позвать друга можно было, только собрав ссылку
// руками.
//
// Проверяется здесь не «панель показалась», а три вещи, каждая из которых ломается тихо:
//
//   1. Кнопка не должна работать вхолостую. Без адреса ретранслятора соединять нечем, и
//      выключенная кнопка честнее нажимающейся, но ничего не делающей.
//   2. Ссылка другу обязана вести на СВОБОДНОЕ место и тем же способом к тому же
//      ретранслятору. Ошибка тут выглядит как «друг открыл и ничего не происходит».
//   3. Начать в одиночку нельзя. Наш первый ход уехал бы сопернику, который ещё в меню,
//      и попал бы в игру, которая у него не началась.

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

// Стенд одного устройства: настоящий код лобби, последствия записываются.
function makeSide(seat, { search = '', room = 'stand' } = {}){
  const log = [];
  const sent = [];
  const sandbox = {
    Object, Array, Math, JSON, String, URLSearchParams,
    console: { log: () => {}, warn: (...a) => log.push(['warn', ...a]) },
    gameMode: null,
    onlineSession: {
      seat, room,
      transport: { kind: 'stand', status: () => 'online' },
    },
    window: { location: { origin: 'https://example.test', pathname: '/game/', search,
                          protocol: 'https:', host: 'example.test' } },
    postOnlineEnvelope: (type, payload) => { sent.push({ type, payload }); return true; },
    handlePlayStart: () => log.push(['handlePlayStart']),
    hideOnlineLobby: () => log.push(['hideOnlineLobby']),
    syncPlayButtonSkin: (ready) => log.push(['play', ready]),
    onlineLobbyDiv: null,
    onlineLobbyStatusEl: null,
    HTMLElement: function HTMLElement(){},
    ONLINE_RELAY_URL: '',
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_HOST_SEAT = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_ALPHABET = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_LENGTH = \d+;/)[0],
    'let onlinePresence = null; let onlineReady = { mine: false, theirs: false };',
    extractFunctionSource(source, 'resolveOnlineRelayAddress'),
    extractFunctionSource(source, 'getConfiguredRelayUrl'),
    extractFunctionSource(source, 'isOnlineAvailable'),
    extractFunctionSource(source, 'makeOnlineRoomId'),
    extractFunctionSource(source, 'buildOnlineInviteLink'),
    extractFunctionSource(source, 'isOnlineTableFull'),
    extractFunctionSource(source, 'receiveOnlinePresence'),
    extractFunctionSource(source, 'sendOnlineReady'),
    extractFunctionSource(source, 'receiveOnlineReady'),
    extractFunctionSource(source, 'maybeStartOnlineMatch'),
    extractFunctionSource(source, 'refreshOnlineLobbyUi'),
    extractFunctionSource(source, 'getOnlineLobbyStatusText'),
    'this.api = { isOnlineAvailable, makeOnlineRoomId, buildOnlineInviteLink,',
    '             isOnlineTableFull, receiveOnlinePresence, receiveOnlineReady,',
    '             maybeStartOnlineMatch, getOnlineLobbyStatusText, refreshOnlineLobbyUi,',
    '             ready: () => onlineReady, presence: () => onlinePresence,',
    '             pressPlay: () => { onlineReady.mine = true; sendOnlineReady();',
    '                                refreshOnlineLobbyUi(); maybeStartOnlineMatch(); } };',
  ].join('\n'), sandbox);
  return { seat, api: sandbox.api, log, sent, sandbox };
}

// === 1. Кнопка «Online» работает, только когда есть куда подключаться ===
{
  const withoutRelay = makeSide('blue', { search: '' });
  assert(withoutRelay.api.isOnlineAvailable() === false,
    '1: без адреса ретранслятора онлайна нет');

  const fromLink = makeSide('blue', { search: '?relay=wss://relay.example' });
  assert(fromLink.api.isOnlineAvailable() === true,
    '1b: адрес из ссылки включает онлайн');

  const auto = makeSide('blue', { search: '?relay=auto' });
  assert(auto.api.isOnlineAvailable() === true, '1c: «auto» тоже адрес');

  // Кнопка выключается в разметке и включается кодом, а не наоборот: файл открывают и
  // без сервера, и лучше пусть она сразу выглядит недоступной.
  const tag = markup.match(/<button id="onlineBtn"[^>]*>/)[0];
  assert(/\bdisabled\b/.test(tag), '1d: в разметке кнопка выключена');
  assert(/onlineBtn\.disabled = !available;/.test(source),
    '1e: включает её код — и только когда есть адрес');
  assert(/onlineBtn\.title = available/.test(source),
    '1f: и объясняет, почему выключена, если выключена');
}

// === 2. Ссылка другу ведёт на СВОБОДНОЕ место ===
{
  for(const [seat, expected] of [['blue', 'green'], ['green', 'blue']]){
    const side = makeSide(seat, { search: '?relay=auto', room: 'barsuk' });
    const link = side.api.buildOnlineInviteLink();
    const params = new URLSearchParams(link.split('?')[1]);
    assert(params.get('seat') === expected,
      `2: у «${seat}» ссылка зовёт на «${expected}» (сейчас «${params.get('seat')}»)`);
    assert(params.get('room') === 'barsuk', '2b: и в ту же комнату');
    assert(link.startsWith('https://example.test/game/?'),
      '2c: на ту же страницу, откуда позвали');
  }

  // Адрес ретранслятора передаётся тем же способом, каким получен. «auto» обязано
  // остаться «auto»: развёрнутое в конкретный адрес, оно у друга не сработает — он
  // открывает ссылку с другого адреса (по сети, через туннель).
  const auto = makeSide('blue', { search: '?relay=auto' });
  assert(new URLSearchParams(auto.api.buildOnlineInviteLink().split('?')[1]).get('relay') === 'auto',
    '2d: «auto» в ссылке остаётся «auto», а не превращается в наш собственный адрес');

  const explicit = makeSide('blue', { search: '?relay=wss://relay.example' });
  assert(new URLSearchParams(explicit.api.buildOnlineInviteLink().split('?')[1]).get('relay')
      === 'wss://relay.example', '2e: явный адрес передаётся как есть');

  // Настроенный в коде адрес в ссылку не пишем: он и так у друга есть.
  const configured = makeSide('blue', { search: '' });
  assert(configured.api.buildOnlineInviteLink().includes('relay=') === false,
    '2f: настроенный в коде адрес в ссылке не дублируется');
}

// === 3. Имя комнаты — не подобрать ===
{
  const side = makeSide('blue');
  const ids = new Set(Array.from({ length: 500 }, () => side.api.makeOnlineRoomId()));
  assert(ids.size > 480, `3: имена комнат не повторяются (уникальных ${ids.size} из 500)`);
  const alphabet = source.match(/const ONLINE_ROOM_ID_ALPHABET = "([^"]*)";/)[1];
  for(const confusing of ['l', 'o', '0', '1']){
    assert(!alphabet.includes(confusing),
      `3b: в имени комнаты нет «${confusing}» — ссылку могут и продиктовать вслух`);
  }
  assert([...ids][0].length >= 5, '3c: имя достаточно длинное, чтобы не подобраться перебором');
}

// === 4. ГЛАВНОЕ: начать в одиночку нельзя ===
{
  const side = makeSide('blue');

  // Соперника нет — «Play» ничего не начинает.
  side.api.pressPlay();
  assert(!side.log.some(([name]) => name === 'handlePlayStart'),
    '4: без соперника матч не начинается');

  // Соперник пришёл, но ещё не готов.
  side.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  assert(side.api.isOnlineTableFull() === true, '4b: комната сообщила, что оба на месте');
  assert(!side.log.some(([name]) => name === 'handlePlayStart'),
    '4c: одного присутствия мало — второй ещё не нажал «Play»');

  // Готов и он — поехали.
  side.api.receiveOnlineReady();
  assert(side.log.some(([name]) => name === 'handlePlayStart'),
    '4d: когда готовы оба, матч начинается');
  assert(side.log.some(([name]) => name === 'hideOnlineLobby'), '4e: лобби закрывается');
  assert(side.api.ready().mine === false && side.api.ready().theirs === false,
    '4f: готовность сброшена — иначе следующий матч начнётся сам');
}

// === 4a. Замок на «Play» живёт в одном месте ===
//
// Вызывающих у syncPlayButtonSkin несколько, и любой забытый снова открыл бы возможность
// начать партию в одиночку. Поэтому решение принимает сама функция, а не её вызывающие.
{
  const gate = (presence, mineReady, inGame) => {
    const log = [];
    const sandbox = {
      Object, Math,
      HTMLElement: function HTMLElement(){},
      playBtn: null,
      applyMenuButtonSkin: () => {},
      gameMode: inGame ? 'online' : null,
      onlineSession: { seat: 'blue' },
      onlinePresence: presence,
      onlineReady: { mine: mineReady, theirs: false },
      log,
    };
    sandbox.playBtn = Object.setPrototypeOf({
      disabled: false,
      classList: { toggle: () => {} },
      setAttribute: () => {},
    }, sandbox.HTMLElement.prototype);
    vm.createContext(sandbox);
    vm.runInContext([
      extractFunctionSource(source, 'isOnlineTableFull'),
      extractFunctionSource(source, 'syncPlayButtonSkin'),
      'syncPlayButtonSkin(true); this.disabled = playBtn.disabled;',
    ].join('\n'), sandbox);
    return sandbox.disabled;
  };

  assert(gate({ blue: true, green: false }, false, false) === true,
    '4a: пока соперника нет, «Play» заблокирована — даже если её просят включить');
  assert(gate({ blue: true, green: true }, false, false) === false,
    '4a2: когда оба на месте — доступна');
  assert(gate({ blue: true, green: true }, true, false) === true,
    '4a3: после своего «готов» — снова заблокирована, ответ уже дан');
  assert(gate({ blue: true, green: false }, false, true) === false,
    '4a4: в идущей игре замок не действует — там «Play» про другое');
}

// === 5. Готовность, сказанная в пустоту, повторяется при приходе соперника ===
//
// Комната не придерживает «я готов»: это одноразовое решение. Нажав «Play» до прихода
// друга, мы бы ждали его вечно — он никогда не узнал бы, что мы готовы.
{
  const side = makeSide('blue');
  side.api.receiveOnlinePresence({ seats: { blue: true, green: false } });
  side.api.pressPlay();
  const beforeJoin = side.sent.filter((e) => e.type === 'ready').length;
  assert(beforeJoin === 1, '5: готовность отправлена (в пустоту)');

  side.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  const afterJoin = side.sent.filter((e) => e.type === 'ready').length;
  assert(afterJoin === 2,
    '5b: когда соперник пришёл, готовность отправлена ещё раз — иначе он о ней не узнает');

  // А пока за столом не двое, чужая готовность ничего не значит.
  const other = makeSide('green');
  other.api.receiveOnlineReady();
  other.api.receiveOnlinePresence({ seats: { blue: false, green: true } });
  assert(other.api.ready().theirs === false,
    '5c: ушедший соперник больше не считается готовым');
}

// === 6. Состояние написано словами, а не угадывается по пустой панели ===
{
  const side = makeSide('blue');
  const seen = new Set();
  seen.add(side.api.getOnlineLobbyStatusText());
  side.api.receiveOnlinePresence({ seats: { blue: true, green: false } });
  seen.add(side.api.getOnlineLobbyStatusText());
  side.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  seen.add(side.api.getOnlineLobbyStatusText());
  side.api.pressPlay();
  seen.add(side.api.getOnlineLobbyStatusText());

  assert(seen.size === 4,
    `6: каждое состояние лобби описано своими словами (сейчас разных: ${seen.size})`);
  for(const text of seen){
    assert(typeof text === 'string' && text.trim().length > 8,
      `6b: «${text}» — внятная строка, а не заглушка`);
  }

  // Оборванная связь тоже названа — своими словами, а не молчанием и не той же строкой,
  // что при рабочей связи. Проверяем именно это, а не конкретную формулировку: язык
  // интерфейса менялся и ещё может смениться, а «состояние названо» — не должно.
  const broken = makeSide('green');
  broken.sandbox.onlineSession.transport.status = () => 'reconnecting';
  const brokenText = broken.api.getOnlineLobbyStatusText();
  assert(brokenText.trim().length > 8, '6c: про потерянную связь лобби говорит, а не молчит');
  assert(!seen.has(brokenText),
    `6d: у оборванной связи своя строка, не та же, что при рабочей («${brokenText}»)`);
}

// === 7. Панель и её место в разметке ===
{
  for(const id of ['onlineLobby', 'onlineLobbyStatus', 'onlineLobbyLink',
                   'onlineLobbyCopy', 'onlineLobbyClose']){
    assert(new RegExp(`id="${id}"`).test(markup), `7: в разметке есть ${id}`);
  }
  assert(/id="onlineLobby"[^>]*hidden/.test(markup),
    '7b: по умолчанию панель спрятана — она не нужна, пока комнаты нет');
  assert(/#menuLayer #modeMenu \.online-lobby \{/.test(styles),
    '7c: у панели есть стили');
  assert(/readonly/.test(markup.match(/<input id="onlineLobbyLink"[\s\S]*?\/>/)[0]),
    '7d: поле со ссылкой только для чтения — его выделяют и копируют, а не правят');
}

// === 8. Присутствие приходит от КОМНАТЫ, а не от игрока ===
//
// Сам игрок может только слать «я здесь» в пустоту и не знать, услышал ли кто-то. И уж
// точно он не узнает, что соперник закрыл вкладку: молчание неотличимо от раздумья.
{
  const roomSource = fs.readFileSync('worker/room.js', 'utf8');
  assert(/export function buildPresenceEnvelope/.test(roomSource),
    '8: конверт о присутствии собирает комната');
  assert(/from: "room"/.test(roomSource),
    '8b: отправитель — комната, а не место: иначе клиентские проверки «своё эхо» и ' +
    '«пакет с нашего же места» его отбросят');

  for(const file of ['worker/index.js', 'worker/local-server.js']){
    const server = fs.readFileSync(file, 'utf8');
    assert(/broadcastPresence/.test(server), `8c: ${file} рассылает присутствие`);
    // Каждое место, где игрок покидает комнату, обязано об этом рассказать. Ищем именно
    // ВЫЗОВЫ leaveRoom (со скобкой), а не упоминание в списке импортов.
    const leaveCalls = [...server.matchAll(/leaveRoom\(/g)].map((m) => m.index);
    assert(leaveCalls.length > 0, `8d: в ${file} кто-то покидает комнату`);
    // Окно — до СЛЕДУЮЩЕГО такого вызова: иначе соседний обработчик, где рассылка есть,
    // прикроет тот, где её забыли.
    for(let i = 0; i < leaveCalls.length; i += 1){
      const from = leaveCalls[i];
      const to = leaveCalls[i + 1] ?? Math.min(server.length, from + 300);
      assert(/broadcastPresence/.test(server.slice(from, to)),
        `8e: ${file} сообщает об уходе на КАЖДОМ выходе из комнаты — иначе оставшийся ` +
        'ждёт ушедшего вечно');
    }
  }
}

console.log('Smoke test passed: кнопка «Online» включается только при настроенном ретрансляторе, ссылка зовёт на свободное место, начать в одиночку нельзя, а присутствие сообщает комната.');
