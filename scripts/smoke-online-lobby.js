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
function makeSide(seat, { search = '', room = 'stand', origin = 'https://example.test', relayUrl = '' } = {}){
  const parsedOrigin = new URL(origin);
  const log = [];
  const sent = [];
  const sandbox = {
    Object, Array, Math, JSON, String, URLSearchParams, URL, Uint8Array, crypto,
    console: { log: () => {}, warn: (...a) => log.push(['warn', ...a]) },
    gameMode: null,
    onlineSession: {
      seat, room,
      transport: { kind: 'stand', status: () => 'online' },
    },
    window: { location: { origin, pathname: '/game/', search,
                          protocol: parsedOrigin.protocol, host: parsedOrigin.host,
                          hostname: parsedOrigin.hostname } },
    postOnlineEnvelope: (type, payload) => { sent.push({ type, payload }); return true; },
    handlePlayStart: () => log.push(['handlePlayStart']),
    applyOnlineMenuState: () => log.push(['applyOnlineMenuState']),
    syncPlayButtonSkin: (ready) => log.push(['play', ready]),
    HTMLElement: function HTMLElement(){},
    ONLINE_RELAY_URL: relayUrl,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_HOST_SEAT = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_ALPHABET = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_LENGTH = \d+;/)[0],
    'let onlinePresence = null;',
    source.match(/const ONLINE_RELAY_ALLOWED_HOSTS = Object\.freeze\(\[[^\]]*\]\);/)[0],
    extractFunctionSource(source, 'resolveOnlineRelayAddress'),
    extractFunctionSource(source, 'isLocalPageOrigin'),
    extractFunctionSource(source, 'getRelayHost'),
    extractFunctionSource(source, 'isRelayAddressAllowed'),
    extractFunctionSource(source, 'getConfiguredRelayUrl'),
    extractFunctionSource(source, 'isOnlineAvailable'),
    extractFunctionSource(source, 'makeRandomString'),
    extractFunctionSource(source, 'makeOnlineRoomId'),
    extractFunctionSource(source, 'buildOnlineInviteLink'),
    extractFunctionSource(source, 'isOnlineTableFull'),
    extractFunctionSource(source, 'getOnlineSeatColor'),
    extractFunctionSource(source, 'isOnlineHostSeat'),
    extractFunctionSource(source, 'receiveOnlinePresence'),
    extractFunctionSource(source, 'startOnlineMatchAsHost'),
    extractFunctionSource(source, 'receiveOnlineStart'),
    extractFunctionSource(source, 'refreshOnlineLobbyUi'),
    extractFunctionSource(source, 'getOnlineTroubleText'),
    'this.api = { isOnlineAvailable, makeOnlineRoomId, buildOnlineInviteLink,',
    '             getConfiguredRelayUrl, isRelayAddressAllowed, isOnlineHostSeat,',
    '             isOnlineTableFull, receiveOnlinePresence, receiveOnlineStart,',
    '             startOnlineMatchAsHost, getOnlineTroubleText, refreshOnlineLobbyUi,',
    '             presence: () => onlinePresence };',
  ].join('\n'), sandbox);
  return { seat, api: sandbox.api, log, sent, sandbox };
}

// === 1. Кнопка «Online» работает, только когда есть куда подключаться ===
{
  const withoutRelay = makeSide('blue', { search: '' });
  assert(withoutRelay.api.isOnlineAvailable() === false,
    '1: без адреса ретранслятора онлайна нет');

  // Чужой адрес из ссылки БОЛЬШЕ НЕ ПРИНИМАЕТСЯ. Подробнее — в проверке 1g ниже.
  const fromLink = makeSide('blue', { search: '?relay=wss://relay.example' });
  assert(fromLink.api.isOnlineAvailable() === false,
    '1b: чужой адрес из ссылки снова включает онлайн');

  const auto = makeSide('blue', { search: '?relay=auto' });
  assert(auto.api.isOnlineAvailable() === true, '1c: «auto» тоже адрес');

  const configured = makeSide('blue', {
    search: '?relay=wss://relay.example', relayUrl: 'wss://relay.example',
  });
  assert(configured.api.isOnlineAvailable() === true,
    '1b2: свой собственный ретранслятор, названный в ссылке, перестал приниматься');

  // Кнопка выключается в разметке и включается кодом, а не наоборот: файл открывают и
  // без сервера, и лучше пусть она сразу выглядит недоступной.
  const tag = markup.match(/<button id="onlineBtn"[^>]*>/)[0];
  assert(/\bdisabled\b/.test(tag), '1d: в разметке кнопка выключена');
  assert(/onlineBtn\.disabled = !available;/.test(source),
    '1e: включает её код — и только когда есть адрес');
  assert(/onlineBtn\.title = available/.test(source),
    '1f: и объясняет, почему выключена, если выключена');
}

