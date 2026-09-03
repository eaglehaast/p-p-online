#!/usr/bin/env node
'use strict';

// Smoke test: одно имя — одно объявление функции.
//
// Объявления функций поднимаются, и позднее молча затирает раннее. Ни ошибки, ни
// предупреждения: вызовы просто начинают попадать не туда, куда написано рядом с ними.
//
// Именно так мы потеряли динамит и мины. distancePointToSegment была объявлена дважды —
// шестиаргументная (её звали тринадцать мест) и четырёхаргументная (её звало одно).
// Побеждала вторая, тринадцать вызовов читали `.x` у числа и получали NaN. Тихо. Поверх
// этого за несколько PR наросли компенсации симптомов: буферы самобезопасности мин
// расширяли раз за разом, объясняя провалы геометрией.
//
// Этот тест ловит сам паттерн, а не его последствия.
//
// ПОПРАВКА к первой редакции этого теста. Тогда здесь было написано, что script.js
// грузится последним и потому его версии побеждают — «включая вызовы из остальных
// файлов». Это неверно, и проверено в браузере: settings.js и maps.js ЦЕЛИКОМ завёрнуты
// в IIFE, их функции вообще не попадают на window. Функции, которые есть только в
// settings.js (clampRangeStep, getPendulumAngle, setupAccuracyCrackWatcher,
// clampAccuracyIndex), на window равны undefined; функции script.js — на месте.
//
// Значит совпадение имён между settings.js и script.js НЕ перекрывает ничего: это две
// независимые копии, каждая обслуживает свой экран. Долг по сопровождению — да,
// починишь в одной, забудешь в другой. Но не тихая подмена.
//
// А защищает от подмены ровно одно: обёртка. Уберёшь её у settings.js — и 27 имён
// столкнутся в тот же миг. Поэтому обёртка проверяется здесь наравне с дублями.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Файлы, которые index.html грузит как классические скрипты, в порядке загрузки.
const GLOBAL_SCRIPTS = ['maps.js', 'settings.js', 'script.js'];
// Из них глобальную область засевает только script.js — остальные завёрнуты в IIFE.
const IIFE_WRAPPED = ['maps.js', 'settings.js'];

function declaredNames(file){
  const source = fs.readFileSync(file, 'utf8');
  const names = [];
  const re = /^(?:async )?function ([A-Za-z0-9_$]+)\(/gm;
  let m;
  while((m = re.exec(source)) !== null) names.push(m[1]);
  return names;
}

const byFile = new Map();
for(const file of GLOBAL_SCRIPTS) byFile.set(file, declaredNames(file));

// === 1. Строго: внутри одного файла имя не повторяется ===
//
// Это чистая ошибка без единого оправдания: второе объявление затирает первое в том же
// файле, и одно из двух тел не выполнится никогда.
{
  for(const [file, names] of byFile){
    const seen = new Map();
    for(const n of names) seen.set(n, (seen.get(n) || 0) + 1);
    const dups = [...seen.entries()].filter(([, c]) => c > 1).map(([n, c]) => `${n} (×${c})`);
    assert(dups.length === 0,
      `1: в ${file} одно имя объявлено дважды: ${dups.join(', ')}. `
      + 'Позднее объявление затирает раннее молча — ровно так динамит и мины перестали работать');
  }
}

// === 2. ГЛАВНОЕ: settings.js и maps.js остаются завёрнутыми в IIFE ===
//
// Вот что на самом деле держит совпадающие имена порознь. Пока файл завёрнут, его
// функции живут в своей области и на window не попадают. Развернёшь — и 27 имён,
// перечисленных ниже, столкнутся с одноимёнными из script.js в тот же миг, причём молча:
// побеждать начнёт script.js, потому что он грузится последним.
//
// Проверяется не «первая строка похожа на обёртку», а то, что внешняя скобка
// закрывается в самом конце файла. Сканер пропускает строки, шаблоны, комментарии и
// РЕГУЛЯРКИ: в settings.js есть `transform.match(/matrix\(([^)]+)\)/)`, и наивный счёт
// скобок на нём сбивается — при первой попытке сбился.
function outermostBracketClosesAtEnd(src){
  let depth = 0;
  let i = 0;
  let prev = '';
  let closedAt = -1;
  while(i < src.length){
    const c = src[i];
    const c2 = src[i + 1];
    if(c === '/' && c2 === '/'){ const n = src.indexOf('\n', i); i = n === -1 ? src.length : n; continue; }
    if(c === '/' && c2 === '*'){ const e = src.indexOf('*/', i); i = e === -1 ? src.length : e + 2; continue; }
    if(c === '"' || c === "'" || c === '`'){
      const q = c; i += 1;
      while(i < src.length){
        if(src[i] === '\\'){ i += 2; continue; }
        if(src[i] === q) break;
        i += 1;
      }
      i += 1; prev = 'value'; continue;
    }
    if(c === '/'){
      // `/` после значения — деление; иначе начало регулярки.
      if(!/^(?:value|\)|\])$/.test(prev)){
        i += 1;
        let inClass = false;
        while(i < src.length){
          if(src[i] === '\\'){ i += 2; continue; }
          if(src[i] === '[') inClass = true;
          else if(src[i] === ']') inClass = false;
          else if(src[i] === '/' && !inClass) break;
          else if(src[i] === '\n') break;
          i += 1;
        }
        i += 1; prev = 'value'; continue;
      }
      i += 1; prev = 'op'; continue;
    }
    if(c === '(' || c === '[' || c === '{'){ depth += 1; prev = 'open'; i += 1; continue; }
    if(c === ')' || c === ']' || c === '}'){
      depth -= 1;
      prev = c === ')' ? ')' : (c === ']' ? ']' : '}');
      if(depth === 0 && closedAt === -1) closedAt = i;
      i += 1; continue;
    }
    if(/[A-Za-z0-9_$]/.test(c)){
      while(i < src.length && /[A-Za-z0-9_$]/.test(src[i])) i += 1;
      prev = 'value';
      continue;
    }
    if(!/\s/.test(c)) prev = 'op';
    i += 1;
  }
  return { closedAt, depth, tail: closedAt === -1 ? null : src.slice(closedAt + 1).trim() };
}

