#!/usr/bin/env node
'use strict';

// Smoke test: плашка в начале раунда говорит, ЧЕЙ ход, в тех словах, которые здесь верны.
//
// Плашка была и до этого: «ROUND 1» и «GREEN TURN». За одним устройством это единственный
// возможный ответ — оба игрока тут, и сказать «твой» нельзя, непонятно кому. По сети всё
// наоборот: цвет сам по себе не говорит ничего, пока не знаешь, какой из них твой.
//
// Это и была жалоба, с которой начался весь разговор про онлайн: «неочевидно даже мне, что
// ходит оппонент — светится рожа, пытаешься сходить».
//
// Слова здесь те же, что у знака в углах экрана, и это не совпадение: одно и то же
// состояние обязано называться одинаково, иначе игрок сверяет два разных языка.
//
// Плюс самолёты по обе стороны надписи — игровые, те самые, которыми играют. Рисовать для
// плашки отдельный значок стороны незачем: цвет читается быстрее слова, а узнавание
// достаётся даром.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

function extractFunctionSource(text, name){
  const start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  // Тело ищем ПОСЛЕ списка параметров, а не по первой же скобке: у showTransferFrame
  // параметр со значением по умолчанию — options = {}, и наивный поиск принимал эти
  // пустые скобки за всё тело функции. Проверка при этом не падала, а тихо не находила
  // ничего: «самолётов у надписи нет» на коде, где они есть.
  let глубина = 0;
  let i = text.indexOf('(', start);
  for(; i < text.length; i += 1){
    if(text[i] === '(') глубина += 1;
    if(text[i] === ')'){ глубина -= 1; if(глубина === 0) break; }
  }
  const bodyStart = text.indexOf('{', i);
  let depth = 0;
  for(let i = bodyStart; i < text.length; i += 1){
    if(text[i] === '{') depth += 1;
    if(text[i] === '}') depth -= 1;
    if(depth === 0) return text.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции ${name}`);
}

function ruleBody(css, selector){
  const at = css.indexOf(`\n  ${selector} {`);
  assert(at !== -1, `Не найдено правило: ${selector}`);
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

function declaration(body, name){
  const m = new RegExp(`(?:^|;|\\n)\\s*${name}\\s*:\\s*([^;\\n]+)`).exec(body);
  return m ? m[1].trim() : null;
}

// Стенд: настоящая функция слов, поддельное окружение.
function слова({ онлайн, свой }){
  const sandbox = {
    onlineSession: онлайн ? { seat: 'blue' } : null,
    isLocalColor: () => свой,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFunctionSource(source, 'buildTransferTurnOwnerText'),
    'this.api = buildTransferTurnOwnerText;',
  ].join('\n'), sandbox);
  return sandbox.api;
}

// === 1. ГЛАВНОЕ: по сети — «твой/их», за одним устройством — по цвету ===
{
  const сеть = слова({ онлайн: true, свой: true });
  assert(сеть('green') === 'YOUR TURN',
    '1: по сети на своём ходу плашка называет цвет — а игрок не знает, какой цвет его');

  const сетьЧужой = слова({ онлайн: true, свой: false });
  assert(сетьЧужой('blue') === 'THEIR TURN',
    '1b: по сети на чужом ходу плашка не говорит, что ход не твой');

  const стол = слова({ онлайн: false, свой: true });
  assert(стол('green') === 'GREEN TURN',
    '1c: за одним устройством плашка сказала «твой» — тут двое, и непонятно, кому это');
  assert(стол('blue') === 'BLUE TURN', '1d: синему цвету за столом досталось не его слово');

  // Слова ровно те же, что у знака в углах: одно состояние — одно название.
  const знак = source.match(/const TURN_SIGNAL_WHO_SRC = Object\.freeze\(\{[\s\S]*?\}\);/)[0];
  assert(/gs_turn_your\.webp/.test(знак) && /gs_turn_their\.webp/.test(знак),
    '1e: знак в углах больше не про your/their — плашка и знак начнут называть одно и то '
    + 'же разными словами');
}

// === 2. Плашка зовёт эти слова, а не собирает свои ===
{
  const тексты = extractFunctionSource(source, 'buildTransferTurnTexts');
  assert(/buildTransferTurnOwnerText\(player\)/.test(тексты),
    '2: плашка снова собирает нижнюю строку сама — в онлайне она опять скажет цвет');
  assert(/ROUND \$\{safeRound\}/.test(тексты), '2b: пропал номер раунда');
}

// === 3. Самолёты по обе стороны надписи ===
{
  const показ = extractFunctionSource(source, 'showTransferFrame');
  // Порядок именно ПРИСТАВЛЕНИЯ к надписи, а не порядок упоминания в коде: класс метки
  // объявляется выше, и наивное сравнение по первому вхождению врало бы.
  const слева = показ.indexOf('appendChild(\n      buildTransferTurnPlane(player, "transfer-turn-plane--left")');
  const метка = показ.indexOf('appendChild(планка)');
  const справа = показ.indexOf('appendChild(\n      buildTransferTurnPlane(player, "transfer-turn-plane--right")');
  assert(слева !== -1 && справа !== -1, '3: самолётов у надписи нет');
  assert(слева < метка && метка < справа,
    '3b: самолёты приставлены не по обе стороны надписи, а оба с одной');

  const самолёт = extractFunctionSource(source, 'buildTransferTurnPlane');
  assert(/PLANE_ASSET_PATHS\[/.test(самолёт),
    '3c: самолёт на плашке больше не игровой — значит для неё завели отдельную картинку, '
    + 'а узнавание было даром');
  assert(/player === "green" \? "green" : "blue"/.test(самолёт),
    '3d: цвет самолёта не привязан к стороне, чей ход');

  // Смотрят внутрь, на надпись: спрайт нарисован носом вверх.
  assert(/rotate\(90deg\)/.test(ruleBody(styles, '.transfer-turn-plane--left')),
    '3e: левый самолёт не развёрнут к надписи');
  assert(/rotate\(-90deg\)/.test(ruleBody(styles, '.transfer-turn-plane--right')),
    '3f: правый самолёт не развёрнут к надписи — они будут смотреть в одну сторону');

  // Размер в em: надпись сама тянется между 32 и 39 точками, и самолёт, заданный числом,
  // разъехался бы с ней на одном из концов.
  const высота = declaration(ruleBody(styles, '.transfer-turn-plane'), 'height');
  assert(/em$/.test(высота || ''),
    `3g: высота самолёта «${высота}» задана не в em — он разъедется с надписью, когда та `
    + 'сожмётся на узком экране');
}

// === 4. Надпись с самолётами помещается в плашку ===
//
// Кегль надписи считается от ширины ОКНА, а плашка — от кадра. На большом экране буквы
// растут, а доска нет, и самолёты уехали за её края: замер на 1440 показал «GREEN TURN»
// шириной 486 точек из 554 доступных, самолёты по 81 — на 34 точки за край с каждой
// стороны. На телефоне этого не было видно вовсе: там буквы относительно плашки мельче.
//
// Проверить ширину буквами отсюда нельзя — нужен браузер со шрифтом. Поэтому заперты
// числа, при которых замер сошёлся: на 30px надпись заняла 374 из 554, самолёты встали
// внутрь с запасом в 40 точек.
{
  const низ = ruleBody(styles, '.transfer-frame-text--turn-bottom');
  const кегль = /clamp\(\s*(\d+)px\s*,[^,]+,\s*(\d+)px\s*\)/.exec(declaration(низ, 'font-size'));
  assert(кегль, '4: кегль нижней строки задан не через clamp — замер ниже ни о чём');
  assert(Number(кегль[2]) <= 30,
    `4b: потолок кегля ${кегль[2]}px — при нём самолёты не влезают в плашку на десктопе `
    + '(замеряно на 1440: при 39px они уходили за край на 34 точки)');

  const высота = /([\d.]+)em/.exec(declaration(ruleBody(styles, '.transfer-turn-plane'), 'height'));
  assert(высота && Number(высота[1]) <= 1.2,
    `4c: самолёт высотой ${высота?.[1]}em — вместе с надписью он снова перестанет влезать`);
}

// === 5. Плашку успевают прочитать ===
//
// За полторы секунды надо успеть: заметить, перевести взгляд, прочитать номер раунда и
// чью очередь, и понять, твоя ли она. В первый раз это чтение, а не узнавание знакомого
// пятна.
{
  const срок = /const TRANSFER_FRAME_TURN_AUTO_HIDE_MS = (\d+);/.exec(source);
  assert(срок, '5: пропал срок показа плашки');
  assert(Number(срок[1]) >= 2200,
    `5b: плашка висит ${срок[1]} мс — её не успевают прочитать`);
  assert(Number(срок[1]) <= 5000,
    `5c: плашка висит ${срок[1]} мс — это уже не сообщение, а задержка перед игрой`);
}

// === 6. Победная надпись не тронута ===
//
// Она живёт в своём слое и говорит про цвет по праву: «GREEN WINS THE ROUND» — это про
// сторону, а не про то, чей сейчас ход.
{
  const победа = extractFunctionSource(source, 'buildTransferWinnerText');
  assert(/WINS/.test(победа) && !/YOUR/.test(победа),
    '6: победную надпись перевели на «твой/их» — она про сторону, а не про ход');
}

console.log('smoke-transfer-plate: OK');
