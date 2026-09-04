#!/usr/bin/env node
'use strict';

// Smoke test: механики ядерного удара в игре нет — ни кода, ни разметки, ни гифки.
//
// Она задумывалась как предмет инвентаря, но от неё отказались. Код при этом остался и
// был НЕДОСТИЖИМ: автомат стадий начинался с idle, единственный переход из idle вёл в
// dragging, а вызова `transitionNuclearStrikeStage(DRAGGING)` в файле не было ни одного.
// Даже отладочные NUKE_DEBUG.skipTo и .restart требовали, чтобы кино УЖЕ шло, — то есть
// запустить его было нечем.
//
// Замер в живой партии (восемь ходов против компьютера) это подтвердил:
//
//   transitionNuclearStrikeStage   0 вызовов
//   playNuclearStrikeFx            0 вызовов
//   setBoardDimmerActive           0 вызовов
//   стадия в конце                 idle
//   слой кино показывался          0 раз
//
// А платили за неё каждый кадр и каждой загрузкой:
//
//   updateNukeTimeline           548 вызовов за партию впустую
//   getNukePlaneFadeFx          4384 вызова за партию впустую
//   гифка взрыва                 2.9 МБ, скачивалась при каждом запуске
//   и ещё раз ПОЛНОСТЬЮ мимо кэша на каждый показ — src собирался с `?t=${Date.now()}`
//
// Удалено: автомат стадий, хронометраж кино, затемнение доски (включалось только им),
// выцветание самолётов, уничтожение всех самолётов «взрывом», блокировка ввода на время
// кино, отладочный NUKE_DEBUG, слои в разметке, стили и сама гифка.

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const script = fs.readFileSync('script.js', 'utf8');
const styles = fs.readFileSync('styles.css', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');

// === 1. ГЛАВНОЕ: ни одного имени механики не осталось ===
//
// Проверяем по именам, а не по одному признаку: подсистема была большая и звалась то
// nuclear, то nuke, и вернуться она может любым куском.
{
  const dead = [
    'NUCLEAR_STRIKE_STAGES', 'NUCLEAR_STRIKE_ACTION_TYPES', 'NUCLEAR_STRIKE_FX',
    'NUCLEAR_STRIKE_TIMELINE_PHASES', 'NUKE_TIMELINE', 'NUKE_DEBUG', 'DEBUG_NUKE',
    'nuclearStrikeStage', 'nuclearStrikeTimelineState', 'nuclearStrikeLayer',
    'transitionNuclearStrikeStage', 'playNuclearStrikeFx', 'showNuclearStrikeCinematicLayer',
    'clearNuclearStrikeCinematicLayer', 'isNuclearStrikeActionLocked',
    'applyNuclearStrikeInputLockUi', 'resolveNuclearStrikePlaneQueue',
    'applyNuclearStrikePostResolution', 'destroyAllPlanesWithNukeScoring',
    'updateNukeTimeline', 'startNukeTimeline', 'resetNukeTimelineState',
    'getNukePlaneFadeFx', 'isNukeEliminatedPlaneRenderable', 'nukeEliminated',
    'isNukeCinematicActive', 'isNuclearStrikeResolutionActive',
    'setBoardDimmerActive', 'updateBoardDimmerMask', 'boardDimmerLayer',
  ];
  for(const name of dead){
    assert(!script.includes(name),
      `1: в script.js вернулось «${name}» — механика ядерного удара удалена целиком`);
  }
}

// === 2. Гифки нет ни в файлах, ни в списках догрузки ===
//
// 2.9 МБ — самый тяжёлый файл проекта, и он качался при каждом запуске ради кино,
// которое не могло начаться.
{
  assert(!fs.existsSync('ui_gamescreen/gamescreen_outside/gs_cargoeffects/gs_cagroeffects_nuclearstrike.gif'),
    '2: гифка ядерного взрыва вернулась в проект — это 2.9 МБ на каждый запуск');
  assert(!/nuclearstrike/i.test(script),
    '2b: на гифку снова ссылается script.js');
  assert(!/gs_cargoeffects/.test(script),
    '2c: папка эффектов груза снова упоминается — в ней лежала только эта гифка');
}

// === 3. Разметка и стили чистые ===
{
  for(const [name, source] of [['index.html', indexHtml], ['styles.css', styles]]){
    for(const token of ['nuclear', 'nuke', 'Dimmer', 'dimmer']){
      assert(!source.includes(token),
        `3: в ${name} вернулось «${token}»`);
    }
  }
}

// === 4. Живое НЕ задето: раунд без победителя остался ===
//
// Флаг «раунд кончился без выживших» ставит map tester и отладочный forceDuelTieForTesting —
// это живые пути, они к взрыву отношения не имеют. Флаг переименован, потому что имя
// roundEndedByNuke пережило бы механику и врало.
{
  assert(/function lockInNoSurvivors\(/.test(script),
    '4: завершение раунда без победителя удалено вместе со взрывом, а это разные вещи');
  assert(/roundEndedWithoutSurvivors/.test(script),
    '4b: флаг «раунд без выживших» пропал');
  assert(!/roundEndedByNuke/.test(script),
    '4c: старое имя флага вернулось — оно ссылается на механику, которой больше нет');

  // Ничья и победа рисуются по-прежнему.
  assert(/if\(isGameOver && \(shouldDrawWinnerRoundMessage \|\| isDrawGame\)\)\{/.test(script),
    '4d: условие показа надписей конца матча изменилось — проверь, что ничья ещё рисуется');
  assert(/"Game over\. It's a draw\."/.test(script),
    '4e: надпись про ничью пропала');
}

// === 5. Живое НЕ задето: аркадное возрождение ===
//
// Свойство самолёта nukeEliminated ставилось ТОЛЬКО уничтожением от взрыва, поэтому
// всегда оставалось пустым, а читалось в трёх местах отрисовки. Убирая его, важно было
// не тронуть настоящую проверку возрождения, которая стоит рядом.
{
  assert(/isArcadePlaneRespawnEnabled\(\)/.test(script),
    '5: проверка аркадного возрождения пропала — а она живая');
  assert(/const isGhostState = plane\.burning \|\| !plane\.isAlive;/.test(script),
    '5b: призрачное состояние самолёта считается иначе — при удалении оно должно было '
    + 'остаться прежним по смыслу');
}

// === 6. Ввод больше не спрашивает разрешения у кино ===
//
// Шесть обработчиков ввода начинались с проверки «не идёт ли ядерный удар». Она всегда
// возвращала false, но стояла первой строкой в самых горячих путях.
{
  for(const fn of ['function handleStart(', 'function handleAAPlacement(', 'function getGrabRejectReason(']){
    const start = script.indexOf(fn);
    assert(start > 0, `6: обработчик ${fn} не найден — проверка устарела`);
    const body = script.slice(start, start + 400);
    assert(!/Locked\(\)/.test(body),
      `6b: в ${fn} вернулась проверка блокировки от кино`);
  }
}

console.log('smoke-no-nuclear-strike: OK');
