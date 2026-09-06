#!/usr/bin/env node
'use strict';

// Smoke test: при своём крае снизу накладки в DOM встают туда же, куда рисует холст.
//
// Часть эффектов рисует не холст, а DOM поверх него: падающий груз, огонь над сбитым,
// взрыв, заряд динамита на стене. Холст поля разворачивается в setFieldTransform, а DOM
// о развороте не знал ничего — и накладка вставала в противоположный угол.
//
// Замер в браузере: метка 1x1 в узловой точке накладки, её экранное место против места,
// куда ту же мировую точку кладёт холст. Промах в пикселях, все четыре сочетания:
//
//                          груз    огонь   взрыв
//   портрет,  свой край     40.2   189.5   210.2
//   горизонт, свой край     39.6   182.4   200.2
//   после правки            0.0     0.0     0.0   (в горизонтали 1.1 — округление,
//                                                  одинаковое при любом крае)
//
// Промах равен удвоенному расстоянию до центра доски: в центре его нет вовсе, у края поля
// он больше полутысячи точек. Груз в замере лежал почти в центре — оттого и «всего» 40.
//
// Проверено в браузере: груз падает туда же, где появляется готовый ящик; огонь стоит на
// сбитом; взрыв — в точке гибели; и всё это одинаково в портрете и в горизонтали.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

function extractFn(source, name){
  const at = source.indexOf(`function ${name}(`);
  if(at === -1) throw new Error(`не найдено: ${name}`);
  const open = source.indexOf('{', source.indexOf(')', at));
  let depth = 0;
  for(let i = open; i < source.length; i += 1){
    if(source[i] === '{') depth += 1;
    if(source[i] === '}'){ depth -= 1; if(depth === 0) return source.slice(at, i + 1); }
  }
  throw new Error(`не закрыто: ${name}`);
}

const source = fs.readFileSync('script.js', 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

// === 1. ГЛАВНОЕ: перевод мира на экран разворачивается вместе с доской ===
//
// Это обратное к designToBoardCoords, и обе стороны обязаны разворачиваться одинаково:
// иначе клик и картинка перестают говорить об одном и том же месте.
{
  const sandbox = {
    Math, Number,
    WORLD: { width: 360, height: 640 },
    CANVAS_BASE_WIDTH: 360, CANVAS_BASE_HEIGHT: 640,
    boardViewSeat: 'green',
    normalizeRect: (r) => r,
    getBoardCssRect: () => ({ left: 0, top: 0, width: 360, height: 640 }),
  };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFn(source, 'getBoardViewSeat'),
    extractFn(source, 'isBoardFlipped'),
    extractFn(source, 'flipBoardPointIfNeeded'),
    extractFn(source, 'worldToOverlayLocal'),
    extractFn(source, 'designToBoardCoords'),
    'this.наЭкран = (seat, x, y) => { boardViewSeat = seat;',
    '  const r = worldToOverlayLocal(x, y); return { x: r.overlayX, y: r.overlayY }; };',
    'this.вМир = (seat, x, y) => { boardViewSeat = seat; return designToBoardCoords(x, y); };',
  ].join('\n'), sandbox);

  const прямо = sandbox.наЭкран('green', 90, 160);
  assert(Math.abs(прямо.x - 90) < 1e-9 && Math.abs(прямо.y - 160) < 1e-9,
    '1: без переворота перевод мира на экран должен остаться прежним');

  const наоборот = sandbox.наЭкран('blue', 90, 160);
  assert(Math.abs(наоборот.x - 270) < 1e-9 && Math.abs(наоборот.y - 480) < 1e-9,
    `1b: при своём крае снизу накладка встаёт в ${JSON.stringify(наоборот)} вместо `
    + '{"x":270,"y":480} — то есть не туда, куда холст рисует ту же точку');

  // И перевод туда-обратно обязан вернуть то же место при любом крае.
  for(const seat of ['green', 'blue']){
    for(const [x, y] of [[0, 0], [90, 160], [359, 639], [180, 320]]){
      const на = sandbox.наЭкран(seat, x, y);
      const назад = sandbox.вМир(seat, на.x, на.y);
      assert(Math.abs(назад.x - x) < 1e-9 && Math.abs(назад.y - y) < 1e-9,
        `1c: край ${seat}, точка (${x}, ${y}) уезжает после перевода туда и обратно `
        + `в (${назад.x}, ${назад.y}) — ввод и картинка говорят о разных местах`);
    }
  }
}

