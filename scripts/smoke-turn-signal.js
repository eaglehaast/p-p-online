#!/usr/bin/env node
'use strict';

// Smoke test: знак «чей ход» — только в онлайне, и стрелка показывает туда, куда нужно.
//
// За одним столом вопроса нет: обе морды на виду, видно, чья загорелась. По сети
// соперника не видно вовсе, и загоревшаяся морда читается как «моя». Человек тянется
// ходить, игра молчит, он решает, что не нажалось, и жмёт сильнее. Это и есть та жалоба,
// ради которой знак заведён.
//
// Проверяются три вещи, каждая ломается тихо:
//
//   1. Направление стрелки. Их четыре, а не два: стрелка показывает В ПОЛЕ и в сторону
//      ПОЛОВИНЫ того, чей ход, а поле лежит справа в портрете и снизу в горизонтали.
//      Ошибка здесь не роняет ничего — стрелка просто указывает не туда, и человек верит
//      ей, а не доске. Первая версия привязывала её к «моему ходу» и для синего игрока
//      показывала на половину соперника: в онлайне доска под место не разворачивается.
//
//   2. Только онлайн. Протечёт в хот-сит — и там появится «your turn», когда за одним
//      устройством сидят двое и оба «your».
//
//   3. Вспышка кончается. Знак меняется каждый ход; если он останется ярким навсегда или
//      начнёт мигать без остановки, выйдет ровно то, чего добивались не допустить.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');
const markup = fs.readFileSync('index.html', 'utf8');

