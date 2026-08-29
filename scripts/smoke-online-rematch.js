#!/usr/bin/env node
'use strict';

// Smoke test: «ещё раз?» — решение общее, а не у каждого своё.
//
// До этой правки обе кнопки конца матча были чисто локальными, и это давало ровно то,
// чего быть не должно. Замерено в двух браузерах:
//
//   синий нажал «ещё раз» -> он один начал новый матч (0:0, восемь самолётов),
//                            зелёный остался сидеть в законченном (23:24);
//   зелёный нажал «в меню» -> ушёл, а синий об этом не узнал и остался играть с пустотой.
//
// Правило: реванш начинается, только если ЗА него оба; любой отказ отменяет партию и
// уводит в меню обоих.
//
// Тонкость, которую легко потерять: пока ответил только один, НИЧЕГО НЕ ПРОИСХОДИТ. Это
// правильно по сути, но выглядит как зависшая игра, поэтому кнопки обязаны погаснуть —
// человек должен видеть, что его услышали.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');

// Стенд: одно устройство с настоящим кодом решения, но с записанными последствиями.
function makeSide(seat){
  const log = [];
  const sent = [];
  const sandbox = {
    Object, Array, Math, JSON, String,
    console: { log: () => {}, warn: () => {} },
    onlineSession: {
      seat,
      rematch: { mine: null, theirs: null },
      rematchHandlers: [],
    },
    // Панель в стенде — не настоящий DOM, поэтому HTMLElement подменён так, чтобы
    // проверка «это элемент?» проходила.
    HTMLElement: null,
    endGameDiv: { classList: {
      classes: new Set(),
      toggle(name, on){ if(on) this.classes.add(name); else this.classes.delete(name); },
      contains(name){ return this.classes.has(name); },
    } },
    sendRematchAnswer: (answer) => { sent.push(answer); return true; },
    resetGame: (opts) => log.push(['resetGame', opts?.forceMenu === true]),
    startRematchRound: () => log.push(['startRematchRound']),
  };
  // Панель в стенде — не настоящий DOM. Делаем её экземпляром подставного HTMLElement,
  // чтобы проверка «это элемент?» внутри applyRematchWaitingUi прошла честно.
  sandbox.HTMLElement = function HTMLElement(){};
  Object.setPrototypeOf(sandbox.endGameDiv, sandbox.HTMLElement.prototype);
  vm.createContext(sandbox);
  vm.runInContext([
    extractFunctionSource(source, 'getOnlineRematchState'),
    extractFunctionSource(source, 'resetOnlineRematchAnswers'),
    extractFunctionSource(source, 'answerOnlineRematch'),
    extractFunctionSource(source, 'receiveOnlineRematchAnswer'),
    extractFunctionSource(source, 'resolveOnlineRematch'),
    extractFunctionSource(source, 'applyRematchWaitingUi'),
    'this.api = { answerOnlineRematch, receiveOnlineRematchAnswer, resolveOnlineRematch,',
    '             resetOnlineRematchAnswers, state: () => onlineSession.rematch,',
    '             waiting: () => endGameDiv.classList.contains("is-waiting") };',
  ].join('\n'), sandbox);
  return { seat, api: sandbox.api, log, sent };
}

// Двое за столом: ответ одного доезжает до другого.
function makeTable(){
  const blue = makeSide('blue');
  const green = makeSide('green');
  const answer = (side, value) => {
    side.api.answerOnlineRematch(value);
    const other = side === blue ? green : blue;
    other.api.receiveOnlineRematchAnswer({ answer: value });
  };
  return { blue, green, answer };
}

// === 1. Ответил один — не происходит НИЧЕГО, но это видно ===
{
  const { blue, green, answer } = makeTable();
  answer(blue, 'yes');

  assert(blue.log.length === 0,
    '1: нажавший «ещё раз» НЕ начинает матч в одиночку — до правки начинал, ' +
    'и соперник оставался в законченном');
  assert(blue.sent[0] === 'yes', '1b: ответ уехал сопернику');
  assert(blue.api.state().mine === 'yes' && green.api.state().theirs === 'yes',
    '1c: обе стороны знают про этот ответ');
  assert(blue.api.waiting() === true,
    '1d: у ответившего кнопки погасли — иначе выглядит как зависшая игра');
  assert(green.api.waiting() === false,
    '1e: у второго панель ещё живая, ему только предстоит ответить');
  assert(green.log.length === 0, '1f: и у него тоже ничего не началось');
}

// === 2. Оба «за» — реванш ===
{
  const { blue, green, answer } = makeTable();
  answer(blue, 'yes');
  answer(green, 'yes');

  for(const side of [blue, green]){
    assert(side.log.some(([name]) => name === 'startRematchRound'),
      `2: у «${side.seat}» реванш начался`);
    assert(!side.log.some(([name]) => name === 'resetGame'),
      `2b: и никто не ушёл в меню`);
  }
  assert(blue.api.state().mine === null && blue.api.state().theirs === null,
    '2c: ответы сброшены — оставленное «да» иначе запустило бы следующий реванш само');
  assert(blue.api.waiting() === false, '2d: ожидание снято');
}

