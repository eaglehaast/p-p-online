#!/usr/bin/env node
'use strict';

// Smoke test: провод, умерший молча.
//
// Сокет умеет умирать не закрываясь. На телефоне это обычное дело: сменилась сеть, вышли
// из метро, вебвью телеграма уснул и проснулся — соединение остаётся в состоянии OPEN, а
// пакеты по нему больше не ходят. Ни «закрылся», ни «ошибка» при этом не случается.
//
// Замерено на стенде ДО правки: у гостя молча умер провод, хозяин сходил — и через минуту
// у них разные доски, при том что обе стороны показывают «связь есть». Дальше партия
// разъезжается именно так, как это выглядит у игрока: ход возвращается к тому же цвету,
// самолёты не взлетают, огонь не гаснет.
//
// Лечится это двумя вещами, и обе ломаются тихо:
//
//   1. Оклик. Клиент время от времени окликает комнату, комната отвечает. Молчание в
//      ответ — единственный доступный признак мёртвого провода.
//   2. Применение досланного. Комната придерживает последний снимок партии и отдаёт его
//      вошедшему. Пока этот снимок отбрасывался как «повтор по номеру», переподключение
//      ничего не лечило: связь возвращалась, доски оставались разными.
//
// И отдельно — похоронка. Мёртвый сокет закрывается не сразу, и его «закрылся» приходит,
// когда на его месте работает уже другой. Принятое за своё, оно обрывает живую связь, а
// код вытеснения (4001) и вовсе кончает сессию насовсем.

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
const workerSource = fs.readFileSync('worker/index.js', 'utf8');
const localSource = fs.readFileSync('worker/local-server.js', 'utf8');
const roomSource = fs.readFileSync('worker/room.js', 'utf8');

// Стенд провода: настоящий createWebSocketTransport, поддельные сокет и часы.
//
// Часы поддельные не ради скорости: настоящие двадцать пять секунд в проверке — это
// проверка, которую перестанут запускать.
function стенд(){
  const сокеты = [];
  const таймеры = [];
  let сейчас = 1_000_000;
  const состояния = [];

  const sandbox = {
    Object, Array, String, Number, JSON, Math,
    console: { log: () => {}, warn: () => {}, error: () => {} },
    сокеты, таймеры, состояния,
    Date: { now: () => сейчас },
    setInterval: (fn, ms) => { таймеры.push({ fn, ms, вид: 'интервал', живой: true }); return таймеры.length; },
    clearInterval: (id) => { if(таймеры[id - 1]) таймеры[id - 1].живой = false; },
    setTimeout: (fn, ms) => { таймеры.push({ fn, ms, вид: 'срок', живой: true }); return таймеры.length; },
    clearTimeout: (id) => { if(таймеры[id - 1]) таймеры[id - 1].живой = false; },
    WebSocket: function WebSocket(адрес){
      const с = {
        // Как в браузере: только что созданный сокет ещё НЕ открыт. Иначе стенд врал бы
        // в обе стороны — и про «связь есть», и про то, можно ли в него слать.
        адрес, readyState: 0, послано: [], закрыт: null,
        send(текст){ if(this.глухой) return; this.послано.push(текст); },
        close(код, причина){ this.закрыт = { код, причина }; this.readyState = 3; },
        // «Умер молча»: состояние OPEN, но ничего не доходит и не уходит.
        оглохнуть(){ this.глухой = true; },
      };
      сокеты.push(с);
      return с;
    },
    ONLINE_PROTOCOL_VERSION: 2,
  };
  sandbox.WebSocket.OPEN = 1;
  sandbox.WebSocket.CLOSED = 3;

  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_RECONNECT_DELAYS_MS = Object\.freeze\(\[[^\]]*\]\);/)[0],
    source.match(/const ONLINE_PING_EVERY_MS = [^;]*;/)[0],
    source.match(/const ONLINE_SILENCE_LIMIT_MS = [^;]*;/)[0],
    source.match(/const ONLINE_PING_TEXT = "[^"]*";/)[0],
    source.match(/const ONLINE_DISPLACED_CODE = \d+;/)[0],
    source.match(/const ONLINE_DISPLACED_REASON = "[^"]*";/)[0],
    extractFunctionSource(source, 'createWebSocketTransport'),
    'this.api = { createWebSocketTransport, пинг: ONLINE_PING_TEXT,',
    '  каждые: ONLINE_PING_EVERY_MS, предел: ONLINE_SILENCE_LIMIT_MS };',
  ].join('\n'), sandbox);

  const провод = sandbox.api.createWebSocketTransport(
    'стол', 'wss://relay.example', 'blue',
    () => { состояния.push(провод ? провод.status() : null); },
    'ключ-ключ-ключ-ключ', false);

  return {
    провод,
    api: sandbox.api,
    сокеты,
    состояния,
    // Прокрутить время: живые интервалы срабатывают столько раз, сколько уместилось.
    промотать(мс){
      const шаг = 500;
      for(let прошло = 0; прошло < мс; прошло += шаг){
        сейчас += шаг;
        for(const т of таймеры){
          if(!т.живой) continue;
          if(т.вид === 'интервал'){
            т.накоплено = (т.накоплено ?? 0) + шаг;
            while(т.накоплено >= т.ms){ т.накоплено -= т.ms; т.fn(); }
          } else {
            т.ждёт = (т.ждёт ?? т.ms) - шаг;
            if(т.ждёт <= 0){ т.живой = false; т.fn(); }
          }
        }
      }
    },
    слово(сокет, текст){ сейчас += 1; сокет.onmessage?.({ data: текст }); },
    // Сокет открылся: сперва состояние, потом событие — как в браузере.
    открыть(сокет){ сокет.readyState = 1; сокет.onopen?.(); },
  };
}

