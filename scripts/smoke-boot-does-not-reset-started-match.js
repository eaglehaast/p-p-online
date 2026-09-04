#!/usr/bin/env node
'use strict';

// Smoke test: догрузка страницы не стирает партию, которую игрок уже начал.
//
// Начальная расстановка ждала событие window 'load'. Оно наступает только после того, как
// догрузился КАЖДЫЙ подресурс страницы — все <img> из index.html, шрифты с чужого домена,
// всё. Игра при этом доступна гораздо раньше: оверлей загрузки снимается через 5 секунд в
// любом случае (MAX_OVERLAY_TIME_MS), кнопки живые. Замер в браузере с одной медленной
// картинкой и оборванным fonts.googleapis.com:
//
//   было:  0.25 с DOMContentLoaded │ 5.3 с игрок нажал Play │ 20.0 с window load
//          20.06 с resetGame() — партия стёрта на пятнадцатой секунде игры
//   стало: 0.27 с DOMContentLoaded │ 0.29 с resetGame() │ 5.3 с Play │ 20.0 с window load
//          позднего сброса нет
//
// Отдельно важно, что на быстром интернете расстановка тоже стала ранней: 0.29 с вместо
// 0.82 с. Разметке и стилям событие 'load' не нужно — таблицы стилей в <head> блокируют
// выполнение скриптов, значит к DOMContentLoaded они уже применены.
//
// Проверяется здесь ДВА разных предохранителя. Первый — ждать разметку, а не всю
// страницу. Второй — не расставлять заново, если игрок уже начал: список карт тоже едет
// по сети, и нажать Play успевают именно в это окно. Ни один из двух в одиночку дырку не
// закрывает, поэтому оба проверяются отдельно.

const fs = require('fs');
const vm = require('vm');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

// Функции здесь объявлены с отступом — это не верхний уровень файла.
function extractFn(source, name){
  const re = new RegExp(`^[ \\t]*(?:async )?function ${name}\\(`, 'm');
  const m = re.exec(source);
  if(!m) throw new Error(`не найдено: ${name}`);
  const start = m.index;
  const open = source.indexOf('{', source.indexOf(')', start));
  let d = 0;
  for(let i = open; i < source.length; i += 1){
    if(source[i] === '{') d += 1;
    if(source[i] === '}'){ d -= 1; if(d === 0) return source.slice(start, i + 1); }
  }
  throw new Error(`не закрыто: ${name}`);
}

const script = fs.readFileSync('script.js', 'utf8');

