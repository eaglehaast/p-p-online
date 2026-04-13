# Post-removal verification (2026-04-13)

## Цель
Подтвердить, что старый AI больше не исполняется как рабочий decision-механизм, и что для компьютерного хода везде срабатывает только hard-fail.

## Область проверки
- `script.js` (runtime и turn-loop)
- `README.md` (публично заявленное поведение)
- `docs/OLD_AI_REMOVAL_MANIFEST.md` (реестр удалений/заглушек)

## 1) Проверка ожидаемого поведения при ходе компьютера

### Что проверено
1. В `triggerComputerAiRemovedHardFail()`:
   - сразу выключается планирование/запланированные AI-действия (`aiMoveScheduled = false`, cleanup таймеров/сессии);
   - показывается явное persistent-сообщение пользователю;
   - возвращается hard-fail ответ `ai_removed_hard_fail` с текстом `Old AI removed. New AI is not implemented yet.`.

2. Точки вызова на старте компьютерного хода:
   - `advanceTurn()` вызывает `triggerComputerAiRemovedHardFail("advance_turn_hard_fail")`;
   - `gameDraw()` дополнительно вызывает `triggerComputerAiRemovedHardFail("game_draw_tick")`, если сейчас ход компьютера и нет полётов.

3. Старые entry-point старого AI переведены в прямые stubs, которые **сразу** возвращают hard-fail:
   - `runAiTurnV2()`
   - `doComputerMove()`
   - `tryStartAiPlanningFromCommittedState()`
   - `scheduleComputerMoveWithCargoGate()`

### Вывод по п.1
- Hard-fail сообщение при ходе компьютера присутствует и вызывается из активного turn-loop.
- До остановки не запускается старый цикл выбора цели/траектории/инвентаря через старые entry-point: они все сведены к немедленному hard-fail.

## 2) Проверка отсутствия скрытых автозапусков

### Проверенные точки, где мог стартовать компьютерный ход
- Передача хода (`advanceTurn()`) — проверено.
- Цикл кадра (`gameDraw()`) — проверено.
- Отложенные вызовы (legacy scheduler hooks) — проверено по именам функций:
  - `tryStartAiPlanningFromCommittedState`
  - `scheduleComputerMoveWithCargoGate`
  - `runAiTurnV2`
  - `doComputerMove`

### Результат
- Рабочих обходных путей, которые минуют `triggerComputerAiRemovedHardFail()`, не найдено.
- В активном коде старта хода компьютера используется только hard-fail.

## 3) Проверка кодовой базы на «живые остатки»

Ниже статус функций старого AI:

- `doComputerMove` — **заглушка (stub)**, сразу hard-fail.
- `runAiTurnV2` — **заглушка (stub)**, сразу hard-fail.
- `tryStartAiPlanningFromCommittedState` — **заглушка (stub)**, сразу hard-fail.
- `scheduleComputerMoveWithCargoGate` — **заглушка (stub)**, сразу hard-fail.

Старые debug/export entry-point:

- `exportAiV2ReserveDiagnosticsReportJson` — обезврежен через `oldAiDebugApiRemoved`.
- `DEBUG_AI_GAP_AFTER_BOUNCE_REPORT` — обезврежен через `oldAiDebugApiRemoved`.
- `exportAiV2DecisionAuditReportJson` — обезврежен через `oldAiDebugApiRemoved`.
- `exportAiV2DecisionAuditCompactReportJson` — обезврежен через `oldAiDebugApiRemoved`.

### Проверка ссылок из активного кода
- Поиск по `script.js` показывает только определения legacy AI функций без рабочих вызовов в active turn-start path.
- Прямые точки старта (`advanceTurn`, `gameDraw`) ведут в hard-fail.

## 4) Проверка поверхности отладки

Проверено, что старые debug/export команды, которые могли косвенно «оживить» старый AI decision-контур, переведены на единый ответ:

- `reasonCode: old_ai_debug_api_removed`
- `message: Old AI debug/export API removed. New AI debug API is not available yet.`

Это означает, что через старые debug/export API запустить старый decision-процесс нельзя.

## 5) Доказательства (команды и результат)

1. Проверка hard-fail функций и вызовов:

```bash
rg -n "function triggerComputerAiRemovedHardFail|triggerComputerAiRemovedHardFail\(|function doComputerMove|function runAiTurnV2|function tryStartAiPlanningFromCommittedState|function scheduleComputerMoveWithCargoGate" script.js
```

Итог: присутствует единый hard-fail обработчик; legacy entry-point сведены к hard-fail stubs.

2. Проверка debug surface:

```bash
rg -n "old_ai_debug_api_removed|function oldAiDebugApiRemoved|exportAiV2DecisionAuditReportJson|exportAiV2DecisionAuditCompactReportJson|exportAiV2ReserveDiagnosticsReportJson|DEBUG_AI_GAP_AFTER_BOUNCE_REPORT" script.js
```

Итог: старые debug/export API обезврежены через единый блок `oldAiDebugApiRemoved`.

3. Проверка, что в ключевых entry-point хода компьютера используется hard-fail:

```bash
rg -n "advance_turn_hard_fail|game_draw_tick|fail_safe_turn_retry|triggerComputerAiRemovedHardFail" script.js
```

Итог: hard-fail вызывается при передаче хода, в draw-loop и в fail-safe ветке retry.

4. Проверка отсутствия рабочих ссылок на legacy scheduler hooks:

```bash
rg -n "\b(tryStartAiPlanningFromCommittedState|scheduleComputerMoveWithCargoGate|runAiTurnV2|doComputerMove)\b" script.js
```

Итог: обнаружены определения/stub-реализации; рабочие вызовы в активном старте компьютерного хода не обнаружены.

## Решение по найденным остаткам

- Остатки типа `doComputerMove`, `runAiTurnV2`, `tryStartAiPlanningFromCommittedState`, `scheduleComputerMoveWithCargoGate`:
  - Решение: **оставить как заглушки на текущем шаге**.
  - Обоснование: они уже безопасны (немедленный hard-fail), сохраняют явный контракт и упрощают локализацию точек для будущей интеграции нового AI.

- Остатки debug/export API старого decision-аудита:
  - Решение: **оставить обезвреженными заглушками**.
  - Обоснование: явный ответ `old_ai_debug_api_removed` лучше «тихого отсутствия», снижает риск ложной интерпретации поведения.

## Финальный статус (критерий приемки)

- Старое AI-поведение не исполняется как рабочий decision-процесс.
- Скрытые пути запуска старого AI (через turn handoff / draw loop / legacy hooks) не подтверждены.
- Необоснованно активного старого decision-кода в рабочем старте компьютерного хода не обнаружено.
