/***************************************************************
 * Paper Wings — mobile-friendly build
 * Range shown with a plane and animated exhaust flame.
 * Includes fixes for plane orientation, AI turns, and mini-icon counter.
 ***************************************************************/



/* ======= DOM ======= */
const mantisIndicator = document.getElementById("mantisIndicator");
const goatIndicator   = document.getElementById("goatIndicator");

const loadingOverlay = document.getElementById("loadingOverlay");

const gameContainer = document.getElementById("gameContainer");
const gameCanvas  = document.getElementById("gameCanvas");
const gameCtx     = gameCanvas.getContext("2d");

const aimCanvas   = document.getElementById("aimCanvas");
const aimCtx      = aimCanvas.getContext("2d");

const planeCanvas = document.getElementById("planeCanvas");
const planeCtx    = planeCanvas.getContext("2d");

const overlayContainer = document.getElementById("overlayContainer");
const fxLayerElement = document.getElementById("fxLayer");

const greenScoreCounter = document.getElementById("greenScoreCounter");
const blueScoreCounter  = document.getElementById("blueScoreCounter");
const greenPlaneCounter = document.getElementById("gs_planecounter_green");
const bluePlaneCounter  = document.getElementById("gs_planecounter_blue");

const EXPLOSION_SPRITE_SRC = 'explosion6.gif';

let explosionSprite = null;

const PRELOAD_IMAGE_URLS = [
  // Main menu
  "ui_mainmenu/mm_background.png",
  "ui_mainmenu/mm_hotseat_Default.png",
  "ui_mainmenu/mm_hotseat_Active.png",
  "ui_mainmenu/mm_computer_default.png",
  "ui_mainmenu/mm_computer_active.png",
  "ui_mainmenu/mm_online_default.png",
  "ui_mainmenu/mm_online_active.png",
  "ui_mainmenu/mm_play_default.png",
  "ui_mainmenu/mm_play_active.png",
  "ui_mainmenu/mm_classicrules_default.png",
  "ui_mainmenu/mm_classicrules_active.png",
  "ui_mainmenu/mm_advancedsettings_default.png",
  "ui_mainmenu/mm_advancedsettings_active.png",

  // Control panel
  "ui_controlpanel/cp_background.png",
  "ui_controlpanel/cp_frame_add.png",
  "ui_controlpanel/cp_button_off.png",
  "ui_controlpanel/cp_button_on.png",
  "ui_controlpanel/cp_frame_accuracy.png",
  "ui_controlpanel/cp_button_left.png",
  "ui_controlpanel/cp_button_right.png",
  "ui_controlpanel/cp_frame_range.png",
  "ui_controlpanel/cp_frame_field.png",
  "ui_controlpanel/cp_frame_resetand exit.png",
  "ui_controlpanel/cp_button_reset.png",
  "ui_controlpanel/cp_button_exit.png",

  // Plane sprites
  "planes/blue plane 25-optima.png",
  "planes/green plane 4 optima.png",
  "planes/blue counter 6.png",
  "planes/green counter 6.png",
  "planes/blue plane fall.png",
  "planes/green plane fall.png",

  "ui_gamescreen/maps/easy 1-2 round/map 1 - clear sky 3.png"
];

function hideLoadingOverlay() {
  if (loadingOverlay) {
    loadingOverlay.classList.add("loading-overlay--hidden");
  }
}

function preloadCriticalImages() {
  if (!loadingOverlay) {
    return Promise.resolve();
  }

  const MAX_OVERLAY_TIME_MS = 1000;
  const MIN_OVERLAY_TIME_MS = 200;
  const startTime = performance.now();

  loadingOverlay.classList.remove("loading-overlay--hidden");

  const preloadTasks = PRELOAD_IMAGE_URLS.map(src => new Promise(resolve => {
    if (!src) {
      resolve();
      return;
    }
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = src;
  }));

  preloadTasks.push(new Promise(resolve => {
    const img = new Image();
    explosionSprite = img;
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = EXPLOSION_SPRITE_SRC;
  }));

  const preloadPromise = Promise.allSettled(preloadTasks);
  const maxWaitPromise = new Promise(resolve => setTimeout(resolve, MAX_OVERLAY_TIME_MS));

  return Promise.race([preloadPromise, maxWaitPromise]).finally(() => {
    const elapsed = performance.now() - startTime;
    const delay = Math.max(0, MIN_OVERLAY_TIME_MS - elapsed);
    setTimeout(hideLoadingOverlay, delay);
  });
}

preloadCriticalImages();

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
    default: "ui_mainmenu/mm_hotseat_Default.png",
    active: "ui_mainmenu/mm_hotseat_Active.png"
  },
  computer: {
    default: "ui_mainmenu/mm_computer_default.png",
    active: "ui_mainmenu/mm_computer_active.png"
  },
  online: {
    default: "ui_mainmenu/mm_online_default.png",
    active: "ui_mainmenu/mm_online_active.png"
  },
  play: {
    default: "ui_mainmenu/mm_play_default.png",
    active: "ui_mainmenu/mm_play_active.png"
  },
  classicRules: {
    default: "ui_mainmenu/mm_classicrules_default.png",
    active: "ui_mainmenu/mm_classicrules_active.png"
  },
  advancedSettings: {
    default: "ui_mainmenu/mm_advancedsettings_default.png",
    active: "ui_mainmenu/mm_advancedsettings_active.png"
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
  playBtn.setAttribute("aria-pressed", ready ? "true" : "false");
  applyMenuButtonSkin(playBtn, "play", ready);
}

function syncRulesButtonSkins(selection){
  applyMenuButtonSkin(classicRulesBtn, "classicRules", selection === "classic");
  applyMenuButtonSkin(advancedSettingsBtn, "advancedSettings", selection === "advanced");
}

const IS_TEST_HARNESS = document.body.classList.contains('test-harness');

const SCORE_COUNTER_ELEMENTS = {
  green: greenScoreCounter,
  blue: blueScoreCounter
};

const PLANE_COUNTER_HOSTS = {
  green: greenPlaneCounter,
  blue: bluePlaneCounter
};

const SCORE_COUNTER_BASE_OFFSETS = {
  green: { x: 4,   y: 388 },
  blue:  { x: 414, y: 388 }
};

const SCORE_COUNTER_BASE_SIZE = { width: 43, height: 124 };
const SCORE_COUNTER_ANCHOR_ROWS = [0.1, 0.32, 0.54, 0.76, 0.9];
const SCORE_COUNTER_INK_ANCHORS = {
  green: SCORE_COUNTER_ANCHOR_ROWS.map(y => ({ x: 0.5, y })),
  blue: SCORE_COUNTER_ANCHOR_ROWS.map(y => ({ x: 0.5, y }))
};

function clampScoreInkOffset(value, limit) {
  if (!Number.isFinite(value)) {
    return value;
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    return Math.max(0, value);
  }

  if (value < 0) {
    return 0;
  }

  if (value > limit) {
    return limit;
  }

  return value;
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

  const scale = Number.isFinite(viewport?.scale) && viewport.scale > 0 ? viewport.scale : 1;
  const offsetLeft = Number.isFinite(viewport?.offsetLeft) ? viewport.offsetLeft : 0;
  const offsetTop = Number.isFinite(viewport?.offsetTop) ? viewport.offsetTop : 0;
  const width = Number.isFinite(viewport?.width) && viewport.width > 0 ? viewport.width : Math.max(1, fallbackWidth);
  const height = Number.isFinite(viewport?.height) && viewport.height > 0 ? viewport.height : Math.max(1, fallbackHeight);

  return {
    raw: viewport || null,
    scale,
    offsetLeft,
    offsetTop,
    width,
    height
  };
}

