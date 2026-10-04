#!/usr/bin/env node
'use strict';

// Smoke test: «Send link» отвечает на нажатие.
//
// Раньше не отвечал. На телефоне открывалась системная шторка — она и была ответом; на
// компьютере ссылка молча уезжала в буфер, и не происходило ВООБЩЕ НИЧЕГО. Человек не
// знал ни сработало ли, ни где теперь ссылка, ни что делать дальше. Нажимал ещё раз.
//
// Проверяются все три исхода, потому что молчит обычно не главный из них, а забытый:
//
//   поделились через шторку — сказать, что ушло;
//   скопировали в буфер     — сказать, что скопировано И что с этим делать;
//   не вышло ничего         — сказать прямо, иначе человек будет жать снова и снова.
//
// И отдельно — запасной способ копирования. Он не наследие: современный требует
// «безопасного контекста», которого нет на домашнем сервере в локальной сети. То есть у
// того, кто поднял игру у себя и зовёт друга из соседней комнаты, работает только он.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const markup = fs.readFileSync('index.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');
const CYRILLIC = /[Ѐ-ӿ]/;

function extractFunctionSource(text, name){
  let start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  // Слово async стоит ПЕРЕД function, и без него вырезанный кусок не разбирается вовсе.
  if(text.slice(start - 6, start) === 'async ') start -= 6;
  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции ${name}`);
}

function extractBlock(text, opener){
  const start = text.indexOf(opener);
  if(start === -1) throw new Error(`Не найдено: ${opener}`);
  const bodyStart = text.indexOf('{', start + opener.length - 1);
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец блока: ${opener}`);
}

// Стенд: настоящий обработчик нажатия, поддельные буфер, шторка и надпись.
async function нажать({ шторка = null, буфер = null, execCommand = null } = {}){
  const показано = [];
  const кнопка = { слушатели: [] };
  const sandbox = {
    Object, String, Boolean, Promise, console: { log: () => {}, warn: () => {} },
    HTMLElement: function HTMLElement(){},
    onlineInviteSent: false,
    обновитьЗазывание: () => {},
    показатьПодсказкуЛобби: (текст) => { показано.push(текст); return true; },
    buildOnlineInviteLink: () => 'https://example.test/game/?room=abc&seat=green',
    navigator: {},
    document: {
      createElement: () => ({
        style: {}, setAttribute: () => {}, select: () => {}, setSelectionRange: () => {},
        remove: () => {},
      }),
      body: { appendChild: () => {} },
      execCommand: execCommand === null ? undefined : execCommand,
    },
    onlineSendLinkBtn: null,
  };
  if(шторка) sandbox.navigator.share = шторка;
  if(буфер) sandbox.navigator.clipboard = { writeText: буфер };
  if(execCommand !== null) sandbox.document.execCommand = execCommand;

  sandbox.onlineSendLinkBtn = Object.setPrototypeOf({
    addEventListener: (_тип, обработчик) => { кнопка.слушатели.push(обработчик); },
  }, sandbox.HTMLElement.prototype);

  vm.createContext(sandbox);
  vm.runInContext([
    extractFunctionSource(source, 'скопироватьСсылку'),
    extractBlock(source, 'if(onlineSendLinkBtn instanceof HTMLElement){'),
  ].join('\n'), sandbox);

  assert(кнопка.слушатели.length === 1, 'стенд: обработчик нажатия не повесился');
  await кнопка.слушатели[0]();
  return { показано, отправлено: sandbox.onlineInviteSent };
}

