// Кадры WebSocket, руками.
//
// Готовых библиотек полно, но тогда «поиграть на своём компе» начиналось бы с npm install,
// а должно — с одной команды на любой машине, где есть node. Игре нужны только текстовые
// сообщения, поэтому здесь ровно столько протокола, сколько для них надо.
//
// Отдельным файлом, потому что это единственное место локального сервера, где ошибиться
// можно МОЛЧА: неверно разобранный кадр не падает, а тихо превращается в мусор. Такое
// проверяется отдельно (scripts/smoke-local-server-frames.js), а для этого его надо уметь
// подключить, не поднимая сервер.

export const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const OPCODE = { CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

export function buildFrame(opcode, payload = Buffer.alloc(0)){
  const length = payload.length;
  // Кадры ОТ сервера не маскируются — этим они и отличаются от клиентских.
  let header;
  if(length < 126){
    header = Buffer.from([0x80 | opcode, length]);
  } else if(length < 65536){
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

// Разбирает столько целых кадров, сколько накопилось, и возвращает остаток: TCP отдаёт
// поток, а не сообщения, и кадр запросто приезжает двумя кусками.
export function readFrames(buffer){
  const frames = [];
  let offset = 0;

  while(offset + 2 <= buffer.length){
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;

    if(length === 126){
      if(cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if(length === 127){
      if(cursor + 8 > buffer.length) break;
      const big = buffer.readBigUInt64BE(cursor);
      if(big > 0x3ffffffn) return { frames, rest: buffer, tooBig: true };
      length = Number(big);
      cursor += 8;
    }

    let mask = null;
    if(masked){
      if(cursor + 4 > buffer.length) break;
      mask = buffer.subarray(cursor, cursor + 4);
      cursor += 4;
    }
    if(cursor + length > buffer.length) break;

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if(mask){
      for(let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    frames.push({ fin, opcode, payload });
    offset = cursor + length;
  }

  return { frames, rest: buffer.subarray(offset) };
}