function getViewportAdjustedBoundingClientRect(element) {
  const rect = element?.getBoundingClientRect?.();
  const { scale, offsetLeft, offsetTop } = getVisualViewportState();
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  if (!rect) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const left = Number.isFinite(rect.left) ? rect.left : 0;
  const top = Number.isFinite(rect.top) ? rect.top : 0;
  const width = Number.isFinite(rect.width) ? rect.width : 0;
  const height = Number.isFinite(rect.height) ? rect.height : 0;

  return {
    left: (left - offsetLeft) * safeScale,
    top: (top - offsetTop) * safeScale,
    width: width * safeScale,
    height: height * safeScale
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

if (typeof window !== "undefined") {
  window.getVisualViewportState = getVisualViewportState;
  window.getViewportAdjustedBoundingClientRect = getViewportAdjustedBoundingClientRect;
}

function clientPointFromEvent(e) {
  const v = VV();
  const touch = e?.touches?.[0] || e?.changedTouches?.[0] || null;
  const source = touch || e;
  const clientX = Number.isFinite(source?.clientX) ? source.clientX : 0;
  const clientY = Number.isFinite(source?.clientY) ? source.clientY : 0;
  const scale = v.scale || 1;

  return {
    x: (clientX - v.left) * scale,
    y: (clientY - v.top) * scale,
    rawX: clientX,
    rawY: clientY,
    v
  };
}

function clientToWorld(point, rect = visualRect(gameCanvas)) {
  const scaleX = rect.width !== 0 ? gameCanvas.width / rect.width : 1;
  const scaleY = rect.height !== 0 ? gameCanvas.height / rect.height : 1;
  return {
    x: (point.x - rect.left) * scaleX,
    y: (point.y - rect.top) * scaleY,
    rect,
    v: rect.v
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
  const { scale, offsetLeft, offsetTop } = getVisualViewportState();

  return {
    clientX: (rawX - offsetLeft) * scale,
    clientY: (rawY - offsetTop) * scale
  };
}

function clientToOverlay(event, overlay = aimCanvas) {
  const target = overlay || aimCanvas;
  const { clientX, clientY } = resolveClientPoint(event);
  const rect = target ? getViewportAdjustedBoundingClientRect(target) : { left: 0, top: 0, width: 0, height: 0 };
  const rectWidth = Number.isFinite(rect.width) && rect.width !== 0 ? rect.width : 1;
  const rectHeight = Number.isFinite(rect.height) && rect.height !== 0 ? rect.height : 1;
  const nx = (clientX - rect.left) / rectWidth;
  const ny = (clientY - rect.top) / rectHeight;
  const logicalWidth = target?.width ?? rectWidth;
  const logicalHeight = target?.height ?? rectHeight;

  return {
    clientX,
    clientY,
    rect,
    nx,
    ny,
    x: nx * logicalWidth,
    y: ny * logicalHeight
  };
}

function clientToBoard(event) {
  const { clientX, clientY } = resolveClientPoint(event);
  const rect = getViewportAdjustedBoundingClientRect(gameCanvas);
  const rectWidth = Number.isFinite(rect.width) && rect.width !== 0 ? rect.width : 1;
  const rectHeight = Number.isFinite(rect.height) && rect.height !== 0 ? rect.height : 1;
  const nx = (clientX - rect.left) / rectWidth;
  const ny = (clientY - rect.top) / rectHeight;

  return {
    clientX,
    clientY,
    rect,
    nx,
    ny,
    x: nx * gameCanvas.width,
    y: ny * gameCanvas.height
  };
}

function worldToOverlay(x, y, options = {}) {
  const { overlay = null, boardRect: providedBoardRect = null, overlayRect: providedOverlayRect = null } = options || {};
  const boardRect = providedBoardRect || getViewportAdjustedBoundingClientRect(gameCanvas);
  const boardWidth = Number.isFinite(boardRect.width) && boardRect.width !== 0 ? boardRect.width : 1;
  const boardHeight = Number.isFinite(boardRect.height) && boardRect.height !== 0 ? boardRect.height : 1;
  const boardLeft = Number.isFinite(boardRect.left) ? boardRect.left : 0;
  const boardTop = Number.isFinite(boardRect.top) ? boardRect.top : 0;
  const canvasWidth = Number.isFinite(gameCanvas.width) && gameCanvas.width !== 0 ? gameCanvas.width : 1;
  const canvasHeight = Number.isFinite(gameCanvas.height) && gameCanvas.height !== 0 ? gameCanvas.height : 1;
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const nx = safeX / canvasWidth;
  const ny = safeY / canvasHeight;
  const clientX = boardLeft + nx * boardWidth;
  const clientY = boardTop + ny * boardHeight;

  let overlayRect = null;
  let overlayX = clientX;
  let overlayY = clientY;

  if (overlay || providedOverlayRect) {
    overlayRect = providedOverlayRect || (overlay ? getViewportAdjustedBoundingClientRect(overlay) : null);
    if (overlayRect) {
      const overlayWidthPxRaw = Number.isFinite(overlayRect.width) && overlayRect.width !== 0 ? overlayRect.width : null;
      const overlayHeightPxRaw = Number.isFinite(overlayRect.height) && overlayRect.height !== 0 ? overlayRect.height : null;
      const overlayWidthPx = overlayWidthPxRaw ?? (overlay?.width ?? 1);
      const overlayHeightPx = overlayHeightPxRaw ?? (overlay?.height ?? 1);
      const overlayWidth = overlay?.width ?? overlayWidthPx;
      const overlayHeight = overlay?.height ?? overlayHeightPx;
      const overlayLeft = Number.isFinite(overlayRect.left) ? overlayRect.left : 0;
      const overlayTop = Number.isFinite(overlayRect.top) ? overlayRect.top : 0;
      const onx = (clientX - overlayLeft) / overlayWidthPx;
      const ony = (clientY - overlayTop) / overlayHeightPx;
      overlayX = onx * overlayWidth;
      overlayY = ony * overlayHeight;
    }
  }

  return { clientX, clientY, overlayX, overlayY, nx, ny, boardRect, overlayRect };
}

function sizeAndAlignOverlays() {
  if (!(overlayContainer instanceof HTMLElement)) {
    return;
  }

  const viewport = getVisualViewportState();
  const safeScale = Number.isFinite(viewport.scale) && viewport.scale > 0 ? viewport.scale : 1;
  const offsetLeft = Number.isFinite(viewport.offsetLeft) ? viewport.offsetLeft : 0;
  const offsetTop = Number.isFinite(viewport.offsetTop) ? viewport.offsetTop : 0;

  const baseWidth = Number.isFinite(viewport.width) && viewport.width > 0
    ? viewport.width * safeScale
    : (typeof window !== "undefined" && Number.isFinite(window.innerWidth) ? window.innerWidth : 0);
  const baseHeight = Number.isFinite(viewport.height) && viewport.height > 0
    ? viewport.height * safeScale
    : (typeof window !== "undefined" && Number.isFinite(window.innerHeight) ? window.innerHeight : 0);

  const width = Math.max(1, Math.round(baseWidth));
  const height = Math.max(1, Math.round(baseHeight));

  overlayContainer.style.left = `${offsetLeft}px`;
  overlayContainer.style.top = `${offsetTop}px`;
  overlayContainer.style.width = `${width}px`;
  overlayContainer.style.height = `${height}px`;
  overlayContainer.style.transform = "none";

  if (fxLayerElement instanceof HTMLElement) {
    fxLayerElement.style.width = `${width}px`;
    fxLayerElement.style.height = `${height}px`;
  }
}

// ---- ЕДИНЫЕ размеры макета ----
const MOCKUP_W = 460;
const MOCKUP_H = 800;

// Координаты STAR_PLACEMENT даны в пикселях макета 460x800
const STAR_PLACEMENT_IS_MOCKUP = true;

// Если фон/рамка рисуются со сдвигом, используем тот же сдвиг здесь
const BOARD_ORIGIN = { x: 0, y: 0 };

// ---- Explosion FX (GIF over canvas) ----

const EXPLOSION_DURATION_MS = 700;   // delay before showing wreck FX
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

let flameCycleIndex = 0;
let flameStyleRevision = 0;

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
      if (plane.burning && !plane.flameFxDisabled && isExplosionFinished(plane)) {
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

function applyFlameElementStyles(element, size = BASE_FLAME_DISPLAY_SIZE, planeColor = '') {
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
  element.style.zIndex = '9999';
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

function createSparkElement(containerFilter = '', displaySize = BASE_FLAME_DISPLAY_SIZE) {
  const spark = document.createElement('div');
  spark.className = 'fx-flame-spark';

  const baseSparkSize = 2 + Math.random() * 2;
  const sparkScale = displaySize.width / 46;
  const sparkSize = baseSparkSize * sparkScale;
  spark.style.setProperty('--spark-size', `${sparkSize}px`);

  const horizontalOffset = Math.random() * (displaySize.width * 0.4);
  spark.style.setProperty('--spark-start-offset', `${horizontalOffset}px`);

  const translateX = -10 - Math.random() * 10;
  const translateY = (Math.random() * 14) - 7;
  spark.style.setProperty('--spark-translate-x', `${translateX}px`);
  spark.style.setProperty('--spark-translate-y', `${translateY}px`);

  const duration = 400 + Math.random() * 350;
  spark.style.setProperty('--spark-duration', `${duration}ms`);

  spark.style.top = `${Math.random() * 100}%`;
  if (containerFilter) {
    spark.style.filter = containerFilter;
  }

  spark.addEventListener('animationend', () => spark.remove());
  return spark;
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
  applyFlameElementStyles(container, displaySize, plane?.color || '');

  const sparkHost = document.createElement('div');
  sparkHost.className = 'fx-flame-sparks';
  container.appendChild(sparkHost);

  const img = new Image();
  img.decoding = 'async';
  img.width = displaySize.width;
  img.height = displaySize.height;
  img.className = 'fx-flame-img';
  container.appendChild(img);

  let attemptedSrc = resolvedSrc;
  let sparkTimerId = null;

  const stop = () => {
    img.onerror = null;
    img.onload = null;
    if (sparkTimerId) {
      clearTimeout(sparkTimerId);
      sparkTimerId = null;
    }
    if (container?.isConnected) {
      container.remove();
    }
    sparkHost.innerHTML = '';
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
  };

  img.onload = () => {
    img.dataset.flameSrc = attemptedSrc || '';
  };

  img.dataset.flameSrc = resolvedSrc;
  img.src = resolvedSrc;

  const scheduleSpark = () => {
    if (!container.isConnected) return;
    const spark = createSparkElement(container.dataset.flameFilter, displaySize);
    sparkHost.appendChild(spark);
    const delay = 70 + Math.random() * 110;
    sparkTimerId = setTimeout(scheduleSpark, delay);
  };

  scheduleSpark();

  return { element: container, stop };
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
    if (plane.burning && !plane?.flameFxDisabled && isExplosionFinished(plane) && !planeFlameFx.has(plane)) {
      spawnBurningFlameFx(plane);
    }
  }, EXPLOSION_DURATION_MS);
  planeFlameTimers.set(plane, timer);
}

function spawnBurningFlameFx(plane) {
  if (plane?.flameFxDisabled) {
    return;
  }
  const host = fxLayerElement || document.body;
  if (!host) return;

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

  host.appendChild(entry.element);
  applyFlameVisualStyle(entry.element, plane?.burningFlameStyleKey || getCurrentFlameStyleKey());
  planeFlameFx.set(plane, entry);
  updatePlaneFlameFxPosition(plane);
}

function updatePlaneFlameFxPosition(plane, metrics) {
  const entry = planeFlameFx.get(plane);
  const element = entry?.element || entry;
  if (!element) return;

  let data = metrics;
  if (!data) {
    const boardRect = getViewportAdjustedBoundingClientRect(gameCanvas);
    const fxLayer = document.getElementById('fxLayer');
    const host = fxLayer || document.body;
    const hostRect = getViewportAdjustedBoundingClientRect(host);
    data = { boardRect, hostRect };
  }

  const { boardRect, hostRect } = data;

  if (!boardRect || !hostRect) {
    return;
  }

  const x = plane?.x;
  const y = plane?.y;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const { clientX, clientY } = worldToOverlay(x, y, { boardRect });
  const left = clientX - hostRect.left;
  const top = clientY - hostRect.top;

  element.style.left = Math.round(left) + 'px';
  element.style.top = Math.round(top) + 'px';
}

function updateAllPlaneFlameFxPositions() {
  if (planeFlameFx.size === 0) return;

  const boardRect = getViewportAdjustedBoundingClientRect(gameCanvas);
  const fxLayer = document.getElementById('fxLayer');
  const host = fxLayer || document.body;
  const hostRect = getViewportAdjustedBoundingClientRect(host);

  const metrics = { boardRect, hostRect };

  for (const plane of planeFlameFx.keys()) {
    updatePlaneFlameFxPosition(plane, metrics);
  }
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

  if (isExplosionFinished(plane) && !planeFlameFx.has(plane)) {
    const timer = planeFlameTimers.get(plane);
    if (timer) {
      clearTimeout(timer);
      planeFlameTimers.delete(plane);
    }
    spawnBurningFlameFx(plane);
  }

}

function spawnExplosion(x, y, color = null) {
  // создаём IMG и позиционируем относительно страницы
  const img = new Image();
  img.src = explosionSprite?.src || EXPLOSION_SPRITE_SRC;            // ← без пробелов в имени файла
  img.className = 'fx-explosion';
  img.style.position = 'absolute';
  img.style.pointerEvents = 'none';
  img.style.transform = 'translate(-50%, -50%)';
  img.style.visibility = 'hidden';

  // абсолютные координаты взрыва на странице:
  const boardRect = getViewportAdjustedBoundingClientRect(gameCanvas);
  const { clientX, clientY } = worldToOverlay(x, y, { boardRect });
  const host = fxLayerElement || document.body;
  const hostRect = getViewportAdjustedBoundingClientRect(host);
  const absLeft = Math.round(clientX - hostRect.left);
  const absTop  = Math.round(clientY - hostRect.top);

  img.style.left = absLeft + 'px';
  img.style.top  = absTop  + 'px';

  const appendExplosion = () => {
    const hasValidSize = img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
    const spriteReady = explosionSprite ? explosionSprite.complete && explosionSprite.naturalWidth > 0 && explosionSprite.naturalHeight > 0 : false;
    if (!hasValidSize && !spriteReady) {
      console.warn('[FX] Explosion sprite is not ready, skipping append', {
        imgComplete: img.complete,
        imgNaturalWidth: img.naturalWidth,
        imgNaturalHeight: img.naturalHeight,
        spriteComplete: explosionSprite?.complete,
        spriteNaturalWidth: explosionSprite?.naturalWidth,
        spriteNaturalHeight: explosionSprite?.naturalHeight
      });
      return;
    }

    host.appendChild(img);
    img.style.visibility = '';
    setTimeout(() => {
      img.remove();
    }, EXPLOSION_DURATION_MS);
  };

  const waitForImageReady = () => {
    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve();
    }

    if (typeof img.decode === 'function') {
      return img.decode().catch(() => {
        if (img.complete && img.naturalWidth > 0) {
          return;
        }

        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      });
    }

    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  };

  if (explosionSprite && !explosionSprite.complete) {
    const onExplosionReady = () => {
      explosionSprite.removeEventListener('load', onExplosionReady);
      explosionSprite.removeEventListener('error', onExplosionReady);
      waitForImageReady().then(appendExplosion);
    };

    explosionSprite.addEventListener('load', onExplosionReady);
    explosionSprite.addEventListener('error', onExplosionReady);
    return;
  }

  waitForImageReady().then(appendExplosion);

}


function resetCanvasState(ctx, canvas){
  if (!ctx || !canvas) return;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Enable smoothing so rotated images (planes, arrows) don't appear jagged
[gameCtx, aimCtx, planeCtx].forEach(ctx => {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
});

const modeMenuDiv = document.getElementById("modeMenu");
const hotSeatBtn  = document.getElementById("hotSeatBtn");
const computerBtn = document.getElementById("computerBtn");
const onlineBtn   = document.getElementById("onlineBtn");

const playBtn     = document.getElementById("playBtn");

const classicRulesBtn     = document.getElementById("classicRulesBtn");
const advancedSettingsBtn = document.getElementById("advancedSettingsBtn");

let selectedMode = null;
let selectedRuleset = "classic";

let menuBackgroundSnapshot = null;

function hideGameBackgroundForMenu() {
  if (!menuBackgroundSnapshot) {
    menuBackgroundSnapshot = {
      body: document.body.style.backgroundImage,
      container: gameContainer.style.backgroundImage
    };
  }

  document.body.style.backgroundImage = 'none';
  gameContainer.style.backgroundImage = 'none';
}

function restoreGameBackgroundAfterMenu() {
  if (!menuBackgroundSnapshot) return;

  document.body.style.backgroundImage = menuBackgroundSnapshot.body;
  gameContainer.style.backgroundImage = menuBackgroundSnapshot.container;

  menuBackgroundSnapshot = null;
}

if(typeof window !== 'undefined'){
  window.paperWingsHarness = window.paperWingsHarness || {};
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

// Images for planes
const PLANE_ASSET_PATHS = {
  blue: "planes/blue plane 25-optima.png",
  green: "planes/green plane 4 optima.png",
  blueCounter: "planes/blue counter 6.png",
  greenCounter: "planes/green counter 6.png",
  blueWreck: "planes/blue plane fall.png",
  greenWreck: "planes/green plane fall.png"
};

let bluePlaneImg = null;
let greenPlaneImg = null;
let blueCounterPlaneImg = null;
let greenCounterPlaneImg = null;
let bluePlaneWreckImg = null;
let greenPlaneWreckImg = null;

let planeSpritesPreloaded = false;
function preloadPlaneSprites() {
  if (planeSpritesPreloaded) {
    return;
  }
  bluePlaneImg = new Image();
  bluePlaneImg.src = PLANE_ASSET_PATHS.blue;

  greenPlaneImg = new Image();
  greenPlaneImg.src = PLANE_ASSET_PATHS.green;

  blueCounterPlaneImg = new Image();
  blueCounterPlaneImg.src = PLANE_ASSET_PATHS.blueCounter;

  greenCounterPlaneImg = new Image();
  greenCounterPlaneImg.src = PLANE_ASSET_PATHS.greenCounter;

  bluePlaneWreckImg = new Image();
  bluePlaneWreckImg.decoding = 'async';
  bluePlaneWreckImg.src = PLANE_ASSET_PATHS.blueWreck;
  if (typeof bluePlaneWreckImg.decode === 'function') {
    bluePlaneWreckImg.decode().catch(() => {});
  }

  greenPlaneWreckImg = new Image();
  greenPlaneWreckImg.decoding = 'async';
  greenPlaneWreckImg.src = PLANE_ASSET_PATHS.greenWreck;
  if (typeof greenPlaneWreckImg.decode === 'function') {
    greenPlaneWreckImg.decode().catch(() => {});
  }

  planeSpritesPreloaded = true;
}
const flameImages = new Map();
for (const src of BURNING_FLAME_SRCS) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  flameImages.set(src, img);
}
const defaultFlameImg = flameImages.get(DEFAULT_BURNING_FLAME_SRC) || null;

function isSpriteReady(img) {
  return Boolean(
    img &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.naturalHeight > 0
  );
}
const backgroundImg = new Image();
backgroundImg.src = "background paper 1.png";

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
  gameContainer.style.backgroundSize = repeatedSize;
  document.body.style.backgroundSize = repeatedSize;

  const resolvedLeft = typeof containerLeft === 'number'
    ? `${containerLeft}px`
    : (typeof containerLeft === 'string' ? containerLeft : gameContainer.style.left);
  const resolvedTop = typeof containerTop === 'number'
    ? `${containerTop}px`
    : (typeof containerTop === 'string' ? containerTop : gameContainer.style.top);

  const containerPosition = duplicateBackgroundValue('center top');
  gameContainer.style.backgroundPosition = containerPosition;

  const hasOffsets = resolvedLeft && resolvedTop;
  const bodyPositionValue = hasOffsets ? `${resolvedLeft} ${resolvedTop}` : 'center top';
  const repeatedBodyPosition = duplicateBackgroundValue(bodyPositionValue);
  document.body.style.backgroundPosition = repeatedBodyPosition;
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
    gameContainer.style.backgroundImage = 'none';
    document.body.style.backgroundImage = 'none';
    return;
  }

  currentBackgroundLayerCount = normalizedLayers.length;
  const backgroundValue = normalizedLayers.join(', ');
  gameContainer.style.backgroundImage = backgroundValue;
  document.body.style.backgroundImage = backgroundValue;

  const rect = gameContainer.getBoundingClientRect();
  syncBackgroundLayout(rect.width, rect.height);
}
const CANVAS_BASE_WIDTH = 360;
const CANVAS_BASE_HEIGHT = 640;
const FRAME_PADDING_X = 50;
const FRAME_PADDING_Y = 80;
const FRAME_BASE_WIDTH = CANVAS_BASE_WIDTH + FRAME_PADDING_X * 2; // 460
const FRAME_BASE_HEIGHT = CANVAS_BASE_HEIGHT + FRAME_PADDING_Y * 2; // 800
const FIELD_BORDER_THICKNESS = 10; // px, width of brick frame edges

if (typeof window.STAR_READY === 'undefined') window.STAR_READY = false;

const brickFrameImg = new Image();
let brickFrameData = null;

let FIELD_LEFT = 0;
let FIELD_WIDTH = 0;

// Sprite used for the aiming arrow
const arrowSprite = new Image();
// Use the PNG sprite that contains the arrow graphics
arrowSprite.src = "sprite_ copy.png";



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
brickFrameImg.onload = () => {
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = brickFrameImg.naturalWidth;
  tempCanvas.height = brickFrameImg.naturalHeight;
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
};



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
const PLANE_SCALE          = 0.9;    // 10% smaller planes
const MINI_PLANE_ICON_SCALE = 0.7;    // make HUD plane icons smaller on the counter
const HUD_PLANE_DIM_ALPHA = 1;        // keep HUD planes at full opacity
const HUD_PLANE_DIM_FILTER = "";     // no additional dimming filter for HUD planes
const HUD_KILL_MARKER_COLOR = "#e42727";
const HUD_KILL_MARKER_ALPHA = 0.85;
const CELL_SIZE            = 20;     // px
const POINT_RADIUS         = 15 * PLANE_SCALE;     // px (увеличено для мобильных)
// Larger hit area for selecting planes with touch/mouse
const PLANE_TOUCH_RADIUS   = 20;                   // px
const AA_HIT_RADIUS        = POINT_RADIUS + 5; // slightly larger zone to hit Anti-Aircraft center
const BOUNCE_FRAMES        = 68;
// Duration of a full-speed flight on the field (measured in frames)
// (Restored to the original pre-change speed used for gameplay physics)
// Shortened by 1.5x to speed up on-field flight animation
const FIELD_FLIGHT_DURATION_SEC = (BOUNCE_FRAMES / 60) * 2 / 1.5;
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

// Explosion effect duration before showing cross (see EXPLOSION_DURATION_MS)

function updateFieldBorderOffset(){
  if(settings.sharpEdges){
    FIELD_BORDER_OFFSET_X = 0;
    FIELD_BORDER_OFFSET_Y = 0;
  } else if(brickFrameImg.naturalWidth){

    const scaleX = FIELD_WIDTH / brickFrameImg.naturalWidth;
    const scaleY = gameCanvas.height / brickFrameImg.naturalHeight;
    FIELD_BORDER_OFFSET_X = brickFrameBorderPxX * scaleX;
    FIELD_BORDER_OFFSET_Y = brickFrameBorderPxY * scaleY;
  } else {
    FIELD_BORDER_OFFSET_X = FIELD_BORDER_THICKNESS;
    FIELD_BORDER_OFFSET_Y = FIELD_BORDER_THICKNESS;
  }
}

function isBrickPixel(x, y){
  if(!brickFrameData) return false;
  const imgX = Math.floor((x - FIELD_LEFT) / FIELD_WIDTH * brickFrameData.width);
  const imgY = Math.floor(y / gameCanvas.height * brickFrameData.height);
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

function updateFieldDimensions(){
  if(brickFrameImg.naturalWidth && brickFrameImg.naturalHeight){
    const aspect = brickFrameImg.naturalWidth / brickFrameImg.naturalHeight;
    FIELD_WIDTH = gameCanvas.height * aspect;
    FIELD_LEFT = (gameCanvas.width - FIELD_WIDTH) / 2;
  } else {
    FIELD_LEFT = 0;
    FIELD_WIDTH = gameCanvas.width;
  }
  updateFieldBorderOffset();
}


const MIN_FLIGHT_RANGE_CELLS = 5;
const MAX_FLIGHT_RANGE_CELLS = 30;

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



  let rangeCells; // cells for menu and physics
let buildingsCount   = 0;
let aimingAmplitude;     // 0..20 (UI показывает *5)

let isGameOver   = false;
let winnerColor  = null;
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
let buildings    = [];

let aaUnits     = [];
let aaPlacementPreview = null;
let aaPreviewTrail = [];

let aaPointerDown = false;

let phase = "MENU"; // MENU | AA_PLACEMENT (Anti-Aircraft placement) | ROUND_START | TURN | ROUND_END


let currentPlacer = null; // 'green' | 'blue'
const MAPS = [
  {
    name: 'Clear Sky',
    file: 'ui_gamescreen/maps/easy 1-2 round/map 1 - clear sky 3.png',
    tier: 'easy',
    buildings: []
  },
  {
    name: '5 Bricks',
    file: 'ui_gamescreen/maps/middle 3-4 round/map 2 - 5 bricks.png',
    tier: 'middle',
    buildings: [
      { x: 110, y: 180, width: 100, height: 40 },
      { x: 250, y: 180, width: 100, height: 40 },
      { x: 180, y: 320, width: 100, height: 40 },
      { x: 110, y: 460, width: 100, height: 40 },
      { x: 250, y: 460, width: 100, height: 40 }
    ]
  },
  {
    name: 'Diagonals',
    file: 'ui_gamescreen/maps/hard 5 round and more/map 3 diagonals.png',
    tier: 'hard',
    buildings: [
      { x: 100, y: 130, width: 80, height: 20 },
      { x: 260, y: 130, width: 80, height: 20 },
      { x: 180, y: 190, width: 80, height: 20 },
      { x: 120, y: 250, width: 80, height: 20 },
      { x: 240, y: 250, width: 80, height: 20 },
      { x: 180, y: 320, width: 40, height: 40 },
      { x: 120, y: 390, width: 80, height: 20 },
      { x: 240, y: 390, width: 80, height: 20 },
      { x: 180, y: 450, width: 80, height: 20 },
      { x: 100, y: 510, width: 80, height: 20 },
      { x: 260, y: 510, width: 80, height: 20 }
    ]
  },
  {
    name: 'Random map',
    file: 'ui_controlpanel/cp_de_maprandom.png',
    buildings: [],
    tier: 'random'
  }
];

const CONTROL_PANEL_PREVIEW_CACHE = new Map();

function mergeRunsIntoRects(runs, tolerance = 1){
  const merged = [];
  for(const run of runs){
    const last = merged[merged.length - 1];
    const isAdjacentRow = last && run.y === last.endY + 1;
    const isSimilarSpan = last
      && Math.abs(run.minX - last.left) <= tolerance
      && Math.abs(run.maxX - last.right) <= tolerance;

    if(isAdjacentRow && isSimilarSpan){
      last.endY = run.y;
      last.left = Math.min(last.left, run.minX);
      last.right = Math.max(last.right, run.maxX);
    } else {
      merged.push({ startY: run.y, endY: run.y, left: run.minX, right: run.maxX });
    }
  }

  return merged.map(rect => ({
    x: (rect.left + rect.right) / 2,
    y: (rect.startY + rect.endY) / 2,
    width: rect.right - rect.left + 1,
    height: rect.endY - rect.startY + 1
  }));
}

function extractOpaqueRunsFromImageData(imageData){
  const runs = [];
  const { data, width, height } = imageData;

  const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];

  for(let y = 0; y < height; y++){
    let minX = width;
    let maxX = -1;

    for(let x = 0; x < width; x++){
      if(alphaAt(x, y) > 0){
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }

    if(maxX >= minX){
      runs.push({ y, minX, maxX });
    }
  }

  return runs;
}

function generatePreviewBuildingsFromPng(src){
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.naturalWidth;
      tempCanvas.height = img.naturalHeight;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const runs = extractOpaqueRunsFromImageData(imageData);
      resolve(mergeRunsIntoRects(runs));
    };
    img.onerror = () => resolve([]);
    img.src = src;
  });
}

