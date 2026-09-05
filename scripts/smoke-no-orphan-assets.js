#!/usr/bin/env node
'use strict';

// Smoke test: в репозитории нет картинок, на которые никто не смотрит.
//
// Игра собрана, и всё, что до сих пор не понадобилось, уже не понадобится. За время
// разработки накопились файлы, пережившие свою замену: почти всегда рядом лежит преемник с
// похожим именем, и легко ошибиться, какой из двух живой.
//
//   ui_gamescreen/gs_transfer/*.png            1007 КБ  живёт gs_transfer_2/*.webp
//   ui_gamescreen/paperwithred.png              415 КБ  живёт paperwithred2.webp
//   gs_inventory/gs_inventory_frame.png         403 КБ  живёт gs_inventory_frame_size.png
//   gamescreen_outside/clear_rotate.png         182 КБ  кнопка поворота рисуется иначе
//   ui_controlpanel/cp_de_maprandom.png          71 КБ
//   ui_controlpanel/cp_serifscale*.png           55 КБ
//   ui_controlpanel/cp_tape_accuracy.png         27 КБ
//   gamescreen_outside/circle_rotate_button.png  26 КБ
//   gs_arcade_timer/plane_timer, _2, _3          12 файлов, живёт только plane_timer_4
//   plane_timer_2 в корне                         4 файла, копия того же набора
//   gs_arcade_timer/gs_arcade_01..04.png          8 КБ
//   gs_inventory/gs_inventory_wings.png                живёт gs_inventory_wings_sharper_2
//   gs_inventory/gs_plane_*_broadwinged.png            живут broadwinged_blue/green
//   ai/v2/goalPriorityModel.js                    8 КБ  index.html его больше не грузит
//   ИТОГО                                      2242 КБ, 37 файлов
//
// На скорость загрузки это не влияет НИСКОЛЬКО: за этими файлами браузер и так не ходил.
// Смысл в другом — рядом с живым файлом больше не лежит его мёртвый двойник.
//
// Проверка идёт от файлов к коду, а не наоборот, потому что обратное направление уже
// защищено: на несуществующий файл сразу падает загрузка.
//
// Отдельная сложность — кадры анимаций: они собираются в коде по шаблону, поэтому их имена
// в исходниках не встречаются ни разу. Шаблоны здесь не переписаны руками, а вычитаны из
// script.js: поменяется длина последовательности в коде — поменяется и ожидание теста.

const fs = require('fs');
const path = require('path');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const SOURCES = ['script.js', 'settings.js', 'maps.js', 'styles.css', 'index.html', 'settings.html'];
const text = SOURCES.map(f => fs.readFileSync(f, 'utf8')).join('\n');

const ASSET_EXT = new Set(['.png', '.webp', '.gif', '.jpg', '.jpeg', '.ico', '.svg', '.woff2']);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts', 'docs', 'worker', '.github']);

