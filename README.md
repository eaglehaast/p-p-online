# Paper Wings

**Paper Wings** is a browser game about launching paper airplanes and trying to eliminate your opponent's fleet. The entire game runs client-side and only requires a modern web browser.

## Running the game

1. Clone or download this repository.
2. Open `index.html` in any browser.
3. Choose a game mode and press **Play**.

## Quick pre-release check for settings IDs

Before release, run:

```bash
./scripts/check-cp-adds-ids.sh
```

This command verifies that all `id` values inside `.cp-adds` are identical in `index.html` and `settings.html`.

For arcade respawn regression smoke check, run:

```bash
node ./scripts/smoke-arcade-plane-respawn.js
```

This smoke script ensures base-related plane restrictions are applied only in arcade mode and do not leak into non-arcade rulesets.

For shield collision regression smoke check, run:

```bash
node ./scripts/smoke-shield-immediate-rehit.js
```

This smoke script verifies that shield reflection removes only the shield, while anti-repeat cooldown is applied only after a real plane elimination hit.

## Asset source: cargo icons

Current cargo icons used by the game are stored only in:

- `ui_gamescreen/gs_inventory/`

The legacy prototype folder `ui_gamescreen/gamescreen_outside/gs_icon_prototypes/` is removed and must not be used as a runtime source.

## AI self-analyzer (match JSON)

For **Computer** mode, the game now records each finished match in browser storage:

- launches (speed, direction, power ratio),
- AI decision snapshots (`ai_decision`: stage, goal, chosen plane, compact reasons/reject reasons, selected move details),
- turn switches,
- per-round eliminations,
- auto-generated behavior patterns,
- simple AI adjustment recommendations.

To export the latest report as JSON, open browser console and run:

```js
window.exportLatestAiSelfAnalyzerJson()
```

This downloads a file like `ai-self-analyzer-<timestamp>.json`.

To export AI turn-by-turn report (works even before match is finished), run:

```js
window.exportAiSelfAnalyzerTurnsJson()
```

This downloads a file like `ai-self-analyzer-turns-<timestamp>.json`.
The file includes full active match state (or latest finished match if no active one) plus `aiMotivation.decisionEvents` — an easy-to-filter sequence of AI decisions with selected move vectors and compact reasons.

For quick live diagnostics during an active match, use compact AI debug commands:

```js
window.AI_DEBUG_CMD("snapshot")
window.AI_DEBUG_CMD("last-decisions", 5)
window.AI_DEBUG_CMD("status")
window.AI_DEBUG_CMD("reset-cargo")
window.RESET_CARGO()
```

- `snapshot` prints a short current-match summary (mode, turn, counts, last decision).
- `last-decisions` prints last `N` AI decision events in one-line compact format.
- `status` prints current AI mode/goal/turn and `aiMoveScheduled` flag.
- `reset-cargo` instantly clears all current cargo and (if cargo is enabled in settings) immediately spawns a fresh one.
- `RESET_CARGO()` is a direct one-line alias for the same forced cargo reset (without passing command strings).

### How to read `ai_decision` in the exported JSON

Look at `events` and filter entries with `type: "ai_decision"`.

Example fragment:

```json
{
  "type": "ai_decision",
  "stage": "direct_finisher_rejected",
  "goal": "direct_finisher",
  "planeId": null,
  "reasonCodes": ["direct_finisher_skipped", "opening_safety_priority"],
  "rejectReasons": ["opening_phase_restriction"]
}
```

How to interpret:

- `stage`: where in the AI turn this happened,
- `goal`: what AI wanted to do at that step,
- `planeId`: which plane was selected (or `null` if no candidate was chosen),
- `reasonCodes`: short “why selected / why switched” explanation,
- `rejectReasons`: compact “why candidate was rejected” notes.
- `selectedMove`: what AI finally launched (`vx`, `vy`, `totalDist`, `goalName`, `decisionReason`).

Decision events are capped (last N entries kept) to prevent JSON from growing too much during long sessions.

## Game modes

- **Hot Seat** – two players share the same computer.
- **Computer** – fight against a simple AI.
- **Online** – currently disabled in this build.

## Basic rules

- Each side controls a group of paper planes (green vs. blue).
- Use the mouse to drag a plane, aim and release to launch it. Releasing before the first tick mark cancels the move.

- Controls let you tune the range, enable sharp edges, and adjust aiming amplitude. Shorter drag now reduces aiming wobble (both angle and wobble speed), making close shots safer.

- With **Sharp Edges** enabled, hitting the border destroys the plane instead of bouncing it back.
- Hitting an enemy plane destroys it. When one colour has no planes left, the other wins the round.
- Rounds advance automatically; at the end of a match you can choose to play again or return to the menu.

Enjoy!
