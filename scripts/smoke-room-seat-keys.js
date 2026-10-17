#!/usr/bin/env node
'use strict';

// Smoke test: место в комнате защищено ключом, а ключи нельзя предсказать.
//
// Две беды одного корня — «знание строки даёт доступ», — поэтому и чинятся вместе.
//
// ПЕРВАЯ. Место защищало только имя комнаты. Комната нарочно ВЫТЕСНЯЕТ прежнее соединение
// на том же месте: оборвавшийся сокет сервер замечает не сразу, и отказ означал бы
// «подождите минуту, пока мы заметим, что вас нет». Но отличить вернувшегося от
// постороннего было нечем, и то же вытеснение работало для любого, кто знал имя комнаты, —
// а имя диктуют вслух и пересылают в чатах. Достаточно было открыть ту же ссылку, чтобы
// выкинуть человека из его же партии, и повторять сколько угодно.
//
// ВТОРАЯ. Имя комнаты бралось из Math.random(). Генератор в браузере не криптографический:
// по нескольким выданным значениям его состояние восстанавливается, а с ним предсказываются
// и следующие имена. Для костей это неважно, для «кто может войти» — важно.
//
// Теперь у места есть ключ: придумывает его тот, кто сел первым, комната запоминает и
// дальше сверяет. Со своим ключом место отдаётся (это и есть возвращение после обрыва), с
// чужим — отказ. Ключ и имя комнаты порождает crypto.getRandomValues.
//
// Ключ в ссылку приглашения НЕ кладётся: ссылку пересылают в чатах, и вложенный в неё ключ
// достался бы всякому, кто её видел. Пусть лучше место займёт тот, кто первым по ней
// придёт, — а второму комната честно откажет.
//
// Проверено на живом ретрансляторе четырьмя настоящими сокетами:
//
//   синий со своим ключом                       сел
//   зелёный со своим ключом                     сел
//   ПОСТОРОННИЙ с чужим ключом на зелёное       отказ 4000 seat_taken
//   зелёный вернулся со своим ключом            сел, прежний сокет закрыт 4001
//   ключ короче предела                         отказ 4000 bad_key
//
// И сам генератор, 20 000 имён подряд: все 20 000 разные, длина везде 6, чужих букв нет,
// худшее отклонение от равномерного 2.61%, источник — crypto.getRandomValues.

