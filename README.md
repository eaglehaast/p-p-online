# Paper Wings

**Paper Wings** is a browser game about launching paper airplanes and trying to eliminate your opponent's fleet. The entire game runs client-side and only requires a modern web browser.

## Running the game

1. Clone or download this repository.
2. Run `python color_controller.py` and choose a color.
3. Open `index.html` in any browser.
4. Choose a game mode and press **Play**.

## Game modes

- **Hot Seat** – two players share the same computer.
- **Computer** – fight against a simple AI.
- **Online** – currently disabled in this build.

## Basic rules

- Each side controls a group of paper planes (green vs. blue).
- Use the mouse to drag a plane, aim and release to launch it. Releasing before the first tick mark cancels the move.
- Controls let you tune the flight range, choose the map ("clear sky", "wall", "two walls", "sharp edges") and adjust aiming amplitude.
- On the "sharp edges" map, hitting the border destroys the plane instead of bouncing it back.
- Hitting an enemy plane destroys it. When one colour has no planes left, the other wins the round.
- After a round you can choose to play again or return to the menu.

Enjoy!
