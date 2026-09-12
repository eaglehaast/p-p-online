#!/usr/bin/env node
'use strict';

// Smoke test: смена стороны в меню — это перелёт, а не подмена картинки.
//
// Устройство обратное тому, каким кажется. Картинки меняются местами МГНОВЕННО: модель и
// меню не должны расходиться ни на кадр, даже если игрок сразу после клика нажмёт «Играть».
// Поэтому перелёт не ведёт к новой картинке, а догоняет её — каждый самолётик начинает
// движение в позе СОСЕДА и приезжает в свою. В первом кадре на экране в точности прежняя
// картинка, в последнем — новая.
//
// Отсюда два свойства, которые и проверяются ниже:
//
//   перелёт всегда кончается там, где самолётик и так стоит, — значит его можно оборвать
//   в любой момент, и ничего не съедет;
//
//   первый кадр обязан совпасть с прежней картинкой — значит начальная поза берётся у
//   соседа, а не выдумывается.
//
// Проверено в браузере: снимки по ходу перелёта — самолётики расходятся дугами, проходят
// над подписью кнопки и садятся в свои места уже другого цвета.

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
const styles = fs.readFileSync('styles.css', 'utf8');

// Стенд: настоящие сборка перелёта и чтение разворота, подставные элементы.
const ЛЕВЫЙ_РАЗВОРОТ = 90;
const ПРАВЫЙ_РАЗВОРОТ = -90;
const ПРОЛЁТ = 250;

function собрать(){
  const кадры = [];
  const inner = (side) => ({
    dataset: { side },
    animate(keyframes, options){
      кадры.push({ side, keyframes, options });
      return { addEventListener(){}, cancel(){} };
    },
  });
  const plane = (side) => ({ querySelector: () => inner(side) });

  const sandbox = {
    Math, Number, Set,
    window: {
      getComputedStyle: (el) => ({
        getPropertyValue: () => (el.dataset.side === 'left'
          ? `${ЛЕВЫЙ_РАЗВОРОТ}deg`
          : `${ПРАВЫЙ_РАЗВОРОТ}deg`),
      }),
    },
    HTMLElement: Object,
  };
  vm.createContext(sandbox);
  vm.runInContext([
    source.match(/const MENU_SIDE_SWAP_MS = \d+;/)[0],
    source.match(/const MENU_SIDE_SWAP_ARC_PX = \d+;/)[0],
    source.match(/const MENU_SIDE_SWAP_EASING = "[^"]+";/)[0],
    'const menuSideSwapAnimations = new Set();',
    // Подставные проверки типов: настоящие смотрят на HTMLElement, а у нас голые объекты.
    'function getMenuPlaneInner(plane){ return plane?.querySelector?.(".mm-plane__inner") || null; }',
    extractFn(source, 'getMenuPlaneBaseRotationDeg')
      .replace('if(!(inner instanceof HTMLElement) || typeof window?.getComputedStyle !== "function"){',
        'if(!inner || typeof window?.getComputedStyle !== "function"){'),
    extractFn(source, 'playMenuPlaneSwapFlight'),
    extractFn(source, 'playMenuPlaneSwapPair'),
  ].join('\n'), sandbox);

  sandbox.playMenuPlaneSwapPair(plane('left'), plane('right'), { leftX: 100, rightX: 100 + ПРОЛЁТ });
  return кадры;
}

const разбор = (transform) => {
  const t = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(transform);
  const r = /rotate\((-?[\d.]+)deg\)/.exec(transform);
  assert(t && r, `не разобрать преобразование: «${transform}»`);
  return { dx: Number(t[1]), dy: Number(t[2]), deg: Number(r[1]) };
};

const кадры = собрать();
const левый = кадры.find((k) => k.side === 'left');
const правый = кадры.find((k) => k.side === 'right');

// === 1. ГЛАВНОЕ: перелёт начинается в позе соседа и кончается в своей ===
{
  assert(левый && правый, '1: перелёт строится не для обоих самолётиков пары');

  for(const [имя, кадр, свой, чужой, знакПролёта] of [
    ['левый', левый, ЛЕВЫЙ_РАЗВОРОТ, ПРАВЫЙ_РАЗВОРОТ, 1],
    ['правый', правый, ПРАВЫЙ_РАЗВОРОТ, ЛЕВЫЙ_РАЗВОРОТ, -1],
  ]){
    const начало = разбор(кадр.keyframes[0].transform);
    const конец = разбор(кадр.keyframes[кадр.keyframes.length - 1].transform);

    assert(начало.dx === знакПролёта * ПРОЛЁТ && начало.dy === 0,
      `1b: ${имя} начинает перелёт не на месте соседа (${начало.dx}, ${начало.dy}) — первый `
      + 'кадр разойдётся с прежней картинкой, и смена стороны будет видна подменой');
    assert(начало.deg === чужой,
      `1c: ${имя} начинает перелёт не в развороте соседа (${начало.deg}° вместо ${чужой}°)`);

    assert(конец.dx === 0 && конец.dy === 0,
      `1d: ${имя} кончает перелёт не у себя (${конец.dx}, ${конец.dy}) — оборванный перелёт `
      + 'оставит самолётик не на месте');
    assert(((конец.deg - свой) % 360 + 360) % 360 === 0,
      `1e: ${имя} кончает перелёт в развороте ${конец.deg}°, а его собственный — ${свой}°`);
  }
}

