# OLD AI removal manifest

## Scope
This manifest tracks the removal of legacy AI v2 decision and diagnostics logic from active runtime behavior.

## Archive location
- Legacy code was moved to `archive/legacy-ai-v2.js` for historical reference only.
- The archive file is **not** loaded by `index.html` and has no runtime effect.

## Active runtime behavior
- `runAiTurnV2`, `doComputerMove`, `selectAiModeForCurrentTurn`, and `evaluateAiGoalPriorityModel`
  now route into explicit hard-fail stop contour for `computer` mode.
- `logAiDecision` and AI decision scopes were reduced to minimal neutral stubs for optional dev logging only.
- Active code no longer keeps legacy decision debug matrices, aggregation maps, or goal-priority model routing.

## Fully removed from active code path
- Legacy goal-priority model evaluation/selection branch.
- Legacy AI decision diagnostics framework (event flags, deep payload enrichment, aggregation summaries).
- Legacy runtime dependence on archived AI v2 decision internals.

## Notes
- `docs/AI_BEHAVIOR_CONTRACT.md` remains as a historical target contract only.
- This document describes runtime status, not archival history completeness.
