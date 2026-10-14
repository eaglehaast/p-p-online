#!/usr/bin/env node
'use strict';

// Smoke test: из онлайновой партии есть выход, и он спрашивает.
//
// В игре за одним устройством и против компьютера из партии выводит простая
// перезагрузка страницы: она же возвращает в меню. В комнате перезагрузка теперь
// возвращает за ТОТ ЖЕ СТОЛ — своим же адресом, — и выйти иначе как правкой адреса
// руками стало нельзя. Особенно обидно это, когда соперник просто ушёл и ждать больше
// нечего.
//
// Отсюда крестик. Три вещи, каждая ломается по-своему:
//
//   1. Он есть ровно там, где нужен: в онлайновой партии, и больше нигде. В меню и в
//      лобби ему делать нечего, в игре против компьютера — тем более.
//   2. Он спрашивает. Нажатие посреди партии стоит слишком дорого, чтобы верить ему на
//      слово: промах по углу экрана рвал бы связь.
//   3. «Да» уводит НАСОВСЕМ: рвёт связь, забывает комнату и чистит адрес. Оставь он
//      комнату в адресе — перезагрузка вернула бы человека ровно туда, откуда он только
//      что ушёл.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const markup = fs.readFileSync('index.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

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

function правило(селектор){
  const i = styles.indexOf(`${селектор} {`);
  if(i === -1) return null;
  return styles.slice(i, styles.indexOf('}', i));
}

// Стенд: настоящие решения, поддельные узлы и последствия.
function стенд({ вКомнате = true, вПартии = true } = {}){
  const sandbox = {
    Object, Boolean, String,
    сделано: [],
    onlineSession: вКомнате ? { seat: 'blue', room: 'стол' } : null,
    onlinePresence: { blue: true, green: true },
    gameMode: вПартии ? 'online' : null,
    HTMLElement: function HTMLElement(){},
    stopOnlineSession: () => { sandbox.сделано.push('связь'); sandbox.onlineSession = null; return true; },
    forgetHostRoom: () => { sandbox.сделано.push('комната'); },
    resetGame: (о) => { sandbox.сделано.push(`меню:${JSON.stringify(о)}`); },
  };
  const узлы = {
    leaveMatchBtn: { hidden: true },
    leaveMatchConfirm: { hidden: true },
  };
  for(const узел of Object.values(узлы)) Object.setPrototypeOf(узел, sandbox.HTMLElement.prototype);
  sandbox.document = { getElementById: (id) => узлы[id] || null };

  vm.createContext(sandbox);
  vm.runInContext([
    extractFunctionSource(source, 'вОнлайновойПартии'),
    extractFunctionSource(source, 'syncLeaveMatchButton'),
    extractFunctionSource(source, 'показатьВопросОВыходе'),
    extractFunctionSource(source, 'спрятатьВопросОВыходе'),
    extractFunctionSource(source, 'уйтиИзОнлайновойПартии'),
    'this.api = {',
    '  показать: syncLeaveMatchButton, спросить: показатьВопросОВыходе,',
    '  забыть: спрятатьВопросОВыходе, уйти: уйтиИзОнлайновойПартии,',
    '};',
  ].join('\n'), sandbox);
  return { api: sandbox.api, узлы, стенд: sandbox };
}

// === 1. ГЛАВНОЕ: крестик есть только в онлайновой партии ===
{
  const вПартии = стенд({ вКомнате: true, вПартии: true });
  assert(вПартии.api.показать() === true, '1: в онлайновой партии выхода нет');
  assert(вПартии.узлы.leaveMatchBtn.hidden === false, '1b: кнопка осталась спрятанной');

  const вЛобби = стенд({ вКомнате: true, вПартии: false });
  assert(вЛобби.api.показать() === false,
    '1c: крестик висит в лобби — там для выхода есть «Cancel», и два выхода рядом только '
    + 'путают');
  assert(вЛобби.узлы.leaveMatchBtn.hidden === true, '1d: и он не спрятан');

  const сам = стенд({ вКомнате: false, вПартии: true });
  assert(сам.api.показать() === false,
    '1e: крестик висит в обычной партии — оттуда выводит перезагрузка, и лишняя кнопка '
    + 'на игровом экране ни к чему');

  const меню = стенд({ вКомнате: false, вПартии: false });
  assert(меню.api.показать() === false, '1f: крестик висит в меню');
}

