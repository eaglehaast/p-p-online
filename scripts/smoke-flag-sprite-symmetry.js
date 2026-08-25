#!/usr/bin/env node
'use strict';

// Smoke test: флаг на своей половине стоит на том же расстоянии от базы, что и чужой.
//
// Домашняя раскладка флагов НЕсимметрична, причём одинаково во всех картах: синий флаг
// стоит в y 41..61, зелёный — в y 568..588, зеркало которой это y 52..72. Базы при этом
// зеркальны идеально. Замер разницей кадров «с флагом» и «без» на холсте доски 360x640:
//
//   база синих   22..40      гнездо   41..60    — просвет 0 строк
//   база зелёных 599..617    кукуруза 568..587  — просвет 11 строк
//
// Правильный вариант — кукуруза, поэтому спрайт гнезда сдвигается на те же 11px.
// Раскладку трогать нельзя: по ней считается точка захвата флага и цели ИИ, и она
// записана в каждой карте. Значит, проверять надо ровно две вещи: что сдвиг ровно
// добивает зеркало, и что он НЕ протекает в логику.

const fs = require('fs');
const path = require('path');

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

// Читаем таблицы объектом, а не по одному числу: так тест сломается и от перестановки полей.
function readLayoutTable(name){
  const start = source.indexOf(`const ${name} = {`);
  assert(start !== -1, `не нашёл таблицу ${name}`);
  const body = source.slice(start, source.indexOf('\n};', start));
  const table = {};
  for(const color of ['blue', 'green']){
    const m = body.match(new RegExp(`${color}: \\{ x: (\\d+), y: (\\d+), width: (\\d+), height: (\\d+) \\}`));
    assert(m, `в ${name} нет раскладки для «${color}»`);
    table[color] = { x: +m[1], y: +m[2], width: +m[3], height: +m[4] };
  }
  return table;
}

const FLAG_LAYOUTS = readLayoutTable('FLAG_LAYOUTS');
const BASE_LAYOUTS = readLayoutTable('BASE_LAYOUTS');

