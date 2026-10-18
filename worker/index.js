// Ретранслятор Paper Wings на Cloudflare Workers.
//
// Одна комната — один Durable Object. Он нужен не ради хранилища, а ради того, что оба
// игрока обязаны попасть В ОДИН И ТОТ ЖЕ экземпляр: обычный Worker поднимается где
// угодно и про соседа не знает. Имя комнаты превращается в адрес объекта, и дальше
// Cloudflare сам сводит обе стороны в одно место.
//
// Вся логика — в room.js, здесь только провода. Так она и проверяется: тем же кодом, но
// на локальном сервере (см. worker/README.md).

import {
  RELAY_PROTOCOL_VERSION,
  RELAY_KEPT_TYPES,
  RELAY_ERRORS,
  RELAY_SEATS,
  RELAY_PING_TEXT,
  RELAY_PONG_TEXT,
  isPingMessage,
  isMessageTooLarge,
  createRoom,
  joinRoom,
  routeEnvelope,
  leaveRoom,
  parseJoinRequest,
  buildPresenceEnvelope,
  getRoomConnections,
} from "./room.js";

export default {
  async fetch(request, env){
    const { room, version } = parseJoinRequest(request.url);
    if(!room){
      // Номер версии подставляется, а не пишется числом: это единственная страница, по
      // которой человек проверяет, жив ли ретранслятор, и соврать она не должна. Вписанная
      // «1» пережила переход на вторую версию и подсказывала адрес, по которому комната
      // отказывает.
      return new Response(
        `Paper Wings relay. Подключение: /room/<комната>?seat=blue&v=${RELAY_PROTOCOL_VERSION}\n`,
        {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      );
    }
    if(request.headers.get("Upgrade") !== "websocket"){
      return new Response("Ожидается websocket\n", { status: 426 });
    }
    if(version !== RELAY_PROTOCOL_VERSION){
      return new Response(`Другая версия протокола (нужна ${RELAY_PROTOCOL_VERSION})\n`, { status: 400 });
    }

    // Имя комнаты -> адрес объекта. Обе стороны с одинаковым именем попадают в один и
    // тот же экземпляр, где бы они физически ни находились.
    const id = env.ROOMS.idFromName(room);
    return env.ROOMS.get(id).fetch(request);
  },
};

export class Room {
  constructor(state){
    this.state = state;
    this.room = createRoom();

    // Отвечать на оклик клиента поручаем самому движку: он сделает это, НЕ будя комнату.
    //
    // Будить её каждые десять секунд нельзя — пошаговая игра молчит минутами, и спящий
    // режим здесь не оптимизация, а условие бесплатности (см. acceptWebSocket ниже).
    //
    // Ставится в конструкторе, потому что конструктор отрабатывает и после пробуждения:
    // поручение живёт в объекте, а объект сон не переживает.
    //
    // Движок старой версии этого не умеет — тогда оклик дойдёт до webSocketMessage и
    // будет отвечен там же, руками. Разбудит комнату, зато провод проверяется всегда.
    try {
      if(typeof WebSocketRequestResponsePair === "function"){
        state.setWebSocketAutoResponse?.(
          new WebSocketRequestResponsePair(RELAY_PING_TEXT, RELAY_PONG_TEXT));
      }
    } catch(error){
      console.warn("[room] автоответ на оклик не поставлен, отвечаем вручную", { error });
    }

    // Спящий режим сохраняет СОЕДИНЕНИЯ, но не память: объект выгружается, а когда
    // приходит следующий пакет — собирается заново, с пустыми полями. Поэтому обе вещи,
    // которые комната помнит, восстанавливаются здесь:
    //
    //   места — по живым сокетам, у каждого в метке записано его место;
    //   придержанные пакеты — из хранилища, потому что в памяти они бы не пережили сон.
    //
    // blockConcurrencyWhile не даёт ни одному событию прийти раньше, чем это доиграет:
    // пакет, обогнавший восстановление, увидел бы пустую комнату и уехал в никуда.
    state.blockConcurrencyWhile(async () => {
      for(const socket of state.getWebSockets()){
        const seat = state.getTags(socket)[0];
        if(seat) this.room.seats[seat] = socket;
      }
      const stored = await state.storage.get(RELAY_KEPT_TYPES);
      for(const [type, envelope] of stored){
        this.room.kept[type] = envelope;
      }

      // Ключи мест — тоже в хранилище. Без них проснувшаяся комната считала бы место
      // ничьим, и первый постучавший занял бы чужое: ровно то, от чего ключ и заведён.
      const keys = await state.storage.get(RELAY_SEATS.map((seat) => `key:${seat}`));
      for(const seat of RELAY_SEATS){
        const key = keys.get(`key:${seat}`);
        if(key) this.room.seatKeys[seat] = key;
      }

      // И время, когда место опустело: ключ держит его за собой не вечно, а полтора
      // десятка секунд сверх последней попытки переподключиться. Без хранилища эта
      // отметка не пережила бы сон, и место снова оказалось бы закреплено навсегда —
      // в точности та поломка, ради которой срок и заведён.
      const отпущены = await state.storage.get(RELAY_SEATS.map((seat) => `freed:${seat}`));
      for(const seat of RELAY_SEATS){
        const когда = отпущены.get(`freed:${seat}`);
        if(typeof когда === "number") this.room.seatFreedAt[seat] = когда;
      }

      // И чей это стол. Без хранилища проснувшаяся комната считала бы себя ничьей, и
      // хозяином стал бы тот, кто первым постучался после сна, — а сон у пошаговой игры
      // случается посреди партии.
      const хозяин = await state.storage.get("hostSeat");
      if(RELAY_SEATS.includes(хозяин)) this.room.hostSeat = хозяин;
    });
  }

  async fetch(request){
    const { seat, version, key, claimHost } = parseJoinRequest(request.url);
    const [client, server] = Object.values(new WebSocketPair());

    const joined = joinRoom(this.room, { seat, version, connection: server, key, claimHost });
    if(!joined.ok){
      server.accept();
      server.close(4000, joined.error);
      return new Response(null, { status: 101, webSocket: client });
    }

    // Метка — это то, по чему после пробуждения станет понятно, чьё это соединение:
    // getTags переживает сон, а любое поле объекта — нет.
    //
    // Сам спящий режим здесь не оптимизация, а условие бесплатности: пошаговая игра
    // молчит минутами, и без него платить пришлось бы за круглосуточно висящий сокет.
    this.state.acceptWebSocket(server, [seat]);

    // Ключ запоминаем ПОСЛЕ успешного входа: joinRoom мог его и отвергнуть. Вместе с ним
    // снимаем отметку «место опустело тогда-то»: оно занято снова, и срок не идёт.
    this.state.storage.put(`key:${seat}`, this.room.seatKeys[seat]).catch((error) => {
      console.warn("[room] не удалось запомнить ключ места", { seat, error });
    });
    this.state.storage.delete(`freed:${seat}`).catch((error) => {
      console.warn("[room] не удалось снять отметку об уходе", { seat, error });
    });

    // Хозяин стола записывается один раз — в тот единственный вход, который его назначил.
    if(joined.hostAssigned){
      this.state.storage.put("hostSeat", this.room.hostSeat).catch((error) => {
        console.warn("[room] не удалось запомнить хозяина стола", { seat, error });
      });
    }

    // Прежнее соединение на этом месте закрываем ПОСЛЕ того, как новое принято: иначе
    // закрытие успело бы сработать как «игрок ушёл» и освободить только что занятое место.
    if(joined.evicted){
      try { joined.evicted.close(4001, "seat_taken_over"); } catch(_error){ /* уже закрыт */ }
    }

    // Придержанное: настройки создателя и последний снимок партии. Ради этих двух
    // строчек комната вообще что-то помнит.
    for(const envelope of joined.replay){
      try { server.send(JSON.stringify(envelope)); } catch(_error){ /* закрылся на полуслове */ }
    }

    // Кто за столом — знает только комната, поэтому она и рассказывает об этом обоим.
    // Без этого гость не узнает, что хозяин уже здесь, а хозяин — что гость пришёл.
    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastPresence(){
    const envelope = JSON.stringify(buildPresenceEnvelope(this.room));
    for(const connection of getRoomConnections(this.room)){
      try { connection.send(envelope); } catch(_error){ /* уже отвалился */ }
    }
  }

  async webSocketMessage(socket, message){
    if(typeof message !== "string") return;

    // Оклик, дошедший сюда, — это движок без автоответа (см. конструктор). Отвечаем сами:
    // разбуженная комната дешевле разошедшейся партии.
    if(isPingMessage(message)){
      try { socket.send(RELAY_PONG_TEXT); } catch(_error){ /* уже отвалился */ }
      return;
    }

    // Слишком большой пакет закрывает соединение, а не отбрасывается молча.
    //
    // Молча — хуже всего, что здесь можно сделать: снимок партии не доехал бы, доска у
    // соперника осталась бы прежней, и оба продолжали бы играть в разные партии, ничего
    // не заметив. Обрыв соперник видит, и клиент на него умеет переподключаться.
    if(isMessageTooLarge(message)){
      try { socket.close(4009, RELAY_ERRORS.TOO_LARGE); } catch(_error){ /* уже закрыт */ }
      return;
    }

    let envelope = null;
    try { envelope = JSON.parse(message); } catch(_error){ return; }

    const seat = this.state.getTags(socket)[0];
    const routed = routeEnvelope(this.room, seat, envelope);
    if(routed.kept){
      // В хранилище, а не в поле объекта: пережить сон должно и это.
      //
      // Отказ хранилища не должен уносить с собой пересылку: соперник ждёт этот пакет
      // сейчас, а придержанная копия нужна только тому, кто вернётся после обрыва.
      try {
        await this.state.storage.put(envelope.t, envelope);
      } catch(error){
        console.warn("[room] не удалось придержать пакет", { type: envelope?.t, error });
      }
    }
    // Новая партия — старому снимку в хранилище делать нечего.
    if(routed.droppedState){
      try {
        await this.state.storage.delete("state");
      } catch(error){
        console.warn("[room] не удалось выбросить старый снимок", { error });
      }
    }
    if(!routed.connection) return;
    try { routed.connection.send(message); } catch(_error){ /* соперник отвалился */ }
  }

  webSocketClose(socket){
    // Оставшемуся надо сказать, что он остался один: молчание соперника иначе
    // неотличимо от долгого раздумья.
    this.уход(socket);
  }

  webSocketError(socket){
    this.уход(socket);
  }

  уход(socket){
    const seat = this.state.getTags(socket)[0];
    if(!leaveRoom(this.room, seat, socket)) return;
    // Сначала сказать оставшемуся, потом записывать: ждёт человек, а не хранилище.
    this.broadcastPresence();
    // Отметку об уходе кладём в хранилище: по ней проснувшаяся комната поймёт, что ключ
    // этого места уже отпустил его, и не станет держать место за ушедшим вечно.
    this.state.storage.put(`freed:${seat}`, this.room.seatFreedAt[seat]).catch((error) => {
      console.warn("[room] не удалось запомнить время ухода", { seat, error });
    });
  }
}
