#!/usr/bin/env node
'use strict';

// Smoke test: режим «сжатия потерь» не вернулся невключённым.
//
// В script.js жил целый режим поведения ИИ, который не мог включиться никогда:
// aiRoundState.lossCompressionMode присваивался ровно один раз — false при создании — и
// больше нигде. Функция, которая этот флаг поднимала бы (evaluateLossCompressionMode),
// не имела ни одного вызова.
//
// Из-за этого мёртвым был не только сам режим, но и всё, до чего он был единственной
// дорогой: аварийная оборона целиком — сбор кандидатов, модель полезности, приоритет,
// сравнение, точка блокировки траектории — около 380 строк. Плюс
// getLossCompressionAggressiveMove, всегда возвращавшая null, и
// applyLossCompressionScoreAdjustments: у неё было СЕМНАДЦАТЬ живых вызовов, и все
// семнадцать возвращали аргумент нетронутым, потому что вторым оператором стояло
// `if(!aiRoundState?.lossCompressionMode) return candidate;`.
//
// Замер перед удалением, партия из 14 ходов: evaluateEmergencyDefenseCandidateUtility —
// 0 вызовов, getBestEmergencyDefenseCandidate — 0, флаг режима ни разу не поднялся,
// applyLossCompressionScoreAdjustments вызвана 1 раз и вернула ТОТ ЖЕ объект.
//
// Удалено 551 строка. Тест сторожит не текст удалённого, а условие возврата: если этот
// код принесут обратно, он обязан быть ВКЛЮЧЁН — иначе он снова будет украшением, в
// которое кто-нибудь поверит (я поверил и написал в описании PR, что чиню в нём NaN).

const fs = require('fs');

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');

// === 1. Удалённые имена не вернулись ===
{
  const removed = [
    'applyLossCompressionScoreAdjustments',
    'getLossCompressionAggressiveMove',
    'evaluateLossCompressionMode',
    'getEmergencyDefenseMove',
    'getEmergencyBaseHoldPositionMove',
    'getBestEmergencyDefenseCandidate',
    'compareEmergencyDefenseCandidate',
    'getEmergencyDefensePriorityScore',
    'collectEmergencyDefenseCandidates',
    'buildEmergencyDefenseCandidate',
    'evaluateEmergencyDefenseCandidateUtility',
    'getEmergencyTrajectoryBlockPoint',
    'getEmergencyCoverHoldPoint',
    'clampEmergencyDefensePoint',
  ];
  for(const name of removed){
    assert(!new RegExp(`\\b${name}\\b`).test(source),
      `1: «${name}» вернулась. Если она снова нужна — её обязан кто-то ВЫЗЫВАТЬ; `
      + 'мёртвой она уже вводила в заблуждение');
  }
}

// === 2. ГЛАВНОЕ: флаг режима либо отсутствует, либо его кто-то поднимает ===
//
// Тест не запрещает режим сжатия потерь как идею. Он запрещает ровно ту ситуацию, что
// была: флаг существует, ветки по нему написаны, включить его некому.
{
  const mentions = source.match(/lossCompressionMode/g) || [];
  if(mentions.length > 0){
    // Собираем присваивания целиком и смотрим на значение. Отрицательный просмотр вперёд
    // здесь не годится: `\s*(?!false)` спокойно совпадает нулём пробелов перед пробелом,
    // и «= false» проходит как «включается». Проверено мутацией — так и было.
    const assignments = source.match(/lossCompressionMode\s*[:=]\s*[^,;\n]+/g) || [];
    const enabled = assignments.some((a) => !/[:=]\s*false\s*$/.test(a.trim()));
    assert(enabled,
      `2: lossCompressionMode упоминается ${mentions.length} раз(а), присваиваний ${assignments.length}, `
      + 'и ни одно не включает режим — это опять мёртвый код, а вместе с ним мёртвым становится '
      + 'всё, до чего он единственная дорога');
  }
}

// === 3. Живой путь выбора хода на месте ===
//
// Без этого пункт 1 сторожил бы пустоту: если заодно снесут настоящий запасной
// планировщик, тест этого не заметит.
{
  assert(/^function getFallbackAiMove\(/m.test(source),
    '3: запасной планировщик хода — живой код, он обязан остаться');
  assert(/^function isEmergencyDefenseStageGoal\(/m.test(source),
    '3b: распознавание аварийной стадии по названию цели используется отдельно и остаётся');
}

// === 4. Обёртки-тождества не вернулись ===
//
// applyLossCompressionScoreAdjustments была вызвана 17 раз и все 17 раз ничего не
// делала. Проверяем, что её вызовы развёрнуты, а не заменены похожей обёрткой.
{
  assert(!/applyLossCompression/.test(source),
    '4: обёртка, возвращавшая аргумент нетронутым, вернулась');
  assert(!/lossCompressionAdjustment/.test(source),
    '4b: поле от той обёртки тоже не должно возвращаться');
}

console.log('smoke-no-loss-compression-mode: OK');
