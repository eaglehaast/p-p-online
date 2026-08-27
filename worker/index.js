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
  createRoom,
  joinRoom,
  routeEnvelope,
  leaveRoom,
  parseJoinRequest,
} from "./room.js";

export default {
  async fetch(request, env){
    const { room, version } = parseJoinRequest(request.url);
    if(!room){
      return new Response("Paper Wings relay. Подключение: /room/<комната>?seat=blue&v=1\n", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
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
    });
  }

  async fetch(request){
    const { seat, version } = parseJoinRequest(request.url);
    const [client, server] = Object.values(new WebSocketPair());

    const joined = joinRoom(this.room, { seat, version, connection: server });
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

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket, message){
    if(typeof message !== "string") return;
    let envelope = null;
    try { envelope = JSON.parse(message); } catch(_error){ return; }

    const seat = this.state.getTags(socket)[0];
    const routed = routeEnvelope(this.room, seat, envelope);
    if(routed.kept){
      // В хранилище, а не в поле объекта: пережить сон должно и это.
      await this.state.storage.put(envelope.t, envelope);
    }
    if(!routed.connection) return;
    try { routed.connection.send(message); } catch(_error){ /* соперник отвалился */ }
  }

  webSocketClose(socket){
    leaveRoom(this.room, this.state.getTags(socket)[0], socket);
  }

  webSocketError(socket){
    leaveRoom(this.room, this.state.getTags(socket)[0], socket);
  }
}
