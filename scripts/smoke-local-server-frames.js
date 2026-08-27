#!/usr/bin/env node
'use strict';

// Smoke test: кадры WebSocket, разобранные руками.
//
// Локальный сервер (worker/local-server.js) написан без единой зависимости, чтобы
// запускаться одной командой на любой машине с node. Цена этому — свой разбор кадров
// WebSocket, и это единственное его место, где ошибиться можно МОЛЧА: неверно разобранный
// кадр не падает, а тихо превращается в мусор. Ход соперника при этом просто не приходит.
//
// Проверяется поэтому не «работает», а четыре случая, в которых оно ломается незаметно:
//
//   1. TCP отдаёт поток, а не сообщения. Кадр приезжает двумя кусками, два кадра — одним,
//      и разбор обязан переживать любую нарезку.
//   2. Клиентские кадры ЗАМАСКИРОВАНЫ, серверные — нет. Забыть снять маску значит
//      получать абракадабру вместо JSON.
//   3. Длина пишется тремя разными способами, по размеру. Снимок партии — около трёх с
//      половиной килобайт, то есть ровно во второй способ, а короткие ходы — в первый.
//   4. Длинное сообщение браузер имеет право разрезать на части, и собрать их обратно
//      должен получатель.

const assert = require('node:assert');

function ok(condition, message){
  if(!condition) throw new Error(message);
}

// Клиентский кадр: замаскированный, как их шлёт браузер.
function maskedClientFrame(opcode, payload, { fin = true, mask = [0x12, 0x34, 0x56, 0x78] } = {}){
  const body = Buffer.from(payload);
  const masked = Buffer.from(body);
  for(let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];

  let header;
  if(body.length < 126){
    header = Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | body.length]);
  } else if(body.length < 65536){
    header = Buffer.alloc(4);
    header[0] = (fin ? 0x80 : 0) | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = (fin ? 0x80 : 0) | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, Buffer.from(mask), masked]);
}

