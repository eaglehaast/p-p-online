# Paper Wings

**Paper Wings** is a browser game about launching paper airplanes and trying to eliminate your opponent's fleet. The entire game runs client-side and only requires a modern web browser.

## Running the game

1. Clone or download this repository.
2. Open `index.html` in any browser.
3. Choose a game mode and press **Play**.

## Repository housekeeping note

Legacy development artifacts from the old `dev/` folder (including `dev/test-harness.html` and `dev/settings-test.html`) were removed from the main branch to avoid confusion for new contributors.

If historical reference is needed, use branch `archive/dev-artifacts`.

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

The obsolete prototype folder `ui_gamescreen/gamescreen_outside/gs_icon_prototypes/` is removed and must not be used as a runtime source.

## Legacy goal-priority module removal status

Legacy browser-loaded goal-priority model (`ai/v2/goalPriorityModel.js`) is no longer connected in `index.html`.

What this means now:
- Computer mode continues to use the main built-in heuristic logic from `script.js`.
- Legacy `window.PaperWingsGoalPriorityModel` global is no longer used in the active computer-turn path.
- Cargo reset debug helper remains available:

```js
window.RESET_CARGO()
```

The target behavior reference remains here (as a future implementation target only):
- `docs/AI_BEHAVIOR_CONTRACT.md`

For a detailed “after demolition” list, see:
- `docs/OLD_AI_REMOVAL_NOTE.md`
- `docs/OLD_AI_REMOVAL_MANIFEST.md`


## Game modes

- **Hot Seat** – two players share the same computer.
- **Computer** – available and driven by the current in-file heuristic logic.
- **Online** – currently disabled in this build.

## Basic rules

- Each side controls a group of paper planes (green vs. blue).
- Use the mouse to drag a plane, aim and release to launch it. Releasing before the first tick mark cancels the move.

- Controls let you tune the range, enable sharp edges, and adjust aiming amplitude. Shorter drag now reduces aiming wobble (both angle and wobble speed), making close shots safer.

- With **Sharp Edges** enabled, hitting the border destroys the plane instead of bouncing it back.
- Hitting an enemy plane destroys it. When one colour has no planes left, the other wins the round.
- Rounds advance automatically; at the end of a match you can choose to play again or return to the menu.

Enjoy!
