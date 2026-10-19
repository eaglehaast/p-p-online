#!/usr/bin/env node
'use strict';

// Smoke test: полный стол без партии разбирается сам.
//
// Начало партии держится на двух пакетах: комната говорит «оба на месте», хозяин
// отвечает «поехали». Потерять можно любой, и теряются они там, где это всего обиднее:
// человек отправил ссылку, ушёл в переписку, вебвью уснул — а пакет приехал ровно в эту
// минуту.
//
// Поймано на живой игре через телеграм: оба устройства подключены, оба в ожидании, и так
// навсегда. Перезаход по ссылке «чинил» — он заново проходил тот самый миг.
//
// Ломалось это потому, что старт висел на ПЕРЕХОДЕ: «стол только что стал полным».
// Проверяется теперь состояние, и пока оно держится, его разбирают заново:
//
//   1. Хозяин зовёт начинать на каждое известие о полном столе, а не только на первое.
//   2. Пока партии нет, стороны напоминают о себе по будильнику: хозяин — «поехали»,
//      гость — «я за столом».
//   3. И ни то, ни другое не начинает партию дважды: иначе вместо зависшего лобби мы
//      получили бы перезапуск посреди игры.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Не найдена функция ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');

// Стенд одного устройства: настоящие присутствие, старт и напоминание.
function устройство({ seat = 'blue', host = true } = {}){
  const sent = [];
  const log = [];
  const будильники = [];
  const sandbox = {
    Object, Array, String, Boolean, Number, Date, JSON,
    console: { log: () => {}, warn: () => {} },
    sent, log, будильники,
    gameMode: null,
    roundNumber: 0, turnCommitSequence: 0, blueScore: 0, greenScore: 0,
    hasShotThisRound: false,
    onlineSession: {
      seat, host, hostSeat: null, settingsPublished: true,
      aloneSince: null, transport: { kind: 'stand', status: () => 'online' },
    },
    onlinePresence: null,
    onlineEmptyTableTimer: null,
    onlineHandshakeTimer: null,
    onlineInbox: [],
    postOnlineEnvelope: (type, payload) => { sent.push({ type, payload }); return true; },
    handlePlayStart: () => { sandbox.gameMode = 'online'; log.push('handlePlayStart'); },
    applyOnlineMenuState: () => log.push('applyOnlineMenuState'),
    перезапуститьсяЗаСоперником: () => { log.push('перезапуск'); },
    refreshOnlineLobbyUi: () => {},
    publishOnlineRoomSettings: () => true,
    следитьЗаПустымСтолом: () => {},
    забытьПриехавшееДоНачала: () => { sandbox.onlineInbox = []; },
    // Будильник не ждём, а дёргаем руками: настоящие шесть секунд в проверке — это
    // проверка, которую перестанут запускать.
    setInterval: (fn, ms) => { будильники.push({ fn, ms }); return будильники.length; },
    clearInterval: (id) => { if(будильники[id - 1]) будильники[id - 1].снят = true; },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_HANDSHAKE_RETRY_MS = [^;]*;/)[0],
    extractFunctionSource(source, 'isOnlineTableFull'),
    extractFunctionSource(source, 'isOnlineHost'),
    extractFunctionSource(source, 'партияСдвинулась'),
    extractFunctionSource(source, 'startOnlineMatchAsHost'),
    extractFunctionSource(source, 'receiveOnlinePresence'),
    extractFunctionSource(source, 'receiveOnlineRejoin'),
    extractFunctionSource(source, 'напомнитьОСебе'),
    extractFunctionSource(source, 'следитьЗаНачаломПартии'),
    extractFunctionSource(source, 'перестатьЖдатьНачала'),
    'this.api = { receiveOnlinePresence, напомнитьОСебе, следитьЗаНачаломПартии,',
    '  перестатьЖдатьНачала, receiveOnlineRejoin, isOnlineTableFull };',
  ].join('\n'), sandbox);
  return {
    api: sandbox.api, sandbox, sent, log, будильники,
    стартов: () => sent.filter((e) => e.type === 'start').length,
    явок: () => sent.filter((e) => e.type === 'rejoin').length,
  };
}

// === 1. ГЛАВНОЕ: полный стол без партии зовёт начинать снова ===
{
  const хозяин = устройство({ host: true });
  хозяин.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  assert(хозяин.стартов() === 1, '1: соперник пришёл, а начинать его никто не позвал');
  assert(хозяин.sandbox.gameMode === 'online', '1b: хозяин сам в партию не вошёл');

  // «Поехали» потерялось в пути, партия так и не началась.
  хозяин.sandbox.gameMode = null;
  хозяин.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  assert(хозяин.стартов() === 2,
    '1c: стол полон, партии нет, а хозяин больше не зовёт начинать — оба останутся в '
    + 'ожидании навсегда, и починит это только перезаход по ссылке');
}

