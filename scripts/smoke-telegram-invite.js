#!/usr/bin/env node
'use strict';

// Smoke test: приглашение внутри телеграма.
//
// Снаружи «Send link» отдаёт ссылку на страницу игры, и это правильно. Внутри телеграма
// та же ссылка плоха дважды, и обе беды тихие.
//
// Её нечем послать. Системная шторка «поделиться» в телеграмном вебвью показывает что
// угодно, кроме самого телеграма: поймано на живом айфоне — в iMessage ссылка уезжает, в
// телеграм нет, а шторка при этом отвечает «готово». То есть человек уверен, что позвал
// друга, и ждёт; друг не получал ничего.
//
// И её плохо открывать. Присланную в переписку ссылку телеграм открывает своим внутренним
// браузером: отдельное окно со своей памятью, без мини-приложения и его повадок. Друг
// оказывается не в той игре, в которую его звали.
//
// Поэтому внутри телеграма зовут ссылкой на мини-приложение (t.me/бот/play?startapp=...)
// и посылают её выбором чата самого телеграма. Проверяется здесь пять вещей:
//
//   1. Внутри телеграма ссылка ботовая, снаружи — прежняя. Перепутать их местами значит
//      сломать ровно тот случай, который сейчас работает.
//   2. Что хозяин вписал, то гость и прочтёт: комната та же, место — свободное.
//   3. Приглашение читается из адреса, а не только из моста: мост приезжает отдельным
//      скриптом, а место за столом занимается сразу при запуске.
//   4. Посылает телеграм, а не шторка.
//   5. Вышли из-за стола — приглашение из хвоста адреса вычёркивается, иначе перезагрузка
//      усадит обратно. И вычёркивается хирургически: рядом едет подписанный initData.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');

function extractFunctionSource(text, name){
  let start = text.indexOf(`function ${name}(`);
  if(start === -1) throw new Error(`Не найдена функция ${name}`);
  if(text.slice(start - 6, start) === 'async ') start -= 6;
  const bodyStart = text.indexOf('{', text.indexOf(')', start));
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

const ОБЩЕЕ = [
  source.match(/const ONLINE_SEAT_COLORS = Object\.freeze\(\[[^\]]*\]\);/)[0],
  source.match(/const ONLINE_ROOM_MAX_LENGTH = \d+;/)[0],
  source.match(/const ONLINE_RELAY_URL = "[^"]*";/)[0],
  source.match(/const ONLINE_RELAY_ALLOWED_HOSTS = Object\.freeze\(\[[^\]]*\]\);/)[0],
  source.match(/const ONLINE_STATIC_PAGE_HOSTS = Object\.freeze\(\[[^\]]*\]\);/)[0],
  source.match(/const TELEGRAM_MINI_APP_LINK = "[^"]*";/)[0],
  source.match(/const TELEGRAM_START_PARAM_PATTERN = [^;]*;/)[0],
  extractFunctionSource(source, 'мостТелеграма'),
  extractFunctionSource(source, 'похожеНаТелеграм'),
  extractFunctionSource(source, 'телеграмноеПриглашение'),
  extractFunctionSource(source, 'разобратьТелеграмноеПриглашение'),
  extractFunctionSource(source, 'стартовыйПараметрТелеграма'),
  extractFunctionSource(source, 'очиститьХвостОтТелеграма'),
  extractFunctionSource(source, 'resolveOnlineRelayAddress'),
  extractFunctionSource(source, 'getRelayHost'),
  extractFunctionSource(source, 'isLocalPageOrigin'),
  extractFunctionSource(source, 'isRelayAddressAllowed'),
  extractFunctionSource(source, 'isStaticPageHost'),
  extractFunctionSource(source, 'resolveRelayFromLink'),
  extractFunctionSource(source, 'местоИзТелеграма'),
  extractFunctionSource(source, 'buildOnlineInviteLink'),
];