// === 2. Стоячие спрайты остаются стоймя ===
//
// Ящик, гнездо и кукуруза читаются как предметы, а не как часть поля: вверх ногами они
// выглядят сломанными. Ради этого и заведён drawWorldSpriteUpright — до сих пор он знал
// только про горизонталь.
{
  const вызовы = [];
  const ctx = {
    save: () => вызовы.push(['save']),
    restore: () => вызовы.push(['restore']),
    translate: (x, y) => вызовы.push(['translate', x, y]),
    rotate: (a) => вызовы.push(['rotate', Number(a.toFixed(6))]),
    drawImage: (_s, x, y, w, h) => вызовы.push(['drawImage', x, y, w, h]),
  };
  const запуск = (landscape, flipped) => {
    вызовы.length = 0;
    const sandbox = { Math, isBoardLandscapeActive: () => landscape, isBoardFlipped: () => flipped };
    vm.createContext(sandbox);
    vm.runInContext(extractFn(source, 'drawWorldSpriteUpright'), sandbox);
    sandbox.drawWorldSpriteUpright(ctx, { ready: true }, 100, 200, 20, 40);
    return вызовы.slice();
  };

  const обычно = запуск(false, false);
  assert(обычно.length === 1 && обычно[0][0] === 'drawImage',
    '2: без поворотов спрайт обязан рисоваться как раньше, одним вызовом');

  const перевёрнут = запуск(false, true);
  const поворот = перевёрнут.find((c) => c[0] === 'rotate');
  assert(поворот && Math.abs(Math.abs(поворот[1]) - Math.PI) < 1e-6,
    '2b: при своём крае снизу ящик и флаги остаются вверх ногами');
  const сдвиг = перевёрнут.find((c) => c[0] === 'translate');
  assert(сдвиг && сдвиг[1] === 110 && сдвиг[2] === 220,
    '2c: доворот идёт не вокруг центра спрайта — спрайт уедет с места');
  assert(перевёрнут[0][0] === 'save' && перевёрнут[перевёрнут.length - 1][0] === 'restore',
    '2d: поворот утекает на остальную отрисовку');

  // Горизонталь и переворот складываются, а не отменяют друг друга.
  const обе = запуск(true, true);
  const обеПоворот = обе.find((c) => c[0] === 'rotate');
  assert(обеПоворот && Math.abs(обеПоворот[1] - Math.PI / 2) < 1e-6,
    `2e: в горизонтали при своём крае снизу доворот вышел ${обеПоворот?.[1]} вместо `
    + `${(Math.PI / 2).toFixed(6)} — два поворота считаются не вместе`);
}