function extractFunctionSource(text, name){
  const start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  const bodyStart = text.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции ${name}`);
}

// Разбор CSS: тело правила по его точному заголовку.
function ruleBody(css, selector){
  const at = css.indexOf(`\n${selector} {`);
  assert(at !== -1, `Не найдено правило: ${selector}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function declaration(body, name){
  const m = new RegExp(`(?:^|;|\\n)\\s*${name}\\s*:\\s*([^;\\n]+)`).exec(body);
  return m ? m[1].trim() : null;
}

// === 1. ГЛАВНОЕ: четыре направления стрелки ===
//
// Стрелка нарисована смотрящей вправо-вверх, всё остальное — поворот.
//
//          | где надпись | где поле | дальняя половина | ближняя половина
//   портрет| левый край  | справа   | вправо-вверх 0°  | вправо-вниз  90°
//   гориз. | верхний край| снизу    | вправо-вниз 90°  | влево-вниз  180°
{
  const основа = ruleBody(styles, '.turn-signal');
  const свой = ruleBody(styles, '.turn-signal.is-near');
  const гЧужой = ruleBody(styles, 'html.is-board-landscape .turn-signal.is-far');
  const гСвой = ruleBody(styles, 'html.is-board-landscape .turn-signal.is-near');

  assert(declaration(основа, '--arrow-turn') === '0deg',
    '1: в портрете на дальнюю половину стрелка повёрнута — она должна смотреть в поле '
    + 'вправо-вверх, как нарисована');
  assert(declaration(свой, '--arrow-turn') === '90deg',
    '1b: в портрете на ближнюю половину стрелка должна смотреть вправо-вниз (90°)');
  assert(declaration(гЧужой, '--arrow-turn') === '90deg',
    '1c: в горизонтали на дальнюю половину стрелка должна смотреть вправо-вниз (90°): '
    + 'поле снизу, дальняя половина справа');
  assert(declaration(гСвой, '--arrow-turn') === '180deg',
    '1d: в горизонтали на ближнюю половину стрелка должна смотреть влево-вниз (180°): '
    + 'поле снизу, ближняя половина слева');

  // Единственное «влево» уводит стрелку влево от слова: иначе она указывала бы прочь от
  // того места, где стоит.
  const xСтрелки = parseFloat(declaration(гСвой, '--arrow-x'));
  const xСлова = parseFloat(declaration(гСвой, '--turn-x'));
  assert(Number.isFinite(xСтрелки) && Number.isFinite(xСлова) && xСтрелки < xСлова,
    '1e: стрелка, смотрящая влево, стоит справа от слова — она показывает прочь от себя');

  // А в остальных трёх случаях — справа.
  assert(parseFloat(declaration(основа, '--arrow-x')) > parseFloat(declaration(основа, '--turn-x')),
    '1f: стрелка, смотрящая вправо, встала слева от слова');

  // В горизонтали кадр повёрнут целиком — надпись обязана отвернуться обратно, иначе
  // читается боком.
  assert(/rotate\(-90deg\)/.test(ruleBody(styles, 'html.is-board-landscape .turn-signal')),
    '1g: в горизонтали надпись не разворачивается обратно — ляжет боком');
}

// === 2. Высоты согласованы ===
//
// «YOUR»/«THEIR» — ради чего знак существует, они крупные. «TURN» — слово техническое, и
// оно мельче. Стрелка стоит с «TURN» в одной строке, и высота у них обязана совпадать:
// три разных высоты в трёх кусках читаются кашей, а не надписью.
{
  const слово = ruleBody(styles, '.turn-signal__turn');
  const стрелка = ruleBody(styles, '.turn-signal__arrow');
  const кто = ruleBody(styles, '.turn-signal__who');
  assert(declaration(слово, 'height') === declaration(стрелка, 'height'),
    `2: стрелка (${declaration(стрелка, 'height')}) не в высоту слова TURN `
    + `(${declaration(слово, 'height')}) — та самая каша`);
  assert(declaration(слово, 'top') === declaration(стрелка, 'top'),
    '2b: стрелка и TURN разъехались по вертикали — это одна строка');
  assert(parseFloat(declaration(кто, 'height')) > parseFloat(declaration(слово, 'height')),
    '2c: YOUR/THEIR перестало быть крупнее TURN — важное и техническое поменялись местами');
}

// === 3. Знак не лезет ни на поле, ни на счётчики ===
//
// Поле начинается с x=50, и залезать на него нельзя. Счётчики самолётов занимают
// y 97..384 и 416..703 — знак садится ровно в щель между ними, по центру.
{
  const основа = ruleBody(styles, '.turn-signal');
  const left = parseFloat(declaration(основа, 'left'));
  const top = parseFloat(declaration(основа, 'top'));
  const width = parseFloat(declaration(основа, 'width'));
  const height = parseFloat(declaration(основа, 'height'));

  assert(left + width <= 50,
    `3: знак доходит до x=${left + width} — поле начинается с 50, на него не лезем`);

  const счётчики = /planeCounters:\s*\{\s*blue:\s*\{ x: \d+, y: (\d+), width: \d+, height: (\d+) \}/
    .exec(source);
  assert(счётчики, '3a: не найдена раскладка счётчиков самолётов — проверять не с чем');
  const низСинего = Number(счётчики[1]) + Number(счётчики[2]);
  const зелёный = /green:\s*\{ x: \d+, y: (\d+),/.exec(source);
  const верхЗелёного = Number(зелёный[1]);
  const серединаЩели = (низСинего + верхЗелёного) / 2;

  assert(Math.abs((top + height / 2) - серединаЩели) <= 1,
    `3b: знак сидит на ${top + height / 2}, а щель между счётчиками — вокруг `
    + `${серединаЩели}: он съехал к одному из них`);
}

// === 4. Только в онлайне, и состояние берётся у настоящей функции ===
{
  const элемент = (вызовы) => ({
    hidden: false,
    className: '',
    classList: {
      toggle(имя, вкл){ вызовы.push(['toggle', имя, вкл]); },
      add(имя){ вызовы.push(['add', имя]); },
      remove(имя){ вызовы.push(['remove', имя]); },
    },
  });

  function стенд({ онлайн, партия, свой, видСместа = 'green' }){
    // Список живой, а не копия: функцию зовут уже после сборки стенда.
    const вызовы = [];
    const знак = элемент(вызовы);
    const sandbox = {
      Object, Boolean, String, console: { log: () => {}, warn: () => {} },
      setTimeout: () => 1, clearTimeout: () => {},
      HTMLElement: function HTMLElement(){},
      HTMLImageElement: function HTMLImageElement(){},
      turnSignal: знак,
      turnSignalWho: null,
      onlineSession: онлайн ? { seat: 'blue' } : null,
      gameMode: партия ? 'online' : null,
      isLocalColor: () => свой,
      getBoardViewSeat: () => видСместа,
    };
    // Знак обязан быть именно HTMLElement — иначе функция выйдет молча.
    Object.setPrototypeOf(знак, sandbox.HTMLElement.prototype);
    vm.createContext(sandbox);
    vm.runInContext([
      source.match(/const TURN_SIGNAL_FLASH_MS = \d+;/)[0],
      source.match(/const TURN_SIGNAL_WHO_SRC = Object\.freeze\(\{[\s\S]*?\}\);/)[0],
      'let turnSignalShown = null; let turnSignalFlashTimer = null;',
      extractFunctionSource(source, 'обновитьЗнакХода'),
      extractFunctionSource(source, 'вспыхнутьЗнакомХода'),
      'this.api = { обновитьЗнакХода, вспыхнутьЗнакомХода, знак: turnSignal };',
    ].join('\n'), sandbox);
    return { api: sandbox.api, знак, вызовы };
  }

  const хотсит = стенд({ онлайн: false, партия: true, свой: true });
  хотсит.api.обновитьЗнакХода('blue');
  assert(хотсит.знак.hidden === true,
    '4: знак показался вне онлайна — за одним устройством оба хода «твои», и «your turn» '
    + 'там врёт');

  const лобби = стенд({ онлайн: true, партия: false, свой: true });
  лобби.api.обновитьЗнакХода('blue');
  assert(лобби.знак.hidden === true, '4b: знак показался в лобби, где партии ещё нет');

  const меню = стенд({ онлайн: true, партия: true, свой: true });
  меню.api.обновитьЗнакХода(null);
  assert(меню.знак.hidden === true, '4c: без цвета хода знаку сообщать нечего');

  const мой = стенд({ онлайн: true, партия: true, свой: true });
  мой.api.обновитьЗнакХода('blue');
  assert(мой.знак.hidden === false, '4d: в онлайновой партии знак обязан быть виден');
  const свои = мой.вызовы.filter(([вид, имя]) => вид === 'toggle' && имя === 'is-your');
  assert(свои.length === 1 && свои[0][2] === true, '4e: на своём ходу не выставлен is-your');

  const чужой = стенд({ онлайн: true, партия: true, свой: false });
  чужой.api.обновитьЗнакХода('green');
  const их = чужой.вызовы.filter(([вид, имя]) => вид === 'toggle' && имя === 'is-their');
  assert(их.length === 1 && их[0][2] === true, '4f: на чужом ходу не выставлен is-their');

// === 4g. ГЛАВНОЕ ПРО СТРЕЛКУ: она про ПОЛОВИНУ, а не про «мой ход» ===
//
// В онлайне доска под место не разворачивается: у обоих зелёный внизу, синий сверху.
// Значит для синего игрока «мой ход» и «нижняя половина» — РАЗНЫЕ вещи.
//
// Первая версия привязала стрелку к isLocalColor, и на стенде вышло ровно то, чего не
// увидишь в коде: у хозяина светилось «YOUR TURN», а стрелка показывала на половину
// соперника. Стрелке верят больше, чем надписи, — она показывает, куда смотреть.

  // Синий игрок, доска показана со стороны зелёного (как оно в онлайне и есть).
  const синий = стенд({ онлайн: true, партия: true, свой: true, видСместа: 'green' });
  синий.api.обновитьЗнакХода('blue');            // ходит он сам, но его половина ВЕРХНЯЯ
  const близко = синий.вызовы.filter(([в, и]) => в === 'toggle' && и === 'is-near');
  const далеко = синий.вызовы.filter(([в, и]) => в === 'toggle' && и === 'is-far');
  assert(близко.length === 1 && близко[0][2] === false,
    '4g: на своём ходу стрелку послали на ближнюю половину, хотя своя половина у синего '
    + 'игрока — дальняя: стрелка покажет на соперника');
  assert(далеко.length === 1 && далеко[0][2] === true,
    '4g2: половина не помечена дальней');

  // И наоборот: ход соперника, но его половина — ближняя.
  const зелёныйХодит = стенд({ онлайн: true, партия: true, свой: false, видСместа: 'green' });
  зелёныйХодит.api.обновитьЗнакХода('green');
  const б2 = зелёныйХодит.вызовы.filter(([в, и]) => в === 'toggle' && и === 'is-near');
  assert(б2.length === 1 && б2[0][2] === true,
    '4g3: ход соперника на ближней половине, а стрелку послали на дальнюю');

  // Доказательство, что направление вообще спрашивают у доски, а не выводят из хода.
  assert(/getBoardViewSeat\(\)/.test(extractFunctionSource(source, 'обновитьЗнакХода')),
    '4g4: направление стрелки больше не спрашивают у доски — значит выводят из «моего '
    + 'хода», и для синего игрока оно врёт');
}

// === 5. Вспышка кончается ===
//
// Иначе знак либо навсегда останется ярким, либо замигает без остановки — то самое, от
// чего он и должен отличаться.
{
  const вспышка = extractFunctionSource(source, 'вспыхнутьЗнакомХода');
  assert(/classList\.add\("is-flash"\)/.test(вспышка), '5: вспышка ничего не включает');
  assert(/setTimeout\(/.test(вспышка) && /classList\.remove\("is-flash"\)/.test(вспышка),
    '5b: вспышка не гаснет — знак останется ярким навсегда');
  assert(/clearTimeout\(turnSignalFlashTimer\)/.test(вспышка),
    '5c: два подряд тыка оставят старый таймер, и вспышка погаснет раньше срока');
  assert(/const TURN_SIGNAL_FLASH_MS = \d+;/.test(source), '5d: пропал срок вспышки');

  // И никакого бесконечного мигания в стилях.
  const основа = ruleBody(styles, '.turn-signal');
  assert(!/animation/.test(основа) || !/infinite/.test(основа),
    '5e: знак мигает бесконечно — к мигающему нельзя привыкнуть, и он станет '
    + 'раздражителем, который к тому же ничего не сообщает');
  assert(parseFloat(declaration(основа, 'opacity')) < 1,
    '5f: в покое знак в полную силу — он меняется каждый ход и начнёт лезть в глаза');
  assert(declaration(ruleBody(styles, '.turn-signal.is-flash'), 'opacity') === '1',
    '5g: вспышка не доходит до полной силы — ответа на тык не видно');
}

// === 6. Тык не в свой ход получает ответ ===
//
// Ровно та жалоба, с которой всё началось: «светится рожа, пытаешься сходить» — и ничего.
{
  const начало = extractFunctionSource(source, 'handleStart');
  const кусок = начало.slice(начало.indexOf('if(!isLocalColor(currentColor))'));
  const тело = кусок.slice(0, кусок.indexOf('}') + 1);
  assert(/вспыхнутьЗнакомХода\(\)/.test(тело),
    '6: тык не в свой ход снова проглатывается молча — человек решит, что не нажалось, '
    + 'и будет жать сильнее');
}

// === 7. Разметка и картинки на месте ===
{
  // Ищем ОТДЕЛЬНЫЙ атрибут hidden, а не подстроку: рядом стоит aria-hidden, и первая
  // версия этой проверки радостно находила «hidden» внутри него. Проверка, которая не
  // может упасть, не проверяет ничего.
  const тег = /<div id="turnSignal"[^>]*>/.exec(markup);
  assert(тег, '7: в разметке нет знака «чей ход»');
  assert(/\shidden(\s|>)/.test(тег[0]),
    '7a: знак в разметке не спрятан — мелькнёт на запуске до первого хода');
  for(const класс of ['turn-signal__who', 'turn-signal__turn', 'turn-signal__arrow']){
    assert(markup.includes(класс), `7b: в разметке нет куска ${класс}`);
  }
  for(const файл of ['gs_turn_your.webp', 'gs_turn_their.webp',
                     'gs_turn_turn.webp', 'gs_turn_arrow.webp']){
    assert(fs.existsSync(`ui_gamescreen/gamescreen_outside/${файл}`),
      `7c: нет картинки ${файл}`);
  }
  // Обе надписи должны участвовать: подстановка по состоянию.
  const адреса = source.match(/const TURN_SIGNAL_WHO_SRC = Object\.freeze\(\{[\s\S]*?\}\);/)[0];
  assert(/gs_turn_your\.webp/.test(адреса) && /gs_turn_their\.webp/.test(адреса),
    '7d: знак перестал менять надпись — останется одна на оба состояния');
}

console.log('smoke-turn-signal: OK');
