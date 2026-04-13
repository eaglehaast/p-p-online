# OLD AI removal manifest

## Scope
This manifest tracks legacy goal-priority model removal from runtime loading and active computer-turn dispatch.

## Runtime loading changes
- `index.html` no longer loads `ai/v2/goalPriorityModel.js`.
- The previous global model surface `window.PaperWingsGoalPriorityModel` is not used by active computer-turn logic.

## Active behavior
- `evaluateAiGoalPriorityModel` now acts as a no-op fallback and returns `null`.
- Goal selection automatically falls back to built-in heuristic branches in `selectAiModeAndTargets`.

## Public/debug APIs
Runtime `window` surface keeps helper:
- `window.RESET_CARGO`

## Notes
- This document reflects current factual loading/usage state only.
- It does **not** claim that all historical AI code was deleted from the repository.
