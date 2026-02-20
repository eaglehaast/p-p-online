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
