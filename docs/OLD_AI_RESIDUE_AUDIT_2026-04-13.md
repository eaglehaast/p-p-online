# AI residue audit + removal report (2026-04-13, archived)

> Этот отчёт зафиксировал промежуточный этап до hard-pass.
> Актуальный статус полного сноса decision-поведения см. в:
> `docs/BEHAVIOR_REMOVAL_HARD_PASS_2026-04-13.md`.

## Scope
Проверка репозитория на остатки старого AI runtime (v1/v2), точек автозапуска и debug/export-команд.

## Команды поиска и результат

1) Прямые entry-point старого AI:

```bash
rg -n "doComputerMove\(|runAiTurnV2\(" script.js
```

Результат: найдены только **определения функций**, вызовов нет.

2) Legacy-переключатели и флаги:

```bash
rg -n "AI_ENGINE_MODE|AI_V2_INVENTORY_PHASE" script.js
```

Результат: совпадений нет.

3) Старые debug/export API, завязанные на decision pipeline:

```bash
rg -n "window\.AI_DEBUG_CMD|window\.runAiTurnV2|window\.AI_ENGINE_MODE|window\.exportAiV2DecisionAuditReportJson|window\.exportAiV2DecisionAuditCompactReportJson|window\.exportAiV2ReserveDiagnosticsReportJson|window\.DEBUG_AI_GAP_AFTER_BOUNCE_REPORT" script.js README.md docs
```

Результат: runtime-экспортов в `script.js` нет; остались только упоминания в исторической документации.

4) Косвенный автозапуск через turn-loop:

```bash
rg -n "tryStartAiPlanningFromCommittedState\(|scheduleComputerMoveWithCargoGate\(" script.js
```

Результат: остались только определения/внутренние ссылки внутри legacy-блока; в `advanceTurn()` и `gameDraw()` вызовы удалены.

## Что удалено / деактивировано

- Удалены legacy переключатели `AI_ENGINE_MODE` и `AI_V2_INVENTORY_PHASE`, заменены на нейтральную константу `AI_INVENTORY_PHASE_DEFAULT`.
- Удалены runtime-экспорты старых AI debug/export API в `window`.
- Удалён вызов planner-старта из `advanceTurn()`.
- Удалён вызов planner-старта из `gameDraw()`.
- В `failSafeAdvanceTurn()` retry больше не возвращает старый AI pipeline, вместо этого используется нейтральный auto-advance.
- Введён отдельный нейтральный планировщик `scheduleComputerNeutralTurnAdvance()` (без принятия AI-решений).

## Что оставлено (и почему)

- Внутренние legacy-функции (`runAiTurnV2`, `doComputerMove`, часть аналитических сборщиков) оставлены в коде как неиспользуемые хвосты, чтобы не делать рискованную массовую чистку в этом шаге.
- Эти функции не являются runtime entry-point после текущих изменений: активный turn-loop к ним не обращается.

## Проверка после сноса

- Игра не должна падать: компьютерный синий ход переводится нейтральным auto-advance.
- В computer mode нет вызовов старых entry-point из активного turn-loop.
- Скрытый автозапуск через `advanceTurn()`/`gameDraw()` в старый planner удалён.

## Итог

Статус: **runtime-вызовы старого AI отключены**.

Формулировка для приемки: **остатков активных runtime entry-point не найдено**.
