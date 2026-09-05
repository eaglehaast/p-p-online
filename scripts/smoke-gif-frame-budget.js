#!/usr/bin/env node
'use strict';

// Smoke test: тяжёлые анимации не тащат вдвое больше кадров, чем нужно.
//
// Пять гифок весили 1 744 КБ — и грузятся они вместе со страницей, конкурируя за канал
// с кодом игры. Первым делом я проверил смену формата, и она оказалась тупиком:
//
//   анимированный WebP без потерь   −5%
//   анимированный WebP с потерями   −25%
//   атлас из PNG-кадров             +98%, то есть ВДВОЕ ТЯЖЕЛЕЕ гифки
//
// Атлас проигрывает по понятной причине: гифка сжимает разницу между соседними кадрами,
// а атлас складывает кадры целиком и это преимущество теряет.
//
// Настоящий рычаг оказался другим — частота. Это были анимации на 120 кадров: заставка
// крутилась на 50 к/с, остальные на 25–33. Выброшен каждый второй кадр, длительность
// кадра удвоена — скорость анимации та же, изменилась только плавность:
//
//   preload_animation      121→61 кадр, 50→25 к/с, 567 КБ → 270 КБ
//   cp_cargo on_gif        121→61 кадр, 25→12 к/с, 460 КБ → 186 КБ
//   cp_range_contrail2     121→61 кадр, 25→12 к/с, 251 КБ →  95 КБ
//   cp_range_flame_trail4  120→60 кадр, 33→16 к/с, 238 КБ →  74 КБ
//   cp_range_contrail1     121→61 кадр, 25→12 к/с, 226 КБ →  85 КБ
//   ИТОГО                                         1744 КБ → 713 КБ  (−60%)
//
// Замер запуска на 600 кбит/с с задержкой 300 мс:
//
//                          было      стало
//   меню доступно          38.8 с    24.9 с
//   страница догрузилась  129.0 с   115.3 с
//   всего скачано           8.96 МБ   7.95 МБ
//
// Пересборка гифки заново строит палитру, поэтому цвет чуть плывёт: в среднем 0.4–0.9
// из 255 на пиксель. Прозрачность сохраняется точно, до нуля различий.
//
// Две маленькие гифки (cp_flags_on, cp_arcade_on2) НЕ тронуты специально: вместе они
// весят 39 КБ, а cp_arcade_on2 и так идёт на 7.7 к/с — после прореживания она стала бы
// дёрганой ради экономии в семь килобайт.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Минимальный разбор GIF: сколько кадров и какова задержка каждого.
//
// Своими руками, а не библиотекой: тест не должен зависеть от того, что стоит на машине.
// Формат простой — заголовок, потом поток блоков до байта 0x3B.
function readGif(file){
  const b = fs.readFileSync(file);
  assert(b.toString('latin1', 0, 3) === 'GIF', `${file} — не GIF`);

  let i = 13; // заголовок (6) + описание экрана (7)
  const packed = b[10];
  if(packed & 0x80) i += 3 * (2 ** ((packed & 0x07) + 1)); // глобальная палитра

  const skipSubBlocks = () => {
    while(i < b.length){
      const size = b[i];
      i += 1 + size;
      if(size === 0) return;
    }
  };

  const delays = [];
  let pendingDelay = 0;
  while(i < b.length){
    const marker = b[i];
    if(marker === 0x3B) break;                 // конец файла
    if(marker === 0x21){                       // расширение
      const label = b[i + 1];
      i += 2;
      if(label === 0xF9){                      // управление graphic control
        const size = b[i];
        pendingDelay = b.readUInt16LE(i + 2) * 10; // задержка хранится в сотых секунды
        i += 1 + size;
        skipSubBlocks();
      } else {
        skipSubBlocks();
      }
      continue;
    }
    if(marker === 0x2C){                       // кадр
      const local = b[i + 9];
      i += 10;
      if(local & 0x80) i += 3 * (2 ** ((local & 0x07) + 1));
      i += 1;                                  // размер кода LZW
      skipSubBlocks();
      delays.push(pendingDelay);
      pendingDelay = 0;
      continue;
    }
    break;                                     // мусор — дальше не идём
  }

  return { frames: delays.length, delays, bytes: b.length };
}

