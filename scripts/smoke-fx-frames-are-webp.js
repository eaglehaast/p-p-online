#!/usr/bin/env node
'use strict';

// Smoke test: кадры взрывов и пламени лежат в WebP, и при этом их не стало ни меньше,
// ни мельче.
//
// Это главные анимации игры — они показываются чаще всего, и их рисовали руками. Поэтому
// правило здесь жёстче обычного: трогать разрешено ТОЛЬКО формат файла. Ни количество
// кадров, ни скорость, ни размер кадра.
//
// Четыре последовательности весили 3 152 КБ — это больше, чем все тринадцать фонов вместе
// после их перевода в WebP:
//
//   взрыв синего     25 кадров 320x320   1303 КБ →  638 КБ   −51%
//   взрыв зелёного   25 кадров 320x320    919 КБ →  582 КБ   −37%
//   пламя синего     15 кадров 320x320    466 КБ →  171 КБ   −63%
//   пламя зелёного   15 кадров 320x320    465 КБ →  179 КБ   −61%
//   ИТОГО            80 кадров           3152 КБ → 1569 КБ   −50%
//
// Качество 88 выбрано так же, как для фонов, и показано владельцу образцами в натуральную
// величину на бумаге поля. Отличие замерялось на самом детальном кадре каждой
// последовательности, уже уменьшенном до экранного размера и положенном на бумагу, то есть
// сравнивалось ровно то, что видит глаз: среднее отклонение точки 0.42–2.53 из 255.
//
// Почему размер кадра НЕ уменьшен, хотя запас есть. Взрыв рисуется в 50 точках макета,
// пламя в 36; на телефоне с плотностью 3 это 150 и 108 точек против 320 в исходнике, то
// есть запас x2.1 и x3.0. Вариант 160x160 был посчитан и показан: он давал ещё 646 КБ, но
// среднее отклонение росло вдвое (до 5.60), худшая точка со 108 до 155, и владелец сказал,
// что это уже видно. Кроме того, у взрыва есть отладочный масштаб explosionSizeScale до 2 —
// при исходнике 160 он ушёл бы в мыло.

const fs = require('fs');
const path = require('path');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');

// Размер холста WebP. Читаем сами, а не библиотекой: тест не должен зависеть от того, что
// стоит на машине. Pillow с прозрачностью пишет расширенный формат VP8X, где размеры лежат
// как «ширина минус один» тремя байтами.
function readWebpSize(file){
  const b = fs.readFileSync(file);
  assert(b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
    `${file} не WebP — внутри что-то другое`);
  assert(b.toString('latin1', 12, 16) === 'VP8X',
    `${file} без блока VP8X — значит потерялась прозрачность, а кадры лежат поверх поля`);
  const width = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
  const height = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
  return { width, height, bytes: b.length };
}

// Кадры собираются в коде по шаблону, поэтому имена файлов в script.js целиком не
// встречаются. Держим здесь ровно тот же шаблон и сверяем оба конца.
const SEQUENCES = [
  { title: 'взрыв синего', dir: 'ui_gamescreen/gs_blue_explosion11',
    name: i => `explosion_blue_1_${String(i).padStart(2, '0')}.webp`, frames: 25, maxKb: 700 },
  { title: 'взрыв зелёного', dir: 'ui_gamescreen/gs_green_explosion_one',
    name: i => `explosion_green_3_${String(i).padStart(2, '0')}.webp`, frames: 25, maxKb: 650 },
  { title: 'пламя синего', dir: 'ui_gamescreen/flames/gs_flame_blue_1',
    name: i => `flame_blue_1_${String(i).padStart(2, '0')}.webp`, frames: 15, maxKb: 220 },
  { title: 'пламя зелёного', dir: 'ui_gamescreen/flames/gs_flame_green_1',
    name: i => `flame_green_1_${String(i).padStart(2, '0')}.webp`, frames: 15, maxKb: 230 },
];

const SOURCE_SIDE = 320;

