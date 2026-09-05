#!/usr/bin/env node
'use strict';

// Smoke test: анимации не тяжелее, чем нужно их окошкам.
//
// Пять гифок весили 1 744 КБ и грузятся вместе со страницей, конкурируя за канал с кодом
// игры. Первым делом проверена смена формата — тупик:
//
//   анимированный WebP без потерь   −5%
//   анимированный WebP с потерями   −25%
//   атлас из PNG-кадров             +98%, то есть ВДВОЕ ТЯЖЕЛЕЕ гифки
//
// Атлас проигрывает по понятной причине: гифка сжимает разницу между соседними кадрами,
// а атлас складывает кадры целиком и это преимущество теряет.
//
// Рычагов оказалось ДВА, и второй важнее первого.
//
// Первый — частота: это были анимации на 120 кадров, заставка крутилась на 50 к/с.
//
// Второй — РАЗМЕР. Замер в браузере показал, во что эти картинки попадают на самом деле:
//
//   contrail1     274x51  в окошко  41x6    избыточность x5.7
//   contrail2     281x45  в окошко  41x6    избыточность x5.9
//   flame_trail   100x73  в окошко  46x14   избыточность x3.0
//   cargo         150x150 в окошко  49x49   избыточность x3.1
//   flags_on       49x49  в окошко  49x49   ровно впору
//   заставка      175x175 показ    240x240  НЕ ХВАТАЕТ, x0.6
//
// Целевой размер берётся как окошко, умноженное на три: этого хватает телефону с
// плотностью экрана 3, а больше нет смысла.
//
// Итог по каждому файлу:
//
//   contrail1     274x51→123x23, 121→41 кадр, 226 КБ → 27 КБ
//   contrail2     281x45→123x20, 121→41 кадр, 251 КБ → 29 КБ
//   flame_trail   100x73→100x42, 120→40 кадр, 238 КБ → 45 КБ
//   заставка      175x175 как была, 121→61 кадр, 567 КБ → 270 КБ
//   cargo         НЕ ТРОНУТ, 460 КБ
//   ИТОГО                                    1783 КБ → 875 КБ  (−51%)
//
// Почему cargo не тронут. Прореживание кадров ему повредило — это увидел владелец, и
// замер объясняет почему: холст 150x150, а сам рисунок внутри всего 68x127, и CSS ещё
// сплющивает его в окошко 49x49. То есть на экране видно около 22x41 точки, а на телефоне
// с плотностью 3 это 66x123 — ровно столько, сколько в исходнике и есть. Запаса нет ни по
// размеру, ни по плавности.
//
// Замер запуска на 600 кбит/с с задержкой 300 мс подтверждает, ради чего всё делалось.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Минимальный разбор GIF: сколько кадров, какие задержки, какого размера холст.
//
// Своими руками, а не библиотекой: тест не должен зависеть от того, что стоит на машине.
// Разборщик сверен с Pillow — сходится до кадра и до миллисекунды.
function readGif(file){
  const b = fs.readFileSync(file);
  assert(b.toString('latin1', 0, 3) === 'GIF', `${file} — не GIF`);

  const width = b.readUInt16LE(6);
  const height = b.readUInt16LE(8);

  let i = 13;
  const packed = b[10];
  if(packed & 0x80) i += 3 * (2 ** ((packed & 0x07) + 1));

  const skipSubBlocks = () => {
    while(i < b.length){
      const size = b[i];
      i += 1 + size;
      if(size === 0) return;
    }
  };

  const delays = [];
  let pendingDelay = 0;
  let transparent = false;
  while(i < b.length){
    const marker = b[i];
    if(marker === 0x3B) break;
    if(marker === 0x21){
      const label = b[i + 1];
      i += 2;
      if(label === 0xF9){
        const size = b[i];
        if(b[i + 1] & 0x01) transparent = true;
        pendingDelay = b.readUInt16LE(i + 2) * 10;
        i += 1 + size;
        skipSubBlocks();
      } else {
        skipSubBlocks();
      }
      continue;
    }
    if(marker === 0x2C){
      const local = b[i + 9];
      i += 10;
      if(local & 0x80) i += 3 * (2 ** ((local & 0x07) + 1));
      i += 1;
      skipSubBlocks();
      delays.push(pendingDelay);
      pendingDelay = 0;
      continue;
    }
    break;
  }

  return { width, height, frames: delays.length, delays, transparent, bytes: b.length };
}

// Размер окошка читаем ИЗ СТИЛЕЙ, а не держим копию здесь: иначе окошко поменяют, а тест
// продолжит сверяться со старым числом и ничего не заметит.
const styles = fs.readFileSync('styles.css', 'utf8');
function cssBox(selector){
  const at = styles.indexOf(selector);
  assert(at !== -1, `в стилях не найден ${selector} — проверка размеров устарела`);
  const block = styles.slice(at, styles.indexOf('}', at));
  const w = /width:\s*(\d+)px/.exec(block);
  const h = /height:\s*(\d+)px/.exec(block);
  assert(w && h, `у ${selector} нет размеров в пикселях`);
  return { w: Number(w[1]), h: Number(h[1]) };
}

// Больше трёх точек исходника на точку макета не нужно даже телефону с плотностью 3.
const DPR_HEADROOM = 3;

