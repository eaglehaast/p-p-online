#!/usr/bin/env node
'use strict';

// Smoke test: подпись дальности стоит СБОКУ от самолёта в обеих ориентациях.
//
// В горизонтали надпись «12.2 cells» ложилась прямо на самолёт. Причина не в самой
// надписи, а в рассогласовании двух мест.
//
// Блок подписи (число, «cells» и значки баффов) рисуется с textAlign: left, то есть
// уходит от якоря ВПРАВО. Якорь ставится на POINT_RADIUS + 8 правее самолёта — и в
// вертикали этого хватает, чтобы блок целиком ушёл вбок.
//
// В горизонтали холст повёрнут вместе с кадром, поэтому блок дополнительно
// разворачивают на −90° вокруг якоря, чтобы он читался ровно. После разворота блок
// уходит от якоря уже не вправо, а вверх — а смещение якоря оставалось прежним, вправо.
// То есть смещение стало ПОПЕРЁК чтения: якорь в восьми точках от края самолёта,
// половина толщины блока (две строки плюс ряд значков) заезжает обратно, и надпись
// ложится на самолёт.
//
// Правило, которое чинит это раз и навсегда: смещение якоря поворачивается вместе с
// блоком. Портретное смещение (away, 0), повёрнутое на −90°, даёт (0, −away) — ровно то,
// что теперь стоит в коде для горизонтали.
//
// Тест проверяет именно СОГЛАСОВАННОСТЬ: он читает угол поворота из drawAimOverlay,
// читает оба смещения из расчёта якоря и убеждается, что одно получается из другого этим
// самым поворотом. Поменяют знак поворота — тест потребует поменять и смещение.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');

function extractFn(name){
  const re = new RegExp(`^function ${name}\\(`, 'm');
  const m = re.exec(script);
  assert(m, `не найдено: ${name}`);
  const start = m.index;
  const open = script.indexOf('{', script.indexOf(')', start));
  let d = 0;
  for(let i = open; i < script.length; i += 1){
    if(script[i] === '{') d += 1;
    if(script[i] === '}'){ d -= 1; if(d === 0) return script.slice(start, i + 1); }
  }
  throw new Error(`не закрыто: ${name}`);
}

// === 1. Угол разворота блока в горизонтали ===
let turns;
{
  const overlay = extractFn('drawAimOverlay');

  assert(/if\(isBoardLandscapeActive\(\)\)\{[\s\S]{0,200}hudCtx\.rotate\(/.test(overlay),
    '1: блок подписи больше не разворачивается в горизонтали — тогда он будет читаться '
    + 'снизу вверх');

  const rot = /hudCtx\.rotate\((-?)Math\.PI \/ 2\)/.exec(overlay);
  assert(rot, '1b: разворот блока задан не через Math.PI / 2 — проверка устарела');
  turns = rot[1] === '-' ? -1 : 1;

  // Разворот идёт вокруг якоря: только тогда якорь остаётся на месте, а блок поворачивается.
  assert(/hudCtx\.translate\(rangeTextInfo\.x, rangeTextInfo\.y\)/.test(overlay)
    && /hudCtx\.translate\(-rangeTextInfo\.x, -rangeTextInfo\.y\)/.test(overlay),
    '1c: разворот идёт не вокруг якоря — блок уедет с места');
}

// === 2. ГЛАВНОЕ: смещение якоря повёрнуто ровно на тот же угол ===
{
  const draw = extractFn('drawPlanesAndTrajectories');

  const away = /const away = POINT_RADIUS \+ (\d+);/.exec(draw);
  assert(away, '2: расстояние от самолёта до якоря не вынесено в отдельное имя');

  // Читаем оба смещения как вектор, в единицах away.
  const xLine = /x: landscape \? (.+?),\n/.exec(draw);
  const yLine = /y: landscape \? (.+?),\n/.exec(draw);
  assert(xLine && yLine, '2b: якорь считается не через выбор по ориентации — проверка устарела');

  const parse = (expr, axis) => {
    // Вид «p.x» или «p.x + away» или «p.y - away».
    const m = new RegExp(`^p\\.${axis}(?: ([+-]) away)?$`).exec(expr.trim());
    assert(m, `2c: смещение по ${axis} записано непонятно: «${expr.trim()}»`);
    if(!m[1]) return 0;
    return m[1] === '+' ? 1 : -1;
  };

  const [landX, portX] = xLine[1].split(' : ');
  const [landY, portY] = yLine[1].split(' : ');
  const portrait = { x: parse(portX, 'x'), y: parse(portY, 'y') };
  const landscape = { x: parse(landX, 'x'), y: parse(landY, 'y') };

  // В вертикали блок читается вправо, значит и якорь отодвинут вправо.
  assert(portrait.x === 1 && portrait.y === 0,
    `2d: в вертикали якорь смещён на (${portrait.x}, ${portrait.y}) вместо (1, 0) — `
    + 'подпись читается вправо, туда же должен уходить и якорь');

  // Поворот вектора на turns * 90°: (x, y) -> (x·cos - y·sin, x·sin + y·cos).
  const angle = turns * Math.PI / 2;
  const cos = Math.round(Math.cos(angle));
  const sin = Math.round(Math.sin(angle));
  const expected = {
    x: portrait.x * cos - portrait.y * sin,
    y: portrait.x * sin + portrait.y * cos,
  };

  assert(landscape.x === expected.x && landscape.y === expected.y,
    `2e: блок разворачивают на ${turns * 90}°, значит смещение якоря обязано стать `
    + `(${expected.x}, ${expected.y}), а стоит (${landscape.x}, ${landscape.y}). `
    + 'Смещение поперёк чтения — это и есть надпись поверх самолёта');

  // Расстояние одно и то же: иначе в одной ориентации подпись липнет, в другой отлетает.
  assert(Number(away[1]) >= 4 && Number(away[1]) <= 24,
    `2f: отступ от края самолёта ${away[1]} точек — либо липнет, либо улетает`);
}

// === 3. Обе ориентации берут отступ из ОДНОГО места ===
//
// Без этого можно поправить одну ветку и забыть вторую — ровно так эта ошибка и возникла.
{
  const draw = extractFn('drawPlanesAndTrajectories');
  const anchor = /const away = POINT_RADIUS[\s\S]*?planeColor: p\.color\n      \};/.exec(draw);
  assert(anchor, '3: расчёт якоря не найден целиком');
  assert((anchor[0].match(/away/g) || []).length === 3,
    '3b: имя away встречается в расчёте якоря не три раза (объявление и два смещения) — '
    + 'значит одна из ориентаций считает отступ по-своему');
  assert(!/POINT_RADIUS \+ 8/.test(anchor[0].replace(/const away = POINT_RADIUS \+ \d+;/, '')),
    '3c: отступ снова посчитан на месте, мимо общего имени');
}

console.log('smoke-range-label-landscape: OK');
