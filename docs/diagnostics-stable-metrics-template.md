# Шаблон краткого отчёта по стабильным метрикам диагностик

Используйте **строго эти ключи** и не меняйте формулы между baseline и after.

## Обязательные метрики

- `technical_exceptions_per_match` — число технических исключений за матч.
- `no_meaningful_action_turn_share` — доля ходов без осмысленного действия.
- `matches_with_mine_or_dynamite_share` — доля матчей, где мина или динамит применялись хотя бы один раз.
- `shot_plan_not_found_repeats` — число повторов `shot plan not found` (`v2_shot_plan_not_found`).

## Формат заполнения

```md
# <Название набора сценариев>

## Формулы
- technical_exceptions_per_match = <формула>
- no_meaningful_action_turn_share = <формула>
- matches_with_mine_or_dynamite_share = <формула>
- shot_plan_not_found_repeats = <формула>

## Значения
- technical_exceptions_per_match: <число>
- no_meaningful_action_turn_share: <доля>
- matches_with_mine_or_dynamite_share: <доля>
- shot_plan_not_found_repeats: <число>
```
