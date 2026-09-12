#!/usr/bin/env node
'use strict';

// Smoke test: номер протокола у игры и у комнаты — один и тот же.
//
// Число живёт в двух файлах: ONLINE_PROTOCOL_VERSION в script.js и RELAY_PROTOCOL_VERSION
// в worker/room.js. Комната сверяет его при входе и с другим номером не пускает вовсе.
//
// Ломается это ровно один раз и очень наглядно: правишь рукопожатие, поднимаешь номер в
// игре — и онлайн перестаёт работать целиком, с отказом bad_version. На это уже наступали:
// хозяин создавал комнату, соединение вставало, «Play» не загоралась никогда, и по экрану
// было не понять ничего — версия проверяется до того, как хоть что-то покажут.
//
// Обратная сторона тоже опасна и тише: поднять номер только у комнаты. Тогда игра, уже
// открытая у игрока, перестанет подключаться, а свежая — заработает; выглядит как «у меня
// не работает, а у него работает».

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');
const room = fs.readFileSync('worker/room.js', 'utf8');

// === 1. Оба числа на месте ===
const уИгры = /const ONLINE_PROTOCOL_VERSION = (\d+);/.exec(script);
assert(уИгры, '1: в script.js нет ONLINE_PROTOCOL_VERSION');
const уКомнаты = /export const RELAY_PROTOCOL_VERSION = (\d+);/.exec(room);
assert(уКомнаты, '1b: в worker/room.js нет RELAY_PROTOCOL_VERSION');

// === 2. И они совпадают ===
assert(уИгры[1] === уКомнаты[1],
  `2: игра говорит на версии ${уИгры[1]}, комната ждёт ${уКомнаты[1]} — онлайн не работает `
  + 'вовсе: комната отвечает bad_version ещё до того, как игрок хоть что-то увидит');

// === 3. Версия уезжает в комнату при входе ===
//
// Само по себе совпадение чисел ничего не даёт, если номер не доедет: комната прочитает
// пустоту, сравнит с ожидаемым и откажет.
{
  const адрес = /function buildRelayJoinUrl|[?&]v=\$\{|v=" \+|"v", String\(/.test(script)
    || /v=\$\{[^}]*VERSION/.test(script);
  assert(адрес || /ONLINE_PROTOCOL_VERSION/.test(script),
    '3: номер версии никуда не отправляется — комната не узнает, с кем говорит');

  assert(/version: Number\(parsed\.searchParams\.get\("v"\)\)/.test(room),
    '3b: комната перестала читать версию из адреса — сверять станет нечего');
}

console.log('smoke-online-protocol-version: OK');
