#!/usr/bin/env node
'use strict';

// Smoke test: соперник ушёл посреди партии — об этом говорят.
//
// Про пустой стол игра умела говорить только в лобби, а в партии о том же событии
// молчала. Замерено стендом (два окна, ретранслятор, одного смахиваем): комната сообщает
// «место свободно» через секунду, а у оставшегося тридцать пять секунд не меняется
// ничего — та же доска, то же ожидание чужого хода. Молчание неотличимо от раздумья.
//
// Надпись одна на все случаи (та же, что объясняет отобранное место), поэтому половина
// проверок тут про соседство: не мигать, не подменять чужую надпись и не спорить с
// панелью связи.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Не найдена функция ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');

// Стенд: поддельная разметка надписи — ровно те узлы, что есть в index.html.
function стенд(){
  class HTMLElement {}
  const действия = Object.assign(new HTMLElement(), { hidden: false, класс: 'game-notice__actions' });
  const строка = Object.assign(new HTMLElement(), { textContent: '' });
  const надпись = Object.assign(new HTMLElement(), {
    hidden: true,
    querySelector(что) { return что === '.game-notice__actions' ? действия : null; },
  });
  const узлы = { gameNotice: надпись, gameNoticeText: строка };
  const метки = [];

  const sandbox = {
    Boolean, Number, Date, Object, String,
    HTMLElement,
    document: {
      getElementById: (id) => узлы[id] || null,
      documentElement: { classList: { toggle: (имя, как) => метки.push([имя, как]) } },
    },
    gameMode: 'online',
    onlinePresence: { blue: true, green: true },
    onlineSession: { aloneSince: null },
    бедаСоСвязью: '',
  };
  sandbox.getOnlineTroubleText = () => sandbox.бедаСоСвязью;
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_EMPTY_TABLE_NOTICE_MS = [^;]*;/)[0],
    source.match(/const ONLINE_RIVAL_LEFT_TEXT =\s*[^;]*;/)[0],
    source.match(/const ONLINE_DISPLACED_TEXT = [^;]*;/)[0],
    extractFunctionSource(source, 'isOnlineTableFull'),
    extractFunctionSource(source, 'isOnlineTableEmptyForLong'),
    extractFunctionSource(source, 'показатьНадписьНаПоле'),
    extractFunctionSource(source, 'надписьНаПолеПоказывает'),
    extractFunctionSource(source, 'спрятатьНадписьНаПоле'),
    extractFunctionSource(source, 'обновитьНадписьОбУходе'),
    'this.обновить = обновитьНадписьОбУходе;',
    'this.показать = показатьНадписьНаПоле;',
    'this.текстУхода = ONLINE_RIVAL_LEFT_TEXT;',
    'this.текстВытеснения = ONLINE_DISPLACED_TEXT;',
    'this.срок = ONLINE_EMPTY_TABLE_NOTICE_MS;',
  ].join('\n'), sandbox);

  return {
    api: sandbox,
    надпись,
    действия,
    метки,
    // Соперник ушёл столько-то миллисекунд назад.
    ушёл(давно){
      sandbox.onlinePresence = { blue: true, green: false };
      sandbox.onlineSession.aloneSince = Date.now() - давно;
    },
    вернулся(){
      sandbox.onlinePresence = { blue: true, green: true };
      sandbox.onlineSession.aloneSince = null;
    },
    наЭкране(){
      return надпись.hidden === true ? null : строка.textContent;
    },
  };
}

// === 1. Стол полон — говорить не о чем ===
{
  const с = стенд();
  assert(с.api.обновить() === false, '1: за полным столом встала надпись об ушедшем сопернике');
  assert(с.наЭкране() === null, '1b: надпись на поле появилась без повода');
}

// === 2. Ушёл только что — молчим ===
//
// Вебвью на телефоне роняет провод и на пару секунд. Сказать «ушёл» о том, кто сейчас
// вернётся, — соврать не меньше, чем промолчать.
{
  const с = стенд();
  с.ушёл(с.api.срок - 2000);
  assert(с.api.обновить() === false, '2: надпись встала раньше срока — мигнёт на каждом переподключении');
  assert(с.наЭкране() === null, '2b: на экране надпись, которой ещё рано');
}

