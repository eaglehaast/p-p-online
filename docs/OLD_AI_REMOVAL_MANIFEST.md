# OLD AI removal manifest

## Scope
This manifest tracks entities related to legacy AI v1/v2 that were removed or explicitly disabled in this PR.

## Entry points and runtime dispatch
- `doComputerMove` old v1/v2 runtime path — **disabled** (neutral fallback with turn advance).
- `window.runAiTurnV2` — **disabled** (`undefined` in runtime export).

## Public/debug APIs
Disabled with explicit response `Old AI removed. This API is disabled.`:
- `window.exportLatestAiSelfAnalyzerJson`
- `window.exportAiSelfAnalyzerTurnsJson`
- `window.exportAiSelfAnalyzerGapJson`
- `window.exportPlayerVsAiGapReportJson`
- `window.exportAiV2DecisionAuditReportJson`
- `window.exportAiV2DecisionAuditCompactReportJson`
- `window.exportAiV2ReserveDiagnosticsReportJson`
- `window.exportAiFuelTrainingReportJson`
- `window.DEBUG_AI_GAP_AFTER_BOUNCE_REPORT`
- `window.getAiSelfAnalyzerSnapshot`

`window.AI_DEBUG_CMD` behavior:
- all old AI commands — **disabled** with `Old AI removed. AI debug commands are disabled.`
- `reset-cargo` — preserved as neutral utility.

## Deleted AI automation scripts
Deleted all `scripts/smoke-ai-*.js` files and AI compare scripts:
- `scripts/compare-ai-opening-template-frequency.js`
- `scripts/compare-ai-initial-route-classes.js`
- `scripts/compare-ai-early-reject-reasons.js`

## Deleted old AI documentation
- `docs/ai-move-pipeline-before-after.md`
- `docs/ai-cargo-before-after.md`
- `docs/ai-wall-locked-before-after.md`

## Suspicious tails (left intentionally, non-functional for old AI runtime)
These pieces can still mention AI internals, but old runtime entry is disabled:
- timer/scheduler helpers around planner timing (`aiMoveScheduled`, cargo gate scheduling)
- fail-safe turn-advance plumbing
- decision logging helpers (`logAiDecision` and related event helpers)
- self-analyzer internals retained as non-active legacy code paths

They are tracked for follow-up cleanup once new AI integration branch is ready.