// Обработчик сообщения облачной комнаты — как он есть, вырезанный из метода класса.
function прогнатьОблако(сообщение){
  const начало = workerSource.indexOf('async webSocketMessage(socket, message){');
  if(начало === -1) throw new Error('не найден webSocketMessage облачной комнаты');
  const телоС = workerSource.indexOf('{', начало);
  let глубина = 0;
  let конец = -1;
  for(let i = телоС; i < workerSource.length; i += 1){
    if(workerSource[i] === '{') глубина += 1;
    if(workerSource[i] === '}') глубина -= 1;
    if(глубина === 0){ конец = i + 1; break; }
  }
  const тело = workerSource.slice(телоС, конец);
  const послано = [];
  let переслано = false;
  const sandbox = {
    JSON, console: { warn: () => {} },
    RELAY_PONG_TEXT: 'pong', RELAY_ERRORS: { TOO_LARGE: 'too_large' },
    isPingMessage: (т) => т === 'ping',
    isMessageTooLarge: () => false,
    routeEnvelope: () => ({ kept: false, droppedState: false, connection: сопер }),
    послано,
  };
  const сопер = { send: () => { переслано = true; } };
  sandbox.сопер = сопер;
  vm.createContext(sandbox);
  vm.runInContext(`this.ход = async function(socket, message)${тело};`, sandbox);
  const комната = {
    state: { getTags: () => ['blue'], storage: { put: async () => {}, delete: async () => {} } },
    room: {},
  };
  sandbox.ход.call(комната, { send: (т) => послано.push(т), close: () => {} }, сообщение);
  return { послано, переслано };
}

// Он же у локального сервера: там это обработчик события, а не метод.
function прогнатьЛокальный(сообщение){
  const начало = localSource.indexOf('connection.on("message", (text) => {');
  if(начало === -1) throw new Error('не найден обработчик сообщения локального сервера');
  const телоС = localSource.indexOf('{', localSource.indexOf('=>', начало));
  let глубина = 0;
  let конец = -1;
  for(let i = телоС; i < localSource.length; i += 1){
    if(localSource[i] === '{') глубина += 1;
    if(localSource[i] === '}') глубина -= 1;
    if(глубина === 0){ конец = i + 1; break; }
  }
  const тело = localSource.slice(телоС, конец);
  const послано = [];
  let переслано = false;
  const sandbox = {
    JSON, String, console: { log: () => {} },
    RELAY_PONG_TEXT: 'pong', RELAY_ERRORS: { TOO_LARGE: 'too_large' },
    isPingMessage: (т) => т === 'ping',
    isMessageTooLarge: () => false,
    routeEnvelope: () => ({ connection: { send: () => { переслано = true; } } }),
    connection: { send: (т) => послано.push(т), close: () => {} },
    room: {}, roomName: 'стол', seat: 'blue',
  };
  vm.createContext(sandbox);
  vm.runInContext(`this.ход = (text) => ${тело};`, sandbox);
  sandbox.ход(сообщение);
  return { послано, переслано };
}

