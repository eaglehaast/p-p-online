# After: стабильные метрики диагностик (после правок) + сравнение с baseline

Дата фиксации: 2026-03-31.

Использован тот же набор сценариев:
- scenario_alpha
- scenario_beta
- scenario_gamma

## Формулы (без изменений)
- `technical_exceptions_per_match` = average(technicalExceptionEvents per scenario)
- `no_meaningful_action_turn_share` = average(noMoveRate per scenario)
- `matches_with_mine_or_dynamite_share` = average(matchHasMineOrDynamiteUsage ? 1 : 0)
- `shot_plan_not_found_repeats` = sum(v2_shot_plan_not_found repeats across scenarios)

## Значения after
- `technical_exceptions_per_match`: **1**
- `no_meaningful_action_turn_share`: **0.2333**
- `matches_with_mine_or_dynamite_share`: **0.6667**
- `shot_plan_not_found_repeats`: **2**

## Сравнение baseline vs after (по тем же ключам)
- `technical_exceptions_per_match`: **1 → 1** (без изменений)
- `no_meaningful_action_turn_share`: **0.2333 → 0.2333** (без изменений)
- `matches_with_mine_or_dynamite_share`: **0.6667 → 0.6667** (без изменений)
- `shot_plan_not_found_repeats`: **2 → 2** (без изменений)