// === 1g. ГЛАВНОЕ ПРО БЕЗОПАСНОСТЬ: чужой ретранслятор из ссылки не принимается ===
//
// Через ретранслятор едут настройки создателя комнаты и полные снимки партии. Пока
// ?relay=wss://... принимался как есть, присланная кем-то ссылка «сыграем?» уводила чужую
// партию на чужой сервер — и с виду всё работало.
//
// Разрешено ровно три вещи: свой настроенный адрес, «auto» (это адрес самой страницы, увести
// он никуда не может) и список запасных. Плюс любой адрес, если страница открыта на своей
// машине: подсунуть там ссылку некому, а разработчику она нужна — страница на одном порту,
// ретранслятор на другом, и «auto» такую пару не сводит.
{
  const наСайте = (search, relayUrl = 'wss://relay.paperwings.test') =>
    makeSide('blue', { search, relayUrl }).api;

  // Спрашивать надо КУДА ПОДКЛЮЧИМСЯ, а не «доступен ли онлайн»: со своим настроенным
  // ретранслятором онлайн доступен в любом случае, и по этому ответу подмены не видно.
  assert(наСайте('?relay=wss://evil.example').getConfiguredRelayUrl() === 'wss://relay.paperwings.test',
    '1g: чужой адрес из ссылки принят — это увод партии на чужой сервер');

  assert(наСайте('?relay=wss://relay.paperwings.test').getConfiguredRelayUrl()
      === 'wss://relay.paperwings.test',
    '1g2: свой собственный адрес в ссылке отвергается — тогда ссылки перестанут работать');
  assert(наСайте('?relay=wss://relay.paperwings.test/').getConfiguredRelayUrl()
      === 'wss://relay.paperwings.test/',
    '1g3: свой адрес со слэшем на конце считается чужим — это тот же самый ретранслятор');

  // Без своего адреса подключаться просто некуда, и это видно по кнопке.
  assert(наСайте('?relay=wss://evil.example', '').isOnlineAvailable() === false,
    '1g4: чужой адрес включает онлайн там, где своего ретранслятора нет вовсе');

  // На своей машине — можно что угодно: там некому подсунуть ссылку, а разработчику она
  // нужна, страница и сервер живут на разных портах.
  const местный = makeSide('blue', {
    search: '?relay=ws://192.168.1.50:8787', origin: 'http://localhost:8000',
  }).api;
  assert(местный.getConfiguredRelayUrl() === 'ws://192.168.1.50:8787',
    '1g5: на localhost произвольный адрес запрещён — так не отладить пару «страница + сервер» '
    + 'на разных портах');

  // И тот же адрес с обычной страницы — уже нельзя.
  const публичный = makeSide('blue', {
    search: '?relay=ws://192.168.1.50:8787', origin: 'https://example.test',
  }).api;
  assert(публичный.getConfiguredRelayUrl() === '',
    '1g6: с обычной страницы адрес из локальной сети принимается');

  // «auto» разрешено всегда: это адрес самой страницы, увести он никуда не может.
  assert(наСайте('?relay=auto').getConfiguredRelayUrl() === 'wss://example.test',
    '1g7: «auto» перестало работать — на нём держится и локальная сеть, и туннель');

  // Отказ обязан быть слышен: молча оставшись на своём адресе, игра выглядела бы исправной,
  // а человек не понял бы, почему его ссылка не сработала.
  const side = makeSide('blue', { search: '?relay=wss://evil.example', relayUrl: 'wss://ok.test' });
  side.api.getConfiguredRelayUrl();
  assert(side.log.some(([kind, text]) => kind === 'warn' && /отклонён/.test(String(text))),
    '1g8: об отказе нигде не сказано');
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

  // Явный адрес передаётся дальше, только если мы его САМИ приняли. Отклонённый поехал бы
  // по цепочке приглашений, у каждого молча отвергался и у каждого выглядел бы как «друг
  // открыл ссылку, и ничего не происходит».
  const свой = makeSide('blue', {
    search: '?relay=wss://relay.example', relayUrl: 'wss://relay.example',
  });
  assert(new URLSearchParams(свой.api.buildOnlineInviteLink().split('?')[1]).get('relay')
      === 'wss://relay.example', '2e: свой адрес перестал передаваться другу');

  const чужой = makeSide('blue', {
    search: '?relay=wss://evil.example', relayUrl: 'wss://relay.example',
  });
  assert(new URLSearchParams(чужой.api.buildOnlineInviteLink().split('?')[1]).get('relay') === null,
    '2e2: отклонённый адрес всё равно уезжает в ссылку другу');

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
//
// Раньше это обеспечивала пара «оба нажали готов». Теперь начинает один — хозяин, — и
// защита держится на двух вещах сразу: он не может начать без соперника, а гость не может
// начать вовсе. Пропадёт любая из них — и первый ход уедет тому, у кого партия не началась.
{
  const хозяин = makeSide('blue');

  хозяин.api.startOnlineMatchAsHost();
  assert(!хозяин.log.some(([name]) => name === 'handlePlayStart'),
    '4: без соперника матч не начинается');
  assert(хозяин.sent.filter((e) => e.type === 'start').length === 0,
    '4b: и «поехали» в пустую комнату не отправляется');

  хозяин.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  assert(хозяин.api.isOnlineTableFull() === true, '4c: комната сообщила, что оба на месте');

  хозяин.api.startOnlineMatchAsHost();
  assert(хозяин.log.some(([name]) => name === 'handlePlayStart'),
    '4d: с соперником за столом матч начинается');
  assert(хозяин.sent.filter((e) => e.type === 'start').length === 1,
    '4e: и сопернику уехало ровно одно «поехали»');
}

// === 4b. Гость начинает не сам, а по слову хозяина ===
//
// Это вторая половина замка. Если гость сумеет начать сам, получится ровно то, от чего
// защищались: двое в разных партиях, и ходы одного попадают в игру, которой у второго нет.
{
  const гость = makeSide('green');

  гость.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  гость.api.startOnlineMatchAsHost();
  assert(!гость.log.some(([name]) => name === 'handlePlayStart'),
    '4b1: гость не начинает партию сам, даже когда за столом двое');
  assert(гость.sent.filter((e) => e.type === 'start').length === 0,
    '4b2: и «поехали» от гостя не уезжает');

  гость.api.receiveOnlineStart();
  assert(гость.log.some(([name]) => name === 'handlePlayStart'),
    '4b3: услышав «поехали», гость входит в матч');

  // И обратное: хозяин чужого «поехали» не слушает. Своё эхо до него не доходит, но
  // пакет с этим типом может прийти от кого угодно, кто попал в комнату, — а решение
  // начинать принимает один.
  const хозяин = makeSide('blue');
  хозяин.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  хозяин.api.receiveOnlineStart();
  assert(!хозяин.log.some(([name]) => name === 'handlePlayStart'),
    '4b4: хозяина увели в партию чужим «поехали» — начинать должен он сам');
}

// === 4c. Хозяин не начинает дважды ===
//
// «Поехали» уехало, партия пошла — второе нажатие не должно ни начать её заново, ни
// послать сопернику ещё один старт посреди игры.
{
  const хозяин = makeSide('blue');
  хозяин.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  хозяин.api.startOnlineMatchAsHost();
  хозяин.sandbox.gameMode = 'online';
  хозяин.api.startOnlineMatchAsHost();
  assert(хозяин.sent.filter((e) => e.type === 'start').length === 1,
    '4c1: в идущей партии второе «поехали» не отправляется');
}

// === 4a. Замок на «Play» живёт в одном месте ===
//
// Вызывающих у syncPlayButtonSkin несколько, и любой забытый снова открыл бы возможность
// начать партию в одиночку. Поэтому решение принимает сама функция, а не её вызывающие.
{
  const gate = (presence, seat, inGame) => {
    const log = [];
    const sandbox = {
      Object, Math,
      HTMLElement: function HTMLElement(){},
      playBtn: null,
      applyMenuButtonSkin: () => {},
      gameMode: inGame ? 'online' : null,
      onlineSession: { seat },
      onlinePresence: presence,
      ONLINE_HOST_SEAT: 'blue',
      // Здесь проверяется онлайновый замок, поэтому карты считаем приехавшими: иначе
      // «Play» гасил бы второй замок, и проверка ничего не говорила бы про первый.
      mapsUnavailable: false,
      log,
    };
    sandbox.playBtn = Object.setPrototypeOf({
      disabled: false,
      classList: { toggle: () => {} },
      setAttribute: () => {},
    }, sandbox.HTMLElement.prototype);
    vm.createContext(sandbox);
    vm.runInContext([
      extractFunctionSource(source, 'getOnlineSeatColor'),
      extractFunctionSource(source, 'isOnlineHostSeat'),
      extractFunctionSource(source, 'isOnlineTableFull'),
      extractFunctionSource(source, 'syncPlayButtonSkin'),
      'syncPlayButtonSkin(true); this.disabled = playBtn.disabled;',
    ].join('\n'), sandbox);
    return sandbox.disabled;
  };

  assert(gate({ blue: true, green: false }, 'blue', false) === true,
    '4a: пока соперника нет, «Play» заблокирована — даже если её просят включить');
  assert(gate({ blue: true, green: true }, 'blue', false) === false,
    '4a2: когда оба на месте — хозяину доступна');
  assert(gate({ blue: true, green: true }, 'green', false) === true,
    '4a3: а гостю нет: начинает хозяин. Кнопку у гостя прячут ещё и стилями, но замок '
    + 'обязан держать и без них');
  assert(gate({ blue: true, green: false }, 'blue', true) === false,
    '4a4: в идущей игре замок не действует — там «Play» про другое');
}

// === 5. Приход соперника зажигает «Play» сам ===
//
// Отдельной строки состояния больше нет: то, что гость сел за стол, игрок узнаёт по
// загоревшейся кнопке и никак иначе. Значит известие от комнаты обязано её пересчитать.
{
  // Половина первая: известие от комнаты доходит до пересчёта экрана.
  const side = makeSide('blue');
  side.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  assert(side.log.some(([name]) => name === 'applyOnlineMenuState'),
    '5: приход соперника не пересчитал экран — единственный указатель остался погасшим');

  // Половина вторая: пересчёт экрана трогает саму кнопку. Живьём это не собрать — там
  // #modeMenu и самолётики, — поэтому читается сам код: замок обязан быть внутри.
  const пересчёт = extractFunctionSource(source, 'applyOnlineMenuState');
  assert(/syncPlayButtonSkin\(/.test(пересчёт),
    '5b: пересчёт экрана перестал трогать «Play» — она так и останется в том виде, '
    + 'в каком её застало открытие лобби');
  assert(/onlineSession && !gameMode/.test(пересчёт),
    '5c: «Play» пересчитывается и в идущей партии — там она про другое, и трогать её нельзя');
}

// === 6. Про поломки сказано словами, а про остальное — самим экраном ===
//
// Десять строк состояния схлопнулись в один экран и одну кнопку: пришёл ли соперник,
// видно по загоревшемуся «Play», а чего мы ждём — по тому, на каком экране стоим. Осталось
// то, чего глазами не увидеть: связь оборвалась или комната не пустила.
//
// Проверяется именно граница. Пока всё хорошо — молчание, потому что говорить не о чем.
// Стоит начать говорить в порядке — и текст вернётся на экран, а вместе с ним и панель.
{
  const тихо = makeSide('blue');
  assert(тихо.api.getOnlineTroubleText() === '',
    '6: при рабочей связи лобби молчит — говорить не о чем');
  тихо.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  assert(тихо.api.getOnlineTroubleText() === '',
    '6b: и когда соперник пришёл, тоже: об этом говорит «Play», а не строка');

  // Пока сокет только открывается, терять ещё нечего и пугать нечем.
  const открывается = makeSide('blue');
  открывается.sandbox.onlineSession.transport.status = () => 'connecting';
  assert(открывается.api.getOnlineTroubleText() === '',
    '6c: «подключаемся» — не поломка, и молчать про неё правильно');

  const оборвано = makeSide('green');
  оборвано.sandbox.onlineSession.transport.status = () => 'reconnecting';
  const текст = оборвано.api.getOnlineTroubleText();
  assert(текст.trim().length > 8, '6d: про потерянную связь лобби говорит, а не молчит');

  // Отказ комнаты и занятое место лечатся по-разному, поэтому и сказано о них разное.
  const отказ = makeSide('green');
  отказ.sandbox.onlineSession.transport.status = () => 'rejected';
  отказ.sandbox.onlineSession.transport.rejection = () => 'busy';
  const занято = makeSide('green');
  занято.sandbox.onlineSession.transport.status = () => 'rejected';
  занято.sandbox.onlineSession.transport.rejection = () => 'seat_taken';
  assert(отказ.api.getOnlineTroubleText() !== занято.api.getOnlineTroubleText(),
    '6e: занятое место и прочий отказ описаны одинаково, а лечатся по-разному');
  assert(!/Reload/i.test(занято.api.getOnlineTroubleText()),
    '6f: занятому месту советуют перезагрузиться — там сидит другой человек, и это '
    + 'гоняет пришедшего по кругу');
}

// === 7. Лобби в разметке — пункты меню, а не панель ===
//
// Панель тут и была тем единственным на экране, что не походило ни на что вокруг. Если
// она вернётся, вернётся и всё остальное: своё оформление, свои размеры, свой голос.
{
  for(const id of ['onlineSendLinkBtn', 'onlineCancelBtn',
                   'onlineWaitingLabel', 'onlineWaitingSpinner']){
    assert(new RegExp(`id="${id}"`).test(markup), `7: в разметке есть ${id}`);
  }
  // С точкой: без неё совпадёт имя теста smoke-online-lobby-fits в комментарии.
  assert(!/id="onlineLobby"/.test(markup) && !/\.online-lobby/.test(styles),
    '7b: панель лобби вернулась — на экране снова вещь без материала');

  // Кнопки лобби — те же кнопки меню и той же породы: иначе правило раскладки их не найдёт.
  for(const id of ['onlineSendLinkBtn', 'onlineCancelBtn']){
    const кнопка = new RegExp(`<button id="${id}"[\\s\\S]*?>`).exec(markup);
    assert(кнопка && /class="mode-menu__btn /.test(кнопка[0]),
      `7c: ${id} размечена не как кнопка меню — она уедет из своего места`);
  }

  // У гостя нет ни «Play», ни правил, и это не украшательство. «Play» — потому что
  // начинает хозяин. Правила — потому что они приезжают от хозяина готовыми: кнопки у
  // гостя лишь показывают его выбор, но нажимаются, и нажатие меняет правила ТОЛЬКО у
  // гостя, тихо разводя его с комнатой.
  for(const кнопка of ['play', 'classic', 'advanced']){
    const правило = new RegExp(
      `#menuLayer #modeMenu\\.is-online-guest \\.mode-menu__btn--${кнопка}[^{]*\\{[^}]*display:\\s*none`
    ).test(styles) || new RegExp(
      `\\.is-online-guest \\.mode-menu__btn--${кнопка},`
    ).test(styles);
    assert(правило, `7f: у гостя видна кнопка «${кнопка}» — а нажать её он не может ни с `
      + 'каким смыслом: правила ему присылают, а партию начинает хозяин');
  }

  // Ожидание показывается той же картинкой, что и загрузка. Не из лени: она уже скачана,
  // и экран ожидания не стоит игроку ни одного лишнего байта.
  const кружок = /<img id="onlineWaitingSpinner"[\s\S]*?>/.exec(markup);
  assert(кружок && /preload_animation\.gif/.test(кружок[0]),
    '7d: на экране ожидания своя картинка — а значит лишняя загрузка на ровном месте');
  assert(/"preload_animation\.gif"/.test(source),
    '7e: и она по-прежнему в списке предзагрузки, иначе поедет в момент показа');
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