const fs = require('fs');
const room = require('../worker/room.js');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');
const workerSource = fs.readFileSync('worker/index.js', 'utf8');
const localSource = fs.readFileSync('worker/local-server.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

function stripComments(source){
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}
const code = stripComments(script);

const BLUE = 'kljucsinegomesta1234';
const OTHER = 'sovsemdrugojkljuc567';

// === 1. ГЛАВНОЕ: чужой не сядет на занятое место ===
{
  const r = room.createRoom();
  const blue = { id: 'blue-1' };
  assert(room.joinRoom(r, { seat: 'blue', version: room.RELAY_PROTOCOL_VERSION, connection: blue, key: BLUE }).ok,
    '1: первый не смог занять свободное место');

  const stranger = room.joinRoom(r, {
    seat: 'blue', version: room.RELAY_PROTOCOL_VERSION, connection: { id: 'chuzhoj' }, key: OTHER,
  });
  assert(stranger.ok === false && stranger.error === room.RELAY_ERRORS.SEAT_TAKEN,
    '1b: посторонний с чужим ключом сел на занятое место — знание имени комнаты снова даёт '
    + 'право выкинуть человека из его партии');
  assert(r.seats.blue === blue, '1c: после отказа за местом остался прежний игрок');
}

// === 2. Свой возвращается: вытеснение никуда не делось ===
//
// Ради него всё и устроено так: отказ вернувшемуся означал бы «подождите минуту, пока мы
// заметим, что вас нет».
{
  const r = room.createRoom();
  const first = { id: 'blue-1' };
  room.joinRoom(r, { seat: 'blue', version: room.RELAY_PROTOCOL_VERSION, connection: first, key: BLUE });

  const again = room.joinRoom(r, {
    seat: 'blue', version: room.RELAY_PROTOCOL_VERSION, connection: { id: 'blue-2' }, key: BLUE,
  });
  assert(again.ok, '2: со СВОИМ ключом вернуться нельзя — после обрыва игрок останется за дверью');
  assert(again.evicted === first,
    '2b: прежнее соединение не вытеснено — их станет два на одно место');
}

// === 3. Ключ обязан быть годным, а не любым ===
//
// Иначе проверку обходят пустой строкой: место «свободно», ключ null, первый же пришедший
// его и назовёт своим.
{
  const r = room.createRoom();
  for(const [key, why] of [['', 'пустой'], [null, 'отсутствующий'], ['korotkij', 'короткий'],
                           ['a'.repeat(200), 'непомерно длинный'], ['ключ с пробелом и кириллицей', 'с чужими буквами']]){
    const join = room.joinRoom(r, {
      seat: 'blue', version: room.RELAY_PROTOCOL_VERSION, connection: { id: 'x' }, key,
    });
    assert(join.ok === false && join.error === room.RELAY_ERRORS.BAD_KEY,
      `3: ${why} ключ принят — так проверку и обходят`);
  }
  assert(r.seatKeys.blue === null, '3b: отвергнутый ключ всё-таки записался за местом');

  assert(room.RELAY_SEAT_KEY_MIN_LENGTH >= 16,
    `3c: предел длины ключа ${room.RELAY_SEAT_KEY_MIN_LENGTH} — короткий ключ можно подобрать`);
}

// === 4. Ключи мест переживают сон комнаты ===
//
// Durable Object выгружается, когда в комнате тихо, и собирается заново с пустыми полями.
// Забыв ключи, проснувшаяся комната сочла бы места ничьими — и первый постучавший занял бы
// чужое, то есть ровно то, от чего ключ и заведён.
{
  assert(/storage\.put\(`key:\$\{seat\}`/.test(workerSource),
    '4: ключ места не сохраняется в хранилище — он не переживёт сон комнаты');
  assert(/storage\.get\(RELAY_SEATS\.map\(\(seat\) => `key:\$\{seat\}`\)\)/.test(workerSource),
    '4b: проснувшаяся комната не восстанавливает ключи мест');

  // Сохраняем ПОСЛЕ успешного входа: joinRoom мог ключ и отвергнуть.
  const put = workerSource.indexOf('storage.put(`key:${seat}`');
  const join = workerSource.indexOf('const joined = joinRoom(');
  const guard = workerSource.indexOf('if(!joined.ok)');
  assert(join < guard && guard < put,
    '4c: ключ записывается раньше проверки входа — тогда отвергнутый ключ займёт место');
}

// === 5. Оба сервера спрашивают ключ ===
{
  // Именно в вызове joinRoom, а не где угодно в файле: строка «key: seatKey» есть и в
  // разборе адреса, и проверка по ней прошла бы на обезвреженном вызове.
  assert(/joinRoom\(room, \{ seat, version, connection, key: seatKey[,}]/.test(localSource),
    '5: локальный сервер не передаёт ключ места в комнату — на своей машине защиты не будет');
  assert(/connection: server, key[,}]/.test(workerSource),
    '5b: облачный сервер не передаёт ключ места');
  assert(/key: \(parsed\.searchParams\.get\("key"\) \|\| ""\)/.test(fs.readFileSync('worker/room.js', 'utf8')),
    '5c: ключ больше не читается из адреса подключения');
}

// === 6. Имена комнат и ключи — не из Math.random() ===
{
  const gen = /function makeRandomString\(length, alphabet\)\{[\s\S]*?\n\}/.exec(code);
  assert(gen, '6: общий генератор случайных строк не найден');
  assert(/crypto\.getRandomValues/.test(gen[0]),
    '6b: генератор больше не берёт crypto.getRandomValues — имена комнат снова предсказуемы');

  // Остаток от деления даёт первым буквам алфавита лишние шансы, когда 256 не делится на
  // длину алфавита нацело. На 32 буквах разницы нет, но правило не должно ломаться от того,
  // что кто-то добавит в алфавит букву.
  assert(/const limit = Math\.floor\(256 \/ alphabet\.length\) \* alphabet\.length;/.test(gen[0])
    && /if\(byte >= limit\) continue;/.test(gen[0]),
    '6c: лишние байты не отбрасываются — распределение перекосится, стоит поменять алфавит');

  const roomId = /function makeOnlineRoomId\(\)\{[\s\S]*?\n\}/.exec(code);
  assert(roomId && /makeRandomString\(/.test(roomId[0]) && !/Math\.random/.test(roomId[0]),
    '6d: имя комнаты снова берётся мимо общего генератора');

  const seatKey = /function makeOnlineSeatKey\(\)\{[\s\S]*?\n\}/.exec(code);
  assert(seatKey && /makeRandomString\(/.test(seatKey[0]),
    '6e: ключ места берётся мимо общего генератора');

  const length = /const ONLINE_SEAT_KEY_LENGTH = (\d+);/.exec(code);
  assert(length && Number(length[1]) >= room.RELAY_SEAT_KEY_MIN_LENGTH,
    `6f: клиент делает ключ длиной ${length ? length[1] : '?'}, а комната требует не меньше `
    + `${room.RELAY_SEAT_KEY_MIN_LENGTH} — свои же ключи начнут отвергаться`);
}

// === 7. Ключ не уезжает в ссылку приглашения ===
//
// Ссылку пересылают в чатах; вложенный в неё ключ достался бы всякому, кто её видел, и вся
// защита свелась бы обратно к «знаешь строку — заходи».
{
  const invite = /function buildOnlineInviteLink\(\)\{[\s\S]*?\n\}/.exec(code);
  assert(invite, '7: сборка ссылки другу не найдена');
  assert(!/key/.test(invite[0]),
    '7b: ключ места кладут в ссылку приглашения — тогда он есть у всех, кто её видел');

  // Зато ключ обязан переживать перезагрузку: иначе вернувшийся сам себе посторонний.
  assert(/function recallSeatKey\(room, seat\)\{[\s\S]{0,300}localStorage/.test(code),
    '7c: ключ не переживает перезагрузку страницы — вернувшийся не сядет на своё же место');
  assert(/catch\(_error\)\{/.test(/function rememberSeatKey\(room, seat, key\)\{[\s\S]*?\n\}/.exec(code)[0]),
    '7d: запись ключа не обёрнута в try/catch, а в приватном режиме хранилище бросает исключение');
}

// === 8. Отказ «место занято» объясняется по-человечески ===
//
// Совет «перезагрузите страницу» здесь вреден: за местом сидит другой человек, и
// перезагрузка гоняет пришедшего по кругу.
{
  const status = /function getOnlineTroubleText\(\)\{[\s\S]*?\n\}/.exec(code);
  assert(status, '8: текст поломок онлайна не найден');
  assert(/rejection\?\.\(\) === "seat_taken"/.test(status[0]),
    '8b: «место занято» не отличается от прочих отказов, а лечится оно иначе');
  assert(/seat is already taken/i.test(status[0]),
    '8c: про занятое место игроку ничего не говорят');
}

// === 9. Вторая вкладка того же браузера забирает место, и первой об этом говорят ===
//
// У двух вкладок одного браузера ключ места ОДИН: хранилище у них общее. Для комнаты обе
// — «вернувшийся», и она честно отдаёт место пришедшему последним, закрывая прежнее
// соединение кодом 4001.
//
// Клиент этот код не отличал от обрыва и переподключался — то есть отбирал место назад.
// Замерено на стенде: вкладки менялись местами по кругу, примерно раз в полминуты
// (online → reconnecting → online), и обе при этом молчали. Человек видел замершую доску
// без единого слова — ровно тот случай, который снаружи выглядит как «игра зависла».
//
// Сделано как делают все в таком случае: побеждает последняя вкладка, прежнюю отключают
// и говорят ей, что игра открыта в другом окне и как вернуть её сюда.
{
  // Код и причину придумывает не клиент: их шлёт комната, и они обязаны совпасть.
  const код = /const ONLINE_DISPLACED_CODE = (\d+);/.exec(code);
  const причина = /const ONLINE_DISPLACED_REASON = "([^"]+)";/.exec(code);
  assert(код && причина, '9: клиент не знает, каким кодом комната отбирает место');
  for(const [имя, текст] of [['worker/index.js', workerSource], ['worker/local-server.js', localSource]]){
    assert(stripComments(текст).includes(`${код[1]}, "${причина[1]}"`),
      `9b: ${имя} закрывает вытесненное соединение не так, как ждёт клиент `
      + `(клиент ждёт ${код[1]} «${причина[1]}»)`);
  }

  // Главное: по этому коду переподключаться нельзя.
  const провод = /function createWebSocketTransport\([\s\S]*?\n\}/.exec(code);
  assert(провод, '9c: провод не найден');
  const вЗакрытии = провод[0].slice(провод[0].indexOf('socket.onclose'));
  const гдеВытеснение = вЗакрытии.indexOf('ONLINE_DISPLACED_CODE');
  const гдеПереподключение = вЗакрытии.indexOf('scheduleReconnect');
  assert(гдеВытеснение !== -1,
    '9d: провод снова не отличает вытеснение от обрыва — вкладки начнут отбирать место '
    + 'друг у друга по кругу');
  assert(гдеВытеснение < гдеПереподключение,
    '9e: ветка вытеснения стоит ПОСЛЕ переподключения и ничего не меняет');

  // И поведение целиком: сессия кончается, адрес стола остаётся, человеку сказано — и
  // сказано ТАМ, ГДЕ ОН БЫЛ. Уводить в главное меню нельзя: по ссылке в него не
  // попадают вовсе, туда человека отправил бы только этот самый код.
  const vm = require('vm');
  function стенд({ вПартии }){
    const метки = new Set();
    const узлы = {
      gameNotice: { hidden: true },
      gameNoticeText: { textContent: '' },
    };
    const песочница = {
      onlinePresence: {}, gameMode: вПартии ? 'online' : null,
      selectedMode: 'online', lastModeSelectionButton: null, hotSeatBtn: { id: 'hotSeat' },
      сделано: [], адрес: null, метки,
      HTMLElement: function HTMLElement(){},
      onlineSession: { room: 'стол', seat: 'blue',
        transport: { status: () => 'rejected', rejection: () => причина[1] } },
      stopOnlineSession(){ песочница.сделано.push('связь закрыта'); песочница.onlineSession = null; },
      writeOnlineRoomIntoAddress(стол){ песочница.адрес = стол; },
      resetGame(о){ песочница.сделано.push(`меню:${JSON.stringify(о)}`); песочница.gameMode = null; },
      hideOnlineLobby(){ песочница.сделано.push('лобби убрано'); },
      setStoredGameMode(м){ песочница.selectedMode = м; },
      updateModeSelection(){ песочница.сделано.push('выбран режим'); },
      showOnlineTrouble(){ песочница.сделано.push('надпись в меню'); },
      refreshOnlineLobbyUi(){ песочница.сделано.push('лобби перерисовано'); },
    };
    for(const узел of Object.values(узлы)) Object.setPrototypeOf(узел, песочница.HTMLElement.prototype);
    песочница.document = {
      getElementById: (id) => узлы[id] || null,
      documentElement: Object.setPrototypeOf({ classList: {
        toggle: (имя, вкл) => { if(вкл) метки.add(имя); else метки.delete(имя); },
        contains: (имя) => метки.has(имя),
      } }, песочница.HTMLElement.prototype),
    };
    vm.createContext(песочница);
    vm.runInContext([
      /const ONLINE_DISPLACED_REASON = "[^"]+";/.exec(code)[0],
      /const ONLINE_DISPLACED_TEXT = "[^"]+";/.exec(code)[0],
      'let запискаОВытеснении = "";',
      /function показатьНадписьНаПоле\(текст\)\{[\s\S]*?\n\}/.exec(code)[0],
      /function заметитьВытеснение\(\)\{[\s\S]*?\n\}/.exec(code)[0],
      /function getOnlineTroubleText\(\)\{[\s\S]*?\n\}/.exec(code)[0],
      'this.api = { заметить: заметитьВытеснение, беда: getOnlineTroubleText,',
      '  текст: () => ONLINE_DISPLACED_TEXT };',
    ].join('\n'), песочница);
    return { api: песочница.api, с: песочница, узлы, метки };
  }

  // В партии: остаёмся на поле, надпись поверх доски.
  {
    const в = стенд({ вПартии: true });
    assert(в.api.заметить() === true, '9f: вытеснение не замечено');
    assert(в.с.onlineSession === null, '9g: связь осталась жить — вкладка отберёт место назад');
    assert(в.с.адрес && в.с.адрес.room === 'стол' && в.с.адрес.seat === 'blue',
      '9h: адрес стола стёрт — кнопка перезагрузки откроет голое меню, и обещание '
      + '«play here» окажется ложью');
    assert(!в.с.сделано.some((д) => д.startsWith('меню:')),
      '9i: человека увели в главное меню, хотя он пришёл по ссылке и в этом меню ни разу '
      + 'не был — туда его отправляет только этот код');
    assert(в.узлы.gameNotice.hidden === false && в.узлы.gameNoticeText.textContent === в.api.текст(),
      '9j: на поле ничего не написано — доска просто замрёт');
    assert(в.метки.has('is-game-notice'),
      '9k: доску не подняли над слоем плашек — плашка начала раунда накроет надпись целиком, '
      + 'как накрывала вопрос о выходе');
  }

  // Партии ещё не было: ждали в лобби, и ждать больше нечего.
  {
    const л = стенд({ вПартии: false });
    assert(л.api.заметить() === true, '9l: вытеснение в лобби не замечено');
    assert(л.с.сделано.some((д) => д.startsWith('меню:')),
      '9m: из мёртвого лобби никуда не увели — оно так и будет писать «WAITING…»');
    assert(л.с.selectedMode === 'hotSeat', '9n: в меню остался выбран онлайн');
    assert(л.api.беда() === л.api.текст(), '9o: человеку не сказали, почему ожидание кончилось');
    assert(л.узлы.gameNotice.hidden === true, '9p: надпись на поле показана там, где поля нет');
  }

  assert(/Reload/.test(/const ONLINE_DISPLACED_TEXT = "([^"]+)";/.exec(code)[1]),
    '9q: в надписи нет слова Reload — ни кнопки, ни способа вернуть игру');
}

// === 10. Надпись на поле стоит там же, где вопрос о выходе, и не отбирает нажатий ===
{
  const правило = /\.game-notice\s*\{([^}]*)\}/.exec(styles);
  assert(правило, '10: у надписи на поле нет оформления');
  const блок = правило[1];
  assert(/var\(--field-left/.test(блок) && /var\(--field-top/.test(блок),
    '10b: надпись прибита числами, а не к центру поля — поле двигается от экрана к экрану');
  assert(/transform:\s*translate\(-50%,\s*-50%\)/.test(блок),
    '10c: надпись повешена на центр поля углом');
  assert(/--inventory-tooltip-background/.test(блок),
    '10d: надпись оформлена сама по себе, а не как остальная речь игры');
  assert(/pointer-events:\s*none/.test(блок),
    '10e: надпись ловит нажатия, а под ней доска');
  const кнопкаПоля = /\.game-notice__btn\s*\{([^}]*)\}/.exec(styles);
  assert(кнопкаПоля && /pointer-events:\s*auto/.test(кнопкаПоля[1]),
    '10f: кнопка на поле не принимает нажатий — вернуть игру нечем');
  const гор = /html\.is-board-landscape \.game-notice\s*\{([^}]*)\}/.exec(styles);
  assert(гор && /translate\(-50%,\s*-50%\)\s*rotate\(-90deg\)/.test(гор[1]),
    '10g: в горизонтали надпись не развёрнута встречно или потеряла смещение за центр');
  const подъём = /html\.is-game-notice #gameStage\s*\{([^}]*)\}/.exec(styles);
  const высота = подъём && /z-index:\s*(\d+)/.exec(подъём[1]);
  const слойПлашек = Number(/TRANSFER_SYSTEM_HOST_Z_INDEX = (\d+)/.exec(script)[1]);
  assert(высота && Number(высота[1]) > слойПлашек,
    `10h: доску с надписью поднимают на ${высота ? высота[1] : 'ничто'}, а плашки лежат на `
    + `${слойПлашек} — надпись окажется под плашкой раунда`);
  assert(/id="gameNotice"/.test(html) && /id="gameNoticeReload"/.test(html),
    '10i: в разметке нет надписи на поле или её кнопки');
}

console.log('smoke-room-seat-keys: OK');
