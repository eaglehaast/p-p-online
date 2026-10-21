#!/usr/bin/env node
'use strict';

// Smoke test: «Online» при живом прежнем столе спрашивает, а не садится молча.
//
// Кнопка стала значить две разные вещи — завести новый стол и вернуться за вчерашний.
// Выбирать за человека молча нельзя: о сделанном выборе он узнал бы, только увидев в
// лобби не то, чего ждал. Поэтому один вопрос, тот же самый, что перед выходом из партии
// (те же классы, та же деревянная плашка — своей картинки у него нет).
//
// Половина проверок — про цену ошибки в ответах: «нет» стирает стол, за которым ждёт
// друг, и случайный тык мимо кнопок не должен значить «нет».

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(text, name){
  const start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  const bodyStart = text.indexOf('{', text.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции ${name}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

// Стенд: поддельная разметка вопроса и хранилище одного устройства.
function стенд(запись, край = 'green'){
  class HTMLElement {}
  const вопрос = Object.assign(new HTMLElement(), { hidden: true });
  const хранилище = new Map();
  if(запись) хранилище.set('online.hostRoom', JSON.stringify(запись));

  const sandbox = {
    Object, JSON, Number, Boolean, String,
    Date: { now: () => 1_700_000_000_000 },
    HTMLElement,
    boardViewSeat: край,
    document: { getElementById: (id) => (id === 'onlineAgainConfirm' ? вопрос : null) },
    window: {
      localStorage: {
        getItem: (к) => (хранилище.has(к) ? хранилище.get(к) : null),
        setItem: (к, з) => { хранилище.set(к, String(з)); },
        removeItem: (к) => { хранилище.delete(к); },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const ONLINE_LEGACY_HOST_SEAT = "[^"]*";/)[0],
    source.match(/const ONLINE_SEAT_COLORS = Object\.freeze\(\[[^\]]*\]\);/)[0],
    source.match(/const ONLINE_ROOM_MAX_LENGTH = \d+;/)[0],
    source.match(/const ONLINE_TABLE_STORAGE_KEY = "[^"]*";/)[0],
    source.match(/const ONLINE_TABLE_TTL_MS = [^;]*;/)[0],
    extractFunctionSource(source, 'getBoardViewSeat'),
    extractFunctionSource(source, 'recallOnlineTable'),
    extractFunctionSource(source, 'столДляВозврата'),
    extractFunctionSource(source, 'показатьВопросОПрежнемСтоле'),
    extractFunctionSource(source, 'спрятатьВопросОПрежнемСтоле'),
    'this.api = { спросить: показатьВопросОПрежнемСтоле, спрятать: спрятатьВопросОПрежнемСтоле,',
    '  стол: столДляВозврата };',
  ].join('\n'), sandbox);
  return { api: sandbox.api, вопрос };
}

const СТОЛ_ГОСТЯ = { room: 'frndroom', seat: 'green', host: false, at: 1_700_000_000_000 };
const СВОЙ_СТОЛ = { room: 'myroom', seat: 'green', host: true, at: 1_700_000_000_000 };

// === 1. Есть куда вернуться — вопрос задаётся ===
{
  const с = стенд(СТОЛ_ГОСТЯ);
  assert(с.api.спросить() === true, '1: при живом столе вопрос не задан — за человека решили молча');
  assert(с.вопрос.hidden === false, '1b: вопрос задан, а окно не показано');
}

// === 2. Возвращаться некуда — вопроса нет ===
//
// Спросить «вернуться за прежний стол?» там, где вернуться некуда, хуже, чем не спросить:
// человек ответит «да» и получит новый стол.
{
  const пусто = стенд(null);
  assert(пусто.api.спросить() === false, '2: вопрос задан на пустом месте');
  assert(пусто.вопрос.hidden === true, '2b: показано окно вопроса, которого быть не должно');

  // Свой стол, но мы с тех пор сменили край: прежняя ссылка зовёт друга ровно туда, где
  // теперь сидим мы, и возвращаться за такой стол незачем — заведётся новый.
  const другойКрай = стенд(СВОЙ_СТОЛ, 'blue');
  assert(другойКрай.api.стол() === null,
    '2c: свой стол признан годным после смены края — ссылка зовёт друга на наше же место');
  assert(другойКрай.api.спросить() === false,
    '2d: спрашиваем про стол, за который всё равно не вернёмся');

  // А гостевой стол смена края в меню не касается: место там определила ссылка.
  const гостьСменилКрай = стенд(СТОЛ_ГОСТЯ, 'blue');
  assert(гостьСменилКрай.api.стол()?.room === 'frndroom',
    '2e: гостевой стол потерян из-за выбора края в меню — а место за ним выбирала ссылка');
}

// === 3. Окно снимается ===
{
  const с = стенд(СТОЛ_ГОСТЯ);
  с.api.спросить();
  assert(с.api.спрятать() === true && с.вопрос.hidden === true, '3: окно вопроса не закрывается');
}

// === 4. Нажатие «Online» не меняет меню, пока вопроса не ответили ===
//
// Иначе отказавшийся от вопроса остаётся в онлайновом режиме без стола: «Play» в таком
// меню ведёт в никуда.
{
  const вход = source.slice(source.indexOf('onlineBtn.addEventListener("click"'));
  const тело = вход.slice(0, вход.indexOf('\n});'));
  assert(/показатьВопросОПрежнемСтоле\(\)/.test(тело),
    '4: кнопка «Online» больше не спрашивает про прежний стол');
  // Гостевую ветку («пришли по ссылке, место уже занято») вырезаем: там режим меняется
  // по праву, стол уже есть и спрашивать не о чем.
  const безГостя = тело.replace(/if\(onlineSession\)\{[\s\S]*?\n {2}\}/, '');
  const гдеВопрос = безГостя.indexOf('показатьВопросОПрежнемСтоле');
  const гдеРежим = безГостя.indexOf('выбратьОнлайнВМеню');
  assert(гдеВопрос !== -1 && (гдеРежим === -1 || гдеРежим > гдеВопрос),
    '4b: режим меню переключается до ответа — отказавшийся останется в онлайне без стола');
}

// === 5. «Нет» забывает стол, «да» — нет ===
//
// Это и есть разница между двумя ответами: createOnlineRoom сама по себе вернёт за
// прежний стол, и без забывания «нет» ничего бы не изменил.
{
  const начало = source.indexOf('const да = document.getElementById("onlineAgainYes");');
  assert(начало !== -1, '5: не найдена обвязка ответов');
  const кусок = source.slice(начало, начало + 2200);
  const ответДа = кусок.slice(кусок.indexOf('да.addEventListener'), кусок.indexOf('нет.addEventListener'));
  const ответНет = кусок.slice(кусок.indexOf('нет.addEventListener'), кусок.indexOf('вопрос.addEventListener'));
  assert(/войтиВОнлайн\(\)/.test(ответДа), '5b: «да» не сажает за стол');
  assert(!/forgetOnlineTable\(\)/.test(ответДа), '5c: «да» стирает стол, за который сам же и садится');
  assert(/forgetOnlineTable\(\)/.test(ответНет), '5d: «нет» не забывает прежний стол — ответ ничего не меняет');
  assert(ответНет.indexOf('forgetOnlineTable()') < ответНет.indexOf('войтиВОнлайн()'),
    '5e: «нет» забывает стол уже после входа — сесть успеем за прежний');
}

// === 6. Тык мимо кнопок — не ответ «нет» ===
//
// Случайное нажатие по затемнению не должно стирать стол, за которым ждёт друг.
{
  const начало = source.indexOf('const да = document.getElementById("onlineAgainYes");');
  const кусок = source.slice(начало, начало + 2200);
  const мимо = кусок.slice(кусок.indexOf('вопрос.addEventListener'));
  assert(/спрятатьВопросОПрежнемСтоле\(\)/.test(мимо), '6: нажатие мимо кнопок не закрывает вопрос');
  assert(!/forgetOnlineTable\(\)/.test(мимо) && !/войтиВОнлайн\(\)/.test(мимо),
    '6b: нажатие мимо кнопок что-то решает за человека — а это отказ от вопроса, а не ответ');
}

// === 7. Вид взят у вопроса о выходе, своей картинки нет ===
{
  const окно = /<div id="onlineAgainConfirm"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(html);
  assert(окно, '7: в разметке нет окна вопроса про прежний стол');
  for(const класс of ['leave-confirm__veil', 'leave-confirm__box', 'leave-confirm__text',
                      'leave-confirm__btn--yes', 'leave-confirm__btn--no']){
    assert(окно[0].includes(класс),
      `7b: окно вопроса не использует ${класс} — в игре появится вторая пара «да/нет»`);
  }
  assert(!/background-image|<img/.test(окно[0]),
    '7c: вопросу завели собственную картинку — подложка у него общая, деревянная');

  // Окно живёт в меню, а переменные --field-* описывают игровой экран: без своего
  // правила оно уехало бы в точку, которой в меню ничего не соответствует.
  assert(/#modeMenu \.leave-confirm--menu \.leave-confirm__box\s*\{[^}]*left:\s*230px[^}]*top:\s*400px/
    .test(styles),
    '7d: окно вопроса в меню не выровнено по центру кадра 460x800');
}

console.log('smoke-online-again-question: OK');
