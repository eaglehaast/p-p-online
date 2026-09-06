#!/usr/bin/env node
'use strict';

// Smoke test: при своём крае снизу поле остаётся читаемым.
//
// Переворот доски — это поворот на 180°, и всё, что нарисовано «по экрану», а не «по миру»,
// от него ломается по-своему. Здесь три таких места, каждое со своей поломкой:
//
//   тень груза      лежит ПОД ящиком по экрану — уезжала НАД ящик
//   подпись дальности стоит СБОКУ от самолёта — ложилась прямо на самолёт
//   корзинки баз    читаются стоймя — вставали вверх дном
//
// Проверено в браузере при обоих краях и в обеих ориентациях: тень под ящиком, подпись
// сбоку, корзинки стоймя и открыты в сторону поля.

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

// Куда на экране смотрит мировой вектор при данной ориентации и данном крае.
//
// В портрете мир +y идёт на экране вниз. В горизонтали кадр повёрнут на -90°, и вниз по
// экрану идёт уже мир +x. Переворот доски меняет знак и там, и там.
function экраннаяВертикаль(landscape, flipped){
  const знак = flipped ? -1 : 1;
  return landscape ? { dx: знак, dy: 0 } : { dx: 0, dy: знак };
}

// === 1. Тень груза лежит ПОД ящиком — по экрану, а не по миру ===
{
  const запуск = (landscape, flipped) => {
    let эллипс = null;
    const sandbox = {
      Math, Number,
      isBoardLandscapeActive: () => landscape,
      isBoardFlipped: () => flipped,
      getCargoSpriteDrawSize: () => ({ width: 34, height: 34 }),
      getCargoShadowState: () => ({ alpha: 0.5, scale: 1 }),
      CARGO_SHADOW_COLOR: '0, 0, 0',
      performance: { now: () => 0 },
    };
    vm.createContext(sandbox);
    vm.runInContext(extractFn(source, 'drawCargoShadow'), sandbox);
    sandbox.drawCargoShadow({
      save(){}, restore(){}, beginPath(){}, fill(){}, set fillStyle(_v){},
      ellipse(x, y, _rx, _ry, rot){ эллипс = { x, y, rot }; },
    }, { x: 100, y: 200, state: 'ready' }, 0);
    return эллипс;
  };

  const центр = { x: 100 + 17, y: 200 + 17 };
  for(const landscape of [false, true]){
    for(const flipped of [false, true]){
      const т = запуск(landscape, flipped);
      assert(т, `1: тень не нарисовалась (горизонт=${landscape}, переворот=${flipped})`);
      const смещение = { dx: т.x - центр.x, dy: т.y - центр.y };
      const вниз = экраннаяВертикаль(landscape, flipped);
      const длина = Math.hypot(смещение.dx, смещение.dy);
      assert(длина > 1e-6, '1b: тень встала ровно в центр ящика');
      const скалярно = (смещение.dx * вниз.dx + смещение.dy * вниз.dy) / длина;
      assert(скалярно > 0.999,
        `1c: горизонт=${landscape}, переворот=${flipped}: тень смещена на `
        + `${JSON.stringify(смещение)}, а вниз по экрану — это ${JSON.stringify(вниз)}. `
        + 'Тень лежит не под ящиком');
    }
  }

  // На обычном крае числа обязаны остаться в точности прежними: 0.5 + 0.4 = 0.9.
  const было = запуск(false, false);
  assert(Math.abs(было.x - (100 + 34 * 0.5)) < 1e-9
    && Math.abs(было.y - (200 + 34 * 0.9)) < 1e-9,
    `1d: на обычном крае тень переехала в ${JSON.stringify({ x: было.x, y: было.y })} — `
    + 'изменилась игра, в которую уже играли');
  const былоГор = запуск(true, false);
  assert(Math.abs(былоГор.x - (100 + 34 * 0.9)) < 1e-9
    && Math.abs(былоГор.y - (200 + 34 * 0.5)) < 1e-9,
    '1e: в горизонтали на обычном крае тень переехала');
}