function primeControlPanelPreviewBuildings(map){
  if(!map?.file?.startsWith('ui_controlpanel/') || !map.file.endsWith('.png')){
    return;
  }

  const cached = CONTROL_PANEL_PREVIEW_CACHE.get(map.file);
  if(cached){
    return;
  }

  const pending = generatePreviewBuildingsFromPng(map.file)
    .then(buildings => {
      CONTROL_PANEL_PREVIEW_CACHE.set(map.file, buildings);
      if(Array.isArray(buildings) && buildings.length){
        map.previewBuildings = buildings;
      }
      return buildings;
    })
    .catch(() => {
      CONTROL_PANEL_PREVIEW_CACHE.set(map.file, []);
      return [];
    });

  CONTROL_PANEL_PREVIEW_CACHE.set(map.file, pending);
}

const RANDOM_CONTROL_PANEL_MAP = MAPS.find(m => m.file === 'ui_controlpanel/cp_de_maprandom.png');
primeControlPanelPreviewBuildings(RANDOM_CONTROL_PANEL_MAP);
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

function normalizeFlameStyleKey(key) {
  return FLAME_STYLE_MAP.has(key) ? key : 'random';
}

let settings = {
  addAA: false,
  sharpEdges: false,
  mapIndex: 0,
  flameStyle: 'random',
  randomizeMapEachRound: false
};

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

function loadSettings(){
  const previousFlameStyle = settings.flameStyle;
    const fr = parseInt(getStoredSetting('settings.flightRangeCells'), 10);
    rangeCells = Number.isNaN(fr) ? 15 : fr;
  const amp = parseFloat(getStoredSetting('settings.aimingAmplitude'));
  aimingAmplitude = Number.isNaN(amp) ? 10 / 5 : amp;
  settings.addAA = getStoredSetting('settings.addAA') === 'true';
  settings.sharpEdges = getStoredSetting('settings.sharpEdges') === 'true';
  const mapIdx = parseInt(getStoredSetting('settings.mapIndex'), 10);
  settings.mapIndex = clampMapIndex(mapIdx);
  const storedFlameStyle = normalizeFlameStyleKey(getStoredSetting('settings.flameStyle'));
  settings.flameStyle = storedFlameStyle;
  settings.randomizeMapEachRound = getStoredSetting('settings.randomizeMapEachRound') === 'true';

  // Clamp loaded values so corrupted or out-of-range settings
  // don't break the game on startup
    rangeCells = Math.min(MAX_FLIGHT_RANGE_CELLS,
                               Math.max(MIN_FLIGHT_RANGE_CELLS, rangeCells));
  aimingAmplitude  = Math.min(MAX_AMPLITUDE,
                             Math.max(MIN_AMPLITUDE, aimingAmplitude));

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
  'settings.mapIndex',
  'settings.randomizeMapEachRound',
  'settings.flameStyle'
].some(key => getStoredSetting(key) !== null);

if(hasCustomSettings && classicRulesBtn && advancedSettingsBtn){
  selectedRuleset = "advanced";
}

syncRulesButtonSkins(selectedRuleset);
syncModeButtonSkins(selectedMode);
syncPlayButtonSkin(false);


const POINTS_TO_WIN = 25;
let greenScore = 0;
let blueScore  = 0;
let roundNumber = 0;
let roundTextTimer = 0;
let roundTransitionTimeout = null;

let blueFlagCarrier = null;
let greenFlagCarrier = null;
let blueFlagStolenBy = null;
let greenFlagStolenBy = null;

const DEFAULT_STAR_FRAGMENT_SOURCES = {
  green: [
    "shards 3/green shard 1.png",
    "shards 3/green shard 2.png",
    "shards 3/green shard 3.png",
    "shards 3/green shard 4.png",
    "shards 3/green shard 5.png"
  ],
  blue: [
    "shards 3/blue shard 1.png",
    "shards 3/blue shard 2.png",
    "shards 3/blue shard 3.png",
    "shards 3/blue shard 4.png",
    "shards 3/blue shard 5.png"
  ]
};

const STAR_FRAGMENT_SOURCES = (typeof window !== "undefined" && window.STAR_FRAGMENT_SOURCES)
  ? window.STAR_FRAGMENT_SOURCES
  : DEFAULT_STAR_FRAGMENT_SOURCES;


function collectStarFragmentSources(sources) {
  const collected = [];
  const visit = (value) => {
    if (!value) return;
    if (typeof value === "string" || value instanceof String) {
      const trimmed = value.trim();
      if (trimmed) {
        collected.push(trimmed);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };

  visit(sources);
  return collected;
}

const STAR_FRAGMENTS_PER_SLOT = 5;

// Точные top-left координаты КАЖДОГО фрагмента (макет 460x800)
// Порядок: [звезда 1..5][фрагмент 1..5] = {x, y}
const STAR_PLACEMENT = {
  green: [
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 0, y: 413 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 0, y: 473 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 0, y: 530 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 0, y: 590 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 0, y: 650 }))
  ],
  blue: [
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 410, y: 92 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 410, y: 152 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 410, y: 212 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 410, y: 272 })),
    Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => ({ x: 410, y: 330 }))
  ]
};


function getStarBounds(color){
  const placements = STAR_PLACEMENT?.[color];
  if (!Array.isArray(placements) || placements.length === 0){
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const placement of placements){
    if (!Array.isArray(placement)) continue;
    for (const point of placement){
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number'){
        continue;
      }
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (minX === Infinity){
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  return { minX, maxX, minY, maxY };
}


// Состояние слотов: теперь 5 звёзд на сторону (каждая звезда = до 5 фрагментов)
const STAR_STATE = {
  blue:  Array.from({length:5}, ()=> new Set()),
  green: Array.from({length:5}, ()=> new Set())
};

let STAR_LAP = { blue: 0, green: 0 };
let STAR_POS = { blue: 0, green: 0 };
let STAR_PLACED_IN_LAP = { blue: 0, green: 0 };

const STAR_FRAGMENT_FADE_DURATION_MS = 620;
const STAR_FRAGMENT_ROW_DELAY_MS = 70;

const STAR_FRAGMENT_ANIMATIONS = {
  blue: [],
  green: []
};

function ensureStarAnimationState(color){
  const slots = Array.isArray(STAR_PLACEMENT?.[color]) ? STAR_PLACEMENT[color].length : 0;
  if (!Array.isArray(STAR_FRAGMENT_ANIMATIONS[color])){
    STAR_FRAGMENT_ANIMATIONS[color] = [];
  }

  const storage = STAR_FRAGMENT_ANIMATIONS[color];

  while (storage.length < slots){
    storage.push(Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => null));
  }

  if (storage.length > slots){
    storage.length = slots;
  }

  for (let i = 0; i < storage.length; i += 1){
    const row = storage[i];
    if (!Array.isArray(row)){
      storage[i] = Array.from({ length: STAR_FRAGMENTS_PER_SLOT }, () => null);
      continue;
    }

    if (row.length < STAR_FRAGMENTS_PER_SLOT){
      row.length = STAR_FRAGMENTS_PER_SLOT;
    }

    for (let j = 0; j < row.length; j += 1){
      if (typeof row[j] === "undefined"){
        row[j] = null;
      }
    }
  }

  return storage;
}

function starFragmentDelay(color, slotIdx){
  const slots = Array.isArray(STAR_PLACEMENT?.[color]) ? STAR_PLACEMENT[color].length : 0;
  if (slots <= 1){
    return 0;
  }
  const step = STAR_FRAGMENT_ROW_DELAY_MS;
  if (color === "blue"){
    return (slots - 1 - slotIdx) * step;
  }
  return slotIdx * step;
}

function applyStarFragmentAnimations(color, previousState){
  const slots = STAR_STATE[color];
  if (!Array.isArray(slots)) return;

  const animStorage = ensureStarAnimationState(color);
  const now = performance.now();

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx += 1){
    const newPieces = slots[slotIdx] || new Set();
    const prevPieces = Array.isArray(previousState) ? previousState[slotIdx] || new Set() : new Set();
    const animRow = animStorage[slotIdx];

    for (let frag = 1; frag <= STAR_FRAGMENTS_PER_SLOT; frag += 1){
      const fragIdx = frag - 1;
      const hasNow = newPieces.has(frag);
      const hadBefore = prevPieces instanceof Set ? prevPieces.has(frag) : false;

      if (hasNow){
        if (!hadBefore){
          animRow[fragIdx] = {
            start: now,
            delay: starFragmentDelay(color, slotIdx),
            duration: STAR_FRAGMENT_FADE_DURATION_MS
          };
        } else if (!animRow[fragIdx]){
          animRow[fragIdx] = {
            start: now - STAR_FRAGMENT_FADE_DURATION_MS,
            delay: 0,
            duration: STAR_FRAGMENT_FADE_DURATION_MS
          };
        }
      } else {
        animRow[fragIdx] = null;
      }
    }
  }
}

ensureStarAnimationState("blue");
ensureStarAnimationState("green");

const STAR_IMAGES = {
  blue: [],
  green: []
};

let pendingStarImages = 0;
let starAssetsInitialized = false;
let starImagesRequested = false;

function finalizeStarLoading(){
  if (starAssetsInitialized) return;
  starAssetsInitialized = true;
  window.STAR_READY = true;
  console.log("[STAR] shards loaded");
  syncAllStarStates();
  if (typeof renderScoreboard === "function"){
    renderScoreboard();
  }
}

function handleStarAssetLoaded(){
  pendingStarImages = Math.max(0, pendingStarImages - 1);
  if (pendingStarImages === 0){
    finalizeStarLoading();
  }
}

function registerShardImage(src){
  if (src instanceof String) src = src.valueOf();
  if (typeof src !== "string"){
    return null;
  }
  const trimmed = src.trim();
  if (!trimmed){
    return null;
  }
  const img = new Image();
  pendingStarImages += 1;
  img.onload = handleStarAssetLoaded;
  img.onerror = (event) => {
    console.warn(`[STAR] shard load ERROR ${trimmed}`, event);
    handleStarAssetLoaded();
  };
  img.src = trimmed;
  return img;
}

function loadStarImages(){
  const colorSet = new Set([
    ...Object.keys(STAR_PLACEMENT || {}),
    ...Object.keys(STAR_FRAGMENT_SOURCES || {})
  ]);
  const colors = Array.from(colorSet);
  pendingStarImages = 0;

  colors.forEach(color => {
    const slots = Array.isArray(STAR_PLACEMENT[color]) ? STAR_PLACEMENT[color].length : 0;
    const sources = STAR_FRAGMENT_SOURCES[color];

    if (!Array.isArray(sources)){
      STAR_IMAGES[color] = Array.from({ length: slots }, () => []);
      return;
    }

    const first = sources[0];

    if (typeof first === "string" || first instanceof String){
      const sharedImages = sources.map(src => registerShardImage(src));
      STAR_IMAGES[color] = Array.from({ length: slots }, () => sharedImages);
      return;
    }

    if (Array.isArray(first)){
      const mapped = sources.map(slotSources => {
        if (!Array.isArray(slotSources)) return [];
        return slotSources.map(src => registerShardImage(src));
      });
      while (mapped.length < slots){
        mapped.push(mapped[mapped.length - 1] || []);
      }
      STAR_IMAGES[color] = mapped;
      return;
    }

    STAR_IMAGES[color] = Array.from({ length: slots }, () => []);
  });

  if (pendingStarImages === 0){
    finalizeStarLoading();
  }
}

function loadStarImagesIfNeeded(){
  if (starImagesRequested) return;
  starImagesRequested = true;
  loadStarImages();
}


function syncStarState(color, score){
  const slots = STAR_STATE[color];
  if (!Array.isArray(slots)) return;

  const previousState = slots.map(set => {
    if (set instanceof Set){
      return new Set(set);
    }
    return new Set();
  });

  const clamped = Math.max(0, Math.min(score, POINTS_TO_WIN));

  slots.forEach(set => set.clear());
  STAR_LAP[color] = 0;
  STAR_POS[color] = 0;
  STAR_PLACED_IN_LAP[color] = 0;

  for (let count = 0; count < clamped; count++){
    if (!addPointToSide(color)) break;
  }

  applyStarFragmentAnimations(color, previousState);
}

function addPointToSide(color){
  const pool = STAR_STATE[color];                   // массив из 5 Set'ов (по звездам)
  if (!Array.isArray(pool) || pool.length === 0) return false;

  const totalSlots = pool.length;
  const fragmentsPerSlot = STAR_FRAGMENTS_PER_SLOT;
  if (totalSlots <= 0 || fragmentsPerSlot <= 0) return false;

  let targetSlot = -1;

  for (let slotIndex = 0; slotIndex < totalSlots; slotIndex += 1){
    let pieces = pool[slotIndex];
    if (!(pieces instanceof Set)){
      pieces = new Set();
      pool[slotIndex] = pieces;
    }

    if (pieces.size < fragmentsPerSlot){
      targetSlot = slotIndex;
      break;
    }
  }

  if (targetSlot === -1){
    STAR_POS[color] = totalSlots > 0 ? totalSlots - 1 : 0;
    STAR_LAP[color] = totalSlots;
    STAR_PLACED_IN_LAP[color] = fragmentsPerSlot;
    return false;
  }

  const slotPieces = pool[targetSlot];
  let fragment = 1;
  while (fragment <= fragmentsPerSlot && slotPieces.has(fragment)){
    fragment += 1;
  }

  if (fragment > fragmentsPerSlot){
    // На случай непредвиденного рассинхрона: слот считался незаполненным,
    // но в нём присутствуют все фрагменты. Попробуем перейти к следующему слоту.
    STAR_POS[color] = targetSlot + 1;
    STAR_PLACED_IN_LAP[color] = fragmentsPerSlot;
    STAR_LAP[color] = targetSlot + 1;
    return addPointToSide(color);
  }

  slotPieces.add(fragment);

  STAR_POS[color] = targetSlot;
  STAR_PLACED_IN_LAP[color] = slotPieces.size;
  STAR_LAP[color] = targetSlot;

  return true;
}

function syncAllStarStates(){
  syncStarState("green", greenScore);
  syncStarState("blue",  blueScore);
}

syncAllStarStates();

