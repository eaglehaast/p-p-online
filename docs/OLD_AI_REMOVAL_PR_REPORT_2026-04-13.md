# Old AI Removal PR Report (2026-04-13)

## 1) Удалённые функции/блоки (по именам)

Из `script.js` физически удалён крупный legacy-блок decision-логики старого AI (выбор цели/самолёта/траектории/инвентаря/fallback).

Ниже ключевые функции, которые удалены как код decision-контура:

- `evaluateAiGoalPriorityModel`
- `assignAiRolesForTurn`
- `planRoleDrivenAiMove`
- `planModeDrivenAiMove`
- `selectAiModeForCurrentTurn`
- `getAiStrategicTargetPoint`
- `rankAiPlanesForCurrentTurn`
- `getFallbackAiMove`
- `buildAiInventoryCandidatePlans`
- `issueAIMoveWithInventoryUsage`

Также удалены крупные legacy-блоки старого AI-launch/fallback pipeline и аналитических экспортов старого decision-контура.

## 2) Оставленные заглушки (по именам) + обоснование

Оставлены только технические переходные заглушки для контролируемого hard-stop:

- `triggerComputerAiRemovedHardFail` — единая точка понятного hard-stop сообщения.
- `runAiTurnV2` — hard-stop stub, чтобы старый путь не исполнился.
- `doComputerMove` — hard-stop stub, чтобы старый путь не исполнился.
- `tryStartAiPlanningFromCommittedState` — hard-stop stub (legacy entry-point).
- `scheduleComputerMoveWithCargoGate` — hard-stop stub (legacy entry-point).
- `failSafeAdvanceTurn` — переведён в hard-stop (без старой fallback-цепочки).

Короткие технические no-op заглушки:

- `logAiDecision` — нейтральный no-op, чтобы не ломать несвязанные UI/тайминг вызовы.
- `createInitialAiRoundState` — минимальный объект-состояние без decision-логики.

## 3) Команды поиска + фактический вывод после изменений

### Проверка, что ключевые decision-функции старого AI удалены

Команда:

```bash
rg -n "function evaluateAiGoalPriorityModel|function assignAiRolesForTurn|function planModeDrivenAiMove|function planRoleDrivenAiMove|function buildAiInventoryCandidatePlans|function issueAIMoveWithInventoryUsage|function getFallbackAiMove|function rankAiPlanesForCurrentTurn|function getAiStrategicTargetPoint|function selectAiModeForCurrentTurn" script.js || true
```

Фактический вывод:

```text
<empty output>
```

### Проверка, что старые debug/export API обезврежены

Команда:

```bash
rg -n "old_ai_debug_api_removed|function exportAiSelfAnalyzerTurnsJson|function exportAiSelfAnalyzerGapJson|function exportPlayerVsAiGapReportJson|function exportAiV2DecisionAuditReportJson|function exportAiV2DecisionAuditCompactReportJson|function exportAiV2ReserveDiagnosticsReportJson" script.js
```

Фактический вывод:

```text
11397:    reasonCode: "old_ai_debug_api_removed",
11406:function exportAiSelfAnalyzerTurnsJson(){
11410:function exportAiSelfAnalyzerGapJson(){
11414:function exportPlayerVsAiGapReportJson(){
11418:function exportAiV2ReserveDiagnosticsReportJson(){
11426:function exportAiV2DecisionAuditReportJson(){
11430:function exportAiV2DecisionAuditCompactReportJson(){
```

### Проверка hard-stop в ходе компьютера и entry-point

Команда:

```bash
rg -n "function triggerComputerAiRemovedHardFail|Old AI removed\. New AI is not implemented yet\.|advance_turn_hard_fail|game_draw_tick|function doComputerMove|function runAiTurnV2|function tryStartAiPlanningFromCommittedState|function scheduleComputerMoveWithCargoGate" script.js
```

Фактический вывод:

```text
11903:function triggerComputerAiRemovedHardFail(reason = "unspecified"){
11936:    message: "Old AI removed. New AI is not implemented yet.",
12063:function tryStartAiPlanningFromCommittedState(trigger = "unspecified"){
12278:function scheduleComputerMoveWithCargoGate(startedAt = performance.now(), delayMs = AI_MOVE_INITIAL_DELAY_MS, planningContext = null){
15240:function runAiTurnV2(context = {}){
15244:function doComputerMove(){
15399:    triggerComputerAiRemovedHardFail("advance_turn_hard_fail");
15590:    triggerComputerAiRemovedHardFail("game_draw_tick");
```

## 4) Короткое "было/стало" по запуску компьютерного хода

- **Было:** в коде оставались большие legacy decision-блоки старого AI (цели/самолёты/траектории/инвентарь/fallback), даже при частичном hard-fail на отдельных entry-point.
- **Стало:** legacy decision-контур физически снесён; компьютерный ход ведёт в явный hard-stop с сообщением:
  `Old AI removed. New AI is not implemented yet.`