// === 2. Корзинки баз стоят стоймя и открыты в сторону поля ===
//
// На боку корзинка читается — потому в горизонтали её нарочно не разворачивают, иначе она
// не влезает в свою клетку. А вверх дном не читается никак.
{
  const запуск = (landscape, flipped, color) => {
    const вызовы = [];
    const sandbox = {
      Math,
      isBoardLandscapeActive: () => landscape,
      isBoardFlipped: () => flipped,
      isSpriteReady: () => true,
      getBaseLayout: () => ({ x: 10, y: 20, width: 30, height: 40 }),
      baseSprites: { green: {}, blue: {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(extractFn(source, 'drawBaseSprite'), sandbox);
    sandbox.drawBaseSprite({
      save: () => вызовы.push(['save']),
      restore: () => вызовы.push(['restore']),
      translate: (x, y) => вызовы.push(['translate', x, y]),
      rotate: (a) => вызовы.push(['rotate', Number(a.toFixed(6))]),
      scale: (x, y) => вызовы.push(['scale', x, y]),
      drawImage: (...a) => вызовы.push(['drawImage', ...a.slice(1)]),
    }, color);
    return вызовы;
  };

  // Обычный край: ровно то, что было. Одна отрисовка без преобразований — и мировой
  // разворот только для синей в горизонтали.
  const прямоЗелёная = запуск(false, false, 'green');
  assert(прямоЗелёная.length === 1 && прямоЗелёная[0][0] === 'drawImage',
    '2: на обычном крае в портрете корзинка рисовалась одним вызовом — стало иначе');
  const прямоСиняяГор = запуск(true, false, 'blue');
  assert(прямоСиняяГор.some((c) => c[0] === 'scale' && c[1] === 1 && c[2] === -1),
    '2b: в горизонтали синяя корзинка перестала отражаться и смотрит от поля');
  assert(!запуск(true, false, 'green').some((c) => c[0] === 'scale'),
    '2c: в горизонтали отражают обе корзинки — одна из них отвернётся от поля');

  // Свой край снизу: доворот назад ровно на 180°, вокруг центра корзинки.
  for(const landscape of [false, true]){
    for(const color of ['green', 'blue']){
      const вызовы = запуск(landscape, true, color);
      const поворот = вызовы.find((c) => c[0] === 'rotate');
      assert(поворот && Math.abs(Math.abs(поворот[1]) - Math.PI) < 1e-6,
        `2d: горизонт=${landscape}, корзинка ${color} остаётся вверх дном`);
      const сдвиг = вызовы.find((c) => c[0] === 'translate');
      assert(сдвиг && сдвиг[1] === 10 + 15 && сдвиг[2] === 20 + 20,
        '2e: доворот идёт не вокруг центра корзинки — она уедет со своей клетки');
      assert(вызовы[0][0] === 'save' && вызовы[вызовы.length - 1][0] === 'restore',
        '2f: поворот утекает на остальную отрисовку');
    }
  }

  // И отражают в горизонтали уже другую: краями экрана корзинки поменялись.
  assert(запуск(true, true, 'green').some((c) => c[0] === 'scale'),
    '2g: при своём крае снизу от поля отвёрнута зелёная корзинка, а отражают всё ещё синюю');
  assert(!запуск(true, true, 'blue').some((c) => c[0] === 'scale'),
    '2h: синюю корзинку отражают и при своём крае снизу — она отвернётся от поля');
}

// === 3. Подпись дальности стоит СБОКУ от самолёта ===
//
// Блок подписи разворачивают вокруг её якоря, чтобы она читалась ровно. Значит и якорь надо
// отодвигать в ту сторону, куда подпись читается: при своём крае снизу к развороту
// добавляется 180°, и прежнее смещение клало подпись прямо на самолёт. Ровно это уже
// случалось в горизонтали — и лечилось тем же.
{
  const тело = extractFn(source, 'drawPlanesAndTrajectories');
  assert(/const awaySign = isBoardFlipped\(\) \? -1 : 1;/.test(тело),
    '3: смещение подписи перестало разворачиваться вместе с доской');
  assert(/const away = \(POINT_RADIUS \+ 8\) \* awaySign;/.test(тело),
    '3b: знак смещения не доходит до самого смещения');
  assert(/x: landscape \? p\.x : p\.x \+ away/.test(тело)
    && /y: landscape \? p\.y - away : p\.y/.test(тело),
    '3c: якорь подписи считается мимо смещения');

  // И причина, по которой знак нужен: блок разворачивают ещё на 180°.
  const overlay = extractFn(source, 'drawAimOverlay');
  assert(/isBoardFlipped\(\) \? Math\.PI : 0/.test(overlay),
    '3d: блок подписи больше не разворачивается на переворот — тогда и знак смещения '
    + 'менять не надо, но проверка устарела');
}

// === 4. Мина стоит стоймя ===
//
// Спрайт мины нарисован с горизонтальным пояском и бликом сверху справа. Вверх дном блик
// уезжает вниз налево — свет как будто снизу, хотя во всей остальной графике он идёт
// сверху справа.
{
  const тело = extractFn(source, 'drawMines');
  assert(/const uprightRad = \(isBoardLandscapeActive\(\) \? -Math\.PI \/ 2 : 0\)\s*\n\s*\+ \(isBoardFlipped\(\) \? Math\.PI : 0\);/
    .test(тело),
    '4: мина не доворачивается на переворот доски и встаёт вверх дном');

  // Покачивание идёт ПОВЕРХ доворота, а не вместо него.
  assert(/gsBoardCtx\.rotate\(uprightRad \+ swayRad\);/.test(тело),
    '4b: покачивание заменило доворот вместо того, чтобы сложиться с ним');

  // И доворот вокруг центра мины: иначе она уедет со своего места.
  assert(/gsBoardCtx\.translate\(mine\.x, mine\.y\);\s*\n\s*gsBoardCtx\.rotate\(/.test(тело),
    '4c: доворот идёт не вокруг центра мины');
}

console.log('smoke-flip-field-decorations: OK');