// === 3. Ушёл надолго — говорим ===
{
  const с = стенд();
  с.ушёл(с.api.срок + 1000);
  assert(с.api.обновить() === true, '3: соперника нет дольше срока, а надписи нет');
  assert(с.наЭкране() === с.api.текстУхода, `3b: на поле не та надпись: ${JSON.stringify(с.наЭкране())}`);
  assert(/left/i.test(с.api.текстУхода), '3c: надпись не говорит про уход');
  assert(с.действия.hidden === true,
    '3d: под надписью осталась кнопка «Reload» — перезагружать нечего, она зовёт не туда');
  // Одного hidden мало: это всего лишь display: none из таблицы браузера, и свой
  // display: flex его перебивает. Первый снимок стенда это и показал — кнопка стояла
  // под надписью при hidden = true.
  assert(/\.game-notice__actions\[hidden\]\s*\{[^}]*display:\s*none/
    .test(fs.readFileSync('styles.css', 'utf8')),
    '3f: в стилях нет правила .game-notice__actions[hidden] — скрытая кнопка останется видимой');
  // Метка на корне поднимает доску над плашкой раунда, иначе плашка накроет надпись.
  assert(с.метки.some(([имя, как]) => имя === 'is-game-notice' && как === true),
    '3e: доску не подняли над слоем плашек — плашка раунда накроет надпись');
}

// === 4. Вернулся — надпись снимается ===
{
  const с = стенд();
  с.ушёл(с.api.срок + 1000);
  с.api.обновить();
  с.вернулся();
  assert(с.api.обновить() === false, '4: после возвращения соперника надпись всё ещё считается нужной');
  assert(с.наЭкране() === null, '4b: надпись висит над доской, за которой уже играют');
}

// === 5. В лобби эта надпись не встаёт: там своя, про пустой стол ===
{
  const с = стенд();
  с.api.gameMode = null;
  с.ушёл(с.api.срок + 1000);
  assert(с.api.обновить() === false, '5: надпись о партии встала там, где партии нет');
  assert(с.наЭкране() === null, '5b: поверх лобби легла надпись про ушедшего соперника');
}

// === 6. Своя беда со связью важнее ===
//
// Пока молчит свой провод, про соперника мы попросту ничего не знаем, и говорить надо
// не про него.
{
  const с = стенд();
  с.ушёл(с.api.срок + 1000);
  с.api.бедаСоСвязью = 'Connection lost.';
  assert(с.api.обновить() === false, '6: при своей беде со связью игра винит соперника');
  assert(с.наЭкране() === null, '6b: надпись про соперника спорит с панелью связи');
}

// === 7. Чужую надпись не трогаем ===
//
// Надпись на поле одна, и объяснение про отобранное место важнее: без него человек
// останется с замершей доской и без единого слова.
{
  const с = стенд();
  с.api.показать(с.api.текстВытеснения);
  с.вернулся();
  assert(с.api.обновить() === false, '7: забота об ушедшем сопернике взялась распоряжаться чужой надписью');
  assert(с.наЭкране() === с.api.текстВытеснения,
    `7b: снята чужая надпись, на поле теперь ${JSON.stringify(с.наЭкране())}`);

  // Надпись о вытеснении живёт УЖЕ ПОСЛЕ конца сессии: место отобрали, stopOnlineSession
  // отработал, onlineSession пуст. В этом состоянии про соперника сказать нечего — и
  // объяснение про отобранное место обязано остаться на экране.
  с.ушёл(с.api.срок + 1000);
  с.api.onlineSession = null;
  assert(с.api.обновить() === false, '7c: без сессии игра взялась говорить про соперника');
  assert(с.наЭкране() === с.api.текстВытеснения,
    `7d: объяснение про отобранное место пропало, на поле ${JSON.stringify(с.наЭкране())}`);
}

// === 8. Повторный вызов ничего не переписывает ===
{
  const с = стенд();
  с.ушёл(с.api.срок + 1000);
  с.api.обновить();
  const былоМеток = с.метки.length;
  assert(с.api.обновить() === true, '8: при втором вызове надпись перестала считаться нужной');
  assert(с.метки.length === былоМеток,
    `8b: надпись ставится заново на каждый пакет (меток было ${былоМеток}, стало ${с.метки.length})`);
}

console.log('Smoke test passed: об ушедшем сопернике говорят на поле — не раньше срока, '
  + 'без кнопки «Reload», снимая надпись при возвращении и не трогая чужую.');
