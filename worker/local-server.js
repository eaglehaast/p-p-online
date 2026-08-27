// Игра и ретранслятор на одном компьютере. Одна команда, ничего ставить не надо:
//
//     node worker/local-server.js
//
// Дальше он сам напечатает две ссылки — себе и другу.
//
// Комнату крутит та же worker/room.js, что уедет в Cloudflare: здесь другие только
// провода. Поэтому «поиграть на своём компе» и «поиграть через облако» — не два разных
// онлайна, а один и тот же, и починенное в одном месте чинится в обоих.
//
// WebSocket написан руками (worker/ws-frames.js), хотя готовых библиотек полно: иначе
// «поиграть на своём компе» начиналось бы с npm install, а должно — с одной команды.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  RELAY_PROTOCOL_VERSION,
  createRoom,
  joinRoom,
  routeEnvelope,
  leaveRoom,
  parseJoinRequest,
} from "./room.js";
import { OPCODE, WS_GUID, buildFrame, readFrames } from "./ws-frames.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(HERE, "..");
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

// Одно соединение. Наружу выглядит как сокет из worker/index.js: send и close — всё, что
// комнате от него нужно.
function createConnection(socket){
  const listeners = { message: [], close: [] };
  let buffer = Buffer.alloc(0);
  // Части разрезанного сообщения: браузер имеет право прислать длинный снимок партии
  // несколькими кадрами.
  let assembling = null;
  let closed = false;

  const finish = () => {
    if(closed) return;
    closed = true;
    for(const listener of listeners.close) listener();
  };

  socket.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { frames, rest, tooBig } = readFrames(buffer);
    buffer = rest;
    if(tooBig){ connection.close(1009, "too_big"); return; }

    for(const frame of frames){
      if(frame.opcode === OPCODE.CLOSE){ finish(); socket.end(); return; }
      if(frame.opcode === OPCODE.PING){ socket.write(buildFrame(OPCODE.PONG, frame.payload)); continue; }
      if(frame.opcode === OPCODE.PONG) continue;

      if(frame.opcode === OPCODE.CONTINUATION){
        if(assembling) assembling = Buffer.concat([assembling, frame.payload]);
      } else if(frame.opcode === OPCODE.TEXT){
        assembling = frame.payload;
      } else {
        continue; // двоичное игре не нужно
      }

      if(frame.fin && assembling){
        const text = assembling.toString("utf8");
        assembling = null;
        for(const listener of listeners.message) listener(text);
      }
    }
  });

  socket.on("close", finish);
  socket.on("error", finish);

  const connection = {
    send(text){
      if(closed) return;
      try { socket.write(buildFrame(OPCODE.TEXT, Buffer.from(text, "utf8"))); }
      catch(_error){ finish(); }
    },
    close(code = 1000, reason = ""){
      if(closed) return;
      const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
      payload.writeUInt16BE(code, 0);
      payload.write(reason, 2);
      try { socket.write(buildFrame(OPCODE.CLOSE, payload)); } catch(_error){ /* уже нет */ }
      finish();
      socket.end();
    },
    on(event, listener){ listeners[event]?.push(listener); },
  };
  return connection;
}

/* ======= СТАТИКА ======= */

function serveFile(request, response){
  const requested = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const relative = requested.replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(SITE_ROOT, relative);

  // Наружу из папки игры не выпускаем: сервер смотрит в интернет.
  if(!filePath.startsWith(SITE_ROOT)){
    response.writeHead(403).end("нельзя");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if(error){
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("нет такого файла\n");
      return;
    }
    response.writeHead(200, {
      "content-type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(data);
  });
}

/* ======= СБОРКА ======= */

const rooms = new Map();
function getRoom(name){
  if(!rooms.has(name)) rooms.set(name, createRoom());
  return rooms.get(name);
}

const server = http.createServer(serveFile);

server.on("upgrade", (request, socket) => {
  const key = request.headers["sec-websocket-key"];
  const { room: roomName, seat, version } = parseJoinRequest(`ws://local${request.url}`);

  if(!key || !roomName){
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return;
  }

  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  socket.setNoDelay(true);

  const connection = createConnection(socket);
  const room = getRoom(roomName);
  const joined = joinRoom(room, { seat, version, connection });
  if(!joined.ok){
    console.log(`  отказ: комната ${roomName}, место ${seat} — ${joined.error}`);
    connection.close(4000, joined.error);
    return;
  }

  console.log(`  вошёл: комната ${roomName}, место ${seat}` +
    (joined.replay.length ? `, досылаем ${joined.replay.length} (догоняет партию)` : ""));

  if(joined.evicted) joined.evicted.close(4001, "seat_taken_over");
  for(const envelope of joined.replay) connection.send(JSON.stringify(envelope));

  connection.on("message", (text) => {
    let envelope = null;
    try { envelope = JSON.parse(text); } catch(_error){ return; }
    const routed = routeEnvelope(room, seat, envelope);
    if(routed.connection) routed.connection.send(text);
  });

  connection.on("close", () => {
    if(leaveRoom(room, seat, connection)){
      console.log(`  вышел: комната ${roomName}, место ${seat}`);
    }
  });
});

function getLanAddress(){
  for(const entries of Object.values(os.networkInterfaces())){
    for(const entry of entries ?? []){
      if(entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

server.listen(PORT, () => {
  const room = process.env.ROOM || Math.random().toString(36).slice(2, 8);
  const lan = getLanAddress();
  // relay=auto означает «ретранслятор там же, откуда открыта страница». Благодаря этому
  // ссылку можно давать любую — по локальной сети, через туннель, — и адрес сокета
  // окажется правильным сам собой, без правки руками.
  const link = (host, seat) => `http://${host}:${PORT}/?room=${room}&seat=${seat}&relay=auto`;

  console.log("\nPaper Wings: игра и ретранслятор на этом компьютере.");
  console.log(`Комната: ${room}   (своё имя: ROOM=... node worker/local-server.js)\n`);
  console.log("  себе:  " + link("localhost", "blue"));
  if(lan){
    console.log("  другу: " + link(lan, "green") + "   (если он в той же сети)");
    console.log("\nЧерез интернет друг сюда не попадёт: нужен туннель или проброс порта.");
    console.log("Проще всего — cloudflared:");
    console.log(`  cloudflared tunnel --url http://localhost:${PORT}`);
    console.log("  он выдаст адрес вида https://что-то.trycloudflare.com —");
    console.log(`  ссылка другу: https://что-то.trycloudflare.com/?room=${room}&seat=green&relay=auto`);
  } else {
    console.log("  другу: сети не видно — только с этого же компьютера");
  }
  console.log("\nОстановить: Ctrl+C\n");
});