function lockInWinner(color, options = {}){
  if(isGameOver) return;

  isGameOver = true;
  winnerColor = color;

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

function addScore(color, delta){
  if(isGameOver) return;

  if(color === "blue"){
    const previous = blueScore;
    blueScore = Math.max(0, blueScore + delta);
    if(blueScore > previous){
      spawnScorePopup("blue", blueScore - previous, blueScore);
    } else {
      syncStarState("blue", blueScore);
      updatePendingStarTargets("blue", blueScore);
    }
  } else if(color === "green"){
    const previous = greenScore;
    greenScore = Math.max(0, greenScore + delta);
    if(greenScore > previous){
      spawnScorePopup("green", greenScore - previous, greenScore);
    } else {
      syncStarState("green", greenScore);
      updatePendingStarTargets("green", greenScore);
    }
  }

  if(!isGameOver){
    if(blueScore >= POINTS_TO_WIN){
      lockInWinner("blue", { showEndScreen: true });
    } else if(greenScore >= POINTS_TO_WIN){
      lockInWinner("green", { showEndScreen: true });
    }
  }

  renderScoreboard();
}

let animationFrameId = null;

/* Планирование хода ИИ */
let aiMoveScheduled = false;

/* ======= INIT ======= */
function colorAngleOffset(color){
  return 0;
}

let HOME_ROW_Y = { blue: 40, green: 0 };

function getHomeRowY(color){
  const fallback = color === "blue" ? 40 : gameCanvas.height - 40;
  const rowY = HOME_ROW_Y[color];
  return Number.isFinite(rowY) ? rowY : fallback;
}

function initPoints(){
  points = [];
  const spacing = FIELD_WIDTH / (PLANES_PER_SIDE + 1);
  const middleOffset = MIDDLE_GAP_EXTRA_PX / 2;
  const edgePadding = EDGE_PLANE_PADDING_PX;

  const blueHomeY = 40;
  const greenHomeY = gameCanvas.height - 40;
  HOME_ROW_Y = { blue: blueHomeY, green: greenHomeY };

  // Green (низ поля) — смотрят ВВЕРХ (к сопернику)
  for(let i = 1; i <= PLANES_PER_SIDE; i++){
    let x = FIELD_LEFT + spacing * i;
    if(i === 1) x -= edgePadding;
    if(i === PLANES_PER_SIDE) x += edgePadding;
    if(i === Math.ceil(PLANES_PER_SIDE / 2)) x -= middleOffset;
    if(i === Math.ceil(PLANES_PER_SIDE / 2) + 1) x += middleOffset;
    points.push(makePlane(x, greenHomeY, "green", colorAngleOffset("green"))); // 0 рад — нос вверх
  }

  // Blue (верх поля) — смотрят ВНИЗ
  for(let i = 1; i <= PLANES_PER_SIDE; i++){
    let x = FIELD_LEFT + spacing * i;
    if(i === 1) x -= edgePadding;
    if(i === PLANES_PER_SIDE) x += edgePadding;
    if(i === Math.ceil(PLANES_PER_SIDE / 2)) x -= middleOffset;
    if(i === Math.ceil(PLANES_PER_SIDE / 2) + 1) x += middleOffset;
    points.push(makePlane(x, blueHomeY, "blue", Math.PI + colorAngleOffset("blue"))); // π рад — базовый разворот вниз
  }
}
function makePlane(x,y,color,angle){
  return {
    x, y,
    color,
    isAlive:true,
    burning:false,
    explosionStart:null,
    angle,
    segments:[],
    collisionX:null,
    collisionY:null,
    prevX: x,
    prevY: y,
    flagColor:null,
    flameFxDisabled: false
  };
}


function resetGame(){
  isGameOver= false;
  winnerColor= null;
  endGameDiv.style.display = "none";
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;

  cleanupGreenCrashFx();

  if(fxLayerElement){
    fxLayerElement.innerHTML = "";
  }

  clearScoreCounters();

  greenScore = 0;
  blueScore  = 0;
  STAR_LAP = { blue: 0, green: 0 };
  STAR_POS = { blue: 0, green: 0 };
  STAR_PLACED_IN_LAP = { blue: 0, green: 0 };
  STAR_STATE.blue  = Array.from({length:5}, ()=> new Set());
  STAR_STATE.green = Array.from({length:5}, ()=> new Set());
  syncAllStarStates();
  roundNumber = 0;
  roundTextTimer = 0;
  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }

  blueFlagCarrier = null;
  greenFlagCarrier = null;
  blueFlagStolenBy = null;
  greenFlagStolenBy = null;


  lastFirstTurn= 1 - lastFirstTurn;
  turnIndex= lastFirstTurn;


  globalFrame=0;
  flyingPoints= [];
  buildings = [];
  if(shouldAutoRandomizeMap()){
    if(settings.mapIndex !== RANDOM_MAP_SENTINEL_INDEX){
      setMapIndexAndPersist(getRandomPlayableMapIndex());
    }
  }
  applyCurrentMap();

  aaUnits = [];

  hasShotThisRound = false;

  selectedMode = null;
  gameMode = null;
  phase = 'MENU';
  currentPlacer = null;

  setBackgroundImage('background behind the canvas.png', 'background paper 1.png');
  hideGameBackgroundForMenu();

  // UI reset
  syncModeButtonSkins(null);
  syncPlayButtonSkin(false);

  // Показать меню, скрыть канвасы
  modeMenuDiv.style.display = "block";
  gameCanvas.style.display = "none";
  mantisIndicator.style.display = "none";
  goatIndicator.style.display = "none";
  aimCanvas.style.display = "none";
  planeCanvas.style.display = "none";
  resetCanvasState(planeCtx, planeCanvas);

  // Остановить основной цикл
  stopGameLoop();

  initPoints();
  renderScoreboard();
}