async function main(){

  // === 1. Ожидание разметки, а не всей страницы ===
  {
    const wait = extractFn(script, 'waitForDomReady');

    assert(/document\.addEventListener\('DOMContentLoaded', resolve/.test(wait),
      '1: начальная расстановка обязана ждать DOMContentLoaded');
    assert(!/addEventListener\(['"]load['"]/.test(wait),
      '1b: ожидание события load вернулось — это ждать каждую картинку страницы, '
      + 'на плохом интернете десятки секунд');
    assert(/document\.readyState !== 'loading'/.test(wait),
      '1c: если разметка уже разобрана, ждать нечего — проверка readyState на месте');
    assert(!/waitForStylesReady/.test(script),
      '1d: старое ожидание полной загрузки осталось в файле');

    const boot = extractFn(script, 'bootstrapGame');
    assert(/await waitForDomReady\(\);/.test(boot),
      '1e: bootstrapGame начинается с ожидания разметки');
  }

  // === 2. ГЛАВНОЕ: начатую партию поздняя расстановка обходит стороной ===
  //
  // Проверяем поведением, а не текстом: гоняем НАСТОЯЩИЙ bootstrapGame на заглушках и
  // нажимаем Play ровно в тот момент, когда он ждёт список карт.
  {
    const boot = extractFn(script, 'bootstrapGame');

    const runBoot = async ({ pressPlayWhileWaiting }) => {
      const calls = [];
      const context = {
        console: { warn: () => {}, error: () => {} },
        alert: () => {},
        MAPS: [{ name: 'карта' }],
        mapDataBridge: { MAPS_MANIFEST_PATH: 'manifest.json' },
        syncLayoutAndField: async () => { calls.push('layout'); },
        logLayoutMetrics: () => {},
        setMenuVisibility: () => { calls.push('menu'); },
        resetGame: () => { calls.push('resetGame'); },
        waitForDomReady: () => Promise.resolve(),
        ensureMapsDataReady: async () => {
          // Список карт едет по сети. Игрок успевает нажать Play именно здесь.
          if(pressPlayWhileWaiting) context.matchStartRequested = true;
        }
      };
      vm.createContext(context);
      // var, а не let: только var становится свойством контекста и виден снаружи.
      vm.runInContext(`var matchStartRequested = false;\n${boot}\nglobalThis.__boot = bootstrapGame;`, context);
      await context.__boot();
      return calls;
    };

    const quiet = await runBoot({ pressPlayWhileWaiting: false });
    assert(quiet.filter(c => c === 'resetGame').length === 1,
      `2: без игрока начальная расстановка обязана произойти ровно один раз, а вышло ${quiet.join(', ')}`);

    const started = await runBoot({ pressPlayWhileWaiting: true });
    assert(!started.includes('resetGame'),
      '2b: игрок нажал Play, пока грузился список карт, — и получил сброс своей партии; '
      + 'именно это и ломало игру на плохом интернете');
    assert(started.includes('layout'),
      '2c: разметку пересчитать всё равно надо — она никому не мешает, в отличие от сброса');
  }

  // === 3. Флаг ставится ДО первого ожидания ===
  //
  // Если поставить его после любого await, окно останется открытым: сброс успеет прилететь
  // как раз в это ожидание. Проверяем порядок в исходнике.
  {
    const play = extractFn(script, 'handlePlayStart');
    const flagAt = play.indexOf('matchStartRequested = true;');
    const awaitAt = play.indexOf('await ');
    assert(flagAt !== -1,
      '3: нажатие Play обязано отмечать, что партия теперь принадлежит игроку');
    assert(awaitAt !== -1 && flagAt < awaitAt,
      '3b: флаг ставится ПОСЛЕ первого ожидания — окно, в которое прилетал сброс, осталось открытым');

    assert(/^let matchStartRequested = false;$/m.test(script),
      '3c: флаг обязан начинаться выключенным, иначе первая же расстановка не произойдёт');
  }

  // === 4. Оверлей загрузки по-прежнему снимается сам ===
  //
  // Пункты 1–3 прошли бы и на варианте «держать оверлей, пока всё не догрузится». Это
  // другая крайность: на плохом интернете игрок сидел бы перед заставкой неизвестно
  // сколько. Ограничение по времени должно остаться.
  {
    const menuPreload = extractFn(script, 'startMenuPreload');
    const cap = /const MAX_OVERLAY_TIME_MS = (\d+);/.exec(menuPreload);
    assert(cap, '4: ограничение времени показа оверлея пропало');
    assert(Number(cap[1]) > 0 && Number(cap[1]) <= 10000,
      `4b: оверлей держится до ${cap[1]} мс — это уже не «подождать», а «не пустить»`);
    assert(/Promise\.race\(\[preloadPromise, wait\(MAX_OVERLAY_TIME_MS\)\]\)/.test(menuPreload),
      '4c: оверлей снимается по первому из двух — готовности или таймауту');
  }

  // === 5. Нажатие Play по-прежнему ДОЖИДАЕТСЯ картинок игрового экрана ===
  //
  // Впустить игрока в партию с недогруженной графикой — не лучше сброса. Здесь ожидание
  // уместно: оно короткое, адресное и с оверлеем.
  {
    const play = extractFn(script, 'handlePlayStart');
    assert(/if \(!gameAssetsReady\) \{[\s\S]*?await pending/.test(play),
      '5: если картинки игрового экрана ещё не готовы, старт партии обязан их дождаться');
    assert(/showLoadingOverlay\(\)/.test(play),
      '5b: на время этого ожидания показывается оверлей, иначе игра выглядит зависшей');
  }

  console.log('smoke-boot-does-not-reset-started-match: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
