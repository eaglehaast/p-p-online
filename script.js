/***************************************************************
 * Paper Wings — mobile-friendly build
 * Range shown with a plane and animated exhaust flame.
 * Includes fixes for plane orientation, AI turns, and mini-icon counter.
 ***************************************************************/



/* ======= DOM ======= */
const mantisIndicator = document.getElementById("mantisIndicator");
const goatIndicator   = document.getElementById("goatIndicator");

const DEBUG_RESIZE = false;
const DEBUG_BOOT = false;
const DEBUG_LAYOUT = false;
const DEBUG_START_POSITIONS = false;
const DEBUG_RENDER_INIT = false;
const DEBUG_ENDGAME = false;
const DEBUG_AIM = false;
const DEBUG_PLANE_SHADING = false;
const DEBUG_FX = false;
const DEBUG_NUKE = false;
const DEBUG_FLAME_POS = false;
const DEBUG_LAYERS = false;
const DEBUG_VFX = false;
const DEBUG_BRICK_COLLISIONS = false;
const DEBUG_COLLISIONS_TOI = false;
const DEBUG_COLLISIONS_VERBOSE = false;
const DEBUG_STARTUP_WORLDY = false;
const DEBUG_WRAPPER_SYNC = false;
const DEBUG_CHEATS = typeof location !== "undefined" && location.hash.includes("dev");

if (typeof window !== 'undefined') {
  window.PINCH_ACTIVE = false;
}

const bootTrace = {
  startTs: null,
  markers: [],
  resizeWindow: null
};

const loadingOverlay = document.getElementById("loadingOverlay");

document.documentElement.classList.toggle('debug-layout', DEBUG_LAYOUT);

const uiFrameEl = document.getElementById("uiFrame");
const uiFrameInner = (() => {
  if (!(uiFrameEl instanceof HTMLElement)) {
    return null;
  }
  const existingInner = document.getElementById("uiFrameInner");
  if (existingInner instanceof HTMLElement) {
    return existingInner;
  }
  const inner = document.createElement("div");
  inner.id = "uiFrameInner";
  inner.style.width = "100%";
  inner.style.height = "100%";
  inner.style.transformOrigin = "50% 50%";
  while (uiFrameEl.firstChild) {
    inner.appendChild(uiFrameEl.firstChild);
  }
  uiFrameEl.appendChild(inner);
  return inner;
})();
const menuLayer = document.getElementById("menuLayer");
const settingsLayer = document.getElementById("settingsLayer");
const gsFrameLayer = document.getElementById("gsFrame");
const gsFrameEl = document.getElementById("gameContainer");
const gameBackgroundEl = document.getElementById("gameBackground") || gsFrameEl;
const gameScreen = gsFrameLayer || document.getElementById("gameScreen") || gsFrameEl;
const gsBoardCanvas  = document.getElementById("gameCanvas");
const gsBoardCtx     = gsBoardCanvas.getContext("2d");

const aimCanvas   = document.getElementById("aimCanvas");
const aimCtx      = aimCanvas.getContext("2d");

const planeCanvas = document.getElementById("planeCanvas");
const planeCtx    = planeCanvas.getContext("2d");

const hudCanvas = document.getElementById("hudCanvas");
const hudCtx = hudCanvas instanceof HTMLCanvasElement ? hudCanvas.getContext("2d") : null;
const boardDimmerLayer = document.getElementById("boardDimmerLayer");
const boardDimmerHole = document.getElementById("boardDimmerHole");

function supportsBoardDimmerMasking(){
  if (!(window.CSS && typeof window.CSS.supports === "function")) return false;
  const standardMask = CSS.supports("mask-composite", "exclude");
  const webkitMask = CSS.supports("-webkit-mask-composite", "xor");
  return Boolean(standardMask || webkitMask);
}

if (boardDimmerLayer instanceof HTMLElement && !supportsBoardDimmerMasking()) {
  boardDimmerLayer.classList.add("board-dimmer--fallback");
}

function logEndGameAction(action){
  if (!DEBUG_ENDGAME) return;

  const body = document.body;
  console.log('[endgame]', {
    action,
    screen: {
      menu: body.classList.contains('screen--menu'),
      game: body.classList.contains('screen--game'),
      settings: body.classList.contains('screen--settings'),
    },
    menuLocked: menuScreenLocked,
    endGameVisible: endGameDiv?.style?.display,
    loopRunning: animationFrameId !== null,
  });
}

function setScreenMode(mode) {
  document.body.classList.toggle('screen--menu', mode === 'MENU');
  document.body.classList.toggle('screen--game', mode === 'GAME');
  document.body.classList.toggle('screen--settings', mode === 'SETTINGS');
}

setScreenMode('MENU');

const WORLD = { width: 360, height: 640 };
const VIEW = {
  dpr: 1,
  cssW: 0,
  cssH: 0,
  pxW: 0,
  pxH: 0,
  scaleX: 1,
  scaleY: 1
};

const resizeDebugState = {
  lastLogTime: 0,
  counts: {
    resizeCanvas: 0,
    scheduleViewportResize: 0,
    syncAllCanvasBackingStores: 0,
    resizeCanvasToMatchCss: 0
  }
};

const renderInitState = {
  firstFrameDrawn: false,
  lastDrawLogTime: 0
};

const pointerDebugState = {
  logged: 0,
  lastPoint: null
};

const aimDebugState = {
  lastLogTime: 0
};

const planeFlameDebugState = {
  logged: 0
};

const startupWorldYDebugState = {
  logged: false
};

const wrapperSyncDebugState = {
  logged: false
};

function toDesignCoords(clientX, clientY) {
  const rect = uiFrameEl?.getBoundingClientRect?.() || { left: 0, top: 0 };
  const rootStyle = window.getComputedStyle(document.documentElement);
  const uiScaleRaw = rootStyle.getPropertyValue('--ui-scale');
  const uiScaleValue = uiScaleRaw ? parseFloat(uiScaleRaw) : 1;
  const uiScale = Number.isFinite(uiScaleValue) && uiScaleValue > 0 ? uiScaleValue : 1;
  return {
    x: (clientX - rect.left) / uiScale,
    y: (clientY - rect.top) / uiScale,
    rect,
    uiScale
  };
}

function getPointerClientCoords(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0] || event?.targetTouches?.[0] || null;
  const source = touch || event;
  return {
    clientX: Number.isFinite(source?.clientX) ? source.clientX : 0,
    clientY: Number.isFinite(source?.clientY) ? source.clientY : 0
  };
}

function getPointerDesignCoords(event) {
  const { clientX, clientY } = getPointerClientCoords(event);
  return toDesignCoords(clientX, clientY);
}

function designToBoardCoords(designX, designY) {
  const boardRect = getBoardCssRect();
  return {
    x: designX - boardRect.left,
    y: designY - boardRect.top
  };
}

function getCanvasDpr() {
  const RAW_DPR = window.devicePixelRatio || 1;
  const CANVAS_DPR = RAW_DPR;
  return { RAW_DPR, CANVAS_DPR };
}

function logResizeDebug(eventKey) {
  if (!DEBUG_RESIZE) return;
  const now = performance.now();
  if (eventKey && resizeDebugState.counts[eventKey] !== undefined) {
    resizeDebugState.counts[eventKey] += 1;
  }
  if (resizeDebugState.lastLogTime === 0) {
    resizeDebugState.lastLogTime = now;
    return;
  }
  const elapsedMs = now - resizeDebugState.lastLogTime;
  if (elapsedMs < 1000) return;

  const elapsedSec = elapsedMs / 1000;
  const perSecond = Object.fromEntries(
    Object.entries(resizeDebugState.counts).map(([key, count]) => [
      key,
      Math.round((count / elapsedSec) * 10) / 10
    ])
  );
  const { RAW_DPR, CANVAS_DPR } = getCanvasDpr();
  const backingStoreSizes = {
    gsBoardCanvas: gsBoardCanvas ? `${gsBoardCanvas.width}x${gsBoardCanvas.height}` : null,
    aimCanvas: aimCanvas ? `${aimCanvas.width}x${aimCanvas.height}` : null,
    planeCanvas: planeCanvas ? `${planeCanvas.width}x${planeCanvas.height}` : null
  };
  console.log('[resize-debug] calls per second', perSecond, {
    RAW_DPR,
    CANVAS_DPR,
    backingStoreSizes
  });
  resizeDebugState.counts.resizeCanvas = 0;
  resizeDebugState.counts.scheduleViewportResize = 0;
  resizeDebugState.counts.syncAllCanvasBackingStores = 0;
  resizeDebugState.counts.resizeCanvasToMatchCss = 0;
  resizeDebugState.lastLogTime = now;
}

function logStartupWorldYOnce(startPositions) {
  if (!DEBUG_STARTUP_WORLDY || startupWorldYDebugState.logged) return;
  startupWorldYDebugState.logged = true;

  const rootStyle = window.getComputedStyle(document.documentElement);
  const uiScaleRaw = rootStyle.getPropertyValue('--ui-scale');
  const uiScaleValue = uiScaleRaw ? parseFloat(uiScaleRaw) : 1;
  const uiScale = Number.isFinite(uiScaleValue) && uiScaleValue > 0 ? uiScaleValue : 1;
  const overlayRect = overlayContainer?.getBoundingClientRect?.();
  const overlayRectSummary = overlayRect
    ? {
      left: overlayRect.left,
      top: overlayRect.top,
      width: overlayRect.width,
      height: overlayRect.height
    }
    : null;

  console.log('[startup-worldy]', {
    uiScaleRaw,
    uiScale,
    FIELD_LEFT,
    FIELD_BORDER_OFFSET_Y,
    WORLD_height: WORLD.height,
    overlayContainer: overlayRectSummary,
    startWorldY: {
      green: startPositions.green.map(({ y }) => y),
      blue: startPositions.blue.map(({ y }) => y)
    }
  });
}

function logRenderInit(label, details = {}) {
  if (!DEBUG_RENDER_INIT) return;
  const gsBoardDetails = getGsBoardCanvasDebugInfo();
  const payload = gsBoardDetails ? { ...details, gsBoardCanvas: gsBoardDetails } : details;
  console.log("[render-init]", label, payload);
}

function trackBootResizeCount(counterKey) {
  if (!DEBUG_BOOT && !DEBUG_RESIZE) return;
  const activeWindow = bootTrace.resizeWindow;
  if (!activeWindow) return;
  const now = performance.now();
  if (now - activeWindow.start < 2000 && counterKey in activeWindow) {
    activeWindow[counterKey] += 1;
  }
}

function logBootStep(label) {
  if (!DEBUG_BOOT || bootTrace.startTs === null) return;
  const entry = { label, t: performance.now() - bootTrace.startTs };
  bootTrace.markers.push(entry);
  console.log('[boot]', entry);
}

function logLayoutDebug() {
  if (!DEBUG_LAYOUT) return;
  const gsBoardDetails = getGsBoardCanvasDebugInfo();
  const rectSummary = (el) => {
    if (!el?.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  };
  const rects = {
    gsFrame: rectSummary(gsFrameLayer),
    gameCanvas: rectSummary(gsBoardCanvas),
    overlayContainer: rectSummary(overlayContainer),
    aimCanvas: rectSummary(aimCanvas),
    planeCanvas: rectSummary(planeCanvas),
    gsBoardDebug: gsBoardDetails
  };
  const transformStack = [];
  let current = gsFrameLayer;
  while (current) {
    const styles = getComputedStyle(current);
    transformStack.push({
      element: current.id || current.className || current.tagName,
      transform: styles.transform,
      zoom: styles.zoom
    });
    current = current.parentElement;
  }
  console.log('[layout-debug] rects', rects);
  console.log('[layout-debug] transforms', transformStack);
}

function debugLogLayerStack() {
  if (!DEBUG_LAYERS) return;

  const summarizeBounds = (el) => {
    if (!(el instanceof HTMLElement) || typeof el.getBoundingClientRect !== 'function') {
      return null;
    }
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom
    };
  };

  const collectLayerInfo = (el) => {
    if (!(el instanceof HTMLElement)) return null;
    const styles = window.getComputedStyle(el);
    const zIndexStr = styles?.zIndex ?? '';
    const zIndexNumber = Number.isFinite(Number(zIndexStr)) ? Number(zIndexStr) : null;
    return {
      tag: el.tagName?.toLowerCase?.() || '',
      id: el.id || '',
      className: el.className || '',
      styleZIndex: el.style?.zIndex || '',
      computedZIndex: zIndexStr,
      zIndexNumber,
      backgroundImage: styles?.backgroundImage,
      opacity: styles?.opacity,
      bounds: summarizeBounds(el)
    };
  };

  const candidates = [
    gsFrameLayer,
    gsFrameEl,
    gsBoardCanvas,
    aimCanvas,
    overlayContainer,
    planeCanvas,
    uiOverlay,
    hudCanvas,
    greenPlaneCounter,
    bluePlaneCounter,
    hudPlaneStyleProbes,
    mantisIndicator,
    goatIndicator,
    endGameDiv
  ];

  const layers = candidates
    .map(collectLayerInfo)
    .filter(Boolean)
    .map((layer, index) => ({ order: index, ...layer }));

  const orderedByZ = [...layers].sort((a, b) => {
    const aZ = a.zIndexNumber ?? -Infinity;
    const bZ = b.zIndexNumber ?? -Infinity;
    if (aZ === bZ) return a.order - b.order;
    return bZ - aZ;
  });

  console.log('[layers][DOM order]', layers);
  console.log('[layers][z-index order]', orderedByZ);
}

function logAimDebug(details = {}) {
  if (!DEBUG_AIM) return;
  const now = performance.now();
  if (aimDebugState.lastLogTime === 0) {
    aimDebugState.lastLogTime = now;
    return;
  }
  if (now - aimDebugState.lastLogTime < 1000) return;
  aimDebugState.lastLogTime = now;
  const rectSummary = (el) => {
    if (!el?.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  };
  console.log('[aim-debug]', {
    ...details,
    aimCanvas: rectSummary(aimCanvas),
    gsBoardCanvas: rectSummary(gsBoardCanvas),
    aimVisible: aimCanvas?.style?.display !== 'none'
  });
}

function getGsBoardCanvasDebugInfo() {
  if (!gsBoardCanvas?.getBoundingClientRect) return null;
  const rect = gsBoardCanvas.getBoundingClientRect();
  return {
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    },
    backing: {
      width: gsBoardCanvas.width,
      height: gsBoardCanvas.height
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    viewDpr: VIEW.dpr
  };
}

function drawDebugLayoutOverlay(ctx) {
  if (!(DEBUG_LAYOUT || DEBUG_RENDER_INIT || DEBUG_START_POSITIONS)) return;
  if (!ctx) return;
  const scale = Math.max(1, VIEW.scaleX, VIEW.scaleY);
  ctx.save();
  ctx.strokeStyle = "rgba(255, 0, 255, 0.8)";
  ctx.lineWidth = 1 / scale;
  ctx.strokeRect(0, 0, WORLD.width, WORLD.height);
  if (pointerDebugState.lastPoint) {
    ctx.fillStyle = "rgba(255, 0, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(pointerDebugState.lastPoint.x, pointerDebugState.lastPoint.y, 3 / scale, 0, Math.PI * 2);
    ctx.fill();
  }

  if (DEBUG_START_POSITIONS) {
    drawStartPositionsDebug(ctx, scale);
  }
  ctx.restore();
}

function drawStartPositionsDebug(ctx, scale = 1) {
  const markerRadius = 3 / scale;
  const frameLineWidth = 2 / scale;
  const fieldLineWidth = 1 / scale;
  ctx.save();

  // Outer field bounds (full frame)
  ctx.strokeStyle = "rgba(0, 191, 255, 0.75)";
  ctx.lineWidth = frameLineWidth;
  ctx.strokeRect(FIELD_LEFT, FIELD_TOP, FIELD_WIDTH, FIELD_HEIGHT);

  // Playable area without brick thickness
  const playableLeft = FIELD_LEFT + FIELD_BORDER_OFFSET_X;
  const playableTop = FIELD_TOP + FIELD_BORDER_OFFSET_Y;
  const playableWidth = Math.max(0, FIELD_WIDTH - FIELD_BORDER_OFFSET_X * 2);
  const playableHeight = Math.max(0, FIELD_HEIGHT - FIELD_BORDER_OFFSET_Y * 2);
  ctx.strokeStyle = "rgba(255, 165, 0, 0.85)";
  ctx.lineWidth = fieldLineWidth;
  ctx.strokeRect(playableLeft, playableTop, playableWidth, playableHeight);

  const startPositions = getStartPlaneWorldPositions();
  const drawMarker = (p, color) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = fieldLineWidth;
    ctx.moveTo(p.x - markerRadius, p.y);
    ctx.lineTo(p.x + markerRadius, p.y);
    ctx.moveTo(p.x, p.y - markerRadius);
    ctx.lineTo(p.x, p.y + markerRadius);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, markerRadius / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  startPositions.blue.forEach((p) => drawMarker(p, "rgba(1, 60, 131, 0.9)"));
  startPositions.green.forEach((p) => drawMarker(p, "rgba(127, 142, 64, 0.9)"));

  ctx.restore();
}

function logPointerDebugEvent(event) {
  if (!(DEBUG_LAYOUT || DEBUG_RENDER_INIT)) return;
  const design = getPointerDesignCoords(event);
  const board = designToBoardCoords(design.x, design.y);
  pointerDebugState.lastPoint = { x: board.x, y: board.y };
  if (pointerDebugState.logged >= 3) return;
  pointerDebugState.logged += 1;
  console.log("[pointer-debug]", {
    index: pointerDebugState.logged,
    clientX: design.rect ? design.rect.left + design.x * design.uiScale : null,
    clientY: design.rect ? design.rect.top + design.y * design.uiScale : null,
    x: board.x,
    y: board.y
  });
}

function getCanvasDesignMetrics(canvas) {
  const isBoardLayer = canvas === gsBoardCanvas || canvas === planeCanvas;
  const isFrameLayer = canvas === aimCanvas || canvas === hudCanvas;

  if (isBoardLayer) {
    const boardRect = getBoardCssRect();
    return {
      cssW: boardRect.width,
      cssH: boardRect.height,
      offsetX: boardRect.left,
      offsetY: boardRect.top
    };
  }

  if (isFrameLayer) {
    return {
      cssW: FRAME_BASE_WIDTH,
      cssH: FRAME_BASE_HEIGHT,
      offsetX: 0,
      offsetY: 0
    };
  }

  return {
    cssW: CANVAS_BASE_WIDTH,
    cssH: CANVAS_BASE_HEIGHT,
    offsetX: 0,
    offsetY: 0
  };
}

function computeViewFromCanvas(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const { RAW_DPR } = getCanvasDpr();
  const { cssW, cssH } = getCanvasDesignMetrics(canvas);
  const pxW = Math.max(1, Math.round(cssW * RAW_DPR));
  const pxH = Math.max(1, Math.round(cssH * RAW_DPR));

  VIEW.dpr = RAW_DPR;
  VIEW.cssW = cssW;
  VIEW.cssH = cssH;
  VIEW.pxW = pxW;
  VIEW.pxH = pxH;
  VIEW.scaleX = pxW / WORLD.width;
  VIEW.scaleY = pxH / WORLD.height;
}

function worldToPx(x, y) {
  return { x: x * VIEW.scaleX, y: y * VIEW.scaleY };
}

function pxToWorld(x, y) {
  return { x: x / VIEW.scaleX, y: y / VIEW.scaleY };
}

function resizeCanvasToMatchCss(canvas) {
  logResizeDebug('resizeCanvasToMatchCss');
  if (!(canvas instanceof HTMLCanvasElement)) return;

  const { RAW_DPR } = getCanvasDpr();
  const { cssW, cssH } = getCanvasDesignMetrics(canvas);
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const backingW = Math.max(1, Math.round(w * RAW_DPR));
  const backingH = Math.max(1, Math.round(h * RAW_DPR));

  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  if (canvas.width !== backingW) canvas.width = backingW;
  if (canvas.height !== backingH) canvas.height = backingH;
}

function applyViewTransform(ctx) {
  if (!ctx) return;
  ctx.setTransform(VIEW.scaleX, 0, 0, VIEW.scaleY, 0, 0);
}

function syncCanvasBackingStore(canvas, baseWidth, baseHeight) {
  if (!canvas) return;
  const { RAW_DPR } = getCanvasDpr();
  const backingW = Math.max(1, Math.round(baseWidth * RAW_DPR));
  const backingH = Math.max(1, Math.round(baseHeight * RAW_DPR));

  if (canvas.width !== backingW) canvas.width = backingW;
  if (canvas.height !== backingH) canvas.height = backingH;
}

function syncHudCanvasLayout() {
  if (!(hudCanvas instanceof HTMLCanvasElement)) return;
  const { RAW_DPR } = getCanvasDpr();
  const backingW = Math.max(1, Math.round(FRAME_BASE_WIDTH * RAW_DPR));
  const backingH = Math.max(1, Math.round(FRAME_BASE_HEIGHT * RAW_DPR));
  if (hudCanvas.width !== backingW) hudCanvas.width = backingW;
  if (hudCanvas.height !== backingH) hudCanvas.height = backingH;
}

function syncAimCanvasLayout() {
  if (!(aimCanvas instanceof HTMLCanvasElement)) return;
  const { RAW_DPR } = getCanvasDpr();
  const backingW = Math.max(1, Math.round(FRAME_BASE_WIDTH * RAW_DPR));
  const backingH = Math.max(1, Math.round(FRAME_BASE_HEIGHT * RAW_DPR));
  if (aimCanvas.width !== backingW) aimCanvas.width = backingW;
  if (aimCanvas.height !== backingH) aimCanvas.height = backingH;
}

function syncFieldCssVars() {
  const fieldVarsHost = gsFrameEl instanceof HTMLElement
    ? gsFrameEl
    : (gsBoardCanvas?.parentElement instanceof HTMLElement ? gsBoardCanvas.parentElement : null);
  if (!fieldVarsHost) return;
  const fieldLeft = getFieldLeftCssValue();
  const fieldTop = getFieldTopCssValue();
  fieldVarsHost.style.setProperty("--field-left", `${fieldLeft}px`);
  fieldVarsHost.style.setProperty("--field-top", `${fieldTop}px`);
  fieldVarsHost.style.setProperty("--field-width", `${WORLD.width}px`);
  fieldVarsHost.style.setProperty("--field-height", `${WORLD.height}px`);
}

function logCanvasCreation(canvas, label = "") {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }
  const tag = label ? ` ${label}` : "";
  console.log(`CANVAS CREATED${tag}`.trim(), {
    id: canvas.id,
    className: canvas.className,
    width: canvas.width,
    height: canvas.height,
    stack: new Error().stack,
  });
}

const overlayContainer = document.getElementById("overlayContainer");
const overlayFxLayer = document.getElementById("overlayFxLayer");
const fxHostLayer = document.getElementById("fxHostLayer");
const uiOverlay = document.getElementById("uiOverlay");
const nuclearStrikeLayer = document.getElementById("nuclearStrikeLayer");
const nuclearStrikeGif = document.getElementById("nuclearStrikeGif");
const nuclearStrikeFlash = document.getElementById("nuclearStrikeFlash");

let OVERLAY_RESYNC_SCHEDULED = false;

const greenPlaneCounter = document.getElementById("gs_planecounter_green");
const bluePlaneCounter  = document.getElementById("gs_planecounter_blue");
const blueInventoryHost = document.getElementById("gs_inventory_blue");
const greenInventoryHost = document.getElementById("gs_inventory_green");
const inventoryLayer = document.getElementById("inventoryLayer");

// Animated GIF frames for explosion sprites
const EXPLOSION_BLUE_SPRITES = [
  "ui_gamescreen/blue_explosions_short/explosion_blue_short_1.gif",
  "ui_gamescreen/blue_explosions_short/explosion_blue_short_2.gif",
  "ui_gamescreen/blue_explosions_short/explosion_blue_short_3.gif",
  "ui_gamescreen/blue_explosions_short/explosion_blue_short_4.gif",
  "ui_gamescreen/blue_explosions_short/explosion_blue_short_5.gif"
];

const EXPLOSION_GREEN_SPRITES = [
  "ui_gamescreen/green_explosions_short/green_explosion_short1.gif",
  "ui_gamescreen/green_explosions_short/green_explosion_short3.gif",
  "ui_gamescreen/green_explosions_short/green_explosion_short4.gif",
  "ui_gamescreen/green_explosions_short/green_explosion_short5.gif",
  "ui_gamescreen/green_explosions_short/green_explosion_short6.gif"
];

const ALL_EXPLOSION_SPRITES = [
  ...EXPLOSION_BLUE_SPRITES,
  ...EXPLOSION_GREEN_SPRITES
];

const FLAG_SPRITE_PATHS = {
  blue: "ui_gamescreen/flags and bases colored/flag_blue_nest.png.png",
  green: "ui_gamescreen/flags and bases colored/flag_green_corn.png.png",
};

const BASE_SPRITE_PATHS = {
  blue: "ui_gamescreen/flags and bases colored/blue_base.png.png",
  green: "ui_gamescreen/flags and bases colored/green_base.png.png",
};

const INVENTORY_ITEM_TYPES = {
  MINE: "mine",
  NUCLEAR_STRIKE: "nuclear_strike",
  CROSSHAIR: "crosshair",
  FUEL: "fuel",
  DYNAMITE: "dynamite",
};

const ITEM_USAGE_TARGETS = Object.freeze({
  BOARD: "board",
  SELF_PLANE: "self_plane",
});

const itemUsageConfig = Object.freeze({
  [INVENTORY_ITEM_TYPES.NUCLEAR_STRIKE]: {
    target: ITEM_USAGE_TARGETS.BOARD,
    hintText: "Drop on the field. Think twice.",
    requiresDragAndDrop: true,
  },
  [INVENTORY_ITEM_TYPES.CROSSHAIR]: {
    target: ITEM_USAGE_TARGETS.SELF_PLANE,
    hintText: "Apply to your plane. Guaranteed hit!",
    requiresDragAndDrop: true,
  },
  [INVENTORY_ITEM_TYPES.FUEL]: {
    target: ITEM_USAGE_TARGETS.SELF_PLANE,
    hintText: "Apply to your plane. Double flight range!",
    requiresDragAndDrop: true,
  },
  [INVENTORY_ITEM_TYPES.MINE]: {
    target: ITEM_USAGE_TARGETS.BOARD,
    hintText: "Install it on the field. Dangerous for everyone, including you.",
    requiresDragAndDrop: true,
  },
  [INVENTORY_ITEM_TYPES.DYNAMITE]: {
    target: ITEM_USAGE_TARGETS.BOARD,
    hintText: "",
    requiresDragAndDrop: false,
  },
});

const NUCLEAR_STRIKE_FX = {
  path: "ui_gamescreen/gamescreen_outside/gs_cargoeffects/gs_cagroeffects_nuclearstrike.gif",
  durationMs: 1980,
};

const NUCLEAR_STRIKE_TIMELINE_PHASES = Object.freeze({
  GIF_PLAY: "gif_play",
  PAUSE_AFTER_GIF: "pause_after_gif",
  SCORE_COUNTUP: "score_countup",
  PAUSE_AFTER_SCORE: "pause_after_score",
  SHOW_NO_SURVIVORS: "show_no_survivors",
  PAUSE_BEFORE_NEW_ROUND: "pause_before_new_round",
});

const NUCLEAR_STRIKE_TIMELINE_ORDER = Object.freeze([
  NUCLEAR_STRIKE_TIMELINE_PHASES.GIF_PLAY,
  NUCLEAR_STRIKE_TIMELINE_PHASES.PAUSE_AFTER_GIF,
  NUCLEAR_STRIKE_TIMELINE_PHASES.SCORE_COUNTUP,
  NUCLEAR_STRIKE_TIMELINE_PHASES.PAUSE_AFTER_SCORE,
  NUCLEAR_STRIKE_TIMELINE_PHASES.SHOW_NO_SURVIVORS,
  NUCLEAR_STRIKE_TIMELINE_PHASES.PAUSE_BEFORE_NEW_ROUND,
]);

const NUCLEAR_STRIKE_TIMELINE_DEFAULTS = Object.freeze({
  [NUCLEAR_STRIKE_TIMELINE_PHASES.GIF_PLAY]: NUCLEAR_STRIKE_FX.durationMs,
  [NUCLEAR_STRIKE_TIMELINE_PHASES.PAUSE_AFTER_GIF]: 1000,
  [NUCLEAR_STRIKE_TIMELINE_PHASES.SCORE_COUNTUP]: 1000,
  [NUCLEAR_STRIKE_TIMELINE_PHASES.PAUSE_AFTER_SCORE]: 1000,
  [NUCLEAR_STRIKE_TIMELINE_PHASES.SHOW_NO_SURVIVORS]: 2000,
  [NUCLEAR_STRIKE_TIMELINE_PHASES.PAUSE_BEFORE_NEW_ROUND]: 1000,
});

const NUKE_TIMELINE = {
  ...NUCLEAR_STRIKE_TIMELINE_DEFAULTS,
};

const INVENTORY_ITEMS = [
  {
    type: INVENTORY_ITEM_TYPES.MINE,
    iconPath: "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_mine.png",
  },
  {
    type: INVENTORY_ITEM_TYPES.NUCLEAR_STRIKE,
    iconPath: "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_nuclear_strike.png",
  },
  {
    type: INVENTORY_ITEM_TYPES.CROSSHAIR,
    iconPath: "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_crosshair.png",
  },
  {
    type: INVENTORY_ITEM_TYPES.FUEL,
    iconPath: "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_fuel_barrel.png",
  },
  {
    type: INVENTORY_ITEM_TYPES.DYNAMITE,
    iconPath: "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_dynamite.png",
  },
];

const INVENTORY_SLOT_ORDER = [
  INVENTORY_ITEM_TYPES.CROSSHAIR,
  INVENTORY_ITEM_TYPES.FUEL,
  INVENTORY_ITEM_TYPES.MINE,
  INVENTORY_ITEM_TYPES.DYNAMITE,
  INVENTORY_ITEM_TYPES.NUCLEAR_STRIKE,
];

const INVENTORY_EMPTY_ICON =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const inventoryState = {
  blue: [],
  green: [],
};

const inventoryHintState = {
  blue: {
    color: "blue",
    text: "",
    visible: false,
    anchorX: 0,
    anchorY: 0,
  },
  green: {
    color: "green",
    text: "",
    visible: false,
    anchorX: 0,
    anchorY: 0,
  },
};

const inventoryHosts = {
  blue: blueInventoryHost,
  green: greenInventoryHost,
};

let nuclearStrikeHideTimeoutId = null;
let activeNuclearDrag = null;
let pendingInventoryUse = null;

function setPendingInventoryUse(nextState){
  if(nextState && (!nextState.color || !nextState.type)) return;
  pendingInventoryUse = nextState ? { color: nextState.color, type: nextState.type } : null;
  syncInventoryUI("blue");
  syncInventoryUI("green");
}

function cancelPendingInventoryUse(){
  setPendingInventoryUse(null);
}
let isNuclearStrikeResolutionActive = false;
let isNukeCinematicActive = false;

const nuclearStrikeTimelineState = {
  isActive: false,
  currentPhase: null,
  phaseStartAt: 0,
  scenarioStartAt: 0,
  totalDurationMs: 0,
  totalElapsedMs: 0,
  phaseElapsedMs: 0,
  scoreDeltas: { blue: 0, green: 0 },
  awardedScore: { blue: 0, green: 0 },
  scoreQueueResolved: false,
  startNewRoundQueued: false,
};

const NUCLEAR_STRIKE_STAGES = Object.freeze({
  IDLE: "idle",
  DRAGGING: "dragging",
  ARMED: "armed",
  CINEMATIC: "cinematic",
  RESOLVED: "resolved",
});

const NUCLEAR_STRIKE_STAGE_TRANSITIONS = Object.freeze({
  [NUCLEAR_STRIKE_STAGES.IDLE]: [NUCLEAR_STRIKE_STAGES.DRAGGING],
  [NUCLEAR_STRIKE_STAGES.DRAGGING]: [NUCLEAR_STRIKE_STAGES.IDLE, NUCLEAR_STRIKE_STAGES.ARMED],
  [NUCLEAR_STRIKE_STAGES.ARMED]: [NUCLEAR_STRIKE_STAGES.CINEMATIC],
  [NUCLEAR_STRIKE_STAGES.CINEMATIC]: [NUCLEAR_STRIKE_STAGES.RESOLVED],
  [NUCLEAR_STRIKE_STAGES.RESOLVED]: [NUCLEAR_STRIKE_STAGES.IDLE],
});

let nuclearStrikeStage = NUCLEAR_STRIKE_STAGES.IDLE;

function applyNuclearStrikeInputLockUi(isLocked){
  const lockEnabled = Boolean(isLocked);
  document.body?.classList.toggle("nuke-input-locked", lockEnabled);
  if(inventoryLayer instanceof HTMLElement){
    inventoryLayer.classList.toggle("is-nuke-locked", lockEnabled);
  }
}

function isNuclearStrikeActionLocked(){
  return Boolean(isNuclearStrikeResolutionActive || isNukeCinematicActive);
}

function updateBoardDimmerMask(){
  if (!(boardDimmerLayer instanceof HTMLElement)) return;
  if (!(gsBoardCanvas instanceof HTMLElement)) return;
  const boardRect = gsBoardCanvas.getBoundingClientRect();
  const left = Math.round(boardRect.left);
  const top = Math.round(boardRect.top);
  const width = Math.round(boardRect.width);
  const height = Math.round(boardRect.height);
  boardDimmerLayer.style.setProperty("--dimmer-hole-left", `${left}px`);
  boardDimmerLayer.style.setProperty("--dimmer-hole-top", `${top}px`);
  boardDimmerLayer.style.setProperty("--dimmer-hole-width", `${width}px`);
  boardDimmerLayer.style.setProperty("--dimmer-hole-height", `${height}px`);

  if (boardDimmerHole instanceof HTMLElement) {
    boardDimmerHole.style.left = `${left}px`;
    boardDimmerHole.style.top = `${top}px`;
    boardDimmerHole.style.width = `${width}px`;
    boardDimmerHole.style.height = `${height}px`;
  }
}

function setBoardDimmerActive(isActive){
  if (!(boardDimmerLayer instanceof HTMLElement)) return;
  if (isActive) {
    updateBoardDimmerMask();
  }
  boardDimmerLayer.classList.toggle("is-active", Boolean(isActive));
}

function clearNuclearStrikeCinematicLayer(){
  if(!(nuclearStrikeLayer instanceof HTMLElement) || !(nuclearStrikeGif instanceof HTMLImageElement) || !(nuclearStrikeFlash instanceof HTMLElement)) {
    return;
  }
  if(nuclearStrikeHideTimeoutId){
    clearTimeout(nuclearStrikeHideTimeoutId);
    nuclearStrikeHideTimeoutId = null;
  }
  nuclearStrikeLayer.hidden = true;
  nuclearStrikeFlash.classList.remove("is-on");
  nuclearStrikeGif.src = INVENTORY_EMPTY_ICON;
}

function getNukePhaseDurationMs(phaseName){
  const configured = NUKE_TIMELINE[phaseName];
  if(Number.isFinite(configured) && configured >= 0){
    return configured;
  }
  return NUCLEAR_STRIKE_TIMELINE_DEFAULTS[phaseName] ?? 0;
}

function getNukeTimelineTotalDurationMs(){
  return NUCLEAR_STRIKE_TIMELINE_ORDER.reduce((sum, phaseName) => sum + getNukePhaseDurationMs(phaseName), 0);
}

function getNukeTimelinePhaseStartMs(phaseName){
  let elapsed = 0;
  for(const candidate of NUCLEAR_STRIKE_TIMELINE_ORDER){
    if(candidate === phaseName){
      return elapsed;
    }
    elapsed += getNukePhaseDurationMs(candidate);
  }
  return elapsed;
}

function getNukeTimelinePhaseByElapsed(elapsedMs){
  const safeElapsed = Math.max(0, elapsedMs);
  let cursor = 0;
  for(const phaseName of NUCLEAR_STRIKE_TIMELINE_ORDER){
    const duration = getNukePhaseDurationMs(phaseName);
    if(safeElapsed < cursor + duration){
      return {
        phaseName,
        phaseStartOffsetMs: cursor,
        phaseElapsedMs: safeElapsed - cursor,
        phaseDurationMs: duration,
      };
    }
    cursor += duration;
  }
  const lastPhase = NUCLEAR_STRIKE_TIMELINE_ORDER[NUCLEAR_STRIKE_TIMELINE_ORDER.length - 1] ?? null;
  const fallbackDuration = lastPhase ? getNukePhaseDurationMs(lastPhase) : 0;
  return {
    phaseName: lastPhase,
    phaseStartOffsetMs: Math.max(0, cursor - fallbackDuration),
    phaseElapsedMs: fallbackDuration,
    phaseDurationMs: fallbackDuration,
  };
}

function resetNukeTimelineState(){
  nuclearStrikeTimelineState.isActive = false;
  nuclearStrikeTimelineState.currentPhase = null;
  nuclearStrikeTimelineState.phaseStartAt = 0;
  nuclearStrikeTimelineState.scenarioStartAt = 0;
  nuclearStrikeTimelineState.totalDurationMs = 0;
  nuclearStrikeTimelineState.totalElapsedMs = 0;
  nuclearStrikeTimelineState.phaseElapsedMs = 0;
  nuclearStrikeTimelineState.scoreDeltas.blue = 0;
  nuclearStrikeTimelineState.scoreDeltas.green = 0;
  nuclearStrikeTimelineState.awardedScore.blue = 0;
  nuclearStrikeTimelineState.awardedScore.green = 0;
  nuclearStrikeTimelineState.scoreQueueResolved = false;
  nuclearStrikeTimelineState.startNewRoundQueued = false;
}

function enterNukeTimelinePhase(phaseName, now){
  nuclearStrikeTimelineState.currentPhase = phaseName;
  nuclearStrikeTimelineState.phaseStartAt = now;
  nuclearStrikeTimelineState.phaseElapsedMs = 0;
  if(phaseName === NUCLEAR_STRIKE_TIMELINE_PHASES.SCORE_COUNTUP && !nuclearStrikeTimelineState.scoreQueueResolved){
    const deltas = resolveNuclearStrikePlaneQueue();
    nuclearStrikeTimelineState.scoreDeltas.blue = deltas?.blue ?? 0;
    nuclearStrikeTimelineState.scoreDeltas.green = deltas?.green ?? 0;
    nuclearStrikeTimelineState.awardedScore.blue = 0;
    nuclearStrikeTimelineState.awardedScore.green = 0;
    nuclearStrikeTimelineState.scoreQueueResolved = true;
  }
  if(phaseName === NUCLEAR_STRIKE_TIMELINE_PHASES.SHOW_NO_SURVIVORS){
    clearNuclearStrikeCinematicLayer();
    applyNuclearStrikePostResolution();
  }
}

function startNukeTimeline(now = performance.now()){
  resetNukeTimelineState();
  nuclearStrikeTimelineState.isActive = true;
  nuclearStrikeTimelineState.scenarioStartAt = now;
  nuclearStrikeTimelineState.totalDurationMs = getNukeTimelineTotalDurationMs();
  enterNukeTimelinePhase(NUCLEAR_STRIKE_TIMELINE_PHASES.GIF_PLAY, now);
}

function applyNukeScoreCountup(now){
  const phaseStart = nuclearStrikeTimelineState.phaseStartAt;
  const duration = getNukePhaseDurationMs(NUCLEAR_STRIKE_TIMELINE_PHASES.SCORE_COUNTUP);
  const progress = duration > 0
    ? Math.max(0, Math.min(1, (now - phaseStart) / duration))
    : 1;

  for(const color of ["blue", "green"]){
    const target = nuclearStrikeTimelineState.scoreDeltas[color] ?? 0;
    const nextAwarded = Math.floor(target * progress);
    const alreadyAwarded = nuclearStrikeTimelineState.awardedScore[color] ?? 0;
    const delta = nextAwarded - alreadyAwarded;
    if(delta > 0){
      addScore(color, delta, { deferVictoryCheck: true });
      nuclearStrikeTimelineState.awardedScore[color] = nextAwarded;
    }
  }
}

function updateNukeTimeline(now = performance.now()){
  if(!nuclearStrikeTimelineState.isActive || nuclearStrikeStage !== NUCLEAR_STRIKE_STAGES.CINEMATIC){
    return;
  }

  const elapsed = Math.max(0, now - nuclearStrikeTimelineState.scenarioStartAt);
  const phaseInfo = getNukeTimelinePhaseByElapsed(elapsed);
  nuclearStrikeTimelineState.totalDurationMs = getNukeTimelineTotalDurationMs();
  nuclearStrikeTimelineState.totalElapsedMs = elapsed;

  if(phaseInfo.phaseName && phaseInfo.phaseName !== nuclearStrikeTimelineState.currentPhase){
    enterNukeTimelinePhase(phaseInfo.phaseName, now);
  }

  nuclearStrikeTimelineState.phaseElapsedMs = phaseInfo.phaseElapsedMs;

  if(phaseInfo.phaseName === NUCLEAR_STRIKE_TIMELINE_PHASES.SCORE_COUNTUP){
    applyNukeScoreCountup(now);
  }

  const totalDuration = nuclearStrikeTimelineState.totalDurationMs;
  if(elapsed >= totalDuration && !nuclearStrikeTimelineState.startNewRoundQueued){
    nuclearStrikeTimelineState.startNewRoundQueued = true;
    transitionNuclearStrikeStage(NUCLEAR_STRIKE_STAGES.RESOLVED, { reason: "timeline complete" });
    startNewRound();
  }
}

function getNukePlaneFadeFx(now = performance.now()){
  if(!isNukeCinematicActive || nuclearStrikeStage !== NUCLEAR_STRIKE_STAGES.CINEMATIC){
    return { alpha: 1, grayscale: 0, active: false };
  }

  const fadeStart = NUCLEAR_STRIKE_FX.durationMs * 0.5;
  const fadeEnd = getNukeTimelinePhaseStartMs(NUCLEAR_STRIKE_TIMELINE_PHASES.SHOW_NO_SURVIVORS);
  const elapsed = Math.max(0, now - nuclearStrikeTimelineState.scenarioStartAt);
  const fadeDuration = Math.max(1, fadeEnd - fadeStart);
  const progress = Math.max(0, Math.min(1, (elapsed - fadeStart) / fadeDuration));
  const alpha = 1 - 0.9 * progress;
  const grayscale = Math.round(100 * progress);
  return {
    active: progress > 0,
    alpha,
    grayscale,
  };
}

function isNukeEliminatedPlaneRenderable(plane){
  if(!plane?.nukeEliminated) return false;
  if(!nuclearStrikeTimelineState.isActive) return false;
  const hideFromMs = getNukeTimelinePhaseStartMs(NUCLEAR_STRIKE_TIMELINE_PHASES.SHOW_NO_SURVIVORS);
  return nuclearStrikeTimelineState.totalElapsedMs < hideFromMs;
}

function getNukeTimelineDebugSnapshot(){
  return {
    stage: nuclearStrikeStage,
    active: nuclearStrikeTimelineState.isActive,
    currentPhase: nuclearStrikeTimelineState.currentPhase,
    phaseStartAt: nuclearStrikeTimelineState.phaseStartAt,
    scenarioStartAt: nuclearStrikeTimelineState.scenarioStartAt,
    totalElapsedMs: nuclearStrikeTimelineState.totalElapsedMs,
    phaseElapsedMs: nuclearStrikeTimelineState.phaseElapsedMs,
    totalDurationMs: nuclearStrikeTimelineState.totalDurationMs,
    durations: { ...NUKE_TIMELINE },
    scoreDeltas: { ...nuclearStrikeTimelineState.scoreDeltas },
    awardedScore: { ...nuclearStrikeTimelineState.awardedScore },
  };
}

function ensureNukeDebugApi(){
  if(typeof window === "undefined") return;
  window.NUKE_DEBUG = {
    getTimeline(){
      return getNukeTimelineDebugSnapshot();
    },
    setDuration(phaseName, ms){
      if(!Object.prototype.hasOwnProperty.call(NUKE_TIMELINE, phaseName)) return false;
      const safeMs = Number.isFinite(ms) ? Math.max(0, Math.round(ms)) : null;
      if(safeMs === null) return false;
      NUKE_TIMELINE[phaseName] = safeMs;
      return true;
    },
    skipTo(phaseName){
      if(!NUCLEAR_STRIKE_TIMELINE_ORDER.includes(phaseName)) return false;
      if(nuclearStrikeStage !== NUCLEAR_STRIKE_STAGES.CINEMATIC || !nuclearStrikeTimelineState.isActive){
        return false;
      }
      const phaseOffset = getNukeTimelinePhaseStartMs(phaseName);
      const now = performance.now();
      nuclearStrikeTimelineState.scenarioStartAt = now - phaseOffset;
      updateNukeTimeline(now);
      return true;
    },
    restart(){
      if(nuclearStrikeStage !== NUCLEAR_STRIKE_STAGES.CINEMATIC){
        return false;
      }
      startNukeTimeline(performance.now());
      return true;
    }
  };
}

ensureNukeDebugApi();

function applyNuclearStrikePostResolution(){
  const matchEnded = maybeLockInMatchOutcome({ showEndScreen: true });
  if(!matchEnded){
    lockInNoSurvivors();
  }
}

function resolveNuclearStrikePlaneQueue(){
  isNuclearStrikeResolutionActive = true;
  try {
    return destroyAllPlanesWithNukeScoring();
  } finally {
    isNuclearStrikeResolutionActive = false;
  }
}

function transitionNuclearStrikeStage(nextStage, context = {}){
  const currentStage = nuclearStrikeStage;
  if(currentStage === nextStage) return true;
  const allowedNextStages = NUCLEAR_STRIKE_STAGE_TRANSITIONS[currentStage] || [];
  if(!allowedNextStages.includes(nextStage)){
    if(DEBUG_NUKE){
      console.warn(`[NUKE] invalid transition ${currentStage} -> ${nextStage}`);
    }
    return false;
  }

  nuclearStrikeStage = nextStage;

  switch(nextStage){
    case NUCLEAR_STRIKE_STAGES.DRAGGING: {
      updateBoardDimmerMask();
      setBoardDimmerActive(true);
      isNukeCinematicActive = false;
      applyNuclearStrikeInputLockUi(false);
      break;
    }
    case NUCLEAR_STRIKE_STAGES.ARMED: {
      setBoardDimmerActive(false);
      isNukeCinematicActive = true;
      applyNuclearStrikeInputLockUi(true);
      break;
    }
    case NUCLEAR_STRIKE_STAGES.CINEMATIC: {
      isNukeCinematicActive = true;
      applyNuclearStrikeInputLockUi(true);
      playNuclearStrikeFx();
      startNukeTimeline(performance.now());
      break;
    }
    case NUCLEAR_STRIKE_STAGES.RESOLVED: {
      clearNuclearStrikeCinematicLayer();
      resetNukeTimelineState();
      isNukeCinematicActive = false;
      applyNuclearStrikeInputLockUi(false);
      transitionNuclearStrikeStage(NUCLEAR_STRIKE_STAGES.IDLE, { reason: "resolved" });
      break;
    }
    case NUCLEAR_STRIKE_STAGES.IDLE:
    default: {
      setBoardDimmerActive(false);
      isNukeCinematicActive = false;
      applyNuclearStrikeInputLockUi(false);
      break;
    }
  }

  if(DEBUG_NUKE){
    const reasonLabel = context?.reason ? ` (${context.reason})` : "";
    console.log(`[NUKE] stage ${currentStage} -> ${nextStage}${reasonLabel}`);
  }

  return true;
}

function cancelActiveNuclearDrag(reason = "cancel"){
  if (!activeNuclearDrag) return;
  if (!activeNuclearDrag.consumed && DEBUG_NUKE) {
    console.log(`[NUKE] drag ${reason}`);
  }
  activeNuclearDrag = null;
  if(nuclearStrikeStage === NUCLEAR_STRIKE_STAGES.DRAGGING){
    transitionNuclearStrikeStage(NUCLEAR_STRIKE_STAGES.IDLE, { reason });
  }
}

function resetInventoryInteractionState(){
  activeNuclearDrag = null;
  pendingInventoryUse = null;
  isNuclearStrikeResolutionActive = false;
  isNukeCinematicActive = false;
  resetNukeTimelineState();
  nuclearStrikeStage = NUCLEAR_STRIKE_STAGES.IDLE;
  setBoardDimmerActive(false);
  applyNuclearStrikeInputLockUi(false);
  clearNuclearStrikeCinematicLayer();
}

function showNuclearStrikeCinematicLayer(){
  if(!(nuclearStrikeLayer instanceof HTMLElement) || !(nuclearStrikeGif instanceof HTMLImageElement) || !(nuclearStrikeFlash instanceof HTMLElement)) {
    return;
  }

  nuclearStrikeLayer.hidden = false;

  nuclearStrikeFlash.classList.remove("is-on");
  void nuclearStrikeFlash.offsetWidth;
  nuclearStrikeFlash.classList.add("is-on");

  if (DEBUG_NUKE) {
    console.log("[NUKE] fx started");
  }
}

function getRandomInventoryItem(){
  if(INVENTORY_ITEMS.length === 0) return null;
  const index = Math.floor(Math.random() * INVENTORY_ITEMS.length);
  return INVENTORY_ITEMS[index] ?? null;
}

function playNuclearStrikeFx(){
  if(!(nuclearStrikeLayer instanceof HTMLElement) || !(nuclearStrikeGif instanceof HTMLImageElement) || !(nuclearStrikeFlash instanceof HTMLElement)) {
    return;
  }

  nuclearStrikeGif.removeAttribute("src");
  void nuclearStrikeGif.offsetHeight;
  nuclearStrikeGif.src = `${NUCLEAR_STRIKE_FX.path}?t=${Date.now()}`;
  showNuclearStrikeCinematicLayer();
}

function removeItemFromInventory(color, type){
  if(!color || !type) return;
  const items = inventoryState[color];
  if(!Array.isArray(items) || items.length === 0) return;
  const index = items.findIndex((item) => item?.type === type);
  if(index < 0) return;
  items.splice(index, 1);
  syncInventoryUI(color);
}

function getItemUsageConfig(type){
  if(!type) return null;
  return itemUsageConfig[type] ?? null;
}

function getPlaneAtBoardPoint(color, x, y){
  if(!color || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return points.find((plane) =>
    plane?.color === color
    && plane.isAlive
    && !plane.burning
    && Math.hypot(plane.x - x, plane.y - y) <= PLANE_TOUCH_RADIUS
  ) ?? null;
}

function applyItemToOwnPlane(type, color, plane){
  if(!plane) return false;
  if(type === INVENTORY_ITEM_TYPES.CROSSHAIR || type === INVENTORY_ITEM_TYPES.FUEL){
    plane.activeTurnBuff = type;
    return true;
  }

  return false;
}

function getPlaneActiveTurnBuff(plane){
  if(!plane) return null;
  return plane.activeTurnBuff === INVENTORY_ITEM_TYPES.CROSSHAIR || plane.activeTurnBuff === INVENTORY_ITEM_TYPES.FUEL
    ? plane.activeTurnBuff
    : null;
}

function getEffectiveFlightRangeCells(plane){
  const baseRange = settings.flightRangeCells;
  const activeTurnBuff = getPlaneActiveTurnBuff(plane);
  if(activeTurnBuff === INVENTORY_ITEM_TYPES.FUEL){
    return baseRange * 2;
  }
  return baseRange;
}

function getPendingInventoryTargetPlaneAt(x, y){
  if(!pendingInventoryUse) return null;
  const currentColor = turnColors[turnIndex];
  if(pendingInventoryUse.color !== currentColor) return null;
  return getPlaneAtBoardPoint(currentColor, x, y);
}

function tryApplyPendingInventoryUseAt(x, y){
  if(!pendingInventoryUse) return false;
  const targetPlane = getPendingInventoryTargetPlaneAt(x, y);
  if(!targetPlane) return false;

  const applied = applyItemToOwnPlane(pendingInventoryUse.type, pendingInventoryUse.color, targetPlane);
  if(applied){
    removeItemFromInventory(pendingInventoryUse.color, pendingInventoryUse.type);
    cancelPendingInventoryUse();
  }
  return true;
}

function onInventoryItemDragStart(event){
  if(isNuclearStrikeActionLocked()){
    event.preventDefault();
    return;
  }
  const target = event.currentTarget;
  if(!(target instanceof HTMLElement)) return;
  const type = target.dataset.itemType;
  const color = target.dataset.itemColor;
  const usageConfig = getItemUsageConfig(type);
  if (!usageConfig?.requiresDragAndDrop) {
    event.preventDefault();
    return;
  }
  const activeColor = turnColors[turnIndex];
  if (color !== activeColor) {
    event.preventDefault();
    return;
  }
  activeNuclearDrag = {
    color,
    type,
    usageTarget: usageConfig.target,
    consumed: false,
  };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", type);
    if (target instanceof HTMLImageElement) {
      if(type === INVENTORY_ITEM_TYPES.MINE){
        target.width = MINE_ICON_WIDTH;
        target.height = MINE_ICON_HEIGHT;
        event.dataTransfer.setDragImage(target, Math.round(MINE_ICON_WIDTH / 2), Math.round(MINE_ICON_HEIGHT / 2));
      } else {
        event.dataTransfer.setDragImage(target, target.width / 2, target.height / 2);
      }
    }
  }
  if(type === INVENTORY_ITEM_TYPES.NUCLEAR_STRIKE){
    updateBoardDimmerMask();
    transitionNuclearStrikeStage(NUCLEAR_STRIKE_STAGES.DRAGGING, { reason: "drag start" });
  }
  if (DEBUG_NUKE && type === INVENTORY_ITEM_TYPES.NUCLEAR_STRIKE) {
    console.log("[NUKE] drag start");
  }
}

function onInventoryItemDragEnd(){
  cancelActiveNuclearDrag("ended");
}

function isClientPointOverBoard(clientX, clientY){
  if (!gsBoardCanvas) return false;
  const rect = gsBoardCanvas.getBoundingClientRect();
  return clientX >= rect.left
    && clientX <= rect.left + rect.width
    && clientY >= rect.top
    && clientY <= rect.top + rect.height;
}

function onBoardDragOver(event){
  if(isNuclearStrikeActionLocked()){
    event.preventDefault();
    return;
  }
  if (!activeNuclearDrag) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function onBoardDrop(event){
  if(isNuclearStrikeActionLocked()){
    event.preventDefault();
    return;
  }
  if (!activeNuclearDrag) return;
  event.preventDefault();
  const { clientX, clientY } = event;
  if (!isClientPointOverBoard(clientX, clientY)) {
    if (DEBUG_NUKE) {
      console.log("[NUKE] drop rejected");
    }
    return;
  }
  const usageConfig = getItemUsageConfig(activeNuclearDrag.type);
  if(!usageConfig){
    cancelActiveNuclearDrag("drop without config");
    return;
  }

  if(usageConfig.target !== ITEM_USAGE_TARGETS.BOARD){
    return;
  }

  if(usageConfig.target === ITEM_USAGE_TARGETS.BOARD){
    if(activeNuclearDrag.type === INVENTORY_ITEM_TYPES.MINE){
      const minePlacement = getMinePlacementFromDropPoint(clientX, clientY);
      const isPlacementValid = isMinePlacementValid(minePlacement);
      if(isPlacementValid){
        placeMine({
          owner: activeNuclearDrag.color,
          x: minePlacement.x,
          y: minePlacement.y,
          cellX: minePlacement.cellX,
          cellY: minePlacement.cellY,
        });
        removeItemFromInventory(activeNuclearDrag.color, activeNuclearDrag.type);
        activeNuclearDrag.consumed = true;
      }
      cancelActiveNuclearDrag(isPlacementValid ? "mine dropped" : "mine drop rejected");
      return;
    }

    removeItemFromInventory(activeNuclearDrag.color, activeNuclearDrag.type);
    activeNuclearDrag.consumed = true;
    if(activeNuclearDrag.type === INVENTORY_ITEM_TYPES.NUCLEAR_STRIKE){
      transitionNuclearStrikeStage(NUCLEAR_STRIKE_STAGES.ARMED, { reason: "drop accepted" });
      if (DEBUG_NUKE) {
        console.log(`[NUKE] drop ok at client(${Math.round(clientX)}, ${Math.round(clientY)})`);
      }
      transitionNuclearStrikeStage(NUCLEAR_STRIKE_STAGES.CINEMATIC, { reason: "drop accepted" });
    }
    cancelActiveNuclearDrag("dropped");
    return;
  }

  cancelActiveNuclearDrag("dropped");
}

function onSelfPlaneItemDrop(event){
  if(isNuclearStrikeActionLocked()){
    event.preventDefault();
    return;
  }
  if(!activeNuclearDrag) return;
  const usageConfig = getItemUsageConfig(activeNuclearDrag.type);
  if(usageConfig?.target !== ITEM_USAGE_TARGETS.SELF_PLANE) return;

  event.preventDefault();
  const { clientX, clientY } = event;
  if(!isClientPointOverBoard(clientX, clientY)){
    cancelActiveNuclearDrag("self target outside board");
    return;
  }

  const { x: designX, y: designY } = toDesignCoords(clientX, clientY);
  const { x: boardX, y: boardY } = designToBoardCoords(designX, designY);
  const ownPlane = getPlaneAtBoardPoint(activeNuclearDrag.color, boardX, boardY);
  if(!ownPlane){
    cancelActiveNuclearDrag("self target missed");
    return;
  }

  const applied = applyItemToOwnPlane(activeNuclearDrag.type, activeNuclearDrag.color, ownPlane);
  if(applied){
    removeItemFromInventory(activeNuclearDrag.color, activeNuclearDrag.type);
    activeNuclearDrag.consumed = true;
  }
  cancelActiveNuclearDrag("self target drop");
}

function onInventoryDrop(event){
  if(!activeNuclearDrag) return;
  const usageConfig = getItemUsageConfig(activeNuclearDrag.type);
  if(!usageConfig){
    event.preventDefault();
    cancelActiveNuclearDrag("drop without config");
    return;
  }

  if(usageConfig.target === ITEM_USAGE_TARGETS.SELF_PLANE){
    onSelfPlaneItemDrop(event);
    return;
  }

  onBoardDrop(event);
}

function getMinePlacementFromDropPoint(clientX, clientY){
  const { x: designX, y: designY } = toDesignCoords(clientX, clientY);
  const { x: boardX, y: boardY } = designToBoardCoords(designX, designY);
  const cellX = Math.floor((boardX - FIELD_LEFT) / CELL_SIZE);
  const cellY = Math.floor((boardY - FIELD_TOP) / CELL_SIZE);
  return {
    boardX,
    boardY,
    cellX,
    cellY,
    x: FIELD_LEFT + cellX * CELL_SIZE + CELL_SIZE / 2,
    y: FIELD_TOP + cellY * CELL_SIZE + CELL_SIZE / 2,
  };
}

function isPointInAxisAlignedRect(x, y, rect){
  if(!rect) return false;
  return x >= rect.x
    && x <= rect.x + rect.width
    && y >= rect.y
    && y <= rect.y + rect.height;
}

function rotatePointToColliderLocal(pointX, pointY, collider){
  const dx = pointX - collider.cx;
  const dy = pointY - collider.cy;
  const cos = Math.cos(collider.rotation);
  const sin = Math.sin(collider.rotation);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

function isPointInPolygon(point, polygon){
  if(!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for(let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1){
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if(intersects){
      inside = !inside;
    }
  }
  return inside;
}

function isPointInsideCollider(pointX, pointY, collider){
  if(!collider) return false;
  const local = rotatePointToColliderLocal(pointX, pointY, collider);
  if(collider.type === "diag"){
    const polygon = getDiagonalColliderLocalPolygon(collider, 0);
    const localPolygon = polygon.map(pt => ({
      x: pt.x - collider.halfWidth,
      y: pt.y - collider.halfHeight,
    }));
    return isPointInPolygon(local, localPolygon);
  }
  return Math.abs(local.x) <= collider.halfWidth && Math.abs(local.y) <= collider.halfHeight;
}

function getFlagPlacementRects(){
  return flags
    .filter(flag => flag?.state === FLAG_STATES.ACTIVE)
    .map(flag => getFlagSpriteLayoutForPlacement(flag, getFlagAnchor(flag)))
    .filter(Boolean);
}

function getBasePlacementRects(){
  return ["blue", "green"]
    .map((color) => getBaseLayout(color))
    .filter(Boolean);
}

function isMinePlacementValid(placement){
  if(!placement) return false;
  if(!Number.isFinite(placement.x) || !Number.isFinite(placement.y)) return false;
  if(!isPointInsideFieldBounds(placement.x, placement.y)) return false;

  if(isBrickPixel(placement.x, placement.y)) return false;

  const intersectsCollider = colliders.some(collider =>
    isPointInsideCollider(placement.x, placement.y, collider)
  );
  if(intersectsCollider) return false;

  const intersectsBase = getBasePlacementRects().some(rect =>
    isPointInAxisAlignedRect(placement.x, placement.y, rect)
  );
  if(intersectsBase) return false;

  const intersectsFlag = getFlagPlacementRects().some(rect =>
    isPointInAxisAlignedRect(placement.x, placement.y, rect)
  );
  if(intersectsFlag) return false;

  const tooCloseToPlane = points.some(plane => {
    if(!plane?.isAlive || plane?.burning) return false;
    return Math.hypot(plane.x - placement.x, plane.y - placement.y) < POINT_RADIUS;
  });
  if(tooCloseToPlane) return false;

  const mineInSameCell = mines.some(mine => mine.cellX === placement.cellX && mine.cellY === placement.cellY);
  if(mineInSameCell) return false;

  return true;
}

function placeMine({ owner, x, y, cellX, cellY }){
  mines.push({
    id: `mine-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    owner,
    x,
    y,
    cellX,
    cellY,
  });
}

function syncInventoryUI(color){
  const host = inventoryHosts[color];
  if(!(host instanceof HTMLElement)) return;
  host.innerHTML = "";
  const items = inventoryState[color] ?? [];
  const countsByType = items.reduce((counts, item) => {
    if (!item?.type) return counts;
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, {});
  const slotData = INVENTORY_SLOT_ORDER.map((type) => {
    const itemDef = INVENTORY_ITEMS.find((item) => item.type === type) ?? null;
    const count = countsByType[type] ?? 0;
    return {
      type,
      count,
      iconPath: itemDef?.iconPath ?? "",
    };
  });
  for(const slot of slotData){
    const hasItem = slot.count > 0;
    const slotContainer = document.createElement("div");
    const img = document.createElement("img");
    const usageConfig = getItemUsageConfig(slot.type);
    const hintText = usageConfig?.hintText ?? "";
    const isInteractiveItem = hasItem && Boolean(usageConfig?.requiresDragAndDrop);

    slotContainer.className = "inventory-slot";
    img.src = slot.iconPath || INVENTORY_EMPTY_ICON;
    img.alt = "";
    img.draggable = false;
    img.className = "inventory-item";
    if (slot.type === INVENTORY_ITEM_TYPES.MINE) {
      img.classList.add("inventory-item--mine");
    }
    if (!hasItem) {
      img.classList.add("inventory-item--ghost");
    }

    if (isInteractiveItem) {
      img.dataset.itemType = slot.type;
      img.dataset.itemColor = color;
      img.draggable = true;
      img.classList.add("inventory-item--draggable");
      img.addEventListener("dragstart", onInventoryItemDragStart);
      img.addEventListener("dragend", onInventoryItemDragEnd);

      if (hintText) {
        const hintEl = document.createElement("span");
        hintEl.className = "inventory-item-hint";
        hintEl.textContent = hintText;
        slotContainer.appendChild(hintEl);

        img.addEventListener("mouseenter", () => {
          hintEl.classList.add("is-visible");
        });
        img.addEventListener("mouseleave", () => {
          hintEl.classList.remove("is-visible");
        });
      }
    }
    if(
      hasItem
      && pendingInventoryUse
      && pendingInventoryUse.color === color
      && pendingInventoryUse.type === slot.type
    ){
      img.classList.add("inventory-item--draggable");
    }
    slotContainer.appendChild(img);
    if (hasItem) {
      const countBadge = document.createElement("span");
      countBadge.className = "inventory-item-count";
      countBadge.textContent = slot.count;
      slotContainer.appendChild(countBadge);
    }
    host.appendChild(slotContainer);

    const state = inventoryHintState[color];
    if (state) {
      state.visible = false;
      state.text = "";
    }
  }
}

function drawInventoryHintOnHud(ctx) {
  if (!(ctx instanceof CanvasRenderingContext2D)) return;
  if (!(hudCanvas instanceof HTMLCanvasElement)) return;

  const scaleX = FRAME_BASE_WIDTH !== 0 ? hudCanvas.width / FRAME_BASE_WIDTH : 1;
  const scaleY = FRAME_BASE_HEIGHT !== 0 ? hudCanvas.height / FRAME_BASE_HEIGHT : 1;

  const colorStyles = {
    blue: {
      fill: "rgba(255, 255, 255, 0.96)",
      stroke: "rgba(1, 60, 131, 0.95)",
      yShift: 30,
    },
    green: {
      fill: "rgba(255, 255, 255, 0.96)",
      stroke: "rgba(95, 130, 55, 0.95)",
      yShift: -30,
    },
  };

  for (const playerColor of ["blue", "green"]) {
    const state = inventoryHintState[playerColor];
    if (!state?.visible || !state.text) continue;
    if (!Number.isFinite(state.anchorX) || !Number.isFinite(state.anchorY)) continue;

    const style = colorStyles[state.color] ?? colorStyles.blue;
    const canvasX = state.anchorX * scaleX;
    const canvasY = (state.anchorY + style.yShift) * scaleY;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = "700 12px 'Patrick Hand', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = style.stroke;
    ctx.fillStyle = style.fill;
    ctx.strokeText(state.text, canvasX, canvasY);
    ctx.fillText(state.text, canvasX, canvasY);
    ctx.restore();
  }
}

function addItemToInventory(color, item){
  if(!color || !item) return;
  if(!inventoryState[color]){
    inventoryState[color] = [];
  }
  inventoryState[color].push(item);
  syncInventoryUI(color);
}

function giveItem(itemId, qty = 1, opts = { silent: false }){
  if(!itemId) return;
  const itemDef = INVENTORY_ITEMS.find((item) => item?.type === itemId) ?? null;
  if(!itemDef) return;
  const safeQty = Number.isFinite(qty) ? Math.max(0, Math.floor(qty)) : 0;
  if(safeQty === 0) return;
  const color = turnColors?.[turnIndex] ?? "blue";
  if(!inventoryState[color]){
    inventoryState[color] = [];
  }
  for(let i = 0; i < safeQty; i += 1){
    inventoryState[color].push(itemDef);
  }
  if(!opts?.silent){
    syncInventoryUI(color);
  }
}

function resetInventoryState(){
  inventoryState.blue.length = 0;
  inventoryState.green.length = 0;
  pendingInventoryUse = null;
  syncInventoryUI("blue");
  syncInventoryUI("green");
}

if (DEBUG_CHEATS && typeof window !== "undefined") {
  window.DEBUG_GIVE_ITEM = (itemId, qty = 1) => giveItem(itemId, qty);
  window.DEBUG_CLEAR_INVENTORY = () => resetInventoryState();
}

const MAIN_MENU_ASSETS = [
  "ui_mainmenu/mm_hotseat.png",
  "ui_mainmenu/mm_computer.png",
  "ui_mainmenu/mm_online.png",
  "ui_mainmenu/mm_playbutton.png",
  "ui_mainmenu/mm_classicrules.png",
  "ui_mainmenu/mm_advancedsettings.png",
  "ui_mainmenu/mm_frame.png",
  "ui_gamescreen/PLANES/gs_plane_green.png",
  "ui_gamescreen/PLANES/gs_plane_blue.png",
  "preload_animation.gif",
  "letterbox2.png"
];

const GAME_SCREEN_ASSETS = [
  // Plane counters
  "ui_gamescreen/gamescreen_outside/planecounter_blue.png",
  "ui_gamescreen/gamescreen_outside/planecounter_ green.png",

  // UI extras
  "sprite_ copy.png",

  // Game field background
  "background paper 1.png",
  "ui_gamescreen/gamescreen_outside/gs_background.png",
  "ui_gamescreen/gamescreen_outside/goat and sparrow.png",

  // Game maps
  "ui_gamescreen/bricks/brick_1_default.png",
  "ui_gamescreen/bricks/brick4_diagonal copy.png",
  "ui_controlpanel/cp_adds/cp_cargo_on.png",

  // Inventory icons
  ...INVENTORY_ITEMS.map(item => item.iconPath),
  NUCLEAR_STRIKE_FX.path,

  // Match score
  "ui_gamescreen/gamescreen_outside/matchscore_blue_corn.png",
  "ui_gamescreen/gamescreen_outside/matchscore_green_egg2.png",
  "ui_gamescreen/gamescreen_outside/matchscore_blue_corn_ghost.png",
  "ui_gamescreen/gamescreen_outside/matchscore_green_egg_ghost.png",

  // End game screen
  "ui_gamescreen/playagain/playagain_container.png",
  "ui_gamescreen/playagain/yes.png",
  "ui_gamescreen/playagain/no.png",

  // Flags & bases
  BASE_SPRITE_PATHS.blue,
  BASE_SPRITE_PATHS.green,
  FLAG_SPRITE_PATHS.blue,
  FLAG_SPRITE_PATHS.green,

  // Flame sprites
  "ui_gamescreen/flames green/flame_green_1.gif",
  "ui_gamescreen/flames green/flame_green_2.gif",
  "ui_gamescreen/flames green/flame_green_3.gif",
  "ui_gamescreen/flames green/flame_green_4.gif",
  "ui_gamescreen/flames green/flame_green_5.gif",
  "ui_gamescreen/flames green/flame_green_6.gif",
  "ui_gamescreen/flames green/flame_green_7.gif",
  "ui_gamescreen/flames green/flame_green_8.gif",
  "ui_gamescreen/flames green/flame_green_9.gif",
  "ui_gamescreen/flames green/flame_green_10.gif",
  "ui_gamescreen/flames blue/flame_blue_1.gif",
  "ui_gamescreen/flames blue/flame_blue_2.gif",
  "ui_gamescreen/flames blue/flame_blue_3.gif",
  "ui_gamescreen/flames blue/flame_blue_4.gif",
  "ui_gamescreen/flames blue/flame_blue_5.gif",
  "ui_gamescreen/flames blue/flame_blue_6.gif",

  // Explosion sprites
  ...ALL_EXPLOSION_SPRITES
];

const SETTINGS_ASSETS = [
  // Control panel
  "ui_controlpanel/cp_background.png",
  "ui_controlpanel/cp_frame_add3.png",
  "ui_controlpanel/cp_button_off.png",
  "ui_controlpanel/cp_button_on.png",
  "ui_controlpanel/cp_frame_accuracy.png",
  "ui_controlpanel/cp_frame_accuracy2.png",
  "ui_controlpanel/cp_button_left.png",
  "ui_controlpanel/cp_button_right.png",
  "ui_controlpanel/cp_frame_range.png",
  "ui_controlpanel/cp_frame_range2.png",
  "ui_controlpanel/cp_frame_field.png",
  "ui_controlpanel/cp_frame_field2.png",
  "ui_controlpanel/cp_frame_resetand exit.png",
  "ui_controlpanel/cp_button_reset.png",
  "ui_controlpanel/cp_button_exit.png",
  "ui_controlpanel/cp_acuracy_tape2.png",
  "ui_controlpanel/cp_tape_range.png",
  "ui_controlpanel/cp_tape_field_easy2.png",
  "ui_controlpanel/field_planes/green_plane_mini.png",
  "ui_controlpanel/field_planes/green_flag_mini.png",
  "ui_controlpanel/field_planes/blue_plane_mini.png",
  "ui_controlpanel/field_planes/blue_flag_mini.png",
  "ui_controlpanel/hook.png",
  "ui_controlpanel/rope_pendulum.png",
  "ui_controlpanel/pendulum.png",
  "ui_controlpanel/cp_range_contrail1.gif",
  "ui_controlpanel/cp_range_contrail2.gif",
  "ui_controlpanel/cp_range_flame_trail4.gif",
  "ui_controlpanel/cp_range_plane 2.png",
  "ui_controlpanel/steps/left_step 1.png",
  "ui_controlpanel/steps/left_step 4.png",
  "ui_controlpanel/steps/left_step 5.png",
  "ui_controlpanel/steps/left_step 6.png",
  "ui_controlpanel/steps/left_step 7.png",
  "ui_controlpanel/steps/left_step 8.png",
  "ui_controlpanel/steps/left_step 9.png",
  "ui_controlpanel/steps/left_step 10.png",
  "ui_controlpanel/steps/right_step 1.png",
  "ui_controlpanel/steps/right_step 4.png",
  "ui_controlpanel/steps/right_step 5.png",
  "ui_controlpanel/steps/right_step 6.png",
  "ui_controlpanel/steps/right_step 7.png",
  "ui_controlpanel/steps/right_step 8.png",
  "ui_controlpanel/steps/right_step 9.png",
  "ui_controlpanel/steps/right_step 10.png"
];

const MENU_PRELOAD_LABEL = "menuPreload";
const GAME_PRELOAD_LABEL = "gamePreload";
const SETTINGS_PRELOAD_LABEL = "settingsPreload";

const MENU_CRITICAL = MAIN_MENU_ASSETS;
let menuAssetsReady = false;
let gameAssetsReady = false;
let isPreloadVisible = false;
let gameAssetsPromise = null;
let gameAssetsResults = [];

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function installImageWatch(img, url, label) {
  if (!img) return;
  setTimeout(() => {
    if (!img.complete || !img.naturalWidth) {
      console.warn("[asset][stuck]", { label, url });
    }
  }, 10000);

  const existingOnError = img.onerror;
  img.onerror = (e) => {
    console.warn("[asset][error]", { label, url, e });
    if (typeof existingOnError === "function") {
      existingOnError.call(img, e);
    }
  };
}

function showLoadingOverlay() {
  if (loadingOverlay) {
    loadingOverlay.classList.remove("loading-overlay--hidden");
    isPreloadVisible = true;
  }
}

function hideLoadingOverlay() {
  if (bootTrace.startTs !== null) {
    logBootStep("hideLoadingOverlay");
  }
  if (loadingOverlay) {
    loadingOverlay.classList.add("loading-overlay--hidden");
  }
  isPreloadVisible = false;
}

const IMAGE_LOAD_TIMEOUT_MS = 8000;
const pendingImageLoads = new Set();

const DEBUG_ASSETS = true;
const imageCache = new Map();
const imageCreationStacks = new Map();
const startedImageLoads = new Set();
let createdImagesCount = 0;
let duplicateAttemptsCount = 0;

function normalizeAssetUrl(url) {
  if (typeof url !== "string") return "";
  return url.trim();
}

function applyImageOptions(img, options = {}) {
  if (!img || typeof options !== "object") return;
  if (options.decoding && !img.decoding) {
    img.decoding = options.decoding;
  }
}

function logImageCreation(label, url, stack) {
  if (!DEBUG_ASSETS) return;
  console.log("[asset][create]", { label, url, stack });
}

function logDuplicateRequest(label, url, stack) {
  if (!DEBUG_ASSETS) return;
  const first = imageCreationStacks.get(url) || null;
  const isSameLabel = first?.label === label;
  if (isSameLabel) {
    return;
  }
  duplicateAttemptsCount += 1;
  console.warn("[asset][duplicate]", { label, url, first, stack });
}

function getImage(url, label = "", options = {}) {
  const normalizedUrl = normalizeAssetUrl(url);
  if (!normalizedUrl) {
    return { img: null, isNew: false, url: normalizedUrl };
  }

  const existing = imageCache.get(normalizedUrl);
  const stack = new Error().stack;
  const suppressDuplicateWarning = !!options?.suppressDuplicateWarning;

  if (existing) {
    if (!suppressDuplicateWarning) {
      logDuplicateRequest(label, normalizedUrl, stack);
    }
    applyImageOptions(existing, options);
    return { img: existing, isNew: false, url: normalizedUrl };
  }

  const img = new Image();
  createdImagesCount += 1;
  applyImageOptions(img, options);
  imageCache.set(normalizedUrl, img);
  imageCreationStacks.set(normalizedUrl, { label, stack });
  logImageCreation(label, normalizedUrl, stack);
  return { img, isNew: true, url: normalizedUrl };
}

function primeImageLoad(img, url, label = "", options = {}) {
  const normalizedUrl = normalizeAssetUrl(url);
  if (!img || !normalizedUrl || startedImageLoads.has(normalizedUrl)) {
    return;
  }

  const { track = true, watch = true, timeoutMs } = options;

  if (track) {
    trackImageLoad(label, normalizedUrl, img, timeoutMs);
  }
  if (watch) {
    installImageWatch(img, normalizedUrl, label);
  }

  startedImageLoads.add(normalizedUrl);
  img.src = normalizedUrl;
}

function loadImageAsset(url, label = "", options = {}) {
  const { img, isNew, url: normalizedUrl } = getImage(url, label, options);
  if (!img || !normalizedUrl) {
    return { img: null, isNew: false };
  }
  primeImageLoad(img, normalizedUrl, label, options);
  return { img, isNew };
}

if (typeof window !== "undefined") {
  window.paperWingsAssets = window.paperWingsAssets || {};
  Object.assign(window.paperWingsAssets, {
    getImage,
    loadImageAsset,
    primeImageLoad,
    imageCache
  });

  window.addEventListener("load", () => {
    console.log("[asset][summary]", {
      cacheSize: imageCache.size,
      createdImagesCount,
      duplicateAttemptsCount
    });
  });
}

function trackImageLoad(label, url, img, timeoutMs = IMAGE_LOAD_TIMEOUT_MS) {
  if (!img) {
    return;
  }
  const normalizedUrl = typeof url === "string" ? url : "";
  const pendingEntry = { label, url: normalizedUrl };
  pendingImageLoads.add(pendingEntry);
  console.log("[IMG] pending", { label, url: normalizedUrl, pending: pendingImageLoads.size });

  let timeoutId = null;
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      if (pendingImageLoads.has(pendingEntry)) {
        console.warn("[IMG] timeout", { label, url: normalizedUrl, pending: pendingImageLoads.size });
      }
    }, timeoutMs);
  }

  const finalize = (status, event) => {
    if (!pendingImageLoads.has(pendingEntry)) {
      return;
    }
    pendingImageLoads.delete(pendingEntry);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (status === "error") {
      console.warn("[IMG] error", { label, url: normalizedUrl, pending: pendingImageLoads.size, event });
      return;
    }
    console.log("[IMG] load", { label, url: normalizedUrl, pending: pendingImageLoads.size });
  };

  img.addEventListener("load", event => finalize("load", event), { once: true });
  img.addEventListener("error", event => finalize("error", event), { once: true });
}

function preloadImages(assetList = [], { timeoutMs = IMAGE_LOAD_TIMEOUT_MS, label = "criticalPreload" } = {}) {
  if (!Array.isArray(assetList) || assetList.length === 0) {
    return Promise.resolve([]);
  }

  const uniqueAssets = [];
  const seenAssets = new Set();

  for (const src of assetList) {
    const normalizedSrc = normalizeAssetUrl(src);
    if (!normalizedSrc || seenAssets.has(normalizedSrc)) {
      continue;
    }
    seenAssets.add(normalizedSrc);
    uniqueAssets.push(normalizedSrc);
  }

  if (uniqueAssets.length === 0) {
    return Promise.resolve([]);
  }

  return Promise.all(uniqueAssets.map(normalizedSrc => new Promise(resolve => {
    if (!normalizedSrc) {
      resolve({ url: normalizedSrc, status: "skipped" });
      return;
    }

    const { img, url } = getImage(normalizedSrc, label);
    if (!img || !url) {
      resolve({ url: normalizedSrc, status: "skipped" });
      return;
    }

    let settled = false;
    const finalize = (status) => {
      if (settled) return;
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({ url, status });
    };

    const timeoutId = Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => finalize("timeout"), timeoutMs)
      : null;

    img.addEventListener("load", () => finalize("fulfilled"), { once: true });
    img.addEventListener("error", () => finalize("rejected"), { once: true });

    if (isSpriteReady(img)) {
      finalize("fulfilled");
      return;
    }

    primeImageLoad(img, url, label);
  })));
}

function preloadGameAssetsInBackground() {
  if (gameAssetsPromise) {
    return gameAssetsPromise;
  }

  const start = performance.now();
  console.log("[BOOT] game preload start", { ms: 0 });

  const gameScreenPromise = preloadImages(GAME_SCREEN_ASSETS, { label: GAME_PRELOAD_LABEL });
  const settingsPromise = preloadImages(SETTINGS_ASSETS, { label: SETTINGS_PRELOAD_LABEL });

  gameAssetsPromise = Promise.all([gameScreenPromise, settingsPromise])
    .then((results) => {
      gameAssetsReady = true;
      gameAssetsResults = results.flat().filter(Boolean);
      console.log("[BOOT] game preload end", { ms: Math.round(performance.now() - start) });
      return results;
    })
    .catch((err) => {
      console.warn("[BOOT] game preload error", err);
      gameAssetsReady = true;
      gameAssetsResults = [];
      console.log("[BOOT] game preload end", { ms: Math.round(performance.now() - start) });
      return [];
    });

  return gameAssetsPromise;
}

function startMenuPreload() {
  const MAX_OVERLAY_TIME_MS = 5000;
  const MIN_OVERLAY_TIME_MS = 300;
  const start = performance.now();

  console.log("[BOOT] menu preload start", { ms: 0 });
  if (loadingOverlay) {
    showLoadingOverlay();
  }

  const preloadPromise = preloadImages(MENU_CRITICAL, { label: MENU_PRELOAD_LABEL });

  if (loadingOverlay) {
    Promise.all([
      Promise.race([preloadPromise, wait(MAX_OVERLAY_TIME_MS)]),
      wait(MIN_OVERLAY_TIME_MS)
    ]).finally(() => {
      if (isPreloadVisible) {
        hideLoadingOverlay();
      }
    });
  }

  preloadPromise.then((results) => {
    menuAssetsReady = true;
    console.log("[BOOT] menu preload end", { ms: Math.round(performance.now() - start) });
    preloadGameAssetsInBackground();
    return results;
  }).catch((err) => {
    console.warn("[BOOT] menu preload error", err);
    menuAssetsReady = true;
    console.log("[BOOT] menu preload end", { ms: Math.round(performance.now() - start) });
    preloadGameAssetsInBackground();
  });

  return preloadPromise;
}

startMenuPreload();

const testControlPanel = document.getElementById("testControlPanel");
const testControlsToggle = document.getElementById("testControlsToggle");
const inGameMapSelect = document.getElementById("inGameMapSelect");
const inGameFlameStyleSelect = document.getElementById("inGameFlameStyle");
const testRangeInput = document.getElementById("testRange");
const testAmplitudeInput = document.getElementById("testAmplitude");
const testAddAAToggle = document.getElementById("testAddAAToggle");
const testSharpEdgesToggle = document.getElementById("testSharpEdgesToggle");
const testRandomizeToggle = document.getElementById("testRandomizeToggle");
const testApplyBtn = document.getElementById("testApplyBtn");
const testRestartBtn = document.getElementById("testRestartBtn");

const MENU_BUTTON_SKINS = {
  hotSeat: {
    default: "ui_mainmenu/mm_hotseat.png",
    active: "ui_mainmenu/mm_hotseat.png"
  },
  computer: {
    default: "ui_mainmenu/mm_computer.png",
    active: "ui_mainmenu/mm_computer.png"
  },
  online: {
    default: "ui_mainmenu/mm_online.png",
    active: "ui_mainmenu/mm_online.png"
  },
  play: {
    default: "ui_mainmenu/mm_playbutton.png",
    active: "ui_mainmenu/mm_playbutton.png"
  },
  classicRules: {
    default: "ui_mainmenu/mm_classicrules.png",
    active: "ui_mainmenu/mm_classicrules.png"
  },
  advancedSettings: {
    default: "ui_mainmenu/mm_advancedsettings.png",
    active: "ui_mainmenu/mm_advancedsettings.png"
  }
};

function applyMenuButtonSkin(button, skinKey, isActive){
  if(!(button instanceof HTMLElement)) return;

  const skin = MENU_BUTTON_SKINS[skinKey];
  const target = skin ? (isActive ? skin.active : skin.default) : null;

  if(target){
    button.style.backgroundImage = `url('${target}')`;
    button.style.backgroundRepeat = "no-repeat";
    button.style.backgroundSize = "contain";
    button.style.backgroundPosition = "center";
  } else {
    button.style.backgroundImage = "";
  }

  button.classList.toggle("menu-btn--active", !!isActive);
  button.dataset.state = isActive ? "active" : "default";
}

function syncModeButtonSkins(mode){
  applyMenuButtonSkin(hotSeatBtn, "hotSeat", mode === "hotSeat");
  applyMenuButtonSkin(computerBtn, "computer", mode === "computer");
  applyMenuButtonSkin(onlineBtn, "online", mode === "online");
}

function syncPlayButtonSkin(isReady){
  if(!(playBtn instanceof HTMLElement)) return;
  const ready = !!isReady;
  playBtn.disabled = !ready;
  playBtn.classList.toggle("disabled", !ready);
  playBtn.setAttribute("aria-pressed", ready ? "true" : "false");
  applyMenuButtonSkin(playBtn, "play", ready);
}

function syncRulesButtonSkins(selection){
  applyMenuButtonSkin(classicRulesBtn, "classicRules", selection === "classic");
  applyMenuButtonSkin(advancedSettingsBtn, "advancedSettings", selection === "advanced");
  classicRulesBtn?.classList.toggle("selected", selection === "classic");
  advancedSettingsBtn?.classList.toggle("selected", selection === "advanced");
}

const IS_TEST_HARNESS = document.body.classList.contains('test-harness');

const DEBUG_UI = false;

// Plane Counters = HUD columns of destroyed planes (not score, not points)
const planeCounterHosts = {
  green: greenPlaneCounter,
  blue: bluePlaneCounter
};

const HUD_LAYOUT = {
  planeCounters: {
    blue: { x: 3, y: 97, width: 48, height: 287 },
    green: { x: 3, y: 416, width: 48, height: 287 }
  }
};

function getVirtualRectFromDom(element, root = gsFrameEl) {
  if (!(element?.getBoundingClientRect) || !(root?.getBoundingClientRect)) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();

  if (!rect || !rootRect || rootRect.width <= 0 || rootRect.height <= 0) {
    return null;
  }

  const scaleX = FRAME_BASE_WIDTH / rootRect.width;
  const scaleY = FRAME_BASE_HEIGHT / rootRect.height;

  const x = (rect.left - rootRect.left) * scaleX;
  const y = (rect.top - rootRect.top) * scaleY;
  const width = rect.width * scaleX;
  const height = rect.height * scaleY;

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return {
    x,
    y,
    width,
    height
  };
}

const hudPlaneStyleProbeElements = Array.from(
  document.querySelectorAll("#hudPlaneStyleProbes .hud-plane")
);
const HUD_PLANE_STYLE_CACHE = new Map();

function extractScaleFromTransform(transformValue) {
  if (!transformValue || transformValue === "none") {
    return 1;
  }

  const value = transformValue.trim();
  if (value.startsWith("matrix3d(")) {
    const parts = value
      .slice(9, -1)
      .split(",")
      .map(part => parseFloat(part.trim()));
    if (parts.length >= 16) {
      const scaleX = parts[0];
      const scaleY = parts[5];
      if (Number.isFinite(scaleX) && Number.isFinite(scaleY)) {
        return Math.sqrt(Math.abs(scaleX * scaleY));
      }
    }
    return 1;
  }

  if (value.startsWith("matrix(")) {
    const parts = value
      .slice(7, -1)
      .split(",")
      .map(part => parseFloat(part.trim()));
    if (parts.length >= 6) {
      const scaleX = parts[0];
      const scaleY = parts[3];
      if (Number.isFinite(scaleX) && Number.isFinite(scaleY)) {
        return Math.sqrt(Math.abs(scaleX * scaleY));
      }
    }
  }

  return 1;
}

function rebuildHudPlaneStyleCache() {
  HUD_PLANE_STYLE_CACHE.clear();
  for (const element of hudPlaneStyleProbeElements) {
    if (!(element instanceof HTMLElement)) continue;
    let color = null;
    if (element.classList.contains("green")) {
      color = "green";
    } else if (element.classList.contains("blue")) {
      color = "blue";
    }
    if (!color) continue;

    const computed = window.getComputedStyle(element);
    const filter = (computed.filter && computed.filter !== "none")
      ? computed.filter
      : "";
    const scale = extractScaleFromTransform(computed.transform);
    HUD_PLANE_STYLE_CACHE.set(color, {
      filter,
      scale: Number.isFinite(scale) && scale > 0 ? scale : 1
    });
  }
}

function getHudPlaneStyle(color) {
  if (!color) return null;
  if (!HUD_PLANE_STYLE_CACHE.size) {
    rebuildHudPlaneStyleCache();
  }
  return HUD_PLANE_STYLE_CACHE.get(color) || null;
}

function combineFilters(...filters) {
  return filters
    .map(f => (typeof f === "string" ? f.trim() : ""))
    .filter(f => f && f.toLowerCase() !== "none")
    .join(" ");
}

rebuildHudPlaneStyleCache();

function formatNumericInputValue(value, fractionDigits = 2) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const factor = Math.pow(10, fractionDigits);
  const rounded = Math.round(value * factor) / factor;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  const fixed = rounded.toFixed(fractionDigits);
  const trimmed = parseFloat(fixed);
  return Number.isFinite(trimmed) ? String(trimmed) : fixed;
}

function getVisualViewportState() {
  const viewport = typeof window !== "undefined" ? window.visualViewport : null;

  const fallbackWidth = (typeof window !== "undefined" && Number.isFinite(window.innerWidth))
    ? window.innerWidth
    : (typeof document !== "undefined" && Number.isFinite(document.documentElement?.clientWidth))
      ? document.documentElement.clientWidth
      : (typeof document !== "undefined" && Number.isFinite(document.body?.clientWidth))
        ? document.body.clientWidth
        : 0;

  const fallbackHeight = (typeof window !== "undefined" && Number.isFinite(window.innerHeight))
    ? window.innerHeight
    : (typeof document !== "undefined" && Number.isFinite(document.documentElement?.clientHeight))
      ? document.documentElement.clientHeight
      : (typeof document !== "undefined" && Number.isFinite(document.body?.clientHeight))
        ? document.body.clientHeight
        : 0;

  const offsetLeft = Number.isFinite(viewport?.offsetLeft) ? viewport.offsetLeft : 0;
  const offsetTop = Number.isFinite(viewport?.offsetTop) ? viewport.offsetTop : 0;
  const width = Number.isFinite(viewport?.width) && viewport.width > 0 ? viewport.width : Math.max(1, fallbackWidth);
  const height = Number.isFinite(viewport?.height) && viewport.height > 0 ? viewport.height : Math.max(1, fallbackHeight);

  return {
    raw: viewport || null,
    scale: 1,
    offsetLeft,
    offsetTop,
    width,
    height
  };
}

function getViewportAdjustedBoundingClientRect(element) {
  const rect = element?.getBoundingClientRect?.();

  if (!rect) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const rawLeft = Number.isFinite(rect.left) ? rect.left : 0;
  const rawTop = Number.isFinite(rect.top) ? rect.top : 0;
  const rawWidth = Number.isFinite(rect.width) ? rect.width : 0;
  const rawHeight = Number.isFinite(rect.height) ? rect.height : 0;
  const topLeft = toDesignCoords(rawLeft, rawTop);
  const bottomRight = toDesignCoords(rawLeft + rawWidth, rawTop + rawHeight);
  const left = Number.isFinite(topLeft.x) ? topLeft.x : 0;
  const top = Number.isFinite(topLeft.y) ? topLeft.y : 0;
  const right = Number.isFinite(bottomRight.x) ? bottomRight.x : left;
  const bottom = Number.isFinite(bottomRight.y) ? bottomRight.y : top;
  const width = right - left;
  const height = bottom - top;

  return {
    left,
    top,
    width,
    height
  };
}

function VV() {
  const viewport = getVisualViewportState();
  return {
    raw: viewport.raw,
    scale: viewport.scale,
    offsetLeft: viewport.offsetLeft,
    offsetTop: viewport.offsetTop,
    left: viewport.offsetLeft,
    top: viewport.offsetTop,
    width: viewport.width,
    height: viewport.height
  };
}

function visualRect(element) {
  const rawRect = element?.getBoundingClientRect?.();
  const v = VV();
  if (!rawRect) {
    return { left: 0, top: 0, width: 0, height: 0, raw: null, v };
  }

  const adjusted = getViewportAdjustedBoundingClientRect(element);

  return { left: adjusted.left, top: adjusted.top, width: adjusted.width, height: adjusted.height, raw: rawRect, v };
}

function normalizeRect(rect) {
  return {
    left: Number.isFinite(rect?.left) ? rect.left : 0,
    top: Number.isFinite(rect?.top) ? rect.top : 0,
    width: Number.isFinite(rect?.width) ? rect.width : 0,
    height: Number.isFinite(rect?.height) ? rect.height : 0
  };
}

function getRawBoundingClientRect(element) {
  return normalizeRect(element?.getBoundingClientRect?.());
}

if (typeof window !== "undefined") {
  window.getVisualViewportState = getVisualViewportState;
  window.getViewportAdjustedBoundingClientRect = getViewportAdjustedBoundingClientRect;
}

// Legacy viewport conversion helpers (kept for debugging).
function clientPointFromEvent(e) {
  const v = VV();
  const touch = e?.touches?.[0] || e?.changedTouches?.[0] || null;
  const source = touch || e;
  const clientX = Number.isFinite(source?.clientX) ? source.clientX : 0;
  const clientY = Number.isFinite(source?.clientY) ? source.clientY : 0;
  return {
    x: clientX - v.left,
    y: clientY - v.top,
    rawX: clientX,
    rawY: clientY,
    v
  };
}

function clientToWorld(point) {
  const clientX = Number.isFinite(point?.x) ? point.x : 0;
  const clientY = Number.isFinite(point?.y) ? point.y : 0;
  const design = toDesignCoords(clientX, clientY);
  const world = designToBoardCoords(design.x, design.y);
  return {
    x: world.x,
    y: world.y,
    rect: getBoardCssRect(),
    v: null
  };
}

function resolveClientPoint(input) {
  if (!input) {
    return { clientX: 0, clientY: 0 };
  }

  let source = null;
  if (input.touches?.length) {
    source = input.touches[0];
  } else if (input.changedTouches?.length) {
    source = input.changedTouches[0];
  } else if (input.targetTouches?.length) {
    source = input.targetTouches[0];
  } else if (typeof input.clientX === "number" && typeof input.clientY === "number") {
    source = input;
  }

  const rawX = Number.isFinite(source?.clientX) ? source.clientX : 0;
  const rawY = Number.isFinite(source?.clientY) ? source.clientY : 0;

  return {
    clientX: rawX,
    clientY: rawY
  };
}

function clientToOverlay(event, overlay = aimCanvas) {
  const target = overlay || aimCanvas;
  const { clientX, clientY } = resolveClientPoint(event);
  const design = toDesignCoords(clientX, clientY);
  const { cssW, cssH, offsetX, offsetY } = getCanvasDesignMetrics(target);
  const localX = design.x - offsetX;
  const localY = design.y - offsetY;
  const safeCssW = cssW || 1;
  const safeCssH = cssH || 1;
  const nx = localX / safeCssW;
  const ny = localY / safeCssH;
  const logicalWidth = target?.width ?? Math.round(safeCssW * VIEW.dpr);
  const logicalHeight = target?.height ?? Math.round(safeCssH * VIEW.dpr);

  return {
    clientX,
    clientY,
    rect: { left: offsetX, top: offsetY, width: safeCssW, height: safeCssH },
    nx,
    ny,
    x: nx * logicalWidth,
    y: ny * logicalHeight
  };
}

function clientToBoard(event) {
  const { clientX, clientY } = resolveClientPoint(event);
  const design = toDesignCoords(clientX, clientY);
  const boardRect = getBoardCssRect();
  const safeWidth = boardRect.width || CANVAS_BASE_WIDTH;
  const safeHeight = boardRect.height || CANVAS_BASE_HEIGHT;
  const x_css = design.x - boardRect.left;
  const y_css = design.y - boardRect.top;
  const nx = x_css / safeWidth;
  const ny = y_css / safeHeight;

  return {
    clientX,
    clientY,
    rect: boardRect,
    nx,
    ny,
    x_css,
    y_css,
    x: x_css,
    y: y_css
  };
}

function worldToOverlayLocal(x, y, options = {}) {
  const { overlayRect: providedOverlayRect = null, boardRect: providedBoardRect = null } = options || {};
  const boardRect = providedBoardRect ? normalizeRect(providedBoardRect) : getBoardCssRect();
  const overlayRect = providedOverlayRect ? normalizeRect(providedOverlayRect) : boardRect;

  const boardWidth = boardRect.width || CANVAS_BASE_WIDTH;
  const boardHeight = boardRect.height || CANVAS_BASE_HEIGHT;
  const boardLeft = boardRect.left;
  const boardTop = boardRect.top;
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const nx = safeX / WORLD.width;
  const ny = safeY / WORLD.height;
  const clientX = boardLeft + nx * boardWidth;
  const clientY = boardTop + ny * boardHeight;

  const overlayX = clientX - overlayRect.left;
  const overlayY = clientY - overlayRect.top;

  return { clientX, clientY, overlayX, overlayY, nx, ny, boardRect, overlayRect };
}

function worldToOverlay(x, y, options = {}) {
  const { overlay = null, boardRect: providedBoardRect = null, overlayRect: providedOverlayRect = null } = options || {};
  const boardRect = providedBoardRect || getBoardCssRect();
  const boardWidth = Number.isFinite(boardRect.width) && boardRect.width !== 0 ? boardRect.width : CANVAS_BASE_WIDTH;
  const boardHeight = Number.isFinite(boardRect.height) && boardRect.height !== 0 ? boardRect.height : CANVAS_BASE_HEIGHT;
  const boardLeft = Number.isFinite(boardRect.left) ? boardRect.left : getFieldLeftCssValue();
  const boardTop = Number.isFinite(boardRect.top) ? boardRect.top : getFieldTopCssValue();
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const nx = safeX / WORLD.width;
  const ny = safeY / WORLD.height;
  const clientX = boardLeft + nx * boardWidth;
  const clientY = boardTop + ny * boardHeight;

  let overlayRect = null;
  let overlayX = clientX;
  let overlayY = clientY;

  if (overlay || providedOverlayRect) {
    overlayRect = providedOverlayRect || boardRect;
    const overlayWidthPx = Number.isFinite(overlayRect.width) && overlayRect.width !== 0
      ? overlayRect.width
      : (overlay?.width ?? CANVAS_BASE_WIDTH);
    const overlayHeightPx = Number.isFinite(overlayRect.height) && overlayRect.height !== 0
      ? overlayRect.height
      : (overlay?.height ?? CANVAS_BASE_HEIGHT);
    const overlayWidth = overlay?.width ?? overlayWidthPx;
    const overlayHeight = overlay?.height ?? overlayHeightPx;
    const overlayLeft = Number.isFinite(overlayRect.left) ? overlayRect.left : boardLeft;
    const overlayTop = Number.isFinite(overlayRect.top) ? overlayRect.top : boardTop;
    const onx = (clientX - overlayLeft) / overlayWidthPx;
    const ony = (clientY - overlayTop) / overlayHeightPx;
    overlayX = onx * overlayWidth;
    overlayY = ony * overlayHeight;
  }

  return { clientX, clientY, overlayX, overlayY, nx, ny, boardRect, overlayRect };
}

function worldToGameCanvas(x, y) {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  return {
    x: safeX,
    y: safeY,
    scaleX: 1,
    scaleY: 1,
    fromLayout: false,
    rect: getBoardCssRect()
  };
}

function syncOverlayCanvasToGameCanvas(targetCanvas, cssWidth, cssHeight) {
  if (!targetCanvas) return;

  const style = window.getComputedStyle(targetCanvas);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return;
  }

  const width = Math.max(1, Math.round(cssWidth || 0));
  const height = Math.max(1, Math.round(cssHeight || 0));
  const { RAW_DPR } = getCanvasDpr();
  targetCanvas.style.position = 'absolute';
  targetCanvas.style.left = '0px';
  targetCanvas.style.top = '0px';
  targetCanvas.style.width = `${width}px`;
  targetCanvas.style.height = `${height}px`;

  const backingWidth = Math.max(1, Math.round(width * RAW_DPR));
  const backingHeight = Math.max(1, Math.round(height * RAW_DPR));

  if (targetCanvas.width !== backingWidth) targetCanvas.width = backingWidth;
  if (targetCanvas.height !== backingHeight) targetCanvas.height = backingHeight;
}

const FX_RECT_MISMATCH_KEYS = new Set();
const FX_RECT_MISMATCH_TOLERANCE = 4;
const FX_HOST_MIN_SIZE = 2;

function ensureFxHost(parentEl, idOrClass, options = {}) {
  const parent = parentEl instanceof HTMLElement ? parentEl : null;
  if (!parent || parent === document.body) {
    return null;
  }

  const opts = options || {};
  const fillParent = opts.fillParent !== false;
  const widthPx = Number.isFinite(opts.width) ? opts.width : null;
  const heightPx = Number.isFinite(opts.height) ? opts.height : null;
  const leftPx = Number.isFinite(opts.left) ? opts.left : null;
  const topPx = Number.isFinite(opts.top) ? opts.top : null;
  const display = typeof opts.display === 'string' ? opts.display : 'block';

  const isId = typeof idOrClass === 'string' && idOrClass.startsWith('#');
  const isClass = typeof idOrClass === 'string' && idOrClass.startsWith('.');
  const hostId = isId ? idOrClass.slice(1) : (typeof idOrClass === 'string' ? idOrClass : '');
  const hostClass = isClass ? idOrClass.slice(1) : '';

  let host = hostId ? document.getElementById(hostId) : null;
  if (!host && hostClass) {
    host = parent.querySelector(`.${hostClass}`);
  }

  if (!(host instanceof HTMLElement)) {
    host = document.createElement('div');
    if (hostId) {
      host.id = hostId;
    }
    if (hostClass) {
      host.classList.add(hostClass);
    }
    parent.appendChild(host);
  } else if (!host.isConnected || host.parentElement !== parent) {
    parent.appendChild(host);
  }

  host.classList.add('fx-host');

  const parentStyle = window.getComputedStyle(parent);
  if (parentStyle.position === 'static') {
    parent.style.position = 'relative';
  }

  Object.assign(host.style, {
    position: 'absolute',
    pointerEvents: 'none',
    display,
    overflow: 'visible'
  });

  if (fillParent) {
    Object.assign(host.style, {
      inset: '0',
      width: '100%',
      height: '100%'
    });
  } else {
    Object.assign(host.style, {
      inset: 'auto',
      width: widthPx ? `${widthPx}px` : host.style.width,
      height: heightPx ? `${heightPx}px` : host.style.height
    });

    if (leftPx !== null) {
      host.style.left = `${leftPx}px`;
    }

    if (topPx !== null) {
      host.style.top = `${topPx}px`;
    }
  }

  return host;
}

function warnIfFxHostMismatch(boardRect, hostRect, context = 'fx') {
  if (!boardRect || !hostRect) {
    return;
  }

  const bWidth = Number.isFinite(boardRect.width) ? boardRect.width : 0;
  const bHeight = Number.isFinite(boardRect.height) ? boardRect.height : 0;
  const hWidth = Number.isFinite(hostRect.width) ? hostRect.width : 0;
  const hHeight = Number.isFinite(hostRect.height) ? hostRect.height : 0;
  const bLeft = Number.isFinite(boardRect.left) ? boardRect.left : 0;
  const bTop = Number.isFinite(boardRect.top) ? boardRect.top : 0;
  const hLeft = Number.isFinite(hostRect.left) ? hostRect.left : 0;
  const hTop = Number.isFinite(hostRect.top) ? hostRect.top : 0;

  const widthDiff = Math.abs(bWidth - hWidth);
  const heightDiff = Math.abs(bHeight - hHeight);
  const leftDiff = Math.abs(bLeft - hLeft);
  const topDiff = Math.abs(bTop - hTop);

  if (
    widthDiff <= FX_RECT_MISMATCH_TOLERANCE &&
    heightDiff <= FX_RECT_MISMATCH_TOLERANCE &&
    leftDiff <= FX_RECT_MISMATCH_TOLERANCE &&
    topDiff <= FX_RECT_MISMATCH_TOLERANCE
  ) {
    return;
  }

  const key = `${context}:${Math.round(bWidth)}x${Math.round(bHeight)}@${Math.round(bLeft)},${Math.round(bTop)}->${Math.round(hWidth)}x${Math.round(hHeight)}@${Math.round(hLeft)},${Math.round(hTop)}`;
  if (FX_RECT_MISMATCH_KEYS.has(key)) {
    return;
  }

  FX_RECT_MISMATCH_KEYS.add(key);
  console.warn(`[FX] Host rect mismatch detected (${context})`, {
    boardRect,
    hostRect,
    widthDiff,
    heightDiff,
    leftDiff,
    topDiff
  });
}

// ---- ЕДИНЫЕ размеры макета ----
const MOCKUP_W = 460;
const MOCKUP_H = 800;


// Если фон/рамка рисуются со сдвигом, используем тот же сдвиг здесь
const BOARD_ORIGIN = { x: 0, y: 0 };

// ---- Crash FX timing (used for delayed wreck/flame reveal) ----

const CRASH_FX_DELAY_MS = 0;   // delay before showing wreck FX
const GREEN_FLAME_SPRITES = [
  "ui_gamescreen/flames green/flame_green_1.gif",
  "ui_gamescreen/flames green/flame_green_2.gif",
  "ui_gamescreen/flames green/flame_green_3.gif",
  "ui_gamescreen/flames green/flame_green_4.gif",
  "ui_gamescreen/flames green/flame_green_5.gif",
  "ui_gamescreen/flames green/flame_green_6.gif",
  "ui_gamescreen/flames green/flame_green_7.gif",
  "ui_gamescreen/flames green/flame_green_8.gif",
  "ui_gamescreen/flames green/flame_green_9.gif",
  "ui_gamescreen/flames green/flame_green_10.gif",
];
const BLUE_FLAME_SPRITES = [
  "ui_gamescreen/flames blue/flame_blue_1.gif",
  "ui_gamescreen/flames blue/flame_blue_2.gif",
  "ui_gamescreen/flames blue/flame_blue_3.gif",
  "ui_gamescreen/flames blue/flame_blue_4.gif",
  "ui_gamescreen/flames blue/flame_blue_5.gif",
  "ui_gamescreen/flames blue/flame_blue_6.gif",
];
const BURNING_FLAME_SRCS = [...GREEN_FLAME_SPRITES, ...BLUE_FLAME_SPRITES];
const DEFAULT_BURNING_FLAME_SRC = BURNING_FLAME_SRCS[0];

const BURNING_FLAME_SRC_SET = new Set(BURNING_FLAME_SRCS);
const BLUE_FLAME_DISPLAY_SIZE = { width: 12.5, height: 27.5 };
const GREEN_FLAME_DISPLAY_SIZE = { width: 10, height: 55 };
const BASE_FLAME_DISPLAY_SIZE = BLUE_FLAME_DISPLAY_SIZE;
const PLANE_FLAME_HOST_ID = 'planeFlameHost';
const EXPLOSION_HOST_ID = 'explosionHost';
const EXPLOSION_HOST_Z_INDEX = 24;
const CARGO_HOST_ID = 'cargoHost';
const CARGO_HOST_Z_INDEX = 23;

let flameCycleIndex = 0;
let flameStyleRevision = 0;

let lastPlaneFlamePosLogTs = 0;

function getFxHostBounds() {
  const boardRect = getBoardCssRect();
  const width = Number.isFinite(WORLD?.width) ? WORLD.width : boardRect.width;
  const height = Number.isFinite(WORLD?.height) ? WORLD.height : boardRect.height;
  return {
    left: boardRect.left,
    top: boardRect.top,
    width,
    height
  };
}

function logPlaneFlamePosition(plane, metrics, clientPoint, flameOffset) {
  if (!DEBUG_FLAME_POS) {
    return;
  }

  const now = Date.now();
  if (now - lastPlaneFlamePosLogTs < 1000) {
    return;
  }
  lastPlaneFlamePosLogTs = now;

  const { boardRect, hostRect, host } = metrics || {};
  const planeCanvasRect = planeCanvas?.getBoundingClientRect?.() || null;
  const expectedPlaneCanvas = planeCanvasRect
    ? {
        left: clientPoint.clientX - planeCanvasRect.left,
        top: clientPoint.clientY - planeCanvasRect.top
      }
    : null;
  const deltaFromPlaneCanvas = expectedPlaneCanvas
    ? {
        dx: flameOffset.left - expectedPlaneCanvas.left,
        dy: flameOffset.top - expectedPlaneCanvas.top
      }
    : null;
  const visualViewportState = window.visualViewport
    ? {
        scale: window.visualViewport.scale,
        offsetLeft: window.visualViewport.offsetLeft,
        offsetTop: window.visualViewport.offsetTop,
        pageLeft: window.visualViewport.pageLeft,
        pageTop: window.visualViewport.pageTop,
        width: window.visualViewport.width,
        height: window.visualViewport.height
      }
    : null;

  const rootStyle = window.getComputedStyle(document.documentElement);
  const uiScaleRaw = rootStyle.getPropertyValue('--ui-scale');
  const uiScale = uiScaleRaw ? parseFloat(uiScaleRaw) : null;

  console.debug('[FX][DEBUG_FLAME_POS]', {
    plane: {
      id: plane?.id ?? plane?.uid ?? plane?.name ?? null,
      color: plane?.color ?? null,
      x: plane?.x,
      y: plane?.y
    },
    client: { x: clientPoint.clientX, y: clientPoint.clientY },
    flameOffset: { ...flameOffset },
    boardRect,
    hostRect,
    rawOverlayRect: overlayContainer?.getBoundingClientRect?.() || null,
    rawHostRect: host?.getBoundingClientRect?.() || null,
    planeCanvasRect,
    expectedPlaneCanvas,
    deltaFromPlaneCanvas,
    visualViewport: visualViewportState,
    uiScale
  });
}

function ensurePlaneFlameHost() {
  const parent = fxHostLayer instanceof HTMLElement
    ? fxHostLayer
    : (gsFrameLayer instanceof HTMLElement ? gsFrameLayer : null);
  if (!(parent instanceof HTMLElement)) {
    return null;
  }
  const bounds = getFxHostBounds();
  return ensureFxHost(parent, PLANE_FLAME_HOST_ID, {
    fillParent: false,
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height
  });
}

function ensureExplosionHost() {
  const parent = fxHostLayer instanceof HTMLElement
    ? fxHostLayer
    : (gsFrameLayer instanceof HTMLElement ? gsFrameLayer : null);
  if (!(parent instanceof HTMLElement)) {
    return null;
  }
  const bounds = getFxHostBounds();
  const host = ensureFxHost(parent, EXPLOSION_HOST_ID, {
    fillParent: false,
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height
  });
  if (!(host instanceof HTMLElement)) {
    return null;
  }

  host.style.zIndex = String(EXPLOSION_HOST_Z_INDEX);

  return host;
}

function ensureCargoHost() {
  const parent = fxHostLayer instanceof HTMLElement
    ? fxHostLayer
    : (overlayFxLayer instanceof HTMLElement
      ? overlayFxLayer
      : (gsFrameLayer instanceof HTMLElement ? gsFrameLayer : null));
  if (!(parent instanceof HTMLElement)) {
    return null;
  }
  const bounds = getFxHostBounds();
  const host = ensureFxHost(parent, CARGO_HOST_ID, {
    fillParent: false,
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height
  });
  if (!(host instanceof HTMLElement)) {
    return null;
  }

  host.style.zIndex = String(CARGO_HOST_Z_INDEX);

  return host;
}

function isGameScreenActive() {
  if (phase === 'MENU') {
    return false;
  }

  if (settingsLayer instanceof HTMLElement && !settingsLayer.hidden) {
    return false;
  }

  if (menuScreen instanceof HTMLElement && !menuScreen.hidden) {
    return false;
  }

  return true;
}

function resolvePlaneFlameMetrics(context = 'plane flame') {
  if (!isGameScreenActive()) {
    return null;
  }

  const canvasWidth = gsBoardCanvas?.offsetWidth || 0;
  const canvasHeight = gsBoardCanvas?.offsetHeight || 0;
  const overlayWidth = overlayContainer?.offsetWidth || 0;
  const overlayHeight = overlayContainer?.offsetHeight || 0;

  const hasUsableSurface = (
    canvasWidth > FX_HOST_MIN_SIZE && canvasHeight > FX_HOST_MIN_SIZE
  ) || (
    overlayWidth > FX_HOST_MIN_SIZE && overlayHeight > FX_HOST_MIN_SIZE
  );

  if (!hasUsableSurface) {
    return null;
  }

  const bounds = getFxHostBounds();
  const boardRect = {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height
  };
  const overlayRect = { ...boardRect };
  const host = ensurePlaneFlameHost();

  if (!(host instanceof HTMLElement)) {
    console.warn(`[FX] Skipping ${context}: host missing`);
    return null;
  }

  if (!host.isConnected) {
    console.warn(`[FX] Skipping ${context}: host not connected`);
    return null;
  }

  const hostStyle = window.getComputedStyle(host);
  if (hostStyle.display === 'none' || hostStyle.visibility === 'hidden') {
    console.warn(`[FX] Skipping ${context}: host hidden`, {
      display: hostStyle.display,
      visibility: hostStyle.visibility
    });
    return null;
  }

  const hostWidth = host.offsetWidth || overlayRect.width;
  const hostHeight = host.offsetHeight || overlayRect.height;
  const hostRect = {
    left: overlayRect.left,
    top: overlayRect.top,
    width: hostWidth,
    height: hostHeight
  };
  if (!hostRect || hostRect.width <= FX_HOST_MIN_SIZE || hostRect.height <= FX_HOST_MIN_SIZE) {
    console.warn(`[FX] Skipping ${context}: host rect invalid`, { hostRect });
    return null;
  }

  const usableBoardRect = (boardRect && boardRect.width > FX_HOST_MIN_SIZE && boardRect.height > FX_HOST_MIN_SIZE)
    ? boardRect
    : (overlayRect && overlayRect.width > FX_HOST_MIN_SIZE && overlayRect.height > FX_HOST_MIN_SIZE ? overlayRect : null);

  if (!usableBoardRect) {
    console.warn(`[FX] Skipping ${context}: board rect invalid`, { boardRect });
    return null;
  }

  warnIfFxHostMismatch(usableBoardRect, hostRect, context);

  return { boardRect: usableBoardRect, overlayRect, hostRect };
}

function resolveExplosionMetrics(context = 'explosion') {
  if (!isGameScreenActive()) {
    return null;
  }

  const canvasWidth = gsBoardCanvas?.offsetWidth || 0;
  const canvasHeight = gsBoardCanvas?.offsetHeight || 0;
  const overlayWidth = overlayContainer?.offsetWidth || 0;
  const overlayHeight = overlayContainer?.offsetHeight || 0;

  const hasUsableSurface = (
    canvasWidth > FX_HOST_MIN_SIZE && canvasHeight > FX_HOST_MIN_SIZE
  ) || (
    overlayWidth > FX_HOST_MIN_SIZE && overlayHeight > FX_HOST_MIN_SIZE
  );

  if (!hasUsableSurface) {
    return null;
  }

  const bounds = getFxHostBounds();
  const boardRect = {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height
  };
  const overlayRect = { ...boardRect };
  const host = ensureExplosionHost();

  if (!(host instanceof HTMLElement)) {
    console.warn(`[FX] Skipping ${context}: host missing`);
    return null;
  }

  if (!host.isConnected) {
    console.warn(`[FX] Skipping ${context}: host not connected`);
    return null;
  }

  const hostStyle = window.getComputedStyle(host);
  if (hostStyle.display === 'none' || hostStyle.visibility === 'hidden') {
    console.warn(`[FX] Skipping ${context}: host hidden`, {
      display: hostStyle.display,
      visibility: hostStyle.visibility
    });
    return null;
  }

  const hostWidth = host.offsetWidth || overlayRect.width;
  const hostHeight = host.offsetHeight || overlayRect.height;
  const hostRect = {
    left: overlayRect.left,
    top: overlayRect.top,
    width: hostWidth,
    height: hostHeight
  };
  if (!hostRect || hostRect.width <= FX_HOST_MIN_SIZE || hostRect.height <= FX_HOST_MIN_SIZE) {
    console.warn(`[FX] Skipping ${context}: host rect invalid`, { hostRect });
    return null;
  }

  const usableBoardRect = (boardRect && boardRect.width > FX_HOST_MIN_SIZE && boardRect.height > FX_HOST_MIN_SIZE)
    ? boardRect
    : (overlayRect && overlayRect.width > FX_HOST_MIN_SIZE && overlayRect.height > FX_HOST_MIN_SIZE ? overlayRect : null);

  if (!usableBoardRect) {
    console.warn(`[FX] Skipping ${context}: board rect invalid`, { boardRect });
    return null;
  }

  warnIfFxHostMismatch(usableBoardRect, hostRect, context);

  return { boardRect: usableBoardRect, overlayRect, hostRect, host };
}

function resolveCargoMetrics(context = 'cargo') {
  if (!isGameScreenActive()) {
    return null;
  }

  const canvasWidth = gsBoardCanvas?.offsetWidth || 0;
  const canvasHeight = gsBoardCanvas?.offsetHeight || 0;
  const overlayWidth = overlayContainer?.offsetWidth || 0;
  const overlayHeight = overlayContainer?.offsetHeight || 0;

  const hasUsableSurface = (
    canvasWidth > FX_HOST_MIN_SIZE && canvasHeight > FX_HOST_MIN_SIZE
  ) || (
    overlayWidth > FX_HOST_MIN_SIZE && overlayHeight > FX_HOST_MIN_SIZE
  );

  if (!hasUsableSurface) {
    return null;
  }

  const bounds = getFxHostBounds();
  const boardRect = {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height
  };
  const overlayRect = { ...boardRect };
  const host = ensureCargoHost();

  if (!(host instanceof HTMLElement)) {
    console.warn(`[FX] Skipping ${context}: host missing`);
    return null;
  }

  if (!host.isConnected) {
    console.warn(`[FX] Skipping ${context}: host not connected`);
    return null;
  }

  const hostStyle = window.getComputedStyle(host);
  if (hostStyle.display === 'none' || hostStyle.visibility === 'hidden') {
    console.warn(`[FX] Skipping ${context}: host hidden`, {
      display: hostStyle.display,
      visibility: hostStyle.visibility
    });
    return null;
  }

  const hostWidth = host.offsetWidth || overlayRect.width;
  const hostHeight = host.offsetHeight || overlayRect.height;
  const hostRect = {
    left: overlayRect.left,
    top: overlayRect.top,
    width: hostWidth,
    height: hostHeight
  };
  if (!hostRect || hostRect.width <= FX_HOST_MIN_SIZE || hostRect.height <= FX_HOST_MIN_SIZE) {
    console.warn(`[FX] Skipping ${context}: host rect invalid`, { hostRect });
    return null;
  }

  const usableBoardRect = (boardRect && boardRect.width > FX_HOST_MIN_SIZE && boardRect.height > FX_HOST_MIN_SIZE)
    ? boardRect
    : (overlayRect && overlayRect.width > FX_HOST_MIN_SIZE && overlayRect.height > FX_HOST_MIN_SIZE ? overlayRect : null);

  if (!usableBoardRect) {
    console.warn(`[FX] Skipping ${context}: board rect invalid`, { boardRect });
    return null;
  }

  warnIfFxHostMismatch(usableBoardRect, hostRect, context);

  return { boardRect: usableBoardRect, overlayRect, hostRect, host };
}

function getFlameDisplaySize(plane) {
  if (plane?.color === 'green') {
    return GREEN_FLAME_DISPLAY_SIZE;
  }
  return BLUE_FLAME_DISPLAY_SIZE;
}

function getPlaneFlameSprites(plane) {
  const pool = plane?.color === 'green' ? GREEN_FLAME_SPRITES : BLUE_FLAME_SPRITES;
  if (Array.isArray(pool) && pool.length > 0) {
    return pool;
  }
  return BURNING_FLAME_SRCS;
}

function resolveFlameImage(flameSrc) {
  if (!flameSrc) {
    return { src: '', img: null };
  }
  const cached = flameImages.get(flameSrc) || null;
  if (cached) {
    return { src: flameSrc, img: cached };
  }
  if (defaultFlameImg) {
    return { src: defaultFlameImg.src || flameSrc, img: defaultFlameImg };
  }
  return { src: flameSrc, img: null };
}

function pickRandomBurningFlame(plane) {
  const pool = getPlaneFlameSprites(plane);

  if (!pool.length) {
    return resolveFlameImage(DEFAULT_BURNING_FLAME_SRC || "");
  }
  const index = Math.floor(Math.random() * pool.length);
  return resolveFlameImage(pool[index]);

}

function getCurrentFlameStyleKey() {
  return normalizeFlameStyleKey(settings.flameStyle);
}

function getFlameStyleConfig(styleKey) {
  return FLAME_STYLE_MAP.get(normalizeFlameStyleKey(styleKey)) || null;
}

function pickFlameSrcForStyle(styleKey, plane) {
  const normalized = normalizeFlameStyleKey(styleKey);
  if (normalized === 'off') {
    return { src: '', img: null };
  }

  const pool = getPlaneFlameSprites(plane);
  if (!Array.isArray(pool) || pool.length === 0) {
    return resolveFlameImage(DEFAULT_BURNING_FLAME_SRC || '');
  }

  if (normalized === 'cycle') {
    const index = flameCycleIndex % pool.length;
    flameCycleIndex = (flameCycleIndex + 1) % pool.length;
    return resolveFlameImage(pool[index]);
  }

  return pickRandomBurningFlame(plane);
}

function onFlameStyleChanged() {
  const normalized = getCurrentFlameStyleKey();
  if (settings.flameStyle !== normalized) {
    settings.flameStyle = normalized;
  }
  flameCycleIndex = 0;
  flameStyleRevision++;

  for (const timer of planeFlameTimers.values()) {
    clearTimeout(timer);
  }
  planeFlameTimers.clear();

  for (const [plane, entry] of planeFlameFx.entries()) {
    entry?.stop?.();
    const element = entry?.element || entry;
    element?.remove?.();
    planeFlameFx.delete(plane);
    if (plane) {
      delete plane.burningFlameSrc;
      delete plane.burningFlameImg;
      delete plane.burningFlameStyleKey;
      delete plane.burningFlameStyleRevision;
      delete plane.crashFlameImg;
      delete plane.crashFlameSrc;
    }
  }

  if (Array.isArray(points)) {
    for (const plane of points) {
      if (!plane) continue;
      delete plane.burningFlameSrc;
      delete plane.burningFlameStyleKey;
      delete plane.burningFlameStyleRevision;
      if (plane.burning && !plane.flameFxDisabled && hasCrashDelayElapsed(plane)) {
        spawnBurningFlameFx(plane);
      }
    }
  }

}

function ensurePlaneBurningFlame(plane) {
  if (!plane) {
    return { src: DEFAULT_BURNING_FLAME_SRC || "", img: defaultFlameImg || null };
  }
  const styleKey = getCurrentFlameStyleKey();
  if (styleKey === 'off') {
    plane.burningFlameStyleKey = styleKey;
    plane.burningFlameSrc = '';
    plane.burningFlameImg = null;
    return { src: '', img: null };
  }

  if (!plane.crashFlameSrc) {
    const selection = pickFlameSrcForStyle(styleKey, plane);
    plane.crashFlameSrc = selection?.src || '';
    plane.crashFlameImg = selection?.img || null;
  }

  plane.burningFlameStyleKey = styleKey;
  plane.burningFlameStyleRevision = flameStyleRevision;
  plane.burningFlameSrc = plane.crashFlameSrc || '';
  plane.burningFlameImg = plane.crashFlameImg || null;
  const resolvedImg = plane.burningFlameImg || defaultFlameImg || null;
  const resolvedSrc = resolvedImg?.src || plane.burningFlameSrc || '';
  return { src: resolvedSrc, img: resolvedImg };
}


// Время (в секундах), в течение которого самолёт-атакующий
// игнорирует повторный контакт с только что сбитой целью.
const PLANE_HIT_COOLDOWN_SEC = 0.2;

const planeFlameFx = new Map();
const planeFlameTimers = new Map();
let warnedMissingPlaneFlameHost = false;

function applyFlameElementStyles(element, size = BASE_FLAME_DISPLAY_SIZE, planeColor = '', planeState = '') {
  if (!element) return;
  element.classList.add('fx-flame');
  if (planeColor === 'green') {
    element.classList.add('fx-flame--green');
  } else {
    element.classList.add('fx-flame--blue');
  }
  element.style.position = 'absolute';
  element.style.pointerEvents = 'none';
  element.style.transform = 'translate(-50%, -100%)';
  const stateClass = planeState === 'alive' ? 'fx-flame--alive' : 'fx-flame--crashed';
  element.classList.add(stateClass);
  element.dataset.state = planeState || stateClass.replace('fx-flame--', '');
  element.style.zIndex = planeState === 'crashed' ? '21' : '30';
  element.style.width = `${size.width}px`;
  element.style.height = `${size.height}px`;
}

function applyFlameVisualStyle(element, styleKey) {
  if (!element) return;
  const config = getFlameStyleConfig(styleKey);
  const filter = config?.filter || '';
  element.dataset.flameStyle = normalizeFlameStyleKey(styleKey);
  element.style.filter = filter || '';
  element.dataset.flameFilter = filter || '';
}

function createFlameImageEntry(plane, flameImg, flameSrc = flameImg?.src || '') {
  const readyFlameImg = isSpriteReady(flameImg)
    ? flameImg
    : (isSpriteReady(defaultFlameImg) ? defaultFlameImg : null);
  const resolvedSrc = readyFlameImg?.src || flameSrc || '';

  if (!readyFlameImg || !resolvedSrc) {
    return null;
  }

  const displaySize = getFlameDisplaySize(plane);
  const container = document.createElement('div');
  const planeState = plane?.isAlive ? 'alive' : 'crashed';
  applyFlameElementStyles(container, displaySize, plane?.color || '', planeState);

  const img = new Image();
  img.decoding = 'async';
  img.width = displaySize.width;
  img.height = displaySize.height;
  img.className = 'fx-flame-img';

  let attemptedSrc = resolvedSrc;

  let readyResolved = false;
  let resolveReady;
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const resolveReadySafely = () => {
    if (readyResolved) return;
    readyResolved = true;
    resolveReady();
  };

  const stop = () => {
    img.onerror = null;
    img.onload = null;
    if (container?.isConnected) {
      container.remove();
    }
    resolveReadySafely();
  };

  const ensureReady = () => {
    if (readyResolved) return;
    if (img.complete && img.naturalWidth > 0) {
      resolveReadySafely();
      return;
    }
    if (typeof img.decode === 'function') {
      img.decode()
        .then(resolveReadySafely)
        .catch(() => {
          if (img.complete && img.naturalWidth > 0) {
            resolveReadySafely();
          }
        });
    }
  };

  img.onerror = () => {
    const fallbackImg = isSpriteReady(defaultFlameImg) ? defaultFlameImg : null;
    const fallbackSrc = fallbackImg?.src || DEFAULT_BURNING_FLAME_SRC || '';
    if (!fallbackSrc || attemptedSrc === fallbackSrc) {
      stop();
      img.remove();
      planeFlameFx.delete(plane);
      if (plane && plane.burningFlameSrc) {
        delete plane.burningFlameSrc;
      }
      if (plane && plane.burningFlameImg) {
        delete plane.burningFlameImg;
      }
      disablePlaneFlameFx(plane);
      return;
    }
    attemptedSrc = fallbackSrc;
    if (plane) {
      plane.burningFlameSrc = fallbackSrc;
      plane.burningFlameImg = fallbackImg;
    }
    img.dataset.flameSrc = fallbackSrc;
    img.src = fallbackSrc;
    ensureReady();
  };

  img.onload = () => {
    img.dataset.flameSrc = attemptedSrc || '';
    resolveReadySafely();
  };

  installImageWatch(img, resolvedSrc, "flameFx");
  img.dataset.flameSrc = resolvedSrc;
  img.src = resolvedSrc;

  ensureReady();

  container.appendChild(img);

  return { element: container, stop, ready };
}

function disablePlaneFlameFx(plane) {
  if (plane) {
    plane.flameFxDisabled = true;
  }
}

function resetPlaneFlameFxDisabled(plane) {
  if (plane) {
    plane.flameFxDisabled = false;
  }
}

function cleanupGreenCrashFx() {

  cleanupBurningFx();
}

function cleanupBurningFx() {
  for (const timer of planeFlameTimers.values()) {
    clearTimeout(timer);
  }
  planeFlameTimers.clear();

  for (const [plane, entry] of planeFlameFx.entries()) {
    entry?.stop?.();
    const element = entry?.element || entry;
    element?.remove?.();
    if (plane && plane.burningFlameSrc) {
      delete plane.burningFlameSrc;
    }
    if (plane && plane.burningFlameImg) {
      delete plane.burningFlameImg;
    }
    if (plane && plane.crashFlameImg) {
      delete plane.crashFlameImg;
    }
    if (plane && plane.crashFlameSrc) {
      delete plane.crashFlameSrc;
    }
    if (plane && plane.burningFlameStyleKey) {
      delete plane.burningFlameStyleKey;
    }
    if (plane && Object.prototype.hasOwnProperty.call(plane, 'burningFlameStyleRevision')) {
      delete plane.burningFlameStyleRevision;
    }
    resetPlaneFlameFxDisabled(plane);
  }
  planeFlameFx.clear();
}

function schedulePlaneFlameFx(plane) {
  if (!plane) return;
  const existingTimer = planeFlameTimers.get(plane);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const timer = setTimeout(() => {
    planeFlameTimers.delete(plane);
    if (plane.burning && !plane?.flameFxDisabled && hasCrashDelayElapsed(plane) && !planeFlameFx.has(plane)) {
      spawnBurningFlameFx(plane);
    }
  }, CRASH_FX_DELAY_MS);
  planeFlameTimers.set(plane, timer);
}

function spawnBurningFlameFx(plane) {
  if (plane?.flameFxDisabled) {
    return;
  }
  const host = ensurePlaneFlameHost();
  if (!host) {
    if (!warnedMissingPlaneFlameHost) {
      console.warn('[FX] Skipping plane flame: host unavailable');
      warnedMissingPlaneFlameHost = true;
    }
    return;
  }

  const flameSelection = ensurePlaneBurningFlame(plane);
  const flameImg = flameSelection?.img || null;
  const flameSrc = flameSelection?.src || '';
  if (!flameImg && !flameSrc) return;

  const entry = createFlameImageEntry(plane, flameImg, flameSrc);
  if (!entry?.element) {
    return;
  }

  const existing = planeFlameFx.get(plane);
  if (existing) {
    existing.stop?.();
    const existingElement = existing.element || existing;
    existingElement?.remove?.();
  }

  let mounted = false;
  const mountEntry = () => {
    if (mounted || plane?.flameFxDisabled) {
      entry.stop?.();
      return;
    }
    host.appendChild(entry.element);
    applyFlameVisualStyle(entry.element, plane?.burningFlameStyleKey || getCurrentFlameStyleKey());
    planeFlameFx.set(plane, entry);
    mounted = true;
    updatePlaneFlameFxPosition(plane);
  };

  if (entry.ready && typeof entry.ready.then === 'function') {
    entry.ready.then(mountEntry);
  } else {
    mountEntry();
  }
}

function logPlaneFlameDebug(payload = {}) {
  if (!(DEBUG_LAYOUT || DEBUG_FX)) return;
  if (planeFlameDebugState.logged >= 5) return;
  planeFlameDebugState.logged += 1;
  console.log('[fx:flame]', payload);
}

function updatePlaneFlameFxPosition(plane, metrics) {
  const entry = planeFlameFx.get(plane);
  const element = entry?.element || entry;
  if (!element) return;

  let data = metrics;
  if (!data) {
    data = resolvePlaneFlameMetrics('plane flame');
  }

  if (!data) {
    return;
  }

  const { boardRect, hostRect, overlayRect } = data;

  if (!boardRect || !hostRect || !overlayRect) {
    return;
  }

  if (overlayRect.width <= 0 || overlayRect.height <= 0) {
    return;
  }

  const x = plane?.x;
  const y = plane?.y;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const { clientX, clientY, overlayX, overlayY } = worldToOverlayLocal(x, y, { boardRect, overlayRect });

  element.style.left = Math.round(overlayX) + 'px';
  element.style.top = Math.round(overlayY) + 'px';

  logPlaneFlameDebug({
    plane: plane?.color || plane?.id || 'unknown',
    planePos: { x: Math.round(x), y: Math.round(y) },
    overlayPoint: { x: Math.round(overlayX), y: Math.round(overlayY) },
    clientPoint: { x: Math.round(clientX), y: Math.round(clientY) },
    boardRect: normalizeRect(boardRect),
    overlayRect: normalizeRect(overlayRect),
    hostRect: normalizeRect(hostRect),
    planeCanvasRect: normalizeRect(planeCanvas?.getBoundingClientRect?.())
  });
}

function updateAllPlaneFlameFxPositions() {
  if (!isGameScreenActive()) return;
  if (planeFlameFx.size === 0) return;
  const metrics = resolvePlaneFlameMetrics('plane flame batch');
  if (!metrics) {
    return;
  }

  for (const plane of planeFlameFx.keys()) {
    updatePlaneFlameFxPosition(plane, metrics);
  }
}

let pendingPlaneFlameSync = false;

function syncPlaneFlameToHost() {
  pendingPlaneFlameSync = false;
  updateAllPlaneFlameFxPositions();
}

function schedulePlaneFlameSync() {
  if (pendingPlaneFlameSync) {
    return;
  }
  pendingPlaneFlameSync = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncPlaneFlameToHost();
    });
  });
}

function ensurePlaneFlameFx(plane) {
  if (!plane.burning) {
    const entry = planeFlameFx.get(plane);
    if (entry) {
      entry.stop?.();
      const element = entry.element || entry;
      element?.remove?.();
      planeFlameFx.delete(plane);
    }
    const timer = planeFlameTimers.get(plane);
    if (timer) {
      clearTimeout(timer);
      planeFlameTimers.delete(plane);
    }
    if (plane.burningFlameSrc) {
      delete plane.burningFlameSrc;
    }
    if (plane.burningFlameImg) {
      delete plane.burningFlameImg;
    }
    if (plane.crashFlameSrc) {
      delete plane.crashFlameSrc;
    }
    if (plane.crashFlameImg) {
      delete plane.crashFlameImg;
    }
    resetPlaneFlameFxDisabled(plane);
    return;
  }

  if (plane.flameFxDisabled) {
    return;
  }

  if (!planeFlameFx.has(plane)) {
    const timer = planeFlameTimers.get(plane);
    if (timer) {
      clearTimeout(timer);
      planeFlameTimers.delete(plane);
    }
    spawnBurningFlameFx(plane);
  }

}


function resetCanvasState(ctx, canvas){
  if (!ctx || !canvas) return;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  applyViewTransform(ctx);
}

// Enable smoothing so rotated images (planes, arrows) don't appear jagged
[gsBoardCtx, aimCtx, planeCtx, hudCtx].forEach(ctx => {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
});

const menuScreen = menuLayer;
const modeMenuDiv = document.getElementById("modeMenu");
const hotSeatBtn  = document.getElementById("hotSeatBtn");
const computerBtn = document.getElementById("computerBtn");
const onlineBtn   = document.getElementById("onlineBtn");
const leftModePlane = document.getElementById("mm_plane_left_mode");
const rightModePlane = document.getElementById("mm_plane_right_mode");
const leftRulesPlane = document.getElementById("mm_plane_left_rules");
const rightRulesPlane = document.getElementById("mm_plane_right_rules");

const playBtn     = document.getElementById("playBtn");

const classicRulesBtn     = document.getElementById("classicRulesBtn");
const advancedSettingsBtn = document.getElementById("advancedSettingsBtn");
const modeMenuButtons = [hotSeatBtn, computerBtn, onlineBtn];
const rulesMenuButtons = [classicRulesBtn, advancedSettingsBtn];

const DEBUG_MENU_PLANE_PIVOT = false;

function logMenuPlaneMetrics(label, outerEl, innerEl){
  if(!(outerEl instanceof HTMLElement) || !(innerEl instanceof HTMLElement)) return;

  const outerRect = outerEl.getBoundingClientRect();
  const innerRect = innerEl.getBoundingClientRect();
  const styles = getComputedStyle(innerEl);
  const payload = {
    outerRect,
    innerRect,
    styles: {
      transform: styles.transform,
      transformOrigin: styles.transformOrigin,
      transformBox: styles.transformBox,
      width: styles.width,
      height: styles.height
    }
  };

  if(innerEl instanceof HTMLImageElement){
    payload.image = {
      naturalWidth: innerEl.naturalWidth,
      naturalHeight: innerEl.naturalHeight,
      width: innerEl.width,
      height: innerEl.height
    };
  }

  console.log(`[MM] ${label} metrics`, payload);
}

function logMenuPlaneMetricsOnce(){
  if(!DEBUG_MENU_PLANE_PIVOT) return;
  if(!(modeMenuDiv instanceof HTMLElement)) return;
  if(modeMenuDiv.dataset.mmMenuPlaneMetricsLogged) return;

  const findInner = (plane) => plane?.querySelector?.(".mm-plane__inner") || null;

  logMenuPlaneMetrics("mm_plane_left_mode", leftModePlane, findInner(leftModePlane));
  logMenuPlaneMetrics("mm_plane_right_mode", rightModePlane, findInner(rightModePlane));
  logMenuPlaneMetrics("mm_plane_left_rules", leftRulesPlane, findInner(leftRulesPlane));
  logMenuPlaneMetrics("mm_plane_right_rules", rightRulesPlane, findInner(rightRulesPlane));

  modeMenuDiv.dataset.mmMenuPlaneMetricsLogged = "true";
}

function setupMenuPressFeedback(buttons) {
  buttons.forEach((button) => {
    if (!button) return;
    const clearPressed = () => button.classList.remove("is-pressed");

    button.addEventListener("pointerdown", () => {
      button.classList.add("is-pressed");
    });
    button.addEventListener("pointerup", clearPressed);
    button.addEventListener("pointercancel", clearPressed);
    button.addEventListener("pointerleave", clearPressed);
    button.addEventListener("blur", clearPressed);
  });
}

setupMenuPressFeedback([
  hotSeatBtn,
  computerBtn,
  onlineBtn,
  playBtn,
  classicRulesBtn,
  advancedSettingsBtn
]);

let selectedMode = "hotSeat";
let selectedRuleset = "classic";
let lastModePlaneTarget = null;
let lastRulesPlaneTarget = null;
let lastModeSelectionButton = null;
let lastRulesSelectionButton = null;
let settingsLayerTimer = null;

const MENU_PLANE_TRAVEL_MS = 220;
const MENU_PLANE_FADE_MS = 180;
const MENU_SETTINGS_DELAY_MS = Math.max(MENU_PLANE_TRAVEL_MS, MENU_PLANE_FADE_MS);

let menuBackgroundSnapshot = null;
let hasActivatedGameScreen = false;
let needsGameScreenSync = false;
let menuScreenLocked = false;

function getGameCanvasMetrics() {
  const { RAW_DPR, CANVAS_DPR } = getCanvasDpr();
  const { cssW, cssH } = getCanvasDesignMetrics(gsBoardCanvas);
  return {
    css: `${Math.round(cssW)}x${Math.round(cssH)}`,
    backing: gsBoardCanvas ? `${gsBoardCanvas.width}x${gsBoardCanvas.height}` : "unknown",
    RAW_DPR,
    CANVAS_DPR,
    loopRunning: animationFrameId !== null
  };
}

function initGameRenderPipeline(reason = "activate") {
  renderInitState.firstFrameDrawn = false;
  renderInitState.lastDrawLogTime = 0;
  resizeCanvasFixedForGameBoard();
  applyViewTransform(aimCtx);
  applyViewTransform(planeCtx);
  const metrics = getGameCanvasMetrics();
  logRenderInit("GAME enter", { reason, ...metrics });
  logRenderInit("resize ok", metrics);
  requestAnimationFrame(() => {
    drawInitialFrame(reason);
    startMainLoopIfNotRunning(reason);
  });
}

function setLayerVisibility(layer, visible) {
  if (!layer) return;
  layer.hidden = !visible;
  layer.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function showSettingsLayer() {
  clearCargoAnimationDomEntries();
  if (menuScreenLocked) {
    console.warn('[screen] Settings visibility request ignored because gameplay is active.');
    return;
  }

  setLayerVisibility(menuScreen, false);
  setLayerVisibility(gsFrameLayer, false);
  setLayerVisibility(settingsLayer, true);
  setScreenMode('SETTINGS');
  window.paperWingsSettings?.onShow?.();
}

function showMenuLayer() {
  clearCargoAnimationDomEntries();
  if (menuScreenLocked) {
    console.warn('[screen] Menu visibility request ignored because gameplay is active.');
    return;
  }

  document.body.classList.add('menu-ready');
  setLayerVisibility(settingsLayer, false);
  window.paperWingsSettings?.onHide?.();
  setLayerVisibility(gsFrameLayer, false);
  setLayerVisibility(menuScreen, true);
  setScreenMode('MENU');
}

function activateGameScreen() {
  logBootStep("activateGameScreen");
  const body = document.body;
  const wasMenu = body.classList.contains('screen--menu');
  if (wasMenu) {
    console.warn('[screen] Gameplay started while menu was active; forcing game screen.');
  }

  body.classList.remove('menu-ready');
  setScreenMode('GAME');
  menuScreenLocked = true;

  setLayerVisibility(menuScreen, false);
  setLayerVisibility(settingsLayer, false);
  window.paperWingsSettings?.onHide?.();
  setLayerVisibility(gsFrameLayer, true);
  if (gameScreen instanceof HTMLElement) {
    gameScreen.removeAttribute('aria-hidden');
  }

  if (!hasActivatedGameScreen || wasMenu) {
    needsGameScreenSync = true;
  }

  initGameRenderPipeline("activateGameScreen");
}

function setMenuVisibility(visible) {
  if (visible && menuScreenLocked) {
    console.warn('[screen] Menu visibility request ignored because gameplay is active.');
    return;
  }

  if (visible) {
    showMenuLayer();
  } else {
    setLayerVisibility(menuScreen, false);
    setLayerVisibility(settingsLayer, false);
    window.paperWingsSettings?.onHide?.();
    setScreenMode('GAME');
  }
}

function hideGameBackgroundForMenu() {
  if (!menuBackgroundSnapshot) {
    menuBackgroundSnapshot = {
      container: gameBackgroundEl?.style?.backgroundImage
    };
  }

  if (gameBackgroundEl) {
    gameBackgroundEl.style.backgroundImage = 'none';
  }
}

function restoreGameBackgroundAfterMenu() {
  if (!menuBackgroundSnapshot) return;

  if (gameBackgroundEl) {
    gameBackgroundEl.style.backgroundImage = menuBackgroundSnapshot.container;
  }

  menuBackgroundSnapshot = null;
}

if(typeof window !== 'undefined'){
  window.paperWingsHarness = window.paperWingsHarness || {};
  window.paperWingsApp = window.paperWingsApp || {};
  window.paperWingsApp.showMenuLayer = showMenuLayer;
  window.paperWingsApp.showSettingsLayer = showSettingsLayer;
}

if(IS_TEST_HARNESS){
  const HARNESS_ADVANCED_HASH = '#advanced-settings';
  const harnessModeMenu = document.getElementById('modeMenu');
  const harnessModeMenuMain = document.getElementById('modeMenuMain');
  const harnessModeMenuAdvanced = document.getElementById('modeMenuAdvanced');
  const harnessGameContainer = document.getElementById('gameContainer');
  const harnessOverlay = document.getElementById('harnessInspectorOverlay');

  const harnessState = {
    advancedVisible: !harnessModeMenuAdvanced?.hidden,
    overlayDefaultParent: harnessOverlay?.parentElement || harnessGameContainer || null
  };

  function setHarnessSectionVisibility(section, visible){
    if(!section) return;
    section.hidden = !visible;
    section.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function moveHarnessOverlay(target){
    if(!harnessOverlay || !target) return;
    if(harnessOverlay.parentElement !== target){
      target.appendChild(harnessOverlay);
    }
  }

  function updateHarnessAdvancedVisibility(visible, options = {}){
    const { updateHash = true, fromHashChange = false } = options;
    const nextVisible = !!visible;
    harnessState.advancedVisible = nextVisible;

    setHarnessSectionVisibility(harnessModeMenuMain, !nextVisible);
    setHarnessSectionVisibility(harnessModeMenuAdvanced, nextVisible);

    document.body.classList.toggle('harness-advanced-open', nextVisible);

    if(nextVisible){
      try {
        loadSettings();
      } catch(err){
        console.warn('[Harness] Unable to sync advanced settings.', err);
      }
      selectedRuleset = "advanced";
      syncRulesButtonSkins(selectedRuleset);
    }

    const overlayTarget = nextVisible
      ? (harnessModeMenuAdvanced || harnessModeMenu || harnessGameContainer)
      : (harnessState.overlayDefaultParent || harnessGameContainer || harnessModeMenu);
    if(overlayTarget){
      moveHarnessOverlay(overlayTarget);
    }

    if(updateHash && !fromHashChange && typeof window.history?.pushState === 'function'){
      const base = `${window.location.pathname}${window.location.search}`;
      const targetHash = nextVisible ? HARNESS_ADVANCED_HASH : '';
      const currentHash = window.location.hash || '';
      if(currentHash !== targetHash){
        const newUrl = targetHash ? `${base}${targetHash}` : base;
        window.history.pushState(null, '', newUrl);
      }
    }

    window.dispatchEvent(new CustomEvent('paperWingsHarnessViewChange', {
      detail: { advanced: nextVisible }
    }));
  }

  function applyHarnessHashState(){
    const shouldShow = window.location.hash === HARNESS_ADVANCED_HASH;
    updateHarnessAdvancedVisibility(shouldShow, { updateHash: false, fromHashChange: true });
  }

  window.addEventListener('hashchange', applyHarnessHashState);

  window.paperWingsHarness.showAdvancedSettings = function(options = {}){
    const { updateHash = true, focus = null } = options;
    updateHarnessAdvancedVisibility(true, { updateHash });
    if(focus === 'firstControl'){
      harnessModeMenuAdvanced?.querySelector?.('button, select, input')?.focus?.();
    }
  };

  window.paperWingsHarness.showMainView = function(options = {}){
    const { updateHash = true, focus = null } = options;
    updateHarnessAdvancedVisibility(false, { updateHash });
    if(focus === 'advancedButton'){
      advancedSettingsBtn?.focus?.();
    } else if(focus === 'classicButton'){
      classicRulesBtn?.focus?.();
    }
  };

  window.paperWingsHarness.isAdvancedVisible = function(){
    return !!harnessState.advancedVisible;
  };

  applyHarnessHashState();
}

const endGameDiv  = document.getElementById("endGameButtons");
const yesBtn      = document.getElementById("yesButton");
const noBtn       = document.getElementById("noButton");

// Images for planes (static PNG sprites)
const PLANE_ASSET_PATHS = {
  blue: "ui_gamescreen/PLANES/gs_plane_blue.png",
  green: "ui_gamescreen/PLANES/gs_plane_green.png",
  blueCounter: "ui_gamescreen/gamescreen_outside/planecounter_blue.png",
  greenCounter: "ui_gamescreen/gamescreen_outside/planecounter_ green.png"
};

let bluePlaneImg = null;
let greenPlaneImg = null;
let blueCounterPlaneImg = null;
let greenCounterPlaneImg = null;

const explosionImagesByColor = {
  blue: [],
  green: []
};

let explosionSpritesPreloaded = false;

let planeSpritesPreloaded = false;
function preloadPlaneSprites() {
  if (planeSpritesPreloaded) {
    return;
  }
  bluePlaneImg = loadImageAsset(PLANE_ASSET_PATHS.blue, MENU_PRELOAD_LABEL).img;
  greenPlaneImg = loadImageAsset(PLANE_ASSET_PATHS.green, MENU_PRELOAD_LABEL).img;
  blueCounterPlaneImg = loadImageAsset(PLANE_ASSET_PATHS.blueCounter, GAME_PRELOAD_LABEL).img;
  greenCounterPlaneImg = loadImageAsset(PLANE_ASSET_PATHS.greenCounter, GAME_PRELOAD_LABEL).img;

  planeSpritesPreloaded = true;
}

function preloadExplosionSprites() {
  if (explosionSpritesPreloaded) {
    return;
  }

  const registerExplosionSprite = (src, color) => {
    if (typeof src !== "string") return;
    const trimmed = src.trim();
    if (!trimmed) return;

    const img = loadImageAsset(trimmed, GAME_PRELOAD_LABEL, { decoding: 'async' }).img;
    explosionImagesByColor[color]?.push(img);
  };

  EXPLOSION_BLUE_SPRITES.forEach(src => registerExplosionSprite(src, "blue"));
  EXPLOSION_GREEN_SPRITES.forEach(src => registerExplosionSprite(src, "green"));

  explosionSpritesPreloaded = true;
}
const flameImages = new Map();
for (const src of BURNING_FLAME_SRCS) {
  const img = loadImageAsset(src, GAME_PRELOAD_LABEL, { decoding: 'async' }).img;
  flameImages.set(src, img);
}
const defaultFlameImg = flameImages.get(DEFAULT_BURNING_FLAME_SRC) || null;

const flagSprites = {
  blue: loadImageAsset(FLAG_SPRITE_PATHS.blue, GAME_PRELOAD_LABEL, { decoding: 'async' }).img,
  green: loadImageAsset(FLAG_SPRITE_PATHS.green, GAME_PRELOAD_LABEL, { decoding: 'async' }).img,
};

const baseSprites = {
  blue: loadImageAsset(BASE_SPRITE_PATHS.blue, GAME_PRELOAD_LABEL, { decoding: 'async' }).img,
  green: loadImageAsset(BASE_SPRITE_PATHS.green, GAME_PRELOAD_LABEL, { decoding: 'async' }).img,
};

const CARGO_SPRITE_PATH = "ui_gamescreen/gs_cargo_box.png";
// Light GIF is the base version because it plays back more consistently across devices.
const CARGO_ANIMATION_GIF_PATH = "ui_gamescreen/gs_cargo_animation_light.gif";
const CARGO_ANIM_MS_FALLBACK = 1500;
const CARGO_ANIM_LOOP_GUARD_MS = 120;
const CARGO_FADE_IN_MS_DEFAULT = 0;
const CARGO_DIMMING_DEFAULT = 0;
const { img: cargoSprite } = loadImageAsset(CARGO_SPRITE_PATH, GAME_PRELOAD_LABEL, { decoding: 'async' });
let cargoAnimationGifPath = CARGO_ANIMATION_GIF_PATH;
let cargoAnimationGif = loadImageAsset(cargoAnimationGifPath, GAME_PRELOAD_LABEL, { decoding: 'async' }).img;
let cargoAnimDurationMs = CARGO_ANIM_MS_FALLBACK;
let cargoAnimDurationOverrideMs = null;
let cargoFadeInMs = CARGO_FADE_IN_MS_DEFAULT;
let cargoGifDimming = CARGO_DIMMING_DEFAULT;

async function loadCargoAnimDurationMs(gifPath = cargoAnimationGifPath){
  if(typeof window === "undefined" || typeof fetch !== "function" || typeof ImageDecoder !== "function"){
    return CARGO_ANIM_MS_FALLBACK;
  }
  if(typeof gifPath !== "string" || gifPath.trim().length === 0){
    return CARGO_ANIM_MS_FALLBACK;
  }
  const safeGifPath = gifPath.trim();
  try {
    const response = await fetch(safeGifPath, { cache: "force-cache" });
    if(!response.ok){
      return CARGO_ANIM_MS_FALLBACK;
    }
    const data = await response.arrayBuffer();
    const decoder = new ImageDecoder({ data, type: "image/gif" });
    await decoder.tracks.ready;
    const frameCount = decoder.tracks.selectedTrack?.frameCount;
    if(!Number.isFinite(frameCount) || frameCount <= 0){
      decoder.close();
      return CARGO_ANIM_MS_FALLBACK;
    }

    let totalDurationMs = 0;
    for(let frameIndex = 0; frameIndex < frameCount; frameIndex++){
      const { image } = await decoder.decode({ frameIndex });
      const frameDurationMs = Number.isFinite(image.duration) ? image.duration / 1000 : 0;
      totalDurationMs += frameDurationMs;
      image.close();
    }
    decoder.close();
    return totalDurationMs > 0 ? totalDurationMs : CARGO_ANIM_MS_FALLBACK;
  } catch (_error) {
    return CARGO_ANIM_MS_FALLBACK;
  }
}

function resolveCargoAnimLifetimeMs(){
  if(Number.isFinite(cargoAnimDurationOverrideMs)){
    return Math.max(0, cargoAnimDurationOverrideMs);
  }
  if(Number.isFinite(cargoAnimDurationMs)){
    return Math.max(0, cargoAnimDurationMs);
  }
  return CARGO_ANIM_MS_FALLBACK;
}

function clampCargoDimming(value){
  if(!Number.isFinite(value)) return CARGO_DIMMING_DEFAULT;
  return Math.max(0, Math.min(1, value));
}

function applyCargoGifPath(nextPath){
  if(typeof nextPath !== "string") return false;
  const safePath = nextPath.trim();
  if(!safePath) return false;
  cargoAnimationGifPath = safePath;
  cargoAnimationGif = loadImageAsset(cargoAnimationGifPath, GAME_PRELOAD_LABEL, { decoding: 'async' }).img;
  loadCargoAnimDurationMs(cargoAnimationGifPath).then(durationMs => {
    if(cargoAnimationGifPath !== safePath) return;
    cargoAnimDurationMs = durationMs;
  });

  for(const cargo of cargoState){
    if(cargo.state === "animating"){
      cargo.gifSrc = cargoAnimationGifPath;
      cargo.animDurationMs = resolveCargoAnimLifetimeMs();
      if(cargo.domEntry?.img){
        cargo.domEntry.img.src = cargo.gifSrc;
      }
    }
  }
  return true;
}

function setCargoAnimLifetimeOverrideMs(ms){
  if(ms === null || ms === undefined){
    cargoAnimDurationOverrideMs = null;
    return true;
  }
  if(!Number.isFinite(ms)) return false;
  cargoAnimDurationOverrideMs = Math.max(0, Math.round(ms));
  for(const cargo of cargoState){
    if(cargo.state === "animating"){
      cargo.animDurationMs = resolveCargoAnimLifetimeMs();
    }
  }
  return true;
}

function ensureCargoDebugApi(){
  if(typeof window === "undefined") return;
  window.CARGO_DEBUG = {
    getConfig(){
      return {
        gifPath: cargoAnimationGifPath,
        detectedLifetimeMs: cargoAnimDurationMs,
        lifetimeOverrideMs: cargoAnimDurationOverrideMs,
        activeLifetimeMs: resolveCargoAnimLifetimeMs(),
        fadeInMs: cargoFadeInMs,
        dimming: cargoGifDimming,
      };
    },
    setFadeIn(ms = 0){
      if(!Number.isFinite(ms)) return false;
      cargoFadeInMs = Math.max(0, Math.round(ms));
      return true;
    },
    setDimming(value = 0){
      if(!Number.isFinite(value)) return false;
      cargoGifDimming = clampCargoDimming(value);
      return true;
    },
    setLifetime(ms){
      return setCargoAnimLifetimeOverrideMs(ms);
    },
    clearLifetimeOverride(){
      return setCargoAnimLifetimeOverrideMs(null);
    },
    async setGif(path){
      if(!applyCargoGifPath(path)) return false;
      return true;
    },
    reset(){
      cargoFadeInMs = CARGO_FADE_IN_MS_DEFAULT;
      cargoGifDimming = CARGO_DIMMING_DEFAULT;
      setCargoAnimLifetimeOverrideMs(null);
      applyCargoGifPath(CARGO_ANIMATION_GIF_PATH);
      return true;
    }
  };
}

ensureCargoDebugApi();
loadCargoAnimDurationMs(cargoAnimationGifPath).then(durationMs => {
  cargoAnimDurationMs = durationMs;
});

function isSpriteReady(img) {
  return Boolean(
    img &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.naturalHeight > 0
  );
}
const { img: backgroundImg } = loadImageAsset("background paper 1.png", GAME_PRELOAD_LABEL);
backgroundImg?.addEventListener("load", () => {
  console.log("[IMG] load", { label: "backgroundImg", url: backgroundImg.src });
});
backgroundImg?.addEventListener("error", (event) => {
  console.warn("[IMG] error", { label: "backgroundImg", url: backgroundImg.src, event });
});
if (isSpriteReady(backgroundImg)) {
  console.log("[IMG] load", { label: "backgroundImg", url: backgroundImg?.src });
}

let currentBackgroundLayerCount = 2;

function duplicateBackgroundValue(value) {
  const layerCount = Math.max(1, currentBackgroundLayerCount);
  return Array.from({ length: layerCount }, () => value).join(', ');
}

function syncBackgroundLayout(containerWidth, containerHeight, containerLeft = null, containerTop = null) {
  if (!Number.isFinite(containerWidth) || !Number.isFinite(containerHeight) ||
      containerWidth <= 0 || containerHeight <= 0) {
    return;
  }

  const sizeValue = `${containerWidth}px ${containerHeight}px`;
  const repeatedSize = duplicateBackgroundValue(sizeValue);
  const computedSize = gameBackgroundEl ? window.getComputedStyle(gameBackgroundEl).backgroundSize : '';
  const usesPercentSizing = computedSize
    ? computedSize.split(',').every(layer => layer.includes('%'))
    : false;
  if (gameBackgroundEl && !usesPercentSizing) {
    gameBackgroundEl.style.backgroundSize = repeatedSize;
  }

  const containerPosition = duplicateBackgroundValue('center top');
  if (gameBackgroundEl) {
    gameBackgroundEl.style.backgroundPosition = containerPosition;
  }
}

function normalizeBackgroundLayer(layer) {
  if (typeof layer !== 'string') {
    return null;
  }
  const trimmed = layer.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('url(')) {
    return trimmed;
  }
  const escaped = trimmed.replace(/"/g, '\"');
  return 'url("' + escaped + '")';
}

function setBackgroundImage(...imageLayers) {
  const layers = Array.isArray(imageLayers[0]) && imageLayers.length === 1
    ? imageLayers[0]
    : imageLayers;

  const normalizedLayers = layers
    .map(normalizeBackgroundLayer)
    .filter(layer => typeof layer === 'string' && layer.length > 0);

  if (!normalizedLayers.length) {
    currentBackgroundLayerCount = 0;
    if (gameBackgroundEl) {
      gameBackgroundEl.style.backgroundImage = 'none';
    }
    return;
  }

  currentBackgroundLayerCount = normalizedLayers.length;
  const backgroundValue = normalizedLayers.join(', ');
  if (gameBackgroundEl) {
    gameBackgroundEl.style.backgroundImage = backgroundValue;
  }

  syncBackgroundLayout(FRAME_BASE_WIDTH, FRAME_BASE_HEIGHT);

  debugLogLayerStack();
}
const CANVAS_BASE_WIDTH = 360;
const CANVAS_BASE_HEIGHT = 640;
const FRAME_PADDING_X = 50;
const FRAME_PADDING_Y = 80;
const CANVAS_OFFSET_X = 51;
const DEFAULT_FRAME_BASE_WIDTH = CANVAS_BASE_WIDTH + FRAME_PADDING_X * 2;
const DEFAULT_FRAME_BASE_HEIGHT = CANVAS_BASE_HEIGHT + FRAME_PADDING_Y * 2;

function getDesignSizeVar(varName, fallbackValue) {
  if (typeof window === "undefined") {
    return fallbackValue;
  }
  const rootStyles = window.getComputedStyle(document.documentElement);
  const rawValue = rootStyles.getPropertyValue(varName);
  const parsedValue = parseFloat(rawValue);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallbackValue;
}

const FRAME_BASE_WIDTH = getDesignSizeVar("--design-w", DEFAULT_FRAME_BASE_WIDTH);
const FRAME_BASE_HEIGHT = getDesignSizeVar("--design-h", DEFAULT_FRAME_BASE_HEIGHT);
const MAP_BRICK_THICKNESS = 20; // px, matches brick_1_default short side
const MAP_DIAGONAL_BRICK_SIZE = MAP_BRICK_THICKNESS * 3;
const FIELD_BORDER_THICKNESS = MAP_BRICK_THICKNESS; // px, width of brick frame edges

function getFieldLeftCssValue() {
  const computed = (FRAME_BASE_WIDTH - WORLD.width) / 2;
  return Number.isFinite(computed) ? computed : FRAME_PADDING_X;
}

function getFieldTopCssValue() {
  const computed = (FRAME_BASE_HEIGHT - WORLD.height) / 2;
  return Number.isFinite(computed) ? computed : FRAME_PADDING_Y;
}


let brickFrameImg = null;
let brickFrameData = null;
const MAP_SPRITE_ASSETS = {
  brick_1_default: null,
  brick_4_diagonal: null
};

function handleBrickFrameLoad() {
  if (!brickFrameImg) return;
  console.log("[IMG] load", { label: "brickFrameImg", url: brickFrameImg.src });
}

function handleBrickFrameError(event) {
  if (!brickFrameImg) return;
  console.warn("[IMG] error", { label: "brickFrameImg", url: brickFrameImg.src, event });
}

function setBrickFrameImage(img) {
  if (!img || brickFrameImg === img) return;
  brickFrameImg = img;
  brickFrameImg.addEventListener("load", handleBrickFrameLoad);
  brickFrameImg.addEventListener("error", handleBrickFrameError);
  brickFrameImg.addEventListener("load", processBrickFrameImage);
  if (isSpriteReady(brickFrameImg)) {
    handleBrickFrameLoad();
    processBrickFrameImage();
  }
}

function clearBrickFrameImage(){
  brickFrameImg = null;
  brickFrameData = null;
  brickFrameBorderPxX = FIELD_BORDER_THICKNESS;
  brickFrameBorderPxY = FIELD_BORDER_THICKNESS;
}

let FIELD_LEFT = 0;
let FIELD_TOP = 0;
let FIELD_WIDTH = 0;
let FIELD_HEIGHT = 0;

function getFrameScaleFromLayout() {
  return {
    scaleX: 1,
    scaleY: 1
  };
}

function getFieldOffsetsInCanvasSpace(canvas, fallbackScaleX = 1, fallbackScaleY = 1) {
  const boardRect = getBoardCssRect();
  const cssOffsetX = boardRect.left;
  const cssOffsetY = boardRect.top;

  if (!(canvas instanceof HTMLCanvasElement)) {
    return {
      x: cssOffsetX * fallbackScaleX,
      y: cssOffsetY * fallbackScaleY
    };
  }

  const { cssW, cssH } = getCanvasDesignMetrics(canvas);
  const canvasScaleX = cssW > 0 ? canvas.width / cssW : fallbackScaleX;
  const canvasScaleY = cssH > 0 ? canvas.height / cssH : fallbackScaleY;

  return {
    x: cssOffsetX * canvasScaleX,
    y: cssOffsetY * canvasScaleY
  };
}

// Sprite used for the aiming arrow
const { img: arrowSprite } = loadImageAsset("sprite_ copy.png", GAME_PRELOAD_LABEL);
const { img: crosshairIconSprite } = loadImageAsset(
  "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_crosshair.png",
  GAME_PRELOAD_LABEL
);
const { img: fuelIconSprite } = loadImageAsset(
  "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_fuel_barrel.png",
  GAME_PRELOAD_LABEL
);
const { img: mineIconSprite } = loadImageAsset(
  "ui_gamescreen/gamescreen_outside/gs_icon_prototypes/gs_cargoicon_mine.png",
  GAME_PRELOAD_LABEL
);
arrowSprite?.addEventListener("load", () => {
  console.log("[IMG] load", { label: "arrowSprite", url: arrowSprite.src });
});
arrowSprite?.addEventListener("error", (event) => {
  console.warn("[IMG] error", { label: "arrowSprite", url: arrowSprite.src, event });
});



// Coordinates of arrow parts inside the sprite sheet
const ARROW_Y = 358;   // vertical offset of arrow graphic
const PART_H  = 254;   // height of arrow graphic

// Horizontal slices for head, shaft, and tail within the sprite
// Include the very first column so the arrow tip is visible
const HEAD_X  = 34;
const HEAD_W  = 364;
const SHAFT_X = 422;
const SHAFT_W = 576;
const TAIL_X  = 1034;
const TAIL_W  = 336;


// Scale factor so the arrow is about half the plane's size
const ARROW_SCALE = 0.08;
const ARROW_DEST_H = PART_H * ARROW_SCALE;
const TAIL_DEST_W  = TAIL_W * ARROW_SCALE;
const HEAD_DEST_W  = HEAD_W * ARROW_SCALE;

const PLAYER_COLORS = {
  green: '#7f8e40',
  blue: '#013c83'
};

function colorFor(color){
  return PLAYER_COLORS[color] || color;
}

function colorWithAlpha(color, alpha){
  const hex = colorFor(color).slice(1);
  const r = parseInt(hex.slice(0,2),16);
  const g = parseInt(hex.slice(2,4),16);
  const b = parseInt(hex.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

let brickFrameBorderPxX = FIELD_BORDER_THICKNESS;
  let brickFrameBorderPxY = FIELD_BORDER_THICKNESS;
function processBrickFrameImage() {
  if (!brickFrameImg) return;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = brickFrameImg.naturalWidth;
  tempCanvas.height = brickFrameImg.naturalHeight;
  logCanvasCreation(tempCanvas, 'brickFrame');
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.drawImage(brickFrameImg, 0, 0);

  brickFrameData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const { data, width, height } = brickFrameData;

  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];

  // locate outer bounds of the brick frame
  let topBound = 0;
  while (topBound < height && !Array.from({ length: width }, (_, x) => alphaAt(x, topBound)).some(a => a > 0)) {
    topBound++;
  }

  let leftBound = 0;
  while (leftBound < width && !Array.from({ length: height }, (_, y) => alphaAt(leftBound, y)).some(a => a > 0)) {
    leftBound++;
  }

  // Determine typical thickness of top/bottom walls and left/right walls
  // by sampling every row/column and using the median run of brick pixels.
  const verticalRuns = [];
  for (let x = leftBound; x < width; x++) {
    let y = topBound;
    while (y < height && alphaAt(x, y) > 0) y++;
    const run = y - topBound;
    if (run > 0) verticalRuns.push(run);
  }
  verticalRuns.sort((a, b) => a - b);
  brickFrameBorderPxY = verticalRuns.length
    ? verticalRuns[Math.floor(verticalRuns.length / 2)]
    : FIELD_BORDER_THICKNESS;

  const horizontalRuns = [];
  for (let y = topBound; y < height; y++) {
    let x = leftBound;
    while (x < width && alphaAt(x, y) > 0) x++;
    const run = x - leftBound;
    if (run > 0) horizontalRuns.push(run);
  }
  horizontalRuns.sort((a, b) => a - b);
  brickFrameBorderPxX = horizontalRuns.length
    ? horizontalRuns[Math.floor(horizontalRuns.length / 2)]
    : FIELD_BORDER_THICKNESS;


  updateFieldDimensions();
  if(points.length) initPoints();
}



/* Disable pinch and double-tap zoom on mobile */
document.addEventListener('touchmove', (event) => {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false });

document.addEventListener('dblclick', (e) => {
  e.preventDefault();
});

/* ======= CONFIG ======= */
const PLANE_DRAW_W         = 36;
const PLANE_DRAW_H         = 36;
const PLANE_METRIC_SCALE   = PLANE_DRAW_W / 40;
function planeMetric(value) {
  return value * PLANE_METRIC_SCALE;
}
// VFX anchor points (scaled with planeMetric)
const PLANE_VFX_JET_ANCHOR_Y = planeMetric(24);
const PLANE_VFX_JET_ANCHOR_NUDGE_Y = -planeMetric(5);
const PLANE_VFX_JET_BASE_SCALE_X = 2.5;
const PLANE_VFX_JET_BASE_SCALE_Y = 1.6;
const PLANE_VFX_JET_IDLE_FLICKER_BASE = 0.8;
const PLANE_VFX_JET_IDLE_FLICKER_AMPLITUDE = 0.1;
const PLANE_VFX_BLUE_JET_WIDTH_MULTIPLIER = 0.8;
const PLANE_VFX_BLUE_JET_LENGTH_MULTIPLIER = 1.2;
const PLANE_VFX_SMOKE_ANCHOR_Y = planeMetric(26);
const PLANE_VFX_IDLE_SMOKE_DELTA_Y = planeMetric(5);
const PLANE_VFX_IDLE_SMOKE_TAIL_TRIM_Y = planeMetric(5);
const MINI_PLANE_ICON_SCALE = 0.7;    // make HUD plane icons smaller on the counter
const HUD_PLANE_DIM_ALPHA = 1;        // keep HUD planes at full opacity
const HUD_PLANE_DIM_FILTER = "";     // no additional dimming filter for HUD planes
const HUD_KILL_MARKER_COLOR = "#e42727";
const HUD_KILL_MARKER_ALPHA = 0.85;
const HUD_KILL_MARKER_LINE_WIDTH = planeMetric(4);
const HUD_PLANE_DEATH_DURATION_MS = 160;
const HUD_PLANE_DEATH_SCALE_DELTA = 0.15;
const HUD_BASE_PLANE_ICON_SIZE = planeMetric(16);
const CELL_SIZE            = 20;     // px
const MINE_ICON_WIDTH      = 30;
const MINE_ICON_HEIGHT     = 31;
const POINT_RADIUS         = planeMetric(15);     // px (увеличено для мобильных)
const CARGO_PICKUP_RADIUS_MULTIPLIER = 2.2;
const CARGO_RADIUS         = POINT_RADIUS * CARGO_PICKUP_RADIUS_MULTIPLIER;    // увеличенный радиус ящика
const CARGO_SPAWN_SAFE_RADIUS = CARGO_RADIUS + POINT_RADIUS;
const CARGO_FALLBACK_SIZE_PX = 24;
const CARGO_GIF_OFFSET_X   = -34;
const CARGO_GIF_OFFSET_Y   = -137;
const FLAG_INTERACTION_RADIUS = 25;  // px
const BASE_INTERACTION_RADIUS = 40;  // px
const SLIDE_THRESHOLD      = 0.1;
// Larger hit area for selecting planes with touch/mouse
const PLANE_TOUCH_RADIUS   = 20;                   // px
const AA_HIT_RADIUS        = POINT_RADIUS + 5; // slightly larger zone to hit Anti-Aircraft center
const MINE_TRIGGER_RADIUS  = POINT_RADIUS;
const BOUNCE_FRAMES        = 68;
// Duration of a full-speed flight on the field (measured in frames)
// (Restored to the original pre-change speed used for gameplay physics)
// Shortened by 1.5x to speed up on-field flight animation
const FIELD_FLIGHT_DURATION_SEC = (BOUNCE_FRAMES / 60) * 2 / 1.5;
const FIELD_PLANE_SWAY_DEG = 0.75;
const FIELD_PLANE_SWAY_PERIOD_SEC = 2.6 / 1.5;
const FIELD_PLANE_ROLL_BOB_PX = 0.75;
// Tuned for a readable mine idle animation: 3.2° gives visible sway without looking cartoony,
// and 0.075 keeps the motion smooth after amplitude increase.
const FIELD_MINE_SWAY_DEG = 3.2;
const FIELD_MINE_SWAY_OMEGA = 0.075;
const FIELD_MINE_BOB_PX = 1.4;
const MAX_DRAG_DISTANCE    = 100;    // px
const DRAG_ROTATION_THRESHOLD = 5;   // px slack before the plane starts to turn
const ATTACK_RANGE_PX      = 300;    // px
let FIELD_BORDER_OFFSET_X = FIELD_BORDER_THICKNESS; // внутренняя граница для отражения по горизонтали
let FIELD_BORDER_OFFSET_Y = FIELD_BORDER_THICKNESS; // и по вертикали
// Используем бесконечное количество сегментов,
// чтобы следы самолётов сохранялись до конца раунда.
const MAX_TRAIL_SEGMENTS   = Infinity;
const BUILDING_BUFFER      = CELL_SIZE / 2;
const MAX_BUILDINGS_GLOBAL = 100;
const PLANES_PER_SIDE      = 4;      // количество самолётов у каждой команды
const MIDDLE_GAP_EXTRA_PX  = 10;     // доп. расстояние между средними самолётами
const EDGE_PLANE_PADDING_PX = 8;     // смещение крайних самолётов наружу
const FLAG_POLE_HEIGHT     = 20;     // высота флагштока
const FLAG_WIDTH           = 12;     // ширина полотна флага
const FLAG_HEIGHT          = 8;      // высота полотна флага
const START_PLANES = {
  // координаты задаются как верхний левый угол, внутри переводятся в центр
  blue: [
    { x: 44, y: 30 },
    { x: 103, y: 30 },
    { x: 221, y: 30 },
    { x: 280, y: 30 },
  ],
  green: [
    { x: 44, y: 574 },
    { x: 103, y: 574 },
    { x: 221, y: 574 },
    { x: 280, y: 574 },
  ],
};

function getStartPlaneWorldPositions(){
  const originX = FIELD_LEFT;
  const originY = FIELD_TOP;
  const margin = PLANE_DRAW_H / 2 + 1;
  const minY = FIELD_TOP + margin;
  const maxY = FIELD_TOP + FIELD_HEIGHT - margin;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const toWorld = (entry, color) => {
    const centerX = originX + entry.x + PLANE_DRAW_W / 2;
    const centerY = originY + entry.y + PLANE_DRAW_H / 2;
    const clampedCenterY = clamp(centerY, minY, maxY);
    if (DEBUG_START_POSITIONS && color === 'green') {
      console.log("[start-positions] green y clamp", {
        centerY,
        clampedCenterY,
        minY,
        maxY
      });
    }
    return { x: centerX, y: clampedCenterY };
  };

  const blue = START_PLANES.blue.map((entry) => toWorld(entry, 'blue'));
  const green = START_PLANES.green.map((entry) => toWorld(entry, 'green'));
  const startPositions = { blue, green };
  logStartupWorldYOnce(startPositions);

  return startPositions;
}
const FLAG_LAYOUTS = {
  blue: { x: 170, y: 41, width: 20, height: 20 },
  green: { x: 170, y: 568, width: 20, height: 20 },
};
const BASE_LAYOUTS = {
  blue: { x: 165, y: 21, width: 30, height: 20 },
  green: { x: 165, y: 599, width: 30, height: 20 },
};

// Crash effect duration before showing cross (see CRASH_FX_DELAY_MS)

function updateFieldBorderOffset(){
  if(settings.sharpEdges){
    FIELD_BORDER_OFFSET_X = 0;
    FIELD_BORDER_OFFSET_Y = 0;
    return;
  }

  FIELD_BORDER_OFFSET_X = MAP_BRICK_THICKNESS;
  FIELD_BORDER_OFFSET_Y = MAP_BRICK_THICKNESS;
}

function parseCssSize(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getFieldCssMetrics() {
  if (typeof window === "undefined" || !gsFrameEl) {
    return null;
  }
  const fallbackLeft = getFieldLeftCssValue();
  const fallbackTop = getFieldTopCssValue();
  const style = window.getComputedStyle(gsFrameEl);
  return {
    left: parseCssSize(style.getPropertyValue("--field-left"), fallbackLeft),
    top: parseCssSize(style.getPropertyValue("--field-top"), fallbackTop),
    width: parseCssSize(style.getPropertyValue("--field-width"), CANVAS_BASE_WIDTH),
    height: parseCssSize(style.getPropertyValue("--field-height"), CANVAS_BASE_HEIGHT)
  };
}

function getBoardCssRect() {
  const cssMetrics = getFieldCssMetrics();
  if (cssMetrics) {
    return {
      left: cssMetrics.left,
      top: cssMetrics.top,
      width: cssMetrics.width,
      height: cssMetrics.height
    };
  }

  return {
    left: getFieldLeftCssValue(),
    top: getFieldTopCssValue(),
    width: CANVAS_BASE_WIDTH,
    height: CANVAS_BASE_HEIGHT
  };
}

function isBrickPixel(x, y){
  if(!brickFrameData) return false;
  if(!FIELD_WIDTH || !FIELD_HEIGHT) return false;
  const imgX = Math.floor((x - FIELD_LEFT) / FIELD_WIDTH * brickFrameData.width);
  const imgY = Math.floor((y - FIELD_TOP) / FIELD_HEIGHT * brickFrameData.height);
  const { data, width, height } = brickFrameData;
  if(imgX < 0 || imgX >= width || imgY < 0 || imgY >= height) return false;

  // Mortar lines between bricks are transparent in the source image, which
  // caused reflections to treat the gaps as empty space. Expand the search a
  // little so these gaps count as solid wall. Use a diamond-shaped neighborhood
  // to avoid triggering collisions too early on diagonal walls.
  const RADIUS = 3; // px
  for(let dy = -RADIUS; dy <= RADIUS; dy++){
    const ny = imgY + dy;
    if(ny < 0 || ny >= height) continue;
    for(let dx = -RADIUS; dx <= RADIUS; dx++){
      const nx = imgX + dx;
      if(nx < 0 || nx >= width) continue;
      if(Math.abs(dx) + Math.abs(dy) > RADIUS) continue;
      if(data[(ny * width + nx) * 4 + 3] > 0) return true;
    }
  }
  return false;
}

function resetCargoState(){
  clearCargoAnimationDomEntries();
  cargoState.length = 0;
}

function removeCargoAnimationDomEntry(cargo) {
  if (cargo?.domEntry?.element?.remove) {
    cargo.domEntry.element.remove();
  }
  if (cargo?.domEntry) {
    delete cargo.domEntry;
  }
}

function clearCargoAnimationDomEntries() {
  for (const cargo of cargoState) {
    removeCargoAnimationDomEntry(cargo);
  }

  const host = document.getElementById(CARGO_HOST_ID);
  if (host instanceof HTMLElement) {
    host.querySelectorAll('.fx-cargo').forEach(node => node.remove());
  }
}

function getCargoOverlayScale(metrics) {
  const boardWidth = metrics?.boardRect?.width;
  const boardHeight = metrics?.boardRect?.height;
  const overlayWidth = metrics?.overlayRect?.width;
  const overlayHeight = metrics?.overlayRect?.height;
  return {
    scaleX: boardWidth > 0 && overlayWidth > 0 ? overlayWidth / boardWidth : 1,
    scaleY: boardHeight > 0 && overlayHeight > 0 ? overlayHeight / boardHeight : 1
  };
}

function createCargoAnimationDomEntry(cargo, metrics) {
  const host = metrics?.host || ensureCargoHost();
  if (!(host instanceof HTMLElement)) {
    return null;
  }

  const gifSrc = cargo?.gifSrc || cargoAnimationGif?.src || cargoAnimationGifPath || CARGO_ANIMATION_GIF_PATH;
  if (!gifSrc) {
    return null;
  }

  const container = document.createElement('div');
  container.classList.add('fx-cargo');
  Object.assign(container.style, {
    position: 'absolute',
    pointerEvents: 'none'
  });

  const image = new Image();
  image.decoding = 'async';
  image.className = 'fx-cargo-img';
  image.src = gifSrc;

  container.appendChild(image);
  host.appendChild(container);

  return { element: container, img: image, host };
}

function syncCargoAnimationDomEntry(cargo, metrics) {
  if (!cargo || cargo.state !== 'animating') {
    removeCargoAnimationDomEntry(cargo);
    return;
  }

  if (!cargo.domEntry) {
    cargo.domEntry = createCargoAnimationDomEntry(cargo, metrics);
  }

  if (!cargo.domEntry?.element) {
    return;
  }

  const offsetPoint = worldToOverlayLocal(
    cargo.x + CARGO_GIF_OFFSET_X,
    cargo.y + CARGO_GIF_OFFSET_Y,
    metrics
  );
  const { scaleX, scaleY } = getCargoOverlayScale(metrics);
  const naturalWidth = cargoAnimationGif?.naturalWidth || cargoAnimationGif?.width || 0;
  const naturalHeight = cargoAnimationGif?.naturalHeight || cargoAnimationGif?.height || 0;
  const width = Math.max(1, Math.round(Math.max(1, naturalWidth) * scaleX));
  const height = Math.max(1, Math.round(Math.max(1, naturalHeight) * scaleY));

  Object.assign(cargo.domEntry.element.style, {
    left: `${Math.round(offsetPoint.overlayX)}px`,
    top: `${Math.round(offsetPoint.overlayY)}px`,
    width: `${width}px`,
    height: `${height}px`
  });

  const elapsedMs = Math.max(0, performance.now() - (cargo.animStartedAt || 0));
  const fadeInProgress = cargoFadeInMs > 0
    ? Math.max(0, Math.min(1, elapsedMs / cargoFadeInMs))
    : 1;
  const brightness = Math.max(0, 1 - clampCargoDimming(cargoGifDimming));

  Object.assign(cargo.domEntry.img.style, {
    width: '100%',
    height: '100%',
    display: 'block',
    opacity: String(fadeInProgress),
    filter: `brightness(${brightness})`
  });
}

function syncCargoAnimationDomEntries() {
  if (cargoState.length === 0) {
    return;
  }

  const metrics = resolveCargoMetrics('cargo animation');
  if (!metrics) {
    for (const cargo of cargoState) {
      removeCargoAnimationDomEntry(cargo);
    }
    return;
  }

  for (const cargo of cargoState) {
    syncCargoAnimationDomEntry(cargo, metrics);
  }
}

function findCargoSpawnTarget(){
  if(!FIELD_WIDTH || !FIELD_HEIGHT){
    return null;
  }
  const minX = FIELD_LEFT + FIELD_WIDTH / 3;
  const maxX = FIELD_LEFT + 2 * FIELD_WIDTH / 3;
  const minY = FIELD_TOP + FIELD_HEIGHT / 3;
  const maxY = FIELD_TOP + 2 * FIELD_HEIGHT / 3;
  for(let attempt = 0; attempt < CARGO_MAX_SPAWN_ATTEMPTS; attempt++){
    const x = minX + Math.random() * (maxX - minX);
    const targetY = minY + Math.random() * (maxY - minY);
    if(isBrickPixel(x, targetY)) continue;
    const tooCloseToPlane = points.some(point => {
      if(!point?.isAlive || point?.burning) return false;
      const dx = point.x - x;
      const dy = point.y - targetY;
      return Math.hypot(dx, dy) < CARGO_SPAWN_SAFE_RADIUS;
    });
    if(tooCloseToPlane) continue;
    return { x, targetY };
  }
  return null;
}

function spawnCargoForTurn(){
  if(!settings.addCargo){
    return;
  }
  const candidate = findCargoSpawnTarget();
  if(!candidate){
    return;
  }
  const animStartedAt = performance.now();
  cargoState.push({
    x: candidate.x,
    y: candidate.targetY,
    state: "animating",
    animStartedAt,
    animDurationMs: resolveCargoAnimLifetimeMs(),
    gifSrc: cargoAnimationGifPath,
    pickedAt: null
  });
}

function getCargoSpriteSize(){
  const width = Number.isFinite(cargoSprite?.naturalWidth) && cargoSprite.naturalWidth > 0
    ? cargoSprite.naturalWidth
    : CARGO_FALLBACK_SIZE_PX;
  const height = Number.isFinite(cargoSprite?.naturalHeight) && cargoSprite.naturalHeight > 0
    ? cargoSprite.naturalHeight
    : CARGO_FALLBACK_SIZE_PX;
  return { width, height };
}

function getCargoVisualCenter(cargo){
  const { width, height } = getCargoSpriteSize();
  return {
    x: cargo.x + width / 2,
    y: cargo.y + height / 2
  };
}

function updateCargoState(now = performance.now()){
  if(cargoState.length === 0){
    return;
  }
  const remainingCargo = [];
  for(const cargo of cargoState){
    const animDurationMs = Number.isFinite(cargo.animDurationMs)
      ? cargo.animDurationMs
      : CARGO_ANIM_MS_FALLBACK;
    const safeAnimDurationMs = Math.max(0, animDurationMs - CARGO_ANIM_LOOP_GUARD_MS);
    if(cargo.state === "animating" && now - cargo.animStartedAt >= safeAnimDurationMs){
      cargo.state = "ready";
      removeCargoAnimationDomEntry(cargo);
    }
    if(cargo.state !== "ready"){
      remainingCargo.push(cargo);
      continue;
    }
    let pickedUp = false;
    for(const plane of points){
      if(!plane?.isAlive || plane?.burning) continue;
      const pickupCenter = getCargoVisualCenter(cargo);
      const dx = plane.x - pickupCenter.x;
      const dy = plane.y - pickupCenter.y;
      if(Math.hypot(dx, dy) < CARGO_RADIUS){
        cargo.pickedAt = now;
        const item = getRandomInventoryItem();
        addItemToInventory(plane.color, item);
        pickedUp = true;
        break;
      }
    }
    if(!pickedUp){
      remainingCargo.push(cargo);
    } else {
      removeCargoAnimationDomEntry(cargo);
    }
  }
  if(remainingCargo.length !== cargoState.length){
    cargoState.length = 0;
    cargoState.push(...remainingCargo);
  }
}

function drawCargo(ctx2d){
  if(cargoState.length === 0) return;
  const canDrawCargoBox = isSpriteReady(cargoSprite);

  for(const cargo of cargoState){
    if(cargo.state === "ready" && canDrawCargoBox){
      ctx2d.drawImage(cargoSprite, cargo.x, cargo.y);
    }
  }
}

  function updateFieldDimensions(){
    const cssMetrics = getFieldCssMetrics();
    const scaleX = CANVAS_BASE_WIDTH ? WORLD.width / CANVAS_BASE_WIDTH : 1;
    const scaleY = CANVAS_BASE_HEIGHT ? WORLD.height / CANVAS_BASE_HEIGHT : 1;
    const epsilon = 0.5;

    if (cssMetrics) {
      const baseLeft = getFieldLeftCssValue();
      const baseTop = getFieldTopCssValue();
      const left = (cssMetrics.left - baseLeft) * scaleX;
      const top = (cssMetrics.top - baseTop) * scaleY;
      const width = cssMetrics.width * scaleX;
      const height = cssMetrics.height * scaleY;

      FIELD_LEFT = Number.isFinite(left) ? left : 0;
      FIELD_TOP = Number.isFinite(top) ? top : 0;
      FIELD_WIDTH = Number.isFinite(width) ? width : WORLD.width;
      FIELD_HEIGHT = Number.isFinite(height) ? height : WORLD.height;
    } else {
      FIELD_LEFT = 0;
      FIELD_TOP = 0;
      FIELD_WIDTH = WORLD.width;
      FIELD_HEIGHT = WORLD.height;
    }

    if (Math.abs(FIELD_LEFT) <= epsilon && Math.abs(FIELD_WIDTH - WORLD.width) <= epsilon) {
      FIELD_LEFT = 0;
      FIELD_WIDTH = WORLD.width;
    }
    if (Math.abs(FIELD_TOP) <= epsilon && Math.abs(FIELD_HEIGHT - WORLD.height) <= epsilon) {
      FIELD_TOP = 0;
      FIELD_HEIGHT = WORLD.height;
    }

    updateFieldBorderOffset();
    rebuildCollisionSurfaces();
  }


const MIN_FLIGHT_RANGE_CELLS = 10;
const MAX_FLIGHT_RANGE_CELLS = 50;

const MIN_AMPLITUDE        = 0;
const MAX_AMPLITUDE        = 20;     // UI показывает как *5°
const AI_MAX_ANGLE_DEVIATION = 0.25; // ~14.3°


// Anti-Aircraft defaults and placement limits
const AA_DEFAULTS = {
  radius: 60, // detection radius, 3x smaller than original 180
  hp: 1,
  cooldownMs: 1000,
  rotationDegPerSec: 30, // slow radar sweep
  beamWidthDeg: 4, // width of sweeping beam
  dwellTimeMs: 0 // time beam must stay on target before firing
};
const AA_MIN_DIST_FROM_OPPONENT_BASE = 120;
const AA_MIN_DIST_FROM_EDGES = 40;
// Duration for how long the anti-aircraft radar sweep remains visible
// Quarter-circle afterglow so the sweep persists for 90° of rotation
const AA_TRAIL_MS = 5000; // radar sweep afterglow duration


/* ======= STATE ======= */



// shared settings in window.paperWingsSettings.settings

let isGameOver   = false;
let winnerColor  = null;
let roundEndedByNuke = false;
let awaitingFlightResolution = false;
let pendingRoundTransitionDelay = null;
let pendingRoundTransitionStart = 0;
let shouldShowEndScreen = false;
let suppressAutoRandomMapForNextRound = false;
let gameMode     = null;

let hasShotThisRound = false;

let globalFrame  = 0;
let lastFrameTime = 0;
let oscillationAngle = 0;
let oscillationDir = 1;
const oscillationSpeed = 0.01;

const turnColors = ["green","blue"];
let lastFirstTurn= Math.floor(Math.random()*2);
let turnIndex    = lastFirstTurn;

let points       = [];
Object.defineProperty(window, 'points', { get: () => points });
let flyingPoints = [];
let colliders    = [];
let colliderSurfaces = [];

let aaUnits     = [];
let mines       = [];
let aaPlacementPreview = null;
let aaPreviewTrail = [];

let aaPointerDown = false;

let phase = "MENU"; // MENU | AA_PLACEMENT (Anti-Aircraft placement) | ROUND_START | TURN | ROUND_END

const cargoState = [];

const CARGO_MAX_SPAWN_ATTEMPTS = 8;
let turnAdvanceCount = 0;

let currentPlacer = null; // 'green' | 'blue'

const MAP_BRICK_SPRITE_PATH = "ui_gamescreen/bricks/brick_1_default.png";
const MAP_SPRITE_PATHS = {
  brick_1_default: "ui_gamescreen/bricks/brick_1_default.png",
  brick_4_diagonal: "ui_gamescreen/bricks/brick4_diagonal copy.png"
};
const MAP_RENDER_MODES = {
  DATA: 'data'
};
const CLEAR_SKY_VERTICAL_Y = [20,60,100,140,180,220,260,300,340,380,420,460,500,540,580];
const CLEAR_SKY_HORIZONTAL_X = [0,40,80,120,160,200,240,280,320];
const CLEAR_SKY_BORDER_SPRITES = [
  ...CLEAR_SKY_VERTICAL_Y.map(y => ({ spriteName: "brick_1_default", x: 0, y, rotate: 0, scale: 1 })),
  ...CLEAR_SKY_VERTICAL_Y.map(y => ({ spriteName: "brick_1_default", x: 340, y, rotate: 0, scale: 1 })),
  ...CLEAR_SKY_HORIZONTAL_X.map(x => ({ spriteName: "brick_1_default", x, y: 0, rotate: -90, scale: -1 })),
  ...CLEAR_SKY_HORIZONTAL_X.map(x => ({ spriteName: "brick_1_default", x, y: 620, rotate: -90, scale: -1 })),
];

const BROKEN_X_SPRITES = [
  { id: "brick_v_left_1", spriteName: "brick_1_default", x: 0, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_left_2", spriteName: "brick_1_default", x: 0, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_left_3", spriteName: "brick_1_default", x: 0, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_left_4", spriteName: "brick_1_default", x: 0, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_left_5", spriteName: "brick_1_default", x: 0, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_left_6", spriteName: "brick_1_default", x: 0, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_left_7", spriteName: "brick_1_default", x: 0, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_left_8", spriteName: "brick_1_default", x: 0, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_left_9", spriteName: "brick_1_default", x: 0, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_left_10", spriteName: "brick_1_default", x: 0, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_left_11", spriteName: "brick_1_default", x: 0, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_left_12", spriteName: "brick_1_default", x: 0, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_left_13", spriteName: "brick_1_default", x: 0, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_left_14", spriteName: "brick_1_default", x: 0, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_left_15", spriteName: "brick_1_default", x: 0, y: 580, rotate: 0, scale: 1 },
  { id: "brick_v_right_1", spriteName: "brick_1_default", x: 340, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_right_2", spriteName: "brick_1_default", x: 340, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_right_3", spriteName: "brick_1_default", x: 340, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_right_4", spriteName: "brick_1_default", x: 340, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_right_5", spriteName: "brick_1_default", x: 340, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_right_6", spriteName: "brick_1_default", x: 340, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_right_7", spriteName: "brick_1_default", x: 340, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_right_8", spriteName: "brick_1_default", x: 340, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_right_9", spriteName: "brick_1_default", x: 340, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_right_10", spriteName: "brick_1_default", x: 340, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_right_11", spriteName: "brick_1_default", x: 340, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_right_12", spriteName: "brick_1_default", x: 340, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_right_13", spriteName: "brick_1_default", x: 340, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_right_14", spriteName: "brick_1_default", x: 340, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_right_15", spriteName: "brick_1_default", x: 340, y: 580, rotate: 0, scale: 1 },
  { id: "brick_h_top_01", spriteName: "brick_1_default", x: 0, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_02", spriteName: "brick_1_default", x: 40, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_03", spriteName: "brick_1_default", x: 80, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_04", spriteName: "brick_1_default", x: 120, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_05", spriteName: "brick_1_default", x: 160, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_06", spriteName: "brick_1_default", x: 200, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_07", spriteName: "brick_1_default", x: 240, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_08", spriteName: "brick_1_default", x: 280, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_09", spriteName: "brick_1_default", x: 320, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_01", spriteName: "brick_1_default", x: 0, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_02", spriteName: "brick_1_default", x: 40, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_03", spriteName: "brick_1_default", x: 80, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_04", spriteName: "brick_1_default", x: 120, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_05", spriteName: "brick_1_default", x: 160, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_06", spriteName: "brick_1_default", x: 200, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_07", spriteName: "brick_1_default", x: 240, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_08", spriteName: "brick_1_default", x: 280, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_09", spriteName: "brick_1_default", x: 320, y: 620, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 160, y: 120, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 60, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 260, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 60, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 260, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 160, y: 500, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 140, y: 280, rotate: 0, scale: 1 },
  { id: "brick1", spriteName: "brick_1_default", x: 200, y: 320, rotate: 0, scale: 1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 100, y: 220, rotate: 0, scale: 1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 200, y: 360, rotate: 0, scale: 1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 200, y: 220, rotate: 0, scaleX: -1 },
  { id: "brick_4_diagonal", spriteName: "brick_4_diagonal", x: 100, y: 360, rotate: 0, scaleX: -1 }
];

const FIVE_BRICKS_SPRITES = [
  { id: "brick_v_left_1", spriteName: "brick_1_default", x: 0, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_left_2", spriteName: "brick_1_default", x: 0, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_left_3", spriteName: "brick_1_default", x: 0, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_left_4", spriteName: "brick_1_default", x: 0, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_left_5", spriteName: "brick_1_default", x: 0, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_left_6", spriteName: "brick_1_default", x: 0, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_left_7", spriteName: "brick_1_default", x: 0, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_left_8", spriteName: "brick_1_default", x: 0, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_left_9", spriteName: "brick_1_default", x: 0, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_left_10", spriteName: "brick_1_default", x: 0, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_left_11", spriteName: "brick_1_default", x: 0, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_left_12", spriteName: "brick_1_default", x: 0, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_left_13", spriteName: "brick_1_default", x: 0, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_left_14", spriteName: "brick_1_default", x: 0, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_left_15", spriteName: "brick_1_default", x: 0, y: 580, rotate: 0, scale: 1 },
  { id: "brick_v_right_1", spriteName: "brick_1_default", x: 340, y: 20, rotate: 0, scale: 1 },
  { id: "brick_v_right_2", spriteName: "brick_1_default", x: 340, y: 60, rotate: 0, scale: 1 },
  { id: "brick_v_right_3", spriteName: "brick_1_default", x: 340, y: 100, rotate: 0, scale: 1 },
  { id: "brick_v_right_4", spriteName: "brick_1_default", x: 340, y: 140, rotate: 0, scale: 1 },
  { id: "brick_v_right_5", spriteName: "brick_1_default", x: 340, y: 180, rotate: 0, scale: 1 },
  { id: "brick_v_right_6", spriteName: "brick_1_default", x: 340, y: 220, rotate: 0, scale: 1 },
  { id: "brick_v_right_7", spriteName: "brick_1_default", x: 340, y: 260, rotate: 0, scale: 1 },
  { id: "brick_v_right_8", spriteName: "brick_1_default", x: 340, y: 300, rotate: 0, scale: 1 },
  { id: "brick_v_right_9", spriteName: "brick_1_default", x: 340, y: 340, rotate: 0, scale: 1 },
  { id: "brick_v_right_10", spriteName: "brick_1_default", x: 340, y: 380, rotate: 0, scale: 1 },
  { id: "brick_v_right_11", spriteName: "brick_1_default", x: 340, y: 420, rotate: 0, scale: 1 },
  { id: "brick_v_right_12", spriteName: "brick_1_default", x: 340, y: 460, rotate: 0, scale: 1 },
  { id: "brick_v_right_13", spriteName: "brick_1_default", x: 340, y: 500, rotate: 0, scale: 1 },
  { id: "brick_v_right_14", spriteName: "brick_1_default", x: 340, y: 540, rotate: 0, scale: 1 },
  { id: "brick_v_right_15", spriteName: "brick_1_default", x: 340, y: 580, rotate: 0, scale: 1 },
  { id: "brick_h_top_01", spriteName: "brick_1_default", x: 0, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_02", spriteName: "brick_1_default", x: 40, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_03", spriteName: "brick_1_default", x: 80, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_04", spriteName: "brick_1_default", x: 120, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_05", spriteName: "brick_1_default", x: 160, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_06", spriteName: "brick_1_default", x: 200, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_07", spriteName: "brick_1_default", x: 240, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_08", spriteName: "brick_1_default", x: 280, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_top_09", spriteName: "brick_1_default", x: 320, y: 0, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_01", spriteName: "brick_1_default", x: 0, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_02", spriteName: "brick_1_default", x: 40, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_03", spriteName: "brick_1_default", x: 80, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_04", spriteName: "brick_1_default", x: 120, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_05", spriteName: "brick_1_default", x: 160, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_06", spriteName: "brick_1_default", x: 200, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_07", spriteName: "brick_1_default", x: 240, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_08", spriteName: "brick_1_default", x: 280, y: 620, rotate: -90, scale: -1 },
  { id: "brick_h_bottom_09", spriteName: "brick_1_default", x: 320, y: 620, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 80, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 120, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 200, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 240, y: 220, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 140, y: 310, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 180, y: 310, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 80, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 120, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 200, y: 400, rotate: -90, scale: -1 },
  { id: "brick1", spriteName: "brick_1_default", x: 240, y: 400, rotate: -90, scale: -1 }
];

const FIVE_BRICKS_FLAGS = [
  { color: "blue", x: 170, y: 41, width: 20, height: 20 },
  { color: "green", x: 170, y: 568, width: 20, height: 20 }
];

const BROKEN_X_FLAGS = [
  { color: "blue", x: 170, y: 41, width: 20, height: 20 },
  { color: "green", x: 170, y: 568, width: 20, height: 20 }
];

const MAPS = [
  {
    id: 'clearSky',
    name: 'Clear Sky',
    mode: MAP_RENDER_MODES.DATA,
    sprites: CLEAR_SKY_BORDER_SPRITES,
    tier: 'easy'
  },
  {
    id: 'fiveBricks',
    name: 'fiveBricks',
    mode: MAP_RENDER_MODES.DATA,
    sprites: FIVE_BRICKS_SPRITES,
    tier: 'easy',
    flags: FIVE_BRICKS_FLAGS
  },
  {
    id: 'brokenX',
    name: 'brokenX',
    mode: MAP_RENDER_MODES.DATA,
    sprites: BROKEN_X_SPRITES,
    tier: 'easy',
    flags: BROKEN_X_FLAGS
  }
];

const MAP_RENDERERS = {
  SPRITES: 'sprites'
};
let currentMapSprites = [];
let currentMapName = "unknown map";

const RANDOM_MAP_SENTINEL_INDEX = MAPS.findIndex(map => map?.name?.toLowerCase?.() === 'random map');
const PLAYABLE_MAP_INDICES = MAPS
  .map((_, index) => index)
  .filter(index => index !== RANDOM_MAP_SENTINEL_INDEX);

function getMapTierForRound(roundNumber){
  if(roundNumber <= 2){
    return 'easy';
  }
  if(roundNumber <= 4){
    return 'middle';
  }
  return 'hard';
}

function getPlayableMapIndicesForRound(roundNumber = 1){
  const targetTier = getMapTierForRound(roundNumber);
  const tierMatches = PLAYABLE_MAP_INDICES.filter(index => MAPS[index]?.tier === targetTier);
  if(tierMatches.length){
    return tierMatches;
  }
  return PLAYABLE_MAP_INDICES;
}

function resolveMapIndexForGameplay(upcomingRoundNumber = roundNumber + 1){
  const clamped = clampMapIndex(settings.mapIndex);
  if(clamped === RANDOM_MAP_SENTINEL_INDEX){
    return getRandomPlayableMapIndex(upcomingRoundNumber);
  }
  return clamped;
}

const FLAME_STYLE_OPTIONS = [
  { value: 'random', label: 'Random Mix', filter: '' },
  { value: 'cycle', label: 'Cycle (Deterministic)', filter: '' },
  { value: 'icy', label: 'Icy Blue', filter: 'hue-rotate(200deg) saturate(1.6)' },
  { value: 'inferno', label: 'Inferno', filter: 'hue-rotate(-30deg) saturate(1.8) brightness(1.05)' },
  { value: 'off', label: 'Flames Disabled', filter: '' }
];

const FLAME_STYLE_MAP = new Map(FLAME_STYLE_OPTIONS.map(option => [option.value, option]));

// Temporary product decision: AA placement must stay fully disabled until the new flow is shipped.
const AA_PLACEMENT_TEMP_DISABLED = true;

function normalizeFlameStyleKey(key) {
  return FLAME_STYLE_MAP.has(key) ? key : 'random';
}

const settingsBridge = window.paperWingsSettings || (window.paperWingsSettings = {});
const sharedSettings = settingsBridge.settings || (settingsBridge.settings = {
  flightRangeCells: 30,
  aimingAmplitude: 10 / 5,
  addAA: true,
  sharpEdges: true,
  flagsEnabled: true,
  addCargo: false,
  mapIndex: 0
});

if(!Number.isFinite(sharedSettings.flightRangeCells)){
  sharedSettings.flightRangeCells = 30;
}
if(!Number.isFinite(sharedSettings.aimingAmplitude)){
  sharedSettings.aimingAmplitude = 10 / 5;
}
if(typeof sharedSettings.addAA !== 'boolean'){
  sharedSettings.addAA = true;
}
if(typeof sharedSettings.sharpEdges !== 'boolean'){
  sharedSettings.sharpEdges = true;
}
if(typeof sharedSettings.flagsEnabled !== 'boolean'){
  sharedSettings.flagsEnabled = true;
}
if(typeof sharedSettings.addCargo !== 'boolean'){
  sharedSettings.addCargo = false;
}
if(!Number.isInteger(sharedSettings.mapIndex)){
  sharedSettings.mapIndex = 0;
}
if(typeof sharedSettings.flameStyle !== 'string'){
  sharedSettings.flameStyle = 'random';
}
if(typeof sharedSettings.randomizeMapEachRound !== 'boolean'){
  sharedSettings.randomizeMapEachRound = false;
}

const settings = sharedSettings;

let storageAvailable = true;
function getStoredSetting(key){
  if(!storageAvailable){
    return null;
  }
  try {
    const storage = window.localStorage;
    return storage ? storage.getItem(key) : null;
  } catch(err){
    storageAvailable = false;
    console.warn('localStorage unavailable, falling back to defaults.', err);
    return null;
  }
}

function clampMapIndex(index){
  const numericIndex = Number.isInteger(index) ? index : parseInt(index, 10);
  if(!Number.isInteger(numericIndex) || !MAPS.length){
    return 0;
  }
  return Math.min(MAPS.length - 1, Math.max(0, numericIndex));
}

function setStoredSetting(key, value){
  if(!storageAvailable){
    return;
  }
  try {
    const storage = window.localStorage;
    if(!storage) return;
    storage.setItem(key, value);
  } catch(err){
    storageAvailable = false;
    console.warn('localStorage unavailable, settings changes will not persist.', err);
  }
}

settingsBridge.setMapIndex = (nextIndex, options = {}) => {
  const { persist = true } = options;
  settings.mapIndex = clampMapIndex(nextIndex);
  if(persist){
    setStoredSetting('settings.mapIndex', String(settings.mapIndex));
  }
  return settings.mapIndex;
};

function isAAPlacementEnabled(){
  return !AA_PLACEMENT_TEMP_DISABLED && settings.addAA === true;
}

function loadSettings(){
  const previousFlameStyle = settings.flameStyle;
  const fr = parseInt(getStoredSetting('settings.flightRangeCells'), 10);
  settings.flightRangeCells = Number.isNaN(fr) ? 30 : fr;
  const amp = parseFloat(getStoredSetting('settings.aimingAmplitude'));
  settings.aimingAmplitude = Number.isNaN(amp) ? 10 / 5 : amp;
  const storedAddAA = getStoredSetting('settings.addAA');
  settings.addAA = storedAddAA === null ? true : storedAddAA === 'true';
  if(AA_PLACEMENT_TEMP_DISABLED){
    settings.addAA = false;
  }
  const storedSharpEdges = getStoredSetting('settings.sharpEdges');
  settings.sharpEdges = storedSharpEdges === null ? true : storedSharpEdges === 'true';
  const storedFlagsEnabled = getStoredSetting('settings.flagsEnabled');
  settings.flagsEnabled = storedFlagsEnabled === null ? true : storedFlagsEnabled === 'true';
  const storedAddCargo = getStoredSetting('settings.addCargo');
  settings.addCargo = storedAddCargo === null ? false : storedAddCargo === 'true';
  const mapIdx = parseInt(getStoredSetting('settings.mapIndex'), 10);
  settings.mapIndex = clampMapIndex(mapIdx);
  const storedFlameStyle = normalizeFlameStyleKey(getStoredSetting('settings.flameStyle'));
  settings.flameStyle = storedFlameStyle;
  settings.randomizeMapEachRound = getStoredSetting('settings.randomizeMapEachRound') === 'true';

  // Clamp loaded values so corrupted or out-of-range settings
  // don't break the game on startup
  settings.flightRangeCells = Math.min(MAX_FLIGHT_RANGE_CELLS,
    Math.max(MIN_FLIGHT_RANGE_CELLS, settings.flightRangeCells));
  settings.aimingAmplitude = Math.min(MAX_AMPLITUDE,
    Math.max(MIN_AMPLITUDE, settings.aimingAmplitude));

  if(previousFlameStyle !== settings.flameStyle){
    onFlameStyleChanged();
  }
}

loadSettings();

// Highlight advanced settings button if custom settings are stored
const hasCustomSettings = storageAvailable && [
  'settings.flightRangeCells',
  'settings.aimingAmplitude',
  'settings.addAA',
  'settings.sharpEdges',
  'settings.flagsEnabled',
  'settings.addCargo',
  'settings.mapIndex',
  'settings.randomizeMapEachRound',
  'settings.flameStyle'
].some(key => getStoredSetting(key) !== null);

if(hasCustomSettings && classicRulesBtn && advancedSettingsBtn){
  selectedRuleset = "advanced";
}

syncRulesButtonSkins(selectedRuleset);
syncModeButtonSkins(selectedMode);
updateModePlanesPosition();
updateRulesPlanesPosition();
syncPlayButtonSkin(true);


const POINTS_TO_WIN = 24;
let greenScore = 0;
let blueScore  = 0;
let roundNumber = 0;
let roundTextTimer = 0;
let roundTransitionTimeout = null;

const FLAG_STATES = { ACTIVE: 'active', CAPTURED: 'captured' };
let flagConfigs = [];
let flags = [];

const MATCH_SCORE_CONTAINERS = {
  blue: { x: 411, y: 97, width: 48, height: 287 },
  green: { x: 411, y: 416, width: 48, height: 287 }
};

const MATCH_SCORE_ASSETS = {
  blue: "ui_gamescreen/gamescreen_outside/matchscore_blue_corn.png",
  green: "ui_gamescreen/gamescreen_outside/matchscore_green_egg2.png"
};

const MATCH_SCORE_GHOST_ASSETS = {
  blue: "ui_gamescreen/gamescreen_outside/matchscore_blue_corn_ghost.png",
  green: "ui_gamescreen/gamescreen_outside/matchscore_green_egg_ghost.png"
};

const MATCH_SCORE_ICON_RENDER_SIZE = 20;
const MATCH_SCORE_ICON_SOURCE_INSET = 1;
const MATCH_SCORE_GHOST_ALPHA = 0.22;
const MATCHSCORE_OFFSET_X = -2;

const matchScoreImages = {
  blue: null,
  green: null
};

const matchScoreGhostImages = {
  blue: null,
  green: null
};

const MATCH_SCORE_ANIMATION_DURATION_MS = 220;
const MATCH_SCORE_ANIMATION_PEAK_TIME_MS = MATCH_SCORE_ANIMATION_DURATION_MS * 0.6;
const MATCH_SCORE_ANIMATION_START_SCALE = 0.2;
const MATCH_SCORE_ANIMATION_PEAK_SCALE = 1.25;
const MATCH_SCORE_STAGGER_DELAY_MS = 70;

const matchScoreSpawnTimes = {
  blue: Array.from({ length: POINTS_TO_WIN }, () => 0),
  green: Array.from({ length: POINTS_TO_WIN }, () => 0)
};

let matchScoreAnimationActiveUntil = 0;
function resetMatchScoreAnimations(){
  matchScoreSpawnTimes.blue.fill(0);
  matchScoreSpawnTimes.green.fill(0);
  matchScoreAnimationActiveUntil = 0;
}

let isDrawGame = false;

let matchScoreImagesRequested = false;
function loadMatchScoreImagesIfNeeded(){
  if (matchScoreImagesRequested) return;
  matchScoreImagesRequested = true;

  Object.entries(MATCH_SCORE_ASSETS).forEach(([color, src]) => {
    const { img } = loadImageAsset(src, GAME_PRELOAD_LABEL);
    matchScoreImages[color] = img || null;
  });

  Object.entries(MATCH_SCORE_GHOST_ASSETS).forEach(([color, src]) => {
    const { img } = loadImageAsset(src, GAME_PRELOAD_LABEL);
    matchScoreGhostImages[color] = img || null;
  });
}


function lockInWinner(color, options = {}){
  if(isGameOver) return;

  isGameOver = true;
  winnerColor = color;
  isDrawGame = false;
  roundEndedByNuke = false;

  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }

  shouldShowEndScreen = Boolean(options.showEndScreen);
  if(endGameDiv){
    endGameDiv.style.display = "none";
  }

  if(typeof options.roundTransitionDelay === "number" && Number.isFinite(options.roundTransitionDelay)){
    pendingRoundTransitionDelay = options.roundTransitionDelay;
    pendingRoundTransitionStart = performance.now();
  } else {
    pendingRoundTransitionDelay = null;
    pendingRoundTransitionStart = 0;
  }

  awaitingFlightResolution = flyingPoints.length > 0;

  if(!awaitingFlightResolution){
    finalizePostFlightState();
  }
}

function lockInNoSurvivors(options = {}){
  if(isGameOver) return;

  isGameOver = true;
  winnerColor = null;
  isDrawGame = false;
  roundEndedByNuke = true;

  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }

  shouldShowEndScreen = false;
  if(endGameDiv){
    endGameDiv.style.display = "none";
  }

  if(typeof options.roundTransitionDelay === "number" && Number.isFinite(options.roundTransitionDelay)){
    pendingRoundTransitionDelay = options.roundTransitionDelay;
    pendingRoundTransitionStart = performance.now();
  } else {
    pendingRoundTransitionDelay = null;
    pendingRoundTransitionStart = 0;
  }

  awaitingFlightResolution = flyingPoints.length > 0;

  if(!awaitingFlightResolution){
    finalizePostFlightState();
  }
}

function lockInDraw(options = {}){
  if(isGameOver) return;

  isGameOver = true;
  winnerColor = null;
  isDrawGame = true;
  roundEndedByNuke = false;

  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }

  shouldShowEndScreen = Boolean(options.showEndScreen);
  if(endGameDiv){
    endGameDiv.style.display = "none";
  }

  if(typeof options.roundTransitionDelay === "number" && Number.isFinite(options.roundTransitionDelay)){
    pendingRoundTransitionDelay = options.roundTransitionDelay;
    pendingRoundTransitionStart = performance.now();
  } else {
    pendingRoundTransitionDelay = null;
    pendingRoundTransitionStart = 0;
  }

  awaitingFlightResolution = flyingPoints.length > 0;

  if(!awaitingFlightResolution){
    finalizePostFlightState();
  }
}

function maybeLockInMatchOutcome(options = {}){
  if(isGameOver) return true;

  if(blueScore >= POINTS_TO_WIN && greenScore >= POINTS_TO_WIN){
    lockInDraw(options);
    return true;
  }
  if(blueScore >= POINTS_TO_WIN){
    lockInWinner("blue", options);
    return true;
  }
  if(greenScore >= POINTS_TO_WIN){
    lockInWinner("green", options);
    return true;
  }
  return false;
}

function finalizePostFlightState(){
  if(pendingRoundTransitionDelay !== null){
    const elapsed = performance.now() - pendingRoundTransitionStart;
    const remaining = Math.max(0, pendingRoundTransitionDelay - elapsed);
    if(roundTransitionTimeout){
      clearTimeout(roundTransitionTimeout);
    }
    roundTransitionTimeout = setTimeout(startNewRound, remaining);
    pendingRoundTransitionDelay = null;
    pendingRoundTransitionStart = 0;
  }

  if(shouldShowEndScreen && endGameDiv){
    endGameDiv.style.display = "block";
  }
}

function addScore(color, delta, options = {}){
  if(isGameOver) return;

  if(color === "blue"){
    const previous = blueScore;
    blueScore = Math.max(0, blueScore + delta);
    if(blueScore > previous){
      trackMatchScoreSpawn("blue", previous, blueScore);
    } else {
      for (let i = blueScore; i < previous && i < matchScoreSpawnTimes.blue.length; i += 1){
        matchScoreSpawnTimes.blue[i] = 0;
      }
    }
  } else if(color === "green"){
    const previous = greenScore;
    greenScore = Math.max(0, greenScore + delta);
    if(greenScore > previous){
      trackMatchScoreSpawn("green", previous, greenScore);
    } else {
      for (let i = greenScore; i < previous && i < matchScoreSpawnTimes.green.length; i += 1){
        matchScoreSpawnTimes.green[i] = 0;
      }
    }
  }

  if(!isGameOver && !options.deferVictoryCheck && !isNuclearStrikeResolutionActive){
    maybeLockInMatchOutcome({ showEndScreen: true });
  }

  renderScoreboard();
}

let animationFrameId = null;
let gameDrawFirstLogged = false;

const activeExplosions = [];
const EXPLOSION_DRAW_SIZE = 50;
const EXPLOSION_FPS = 12;
const EXPLOSION_FRAME_DURATION_MS = 1000 / EXPLOSION_FPS; // ~12fps
const EXPLOSION_MIN_DURATION_MS = 600;
const EXPLOSION_GIF_DURATION_MS = 1200;
const EXPLOSION_GREEN_DEFAULT_DURATION_MS = 450;
const EXPLOSION_BLUE_DEFAULT_DURATION_MS = EXPLOSION_GREEN_DEFAULT_DURATION_MS;
const GREEN_EXPLOSION_DURATIONS_MS = {
  "green_explosion_short1.gif": 510,
  "green_explosion_short3.gif": 450,
  "green_explosion_short4.gif": 480,
  "green_explosion_short5.gif": 510,
  "green_explosion_short6.gif": 560,
};
const BLUE_EXPLOSION_DURATIONS_MS = {
  "explosion_blue_short_1.gif": 480,
  "explosion_blue_short_2.gif": 450,
  "explosion_blue_short_3.gif": 570,
  "explosion_blue_short_4.gif": 540,
  "explosion_blue_short_5.gif": 480,
};

function getShortExplosionDurationMs(src = "", color = "") {
  const trimmed = typeof src === "string" ? src.trim() : "";
  if (!trimmed) {
    return null;
  }
  const fileName = trimmed.split("/").pop() || "";
  const isGreenExplosion = color === "green" || trimmed.includes("green_explosions_short/");
  const isBlueExplosion = trimmed.includes("blue_explosions_short/");
  const duration = isGreenExplosion
    ? GREEN_EXPLOSION_DURATIONS_MS[fileName]
    : isBlueExplosion
      ? BLUE_EXPLOSION_DURATIONS_MS[fileName]
      : null;
  return Number.isFinite(duration) ? duration : null;
}

function getExactExplosionGifDurationMs(img) {
  const datasetDuration = Number.parseFloat(img?.dataset?.durationMs);
  const propDuration = Number.isFinite(img?.durationMs) ? img.durationMs : NaN;
  const explicitDuration = Number.isFinite(propDuration) ? propDuration : datasetDuration;
  return Number.isFinite(explicitDuration) && explicitDuration > 0 ? explicitDuration : null;
}

function resolveExplosionGifDurationMs(img, color) {
  const src = img?.src ?? '';
  const isShortExplosion = src.includes("green_explosions_short/")
    || src.includes("blue_explosions_short/");
  const isGreenExplosion = color === "green" || src.includes("green_explosions_short/");
  const explicitDuration = getExactExplosionGifDurationMs(img);
  if (Number.isFinite(explicitDuration)) {
    return isShortExplosion ? explicitDuration : Math.max(explicitDuration, EXPLOSION_MIN_DURATION_MS);
  }
  if (isShortExplosion) {
    return getShortExplosionDurationMs(src, color) ?? EXPLOSION_GREEN_DEFAULT_DURATION_MS;
  }
  if (isGreenExplosion) {
    return EXPLOSION_GREEN_DEFAULT_DURATION_MS;
  }
  return Math.max(EXPLOSION_GIF_DURATION_MS, EXPLOSION_MIN_DURATION_MS);
}

/* Планирование хода ИИ */
let aiMoveScheduled = false;

/* ======= INIT ======= */
function colorAngleOffset(color){
  return 0;
}

let HOME_ROW_Y = {
  blue: 40,
  green: 0,
};

function getHomeRowY(color){
  const fallback = color === "blue" ? FIELD_TOP + 40 : FIELD_TOP + FIELD_HEIGHT - 40;
  const rowY = HOME_ROW_Y[color];
  return Number.isFinite(rowY) ? rowY : fallback;
}

function initPoints(){
  points = [];
  const startPositions = getStartPlaneWorldPositions();
  const firstBlueY = startPositions.blue[0]?.y ?? 0;
  const firstGreenY = startPositions.green[0]?.y ?? FIELD_TOP + FIELD_HEIGHT;
  HOME_ROW_Y = { blue: firstBlueY, green: firstGreenY };

  // Green (низ поля) — смотрят ВВЕРХ (к сопернику)
  startPositions.green.forEach(({ x, y }) => {
    points.push(makePlane(x, y, "green", colorAngleOffset("green"))); // 0 рад — нос вверх
  });

  // Blue (верх поля) — смотрят ВНИЗ
  startPositions.blue.forEach(({ x, y }) => {
    points.push(makePlane(x, y, "blue", Math.PI + colorAngleOffset("blue"))); // π рад — базовый разворот вниз
  });
}
function makePlane(x,y,color,angle){
  return {
    x, y,
    color,
    isAlive:true,
    burning:false,
    crashStart:null,
    angle,
    segments:[],
    collisionX:null,
    collisionY:null,
    prevX: x,
    prevY: y,
    flagColor:null,
    carriedFlagId: null,
    flameFxDisabled: false,
    activeTurnBuff: null
  };
}

function getFlagConfigsForMap(map = null){
  const mapFlags = Array.isArray(map?.flags) ? map.flags : null;
  const fallbackFlags = Object.entries(FLAG_LAYOUTS).map(([color, layout]) => ({ color, layout }));
  const source = mapFlags?.length ? mapFlags : fallbackFlags;

  return source.map((config, index) => {
    const color = config.color || config.team || config.owner || "neutral";
    const layout = config.layout || (Number.isFinite(config.x) && Number.isFinite(config.y)
      ? { x: config.x, y: config.y, width: config.width ?? FLAG_WIDTH, height: config.height ?? FLAG_POLE_HEIGHT + FLAG_HEIGHT }
      : config);

    return {
      id: config.id ?? `${color}-${index}`,
      color,
      layout,
    };
  });
}

function isFlagsModeEnabled(){
  return settings.flagsEnabled !== false;
}

function setFlagConfigsForMap(map){
  flagConfigs = getFlagConfigsForMap(map);
  resetFlagsForNewRound();
}

function resetFlagsForNewRound(){
  flags = flagConfigs.map((config, index) => ({
    id: config.id ?? `${config.color}-${index}`,
    color: config.color,
    layout: config.layout,
    state: FLAG_STATES.ACTIVE,
    carrier: null,
    droppedAt: null,
  }));
}

function getFlagLayoutForColor(color){
  const config = flagConfigs.find(flag => flag.color === color);
  return config?.layout || FLAG_LAYOUTS[color] || null;
}

function getBaseLayout(color){
  return BASE_LAYOUTS[color] || null;
}

function getFlagById(flagId){
  return flags.find(flag => flag.id === flagId) || null;
}

function isFlagActive(flag){
  return flag?.state === FLAG_STATES.ACTIVE;
}

function getFlagAnchor(flag){
  if(!flag){
    const fallbackY = getHomeRowY("blue");
    return { x: FIELD_LEFT + FIELD_WIDTH / 2, y: fallbackY };
  }

  if(flag.droppedAt){
    return flag.droppedAt;
  }

  const layout = flag.layout || getFlagLayoutForColor(flag.color);
  if(layout){
    return { x: layout.x + layout.width / 2, y: layout.y + layout.height / 2 };
  }

  const centerX = FIELD_LEFT + FIELD_WIDTH / 2;
  const fallbackY = flag.color === "blue" ? getHomeRowY("blue") : getHomeRowY("green");
  return { x: centerX, y: fallbackY };
}

function getBaseAnchor(color){
  const layout = getBaseLayout(color);
  if(layout){
    return { x: layout.x + layout.width / 2, y: layout.y + layout.height / 2 };
  }
  const centerX = FIELD_LEFT + FIELD_WIDTH / 2;
  const fallbackY = color === "blue" ? FIELD_TOP + 20 : FIELD_TOP + FIELD_HEIGHT - 20;
  return { x: centerX, y: fallbackY };
}

function getInteractionRadius(layout){
  if(layout && Number.isFinite(layout.width) && Number.isFinite(layout.height)){
    return Math.max(layout.width, layout.height) / 2;
  }
  return POINT_RADIUS;
}

function getFlagInteractionTarget(flag){
  if(!isFlagActive(flag)) return null;

  const layout = flag.droppedAt ? null : (flag.layout || getFlagLayoutForColor(flag.color));
  return {
    anchor: getFlagAnchor(flag),
    radius: flag.droppedAt ? FLAG_INTERACTION_RADIUS : Math.max(FLAG_INTERACTION_RADIUS, getInteractionRadius(layout)),
  };
}

function getFlagCarrierForColor(color){
  if(!isFlagsModeEnabled()) return null;
  const flag = flags.find(f => f.color === color && isFlagActive(f) && f.carrier);
  return flag ? flag.carrier : null;
}

function getActiveFlagsByColor(color){
  return flags.filter(flag => flag.color === color && isFlagActive(flag));
}

function getAvailableFlagsByColor(color){
  if(!isFlagsModeEnabled()) return [];
  return getActiveFlagsByColor(color).filter(flag => !flag.carrier);
}

function assignFlagToPlane(flag, plane){
  if(!flag || !plane || !isFlagActive(flag)) return;
  if(plane.carriedFlagId) return;
  if(flag.carrier) return;

  flag.carrier = plane;
  flag.droppedAt = null;
  plane.carriedFlagId = flag.id;
  plane.flagColor = flag.color;
}

function clearFlagFromPlane(plane){
  if(!plane) return;
  plane.carriedFlagId = null;
  plane.flagColor = null;
}

function dropFlagAtPosition(flag, position){
  if(!flag || !isFlagActive(flag)) return;
  flag.droppedAt = position || null;
  flag.carrier = null;
}

function captureFlag(flag){
  if(!flag) return;
  flag.state = FLAG_STATES.CAPTURED;
  flag.carrier = null;
  flag.droppedAt = null;
}

setFlagConfigsForMap();

function getBaseInteractionTarget(color){
  const layout = getBaseLayout(color);
  return {
    anchor: getBaseAnchor(color),
    radius: Math.max(BASE_INTERACTION_RADIUS, getInteractionRadius(layout)),
  };
}


function resetGame(options = {}){
  const { forceGameScreen = false, forceMenu = false } = options;
  const shouldShowMenu = forceMenu || (!forceGameScreen && !menuScreenLocked);

  isGameOver= false;
  winnerColor= null;
  roundEndedByNuke = false;
  endGameDiv.style.display = "none";
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;

  cleanupGreenCrashFx();

  activeExplosions.length = 0;

  greenScore = 0;
  blueScore  = 0;
  resetMatchScoreAnimations();
  roundNumber = 0;
  roundTextTimer = 0;
  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }


  lastFirstTurn= 1 - lastFirstTurn;
  turnIndex= lastFirstTurn;
  turnAdvanceCount = 0;
  resetCargoState();
  resetInventoryState();


  globalFrame=0;
  flyingPoints= [];
  if(shouldAutoRandomizeMap()){
    if(settings.mapIndex !== RANDOM_MAP_SENTINEL_INDEX){
      setMapIndexAndPersist(getRandomPlayableMapIndex());
    }
  }
  applyCurrentMap();

  aaUnits = [];
  mines = [];

  hasShotThisRound = false;

  selectedMode = shouldShowMenu ? "hotSeat" : selectedMode;
  gameMode = shouldShowMenu ? null : gameMode;
  phase = shouldShowMenu ? 'MENU' : 'TURN';
  currentPlacer = null;

  if (shouldShowMenu) {
    menuScreenLocked = false;
    setBackgroundImage('background paper 1.png');
    hideGameBackgroundForMenu();
  } else {
    restoreGameBackgroundAfterMenu();
  }

  // UI reset
  syncModeButtonSkins(selectedMode);
  updateModePlanesPosition();
  updateRulesPlanesPosition();
  syncPlayButtonSkin(true);

  if (shouldShowMenu) {
    // Показать меню, скрыть канвасы
    setMenuVisibility(true);
    gsBoardCanvas.style.display = "none";
    mantisIndicator.style.display = "none";
    goatIndicator.style.display = "none";
    aimCanvas.style.display = "none";
    planeCanvas.style.display = "none";
  } else {
    menuScreenLocked = true;
    setMenuVisibility(false);
    activateGameScreen();
    gsBoardCanvas.style.display = "block";
    mantisIndicator.style.display = "block";
    goatIndicator.style.display = "block";
    aimCanvas.style.display = "block";
    planeCanvas.style.display = "block";
  }
  resetCanvasState(planeCtx, planeCanvas);

  // Остановить основной цикл
  stopGameLoop();

  initPoints();
  renderScoreboard();

  if (!shouldShowMenu) {
    startNewRound();
  }
}


function stopGameLoop(){
  if(animationFrameId !== null){
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}
function startGameLoop(){
  logBootStep("startGameLoop");
  if(animationFrameId === null){
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(gameDraw);
  }
}

function startMainLoopIfNotRunning(reason = "startMainLoopIfNotRunning") {
  if (animationFrameId !== null) {
    logRenderInit("loop already running", { reason, animationFrameId });
    return;
  }
  logRenderInit("starting loop", { reason });
  startGameLoop();
  logRenderInit("loop running", { reason });
}

/* ======= MENU ======= */
hotSeatBtn.addEventListener("click",()=>{
  selectedMode = "hotSeat";
  lastModeSelectionButton = hotSeatBtn;
  updateModeSelection(hotSeatBtn);
});
computerBtn.addEventListener("click",()=>{
  selectedMode = "computer";
  lastModeSelectionButton = computerBtn;
  updateModeSelection(computerBtn);
});
onlineBtn.addEventListener("click",()=>{
  selectedMode = "online";
  lastModeSelectionButton = onlineBtn;
  updateModeSelection(onlineBtn);
});
if(classicRulesBtn){
  classicRulesBtn.addEventListener('click', () => {
    settings.flightRangeCells = 30;
    settings.aimingAmplitude = 10 / 5; // 10°
    settings.addAA = false;
    settings.sharpEdges = true;
    const upcomingRoundNumber = roundNumber + 1;
    settings.mapIndex = getRandomPlayableMapIndex(upcomingRoundNumber);
    settings.randomizeMapEachRound = true;
    settings.flameStyle = 'random';
    onFlameStyleChanged();
    applyCurrentMap(upcomingRoundNumber);
    selectedRuleset = "classic";
    syncRulesButtonSkins(selectedRuleset);
    lastRulesSelectionButton = classicRulesBtn;
    updateModeSelection(classicRulesBtn);
  });
}
if(advancedSettingsBtn){
  advancedSettingsBtn.addEventListener('click', () => {
    loadSettings();
    applyCurrentMap();
    selectedRuleset = "advanced";
    syncRulesButtonSkins(selectedRuleset);
    lastRulesSelectionButton = advancedSettingsBtn;
    updateModeSelection(advancedSettingsBtn);

    if(!IS_TEST_HARNESS){
      if (settingsLayerTimer) {
        clearTimeout(settingsLayerTimer);
      }
      settingsLayerTimer = setTimeout(() => {
        settingsLayerTimer = null;
        showSettingsLayer();
      }, MENU_SETTINGS_DELAY_MS);
    }
  });
}
function resolveModeButton(activeButton){
  if(!selectedMode) return null;
  if(modeMenuButtons.includes(activeButton)) return activeButton;
  if(lastModeSelectionButton) return lastModeSelectionButton;
  if(selectedMode === "hotSeat") return hotSeatBtn;
  if(selectedMode === "computer") return computerBtn;
  if(selectedMode === "online") return onlineBtn;
  return modeMenuDiv?.querySelector('.mode-menu__btn.menu-btn--active') || null;
}

function resolveRulesButton(activeButton){
  if(!selectedRuleset) return null;
  if(rulesMenuButtons.includes(activeButton)) return activeButton;
  if(lastRulesSelectionButton) return lastRulesSelectionButton;
  const selectedButton = modeMenuDiv?.querySelector('.mode-menu__btn.selected');
  if(rulesMenuButtons.includes(selectedButton)) return selectedButton;
  if(selectedRuleset === "classic") return classicRulesBtn;
  if(selectedRuleset === "advanced") return advancedSettingsBtn;
  return null;
}

function updateModePlanesPosition(activeButton){
  if(!(modeMenuDiv instanceof HTMLElement)) return;
  if(!(leftModePlane instanceof HTMLElement) || !(rightModePlane instanceof HTMLElement)) return;

  const resolvedButton = resolveModeButton(activeButton);

  if(!(resolvedButton instanceof HTMLElement)){
    leftModePlane.style.opacity = "0";
    rightModePlane.style.opacity = "0";
    return;
  }

  const btnRect = resolvedButton.getBoundingClientRect();
  const rootRect = modeMenuDiv.getBoundingClientRect();
  if(!btnRect || !rootRect) return;

  const btnLeftD = toDesignCoords(btnRect.left, btnRect.top).x;
  const btnTopD = toDesignCoords(btnRect.left, btnRect.top).y;
  const rootLeftD = toDesignCoords(rootRect.left, rootRect.top).x;
  const rootTopD = toDesignCoords(rootRect.left, rootRect.top).y;
  const designOrigin = toDesignCoords(rootRect.left, rootRect.top);
  const uiScale = Number.isFinite(designOrigin.uiScale) ? designOrigin.uiScale : 1;
  const btnW_D = btnRect.width / uiScale;
  const btnH_D = btnRect.height / uiScale;
  const rootX_D = btnLeftD - rootLeftD;
  const rootY_D = btnTopD - rootTopD;
  const leftOffset = 36 + 12;
  const rightOffset = 12;

  const updatePlane = (plane, targetX_D) => {
    const planeRect = plane.getBoundingClientRect();
    const planeHeight_D = (planeRect.height || plane.offsetHeight || 0) / uiScale;
    const targetY_D = rootY_D + btnH_D / 2 - planeHeight_D / 2;
    plane.style.transform = `translate(${targetX_D}px, ${targetY_D}px)`;
    return targetY_D;
  };

  const leftX_D = rootX_D - leftOffset;
  const rightX_D = rootX_D + btnW_D + rightOffset;
  leftModePlane.style.opacity = "1";
  rightModePlane.style.opacity = "1";

  const needsInitialPosition = !modeMenuDiv.dataset.mmModePlanesReady;
  const applyTarget = () => {
    const targetY = updatePlane(leftModePlane, leftX_D);
    updatePlane(rightModePlane, rightX_D);
    lastModePlaneTarget = { leftX: leftX_D, rightX: rightX_D, targetY };
    logMenuPlaneMetricsOnce();
  };

  if(needsInitialPosition){
    leftModePlane.style.transition = "none";
    rightModePlane.style.transition = "none";
    requestAnimationFrame(() => {
      applyTarget();
      requestAnimationFrame(() => {
        leftModePlane.style.transition = "";
        rightModePlane.style.transition = "";
        modeMenuDiv.dataset.mmModePlanesReady = "true";
      });
    });
  } else {
    applyTarget();
  }
}

function updateRulesPlanesPosition(activeButton){
  if(!(modeMenuDiv instanceof HTMLElement)) return;
  if(!(leftRulesPlane instanceof HTMLElement) || !(rightRulesPlane instanceof HTMLElement)) return;

  const resolvedButton = resolveRulesButton(activeButton);

  if(!(resolvedButton instanceof HTMLElement)){
    leftRulesPlane.style.opacity = "0";
    rightRulesPlane.style.opacity = "0";
    return;
  }

  const btnRect = resolvedButton.getBoundingClientRect();
  const rootRect = modeMenuDiv.getBoundingClientRect();
  if(!btnRect || !rootRect) return;

  const btnLeftD = toDesignCoords(btnRect.left, btnRect.top).x;
  const btnTopD = toDesignCoords(btnRect.left, btnRect.top).y;
  const rootLeftD = toDesignCoords(rootRect.left, rootRect.top).x;
  const rootTopD = toDesignCoords(rootRect.left, rootRect.top).y;
  const designOrigin = toDesignCoords(rootRect.left, rootRect.top);
  const uiScale = Number.isFinite(designOrigin.uiScale) ? designOrigin.uiScale : 1;
  const btnW_D = btnRect.width / uiScale;
  const btnH_D = btnRect.height / uiScale;
  const rootX_D = btnLeftD - rootLeftD;
  const rootY_D = btnTopD - rootTopD;
  const leftOffset = 36 + 12;
  const rightOffset = 12;

  const updatePlane = (plane, targetX_D) => {
    const planeRect = plane.getBoundingClientRect();
    const planeHeight_D = (planeRect.height || plane.offsetHeight || 0) / uiScale;
    const targetY_D = rootY_D + btnH_D / 2 - planeHeight_D / 2;
    plane.style.transform = `translate(${targetX_D}px, ${targetY_D}px)`;
    return targetY_D;
  };

  const leftX_D = rootX_D - leftOffset;
  const rightX_D = rootX_D + btnW_D + rightOffset;
  leftRulesPlane.style.opacity = "1";
  rightRulesPlane.style.opacity = "1";

  const needsInitialPosition = !modeMenuDiv.dataset.mmRulesPlanesReady;
  const applyTarget = () => {
    const targetY = updatePlane(leftRulesPlane, leftX_D);
    updatePlane(rightRulesPlane, rightX_D);
    lastRulesPlaneTarget = { leftX: leftX_D, rightX: rightX_D, targetY };
    logMenuPlaneMetricsOnce();
  };

  if(needsInitialPosition){
    leftRulesPlane.style.transition = "none";
    rightRulesPlane.style.transition = "none";
    requestAnimationFrame(() => {
      applyTarget();
      requestAnimationFrame(() => {
        leftRulesPlane.style.transition = "";
        rightRulesPlane.style.transition = "";
        modeMenuDiv.dataset.mmRulesPlanesReady = "true";
      });
    });
  } else {
    applyTarget();
  }
}

function updateModeSelection(activeButton){
  syncModeButtonSkins(selectedMode);
  syncRulesButtonSkins(selectedRuleset);
  updateModePlanesPosition(activeButton);
  updateRulesPlanesPosition(activeButton);

  syncPlayButtonSkin(true);
}

playBtn.addEventListener("click",async ()=>{
  if(!selectedMode){
    alert("Please select a game mode before starting.");
    return;
  }
  bootTrace.startTs = performance.now();
  bootTrace.markers = [];
  gameDrawFirstLogged = false;
  const readyAtClick = gameAssetsReady;
  console.log("[BOOT] play pressed", { gameReady: readyAtClick });
  gameMode = selectedMode;

  if (readyAtClick && Array.isArray(gameAssetsResults)) {
    const failedReady = gameAssetsResults.filter(entry => entry && entry.status && entry.status !== "fulfilled");
    if (failedReady.length) {
      console.warn("[BOOT] game preload missing", { assets: failedReady.map(entry => entry.url).filter(Boolean) });
    }
  }

  if (!gameAssetsReady) {
    const pending = preloadGameAssetsInBackground();
    if (!isPreloadVisible && loadingOverlay) {
      showLoadingOverlay();
    }

    const results = await pending.catch((err) => {
      console.warn("[BOOT] game preload wait error", err);
      return [];
    });

    const failedAssets = Array.isArray(results)
      ? results.filter(entry => entry && entry.status && entry.status !== "fulfilled")
      : [];
    if (failedAssets.length) {
      console.warn("[BOOT] game preload missing", { assets: failedAssets.map(entry => entry.url).filter(Boolean) });
    }

    if (loadingOverlay && isPreloadVisible) {
      hideLoadingOverlay();
    }
  }

  restoreGameBackgroundAfterMenu();
  setMenuVisibility(false);
  activateGameScreen();
  startNewRound();
});

/* ======= INPUT (slingshot) ======= */
const handleCircle={
  baseX:0, baseY:0,
  shakyX:0, shakyY:0,
  offsetX:0, offsetY:0,
  active:false,
  pointRef:null,
  origAngle:null
};

function isPlaneGrabbableAt(x, y) {
  if(isGameOver || !gameMode) return false;
  if(pendingInventoryUse) return false;

  const currentColor = turnColors[turnIndex];
  if(gameMode === "computer" && currentColor === "blue") return false; // ход ИИ

  if(flyingPoints.some(fp => fp.plane.color === currentColor)) return false;

  return points.some(pt =>
    pt.color === currentColor &&
    pt.isAlive && !pt.burning &&
    Math.hypot(pt.x - x, pt.y - y) <= PLANE_TOUCH_RADIUS
  );
}

function updateBoardCursorForHover(x, y) {
  if(phase === 'AA_PLACEMENT') {
    gsBoardCanvas.style.cursor = '';
    return;
  }
  if(handleCircle.active) {
    gsBoardCanvas.style.cursor = 'grabbing';
    return;
  }
  gsBoardCanvas.style.cursor = isPlaneGrabbableAt(x, y) ? 'grab' : '';
}

function handleStart(e) {
  e.preventDefault();
  if(isNuclearStrikeActionLocked()) return;
  if(isGameOver || !gameMode) return;

  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x: mx, y: my } = designToBoardCoords(designX, designY);

  if(pendingInventoryUse){
    tryApplyPendingInventoryUseAt(mx, my);
    return;
  }

  const currentColor= turnColors[turnIndex];
  if(gameMode==="computer" && currentColor==="blue") return; // ход ИИ

  if(flyingPoints.some(fp=>fp.plane.color===currentColor)) return;

  let found= points.find(pt=>
    pt.color=== currentColor &&
    pt.isAlive && !pt.burning &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(!found) return;

  handleCircle.baseX= mx; handleCircle.baseY= my;
  handleCircle.shakyX= mx; handleCircle.shakyY= my;
  handleCircle.offsetX=0; handleCircle.offsetY=0;
  handleCircle.active= true;
  handleCircle.pointRef= found;
  handleCircle.origAngle = found.angle;
  oscillationAngle = 0;
  oscillationDir = 1;
  roundTextTimer = 0; // Hide round label when player starts a move
  gsBoardCanvas.style.cursor = 'grabbing';
  document.body.style.cursor = 'grabbing';

  // Show overlay canvas for aiming arrow
  aimCanvas.style.display = "block";

  window.addEventListener("mousemove", onHandleMove);
  window.addEventListener("mouseup", onHandleUp);
  window.addEventListener("touchmove", onHandleMove);
  window.addEventListener("touchend", onHandleUp);
  window.addEventListener("pointermove", onHandleMove);
  window.addEventListener("pointerup", onHandleUp);
}

function handleAAPlacement(x, y){
  if(isNuclearStrikeActionLocked()) return;
  if(phase !== 'AA_PLACEMENT') return;
  if(!isValidAAPlacement(x,y)) return;

  placeAA({owner: currentPlacer, x, y});
  aaPlacementPreview = null;
  aaPreviewTrail = [];

  if(currentPlacer === 'green'){
    currentPlacer = 'blue';
  } else {
    phase = 'TURN';

  }
}

function updateAAPreviewFromEvent(e){
  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x, y } = designToBoardCoords(designX, designY);
  aaPlacementPreview = { x, y };
  aaPreviewTrail = [];
}

function onCanvasPointerDown(e){
  logPointerDebugEvent(e);
  if(isNuclearStrikeActionLocked()) return;
  if(phase === 'AA_PLACEMENT'){
    e.preventDefault();
    aaPointerDown = true;
    updateAAPreviewFromEvent(e);
  } else if(pendingInventoryUse) {
    handleStart(e);
  } else {
    handleStart(e);
  }
}

function onCanvasPointerMove(e){
  logPointerDebugEvent(e);
  if(isNuclearStrikeActionLocked()) {
    gsBoardCanvas.style.cursor = '';
    return;
  }
  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x, y } = designToBoardCoords(designX, designY);
  if(phase !== 'AA_PLACEMENT'){
    updateBoardCursorForHover(x, y);
    return;
  }
  if(e.pointerType === 'mouse' || aaPointerDown){
    updateAAPreviewFromEvent(e);
  }
  updateBoardCursorForHover(x, y);
}

function onCanvasPointerUp(e){
  logPointerDebugEvent(e);
  if(isNuclearStrikeActionLocked()){
    aaPointerDown = false;
    aaPlacementPreview = null;
    aaPreviewTrail = [];
    return;
  }
  if(phase !== 'AA_PLACEMENT') return;
  aaPointerDown = false;
  if(!aaPlacementPreview) return;
  const {x, y} = aaPlacementPreview;
  handleAAPlacement(x, y);
  aaPlacementPreview = null;
  aaPreviewTrail = [];
}

gsBoardCanvas.addEventListener("pointerdown", onCanvasPointerDown);
gsBoardCanvas.addEventListener("pointermove", onCanvasPointerMove);
gsBoardCanvas.addEventListener("pointerup", onCanvasPointerUp);
gsBoardCanvas.addEventListener("pointerleave", () => { aaPlacementPreview = null; aaPointerDown = false; aaPreviewTrail = []; });
gsBoardCanvas.addEventListener("dragover", onBoardDragOver);
gsBoardCanvas.addEventListener("drop", onInventoryDrop);
window.addEventListener("dragend", () => cancelActiveNuclearDrag("ended outside board"));
window.addEventListener("drop", () => cancelActiveNuclearDrag("dropped outside board"));
window.addEventListener("dragcancel", () => cancelActiveNuclearDrag("cancelled"));
window.addEventListener("keydown", (event) => {
  if(event.key === "Escape"){
    cancelPendingInventoryUse();
  }
});

function isValidAAPlacement(x,y){
  // Allow Anti-Aircraft placement anywhere within the player's half of the field.
  // The center may touch field edges or overlap planes, but must not be inside
  // any collider so that AA can be destroyed by planes.

  const half = FIELD_TOP + FIELD_HEIGHT / 2;

  if (currentPlacer === 'green') {
    if (y < half || y > FIELD_TOP + FIELD_HEIGHT) return false;
  } else if (currentPlacer === 'blue') {
    if (y < FIELD_TOP || y > half) return false;
  } else {
    return false;
  }


  if (x < FIELD_LEFT + FIELD_BORDER_OFFSET_X ||
      x > FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X) {

    return false;
  }

  return true;
}

function placeAA({owner,x,y}){
  aaUnits.push({
    id: 'aa'+Date.now()+Math.random().toString(16).slice(2),
    owner,
    x, y,
    radius: AA_DEFAULTS.radius,
    hp: AA_DEFAULTS.hp,
    cooldownMs: AA_DEFAULTS.cooldownMs,
    lastTriggerAt: null,
    sweepAngleDeg: 0,
    rotationDegPerSec: AA_DEFAULTS.rotationDegPerSec,
    beamWidthDeg: AA_DEFAULTS.beamWidthDeg,
    dwellTimeMs: AA_DEFAULTS.dwellTimeMs,
    trail: []
  });
}


function drawAAPlacementZone(){
  if(phase !== 'AA_PLACEMENT') return;

  const half = FIELD_TOP + FIELD_HEIGHT / 2;
  gsBoardCtx.save();
  gsBoardCtx.fillStyle = colorWithAlpha(currentPlacer, 0.05);
  if(currentPlacer === 'green'){
    gsBoardCtx.fillRect(FIELD_LEFT, half, FIELD_WIDTH, FIELD_TOP + FIELD_HEIGHT - half);
  } else {
    gsBoardCtx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_WIDTH, half - FIELD_TOP);
  }
  gsBoardCtx.restore();
}

function drawAAPreview(){
  if(phase !== 'AA_PLACEMENT' || !aaPlacementPreview) return;
  const {x, y} = aaPlacementPreview;
  if(!isValidAAPlacement(x, y)) return;

  gsBoardCtx.save();
  gsBoardCtx.globalAlpha = 0.3;
  gsBoardCtx.strokeStyle = colorFor(currentPlacer);
  gsBoardCtx.beginPath();
  gsBoardCtx.arc(x, y, AA_DEFAULTS.radius, 0, Math.PI*2);
  gsBoardCtx.stroke();

  // track preview sweep trail
  const now = performance.now();
  const angDeg = (now/1000 * AA_DEFAULTS.rotationDegPerSec) % 360;
  aaPreviewTrail.push({angleDeg: angDeg, time: now});
  aaPreviewTrail = aaPreviewTrail.filter(seg => now - seg.time < AA_TRAIL_MS);

  for(const seg of aaPreviewTrail){
    const age = now - seg.time;

    const alpha = (1 - age/AA_TRAIL_MS) * 0.3;

    gsBoardCtx.globalAlpha = alpha;
    gsBoardCtx.strokeStyle = colorFor(currentPlacer);
    gsBoardCtx.lineWidth = 2;
    gsBoardCtx.lineCap = "round";
    const trailAng = seg.angleDeg * Math.PI/180;
    const trailEndX = x + Math.cos(trailAng) * AA_DEFAULTS.radius;
    const trailEndY = y + Math.sin(trailAng) * AA_DEFAULTS.radius;
    gsBoardCtx.beginPath();
    gsBoardCtx.moveTo(x, y);
    gsBoardCtx.lineTo(trailEndX, trailEndY);
    gsBoardCtx.stroke();
  }

  // rotating sweep line preview
  const ang = angDeg * Math.PI/180;

  const endX = x + Math.cos(ang) * AA_DEFAULTS.radius;
  const endY = y + Math.sin(ang) * AA_DEFAULTS.radius;

  gsBoardCtx.globalAlpha = 0.6;
  gsBoardCtx.strokeStyle = colorFor(currentPlacer);
  gsBoardCtx.lineWidth = 2;
  gsBoardCtx.lineCap = "round";
  gsBoardCtx.beginPath();
  gsBoardCtx.moveTo(x, y);
  gsBoardCtx.lineTo(endX, endY);
  gsBoardCtx.stroke();

  // translucent white highlight on sweep line
  gsBoardCtx.globalAlpha = 0.5;
  gsBoardCtx.strokeStyle = "white";
  gsBoardCtx.lineWidth = 1;
  gsBoardCtx.lineCap = "round";
  gsBoardCtx.beginPath();
  gsBoardCtx.moveTo(x, y);
  gsBoardCtx.lineTo(endX, endY);
  gsBoardCtx.stroke();

  gsBoardCtx.globalAlpha = 0.4;
  gsBoardCtx.fillStyle = colorFor(currentPlacer);
  gsBoardCtx.beginPath();
  gsBoardCtx.arc(x, y, 6, 0, Math.PI*2);
  gsBoardCtx.fill();

  // inner white circle for volume
  gsBoardCtx.globalAlpha = 0.6;
  gsBoardCtx.fillStyle = "white";
  gsBoardCtx.beginPath();
  gsBoardCtx.arc(x, y, 4, 0, Math.PI*2);
  gsBoardCtx.fill();

  // colored center dot matching player color
  gsBoardCtx.globalAlpha = 1;
  gsBoardCtx.fillStyle = colorFor(currentPlacer);
  gsBoardCtx.beginPath();
  gsBoardCtx.arc(x, y, 1.5, 0, Math.PI*2);
  gsBoardCtx.fill();
  gsBoardCtx.restore();
}


function onHandleMove(e){
  if(!handleCircle.active)return;
  e.preventDefault();
  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x, y } = designToBoardCoords(designX, designY);

  handleCircle.baseX = x;
  handleCircle.baseY = y;
  gsBoardCanvas.style.cursor = 'grabbing';
  document.body.style.cursor = 'grabbing';
}

function onHandleUp(){
  if(!handleCircle.active || !handleCircle.pointRef) return;
  const { baseX, baseY } = handleCircle;
  let plane= handleCircle.pointRef;
  if(isGameOver || !gameMode){
    plane.angle = handleCircle.origAngle;
    cleanupHandle();
    updateBoardCursorForHover(baseX, baseY);
    return;
  }
  let dx= handleCircle.shakyX - plane.x;
  let dy= handleCircle.shakyY - plane.y;

  let dragDistance = Math.hypot(dx, dy);
  // Cancel the move if released before the first tick mark
  if(dragDistance < CELL_SIZE){
    plane.angle = handleCircle.origAngle;
    cleanupHandle();
    updateBoardCursorForHover(baseX, baseY);
    return;
  }
  if(dragDistance > MAX_DRAG_DISTANCE){
    dx *= MAX_DRAG_DISTANCE/dragDistance;
    dy *= MAX_DRAG_DISTANCE/dragDistance;
    dragDistance = MAX_DRAG_DISTANCE;
  }

  // угол «натяжки»
  const dragAngle = Math.atan2(dy, dx);

  // дальность в пикселях
  const effectiveFlightRangeCells = getEffectiveFlightRangeCells(plane);
  const flightDistancePx = effectiveFlightRangeCells * CELL_SIZE;
  const speedPxPerSec = flightDistancePx / FIELD_FLIGHT_DURATION_SEC;
  const scale = dragDistance / MAX_DRAG_DISTANCE;

  // скорость — ПРОТИВ направления натяжки (px/sec)
  let vx= -Math.cos(dragAngle) * scale * speedPxPerSec;
  let vy= -Math.sin(dragAngle) * scale * speedPxPerSec;

  // нос по скорости
  plane.angle = Math.atan2(vy, vx) + Math.PI/2;

  flyingPoints.push({
    plane, vx, vy,
    timeLeft: FIELD_FLIGHT_DURATION_SEC,
    collisionCooldown:0,
    lastHitPlane:null,
    lastHitCooldown:0
  });

  plane.activeTurnBuff = null;

  if(!hasShotThisRound){
    hasShotThisRound = true;
    renderScoreboard();
  }
  cleanupHandle();
  updateBoardCursorForHover(baseX, baseY);
}
function cleanupHandle(){
  handleCircle.active= false;
  handleCircle.pointRef= null;
  handleCircle.origAngle = null;
  // Hide overlay canvas when aiming ends
  aimCanvas.style.display = "none";
  aimCtx.clearRect(0,0,aimCanvas.width,aimCanvas.height);
  document.body.style.cursor = '';
  window.removeEventListener("mousemove", onHandleMove);
  window.removeEventListener("mouseup", onHandleUp);
  window.removeEventListener("touchmove", onHandleMove);
  window.removeEventListener("touchend", onHandleUp);
  window.removeEventListener("pointermove", onHandleMove);
  window.removeEventListener("pointerup", onHandleUp);
}

/* ======= AI ======= */
function doComputerMove(){
  if (gameMode!=="computer" || isGameOver) return;

  const aiPlanes = points.filter(p=> p.color==="blue" && p.isAlive && !p.burning);
  const enemies  = points.filter(p=> p.color==="green" && p.isAlive && !p.burning);
  if(!aiPlanes.length || !enemies.length) return;

  const shouldUseFlagsMode = isFlagsModeEnabled();
  const homeBase = getBaseAnchor("blue");
  const availableEnemyFlags = shouldUseFlagsMode ? getAvailableFlagsByColor("green") : [];

  // 1. If we are carrying the enemy flag, prioritize returning home
  const carrier = shouldUseFlagsMode ? aiPlanes.find(p => {
    if(!p.carriedFlagId) return false;
    const carriedFlag = getFlagById(p.carriedFlagId);
    return carriedFlag?.color === "green" && !flyingPoints.some(fp=>fp.plane===p);
  }) : null;
  if(carrier){
    const move = planPathToPoint(carrier, homeBase.x, homeBase.y);
    if(move){
      issueAIMove(carrier, move.vx, move.vy);
    }
    return;
  }

  // 2. If our flag is stolen, focus fire on the carrier
  let targetEnemies = enemies;
  const stolenBlueFlagCarrier = shouldUseFlagsMode ? getFlagCarrierForColor("blue") : null;
  if(stolenBlueFlagCarrier && stolenBlueFlagCarrier.color !== "blue"){
    targetEnemies = enemies.filter(e=>e===stolenBlueFlagCarrier);
  } else if(availableEnemyFlags.length){
    // 3. Enemy flag available – attempt to steal it
    let bestCap = null;
    for(const plane of aiPlanes){
      if(flyingPoints.some(fp=>fp.plane===plane)) continue;
      for(const flag of availableEnemyFlags){
        const targetAnchor = getFlagAnchor(flag);
        const move = planPathToPoint(plane, targetAnchor.x, targetAnchor.y);
        if(move && (!bestCap || move.totalDist < bestCap.totalDist)){
          bestCap = {plane, ...move};
        }
      }
    }
    if(bestCap){
      issueAIMove(bestCap.plane, bestCap.vx, bestCap.vy);
      return;
    }
  }

  // 4. Attack logic (direct or with bounce)
    const flightDistancePx = settings.flightRangeCells * CELL_SIZE;
  const speedPxPerSec    = flightDistancePx / FIELD_FLIGHT_DURATION_SEC;
  let best = null; // {plane, enemy, vx, vy, totalDist}

  for(const plane of aiPlanes){
    if(flyingPoints.some(fp=>fp.plane===plane)) continue;

    for(const enemy of targetEnemies){
      if(isPathClear(plane.x, plane.y, enemy.x, enemy.y)){
        let dx= enemy.x - plane.x;
        let dy= enemy.y - plane.y;
        let baseAngle= Math.atan2(dy, dx);
        let dev = getRandomDeviation(Math.hypot(dx,dy), AI_MAX_ANGLE_DEVIATION);
        let ang = baseAngle + dev;

        const dist = Math.hypot(dx,dy);
        const scale = Math.min(dist / MAX_DRAG_DISTANCE, 1);

        const vx = Math.cos(ang) * scale * speedPxPerSec;
        const vy = Math.sin(ang) * scale * speedPxPerSec;
        const totalDist = dist;

        if(!best || totalDist < best.totalDist){
          best = {plane, enemy, vx, vy, totalDist};
        }
      } else {
        const mirror = findMirrorShot(plane, enemy);
        if(mirror){
          const dx = mirror.mirrorTarget.x - plane.x;
          const dy = mirror.mirrorTarget.y - plane.y;
          const ang = Math.atan2(dy, dx) + getRandomDeviation(mirror.totalDist, AI_MAX_ANGLE_DEVIATION);

          const scale = Math.min(mirror.totalDist / (2*MAX_DRAG_DISTANCE), 1);
          const vx = Math.cos(ang) * scale * speedPxPerSec;
          const vy = Math.sin(ang) * scale * speedPxPerSec;

          if(!best || mirror.totalDist < best.totalDist){
            best = {plane, enemy, vx, vy, totalDist: mirror.totalDist};
          }
        }
      }
    }
  }

  // 5. If nothing else, crawl closer to nearest enemy
  if(!best){
    const plane = aiPlanes[0];
    const enemy = targetEnemies.reduce((a,b)=> (dist(plane,a)<dist(plane,b)?a:b));
    const dx= enemy.x - plane.x, dy= enemy.y - plane.y;
    const ang = Math.atan2(dy, dx) + getRandomDeviation(Math.hypot(dx,dy), AI_MAX_ANGLE_DEVIATION);

    const desired = Math.min(Math.hypot(dx,dy)*0.5, MAX_DRAG_DISTANCE);
    const scale   = desired / MAX_DRAG_DISTANCE;

    best = {
      plane, enemy,
      vx: Math.cos(ang)*scale*speedPxPerSec,
      vy: Math.sin(ang)*scale*speedPxPerSec,
      totalDist: desired
    };
  }

  if(best){
    issueAIMove(best.plane, best.vx, best.vy);
  }
}

function planPathToPoint(plane, tx, ty){
    const flightDistancePx = settings.flightRangeCells * CELL_SIZE;
  const speedPxPerSec    = flightDistancePx / FIELD_FLIGHT_DURATION_SEC;

  if(isPathClear(plane.x, plane.y, tx, ty)){
    const dx = tx - plane.x;
    const dy = ty - plane.y;
    const ang = Math.atan2(dy, dx) + getRandomDeviation(Math.hypot(dx,dy), AI_MAX_ANGLE_DEVIATION);
    const dist = Math.hypot(dx, dy);
    const scale = Math.min(dist / MAX_DRAG_DISTANCE, 1);
    return {vx: Math.cos(ang)*scale*speedPxPerSec, vy: Math.sin(ang)*scale*speedPxPerSec, totalDist: dist};
  }

  const mirror = findMirrorShot(plane, {x:tx, y:ty});
  if(mirror){
    const dx = mirror.mirrorTarget.x - plane.x;
    const dy = mirror.mirrorTarget.y - plane.y;
    const ang = Math.atan2(dy, dx) + getRandomDeviation(mirror.totalDist, AI_MAX_ANGLE_DEVIATION);
    const scale = Math.min(mirror.totalDist / (2*MAX_DRAG_DISTANCE), 1);
    return {vx: Math.cos(ang)*scale*speedPxPerSec, vy: Math.sin(ang)*scale*speedPxPerSec, totalDist: mirror.totalDist};
  }
  return null;
}

function issueAIMove(plane, vx, vy){
  plane.angle = Math.atan2(vy, vx) + Math.PI/2;
  flyingPoints.push({
    plane, vx, vy,
    timeLeft: FIELD_FLIGHT_DURATION_SEC,
    collisionCooldown:0,
    lastHitPlane:null,
    lastHitCooldown:0
  });
  if(!hasShotThisRound){
    hasShotThisRound = true;
    renderScoreboard();
  }
  roundTextTimer = 0;
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function getRandomDeviation(distance, maxDev){
  let nd = Math.min(distance/ATTACK_RANGE_PX, 1);
  return (Math.random()*2 - 1) * (maxDev * nd);
}

/* Зеркальный выстрел (одно отражение) */
function findMirrorShot(plane, enemy){
  let best = null; // {mirrorTarget, totalDist}

  for(const collider of colliders){
    const edges = getColliderEdges(collider, 0);

    for(const e of edges){
      const mirrorTarget = reflectPointAcrossLine(enemy.x, enemy.y, e.x1, e.y1, e.x2, e.y2);

      // Пересечение линии (plane -> mirrorTarget) с ребром
      const inter = lineSegmentIntersection(
        plane.x, plane.y, mirrorTarget.x, mirrorTarget.y,
        e.x1, e.y1, e.x2, e.y2
      );
      if(!inter) continue;

      const ignoreEdge = { colliderId: collider.id, edgeIndex: e.edgeIndex };

      // Путь чист?
      if(!isPathClearExceptEdge(plane.x, plane.y, inter.x, inter.y, collider, ignoreEdge)) continue;
      if(!isPathClearExceptEdge(inter.x, inter.y, enemy.x, enemy.y, collider, ignoreEdge)) continue;

      const totalDist = Math.hypot(plane.x - inter.x, plane.y - inter.y) +
                        Math.hypot(inter.x  - enemy.x, inter.y  - enemy.y);

      if(!best || totalDist < best.totalDist){
        best = {mirrorTarget, totalDist};
      }
    }
  }
  return best;
}

/* ======= PHYSICS / COLLISIONS ======= */
function clipPolygon(points, a, b, c){
  if(!points.length) return [];
  const result = [];
  const count = points.length;
  for(let i = 0; i < count; i++){
    const current = points[i];
    const next = points[(i + 1) % count];
    const currentInside = a * current.x + b * current.y <= c + 1e-6;
    const nextInside = a * next.x + b * next.y <= c + 1e-6;
    if(currentInside && nextInside){
      result.push(next);
    } else if(currentInside && !nextInside){
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const denom = a * dx + b * dy;
      if(denom !== 0){
        const t = (c - a * current.x - b * current.y) / denom;
        result.push({ x: current.x + dx * t, y: current.y + dy * t });
      }
    } else if(!currentInside && nextInside){
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const denom = a * dx + b * dy;
      if(denom !== 0){
        const t = (c - a * current.x - b * current.y) / denom;
        result.push({ x: current.x + dx * t, y: current.y + dy * t });
      }
      result.push(next);
    }
  }
  return result;
}

function getDiagonalColliderLocalPolygon(collider, margin = 0){
  const halfWidth = collider.halfWidth;
  const halfHeight = collider.halfHeight;
  const width = halfWidth * 2;
  const height = halfHeight * 2;
  const bandHalfWidth = Number.isFinite(collider.bandHalfWidth)
    ? collider.bandHalfWidth
    : MAP_BRICK_THICKNESS;
  const offset = margin * Math.SQRT2;
  let polygon = [
    { x: -margin, y: -margin },
    { x: width + margin, y: -margin },
    { x: width + margin, y: height + margin },
    { x: -margin, y: height + margin }
  ];

  if(collider.diagSign < 0){
    polygon = clipPolygon(polygon, 1, 1, width + bandHalfWidth + offset);
    polygon = clipPolygon(polygon, -1, -1, bandHalfWidth + offset - width);
  } else {
    polygon = clipPolygon(polygon, 1, -1, bandHalfWidth + offset);
    polygon = clipPolygon(polygon, -1, 1, bandHalfWidth + offset);
  }

  return polygon;
}

function appendColliderPath(ctx2d, collider){
  if(!ctx2d || !collider) return;

  ctx2d.save();
  ctx2d.translate(collider.cx, collider.cy);
  ctx2d.rotate(collider.rotation);

  if(collider.type === "diag"){
    const polygon = getDiagonalColliderLocalPolygon(collider, 0);
    if(polygon.length > 0){
      ctx2d.moveTo(polygon[0].x, polygon[0].y);
      for(let i = 1; i < polygon.length; i += 1){
        ctx2d.lineTo(polygon[i].x, polygon[i].y);
      }
      ctx2d.closePath();
    }
  } else {
    ctx2d.rect(
      -collider.halfWidth,
      -collider.halfHeight,
      collider.halfWidth * 2,
      collider.halfHeight * 2
    );
  }

  ctx2d.restore();
}

function applyBrickTrailClip(ctx2d){
  if(!ctx2d || !Array.isArray(colliders) || colliders.length === 0) return;

  ctx2d.beginPath();
  ctx2d.rect(FIELD_LEFT, FIELD_TOP, FIELD_WIDTH, FIELD_HEIGHT);
  for(const collider of colliders){
    appendColliderPath(ctx2d, collider);
  }
  ctx2d.clip("evenodd");
}

function getDiagonalColliderEdges(collider, margin = 0){
  const halfWidth = collider.halfWidth;
  const halfHeight = collider.halfHeight;
  const polygon = getDiagonalColliderLocalPolygon(collider, margin);
  if(polygon.length < 2) return [];

  const cos = Math.cos(collider.rotation);
  const sin = Math.sin(collider.rotation);
  const worldPoints = polygon.map(point => {
    const localX = point.x - halfWidth;
    const localY = point.y - halfHeight;
    return {
      x: collider.cx + localX * cos - localY * sin,
      y: collider.cy + localX * sin + localY * cos
    };
  });

  return worldPoints.map((point, index) => {
    const next = worldPoints[(index + 1) % worldPoints.length];
    return {
      x1: point.x,
      y1: point.y,
      x2: next.x,
      y2: next.y,
      colliderId: collider.id,
      edgeIndex: index
    };
  });
}

function getColliderEdges(collider, margin = 0){
  if(collider.type === "diag"){
    return getDiagonalColliderEdges(collider, margin);
  }
  const hw = collider.halfWidth + margin;
  const hh = collider.halfHeight + margin;
  const cos = Math.cos(collider.rotation);
  const sin = Math.sin(collider.rotation);
  const corners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh }
  ].map(point => ({
    x: collider.cx + point.x * cos - point.y * sin,
    y: collider.cy + point.x * sin + point.y * cos
  }));

  return corners.map((point, index) => {
    const next = corners[(index + 1) % corners.length];
    return {
      x1: point.x,
      y1: point.y,
      x2: next.x,
      y2: next.y,
      colliderId: collider.id,
      edgeIndex: index
    };
  });
}

function getColliderSurfaces(collider){
  if(collider.type === "diag"){
    return buildDiagonalColliderSurfaces(collider);
  }
  return buildRectColliderSurfaces(collider);
}

function buildRectColliderSurfaces(collider){
  const hw = collider.halfWidth;
  const hh = collider.halfHeight;
  const cos = Math.cos(collider.rotation);
  const sin = Math.sin(collider.rotation);
  const localCorners = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh }
  ];
  const corners = localCorners.map(point => ({
    x: collider.cx + point.x * cos - point.y * sin,
    y: collider.cy + point.x * sin + point.y * cos
  }));

  return corners.map((point, index) => {
    const next = corners[(index + 1) % corners.length];
    const localA = localCorners[index];
    const localB = localCorners[(index + 1) % localCorners.length];
    const isVertical = localA.x === localB.x;
    const kind = isVertical ? "V" : "H";
    const normal = getSurfaceNormal(point, next, collider);
    if(!normal) return null;
    return {
      p1: { x: point.x, y: point.y },
      p2: { x: next.x, y: next.y },
      normal,
      type: "axis",
      kind,
      id: `${collider.id}-axis-${index}`,
      colliderId: collider.id,
      spriteName: collider.spriteName
    };
  }).filter(Boolean);
}

function buildDiagonalColliderSurfaces(collider){
  const hw = collider.halfWidth;
  const hh = collider.halfHeight;
  const cos = Math.cos(collider.rotation);
  const sin = Math.sin(collider.rotation);
  const polygon = getDiagonalColliderLocalPolygon(collider, 0);
  if(polygon.length < 2) return [];

  const localPoints = polygon.map(point => ({
    x: point.x - hw,
    y: point.y - hh
  }));
  const worldPoints = localPoints.map(point => ({
    x: collider.cx + point.x * cos - point.y * sin,
    y: collider.cy + point.x * sin + point.y * cos
  }));

  return worldPoints.map((point, index) => {
    const next = worldPoints[(index + 1) % worldPoints.length];
    const localA = localPoints[index];
    const localB = localPoints[(index + 1) % localPoints.length];
    const isVertical = localA.x === localB.x;
    const isHorizontal = localA.y === localB.y;
    const isAxisAligned = isVertical || isHorizontal;
    const kind = isAxisAligned ? (isVertical ? "V" : "H") : "DIAG";
    const normal = getSurfaceNormal(point, next, collider);
    if(!normal) return null;
    return {
      p1: { x: point.x, y: point.y },
      p2: { x: next.x, y: next.y },
      normal,
      type: isAxisAligned ? "axis" : "diag",
      kind,
      id: `${collider.id}-${isAxisAligned ? "axis" : "diag"}-${index}`,
      colliderId: collider.id,
      spriteName: collider.spriteName
    };
  }).filter(Boolean);
}

function getSurfaceNormal(p1, p2, collider){
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  let nx = dy;
  let ny = -dx;
  const len = Math.hypot(nx, ny);
  if(len === 0) return null;
  nx /= len;
  ny /= len;
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  const toCenterX = collider.cx - midX;
  const toCenterY = collider.cy - midY;
  if(nx * toCenterX + ny * toCenterY > 0){
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function buildColliderSurfaces(colliders){
  return colliders.flatMap(collider => getColliderSurfaces(collider));
}

function buildFieldBorderSurfaces(){
  const leftX = FIELD_LEFT + FIELD_BORDER_OFFSET_X;
  const rightX = FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X;
  const topY = FIELD_TOP + FIELD_BORDER_OFFSET_Y;
  const bottomY = FIELD_TOP + FIELD_HEIGHT - FIELD_BORDER_OFFSET_Y;

  if(!Number.isFinite(leftX) || !Number.isFinite(rightX) ||
     !Number.isFinite(topY) || !Number.isFinite(bottomY)){
    return [];
  }

  return [
    {
      p1: { x: leftX, y: topY },
      p2: { x: leftX, y: bottomY },
      normal: { x: 1, y: 0 },
      kind: "V",
      type: "field",
      id: "field-border-left"
    },
    {
      p1: { x: rightX, y: topY },
      p2: { x: rightX, y: bottomY },
      normal: { x: -1, y: 0 },
      kind: "V",
      type: "field",
      id: "field-border-right"
    },
    {
      p1: { x: leftX, y: topY },
      p2: { x: rightX, y: topY },
      normal: { x: 0, y: 1 },
      kind: "H",
      type: "field",
      id: "field-border-top"
    },
    {
      p1: { x: leftX, y: bottomY },
      p2: { x: rightX, y: bottomY },
      normal: { x: 0, y: -1 },
      kind: "H",
      type: "field",
      id: "field-border-bottom"
    }
  ];
}

function rebuildCollisionSurfaces(){
  colliderSurfaces = [
    ...buildColliderSurfaces(colliders),
    ...buildFieldBorderSurfaces()
  ];
}

function isPathClear(x1,y1,x2,y2){
  for(const collider of colliders){
    if(checkLineIntersectionWithCollider(x1,y1,x2,y2,collider)) return false;
  }
  return true;
}
function isPathClearExceptEdge(x1,y1,x2,y2, collider, edge){
  for(const entry of colliders){
    if(entry!==collider){
      if(checkLineIntersectionWithCollider(x1,y1,x2,y2,entry)) return false;
    } else {
      if(checkLineIntersectionWithCollider(x1,y1,x2,y2,entry, edge)) return false;
    }
  }
  return true;
}

function checkLineIntersectionWithCollider(x1,y1,x2,y2,collider, ignoreEdge=null){
  const margin = POINT_RADIUS;
  const edges = getColliderEdges(collider, margin);

  for(const e of edges){
    if(ignoreEdge && e.colliderId === ignoreEdge.colliderId && e.edgeIndex === ignoreEdge.edgeIndex) continue;
    if(doLinesIntersect(x1,y1,x2,y2, e.x1,e.y1,e.x2,e.y2)) return true;
  }
  return false;
}

function doLinesIntersect(x1,y1,x2,y2, x3,y3,x4,y4){
  function ccw(ax,ay,bx,by,cx,cy){
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }
  return (ccw(x1,y1,x3,y3,x4,y4) !== ccw(x2,y2,x3,y3,x4,y4)) &&
         (ccw(x1,y1,x2,y2,x3,y3) !== ccw(x1,y1,x2,y2,x4,y4));
}

function reflectPointAcrossLine(px, py, x1, y1, x2, y2){
  const dx = x2 - x1;
  const dy = y2 - y1;
  const denom = dx * dx + dy * dy;
  if(denom === 0){
    return { x: px, y: py };
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / denom;
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { x: 2 * projX - px, y: 2 * projY - py };
}

/* Пересечение двух отрезков */
function lineSegmentIntersection(x1,y1,x2,y2, x3,y3,x4,y4){
  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if(denom === 0) return null;
  const px = ((x1*y2 - y1*x2)*(x3-x4) - (x1-x2)*(x3*y4 - y3*x4)) / denom;
  const py = ((x1*y2 - y1*x2)*(y3-y4) - (y1-y2)*(x3*y4 - y3*x4)) / denom;

  if( Math.min(x1,x2)-1e-6 <= px && px <= Math.max(x1,x2)+1e-6 &&
      Math.min(y1,y2)-1e-6 <= py && py <= Math.max(y1,y2)+1e-6 &&
      Math.min(x3,x4)-1e-6 <= px && px <= Math.max(x3,x4)+1e-6 &&
      Math.min(y3,y4)-1e-6 <= py && py <= Math.max(y3,y4)+1e-6 ){
    return {x:px, y:py};
  }
  return null;
}

function findFirstColliderHit(prevX, prevY, currX, currY){
  let closest = null;
  let minDist = Infinity;
  const moveX = currX - prevX;
  const moveY = currY - prevY;

  for(const collider of colliders){
    const edges = getColliderEdges(collider, POINT_RADIUS);
    for(const edge of edges){
      const hit = lineSegmentIntersection(
        prevX, prevY, currX, currY,
        edge.x1, edge.y1, edge.x2, edge.y2
      );
      if(!hit) continue;
      const dist = Math.hypot(hit.x - prevX, hit.y - prevY);
      if(dist >= minDist) continue;
      let nx = -(edge.y2 - edge.y1);
      let ny = edge.x2 - edge.x1;
      const nLen = Math.hypot(nx, ny);
      if(nLen === 0) continue;
      nx /= nLen;
      ny /= nLen;
      if(nx * moveX + ny * moveY > 0){
        nx = -nx;
        ny = -ny;
      }
      closest = {
        collider,
        hitPoint: { x: hit.x, y: hit.y },
        edgeNormal: { x: nx, y: ny }
      };
      minDist = dist;
    }
  }

  return closest;
}

function findFirstSurfaceHit(p0, p1, radius){
  let best = null;
  const moveX = p1.x - p0.x;
  const moveY = p1.y - p0.y;
  const EPS_T = 1e-4;
  const EPS_DOT = 1e-6;
  const surfacePriority = { DIAG: 3, V: 2, H: 1 };
  const getSurfaceKind = surface => {
    if(surface?.kind) return surface.kind;
    if(surface?.type === "diag") return "DIAG";
    const nx = Math.abs(surface?.normal?.x ?? 0);
    const ny = Math.abs(surface?.normal?.y ?? 0);
    if(nx > ny) return "V";
    return "H";
  };
  const getAbsDot = entry => Math.abs(moveX * entry.normal.x + moveY * entry.normal.y);
  for(const surface of colliderSurfaces){
    const hit = getSurfaceHit(p0, p1, radius, surface);
    if(!hit) continue;
    if(!best){
      best = hit;
      continue;
    }
    if(hit.t < best.t - EPS_T){
      best = hit;
      continue;
    }
    if(Math.abs(hit.t - best.t) <= EPS_T){
      const hitDot = getAbsDot(hit);
      const bestDot = getAbsDot(best);
      if(hitDot > bestDot + EPS_DOT){
        best = hit;
        continue;
      }
      if(Math.abs(hitDot - bestDot) <= EPS_DOT){
        const hitPriority = surfacePriority[getSurfaceKind(hit.surface)] ?? 0;
        const bestPriority = surfacePriority[getSurfaceKind(best.surface)] ?? 0;
        if(hitPriority > bestPriority){
          best = hit;
        }
      }
    }
  }
  return best;
}

function getSurfaceHit(p0, p1, radius, surface){
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  const speed2 = vx * vx + vy * vy;
  if(speed2 === 0) return null;

  const candidates = [];

  const denom = surface.normal.x * vx + surface.normal.y * vy;
  if(denom < 0){
    const d0 = surface.normal.x * (p0.x - surface.p1.x) + surface.normal.y * (p0.y - surface.p1.y);
    const t = (radius - d0) / denom;
    if(t >= 0 && t <= 1){
      const hitX = p0.x + vx * t - surface.normal.x * radius;
      const hitY = p0.y + vy * t - surface.normal.y * radius;
      if(isPointOnSegment(hitX, hitY, surface.p1, surface.p2)){
        candidates.push({
          t,
          normal: surface.normal,
          hitPoint: { x: hitX, y: hitY },
          surface
        });
      }
    }
  }

  for(const endpoint of [surface.p1, surface.p2]){
    const hit = getEndpointHit(p0, { x: vx, y: vy }, radius, endpoint);
    if(hit){
      candidates.push({
        t: hit.t,
        normal: hit.normal,
        hitPoint: { x: endpoint.x, y: endpoint.y },
        surface
      });
    }
  }

  if(!candidates.length) return null;
  candidates.sort((a, b) => a.t - b.t);
  return candidates[0];
}

function getEndpointHit(p0, v, radius, endpoint){
  const dx = p0.x - endpoint.x;
  const dy = p0.y - endpoint.y;
  const a = v.x * v.x + v.y * v.y;
  const b = 2 * (dx * v.x + dy * v.y);
  const c = dx * dx + dy * dy - radius * radius;
  const disc = b * b - 4 * a * c;
  if(disc < 0 || a === 0) return null;
  const sqrt = Math.sqrt(disc);
  const t1 = (-b - sqrt) / (2 * a);
  const t2 = (-b + sqrt) / (2 * a);
  const t = [t1, t2].find(value => value >= 0 && value <= 1);
  if(t === undefined) return null;
  const hitX = p0.x + v.x * t;
  const hitY = p0.y + v.y * t;
  let nx = hitX - endpoint.x;
  let ny = hitY - endpoint.y;
  const len = Math.hypot(nx, ny);
  if(len === 0) return null;
  nx /= len;
  ny /= len;
  if(nx * v.x + ny * v.y >= 0) return null;
  return { t, normal: { x: nx, y: ny } };
}

function isPointOnSegment(px, py, p1, p2){
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  if(len2 === 0) return false;
  const t = ((px - p1.x) * dx + (py - p1.y) * dy) / len2;
  if(t < -1e-4 || t > 1 + 1e-4) return false;
  const closestX = p1.x + dx * t;
  const closestY = p1.y + dy * t;
  return Math.hypot(px - closestX, py - closestY) <= 1e-4;
}

function distancePointToSegment(px, py, p1, p2){
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  if(len2 === 0){
    return Math.hypot(px - p1.x, py - p1.y);
  }
  const t = ((px - p1.x) * dx + (py - p1.y) * dy) / len2;
  const clamped = Math.max(0, Math.min(1, t));
  const closestX = p1.x + dx * clamped;
  const closestY = p1.y + dy * clamped;
  return Math.hypot(px - closestX, py - closestY);
}

function isPointIntersectingSurface(point, radius, surface){
  if(!surface?.p1 || !surface?.p2) return false;
  const distance = distancePointToSegment(point.x, point.y, surface.p1, surface.p2);
  return distance < radius - 1e-4;
}

function getPlaneDebugId(plane){
  return plane?.id ?? plane?.uid ?? plane?.name ?? null;
}

function logCollisionTOI({
  plane,
  p0,
  p1,
  surfaceType,
  normal,
  tImpact,
  vIn,
  vOut,
  tieBreakReason
}){
  if(!DEBUG_COLLISIONS_TOI) return;
  const payload = {
    mapName: currentMapName,
    planeId: getPlaneDebugId(plane),
    p0,
    p1,
    surface: {
      type: surfaceType,
      normal
    },
    tImpact,
    v_in: vIn,
    v_out: vOut
  };
  if(tieBreakReason){
    payload.tieBreakReason = tieBreakReason;
  }
  console.log("[COLLISION][TOI]", payload);
}

function logCollisionVerbose(payload){
  if(!DEBUG_COLLISIONS_VERBOSE) return;
  console.log("[COLLISION][VERBOSE]", payload);
}

function resolveFlightSurfaceCollision(fp, startX, startY, deltaSec){
  const p = fp.plane;
  const radius = POINT_RADIUS;
  const EPS_PUSH = 0.5;
  const EXTRA_PUSH = EPS_PUSH * 0.5;
  const MAX_PUSH = EPS_PUSH * 2;
  const TINY_EPSILON = 1e-4;
  const MAX_BOUNCES_PER_TICK = 5;
  let remainingTime = deltaSec;
  let currX = startX;
  let currY = startY;
  let collided = false;
  let bounces = 0;

  while(remainingTime > TINY_EPSILON && bounces < MAX_BOUNCES_PER_TICK){
    const endX = currX + fp.vx * remainingTime;
    const endY = currY + fp.vy * remainingTime;
    const hit = findFirstSurfaceHit({ x: currX, y: currY }, { x: endX, y: endY }, radius);
    if(!hit){
      p.x = endX;
      p.y = endY;
      return collided;
    }

    const moveX = endX - currX;
    const moveY = endY - currY;
    const hitX = currX + moveX * hit.t;
    const hitY = currY + moveY * hit.t;
    const incoming = { vx: fp.vx, vy: fp.vy };

    if(settings.sharpEdges && hit.surface.type === "field"){
      p.x = hitX;
      p.y = hitY;
      destroyPlane(fp);
      return true;
    }

    const dot = incoming.vx * hit.normal.x + incoming.vy * hit.normal.y;
    const speed = Math.hypot(incoming.vx, incoming.vy);
    const a = speed > 0 ? Math.abs(dot / speed) : 1;
    const collisionResponse = a < SLIDE_THRESHOLD ? "slide" : "reflect";
    if(collisionResponse === "slide"){
      fp.vx = incoming.vx - dot * hit.normal.x;
      fp.vy = incoming.vy - dot * hit.normal.y;
    } else {
      fp.vx = incoming.vx - 2 * dot * hit.normal.x;
      fp.vy = incoming.vy - 2 * dot * hit.normal.y;
    }

    let totalPush = Math.min(EPS_PUSH, MAX_PUSH);
    p.x = hitX + hit.normal.x * totalPush;
    p.y = hitY + hit.normal.y * totalPush;
    if(isPointIntersectingSurface({ x: p.x, y: p.y }, radius, hit.surface)){
      const extraPush = Math.min(EXTRA_PUSH, MAX_PUSH - totalPush);
      if(extraPush > 0){
        p.x += hit.normal.x * extraPush;
        p.y += hit.normal.y * extraPush;
        totalPush += extraPush;
      }
    }

    logCollisionVerbose({
      mapName: currentMapName,
      planeId: getPlaneDebugId(p),
      bounce: bounces + 1,
      surface: hit.surface.type,
      normal: { x: hit.normal.x, y: hit.normal.y },
      tHit: hit.t,
      remainingTime,
      response: collisionResponse,
      a,
      slideThreshold: SLIDE_THRESHOLD,
      epsPush: EPS_PUSH,
      totalPush
    });

    logCollisionTOI({
      plane: p,
      p0: { x: currX, y: currY },
      p1: { x: endX, y: endY },
      surfaceType: hit.surface.type,
      normal: { x: hit.normal.x, y: hit.normal.y },
      tImpact: hit.t,
      vIn: { vx: incoming.vx, vy: incoming.vy },
      vOut: { vx: fp.vx, vy: fp.vy }
    });

    collided = true;
    remainingTime = remainingTime * Math.max(0, 1 - hit.t);
    currX = p.x;
    currY = p.y;
    bounces += 1;
    if(remainingTime <= TINY_EPSILON){
      break;
    }
  }

  return collided;
}

function isPointInsideFieldBounds(x, y){
  return (
    x >= FIELD_LEFT &&
    x <= FIELD_LEFT + FIELD_WIDTH &&
    y >= FIELD_TOP &&
    y <= FIELD_TOP + FIELD_HEIGHT
  );
}

function clampSegmentToFieldBounds(start, end){
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const candidates = [];
  const left = FIELD_LEFT;
  const right = FIELD_LEFT + FIELD_WIDTH;
  const top = FIELD_TOP;
  const bottom = FIELD_TOP + FIELD_HEIGHT;

  if(dx !== 0){
    const tLeft = (left - start.x) / dx;
    const tRight = (right - start.x) / dx;
    candidates.push(tLeft, tRight);
  }
  if(dy !== 0){
    const tTop = (top - start.y) / dy;
    const tBottom = (bottom - start.y) / dy;
    candidates.push(tTop, tBottom);
  }

  let bestT = null;
  for(const t of candidates){
    if(!Number.isFinite(t) || t <= 0 || t > 1) continue;
    const x = start.x + dx * t;
    const y = start.y + dy * t;
    if(!isPointInsideFieldBounds(x, y)) continue;
    if(bestT === null || t < bestT){
      bestT = t;
    }
  }

  if(bestT === null){
    return end;
  }

  return {
    x: start.x + dx * bestT,
    y: start.y + dy * bestT
  };
}

function buildPredictedPathForAim(plane, dragVector){
  const dragDistance = Math.hypot(dragVector.x, dragVector.y);
  const maxRange = getEffectiveFlightRangeCells(plane) * CELL_SIZE;
  const rangeScale = MAX_DRAG_DISTANCE > 0 ? Math.min(1, dragDistance / MAX_DRAG_DISTANCE) : 0;
  let remainingDistance = maxRange * rangeScale;
  const points = [{ x: plane.x, y: plane.y }];
  const MAX_RICOCHETS = 12;
  const TINY_EPSILON = 1e-4;
  const EPS_PUSH = 0.5;

  if(remainingDistance <= TINY_EPSILON || dragDistance <= TINY_EPSILON){
    return points;
  }

  let dirX = -dragVector.x / dragDistance;
  let dirY = -dragVector.y / dragDistance;
  let currX = plane.x;
  let currY = plane.y;
  let ricochets = 0;

  while(remainingDistance > TINY_EPSILON && ricochets <= MAX_RICOCHETS){
    const targetX = currX + dirX * remainingDistance;
    const targetY = currY + dirY * remainingDistance;
    const hit = findFirstSurfaceHit(
      { x: currX, y: currY },
      { x: targetX, y: targetY },
      POINT_RADIUS
    );

    if(!hit){
      const endPoint = { x: targetX, y: targetY };
      const boundedEnd = isPointInsideFieldBounds(endPoint.x, endPoint.y)
        ? endPoint
        : clampSegmentToFieldBounds({ x: currX, y: currY }, endPoint);
      points.push(boundedEnd);
      break;
    }

    const segmentDistance = remainingDistance * hit.t;
    const hitX = currX + (targetX - currX) * hit.t;
    const hitY = currY + (targetY - currY) * hit.t;
    const boundedHit = isPointInsideFieldBounds(hitX, hitY)
      ? { x: hitX, y: hitY }
      : clampSegmentToFieldBounds({ x: currX, y: currY }, { x: hitX, y: hitY });
    points.push(boundedHit);
    remainingDistance -= segmentDistance;

    const dot = dirX * hit.normal.x + dirY * hit.normal.y;
    const absDot = Math.abs(dot);
    const collisionResponse = absDot < SLIDE_THRESHOLD ? "slide" : "reflect";
    if(collisionResponse === "slide"){
      dirX = dirX - dot * hit.normal.x;
      dirY = dirY - dot * hit.normal.y;
    } else {
      dirX = dirX - 2 * dot * hit.normal.x;
      dirY = dirY - 2 * dot * hit.normal.y;
    }

    const dirLen = Math.hypot(dirX, dirY);
    if(dirLen <= TINY_EPSILON){
      break;
    }
    dirX /= dirLen;
    dirY /= dirLen;

    currX = boundedHit.x + hit.normal.x * EPS_PUSH;
    currY = boundedHit.y + hit.normal.y * EPS_PUSH;
    if(!isPointInsideFieldBounds(currX, currY)){
      points[points.length - 1] = clampSegmentToFieldBounds(points[points.length - 2], boundedHit);
      break;
    }
    ricochets += 1;
  }

  return points;
}

function resolveSpriteCollision(fp){
  const p = fp.plane;
  const prevX = Number.isFinite(p.prevX) ? p.prevX : p.x - fp.vx;
  const prevY = Number.isFinite(p.prevY) ? p.prevY : p.y - fp.vy;
  const moveX = p.x - prevX;
  const moveY = p.y - prevY;
  const moveLen = Math.hypot(moveX, moveY);
  if(moveLen === 0) return false;

  let closest = null;

  for(const collider of colliders){
    const edges = getColliderEdges(collider, POINT_RADIUS);
    for(const edge of edges){
      const hit = lineSegmentIntersection(
        prevX, prevY, p.x, p.y,
        edge.x1, edge.y1, edge.x2, edge.y2
      );
      if(!hit) continue;
      const dist = Math.hypot(hit.x - prevX, hit.y - prevY);
      if(closest && dist >= closest.dist) continue;
      let nx = -(edge.y2 - edge.y1);
      let ny = edge.x2 - edge.x1;
      const nLen = Math.hypot(nx, ny);
      if(nLen === 0) continue;
      nx /= nLen;
      ny /= nLen;
      if(nx * moveX + ny * moveY > 0){
        nx = -nx;
        ny = -ny;
      }
      closest = { hit, nx, ny, dist, collider, edge };
    }
  }

  if(!closest) return false;

  const incoming = { vx: fp.vx, vy: fp.vy };
  const dot = incoming.vx * closest.nx + incoming.vy * closest.ny;
  fp.vx = incoming.vx - 2 * dot * closest.nx;
  fp.vy = incoming.vy - 2 * dot * closest.ny;

  const EPS = 0.5;
  p.x = closest.hit.x + closest.nx * (POINT_RADIUS + EPS);
  p.y = closest.hit.y + closest.ny * (POINT_RADIUS + EPS);

  return true;
}

function resolveDiagonalBrickCollision(fp, collider){
  const p = fp.plane;
  const cos = Math.cos(collider.rotation);
  const sin = Math.sin(collider.rotation);
  const prevX = Number.isFinite(p.prevX) ? p.prevX : p.x - fp.vx;
  const prevY = Number.isFinite(p.prevY) ? p.prevY : p.y - fp.vy;
  const endX = p.x;
  const endY = p.y;
  const halfWidth = collider.halfWidth;
  const halfHeight = collider.halfHeight;
  const width = halfWidth * 2;
  const height = halfHeight * 2;
  const bandHalfWidth = Number.isFinite(collider.bandHalfWidth)
    ? collider.bandHalfWidth
    : MAP_BRICK_THICKNESS;
  const radius = POINT_RADIUS;

  const toLocal = (x, y) => ({
    x: (x - collider.cx) * cos + (y - collider.cy) * sin,
    y: -(x - collider.cx) * sin + (y - collider.cy) * cos
  });

  const prevLocal = toLocal(prevX, prevY);
  const currLocal = toLocal(p.x, p.y);
  const prevPoint = { x: prevLocal.x + halfWidth, y: prevLocal.y + halfHeight };
  const currPoint = { x: currLocal.x + halfWidth, y: currLocal.y + halfHeight };
  const moveX = currPoint.x - prevPoint.x;
  const moveY = currPoint.y - prevPoint.y;
  const moveLen = Math.hypot(moveX, moveY);
  if(moveLen === 0) return false;

  const inBand = (x, y, extra = 0) => {
    if(collider.diagSign < 0){
      return Math.abs(x + y - width) <= bandHalfWidth + extra;
    }
    return Math.abs(x - y) <= bandHalfWidth + extra;
  };

  const insideExpanded = (x, y) => (
    x >= -radius
    && x <= width + radius
    && y >= -radius
    && y <= height + radius
    && inBand(x, y, radius)
  );

  if(!insideExpanded(currPoint.x, currPoint.y)) return false;

  const candidates = [];
  const EPS_T = 1e-4;
  const EPS_DOT = 1e-6;
  const surfacePriority = { DIAG: 3, V: 2, H: 1 };

  const addCandidate = (t, ix, iy, normal, surface) => {
    if(t < 0 || t > 1) return;
    if(normal.x * moveX + normal.y * moveY >= 0) return;
    candidates.push({ t, ix, iy, normal, surface });
  };

  const intersectLine = (a, b, c, normal, surface, validator) => {
    const d0 = a * prevPoint.x + b * prevPoint.y - c;
    const d1 = a * currPoint.x + b * currPoint.y - c;
    if(d0 === d1) return;
    const t = d0 / (d0 - d1);
    if(t < 0 || t > 1) return;
    const ix = prevPoint.x + moveX * t;
    const iy = prevPoint.y + moveY * t;
    if(!validator(ix, iy)) return;
    addCandidate(t, ix, iy, normal, surface);
  };

  const axisValidator = (ix, iy) => (
    ix >= -radius
    && ix <= width + radius
    && iy >= -radius
    && iy <= height + radius
    && inBand(ix, iy, radius)
  );

  intersectLine(1, 0, -radius, { x: -1, y: 0 }, "V", axisValidator);
  intersectLine(1, 0, width + radius, { x: 1, y: 0 }, "V", axisValidator);
  intersectLine(0, 1, -radius, { x: 0, y: -1 }, "H", axisValidator);
  intersectLine(0, 1, height + radius, { x: 0, y: 1 }, "H", axisValidator);

  const diagValidator = (ix, iy) => (
    ix >= -radius
    && ix <= width + radius
    && iy >= -radius
    && iy <= height + radius
  );

  const edgeOffset = bandHalfWidth + radius * Math.SQRT2;
  const invDiag = 1 / Math.SQRT2;
  if(collider.diagSign < 0){
    intersectLine(1, 1, width + edgeOffset, { x: invDiag, y: invDiag }, "DIAG", diagValidator);
    intersectLine(1, 1, width - edgeOffset, { x: -invDiag, y: -invDiag }, "DIAG", diagValidator);
  } else {
    intersectLine(1, -1, edgeOffset, { x: invDiag, y: -invDiag }, "DIAG", diagValidator);
    intersectLine(1, -1, -edgeOffset, { x: -invDiag, y: invDiag }, "DIAG", diagValidator);
  }

  if(!candidates.length) return false;
  let hit = candidates[0];
  let tieBreakReason = null;
  const getAbsDot = entry => Math.abs(moveX * entry.normal.x + moveY * entry.normal.y);
  for(const candidate of candidates.slice(1)){
    if(candidate.t < hit.t - EPS_T){
      hit = candidate;
      tieBreakReason = null;
      continue;
    }
    if(Math.abs(candidate.t - hit.t) <= EPS_T){
      const candidateDot = getAbsDot(candidate);
      const hitDot = getAbsDot(hit);
      if(candidateDot > hitDot + EPS_DOT){
        hit = candidate;
        tieBreakReason = "abs_dot";
        continue;
      }
      if(Math.abs(candidateDot - hitDot) <= EPS_DOT){
        const candidatePriority = surfacePriority[candidate.surface] ?? 0;
        const hitPriority = surfacePriority[hit.surface] ?? 0;
        if(candidatePriority > hitPriority){
          hit = candidate;
          tieBreakReason = "surface_priority";
        }
      }
    }
  }
  const localHitX = hit.ix - halfWidth;
  const localHitY = hit.iy - halfHeight;
  const hitWorldX = collider.cx + localHitX * cos - localHitY * sin;
  const hitWorldY = collider.cy + localHitX * sin + localHitY * cos;
  const worldNormal = {
    x: hit.normal.x * cos - hit.normal.y * sin,
    y: hit.normal.x * sin + hit.normal.y * cos
  };
  const incoming = { vx: fp.vx, vy: fp.vy };
  const dot = incoming.vx * worldNormal.x + incoming.vy * worldNormal.y;
  const speed = Math.hypot(incoming.vx, incoming.vy);
  const a = speed > 0 ? Math.abs(dot / speed) : 1;
  if(a < SLIDE_THRESHOLD){
    fp.vx = incoming.vx - dot * worldNormal.x;
    fp.vy = incoming.vy - dot * worldNormal.y;
  } else {
    fp.vx = incoming.vx - 2 * dot * worldNormal.x;
    fp.vy = incoming.vy - 2 * dot * worldNormal.y;
  }

  const EPS = 0.5;
  p.x = hitWorldX + worldNormal.x * (POINT_RADIUS + EPS);
  p.y = hitWorldY + worldNormal.y * (POINT_RADIUS + EPS);

  logCollisionTOI({
    plane: p,
    p0: { x: prevX, y: prevY },
    p1: { x: endX, y: endY },
    surfaceType: hit.surface,
    normal: { x: worldNormal.x, y: worldNormal.y },
    tImpact: hit.t,
    vIn: { vx: incoming.vx, vy: incoming.vy },
    vOut: { vx: fp.vx, vy: fp.vy },
    tieBreakReason
  });

  return true;
}

/* Коллизии самолёт <-> здание */
function planeBuildingCollision(fp, collider){
  if(collider.type === "diag"){
    return resolveDiagonalBrickCollision(fp, collider);
  }

  const p = fp.plane;
  let collided = false;

  // В углах самолёт может касаться двух граней сразу.
  // Разрешаем до двух последовательных отражений за один кадр,
  // чтобы избегать «проскальзывания» по ребру.
  for(let i=0;i<2;i++){
    const cos = Math.cos(collider.rotation);
    const sin = Math.sin(collider.rotation);
    const localX = (p.x - collider.cx) * cos + (p.y - collider.cy) * sin;
    const localY = -(p.x - collider.cx) * sin + (p.y - collider.cy) * cos;

    const clampedX = clamp(localX, -collider.halfWidth, collider.halfWidth);
    const clampedY = clamp(localY, -collider.halfHeight, collider.halfHeight);
    const dx = localX - clampedX;
    const dy = localY - clampedY;
    const dist2 = dx*dx + dy*dy;
    if(dist2 >= POINT_RADIUS*POINT_RADIUS) break;

    collided = true;

    let nx=0, ny=0;

    // направление нормали из точки соприкосновения
    if(dx !== 0 || dy !== 0){
      const dist = Math.sqrt(dist2);
      const localNx = dx / dist;
      const localNy = dy / dist;
      nx = localNx * cos - localNy * sin;
      ny = localNx * sin + localNy * cos;
    } else {
      // если центр внутри прямоугольника – fallback по оси минимального проникновения
      const penLeft   = collider.halfWidth + localX;
      const penRight  = collider.halfWidth - localX;
      const penTop    = collider.halfHeight + localY;
      const penBottom = collider.halfHeight - localY;

      const minPen = Math.min(penLeft, penRight, penTop, penBottom);
      let localNx = 0;
      let localNy = 0;
      if(minPen === penLeft)      { localNx = -1; localNy = 0; }
      else if(minPen === penRight){ localNx =  1; localNy = 0; }
      else if(minPen === penTop)  { localNx =  0; localNy = -1;}
      else                        { localNx =  0; localNy =  1;}
      nx = localNx * cos - localNy * sin;
      ny = localNx * sin + localNy * cos;
    }

    // отражаем скорость
    const dot = fp.vx*nx + fp.vy*ny;
    const speed = Math.hypot(fp.vx, fp.vy);
    const a = speed > 0 ? Math.abs(dot / speed) : 1;
    if(a < SLIDE_THRESHOLD){
      fp.vx = fp.vx - dot*nx;
      fp.vy = fp.vy - dot*ny;
    } else {
      fp.vx = fp.vx - 2*dot*nx;
      fp.vy = fp.vy - 2*dot*ny;
    }

    // выталкивание за пределы
    const EPS = 0.5;
    const closestWorldX = collider.cx + clampedX * cos - clampedY * sin;
    const closestWorldY = collider.cy + clampedX * sin + clampedY * cos;
    p.x = closestWorldX + nx * (POINT_RADIUS + EPS);
    p.y = closestWorldY + ny * (POINT_RADIUS + EPS);
  }

  return collided;
}

function destroyPlane(fp, scoringColor = null){
  const p = fp.plane;
  const carriedFlag = p.carriedFlagId ? getFlagById(p.carriedFlagId) : null;
  if(isFlagActive(carriedFlag)){
    dropFlagAtPosition(carriedFlag, { x: p.x, y: p.y });
  }
  clearFlagFromPlane(p);
  p.isAlive = false;
  p.burning = true;
  ensurePlaneBurningFlame(p);
  p.collisionX = p.x;
  p.collisionY = p.y;
  const crashTimestamp = performance.now();
  p.crashStart = crashTimestamp;
  p.killMarkerStart = crashTimestamp;

  spawnExplosionForPlane(p, p.collisionX, p.collisionY);


  schedulePlaneFlameFx(p);


  flyingPoints = flyingPoints.filter(x=>x!==fp);
  awardPoint(scoringColor);
  checkVictory();
  if(!isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
    advanceTurn();
  }
}

function destroyAllPlanesWithoutScoring(){
  points.forEach((p) => {
    if(!p || !p.isAlive) return;
    const carriedFlag = p.carriedFlagId ? getFlagById(p.carriedFlagId) : null;
    if(isFlagActive(carriedFlag)){
      dropFlagAtPosition(carriedFlag, { x: p.x, y: p.y });
    }
    clearFlagFromPlane(p);
    p.isAlive = false;
    p.burning = true;
    ensurePlaneBurningFlame(p);
    p.collisionX = p.x;
    p.collisionY = p.y;
    const crashTimestamp = performance.now();
    p.crashStart = crashTimestamp;
    p.killMarkerStart = crashTimestamp;
    spawnExplosionForPlane(p, p.collisionX, p.collisionY);
    schedulePlaneFlameFx(p);
    flyingPoints = flyingPoints.filter(x => x.plane !== p);
  });
}

function destroyAllPlanesWithNukeScoring(){
  const scoreDeltas = { blue: 0, green: 0 };

  points.forEach((p) => {
    if(!p || !p.isAlive) return;
    if(p.color !== "blue" && p.color !== "green") return;
    const scoringColor = p.color === "green" ? "blue" : "green";
    scoreDeltas[scoringColor] += 1;
    const carriedFlag = p.carriedFlagId ? getFlagById(p.carriedFlagId) : null;
    if(isFlagActive(carriedFlag)){
      dropFlagAtPosition(carriedFlag, { x: p.x, y: p.y });
    }
    clearFlagFromPlane(p);
    p.isAlive = false;
    p.burning = false;
    p.nukeEliminated = true;
    p.collisionX = p.x;
    p.collisionY = p.y;
    p.crashStart = 0;
    p.killMarkerStart = 0;
    flyingPoints = flyingPoints.filter(x => x.plane !== p);
  });

  return scoreDeltas;
}

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function advanceTurn(){
  points.forEach((plane) => {
    if(!plane) return;
    plane.activeTurnBuff = null;
  });
  turnIndex = (turnIndex + 1) % turnColors.length;
  turnAdvanceCount += 1;
  if(turnAdvanceCount >= 1){
    spawnCargoForTurn();
  }
  if(turnColors[turnIndex] === "blue" && gameMode === "computer"){
    aiMoveScheduled = false;
  }
}


function angleDiffDeg(a, b){
  let diff = ((a - b + 540) % 360) - 180;
  return Math.abs(diff);
}

function handleAAForPlane(p, fp){
  const now = performance.now();
  for(const aa of aaUnits){
    if(aa.owner === p.color) continue; // no friendly fire
    const dx = p.x - aa.x;
    const dy = p.y - aa.y;
    const dist = Math.hypot(dx, dy);
    if(dist < AA_HIT_RADIUS){
      aa.hp--;
      if(aa.hp<=0){
        aaUnits = aaUnits.filter(a=>a!==aa);
      }
      continue;
    }
    if(dist <= aa.radius + POINT_RADIUS){
      const contactX = dist === 0 ? p.x : p.x - dx / dist * POINT_RADIUS;
      const contactY = dist === 0 ? p.y : p.y - dy / dist * POINT_RADIUS;
      if(isPathClear(aa.x, aa.y, contactX, contactY)){
        const angleToPlane = (Math.atan2(p.y - aa.y, p.x - aa.x) * 180/Math.PI + 360) % 360;
        const angleBuffer = Math.asin(Math.min(1, POINT_RADIUS / Math.max(1, dist))) * 180/Math.PI;
        if(angleDiffDeg(angleToPlane, aa.sweepAngleDeg) <= aa.beamWidthDeg/2 + angleBuffer){
          if(!p._aaTimes) p._aaTimes={};
          if(!p._aaTimes[aa.id]){
            p._aaTimes[aa.id]=now;
          } else if(now - p._aaTimes[aa.id] > aa.dwellTimeMs){
            if(!aa.lastTriggerAt || now - aa.lastTriggerAt > aa.cooldownMs){
              aa.lastTriggerAt = now;
              p.isAlive=false;
                p.burning=true;
                ensurePlaneBurningFlame(p);
                p.collisionX=p.x; p.collisionY=p.y;
                const aaCrashTimestamp = performance.now();
                p.crashStart = aaCrashTimestamp;
                p.killMarkerStart = aaCrashTimestamp;
                spawnExplosionForPlane(p, contactX, contactY);
                schedulePlaneFlameFx(p);
                if(fp) {
                  flyingPoints = flyingPoints.filter(x=>x!==fp);
                }
              awardPoint(aa.owner);
              checkVictory();
              if(fp && !isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
                advanceTurn();
              }
              return true;
            }
          }
        } else if(p._aaTimes && p._aaTimes[aa.id]){
          delete p._aaTimes[aa.id];
        }
      } else if(p._aaTimes && p._aaTimes[aa.id]){
        delete p._aaTimes[aa.id];
      }
    } else if(p._aaTimes && p._aaTimes[aa.id]){
      delete p._aaTimes[aa.id];
    }
  }
  return false;
}

function handleMineForPlane(p, fp){
  if(!p?.isAlive || p?.burning) return false;
  if(!Array.isArray(mines) || mines.length === 0) return false;

  for(let i = 0; i < mines.length; i++){
    const mine = mines[i];
    if(!mine) continue;

    const dx = p.x - mine.x;
    const dy = p.y - mine.y;
    const dist = Math.hypot(dx, dy);

    if(dist > MINE_TRIGGER_RADIUS) continue;

    const contactX = dist === 0 ? p.x : p.x - dx / dist * POINT_RADIUS;
    const contactY = dist === 0 ? p.y : p.y - dy / dist * POINT_RADIUS;

    p.isAlive = false;
    p.burning = true;
    ensurePlaneBurningFlame(p);
    p.collisionX = p.x;
    p.collisionY = p.y;
    const mineCrashTimestamp = performance.now();
    p.crashStart = mineCrashTimestamp;
    p.killMarkerStart = mineCrashTimestamp;
    spawnExplosionForPlane(p, contactX, contactY);
    schedulePlaneFlameFx(p);

    if(fp){
      flyingPoints = flyingPoints.filter(x => x !== fp);
    } else {
      flyingPoints = flyingPoints.filter(x => x.plane !== p);
    }

    mines.splice(i, 1);

    // Self-detonation rule: stepping on your own mine destroys your plane,
    // but does not grant a score point to the owner.
    if(mine.owner && mine.owner !== p.color){
      awardPoint(mine.owner);
    }
    checkVictory();

    if(fp && !isGameOver && !flyingPoints.some(x => x.plane.color === p.color)){
      advanceTurn();
    }

    return true;
  }

  return false;
}
  /* ======= GAME LOOP ======= */
function drawInitialFrame(reason = "initial") {
  resetCanvasState(gsBoardCtx, gsBoardCanvas);
  if (isSpriteReady(backgroundImg)) {
    drawFieldBackground(gsBoardCtx, WORLD.width, WORLD.height);
  } else {
    gsBoardCtx.fillStyle = "#f2efe6";
    gsBoardCtx.fillRect(0, 0, WORLD.width, WORLD.height);
  }
  drawMapLayer(gsBoardCtx);
  if (DEBUG_LAYOUT || DEBUG_RENDER_INIT || DEBUG_START_POSITIONS) {
    drawDebugLayoutOverlay(gsBoardCtx);
  }
  renderInitState.firstFrameDrawn = true;
  logRenderInit("first frame draw", { reason });
}

function gameDraw(){
  if (!gameDrawFirstLogged) {
    logBootStep("gameDraw");
    gameDrawFirstLogged = true;
  }
  const now = performance.now();
  if (DEBUG_RENDER_INIT) {
    if (!renderInitState.firstFrameDrawn) {
      renderInitState.firstFrameDrawn = true;
      logRenderInit("first frame draw", { reason: "gameDraw" });
    }
    if (now - renderInitState.lastDrawLogTime > 1000) {
      renderInitState.lastDrawLogTime = now;
      logRenderInit("draw tick", { t: Math.round(now) });
    }
  }
  let deltaSec = (now - lastFrameTime) / 1000;
  deltaSec = Math.min(deltaSec, 0.05);
  const delta = deltaSec * 60;
  const deltaMs = deltaSec * 1000;
  lastFrameTime = now;
  globalFrame += delta;

  // фон
  resetCanvasState(gsBoardCtx, gsBoardCanvas);
  drawFieldBackground(gsBoardCtx, WORLD.width, WORLD.height);
  drawMapLayer(gsBoardCtx);
  updateCargoState(now);
  syncCargoAnimationDomEntries();
  drawCargo(gsBoardCtx);

  updateNukeTimeline(now);

  // Планирование хода ИИ
  if (!isGameOver
      && gameMode === "computer"
      && turnColors[turnIndex] === "blue"
      && !aiMoveScheduled
      && !flyingPoints.some(fp => fp.plane.color === "blue")) {
    aiMoveScheduled = true;
    setTimeout(() => { doComputerMove(); }, 300);
  }

  for(const aa of aaUnits){
    aa.sweepAngleDeg = (aa.sweepAngleDeg + aa.rotationDegPerSec * deltaSec) % 360;
    aa.trail.push({angleDeg: aa.sweepAngleDeg, time: now});
    aa.trail = aa.trail.filter(seg => now - seg.time < AA_TRAIL_MS);
  }


  // полёты
  if(flyingPoints.length){
    const current = [...flyingPoints];
    for(const fp of current){
      const p = fp.plane;
      if(!p.isAlive || p.burning){
        flyingPoints = flyingPoints.filter(other => other !== fp);
        continue;
      }
      if(fp.lastHitCooldown > 0){
        fp.lastHitCooldown = Math.max(0, fp.lastHitCooldown - deltaSec);
        if(fp.lastHitCooldown <= 0){
          fp.lastHitPlane = null;
          fp.lastHitCooldown = 0;
        }
      }
      const prevX = p.x;
      const prevY = p.y;

      resolveFlightSurfaceCollision(fp, prevX, prevY, deltaSec);

      if(!p.isAlive || p.burning){
        continue;
      }

      // нос по текущей скорости
      const colorShift = colorAngleOffset(p.color);
      const baseAngle = Math.atan2(fp.vy, fp.vx) + Math.PI / 2;
      p.angle = baseAngle + colorShift;

      // трейл
      const seg = {
        x1: p.prevX, y1: p.prevY,
        x2: p.x, y2: p.y,
        lineWidth: Math.max(0.1, 3 - (p.segments.length/25))
      };
      p.segments.push(seg);
      if(p.segments.length > MAX_TRAIL_SEGMENTS) p.segments.shift();
      p.prevX = p.x; p.prevY = p.y;

      // проверка попаданий по врагам
      checkPlaneHits(p, fp);
      handleFlagInteractions(p);
      if(handleAAForPlane(p, fp)) continue;
      if(handleMineForPlane(p, fp)) continue;

      fp.timeLeft -= deltaSec;
      if(fp.timeLeft<=0){
        flyingPoints = flyingPoints.filter(x => x !== fp);
        // смена хода, когда полётов текущего цвета больше нет
        if(!isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
          advanceTurn();
        }
      }
    }
  }

  if(isGameOver && awaitingFlightResolution && flyingPoints.length === 0){
    awaitingFlightResolution = false;
    finalizePostFlightState();
  }

  // Anti-Aircraft against stationary planes
  if(!isGameOver){
    for(const p of points){
      if(!p.isAlive || p.burning) continue;
      if(!flyingPoints.some(fp => fp.plane === p)){
        if(handleAAForPlane(p, null)) continue;
        handleMineForPlane(p, null);
      }
  }
  }

  // здания
  drawAAPlacementZone();

  drawBaseVisuals();


  // установки ПВО
  drawAAUnits();
  drawMines();
  drawAAPreview();

  // "ручка" при натяжке
  if(handleCircle.active && handleCircle.pointRef){

    const plane = handleCircle.pointRef;
    const activeTurnBuff = getPlaneActiveTurnBuff(plane);
    let dx = handleCircle.baseX - plane.x;
    let dy = handleCircle.baseY - plane.y;
    let distPx = Math.hypot(dx, dy);

    // clamp drag distance but keep a fixed wobble amplitude in degrees
    const clampedDist = Math.min(distPx, MAX_DRAG_DISTANCE);

    // use a constant aiming amplitude (in degrees) independent of drag distance
    const aimingAmplitude = activeTurnBuff === INVENTORY_ITEM_TYPES.CROSSHAIR
      ? 0
      : settings.aimingAmplitude;
    const maxAngleDeg = aimingAmplitude * 5;
    const maxAngleRad = maxAngleDeg * Math.PI / 180;

    // обновляем текущий угол раскачивания
    oscillationAngle += oscillationSpeed * delta * oscillationDir;
    if(oscillationDir > 0 && oscillationAngle > maxAngleRad){
      oscillationAngle = maxAngleRad;
      oscillationDir = -1;
    } else if(oscillationDir < 0 && oscillationAngle < -maxAngleRad){
      oscillationAngle = -maxAngleRad;
      oscillationDir = 1;
    }

    const baseAngle = Math.atan2(dy, dx);
    const angle = baseAngle + oscillationAngle;


    handleCircle.shakyX = plane.x + clampedDist * Math.cos(angle);
    handleCircle.shakyY = plane.y + clampedDist * Math.sin(angle);

    handleCircle.offsetX = handleCircle.shakyX - handleCircle.baseX;
    handleCircle.offsetY = handleCircle.shakyY - handleCircle.baseY;

    // ограничение видимой длины
    let vdx = handleCircle.shakyX - plane.x;
    let vdy = handleCircle.shakyY - plane.y;
    let vdist = Math.hypot(vdx, vdy);
    if(vdist > MAX_DRAG_DISTANCE){
      vdx *= MAX_DRAG_DISTANCE/vdist;
      vdy *= MAX_DRAG_DISTANCE/vdist;
      vdist = MAX_DRAG_DISTANCE;
    }

    // вращаем самолёт по направлению полёта только после небольшого смещения
    // чтобы избежать резких рывков при лёгком касании
    if(vdist > DRAG_ROTATION_THRESHOLD){
      plane.angle = Math.atan2(-vdy, -vdx) + Math.PI/2;
    } else {
      plane.angle = handleCircle.origAngle;
    }

    // Offset arrow so the drag point grabs the middle of the tail
    const halfTail = TAIL_DEST_W / 2;
    let baseDx = vdx;
    let baseDy = vdy;
    if (vdist > 0) {
      const ux = vdx / vdist;
      const uy = vdy / vdist;
      const baseDist = Math.max(vdist - halfTail, 0);
      baseDx = ux * baseDist;
      baseDy = uy * baseDist;
    }


    // Draw arrow in board coordinates so it stays aligned with the game field
    const arrowAlpha = 0.5 * (vdist / MAX_DRAG_DISTANCE);
    const startX = plane.x;
    const startY = plane.y;
    const tailX = plane.x + baseDx;
    const tailY = plane.y + baseDy;

    aimCtx.setTransform(1, 0, 0, 1, 0, 0);
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
    aimCtx.save();
    const { x: aimOffsetX, y: aimOffsetY } = getFieldOffsetsInCanvasSpace(
      aimCanvas,
      VIEW.scaleX,
      VIEW.scaleY
    );
    aimCtx.setTransform(
      VIEW.scaleX,
      0,
      0,
      VIEW.scaleY,
      aimOffsetX,
      aimOffsetY
    );
    aimCtx.globalAlpha = arrowAlpha;
    drawArrow(aimCtx, startX, startY, baseDx, baseDy);

    if(activeTurnBuff === INVENTORY_ITEM_TYPES.CROSSHAIR && vdist > 0){
      const predictedPath = buildPredictedPathForAim(plane, { x: vdx, y: vdy });
      const hasPath = predictedPath.length >= 2;

      if(hasPath){
        aimCtx.globalAlpha = 0.55;
        aimCtx.strokeStyle = plane.color;
        aimCtx.lineWidth = 1.2;
        aimCtx.setLineDash([5, 4]);
        aimCtx.beginPath();
        aimCtx.moveTo(predictedPath[0].x, predictedPath[0].y);
        for(let i = 1; i < predictedPath.length; i += 1){
          aimCtx.lineTo(predictedPath[i].x, predictedPath[i].y);
        }
        aimCtx.stroke();
        aimCtx.setLineDash([]);

        const endPoint = predictedPath[predictedPath.length - 1];
        const prevPoint = predictedPath[predictedPath.length - 2];
        const projectedPlaneAngle = Math.atan2(endPoint.y - prevPoint.y, endPoint.x - prevPoint.x) + Math.PI / 2;

        aimCtx.save();
        aimCtx.globalAlpha = 0.42;
        aimCtx.translate(endPoint.x, endPoint.y);
        aimCtx.rotate(projectedPlaneAngle);
        drawProjectedPlaneGhost(aimCtx, plane.color);
        aimCtx.restore();
      }
    }

    if (DEBUG_AIM) {
      const debugSize = 3 / Math.max(1, VIEW.scaleX, VIEW.scaleY);
      aimCtx.globalAlpha = 1;
      aimCtx.fillStyle = 'magenta';
      aimCtx.beginPath();
      aimCtx.arc(tailX, tailY, debugSize, 0, Math.PI * 2);
      aimCtx.fill();
    }
    aimCtx.restore();
    logAimDebug({
      start: { x: Math.round(startX), y: Math.round(startY) },
      tail: { x: Math.round(tailX), y: Math.round(tailY) },
      inBounds:
        tailX >= FIELD_LEFT &&
        tailX <= FIELD_LEFT + FIELD_WIDTH &&
        tailY >= FIELD_TOP &&
        tailY <= FIELD_TOP + FIELD_HEIGHT
    });

  } else {
    // Clear overlay if not aiming
    aimCtx.setTransform(1, 0, 0, 1, 0, 0);
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
  }

  // самолёты + их трейлы
  const rangeTextInfo = drawPlanesAndTrajectories();

  // Флаги рисуются после обломков самолётов, чтобы не прятаться под ними
  drawFlagMarkers();

  // Взрывы поверх поля и под HUD
  updateAndDrawExplosions(gsBoardCtx, now);

  // Табло рисуем поверх самолётов, поэтому оно выводится после drawPlanesAndTrajectories
  renderScoreboard();

  drawAimOverlay(rangeTextInfo);
  drawInventoryHintOnHud(hudCtx);

  const shouldShowNoSurvivorsText = roundEndedByNuke
    && nuclearStrikeTimelineState.currentPhase === NUCLEAR_STRIKE_TIMELINE_PHASES.SHOW_NO_SURVIVORS;

  if(isGameOver && (winnerColor || isDrawGame || shouldShowNoSurvivorsText)){
    const endTextCtx = hudCtx && hudCanvas instanceof HTMLCanvasElement ? hudCtx : gsBoardCtx;
    const endTextCanvas = hudCtx && hudCanvas instanceof HTMLCanvasElement ? hudCanvas : gsBoardCanvas;
    const textAreaWidth = endTextCanvas.width;
    const textAreaHeight = endTextCanvas.height;
    endTextCtx.save();
    endTextCtx.setTransform(1, 0, 0, 1, 0, 0);
    endTextCtx.font = "48px 'Patrick Hand', cursive";
    endTextCtx.lineWidth = 4;
    endTextCtx.strokeStyle = "#B22222";
    const textBaselineY = textAreaHeight / 2 - 80;
    const positionEndGamePanel = (metrics) => {
      if(!shouldShowEndScreen || !endGameDiv) return;
      const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : 0;
      const anchorCanvasX = textAreaWidth / 2;
      const anchorCanvasY = textBaselineY + descent + 24;
      const boardRect = getViewportAdjustedBoundingClientRect(endTextCanvas);
      const boardWidth = Number.isFinite(boardRect.width) ? boardRect.width : 0;
      const boardHeight = Number.isFinite(boardRect.height) ? boardRect.height : 0;
      const scaleX = textAreaWidth !== 0 ? boardWidth / textAreaWidth : 1;
      const scaleY = textAreaHeight !== 0 ? boardHeight / textAreaHeight : 1;
      const anchorClientX = (Number.isFinite(boardRect.left) ? boardRect.left : 0) + anchorCanvasX * scaleX;
      const anchorClientY = (Number.isFinite(boardRect.top) ? boardRect.top : 0) + anchorCanvasY * scaleY;

      if(endGameDiv.style.display !== "block"){
        endGameDiv.style.display = "block";
      }

      const panelWidth = endGameDiv.offsetWidth || 0;
      const targetLeft = Math.round(anchorClientX - panelWidth / 2);
      const targetTop = Math.round(anchorClientY);

      if(Number.isFinite(targetLeft)){
        endGameDiv.style.left = `${targetLeft}px`;
      }
      if(Number.isFinite(targetTop)){
        endGameDiv.style.top = `${targetTop}px`;
      }
    };
    if(shouldShowNoSurvivorsText){
      const lines = ["No one survived.", "No one won the round."];
      endTextCtx.font = "700 44px 'Patrick Hand', cursive";
      const lineHeight = 50;
      const horizontalPadding = 22;
      const verticalPadding = 18;
      const maxLineWidth = lines.reduce((maxWidth, line) => {
        const metrics = endTextCtx.measureText(line);
        return Math.max(maxWidth, metrics.width);
      }, 0);
      const totalTextHeight = lineHeight * lines.length;
      const panelWidth = maxLineWidth + horizontalPadding * 2;
      const panelHeight = totalTextHeight + verticalPadding * 2;
      const panelX = (textAreaWidth - panelWidth) / 2;
      const panelY = textBaselineY - 40;

      endTextCtx.fillStyle = "rgba(0, 0, 0, 0.75)";
      endTextCtx.fillRect(panelX, panelY, panelWidth, panelHeight);

      endTextCtx.fillStyle = "#ffffff";
      lines.forEach((line, index) => {
        const metrics = endTextCtx.measureText(line);
        const w = metrics.width;
        const textX = (textAreaWidth - w) / 2;
        const lineY = panelY + verticalPadding + 34 + index * lineHeight;
        endTextCtx.fillText(line, textX, lineY);
      });
    } else if(isDrawGame){
      endTextCtx.fillStyle = "#ffffff";
      const text = "Игра окончена. Ничья.";
      const metrics = endTextCtx.measureText(text);
      const w = metrics.width;
      const textX = (textAreaWidth - w) / 2;
      endTextCtx.strokeText(text, textX, textBaselineY);
      endTextCtx.fillText(text, textX, textBaselineY);
      positionEndGamePanel(metrics);
    } else {
      endTextCtx.fillStyle = colorFor(winnerColor);
      const winnerName= `${winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1)}`;
      const text= shouldShowEndScreen
        ? `${winnerName} wins the game!`
        : `${winnerName} wins the round!`;
      const metrics = endTextCtx.measureText(text);
      const w = metrics.width;
      const textX = (textAreaWidth - w) / 2;
      endTextCtx.strokeText(text, textX, textBaselineY);
      endTextCtx.fillText(text, textX, textBaselineY);
      positionEndGamePanel(metrics);
    }
    endTextCtx.restore();
  }

  if(endGameDiv && (!shouldShowEndScreen || !isGameOver || (!winnerColor && !isDrawGame) || roundEndedByNuke)){
    if(endGameDiv.style.display !== "none"){
      endGameDiv.style.display = "none";
    }
    endGameDiv.style.left = "";
    endGameDiv.style.top = "";
  }

  if(roundTextTimer > 0){
    gsBoardCtx.font="48px 'Patrick Hand', cursive";
    gsBoardCtx.fillStyle = '#B22222';
    gsBoardCtx.strokeStyle = '#FFD700';
    gsBoardCtx.lineWidth = 2;
    const text = `Round ${roundNumber}`;
    const w = gsBoardCtx.measureText(text).width;
    const x = (WORLD.width - w) / 2;
    const y = WORLD.height / 2;
    gsBoardCtx.fillText(text, x, y);
    gsBoardCtx.strokeText(text, x, y);


    const turnColor = turnColors[turnIndex];
    const turnText = `${turnColor.charAt(0).toUpperCase() + turnColor.slice(1)} turn`;
    gsBoardCtx.font="32px 'Patrick Hand', cursive";
    gsBoardCtx.fillStyle = colorFor(turnColor);
    const w2 = gsBoardCtx.measureText(turnText).width;
    const x2 = (WORLD.width - w2) / 2;
    const y2 = y + 40;
    gsBoardCtx.fillText(turnText, x2, y2);


    roundTextTimer -= delta;
  }

  if (hasActiveMatchScoreAnimations(now)){
    renderScoreboard(now);
  }

  if (DEBUG_LAYOUT || DEBUG_RENDER_INIT || DEBUG_START_POSITIONS) {
    drawDebugLayoutOverlay(gsBoardCtx);
  }

  animationFrameId = requestAnimationFrame(gameDraw);
}

/* ======= RENDER ======= */
function drawFieldBackground(ctx2d, w, h){
  if(isSpriteReady(backgroundImg)){
    ctx2d.drawImage(backgroundImg, 0, 0, w, h);
  }
}

function drawMapSprites(ctx2d, sprites = currentMapSprites){
  const spriteEntries = Array.isArray(sprites) ? sprites : [];
  if(spriteEntries.length === 0){
    return;
  }

  for(const sprite of spriteEntries){
    const spriteName = typeof sprite?.spriteName === "string" ? sprite.spriteName : "brick_1_default";
    const brickSprite = MAP_SPRITE_ASSETS[spriteName] || MAP_SPRITE_ASSETS.brick_1_default;
    if(!brickSprite || !isSpriteReady(brickSprite)){
      continue;
    }

    const { x = 0, y = 0 } = sprite;
    const rotationDeg = Number.isFinite(sprite?.rotate) ? sprite.rotate : 0;
    const uniformScale = Number.isFinite(sprite?.scale) ? sprite.scale : 1;
    const scaleX = Number.isFinite(sprite?.scaleX) ? sprite.scaleX : uniformScale;
    const scaleY = Number.isFinite(sprite?.scaleY) ? sprite.scaleY : uniformScale;

    const baseWidth = brickSprite.naturalWidth || MAP_BRICK_THICKNESS;
    const baseHeight = brickSprite.naturalHeight || MAP_BRICK_THICKNESS;
    const normalizedRotation = ((rotationDeg % 360) + 360) % 360;
    const swapsDimensions = normalizedRotation % 180 !== 0;
    const drawnWidth = (swapsDimensions ? baseHeight : baseWidth) * Math.abs(scaleX);
    const drawnHeight = (swapsDimensions ? baseWidth : baseHeight) * Math.abs(scaleY);

    ctx2d.save();
    ctx2d.translate(x + drawnWidth / 2, y + drawnHeight / 2);
    ctx2d.rotate(rotationDeg * Math.PI / 180);
    ctx2d.scale(scaleX, scaleY);
    ctx2d.drawImage(brickSprite, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
    ctx2d.restore();
  }
}

function drawMapLayer(ctx2d){
  drawMapSprites(ctx2d);
}


function drawVfxDebugOverlay(ctx2d, activePlanes, destroyedPlanes = []) {
  if (!DEBUG_VFX) return;
  if (!ctx2d) return;

  const markerSize = planeMetric(2);
  const labelOffset = planeMetric(3);
  const directionLength = planeMetric(10);
  const jetAnchor = getPlaneAnchorOffset("jet");
  const smokeAnchor = getPlaneAnchorOffset("smoke");
  const idleSmokeY = Math.max(0, smokeAnchor.y - PLANE_VFX_IDLE_SMOKE_DELTA_Y);

  const drawMarker = (kind, x, y) => {
    switch (kind) {
      case "center": {
        ctx2d.beginPath();
        ctx2d.moveTo(x - markerSize, y);
        ctx2d.lineTo(x + markerSize, y);
        ctx2d.moveTo(x, y - markerSize);
        ctx2d.lineTo(x, y + markerSize);
        ctx2d.stroke();
        break;
      }
      case "tail": {
        ctx2d.strokeRect(x - markerSize, y - markerSize, markerSize * 2, markerSize * 2);
        break;
      }
      case "jet": {
        ctx2d.beginPath();
        ctx2d.moveTo(x, y - markerSize);
        ctx2d.lineTo(x + markerSize, y + markerSize);
        ctx2d.lineTo(x - markerSize, y + markerSize);
        ctx2d.closePath();
        ctx2d.stroke();
        break;
      }
      case "smoke": {
        ctx2d.beginPath();
        ctx2d.arc(x, y, markerSize, 0, Math.PI * 2);
        ctx2d.stroke();
        break;
      }
      default:
        break;
    }
  };

  const rotateOffset = (ox, oy, sinA, cosA) => ({
    x: ox * cosA - oy * sinA,
    y: ox * sinA + oy * cosA
  });

  const renderPlaneMarkers = (plane) => {
    const { x: cx, y: cy, angle = 0 } = plane || {};
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const flightState = flyingPoints.find(fp => fp.plane === plane) || null;
    const smokeY = flightState ? smokeAnchor.y : idleSmokeY;

    const tailWorld = rotateOffset(0, smokeAnchor.y, sinA, cosA);
    const jetWorld = rotateOffset(0, jetAnchor.y, sinA, cosA);
    const smokeWorld = rotateOffset(0, smokeY, sinA, cosA);
    const forwardWorld = rotateOffset(0, -directionLength, sinA, cosA);

    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.strokeStyle = '#000';
    ctx2d.fillStyle = '#000';

    drawMarker("center", 0, 0);
    ctx2d.fillText('C', labelOffset, -labelOffset);

    ctx2d.strokeStyle = '#d35400';
    ctx2d.fillStyle = '#d35400';
    drawMarker("tail", tailWorld.x, tailWorld.y);
    ctx2d.fillText('T', tailWorld.x + labelOffset, tailWorld.y - labelOffset);

    ctx2d.strokeStyle = '#0077ff';
    ctx2d.fillStyle = '#0077ff';
    drawMarker("jet", jetWorld.x, jetWorld.y);
    ctx2d.fillText('J', jetWorld.x + labelOffset, jetWorld.y - labelOffset);

    ctx2d.strokeStyle = '#27ae60';
    ctx2d.fillStyle = '#27ae60';
    drawMarker("smoke", smokeWorld.x, smokeWorld.y);
    ctx2d.fillText('S', smokeWorld.x + labelOffset, smokeWorld.y - labelOffset);

    ctx2d.strokeStyle = '#8e44ad';
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0);
    ctx2d.lineTo(forwardWorld.x, forwardWorld.y);
    ctx2d.stroke();

    ctx2d.restore();
  };

  ctx2d.save();
  ctx2d.lineWidth = 1;
  ctx2d.font = `${Math.max(8, planeMetric(6)).toFixed(0)}px monospace`;
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'middle';

  for (const plane of activePlanes || []) {
    renderPlaneMarkers(plane);
  }
  for (const plane of destroyedPlanes || []) {
    renderPlaneMarkers(plane);
  }

  ctx2d.restore();
}


function getPlaneAnchorOffset(kind) {
  switch(kind) {
    case "jet":
      return { x: 0, y: PLANE_VFX_JET_ANCHOR_Y + PLANE_VFX_JET_ANCHOR_NUDGE_Y };
    case "smoke":
      return { x: 0, y: PLANE_VFX_SMOKE_ANCHOR_Y };
    default:
      return { x: 0, y: 0 };
  }
}

function drawJetFlame(ctx2d, widthScale, baseOffsetY = getPlaneAnchorOffset("jet").y){
  if(widthScale <= 0) return;
  const flameOffsetY = baseOffsetY;
  ctx2d.save();
  ctx2d.translate(0, flameOffsetY);
  ctx2d.scale(widthScale * PLANE_VFX_JET_BASE_SCALE_X, PLANE_VFX_JET_BASE_SCALE_Y);
  ctx2d.translate(0, -flameOffsetY);

  const shimmer = (Math.sin(globalFrame * 0.02) + 1) / 2;
  const innerL = 70 + shimmer * 30; // 70%..100%
  const outerL = 45 + shimmer * 15; // 45%..60%
  const grad = ctx2d.createRadialGradient(0, flameOffsetY, 0, 0, flameOffsetY, planeMetric(3.75));
  grad.addColorStop(0, `hsl(200, 100%, ${innerL}%)`);
  grad.addColorStop(1, `hsl(210, 100%, ${outerL}%)`);
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.moveTo(0, flameOffsetY);
  ctx2d.quadraticCurveTo(planeMetric(3), flameOffsetY + planeMetric(3), 0, flameOffsetY + planeMetric(6));
  ctx2d.quadraticCurveTo(-planeMetric(3), flameOffsetY + planeMetric(3), 0, flameOffsetY);

  ctx2d.fill();
  ctx2d.restore();

}

function drawBlueJetFlame(ctx2d, scale, baseOffsetY = getPlaneAnchorOffset("jet").y){
  if(scale <= 0) return;
  const flameOffsetY = baseOffsetY;
  ctx2d.save();
  ctx2d.translate(0, flameOffsetY);
  const widthScale = PLANE_VFX_BLUE_JET_WIDTH_MULTIPLIER;
  const lengthScale = scale * PLANE_VFX_BLUE_JET_LENGTH_MULTIPLIER;
  ctx2d.scale(widthScale, lengthScale);
  ctx2d.translate(0, -flameOffsetY);
  const grad = ctx2d.createRadialGradient(0, flameOffsetY, 0, 0, flameOffsetY, planeMetric(7.5));
  grad.addColorStop(0, "#a0e9ff");
  grad.addColorStop(1, "#0077ff");
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.moveTo(0, flameOffsetY);
  ctx2d.quadraticCurveTo(planeMetric(6), flameOffsetY + planeMetric(6), 0, flameOffsetY + planeMetric(12));
  ctx2d.quadraticCurveTo(-planeMetric(6), flameOffsetY + planeMetric(6), 0, flameOffsetY);
  ctx2d.fill();
  ctx2d.restore();


}

function drawDieselSmoke(ctx2d, scale, baseOffsetY = getPlaneAnchorOffset("smoke").y, tailTrim = 0){
  if(scale <= 0) return;

  const baseRadius = planeMetric(5) * scale;
  const puffs = 3;
  const baseSpacing = baseRadius * 0.9;
  const totalSpan = baseSpacing * (puffs - 1);
  const trimmedSpan = Math.max(0, totalSpan - Math.max(0, tailTrim));
  const puffSpacing = puffs > 1 ? trimmedSpan / (puffs - 1) : 0;
  ctx2d.save();
  ctx2d.translate(0, baseOffsetY);
  ctx2d.scale(0.5, 1); // make smoke column narrower

  for(let i = 0; i < puffs; i++){
    const phase   = globalFrame * 0.2 - i; // wave moves away from the plane
    const flicker = 0.8 + 0.2 * Math.sin(phase);
    const radius  = baseRadius * (0.7 + 0.3 * Math.sin(phase * 0.7)) * flicker;
    const offsetX = Math.sin(phase) * baseRadius * 0.3;
    const offsetY =  i * puffSpacing;
    const alpha   = 1 - (i / (puffs - 1)) * 0.5; // fade to 50% transparency
    ctx2d.beginPath();
    ctx2d.globalAlpha = alpha;
    ctx2d.arc(offsetX, offsetY, radius, 0, Math.PI * 2);
    ctx2d.fillStyle = "#000";
    ctx2d.fill();
  }


  ctx2d.restore();
}

function addPlaneShading(ctx2d){
  const grad = ctx2d.createRadialGradient(0, 0, planeMetric(8), 0, 0, planeMetric(18));
  grad.addColorStop(0, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");

  const previousState = {
    alpha: ctx2d.globalAlpha,
    gco: ctx2d.globalCompositeOperation,
    filter: ctx2d.filter
  };

  ctx2d.save();
  ctx2d.globalAlpha = 1;
  ctx2d.globalCompositeOperation = "source-atop";
  ctx2d.filter = "none";

  tracePlaneSilhouettePath(ctx2d);
  ctx2d.clip();
  ctx2d.fillStyle = grad;

  const bbox = { x: -PLANE_DRAW_W / 2, y: -PLANE_DRAW_H / 2, w: PLANE_DRAW_W, h: PLANE_DRAW_H };

  if (DEBUG_PLANE_SHADING) {
    console.log("[DEBUG] addPlaneShading", {
      before: previousState,
      bbox,
      after: {
        alpha: ctx2d.globalAlpha,
        gco: ctx2d.globalCompositeOperation,
        filter: ctx2d.filter
      }
    });
  }

  ctx2d.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
  ctx2d.restore();
}

function addPlaneSilhouetteShading(ctx2d){
  const grad = ctx2d.createRadialGradient(0, 0, planeMetric(8), 0, 0, planeMetric(18));
  grad.addColorStop(0, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");

  ctx2d.save();
  tracePlaneSilhouettePath(ctx2d);
  ctx2d.clip();
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(-PLANE_DRAW_W / 2, -PLANE_DRAW_H / 2, PLANE_DRAW_W, PLANE_DRAW_H);
  ctx2d.restore();
}

function tracePlaneSilhouettePath(ctx2d){
  ctx2d.beginPath();
  ctx2d.moveTo(0, -planeMetric(20));
  ctx2d.quadraticCurveTo(planeMetric(12), -planeMetric(5), planeMetric(10), planeMetric(10));
  ctx2d.quadraticCurveTo(planeMetric(6), planeMetric(15), 0, planeMetric(18));
  ctx2d.quadraticCurveTo(-planeMetric(6), planeMetric(15), -planeMetric(10), planeMetric(10));
  ctx2d.quadraticCurveTo(-planeMetric(12), -planeMetric(5), 0, -planeMetric(20));
  ctx2d.closePath();
}

function drawPlaneOutline(ctx2d, color){
  ctx2d.strokeStyle = colorFor(color);
  ctx2d.lineWidth = 2;
  ctx2d.lineJoin = "round";
  ctx2d.lineCap = "round";
  tracePlaneSilhouettePath(ctx2d);
  ctx2d.stroke();
}

function drawProjectedPlaneGhost(ctx2d, color){
  const sprite = color === "green" ? greenPlaneImg : bluePlaneImg;
  const spriteReady = isSpriteReady(sprite);

  if(!spriteReady){
    drawPlaneOutline(ctx2d, color);
    return;
  }

  // Рисуем "призрак" тем же спрайтом самолёта, только с прозрачностью,
  // чтобы визуально совпадало с ghost-иконками в HUD/инвентаре.
  ctx2d.globalAlpha *= 0.36;
  ctx2d.drawImage(sprite, -PLANE_DRAW_W / 2, -PLANE_DRAW_H / 2, PLANE_DRAW_W, PLANE_DRAW_H);
}

function drawPlaneSpriteGlow(ctx2d, plane, glowStrength = 0) {
  if (!plane || glowStrength <= 0) {
    return;
  }

  const color = plane.color || "blue";
  let spriteImg = null;

  if (color === "blue") {
    spriteImg = bluePlaneImg;
  } else if (color === "green") {
    spriteImg = greenPlaneImg;
  }

  const spriteReady = isSpriteReady(spriteImg);

  const blend = Math.max(0, Math.min(1, glowStrength));

  ctx2d.save();

  if (!spriteReady) {
    ctx2d.restore();
    return;
  }

  ctx2d.globalCompositeOperation = "lighter";
  ctx2d.globalAlpha = 0.3 + 0.45 * blend;
  ctx2d.filter = `blur(${(2 + 4 * blend).toFixed(2)}px)`;

  const baseSize = PLANE_DRAW_W;
  const scale = 1 + 0.18 * blend;
  const drawSize = baseSize * scale;
  const offset = -drawSize / 2;

  ctx2d.imageSmoothingEnabled = true;
  ctx2d.drawImage(spriteImg, offset, offset, drawSize, drawSize);

  ctx2d.restore();
}

function drawThinPlane(ctx2d, plane, glow = 0) {
  const { x: cx, y: cy, color, angle } = plane;
  const isGhostState = plane.burning || (!plane.isAlive && !plane.nukeEliminated);
  const halfPlaneWidth = PLANE_DRAW_W / 2;
  const halfPlaneHeight = PLANE_DRAW_H / 2;
  const flightState = flyingPoints.find(fp => fp.plane === plane) || null;
  const isIdle = !flightState;
  const smokeAnchor = getPlaneAnchorOffset("smoke");
  const jetAnchor = getPlaneAnchorOffset("jet");
  const idleSmokeDistance = Math.max(0, smokeAnchor.y - PLANE_VFX_IDLE_SMOKE_DELTA_Y);
  const showEngine = !isGhostState && !plane.nukeEliminated;

  ctx2d.save();
  const shouldSway = plane.isAlive === true
    && plane.burning === false
    && !(handleCircle.active && handleCircle.pointRef === plane);
  const omega = (2 * Math.PI) / (FIELD_PLANE_SWAY_PERIOD_SEC * 60);
  const phase = (plane.id ?? plane.uid ?? 0) * 0.37;
  const swayWave = Math.sin(globalFrame * omega + phase);
  const swayAngle = shouldSway
    ? swayWave * (FIELD_PLANE_SWAY_DEG * Math.PI / 180)
    : 0;
  const rollOffset = shouldSway
    ? Math.sin(globalFrame * omega + phase + Math.PI / 2) * FIELD_PLANE_ROLL_BOB_PX
    : 0;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  ctx2d.translate(cx + nx * rollOffset, cy + ny * rollOffset);
  ctx2d.rotate(angle + swayAngle);

  const drawSmokeWithAnchor = (scale, offsetY, tailTrim = 0) => {
    if (scale <= 0 || offsetY < 0) return;
    drawDieselSmoke(ctx2d, scale, offsetY, tailTrim);
  };

  if (color === "green" && showEngine) {
    if (flightState) {
      const progress = (FIELD_FLIGHT_DURATION_SEC - flightState.timeLeft) / FIELD_FLIGHT_DURATION_SEC;
      let scale;
      if (progress < 0.5) {
        scale = 4 - 4 * progress; // 20px -> 10px
      } else {
        scale = 3 - 2 * progress; // 10px -> 5px
      }
      drawSmokeWithAnchor(scale, smokeAnchor.y);
    } else {
      drawSmokeWithAnchor(1, idleSmokeDistance, PLANE_VFX_IDLE_SMOKE_TAIL_TRIM_Y);
    }
  }

  const blend = isGhostState
    ? 0
    : Math.max(0, Math.min(1, glow));

  if (blend > 0) {
    const glowStrength = blend * 1.25; // boost brightness slightly
    drawPlaneSpriteGlow(ctx2d, plane, glowStrength);
  }

  ctx2d.shadowColor = "transparent";
  ctx2d.shadowBlur = 0;
  ctx2d.filter = "none";

  const nukeFadeFx = getNukePlaneFadeFx();
  const shouldApplyNukeFade = nukeFadeFx.active && (plane.isAlive || plane.nukeEliminated);
  const previousFilter = ctx2d.filter;
  const baseGhostAlpha = 0.3;
  if (color === "blue") {
    if (showEngine) {
      const flicker = 1 + 0.05 * Math.sin(globalFrame * 0.1);
      const idleFlicker = PLANE_VFX_JET_IDLE_FLICKER_BASE + PLANE_VFX_JET_IDLE_FLICKER_AMPLITUDE * Math.sin(globalFrame * 0.12);
      const jetScale = isIdle ? idleFlicker : flicker;
      drawJetFlame(ctx2d, jetScale, jetAnchor.y);

      if (flightState) {
        const progress = (FIELD_FLIGHT_DURATION_SEC - flightState.timeLeft) / FIELD_FLIGHT_DURATION_SEC;
        const scale = progress < 0.75 ? 4 * progress : 12 * (1 - progress);
        drawBlueJetFlame(ctx2d, scale, jetAnchor.y);
      }
    }
    const baseImgReady  = isSpriteReady(bluePlaneImg);
    if (!baseImgReady) {
      ctx2d.restore();
      return;
    }

    if (isGhostState) {
      ctx2d.globalAlpha *= baseGhostAlpha;
      ctx2d.filter = "grayscale(100%) brightness(90%)";
    }
    if (shouldApplyNukeFade) {
      ctx2d.globalAlpha *= nukeFadeFx.alpha;
      ctx2d.filter = `grayscale(${nukeFadeFx.grayscale}%)`;
    }

    ctx2d.drawImage(bluePlaneImg, -halfPlaneWidth, -halfPlaneHeight, PLANE_DRAW_W, PLANE_DRAW_H);
    ctx2d.filter = previousFilter;
    if (!isGhostState) {
      addPlaneShading(ctx2d);
    }
  } else if (color === "green") {
    const baseImgReady  = isSpriteReady(greenPlaneImg);
    if (!baseImgReady) {
      ctx2d.restore();
      return;
    }

    if (isGhostState) {
      ctx2d.globalAlpha *= baseGhostAlpha;
      ctx2d.filter = "grayscale(100%) brightness(90%)";
    }
    if (shouldApplyNukeFade) {
      ctx2d.globalAlpha *= nukeFadeFx.alpha;
      ctx2d.filter = `grayscale(${nukeFadeFx.grayscale}%)`;
    }

    ctx2d.drawImage(greenPlaneImg, -halfPlaneWidth, -halfPlaneHeight, PLANE_DRAW_W, PLANE_DRAW_H);
    ctx2d.filter = previousFilter;
    if (!isGhostState) {
      addPlaneShading(ctx2d);
    }
  } else {
    ctx2d.restore();
    return;
  }

  ctx2d.restore();
}

function drawRedCross(ctx2d, cx, cy, size = 20, progress = 1){
  const clampedProgress = Math.max(0, Math.min(1, progress));
  if (clampedProgress <= 0) {
    return;
  }

  ctx2d.save();
  ctx2d.translate(cx, cy);
  const previousFilter = ctx2d.filter;
  ctx2d.filter = "none";
  ctx2d.strokeStyle = HUD_KILL_MARKER_COLOR;
  ctx2d.globalAlpha *= HUD_KILL_MARKER_ALPHA;
  ctx2d.lineWidth = HUD_KILL_MARKER_LINE_WIDTH;
  ctx2d.lineCap = "round";

  const halfSize = size / 2;
  const line1Progress = Math.min(1, clampedProgress * 2);
  const line2Progress = Math.max(0, clampedProgress * 2 - 1);

  ctx2d.beginPath();
  if (line1Progress > 0) {
    const endX = -halfSize + size * line1Progress;
    const endY = -halfSize + size * line1Progress;
    ctx2d.moveTo(-halfSize, -halfSize);
    ctx2d.lineTo(endX, endY);
  }
  if (line2Progress > 0) {
    const endX = halfSize - size * line2Progress;
    const endY = -halfSize + size * line2Progress;
    ctx2d.moveTo(halfSize, -halfSize);
    ctx2d.lineTo(endX, endY);
  }
  ctx2d.stroke();

  ctx2d.filter = previousFilter;
  ctx2d.restore();
}

function hasCrashDelayElapsed(p){
  if (!p?.burning) {
    return false;
  }

  const start = p.crashStart;
  if (!Number.isFinite(start)) {
    return true;
  }

  return performance.now() - start >= CRASH_FX_DELAY_MS;
}

function drawPlaneCounterIcon(ctx2d, x, y, color, scale = 1) {
  ctx2d.save();
  ctx2d.translate(x, y);

  const style = getHudPlaneStyle(color);
  const styleScale = Number.isFinite(style?.scale) && style.scale > 0 ? style.scale : 1;

  // Base size of the icon so it fits within the scoreboard cell
  const size = HUD_BASE_PLANE_ICON_SIZE * scale * MINI_PLANE_ICON_SCALE * styleScale;

  const previousFilter = ctx2d.filter;
  const combinedFilter = combineFilters(HUD_PLANE_DIM_FILTER, style?.filter);
  ctx2d.filter = combinedFilter || "none";

  let img = null;
  if (color === "blue") {
    img = blueCounterPlaneImg;
  } else if (color === "green") {
    img = greenCounterPlaneImg;
  }

  const spriteReady = Boolean(
    img &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.naturalHeight > 0
  );

  if (spriteReady) {
    ctx2d.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    // Fallback to simple outline if the counter icon isn't ready yet
    ctx2d.strokeStyle = colorFor(color);
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.moveTo(0, -size / 2);
    ctx2d.lineTo(size / 4, size / 4);
    ctx2d.lineTo(size / 8, size / 4);
    ctx2d.lineTo(0, size / 2);
    ctx2d.lineTo(-size / 8, size / 4);
    ctx2d.lineTo(-size / 4, size / 4);
    ctx2d.closePath();
    ctx2d.stroke();
  }

  ctx2d.filter = previousFilter;
  ctx2d.restore();
}

function drawPlanesAndTrajectories(){
  resetCanvasState(planeCtx, planeCanvas);
  const scaleX = VIEW.scaleX;
  const scaleY = VIEW.scaleY;
  planeCtx.save();
  planeCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  const debugDrawOrder = DEBUG_VFX ? [] : null;

  let rangeTextInfo = null;
  const activeColor = turnColors[turnIndex];
  const pendingTargetColor = pendingInventoryUse?.color ?? null;
  const shouldHighlightPendingTargets = Boolean(pendingInventoryUse);
  const showGlow = !handleCircle.active && !flyingPoints.some(fp => fp.plane.color === activeColor);
  const destroyedOrBurning = [];
  const activePlanes = [];

  for (const point of points) {
    if (!point.isAlive || point.burning) {
      point.glow = 0;
      destroyedOrBurning.push(point);
    } else {
      activePlanes.push(point);
    }
  }

  const drawPlaneSegments = (ctx, plane) => {
    ctx.save();
    for (const seg of plane.segments) {
      ctx.beginPath();
      ctx.strokeStyle = colorFor(plane.color);
      ctx.lineWidth = seg.lineWidth || 3;
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.restore();
  };

  const renderPlane = (p, targetCtx, { allowRangeLabel = false } = {}) => {
    if(!p.isAlive && !p.burning && !isNukeEliminatedPlaneRenderable(p)) return;

    if (debugDrawOrder) {
      const stateLabel = p.isAlive ? (p.burning ? 'burning' : 'alive') : 'crashed';
      debugDrawOrder.push({
        id: p.id ?? 'unknown',
        team: p.color,
        state: stateLabel,
        frameIndex: globalFrame
      });
    }

    // Allow wreck sprites to render after crash delay instead of exiting early.
    drawPlaneSegments(targetCtx, p);
    const glowTarget = showGlow && p.color === activeColor && p.isAlive && !p.burning ? 1 : 0;
    if(p.glow === undefined) p.glow = glowTarget;
    if(!p.isAlive || p.burning){
      p.glow = 0;
    } else {
      p.glow += (glowTarget - p.glow) * 0.1;
    }
    const renderGlow = (!p.isAlive || p.burning) ? 0 : p.glow;
    drawThinPlane(targetCtx, p, renderGlow);

    if(allowRangeLabel && handleCircle.active && handleCircle.pointRef === p){
      let vdx = handleCircle.shakyX - p.x;
      let vdy = handleCircle.shakyY - p.y;
      let vdist = Math.hypot(vdx, vdy);
      if(vdist > MAX_DRAG_DISTANCE){
        vdist = MAX_DRAG_DISTANCE;
      }
      const effectiveRangeCells = getEffectiveFlightRangeCells(p);
      const cells = (vdist / MAX_DRAG_DISTANCE) * effectiveRangeCells;
      const textX = p.x + POINT_RADIUS + 8;
      rangeTextInfo = {
        color: colorFor(p.color),
        cells,
        x: textX,
        y: p.y,
        activeTurnBuff: getPlaneActiveTurnBuff(p)
      };
    }

    if(p.flagColor){
      targetCtx.save();
      targetCtx.strokeStyle = colorFor(p.flagColor);
      targetCtx.lineWidth = 3;
      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, POINT_RADIUS + 5, 0, Math.PI*2);
      targetCtx.stroke();
      targetCtx.restore();
    }

    if(
      shouldHighlightPendingTargets
      && p.color === pendingTargetColor
      && p.color === activeColor
      && p.isAlive === true
      && p.burning === false
    ){
      targetCtx.save();
      targetCtx.strokeStyle = "rgba(255, 255, 255, 0.95)";
      targetCtx.lineWidth = 2;
      targetCtx.beginPath();
      targetCtx.arc(p.x, p.y, POINT_RADIUS + 9, 0, Math.PI * 2);
      targetCtx.stroke();
      targetCtx.restore();
    }
  };

  for(const p of destroyedOrBurning){
    renderPlane(p, gsBoardCtx);
    ensurePlaneFlameFx(p);
  }

  for(const p of activePlanes){
    renderPlane(p, planeCtx, { allowRangeLabel: true });
  }

  updateAllPlaneFlameFxPositions();

  drawVfxDebugOverlay(planeCtx, activePlanes, destroyedOrBurning);

  if (debugDrawOrder && debugDrawOrder.length > 0) {
    console.debug('[VFX][draw-order]', debugDrawOrder);
  }

  planeCtx.restore();

  return rangeTextInfo;
}

function drawAimOverlay(rangeTextInfo) {
  if (!rangeTextInfo) return;
  if (!hudCtx || !(hudCanvas instanceof HTMLCanvasElement)) return;

  const hudScaleX = VIEW.scaleX;
  const hudScaleY = VIEW.scaleY;
  const { x: hudOffsetX, y: hudOffsetY } = getFieldOffsetsInCanvasSpace(
    hudCanvas,
    hudScaleX,
    hudScaleY
  );

  hudCtx.save();
  hudCtx.setTransform(
    hudScaleX,
    0,
    0,
    hudScaleY,
    hudOffsetX,
    hudOffsetY
  );

  hudCtx.globalAlpha = 1;
  hudCtx.font = "14px sans-serif";
  hudCtx.textAlign = "left";
  hudCtx.textBaseline = "middle";
  hudCtx.lineWidth = 2;
  hudCtx.strokeStyle = "rgba(255, 255, 255, 0.75)";
  hudCtx.fillStyle = rangeTextInfo.color;

  const numText = rangeTextInfo.cells.toFixed(1);
  hudCtx.strokeText(numText, rangeTextInfo.x, rangeTextInfo.y - 8);
  hudCtx.fillText(numText, rangeTextInfo.x, rangeTextInfo.y - 8);
  hudCtx.strokeText("cells", rangeTextInfo.x, rangeTextInfo.y + 8);
  hudCtx.fillText("cells", rangeTextInfo.x, rangeTextInfo.y + 8);

  const iconSize = 12;
  const iconX = rangeTextInfo.x;
  const iconY = rangeTextInfo.y + 18;
  let buffIcon = null;
  if(rangeTextInfo.activeTurnBuff === INVENTORY_ITEM_TYPES.CROSSHAIR){
    buffIcon = crosshairIconSprite;
  } else if(rangeTextInfo.activeTurnBuff === INVENTORY_ITEM_TYPES.FUEL){
    buffIcon = fuelIconSprite;
  }

  if(buffIcon && isSpriteReady(buffIcon)){
    hudCtx.drawImage(buffIcon, iconX, iconY, iconSize, iconSize);
  }

  hudCtx.restore();
}

function drawBaseSprite(ctx2d, color){
  const layout = getBaseLayout(color);
  const sprite = baseSprites[color];
  if(layout && isSpriteReady(sprite)){
    ctx2d.drawImage(sprite, layout.x, layout.y, layout.width, layout.height);
    return true;
  }
  return false;
}

function drawFlag(ctx2d, x, y, color){
  ctx2d.save();
  ctx2d.strokeStyle = "#333";
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.moveTo(x, y);
  ctx2d.lineTo(x, y - FLAG_POLE_HEIGHT);
  ctx2d.stroke();

  ctx2d.fillStyle = colorFor(color);
  ctx2d.beginPath();
  ctx2d.moveTo(x, y - FLAG_POLE_HEIGHT);
  ctx2d.lineTo(x + FLAG_WIDTH, y - FLAG_POLE_HEIGHT + FLAG_HEIGHT / 2);
  ctx2d.lineTo(x, y - FLAG_POLE_HEIGHT + FLAG_HEIGHT);
  ctx2d.closePath();
  ctx2d.fill();
  ctx2d.restore();
}

function getFlagSpriteLayoutForPlacement(flag, anchor = null){
  const baseLayout = flag?.layout || getFlagLayoutForColor(flag?.color);
  const sprite = flagSprites[flag?.color];
  const width = baseLayout?.width ?? sprite?.naturalWidth ?? FLAG_WIDTH;
  const height = baseLayout?.height ?? sprite?.naturalHeight ?? (FLAG_POLE_HEIGHT + FLAG_HEIGHT);

  if(anchor && Number.isFinite(anchor.x) && Number.isFinite(anchor.y)){
    return { x: anchor.x - width / 2, y: anchor.y - height / 2, width, height };
  }

  if(baseLayout){
    return baseLayout;
  }

  return null;
}

function drawFlagSprite(ctx2d, flag, { anchor = null } = {}){
  const sprite = flagSprites[flag?.color];
  const layout = getFlagSpriteLayoutForPlacement(flag, anchor || getFlagAnchor(flag));
  if(layout && isSpriteReady(sprite)){
    ctx2d.drawImage(sprite, layout.x, layout.y, layout.width, layout.height);
    return true;
  }
  return false;
}

function drawBaseVisuals(){
  if(!isFlagsModeEnabled()) return;
  const baseColors = ["blue", "green"];

  for(const color of baseColors){
    const hasBaseSprite = drawBaseSprite(gsBoardCtx, color);
    if(!hasBaseSprite){
      const baseAnchor = getBaseAnchor(color);
      const baseLayout = getBaseLayout(color);
      const fallbackWidth = baseLayout?.width ?? 26;
      const fallbackHeight = baseLayout?.height ?? 14;
      gsBoardCtx.save();
      gsBoardCtx.fillStyle = "rgba(0, 0, 0, 0.25)";
      gsBoardCtx.fillRect(
        baseAnchor.x - fallbackWidth / 2,
        baseAnchor.y - fallbackHeight / 2,
        fallbackWidth,
        fallbackHeight
      );
      gsBoardCtx.restore();
    }
  }
}

function drawFlagMarkers(){
  if(!isFlagsModeEnabled()) return;
  for(const flag of flags){
    if(flag.state !== FLAG_STATES.ACTIVE) continue;
    if(flag.carrier) continue;

    if(flag.droppedAt){
      drawFlagSprite(gsBoardCtx, flag, { anchor: flag.droppedAt });
    } else {
      const hasSprite = drawFlagSprite(gsBoardCtx, flag);
      if(!hasSprite){
        const layout = flag.layout || getFlagLayoutForColor(flag.color);
        const anchor = getFlagAnchor(flag);
        const poleBaseY = layout ? layout.y + layout.height : anchor.y;
        drawFlag(gsBoardCtx, anchor.x, poleBaseY, flag.color);
      }
    }
  }
}


function drawMines(){
  if(!Array.isArray(mines) || mines.length === 0) return;
  const halfMineWidth = MINE_ICON_WIDTH / 2;
  const halfMineHeight = MINE_ICON_HEIGHT / 2;

  for(let i = 0; i < mines.length; i++){
    const mine = mines[i];
    if(!mine) continue;
    const phase = ((mine.x + mine.y) * 0.07) + i * 0.37;
    const swayDeg = Math.sin(globalFrame * FIELD_MINE_SWAY_OMEGA + phase) * FIELD_MINE_SWAY_DEG;
    const swayRad = swayDeg * Math.PI / 180;
    const bobOffsetY = Math.sin(globalFrame * FIELD_MINE_SWAY_OMEGA * 1.15 + phase) * FIELD_MINE_BOB_PX;

    gsBoardCtx.save();
    gsBoardCtx.translate(mine.x, mine.y + bobOffsetY);
    gsBoardCtx.rotate(swayRad);

    if(isSpriteReady(mineIconSprite)){
      gsBoardCtx.drawImage(
        mineIconSprite,
        -halfMineWidth,
        -halfMineHeight,
        MINE_ICON_WIDTH,
        MINE_ICON_HEIGHT
      );
    } else {
      gsBoardCtx.fillStyle = mine.owner === "blue" ? "#2d5cff" : "#3f9f3f";
      gsBoardCtx.beginPath();
      gsBoardCtx.arc(0, 0, CELL_SIZE * 0.25, 0, Math.PI * 2);
      gsBoardCtx.fill();
    }
    gsBoardCtx.restore();
  }
}


function drawAAUnits(){
  const now = performance.now();
  for(const aa of aaUnits){
    gsBoardCtx.save();
    // draw fading trail
    gsBoardCtx.save();
    applyBrickTrailClip(gsBoardCtx);
    for(const seg of aa.trail){
      const age = now - seg.time;

      const alpha = (1 - age/AA_TRAIL_MS) * 0.3;

      const trailAng = seg.angleDeg * Math.PI/180;

      gsBoardCtx.save();
      gsBoardCtx.translate(aa.x, aa.y);
      gsBoardCtx.rotate(trailAng);

      // wider beam with fade across its width
      const width = 8;
      const grad = gsBoardCtx.createLinearGradient(0, -width/2, 0, width/2);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, colorFor(aa.owner));
      grad.addColorStop(1, "rgba(0,0,0,0)");

      gsBoardCtx.globalAlpha = alpha;
      gsBoardCtx.strokeStyle = grad;
      gsBoardCtx.lineWidth = width;
      gsBoardCtx.lineCap = "round";
      gsBoardCtx.beginPath();
      gsBoardCtx.moveTo(0, 0);
      gsBoardCtx.lineTo(aa.radius, 0);
      gsBoardCtx.stroke();
      gsBoardCtx.restore();
    }
    gsBoardCtx.restore();

    gsBoardCtx.globalAlpha = 1;
    // radar sweep line with highlight
    const ang = aa.sweepAngleDeg * Math.PI/180;
    const endX = aa.x + Math.cos(ang) * aa.radius;
    const endY = aa.y + Math.sin(ang) * aa.radius;
    gsBoardCtx.strokeStyle = colorFor(aa.owner);
    gsBoardCtx.lineWidth = 2;
    gsBoardCtx.lineCap = "round";
    gsBoardCtx.beginPath();
    gsBoardCtx.moveTo(aa.x, aa.y);
    gsBoardCtx.lineTo(endX, endY);
    gsBoardCtx.stroke();

    // inner translucent white highlight on sweep line
    gsBoardCtx.globalAlpha = 0.5;
    gsBoardCtx.strokeStyle = "white";
    gsBoardCtx.lineWidth = 1;
    gsBoardCtx.lineCap = "round";
    gsBoardCtx.beginPath();
    gsBoardCtx.moveTo(aa.x, aa.y);
    gsBoardCtx.lineTo(endX, endY);
    gsBoardCtx.stroke();

    gsBoardCtx.globalAlpha = 1;

    // Anti-Aircraft center ring
    gsBoardCtx.beginPath();
    gsBoardCtx.fillStyle = colorFor(aa.owner);
    gsBoardCtx.arc(aa.x, aa.y, 6, 0, Math.PI*2);
    gsBoardCtx.fill();

    // inner white circle to add volume
    gsBoardCtx.beginPath();
    gsBoardCtx.fillStyle = "white";
    gsBoardCtx.arc(aa.x, aa.y, 4, 0, Math.PI*2);
    gsBoardCtx.fill();

    gsBoardCtx.restore();
  }
}

function drawArrow(ctx, cx, cy, dx, dy) {
  if (!isSpriteReady(arrowSprite)) return;

  // Shaft length doubles the pull distance so the plane sits in the middle
  const shaftLen = 2 * Math.hypot(dx, dy);
  const ang = Math.atan2(-dy, -dx); // head points toward flight direction

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.filter = "blur(0.2px)"; // soften jagged arrow when rotated

  // Tail (fixed size, anchored at the drag point, rotated 180°)
  const tailCenterX = -shaftLen / 2 - TAIL_DEST_W / 2;
  ctx.save();
  ctx.translate(tailCenterX, 0);
  ctx.rotate(Math.PI);
  ctx.drawImage(
    arrowSprite,
    TAIL_X, ARROW_Y, TAIL_W, PART_H,
    -TAIL_DEST_W / 2, -ARROW_DEST_H / 2,

    TAIL_DEST_W, ARROW_DEST_H
  );
  ctx.restore();

  // Shaft (stretched to match distance)
  ctx.drawImage(
    arrowSprite,
    SHAFT_X, ARROW_Y, SHAFT_W, PART_H,
    -shaftLen / 2, -ARROW_DEST_H / 2,
    shaftLen, ARROW_DEST_H
  );

  // Head (fixed size, rotated 180°)
  const headCenterX = shaftLen / 2 + HEAD_DEST_W / 2;
  ctx.save();
  ctx.translate(headCenterX, 0);
  ctx.rotate(Math.PI);
  ctx.drawImage(
    arrowSprite,
    HEAD_X, ARROW_Y, HEAD_W, PART_H,

    -HEAD_DEST_W / 2, -ARROW_DEST_H / 2,

    HEAD_DEST_W, ARROW_DEST_H
  );
  ctx.restore();

  ctx.restore();
}

function getExplosionVariantsForColor(color) {
  preloadExplosionSprites();
  const normalized = color === "green" ? "green" : "blue";
  const sprites = explosionImagesByColor[normalized] || [];
  return sprites.filter(Boolean);
}

function createExplosionState(plane, x, y) {
  const variants = getExplosionVariantsForColor(plane.color);
  const readyVariants = variants.filter(isSpriteReady);
  const pool = readyVariants.length ? readyVariants : variants;
  const img = pool.length
    ? pool[Math.floor(Math.random() * pool.length)]
    : null;
  if (img) {
    const durationMs = getShortExplosionDurationMs(img.src, plane.color);
    if (Number.isFinite(durationMs)) {
      img.durationMs = durationMs;
    }
  }

  return {
    kind: "gif",
    x,
    y,
    img,
    variants,
    startedAtMs: null,
    ttlMs: resolveExplosionGifDurationMs(img, plane.color),
    debugFramesLogged: 0,
    color: plane.color,
  };
}

function createExplosionImageEntry(explosionState, img) {
  const host = ensureExplosionHost();
  if (!host) {
    return null;
  }

  const metrics = resolveExplosionMetrics('explosion');
  if (!metrics) {
    return null;
  }

  const x = explosionState?.x;
  const y = explosionState?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const resolvedSrc = img?.src || explosionState?.img?.src || '';
  if (!resolvedSrc) {
    return null;
  }

  const { boardRect, overlayRect } = metrics;
  const { overlayX, overlayY } = worldToOverlayLocal(x, y, { boardRect, overlayRect });

  const container = document.createElement('div');
  container.classList.add('fx-explosion');
  Object.assign(container.style, {
    position: 'absolute',
    pointerEvents: 'none',
    transform: 'translate(-50%, -50%)',
    width: `${EXPLOSION_DRAW_SIZE}px`,
    height: `${EXPLOSION_DRAW_SIZE}px`,
    left: `${Math.round(overlayX)}px`,
    top: `${Math.round(overlayY)}px`
  });

  const image = new Image();
  image.decoding = 'async';
  image.width = EXPLOSION_DRAW_SIZE;
  image.height = EXPLOSION_DRAW_SIZE;
  image.className = 'fx-explosion-img';
  image.src = resolvedSrc;

  container.appendChild(image);
  host.appendChild(container);

  return { element: container, img: image, host, metrics };
}

function spawnExplosionForPlane(plane, x = null, y = null) {
  if (!plane || plane.explosionSpawned) {
    return null;
  }

  const cx = Number.isFinite(plane.x)
    ? plane.x
    : (Number.isFinite(x) ? x : plane.collisionX);
  const cy = Number.isFinite(plane.y)
    ? plane.y
    : (Number.isFinite(y) ? y : plane.collisionY);
  const state = createExplosionState(plane, cx, cy);

  activeExplosions.push(state);
  plane.explosionSpawned = true;
  return state;
}

function updateAndDrawExplosions(ctx, now) {
  if (!ctx) return;

  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const explosion = activeExplosions[i];
    const img = explosion.img || null;
    const kind = explosion.kind ?? "sheet";

    if (kind === "gif") {
      explosion.startedAtMs = explosion.startedAtMs ?? now;

      const elapsed = now - explosion.startedAtMs;
      const resolvedTtlMs = resolveExplosionGifDurationMs(img, explosion.color);
      const exactTtlMs = getExactExplosionGifDurationMs(img);
      if (Number.isFinite(exactTtlMs)) {
        explosion.ttlMs = exactTtlMs;
      }
      const ttlMs = Number.isFinite(explosion.ttlMs) ? explosion.ttlMs : resolvedTtlMs;

      if (elapsed >= ttlMs) {
        if (explosion.domEntry?.element?.remove) {
          explosion.domEntry.element.remove();
        }
        if (explosion.domEntry) {
          delete explosion.domEntry;
        }
        activeExplosions.splice(i, 1);
        continue;
      }

      if (!explosion.domEntry && img?.src) {
        explosion.domEntry = createExplosionImageEntry(explosion, img);
      }

      const metrics = resolveExplosionMetrics('explosion');
      if (metrics && explosion.domEntry?.element) {
        explosion.domEntry.metrics = metrics;
        const { overlayX, overlayY } = worldToOverlayLocal(explosion.x, explosion.y, metrics);
        Object.assign(explosion.domEntry.element.style, {
          left: `${Math.round(overlayX)}px`,
          top: `${Math.round(overlayY)}px`
        });
      }

      if (DEBUG_FX && explosion.debugFramesLogged < 3) {
        console.debug("[fx] explosion frame", {
          naturalW: img?.naturalWidth,
          naturalH: img?.naturalHeight,
          ttlMs,
        });
        explosion.debugFramesLogged++;
      }

      continue;
    }

    const size = EXPLOSION_DRAW_SIZE;
    const half = size / 2;
    const frameCount = Math.max(1, Number.isFinite(explosion.frameCount) ? explosion.frameCount : 1);
    const frameDurationMs = Math.max(1, Number.isFinite(explosion.frameDurationMs) ? explosion.frameDurationMs : 80);
    explosion.frameIndex = Number.isFinite(explosion.frameIndex) ? explosion.frameIndex : 0;
    explosion.lastFrameAtMs = Number.isFinite(explosion.lastFrameAtMs) ? explosion.lastFrameAtMs : now;

    if (now - explosion.lastFrameAtMs >= frameDurationMs) {
      const framesToAdvance = Math.floor((now - explosion.lastFrameAtMs) / frameDurationMs);
      explosion.frameIndex += framesToAdvance;
      explosion.lastFrameAtMs += framesToAdvance * frameDurationMs;
    }

    if (explosion.frameIndex >= frameCount) {
      activeExplosions.splice(i, 1);
      continue;
    }

    ctx.save();
    if (img && ((img instanceof ImageBitmap) || isSpriteReady(img))) {
      const sourceWidth = img.naturalWidth || img.width || size;
      const sourceHeight = img.naturalHeight || img.height || size;
      const frameWidth = sourceWidth / frameCount;
      const sx = Math.floor(explosion.frameIndex) * frameWidth;
      ctx.drawImage(
        img,
        sx,
        0,
        frameWidth,
        sourceHeight,
        explosion.x - half,
        explosion.y - half,
        size,
        size
      );
    } else {
      ctx.fillStyle = "rgba(255, 200, 40, 0.9)";
      ctx.beginPath();
      ctx.arc(explosion.x, explosion.y, half, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (DEBUG_FX && explosion.debugFramesLogged < 3) {
      console.debug("[fx] explosion frame", {
        naturalW: img?.naturalWidth,
        naturalH: img?.naturalHeight,
        frameIndex: explosion.frameIndex,
        frameCount,
      });
      explosion.debugFramesLogged++;
    }
  }
}

/* ======= HITS / VICTORY ======= */
function awardPoint(color){
  if(!color) return;
  addScore(color, 1, { deferVictoryCheck: isNuclearStrikeResolutionActive });
}
function checkPlaneHits(plane, fp){
  if(isGameOver) return;
  const enemyColor = (plane.color==="green") ? "blue" : "green";
  for(const p of points){
    if(!p.isAlive || p.burning) continue;
    if(p.color !== enemyColor) continue;
    if(fp && fp.lastHitPlane === p && fp.lastHitCooldown > 0) continue;
    const dx = p.x - plane.x;
    const dy = p.y - plane.y;
    const d  = Math.hypot(dx, dy);
    if(d < POINT_RADIUS*2){
      p.isAlive = false;
      p.burning = true;
      ensurePlaneBurningFlame(p);
      flyingPoints = flyingPoints.filter(other => other.plane !== p);
      const cx = d === 0 ? plane.x : plane.x + dx / d * POINT_RADIUS;
        const cy = d === 0 ? plane.y : plane.y + dy / d * POINT_RADIUS;
        p.collisionX = cx;
        p.collisionY = cy;
        const collisionCrashTimestamp = performance.now();
        p.crashStart = collisionCrashTimestamp;
        p.killMarkerStart = collisionCrashTimestamp;
        spawnExplosionForPlane(p, cx, cy);
        schedulePlaneFlameFx(p);
        if(fp){
          fp.lastHitPlane = p;
          fp.lastHitCooldown = PLANE_HIT_COOLDOWN_SEC;
        }
      if(p.carriedFlagId){
        const carriedFlag = getFlagById(p.carriedFlagId);
        if(isFlagActive(carriedFlag)){
          dropFlagAtPosition(carriedFlag, { x: cx, y: cy });
        }
        clearFlagFromPlane(p);
      }
      awardPoint(plane.color);
      checkVictory();
      if(isGameOver) return;
    }
  }
}

function handleFlagInteractions(plane){
  if(isGameOver || !isFlagsModeEnabled()) return;

  const enemyColor = plane.color === "green" ? "blue" : "green";
  const availableEnemyFlags = getAvailableFlagsByColor(enemyColor);
  const ownBase = getBaseInteractionTarget(plane.color);
  const carriedFlag = plane.carriedFlagId ? getFlagById(plane.carriedFlagId) : null;

  if(!carriedFlag){
    if(plane.carriedFlagId) return;
    for(const flag of availableEnemyFlags){
      if(flag.carrier) continue;
      const target = getFlagInteractionTarget(flag);
      if(!target) continue;
      const dist = Math.hypot(plane.x - target.anchor.x, plane.y - target.anchor.y);
      if(dist < target.radius && !plane.carriedFlagId){
        assignFlagToPlane(flag, plane);
        break;
      }
    }
  } else {
    const distOwn = Math.hypot(plane.x - ownBase.anchor.x, plane.y - ownBase.anchor.y);
    if(distOwn < ownBase.radius){
      if(carriedFlag.color !== plane.color){
        addScore(plane.color, 5);
      }
      captureFlag(carriedFlag);
      clearFlagFromPlane(plane);
    }
  }
}
function checkVictory(options = {}){
  const greenAlive = points.filter(p=>p.isAlive && p.color==="green").length;
  const blueAlive  = points.filter(p=>p.isAlive && p.color==="blue").length;
  const deferRoundLock = Boolean(options.deferRoundLock);
  if(isGameOver) return;

  if(!deferRoundLock && blueScore >= POINTS_TO_WIN && greenScore >= POINTS_TO_WIN){
    lockInDraw({ showEndScreen: true });
    return;
  }

  const canContinueSeries = blueScore < POINTS_TO_WIN && greenScore < POINTS_TO_WIN;

  if(deferRoundLock) return;

  if(greenAlive === 0){
    const options = canContinueSeries ? { roundTransitionDelay: MIN_ROUND_TRANSITION_DELAY_MS } : { showEndScreen: true };
    lockInWinner("blue", options);
  } else if(blueAlive === 0){
    const options = canContinueSeries ? { roundTransitionDelay: MIN_ROUND_TRANSITION_DELAY_MS } : { showEndScreen: true };
    lockInWinner("green", options);
  }
}

/* ======= SCOREBOARD ======= */

function lerp(a, b, t){
  return a + (b - a) * t;
}

function easeOutCubic(p){
  const clamped = clamp(p, 0, 1);
  return 1 - Math.pow(1 - clamped, 3);
}

function smoothstep01(p){
  const clamped = clamp(p, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function trackMatchScoreSpawn(color, startIndex, endIndex){
  const slots = matchScoreSpawnTimes[color];
  if (!Array.isArray(slots)) return;

  const from = Math.max(0, Math.min(POINTS_TO_WIN, startIndex));
  const to = Math.max(from, Math.min(POINTS_TO_WIN, endIndex));
  const baseTime = performance.now();

  for (let i = from; i < to; i += 1){
    const delayIndex = i - from;
    slots[i] = baseTime + delayIndex * MATCH_SCORE_STAGGER_DELAY_MS;
  }

  matchScoreAnimationActiveUntil = Math.max(
    matchScoreAnimationActiveUntil,
    baseTime + (to - from - 1) * MATCH_SCORE_STAGGER_DELAY_MS + MATCH_SCORE_ANIMATION_DURATION_MS
  );
}

function hasActiveMatchScoreAnimations(now = performance.now()){
  return Number.isFinite(matchScoreAnimationActiveUntil)
    && now < matchScoreAnimationActiveUntil;
}

function getMatchScoreScale(color, index, now){
  const slots = matchScoreSpawnTimes[color];
  if (!Array.isArray(slots)) return 1;

  const start = slots[index];
  if (!Number.isFinite(start) || start <= 0) return 1;

  const age = now - start;
  if (age >= MATCH_SCORE_ANIMATION_DURATION_MS) return 1;

  if (age <= MATCH_SCORE_ANIMATION_PEAK_TIME_MS){
    const p = easeOutCubic(age / MATCH_SCORE_ANIMATION_PEAK_TIME_MS);
    return lerp(MATCH_SCORE_ANIMATION_START_SCALE, MATCH_SCORE_ANIMATION_PEAK_SCALE, p);
  }

  const tailDuration = MATCH_SCORE_ANIMATION_DURATION_MS - MATCH_SCORE_ANIMATION_PEAK_TIME_MS;
  const p = smoothstep01((age - MATCH_SCORE_ANIMATION_PEAK_TIME_MS) / tailDuration);
  return lerp(MATCH_SCORE_ANIMATION_PEAK_SCALE, 1, p);
}

function buildMatchScoreFrame(color, scaleX, scaleY) {
  const spec = MATCH_SCORE_CONTAINERS?.[color];
  if (!spec) return null;

  const width = spec.width * scaleX;
  const height = spec.height * scaleY;
  const left = spec.x * scaleX;
  const top = spec.y * scaleY;

  if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) {
    return null;
  }

  return { left, top, width, height, scaleX, scaleY };
}

function drawMatchScore(ctx, scaleX = 1, scaleY = 1, now = performance.now()){
  if (!ctx) return;

  loadMatchScoreImagesIfNeeded();

  const colors = ["blue", "green"];
  for (const color of colors){
    const frame = buildMatchScoreFrame(color, scaleX, scaleY);
    const spec = MATCH_SCORE_CONTAINERS?.[color];
    const icon = matchScoreImages[color];
    const ghostIcon = matchScoreGhostImages[color] || icon;
    if (!frame || !spec || !isSpriteReady(icon) || !isSpriteReady(ghostIcon)) continue;

    const score = color === "blue" ? blueScore : greenScore;
    const count = Math.max(0, Math.min(POINTS_TO_WIN, score));

    const positions = [];

    const cellSize = MATCH_SCORE_ICON_RENDER_SIZE;
    const totalRows = Math.ceil(POINTS_TO_WIN / 2);

    const paddingX = Math.max(0, (spec.width - cellSize * 2) / 2);
    const maxTop = Math.max(0, spec.height - cellSize);
    const rowStride = totalRows > 1 ? maxTop / (totalRows - 1) : 0;

    const srcInset = Math.max(0, Math.min(MATCH_SCORE_ICON_SOURCE_INSET, Math.floor(Math.min(icon.naturalWidth, icon.naturalHeight) / 2)));
    const srcX = srcInset;
    const srcY = 0;
    const srcW = Math.max(1, icon.naturalWidth - srcInset * 2);
    const srcH = Math.max(1, icon.naturalHeight - srcInset);

    for (let i = 0; i < POINTS_TO_WIN; i += 1){
      const localX = paddingX + (i % 2) * cellSize;
      const localY = Math.min(maxTop, Math.floor(i / 2) * rowStride);

      const centerX = Math.round(frame.left + (localX + cellSize / 2) * scaleX);
      const centerY = Math.round(frame.top + (localY + cellSize / 2) * scaleY);

      const baseW = Math.round(cellSize * scaleX);
      const baseH = Math.round(cellSize * scaleY);

      positions.push({ centerX, centerY, baseW, baseH });
    }

    for (const slot of positions){
      const dstW = slot.baseW;
      const dstH = slot.baseH;
      const screenX = Math.round(slot.centerX - dstW / 2) + MATCHSCORE_OFFSET_X;
      const screenY = Math.round(slot.centerY - dstH / 2);

      ctx.save();
      ctx.globalAlpha = MATCH_SCORE_GHOST_ALPHA;
      ctx.drawImage(ghostIcon, srcX, srcY, srcW, srcH, screenX, screenY, dstW, dstH);
      ctx.restore();
    }

    for (let i = 0; i < count; i += 1){
      const slot = positions[i];
      if (!slot) continue;

      const scale = getMatchScoreScale(color, i, now);

      const dstW = Math.round(slot.baseW * scale);
      const dstH = Math.round(slot.baseH * scale);
      const screenX = Math.round(slot.centerX - dstW / 2) + MATCHSCORE_OFFSET_X;
      const screenY = Math.round(slot.centerY - dstH / 2);

      ctx.drawImage(icon, srcX, srcY, srcW, srcH, screenX, screenY, dstW, dstH);
    }
  }
}

const PLANE_COUNTER_PADDING = 2;
const PLANE_COUNTER_CONTAINERS = {
  blue: HUD_LAYOUT.planeCounters.blue,
  green: HUD_LAYOUT.planeCounters.green
};

const planeCounterDeathStartTimes = {
  blue: Array(PLANES_PER_SIDE).fill(null),
  green: Array(PLANES_PER_SIDE).fill(null),
};

const planeCounterPreviousAliveCounts = {
  blue: PLANES_PER_SIDE,
  green: PLANES_PER_SIDE,
};

function getPlaneCounterSlotOrderFromCenter(color){
  return color === 'green'
    ? [0, 1, 2, 3]
    : [3, 2, 1, 0];
}

function resetPlaneCounterDeaths(color, aliveCount){
  planeCounterDeathStartTimes[color] = Array(PLANES_PER_SIDE).fill(null);
  planeCounterPreviousAliveCounts[color] = clamp(aliveCount, 0, PLANES_PER_SIDE);
}

function updatePlaneCounterDeaths(color, aliveCount, now){
  const slotOrderFromCenter = getPlaneCounterSlotOrderFromCenter(color);
  const slotCount = slotOrderFromCenter.length;
  const clampedAlive = clamp(aliveCount, 0, slotCount);

  if (clampedAlive > planeCounterPreviousAliveCounts[color]){
    resetPlaneCounterDeaths(color, clampedAlive);
  }

  const slotsToHide = Math.max(0, slotCount - clampedAlive);
  const timers = planeCounterDeathStartTimes[color];

  for (let i = 0; i < slotCount; i += 1){
    const slotIndex = slotOrderFromCenter[i];
    if (i < slotsToHide){
      if (timers[slotIndex] === null){
        timers[slotIndex] = now;
      }
    } else {
      timers[slotIndex] = null;
    }
  }

  planeCounterPreviousAliveCounts[color] = clampedAlive;

  return { slotsToHide, slotOrderFromCenter };
}

const MIN_ROUND_TRANSITION_DELAY_MS = 1200;
function getKillMarkerProgress(plane, now = performance.now()){
  if (!plane) {
    return 0;
  }

  if (plane.isAlive && !plane.burning) {
    if (plane.killMarkerStart) {
      delete plane.killMarkerStart;
    }
    return 0;
  }

  const duration = HUD_KILL_MARKER_DRAW_DURATION_MS > 0
    ? HUD_KILL_MARKER_DRAW_DURATION_MS
    : 800;

  let start = plane.killMarkerStart;
  if (!Number.isFinite(start)) {
    start = Number.isFinite(plane.crashStart) ? plane.crashStart : now;
    plane.killMarkerStart = start;
  }

  const elapsed = now - start;
  if (!Number.isFinite(elapsed)) {
    return 1;
  }

  if (duration <= 0) {
    return 1;
  }

  return Math.max(0, Math.min(1, elapsed / duration));
}
function renderScoreboard(now = performance.now()){
  updateTurnIndicators();
  if (!hudCtx || !(hudCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  hudCtx.setTransform(1, 0, 0, 1, 0, 0);
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);

  const scaleX = hudCanvas.width / FRAME_BASE_WIDTH;
  const scaleY = hudCanvas.height / FRAME_BASE_HEIGHT;

  const blueHudFrame = buildPlaneCounterFrame('blue', scaleX, scaleY);
  const greenHudFrame = buildPlaneCounterFrame('green', scaleX, scaleY);

  if (blueHudFrame) {
    drawPlayerHUD(
      hudCtx,
      blueHudFrame,
      "blue",
      turnColors[turnIndex] === "blue",
      now
    );
  }

  if (greenHudFrame) {
    drawPlayerHUD(
      hudCtx,
      greenHudFrame,
      "green",
      turnColors[turnIndex] === "green",
      now
    );
  }

  drawMatchScore(hudCtx, scaleX, scaleY, now);

  if (DEBUG_LAYOUT) {
    drawHudDebugLayout(hudCtx, scaleX, scaleY);
  }
}

function buildPlaneCounterFrame(color, scaleX, scaleY) {
  const spec = PLANE_COUNTER_CONTAINERS?.[color];
  if (!spec) return null;

  const width = spec.width * scaleX;
  const height = spec.height * scaleY;
  const left = spec.x * scaleX;
  const top = spec.y * scaleY;

  if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) {
    return null;
  }

  return { left, top, width, height, scaleX, scaleY };
}

function drawHudDebugLayout(ctx, scaleX, scaleY) {
  const slots = [
    { id: 'BluePlaneCounter', ...HUD_LAYOUT.planeCounters.blue },
    { id: 'GreenPlaneCounter', ...HUD_LAYOUT.planeCounters.green },
  ];

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${Math.max(10, 12 * scaleX)}px 'Roboto', sans-serif`;
  ctx.textBaseline = 'top';

  for (const slot of slots) {
    if (!slot) continue;
    const left = slot.x * scaleX;
    const top = slot.y * scaleY;
    const width = slot.width * scaleX;
    const height = slot.height * scaleY;

    ctx.fillStyle = 'rgba(255, 0, 255, 0.08)';
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.6)';
    ctx.lineWidth = Math.max(1, scaleX);
    ctx.fillRect(left, top, width, height);
    ctx.strokeRect(left, top, width, height);
    ctx.fillStyle = 'rgba(255, 0, 255, 0.9)';
    ctx.fillText(slot.id, left + 4 * scaleX, top + 4 * scaleY);
  }

  ctx.restore();
}

function updateTurnIndicators(){
  const color = turnColors[turnIndex];
  const isBlueTurn = color === 'blue';
  // Top (sparrow) mascot belongs to the blue player, bottom (goat) to green.
  mantisIndicator.classList.toggle('active', isBlueTurn);
  goatIndicator.classList.toggle('active', !isBlueTurn);
}

function drawPlayerHUD(ctx, frame, color, isTurn, now = performance.now()){
  if (!frame) return;

  const { left, top, width, height, scaleX, scaleY } = frame;
  if (!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) {
    return;
  }

  ctx.save();
  ctx.translate(left, top);
  ctx.font = "14px 'Patrick Hand', cursive";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  const playerPlanes = points.filter(p => p.color === color);
  const maxPerRow = 4;
  const aliveCount = Math.max(
    0,
    Math.min(
      maxPerRow,
      playerPlanes.filter(p => p.isAlive && !p.burning).length
    )
  );

  const paddingX = PLANE_COUNTER_PADDING * scaleX;
  const paddingY = PLANE_COUNTER_PADDING * scaleY;
  const availableWidth = Math.max(0, width - paddingX * 2);
  const availableHeight = Math.max(0, height - paddingY * 2);

  const baseIconSize = HUD_BASE_PLANE_ICON_SIZE * MINI_PLANE_ICON_SCALE;
  const rotationFitFactor = 1;

  const slots = Math.max(1, maxPerRow);
  const slotHeight = availableHeight / slots;

  let iconScale = 0;
  if (baseIconSize > 0 && rotationFitFactor > 0) {
    const widthLimit = availableWidth / (baseIconSize * rotationFitFactor);
    const heightLimit = slotHeight / (baseIconSize * rotationFitFactor);
    iconScale = Math.min(widthLimit, heightLimit);
  }

  if (!Number.isFinite(iconScale) || iconScale <= 0) {
    iconScale = 0;
  }

  let statusText = '';
  if (phase === 'AA_PLACEMENT') {
    if (currentPlacer === color) {
      statusText = 'Placing AA';
    } else {
      statusText = 'Enemy placing AA';
    }
  }

  const slotOrderFromCenter = getPlaneCounterSlotOrderFromCenter(color);
  const { slotsToHide } = updatePlaneCounterDeaths(color, aliveCount, now);

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha *= HUD_PLANE_DIM_ALPHA;

  const centerX = paddingX + availableWidth / 2;

  for (let slotIndex = 0; slotIndex < slotOrderFromCenter.length; slotIndex += 1) {
    const centerY = paddingY + slotHeight * (slotIndex + 0.5);
    const deathStart = planeCounterDeathStartTimes[color][slotIndex];
    const isSlotScheduledToHide = slotOrderFromCenter.indexOf(slotIndex) < slotsToHide;

    if (deathStart === null && isSlotScheduledToHide) {
      continue;
    }

    if (iconScale > 0) {
      if (deathStart === null) {
        drawPlaneCounterIcon(ctx, centerX, centerY, color, iconScale);
      } else {
        const progress = clamp((now - deathStart) / HUD_PLANE_DEATH_DURATION_MS, 0, 1);
        if (progress >= 1) {
          continue;
        }
        const eased = easeOutCubic(progress);
        const alpha = 1 - eased;
        const scale = iconScale * (1 - HUD_PLANE_DEATH_SCALE_DELTA * eased);

        ctx.save();
        ctx.globalAlpha *= alpha;
        drawPlaneCounterIcon(ctx, centerX, centerY, color, scale);
        ctx.restore();
      }
    }
  }

  ctx.globalAlpha = previousAlpha;

  if (statusText) {
    if (phase === 'AA_PLACEMENT' && currentPlacer !== color) {
      ctx.fillStyle = '#888';
    } else {
      ctx.fillStyle = colorFor(color);
    }
    const labelY = height + paddingY;
    ctx.fillText(statusText, width / 2, labelY);
  }

  ctx.restore();
}


/* ======= SCORE / ROUND ======= */
yesBtn.addEventListener("click", () => {
  logEndGameAction('click-yes');
  const gameOver = blueScore >= POINTS_TO_WIN || greenScore >= POINTS_TO_WIN;
  if (gameOver) {
    blueScore = 0;
    greenScore = 0;
    resetMatchScoreAnimations();
    roundNumber = 0;
    resetInventoryState();
    resetInventoryInteractionState();
    if(shouldAutoRandomizeMap()){
      if(settings.mapIndex !== RANDOM_MAP_SENTINEL_INDEX){
        setMapIndexAndPersist(getRandomPlayableMapIndex());
      }
    }
    applyCurrentMap();
  }
  startNewRound();
});
noBtn.addEventListener("click", () => {
  logEndGameAction('click-no');
  resetGame({ forceMenu: true });
});

function startNewRound(){
  logBootStep("startNewRound");
  loadSettings();
  console.log('[settings] load at match start', {
    flightRangeCells: settings.flightRangeCells,
    aimingAmplitude: settings.aimingAmplitude,
    addAA: settings.addAA,
    sharpEdges: settings.sharpEdges,
    flagsEnabled: settings.flagsEnabled,
    addCargo: settings.addCargo,
    mapIndex: settings.mapIndex,
    randomizeMapEachRound: settings.randomizeMapEachRound,
    flameStyle: settings.flameStyle
  });
  loadMatchScoreImagesIfNeeded();
  preloadPlaneSprites();
  preloadExplosionSprites();
  restoreGameBackgroundAfterMenu();
  activateGameScreen();
  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }
  const shouldRandomize = !suppressAutoRandomMapForNextRound && shouldAutoRandomizeMap() && roundNumber > 0;
  if(shouldRandomize){
    if(settings.mapIndex !== RANDOM_MAP_SENTINEL_INDEX){
      setMapIndexAndPersist(getRandomPlayableMapIndex());
    }
  }
  applyCurrentMap();
  suppressAutoRandomMapForNextRound = false;
  cleanupGreenCrashFx();
  endGameDiv.style.display = "none";
  isGameOver=false; winnerColor=null; isDrawGame = false; roundEndedByNuke = false;
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;


  lastFirstTurn = 1 - lastFirstTurn;
  turnIndex = lastFirstTurn;
  turnAdvanceCount = 0;
  resetCargoState();

  roundNumber++;
  roundTextTimer = 120;

  globalFrame=0;
  flyingPoints=[];
  resetNukeTimelineState();
  hasShotThisRound=false;
  aaUnits = [];
  mines = [];

  aiMoveScheduled = false;
  gsBoardCanvas.style.display = "block";
  mantisIndicator.style.display = "block";
  goatIndicator.style.display = "block";
  planeCanvas.style.display = "block";
  aimCanvas.style.display = "block";

  if (needsGameScreenSync) {
    resizeCanvasFixedForGameBoard();
    requestAnimationFrame(() => {
      resizeCanvasFixedForGameBoard();
    });
    needsGameScreenSync = false;
    hasActivatedGameScreen = true;
  }

  requestAnimationFrame(() => {
    const rect = overlayContainer?.getBoundingClientRect?.();
    const cssWidth = Math.max(1, WORLD.width);
    const cssHeight = Math.max(1, WORLD.height);
    console.debug("[overlay] syncOverlayCanvasToGameCanvas sizes", {
      rect: rect ? { width: rect.width, height: rect.height } : null,
      world: { width: WORLD.width, height: WORLD.height },
      cssWidth,
      cssHeight
    });
    syncOverlayCanvasToGameCanvas(planeCanvas, cssWidth, cssHeight);
    syncAimCanvasLayout();
  });

  setBackgroundImage('ui_gamescreen/gamescreen_outside/gs_background.png');

  initPoints(); // ориентации на базе
  resetFlagsForNewRound();
  renderScoreboard();
  if (isAAPlacementEnabled()) {
    phase = 'AA_PLACEMENT';
    currentPlacer = 'green';
  } else {
    phase = 'TURN';
    currentPlacer = null;
  }
  startMainLoopIfNotRunning("startNewRound");
}

/* ======= Map helpers ======= */
function shouldAutoRandomizeMap(){
  if(selectedRuleset !== "advanced"){
    return true;
  }
  return !!settings.randomizeMapEachRound;
}

function getRandomPlayableMapIndex(upcomingRoundNumber = roundNumber + 1){
  const playableForRound = getPlayableMapIndicesForRound(upcomingRoundNumber);
  if(playableForRound.length === 0){
    return 0;
  }
  const randomIndex = Math.floor(Math.random() * playableForRound.length);
  return playableForRound[randomIndex] ?? 0;
}

function setMapIndexAndPersist(nextIndex){
  const shouldPersist = !settingsBridge?.isActive;
  settingsBridge.setMapIndex(nextIndex, { persist: shouldPersist });
}

function resetPlanePositionsForCurrentMap(){
  flyingPoints = [];
  hasShotThisRound = false;
  awaitingFlightResolution = false;
  aaUnits = [];
  mines = [];
  resetCargoState();

  points = [];
  initPoints();
  resetFlagsForNewRound();
}

function ensureMapSpriteAssets(sprites = []){
  const spriteEntries = Array.isArray(sprites) ? sprites : [];
  const requested = new Set(
    spriteEntries.map(entry => (typeof entry?.spriteName === "string" ? entry.spriteName : "brick_1_default"))
  );
  if(requested.size === 0){
    requested.add("brick_1_default");
  }

  for(const spriteName of requested){
    const path = MAP_SPRITE_PATHS[spriteName] || MAP_BRICK_SPRITE_PATH;
    if(!MAP_SPRITE_ASSETS[spriteName]){
      const { img } = loadImageAsset(path, GAME_PRELOAD_LABEL);
      MAP_SPRITE_ASSETS[spriteName] = img;
    }
  }

  return MAP_SPRITE_ASSETS.brick_1_default;
}

const MAP_WARN_ONCE_KEYS = new Set();

function warnOnce(message, data, key = message){
  if(MAP_WARN_ONCE_KEYS.has(key)){
    return;
  }
  MAP_WARN_ONCE_KEYS.add(key);
  console.warn(message, data);
}

function getMapSpriteBaseSize(spriteName){
  const asset = MAP_SPRITE_ASSETS[spriteName];
  if(isSpriteReady(asset)){
    return { width: asset.naturalWidth, height: asset.naturalHeight };
  }

  if(spriteName === "brick_4_diagonal"){
    const side = MAP_DIAGONAL_BRICK_SIZE;
    return { width: side, height: side };
  }

  return { width: MAP_BRICK_THICKNESS, height: MAP_BRICK_THICKNESS * 2 };
}

function getSpriteScale(sprite){
  const uniformScale = Number.isFinite(sprite?.scale) ? sprite.scale : 1;
  return {
    scaleX: Number.isFinite(sprite?.scaleX) ? sprite.scaleX : uniformScale,
    scaleY: Number.isFinite(sprite?.scaleY) ? sprite.scaleY : uniformScale
  };
}

function getSpriteColliderCenter(sprite, baseWidth, baseHeight, scaleX, scaleY, rotationDeg){
  const { x = 0, y = 0 } = sprite || {};
  const normalizedRotation = ((rotationDeg % 360) + 360) % 360;
  const swapsDimensions = normalizedRotation % 180 !== 0;
  const drawnWidth = (swapsDimensions ? baseHeight : baseWidth) * Math.abs(scaleX);
  const drawnHeight = (swapsDimensions ? baseWidth : baseHeight) * Math.abs(scaleY);
  return { cx: x + drawnWidth / 2, cy: y + drawnHeight / 2 };
}

function buildSpriteCollider(sprite, spriteIndex){
  if(!sprite) return null;
  const spriteName = typeof sprite?.spriteName === "string" ? sprite.spriteName : null;
  if(!spriteName || !MAP_SPRITE_PATHS[spriteName]){
    return null;
  }

  const { width: baseWidth, height: baseHeight } = getMapSpriteBaseSize(spriteName);
  const { scaleX, scaleY } = getSpriteScale(sprite);
  const rotationDeg = Number.isFinite(sprite?.rotate) ? sprite.rotate : 0;
  const rotationRad = rotationDeg * Math.PI / 180;
  const { cx, cy } = getSpriteColliderCenter(sprite, baseWidth, baseHeight, scaleX, scaleY, rotationDeg);

  if(!Number.isFinite(cx) || !Number.isFinite(cy)){
    return null;
  }

  const baseId = sprite?.id ?? `${spriteName}-${spriteIndex}`;
  const id = typeof baseId === "string" ? baseId : `${spriteName}-${spriteIndex}`;

  if(spriteName === "brick_4_diagonal"){
    const normalizedRotation = ((rotationDeg % 360) + 360) % 360;
    const swapsDimensions = normalizedRotation % 180 !== 0;
    const drawnWidth = (swapsDimensions ? baseHeight : baseWidth) * Math.abs(scaleX);
    const drawnHeight = (swapsDimensions ? baseWidth : baseHeight) * Math.abs(scaleY);
    const mirrorSign = Math.sign(scaleX || 1) * Math.sign(scaleY || 1);
    return {
      id,
      type: "diag",
      source: "sprite",
      spriteName,
      cx,
      cy,
      halfWidth: drawnWidth / 2,
      halfHeight: drawnHeight / 2,
      rotation: rotationRad,
      diagSign: mirrorSign < 0 ? -1 : 1,
      bandHalfWidth: MAP_BRICK_THICKNESS * Math.max(Math.abs(scaleX), Math.abs(scaleY))
    };
  }

  return {
    id,
    type: "rect",
    source: "sprite",
    spriteName,
    cx,
    cy,
    halfWidth: (baseWidth * Math.abs(scaleX)) / 2,
    halfHeight: (baseHeight * Math.abs(scaleY)) / 2,
    rotation: rotationRad
  };
}

function buildMapSpriteColliders(map){
  const sprites = map?.sprites;
  if(!Array.isArray(sprites)){
    const mapName = map?.name || map?.id || "unknown map";
    const error = new Error(`[MAP] Sprite list missing for ${mapName}`);
    console.error(error.message, { map });
    throw error;
  }

  return sprites
    .map((sprite, index) => buildSpriteCollider(sprite, index))
    .filter(Boolean);
}

function normalizeMapForRendering(map){
  const normalizedMap = { ...map };
  const mapName = map?.name || map?.id || "unknown map";
  const spritesSource = map?.sprites;

  if(Array.isArray(map?.bricks) || Array.isArray(map?.items)){
    const error = new Error(`[MAP] Non-sprite data rejected for ${mapName}`);
    console.error(error.message, { map });
    throw error;
  }

  if(!Array.isArray(spritesSource)){
    const error = new Error(`[MAP] Sprite list missing for ${mapName}`);
    console.error(error.message, { map });
    throw error;
  }
  normalizedMap.sprites = spritesSource;
  normalizedMap.renderer = MAP_RENDERERS.SPRITES;

  if(Array.isArray(spritesSource)){
    const validSpriteNames = new Set(Object.keys(MAP_SPRITE_PATHS));
    normalizedMap.sprites = spritesSource.filter(sprite => {
      const spriteName = typeof sprite?.spriteName === "string" ? sprite.spriteName : "unknown";
      if(!validSpriteNames.has(spriteName)){
        warnOnce(
          "[MAP] Unknown spriteName; skipping sprite",
          { mapName, spriteName },
          `${mapName}:${spriteName}`
        );
        return false;
      }
      return true;
    });
  }

  normalizedMap.colliders = buildMapSpriteColliders(normalizedMap);

  return normalizedMap;
}

function applyCurrentMap(upcomingRoundNumber){
  const targetRoundNumber = Number.isInteger(upcomingRoundNumber)
    ? upcomingRoundNumber
    : roundNumber + 1;
  const mapIndex = resolveMapIndexForGameplay(targetRoundNumber);
  const gameplayMap = MAPS[mapIndex] || MAPS[0];
  const mapName = gameplayMap?.name || gameplayMap?.id || "unknown map";
  const spriteSource = gameplayMap?.sprites;

  if(Array.isArray(gameplayMap?.bricks) || Array.isArray(gameplayMap?.items)){
    const error = new Error(`[MAP] Non-sprite data rejected for ${mapName}`);
    console.error(error.message, { gameplayMap });
    throw error;
  }

  if(!Array.isArray(spriteSource)){
    const error = new Error(`[MAP] Sprite list missing for ${mapName}`);
    console.error(error.message, { gameplayMap });
    throw error;
  }

  console.log("[match] map", {
    mapName,
    mapType: "sprite",
    brickItemCount: spriteSource.length
  });
  currentMapName = mapName;
  const normalizedMap = normalizeMapForRendering(gameplayMap);

  if(normalizedMap.renderer !== MAP_RENDERERS.SPRITES || !Array.isArray(normalizedMap.sprites)){
    const error = new Error("[MAP] Non-sprite map rejected");
    console.error(error.message, { gameplayMap, normalizedMap });
    throw error;
  }

  currentMapSprites = normalizedMap.sprites;
  ensureMapSpriteAssets(currentMapSprites);
  clearBrickFrameImage();
  setFlagConfigsForMap(normalizedMap);
  colliders = buildMapSpriteColliders(normalizedMap);
  updateFieldDimensions();
  resetPlanePositionsForCurrentMap();
  renderScoreboard();
}

function syncWrapperToVisualViewport() {
  const wrapperEl = document.getElementById("screenWrapper");
  if (!(wrapperEl instanceof HTMLElement)) {
    return;
  }

  const viewport = typeof window !== "undefined" ? window.visualViewport : null;
  const width = viewport && Number.isFinite(viewport.width) ? viewport.width : (window.innerWidth || 0);
  const height = viewport && Number.isFinite(viewport.height) ? viewport.height : (window.innerHeight || 0);
  const offsetLeft = viewport && Number.isFinite(viewport.offsetLeft) ? viewport.offsetLeft : 0;
  const offsetTop = viewport && Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0;

wrapperEl.style.position = 'fixed';
wrapperEl.style.inset = 'auto';
wrapperEl.style.right = 'auto';
wrapperEl.style.bottom = 'auto';

wrapperEl.style.left = `${offsetLeft}px`;
wrapperEl.style.top = `${offsetTop}px`;
wrapperEl.style.width = `${width}px`;
wrapperEl.style.height = `${height}px`;


  if (DEBUG_WRAPPER_SYNC && !wrapperSyncDebugState.logged) {
    wrapperSyncDebugState.logged = true;
    const rect = wrapperEl.getBoundingClientRect();
    console.debug('[wrapper-sync]', {
      visualViewport: viewport
        ? {
          width: viewport.width,
          height: viewport.height,
          offsetLeft: viewport.offsetLeft,
          offsetTop: viewport.offsetTop
        }
        : null,
      wrapperRect: {
        width: rect.width,
        height: rect.height,
        left: rect.left,
        top: rect.top
      }
    });
  }
}

function updateUiFrameScale() {
  if (!(uiFrameEl instanceof HTMLElement)) {
    return;
  }

  const wrapperEl = document.getElementById("screenWrapper");
  const wrapperStyles = wrapperEl ? window.getComputedStyle(wrapperEl) : null;
  const paddingTop = wrapperStyles ? parseFloat(wrapperStyles.paddingTop) || 0 : 0;
  const paddingRight = wrapperStyles ? parseFloat(wrapperStyles.paddingRight) || 0 : 0;
  const paddingBottom = wrapperStyles ? parseFloat(wrapperStyles.paddingBottom) || 0 : 0;
  const paddingLeft = wrapperStyles ? parseFloat(wrapperStyles.paddingLeft) || 0 : 0;

  const viewport = typeof window !== "undefined" ? window.visualViewport : null;
  const viewportWidth = viewport && Number.isFinite(viewport.width) ? viewport.width : 0;
  const viewportHeight = viewport && Number.isFinite(viewport.height) ? viewport.height : 0;
  const fallbackWidth = window.innerWidth || 0;
  const fallbackHeight = window.innerHeight || 0;
  const baseWidth = viewportWidth || fallbackWidth;
  const baseHeight = viewportHeight || fallbackHeight;
  const viewW = Math.max(1, baseWidth - paddingLeft - paddingRight);
  const viewH = Math.max(1, baseHeight - paddingTop - paddingBottom);
  const scale = Math.min(viewW / FRAME_BASE_WIDTH, viewH / FRAME_BASE_HEIGHT);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  console.debug('[ui-scale]', {
    visualViewport: viewport
      ? { width: viewportWidth, height: viewportHeight }
      : null,
    inner: { width: fallbackWidth, height: fallbackHeight },
    scale: safeScale
  });
  document.documentElement.style.setProperty('--ui-scale', safeScale);
  syncHudCanvasLayout();
  syncAimCanvasLayout();
}

/* ======= CANVAS RESIZE ======= */
function forceLayoutReflow() {
  void (gsFrameEl?.offsetHeight || document.body?.offsetHeight || 0);
}

function nextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function syncAllCanvasBackingStores() {
  logResizeDebug('syncAllCanvasBackingStores');
  trackBootResizeCount('syncAllCanvasBackingStores');
  syncCanvasBackingStore(gsBoardCanvas, CANVAS_BASE_WIDTH, CANVAS_BASE_HEIGHT);
  syncCanvasBackingStore(planeCanvas, CANVAS_BASE_WIDTH, CANVAS_BASE_HEIGHT);
  syncCanvasBackingStore(aimCanvas, FRAME_BASE_WIDTH, FRAME_BASE_HEIGHT);
  syncCanvasBackingStore(hudCanvas, FRAME_BASE_WIDTH, FRAME_BASE_HEIGHT);
}

function resizeCanvasFixedForGameBoard() {
  const { RAW_DPR } = getCanvasDpr();
  syncBackgroundLayout(FRAME_BASE_WIDTH, FRAME_BASE_HEIGHT);

  const cssW = CANVAS_BASE_WIDTH;
  const cssH = CANVAS_BASE_HEIGHT;
  const backingW = Math.max(1, Math.round(cssW * RAW_DPR));
  const backingH = Math.max(1, Math.round(cssH * RAW_DPR));

  if (gsBoardCanvas.width !== backingW) gsBoardCanvas.width = backingW;
  if (gsBoardCanvas.height !== backingH) gsBoardCanvas.height = backingH;
  computeViewFromCanvas(gsBoardCanvas);
  applyViewTransform(gsBoardCtx);
  syncAimCanvasLayout();

  if (planeCanvas) {
    const planeBackingW = Math.max(1, Math.round(cssW * RAW_DPR));
    const planeBackingH = Math.max(1, Math.round(cssH * RAW_DPR));
    if (planeCanvas.width !== planeBackingW) planeCanvas.width = planeBackingW;
    if (planeCanvas.height !== planeBackingH) planeCanvas.height = planeBackingH;
    applyViewTransform(planeCtx);
  }
}

let lastResizeMetrics = {
  cssW: 0,
  cssH: 0,
  scale: 0,
  dpr: 0
};

async function syncLayoutAndField(reason = "sync") {
  if (typeof window !== 'undefined' && window.PINCH_ACTIVE) {
    return;
  }
  logResizeDebug('resizeCanvas');
  trackBootResizeCount('resizeCanvas');
  // Keep the game in portrait mode: if the device rotates to landscape,
  // attempt to re-lock orientation.  Do not skip resizing so the canvases
  // remain correctly sized even if the device starts in landscape.
  if(screen.orientation && screen.orientation.type.startsWith('landscape')){
    lockOrientation();
  }

  syncWrapperToVisualViewport();
  updateUiFrameScale();
  await nextFrame();
  forceLayoutReflow();

  syncFieldCssVars();
  const rootStyle = window.getComputedStyle(document.documentElement);
  const uiScaleRaw = rootStyle.getPropertyValue('--ui-scale');
  const uiScaleValue = uiScaleRaw ? parseFloat(uiScaleRaw) : 1;
  const uiScale = Number.isFinite(uiScaleValue) && uiScaleValue > 0 ? uiScaleValue : 1;
  const cssW = CANVAS_BASE_WIDTH;
  const cssH = CANVAS_BASE_HEIGHT;
  const { RAW_DPR } = getCanvasDpr();

  lastResizeMetrics = {
    cssW,
    cssH,
    scale: uiScale,
    dpr: RAW_DPR
  };

  updateFieldDimensions();
  syncAimCanvasLayout();
  syncHudCanvasLayout();

  syncBackgroundLayout(FRAME_BASE_WIDTH, FRAME_BASE_HEIGHT);
  const canvas = gsBoardCanvas;
  const gsBackingW = Math.max(1, Math.round(CANVAS_BASE_WIDTH * RAW_DPR));
  const gsBackingH = Math.max(1, Math.round(CANVAS_BASE_HEIGHT * RAW_DPR));
  if (canvas.width !== gsBackingW) canvas.width = gsBackingW;
  if (canvas.height !== gsBackingH) canvas.height = gsBackingH;
  computeViewFromCanvas(canvas);

  if (planeCanvas) {
    const planeBackingW = Math.max(1, Math.round(CANVAS_BASE_WIDTH * RAW_DPR));
    const planeBackingH = Math.max(1, Math.round(CANVAS_BASE_HEIGHT * RAW_DPR));
    if (planeCanvas.width !== planeBackingW) planeCanvas.width = planeBackingW;
    if (planeCanvas.height !== planeBackingH) planeCanvas.height = planeBackingH;
  }
  if (aimCanvas) {
    const aimBackingW = Math.max(1, Math.round(FRAME_BASE_WIDTH * RAW_DPR));
    const aimBackingH = Math.max(1, Math.round(FRAME_BASE_HEIGHT * RAW_DPR));
    if (aimCanvas.width !== aimBackingW) aimCanvas.width = aimBackingW;
    if (aimCanvas.height !== aimBackingH) aimCanvas.height = aimBackingH;
  }
  if (hudCanvas) {
    const hudBackingW = Math.max(1, Math.round(FRAME_BASE_WIDTH * RAW_DPR));
    const hudBackingH = Math.max(1, Math.round(FRAME_BASE_HEIGHT * RAW_DPR));
    if (hudCanvas.width !== hudBackingW) hudCanvas.width = hudBackingW;
    if (hudCanvas.height !== hudBackingH) hudCanvas.height = hudBackingH;
  }
  applyViewTransform(gsBoardCtx);
  applyViewTransform(aimCtx);
  applyViewTransform(planeCtx);

  requestAnimationFrame(syncAllCanvasBackingStores);
  schedulePlaneFlameSync();

  // Переинициализируем самолёты
  if(points.length === 0) {
    initPoints();
  }

  logLayoutDebug();

  if (document.body.classList.contains('screen--menu')) {
    document.body.classList.add('menu-ready');
  }

  // TEMP: layout diagnostics
  const rectSummary = (el) => {
    if (!el?.getBoundingClientRect) return null;
    const rect = el.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  };

  if (activeNuclearDrag) {
    updateBoardDimmerMask();
  }

  if (DEBUG_RESIZE) {
    console.log('Layout rects after resize', {
      reason,
      gsFrameEl: rectSummary(gsFrameEl),
      stage: rectSummary(gsFrameEl),
      gameCanvas: rectSummary(gsBoardCanvas),
      aimCanvas: rectSummary(aimCanvas),
      planeCanvas: rectSummary(planeCanvas),
      overlayContainer: rectSummary(overlayContainer),
      greenPlaneCounter: rectSummary(greenPlaneCounter),
      bluePlaneCounter: rectSummary(bluePlaneCounter),
    });
  }
}

function logLayoutMetrics(reason) {
  const overlayEl = overlayContainer || document.getElementById("overlayContainer");
  const gameCanvasEl = gsBoardCanvas || document.getElementById("gameCanvas");
  const uiFrameElLocal = uiFrameEl || document.getElementById("uiFrame");
  const uiScaleRaw = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale');
  const uiScale = parseFloat(uiScaleRaw);

  console.log('[layout metrics]', {
    reason,
    WORLD_width: WORLD.width,
    FRAME_BASE_WIDTH,
    uiScale,
    overlayContainerWidth: overlayEl?.getBoundingClientRect?.().width ?? null,
    gameCanvasWidth: gameCanvasEl?.getBoundingClientRect?.().width ?? null,
    uiFrameWidth: uiFrameElLocal?.getBoundingClientRect?.().width ?? null
  });
}

let pinchActive = false;
let pinchScale = 1;
let pinchResetTimer = null;
const PINCH_RESET_MS = 4000;
const PINCH_MIN = 1;
const PINCH_MAX = 2.2;
if (typeof window !== 'undefined') {
  window.PINCH_ACTIVE = pinchActive;
}

function isPinchActive() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.PINCH_ACTIVE === true;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resetPinchState() {
  if (typeof window !== 'undefined') {
    window.PINCH_ACTIVE = false;
  }
  pinchActive = false;
  if (pinchResetTimer) {
    clearTimeout(pinchResetTimer);
    pinchResetTimer = null;
  }
  pinchScale = 1;
  if (uiFrameInner instanceof HTMLElement) {
    uiFrameInner.style.transform = "scale(1)";
    uiFrameInner.style.transformOrigin = "50% 50%";
  }
}

function schedulePinchReset() {
  if (pinchResetTimer) {
    clearTimeout(pinchResetTimer);
  }
  pinchResetTimer = window.setTimeout(() => {
    resetPinchState();
  }, PINCH_RESET_MS);
}

window.addEventListener('gesturestart', () => {
  pinchActive = true;
  window.PINCH_ACTIVE = true;
}, { capture: true });

window.addEventListener('gestureend', () => resetPinchState(), { capture: true });

window.addEventListener('wheel', (event) => {
  if (pinchActive && event.ctrlKey !== true) {
    resetPinchState();
  }
}, { capture: true });

window.addEventListener('wheel', (event) => {
  if (event.ctrlKey !== true) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!(uiFrameEl instanceof HTMLElement) || !(uiFrameInner instanceof HTMLElement)) return;
  if (!pinchActive) {
    pinchActive = true;
    if (typeof window !== 'undefined') {
      window.PINCH_ACTIVE = true;
    }
    const rect = uiFrameEl.getBoundingClientRect();
    let originX = 50;
    let originY = 50;
    if (rect.width > 0 && rect.height > 0) {
      originX = ((event.clientX - rect.left) / rect.width) * 100;
      originY = ((event.clientY - rect.top) / rect.height) * 100;
      originX = clamp(originX, 0, 100);
      originY = clamp(originY, 0, 100);
    }
    uiFrameInner.style.transformOrigin = `${originX}% ${originY}%`;
  }
  const step = Math.exp(-event.deltaY * 0.01);
  pinchScale = clamp(pinchScale * step, PINCH_MIN, PINCH_MAX);
  uiFrameInner.style.transform = `scale(${pinchScale})`;
}, { passive: false, capture: true });

window.addEventListener('resize', async () => {
  if (window.PINCH_ACTIVE) return;
  await syncLayoutAndField("viewport change");
  logLayoutMetrics("resize");
});
window.addEventListener('load', () => {
  void syncLayoutAndField("load");
});
// Lock orientation to portrait and prevent the canvas from redrawing on rotation
function lockOrientation(){
  if(screen.orientation && screen.orientation.lock){
    // Attempt to lock; ignore errors if the browser refuses
    screen.orientation.lock('portrait').catch(() => {});
  }
}

lockOrientation();
window.addEventListener('orientationchange', () => {
  lockOrientation();
  void syncLayoutAndField("orientation change");
});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', async () => {
    if (window.PINCH_ACTIVE) return;
    await syncLayoutAndField("viewport change");
    if (window.visualViewport.scale !== 1) {
      logLayoutMetrics("visualViewport resize");
    }
  });
  window.visualViewport.addEventListener('scroll', async () => {
    if (window.PINCH_ACTIVE) return;
    await syncLayoutAndField("viewport change");
    if (window.visualViewport.scale !== 1) {
      logLayoutMetrics("visualViewport scroll");
    }
  });
}

  /* ======= BOOTSTRAP ======= */
  function waitForStylesReady() {
    if (document.readyState === 'complete') return Promise.resolve();

    return new Promise((resolve) => {
      window.addEventListener('load', resolve, { once: true });
    });
  }

  async function bootstrapGame(){
    await waitForStylesReady();
    await syncLayoutAndField("bootstrap");
    logLayoutMetrics("bootstrap");
    resetGame();
  }

bootstrapGame();