function stopGameLoop(){
  if(animationFrameId !== null){
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}
function startGameLoop(){
  if(animationFrameId === null){
    lastFrameTime = performance.now();
    animationFrameId = requestAnimationFrame(gameDraw);
  }
}

/* ======= MENU ======= */
hotSeatBtn.addEventListener("click",()=>{
  selectedMode = (selectedMode==="hotSeat" ? null : "hotSeat");
  updateModeSelection();
});
computerBtn.addEventListener("click",()=>{
  selectedMode = (selectedMode==="computer" ? null : "computer");
  updateModeSelection();
});
onlineBtn.addEventListener("click",()=>{
  selectedMode = (selectedMode==="online" ? null : "online");
  updateModeSelection();
});
if(classicRulesBtn){
  classicRulesBtn.addEventListener('click', () => {
      rangeCells = 15;
    aimingAmplitude = 10 / 5; // 10°
    settings.addAA = false;
    settings.sharpEdges = false;
    const upcomingRoundNumber = roundNumber + 1;
    settings.mapIndex = getRandomPlayableMapIndex(upcomingRoundNumber);
    settings.randomizeMapEachRound = true;
    settings.flameStyle = 'random';
    onFlameStyleChanged();
    applyCurrentMap(upcomingRoundNumber);
    selectedRuleset = "classic";
    syncRulesButtonSkins(selectedRuleset);
  });
}
if(advancedSettingsBtn){
  advancedSettingsBtn.addEventListener('click', () => {
    loadSettings();
    applyCurrentMap();
    selectedRuleset = "advanced";
    syncRulesButtonSkins(selectedRuleset);

    if(!IS_TEST_HARNESS){
      window.location.href = 'settings.html';
    }
  });
}
function updateModeSelection(){
  syncModeButtonSkins(selectedMode);

  const ready = Boolean(selectedMode);
  syncPlayButtonSkin(ready);
}

playBtn.addEventListener("click",()=>{
  if(!selectedMode){
    alert("Please select a game mode before starting.");
    return;
  }
  gameMode = selectedMode;
  restoreGameBackgroundAfterMenu();
  modeMenuDiv.style.display = "none";
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

function handleStart(e) {
  e.preventDefault();
  if(isGameOver || !gameMode) return;

  const currentColor= turnColors[turnIndex];
  if(gameMode==="computer" && currentColor==="blue") return; // ход ИИ

  if(flyingPoints.some(fp=>fp.plane.color===currentColor)) return;

  const { x: mx, y: my } = clientToBoard(e);

  let found= points.find(pt=>
    pt.color=== currentColor &&
    pt.isAlive && !pt.burning &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(!found) return;

  // Нельзя выбирать самолёт, который внутри здания
  for(let b of buildings){
    if(isPointInsideBuilding(found.x, found.y, b)){
      return;
    }
  }

  handleCircle.baseX= mx; handleCircle.baseY= my;
  handleCircle.shakyX= mx; handleCircle.shakyY= my;
  handleCircle.offsetX=0; handleCircle.offsetY=0;
  handleCircle.active= true;
  handleCircle.pointRef= found;
  handleCircle.origAngle = found.angle;
  oscillationAngle = 0;
  oscillationDir = 1;
  roundTextTimer = 0; // Hide round label when player starts a move

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
  const { x, y } = clientToBoard(e);
  aaPlacementPreview = {x, y};
  aaPreviewTrail = [];
}

function onCanvasPointerDown(e){
  if(phase === 'AA_PLACEMENT'){
    e.preventDefault();
    aaPointerDown = true;
    updateAAPreviewFromEvent(e);
  } else {
    handleStart(e);
  }
}

function onCanvasPointerMove(e){
  if(phase !== 'AA_PLACEMENT') return;
  if(e.pointerType === 'mouse' || aaPointerDown){
    updateAAPreviewFromEvent(e);
  }
}

function onCanvasPointerUp(){
  if(phase !== 'AA_PLACEMENT') return;
  aaPointerDown = false;
  if(!aaPlacementPreview) return;
  const {x, y} = aaPlacementPreview;
  handleAAPlacement(x, y);
  aaPlacementPreview = null;
  aaPreviewTrail = [];
}

gameCanvas.addEventListener("pointerdown", onCanvasPointerDown);
gameCanvas.addEventListener("pointermove", onCanvasPointerMove);
gameCanvas.addEventListener("pointerup", onCanvasPointerUp);
gameCanvas.addEventListener("pointerleave", () => { aaPlacementPreview = null; aaPointerDown = false; aaPreviewTrail = []; });


function isValidAAPlacement(x,y){
  // Allow Anti-Aircraft placement anywhere within the player's half of the field.
  // The center may touch field edges or overlap planes, but must not be inside
  // any building so that AA can be destroyed by planes.

  const half = gameCanvas.height / 2;

  if (currentPlacer === 'green') {
    if (y < half || y > gameCanvas.height) return false;
  } else if (currentPlacer === 'blue') {
    if (y < 0 || y > half) return false;
  } else {
    return false;
  }


  if (x < FIELD_LEFT + FIELD_BORDER_OFFSET_X ||
      x > FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X) {

    return false;
  }

  // Prevent placing the AA center inside any building
  for(const b of buildings){
    const left = b.x - b.width/2;
    const right = b.x + b.width/2;
    const top = b.y - b.height/2;
    const bottom = b.y + b.height/2;
    if(x >= left && x <= right && y >= top && y <= bottom){
      return false;
    }
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

  const half = gameCanvas.height / 2;
  gameCtx.save();
  gameCtx.fillStyle = colorWithAlpha(currentPlacer, 0.05);
  if(currentPlacer === 'green'){
    gameCtx.fillRect(FIELD_LEFT, half, FIELD_WIDTH, half);
  } else {
    gameCtx.fillRect(FIELD_LEFT, 0, FIELD_WIDTH, half);
  }
  gameCtx.restore();
}

function drawAAPreview(){
  if(phase !== 'AA_PLACEMENT' || !aaPlacementPreview) return;
  const {x, y} = aaPlacementPreview;
  if(!isValidAAPlacement(x, y)) return;

  gameCtx.save();
  gameCtx.globalAlpha = 0.3;
  gameCtx.strokeStyle = colorFor(currentPlacer);
  gameCtx.beginPath();
  gameCtx.arc(x, y, AA_DEFAULTS.radius, 0, Math.PI*2);
  gameCtx.stroke();

  // track preview sweep trail
  const now = performance.now();
  const angDeg = (now/1000 * AA_DEFAULTS.rotationDegPerSec) % 360;
  aaPreviewTrail.push({angleDeg: angDeg, time: now});
  aaPreviewTrail = aaPreviewTrail.filter(seg => now - seg.time < AA_TRAIL_MS);

  for(const seg of aaPreviewTrail){
    const age = now - seg.time;

    const alpha = (1 - age/AA_TRAIL_MS) * 0.3;

    gameCtx.globalAlpha = alpha;
    gameCtx.strokeStyle = colorFor(currentPlacer);
    gameCtx.lineWidth = 2;
    gameCtx.lineCap = "round";
    const trailAng = seg.angleDeg * Math.PI/180;
    const trailEndX = x + Math.cos(trailAng) * AA_DEFAULTS.radius;
    const trailEndY = y + Math.sin(trailAng) * AA_DEFAULTS.radius;
    gameCtx.beginPath();
    gameCtx.moveTo(x, y);
    gameCtx.lineTo(trailEndX, trailEndY);
    gameCtx.stroke();
  }

  // rotating sweep line preview
  const ang = angDeg * Math.PI/180;

  const endX = x + Math.cos(ang) * AA_DEFAULTS.radius;
  const endY = y + Math.sin(ang) * AA_DEFAULTS.radius;

  gameCtx.globalAlpha = 0.6;
  gameCtx.strokeStyle = colorFor(currentPlacer);
  gameCtx.lineWidth = 2;
  gameCtx.lineCap = "round";
  gameCtx.beginPath();
  gameCtx.moveTo(x, y);
  gameCtx.lineTo(endX, endY);
  gameCtx.stroke();

  // translucent white highlight on sweep line
  gameCtx.globalAlpha = 0.5;
  gameCtx.strokeStyle = "white";
  gameCtx.lineWidth = 1;
  gameCtx.lineCap = "round";
  gameCtx.beginPath();
  gameCtx.moveTo(x, y);
  gameCtx.lineTo(endX, endY);
  gameCtx.stroke();

  gameCtx.globalAlpha = 0.4;
  gameCtx.fillStyle = colorFor(currentPlacer);
  gameCtx.beginPath();
  gameCtx.arc(x, y, 6, 0, Math.PI*2);
  gameCtx.fill();

  // inner white circle for volume
  gameCtx.globalAlpha = 0.6;
  gameCtx.fillStyle = "white";
  gameCtx.beginPath();
  gameCtx.arc(x, y, 4, 0, Math.PI*2);
  gameCtx.fill();

  // colored center dot matching player color
  gameCtx.globalAlpha = 1;
  gameCtx.fillStyle = colorFor(currentPlacer);
  gameCtx.beginPath();
  gameCtx.arc(x, y, 1.5, 0, Math.PI*2);
  gameCtx.fill();
  gameCtx.restore();
}


function onHandleMove(e){
  if(!handleCircle.active)return;
  e.preventDefault();
  const { x, y } = clientToBoard(e);

  handleCircle.baseX = x;
  handleCircle.baseY = y;
}

function onHandleUp(){
  if(!handleCircle.active || !handleCircle.pointRef) return;
  let plane= handleCircle.pointRef;
  if(isGameOver || !gameMode){
    plane.angle = handleCircle.origAngle;
    cleanupHandle(); return;
  }
  let dx= handleCircle.shakyX - plane.x;
  let dy= handleCircle.shakyY - plane.y;

  let dragDistance = Math.hypot(dx, dy);
  // Cancel the move if released before the first tick mark
  if(dragDistance < CELL_SIZE){
    plane.angle = handleCircle.origAngle;
    cleanupHandle();
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
    const flightDistancePx = rangeCells * CELL_SIZE;
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

  if(!hasShotThisRound){
    hasShotThisRound = true;
    renderScoreboard();
  }
  cleanupHandle();
}
function cleanupHandle(){
  handleCircle.active= false;
  handleCircle.pointRef= null;
  handleCircle.origAngle = null;
  // Hide overlay canvas when aiming ends
  aimCanvas.style.display = "none";
  aimCtx.clearRect(0,0,aimCanvas.width,aimCanvas.height);
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

  const centerX = FIELD_LEFT + FIELD_WIDTH/2;
  const topY    = getHomeRowY("blue");
  const bottomY = getHomeRowY("green");

  // 1. If we are carrying the enemy flag, prioritize returning home
  const carrier = aiPlanes.find(p=>p.flagColor === "green" && !flyingPoints.some(fp=>fp.plane===p));
  if(carrier){
    const move = planPathToPoint(carrier, centerX, topY);
    if(move){
      issueAIMove(carrier, move.vx, move.vy);
    }
    return;
  }

  // 2. If our flag is stolen, focus fire on the carrier
  let targetEnemies = enemies;
  if(blueFlagCarrier && blueFlagCarrier.color !== "blue"){
    targetEnemies = enemies.filter(e=>e===blueFlagCarrier);
  } else if(!greenFlagCarrier){
    // 3. Enemy flag available – attempt to steal it
    let bestCap = null;
    for(const plane of aiPlanes){
      if(flyingPoints.some(fp=>fp.plane===plane)) continue;
      const move = planPathToPoint(plane, centerX, bottomY);
      if(move && (!bestCap || move.totalDist < bestCap.totalDist)){
        bestCap = {plane, ...move};
      }
    }
    if(bestCap){
      issueAIMove(bestCap.plane, bestCap.vx, bestCap.vy);
      return;
    }
  }

  // 4. Attack logic (direct or with bounce)
    const flightDistancePx = rangeCells * CELL_SIZE;
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
    const flightDistancePx = rangeCells * CELL_SIZE;
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

  for(const b of buildings){
    const left = b.x - b.width/2, right = b.x + b.width/2;
    const top  = b.y - b.height/2, bottom = b.y + b.height/2;

    // учитываем радиус самолёта при планировании
    const mLeft   = left   - POINT_RADIUS;
    const mRight  = right  + POINT_RADIUS;
    const mTop    = top    - POINT_RADIUS;
    const mBottom = bottom + POINT_RADIUS;

    const edges = [
      {type:"H", x1:left, y1:top,    x2:right, y2:top,    big:{x1:mLeft,  y1:mTop,    x2:mRight, y2:mTop}},
      {type:"H", x1:left, y1:bottom, x2:right, y2:bottom, big:{x1:mLeft,  y1:mBottom, x2:mRight, y2:mBottom}},
      {type:"V", x1:left, y1:top,    x2:left,  y2:bottom, big:{x1:mLeft,  y1:mTop,    x2:mLeft,  y2:mBottom}},
      {type:"V", x1:right,y1:top,    x2:right, y2:bottom, big:{x1:mRight, y1:mTop,    x2:mRight, y2:mBottom}}
    ];

    for(const e of edges){
      // "Отразим" цель
      let mirrorTarget;
      if(e.type==="V"){ // x = const
        const xEdge = e.x1;
        mirrorTarget = { x: 2*xEdge - enemy.x, y: enemy.y };
      } else {         // y = const
        const yEdge = e.y1;
        mirrorTarget = { x: enemy.x, y: 2*yEdge - enemy.y };
      }

      // Пересечение линии (plane -> mirrorTarget) с ребром
      const inter = lineSegmentIntersection(
        plane.x, plane.y, mirrorTarget.x, mirrorTarget.y,
        e.x1, e.y1, e.x2, e.y2
      );
      if(!inter) continue;

      // Путь чист?
      if(!isPathClearExceptEdge(plane.x, plane.y, inter.x, inter.y, b, e.big)) continue;
      if(!isPathClearExceptEdge(inter.x, inter.y, enemy.x, enemy.y, b, e.big)) continue;

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
function isPointInsideBuilding(x, y, b){
  return x >= (b.x - b.width/2) &&
         x <= (b.x + b.width/2) &&
         y >= (b.y - b.height/2) &&
         y <= (b.y + b.height/2);
}

function isPathClear(x1,y1,x2,y2){
  for(const b of buildings){
    if(checkLineIntersectionWithBuilding(x1,y1,x2,y2,b)) return false;
  }
  return true;
}
function isPathClearExceptEdge(x1,y1,x2,y2, building, edge){
  for(const b of buildings){
    if(b!==building){
      if(checkLineIntersectionWithBuilding(x1,y1,x2,y2,b)) return false;
    } else {
      if(checkLineIntersectionWithBuilding(x1,y1,x2,y2,b, edge)) return false;
    }
  }
  return true;
}

function checkLineIntersectionWithBuilding(x1,y1,x2,y2,b, ignoreEdge=null){
  const margin = POINT_RADIUS;
  const left   = b.x - b.width/2  - margin,
        right  = b.x + b.width/2  + margin,
        top    = b.y - b.height/2 - margin,
        bottom = b.y + b.height/2 + margin;

  const edges = [
    {id:"top",    x1:left, y1:top,    x2:right, y2:top   },
    {id:"right",  x1:right,y1:top,    x2:right, y2:bottom},
    {id:"bottom", x1:right,y1:bottom, x2:left,  y2:bottom},
    {id:"left",   x1:left, y1:bottom, x2:left,  y2:top   }
  ];

  for(const e of edges){
    if(ignoreEdge && sameEdge(e, ignoreEdge)) continue;
    if(doLinesIntersect(x1,y1,x2,y2, e.x1,e.y1,e.x2,e.y2)) return true;
  }
  return false;
}
function sameEdge(a,e){
  return (a.x1===e.x1 && a.y1===e.y1 && a.x2===e.x2 && a.y2===e.y2);
}

function doLinesIntersect(x1,y1,x2,y2, x3,y3,x4,y4){
  function ccw(ax,ay,bx,by,cx,cy){
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }
  return (ccw(x1,y1,x3,y3,x4,y4) !== ccw(x2,y2,x3,y3,x4,y4)) &&
         (ccw(x1,y1,x2,y2,x3,y3) !== ccw(x1,y1,x2,y2,x4,y4));
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

// Find the closest intersection point of a line segment with any building
function firstBuildingIntersection(x1,y1,x2,y2){
  let closest = null;
  let minDist = Infinity;
  for(const b of buildings){
    const left = b.x - b.width/2, right = b.x + b.width/2;
    const top  = b.y - b.height/2, bottom = b.y + b.height/2;
    const edges = [
      {x1:left, y1:top,    x2:right, y2:top   },
      {x1:right,y1:top,    x2:right, y2:bottom},
      {x1:right,y1:bottom, x2:left,  y2:bottom},
      {x1:left, y1:bottom, x2:left,  y2:top   }
    ];
    for(const e of edges){
      const hit = lineSegmentIntersection(x1,y1,x2,y2, e.x1,e.y1,e.x2,e.y2);
      if(hit){
        const d = Math.hypot(hit.x - x1, hit.y - y1);
        if(d < minDist){
          minDist = d;
          closest = hit;
        }
      }
    }
  }
  return closest;
}

/* Коллизии самолёт <-> здание */
function planeBuildingCollision(fp, b){
  const p = fp.plane;
  let collided = false;

  // В углах самолёт может касаться двух граней сразу.
  // Разрешаем до двух последовательных отражений за один кадр,
  // чтобы избегать «проскальзывания» по ребру.
  for(let i=0;i<2;i++){
    const closestX = clamp(p.x, b.x - b.width/2,  b.x + b.width/2);
    const closestY = clamp(p.y, b.y - b.height/2, b.y + b.height/2);
    const dx = p.x - closestX;
    const dy = p.y - closestY;
    const dist2 = dx*dx + dy*dy;
    if(dist2 >= POINT_RADIUS*POINT_RADIUS) break;

    collided = true;

    let nx=0, ny=0;

    // направление нормали из точки соприкосновения
    if(dx !== 0 || dy !== 0){
      const dist = Math.sqrt(dist2);
      nx = dx / dist;
      ny = dy / dist;
    } else {
      // если центр внутри прямоугольника – fallback по оси минимального проникновения
      const penLeft   = Math.abs(p.x - (b.x - b.width/2));
      const penRight  = Math.abs((b.x + b.width/2) - p.x);
      const penTop    = Math.abs(p.y - (b.y - b.height/2));
      const penBottom = Math.abs((b.y + b.height/2) - p.y);

      const minPen = Math.min(penLeft, penRight, penTop, penBottom);
      if(minPen === penLeft)      { nx = -1; ny = 0; }
      else if(minPen === penRight){ nx =  1; ny = 0; }
      else if(minPen === penTop)  { nx =  0; ny = -1;}
      else                        { nx =  0; ny =  1;}
    }

    // отражаем скорость
    const dot = fp.vx*nx + fp.vy*ny;
    fp.vx = fp.vx - 2*dot*nx;
    fp.vy = fp.vy - 2*dot*ny;

    // выталкивание за пределы
    const EPS = 0.5;
    p.x = closestX + nx * (POINT_RADIUS + EPS);
    p.y = closestY + ny * (POINT_RADIUS + EPS);
  }

  if(collided){
    fp.collisionCooldown = 2;
  }
  return collided;
}

function destroyPlane(fp){
  const p = fp.plane;
  if(p.flagColor){
    if(p.flagColor === "blue"){
      blueFlagCarrier = null;
      blueFlagStolenBy = null;
    } else {
      greenFlagCarrier = null;
      greenFlagStolenBy = null;
    }
    p.flagColor = null;
  }
  p.isAlive = false;
  p.burning = true;
  ensurePlaneBurningFlame(p);
  p.collisionX = p.x;
  p.collisionY = p.y;
  const explosionTimestamp = performance.now();
  p.explosionStart = explosionTimestamp;
  p.killMarkerStart = explosionTimestamp;

  try { spawnExplosion(p.collisionX, p.collisionY, p.color); }
  catch(e) { console.warn('[FX] spawnExplosion error', e); }


  schedulePlaneFlameFx(p);


  flyingPoints = flyingPoints.filter(x=>x!==fp);
  awardPoint(p.color);
  checkVictory();
  if(!isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
    turnIndex = (turnIndex + 1) % turnColors.length;
    if(turnColors[turnIndex] === "blue" && gameMode === "computer"){
      aiMoveScheduled = false;
    }
  }
}

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }


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
        addScore(p.color, 1);
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
              const aaExplosionTimestamp = performance.now();
              p.explosionStart = aaExplosionTimestamp;
              p.killMarkerStart = aaExplosionTimestamp;

              try { spawnExplosion(p.collisionX, p.collisionY, p.color); }
              catch(e) { console.warn('[FX] spawnExplosion error', e); }
              schedulePlaneFlameFx(p);
              if(fp) {
                flyingPoints = flyingPoints.filter(x=>x!==fp);
              }
              awardPoint(p.color);
              checkVictory();
              if(fp && !isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
                turnIndex = (turnIndex + 1) % turnColors.length;
                if(turnColors[turnIndex]==="blue" && gameMode==="computer"){
                  aiMoveScheduled = false;
                }
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
  /* ======= GAME LOOP ======= */
  function gameDraw(){
  const now = performance.now();
  let deltaSec = (now - lastFrameTime) / 1000;
  deltaSec = Math.min(deltaSec, 0.05);
  const delta = deltaSec * 60;
  lastFrameTime = now;
  globalFrame += delta;

  // фон
  resetCanvasState(gameCtx, gameCanvas);
  drawFieldBackground(gameCtx, gameCanvas.width, gameCanvas.height);

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

      p.x += fp.vx * deltaSec;
      p.y += fp.vy * deltaSec;

        if(isBrickPixel(p.x, p.y)){
          const sample = (sx, sy) => isBrickPixel(sx, sy) ? 1 : 0;

          // Estimate surface normal at the current position using a
          // Sobel-like 3×3 kernel so reflections also work for
          // diagonal walls.
          const curX = p.x;
          const curY = p.y;
          let nx = (
            sample(curX - 1, curY - 1) + 2*sample(curX - 1, curY) + sample(curX - 1, curY + 1)
          ) - (
            sample(curX + 1, curY - 1) + 2*sample(curX + 1, curY) + sample(curX + 1, curY + 1)
          );
          let ny = (
            sample(curX - 1, curY - 1) + 2*sample(curX, curY - 1) + sample(curX + 1, curY - 1)
          ) - (
            sample(curX - 1, curY + 1) + 2*sample(curX, curY + 1) + sample(curX + 1, curY + 1)

          );
          const len = Math.hypot(nx, ny);
          if(len > 0){
            nx /= len;
            ny /= len;
            p.x = prevX;
            p.y = prevY;
            const dot = fp.vx * nx + fp.vy * ny;
            fp.vx -= 2 * dot * nx;
            fp.vy -= 2 * dot * ny;
            const EPS = 0.5;
            p.x += nx * EPS;
            p.y += ny * EPS;
          } else {
            const hitX = isBrickPixel(prevX, p.y);
            const hitY = isBrickPixel(p.x, prevY);
            if(!hitX && hitY){
              p.x = prevX;
              fp.vx = -fp.vx;
            } else if(hitX && !hitY){
              p.y = prevY;
              fp.vy = -fp.vy;
            } else {
              p.x = prevX;
              p.y = prevY;
              fp.vx = -fp.vx;
              fp.vy = -fp.vy;
            }
          }
        }

        // field borders

        if (p.x < FIELD_LEFT + FIELD_BORDER_OFFSET_X) {
          p.x = FIELD_LEFT + FIELD_BORDER_OFFSET_X;

          if (settings.sharpEdges) {
            destroyPlane(fp);
            continue;
          }
          fp.vx = -fp.vx;
        }

        else if (p.x > FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X) {
          p.x = FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X;

          if (settings.sharpEdges) {
            destroyPlane(fp);
            continue;
          }
          fp.vx = -fp.vx;
        }
        if (p.y < FIELD_BORDER_OFFSET_Y) {
          p.y = FIELD_BORDER_OFFSET_Y;
          if (settings.sharpEdges) {
            destroyPlane(fp);
            continue;
          }
          fp.vy = -fp.vy;
        }
        else if (p.y > gameCanvas.height - FIELD_BORDER_OFFSET_Y) {
          p.y = gameCanvas.height - FIELD_BORDER_OFFSET_Y;
          if (settings.sharpEdges) {
            destroyPlane(fp);
            continue;
          }
          fp.vy = -fp.vy;
        }

      // столкновения со зданиями (cooldown)
      if(fp.collisionCooldown>0){ fp.collisionCooldown -= delta; }
      if(fp.collisionCooldown<=0){
        for(const b of buildings){
          if(planeBuildingCollision(fp, b)) break;
        }
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

      fp.timeLeft -= deltaSec;
      if(fp.timeLeft<=0){
        flyingPoints = flyingPoints.filter(x => x !== fp);
        // смена хода, когда полётов текущего цвета больше нет
        if(!isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
          turnIndex = (turnIndex + 1) % turnColors.length;
          if(turnColors[turnIndex]==="blue" && gameMode==="computer"){
            aiMoveScheduled = false; // разрешаем планирование следующего хода ИИ
          }
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
        handleAAForPlane(p, null);
      }
  }
  }

  // здания
  drawAAPlacementZone();
  drawBuildings();

  drawFieldEdges(gameCtx, gameCanvas.width, gameCanvas.height);

  drawFlags();


  // установки ПВО
  drawAAUnits();
  drawAAPreview();

  // "ручка" при натяжке
  if(handleCircle.active && handleCircle.pointRef){

    const plane = handleCircle.pointRef;
    let dx = handleCircle.baseX - plane.x;
    let dy = handleCircle.baseY - plane.y;
    let distPx = Math.hypot(dx, dy);

    // clamp drag distance but keep a fixed wobble amplitude in degrees
    const clampedDist = Math.min(distPx, MAX_DRAG_DISTANCE);

    // use a constant aiming amplitude (in degrees) independent of drag distance
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


    // Draw arrow on overlay canvas so it doesn't get clipped by game bounds
    const arrowAlpha = 0.5 * (vdist / MAX_DRAG_DISTANCE);
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
    aimCtx.save();
    const boardRect = getViewportAdjustedBoundingClientRect(gameCanvas);
    const overlayRect = getViewportAdjustedBoundingClientRect(aimCanvas);
    const start = worldToOverlay(plane.x, plane.y, { overlay: aimCanvas, boardRect, overlayRect });
    const tail = worldToOverlay(plane.x + baseDx, plane.y + baseDy, { overlay: aimCanvas, boardRect, overlayRect });
    const arrowDx = tail.overlayX - start.overlayX;
    const arrowDy = tail.overlayY - start.overlayY;
    aimCtx.globalAlpha = arrowAlpha;
    drawArrow(aimCtx, start.overlayX, start.overlayY, arrowDx, arrowDy);
    aimCtx.restore();

  } else {
    // Clear overlay if not aiming
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
  }

  // самолёты + их трейлы
  drawPlanesAndTrajectories();

  // Табло рисуем поверх самолётов, поэтому оно выводится после drawPlanesAndTrajectories
  renderScoreboard();

  if(isGameOver && winnerColor){
    gameCtx.font="48px 'Patrick Hand', cursive";
    gameCtx.fillStyle= colorFor(winnerColor);
    const winnerName= `${winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1)}`;
    const text= shouldShowEndScreen
      ? `${winnerName} wins the game!`
      : `${winnerName} wins the round!`;
    const metrics = gameCtx.measureText(text);
    const w = metrics.width;
    const textX = (gameCanvas.width - w) / 2;
    const textBaselineY = gameCanvas.height / 2 - 80;
    gameCtx.fillText(text, textX, textBaselineY);

    if(shouldShowEndScreen && endGameDiv){
      const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : 0;
      const anchorCanvasX = gameCanvas.width / 2;
      const anchorCanvasY = textBaselineY + descent + 24;
      const boardRect = getViewportAdjustedBoundingClientRect(gameCanvas);
      const boardWidth = Number.isFinite(boardRect.width) ? boardRect.width : 0;
      const boardHeight = Number.isFinite(boardRect.height) ? boardRect.height : 0;
      const scaleX = gameCanvas.width !== 0 ? boardWidth / gameCanvas.width : 1;
      const scaleY = gameCanvas.height !== 0 ? boardHeight / gameCanvas.height : 1;
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
    }
  }

  if(endGameDiv && (!shouldShowEndScreen || !isGameOver || !winnerColor)){
    if(endGameDiv.style.display !== "none"){
      endGameDiv.style.display = "none";
    }
    endGameDiv.style.left = "";
    endGameDiv.style.top = "";
  }

  if(roundTextTimer > 0){
    gameCtx.font="48px 'Patrick Hand', cursive";
    gameCtx.fillStyle = '#B22222';
    gameCtx.strokeStyle = '#FFD700';
    gameCtx.lineWidth = 2;
    const text = `Round ${roundNumber}`;
    const w = gameCtx.measureText(text).width;
    const x = (gameCanvas.width - w) / 2;
    const y = gameCanvas.height / 2;
    gameCtx.fillText(text, x, y);
    gameCtx.strokeText(text, x, y);


    const turnColor = turnColors[turnIndex];
    const turnText = `${turnColor.charAt(0).toUpperCase() + turnColor.slice(1)} turn`;
    gameCtx.font="32px 'Patrick Hand', cursive";
    gameCtx.fillStyle = colorFor(turnColor);
    const w2 = gameCtx.measureText(turnText).width;
    const x2 = (gameCanvas.width - w2) / 2;
    const y2 = y + 40;
    gameCtx.fillText(turnText, x2, y2);


    roundTextTimer -= delta;
  }

  animationFrameId = requestAnimationFrame(gameDraw);
}

/* ======= RENDER ======= */
function drawFieldBackground(ctx2d, w, h){
  if(isSpriteReady(backgroundImg)){
    ctx2d.drawImage(backgroundImg, 0, 0, w, h);
  }
}

function drawNailEdges(ctx2d, w, h){
  const spacing = 20;
  const base = 4;
  const length = 8;

  ctx2d.fillStyle = "#555";
  ctx2d.strokeStyle = "#333";
  ctx2d.lineWidth = 1;

  const halfLine = ctx2d.lineWidth / 2;

  // top border nails
  for(let x = 0; x < w; x += spacing){
    const cx = x + spacing / 2;
    ctx2d.beginPath();
    ctx2d.moveTo(cx - base/2, halfLine);
    ctx2d.lineTo(cx + base/2, halfLine);
    ctx2d.lineTo(cx, length + halfLine);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
  }

  // bottom border nails
  for(let x = 0; x < w; x += spacing){
    const cx = x + spacing / 2;
    ctx2d.beginPath();
    ctx2d.moveTo(cx - base/2, h - halfLine);
    ctx2d.lineTo(cx + base/2, h - halfLine);
    ctx2d.lineTo(cx, h - length - halfLine);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
  }

  // left border nails
  for(let y = 0; y < h; y += spacing){
    const cy = y + spacing / 2;
    ctx2d.beginPath();
    ctx2d.moveTo(halfLine, cy - base/2);
    ctx2d.lineTo(halfLine, cy + base/2);
    ctx2d.lineTo(length + halfLine, cy);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
  }

  // right border nails
  for(let y = 0; y < h; y += spacing){
    const cy = y + spacing / 2;
    ctx2d.beginPath();
    ctx2d.moveTo(w - halfLine, cy - base/2);
    ctx2d.lineTo(w - halfLine, cy + base/2);
    ctx2d.lineTo(w - length - halfLine, cy);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.stroke();
  }
}

function drawBrickEdges(ctx2d, w, h){
  if(isSpriteReady(brickFrameImg)){
    ctx2d.drawImage(brickFrameImg, FIELD_LEFT, 0, FIELD_WIDTH, h);
  } else {
    const brickHeight = FIELD_BORDER_THICKNESS;
    ctx2d.save();
    ctx2d.translate(FIELD_LEFT, 0);

    ctx2d.save();
    ctx2d.translate(FIELD_WIDTH / 2, brickHeight / 2);
    drawBrickWall(ctx2d, FIELD_WIDTH, brickHeight);
    ctx2d.restore();

    ctx2d.save();
    ctx2d.translate(FIELD_WIDTH / 2, h - brickHeight / 2);
    drawBrickWall(ctx2d, FIELD_WIDTH, brickHeight);
    ctx2d.restore();

    ctx2d.save();
    ctx2d.translate(brickHeight / 2, h / 2);
    ctx2d.rotate(Math.PI / 2);
    drawBrickWall(ctx2d, h, brickHeight);
    ctx2d.restore();

    ctx2d.save();
    ctx2d.translate(FIELD_WIDTH - brickHeight / 2, h / 2);
    ctx2d.rotate(Math.PI / 2);
    drawBrickWall(ctx2d, h, brickHeight);
    ctx2d.restore();

    ctx2d.restore();
  }
}

function drawFieldEdges(ctx2d, w, h){
  if(settings.sharpEdges){
    drawNailEdges(ctx2d, w, h);
  } else {
    drawBrickEdges(ctx2d, w, h);
  }
}


function drawJetFlame(ctx2d, widthScale){
  if(widthScale <= 0) return;
  const BASE_SCALE = 1.5;
  ctx2d.save();
  ctx2d.translate(0, 15);
  ctx2d.scale(widthScale * BASE_SCALE, BASE_SCALE);
  ctx2d.translate(0, -15);

  const shimmer = (Math.sin(globalFrame * 0.02) + 1) / 2;
  const innerL = 70 + shimmer * 30; // 70%..100%
  const outerL = 45 + shimmer * 15; // 45%..60%
  const grad = ctx2d.createRadialGradient(0, 15, 0, 0, 15, 3.75);
  grad.addColorStop(0, `hsl(200, 100%, ${innerL}%)`);
  grad.addColorStop(1, `hsl(210, 100%, ${outerL}%)`);
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.moveTo(0, 15);
  ctx2d.quadraticCurveTo(3, 18, 0, 21);
  ctx2d.quadraticCurveTo(-3, 18, 0, 15);

  ctx2d.fill();
  ctx2d.restore();

}

function drawBlueJetFlame(ctx2d, scale){
  if(scale <= 0) return;
  ctx2d.save();
  ctx2d.translate(0, 15);
  ctx2d.scale(1, scale);
  ctx2d.translate(0, -15);
  const grad = ctx2d.createRadialGradient(0, 15, 0, 0, 15, 7.5);
  grad.addColorStop(0, "#a0e9ff");
  grad.addColorStop(1, "#0077ff");
  ctx2d.fillStyle = grad;
  ctx2d.beginPath();
  ctx2d.moveTo(0, 15);
  ctx2d.quadraticCurveTo(6, 21, 0, 27);
  ctx2d.quadraticCurveTo(-6, 21, 0, 15);
  ctx2d.fill();
  ctx2d.restore();


}

function drawDieselSmoke(ctx2d, scale){
  if(scale <= 0) return;

  const baseRadius = 5 * scale;
  ctx2d.save();
  ctx2d.translate(0, 19);
  ctx2d.scale(0.5, 1); // make smoke column narrower

  const puffs = 3;
  for(let i = 0; i < puffs; i++){
    const phase   = globalFrame * 0.2 - i; // wave moves away from the plane
    const flicker = 0.8 + 0.2 * Math.sin(phase);
    const radius  = baseRadius * (0.7 + 0.3 * Math.sin(phase * 0.7)) * flicker;
    const offsetX = Math.sin(phase) * baseRadius * 0.3;
    const offsetY =  i * baseRadius * 0.9;
    const alpha   = 1 - (i / (puffs - 1)) * 0.5; // fade to 50% transparency
    ctx2d.beginPath();
    ctx2d.globalAlpha = alpha;
    ctx2d.arc(offsetX, offsetY, radius, 0, Math.PI * 2);
    ctx2d.fillStyle = "#000";
    ctx2d.fill();
  }


  ctx2d.restore();
}

function drawWingTrails(ctx2d){
  ctx2d.strokeStyle = "rgba(255,255,255,0.8)";
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(12, 10);
  ctx2d.lineTo(22, 28);
  ctx2d.moveTo(-12, 10);
  ctx2d.lineTo(-22, 28);
  ctx2d.stroke();
}

function addPlaneShading(ctx2d){
  const grad = ctx2d.createRadialGradient(0, 0, 8, 0, 0, 18);
  grad.addColorStop(0, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx2d.save();
  ctx2d.globalCompositeOperation = "source-atop";
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(-20, -20, 40, 40);
  ctx2d.restore();
}

function addPlaneSilhouetteShading(ctx2d){
  const grad = ctx2d.createRadialGradient(0, 0, 8, 0, 0, 18);
  grad.addColorStop(0, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");

  ctx2d.save();
  tracePlaneSilhouettePath(ctx2d);
  ctx2d.clip();
  ctx2d.fillStyle = grad;
  ctx2d.fillRect(-20, -20, 40, 40);
  ctx2d.restore();
}

function tracePlaneSilhouettePath(ctx2d){
  ctx2d.beginPath();
  ctx2d.moveTo(0, -20);
  ctx2d.quadraticCurveTo(12, -5, 10, 10);
  ctx2d.quadraticCurveTo(6, 15, 0, 18);
  ctx2d.quadraticCurveTo(-6, 15, -10, 10);
  ctx2d.quadraticCurveTo(-12, -5, 0, -20);
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

  if (spriteReady) {
    ctx2d.globalCompositeOperation = "lighter";
    ctx2d.globalAlpha = 0.3 + 0.45 * blend;
    ctx2d.filter = `blur(${(2 + 4 * blend).toFixed(2)}px)`;

    const baseSize = 40;
    const scale = 1 + 0.18 * blend;
    const drawSize = baseSize * scale;
    const offset = -drawSize / 2;

    ctx2d.imageSmoothingEnabled = true;
    ctx2d.drawImage(spriteImg, offset, offset, drawSize, drawSize);
  } else {
    const highlightColor = colorWithAlpha(color, Math.min(1, glowStrength));
    const highlightFill = colorWithAlpha(
      color,
      Math.min(0.35, 0.15 + 0.25 * blend)
    );
    const baseBlur = color === "green" ? 22 : 18;
    const highlightBlur = baseBlur * Math.max(0.2, blend);

    ctx2d.globalCompositeOperation = "lighter";
    ctx2d.filter = "none";
    ctx2d.shadowColor = highlightColor;
    ctx2d.shadowBlur = highlightBlur;
    ctx2d.fillStyle = highlightFill;
    ctx2d.strokeStyle = highlightColor;
    ctx2d.lineWidth = 2.5;
    tracePlaneSilhouettePath(ctx2d);
    ctx2d.fill();
    ctx2d.stroke();
  }

  ctx2d.restore();
}


function drawThinPlane(ctx2d, plane, glow = 0) {
  const { x: cx, y: cy, color, angle } = plane;
  const isCrashedState = plane.burning && isExplosionFinished(plane);

  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.rotate(angle);
  ctx2d.scale(PLANE_SCALE, PLANE_SCALE);

  const blend = (isCrashedState || plane.burning || !plane.isAlive)
    ? 0
    : Math.max(0, Math.min(1, glow));

  if (blend > 0) {
    const glowStrength = blend * 1.25; // boost brightness slightly
    drawPlaneSpriteGlow(ctx2d, plane, glowStrength);
  }

  ctx2d.shadowColor = "transparent";
  ctx2d.shadowBlur = 0;
  ctx2d.filter = "none";

  const showEngine = !isCrashedState;
  if (isCrashedState) {
    ctx2d.globalAlpha = 0.85;
  }
  if (color === "blue") {
    if (showEngine) {
      const flicker = 1 + 0.05 * Math.sin(globalFrame * 0.1);
      drawJetFlame(ctx2d, flicker);

      const fp = flyingPoints.find(fp => fp.plane === plane);
      if (fp) {
        const progress = (FIELD_FLIGHT_DURATION_SEC - fp.timeLeft) / FIELD_FLIGHT_DURATION_SEC;
        const scale = progress < 0.75 ? 4 * progress : 12 * (1 - progress);
        drawBlueJetFlame(ctx2d, scale);

        drawWingTrails(ctx2d);
      }
    }
    const crashImgReady = isSpriteReady(bluePlaneWreckImg);
    const baseImgReady  = isSpriteReady(bluePlaneImg);
    if (isCrashedState) {
      if (crashImgReady) {
        ctx2d.drawImage(bluePlaneWreckImg, -20, -20, 40, 40);
      } else if (!plane._loggedMissingCrashSprite) {
        plane._loggedMissingCrashSprite = true;
        console.warn('[FX] Blue crash sprite is not ready, skipping render');
      }
    } else if (baseImgReady) {
      ctx2d.drawImage(bluePlaneImg, -20, -20, 40, 40);
      addPlaneShading(ctx2d);
    } else {
      drawPlaneOutline(ctx2d, color);
      addPlaneSilhouetteShading(ctx2d);
    }
  } else if (color === "green") {
    const fp = flyingPoints.find(fp => fp.plane === plane);
    if (showEngine) {
      if (fp) {
        const progress = (FIELD_FLIGHT_DURATION_SEC - fp.timeLeft) / FIELD_FLIGHT_DURATION_SEC;
        let scale;
        if (progress < 0.5) {
          scale = 4 - 4 * progress; // 20px -> 10px
        } else {
          scale = 3 - 2 * progress; // 10px -> 5px
        }
        drawDieselSmoke(ctx2d, scale);
      } else {
        drawDieselSmoke(ctx2d, 1);
      }
    }
    const crashImgReady = isSpriteReady(greenPlaneWreckImg);
    const baseImgReady  = isSpriteReady(greenPlaneImg);
    if (isCrashedState) {
      if (crashImgReady) {
        ctx2d.drawImage(greenPlaneWreckImg, -20, -20, 40, 40);
      } else if (!plane._loggedMissingCrashSprite) {
        plane._loggedMissingCrashSprite = true;
        console.warn('[FX] Green crash sprite is not ready, skipping render');
      }
    } else if (baseImgReady) {
      ctx2d.drawImage(greenPlaneImg, -20, -20, 40, 40);
      addPlaneShading(ctx2d);
    } else {
      drawPlaneOutline(ctx2d, color);
      addPlaneSilhouetteShading(ctx2d);
    }
  } else {
    drawPlaneOutline(ctx2d, color);
    if (!isCrashedState) {
      addPlaneSilhouetteShading(ctx2d);
    }
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
  ctx2d.lineWidth = 4 * PLANE_SCALE;
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

function isExplosionFinished(p){
  return p.explosionStart && (performance.now() - p.explosionStart >= EXPLOSION_DURATION_MS);
}

function drawMiniPlaneWithCross(ctx2d, x, y, plane, scale = 1, rotationRadians = 0) {
  ctx2d.save();
  ctx2d.translate(x, y);

  let effectiveRotation = Number.isFinite(rotationRadians)
    ? rotationRadians
    : Number.isFinite(plane?.angle)
      ? plane.angle
      : 0;

  if (effectiveRotation) {
    ctx2d.rotate(effectiveRotation);
  }

  const color = plane?.color || "blue";
  const isDestroyed = Boolean(plane && (!plane.isAlive || plane.burning));
  if (!isDestroyed && plane && plane.killMarkerStart) {
    delete plane.killMarkerStart;
  }

  const style = getHudPlaneStyle(color);
  const styleScale = Number.isFinite(style?.scale) && style.scale > 0 ? style.scale : 1;

  // Base size of the icon so it fits within the scoreboard cell
  const size = 16 * PLANE_SCALE * scale * MINI_PLANE_ICON_SCALE * styleScale;

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

  if (isDestroyed) {
    const crossProgress = getKillMarkerProgress(plane);
    if (crossProgress > 0) {
      drawRedCross(ctx2d, 0, 0, size * 0.8, crossProgress);
    }
  }

  ctx2d.restore();
}

function drawPlanesAndTrajectories(){
  resetCanvasState(planeCtx, planeCanvas);
  const rect = visualRect(gameCanvas);
  const scaleX = rect.width / gameCanvas.width;
  const scaleY = rect.height / gameCanvas.height;
  planeCtx.save();
  planeCtx.translate(rect.left, rect.top);
  planeCtx.scale(scaleX, scaleY);

  let rangeTextInfo = null;
  const activeColor = turnColors[turnIndex];
  const showGlow = !handleCircle.active && !flyingPoints.some(fp => fp.plane.color === activeColor);
  const destroyedOrBurning = [];
  const activePlanes = [];

  for (const point of points) {
    if (!point.isAlive || point.burning) {
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
    if(!p.isAlive && !p.burning) return;

    // Allow wreck sprites to render after explosions finish instead of exiting early.
    drawPlaneSegments(targetCtx, p);
    const glowTarget = showGlow && p.color === activeColor && p.isAlive && !p.burning ? 1 : 0;
    if(p.glow === undefined) p.glow = glowTarget;
    p.glow += (glowTarget - p.glow) * 0.1;
    drawThinPlane(targetCtx, p, p.glow);

    if(allowRangeLabel && handleCircle.active && handleCircle.pointRef === p){
      let vdx = handleCircle.shakyX - p.x;
      let vdy = handleCircle.shakyY - p.y;
      let vdist = Math.hypot(vdx, vdy);
      if(vdist > MAX_DRAG_DISTANCE){
        vdist = MAX_DRAG_DISTANCE;
      }
      const cells = (vdist / MAX_DRAG_DISTANCE) * rangeCells;
      const textX = p.x + POINT_RADIUS + 8;
      rangeTextInfo = { color: colorFor(p.color), cells, x: textX, y: p.y };
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
  };

  for(const p of destroyedOrBurning){
    renderPlane(p, gameCtx);
    ensurePlaneFlameFx(p);
  }

  for(const p of activePlanes){
    renderPlane(p, planeCtx, { allowRangeLabel: true });
  }

  updateAllPlaneFlameFxPositions();

  if(rangeTextInfo){
    planeCtx.save();
    planeCtx.globalAlpha = 1;
    planeCtx.font = "14px sans-serif";
    planeCtx.textAlign = "left";
    planeCtx.textBaseline = "middle";
    planeCtx.lineWidth = 2;
    planeCtx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    planeCtx.fillStyle = rangeTextInfo.color;
    const numText = rangeTextInfo.cells.toFixed(1);
    planeCtx.strokeText(numText, rangeTextInfo.x, rangeTextInfo.y - 8);
    planeCtx.fillText(numText, rangeTextInfo.x, rangeTextInfo.y - 8);
    planeCtx.strokeText("cells", rangeTextInfo.x, rangeTextInfo.y + 8);
    planeCtx.fillText("cells", rangeTextInfo.x, rangeTextInfo.y + 8);
    planeCtx.restore();
  }

  planeCtx.restore();
}

function drawBuildings(){
  for(const b of buildings){
    gameCtx.save();
    gameCtx.translate(b.x, b.y);
    drawBrickWall(gameCtx, b.width, b.height);
    gameCtx.restore();
  }
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

function drawFlags(){
  const centerX = FIELD_LEFT + FIELD_WIDTH / 2;
  const blueFlagY = getHomeRowY("blue");
  const greenFlagY = getHomeRowY("green");
  if(!blueFlagCarrier){
    drawFlag(gameCtx, centerX, blueFlagY, "blue");
  }
  if(!greenFlagCarrier){
    drawFlag(gameCtx, centerX, greenFlagY, "green");
  }
}


function drawAAUnits(){
  const now = performance.now();
  for(const aa of aaUnits){
    gameCtx.save();
    // draw fading trail
    for(const seg of aa.trail){
      const age = now - seg.time;

      const alpha = (1 - age/AA_TRAIL_MS) * 0.3;

      const trailAng = seg.angleDeg * Math.PI/180;

      gameCtx.save();
      gameCtx.translate(aa.x, aa.y);
      gameCtx.rotate(trailAng);

      // wider beam with fade across its width
      const width = 8;
      const grad = gameCtx.createLinearGradient(0, -width/2, 0, width/2);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, colorFor(aa.owner));
      grad.addColorStop(1, "rgba(0,0,0,0)");

      gameCtx.globalAlpha = alpha;
      gameCtx.strokeStyle = grad;
      gameCtx.lineWidth = width;
      gameCtx.lineCap = "round";
      gameCtx.beginPath();
      gameCtx.moveTo(0, 0);
      gameCtx.lineTo(aa.radius, 0);
      gameCtx.stroke();
      gameCtx.restore();
    }

    gameCtx.globalAlpha = 1;
    // radar sweep line with highlight
    const ang = aa.sweepAngleDeg * Math.PI/180;
    const endX = aa.x + Math.cos(ang) * aa.radius;
    const endY = aa.y + Math.sin(ang) * aa.radius;
    gameCtx.strokeStyle = colorFor(aa.owner);
    gameCtx.lineWidth = 2;
    gameCtx.lineCap = "round";
    gameCtx.beginPath();
    gameCtx.moveTo(aa.x, aa.y);
    gameCtx.lineTo(endX, endY);
    gameCtx.stroke();

    // inner translucent white highlight on sweep line
    gameCtx.globalAlpha = 0.5;
    gameCtx.strokeStyle = "white";
    gameCtx.lineWidth = 1;
    gameCtx.lineCap = "round";
    gameCtx.beginPath();
    gameCtx.moveTo(aa.x, aa.y);
    gameCtx.lineTo(endX, endY);
    gameCtx.stroke();

    gameCtx.globalAlpha = 1;

    // Anti-Aircraft center ring
    gameCtx.beginPath();
    gameCtx.fillStyle = colorFor(aa.owner);
    gameCtx.arc(aa.x, aa.y, 6, 0, Math.PI*2);
    gameCtx.fill();

    // inner white circle to add volume
    gameCtx.beginPath();
    gameCtx.fillStyle = "white";
    gameCtx.arc(aa.x, aa.y, 4, 0, Math.PI*2);
    gameCtx.fill();

    gameCtx.restore();
  }
}

function drawBrickWall(ctx, width, height){
  const brickWidth = 20;
  const brickHeight = 10;

  ctx.save();
  ctx.beginPath();
  ctx.rect(-width/2, -height/2, width, height);
  ctx.clip();

  ctx.fillStyle = '#B22222';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;

  for(let y = -height/2; y < height/2 + brickHeight; y += brickHeight){
    const row = Math.floor((y + height/2) / brickHeight);
    const offset = row % 2 === 0 ? 0 : brickWidth / 2;
    for(let x = -width/2 - brickWidth; x < width/2 + brickWidth; x += brickWidth){
      ctx.fillRect(x + offset, y, brickWidth, brickHeight);
      ctx.strokeRect(x + offset, y, brickWidth, brickHeight);
    }
  }

  ctx.restore();

  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-width/2, -height/2, width, height);
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

/* ======= HITS / VICTORY ======= */
function awardPoint(color){
  if(isGameOver) return;
  const scoringColor = color === "blue" ? "green" : "blue";
  addScore(scoringColor, 1);
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
      const collisionExplosionTimestamp = performance.now();
      p.explosionStart = collisionExplosionTimestamp;
      p.killMarkerStart = collisionExplosionTimestamp;

      try { spawnExplosion(p.collisionX, p.collisionY, p.color); }
      catch(e) { console.warn('[FX] spawnExplosion error', e); }
      schedulePlaneFlameFx(p);
      if(fp){
        fp.lastHitPlane = p;
        fp.lastHitCooldown = PLANE_HIT_COOLDOWN_SEC;
      }
      if(p.flagColor){
        const flagColor = p.flagColor;
        const stolenBy = flagColor === "blue" ? blueFlagStolenBy : greenFlagStolenBy;
        if(stolenBy){
          if(plane.color === flagColor){
            addScore(stolenBy, -1);
            addScore(flagColor, 1);
          } else {
            addScore(stolenBy, 1);
            addScore(flagColor, -1);
          }
        }
        plane.flagColor = flagColor;
        if(flagColor === "blue"){
          blueFlagCarrier = plane;
        } else {
          greenFlagCarrier = plane;
        }
        p.flagColor = null;
      }
      awardPoint(p.color);
      checkVictory();
      if(isGameOver) return;
    }
  }
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2){
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if(l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy){
  const v0x = cx - ax, v0y = cy - ay;
  const v1x = bx - ax, v1y = by - ay;
  const v2x = px - ax, v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return u >= 0 && v >= 0 && (u + v) <= 1;
}

function distanceToFlag(px, py, baseX, baseY){
  const topX = baseX;
  const topY = baseY - FLAG_POLE_HEIGHT;
  const tipX = baseX + FLAG_WIDTH;
  const tipY = topY + FLAG_HEIGHT / 2;
  const bottomFlagX = baseX;
  const bottomFlagY = topY + FLAG_HEIGHT;

  const poleDist = pointToSegmentDistance(px, py, baseX, baseY, topX, topY);
  if(poleDist === 0) return 0;

  const inTriangle = pointInTriangle(px, py, topX, topY, tipX, tipY, bottomFlagX, bottomFlagY);
  if(inTriangle) return 0;

  const triEdgeDist = Math.min(
    pointToSegmentDistance(px, py, topX, topY, tipX, tipY),
    pointToSegmentDistance(px, py, tipX, tipY, bottomFlagX, bottomFlagY),
    pointToSegmentDistance(px, py, bottomFlagX, bottomFlagY, topX, topY)
  );

  return Math.min(poleDist, triEdgeDist);
}

function handleFlagInteractions(plane){
  if(isGameOver) return;

  const centerX = FIELD_LEFT + FIELD_WIDTH / 2;
  const topY = getHomeRowY("blue");
  const bottomY = getHomeRowY("green");
  const flagRadius = POINT_RADIUS;
  if(!plane.flagColor){
    const enemyColor = plane.color === "green" ? "blue" : "green";
    const flagY = enemyColor === "blue" ? topY : bottomY;
    const dist = distanceToFlag(plane.x, plane.y, centerX, flagY);
    if(dist < flagRadius){
      plane.flagColor = enemyColor;
      if(enemyColor === "blue"){
        blueFlagCarrier = plane;
        blueFlagStolenBy = plane.color;
      } else {
        greenFlagCarrier = plane;
        greenFlagStolenBy = plane.color;
      }
      addScore(plane.color, 2);
    }
  } else {
    const ownFlagY = plane.color === "blue" ? topY : bottomY;
    const distOwn = distanceToFlag(plane.x, plane.y, centerX, ownFlagY);
    if(distOwn < flagRadius){
      if(plane.flagColor !== plane.color){
        addScore(plane.color, 3);
      } else {
        const stolenBy = plane.flagColor === "blue" ? blueFlagStolenBy : greenFlagStolenBy;
        if(stolenBy){
          addScore(stolenBy, -1);
          addScore(plane.color, 1);
        }
      }
      if(plane.flagColor === "blue"){
        blueFlagCarrier = null;
        blueFlagStolenBy = null;
      } else {
        greenFlagCarrier = null;
        greenFlagStolenBy = null;
      }
      plane.flagColor = null;
    }
  }
}
function checkVictory(){
  const greenAlive = points.filter(p=>p.isAlive && p.color==="green").length;
  const blueAlive  = points.filter(p=>p.isAlive && p.color==="blue").length;
  if(isGameOver) return;

  const canContinueSeries = blueScore < POINTS_TO_WIN && greenScore < POINTS_TO_WIN;

  if(greenAlive === 0){
    const options = canContinueSeries ? { roundTransitionDelay: MIN_ROUND_TRANSITION_DELAY_MS } : { showEndScreen: true };
    lockInWinner("blue", options);
  } else if(blueAlive === 0){
    const options = canContinueSeries ? { roundTransitionDelay: MIN_ROUND_TRANSITION_DELAY_MS } : { showEndScreen: true };
    lockInWinner("green", options);
  }
}

/* ======= SCOREBOARD ======= */

function drawStarsUI(ctx){
  if (!STAR_READY) return;

  const rect = visualRect(gameCanvas);
  const rawScaleX = rect.width / CANVAS_BASE_WIDTH;
  const rawScaleY = rect.height / CANVAS_BASE_HEIGHT;
  const sx = Number.isFinite(rawScaleX) && rawScaleX > 0 ? rawScaleX : 1;
  const sy = Number.isFinite(rawScaleY) && rawScaleY > 0 ? rawScaleY : sx;

  const scale = (typeof STAR_PIECE_SCALE !== 'undefined') ? STAR_PIECE_SCALE : 1;

  ctx.save();
  // На всякий случай сбрасываем висящие трансформации
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const now = performance.now();

  try {
    const colors = ["blue", "green"];
    for (const color of colors){
      const slots = STAR_STATE[color] || [];
      const placements = STAR_PLACEMENT[color];
      const images = STAR_IMAGES[color];
      const animRows = STAR_FRAGMENT_ANIMATIONS[color];

      if (!Array.isArray(placements) || !Array.isArray(images)) continue;

      for (let slotIdx = 0; slotIdx < placements.length; slotIdx++){
        const slot = slots[slotIdx];
        if (!slot || slot.size === 0) continue;

        for (let frag = 1; frag <= STAR_FRAGMENTS_PER_SLOT; frag++){
          // Проверяем наличие именно текущего фрагмента в Set,
          // чтобы не рисовать все пять позиций звезды при наличии только одного.
          const hasFragment = slot.has(frag);
          if (!hasFragment) continue;

          const pos = STAR_PLACEMENT[color]?.[slotIdx]?.[frag-1];
          if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number'){
            console.warn(`[STAR] no pos for ${color} slot ${slotIdx} frag ${frag}`);
            continue;
          }

          const slotImages = Array.isArray(images[slotIdx]) ? images[slotIdx] : [];
          const img = slotImages[frag - 1];
          if (!img || !img.complete || !img.naturalWidth || !img.naturalHeight){
            continue;
          }

          const animRow = Array.isArray(animRows) ? animRows[slotIdx] : null;
          const anim = Array.isArray(animRow) ? animRow[frag - 1] : null;
          let alpha = 1;

          if (anim){
            const delay = Number.isFinite(anim.delay) ? anim.delay : 0;
            const duration = Number.isFinite(anim.duration) && anim.duration > 0
              ? anim.duration
              : STAR_FRAGMENT_FADE_DURATION_MS;
            const start = Number.isFinite(anim.start) ? anim.start : now;
            const elapsed = now - start - delay;
            if (elapsed < 0){
              continue;
            }
            alpha = Math.max(0, Math.min(1, elapsed / duration));
            if (alpha <= 0){
              continue;
            }
          }

          const dstW = Math.round(img.naturalWidth * scale * sx);
          const dstH = Math.round(img.naturalHeight * scale * sy);

          const screenX = Math.round(pos.x * sx) + (BOARD_ORIGIN?.x || 0);
          const screenY = Math.round(pos.y * sy) + (BOARD_ORIGIN?.y || 0);

          const previousAlpha = ctx.globalAlpha;
          if (anim){
            ctx.globalAlpha = previousAlpha * alpha;
          }

          if (ctx.globalAlpha > 0){
            ctx.drawImage(img, screenX, screenY, dstW, dstH);
          }

          ctx.globalAlpha = previousAlpha;
        }
      }
    }
  } catch (err){
    console.warn('[STAR] drawStarsUI error:', err);
  } finally {
    ctx.restore();
  }
}

const PLANE_COUNTER_PADDING      = 2;
const PLANE_COUNTER_CONTAINERS   = {
  blue:  { left: 409, top: 406, right: 460, bottom: 696 },
  green: { left: 0,   top: 89,  right: 51,  bottom: 379 }
};

const SCORE_INK_DURATION_MS = 2600;
const MIN_ROUND_TRANSITION_DELAY_MS = (() => {
  const greenSlots = Array.isArray(STAR_PLACEMENT?.green) ? STAR_PLACEMENT.green.length : 0;
  const blueSlots = Array.isArray(STAR_PLACEMENT?.blue) ? STAR_PLACEMENT.blue.length : 0;
  const maxSlotCount = Math.max(greenSlots, blueSlots, 0);
  const rowCascadeDelay = Math.max(0, maxSlotCount - 1) * STAR_FRAGMENT_ROW_DELAY_MS;
  return SCORE_INK_DURATION_MS + STAR_FRAGMENT_FADE_DURATION_MS + rowCascadeDelay;
})();
const HUD_KILL_MARKER_DRAW_DURATION_MS = Math.max(400, SCORE_INK_DURATION_MS * 0.55);
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
    if (Number.isFinite(plane.explosionStart)) {
      start = plane.explosionStart;
    } else {
      start = now;
    }
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
const scoreInkQueues = {
  blue: [],
  green: []
};
const scoreInkActive = {
  blue: false,
  green: false
};
const activeScoreInkEntries = {
  blue: null,
  green: null
};

function refreshScoreInkAnchors(){
  for(const [color, host] of Object.entries(SCORE_COUNTER_ELEMENTS)){
    if(!(host instanceof HTMLElement)){
      continue;
    }

    const targetScore = activeScoreInkEntries[color]?.targetScore ?? getScoreForColor(color);
    setScoreInkAnchor(host, color, targetScore);
  }
}

function spawnScorePopup(color, delta, targetScore){
  if(delta <= 0) return;
  if(color !== "blue" && color !== "green") return;

  enqueueScoreInk(color, delta, targetScore);
}

function enqueueScoreInk(color, delta, targetScore){
  const queue = scoreInkQueues[color];
  if(!queue) return;

  queue.push({ delta, targetScore });
  if(!scoreInkActive[color]){
    processNextScoreInk(color);
  }
}

function processNextScoreInk(color){
  const queue = scoreInkQueues[color];
  if(!queue || queue.length === 0){
    scoreInkActive[color] = false;
    activeScoreInkEntries[color] = null;
    return;
  }

  scoreInkActive[color] = true;
  const entry = queue.shift();
  activeScoreInkEntries[color] = entry;
  showScoreInk(color, entry);
}

function getScoreForColor(color){
  return color === "blue" ? blueScore : greenScore;
}

function updatePendingStarTargets(color, targetScore){
  if(!Number.isFinite(targetScore)){
    return;
  }

  const queue = scoreInkQueues[color];
  if(Array.isArray(queue)){
    for(const entry of queue){
      if(entry && typeof entry === "object"){
        entry.targetScore = targetScore;
      }
    }
  }

  const activeEntry = activeScoreInkEntries[color];
  if(activeEntry && typeof activeEntry === "object"){
    activeEntry.targetScore = targetScore;
  }
}

function setScoreInkAnchor(host, color, targetScore){
  if(!(host instanceof HTMLElement)){
    return false;
  }

  const anchors = SCORE_COUNTER_INK_ANCHORS?.[color];
  const fragmentsPerSlot = STAR_FRAGMENTS_PER_SLOT;

  const cleanup = () => {
    host.style.removeProperty('--score-ink-left');
    host.style.removeProperty('--score-ink-top');
  };

  if(!Array.isArray(anchors) || anchors.length === 0 || !Number.isFinite(fragmentsPerSlot) || fragmentsPerSlot <= 0){
    cleanup();
    return false;
  }

  if(!Number.isFinite(targetScore) || targetScore <= 0){
    cleanup();
    return false;
  }

  const totalSlots = anchors.length;
  const totalFragments = totalSlots * fragmentsPerSlot;
  if(totalFragments <= 0){
    cleanup();
    return false;
  }

  const normalizedScore = Math.min(totalFragments, Math.max(1, Math.floor(targetScore)));
  const zeroBased = normalizedScore - 1;
  const slotIdx = Math.min(totalSlots - 1, Math.max(0, Math.floor(zeroBased / fragmentsPerSlot)));
  const anchor = anchors[slotIdx] || null;

  if(!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)){
    cleanup();
    return false;
  }

  const computed = window.getComputedStyle(host);
  let scale = Number.parseFloat(computed.getPropertyValue('--score-scale'));
  if(!Number.isFinite(scale) || scale <= 0){
    scale = 1;
  }

  let hostWidth = host.clientWidth;
  if(!Number.isFinite(hostWidth) || hostWidth <= 0){
    const computedWidth = Number.parseFloat(computed.width);
    if(Number.isFinite(computedWidth) && computedWidth > 0){
      hostWidth = computedWidth;
    } else {
      hostWidth = SCORE_COUNTER_BASE_SIZE.width * scale;
    }
  }

  let hostHeight = host.clientHeight;
  if(!Number.isFinite(hostHeight) || hostHeight <= 0){
    const computedHeight = Number.parseFloat(computed.height);
    if(Number.isFinite(computedHeight) && computedHeight > 0){
      hostHeight = computedHeight;
    } else {
      hostHeight = SCORE_COUNTER_BASE_SIZE.height * scale;
    }
  }

  let pxLeft = anchor.x;
  if(Number.isFinite(pxLeft) && pxLeft >= 0 && pxLeft <= 1){
    pxLeft = pxLeft * hostWidth;
  } else {
    pxLeft = pxLeft * scale;
  }

  let pxTop = anchor.y;
  if(Number.isFinite(pxTop) && pxTop >= 0 && pxTop <= 1){
    pxTop = pxTop * hostHeight;
  } else {
    pxTop = pxTop * scale;
  }

  pxLeft = clampScoreInkOffset(pxLeft, hostWidth);
  pxTop = clampScoreInkOffset(pxTop, hostHeight);

  if(Number.isFinite(pxLeft)){
    host.style.setProperty('--score-ink-left', `${pxLeft}px`);
  } else {
    host.style.removeProperty('--score-ink-left');
  }

  if(Number.isFinite(pxTop)){
    host.style.setProperty('--score-ink-top', `${pxTop}px`);
  } else {
    host.style.removeProperty('--score-ink-top');
  }

  return Number.isFinite(pxLeft) && Number.isFinite(pxTop);
}

function showScoreInk(color, entry){
  const delta = Number.isFinite(entry?.delta) ? entry.delta : 0;
  const resolveTargetScore = () => {
    if(entry && Number.isFinite(entry.targetScore)){
      return entry.targetScore;
    }
    return getScoreForColor(color);
  };

  if(delta <= 0){
    syncStarState(color, resolveTargetScore());
    scoreInkActive[color] = false;
    activeScoreInkEntries[color] = null;
    processNextScoreInk(color);
    return;
  }

  const host = SCORE_COUNTER_ELEMENTS[color];
  if(!host){
    scoreInkActive[color] = false;
    syncStarState(color, resolveTargetScore());
    activeScoreInkEntries[color] = null;
    processNextScoreInk(color);
    return;
  }

  const anchorTargetScore = resolveTargetScore();
  setScoreInkAnchor(host, color, anchorTargetScore);

  const ink = document.createElement("span");
  ink.className = "score-ink";
  ink.textContent = `+${delta}`;

  let cleared = false;
  const finalize = () => {
    if(cleared) return;
    cleared = true;
    syncStarState(color, resolveTargetScore());
    if(ink.parentNode === host){
      host.removeChild(ink);
    }
    scoreInkActive[color] = false;
    activeScoreInkEntries[color] = null;
    processNextScoreInk(color);
  };

  ink.addEventListener("animationend", finalize, { once: true });
  setTimeout(finalize, SCORE_INK_DURATION_MS);

  host.appendChild(ink);
}

function clearScoreCounters(){
  for(const key of Object.keys(SCORE_COUNTER_ELEMENTS)){
    const host = SCORE_COUNTER_ELEMENTS[key];
    if(host){
      host.textContent = "";
    }
    if(Array.isArray(scoreInkQueues[key])){
      scoreInkQueues[key].length = 0;
    }
    scoreInkActive[key] = false;
    activeScoreInkEntries[key] = null;
  }
}

function renderScoreboard(){
  updateTurnIndicators();
  // `drawPlanesAndTrajectories()` already clears the plane canvas every frame
  // before rendering the planes. Clearing it again here would erase the planes
  // that were just drawn, making them disappear. Draw the HUD on top of the
  // existing planes without clearing the canvas again.
  planeCtx.save();

  const rect = visualRect(gameCanvas);
  const rawScaleX = rect.width / CANVAS_BASE_WIDTH;
  const scaleX = Number.isFinite(rawScaleX) && rawScaleX > 0 ? rawScaleX : 1;
  const rawScaleY = rect.height / CANVAS_BASE_HEIGHT;
  const scaleY = Number.isFinite(rawScaleY) && rawScaleY > 0 ? rawScaleY : scaleX;
  const containerLeft = rect.left - FRAME_PADDING_X * scaleX;
  const containerTop = rect.top - FRAME_PADDING_Y * scaleY;
  const containerWidth = FRAME_BASE_WIDTH * scaleX;

  if (Number.isFinite(containerLeft) && Number.isFinite(containerTop)){
    BOARD_ORIGIN.x = Math.round(containerLeft);
    BOARD_ORIGIN.y = Math.round(containerTop);
  } else {
    BOARD_ORIGIN.x = 0;
    BOARD_ORIGIN.y = 0;
  }

  const blueHudFrame = buildPlaneCounterFrame('blue', containerLeft, containerTop, scaleX, scaleY);
  const greenHudFrame = buildPlaneCounterFrame('green', containerLeft, containerTop, scaleX, scaleY);

  if (blueHudFrame) {
    drawPlayerHUD(
      planeCtx,
      blueHudFrame,
      "blue",
      turnColors[turnIndex] === "blue"
    );
  }

  if (greenHudFrame) {
    drawPlayerHUD(
      planeCtx,
      greenHudFrame,
      "green",
      turnColors[turnIndex] === "green"
    );
  }

  drawStarsUI(planeCtx);

  planeCtx.restore();
}

function buildPlaneCounterFrame(color, containerLeft, containerTop, scaleX, scaleY) {
  const host = PLANE_COUNTER_HOSTS?.[color] || SCORE_COUNTER_ELEMENTS?.[color];
  if (host instanceof HTMLElement) {
    const rect = visualRect(host);
    const containerRect = visualRect(gameContainer);

    const containerScaleX = Number.isFinite(containerRect.width) && containerRect.width > 0
      ? containerRect.width / FRAME_BASE_WIDTH
      : scaleX;
    const containerScaleY = Number.isFinite(containerRect.height) && containerRect.height > 0
      ? containerRect.height / FRAME_BASE_HEIGHT
      : scaleY;

    const offsetLeft = Number.isFinite(rect.left) && Number.isFinite(containerRect.left)
      ? rect.left - containerRect.left
      : rect.left;
    const offsetTop = Number.isFinite(rect.top) && Number.isFinite(containerRect.top)
      ? rect.top - containerRect.top
      : rect.top;

    const baseLeft = Number.isFinite(containerScaleX) && containerScaleX > 0
      ? offsetLeft / containerScaleX
      : offsetLeft;
    const baseTop = Number.isFinite(containerScaleY) && containerScaleY > 0
      ? offsetTop / containerScaleY
      : offsetTop;

    const baseWidth = Number.isFinite(containerScaleX) && containerScaleX > 0
      ? rect.width / containerScaleX
      : rect.width;
    const baseHeight = Number.isFinite(containerScaleY) && containerScaleY > 0
      ? rect.height / containerScaleY
      : rect.height;

    const width = baseWidth * scaleX;
    const height = baseHeight * scaleY;
    const left = containerLeft + baseLeft * scaleX;
    const top = containerTop + baseTop * scaleY;

    const scaleFromCssX = width / SCORE_COUNTER_BASE_SIZE.width;
    const scaleFromCssY = height / SCORE_COUNTER_BASE_SIZE.height;

    if (
      Number.isFinite(left) &&
      Number.isFinite(top) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return {
        left,
        top,
        width,
        height,
        scaleX: Number.isFinite(scaleFromCssX) && scaleFromCssX > 0 ? scaleFromCssX : scaleX,
        scaleY: Number.isFinite(scaleFromCssY) && scaleFromCssY > 0 ? scaleFromCssY : scaleY
      };
    }
  }

  const spec = PLANE_COUNTER_CONTAINERS?.[color];
  if (!spec) return null;

  const width = (spec.right - spec.left) * scaleX;
  const height = (spec.bottom - spec.top) * scaleY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const left = containerLeft + spec.left * scaleX;
  const top = containerTop + spec.top * scaleY;
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }

  return { left, top, width, height, scaleX, scaleY };
}

function updateTurnIndicators(){
  const color = turnColors[turnIndex];
  const isBlueTurn = color === 'blue';
  // Top (mantis) mascot belongs to the blue player, bottom (goat) to green.
  mantisIndicator.classList.toggle('active', isBlueTurn);
  goatIndicator.classList.toggle('active', !isBlueTurn);
}

function drawPlayerHUD(ctx, frame, color, isTurn){
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

  const planes = points.filter(p => p.color === color);
  const maxPerRow = 4;

  const paddingX = PLANE_COUNTER_PADDING * scaleX;
  const paddingY = PLANE_COUNTER_PADDING * scaleY;
  const availableWidth = Math.max(0, width - paddingX * 2);
  const availableHeight = Math.max(0, height - paddingY * 2);

  const baseIconSize = 16 * PLANE_SCALE * MINI_PLANE_ICON_SCALE;
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

  const iconCount = Math.min(planes.length, maxPerRow);
  const stackDirection = color === 'green' ? -1 : 1;

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha *= HUD_PLANE_DIM_ALPHA;

  const centerX = paddingX + availableWidth / 2;

  for (let i = 0; i < iconCount; i++) {
    const plane = planes[i];
    const slotIndex = stackDirection === -1 ? (slots - 1 - i) : i;
    const centerY = paddingY + slotHeight * (slotIndex + 0.5);
    if (iconScale > 0) {
      drawMiniPlaneWithCross(ctx, centerX, centerY, plane, iconScale, 0);
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


/* Поля/здания */
const buildingTypes = ['rectangle', 'rectangle_double', 'rectangle_triple'];
const buildingColors = ['darkred'];
const buildingSize = {
  rectangle:        { width: 40,  height: 40 },
  rectangle_double: { width: 80,  height: 40 },
  rectangle_triple: { width: 120, height: 40 }
};

function generateRandomBuildingAligned(){
  const maxAttempts=20;
  let attempt=0;
  while(attempt<maxAttempts){
    const type = buildingTypes[Math.floor(Math.random()*buildingTypes.length)];
    const color= buildingColors[0];

    const width = buildingSize[type].width;
    const height= buildingSize[type].height;

    const x = FIELD_LEFT + getRandomGridAlignedCoordinate(FIELD_WIDTH,  width/2);
    const minY = 80; // избегаем зон самолётов
    const maxY = gameCanvas.height - 80;
    const y = minY + Math.random() * (maxY - minY - height);
    if(x===null || y===null){ attempt++; continue; }

    const b = { type, x, y, color, width, height };
    if(!isOverlappingWithPlanes(b) && !isOverlappingWithBuildings(b)){
      return b;
    }
    attempt++;
  }
  return null;
}
function getRandomGridAlignedCoordinate(max, halfSize){
  const positions = [];
  for(let coord=halfSize + CELL_SIZE; coord<=max - halfSize - CELL_SIZE; coord+=CELL_SIZE){
    positions.push(coord);
  }
  if(!positions.length) return null;
  return positions[Math.floor(Math.random()*positions.length)];
}
function isOverlappingWithPlanes(b){
  for(const p of points){
    if(!p.isAlive && !p.burning) continue;
    const closestX = clamp(p.x, b.x - b.width/2 - BUILDING_BUFFER/2, b.x + b.width/2 + BUILDING_BUFFER/2);
    const closestY = clamp(p.y, b.y - b.height/2- BUILDING_BUFFER/2, b.y + b.height/2 + BUILDING_BUFFER/2);
    const d = Math.hypot(p.x-closestX, p.y-closestY);
    if(d < (POINT_RADIUS + Math.min(b.width,b.height)/2 + BUILDING_BUFFER)) return true;
  }
  return false;
}
function isOverlappingWithBuildings(b){
  for(const o of buildings){
    if(Math.abs(b.x - o.x) < ((b.width + o.width)/2 + BUILDING_BUFFER) &&
       Math.abs(b.y - o.y) < ((b.height + o.height)/2 + BUILDING_BUFFER)){
      return true;
    }
  }
  return false;
}

/* ======= SCORE / ROUND ======= */
yesBtn.addEventListener("click", () => {
  const gameOver = blueScore >= POINTS_TO_WIN || greenScore >= POINTS_TO_WIN;
  if (gameOver) {
    blueScore = 0;
    greenScore = 0;
    syncAllStarStates();
    roundNumber = 0;
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
  modeMenuDiv.style.display="block";
  resetGame();
});

function startNewRound(){
  loadStarImagesIfNeeded();
  preloadPlaneSprites();
  restoreGameBackgroundAfterMenu();
  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }
  const shouldRandomize = !suppressAutoRandomMapForNextRound && shouldAutoRandomizeMap() && roundNumber > 0;
  if(shouldRandomize){
    if(settings.mapIndex !== RANDOM_MAP_SENTINEL_INDEX){
      setMapIndexAndPersist(getRandomPlayableMapIndex());
    }
    applyCurrentMap();
  }
  suppressAutoRandomMapForNextRound = false;
  cleanupGreenCrashFx();
  clearScoreCounters();
  endGameDiv.style.display = "none";
  isGameOver=false; winnerColor=null;
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;

  STAR_LAP = { blue: 0, green: 0 };
  STAR_POS = { blue: 0, green: 0 };
  STAR_PLACED_IN_LAP = { blue: 0, green: 0 };
  STAR_STATE.blue  = Array.from({length:5}, ()=> new Set());
  STAR_STATE.green = Array.from({length:5}, ()=> new Set());
  syncAllStarStates();

  lastFirstTurn = 1 - lastFirstTurn;
  turnIndex = lastFirstTurn;

  roundNumber++;
  roundTextTimer = 120;

  globalFrame=0;
  flyingPoints=[];
  hasShotThisRound=false;
  aaUnits = [];

  aiMoveScheduled = false;
  gameCanvas.style.display = "block";
  mantisIndicator.style.display = "block";
  goatIndicator.style.display = "block";
  planeCanvas.style.display = "block";

  setBackgroundImage('pics/background behind the canvas 5.png');

  initPoints(); // ориентации на базе
  blueFlagCarrier = null;
  greenFlagCarrier = null;
  blueFlagStolenBy = null;
  greenFlagStolenBy = null;
  renderScoreboard();
  if (settings.addAA) {
    phase = 'AA_PLACEMENT';
    currentPlacer = 'green';
  } else {
    phase = 'TURN';
  }
  if(animationFrameId===null) startGameLoop();
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
  settings.mapIndex = clampMapIndex(nextIndex);
  setStoredSetting('settings.mapIndex', String(settings.mapIndex));
}

function resetPlanePositionsForCurrentMap(){
  flyingPoints = [];
  hasShotThisRound = false;
  awaitingFlightResolution = false;
  aaUnits = [];

  blueFlagCarrier = null;
  greenFlagCarrier = null;
  blueFlagStolenBy = null;
  greenFlagStolenBy = null;

  points = [];
  initPoints();
}

function applyCurrentMap(upcomingRoundNumber){
  const targetRoundNumber = Number.isInteger(upcomingRoundNumber)
    ? upcomingRoundNumber
    : roundNumber + 1;
  const mapIndex = resolveMapIndexForGameplay(targetRoundNumber);
  const gameplayMap = MAPS[mapIndex] || MAPS[0];

  brickFrameImg.src = gameplayMap.file;
  rebuildBuildingsFromMap(gameplayMap);
  updateFieldDimensions();
  resetPlanePositionsForCurrentMap();
  renderScoreboard();
}

function getCollisionBuildings(map){
  const mapBuildings = Array.isArray(map?.buildings) ? map.buildings : [];
  if(mapBuildings.length){
    return mapBuildings;
  }

  if(map?.file?.startsWith('ui_controlpanel/')){
    return [];
  }

  if(Array.isArray(map?.previewBuildings)){
    return map.previewBuildings;
  }

  return [];
}

function rebuildBuildingsFromMap(map){
  const mapBuildings = getCollisionBuildings(map);
  buildings = mapBuildings
    .map(b => ({
      type: b.type || 'rectangle',
      color: b.color || 'darkred',
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height
    }))
    .filter(b => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height));
}

/* ======= CANVAS RESIZE ======= */
function resizeCanvas() {
  // Keep the game in portrait mode: if the device rotates to landscape,
  // attempt to re-lock orientation.  Do not skip resizing so the canvases
  // remain correctly sized even if the device starts in landscape.
  if(screen.orientation && screen.orientation.type.startsWith('landscape')){
    lockOrientation();
    // continue resizing instead of early returning
  }

  const viewportMetrics = VV();
  const viewportWidth = Math.max(1, viewportMetrics.width || window.innerWidth || 1);
  const viewportHeight = Math.max(1, viewportMetrics.height || window.innerHeight || 1);
  const offsetLeft = Number.isFinite(viewportMetrics.offsetLeft) ? viewportMetrics.offsetLeft : 0;
  const offsetTop = Number.isFinite(viewportMetrics.offsetTop) ? viewportMetrics.offsetTop : 0;

  const scale = Math.min(
    viewportWidth / FRAME_BASE_WIDTH,
    viewportHeight / FRAME_BASE_HEIGHT
  );

  const containerWidth = FRAME_BASE_WIDTH * scale;
  const containerHeight = FRAME_BASE_HEIGHT * scale;
  gameContainer.style.width = containerWidth + 'px';
  gameContainer.style.height = containerHeight + 'px';
  gameContainer.style.setProperty('--score-scale', scale);
  const centeredLeft = offsetLeft + (viewportWidth - containerWidth) / 2;
  const centeredTop = offsetTop + (viewportHeight - containerHeight) / 2;
  gameContainer.style.left = centeredLeft + 'px';
  gameContainer.style.top = centeredTop + 'px';
  syncBackgroundLayout(containerWidth, containerHeight, centeredLeft, centeredTop);
  const canvas = gameCanvas;
  canvas.style.width = CANVAS_BASE_WIDTH * scale + 'px';
  canvas.style.height = CANVAS_BASE_HEIGHT * scale + 'px';
  canvas.style.left = FRAME_PADDING_X * scale + 'px';
  canvas.style.top = FRAME_PADDING_Y * scale + 'px';
  canvas.width = CANVAS_BASE_WIDTH;
  canvas.height = CANVAS_BASE_HEIGHT;

  sizeAndAlignOverlays();

  [mantisIndicator, goatIndicator].forEach(ind => {
    ind.style.width = containerWidth + 'px';
    ind.style.height = FRAME_BASE_HEIGHT / 2 * scale + 'px';
    ind.style.backgroundSize = containerWidth + 'px ' + containerHeight + 'px';
  });
  mantisIndicator.style.top = '0px';
  goatIndicator.style.top = containerHeight / 2 + 'px';

  updateFieldDimensions();

  // Overlay canvases cover full screen for proper alignment
  const viewport = VV();
  const overlayViewportWidth = viewport.width;
  const overlayViewportHeight = viewport.height;
  const viewportScale = viewport.scale || 1;
  const overlayWidth = Math.max(1, Math.round(overlayViewportWidth * viewportScale));
  const overlayHeight = Math.max(1, Math.round(overlayViewportHeight * viewportScale));

  [aimCanvas, planeCanvas].forEach(overlay => {
    if (!overlay) return;
    overlay.width = overlayWidth;
    overlay.height = overlayHeight;
    overlay.style.width = overlayWidth + 'px';
    overlay.style.height = overlayHeight + 'px';
    overlay.style.left = '0px';
    overlay.style.top = '0px';
  });

  updateAllPlaneFlameFxPositions();

  // Переинициализируем самолёты
  if(points.length === 0) {
    initPoints();
  }

  refreshScoreInkAnchors();
}

window.addEventListener('resize', resizeCanvas);
if (window.visualViewport) {
  let pendingViewportResize = null;
  const scheduleViewportResize = () => {
    if (pendingViewportResize !== null) {
      return;
    }
    pendingViewportResize = requestAnimationFrame(() => {
      pendingViewportResize = null;
      resizeCanvas();
    });
  };

  window.visualViewport.addEventListener('resize', scheduleViewportResize);
  window.visualViewport.addEventListener('scroll', scheduleViewportResize);
}
// Lock orientation to portrait and prevent the canvas from redrawing on rotation
function lockOrientation(){
  if(screen.orientation && screen.orientation.lock){
    // Attempt to lock; ignore errors if the browser refuses
    screen.orientation.lock('portrait').catch(() => {});
  }
}

lockOrientation();
window.addEventListener('orientationchange', lockOrientation);

  /* ======= BOOTSTRAP ======= */
  async function bootstrapGame(){
    sizeAndAlignOverlays();
    resizeCanvas();
    resetGame();
  }

bootstrapGame();
