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

export const RELAY_PROTOCOL_VERSION = 1;
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
});

export function createRoom(){
  return {
    seats: { blue: null, green: null },
    kept: Object.create(null),
    joinCount: 0,
  };
}

// Сесть за место.
//
// Занятое место НЕ отказывает, а вытесняет прежнее соединение — и это главное решение
// здесь. Оборвавшийся сокет сервер замечает не сразу: игрок уже перезагрузил страницу, а
// его прошлое соединение всё ещё числится живым. Отказ означал бы «подождите минуту,
// пока мы заметим, что вас нет», то есть ровно тот случай, ради которого всё и делается.
//
// Вытесненное соединение возвращается наружу: закрыть его — дело вызывающего, комната
// сокетов не знает.
export function joinRoom(room, { seat, version, connection }){
  if(!RELAY_SEATS.includes(seat)){
    return { ok: false, error: RELAY_ERRORS.BAD_SEAT };
  }
  if(version !== RELAY_PROTOCOL_VERSION){
    return { ok: false, error: RELAY_ERRORS.BAD_VERSION };
  }

  const evicted = room.seats[seat];
  room.seats[seat] = connection;
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

  return { ok: true, evicted: evicted === connection ? null : evicted, replay };
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
export function leaveRoom(room, seat, connection){
  if(!RELAY_SEATS.includes(seat)) return false;
  if(room.seats[seat] !== connection) return false;
  room.seats[seat] = null;
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

// Разбор адреса подключения: /room/<имя>?seat=blue&v=1
export function parseJoinRequest(url){
  const parsed = new URL(url);
  const match = /^\/room\/([^/]{1,64})$/.exec(parsed.pathname);
  return {
    room: match ? decodeURIComponent(match[1]) : null,
    seat: (parsed.searchParams.get("seat") || "").trim().toLowerCase(),
    version: Number(parsed.searchParams.get("v")),
  };
}