// === 2. Пропал крестик — пропал и вопрос ===
//
// Иначе вопрос «уйти?» переживёт конец партии и повиснет поверх меню.
{
  const с = стенд({ вКомнате: true, вПартии: true });
  с.api.спросить();
  assert(с.узлы.leaveMatchConfirm.hidden === false, '2: вопрос не показался');
  с.стенд.gameMode = null;
  с.api.показать();
  assert(с.узлы.leaveMatchConfirm.hidden === true,
    '2b: партия кончилась, а вопрос «уйти?» остался висеть');
}

// === 3. Вопрос задают только там, где есть что бросать ===
{
  const меню = стенд({ вКомнате: false, вПартии: false });
  assert(меню.api.спросить() === false, '3: в меню спрашивают, уходить ли из партии');
  assert(меню.узлы.leaveMatchConfirm.hidden === true, '3b: и показывают вопрос');
}

// === 4. «Да» уводит насовсем ===
//
// Три последствия, и каждое нужно своё. Связь — чтобы соперник увидел, что мы ушли.
// Комната — чтобы прежняя ссылка умерла: иначе друг, открывший её завтра, молча сядет
// за стол, за которым нас нет. Меню — потому что уйти в никуда нельзя.
{
  const с = стенд({ вКомнате: true, вПартии: true });
  с.api.спросить();
  assert(с.api.уйти() === true, '4: выход не сработал');
  assert(с.стенд.сделано.includes('связь'), '4b: связь не разорвана — соперник так и ждёт хода');
  assert(с.стенд.сделано.includes('комната'),
    '4c: комната не забыта — прежняя ссылка переживёт выход и приведёт друга в пустоту');
  assert(с.стенд.сделано.some((д) => /^меню:/.test(д)), '4d: в меню не вернулись');
  assert(с.стенд.сделано.some((д) => /forceMenu":true/.test(д)),
    '4e: сброс не уводит в меню, а остаётся на игровом экране');
  assert(с.узлы.leaveMatchConfirm.hidden === true, '4f: вопрос остался висеть поверх меню');
  assert(с.стенд.onlinePresence === null, '4g: за столом по-прежнему кто-то числится');
}

// === 5. «Нет» не делает ничего ===
{
  const с = стенд({ вКомнате: true, вПартии: true });
  с.api.спросить();
  с.api.забыть();
  assert(с.узлы.leaveMatchConfirm.hidden === true, '5: вопрос не убрался');
  assert(с.стенд.сделано.length === 0,
    `5b: «нет» что-то натворило: ${JSON.stringify(с.стенд.сделано)}`);
  assert(с.стенд.onlineSession !== null, '5c: «нет» разорвало связь');
}

// === 6. Крестик, вопрос и ответы связаны в разметке ===
{
  assert(/id="leaveMatchBtn"[\s\S]{0,220}hidden/.test(markup),
    '6: кнопка выхода в разметке не спрятана — она мелькнёт на экранах, где не нужна');
  assert(/id="leaveMatchBtn"[\s\S]{0,220}aria-label="Leave the match"/.test(markup),
    '6b: у кнопки нет имени — читалка назовёт её «кнопка»');
  for(const id of ['leaveMatchConfirm', 'leaveConfirmYes', 'leaveConfirmNo']){
    assert(new RegExp(`id="${id}"`).test(markup), `6c: в разметке нет ${id}`);
  }
  assert(/id="leaveMatchConfirm"[\s\S]{0,200}role="dialog"/.test(markup),
    '6d: вопрос не объявлен диалогом');

  // Кнопки «да/нет» — те же, что в «Play again?»: другой пары в игре нет.
  assert(/leave-confirm__btn--yes \{[^}]*playagain\/yes\.webp/.test(styles)
    && /leave-confirm__btn--no \{[^}]*playagain\/no\.webp/.test(styles),
    '6e: у выхода завелись свои кнопки «да/нет» — в игре уже есть ровно одна такая пара');
}

// === 7. Нажатие ведёт к вопросу, а не к выходу ===
//
// Главная проверка про «спрашивает»: если крестик позовёт выход напрямую, промах по
// углу экрана оборвёт партию без единого слова.
{
  const кусок = source.slice(source.indexOf('const крестик = document.getElementById("leaveMatchBtn")'));
  const блок = кусок.slice(0, кусок.indexOf('// «Cancel»'));
  assert(/крестик\.addEventListener\("click", \(\) => \{ показатьВопросОВыходе\(\); \}\)/.test(блок),
    '7: крестик зовёт не вопрос');
  assert(!/крестик[\s\S]{0,120}уйтиИзОнлайновойПартии/.test(блок),
    '7b: крестик рвёт связь сразу, без вопроса');
  assert(/да\.addEventListener\("click", \(\) => \{ уйтиИзОнлайновойПартии\(\); \}\)/.test(блок),
    '7c: «да» не уводит из партии');
  assert(/нет\.addEventListener\("click", \(\) => \{ спрятатьВопросОВыходе\(\); \}\)/.test(блок),
    '7d: «нет» не убирает вопрос');
  assert(/Escape/.test(блок), '7e: от вопроса нельзя отказаться клавишей');
  assert(/leave-confirm__veil/.test(блок),
    '7f: нажатие мимо кнопок не закрывает вопрос — целиться в «нет» придётся точно');
}

// === 8. Экран сменился — крестик пересчитан ===
{
  const экран = extractFunctionSource(source, 'setScreenMode');
  assert(/syncLeaveMatchButton\(\)/.test(экран),
    '8: переключение экрана не трогает крестик — он переживёт выход в меню');
}

// === 9. Место: в телефоне справа сверху, на десктопе слева сверху ===
//
// Кадр в горизонтали повёрнут целиком, поэтому «тот же угол экрана» — это РАЗНЫЕ углы
// кадра. Верхний правый угол кадра (портрет) после поворота уезжает вниз-вправо, туда,
// где уже стоит кнопка поворота; поэтому в горизонтали крестик переезжает в тот угол
// кадра, который оказывается вверху слева экрана: малое x, большое y.
{
  const портрет = правило('.leave-match');
  assert(портрет, '9: у кнопки выхода нет места');
  const left = Number(/left:\s*([\d.]+)px/.exec(портрет)[1]);
  const top = Number(/top:\s*([\d.]+)px/.exec(портрет)[1]);
  assert(left > 380 && top < 90,
    `9b: в портрете крестик стоит в (${left}, ${top}) — а нужен верхний правый угол кадра`);

  const горизонт = правило('html.is-board-landscape .leave-match');
  assert(горизонт, '9c: в горизонтали крестик остаётся в том же углу КАДРА — на экране это '
    + 'нижний правый угол, где уже живёт кнопка поворота');
  const left2 = Number(/left:\s*([\d.]+)px/.exec(горизонт)[1]);
  const top2 = Number(/top:\s*([\d.]+)px/.exec(горизонт)[1]);
  assert(left2 < 90 && top2 > 700,
    `9d: в горизонтали крестик стоит в (${left2}, ${top2}) — а на экране это должен быть `
    + 'верхний левый угол, то есть малое x и большое y кадра');

  // Неприметный: это запасной выход, а не часть игры.
  const прозрачность = Number(/opacity:\s*([\d.]+)/.exec(портрет)[1]);
  assert(прозрачность > 0.3 && прозрачность < 0.8,
    `9e: прозрачность ${прозрачность} — крестик либо кричит, либо невидим`);
}

// === 10. Вопрос глушит нажатия по полю ===
//
// Иначе промах мимо кнопок уйдёт в доску и сделает ход — посреди вопроса «уходим ли».
{
  const занавес = правило('.leave-confirm__veil');
  assert(занавес && /inset:\s*0/.test(занавес),
    '10: занавес не накрывает кадр целиком — мимо вопроса можно сходить');
  const панель = правило('.leave-confirm');
  assert(панель && /z-index:\s*\d{3}/.test(панель), '10b: вопрос может оказаться под доской');
}

console.log('smoke-leave-match: OK');
