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
// Два уровня строгости, и разница между ними важна.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Файлы, которые index.html грузит как классические скрипты — они делят одну глобальную
// область, поэтому одноимённые функции в них конфликтуют между собой так же, как внутри
// одного файла. Порядок здесь тот же, что в index.html: побеждает последний.
const GLOBAL_SCRIPTS = ['maps.js', 'settings.js', 'script.js'];

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

// === 1. ГЛАВНОЕ: внутри одного файла имя не повторяется ===
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

// === 2. Межфайловые дубликаты не плодятся ===
//
// Здесь строгости пока меньше, и честно почему: script.js и settings.js уже делят 27
// имён, и у 15 из них РАЗНЫЕ тела. script.js грузится последним, значит его версии
// побеждают — в том числе для кода внутри settings.js, когда тот вызывает функцию после
// загрузки страницы. Разбирать это надо отдельно и по одному.
//
// Список ниже заморожен: он не даёт появиться НОВЫМ совпадениям, пока разбираются старые.
// Уменьшать его можно и нужно; увеличивать — нет.
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
    `2: новое имя объявлено сразу в нескольких загружаемых файлах: `
    + fresh.map(([n, f]) => `${n} (${f.join(' + ')})`).join(', ')
    + '. Побеждает объявление из файла, который грузится последним — включая вызовы из '
    + 'остальных файлов. Либо переименуй, либо оставь одно объявление');

  // Список обязан сокращаться, а не превращаться в свалку: имена, которые уже расшили,
  // из него надо убирать, иначе он перестанет что-либо значить.
  const stale = [...KNOWN_CROSS_FILE_DUPLICATES].filter((n) => !cross.some(([c]) => c === n));
  assert(stale.length === 0,
    `2b: ${stale.join(', ')} больше не дублируется — убери имя из KNOWN_CROSS_FILE_DUPLICATES, `
    + 'иначе список превратится в свалку и перестанет ловить новое');
}

// === 3. Проверка не выродилась ===
//
// Без этого пункты выше прошли бы и на пустом списке имён — например, если регулярка
// перестанет что-либо находить после переформатирования файлов.
{
  for(const [file, names] of byFile){
    assert(names.length > 0, `3: в ${file} не найдено ни одного объявления функции — сломался разбор`);
  }
  assert(byFile.get('script.js').length > 500,
    `3b: в script.js найдено всего ${byFile.get('script.js').length} объявлений — похоже, разбор сломался`);
}

console.log('smoke-no-duplicate-function-names: OK');
