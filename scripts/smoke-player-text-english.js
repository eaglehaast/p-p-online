#!/usr/bin/env node
'use strict';

// Smoke test: всё, что игра говорит ИГРОКУ, написано по-английски.
//
// Игра англоязычная, но текст в ней копился годами и по-русски тоже. Часть его игрок
// видит: заставка, подписи в настройках, «Игра окончена. Ничья.» на канвасе — прямо рядом
// с английскими надписями на том же экране.
//
// Граница проходит не по файлам, а по тому, кто это читает:
//
//   * Игрок — разметка меню и панели настроек, текст на канвасе, извещения на экране.
//     Здесь русского быть не должно.
//   * Мы — комментарии, console.*, редактор карт и Map Tester. Последние два в меню не
//     показываются, пока в консоли не позовут devToolsOn(), то есть игроку недоступны.
//     Там русский остаётся, и трогать его незачем.
//
// Проверяется именно эта граница. Тест намеренно не смотрит на script.js целиком: там
// тысячи строк русских комментариев и отчётов по ИИ, и «нет кириллицы» было бы враньём.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const CYRILLIC = /[Ѐ-ӿ]/;

const markup = fs.readFileSync('index.html', 'utf8');
const source = fs.readFileSync('script.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

// === 1. Разметка: что видно игроку и что читает ему экранный диктор ===
//
// Кроме редактора карт и Map Tester: их не показывают, пока не позовут devToolsOn().
{
  const DEV_ONLY = /map-editor|map-tester|mapEditor|mapTester/;

  const withoutComments = markup.replace(/<!--[\s\S]*?-->/g, '');
  const lines = withoutComments.split('\n');

  // Разметка вложенная, а dev-признак стоит на внешнем элементе, поэтому смотрим окно из
  // нескольких строк вокруг: диалог сохранения карты объявлен выше своих полей.
  const isDevOnly = (index) => lines
    .slice(Math.max(0, index - 12), index + 1)
    .some((line) => DEV_ONLY.test(line));

  let checkedAttributes = 0;
  let checkedTexts = 0;

  lines.forEach((line, index) => {
    if(isDevOnly(index)) return;
    // Сообщения в консоль сюда попадают из onerror="console.warn(...)" — они наши.
    const withoutConsole = line.replace(/console\.\w+\([^)]*\)/g, '');

    for(const match of withoutConsole.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*)"/g)){
      checkedAttributes += 1;
      assert(!CYRILLIC.test(match[1]),
        `1: подпись «${match[1]}» по-русски (строка ${index + 1}) — её читает игроку диктор`);
    }
    for(const chunk of withoutConsole.split(/<[^>]*>/)){
      const text = chunk.trim();
      if(!text) continue;
      checkedTexts += 1;
      assert(!CYRILLIC.test(text),
        `1b: на экране написано по-русски: «${text.slice(0, 60)}» (строка ${index + 1})`);
    }
  });

  assert(checkedAttributes > 40 && checkedTexts > 20,
    `1c: разметку читаем целиком (подписей ${checkedAttributes}, текстов ${checkedTexts}) — иначе тест ослеп`);
}

// === 2. Текст на канвасе в конце матча ===
//
// Исходы рисуются рядом и одним шрифтом, поэтому русский среди них особенно заметен:
// именно так «Игра окончена. Ничья.» и стояла рядом с английскими строками.
//
// Раньше блок начинался с «No one survived.» — надписи ядерного удара. Механику удалили
// целиком (она была недостижима: выйти из idle можно было только в dragging, а такого
// вызова в коде не было), вместе с ней ушла и надпись. Якорь теперь — само условие
// показа блока.
{
  const start = source.indexOf('if(isGameOver && (shouldDrawWinnerRoundMessage || isDrawGame)){');
  assert(start > 0, '2: конец матча не найден в script.js');
  const endText = source.slice(start, source.indexOf('endTextCtx.restore();', start));

  for(const match of endText.matchAll(/"([^"\\]*)"/g)){
    assert(!CYRILLIC.test(match[1]),
      `2b: в конце матча по-русски: «${match[1]}» — рядом с ним английские строки`);
  }
  assert(/draw/i.test(endText),
    '2c: текст конца матча прочитан — ничья на месте');
}

// === 3. Извещения, которые всплывают поверх игры ===
//
// Их показывает showAiLaunchNotice, дописывая текст прямо в элемент на экране. Всплывают
// они в обычной партии против компьютера, когда ход ИИ подвис, — то есть у игрока.
{
  const start = source.indexOf('function showAiLaunchStallNotice(');
  assert(start !== -1, '3: извещение о зависшем ходе не найдено');
  const fn = source.slice(start, source.indexOf('\n}\n', start));
  for(const match of fn.matchAll(/"([^"\\]*)"/g)){
    assert(!CYRILLIC.test(match[1]), `3b: извещение игроку по-русски: «${match[1]}»`);
  }
  assert(/paused|delayed/i.test(fn), '3c: текст извещения прочитан');
}

// === 4. Редактор и Map Tester действительно спрятаны ===
//
// На этом держатся все исключения выше. Если кнопки однажды покажут игроку по умолчанию,
// русский из редактора станет виден — и тест обязан сломаться первым.
{
  assert(/#menuLayer #modeMenu \.mode-menu__btn--editor \{\s*display: none;/.test(styles),
    '4: кнопки редактора и Map Tester скрыты по умолчанию');
  assert(/html\.dev-tools-on #menuLayer #modeMenu \.mode-menu__btn--editor \{\s*display: inline-flex;/
    .test(styles), '4b: показывает их только класс от devToolsOn()');
  assert(/function devToolsOn\(|devToolsOn\s*=/.test(source) || /dev-tools-on/.test(source),
    '4c: класс вешает код, а не разметка');
}

console.log('smoke-player-text-english: OK');