// === 2. Партию посреди игры это не перезапускает ===
//
// Известия о присутствии приходят и после начала — например, когда соперник
// переподключился. Второе «поехали» в этот миг стоило бы хода.
{
  const хозяин = устройство({ host: true });
  хозяин.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  for(let i = 0; i < 5; i += 1){
    хозяин.api.receiveOnlinePresence({ seats: { blue: true, green: true } });
  }
  assert(хозяин.стартов() === 1,
    `2: за партию уехало ${хозяин.стартов()} «поехали» вместо одного — доска сбрасывалась бы `
    + 'у обоих посреди игры');
  // Проверять это надо на ГОСТЕ: у хозяина есть вторая защита внутри
  // startOnlineMatchAsHost, и она прячет пропажу первой.
  const вИгре = устройство({ seat: 'green', host: false });
  вИгре.sandbox.onlineSession.hostSeat = 'blue';
  вИгре.sandbox.onlinePresence = { blue: true, green: true };
  вИгре.sandbox.gameMode = 'online';
  assert(вИгре.api.напомнитьОСебе() === false, '2b: напоминание срабатывает в идущей партии');
  assert(вИгре.явок() === 0,
    '2c: гость напоминает о себе посреди партии — хозяин примет это за «соперник сел '
    + 'заново» и перезапустит доску у обоих');
}

// === 3. Гость не зовёт начинать за хозяина, но и не молчит ===
//
// Начать может только хозяин — иначе два «поехали» разъедутся. Но гость обязан сказать,
// что он здесь: у хозяина на это есть ответ.
{
  const гость = устройство({ seat: 'green', host: false });
  гость.sandbox.onlineSession.hostSeat = 'blue';
  гость.api.receiveOnlinePresence({ seats: { blue: true, green: true }, host: 'blue' });
  assert(гость.стартов() === 0, '3: гость позвал начинать вместо хозяина');
  assert(гость.sandbox.gameMode === null, '3b: гость начал партию сам');

  assert(гость.api.напомнитьОСебе() === true, '3c: гость не напомнил о себе');
  assert(гость.явок() === 1,
    '3d: гость сидит за полным столом и молчит — если «поехали» потерялось, хозяин так и '
    + 'не узнает, что его ждут');
}

// === 4. Напоминание молчит, когда напоминать не о чем ===
{
  const один = устройство({ host: true });
  один.api.receiveOnlinePresence({ seats: { blue: true, green: false } });
  assert(один.стартов() === 0, '4: «поехали» уехало в пустую комнату');
  const одинГость = устройство({ seat: 'green', host: false });
  одинГость.sandbox.onlineSession.hostSeat = 'blue';
  одинГость.sandbox.onlinePresence = { blue: false, green: true };
  assert(одинГость.api.напомнитьОСебе() === false,
    '4b: напоминание работает за пустым столом — соперника нет, звать некого');
  assert(одинГость.явок() === 0, '4b2: и в пустоту уехало «я за столом»');

  const ушедший = устройство({ host: true });
  ушедший.sandbox.onlineSession = null;
  assert(ушедший.api.напомнитьОСебе() === false, '4c: напоминание работает без стола');
}

// === 5. Будильник заводится при посадке и снимается при выходе ===
{
  const у = устройство({ host: true });
  assert(у.api.следитьЗаНачаломПартии() === true, '5: будильник не завёлся');
  assert(у.будильники.length === 1, '5b: будильников заведено не один');
  // Срок сверяется с числами, а не сам с собой: две секунды — нижняя граница, чтобы не
  // молотить попусту, пятнадцать — верхняя, за ней человек уже решит, что игра сломалась.
  assert(у.будильники[0].ms >= 2000 && у.будильники[0].ms <= 15000,
    `5c: напоминание ходит раз в ${у.будильники[0].ms} мс — это либо шум, либо слишком `
    + 'долгое ожидание у двоих, уставившихся в «ждём соперника»');
  assert(у.api.следитьЗаНачаломПартии() === false, '5d: заведён второй будильник поверх первого');
  assert(у.api.перестатьЖдатьНачала() === true, '5e: будильник не снимается');
  assert(у.будильники[0].снят === true, '5f: будильник остался тикать после выхода');

  // И посадка с выходом действительно их дёргают.
  const посадка = extractFunctionSource(source, 'startOnlineSession');
  assert(/следитьЗаНачаломПартии\(\)/.test(посадка),
    '5g: садясь за стол, игра не следит за началом партии');
  const выход = extractFunctionSource(source, 'stopOnlineSession');
  assert(/перестатьЖдатьНачала\(\)/.test(выход),
    '5h: выйдя из-за стола, игра продолжает напоминать о себе');
}

// === 6. Начало партии проверяет состояние, а не миг перехода ===
//
// Та самая строка, на которой всё и висело.
{
  const присутствие = extractFunctionSource(source, 'receiveOnlinePresence');
  assert(!/wasFull/.test(присутствие),
    '6: начало партии снова привязано к переходу «стол только что стал полным» — один '
    + 'потерянный пакет, и оба ждут друг друга вечно');
  assert(/if\(isOnlineTableFull\(\)\) startOnlineMatchAsHost\(\);/.test(присутствие),
    '6b: известие о полном столе больше не зовёт начинать');
}

console.log('smoke-lobby-handshake: OK');
