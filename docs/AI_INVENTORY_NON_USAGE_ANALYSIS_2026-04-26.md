# AI inventory non-usage analysis (2026-04-26)

## Context
User-reported symptom: AI does not use inventory at all.

## Hypothesis 1 — AI often has no items because cargo is disabled or not collected
- Inventory is primarily filled via cargo pickup during `updateCargoState()`.
- Cargo grants items only when a plane intersects cargo beneficial zone.
- If cargo is disabled (`settings.addCargo === false`), inventory layer is hidden and cargo spawn path is skipped.
- In that state, inventory for AI can remain empty for a long time, making “AI never uses inventory” look like logic failure while the true reason is no incoming items.

Evidence:
- Inventory visibility depends on `settings.addCargo`.
- Cargo pickup calls `addItemToInventory(plane.color, item)`.
- AI pre-launch inventory routine exits if inventory total is 0.

## Hypothesis 2 — AI logic only evaluates BLUE inventory, so role/color mismatch looks like “AI ignores inventory”
- `evaluateBlueInventoryState()` hardcodes `inventoryState.blue` and all AI inventory planning/usage paths use it.
- Computer-turn scheduling is also hard-limited to blue turn in computer mode.
- If a tester expects AI behavior for green side (or a mode where AI side differs), inventory usage logic will appear dead because it does not look at green inventory.

Evidence:
- `evaluateBlueInventoryState()` reads only `inventoryState.blue`.
- `scheduleComputerMoveWithCargoGate()` returns not applicable unless current turn is blue and game mode is computer.

## Hypothesis 3 — Candidate execution can silently fail item-by-item, ending with “nothing applied”
- Even when planner generates candidates, real execution has many per-item hard checks:
  - item count rechecked right before apply,
  - mine requires valid placement,
  - dynamite requires resolved target,
  - single-use-per-turn buff restriction.
- If each candidate fails in sequence, result becomes `prelaunch_items_skipped_even_forced` and no item is consumed.
- From outside this looks like “AI planned but never used inventory”.

Evidence:
- `maybeUseInventoryBeforeLaunch()` executes candidates and tracks skipped reasons.
- If no item applied even with forced fallback, decision meta marks failure (`prelaunch_items_skipped_even_forced`).

## Hypothesis 4 — Forced fallback can still fail because tactical items need geometry that may be unavailable
- The system has a forced spend fallback, but mine and dynamite still need valid tactical geometry:
  - mine: at least one valid placement point passing `isMinePlacementValid` and safety distance checks,
  - dynamite: at least one valid collider center target.
- On dense/odd maps these constraints can remove tactical options; if buff options also fail on prechecks, the whole fallback can produce zero applied items.

Evidence:
- Forced mine candidate is skipped if no quick mine plan exists.
- Forced dynamite candidate is skipped if no quick target exists.
- `isMinePlacementValid()` includes many blockers (field bounds, mines, bricks, colliders, bases, flags, plane proximity).

## Hypothesis 5 — Legacy expectations/docs may not match current runtime (perception gap)
- Repository contains docs about previous hard-fail phase and old AI removal timeline.
- Current runtime in `script.js` includes active computer scheduling and inventory flow, but outdated expectations can bias debugging.
- Team may keep looking for old AI hooks or expecting previous behavior (no inventory usage), while current path is different and requires checking current telemetry/events.

Evidence:
- Legacy-removal documents exist in `docs/`.
- Active runtime function `scheduleComputerMoveWithCargoGate()` builds plans and calls `issueAIMoveFromDoComputerMove`, which runs inventory stage.

## Practical debug checklist (non-invasive)
1. Confirm mode/turn: computer mode, blue turn.
2. Confirm inventory actually non-empty right before AI move.
3. Log `plannedMove.inventoryDecisionMadeMeta` each AI turn.
4. Track `inventory_prelaunch_item_skipped` / `inventory_prelaunch_gate_summary` events.
5. When forced fallback fails, inspect skipped reasons distribution over several turns.