// === 1. ГЛАВНОЕ: провод проверяется окликом ===
{
  const с = стенд();
  assert(с.сокеты.length === 1, '1: сокет не открылся вовсе');
  с.открыть(с.сокеты[0]);
  с.промотать(11_000);
  assert(с.сокеты[0].послано.includes(с.api.пинг),
    `1: за ${с.api.каждые} мс комнату ни разу не окликнули — мёртвый провод так и останется `
    + 'незамеченным, а партия разойдётся молча');

  // Пока комната отвечает — ничего не трогаем.
  for(let i = 0; i < 6; i += 1){
    с.промотать(10_000);
    с.слово(с.сокеты[0], 'pong');
  }
  assert(с.сокеты.length === 1,
    `1b: провод переоткрыт ${с.сокеты.length} раз, хотя комната отвечала на каждый оклик`);
  assert(с.сокеты[0].закрыт === null, '1c: живой провод закрыт');
  assert(с.провод.status() === 'online', `1d: живая связь считается «${с.провод.status()}»`);
}

// === 2. Молчание в ответ — это смерть, и провод открывается заново ===
{
  const с = стенд();
  с.открыть(с.сокеты[0]);
  с.сокеты[0].оглохнуть();
  // Замечают молчание на очередном оклике, поэтому ждать надо предел И шаг между
  // окликами: позже этого срока правда уже не всплывёт никогда.
  с.промотать(с.api.предел + с.api.каждые + 2_000);
  assert(с.провод.status() !== 'online',
    '2: провод, не ответивший ни на один оклик, всё ещё считается живым — это и есть та '
    + 'самая «связь есть» при разошедшихся досках');
  // Переподключение заведено и доводится до нового сокета.
  с.промотать(20_000);
  assert(с.сокеты.length >= 2,
    `2b: после смерти провода новый не открыт (сокетов ${с.сокеты.length}) — партия стоит навсегда`);
  с.открыть(с.сокеты[с.сокеты.length - 1]);
  assert(с.провод.status() === 'online', '2c: после переподключения связь не считается живой');
}

// === 3. Похоронка мёртвого провода не трогает живой ===
//
// Мёртвый сокет закрывается не сразу: браузер досылает в него пакеты, пока не истечёт
// его собственный срок. Его «закрылся» приходит, когда на его месте работает уже другой.
{
  const с = стенд();
  с.открыть(с.сокеты[0]);
  с.сокеты[0].оглохнуть();
  с.промотать(с.api.предел + 20_000);
  const мёртвый = с.сокеты[0];
  const живой = с.сокеты[с.сокеты.length - 1];
  assert(живой !== мёртвый, '3: стенд не открыл новый сокет, проверять нечего');
  с.открыть(живой);

  // Теперь запоздало отзывается мёртвый — и самым опасным из кодов.
  мёртвый.onclose({ code: 4001, reason: 'seat_taken_over' });
  assert(с.провод.status() === 'online',
    `3b: похоронка мёртвого сокета убила живую связь («${с.провод.status()}») — человек `
    + 'увидит «игра открыта в другом окне» на ровном месте');
  assert(с.провод.rejection() === '',
    `3c: мёртвый сокет объявил сессию законченной («${с.провод.rejection()}»)`);
}