// === 2. Самолётики расходятся: разные дуги и разные стороны разворота ===
//
// Иначе оба едут одинаково, и перелёт читается сдвигом картинки, а не манёвром.
{
  const серединаЛ = разбор(левый.keyframes[1].transform);
  const серединаП = разбор(правый.keyframes[1].transform);

  assert(серединаЛ.dy !== 0 && серединаП.dy !== 0,
    '2: середина перелёта идёт по прямой — самолётики пройдут сквозь друг друга');
  assert(Math.sign(серединаЛ.dy) !== Math.sign(серединаП.dy),
    `2b: оба уходят по одну сторону (${серединаЛ.dy} и ${серединаП.dy}) — они столкнутся`);

  // Разворачиваются они через РАЗНЫЕ позы: один через нос вверх, другой через нос вниз.
  // Знак поворота при этом может совпадать — важно не куда крутит, а какие позы видно.
  const серединаПозаЛ = ((разбор(левый.keyframes[1].transform).deg % 360) + 360) % 360;
  const серединаПозаП = ((разбор(правый.keyframes[1].transform).deg % 360) + 360) % 360;
  assert(серединаПозаЛ !== серединаПозаП,
    `2c: на середине пути оба развёрнуты одинаково (${серединаПозаЛ}°) — перелёт читается `
    + 'сдвигом картинки, а не манёвром');

  const поворотЛ = разбор(левый.keyframes[2].transform).deg - разбор(левый.keyframes[0].transform).deg;
  const поворотП = разбор(правый.keyframes[2].transform).deg - разбор(правый.keyframes[0].transform).deg;
  assert(Math.abs(поворотЛ) === 180 && Math.abs(поворотП) === 180,
    `2d: разворот не на 180° (${поворотЛ}°, ${поворотП}°) — самолётик приедет боком`);

  // И середина лежит МЕЖДУ началом и концом разворота, а не где попало: иначе самолётик
  // на середине пути смотрит не туда, куда летит.
  for(const [имя, кадр] of [['левый', левый], ['правый', правый]]){
    const a = разбор(кадр.keyframes[0].transform).deg;
    const m = разбор(кадр.keyframes[1].transform).deg;
    const b = разбор(кадр.keyframes[2].transform).deg;
    assert(Math.abs(m - (a + b) / 2) < 1e-9,
      `2e: ${имя} на середине пути развёрнут на ${m}°, а между ${a}° и ${b}° середина ${(a + b) / 2}°`);
  }
}

// === 3. Сначала подмена, потом перелёт ===
//
// Порядок держит всю затею: перелёт стартует в позе соседа и потому обязан идти ПОСЛЕ
// того, как картинки уже поменялись. Наоборот — и первый кадр покажет будущее.
{
  const toggle = extractFn(source, 'toggleBoardViewSeat');
  const подмена = toggle.indexOf('syncMenuPlaneSides()');
  const перелёт = toggle.indexOf('playMenuSideSwapAnimation()');
  assert(подмена > 0, '3: смена стороны перестала менять картинки местами');
  assert(перелёт > 0, '3b: смена стороны больше не показывает перелёт');
  assert(подмена < перелёт,
    '3c: перелёт запускается ДО подмены картинок — первый его кадр покажет уже новую '
    + 'сторону, и перелёт станет лишним движением');
}

// === 4. Разворот берётся из стилей, а не помнится наизусть ===
{
  const чтение = extractFn(source, 'getMenuPlaneBaseRotationDeg');
  assert(/getPropertyValue\("--mm-plane-rotation"\)/.test(чтение),
    '4: разворот самолётика больше не читается из стилей — перелёт и покой разъедутся молча');
  assert(/#menuLayer #modeMenu \.mm-plane--left \.mm-plane__inner \{\s*--mm-plane-rotation: 90deg;/
    .test(styles)
    && /#menuLayer #modeMenu \.mm-plane--right \.mm-plane__inner \{\s*--mm-plane-rotation: -90deg;/
      .test(styles),
    '4b: развороты самолётиков в стилях перестали быть встречными');
}

// === 5. На время перелёта самолётик идёт НАД кнопкой ===
//
// В покое он лежит под ней, и на середине пути скрывался бы за подписью кнопки — то есть
// исчезал ровно там, где на него смотрят.
{
  const кнопка = /#modeMenu \.mode-menu__btn \{[\s\S]*?z-index: (\d+);/.exec(styles);
  const покой = /#menuLayer #modeMenu \.mm-plane \{[\s\S]*?z-index: (\d+);/.exec(styles);
  const перелёт = /#menuLayer #modeMenu \.mm-plane\.is-swapping \{\s*z-index: (\d+);/.exec(styles);
  assert(кнопка && покой && перелёт, '5: не найдены слои кнопки и самолётика');
  assert(Number(покой[1]) < Number(кнопка[1]),
    '5b: проверка устарела — самолётик и так лежит над кнопкой');
  assert(Number(перелёт[1]) > Number(кнопка[1]),
    `5c: на перелёте самолётик остаётся под кнопкой (${перелёт[1]} против ${кнопка[1]}) — `
    + 'он скроется за подписью на середине пути');

  const запуск = extractFn(source, 'playMenuSideSwapAnimation');
  assert(/classList\?\.add\?\.\("is-swapping"\)/.test(запуск)
    && /classList\?\.remove\?\.\("is-swapping"\)/.test(запуск),
    '5d: слой на время перелёта не поднимается или не опускается обратно');
}

// === 6. Кому движение мешает, тот его не увидит ===
{
  const запуск = extractFn(source, 'playMenuSideSwapAnimation');
  assert(/if\(isReducedMotionPreferred\(\)\) return;/.test(запуск),
    '6: перелёт играет и тем, кто просил систему обойтись без движения');
  const проверка = extractFn(source, 'isReducedMotionPreferred');
  assert(/prefers-reduced-motion: reduce/.test(проверка),
    '6b: признак «без движения» читается не у системы');
}

console.log('smoke-menu-side-swap-animation: OK');
