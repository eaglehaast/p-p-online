#!/usr/bin/env node
'use strict';

// Smoke test: завтра по тем же ссылкам — тот же стол, новая партия.
//
// Было так: ссылка друга вела в ту же комнату (имя комнаты в ней и записано), а у хозяина
// ссылки не было вовсе — он входит кнопкой Online, и комнату его браузер помнил двенадцать
// часов. Назавтра кнопка заводила НОВУЮ комнату, и друг по старой ссылке оставался за
// пустым столом. Увидеть это нельзя: оба подключены, оба ждут, просто в разных комнатах.
//
// Чинится это тремя вещами, и каждая без остальных бесполезна:
//
//   1. Адрес страницы у хозяина становится ссылкой на свой стол — тем же способом
//      вернуться, что и у гостя.
//   2. Хозяина стола называет КОМНАТА. Иначе завтра оба придут по ссылкам, своего нажатия
//      Online не вспомнит никто, и начать партию будет некому: двое гостей за полным
//      столом, и ничего не происходит.
//   3. Придержанный снимок вчерашней партии выбрасывается, когда начинается новая. Он
//      отдаётся каждому входящему — ради возвращения после обрыва, — и, доживи он до
//      завтра, уронил бы свежее начало во вчерашнюю позицию.
//
// Договорённость здесь именно «тот же стол, НОВАЯ партия»: доигрывать вчерашнее игра не
// умеет и не должна притворяться, что умеет.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const roomSource = fs.readFileSync('worker/room.js', 'utf8');
const workerSource = fs.readFileSync('worker/index.js', 'utf8');

function extractFunctionSource(text, name){
  const start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  let глубина = 0;
  let i = text.indexOf('(', start);
  for(; i < text.length; i += 1){
    if(text[i] === '(') глубина += 1;
    if(text[i] === ')'){ глубина -= 1; if(глубина === 0) break; }
  }
  const bodyStart = text.indexOf('{', i);
  let depth = 0;
  for(let j = bodyStart; j < text.length; j += 1){
    if(text[j] === '{') depth += 1;
    if(text[j] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, j + 1);
  }
  throw new Error(`Не найден конец функции ${name}`);
}

