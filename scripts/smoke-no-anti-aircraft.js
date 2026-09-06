#!/usr/bin/env node
'use strict';

// Smoke test: механики ПВО в игре нет — ни кода, ни фазы, ни настройки.
//
// Она была ВЫКЛЮЧЕНА флагом, но не удалена, и это худшее из состояний: поставить зенитку
// нельзя, а обслуживание идёт полным ходом. Замер в живой партии, все функции обёрнуты
// счётчиками, десять ходов против компьютера:
//
//   isAAPlacementEnabled        1 вызов, вернула false
//   handleAAPlacement           0
//   updateAAPreviewFromEvent    0
//   isValidAAPlacement          0
//   placeAA                     0
//   drawAAPlacementZone       938   каждый кадр
//   drawAAPreview             938   каждый кадр
//   drawAAUnits               938   каждый кадр
//   handleAAForPlane         7504   на каждый летящий самолёт
//   зениток на поле             0   всегда
//
// То есть 10 318 вызовов за партию впустую, и весь путь установки недостижим: фазу
// AA_PLACEMENT ставили под условием isAAPlacementEnabled(), а та начиналась с
// !AA_PLACEMENT_TEMP_DISABLED при жёстко заданном true.
//
// Переключателя #addAAToggle в разметке не было вообще, то есть addAAToggle в settings.js
// всегда был null и все его обработчики мертвы. Своих картинок у ПВО нет — зенитки
// рисовались кодом.
//
// Удалено: фаза установки со всеми ветками во вводе, предпросмотр, проверка места,
// отрисовка зениток и радарной развёртки, попадания по зениткам и от них, поле aa в снимке
// партии, настройка addAA во всех трёх местах (значения по умолчанию, хранилище, список
// настроек комнаты) и мёртвый переключатель. Минус 421 строка в script.js и 19 в
// settings.js.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Тело функции берём по скобкам, а не куском фиксированной длины: startNewRound длиннее
// пяти тысяч знаков, и окно «на глаз» уже один раз промахнулось мимо нужной строки.
function extractFn(name){
  const at = script.indexOf(`function ${name}(`);
  assert(at > 0, `не найдено: ${name} — проверка устарела`);
  const open = script.indexOf('{', script.indexOf(')', at));
  let depth = 0;
  for(let i = open; i < script.length; i += 1){
    if(script[i] === '{') depth += 1;
    if(script[i] === '}'){ depth -= 1; if(depth === 0) return script.slice(at, i + 1); }
  }
  throw new Error(`не закрыто: ${name}`);
}

const script = fs.readFileSync('script.js', 'utf8');
const settings = fs.readFileSync('settings.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const settingsHtml = fs.readFileSync('settings.html', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');

// === 1. ГЛАВНОЕ: ни одного имени механики не осталось ===
//
// Проверяем по именам, а не по одному признаку: подсистема была большая, и вернуться она
// может любым куском.
{
  const dead = [
    'AA_DEFAULTS', 'AA_HIT_RADIUS', 'AA_TRAIL_MS', 'AA_PLACEMENT_TEMP_DISABLED',
    'AA_MIN_DIST_FROM_OPPONENT_BASE', 'AA_MIN_DIST_FROM_EDGES',
    'AA_PLACEMENT', 'aaUnits', 'aaPlacementPreview', 'aaPreviewTrail', 'aaPointerDown',
    'isAAPlacementEnabled', 'handleAAPlacement', 'updateAAPreviewFromEvent',
    'isValidAAPlacement', 'placeAA', 'drawAAPlacementZone', 'drawAAPreview',
    'drawAAUnits', 'handleAAForPlane', 'addAA',
  ];
  for(const [name, source] of [['script.js', script], ['settings.js', settings]]){
    for(const token of dead){
      assert(!source.includes(token),
        `1: в ${name} вернулось «${token}» — механика ПВО удалена целиком`);
    }
  }
}

// === 2. В разметке и стилях тоже пусто ===
//
// Переключателя там и не было, но добавить его обратно — самый простой способ воскресить
// половину механики.
{
  for(const [name, source] of [['index.html', indexHtml], ['settings.html', settingsHtml],
                               ['styles.css', styles]]){
    for(const token of ['addAA', 'aaToggle', 'anti-aircraft', 'antiAircraft']){
      assert(!source.includes(token), `2: в ${name} вернулось «${token}»`);
    }
  }
}

// === 3. Фаза раунда упрощена, а не спрятана ===
//
// Условный переход на фазу установки был единственным входом в неё. Если условие вернётся,
// вернётся и вся ветка, а тесты выше её не увидят: имена-то можно назвать иначе.
{
  const body = extractFn('startNewRound');
  assert(/phase = 'TURN';\n\s*currentPlacer = null;/.test(body),
    '3b: раунд больше не начинается сразу с хода — появилась фаза перед ним');

  assert(/let phase = "MENU"; \/\/ MENU \| ROUND_START \| TURN \| ROUND_END/.test(script),
    '3c: список фаз в комментарии разошёлся с кодом');
}

// === 4. Живое НЕ задето: попадания по пути остались ===
//
// Проверка попаданий от ПВО стояла в цикле полёта рядом с миной и тараном, между ними и
// обновлением прошлого положения. Убирая её, легко утащить соседей.
{
  const at = script.indexOf('// трейл');
  assert(at > 0, '4: цикл полёта не найден — проверка устарела');
  const loop = script.slice(at, at + 3000);

  assert(loop.includes('checkPlaneHits(p, fp)'), '4b: пропала проверка тарана');
  assert(loop.includes('handleMineForPlane(p, fp)'), '4c: пропала проверка мин');
  assert(loop.indexOf('p.prevX = p.x; p.prevY = p.y;') > loop.indexOf('handleMineForPlane(p, fp)'),
    '4d: прошлое положение снова обновляется до проверок — самолёты начнут перепрыгивать мины');
}

// === 5. Живое НЕ задето: снимок партии и остальные настройки ===
{
  const snapshot = extractFn('serializeMatchState');
  // Поля записаны по-разному: часть сокращённо (planes), часть со значением (mines:).
  for(const field of ['planes', 'mines', 'cargo', 'flags', 'inventory']){
    assert(new RegExp(`^\\s{4}${field}[,:]`, 'm').test(snapshot),
      `5b: из снимка партии пропало поле ${field}`);
  }
  assert(!/^\s{4}aa[,:]/m.test(snapshot), '5c: поле зениток вернулось в снимок');

  // Настройки комнаты перечислены поимённо; addAA оттуда убран, остальные на месте.
  const keys = /const ONLINE_ROOM_SETTING_KEYS = Object\.freeze\(\[[\s\S]*?\]\);/.exec(script);
  assert(keys, '5d: список настроек комнаты не найден');
  for(const key of ['flightRangeCells', 'accuracyPercent', 'sharpEdges', 'flagsEnabled',
                    'addCargo', 'arcadeMode', 'mapIndex']){
    assert(keys[0].includes(`"${key}"`), `5e: из настроек комнаты пропало ${key}`);
  }
}

console.log('smoke-no-anti-aircraft: OK');
