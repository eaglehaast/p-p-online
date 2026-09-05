#!/usr/bin/env node
'use strict';

// Smoke test: самые тяжёлые картинки лежат в WebP, а не в PNG.
//
// Тринадцать картинок весили 7 565 КБ — треть всего, что игра тянет по сети до того,
// как станет доступной. Это не «неаккуратно упаковали»: пережатие БЕЗ потерь даёт всего
// −33% (WebP lossless — 3 522 КБ), потому что картинки текстурные, в них тысячи оттенков.
// Вся разница именно в переходе на сжатие с потерями.
//
//   letterbox2                1557 КБ →  114 КБ   −93%
//   playagain_container       1520 КБ →  110 КБ   −93%
//   gs_background              729 КБ →  124 КБ   −83%
//   mm_frame                   622 КБ →   49 КБ   −93%
//   cp_background              429 КБ →   16 КБ   −97%
//   paperwithred2              389 КБ →   56 КБ   −86%
//
// Второй заход — экран передачи хода и кнопки переигровки. Они не на критическом пути,
// но это самый крупный оставшийся кусок, и он нужен в конце каждого раунда:
//
//   gs_transfer_back           673 КБ →   60 КБ   −92%
//   gs_greenwingame            579 КБ →   26 КБ   −96%
//   gs_bluewingame             529 КБ →   20 КБ   −97%
//   gs_transfer_green          153 КБ →    8 КБ   −95%
//   gs_transfer_blue           148 КБ →    7 КБ   −95%
//   playagain/yes              119 КБ →   10 КБ   −92%
//   playagain/no               113 КБ →    9 КБ   −92%
//   ИТОГО                     7565 КБ →  614 КБ   −92%
//
// Замер запуска на 600 кбит/с с задержкой 300 мс (со сжатием текста, как отдаёт
// GitHub Pages):
//
//                          было      стало
//   меню доступно          44.8 с    38.6 с
//   страница догрузилась  233.8 с   168.9 с
//   всего скачано          16.5 МБ   11.8 МБ
//
// Качество выбрано 88 и показано владельцу на кропах 1:1 из самых детальных мест: там
// артефакты вылезают первыми. В живой игре на одной и той же карте среднее отличие
// кадра — 4.91 из 255, то есть 1.9%: это сглаженный шум текстуры, а не артефакт.
//
// Запасных PNG рядом СПЕЦИАЛЬНО не оставлено. WebP понимают все браузеры, где игра
// вообще запускается, а держать оба набора — значит не выиграть ничего.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const styles = fs.readFileSync('styles.css', 'utf8');
const script = fs.readFileSync('script.js', 'utf8');

// Пары «что было — что стало». Пути живут здесь, чтобы тест ловил и переезд файла.
const CONVERTED = [
  'letterbox2',
  'ui_gamescreen/playagain/playagain_container',
  'ui_gamescreen/gamescreen_outside/gs_background',
  'ui_mainmenu/mm_frame',
  'ui_controlpanel/cp_background',
  'ui_gamescreen/paperwithred2',
  'ui_gamescreen/gs_transfer_2/gs_transfer_back',
  'ui_gamescreen/gs_transfer_2/gs_greenwingame',
  'ui_gamescreen/gs_transfer_2/gs_bluewingame',
  'ui_gamescreen/gs_transfer_2/gs_transfer_green',
  'ui_gamescreen/gs_transfer_2/gs_transfer_blue',
  'ui_gamescreen/playagain/yes',
  'ui_gamescreen/playagain/no',
];

// === 1. ГЛАВНОЕ: тяжёлых PNG больше нет ни на диске, ни в ссылках ===
{
  for(const base of CONVERTED){
    assert(!fs.existsSync(`${base}.png`),
      `1: ${base}.png вернулся в проект — это снова мегабайты на каждый запуск`);
    assert(!styles.includes(`${base}.png`) && !script.includes(`${base}.png`),
      `1b: на ${base}.png снова есть ссылка — файла нет, фон просто не нарисуется`);
  }
}

// === 2. Каждая картинка на месте и это настоящий WebP ===
//
// Если перекодировать не тем инструментом или скачать вместо файла страницу с ошибкой,
// ссылка останется целой, а фон исчезнет молча.
{
  let total = 0;
  for(const base of CONVERTED){
    const file = `${base}.webp`;
    assert(fs.existsSync(file), `2: нет файла ${file}`);

    const head = Buffer.alloc(12);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    assert(head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP',
      `2b: ${file} не WebP — внутри что-то другое`);

    const size = fs.statSync(file).size;
    assert(size > 3000, `2c: ${file} подозрительно мал (${size} байт)`);
    assert(size < 300 * 1024,
      `2d: ${file} весит ${Math.round(size / 1024)} КБ — для фона это снова много, `
      + 'проверь качество перекодирования');
    total += size;
  }

  assert(total < 850 * 1024,
    `2e: тринадцать картинок весят ${Math.round(total / 1024)} КБ вместо примерно 614 — `
    + 'качество подняли обратно, и выигрыш растаял');
}

// === 3. Ссылки ведут именно на WebP, и ни одна не потерялась ===
//
// Без этого пункт 1 прошёл бы и на варианте «фон просто убрали из стилей».
{
  const expectStyles = [
    'letterbox2.webp',
    'ui_gamescreen/playagain/yes.webp',
    'ui_gamescreen/playagain/no.webp',
    'ui_gamescreen/playagain/playagain_container.webp',
    'ui_gamescreen/gamescreen_outside/gs_background.webp',
    'ui_mainmenu/mm_frame.webp',
    'ui_controlpanel/cp_background.webp',
  ];
  for(const file of expectStyles){
    assert(styles.includes(file), `3: в стилях пропала ссылка на ${file}`);
  }

  // Эти две игра ставит из кода, а не из стилей.
  assert(/setBackgroundImage\('ui_gamescreen\/gamescreen_outside\/gs_background\.webp'\)/.test(script),
    '3b: фон игрового экрана больше не ставится из кода');
  assert(/loadImageAsset\("ui_gamescreen\/paperwithred2\.webp"/.test(script),
    '3c: бумажный фон поля больше не загружается');

  // Экран передачи хода собирается из пяти картинок, и все пять ставятся из кода.
  const transfer = /const TRANSFER_FRAME_ASSETS = Object\.freeze\(\{[\s\S]*?\}\);/.exec(script);
  assert(transfer, '3d: набор картинок экрана передачи хода не найден');
  for(const key of ['back', 'blue', 'green', 'winGameBlue', 'winGameGreen']){
    assert(new RegExp(`${key}: "[^"]+\\.webp"`).test(transfer[0]),
      `3e: у экрана передачи хода картинка ${key} не в WebP`);
  }

  // И все шесть по-прежнему в списках предзагрузки: иначе они поедут в момент показа.
  for(const base of CONVERTED){
    assert(script.includes(`"${base}.webp"`) || script.includes(`'${base}.webp'`),
      `3d: ${base}.webp выпал из списков предзагрузки`);
  }
}

// === 4. Сервер для игры на своём компьютере умеет отдавать WebP ===
//
// Без правильного типа браузер получит octet-stream и фон не покажет.
{
  const server = fs.readFileSync('worker/local-server.js', 'utf8');
  assert(/"\.webp": "image\/webp"/.test(server),
    '4: локальный сервер не знает тип webp — фоны не отдадутся');
}

console.log('smoke-heavy-images-are-webp: OK');