// === 1. ГЛАВНОЕ: комната сама называет своего хозяина ===
//
// Настоящий worker/room.js, без подделок: это он завтра будет единственным, кто помнит,
// чей это стол.
{
  const комната = {};
  const код = roomSource
    .replace(/export /g, '')
    + '\nthat.api = { createRoom, joinRoom, leaveRoom, buildPresenceEnvelope, routeEnvelope,'
    + ' RELAY_PROTOCOL_VERSION, RELAY_ERRORS };';
  vm.createContext(комната);
  комната.that = комната;
  vm.runInContext(код, комната);
  const { createRoom, joinRoom, buildPresenceEnvelope, routeEnvelope, RELAY_PROTOCOL_VERSION } = комната.api;

  const стол = createRoom();
  assert(стол.hostSeat === null, '1: у новой комнаты уже есть хозяин — назначен он не входом');

  // Пришедший по ссылке стол себе не забирает, даже если он первый и стол ничей. Иначе
  // друг, открывший ссылку на комнату, которой никто не заводил, стал бы её хозяином: у
  // него «Send link» вместо ожидания, а настоящий хозяин — гостем за своим же столом.
  const мимо = joinRoom(стол, {
    seat: 'blue', version: RELAY_PROTOCOL_VERSION, connection: { id: 0 }, key: 'k-blue-mimo00000',
  });
  assert(мимо.ok, `1a2: вход по ссылке отвергнут (${мимо.error})`);
  assert(стол.hostSeat === null,
    `1a3: стол достался пришедшему по ссылке («${стол.hostSeat}») — он его не заводил`);

  // А заводивший — забирает. Цвет здесь ни при чём: важно, что это он нажал Online.
  const первый = joinRoom(стол, {
    seat: 'green', version: RELAY_PROTOCOL_VERSION, connection: { id: 1 }, key: 'k-green-00000000',
    claimHost: true,
  });
  assert(первый.ok, `1b: первый вход отвергнут (${первый.error})`);
  assert(стол.hostSeat === 'green', `1c: стол достался «${стол.hostSeat}», а сел первым зелёный`);
  assert(первый.hostAssigned === true, '1d: вход не сообщил, что назначил хозяина — записать будет нечего');

  // Второй вход хозяина не переназначает — иначе каждое переподключение меняло бы
  // главного, и настройки комнаты поехали бы по второму кругу.
  // Тот же пришедший по ссылке, вернувшийся со своим ключом, — и даже с претензией на
  // стол: он уже чей-то, и второй раз его не отдают.
  const второй = joinRoom(стол, {
    seat: 'blue', version: RELAY_PROTOCOL_VERSION, connection: { id: 2 }, key: 'k-blue-mimo00000',
    claimHost: true,
  });
  assert(второй.ok, `1e: второй вход отвергнут (${второй.error})`);
  assert(стол.hostSeat === 'green', '1f: второй вошедший отобрал стол у первого');
  assert(второй.hostAssigned === false, '1g: второй вход считает, что назначил хозяина');

  // И это уезжает обоим: клиент сам знать не может, чей стол.
  const весть = buildPresenceEnvelope(стол);
  assert(весть.payload.host === 'green',
    `1h: в сообщении о присутствии хозяин «${весть.payload.host}» — клиентам неоткуда узнать роль`);
  assert(весть.payload.seats && весть.payload.seats.green === true,
    '1h2: присутствие перестало сообщать, кто за столом');

  // Но ничей стол, за которым УЖЕ ДВОЕ, хозяина получает: иначе эти двое просидят друг
  // напротив друга вечно — начать партию некому. Такое бывает, когда обе ссылки ведут в
  // комнату, которой никто не заводил.
  {
    const ничей = createRoom();
    joinRoom(ничей, {
      seat: 'green', version: RELAY_PROTOCOL_VERSION, connection: { id: 11 }, key: 'k-green-n0000000',
    });
    assert(ничей.hostSeat === null, '1i: стол достался одиночке, пришедшему по ссылке');
    const второй = joinRoom(ничей, {
      seat: 'blue', version: RELAY_PROTOCOL_VERSION, connection: { id: 12 }, key: 'k-blue-n00000000',
    });
    assert(ничей.hostSeat === 'green',
      `1j: за полным столом хозяин «${ничей.hostSeat}» — двое будут ждать друг друга вечно, `
      + 'начать некому');
    assert(второй.hostAssigned === true,
      '1k: назначение хозяина за полным столом не записывается — после сна комнаты оно пропадёт');
  }

  // === 2. Новая партия выбрасывает вчерашний снимок ===
  routeEnvelope(стол, 'green', { t: 'state', payload: { вчера: true } });
  assert(стол.kept.state, '2: снимок не придерживается вовсе — возвращение после обрыва сломано');
  routeEnvelope(стол, 'green', { t: 'settings', payload: { правила: 'classic' } });

  const старт = routeEnvelope(стол, 'green', { t: 'start', payload: { start: true } });
  assert(стол.kept.state === undefined,
    '2b: после «start» вчерашний снимок всё ещё придержан — вошедший получит его поверх '
    + 'свежего начала, и доска уедет во вчерашнюю позицию');
  assert(старт.droppedState === true,
    '2c: про выброшенный снимок не сказано наружу — из хранилища его никто не сотрёт, и '
    + 'он вернётся после сна комнаты');
  assert(стол.kept.settings, '2d: вместе со снимком выброшены настройки — это правила стола, а не партии');

  // Второй «start» подряд ничего не выбрасывает: нечего.
  assert(routeEnvelope(стол, 'green', { t: 'start', payload: {} }).droppedState === false,
    '2e: «start» сообщает о выбросе там, где выбрасывать нечего — хранилище будут тереть впустую');
}

