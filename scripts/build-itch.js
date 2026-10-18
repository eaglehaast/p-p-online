#!/usr/bin/env node
'use strict';

// Сборка архива для itch.io.
//
// Игра — статика, и itch просит ровно одного: zip, в корне которого лежит index.html.
// Всё остальное он отдаёт как есть, внутри рамки на своём домене. Поэтому в архив
// кладётся только то, что игра просит у сервера, и ни одного пути, привязанного к
// чужому адресу: на github.io страница лежит в каталоге /p-p-online/, на itch — в
// корне, и абсолютный путь там даёт 404 (так и попался значок вкладки).
//
// Список ниже — руками, и это не лень: пути живут и в CSS, и в строках JS, и выводить
// их разбором файлов значит написать второй браузер. Вместо этого архив ПРОВЕРЯЕТСЯ
// прогоном: собранное отдаётся обычным статическим сервером, игра открывается,
// разыгрывается партия, и каждый неотданный файл виден в журнале сервера.
//
// Запуск:  node scripts/build-itch.js
// Выход:   dist/inky-planes-itch.zip

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Всё, что игра просит у сервера.
const НУЖНОЕ = [
  'index.html',        // itch требует его в корне архива
  'script.js',
  'styles.css',
  'maps.js',
  'settings.js',
  'favicon.ico',
  'preload_animation.gif',
  'letterbox2.webp',
  'sprite_ copy.png',  // атлас стрелки прицела; имя с пробелом — как в коде
  'fonts',             // шрифты свои: на чужой домен за ними не ходим
  'ui_gamescreen',     // доска, самолёты, кирпичи, карты (ui_gamescreen/maps)
  'ui_controlpanel',
  'ui_mainmenu',
];

// В архив НЕ идёт: scripts (проверки), worker (ретранслятор, он живёт в облаке),
// docs, .github, README и прочее сопровождение. Это не экономия места ради места:
// лишние файлы на чужой площадке — лишние вопросы.

function скопировать(откуда, куда){
  const сведения = fs.statSync(откуда);
  if(сведения.isDirectory()){
    fs.mkdirSync(куда, { recursive: true });
    for(const имя of fs.readdirSync(откуда)){
      скопировать(path.join(откуда, имя), path.join(куда, имя));
    }
    return;
  }
  fs.mkdirSync(path.dirname(куда), { recursive: true });
  fs.copyFileSync(откуда, куда);
}

function размер(путь){
  let всего = 0;
  const обойти = (п) => {
    const с = fs.statSync(п);
    if(с.isDirectory()){ for(const имя of fs.readdirSync(п)) обойти(path.join(п, имя)); return; }
    всего += с.size;
  };
  обойти(путь);
  return всего;
}

function мегабайты(байты){
  return `${(байты / (1024 * 1024)).toFixed(1)} МБ`;
}

const корень = process.cwd();
const сборка = path.join(корень, 'dist', 'itch');
const архив = path.join(корень, 'dist', 'inky-planes-itch.zip');

fs.rmSync(path.join(корень, 'dist'), { recursive: true, force: true });
fs.mkdirSync(сборка, { recursive: true });

const пропущено = [];
for(const имя of НУЖНОЕ){
  const откуда = path.join(корень, имя);
  if(!fs.existsSync(откуда)){ пропущено.push(имя); continue; }
  скопировать(откуда, path.join(сборка, имя));
}

if(пропущено.length){
  console.error('Не найдено, а должно быть:', пропущено.join(', '));
  process.exit(1);
}

// itch открывает архив и ищет index.html в его корне. Если он окажется в подпапке,
// страница не откроется вовсе — проверяем прямо здесь.
if(!fs.existsSync(path.join(сборка, 'index.html'))){
  console.error('index.html не в корне сборки — itch такой архив не откроет');
  process.exit(1);
}

execFileSync('zip', ['-r', '-q', архив, '.'], { cwd: сборка });

console.log('Собрано:', path.relative(корень, архив));
console.log('  файлов внутри:', execFileSync('unzip', ['-l', архив], { encoding: 'utf8' })
  .trim().split('\n').pop().trim());
console.log('  распакованным:', мегабайты(размер(сборка)));
console.log('  архивом:', мегабайты(fs.statSync(архив).size));
console.log('');
console.log('Дальше вручную, на itch.io:');
console.log('  Kind of project: HTML');
console.log('  Загрузить этот zip и отметить его «This file will be played in the browser»');
console.log('  Viewport: 1280 x 800 (игра сама впишется в любое окно)');
console.log('  Включить Fullscreen button и Mobile friendly');