(async () => {
const { buildFrame, readFrames, OPCODE, WS_GUID } = await import('../worker/ws-frames.js');

// === 1. Круг: что собрали, то и разобрали ===
{
  for(const text of ['{}', 'ход', 'x'.repeat(125), 'y'.repeat(126), 'z'.repeat(70000)]){
    const built = buildFrame(OPCODE.TEXT, Buffer.from(text, 'utf8'));
    const { frames, rest } = readFrames(built);
    ok(frames.length === 1, `1: кадр длиной ${text.length} разобран`);
    ok(frames[0].payload.toString('utf8') === text, `1b: содержимое кадра длиной ${text.length} не пострадало`);
    ok(rest.length === 0, `1c: после разбора ничего не осталось (${text.length})`);
  }

  // Три способа записать длину — три разных заголовка. Снимок партии (~3.5 КБ) попадает
  // во второй, и именно он был бы не проверен, ограничься тест короткими сообщениями.
  ok(buildFrame(OPCODE.TEXT, Buffer.alloc(10)).length === 12, '1d: короткое — заголовок 2 байта');
  ok(buildFrame(OPCODE.TEXT, Buffer.alloc(3500)).length === 3504, '1e: снимок партии — заголовок 4 байта');
  ok(buildFrame(OPCODE.TEXT, Buffer.alloc(70000)).length === 70010, '1f: очень длинное — заголовок 10 байт');

  // Кадры ОТ сервера не маскируются.
  ok((buildFrame(OPCODE.TEXT, Buffer.from('a'))[1] & 0x80) === 0,
    '1g: серверный кадр без маски — с маской браузер разорвёт соединение');
}

// === 2. Маска клиентских кадров снимается ===
{
  const text = '{"t":"move","payload":{"vx":3.5}}';
  const { frames } = readFrames(maskedClientFrame(OPCODE.TEXT, Buffer.from(text, 'utf8')));
  ok(frames.length === 1 && frames[0].payload.toString('utf8') === text,
    '2: маска снята — иначе вместо JSON приезжала бы абракадабра');

  // И для длинного тоже: маска и длина считаются независимо, ошибиться можно в каждой.
  const long = JSON.stringify({ v: 1, planes: Array.from({ length: 200 }, (_, i) => ({ i, x: i * 1.5 })) });
  ok(long.length > 3000, '2b: стенд достаточно длинный, чтобы задеть второй способ записи длины');
  const decoded = readFrames(maskedClientFrame(OPCODE.TEXT, Buffer.from(long, 'utf8')));
  ok(decoded.frames[0].payload.toString('utf8') === long,
    '2c: длинный замаскированный кадр разобран целиком');
}

// === 3. Нарезка потока ===
//
// Главное здесь. TCP не обещает, что сообщение приедет одним куском, и разбор обязан
// переживать ЛЮБУЮ нарезку: по байту, посреди заголовка, посреди маски, посреди длины.
{
  const first = maskedClientFrame(OPCODE.TEXT, Buffer.from('первый', 'utf8'));
  const second = maskedClientFrame(OPCODE.TEXT, Buffer.from('второй', 'utf8'));
  const stream = Buffer.concat([first, second]);

  // Два кадра одним куском.
  ok(readFrames(stream).frames.length === 2, '3: два кадра в одном куске разбираются оба');

  // Любой разрез: собираем по кусочку, как это делает сокет.
  for(let cut = 1; cut < stream.length; cut += 1){
    let buffer = Buffer.alloc(0);
    const got = [];
    for(const chunk of [stream.subarray(0, cut), stream.subarray(cut)]){
      buffer = Buffer.concat([buffer, chunk]);
      const { frames, rest } = readFrames(buffer);
      buffer = rest;
      for(const frame of frames) got.push(frame.payload.toString('utf8'));
    }
    ok(got.length === 2 && got[0] === 'первый' && got[1] === 'второй',
      `3b: разрез на ${cut}-м байте не теряет и не портит кадры (получено ${JSON.stringify(got)})`);
  }

  // По одному байту за раз — самый злой случай.
  let buffer = Buffer.alloc(0);
  const got = [];
  for(const byte of stream){
    buffer = Buffer.concat([buffer, Buffer.from([byte])]);
    const { frames, rest } = readFrames(buffer);
    buffer = rest;
    for(const frame of frames) got.push(frame.payload.toString('utf8'));
  }
  ok(got.join('|') === 'первый|второй', '3c: поток по одному байту собирается верно');

  // Незаконченный кадр ждёт продолжения, а не считается разобранным.
  const partial = readFrames(first.subarray(0, first.length - 1));
  ok(partial.frames.length === 0, '3d: недоехавший кадр не разбирается');
  ok(partial.rest.length === first.length - 1, '3e: и целиком остаётся ждать продолжения');
}

// === 4. Разрезанное сообщение собирается обратно ===
//
// Браузер имеет право разослать длинный снимок несколькими кадрами: первый TEXT без
// признака конца, дальше CONTINUATION.
{
  const head = maskedClientFrame(OPCODE.TEXT, Buffer.from('{"нача', 'utf8'), { fin: false });
  const tail = maskedClientFrame(OPCODE.CONTINUATION, Buffer.from('ло":1}', 'utf8'), { fin: true });
  const { frames } = readFrames(Buffer.concat([head, tail]));

  ok(frames.length === 2, '4: обе части разобраны');
  ok(frames[0].fin === false && frames[0].opcode === OPCODE.TEXT,
    '4b: у первой части нет признака конца — по нему получатель и понимает, что будет продолжение');
  ok(frames[1].fin === true && frames[1].opcode === OPCODE.CONTINUATION,
    '4c: вторая часть помечена продолжением');
  ok(Buffer.concat([frames[0].payload, frames[1].payload]).toString('utf8') === '{"начало":1}',
    '4d: склеенные части дают исходное сообщение');
}

// === 5. Служебные кадры отличимы от игровых ===
{
  const { frames } = readFrames(Buffer.concat([
    maskedClientFrame(OPCODE.PING, Buffer.from('пинг', 'utf8')),
    maskedClientFrame(OPCODE.CLOSE, Buffer.from([0x03, 0xe8])),
  ]));
  ok(frames[0].opcode === OPCODE.PING, '5: пинг узнаётся — на него надо ответить, иначе связь сочтут мёртвой');
  ok(frames[1].opcode === OPCODE.CLOSE, '5b: закрытие узнаётся');
}

// === 6. Заведомо неподъёмная длина не превращается в попытку выделить память ===
//
// Восьмибайтовая длина позволяет объявить кадр в гигабайты. Сервер смотрит в интернет,
// поэтому такое надо отвергать, а не пытаться собрать.
{
  const header = Buffer.alloc(10);
  header[0] = 0x80 | OPCODE.TEXT;
  header[1] = 127;
  header.writeBigUInt64BE(0xfffffffn, 2);
  const result = readFrames(header);
  ok(result.tooBig === true, '6: неподъёмный кадр помечен, а не собирается');
  ok(result.frames.length === 0, '6b: и ничего из него не разбирается');
}

// === 7. Рукопожатие считается по стандарту ===
{
  const crypto = require('node:crypto');
  ok(WS_GUID === '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
    '7: та самая строка из RFC 6455 — с любой другой браузер не примет ответ');
  // Пример из самого RFC: ключ dGhlIHNhbXBsZSBub25jZQ== даёт этот ответ.
  const accept = crypto.createHash('sha1')
    .update('dGhlIHNhbXBsZSBub25jZQ==' + WS_GUID).digest('base64');
  assert.strictEqual(accept, 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
    '7b: ответ на пример из RFC совпадает с тем, что в RFC и написан');
}

console.log('Smoke test passed: кадры собираются и разбираются, маска снимается, поток переживает любую нарезку, разрезанное сообщение склеивается, а неподъёмная длина отвергается.');
})().catch((error) => { console.error(error); process.exit(1); });