// Стенд: настоящие решения, поддельные телеграм и страница.
//
// Игра тут лежит на github.io — то есть ровно там, откуда она и открывается телеграмом.
function стенд({ хвост = '', поиск = '', мост = true, умеетСсылки = true,
  стартИзМоста = null, room = 'abc123', seat = 'blue', сессия = true } = {}){
  const открыто = [];
  const sandbox = {
    Object, Array, String, Boolean, URLSearchParams, URL,
    console: { log: () => {}, warn: () => {} },
    открыто,
    onlineSession: сессия ? { seat, room } : null,
    window: {
      location: {
        origin: 'https://eaglehaast.github.io', pathname: '/p-p-online/',
        protocol: 'https:', host: 'eaglehaast.github.io', hostname: 'eaglehaast.github.io',
        search: поиск, hash: хвост,
      },
      Telegram: мост ? { WebApp: {
        initDataUnsafe: стартИзМоста === null ? {} : { start_param: стартИзМоста },
        ...(умеетСсылки
          ? { openTelegramLink(адрес){ открыто.push(адрес); } }
          : {}),
      } } : undefined,
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([
    ...ОБЩЕЕ,
    'this.api = { buildOnlineInviteLink, местоИзТелеграма, похожеНаТелеграм,',
    '  телеграмноеПриглашение, разобратьТелеграмноеПриглашение,',
    '  стартовыйПараметрТелеграма, очиститьХвостОтТелеграма };',
  ].join('\n'), sandbox);
  return { api: sandbox.api, открыто };
}

// Хвост, каким его дописывает телеграм. «%2A» внутри — не причуда: именно такие байты и
// показывают, переписали хвост или только вычеркнули из него своё. URLSearchParams,
// разобрав и собрав его обратно, превратит «%2A» в «*».
const ХВОСТ_ТЕЛЕГРАМА = '#tgWebAppData=query_id%3DAAH%2Abc%26user%3D%257B%2522id%2522%253A1%257D'
  + '&tgWebAppVersion=7.10&tgWebAppPlatform=ios';

(async () => {

// === 1. ГЛАВНОЕ: внутри телеграма ссылка ведёт в мини-приложение ===
{
  const вТелеграме = стенд({ хвост: ХВОСТ_ТЕЛЕГРАМА, room: 'abc123', seat: 'blue' });
  const ссылка = вТелеграме.api.buildOnlineInviteLink();
  assert(/^https:\/\/t\.me\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+\?startapp=/.test(ссылка),
    `1: из телеграма зовут ссылкой «${ссылка}» — её телеграм откроет своим внутренним `
    + 'браузером, то есть не мини-приложением, в которое звали');
  assert(ссылка.includes('startapp=abc123_green'),
    `1b: в приглашении не та комната или не то место («${ссылка}»): друга зовут на `
    + 'свободное место за тем же столом');
  assert(!ссылка.includes('github.io'),
    `1c: ботовая ссылка всё ещё тащит адрес страницы («${ссылка}»)`);

  // А снаружи — ровно то, что было: ссылка на саму страницу.
  const вБраузере = стенд({ room: 'abc123', seat: 'blue' });
  const обычная = вБраузере.api.buildOnlineInviteLink();
  assert(обычная.startsWith('https://eaglehaast.github.io/p-p-online/?')
    && /room=abc123/.test(обычная) && /seat=green/.test(обычная),
    `1d: в обычном браузере ссылка стала телеграмной («${обычная}») — открыть её смогут `
    + 'только те, у кого есть телеграм');
  assert(вБраузере.api.похожеНаТелеграм() === false, '1e: обычный браузер принят за телеграм');
}

// === 2. Что хозяин вписал, то гость и прочтёт ===
//
// Обе стороны одной строки — отдельные функции, и разъехаться они могут молча: комната
// окажется другой, и оба будут ждать каждый за своим столом.
{
  for(const [свой, свободное] of [['blue', 'green'], ['green', 'blue']]){
    const хозяин = стенд({ хвост: ХВОСТ_ТЕЛЕГРАМА, room: 'zz9x7q', seat: свой });
    const ссылка = хозяин.api.buildOnlineInviteLink();
    const старт = new URL(ссылка).searchParams.get('startapp');

    const гость = стенд({ хвост: `#tgWebAppStartParam=${старт}&tgWebAppVersion=7.10` });
    const место = гость.api.местоИзТелеграма();
    assert(место, `2: гость не разобрал приглашение «${старт}» — сядет не за тот стол, а в меню`);
    assert(место.room === 'zz9x7q',
      `2b: гость прочёл комнату «${место.room}» вместо «zz9x7q»`);
    assert(место.seat === свободное,
      `2c: хозяин сидит на ${свой}, а гостя посадили на «${место.seat}» — комната откажет `
      + 'ему «место занято»');
    assert(место.relay === source.match(/const ONLINE_RELAY_URL = "([^"]*)";/)[1],
      `2d: гость из телеграма подключается не к нашему ретранслятору («${место.relay}»)`);
  }

  // Ретранслятор в приглашение не помещается вовсе — его спрашивают у адреса страницы, по
  // общим правилам. На github.io, где живёт мини-приложение, «auto» отвергается: там
  // раздают файлы, и сокета нет.
  const наХостинге = стенд({ хвост: '#tgWebAppStartParam=abc123_green', поиск: '?relay=auto' });
  assert(наХостинге.api.местоИзТелеграма().relay
    === source.match(/const ONLINE_RELAY_URL = "([^"]*)";/)[1],
    '2d2: «relay=auto» принят на хостинге — игра будет вечно стучаться в адрес собственной '
    + 'страницы и молчать');

  // Мусор местом за столом не становится: сядем в меню, а не в случайную комнату.
  const мусор = стенд({ хвост: '#tgWebAppStartParam=abc123&tgWebAppVersion=7.10' });
  assert(мусор.api.местоИзТелеграма() === null,
    '2e: приглашение без места приняли за место — игрока посадят неизвестно куда');
  const чужойЦвет = стенд({ хвост: '#tgWebAppStartParam=abc123_red' });
  assert(чужойЦвет.api.местоИзТелеграма() === null, '2f: принят цвет, которого в игре нет');
  const пусто = стенд({ хвост: '#tgWebAppVersion=7.10' });
  assert(пусто.api.местоИзТелеграма() === null,
    '2g: без приглашения кого-то всё равно усаживают за стол');

  // Имя комнаты с подчёркиванием делится по ПОСЛЕДНЕМУ: цвет стоит в конце.
  const сЧертой = стенд({ хвост: '#tgWebAppStartParam=my_room_green' });
  assert(сЧертой.api.местоИзТелеграма()?.room === 'my_room',
    '2h: имя комнаты поделено по первому подчёркиванию — комната выйдет другая');
}

// === 3. Приглашение читается из адреса, а не только из моста ===
//
// Мост (window.Telegram.WebApp) приезжает отдельным скриптом с чужого домена, а место за
// столом занимается сразу при запуске. Читать только мост значит иногда не сесть вовсе —
// и это «иногда» зависит от скорости сети, то есть ловится не всегда.
{
  const изХвоста = стенд({ хвост: '#tgWebAppStartParam=roomaa_green', мост: false });
  assert(изХвоста.api.стартовыйПараметрТелеграма() === 'roomaa_green',
    '3: приглашение в адресе не читается без моста — на медленной сети друг останется в меню');

  const изМоста = стенд({ хвост: '#tgWebAppVersion=7.10', стартИзМоста: 'roombb_blue' });
  assert(изМоста.api.стартовыйПараметрТелеграма() === 'roombb_blue',
    '3b: клиент, который кладёт приглашение только в мост, остался без комнаты');

  // Посадка спрашивает телеграм — но после адреса страницы: в адресе стоит то, за чем
  // сидим сейчас, а в приглашении — то, с чем когда-то открыли окно.
  const посадка = extractFunctionSource(source, 'startOnlineSession');
  assert(/parseOnlineSeatFromSearch\([^)]*\)\s*\?\?\s*местоИзТелеграма\(\)/.test(посадка),
    '3c: посадка не спрашивает телеграм (или спрашивает его раньше адреса страницы) — '
    + 'пришедший по ботовой ссылке не сядет за стол');
}

// === 4. Посылает телеграм, а не системная шторка ===
//
// Шторка внутри телеграмного вебвью отвечает «готово» и не доносит. Это и была исходная
// поломка: человек звал друга, был уверен, что позвал, и ждал.
{
  const нажать = async ({ мост = true, умеетСсылки = true } = {}) => {
    const открыто = [];
    const показано = [];
    const делёж = [];
    const кнопка = { слушатели: [] };
    const sandbox = {
      Object, String, Boolean, Promise, encodeURIComponent,
      console: { log: () => {}, warn: () => {} },
      HTMLElement: function HTMLElement(){},
      открыто, показано, делёж,
      onlineInviteSent: false,
      обновитьЗазывание: () => {},
      показатьПодсказкуЛобби: (текст) => { показано.push(текст); return true; },
      buildOnlineInviteLink: () => 'https://t.me/InkyPlanesGameBot/play?startapp=abc123_green',
      navigator: { share: async (данные) => { делёж.push(данные); } },
      document: {
        createElement: () => ({
          style: {}, setAttribute: () => {}, select: () => {}, setSelectionRange: () => {},
          remove: () => {},
        }),
        body: { appendChild: () => {} },
        execCommand: () => true,
      },
      window: {
        Telegram: мост ? { WebApp: {
          ...(умеетСсылки ? { openTelegramLink(адрес){ открыто.push(адрес); } } : {}),
        } } : undefined,
      },
      onlineSendLinkBtn: null,
    };
    sandbox.onlineSendLinkBtn = Object.setPrototypeOf({
      addEventListener: (_тип, обработчик) => { кнопка.слушатели.push(обработчик); },
    }, sandbox.HTMLElement.prototype);
    vm.createContext(sandbox);
    vm.runInContext([
      extractFunctionSource(source, 'мостТелеграма'),
      extractFunctionSource(source, 'послатьСсылкуЧерезТелеграм'),
      extractFunctionSource(source, 'скопироватьСсылку'),
      extractBlock(source, 'if(onlineSendLinkBtn instanceof HTMLElement){'),
    ].join('\n'), sandbox);
    await кнопка.слушатели[0]();
    return { открыто, показано, делёж, отправлено: sandbox.onlineInviteSent };
  };

  const вТелеграме = await нажать();
  assert(вТелеграме.открыто.length === 1,
    '4: внутри телеграма ссылку послали не телеграмом — системная шторка там отвечает '
    + '«готово» и не доносит ничего');
  assert(вТелеграме.делёж.length === 0,
    '4b: после телеграма открыли ещё и системную шторку — человека спросят дважды');
  assert(/^https:\/\/t\.me\/share\/url\?url=/.test(вТелеграме.открыто[0]),
    `4c: телеграму отдали не выбор чата, а «${вТелеграме.открыто[0]}»`);
  assert(decodeURIComponent(вТелеграме.открыто[0].split('url=')[1])
    === 'https://t.me/InkyPlanesGameBot/play?startapp=abc123_green',
    `4d: в выбор чата положили не ту ссылку («${вТелеграме.открыто[0]}»)`);
  assert(вТелеграме.показано.length === 1,
    '4e: нажатие осталось без ответа — ровно то молчание, из-за которого жмут снова');
  assert(вТелеграме.отправлено === true, '4f: позванный друг не засчитан, зазывание не погаснет');

  // Снаружи телеграма и на старом клиенте без этого вызова работает прежний путь.
  const безТелеграма = await нажать({ мост: false });
  assert(безТелеграма.открыто.length === 0 && безТелеграма.делёж.length === 1,
    '4g: вне телеграма перестала работать системная шторка');
  const старый = await нажать({ умеетСсылки: false });
  assert(старый.делёж.length === 1,
    '4h: на клиенте без openTelegramLink не осталось вообще никакого способа послать ссылку');
}

// === 5. Вышли из-за стола — приглашение больше не зовёт ===
//
// Приглашение живёт в хвосте адреса и переживает перезагрузку так же, как «?room=&seat=».
// Не вычеркнуть его — значит после выхода и перезагрузки молча сесть обратно.
{
  const т = стенд({});
  const чисто = т.api.очиститьХвостОтТелеграма(
    `${ХВОСТ_ТЕЛЕГРАМА}&tgWebAppStartParam=abc123_green`);
  assert(!/tgWebAppStartParam/.test(чисто),
    `5: приглашение осталось в адресе («${чисто}») — перезагрузка усадит обратно за стол, `
    + 'из которого только что вышли');

  // Остальное — побуквенно как было. Рядом едет подписанный телеграмом initData, и
  // пересборка хвоста разбором меняет в нём кодировку: подписанная строка перестаёт быть
  // собой. Вычёркиваем своё, чужого не касаемся.
  assert(чисто === ХВОСТ_ТЕЛЕГРАМА,
    `5b: вместе с приглашением переписали весь хвост («${чисто}») — подписанный телеграмом `
    + 'initData этого не переживёт');
  assert(т.api.очиститьХвостОтТелеграма('#tgWebAppStartParam=abc_green') === '',
    '5c: от хвоста остался пустой «#»');
  assert(т.api.очиститьХвостОтТелеграма(ХВОСТ_ТЕЛЕГРАМА) === ХВОСТ_ТЕЛЕГРАМА,
    '5d: хвост без приглашения всё равно переписан');
  assert(т.api.очиститьХвостОтТелеграма('') === '', '5e: пустой хвост испорчен');

  // И выход из-за стола этим пользуется.
  const выход = extractFunctionSource(source, 'clearOnlineRoomFromAddress');
  assert(/очиститьХвостОтТелеграма/.test(выход),
    '5f: выход из-за стола чистит только «?room=&seat=», а телеграмное приглашение '
    + 'оставляет — после перезагрузки игрок снова за тем же столом');
}

// === 6. Непролезающее имя комнаты не превращается в покалеченную ссылку ===
//
// Телеграм пропускает в startapp только буквы, цифры, «_» и «-». Имя комнаты у нас как
// раз такое, но в адрес его можно вписать руками. Поправленное заменами имя звало бы в
// ДРУГУЮ комнату, и оба ждали бы каждый в своей — поэтому лучше обычная ссылка.
{
  const кривая = стенд({ хвост: ХВОСТ_ТЕЛЕГРАМА, room: 'ком ната/1', seat: 'blue' });
  const ссылка = кривая.api.buildOnlineInviteLink();
  assert(!ссылка.includes('t.me'),
    `6: имя комнаты, которого телеграм не примет, уехало в ботовую ссылку («${ссылка}»)`);
  assert(ссылка.includes('github.io'),
    `6b: вместо запасной обычной ссылки выдано «${ссылка}»`);
  assert(кривая.api.телеграмноеПриглашение('ком ната/1', 'green') === '',
    '6c: приглашение собирается из чего угодно');
}

console.log('smoke-telegram-invite: OK');

})().catch((ошибка) => {
  console.error(String(ошибка && ошибка.message || ошибка));
  process.exit(1);
});
