#!/usr/bin/env node
'use strict';

// Smoke test: цвет в онлайне выбирает игрок, а не комната.
//
// В меню есть переключатель стороны — щёлкнул по самолётику, и играешь другим краем. В
// онлайне он не работал: создатель комнаты всегда садился синим, потому что ролью хозяина
// служил сам цвет. Решать, чьи настройки в силе и когда начинать, должен ОДИН из двоих, и
// выбран он должен быть заранее — выбирали цветом, как самым простым признаком.
//
// Признак сменился: хозяин — тот, кто комнату ЗАВЁЛ. Это записано в самой сессии и из
// адреса приехать не может: по ссылке приходят в гости. Цвет после этого свободен.
//
// Что проверяется:
//
//   1. Комната заводится под тот край, который выбран в меню.
//   2. Роль хозяина не выводится из цвета НИГДЕ — ни в проверке, ни в живой сессии.
//      Зелёный хозяин остаётся хозяином, синий гость хозяином не становится.
//   3. Ссылка зовёт друга на место напротив, какой бы цвет хозяин ни взял.
//
// Вторая — главная: ошибись в ней, и гость, которому досталось синее место, начнёт слать
// свои настройки комнаты и давать старт наравне с хозяином. Разойдутся они молча.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');

function extractFunctionSource(text, name){
  const start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  let глубина = 0;
  let i = text.indexOf('(', start);
  for(; i < text.length; i += 1){
    if(text[i] === '(') глубина += 1;
    if(text[i] === ')'){ глубина -= 1; if(глубина === 0) break; }
  }
  const bodyStart = text.indexOf('{', i);
  let depth = 0;
  for(let j = bodyStart; j < text.length; j += 1){
    if(text[j] === '{') depth += 1;
    if(text[j] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, j + 1);
  }
  throw new Error(`Не найден конец функции ${name}`);
}

// Стенд живой сессии: настоящие startOnlineSession, isOnlineHost и разворот доски;
// остальное — заглушки, которые только записывают, что их позвали.
function устройство(край){
  const вызовы = [];
  const sandbox = {
    Object, Array, Math, JSON, Date, String, Number, URLSearchParams,
    console: { log: () => {}, warn: (...a) => вызовы.push({ warn: a }) },
    window: { location: { origin: 'https://example.test', pathname: '/game/', search: '' } },
    boardViewSeat: край,
    вызовы,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_SEAT_COLORS = Object\.freeze\(\[[^\]]*\]\);/)[0],
    source.match(/const ONLINE_ROOM_FALLBACK = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_MAX_LENGTH = \d+;/)[0],
    source.match(/const ONLINE_LEGACY_HOST_SEAT = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_ALPHABET = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_LENGTH = \d+;/)[0],
    source.match(/const ONLINE_HOST_ROOM_STORAGE_KEY = "[^"]*";/)[0],
    source.match(/const ONLINE_HOST_ROOM_TTL_MS = [^;]*;/)[0],
    extractFunctionSource(source, 'getBoardViewSeat'),
    'function setBoardViewSeat(seat){ boardViewSeat = seat; }',
    'let boardViewSeatBeforeOnline = null;',
    extractFunctionSource(source, 'takeBoardViewForOnlineSeat'),
    'let onlineSession = null; let onlineInbox = []; let onlineTurnDraft = null;',
    'let onlinePresence = null; let onlineInviteSent = false;',
    'let lastFirstTurn = 0; let turnIndex = 0;',
    'let randomMapPairSequenceNumber = null; let randomMapPairIndex = null;',
    'function receiveOnlineEnvelope(){}',
    'function onRemoteMove(){} function onRemoteState(){}',
    'function onRemoteSettings(){} function onRemoteRematch(){}',
    'function applyOnlineRoomSettings(){} function receiveOnlineRematchAnswer(){}',
    'function receiveOnlinePresence(){} function receiveOnlineStart(){}',
    'function showOnlineLobby(){}',
    'function getConfiguredRelayUrl(){ return "wss://relay.example"; }',
    'function publishOnlineRoomSettings(){ вызовы.push({ настройки: onlineSession.seat }); return true; }',
    'function makeRandomString(n){ return "r".repeat(n); }',
    extractFunctionSource(source, 'makeOnlineRoomId'),
    extractFunctionSource(source, 'getSharedRandomFraction'),
    extractFunctionSource(source, 'isOnlineHost'),
    extractFunctionSource(source, 'getOnlineSeatColor'),
    extractFunctionSource(source, 'buildOnlineInviteLink'),
    extractFunctionSource(source, 'resolveOnlineRelayAddress'),
    extractFunctionSource(source, 'isRelayAddressAllowed'),
    extractFunctionSource(source, 'getRelayHost'),
    extractFunctionSource(source, 'isLocalPageOrigin'),
    source.match(/const ONLINE_RELAY_ALLOWED_HOSTS = Object\.freeze\(\[[^\]]*\]\);/)[0],
    extractFunctionSource(source, 'startOnlineSession'),
    'const провод = { kind: "stand", receive(){}, post(){}, close(){}, status: () => "online" };',
    'this.api = { startOnlineSession, isOnlineHost, buildOnlineInviteLink,',
    '  сесть: (opts) => startOnlineSession({ createTransport: () => провод, ...opts }),',
    '  место: () => onlineSession && onlineSession.seat,',
    '  слово: (место) => { onlineSession.hostSeat = место; },',
    '  вызовы: () => вызовы,',
    '  край: () => getBoardViewSeat() };',
  ].join('\n'), sandbox);
  return sandbox.api;
}