const worldMatch = source.match(/const WORLD = \{\s*width:\s*(\d+),\s*height:\s*(\d+)/);
assert(worldMatch, 'не нашёл размеры мира');
const WORLD_HEIGHT = Number(worldMatch[2]);

const nudgeMatch = source.match(/const FLAG_SPRITE_HOME_NUDGE_Y = Object\.freeze\(\{ blue: (-?\d+), green: (-?\d+) \}\);/);
assert(nudgeMatch, '0: сдвиг спрайта флага задан константой');
const NUDGE = { blue: Number(nudgeMatch[1]), green: Number(nudgeMatch[2]) };

// Зеркало коробки относительно поля: верх меняется местами с низом.
const mirror = (box) => ({ ...box, y: WORLD_HEIGHT - (box.y + box.height) });

// === 1. Базы зеркальны сами по себе — значит эталон симметрии есть ===
{
  const m = mirror(BASE_LAYOUTS.green);
  assert(m.y === BASE_LAYOUTS.blue.y && m.height === BASE_LAYOUTS.blue.height,
    `1: базы зеркальны (зеркало зелёной y=${m.y} против синей y=${BASE_LAYOUTS.blue.y})`);
}

// === 2. Флаги в раскладке НЕ зеркальны, и расхождение равно сдвигу ===
{
  const m = mirror(FLAG_LAYOUTS.green);
  const gap = m.y - FLAG_LAYOUTS.blue.y;
  assert(gap !== 0,
    '2: если раскладка вдруг стала симметричной, сдвиг спрайта больше не нужен — уберите его');
  assert(gap === NUDGE.blue,
    `2b: сдвиг спрайта обязан ровно добивать расхождение раскладки (${NUDGE.blue} против ${gap})`);
  assert(NUDGE.green === 0,
    '2c: зелёный флаг стоит правильно — его спрайт не двигаем');
}

// === 3. После сдвига нарисованная коробка синего флага зеркальна зелёной ===
{
  const drawn = { ...FLAG_LAYOUTS.blue, y: FLAG_LAYOUTS.blue.y + NUDGE.blue };
  const m = mirror({ ...FLAG_LAYOUTS.green, y: FLAG_LAYOUTS.green.y + NUDGE.green });
  assert(drawn.y === m.y && drawn.height === m.height,
    `3: нарисованные флаги зеркальны (${drawn.y} против ${m.y})`);

  // И просветы до своих баз совпадают: именно это видно глазом.
  const blueGap = drawn.y - (BASE_LAYOUTS.blue.y + BASE_LAYOUTS.blue.height);
  const greenGap = BASE_LAYOUTS.green.y - (FLAG_LAYOUTS.green.y + FLAG_LAYOUTS.green.height);
  assert(blueGap === greenGap,
    `3b: просвет между флагом и своей базой одинаков (${blueGap} против ${greenGap})`);
  assert(blueGap > 0,
    `3c: флаг стоит поодаль от базы, а не вплотную (${blueGap})`);
}

// === 4. Сдвиг только рисовальный: логика флага не сдвигается ===
{
  const draw = extractFunctionSource(source, 'drawFlagSprite');
  assert(/layout\.y \+ nudgeY/.test(draw),
    '4: сдвиг применяется при отрисовке спрайта');

  // Точка захвата, цели ИИ и запрет спавна поверх флага считаются по РАСКЛАДКЕ. Если
  // сдвиг протечёт туда, флаг начнут ловить не там, где он лежит.
  for(const fn of ['getFlagAnchor', 'getFlagSpriteLayoutForPlacement', 'getFlagPlacementRects']){
    assert(!/FLAG_SPRITE_HOME_NUDGE_Y/.test(extractFunctionSource(source, fn)),
      `4b: ${fn} обязан остаться на исходной раскладке — сдвиг чисто рисовальный`);
  }

  // Брошенный и несомый флаг рисуются там, где они есть, без всякого сдвига.
  assert(/const atHome = !anchor && !flag\?\.droppedAt;/.test(draw),
    '4c: сдвиг живёт только пока флаг дома');
  assert(/const nudgeY = atHome \? \(FLAG_SPRITE_HOME_NUDGE_Y\[flag\?\.color\] \?\? 0\) : 0;/.test(draw),
    '4d: у брошенного флага сдвиг нулевой, иначе спрайт уедет с места падения');
}

// === 5. Все карты кладут флаги одинаково — иначе одной константы мало ===
//
// Сдвиг зашит числом, поэтому он верен ровно до тех пор, пока раскладка везде одна.
// Если в новой карте флаги окажутся в другом месте, тест обязан это поймать.
{
  const dir = 'ui_gamescreen/maps';
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'manifest.json');
  assert(files.length > 0, '5: карты должны находиться');

  const seen = new Map();
  for(const file of files){
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const flags = parsed?.map?.flags;
    if(!Array.isArray(flags) || flags.length === 0) continue;
    for(const flag of flags){
      const color = flag.color || flag.team || flag.owner;
      const layout = flag.layout || flag;
      const key = `${layout.x},${layout.y},${layout.width},${layout.height}`;
      if(!seen.has(color)) seen.set(color, new Map());
      const perColor = seen.get(color);
      perColor.set(key, (perColor.get(key) || 0) + 1);
    }
  }

  assert(seen.size === 2, `5b: в картах должны быть флаги обеих сторон, нашлось ${seen.size}`);
  for(const [color, variants] of seen){
    assert(variants.size === 1,
      `5c: все карты обязаны класть ${color} флаг одинаково, иначе одной константы сдвига мало: ${[...variants.keys()].join(' | ')}`);
    const expected = FLAG_LAYOUTS[color];
    const [key] = [...variants.keys()];
    assert(key === `${expected.x},${expected.y},${expected.width},${expected.height}`,
      `5d: раскладка ${color} флага в картах разошлась с FLAG_LAYOUTS (${key} против ${expected.x},${expected.y},${expected.width},${expected.height})`);
  }
}

console.log('Smoke test passed: флаг стоит на том же расстоянии от своей базы, что и чужой от своей, сдвинут только спрайт, а точка захвата осталась на месте.');
