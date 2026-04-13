# Behavior removal hard pass (2026-04-13)

## Цель
Полностью отключить старое AI-поведение как рабочий механизм и оставить явный hard-fail сигнал до внедрения нового AI.

## Что сделано

1. Все ключевые entry-point функции старого AI переведены в hard-fail:
   - `runAiTurnV2()`
   - `doComputerMove()`
   - `tryStartAiPlanningFromCommittedState()`
   - `scheduleComputerMoveWithCargoGate()`

2. Добавлен единый hard-fail обработчик:
   - `triggerComputerAiRemovedHardFail()`
   - показывает явное сообщение: старый AI удалён, новый ещё не внедрён.
   - не делает тихий auto-pass.

3. Computer turn больше не продолжает игру «молча»:
   - при передаче хода компьютеру вызывается hard-fail, а не нейтральный auto-advance.

4. Старые debug/export API для decision-пайплайна обнулены:
   - `exportAiV2ReserveDiagnosticsReportJson()`
   - `DEBUG_AI_GAP_AFTER_BOUNCE_REPORT()`
   - `exportAiV2DecisionAuditReportJson()`
   - `exportAiV2DecisionAuditCompactReportJson()`
   
   Все они возвращают единый ответ `old_ai_debug_api_removed`.

## Проверка полноты

### Поиск entry-point (рабочих вызовов)

```bash
rg -n "runAiTurnV2\(|doComputerMove\(|tryStartAiPlanningFromCommittedState\(|scheduleComputerMoveWithCargoGate\(" script.js
```

Ожидание: остаются только определения функций-stub без decision логики.

### Поиск старых AI-переключателей

```bash
rg -n "AI_ENGINE_MODE|AI_V2_INVENTORY_PHASE" script.js
```

Ожидание: совпадений нет.

### Проверка hard-fail сигналов

```bash
rg -n "triggerComputerAiRemovedHardFail|ai_removed_hard_fail|Old AI removed\. New AI is not implemented yet" script.js
```

Ожидание: явный сигнал присутствует и используется на компьютерном ходе.

## Статус

- Старое AI-поведение больше невозможно запустить напрямую/косвенно как рабочий decision-процесс.
- При ходе компьютера без нового AI появляется явный hard-fail сигнал.
- Новый AI в этом PR не внедряется.
