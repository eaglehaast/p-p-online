# Objective positions reference

## Current defaults
* **Blue flag** – `{ x: 170, y: 41 }` in world pixels (WORLD: 360×640). Defined in `FLAG_LAYOUTS.blue` with size `{ width: 20, height: 20 }` for interaction sprite placement. Source: `script.js`.
* **Green flag** – `{ x: 170, y: 568 }` in world pixels. Defined in `FLAG_LAYOUTS.green` with size `{ width: 20, height: 20 }`.
* **Blue base** – `{ x: 165, y: 21 }` in world pixels. Defined in `BASE_LAYOUTS.blue` with size `{ width: 30, height: 20 }`.
* **Green base** – `{ x: 165, y: 599 }` in world pixels. Defined in `BASE_LAYOUTS.green` with size `{ width: 30, height: 20 }`.

## Coordinate system
* World coordinates are pixel-based with the field sized `360×640` (`WORLD`). `FIELD_LEFT`/`FIELD_WIDTH` align the play area inside that world; the layout coords are absolute world pixels, not grid cells.
* Layout objects (`FLAG_LAYOUTS`, `BASE_LAYOUTS`) store upper-left corners plus width/height. Anchors are derived at runtime as the center of each layout rectangle.

## Where positions are defined
* Hard-coded in `FLAG_LAYOUTS` and `BASE_LAYOUTS` constants near the configuration block in `script.js`.

## Where positions are consumed
* **Anchors & radii:** `getFlagAnchor`/`getBaseAnchor` convert layouts to center points (or fall back to mid-field rows). `getFlagInteractionTarget`/`getBaseInteractionTarget` wrap anchor + interaction radius for pickup/capture checks.
* **Gameplay:** `handleFlagInteractions` checks distances to enemy flag anchors for pickup and to own base anchors for scoring/flag return.
* **Rendering:** `drawFlagMarkers` uses flag anchors/layouts to draw flags (or dropped flag positions). `drawBaseVisuals` draws base sprites or fallback rectangles centered on base anchors.

## Current map coupling
* Positions are fully hard-coded in `FLAG_LAYOUTS`/`BASE_LAYOUTS` inside game configuration; fallbacks compute anchors from field center/home rows if layouts are missing. There is no external map data file.

## Proposed map data shape
Attach a map-supplied object where `FLAG_LAYOUTS`/`BASE_LAYOUTS` are currently declared:

```js
const mapObjectives = {
  bases: {
    blue: { x: 165, y: 21, width: 30, height: 20 },
    green: { x: 165, y: 599, width: 30, height: 20 },
  },
  flags: [
    { id: "flag_main_blue", team: "blue", x: 170, y: 41, width: 20, height: 20 },
    { id: "flag_main_green", team: "green", x: 170, y: 568, width: 20, height: 20 },
    // additional flags per map: { id: "flag_extra", team: "neutral", x, y, width, height }
  ],
};
```

### Integration spot
* Replace `FLAG_LAYOUTS`/`BASE_LAYOUTS` initialization in `script.js` with values pulled from `mapObjectives` so all downstream consumers (`getFlagLayout`, `getBaseLayout`, anchor + interaction functions) automatically use map-driven positions.