(async () => {

// === 1. ГЛАВНОЕ: на каждый исход есть ответ ===
{
  const шторка = await нажать({ шторка: async () => {} });
  assert(шторка.показано.length === 1,
    '1: поделились через шторку — и ни слова в ответ. Шторка уже закрылась, а «ушло или '
    + 'нет» так и осталось без ответа');
  assert(шторка.отправлено === true, '1a2: отправленное не засчитано');

  const буфер = await нажать({ буфер: async () => {} });
  assert(буфер.показано.length === 1,
    '1b: ссылка уехала в буфер МОЛЧА — ровно та поломка, ради которой всё это писалось');
  assert(буфер.отправлено === true, '1b2: скопированное не засчитано');

  const мимо = await нажать({ буфер: async () => { throw new Error('нет доступа'); },
                              execCommand: () => false });
  assert(мимо.показано.length === 1,
    '1c: не сработало ничего, и человеку об этом не сказали — он будет жать снова и снова');
  assert(мимо.отправлено === false,
    '1c2: несостоявшаяся отправка засчитана как состоявшаяся: самолётики перестанут '
    + 'звать нажать, хотя ссылку никто не получил');
}

// === 2. Ответ отличает «скопировано» от «не вышло» ===
//
// Иначе одно сообщение на оба исхода, и толку от него ноль.
{
  const буфер = await нажать({ буфер: async () => {} });
  const мимо = await нажать({ буфер: async () => { throw new Error('нет'); },
                              execCommand: () => false });
  assert(буфер.показано[0] !== мимо.показано[0],
    '2: удача и неудача отвечают одним и тем же текстом');

  // В удачном случае сказано не только «сработало», но и что делать: ссылка лежит в
  // буфере, которого не видно.
  assert(/paste/i.test(буфер.показано[0]),
    `2b: «${буфер.показано[0]}» — сказано, что скопировано, но не сказано, что с этим `
    + 'делать: буфер человеку не виден');
  assert(/not|fail|error/i.test(мимо.показано[0]),
    `2c: «${мимо.показано[0]}» не читается как отказ`);
}

// === 3. Передумал — не ответ ===
//
// Шторку закрыли, ничего не выбрав. Это не поломка, и говорить тут не о чем: человек сам
// только что отказался. Лезть после этого в буфер — тем более.
{
  const передумал = await нажать({
    шторка: async () => { throw new Error('AbortError'); },
    буфер: async () => { throw new Error('сюда вообще не должны были дойти'); },
  });
  assert(передумал.показано.length === 0,
    '3: человек закрыл шторку, а игра ему что-то отвечает');
  assert(передумал.отправлено === false, '3b: закрытая шторка засчитана как отправка');
}

// === 4. Запасной способ копирования работает ===
//
// По https есть navigator.clipboard, в локальной сети по http его НЕТ вовсе — контекст
// не «безопасный». Это не редкий случай: ровно так играют через «поднял сервер у себя».
{
  const старым = await нажать({ execCommand: () => true });   // clipboard отсутствует
  assert(старым.отправлено === true,
    '4: без navigator.clipboard ссылка не копируется ничем — в локальной сети «Send link» '
    + 'не работает совсем');
  assert(/paste/i.test(старым.показано[0] || ''),
    '4b: запасной способ сработал, а ответ не тот же самый');

  const послеОтказа = await нажать({
    буфер: async () => { throw new Error('нет доступа'); },
    execCommand: () => true,
  });
  assert(послеОтказа.отправлено === true,
    '4c: современный способ отказал, и запасной даже не попробовали');
}

// === 5. Разметка и стили ===
{
  const тег = /<p id="lobbyToast"[^>]*>/.exec(markup);
  assert(тег, '5: в разметке нет места для ответа');
  assert(/\shidden(\s|>)/.test(тег[0]),
    '5b: надпись не спрятана в разметке — мелькнёт пустой плашкой при загрузке');
  assert(/role="status"/.test(тег[0]) && /aria-live/.test(тег[0]),
    '5c: ответ не объявляется экранным диктором — для него нажатие останется молчаливым');

  const правило = /#menuLayer #modeMenu \.lobby-toast \{([^}]*)\}/.exec(styles);
  assert(правило, '5d: нет стилей для ответа');
  // Оформление — от подсказок инвентаря: один вид на всю игру, а не ещё одна плашка со
  // своим характером.
  // Не «хотя бы одна переменная», а весь вид: фон, цвет, шрифт, кегль, рамка. Одной
  // оставшейся переменной хватило бы, чтобы проверка прошла на наполовину своём виде.
  const откудаВид = (правило[1].match(/--inventory-tooltip-/g) || []).length;
  assert(откудаВид >= 5,
    `5e: вид ответа взят у подсказок инвентаря лишь на ${откудаВид} свойств — остальное `
    + 'своё, и в игре появится вторая плашка со своим характером');
  assert(/#menuLayer #modeMenu \.lobby-toast\[hidden\] \{[^}]*display:\s*none/.test(styles),
    '5f: спрятанная надпись всё равно занимает место');

  // Под «Cancel», а не поверх него.
  const низCancel = (() => {
    const блок = /#menuLayer #modeMenu \.mode-menu__btn--cancel \{([^}]*)\}/.exec(styles);
    const top = Number(/top:\s*(\d+)px/.exec(блок[1])[1]);
    const h = Number(/height:\s*(\d+)px/.exec(блок[1])[1]);
    return top + h;
  })();
  const верхНадписи = Number(/top:\s*(\d+)px/.exec(правило[1])[1]);
  assert(верхНадписи >= низCancel,
    `5g: надпись начинается на ${верхНадписи}, а «Cancel» кончается на ${низCancel} — `
    + 'она ляжет на кнопку');
}

// === 6. Говорим с игроком по-английски ===
//
// Вся игра англоязычная. Эти три строки — новые, и писались они по-русски думая.
{
  const блок = extractBlock(source, 'if(onlineSendLinkBtn instanceof HTMLElement){')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/console\.\w+\([\s\S]*?\);/g, '');
  for(const match of блок.matchAll(/показатьПодсказкуЛобби\("([^"]*)"\)/g)){
    assert(!CYRILLIC.test(match[1]),
      `6: игроку отвечают по-русски: «${match[1].replace(/\n/g, ' / ')}»`);
  }
}

// === 7. Надпись гаснет сама ===
//
// Ответ на нажатие — не сообщение, которое надо закрывать: закрывать нечего, вопроса в нём
// нет. Висящая вечно надпись станет частью экрана и перестанет что-либо значить.
{
  const показ = extractFunctionSource(source, 'показатьПодсказкуЛобби');
  assert(/setTimeout\(/.test(показ) && /спрятатьПодсказкуЛобби\(\)/.test(показ),
    '7: надпись не гаснет сама — повиснет на экране навсегда');
  assert(/clearTimeout\(lobbyToastTimer\)/.test(показ),
    '7b: второе нажатие не сбрасывает прежний таймер, и новая надпись погаснет раньше срока');
  assert(/const LOBBY_TOAST_MS = \d+;/.test(source), '7c: пропал срок показа');

  // И уходит вместе с лобби: иначе переживёт смену экрана и повиснет поверх партии.
  const состояние = extractFunctionSource(source, 'applyOnlineMenuState');
  assert(/спрятатьПодсказкуЛобби\(\)/.test(состояние),
    '7d: выход из лобби не убирает надпись — она останется висеть поверх игры');
}

console.log('smoke-send-link-feedback: OK');
})();