// === 3. Хозяин стола переживает сон комнаты ===
//
// Спящий режим выгружает память, а пошаговая игра молчит минутами. Не записав хозяина,
// комната проснулась бы ничьей — и назначила бы хозяином того, кто первым постучался
// после сна, то есть посреди партии.
{
  assert(/storage\.get\("hostSeat"\)/.test(workerSource),
    '3: проснувшаяся комната не читает хозяина — он сменится посреди партии');
  assert(/storage\.put\("hostSeat"/.test(workerSource),
    '3b: хозяин стола не записывается — после сна комната его не вспомнит');
  assert(/joined\.hostAssigned/.test(workerSource),
    '3c: хозяин пишется не только в тот вход, который его назначил');
  assert(/claimHost/.test(workerSource),
    '3c2: облачная комната не принимает слово «этот стол завёл я» — хозяина не будет ни у кого');
  const локальный = fs.readFileSync('worker/local-server.js', 'utf8');
  assert(/claimHost/.test(локальный),
    '3c3: локальный сервер это слово теряет — на своей машине стол останется ничьим');
  assert(/storage\.delete\("state"\)/.test(workerSource),
    '3d: выброшенный снимок остаётся в хранилище — после сна комната отдаст его снова');
}

// === 4. Адрес страницы — ссылка на свой стол ===
//
// У гостя она была всегда: он по ней и пришёл. Хозяину её не хватало ровно для того, о
// чём эта проверка.
{
  const адрес = (search, действие) => {
    const sandbox = {
      URLSearchParams, Object, String,
      заменено: null,
      window: {
        location: { pathname: '/game/', search, hash: '' },
        history: { replaceState: (_s, _t, url) => { sandbox.заменено = url; } },
      },
    };
    vm.createContext(sandbox);
    vm.runInContext([
      extractFunctionSource(source, 'writeOnlineRoomIntoAddress'),
      extractFunctionSource(source, 'clearOnlineRoomFromAddress'),
      `this.итог = (${действие});`,
    ].join('\n'), sandbox);
    return { итог: sandbox.итог, заменено: sandbox.заменено };
  };

  const вписали = адрес('', 'writeOnlineRoomIntoAddress({ room: "стол7", seat: "green" })');
  assert(/room=%D1%81%D1%82%D0%BE%D0%BB7|room=стол7/.test(вписали.итог),
    `4: комната не попала в адрес («${вписали.итог}») — хозяину нечем вернуться завтра`);
  assert(/seat=green/.test(вписали.итог),
    `4b: место не попало в адрес («${вписали.итог}») — вернувшись, сядешь на чужое`);
  assert(вписали.заменено === вписали.итог,
    '4c: адрес посчитан, но не подставлен в строку браузера');

  // Чужие хвосты адреса остаются: relay=auto — единственное, чем держится игра по
  // локальной сети и через туннель.
  const сХвостом = адрес('?relay=auto', 'writeOnlineRoomIntoAddress({ room: "r", seat: "blue" })');
  assert(/relay=auto/.test(сХвостом.итог),
    `4d: из адреса пропал relay=auto («${сХвостом.итог}») — после перезагрузки игра пойдёт `
    + 'искать ретранслятор не там');

  // Вышли из-за стола — адрес перестаёт туда звать.
  const стёрли = адрес('?room=r&seat=blue&relay=auto', 'clearOnlineRoomFromAddress()');
  assert(!/room=|seat=/.test(стёрли.итог),
    `4e: после выхода адрес всё ещё зовёт за стол («${стёрли.итог}») — перезагрузка молча `
    + 'усадит обратно в комнату, из которой только что вышли');
  assert(/relay=auto/.test(стёрли.итог),
    `4f: вместе с комнатой стёрли и адрес ретранслятора («${стёрли.итог}»)`);

  const нечего = адрес('?relay=auto', 'clearOnlineRoomFromAddress()');
  assert(нечего.заменено === null,
    '4g: адрес переписывается, когда стирать нечего — лишняя запись в историю браузера');
}

// === 5. Клиент вписывает и стирает адрес в нужных местах ===
{
  const вход = extractFunctionSource(source, 'createOnlineRoom');
  assert(/writeOnlineRoomIntoAddress\(session\)/.test(вход),
    '5: заведя комнату, страница не стала ссылкой на свой стол');

  const выход = extractFunctionSource(source, 'stopOnlineSession');
  assert(/clearOnlineRoomFromAddress\(\)/.test(выход),
    '5b: выйдя из-за стола, адрес продолжает туда звать');
}

// === 6. Настройки комнаты уезжают и у того, кто стал хозяином позже ===
//
// Вернувшись завтра по ссылке, хозяин входит как все: своего нажатия Online он не помнит.
// Роль ему называет комната — уже после входа, первым сообщением о присутствии. Если
// настройки отправлять только при входе, стол останется без правил, и гость доиграет
// партию по своим.
{
  const присутствие = extractFunctionSource(source, 'receiveOnlinePresence');
  assert(/onlineSession\.hostSeat = payload\.host/.test(присутствие),
    '6: слово комнаты о хозяине не принимается');
  assert(/isOnlineHost\(\) && onlineSession && !onlineSession\.settingsPublished/.test(присутствие),
    '6b: ставший хозяином не отправляет настройки комнаты — стол останется без правил');

  const отправка = extractFunctionSource(source, 'publishOnlineRoomSettings');
  assert(/settingsPublished = true/.test(отправка),
    '6c: отправка настроек не отмечается — они поедут заново на каждое сообщение о присутствии');

  // Порядок внутри: хозяина узнаём ДО того, как решаем, кому начинать партию.
  const где = (что) => присутствие.indexOf(что);
  assert(где('onlineSession.hostSeat = payload.host') < где('startOnlineMatchAsHost()'),
    '6d: партию начинают раньше, чем узнают хозяина — в первый же раз её не начнёт никто');
}

// === 7. Вчерашний снимок не ложится поверх свежего начала ===
//
// Комната выбрасывает его, увидев «start» (проверка 2), но тем, кто вошёл РАНЬШЕ, он к
// этому мигу уже отдан и лежит у них в очереди. Замерено на стенде до этой правки:
// вернувшись за вчерашний стол, оба получали раунд 7 и счёт 5:3 при заново расставленной
// доске — то есть «тот же стол» вышел, а «новая партия» нет.
{
  const sandbox = { onlineInbox: [{ type: 'state' }, { type: 'move' }] };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFunctionSource(source, 'забытьПриехавшееДоНачала'),
    'this.забыть = забытьПриехавшееДоНачала; this.очередь = () => onlineInbox.length;',
  ].join('\n'), sandbox);
  assert(sandbox.забыть() === 2, '7: очередь не вычищена — вернулось не то число');
  assert(sandbox.очередь() === 0, '7b: в очереди осталось приехавшее до начала партии');

  // И зовётся это ДО начала партии, с обеих сторон: хозяин даёт старт сам, гость получает
  // его пакетом.
  for(const имя of ['startOnlineMatchAsHost', 'receiveOnlineStart']){
    const тело = extractFunctionSource(source, имя);
    const забыли = тело.indexOf('забытьПриехавшееДоНачала()');
    const начали = тело.indexOf('handlePlayStart()');
    assert(забыли !== -1,
      `7c: ${имя} не чистит очередь — вчерашний снимок ляжет поверх новой партии`);
    assert(забыли < начали,
      `7d: ${имя} чистит очередь после начала партии — чистить будет уже поздно`);
  }
}

console.log('smoke-online-same-table: OK');