// === 3. Груз сходится по ЦЕНТРУ ящика, а не по углу ===
//
// Кадр анимации намного больше ящика, и раньше он ставился по своему левому верхнему углу,
// со смещением в МИРОВЫХ единицах. При перевёрнутой доске это смещение переворачивалось
// вместе с точкой, и кадр уезжал от ящика на два смещения.
//
// Центр выбран не случайно: вокруг него доворачивается приземлившийся ящик и вокруг него же
// поворачивается кадр анимации. Это единственная точка, которая не уезжает ни от какого
// поворота, — значит и сходиться надо по ней.
{
  const тело = extractFn(source, 'syncCargoAnimationDomEntry');
  assert(/worldToOverlayLocal\(\s*cargo\.x \+ crateSize\.width \/ 2,\s*cargo\.y \+ crateSize\.height \/ 2,/
    .test(тело),
    '3: кадр анимации снова ставится не по центру ящика');
  assert(/overlayX: crateCenter\.overlayX - crateInFrameX/.test(тело)
    && /overlayY: crateCenter\.overlayY - crateInFrameY/.test(тело),
    '3b: смещение внутри кадра вычитается не в экранных единицах — при перевороте оно '
    + 'уедет вместе с миром');
  assert(!/cargo\.x \+ CARGO_ANIM_OFFSET_X/.test(тело),
    '3c: смещение кадра снова прибавляется в мировых единицах до перевода на экран');

  // Поворот кадра — только горизонталь: DOM с полем не переворачивается, а приземлившийся
  // ящик доворачивается назад. Развернуть здесь ещё и на 180° значило бы развернуть дважды.
  assert(/cargoDomStyle\.transform = 'rotate\(-90deg\)'/.test(тело)
    && !/180deg/.test(тело),
    '3d: кадр анимации разворачивается на переворот доски — но DOM и так не перевёрнут');
}

// === 4. Заряд динамита переезжает на ближнюю грань кирпича ===
//
// Заряд стоит на нижней ПО ЭКРАНУ грани. При развороте доски нижней становится
// противоположная грань, а своих полей под неё нет — но кирпич симметричен относительно
// центра, и отражение дальней грани через центр даёт ближнюю.
{
  const тело = extractFn(source, 'updateAndDrawDynamiteExplosions');
  assert(/const mirrorEdge = \(edge, center\) => \(isBoardFlipped\(\) \? 2 \* center - edge : edge\);/
    .test(тело),
    '4: грань кирпича больше не отражается при перевороте — заряд повиснет по другую '
    + 'сторону стены');
  assert(/const edgeX = Number\.isFinite\(entry\.rightX\) \? mirrorEdge\(entry\.rightX, entry\.x\)/.test(тело)
    && /const edgeY = Number\.isFinite\(entry\.bottomY\) \? mirrorEdge\(entry\.bottomY, entry\.y\)/.test(тело),
    '4b: отражение считается не от центра кирпича');
  assert(/\? edgeX : entry\.x/.test(тело) && /\? entry\.y : edgeY/.test(тело),
    '4c: якорь заряда снова берётся мимо отражённой грани');
}

// === 5. Никто не переводит мир на экран в обход ===
//
// Единственная точка перевода — ровно то, из-за чего переворот и удалось починить одним
// местом. Своя формула где-нибудь ещё разъедется молча.
{
  // Нормировка на размер мира — это и есть перевод. Их ровно три: масштаб холста и два
  // перевода для накладок. Четвёртая означала бы, что кто-то считает своё и о перевороте
  // не узнает.
  const свои = code.match(/\/\s*WORLD\.width;[\s\S]{0,80}\/\s*WORLD\.height;/g) || [];
  assert(свои.length <= 3,
    `5: нормировку на размер мира считают ${свои.length} раз вместо трёх (масштаб холста и `
    + 'два перевода накладок) — кто-то переводит мир на экран мимо общей точки и о '
    + 'перевороте не узнает');

  // Переводов два, и разворачиваться обязаны оба: у второго вызовов сейчас нет, но
  // неперевёрнутая копия рядом с перевёрнутой — готовые грабли.
  for(const имя of ['worldToOverlayLocal', 'worldToOverlay']){
    assert(/const \{ x: safeX, y: safeY \} = flipBoardPointIfNeeded\(rawX, rawY\);/
      .test(extractFn(source, имя)),
      `5b: ${имя} не разворачивает точку — накладка встанет в противоположный угол`);
  }

  // Накладки живут в DOM и позиционируются ровно через него.
  for(const [имя, что] of [
    ['syncCargoAnimationDomEntry', 'падающий груз'],
    ['updatePlaneFlameFxPosition', 'огонь над сбитым'],
  ]){
    assert(/worldToOverlayLocal\(/.test(extractFn(source, имя)),
      `5c: ${что} ставится мимо общего перевода мира на экран`);
  }
}

console.log('smoke-flip-dom-overlays: OK');