// === 3. Любой отказ отменяет партию у ОБОИХ ===
{
  // Отказ второго, когда первый уже сказал «да».
  const first = makeTable();
  first.answer(first.blue, 'yes');
  first.answer(first.green, 'no');
  for(const side of [first.blue, first.green]){
    assert(side.log.some(([name, forceMenu]) => name === 'resetGame' && forceMenu === true),
      `3: «${side.seat}» ушёл в меню, хотя за реванш был не он один`);
    assert(!side.log.some(([name]) => name === 'startRematchRound'),
      `3b: и реванш у «${side.seat}» не начался`);
  }

  // Отказ первого — то же самое, порядок не важен.
  const second = makeTable();
  second.answer(second.green, 'no');
  for(const side of [second.blue, second.green]){
    assert(side.log.some(([name, forceMenu]) => name === 'resetGame' && forceMenu === true),
      `3c: «${side.seat}» ушёл в меню и когда отказ пришёл первым`);
  }
  assert(second.blue.log.length === 1,
    '3d: отказ решает сразу, ждать второго ответа незачем');
}

// === 4. Передумать нельзя ===
//
// Иначе «нет», уже уведшее соперника в меню, можно было бы отменить — и один остался бы
// в партии, которой для второго уже нет.
{
  const { blue } = makeTable();
  assert(blue.api.answerOnlineRematch('yes') === true, '4: первый ответ принят');
  assert(blue.api.answerOnlineRematch('no') === false, '4b: второй ответ отвергнут');
  assert(blue.sent.length === 1, '4c: и наружу второй раз ничего не уехало');
  assert(blue.api.state().mine === 'yes', '4d: ответ остался прежним');
}

// === 5. Что угодно, кроме «yes», считается отказом ===
//
// Пакет с мусором внутри не должен превращаться в согласие на реванш.
//
// Проверяем последствие, а не остаток: отказ решает сразу и тут же сбрасывает ответы,
// так что смотреть в них после — значит ничего не увидеть.
{
  for(const [name, payload] of [['мусор внутри', { answer: 'ДА!' }],
                                ['пустой пакет', null],
                                ['ответ не строкой', { answer: 1 }]]){
    const side = makeSide('green');
    side.api.receiveOnlineRematchAnswer(payload);
    assert(side.log.some(([call, forceMenu]) => call === 'resetGame' && forceMenu === true),
      `5: «${name}» читается как отказ и уводит в меню`);
    assert(!side.log.some(([call]) => call === 'startRematchRound'),
      `5b: «${name}» не превращается в согласие на реванш`);
  }
}

// === 6. Офлайн кнопки работают как раньше: нажал — сразу ===
{
  const yesHandler = source.slice(source.indexOf('yesBtn.addEventListener'),
                                  source.indexOf('noBtn.addEventListener'));
  const noHandler = source.slice(source.indexOf('noBtn.addEventListener'),
                                 source.indexOf('noBtn.addEventListener') + 400);

  assert(/if\(onlineSession\)\{\s*\n\s*answerOnlineRematch\("yes"\);\s*\n\s*return;/.test(yesHandler),
    '6: онлайн — «да» это только половина решения');
  assert(/startRematchRound\(\);/.test(yesHandler),
    '6b: офлайн — «да» сразу начинает игру');
  assert(/if\(onlineSession\)\{\s*\n\s*answerOnlineRematch\("no"\);\s*\n\s*return;/.test(noHandler),
    '6c: онлайн — об отказе сначала узнаёт соперник');
  assert(/resetGame\(\{ forceMenu: true \}\);/.test(noHandler),
    '6d: офлайн — «нет» сразу уводит в меню');

  // Начало новой игры — один и тот же код у обоих. Если бы каждый начинал по-своему,
  // стороны разошлись бы с первого же хода реванша.
  assert(/function startRematchRound\(\)\{/.test(source),
    '6e: начало игры вынесено в общую функцию');
  const startFn = extractFunctionSource(source, 'startRematchRound');
  assert(/randomMapPairSequenceNumber = null/.test(startFn),
    '6f: запомненный выбор карты сбрасывается — иначе реванш пойдёт на карте прошлого матча');
  assert(/isOnlineHostSeat\(\)/.test(startFn) && /sendState\(serializeMatchState\(\)\)/.test(startFn),
    '6g: создатель комнаты присылает снимок нового матча — проверять догадкой дороже, ' +
    'чем прислать один пакет');
}

// === 7. Ответы не переживают начало новой игры ===
{
  const startRound = extractFunctionSource(source, 'startNewRound');
  assert(/resetOnlineRematchAnswers\(\);/.test(startRound),
    '7: начиная новую игру, забываем прошлые ответы — оставленное «да» иначе запустило ' +
    'бы следующий реванш без спроса');
}

// === 8. Ответ на «ещё раз?» комната не придерживает ===
//
// Это одноразовое решение, а не состояние партии: досланное потом, оно начало бы реванш
// в уже идущей игре.
{
  const roomSource = fs.readFileSync('worker/room.js', 'utf8');
  const kept = roomSource.match(/RELAY_KEPT_TYPES = Object\.freeze\(\[([^\]]*)\]\)/)[1];
  assert(!/rematch/.test(kept),
    `8: «rematch» не в списке придерживаемых (сейчас: ${kept.trim()})`);
  assert(/"settings"/.test(kept) && /"state"/.test(kept),
    '8b: а настройки и снимок — придерживаются, как и были');
}

console.log('Smoke test passed: реванш начинается только по согласию обоих, любой отказ уводит в меню обоих, ответивший видит, что его услышали, а офлайн кнопки работают как раньше.');