// === 1. ГЛАВНОЕ: зелёный хозяин остаётся хозяином ===
//
// Цвет здесь ровно обратный прежнему: раньше хозяином звался синий.
{
  const я = устройство('green');
  const сессия = я.сесть({ seat: 'green', room: 'стол', host: true });
  assert(сессия, '1: сессия не завелась');
  assert(я.место() === 'green', `1b: сели на «${я.место()}» вместо выбранного зелёного`);
  assert(я.isOnlineHost() === true,
    '1c: зелёный создатель комнаты не считается её хозяином — значит роль всё ещё берут '
    + 'из цвета, и переключатель стороны в меню для онлайна ничего не значит');
}

// === 2. Синий гость хозяином не становится ===
//
// Он приходит по ссылке, а в ссылке стоит место напротив хозяйского. Если хозяин взял
// зелёный, гостю достаётся синий — прежний признак хозяина.
{
  const друг = устройство('green');
  друг.сесть({ seat: 'blue', room: 'стол' });
  assert(друг.место() === 'blue', '2: гость сел не на то место, которое ему дали');
  assert(друг.isOnlineHost() === false,
    '2b: гостю досталось синее место, и он объявил себя хозяином: начнёт слать свои '
    + 'настройки комнаты и давать старт наравне с хозяином');
}

// === 3. Роль решает, кто шлёт настройки комнаты ===
//
// Проверка 1 говорит про флаг, эта — про последствие: настройки уезжают у хозяина и
// только у него, какого бы цвета он ни был.
{
  const хозяин = устройство('green');
  хозяин.сесть({ seat: 'green', room: 'стол', host: true });
  assert(хозяин.вызовы().some((з) => з.настройки === 'green'),
    '3: зелёный хозяин не разослал настройки комнаты — гость доиграет партию по своим, и '
    + 'разойдутся они молча');

  const гость = устройство('green');
  гость.сесть({ seat: 'blue', room: 'стол' });
  assert(!гость.вызовы().some((з) => з.настройки !== undefined),
    '3b: синий гость разослал свои настройки комнаты — решать за комнату стали двое');
}

