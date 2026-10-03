#!/usr/bin/env node
'use strict';

// Smoke test: ссылка приглашения не протухает от перезагрузки.
//
// Имя комнаты придумывается в тот миг, когда хозяин жмёт «Online». Пока оно жило только в
// памяти страницы, любая перезагрузка заводила НОВУЮ комнату — а ссылка, уже отправленная
// другу, продолжала вести в прежнюю.
//
// Беда этой поломки в том, что она выглядит как исправная работа. Друг открывает ссылку,
// попадает в свою комнату и ждёт в ней; у хозяина «Play» не загорается. Ни одной надписи
// про ошибку — потому что ошибки и нет: оба подключены, оба ждут, просто в разных
// комнатах. На этом потеряли вечер в день, когда онлайн наконец заработал.
//
// Проверяется поведение, а не хранилище: запустить «Online» дважды и убедиться, что
// комната та же; после «Cancel» — что другая.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const ДЛИНА_ИМЕНИ = Number(/const ONLINE_ROOM_ID_LENGTH = (\d+);/.exec(source)[1]);

function имяКомнатыГодное(имя){
  return typeof имя === 'string' && имя.length === ДЛИНА_ИМЕНИ && /^[a-z0-9]+$/.test(имя);
}

function extractFunctionSource(text, name){
  const start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции ${name}`);
}

// Стенд одного устройства: настоящий код комнаты, поддельное хранилище и часы.
//
// Хранилище общее на весь стенд — это и есть localStorage, переживающий перезагрузку:
// «перезагрузка» здесь означает собрать стенд заново поверх того же хранилища.
function makeDevice(хранилище = new Map(), сейчас = { ms: 1_700_000_000_000 }){
  const sandbox = {
    Object, Array, Math, JSON, String, Number, URLSearchParams, URL, crypto,
    console: { log: () => {}, warn: () => {} },
    Date: { now: () => сейчас.ms },
    window: {
      location: { origin: 'https://example.test', pathname: '/game/', search: '',
                  protocol: 'https:', host: 'example.test', hostname: 'example.test' },
      localStorage: {
        getItem: (ключ) => (хранилище.has(ключ) ? хранилище.get(ключ) : null),
        setItem: (ключ, значение) => { хранилище.set(ключ, String(значение)); },
        removeItem: (ключ) => { хранилище.delete(ключ); },
      },
    },
    // Сессия не нужна: проверяется выбор имени комнаты, а не то, что с ним дальше делают.
    startOnlineSession: ({ room, seat }) => ({ room, seat }),
    showOnlineLobby: () => {},
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_HOST_SEAT = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_ALPHABET = "[^"]*";/)[0],
    source.match(/const ONLINE_ROOM_ID_LENGTH = \d+;/)[0],
    source.match(/const ONLINE_ROOM_MAX_LENGTH = \d+;/)[0],
    source.match(/const ONLINE_HOST_ROOM_STORAGE_KEY = "[^"]*";/)[0],
    source.match(/const ONLINE_HOST_ROOM_TTL_MS = [^;]*;/)[0],
    'function getConfiguredRelayUrl(){ return "wss://relay.example"; }',
    extractFunctionSource(source, 'makeRandomString'),
    extractFunctionSource(source, 'makeOnlineRoomId'),
    extractFunctionSource(source, 'rememberHostRoom'),
    extractFunctionSource(source, 'recallHostRoom'),
    extractFunctionSource(source, 'forgetHostRoom'),
    extractFunctionSource(source, 'createOnlineRoom'),
    'this.api = { createOnlineRoom, forgetHostRoom, recallHostRoom, makeOnlineRoomId };',
  ].join('\n'), sandbox);
  return { api: sandbox.api, хранилище, сейчас };
}

// === 1. ГЛАВНОЕ: перезагрузка возвращает в ТУ ЖЕ комнату ===
//
// Иначе отправленная ссылка мертва, и узнать об этом нельзя до тех пор, пока друг не
// устанет ждать.
{
  const хранилище = new Map();
  const до = makeDevice(хранилище).api.createOnlineRoom();
  assert(до && до.room, '1: комната не завелась вовсе');
  assert(до.seat === 'blue', '1a: хозяин садится не на место хозяина');

  const после = makeDevice(хранилище).api.createOnlineRoom();
  assert(после.room === до.room,
    `1b: после перезагрузки комната сменилась (${до.room} -> ${после.room}) — ссылка, `
    + 'отправленная другу, ведёт в пустую комнату, и ни один из них этого не увидит');
}

// === 2. Без памяти о прежней комнате заводится новая ===
//
// Проверка 1 прошла бы и на коде, выдающем одно и то же имя всегда. Это не одно и то же:
// имя комнаты — то, что отделяет твой стол от чужого.
{
  const первое = makeDevice(new Map()).api.createOnlineRoom().room;
  const второе = makeDevice(new Map()).api.createOnlineRoom().room;
  assert(первое !== второе,
    `2: на чистом устройстве комната та же самая («${первое}») — значит имя не случайное, `
    + 'и двое незнакомых окажутся за одним столом');
}

// === 3. «Cancel» ссылку убивает ===
//
// Это не уход на минуту: за «Cancel» меняется весь экран. Если прежнее имя переживёт его,
// друг, открывший старую ссылку завтра, молча сядет за стол, за которым хозяин ждёт уже
// другого.
{
  const хранилище = new Map();
  const устройство = makeDevice(хранилище);
  const было = устройство.api.createOnlineRoom().room;
  устройство.api.forgetHostRoom();
  const стало = makeDevice(хранилище).api.createOnlineRoom().room;
  assert(стало !== было, '3: после «Cancel» хозяин вернулся в прежнюю комнату');

  // И сама кнопка обязана это звать: без вызова проверка выше проверяет пустоту.
  const отмена = source.slice(source.indexOf('if(onlineCancelBtn instanceof HTMLElement){'));
  const тело = отмена.slice(0, отмена.indexOf('\n}'));
  assert(/forgetHostRoom\(\)/.test(тело),
    '3b: «Cancel» больше не забывает комнату — старая ссылка переживёт выход');
}

// === 4. Через срок прежняя комната не воскресает ===
//
// Вернувшийся через неделю не должен попадать в комнату, ссылку на которую кто-то всё ещё
// держит открытой: такой гость сядет за стол молча и неожиданно.
{
  const хранилище = new Map();
  const часы = { ms: 1_700_000_000_000 };
  const было = makeDevice(хранилище, часы).api.createOnlineRoom().room;

  const черезЧас = makeDevice(хранилище, { ms: часы.ms + 60 * 60 * 1000 });
  assert(черезЧас.api.createOnlineRoom().room === было,
    '4: через час комната уже чужая — а ссылка, отправленная утром, живёт дольше');

  const черезСутки = makeDevice(хранилище, { ms: часы.ms + 24 * 60 * 60 * 1000 });
  assert(черезСутки.api.createOnlineRoom().room !== было,
    '4b: суточной давности комната всё ещё в силе — срок перестал действовать');
}

// === 5. Испорченная запись не ломает онлайн ===
//
// В localStorage попадает что угодно: чужое расширение, оборванная запись, ручная правка.
// Цена ошибки здесь — не «забыли комнату», а «кнопка Online перестала работать».
{
  for(const мусор of ['', 'не json', '{}', '{"room":""}', '[1,2,3]', 'null',
                      '{"room":"abc"}', '{"room":123,"at":1}']){
    const хранилище = new Map([['online.hostRoom', мусор]]);
    const устройство = makeDevice(хранилище);
    const комната = устройство.api.createOnlineRoom();
    assert(комната && имяКомнатыГодное(комната.room),
      `5: на записи «${мусор}» комната не завелась — онлайн встал из-за мусора в хранилище`);
  }
}


console.log('smoke-online-room-memory: OK');