// Что было до прореживания — чтобы проверять не «меньше некоторого числа», а
// сохранение ДЛИТЕЛЬНОСТИ анимации.
const THINNED = [
  { file: 'preload_animation.gif',                     wasFrames: 121, wasDelayMs: 20, maxBytes: 300 * 1024 },
  { file: 'ui_controlpanel/cp_adds/cp_cargo on_gif.gif', wasFrames: 121, wasDelayMs: 40, maxBytes: 210 * 1024 },
  { file: 'ui_controlpanel/cp_range_contrail2.gif',    wasFrames: 121, wasDelayMs: 40, maxBytes: 110 * 1024 },
  { file: 'ui_controlpanel/cp_range_flame_trail4.gif', wasFrames: 120, wasDelayMs: 30, maxBytes: 90 * 1024 },
  { file: 'ui_controlpanel/cp_range_contrail1.gif',    wasFrames: 121, wasDelayMs: 40, maxBytes: 100 * 1024 },
];

// Эти не трогаем, и это тоже проверяется: прореживать их — портить ради копеек.
const LEFT_ALONE = [
  'ui_controlpanel/cp_adds/cp_flags_on.gif',
  'ui_controlpanel/cp_adds/cp_arcade_on2.gif',
];

// === 1. ГЛАВНОЕ: кадров вдвое меньше, а длительность та же ===
//
// Просто «мало кадров» проверять нельзя: так прошёл бы и вариант, где кадры выкинули,
// не тронув задержку, — тогда анимация стала бы вдвое быстрее.
{
  for(const item of THINNED){
    const gif = readGif(item.file);

    assert(gif.frames <= item.wasFrames * 0.6,
      `1: в ${item.file} снова ${gif.frames} кадров (было ${item.wasFrames}) — `
      + 'вернулась стодвадцатикадровая версия');
    assert(gif.frames >= 20,
      `1b: в ${item.file} осталось ${gif.frames} кадров — это уже не анимация, а слайд-шоу`);

    const wasTotal = item.wasFrames * item.wasDelayMs;
    const nowTotal = gif.delays.reduce((sum, d) => sum + d, 0);
    assert(Math.abs(nowTotal - wasTotal) < wasTotal * 0.1,
      `1c: ${item.file} стал идти ${nowTotal} мс вместо ${wasTotal} — выбросили кадры, `
      + 'а задержку не увеличили, и анимация поехала с другой скоростью');

    // Задержка одинаковая у всех кадров: разнобой означал бы, что файл собран иначе.
    const uniq = new Set(gif.delays);
    assert(uniq.size === 1,
      `1d: в ${item.file} задержки кадров разные (${[...uniq].join(', ')}) — `
      + 'проверь, чем пересобирали');
  }
}

// === 2. Вес не уполз обратно ===
{
  let total = 0;
  for(const item of THINNED){
    const size = fs.statSync(item.file).size;
    total += size;
    assert(size <= item.maxBytes,
      `2: ${item.file} весит ${Math.round(size / 1024)} КБ при пределе `
      + `${Math.round(item.maxBytes / 1024)} КБ`);
  }
  assert(total < 780 * 1024,
    `2b: пять анимаций весят ${Math.round(total / 1024)} КБ вместо примерно 713 — `
    + 'кадры вернулись');
}

// === 3. Прозрачность на месте ===
//
// Пересборка гифки — место, где легче всего потерять прозрачный фон: анимации лежат
// поверх панели, и без прозрачности вокруг них появится подложка.
{
  for(const item of THINNED){
    const b = fs.readFileSync(item.file);
    // В блоке graphic control младший бит упакованного байта — флаг прозрачности.
    const idx = b.indexOf(Buffer.from([0x21, 0xF9, 0x04]));
    assert(idx !== -1, `3: в ${item.file} не найден блок управления кадром`);
    assert((b[idx + 3] & 0x01) === 1,
      `3b: ${item.file} потерял прозрачность — вокруг анимации появится фон`);
  }
}

// === 4. Мелкие анимации намеренно не тронуты ===
//
// Без этого пункта следующий заход «оптимизировать всё» испортил бы их ради копеек.
{
  for(const file of LEFT_ALONE){
    const gif = readGif(file);
    assert(gif.frames > 60,
      `4: ${file} тоже проредили — вместе эти две весят 39 КБ, а дёрганья добавят заметно`);
  }
}

console.log('smoke-gif-frame-budget: OK');