const FITTED = [
  {
    file: 'ui_controlpanel/cp_range_contrail1.gif',
    box: () => cssBox('.settings-container #range_frame_visual .contrail-container {'),
    wasFrames: 121, wasDelayMs: 40, maxBytes: 40 * 1024,
  },
  {
    file: 'ui_controlpanel/cp_range_contrail2.gif',
    box: () => cssBox('.settings-container #range_frame_visual .contrail-container {'),
    wasFrames: 121, wasDelayMs: 40, maxBytes: 45 * 1024,
  },
  {
    file: 'ui_controlpanel/cp_range_flame_trail4.gif',
    box: () => cssBox('.settings-container #range_frame_visual .jet-flame--trail {'),
    wasFrames: 120, wasDelayMs: 30, maxBytes: 60 * 1024,
  },
];

// === 1. ГЛАВНОЕ: картинка не крупнее, чем нужно её окошку ===
{
  for(const item of FITTED){
    const gif = readGif(item.file);
    const box = item.box();
    const limitW = box.w * DPR_HEADROOM;
    const limitH = box.h * DPR_HEADROOM;

    assert(gif.width <= limitW,
      `1: ${item.file} шириной ${gif.width} точек при окошке ${box.w} — это ${(gif.width / box.w).toFixed(1)} `
      + `точки исходника на точку макета, хватает ${DPR_HEADROOM}`);
    assert(gif.height <= limitH,
      `1b: ${item.file} высотой ${gif.height} точек при окошке ${box.h} — `
      + `${(gif.height / box.h).toFixed(1)} против ${DPR_HEADROOM} нужных`);

    // И не наоборот: слишком мелкий исходник будет мылом на телефоне.
    assert(gif.width >= box.w * 2,
      `1c: ${item.file} шириной ${gif.width} точек при окошке ${box.w} — на плотном экране размылится`);
  }
}

// === 2. Кадров меньше, а длительность анимации прежняя ===
//
// Просто «мало кадров» проверять нельзя: так прошёл бы и вариант, где кадры выкинули,
// не тронув задержку, — тогда анимация стала бы идти быстрее.
{
  for(const item of FITTED.concat([{ file: 'preload_animation.gif', wasFrames: 121, wasDelayMs: 20 }])){
    const gif = readGif(item.file);

    assert(gif.frames <= item.wasFrames * 0.6,
      `2: в ${item.file} снова ${gif.frames} кадров из ${item.wasFrames} — кадры вернулись`);
    assert(gif.frames >= 20,
      `2b: в ${item.file} осталось ${gif.frames} кадров — это уже не анимация, а слайд-шоу`);

    const wasTotal = item.wasFrames * item.wasDelayMs;
    const nowTotal = gif.delays.reduce((sum, d) => sum + d, 0);
    assert(Math.abs(nowTotal - wasTotal) < wasTotal * 0.1,
      `2c: ${item.file} идёт ${nowTotal} мс вместо ${wasTotal} — выбросили кадры, а задержку `
      + 'не увеличили, и анимация поехала с другой скоростью');

    const uniq = new Set(gif.delays);
    assert(uniq.size === 1,
      `2d: в ${item.file} задержки кадров разные (${[...uniq].join(', ')}) — проверь, чем пересобирали`);
  }
}

// === 3. Прозрачность на месте ===
//
// Пересборка гифки — место, где легче всего потерять прозрачный фон: анимации лежат
// поверх панели, и без прозрачности вокруг них появится подложка.
{
  for(const file of FITTED.map(x => x.file).concat(['preload_animation.gif'])){
    assert(readGif(file).transparent,
      `3: ${file} потерял прозрачность — вокруг анимации появится фон`);
  }
}

// === 4. Вес не уполз обратно ===
{
  for(const item of FITTED){
    const size = fs.statSync(item.file).size;
    assert(size <= item.maxBytes,
      `4: ${item.file} весит ${Math.round(size / 1024)} КБ при пределе ${Math.round(item.maxBytes / 1024)} КБ`);
  }
  assert(fs.statSync('preload_animation.gif').size <= 300 * 1024,
    '4b: заставка загрузки снова тяжелее 300 КБ, а она на критическом пути по определению');
}

// === 5. Три анимации НЕ тронуты, и это тоже решение ===
//
// cargo: прореживание ему повредило, а запаса по размеру нет — рисунок внутри холста
// всего 68x127 и на плотном экране занимает ровно столько же точек.
// flags_on: исходник уже точно по окошку.
// arcade_on2: идёт на 7.7 к/с, после прореживания стал бы дёрганым ради семи килобайт.
{
  const untouched = [
    ['ui_controlpanel/cp_adds/cp_cargo on_gif.gif', 121, 'прореживание портит анимацию, а запаса по размеру нет'],
    ['ui_controlpanel/cp_adds/cp_flags_on.gif', 102, 'исходник ровно по окошку'],
    ['ui_controlpanel/cp_adds/cp_arcade_on2.gif', 82, 'и так идёт на 7.7 к/с'],
  ];
  for(const [file, frames, why] of untouched){
    const gif = readGif(file);
    assert(gif.frames === frames,
      `5: ${file} тоже проредили (${gif.frames} кадров вместо ${frames}) — его не трогают, потому что ${why}`);
  }
}

console.log('smoke-gif-frame-budget: OK');
