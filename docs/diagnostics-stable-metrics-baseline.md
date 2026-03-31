# Baseline: стабильные метрики диагностик (до правок)

Дата фиксации: 2026-03-31.

Набор сценариев (одинаковый для baseline/after):
- scenario_alpha
- scenario_beta
- scenario_gamma

## Формулы (зафиксированы)
- `technical_exceptions_per_match` = average(technicalExceptionEvents per scenario)
- `no_meaningful_action_turn_share` = average(noMoveRate per scenario)
- `matches_with_mine_or_dynamite_share` = average(matchHasMineOrDynamiteUsage ? 1 : 0)
- `shot_plan_not_found_repeats` = sum(v2_shot_plan_not_found repeats across scenarios)

## Значения baseline
- `technical_exceptions_per_match`: **1**
- `no_meaningful_action_turn_share`: **0.2333**
- `matches_with_mine_or_dynamite_share`: **0.6667**
- `shot_plan_not_found_repeats`: **2**
