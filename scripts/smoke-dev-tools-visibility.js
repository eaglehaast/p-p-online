#!/usr/bin/env node
'use strict';

// Smoke test: Map Tester и Map Editor прячутся от игрока.
//
// Это инструменты разработки, в меню им делать нечего. Показывает их консольная команда
// devToolsOn(), выбор запоминается между перезагрузками.
//
// Главное, что здесь проверяется, — не «кнопки спрятаны», а отсутствие тупика: если
// спрятать кнопки, пока игрок уже в режиме редактора, вернуться в обычную игру будет
// нечем. Поэтому пряча их, из такого режима надо выходить.

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
const styles = fs.readFileSync('styles.css', 'utf8');
const markup = fs.readFileSync('index.html', 'utf8');

const ROOT_CLASS = source.match(/const DEV_TOOLS_ROOT_CLASS = "([^"]+)";/)?.[1];
const STORAGE_KEY = source.match(/const DEV_TOOLS_STORAGE_KEY = "([^"]+)";/)?.[1];
assert(ROOT_CLASS && STORAGE_KEY, '0: класс и ключ хранения заданы константами');

// === 1. Обе кнопки помечены общим классом — иначе прятать пришлось бы поимённо ===
{
  for(const id of ['mapTesterBtn', 'editorBtn']){
    const tag = markup.match(new RegExp(`<button id="${id}"[^>]*>`))?.[0];
    assert(tag, `1: кнопка ${id} есть в разметке`);
    assert(/mode-menu__btn--editor/.test(tag),
      `1b: у ${id} есть общий класс инструментов разработки`);
  }
}

// === 2. По умолчанию спрятаны, показываются только под классом на корне ===
{
  const hidden = styles.match(/#menuLayer #modeMenu \.mode-menu__btn--editor \{\s*display: none;\s*\}/);
  assert(hidden, '2: по умолчанию кнопки инструментов спрятаны');

  const shown = new RegExp(
    `html\\.${ROOT_CLASS} #menuLayer #modeMenu \\.mode-menu__btn--editor \\{\\s*display: [^;]+;\\s*\\}`
  );
  assert(shown.test(styles),
    `2b: показываются под классом «${ROOT_CLASS}» на корне документа`);

  // Правило-показ обязано стоять ПОСЛЕ правила-пряталки: тот же вес селектора решается
  // порядком, иначе display:none перебьёт показ.
  assert(styles.indexOf('display: none') < styles.search(shown) ||
         styles.search(shown) > styles.indexOf(hidden[0]),
    '2c: правило показа идёт после правила по умолчанию');
}

// === 3. Три команды в консоли, в том же стиле, что отладочный лог ИИ ===
{
  for(const [fn, expect] of [['devToolsOn', /setDevToolsVisible\(true\)/],
                             ['devToolsOff', /setDevToolsVisible\(false\)/],
                             ['devToolsStatus', /isDevToolsVisible\(\)/]]){
    const assigned = new RegExp(`window\\.${fn} = function\\(\\)\\{[\\s\\S]{0,400}?\\};`);
    const body = source.match(assigned)?.[0];
    assert(body, `3: команда ${fn}() объявлена`);
    assert(expect.test(body), `3b: ${fn}() делает то, что обещает именем`);
    assert(/return "/.test(body) || /return isDevToolsVisible/.test(body),
      `3c: ${fn}() возвращает понятный ответ в консоль`);
  }
}

// === 4. Выбор переживает перезагрузку ===
{
  const setter = extractFunctionSource(source, 'setDevToolsVisible');
  assert(new RegExp(`setStoredSetting\\(DEV_TOOLS_STORAGE_KEY`).test(setter),
    '4: выбор сохраняется, иначе команду пришлось бы вводить после каждой перезагрузки');
  const getter = extractFunctionSource(source, 'isDevToolsVisible');
  assert(/getStoredSetting\(DEV_TOOLS_STORAGE_KEY\) === "true"/.test(getter),
    '4b: по умолчанию (ничего не сохранено) кнопок нет');

  // И применяется на старте, уже после загрузки настроек.
  const loadAt = source.indexOf('\nloadSettings();');
  const applyAt = source.indexOf('\napplyDevToolsVisibility();');
  assert(loadAt !== -1 && applyAt !== -1 && loadAt < applyAt,
    '4c: видимость применяется на старте и после loadSettings');
}

// === 5. Главное: спрятать кнопки — не значит запереть игрока в редакторе ===
{
  const run = (ruleset, stored) => {
    const calls = [];
    const sandbox = {
      selectedRuleset: ruleset,
      getStoredSetting: () => stored,
      loadSettingsForRuleset: (next) => calls.push(['loadSettingsForRuleset', next]),
      syncRulesButtonSkins: (next) => calls.push(['syncRulesButtonSkins', next]),
      document: { documentElement: { classList: { toggle: (name, on) => calls.push(['class', name, on]) } } },
    };
    vm.createContext(sandbox);
    vm.runInContext([
      source.match(/const DEV_TOOLS_STORAGE_KEY = "[^"]+";/)[0],
      source.match(/const DEV_TOOLS_ROOT_CLASS = "[^"]+";/)[0],
      source.match(/const DEV_TOOLS_RULESETS = Object\.freeze\(\[[^\]]*\]\);/)[0],
      extractFunctionSource(source, 'isDevToolsVisible'),
      extractFunctionSource(source, 'applyDevToolsVisibility'),
      'this.visible = applyDevToolsVisibility(); this.ruleset = selectedRuleset;',
    ].join('\n'), sandbox);
    return { ...sandbox, calls };
  };

  // Прячем, а игрок в редакторе — обязаны вернуть его в обычную игру.
  for(const ruleset of ['mapeditor', 'maptester']){
    const out = run(ruleset, 'false');
    assert(out.ruleset === 'classic',
      `5: пряча кнопки, из «${ruleset}» выходим в classic (сейчас «${out.ruleset}») — иначе вернуться нечем`);
    assert(out.calls.some(([name, arg]) => name === 'loadSettingsForRuleset' && arg === 'classic'),
      `5b: настройки перечитываются под новый режим`);
    assert(out.calls.some(([name]) => name === 'syncRulesButtonSkins'),
      `5c: подсветка кнопок пересчитывается`);
  }

  // Обычный режим не трогаем.
  const untouched = run('advanced', 'false');
  assert(untouched.ruleset === 'advanced',
    '5d: обычный режим пряталка не переключает');

  // Кнопки показаны — из редактора никого не выкидываем.
  const shown = run('mapeditor', 'true');
  assert(shown.visible === true && shown.ruleset === 'mapeditor',
    '5e: когда кнопки показаны, режим редактора остаётся');
  assert(shown.calls.some(([name, cls, on]) => name === 'class' && cls === ROOT_CLASS && on === true),
    '5f: класс вешается на корень документа');
}

console.log('Smoke test passed: инструменты разработки спрятаны по умолчанию, показываются командой devToolsOn(), выбор переживает перезагрузку, а пряча их, игрок не остаётся запертым в редакторе.');
