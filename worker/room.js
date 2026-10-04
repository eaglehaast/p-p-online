// Комната ретранслятора: кто за каким местом сидит, кому переслать пакет и что показать
// тому, кто подключился заново.
//
// Здесь нет ни одной строчки про WebSocket и Durable Object. Это сделано нарочно: ровно
// этот же код крутится и в облаке, и в локальном сервере, на котором он проверяется. Без
// такого разделения проверить ретранслятор было бы нечем — облако из тестов не поднять.
//
// Комната НЕ ЗНАЕТ игру. Для неё пакет — непрозрачный конверт: она смотрит только на
// место отправителя и на тип, чтобы понять, надо ли этот конверт придержать. Что внутри —
// её не касается, и это не лень, а условие: иначе правила игры пришлось бы держать в двух
// местах и обновлять их синхронно.

// Версия 2: у игры сменилось рукопожатие — вместо пары «оба нажали готов» одно «поехали»
// от хозяина комнаты. Самой комнате до этого дела нет, конверт для неё непрозрачен, но
// номер она проверяет при входе, и в этом весь смысл: два клиента разных версий за один
// стол не сядут. Иначе старый принял бы «start» за неизвестный тип, промолчал и остался бы
// в меню, пока второй играет.
//
// Число обязано совпадать с ONLINE_PROTOCOL_VERSION в script.js — за этим следит
// smoke-online-protocol-version.
export const RELAY_PROTOCOL_VERSION = 2;
export const RELAY_SEATS = Object.freeze(["blue", "green"]);

// Типы пакетов, последний экземпляр которых комната придерживает и отдаёт тому, кто
// подключился позже или заново. На этом держатся обе главные вещи шага:
//
//   settings — настройки создателя комнаты: гость должен играть по ним, а не по своим;
//   state    — снимок партии: по нему вернувшийся после обрыва догоняет пропущенное.
//
// Придерживается именно ПОСЛЕДНИЙ снимок комнаты, чей бы он ни был: снимок шлёт тот, кто
// ходил, значит самый свежий и есть самый верный.
export const RELAY_KEPT_TYPES = Object.freeze(["settings", "state"]);

export const RELAY_ERRORS = Object.freeze({
  BAD_SEAT: "bad_seat",
  BAD_VERSION: "bad_version",
  TOO_LARGE: "message_too_large",
  BAD_KEY: "bad_key",
  SEAT_TAKEN: "seat_taken",
});

// Ключ места.
//
// Раньше место защищало только имя комнаты, а имя комнаты диктуют вслух и пересылают в
// чатах. Кто его знал, тот мог сесть за ЛЮБОЕ из двух мест — и не просто сесть, а
// ВЫТЕСНИТЬ того, кто там сидит: вытеснение сделано нарочно, ради возвращения после
// обрыва, и отличить вернувшегося от постороннего комната не могла.
//
// Теперь может: у места есть ключ, и вытеснить сидящего вправе только тот, кто предъявит
// тот же самый. Ключ придумывает тот, кто занял место первым, — комната его просто
// запоминает и дальше сверяет.
export const RELAY_SEAT_KEY_MIN_LENGTH = 16;
export const RELAY_SEAT_KEY_MAX_LENGTH = 128;

export function isValidSeatKey(key){
  return typeof key === "string"
    && key.length >= RELAY_SEAT_KEY_MIN_LENGTH
    && key.length <= RELAY_SEAT_KEY_MAX_LENGTH
    && /^[A-Za-z0-9_-]+$/.test(key);
}

// Предел на размер пакета.
//
// Придержанные типы (settings и state) уходят в хранилище Durable Object, а там предел
// 128 КиБ на значение. Без проверки слишком большой снимок ронял бы put ВНУТРИ await, и
// ловить его было некому: пакет не уехал бы сопернику, а комната молча осталась бы с
// прежним снимком.
//
// Число взято от настоящего снимка, а не на глаз. Замер в живой партии:
//
//   в начале партии          3434 байта
//   после десяти ходов       3447 байт
//   нарочно раздутый до
//   пределов правил          7997 байт
//
// 64 КиБ — это восьмикратный запас к худшему разумному случаю и вдвое меньше предела
// хранилища. Расти снимку есть куда, а мусору — уже нет.
export const RELAY_MAX_MESSAGE_BYTES = 64 * 1024;

