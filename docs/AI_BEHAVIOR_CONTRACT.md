# AI Behavior Contract

Version: 1.0  
Owner: gameplay-ai  
Last updated: 2026-04-13

## Purpose

This document defines the target behavior style for Computer-mode AI and is the single source of truth for future AI rewrites.

Primary objective: AI must play proactive, bold, resource-driven matches and avoid passive base camping.

## Style profile

AI should feel:

- smart,
- unexpected,
- bold,
- active every turn.

AI must avoid:

- passive “stay safe at base” behavior,
- empty trick shots with no tactical objective,
- conservative item hoarding.

## Priority model (high → low)

1. Eliminate enemy planes with reasonably safe attacks.
2. Maintain and contest center control.
3. Collect resources/items in center lanes.
4. Capture/move flags when delivery potential is realistic.

Notes:

- Flag pickup by itself is not valuable unless AI can keep delivery chances alive.
- If direct enemy elimination is available with acceptable risk, elimination has priority.

## Inventory policy

Use inventory actively (do not hoard).

Preferred baseline value order:

1. crosshair,
2. fuel,
3. wings,
4. dynamite (situationally can be best),
5. mine,
6. invisibility.

Combinations of the first three items are explicitly encouraged, including full triple-combo use before launch when advantageous.

### Dynamite rules

- If a profitable action is blocked by a wall, that wall is considered conditionally breakable.
- Dynamite should be used on the current turn when it directly enables elimination, flag progress, or resource swing.
- Special defensive exception: removing selected wall segments behind own base is allowed when it reduces enemy flag-steal ricochet escape options.

### Mine rules

Mines are not “rare emergency only” tools.
Use them actively to:

- control center routes,
- block enemy response trajectories,
- lock enemy movement options,
- protect own follow-up attack lines,
- defend key approach vectors to base.

## Exchange and sacrifice policy

Favorable exchanges are acceptable:

- destroy 2 and lose 1 → good,
- secure resource + elimination and then lose 1 → acceptable.

In extreme score-preservation scenarios, deliberate self-sacrifice is allowed if it prevents a significantly worse round outcome.

## Flag policy details

- Do not panic-return by default.
- Intercept enemy flag carrier when realistically possible.
- If interception is unrealistic, continue pressure/value play instead of forced retreat.

## Endgame behavior

As plane counts drop, AI may become even more assertive (not more passive), because tempo and initiative become more decisive.

## Strict anti-patterns (must not happen)

- Base camping for “safety” while yielding center resources.
- Repeated 1-for-1 suicidal trades at enemy base with no strategic upside.
- Decorative high-risk shots with no clear objective.
- Turn resolutions that intentionally avoid making progress when progress options exist.

## Decision tie behavior

When options are close in value:

- allow controlled variety,
- prefer the more aggressive option,
- but execute clearly superior actions deterministically.

## Acceptance checklist for future AI changes

Any AI change should preserve all of the following:

1. AI keeps moving game state forward (no passive loops).
2. Center/resource pressure remains core behavior.
3. Inventory is spent actively, not hoarded.
4. Flag logic remains delivery-aware (not pickup-only).
5. Aggressive style is preserved in low-plane and high-pressure states.
6. Mines and dynamite remain first-class tactical tools.
7. “Clearly best” actions are stable; close actions may vary.
8. AI does not regress into base-stall safety play.

## Implementation note for maintainers

Before editing AI selection/planning/launch code, read this file first.
If behavior changes intentionally, update this contract in the same PR.
