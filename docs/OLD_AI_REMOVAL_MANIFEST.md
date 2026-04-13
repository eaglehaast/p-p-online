# OLD AI removal manifest

## Scope
This manifest tracks entities related to legacy AI v1/v2 that were removed or explicitly disabled in this PR.

## Entry points and runtime dispatch
- `doComputerMove` old runtime path — **hard-fail stub** (`old AI removed`).
- `runAiTurnV2` old runtime path — **hard-fail stub** (`old AI removed`).
- `tryStartAiPlanningFromCommittedState` — **hard-fail stub**.
- `scheduleComputerMoveWithCargoGate` — **hard-fail stub**.

## Public/debug APIs
Old decision debug/export APIs are reduced to hard-fail responses via `old_ai_debug_api_removed`:
- `exportAiV2DecisionAuditReportJson`
- `exportAiV2DecisionAuditCompactReportJson`
- `exportAiV2ReserveDiagnosticsReportJson`
- `DEBUG_AI_GAP_AFTER_BOUNCE_REPORT`

Runtime `window` surface keeps only neutral helper:
- `window.RESET_CARGO`

## Deleted AI automation scripts
Deleted all `scripts/smoke-ai-*.js` files and AI compare scripts:
- `scripts/compare-ai-opening-template-frequency.js`
- `scripts/compare-ai-initial-route-classes.js`
- `scripts/compare-ai-early-reject-reasons.js`

## Deleted old AI documentation
- `docs/ai-move-pipeline-before-after.md`
- `docs/ai-cargo-before-after.md`
- `docs/ai-wall-locked-before-after.md`

## Hard-pass follow-up
- See `docs/BEHAVIOR_REMOVAL_HARD_PASS_2026-04-13.md` for explicit hard-fail behavior and acceptance checks.