// === 4. Оклик умеет отвечать сама комната ===
{
  const пинг = /export const RELAY_PING_TEXT = "([^"]+)";/.exec(roomSource);
  const понг = /export const RELAY_PONG_TEXT = "([^"]+)";/.exec(roomSource);
  assert(пинг && понг, '4: комната не знает слов оклика');
  const свой = /const ONLINE_PING_TEXT = "([^"]+)";/.exec(source);
  assert(свой && свой[1] === пинг[1],
    `4b: клиент окликает словом «${свой && свой[1]}», а комната ждёт «${пинг[1]}» — ответа `
    + 'не будет, и живой провод каждые полминуты будут хоронить');

  assert(/setWebSocketAutoResponse/.test(workerSource),
    '4c: облачная комната не поручила ответ движку — оклик раз в десять секунд будет '
    + 'будить её ото сна, а спящий режим тут не оптимизация, а условие бесплатности');
  // И не на словах, а делом: прогоняем оклик через настоящие обработчики обоих серверов.
  // Упоминания имён мало — проверка должна падать от выброшенной ветки, а не от
  // переименования.
  const обаОтветили = [
    ['worker/index.js', прогнатьОблако, '4d', 'на движке без автоответа провод будут '
      + 'хоронить при живой связи'],
    ['worker/local-server.js', прогнатьЛокальный, '4e', 'на своей машине связь будет '
      + '«умирать» каждые полминуты'],
  ];
  for(const [имя, прогнать, номер, беда] of обаОтветили){
    const оклик = прогнать(пинг[1]);
    assert(оклик.послано.join() === понг[1],
      `${номер}: ${имя} на оклик ответил «${оклик.послано.join() || 'молчанием'}» — ${беда}`);
    assert(оклик.переслано === false,
      `${номер}2: ${имя} погнал оклик сопернику — тот получит мусор вместо пакета игры`);

    const пакет = прогнать(JSON.stringify({ p: 2, t: 'move', payload: {} }));
    assert(пакет.переслано === true,
      `${номер}3: ${имя} из-за ветки оклика перестал пересылать обычные пакеты`);
  }

  // Оклик — голое слово, а не пакет игры: только такое умеет отвечать движок, не будя
  // комнату. Пакет с полями p/t/from автоответом не отбить.
  assert(!/[{:]/.test(пинг[1]), `4f: оклик стал пакетом («${пинг[1]}») — автоответ так не работает`);
}

// === 5. Досланный комнатой снимок применяется, даже если номер не новее ===
//
// Это вторая половина лечения. Без неё связь восстанавливается, а доски остаются разными.
{
  function приём({ replay, seq, lastSeen }){
    const приняты = [];
    const sandbox = {
      Object, String, Boolean,
      console: { log: () => {}, warn: () => {} },
      ONLINE_PROTOCOL_VERSION: 2,
      onlineSession: {
        selfId: 'я', seat: 'blue',
        lastSeenSeqByPeer: Object.create(null),
        stateHandlers: [(payload) => приняты.push(payload)],
        moveHandlers: [], settingsHandlers: [], rematchHandlers: [],
        presenceHandlers: [], startHandlers: [], rejoinHandlers: [],
      },
    };
    sandbox.onlineSession.lastSeenSeqByPeer['он'] = lastSeen;
    vm.createContext(sandbox);
    vm.runInContext([
      extractFunctionSource(source, 'receiveOnlineEnvelope'),
      'this.взять = (к) => receiveOnlineEnvelope(к);',
    ].join('\n'), sandbox);
    sandbox.взять({ p: 2, t: 'state', from: 'он', seat: 'green', seq, replay, payload: { метка: seq } });
    return приняты;
  }

  assert(приём({ replay: true, seq: 7, lastSeen: 9 }).length === 1,
    '5: досланный комнатой снимок отброшен как повтор — после обрыва стороны так и '
    + 'останутся при разных досках, хотя связь восстановилась');
  assert(приём({ replay: undefined, seq: 7, lastSeen: 9 }).length === 0,
    '5b: обычный отставший пакет принят — ход разыграется второй раз');
  assert(приём({ replay: undefined, seq: 10, lastSeen: 9 }).length === 1,
    '5c: свежий пакет отброшен');
}

console.log('smoke-online-dead-wire: OK');