{
  for(const file of IIFE_WRAPPED){
    const src = fs.readFileSync(file, 'utf8');
    const r = outermostBracketClosesAtEnd(src);
    assert(r.depth === 0, `2: в ${file} скобки не сходятся — сканер сбился или файл битый`);
    assert(r.closedAt !== -1 && /^\(\s*\)\s*;?$/.test(r.tail || ''),
      `2b: ${file} больше не завёрнут в IIFE целиком (после внешней скобки осталось `
      + `${JSON.stringify((r.tail || '').slice(0, 40))}). Без обёртки его функции попадут `
      + 'на window и столкнутся с одноимёнными из script.js — молча, победит script.js');
  }
  // script.js, наоборот, обёрнут быть не должен: он и есть тот файл, что засевает глобальную
  // область. Без этой проверки предыдущая прошла бы на файле, который просто пуст.
  const scriptSrc = fs.readFileSync('script.js', 'utf8');
  const rs = outermostBracketClosesAtEnd(scriptSrc);
  assert(!(rs.closedAt !== -1 && /^\(\s*\)\s*;?$/.test(rs.tail || '')),
    '2c: script.js оказался завёрнут в IIFE — тогда на window не попадёт уже ничего, '
    + 'и проверка обёртки у остальных теряет смысл');
}

// === 3. Межфайловые дубликаты не плодятся ===
//
// Пока обёртка на месте (пункт 2), эти совпадения ничего не перекрывают: это две
// независимые копии, каждая обслуживает свой экран. Но долг по сопровождению настоящий —
// починишь в одной копии, забудешь в другой, и экран настроек начнёт показывать не то,
// что делает игра.
//
// Замерено, чтобы не пугать друг друга догадками: прицельная математика у копий сходится
// до последнего знака на всех 101 значении точности и на мусорных входах. Расходятся
// только недостижимые запасные ветки. Реальная разница — в системе щипкового зума, и она
// разобрана в docs/SETTINGS_SCRIPT_DUPLICATES_MEASURED_2026-09-03.md.
//
// Список заморожен: он не даёт появиться НОВЫМ совпадениям. Уменьшать можно и нужно;
// увеличивать — нет.
const KNOWN_CROSS_FILE_DUPLICATES = new Set([
  'applyPinchTransform',
  'clamp',
  'clampAimingPercent',
  'clearPinchResetAnimation',
  'ensureAimingDebuggerBridge',
  'getActiveAimingTuning',
  'getAimingOscillationSpeed',
  'getAimingSpreadScale',
  'getPointerClientCoords',
  'getPointerDesignCoords',
  'getSpreadAngleDegByAccuracy',
  'getTouchCenterClient',
  'getTouchCenterInPercents',
  'getTouchDistance',
  'getVisualViewportState',
  'installImageWatch',
  'installPinchExitOnGameplayInput',
  'installTouchPinchZoom',
  'isPinchActive',
  'isSpriteReady',
  'isZoomExitTarget',
  'logCanvasCreation',
  'normalizeAimingTuning',
  'pinchResetEaseOutBack',
  'resetPinchState',
  'toDesignCoords',
  'updateUiFrameScale',
]);

{
  const owners = new Map();
  for(const [file, names] of byFile){
    for(const n of new Set(names)){
      if(!owners.has(n)) owners.set(n, []);
      owners.get(n).push(file);
    }
  }
  const cross = [...owners.entries()].filter(([, files]) => files.length > 1);

  const fresh = cross.filter(([n]) => !KNOWN_CROSS_FILE_DUPLICATES.has(n));
  assert(fresh.length === 0,
    `3: новое имя объявлено сразу в нескольких загружаемых файлах: `
    + fresh.map(([n, f]) => `${n} (${f.join(' + ')})`).join(', ')
    + '. Побеждает объявление из файла, который грузится последним — включая вызовы из '
    + 'остальных файлов. Либо переименуй, либо оставь одно объявление');

  // Список обязан сокращаться, а не превращаться в свалку: имена, которые уже расшили,
  // из него надо убирать, иначе он перестанет что-либо значить.
  const stale = [...KNOWN_CROSS_FILE_DUPLICATES].filter((n) => !cross.some(([c]) => c === n));
  assert(stale.length === 0,
    `3b: ${stale.join(', ')} больше не дублируется — убери имя из KNOWN_CROSS_FILE_DUPLICATES, `
    + 'иначе список превратится в свалку и перестанет ловить новое');
}

// === 4. Проверка не выродилась ===
//
// Без этого пункты выше прошли бы и на пустом списке имён — например, если регулярка
// перестанет что-либо находить после переформатирования файлов.
{
  for(const [file, names] of byFile){
    assert(names.length > 0, `4: в ${file} не найдено ни одного объявления функции — сломался разбор`);
  }
  assert(byFile.get('script.js').length > 500,
    `4b: в script.js найдено всего ${byFile.get('script.js').length} объявлений — похоже, разбор сломался`);
}

console.log('smoke-no-duplicate-function-names: OK');
