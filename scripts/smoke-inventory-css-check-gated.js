#!/usr/bin/env node
'use strict';

// Smoke test: самопроверка размеров инвентаря не работает у игрока.
//
// validateInventoryCssSizing сравнивает реальные размеры полосы инвентаря и её ячеек с
// числами в INVENTORY_UI_CONFIG. Чтобы измерить ячейку, она вставляет в DOM временный
// элемент и просит у браузера вычисленные стили — то есть заставляет пересчитать
// раскладку. Само по себе это нормально для инструмента разработки.
//
// Плохо было то, что звалась она из syncInventoryUI, то есть при каждой перерисовке
// инвентаря: несколько раз в секунду, всю партию, у каждого игрока. Замер до правки — 64
// срабатывания за шесть ходов по 0.475 мс; после — те же 60 вызовов по 0.005 мс, потому
// что функция сразу возвращается.
//
// И выключиться сама она не могла: флаг inventoryCssSizeWarningShown гасит её только
// ПОСЛЕ найденного расхождения. Пока всё в порядке — работает вечно.
//
// Расхождение в стилях статично: либо оно есть с первого кадра, либо его нет. Проверять
// это в цикле игры незачем.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Функция не найдена: ${fnName}`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Не найден конец функции: ${fnName}`);
}

const source = fs.readFileSync('script.js', 'utf8');

// === 1. По умолчанию выключена ===
{
  const match = /^const DEBUG_INVENTORY_CSS_CHECK = (\w+);/m.exec(source);
  assert(match, '1: флага самопроверки инвентаря нет — она снова работает без спроса');
  assert(match[1] === 'false',
    `1b: у игрока самопроверка выключена (сейчас ${match[1]})`);
}

// === 2. ГЛАВНОЕ: выход стоит ПЕРЕД дорогой работой ===
//
// Флаг, проверяемый после вставки элемента в DOM, не экономит ничего: расплата уже
// случилась. Поэтому проверяется не наличие флага, а его место.
{
  const fn = extractFunctionSource(source, 'validateInventoryCssSizing');
  const code = fn.replace(/\/\/.*$/gm, '');

  const guardAt = code.indexOf('if(!DEBUG_INVENTORY_CSS_CHECK) return;');
  assert(guardAt !== -1, '2: функция обязана выходить сразу, когда проверка выключена');

  for(const [name, needle] of [
    ['запрос вычисленных стилей', 'getComputedStyle('],
    ['вставка элемента в DOM', 'appendChild('],
    ['создание элемента', "createElement("],
  ]){
    const at = code.indexOf(needle);
    assert(at === -1 || guardAt < at,
      `2b: «${name}» обязано идти ПОСЛЕ выхода по флагу, иначе выключение ничего не экономит`);
  }

  // Выход должен быть самым первым делом функции — раньше любых других проверок.
  const firstStatement = code.slice(code.indexOf('{') + 1).trim();
  assert(firstStatement.startsWith('if(!DEBUG_INVENTORY_CSS_CHECK) return;'),
    '2c: выход по флагу — первая строка тела, а не где-то в середине');
}

// === 3. Проверка всё ещё умеет проверять ===
//
// Выключенная — не значит выпотрошенная. Если однажды флаг поднимут, функция должна
// делать то, ради чего написана, а не быть пустой оболочкой.
{
  const fn = extractFunctionSource(source, 'validateInventoryCssSizing');
  assert(/INVENTORY_UI_CONFIG\.containerSize/.test(fn) && /INVENTORY_UI_CONFIG\.slotSize/.test(fn),
    '3: под флагом по-прежнему сравниваются размеры полосы и ячейки');
  assert(/console\.warn\("\[inventory\] Container CSS size mismatch"/.test(fn)
      && /console\.warn\("\[inventory\] Slot CSS size mismatch"/.test(fn),
    '3b: и она по-прежнему умеет пожаловаться на расхождение');
}

// === 4. Зовут её оттуда же, откуда звали ===
//
// Если вызов уберут совсем, пункты выше станут охраной мёртвого кода: включить флаг будет
// некому и незачем.
{
  const sync = extractFunctionSource(source, 'syncInventoryUI');
  assert(/validateInventoryCssSizing\(host\);/.test(sync),
    '4: вызов остался на месте — под флагом инструментом можно воспользоваться');
}

console.log('smoke-inventory-css-check-gated: OK');