function walk(dir, out = []){
  for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
    if(entry.isDirectory()){
      if(SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if(ASSET_EXT.has(path.extname(entry.name).toLowerCase())){
      out.push(path.join(dir, entry.name).replace(/^\.\//, ''));
    }
  }
  return out;
}

// Кадры, которых в исходниках нет по имени: путь собирается по шаблону. Каждый шаблон
// вычитываем из кода, чтобы тест не разошёлся с ним молча.
function templateFrames(){
  const script = fs.readFileSync('script.js', 'utf8');
  const frames = new Set();

  const add = (folder, build, count) => {
    for(let i = 1; i <= count; i += 1) frames.add(`${folder}/${build(i)}`);
  };
  const pad = i => String(i).padStart(2, '0');

  // Взрывы: папка и имя кадра лежат в двух соседних строках функции-сборщика.
  for(const fn of ['buildBlueExplosionSequenceFramePaths', 'buildGreenExplosionSequenceFramePaths']){
    const at = script.indexOf(`function ${fn}(`);
    assert(at > 0, `не найдено ${fn} — список шаблонов устарел`);
    const body = script.slice(at, at + 400);
    const folder = /const folder = "([^"]+)"/.exec(body);
    const count = /Array\.from\(\{ length: (\d+) \}/.exec(body);
    const name = /\$\{folder\}\/([a-z_0-9]+_)\$\{frame\}(\.[a-z]+)/.exec(body);
    assert(folder && count && name, `${fn} собирает путь иначе — список шаблонов устарел`);
    add(folder[1], i => `${name[1]}${pad(i)}${name[2]}`, Number(count[1]));
  }

  // Остальные последовательности собираются одной строкой прямо в шаблонной строке.
  const inline = [
    [/`(ui_gamescreen\/flames\/gs_flame_green_1)\/(flame_green_1_)\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}(\.[a-z]+)`/, /const BURNING_FLAME_FRAME_COUNT = (\d+);/],
    [/`(ui_gamescreen\/flames\/gs_flame_blue_1)\/(flame_blue_1_)\$\{String\(index \+ 1\)\.padStart\(2, '0'\)\}(\.[a-z]+)`/, /const BURNING_FLAME_FRAME_COUNT = (\d+);/],
    [/`(ui_gamescreen\/gs_cargoanimation_14_2)\/(gs_cargoanimation_)\$\{frameNumber\}(\.[a-z]+)`/, /const CARGO_ANIMATION_FRAME_COUNT = (\d+);/],
    [/`(ui_gamescreen\/gs_inventory\/gs_dynamiteexplosion_03)\/(gs_dynamiteexplosion_)\$\{frameNumber\}(\.[a-z]+)`/, /DYNAMITE_EXPLOSION_FRAME_PATHS = Array\.from\(\{ length: (\d+) \}/],
  ];
  for(const [pathRe, countRe] of inline){
    const m = pathRe.exec(script);
    const c = countRe.exec(script);
    assert(m && c, `шаблон ${pathRe.source.slice(0, 48)}… больше не совпадает — проверка устарела`);
    add(m[1], i => `${m[2]}${pad(i)}${m[3]}`, Number(c[1]));
  }

  return frames;
}

const generated = templateFrames();

// === 1. ГЛАВНОЕ: каждый файл-ресурс на что-то нужен ===
{
  const orphans = [];
  for(const file of walk('.')){
    if(generated.has(file)) continue;

    // Прямая ссылка полным путём — основной случай.
    if(text.includes(file)) continue;

    // Иконка вкладки прописана абсолютным путём для GitHub Pages: /p-p-online/favicon.ico.
    if(text.includes('/' + file)) continue;

    orphans.push(file);
  }

  assert(orphans.length === 0,
    `1: на эти файлы никто не ссылается (${orphans.length} шт, `
    + `${Math.round(orphans.reduce((s, f) => s + fs.statSync(f).size, 0) / 1024)} КБ):\n   `
    + orphans.join('\n   ')
    + '\n   Либо файл забыли подключить, либо он пережил свою замену и его пора убрать.');
}

// === 2. Удалённые двойники не вернулись, а их живые сменщики на месте ===
//
// Пункт 1 поймал бы возвращение мёртвого файла только если на него по-прежнему никто не
// ссылается. Но ошибка бывает и обратная: вернуть старый файл И переключить на него код.
{
  const REPLACED = [
    ['ui_gamescreen/gs_transfer/gs_transfer_back.png', 'ui_gamescreen/gs_transfer_2/gs_transfer_back.webp'],
    ['ui_gamescreen/paperwithred.png', 'ui_gamescreen/paperwithred2.webp'],
    ['ui_gamescreen/gs_inventory/gs_inventory_frame.png', 'ui_gamescreen/gs_inventory/gs_inventory_frame_size.png'],
    ['ui_gamescreen/gs_inventory/gs_inventory_wings.png', 'ui_gamescreen/gs_inventory/gs_inventory_wings_sharper_2.png'],
    ['ui_gamescreen/gs_inventory/gs_plane_blue_broadwinged.png', 'ui_gamescreen/gs_inventory/broadwinged_blue.png'],
    ['ui_gamescreen/gs_arcade_timer/plane_timer/arcade_timer_1.png', 'ui_gamescreen/gs_arcade_timer/plane_timer_4/arcade_timer_1.png'],
  ];
  for(const [dead, alive] of REPLACED){
    assert(!fs.existsSync(dead),
      `2: ${dead} вернулся. Живёт ${alive} — рядом не должно лежать двойника, на котором `
      + 'легко ошибиться');
    assert(fs.existsSync(alive), `2b: пропал живой файл ${alive}`);
    assert(text.includes(alive), `2c: на ${alive} больше нет ссылки`);
  }

  // Старая модель приоритетов целей не грузится с апреля, но лежала в репозитории.
  assert(!fs.existsSync('ai/v2/goalPriorityModel.js'),
    '2d: ai/v2/goalPriorityModel.js вернулся — index.html его не подключает');
  assert(/legacy goalPriorityModel\.js removed/.test(fs.readFileSync('index.html', 'utf8')),
    '2e: пропала пометка в index.html о том, что старая модель больше не грузится');
}

console.log('smoke-no-orphan-assets: OK');