// Длина в БАЙТАХ, а не в символах: кириллица в названии карты занимает по два байта,
// эмодзи по четыре, и предел, посчитанный по символам, врал бы в большую сторону.
export function measureMessageBytes(message){
  if(typeof message !== "string") return 0;
  if(typeof TextEncoder === "function") return new TextEncoder().encode(message).length;
  return Buffer.byteLength(message, "utf8");
}

export function isMessageTooLarge(message){
  return measureMessageBytes(message) > RELAY_MAX_MESSAGE_BYTES;
}

// Сколько ключ держит ОПУСТЕВШЕЕ место за собой.
//
// Ключ заведён ради одного: вернуть место тому, у кого оборвалась связь или кто
// перезагрузил страницу. Это занимает секунды: лестница повторных попыток у клиента —
// 0.5, 1, 2, 4, 8, 15 секунд, то есть шесть попыток укладываются в полминуты. Минута —
// вдвое больше, с запасом.
//
// Держать дольше нельзя, и это выяснилось на живой игре. Хозяин теперь возвращается в ТУ
// ЖЕ комнату, а не заводит новую (ссылка не должна умирать от перезагрузки). Место же
// закреплялось за ключом навсегда — и зелёное место оставалось записано на ключ вчерашнего
// гостя. Новый друг по той же ссылке получал seat_taken, у хозяина «Play» не загорался
// никогда. Выглядело как «онлайн сломался».
//
// Длиннее делать нечего: за этот срок ключ защищает ровно от одного — что посторонний с
// подсмотренной ссылкой займёт место, пока хозяин места переподключается. Вернувшийся
// позже сядет и так: место к тому времени просто ничьё, и выгонять его некому.
//
// Пока место ЗАНЯТО живым соединением, срок не идёт вовсе: посторонний с подсмотренной
// ссылкой не вытеснит того, кто сидит.
export const RELAY_SEAT_HOLD_MS = 60_000;

export function createRoom(){
  return {
    seats: { blue: null, green: null },
    // Ключ места: кто занял первым, тот его и назначил.
    seatKeys: { blue: null, green: null },
    // Когда место опустело. null — оно занято или ещё ни разу не занималось.
    seatFreedAt: { blue: null, green: null },
    kept: Object.create(null),
    joinCount: 0,
  };
}

// Держит ли ключ это место прямо сейчас.
//
// Держит, пока место занято живым соединением, и ещё RELAY_SEAT_HOLD_MS после того, как
// оно опустело. Дальше место ничьё: первый пришедший называет его своим.
export function isSeatClaimHeld(room, seat, now = Date.now()){
  if(room.seatKeys[seat] === null || room.seatKeys[seat] === undefined) return false;
  if(room.seats[seat] !== null) return true;
  const опустело = room.seatFreedAt[seat];
  // Про опустевшее место неизвестно когда — считаем, что давно: иначе комната, пережившая
  // сон, снова держала бы место вечно.
  if(опустело === null || опустело === undefined) return false;
  return (now - опустело) <= RELAY_SEAT_HOLD_MS;
}

// Сесть за место.
//
// Со СВОИМ ключом занятое место не отказывает, а вытесняет прежнее соединение — и это
// главное решение здесь. Оборвавшийся сокет сервер замечает не сразу: игрок уже
// перезагрузил страницу, а его прошлое соединение всё ещё числится живым. Отказ означал бы
// «подождите минуту, пока мы заметим, что вас нет», то есть ровно тот случай, ради
// которого всё и делается.
//
// С ЧУЖИМ ключом — отказ. Раньше ключей не было вовсе, и вытеснение работало для любого,
// кто знал имя комнаты: то самое имя, которое диктуют вслух и пересылают в чатах.
//
// Вытесненное соединение возвращается наружу: закрыть его — дело вызывающего, комната
// сокетов не знает.
export function joinRoom(room, { seat, version, connection, key, now = Date.now() }){
  if(!RELAY_SEATS.includes(seat)){
    return { ok: false, error: RELAY_ERRORS.BAD_SEAT };
  }
  if(version !== RELAY_PROTOCOL_VERSION){
    return { ok: false, error: RELAY_ERRORS.BAD_VERSION };
  }
  if(!isValidSeatKey(key)){
    return { ok: false, error: RELAY_ERRORS.BAD_KEY };
  }

  const known = room.seatKeys[seat];
  if(!isSeatClaimHeld(room, seat, now)){
    // Место свободно: либо за ним никого не было, либо прежний хозяин ключа давно ушёл.
    // Первый пришедший называет его своим.
    room.seatKeys[seat] = key;
  } else if(known !== key){
    // Чужой с чужим ключом по горячим следам. Отказ, а не вытеснение: именно этим
    // посторонний и отличается от вернувшегося.
    return { ok: false, error: RELAY_ERRORS.SEAT_TAKEN };
  }

  const evicted = room.seats[seat];
  room.seats[seat] = connection;
  room.seatFreedAt[seat] = null;
  room.joinCount += 1;

  // Порядок важен: настройки должны примениться до снимка, иначе гость на мгновение
  // окажется со снимком чужой партии на своей карте.
  //
  // Пометка replay нужна вернувшемуся: придержанный снимок вполне может оказаться ЕГО
  // ЖЕ, отправленным до обрыва, — если последним ходил он. Без пометки клиент отвергает
  // такой пакет как «чужая вкладка на нашем месте» и остаётся при пустой доске.
  const replay = RELAY_KEPT_TYPES
    .map((type) => room.kept[type])
    .filter((envelope) => envelope !== undefined)
    .map((envelope) => ({ ...envelope, replay: true }));

  return { ok: true, evicted: evicted === connection ? null : evicted, replay, seatKeys: { ...room.seatKeys } };
}