// === 4. Ссылка зовёт на место напротив — при любом цвете хозяина ===
{
  for(const [свой, ожидаем] of [['green', 'blue'], ['blue', 'green']]){
    const я = устройство(свой);
    я.сесть({ seat: свой, room: 'стол', host: true });
    const ссылка = я.buildOnlineInviteLink();
    assert(ссылка.includes(`seat=${ожидаем}`),
      `4: хозяин сел на ${свой}, а ссылка зовёт друга на «${ссылка}» — не на свободное место`);
    assert(!ссылка.includes(`seat=${свой}`),
      `4b: ссылка зовёт друга на занятое место (${свой})`);
  }
}

// === 5. Комната заводится под край, выбранный в меню ===
{
  const вход = extractFunctionSource(source, 'createOnlineRoom');
  assert(/const seat = getBoardViewSeat\(\);/.test(вход),
    '5: комната больше не спрашивает край у меню — цвет в онлайне снова не выбирается');
  assert(/startOnlineSession\(\{ seat, room, relay, host: true \}\)/.test(вход),
    '5b: заводя комнату, игрок не отмечает себя её хозяином — роль будет не у кого');
}

// === 6. Роль нигде не выводится из цвета ===
//
// Главная ловушка этой правки: одно забытое место, где «синий» значит «хозяин», и двое
// начнут спорить за право решать. Поэтому проверяется и сама функция, и то, что прежняя
// константа осталась ровно одним — чтением старых записей о своей комнате.
{
  const роль = extractFunctionSource(source, 'isOnlineHost');
  assert(/onlineSession\.hostSeat/.test(роль),
    '6: роль хозяина больше не спрашивают у комнаты — вернувшись завтра по ссылке, '
    + 'хозяином не окажется никто');
  assert(/onlineSession\.host === true/.test(роль),
    '6b: пропал запасной ответ на время до первого слова комнаты — настройки комнаты '
    + 'не успеют уехать');
  assert(/onlineSession\.seat === хозяинСтола/.test(роль),
    '6b2: решает не совпадение своего места с хозяйским — значит решает что-то другое');
  for(const слово of ['getOnlineSeatColor', 'ONLINE_LEGACY_HOST_SEAT']){
    assert(!роль.includes(слово),
      `6c0: роль хозяина снова смотрит на «${слово}» — значит она опять привязана к цвету`);
  }

  // Цвет в функции упоминается, но только как проверка, что комната назвала осмысленное
  // место. Что это не признак хозяина — доказывается поведением: при хозяине-зелёном
  // синий не хозяин, и наоборот.
  for(const [хозяинСтола, моё, ждём] of [['green', 'blue', false], ['green', 'green', true],
                                         ['blue', 'green', false], ['blue', 'blue', true]]){
    const я = устройство('green');
    я.сесть({ seat: моё, room: 'стол', host: true });   // своё нажатие говорит «хозяин»
    я.слово(хозяинСтола);                                // а комната — своё
    assert(я.isOnlineHost() === ждём,
      `6c: комната назвала хозяином ${хозяинСтола}, место своё ${моё} — роль вышла `
      + `${я.isOnlineHost()}, а должна ${ждём}. Слово комнаты важнее своего нажатия: `
      + 'иначе вчерашний хозяин и сегодняшний начнут спорить');
  }

  const мест = source.split('ONLINE_LEGACY_HOST_SEAT').length - 1;
  assert(мест === 2,
    `6c: ONLINE_LEGACY_HOST_SEAT встречается ${мест} раз(а) вместо двух (объявление и `
    + 'чтение старой записи) — цвет хозяина снова что-то решает');
  assert(/ONLINE_LEGACY_HOST_SEAT/.test(extractFunctionSource(source, 'recallHostRoom')),
    '6d: старые записи о своей комнате больше не читаются как синие');

  assert(!/\bONLINE_HOST_SEAT\b/.test(source.replace(/ONLINE_LEGACY_HOST_SEAT/g, '')),
    '6e: вернулась константа «место хозяина» — роль снова цвет');
}

console.log('smoke-online-side-is-chosen: OK');