// === 1. ГЛАВНОЕ: кадров столько же, и каждый прежнего размера ===
//
// Это и есть условие владельца. Если однажды кто-то решит «заодно проредить» или «заодно
// ужать вдвое», спор пойдёт здесь, а не в игре.
{
  let total = 0;
  for(const seq of SEQUENCES){
    const listed = fs.readdirSync(seq.dir).filter(name => name.endsWith('.webp'));
    assert(listed.length === seq.frames,
      `1: в ${seq.dir} лежит ${listed.length} кадров вместо ${seq.frames} — ${seq.title} `
      + 'проредили');

    let seqBytes = 0;
    for(let i = 1; i <= seq.frames; i += 1){
      const file = path.join(seq.dir, seq.name(i));
      assert(fs.existsSync(file), `1b: нет кадра ${file} — в анимации будет дырка`);

      const size = readWebpSize(file);
      assert(size.width === SOURCE_SIDE && size.height === SOURCE_SIDE,
        `1c: ${file} стал ${size.width}x${size.height} вместо ${SOURCE_SIDE}x${SOURCE_SIDE}. `
        + 'Разрешение этих анимаций не трогают: взрыв тянется отладочным масштабом до x2, '
        + 'а на плотном экране запас и так всего x2.1');
      seqBytes += size.bytes;
    }

    assert(seqBytes <= seq.maxKb * 1024,
      `1d: ${seq.title} весит ${Math.round(seqBytes / 1024)} КБ при пределе ${seq.maxKb} КБ — `
      + 'качество подняли обратно');
    total += seqBytes;
  }

  assert(total < 1700 * 1024,
    `1e: все четыре последовательности весят ${Math.round(total / 1024)} КБ вместо примерно 1569`);
}

// === 2. PNG не осталось ни на диске, ни в ссылках ===
//
// Держать оба набора — значит не выиграть ничего: кадры строятся по шаблону, и одна забытая
// точка в расширении уронит всю анимацию молча, картинка просто не появится.
{
  for(const seq of SEQUENCES){
    for(const file of fs.readdirSync(seq.dir)){
      assert(file.endsWith('.webp'),
        `2: в ${seq.dir} появился ${file} — кроме кадров WebP там ничего быть не должно`);
    }
    assert(!script.includes(`${seq.dir}/`) || !new RegExp(`${seq.dir}[^"'\`]*\\.png`).test(script),
      `2b: на PNG-кадры ${seq.title} снова есть ссылка`);
  }
}

// === 3. Шаблоны путей в коде ведут именно на WebP ===
//
// Пункты 1 и 2 прошли бы и на варианте «файлы перевели, а код по-прежнему просит .png».
{
  const templates = [
    [/explosion_blue_1_\$\{frame\}\.webp/, 'кадры взрыва синего'],
    [/explosion_green_3_\$\{frame\}\.webp/, 'кадры взрыва зелёного'],
    [/flame_blue_1_\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}\.webp/, 'кадры пламени синего'],
    [/flame_green_1_\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}\.webp/, 'кадры пламени зелёного'],
  ];
  for(const [re, what] of templates){
    assert(re.test(script), `3: ${what} собираются не из WebP — анимация не покажется`);
  }
}

// === 4. Скорость и длина анимаций не тронуты ===
//
// Это отдельное условие владельца, и оно про код, а не про файлы: прореживание можно
// устроить и не удаляя кадров — достаточно поменять счётчик или задержку.
{
  const flameCount = /const BURNING_FLAME_FRAME_COUNT = (\d+);/.exec(script);
  assert(flameCount && Number(flameCount[1]) === 15,
    `4: пламя стало ${flameCount ? flameCount[1] : '?'} кадров вместо 15`);

  const flameDelay = /const FLAME_FRAME_DURATION_MS = (\d+);/.exec(script);
  assert(flameDelay && Number(flameDelay[1]) === 140,
    `4b: кадр пламени держится ${flameDelay ? flameDelay[1] : '?'} мс вместо 140 — `
    + 'анимация пойдёт с другой скоростью');

  for(const fn of ['buildBlueExplosionSequenceFramePaths', 'buildGreenExplosionSequenceFramePaths']){
    const at = script.indexOf(`function ${fn}(`);
    assert(at > 0, `4c: не найдено ${fn} — проверка устарела`);
    const body = script.slice(at, at + 300);
    assert(/Array\.from\(\{ length: 25 \}/.test(body),
      `4d: ${fn} строит не 25 кадров — взрыв проредили`);
  }

  // Размер отрисовки тоже прежний: если его увеличат, запаса по разрешению станет меньше,
  // и пункт 1c перестанет быть достаточной защитой.
  const drawSize = /const EXPLOSION_DRAW_SIZE = (\d+);/.exec(script);
  assert(drawSize && Number(drawSize[1]) <= 106,
    `4e: взрыв рисуется в ${drawSize ? drawSize[1] : '?'} точках макета — при плотности 3 это `
    + 'больше 320 точек, и исходника уже не хватит');

  const flameBox = /const BASE_FLAME_DISPLAY_SIZE = \{ width: (\d+), height: (\d+) \};/.exec(script);
  assert(flameBox && Number(flameBox[1]) <= 106 && Number(flameBox[2]) <= 106,
    '4f: пламя рисуется крупнее, чем позволяет исходник 320x320 на плотном экране');
}

console.log('smoke-fx-frames-are-webp: OK');