// Куда переслать пакет и надо ли его придержать.
//
// Пересылается он ровно одному — второму месту. Рассылка «всем, кроме отправителя»
// выглядела бы так же при двух игроках, но молча начала бы работать иначе, если за
// столом когда-нибудь окажется третий.
export function routeEnvelope(room, seat, envelope){
  if(!RELAY_SEATS.includes(seat)) return { deliverTo: null, kept: false };

  const type = envelope?.t;
  const kept = typeof type === "string" && RELAY_KEPT_TYPES.includes(type);
  if(kept){
    room.kept[type] = envelope;
  }

  const otherSeat = seat === "blue" ? "green" : "blue";
  return {
    deliverTo: room.seats[otherSeat] ? otherSeat : null,
    connection: room.seats[otherSeat] ?? null,
    kept,
  };
}

// Уйти с места.
//
// Только если за ним всё ещё это же соединение: пока закрывался старый сокет, место мог
// занять он же, вернувшийся заново, — и очистка «по месту» вышвырнула бы живого игрока.
export function leaveRoom(room, seat, connection, now = Date.now()){
  if(!RELAY_SEATS.includes(seat)) return false;
  if(room.seats[seat] !== connection) return false;
  room.seats[seat] = null;
  // Отсюда и пойдёт срок, который ключ ещё держит это место за собой.
  room.seatFreedAt[seat] = now;
  return true;
}

// Комната пуста и её содержимое можно забыть.
export function isRoomEmpty(room){
  return RELAY_SEATS.every((seat) => room.seats[seat] === null);
}

// Кто сейчас за столом.
//
// Это единственное, что комната знает про игру, и знает по праву: занятость мест — её
// собственное состояние, а не игровое. Клиенту иначе неоткуда узнать, пришёл ли соперник:
// сам он может только слать «я здесь» в пустоту и не знать, услышал ли кто-нибудь. И уж
// точно он не узнает, что соперник ЗАКРЫЛ вкладку — молчание неотличимо от раздумья.
export function getRoomPresence(room){
  const seats = {};
  for(const seat of RELAY_SEATS) seats[seat] = room.seats[seat] !== null;
  return seats;
}

// Конверт о присутствии — от самой комнаты, а не от игрока. Отправитель "room" не
// совпадает ни с одним местом, поэтому клиентские проверки «своё эхо» и «пакет с нашего
// же места» его не отбрасывают.
export function buildPresenceEnvelope(room){
  room.presenceSeq = (room.presenceSeq ?? 0) + 1;
  return {
    p: RELAY_PROTOCOL_VERSION,
    t: "presence",
    from: "room",
    seat: "room",
    seq: room.presenceSeq,
    payload: { seats: getRoomPresence(room) },
  };
}

// Кому разослать: всем, кто сейчас в комнате.
export function getRoomConnections(room){
  return RELAY_SEATS.map((seat) => room.seats[seat]).filter((connection) => connection !== null);
}

// Разбор адреса подключения: /room/<имя>?seat=blue&v=<RELAY_PROTOCOL_VERSION>
export function parseJoinRequest(url){
  const parsed = new URL(url);
  const match = /^\/room\/([^/]{1,64})$/.exec(parsed.pathname);
  return {
    room: match ? decodeURIComponent(match[1]) : null,
    seat: (parsed.searchParams.get("seat") || "").trim().toLowerCase(),
    version: Number(parsed.searchParams.get("v")),
    key: (parsed.searchParams.get("key") || "").trim(),
  };
}
