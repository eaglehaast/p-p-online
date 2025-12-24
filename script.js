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
const DEBUG_RENDER_INIT = false;
const DEBUG_AIM = false;
const DEBUG_PLANE_SHADING = false;

const bootTrace = {
  startTs: null,
  markers: [],
  resizeWindow: null
};

const loadingOverlay = document.getElementById("loadingOverlay");

document.documentElement.classList.toggle('debug-layout', DEBUG_LAYOUT);

const uiFrameEl = document.getElementById("uiFrame");
const menuLayer = document.getElementById("menuLayer");
const settingsLayer = document.getElementById("settingsLayer");
const gsFrameLayer = document.getElementById("gsFrame");
const gsFrameEl = document.getElementById("gameContainer");
const gameScreen = gsFrameLayer || document.getElementById("gameScreen") || gsFrameEl;
const gsBoardCanvas  = document.getElementById("gameCanvas");
const gsBoardCtx     = gsBoardCanvas.getContext("2d");

const aimCanvas   = document.getElementById("aimCanvas");
const aimCtx      = aimCanvas.getContext("2d");

const planeCanvas = document.getElementById("planeCanvas");
const planeCtx    = planeCanvas.getContext("2d");

const hudCanvas = document.getElementById("hudCanvas");
const hudCtx = hudCanvas instanceof HTMLCanvasElement ? hudCanvas.getContext("2d") : null;

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

function getCanvasDpr() {
  const RAW_DPR = window.devicePixelRatio || 1;
  const CANVAS_DPR = Math.min(RAW_DPR, 2);
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
  if (!(DEBUG_LAYOUT || DEBUG_RENDER_INIT)) return;
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
  ctx.restore();
}

function logPointerDebugEvent(event) {
  if (!(DEBUG_LAYOUT || DEBUG_RENDER_INIT)) return;
  const { clientX, clientY, x, y } = clientToBoard(event);
  pointerDebugState.lastPoint = { x, y };
  if (pointerDebugState.logged >= 3) return;
  pointerDebugState.logged += 1;
  console.log("[pointer-debug]", {
    index: pointerDebugState.logged,
    clientX,
    clientY,
    x,
    y
  });
}

function computeViewFromCanvas(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const { CANVAS_DPR } = getCanvasDpr();

  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const backingW = Math.max(1, canvas.width || 0);
  const backingH = Math.max(1, canvas.height || 0);

  const isBaseSize =
    Math.abs(cssW - CANVAS_BASE_WIDTH) < 0.01 &&
    Math.abs(cssH - CANVAS_BASE_HEIGHT) < 0.01;
  const backingMatchesCss =
    Math.abs(backingW - cssW) < 0.5 &&
    Math.abs(backingH - cssH) < 0.5;
  const useBackingStore = !backingMatchesCss && backingW > 0 && backingH > 0;
  const pxW = useBackingStore ? backingW : (isBaseSize ? CANVAS_BASE_WIDTH : Math.round(cssW * CANVAS_DPR));
  const pxH = useBackingStore ? backingH : (isBaseSize ? CANVAS_BASE_HEIGHT : Math.round(cssH * CANVAS_DPR));

  VIEW.dpr = useBackingStore ? pxW / cssW : (isBaseSize ? 1 : CANVAS_DPR);
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

  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const { CANVAS_DPR } = getCanvasDpr();
  const backingW = Math.max(1, Math.round(w * CANVAS_DPR));
  const backingH = Math.max(1, Math.round(h * CANVAS_DPR));

  if (canvas.width !== backingW) canvas.width = backingW;
  if (canvas.height !== backingH) canvas.height = backingH;
}

function applyViewTransform(ctx) {
  if (!ctx) return;
  ctx.setTransform(VIEW.scaleX, 0, 0, VIEW.scaleY, 0, 0);
}

function syncCanvasBackingStore(canvas) {
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const { CANVAS_DPR } = getCanvasDpr();

  const w = Math.max(1, Math.round(r.width * CANVAS_DPR));
  const h = Math.max(1, Math.round(r.height * CANVAS_DPR));

  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

function syncHudCanvasLayout() {
  if (!(hudCanvas instanceof HTMLCanvasElement)) return;
  hudCanvas.style.left = '0px';
  hudCanvas.style.top = '0px';
  hudCanvas.style.width = `${FRAME_BASE_WIDTH}px`;
  hudCanvas.style.height = `${FRAME_BASE_HEIGHT}px`;
  syncCanvasBackingStore(hudCanvas);
}

function syncAimCanvasLayout() {
  if (!(aimCanvas instanceof HTMLCanvasElement)) return;
  aimCanvas.style.left = '0px';
  aimCanvas.style.top = '0px';
  aimCanvas.style.width = `${FRAME_BASE_WIDTH}px`;
  aimCanvas.style.height = `${FRAME_BASE_HEIGHT}px`;
  syncCanvasBackingStore(aimCanvas);
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
const fxLayerElement = document.getElementById("fxLayer");

let OVERLAY_RESYNC_SCHEDULED = false;

const greenPointsPopup = document.getElementById("greenPointsPopup");
const bluePointsPopup  = document.getElementById("bluePointsPopup");
const greenPlaneCounter = document.getElementById("gs_planecounter_green");
const bluePlaneCounter  = document.getElementById("gs_planecounter_blue");

const BLUE_EXPLOSIONS = [
  'ui_gamescreen/explosions_blue/explosion_blue_1.gif',
  'ui_gamescreen/explosions_blue/explosion_blue_2.gif',
  'ui_gamescreen/explosions_blue/explosion_blue_3.gif',
  'ui_gamescreen/explosions_blue/explosion_blue_4.gif',
  'ui_gamescreen/explosions_blue/explosion_blue_5.gif'
];

const GREEN_EXPLOSIONS = [
  'ui_gamescreen/explosions_green/explosion_green_1.gif',
  'ui_gamescreen/explosions_green/explosion_green_2.gif',
  'ui_gamescreen/explosions_green/explosion_green_3.gif',
  'ui_gamescreen/explosions_green/explosion_green_4.gif',
  'ui_gamescreen/explosions_green/explosion_green_5.gif'
];

const ALL_EXPLOSION_SPRITES = [...BLUE_EXPLOSIONS, ...GREEN_EXPLOSIONS];
const DEBUG_EXPLOSION_ANCHOR = false;
const DEBUG_FX_EXPLOSION = false;
const EXPLOSION_DRAW_SIZE = 50;
const DEFAULT_EXPLOSION_FPS = 20;
const EXPLOSION_DRAW_LOG_THROTTLE_MS = 150;
const explosionFrameCache = new Map();
const activeExplosions = [];

const PRELOAD_IMAGE_URLS = [
  // Main menu
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

  "ui_gamescreen/maps/easy 1-2 round/map 1 - clear sky 3.png",

  // Explosion sprites
  ...ALL_EXPLOSION_SPRITES
];

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

function hideLoadingOverlay() {
  if (bootTrace.startTs !== null) {
    logBootStep("hideLoadingOverlay");
  }
  if (loadingOverlay) {
    loadingOverlay.classList.add("loading-overlay--hidden");
  }
}

const IMAGE_LOAD_TIMEOUT_MS = 8000;
const pendingImageLoads = new Set();

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

function preloadCriticalImages() {
  if (!loadingOverlay) {
    return Promise.resolve();
  }

  const MAX_OVERLAY_TIME_MS = 1000;
  const MIN_OVERLAY_TIME_MS = 200;
  const startTime = performance.now();

  loadingOverlay.classList.remove("loading-overlay--hidden");

  console.log("[PRELOAD] critical image list", PRELOAD_IMAGE_URLS);
  let pending = 0;
  let loaded = 0;
  let lastCompleted = null;

  const preloadTasks = PRELOAD_IMAGE_URLS.map(src => new Promise(resolve => {
    if (!src) {
      resolve();
      return;
    }
    const img = new Image();
    pending += 1;
    console.log("[PRELOAD] pending++", { pending, loaded, lastCompleted, url: src });
    trackImageLoad("criticalPreload", src, img);
    const done = () => {
      loaded += 1;
      lastCompleted = src;
      console.log("[PRELOAD] loaded++", { pending, loaded, lastCompleted });
      resolve();
    };
    img.onload = done;
    img.onerror = done;
    installImageWatch(img, src, "preloadCriticalImages");
    img.src = src;
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

const DEBUG_UI = false;

// Points Popup = transient floating points (+X), not match progress and not plane counters
const pointsPopupElements = {
  green: greenPointsPopup,
  blue: bluePointsPopup
};

// Plane Counters = HUD columns of destroyed planes (not score, not points)
const planeCounterHosts = {
  green: greenPlaneCounter,
  blue: bluePlaneCounter
};

const pointsPopupOffsets = {
  green: { x: 3,   y: 388 },
  blue:  { x: 413, y: 388 }
};

const pointsPopupBaseSize = { width: 45, height: 25 };
const pointsPopupAnchorRows = [0.1, 0.32, 0.54, 0.76, 0.9];
const pointsPopupAnchors = {
  green: pointsPopupAnchorRows.map(y => ({ x: 0.5, y })),
  blue: pointsPopupAnchorRows.map(y => ({ x: 0.5, y }))
};

const HUD_LAYOUT = {
  planeCounters: {
    blue: { x: 3, y: 97, width: 48, height: 287 },
    green: { x: 411, y: 416, width: 48, height: 287 }
  },
  matchProgress: {
    blue: { x: 411, y: 97, width: 48, height: 287 },
    green: { x: 3, y: 416, width: 48, height: 287 }
  },
  pointsPopups: {
    green: { x: 3, y: 388, width: 45, height: 25 },
    blue: { x: 413, y: 388, width: 45, height: 25 }
  }
};

function clampPointsPopupOffset(value, limit) {
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

function clientToWorld(point, rect = visualRect(gsBoardCanvas)) {
  const scaleX = rect.width !== 0 ? VIEW.pxW / rect.width : 1;
  const scaleY = rect.height !== 0 ? VIEW.pxH / rect.height : 1;
  return {
    x: (point.x - rect.left) * scaleX / VIEW.scaleX,
    y: (point.y - rect.top) * scaleY / VIEW.scaleY,
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
  const rect = target?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  const rectWidth = Number.isFinite(rect.width) && rect.width !== 0 ? rect.width : 1;
  const rectHeight = Number.isFinite(rect.height) && rect.height !== 0 ? rect.height : 1;
  const nx = (clientX - rect.left) / rectWidth;
  const ny = (clientY - rect.top) / rectHeight;
  const logicalWidth = target?.width ?? rectWidth * VIEW.dpr;
  const logicalHeight = target?.height ?? rectHeight * VIEW.dpr;

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
  const rect = gsBoardCanvas?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  const rectWidth = Number.isFinite(rect.width) && rect.width !== 0 ? rect.width : 1;
  const rectHeight = Number.isFinite(rect.height) && rect.height !== 0 ? rect.height : 1;
  const x_css = clientX - rect.left;
  const y_css = clientY - rect.top;
  const canvasScaleX = gsBoardCanvas?.width ? gsBoardCanvas.width / rectWidth : 1;
  const canvasScaleY = gsBoardCanvas?.height ? gsBoardCanvas.height / rectHeight : 1;
  const x_canvas = x_css * canvasScaleX;
  const y_canvas = y_css * canvasScaleY;
  const scaleX = Number.isFinite(VIEW.scaleX) && VIEW.scaleX !== 0 ? VIEW.scaleX : 1;
  const scaleY = Number.isFinite(VIEW.scaleY) && VIEW.scaleY !== 0 ? VIEW.scaleY : 1;
  const nx = x_css / rectWidth;
  const ny = y_css / rectHeight;

  return {
    clientX,
    clientY,
    rect,
    nx,
    ny,
    x_css,
    y_css,
    x: x_canvas / scaleX,
    y: y_canvas / scaleY
  };
}

function worldToOverlay(x, y, options = {}) {
  const { overlay = null, boardRect: providedBoardRect = null, overlayRect: providedOverlayRect = null } = options || {};
  const boardRect = providedBoardRect || getViewportAdjustedBoundingClientRect(gsBoardCanvas);
  const boardWidth = Number.isFinite(boardRect.width) && boardRect.width !== 0 ? boardRect.width : 1;
  const boardHeight = Number.isFinite(boardRect.height) && boardRect.height !== 0 ? boardRect.height : 1;
  const boardLeft = Number.isFinite(boardRect.left) ? boardRect.left : 0;
  const boardTop = Number.isFinite(boardRect.top) ? boardRect.top : 0;
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

function worldToGameCanvas(x, y, rect = visualRect(gsBoardCanvas)) {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const canvasWidth = WORLD.width;
  const canvasHeight = WORLD.height;
  const rectWidth = Number.isFinite(rect?.width) && rect.width !== 0 ? rect.width : null;
  const rectHeight = Number.isFinite(rect?.height) && rect.height !== 0 ? rect.height : null;
  const rectLeft = Number.isFinite(rect?.left) ? rect.left : 0;
  const rectTop = Number.isFinite(rect?.top) ? rect.top : 0;

  const inCanvasSpace = safeX >= 0 && safeX <= canvasWidth && safeY >= 0 && safeY <= canvasHeight;

  if (!rectWidth || !rectHeight || inCanvasSpace) {
    return { x: safeX, y: safeY, scaleX: 1, scaleY: 1, fromLayout: false };
  }

  const scaleX = canvasWidth / rectWidth;
  const scaleY = canvasHeight / rectHeight;

  return {
    x: (safeX - rectLeft) * scaleX,
    y: (safeY - rectTop) * scaleY,
    scaleX,
    scaleY,
    fromLayout: true,
    rect
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
  const { CANVAS_DPR } = getCanvasDpr();
  targetCanvas.style.position = 'absolute';
  targetCanvas.style.left = '0px';
  targetCanvas.style.top = '0px';
  targetCanvas.style.width = `${width}px`;
  targetCanvas.style.height = `${height}px`;

  const backingWidth = Math.max(1, Math.round(width * CANVAS_DPR));
  const backingHeight = Math.max(1, Math.round(height * CANVAS_DPR));

  if (targetCanvas.width !== backingWidth) targetCanvas.width = backingWidth;
  if (targetCanvas.height !== backingHeight) targetCanvas.height = backingHeight;
}

function sizeAndAlignOverlays() {
  if (!(overlayContainer instanceof HTMLElement)) {
    return;
  }

  const width = Math.max(1, Math.round(CANVAS_BASE_WIDTH));
  const height = Math.max(1, Math.round(CANVAS_BASE_HEIGHT));
  const left = CANVAS_OFFSET_X;
  const top = FRAME_PADDING_Y;

  overlayContainer.style.left = `${left}px`;
  overlayContainer.style.top = `${top}px`;
  overlayContainer.style.width = `${width}px`;
  overlayContainer.style.height = `${height}px`;
  overlayContainer.style.transform = "none";

  const rect = overlayContainer.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);

  syncOverlayCanvasToGameCanvas(planeCanvas, cssWidth, cssHeight);

  if (fxLayerElement instanceof HTMLElement) {
    fxLayerElement.style.width = `${width}px`;
    fxLayerElement.style.height = `${height}px`;
  }
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
    display
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

// Координаты matchProgressLayout даны в пикселях макета 460x800
const matchProgressIsMockup = true;

// Если фон/рамка рисуются со сдвигом, используем тот же сдвиг здесь
const BOARD_ORIGIN = { x: 0, y: 0 };

// ---- Explosion FX (GIF over canvas) ----

const EXPLOSION_DURATION_MS = 3000;   // delay before showing wreck FX
const EXPLOSION_HOST_CLASS = 'fx-explosion-host';
const EXPLOSION_HOST_SIZE = 50;
const EXPLOSION_HOST_MIN_SIZE = Math.max(FX_HOST_MIN_SIZE, 4);
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

let flameCycleIndex = 0;
let flameStyleRevision = 0;

function ensurePlaneFlameHost() {
  const parent = overlayContainer instanceof HTMLElement
    ? overlayContainer
    : (fxLayerElement instanceof HTMLElement ? fxLayerElement : null);
  if (!(parent instanceof HTMLElement)) {
    return null;
  }
  return ensureFxHost(parent, PLANE_FLAME_HOST_ID);
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

  const boardRect = getViewportAdjustedBoundingClientRect(gsBoardCanvas);
  const overlayRect = getViewportAdjustedBoundingClientRect(overlayContainer);
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

  const hostRect = getViewportAdjustedBoundingClientRect(host);
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

  return { boardRect: usableBoardRect, hostRect };
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
let warnedMissingPlaneFlameHost = false;

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

  if (isExplosionFinished(plane) && !planeFlameFx.has(plane)) {
    const timer = planeFlameTimers.get(plane);
    if (timer) {
      clearTimeout(timer);
      planeFlameTimers.delete(plane);
    }
    spawnBurningFlameFx(plane);
  }

}

function getExplosionSpritesForColor(color) {
  if (color === 'blue') {
    return BLUE_EXPLOSIONS;
  }
  if (color === 'green') {
    return GREEN_EXPLOSIONS;
  }
  return ALL_EXPLOSION_SPRITES;
}

function getExplosionSpritesForPlane(plane) {
  if (!plane) {
    return ALL_EXPLOSION_SPRITES;
  }

  return getExplosionSpritesForColor(plane.color);
}

function pickExplosionSprite(color) {
  const pool = getExplosionSpritesForColor(color);
  if (!Array.isArray(pool) || pool.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex] || null;
}

async function decodeExplosionFrames(sprite) {
  if (!sprite) return null;

  const cached = explosionFrameCache.get(sprite);
  if (cached) {
    return cached;
  }

  const loadPromise = (async () => {
    const response = await fetch(sprite);
    const blob = await response.blob();
    const frameData = {
      assetId: sprite,
      frames: [],
      frameCount: 0,
      frameW: EXPLOSION_DRAW_SIZE,
      frameH: EXPLOSION_DRAW_SIZE,
      frameDurationMs: Math.round(1000 / DEFAULT_EXPLOSION_FPS),
      fps: DEFAULT_EXPLOSION_FPS,
      totalDurationMs: 0,
      durations: [],
    };

    if (typeof ImageDecoder === 'undefined') {
      const fallbackImg = new Image();
      fallbackImg.src = sprite;
      if (fallbackImg.decode) {
        await fallbackImg.decode();
      } else {
        await new Promise((resolve, reject) => {
          fallbackImg.onload = resolve;
          fallbackImg.onerror = reject;
        });
      }
      frameData.frames.push(fallbackImg);
      frameData.frameCount = 1;
      frameData.frameW = fallbackImg.naturalWidth || EXPLOSION_DRAW_SIZE;
      frameData.frameH = fallbackImg.naturalHeight || EXPLOSION_DRAW_SIZE;
      frameData.totalDurationMs = frameData.frameDurationMs;
      return frameData;
    }

    const decoder = new ImageDecoder({ data: blob, type: blob.type || 'image/gif' });
    const track = decoder.tracks.selectedTrack ?? decoder.tracks.get(0);
    const frameCount = track?.frameCount ?? 1;
    let totalDuration = 0;

    for (let i = 0; i < frameCount; i++) {
      const { image, duration } = await decoder.decode({ frameIndex: i });
      const frameDurationMs = duration || Math.round(1000 / DEFAULT_EXPLOSION_FPS);
      const bitmapSource = typeof createImageBitmap === 'function' ? await createImageBitmap(image) : image;
      frameData.frames.push(bitmapSource);
      frameData.durations.push(frameDurationMs);
      totalDuration += frameDurationMs;
      frameData.frameW = image.displayWidth || image.codedWidth || frameData.frameW;
      frameData.frameH = image.displayHeight || image.codedHeight || frameData.frameH;
      if (bitmapSource !== image) {
        image.close?.();
      }
    }

    frameData.frameCount = frameData.frames.length;
    frameData.totalDurationMs = totalDuration;
    frameData.frameDurationMs = frameData.frameCount > 0 ? totalDuration / frameData.frameCount : frameData.frameDurationMs;
    frameData.fps = frameData.frameDurationMs > 0 ? 1000 / frameData.frameDurationMs : DEFAULT_EXPLOSION_FPS;
    return frameData;
  })();

  explosionFrameCache.set(sprite, loadPromise);
  return loadPromise;
}

function getExplosionDrawContext(preferredCtx) {
  const targetCtx = preferredCtx || gsBoardCtx;
  if (!targetCtx) {
    return null;
  }

  const canvas = targetCtx.canvas;
  const canvasMismatch = canvas && canvas !== gsBoardCanvas;
  if (canvasMismatch) {
    console.warn('[FX] Redirecting explosion draw to main game canvas', {
      requestedCanvasId: canvas.id,
      requestedCanvasClass: canvas.className,
      requestedSize: { width: canvas.width, height: canvas.height },
      mainCanvasSize: { width: gsBoardCanvas?.width, height: gsBoardCanvas?.height },
    });
  }

  return gsBoardCtx || targetCtx;
}

function logExplosionDraw(ctx, explosion) {
  if (!ctx || !DEBUG_FX_EXPLOSION) return;
  const canvas = ctx.canvas;
  console.log('[FX] Drawing explosion', {
    canvasId: canvas?.id,
    canvasClass: canvas?.className,
    canvasWidth: canvas?.width,
    canvasHeight: canvas?.height,
    x: explosion?.x,
    y: explosion?.y,
    sourceX: explosion?.sourceX,
    sourceY: explosion?.sourceY,
    mappedFromLayout: explosion?.sourceIsLayout,
    frameCount: explosion?.frameCount,
    frameW: explosion?.frameW,
    frameH: explosion?.frameH,
  });
}

function resolveExplosionCanvasPosition(explosion) {
  if (!explosion) {
    return { x: 0, y: 0 };
  }

  if (!explosion.sourceIsLayout) {
    return { x: explosion.x, y: explosion.y };
  }

  const mapped = worldToGameCanvas(explosion.sourceX, explosion.sourceY);
  explosion.x = mapped.x;
  explosion.y = mapped.y;
  explosion.sourceIsLayout = mapped.fromLayout;

  return { x: explosion.x, y: explosion.y };
}

function resolveExplosionHostPosition(explosion) {
  const overlayRect = getViewportAdjustedBoundingClientRect(overlayContainer);
  const scaleX = overlayRect?.width ? overlayRect.width / WORLD.width : 1;
  const scaleY = overlayRect?.height ? overlayRect.height / WORLD.height : 1;

  const hostLeft = (explosion?.x || 0) * scaleX - (EXPLOSION_HOST_SIZE / 2);
  const hostTop = (explosion?.y || 0) * scaleY - (EXPLOSION_HOST_SIZE / 2);

  return { left: hostLeft, top: hostTop };
}

function ensureExplosionHost(explosion) {
  const parent = fxLayerElement instanceof HTMLElement ? fxLayerElement : overlayContainer;
  if (!(parent instanceof HTMLElement)) {
    return null;
  }

  const position = resolveExplosionHostPosition(explosion);
  const hostId = `explosion-${Math.random().toString(16).slice(2)}`;
  const host = ensureFxHost(parent, hostId, {
    width: EXPLOSION_HOST_SIZE,
    height: EXPLOSION_HOST_SIZE,
    fillParent: false,
    left: position.left,
    top: position.top,
    display: 'block'
  });

  if (!(host instanceof HTMLElement)) {
    return null;
  }

  host.classList.add(EXPLOSION_HOST_CLASS);

  const hostRect = host.getBoundingClientRect?.();
  if (!hostRect || hostRect.width < EXPLOSION_HOST_MIN_SIZE || hostRect.height < EXPLOSION_HOST_MIN_SIZE) {
    host.remove();
    return null;
  }

  return host;
}

function disposeExplosionHost(explosion) {
  const host = explosion?.host;
  if (!(host instanceof HTMLElement)) {
    return;
  }

  host.style.display = 'none';
  host.remove();
  explosion.host = null;
}

function clearExplosionFx() {
  for (const explosion of activeExplosions) {
    disposeExplosionHost(explosion);
  }
  activeExplosions.length = 0;
}

function logExplosionDebug(event, payload = {}) {
  if (!DEBUG_FX_EXPLOSION) return;
  console.log(`[FX][EXPLOSION] ${event}`, {
    activeCount: activeExplosions.length,
    ...payload,
  });
}

function spawnExplosion(x, y, plane) {
  const color = plane?.color === 'green' ? 'green' : 'blue';
  const sprite = pickExplosionSprite(color) || pickExplosionSprite();
  if (!sprite) {
    return;
  }
  const mappedCoords = worldToGameCanvas(x, y);

  const explosion = {
    x: mappedCoords.x,
    y: mappedCoords.y,
    sourceX: x,
    sourceY: y,
    sourceIsLayout: mappedCoords.fromLayout,
    imgEl: img,
    startedAt: null,
    duration: EXPLOSION_DURATION_MS,
    size: EXPLOSION_DRAW_SIZE,
    w: EXPLOSION_DRAW_SIZE,
    h: EXPLOSION_DRAW_SIZE,
    ready: false,
    host: null,
    lastDrawLog: 0,
  };

  explosion.host = ensureExplosionHost(explosion);

  const finalizeSpawn = () => {
    if (explosion.ready) return;
    explosion.ready = true;
    explosion.startedAt = performance.now();
    explosion.w = img.naturalWidth || EXPLOSION_DRAW_SIZE;
    explosion.h = img.naturalHeight || EXPLOSION_DRAW_SIZE;
    activeExplosions.push(explosion);
    logExplosionDebug('created', { sprite, startedAt: explosion.startedAt });
  };

  const handleError = (event) => {
    console.warn('[FX] Explosion sprite failed to load', { sprite, event });
    disposeExplosionHost(explosion);
  };

  if (img.complete && img.naturalWidth > 0) {
    finalizeSpawn();
    return;
  }

      if (!frameData.frameCount || !Array.isArray(frameData.frames) || frameData.frames.length === 0) {
        disposeExplosionHost(explosion);
        return;
      }

      explosion.frames = frameData.frames;
      explosion.frameCount = frameData.frameCount;
      explosion.frameW = frameData.frameW || EXPLOSION_DRAW_SIZE;
      explosion.frameH = frameData.frameH || EXPLOSION_DRAW_SIZE;
      explosion.frameDurationMs = frameData.frameDurationMs || explosion.frameDurationMs;
      explosion.fps = frameData.fps || explosion.fps;
      explosion.startMs = performance.now();
      explosion.ready = true;
      activeExplosions.push(explosion);
      logExplosionDebug('spawn', { assetId: sprite, frameCount: explosion.frameCount, fps: explosion.fps });
    })
    .catch((error) => {
      console.warn('[FX] Explosion sprite failed to load', { sprite, error });
      disposeExplosionHost(explosion);
    });
}

function updateAndDrawExplosions(ctx) {
  const targetCtx = getExplosionDrawContext(ctx);
  if (!targetCtx || activeExplosions.length === 0) {
    return;
  }

  const now = performance.now();

  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const explosion = activeExplosions[i];

    if (!explosion || now - explosion.startedAt > (explosion.duration || EXPLOSION_DURATION_MS)) {
      disposeExplosionHost(explosion);
      activeExplosions.splice(i, 1);
      logExplosionDebug('removed', { elapsed: explosion ? now - explosion.startedAt : null });
      continue;
    }

    if (!explosion.imgEl || !explosion.ready || !explosion.imgEl.complete || explosion.imgEl.naturalWidth === 0) {
      continue;
    }

    const { x: canvasX, y: canvasY } = resolveExplosionCanvasPosition(explosion);

    const drawScale = explosion.scale || 1;
    const drawW = (explosion.frameW || EXPLOSION_DRAW_SIZE) * drawScale;
    const drawH = (explosion.frameH || EXPLOSION_DRAW_SIZE) * drawScale;
    const drawX = canvasX - drawW / 2;
    const drawY = canvasY - drawH / 2;

    const frameToDraw = explosion.frames[frameIndex];
    if (!frameToDraw) {
      continue;
    }

    if (DEBUG_FX_EXPLOSION && now - (explosion.lastDrawLog || 0) >= EXPLOSION_DRAW_LOG_THROTTLE_MS) {
      logExplosionDraw(targetCtx, explosion);
      logExplosionDebug('draw', { frameIndex, assetId: explosion.assetId });
      explosion.lastDrawLog = now;
    }

    targetCtx.save();
    targetCtx.globalAlpha = 1;
    targetCtx.globalCompositeOperation = 'source-over';
    targetCtx.drawImage(explosion.imgEl, drawX, drawY, drawSize, drawSize);

    if (DEBUG_EXPLOSION_ANCHOR) {
      targetCtx.strokeStyle = 'magenta';
      targetCtx.lineWidth = 1;
      targetCtx.beginPath();
      targetCtx.moveTo(canvasX - 6, canvasY);
      targetCtx.lineTo(canvasX + 6, canvasY);
      targetCtx.moveTo(canvasX, canvasY - 6);
      targetCtx.lineTo(canvasX, canvasY + 6);
      targetCtx.stroke();
    }

    targetCtx.restore();
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

const playBtn     = document.getElementById("playBtn");

const classicRulesBtn     = document.getElementById("classicRulesBtn");
const advancedSettingsBtn = document.getElementById("advancedSettingsBtn");

let selectedMode = null;
let selectedRuleset = "classic";

let menuBackgroundSnapshot = null;
let hasActivatedGameScreen = false;
let needsGameScreenSync = false;
let menuScreenLocked = false;

function getGameCanvasMetrics() {
  const rect = gsBoardCanvas?.getBoundingClientRect?.();
  const { RAW_DPR, CANVAS_DPR } = getCanvasDpr();
  return {
    css: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : "unknown",
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
  sizeAndAlignOverlays();
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
  if (menuScreenLocked) {
    console.warn('[screen] Settings visibility request ignored because gameplay is active.');
    return;
  }

  setLayerVisibility(menuScreen, false);
  window.paperWingsSettings?.onMenuHide?.();
  setLayerVisibility(gsFrameLayer, false);
  setLayerVisibility(settingsLayer, true);
  setScreenMode('SETTINGS');
  window.paperWingsSettings?.onShow?.();
}

function showMenuLayer() {
  if (menuScreenLocked) {
    console.warn('[screen] Menu visibility request ignored because gameplay is active.');
    return;
  }

  setLayerVisibility(settingsLayer, false);
  window.paperWingsSettings?.onHide?.();
  setLayerVisibility(gsFrameLayer, false);
  setLayerVisibility(menuScreen, true);
  setScreenMode('MENU');
  window.paperWingsSettings?.onMenuShow?.();
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
  window.paperWingsSettings?.onMenuHide?.();
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
      container: gsFrameEl.style.backgroundImage
    };
  }

  gsFrameEl.style.backgroundImage = 'none';
}

function restoreGameBackgroundAfterMenu() {
  if (!menuBackgroundSnapshot) return;

  gsFrameEl.style.backgroundImage = menuBackgroundSnapshot.container;

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
  trackImageLoad("planeSprites", PLANE_ASSET_PATHS.blue, bluePlaneImg);
  bluePlaneImg.src = PLANE_ASSET_PATHS.blue;
  installImageWatch(bluePlaneImg, PLANE_ASSET_PATHS.blue, "preloadPlaneSprites.blue");

  greenPlaneImg = new Image();
  trackImageLoad("planeSprites", PLANE_ASSET_PATHS.green, greenPlaneImg);
  greenPlaneImg.src = PLANE_ASSET_PATHS.green;
  installImageWatch(greenPlaneImg, PLANE_ASSET_PATHS.green, "preloadPlaneSprites.green");

  blueCounterPlaneImg = new Image();
  trackImageLoad("planeSprites", PLANE_ASSET_PATHS.blueCounter, blueCounterPlaneImg);
  blueCounterPlaneImg.src = PLANE_ASSET_PATHS.blueCounter;
  installImageWatch(blueCounterPlaneImg, PLANE_ASSET_PATHS.blueCounter, "preloadPlaneSprites.blueCounter");

  greenCounterPlaneImg = new Image();
  trackImageLoad("planeSprites", PLANE_ASSET_PATHS.greenCounter, greenCounterPlaneImg);
  greenCounterPlaneImg.src = PLANE_ASSET_PATHS.greenCounter;
  installImageWatch(greenCounterPlaneImg, PLANE_ASSET_PATHS.greenCounter, "preloadPlaneSprites.greenCounter");

  bluePlaneWreckImg = new Image();
  bluePlaneWreckImg.decoding = 'async';
  trackImageLoad("planeSprites", PLANE_ASSET_PATHS.blueWreck, bluePlaneWreckImg);
  bluePlaneWreckImg.src = PLANE_ASSET_PATHS.blueWreck;
  installImageWatch(bluePlaneWreckImg, PLANE_ASSET_PATHS.blueWreck, "preloadPlaneSprites.blueWreck");
  if (typeof bluePlaneWreckImg.decode === 'function') {
    bluePlaneWreckImg.decode().catch(() => {});
  }

  greenPlaneWreckImg = new Image();
  greenPlaneWreckImg.decoding = 'async';
  trackImageLoad("planeSprites", PLANE_ASSET_PATHS.greenWreck, greenPlaneWreckImg);
  greenPlaneWreckImg.src = PLANE_ASSET_PATHS.greenWreck;
  installImageWatch(greenPlaneWreckImg, PLANE_ASSET_PATHS.greenWreck, "preloadPlaneSprites.greenWreck");
  if (typeof greenPlaneWreckImg.decode === 'function') {
    greenPlaneWreckImg.decode().catch(() => {});
  }

  planeSpritesPreloaded = true;
}
const flameImages = new Map();
for (const src of BURNING_FLAME_SRCS) {
  const img = new Image();
  img.decoding = 'async';
  trackImageLoad("flameImages", src, img);
  img.src = src;
  installImageWatch(img, src, "flameImages");
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
backgroundImg.addEventListener("load", () => {
  console.log("[IMG] load", { label: "backgroundImg", url: backgroundImg.src });
});
backgroundImg.addEventListener("error", (event) => {
  console.warn("[IMG] error", { label: "backgroundImg", url: backgroundImg.src, event });
});
backgroundImg.src = "background paper 1.png";
installImageWatch(backgroundImg, "background paper 1.png", "backgroundImg");

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
  gsFrameEl.style.backgroundSize = repeatedSize;

  const containerPosition = duplicateBackgroundValue('center top');
  gsFrameEl.style.backgroundPosition = containerPosition;
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
    gsFrameEl.style.backgroundImage = 'none';
    return;
  }

  currentBackgroundLayerCount = normalizedLayers.length;
  const backgroundValue = normalizedLayers.join(', ');
  gsFrameEl.style.backgroundImage = backgroundValue;

  const rect = gsFrameEl.getBoundingClientRect();
  syncBackgroundLayout(rect.width, rect.height);
}
const CANVAS_BASE_WIDTH = 360;
const CANVAS_BASE_HEIGHT = 640;
const FRAME_PADDING_X = 50;
const FRAME_PADDING_Y = 80;
const CANVAS_OFFSET_X = 51;
const FRAME_BASE_WIDTH = CANVAS_BASE_WIDTH + FRAME_PADDING_X * 2; // 460
const FRAME_BASE_HEIGHT = CANVAS_BASE_HEIGHT + FRAME_PADDING_Y * 2; // 800
const FIELD_BORDER_THICKNESS = 10; // px, width of brick frame edges

if (typeof window.matchProgressReady === 'undefined') window.matchProgressReady = false;

const brickFrameImg = new Image();
let brickFrameData = null;
brickFrameImg.addEventListener("load", () => {
  console.log("[IMG] load", { label: "brickFrameImg", url: brickFrameImg.src });
});
brickFrameImg.addEventListener("error", (event) => {
  console.warn("[IMG] error", { label: "brickFrameImg", url: brickFrameImg.src, event });
});

let FIELD_LEFT = 0;
let FIELD_WIDTH = 0;

// Sprite used for the aiming arrow
const arrowSprite = new Image();
arrowSprite.addEventListener("load", () => {
  console.log("[IMG] load", { label: "arrowSprite", url: arrowSprite.src });
});
arrowSprite.addEventListener("error", (event) => {
  console.warn("[IMG] error", { label: "arrowSprite", url: arrowSprite.src, event });
});
// Use the PNG sprite that contains the arrow graphics
arrowSprite.src = "sprite_ copy.png";
installImageWatch(arrowSprite, "sprite_ copy.png", "arrowSprite");



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
    const scaleY = WORLD.height / brickFrameImg.naturalHeight;
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
  const imgY = Math.floor(y / WORLD.height * brickFrameData.height);
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
    FIELD_WIDTH = WORLD.height * aspect;
    FIELD_LEFT = (WORLD.width - FIELD_WIDTH) / 2;
  } else {
    FIELD_LEFT = 0;
    FIELD_WIDTH = WORLD.width;
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



  if (typeof window.rangeCells === 'undefined') {
    window.rangeCells = undefined;
  }
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
      logCanvasCreation(tempCanvas, 'mapPreviewExtraction');
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const runs = extractOpaqueRunsFromImageData(imageData);
      resolve(mergeRunsIntoRects(runs));
    };
    img.onerror = () => resolve([]);
    installImageWatch(img, src, "previewBuildings");
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
    window.rangeCells = Number.isNaN(fr) ? 15 : fr;
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
    window.rangeCells = Math.min(MAX_FLIGHT_RANGE_CELLS,
                               Math.max(MIN_FLIGHT_RANGE_CELLS, window.rangeCells));
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

const defaultMatchProgressFragmentSources = {
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

const matchProgressFragmentSources = (typeof window !== "undefined" && window.matchProgressFragmentSources)
  ? window.matchProgressFragmentSources
  : defaultMatchProgressFragmentSources;


function collectMatchProgressFragmentSources(sources) {
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

const matchProgressFragmentsPerSlot = 5;

// Точные top-left координаты КАЖДОГО фрагмента (макет 460x800)
// Порядок: [звезда 1..5][фрагмент 1..5] = {x, y}
const matchProgressLayout = {
  green: [
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 3, y: 416 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 3, y: 476 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 3, y: 533 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 3, y: 593 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 3, y: 653 }))
  ],
  blue: [
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 411, y: 97 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 411, y: 157 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 411, y: 217 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 411, y: 277 })),
    Array.from({ length: matchProgressFragmentsPerSlot }, () => ({ x: 411, y: 335 }))
  ]
};


function getMatchProgressBounds(color){
  const placements = matchProgressLayout?.[color];
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


// Состояние слотов: прогресс матча по пять слотов на сторону
// (визуализируются звёздами, каждая звезда = до 5 фрагментов)
// Match Progress = visual progress of the round (stars), not score and not points
const matchProgressState = {
  blue:  Array.from({length:5}, ()=> new Set()),
  green: Array.from({length:5}, ()=> new Set())
};

let matchProgressLap = { blue: 0, green: 0 };
let matchProgressPos = { blue: 0, green: 0 };
let matchProgressPlacedInLap = { blue: 0, green: 0 };

const matchProgressFragmentFadeDurationMs = 620;
const matchProgressFragmentRowDelayMs = 70;

const matchProgressFragmentAnimations = {
  blue: [],
  green: []
};

function ensureMatchProgressAnimationState(color){
  const slots = Array.isArray(matchProgressLayout?.[color]) ? matchProgressLayout[color].length : 0;
  if (!Array.isArray(matchProgressFragmentAnimations[color])){
    matchProgressFragmentAnimations[color] = [];
  }

  const storage = matchProgressFragmentAnimations[color];

  while (storage.length < slots){
    storage.push(Array.from({ length: matchProgressFragmentsPerSlot }, () => null));
  }

  if (storage.length > slots){
    storage.length = slots;
  }

  for (let i = 0; i < storage.length; i += 1){
    const row = storage[i];
    if (!Array.isArray(row)){
      storage[i] = Array.from({ length: matchProgressFragmentsPerSlot }, () => null);
      continue;
    }

    if (row.length < matchProgressFragmentsPerSlot){
      row.length = matchProgressFragmentsPerSlot;
    }

    for (let j = 0; j < row.length; j += 1){
      if (typeof row[j] === "undefined"){
        row[j] = null;
      }
    }
  }

  return storage;
}

function matchProgressFragmentDelay(color, slotIdx){
  const slots = Array.isArray(matchProgressLayout?.[color]) ? matchProgressLayout[color].length : 0;
  if (slots <= 1){
    return 0;
  }
  const step = matchProgressFragmentRowDelayMs;
  if (color === "blue"){
    return (slots - 1 - slotIdx) * step;
  }
  return slotIdx * step;
}

function applyMatchProgressFragmentAnimations(color, previousState){
  const slots = matchProgressState[color];
  if (!Array.isArray(slots)) return;

  const animStorage = ensureMatchProgressAnimationState(color);
  const now = performance.now();

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx += 1){
    const newPieces = slots[slotIdx] || new Set();
    const prevPieces = Array.isArray(previousState) ? previousState[slotIdx] || new Set() : new Set();
    const animRow = animStorage[slotIdx];

    for (let frag = 1; frag <= matchProgressFragmentsPerSlot; frag += 1){
      const fragIdx = frag - 1;
      const hasNow = newPieces.has(frag);
      const hadBefore = prevPieces instanceof Set ? prevPieces.has(frag) : false;

      if (hasNow){
        if (!hadBefore){
          animRow[fragIdx] = {
            start: now,
            delay: matchProgressFragmentDelay(color, slotIdx),
            duration: matchProgressFragmentFadeDurationMs
          };
        } else if (!animRow[fragIdx]){
          animRow[fragIdx] = {
            start: now - matchProgressFragmentFadeDurationMs,
            delay: 0,
            duration: matchProgressFragmentFadeDurationMs
          };
        }
      } else {
        animRow[fragIdx] = null;
      }
    }
  }
}

ensureMatchProgressAnimationState("blue");
ensureMatchProgressAnimationState("green");

const matchProgressImages = {
  blue: [],
  green: []
};

let pendingMatchProgressImages = 0;
let matchProgressAssetsInitialized = false;
let matchProgressImagesRequested = false;
let lastMatchProgressCompleted = null;

function finalizeMatchProgressLoading(){
  if (matchProgressAssetsInitialized) return;
  matchProgressAssetsInitialized = true;
  window.matchProgressReady = true;
  console.log("[MATCH_PROGRESS] shards loaded");
  syncAllMatchProgressStates();
  if (typeof renderScoreboard === "function"){
    renderScoreboard();
  }
}

function handleMatchProgressAssetLoaded(){
  pendingMatchProgressImages = Math.max(0, pendingMatchProgressImages - 1);
  if (pendingMatchProgressImages === 0){
    finalizeMatchProgressLoading();
  }
}

function registerMatchProgressShardImage(src){
  if (src instanceof String) src = src.valueOf();
  if (typeof src !== "string"){
    return null;
  }
  const trimmed = src.trim();
  if (!trimmed){
    return null;
  }
  const img = new Image();
  pendingMatchProgressImages += 1;
  console.log("[MATCH_PROGRESS] shard pending", { pendingMatchProgressImages, lastCompleted: lastMatchProgressCompleted, src: trimmed });
  img.onload = () => {
    lastMatchProgressCompleted = trimmed;
    handleMatchProgressAssetLoaded();
    console.log("[MATCH_PROGRESS] shard load", { pendingMatchProgressImages, lastCompleted: lastMatchProgressCompleted });
  };
  img.onerror = (event) => {
    lastMatchProgressCompleted = trimmed;
    handleMatchProgressAssetLoaded();
    console.warn(`[MATCH_PROGRESS] shard load ERROR ${trimmed}`, {
      event,
      pendingMatchProgressImages,
      lastCompleted: lastMatchProgressCompleted
    });
  };
  installImageWatch(img, trimmed, "matchProgressShard");
  img.src = trimmed;
  return img;
}

function loadMatchProgressImages(){
  const colorSet = new Set([
    ...Object.keys(matchProgressLayout || {}),
    ...Object.keys(matchProgressFragmentSources || {})
  ]);
  const colors = Array.from(colorSet);
  pendingMatchProgressImages = 0;

  colors.forEach(color => {
    const slots = Array.isArray(matchProgressLayout[color]) ? matchProgressLayout[color].length : 0;
    const sources = matchProgressFragmentSources[color];

    if (!Array.isArray(sources)){
      matchProgressImages[color] = Array.from({ length: slots }, () => []);
      return;
    }

    const first = sources[0];

    if (typeof first === "string" || first instanceof String){
      const sharedImages = sources.map(src => registerMatchProgressShardImage(src));
      matchProgressImages[color] = Array.from({ length: slots }, () => sharedImages);
      return;
    }

    if (Array.isArray(first)){
      const mapped = sources.map(slotSources => {
        if (!Array.isArray(slotSources)) return [];
        return slotSources.map(src => registerMatchProgressShardImage(src));
      });
      while (mapped.length < slots){
        mapped.push(mapped[mapped.length - 1] || []);
      }
      matchProgressImages[color] = mapped;
      return;
    }

    matchProgressImages[color] = Array.from({ length: slots }, () => []);
  });

  if (pendingMatchProgressImages === 0){
    finalizeMatchProgressLoading();
  }
}

function loadMatchProgressImagesIfNeeded(){
  if (matchProgressImagesRequested) return;
  matchProgressImagesRequested = true;
  loadMatchProgressImages();
}


function syncMatchProgressState(color, score){
  const slots = matchProgressState[color];
  if (!Array.isArray(slots)) return;

  const previousState = slots.map(set => {
    if (set instanceof Set){
      return new Set(set);
    }
    return new Set();
  });

  const clamped = Math.max(0, Math.min(score, POINTS_TO_WIN));

  slots.forEach(set => set.clear());
  matchProgressLap[color] = 0;
  matchProgressPos[color] = 0;
  matchProgressPlacedInLap[color] = 0;

  for (let count = 0; count < clamped; count++){
    if (!addMatchProgressPointToSide(color)) break;
  }

  applyMatchProgressFragmentAnimations(color, previousState);
}

function addMatchProgressPointToSide(color){
  const pool = matchProgressState[color];                   // массив из 5 Set'ов (по звездам)
  if (!Array.isArray(pool) || pool.length === 0) return false;

  const totalSlots = pool.length;
  const fragmentsPerSlot = matchProgressFragmentsPerSlot;
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
    matchProgressPos[color] = totalSlots > 0 ? totalSlots - 1 : 0;
    matchProgressLap[color] = totalSlots;
    matchProgressPlacedInLap[color] = fragmentsPerSlot;
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
    matchProgressPos[color] = targetSlot + 1;
    matchProgressPlacedInLap[color] = fragmentsPerSlot;
    matchProgressLap[color] = targetSlot + 1;
    return addMatchProgressPointToSide(color);
  }

  slotPieces.add(fragment);

  matchProgressPos[color] = targetSlot;
  matchProgressPlacedInLap[color] = slotPieces.size;
  matchProgressLap[color] = targetSlot;

  return true;
}

function syncAllMatchProgressStates(){
  syncMatchProgressState("green", greenScore);
  syncMatchProgressState("blue",  blueScore);
}

syncAllMatchProgressStates();

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
      spawnPointsPopup("blue", blueScore - previous, blueScore);
    } else {
      syncMatchProgressState("blue", blueScore);
      updatePendingMatchProgressTargets("blue", blueScore);
    }
  } else if(color === "green"){
    const previous = greenScore;
    greenScore = Math.max(0, greenScore + delta);
    if(greenScore > previous){
      spawnPointsPopup("green", greenScore - previous, greenScore);
    } else {
      syncMatchProgressState("green", greenScore);
      updatePendingMatchProgressTargets("green", greenScore);
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
let gameDrawFirstLogged = false;

/* Планирование хода ИИ */
let aiMoveScheduled = false;

/* ======= INIT ======= */
function colorAngleOffset(color){
  return 0;
}

let HOME_ROW_Y = { blue: 40, green: 0 };

function getHomeRowY(color){
  const fallback = color === "blue" ? 40 : WORLD.height - 40;
  const rowY = HOME_ROW_Y[color];
  return Number.isFinite(rowY) ? rowY : fallback;
}

function initPoints(){
  points = [];
  const spacing = FIELD_WIDTH / (PLANES_PER_SIDE + 1);
  const middleOffset = MIDDLE_GAP_EXTRA_PX / 2;
  const edgePadding = EDGE_PLANE_PADDING_PX;

  const blueHomeY = 40;
  const greenHomeY = WORLD.height - 40;
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


function resetGame(options = {}){
  const { forceGameScreen = false } = options;
  const shouldShowMenu = !forceGameScreen && !menuScreenLocked;

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
  clearExplosionFx();

  clearPointsPopups();

  greenScore = 0;
  blueScore  = 0;
  matchProgressLap = { blue: 0, green: 0 };
  matchProgressPos = { blue: 0, green: 0 };
  matchProgressPlacedInLap = { blue: 0, green: 0 };
  matchProgressState.blue  = Array.from({length:5}, ()=> new Set());
  matchProgressState.green = Array.from({length:5}, ()=> new Set());
  syncAllMatchProgressStates();
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

  selectedMode = shouldShowMenu ? null : selectedMode;
  gameMode = shouldShowMenu ? null : gameMode;
  phase = shouldShowMenu ? 'MENU' : 'TURN';
  currentPlacer = null;

  if (shouldShowMenu) {
    setBackgroundImage('background paper 1.png');
    hideGameBackgroundForMenu();
  } else {
    restoreGameBackgroundAfterMenu();
  }

  // UI reset
  syncModeButtonSkins(null);
  syncPlayButtonSkin(false);

  if (shouldShowMenu) {
    // Показать меню, скрыть канвасы
    setMenuVisibility(true);
    gsBoardCanvas.style.display = "none";
    mantisIndicator.style.display = "none";
    goatIndicator.style.display = "none";
    aimCanvas.style.display = "none";
    planeCanvas.style.display = "none";
  } else {
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
      window.rangeCells = 15;
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
      showSettingsLayer();
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
  bootTrace.startTs = performance.now();
  bootTrace.markers = [];
  gameDrawFirstLogged = false;
  console.log("[boot] play click", { t: 0 });
  gameMode = selectedMode;
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
  logPointerDebugEvent(e);
  if(phase === 'AA_PLACEMENT'){
    e.preventDefault();
    aaPointerDown = true;
    updateAAPreviewFromEvent(e);
  } else {
    handleStart(e);
  }
}

function onCanvasPointerMove(e){
  logPointerDebugEvent(e);
  if(phase !== 'AA_PLACEMENT') return;
  if(e.pointerType === 'mouse' || aaPointerDown){
    updateAAPreviewFromEvent(e);
  }
}

function onCanvasPointerUp(e){
  logPointerDebugEvent(e);
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


function isValidAAPlacement(x,y){
  // Allow Anti-Aircraft placement anywhere within the player's half of the field.
  // The center may touch field edges or overlap planes, but must not be inside
  // any building so that AA can be destroyed by planes.

  const half = WORLD.height / 2;

  if (currentPlacer === 'green') {
    if (y < half || y > WORLD.height) return false;
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

  const half = WORLD.height / 2;
  gsBoardCtx.save();
  gsBoardCtx.fillStyle = colorWithAlpha(currentPlacer, 0.05);
  if(currentPlacer === 'green'){
    gsBoardCtx.fillRect(FIELD_LEFT, half, FIELD_WIDTH, half);
  } else {
    gsBoardCtx.fillRect(FIELD_LEFT, 0, FIELD_WIDTH, half);
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
    const flightDistancePx = window.rangeCells * CELL_SIZE;
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
    const flightDistancePx = window.rangeCells * CELL_SIZE;
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
    const flightDistancePx = window.rangeCells * CELL_SIZE;
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

  try { spawnExplosion(p.collisionX, p.collisionY, p); }
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

              try { spawnExplosion(p.collisionX, p.collisionY, p); }
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
function drawInitialFrame(reason = "initial") {
  resetCanvasState(gsBoardCtx, gsBoardCanvas);
  if (isSpriteReady(backgroundImg)) {
    drawFieldBackground(gsBoardCtx, WORLD.width, WORLD.height);
  } else {
    gsBoardCtx.fillStyle = "#f2efe6";
    gsBoardCtx.fillRect(0, 0, WORLD.width, WORLD.height);
  }
  drawFieldEdges(gsBoardCtx, WORLD.width, WORLD.height);
  drawDebugLayoutOverlay(gsBoardCtx);
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
        else if (p.y > WORLD.height - FIELD_BORDER_OFFSET_Y) {
          p.y = WORLD.height - FIELD_BORDER_OFFSET_Y;
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

  drawFieldEdges(gsBoardCtx, WORLD.width, WORLD.height);

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


    // Draw arrow in board coordinates so it stays aligned with the game field
    const arrowAlpha = 0.5 * (vdist / MAX_DRAG_DISTANCE);
    const startX = plane.x;
    const startY = plane.y;
    const tailX = plane.x + baseDx;
    const tailY = plane.y + baseDy;

    const { CANVAS_DPR } = getCanvasDpr();
    aimCtx.setTransform(1, 0, 0, 1, 0, 0);
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
    aimCtx.save();
    aimCtx.setTransform(
      VIEW.scaleX,
      0,
      0,
      VIEW.scaleY,
      CANVAS_OFFSET_X * CANVAS_DPR,
      FRAME_PADDING_Y * CANVAS_DPR
    );
    aimCtx.globalAlpha = arrowAlpha;
    drawArrow(aimCtx, startX, startY, baseDx, baseDy);
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
      inBounds: tailX >= 0 && tailX <= WORLD.width && tailY >= 0 && tailY <= WORLD.height
    });

  } else {
    // Clear overlay if not aiming
    aimCtx.setTransform(1, 0, 0, 1, 0, 0);
    aimCtx.clearRect(0, 0, aimCanvas.width, aimCanvas.height);
  }

  // самолёты + их трейлы
  drawPlanesAndTrajectories();

  // Взрывы поверх поля и под HUD
  updateAndDrawExplosions(gsBoardCtx, deltaMs);

  // Табло рисуем поверх самолётов, поэтому оно выводится после drawPlanesAndTrajectories
  renderScoreboard();

  if(isGameOver && winnerColor){
    gsBoardCtx.font="48px 'Patrick Hand', cursive";
    gsBoardCtx.fillStyle= colorFor(winnerColor);
    const winnerName= `${winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1)}`;
    const text= shouldShowEndScreen
      ? `${winnerName} wins the game!`
      : `${winnerName} wins the round!`;
    const metrics = gsBoardCtx.measureText(text);
    const w = metrics.width;
    const textX = (WORLD.width - w) / 2;
    const textBaselineY = WORLD.height / 2 - 80;
    gsBoardCtx.fillText(text, textX, textBaselineY);

    if(shouldShowEndScreen && endGameDiv){
      const descent = Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : 0;
      const anchorCanvasX = WORLD.width / 2;
      const anchorCanvasY = textBaselineY + descent + 24;
      const boardRect = getViewportAdjustedBoundingClientRect(gsBoardCanvas);
      const boardWidth = Number.isFinite(boardRect.width) ? boardRect.width : 0;
      const boardHeight = Number.isFinite(boardRect.height) ? boardRect.height : 0;
      const scaleX = WORLD.width !== 0 ? boardWidth / WORLD.width : 1;
      const scaleY = WORLD.height !== 0 ? boardHeight / WORLD.height : 1;
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

  drawDebugLayoutOverlay(gsBoardCtx);

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

  const bbox = { x: -20, y: -20, w: 40, h: 40 };

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
  const scaleX = VIEW.scaleX;
  const scaleY = VIEW.scaleY;
  planeCtx.save();
  planeCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);

  let rangeTextInfo = null;
  const activeColor = turnColors[turnIndex];
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
    if(!p.isAlive && !p.burning) return;

    // Allow wreck sprites to render after explosions finish instead of exiting early.
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
      const cells = (vdist / MAX_DRAG_DISTANCE) * window.rangeCells;
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
    renderPlane(p, gsBoardCtx);
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
    gsBoardCtx.save();
    gsBoardCtx.translate(b.x, b.y);
    drawBrickWall(gsBoardCtx, b.width, b.height);
    gsBoardCtx.restore();
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
    drawFlag(gsBoardCtx, centerX, blueFlagY, "blue");
  }
  if(!greenFlagCarrier){
    drawFlag(gsBoardCtx, centerX, greenFlagY, "green");
  }
}


function drawAAUnits(){
  const now = performance.now();
  for(const aa of aaUnits){
    gsBoardCtx.save();
    // draw fading trail
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

      try { spawnExplosion(p.collisionX, p.collisionY, p); }
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

function drawMatchProgress(ctx, scaleX = 1, scaleY = 1){
  if (!matchProgressReady || !ctx) return;

  const sx = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const sy = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : sx;
  const scale = (typeof matchProgressPieceScale !== 'undefined') ? matchProgressPieceScale : 1;

  ctx.save();
  // На всякий случай сбрасываем висящие трансформации
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  const now = performance.now();

  try {
    const colors = ["blue", "green"];
    for (const color of colors){
      const slots = matchProgressState[color] || [];
      const placements = matchProgressLayout[color];
      const images = matchProgressImages[color];
      const animRows = matchProgressFragmentAnimations[color];

      if (!Array.isArray(placements) || !Array.isArray(images)) continue;

      for (let slotIdx = 0; slotIdx < placements.length; slotIdx++){
        const slot = slots[slotIdx];
        if (!slot || slot.size === 0) continue;

        for (let frag = 1; frag <= matchProgressFragmentsPerSlot; frag++){
          // Проверяем наличие именно текущего фрагмента в Set,
          // чтобы не рисовать все пять позиций звезды при наличии только одного.
          const hasFragment = slot.has(frag);
          if (!hasFragment) continue;

          const pos = matchProgressLayout[color]?.[slotIdx]?.[frag-1];
          if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number'){
            console.warn(`[MATCH_PROGRESS] no pos for ${color} slot ${slotIdx} frag ${frag}`);
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
              : matchProgressFragmentFadeDurationMs;
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

          const screenX = Math.round(pos.x * sx);
          const screenY = Math.round(pos.y * sy);

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
    console.warn('[MATCH_PROGRESS] drawMatchProgress error:', err);
  } finally {
    ctx.restore();
  }
}

const PLANE_COUNTER_PADDING = 2;
const PLANE_COUNTER_CONTAINERS = {
  blue: HUD_LAYOUT.planeCounters.blue,
  green: HUD_LAYOUT.planeCounters.green
};

const pointsPopupDurationMs = 2600;
const MIN_ROUND_TRANSITION_DELAY_MS = (() => {
  const greenSlots = Array.isArray(matchProgressLayout?.green) ? matchProgressLayout.green.length : 0;
  const blueSlots = Array.isArray(matchProgressLayout?.blue) ? matchProgressLayout.blue.length : 0;
  const maxSlotCount = Math.max(greenSlots, blueSlots, 0);
  const rowCascadeDelay = Math.max(0, maxSlotCount - 1) * matchProgressFragmentRowDelayMs;
  return pointsPopupDurationMs + matchProgressFragmentFadeDurationMs + rowCascadeDelay;
})();
const HUD_KILL_MARKER_DRAW_DURATION_MS = Math.max(400, pointsPopupDurationMs * 0.55);
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
const pointsPopupQueue = {
  blue: [],
  green: []
};
const pointsPopupActive = {
  blue: false,
  green: false
};
const activePointsPopupEntries = {
  blue: null,
  green: null
};

function refreshPointsPopupAnchors(){
  for(const [color, host] of Object.entries(pointsPopupElements)){
    if(!(host instanceof HTMLElement)){
      continue;
    }

    const targetScore = activePointsPopupEntries[color]?.targetScore ?? getScoreForColor(color);
    setPointsPopupAnchor(host, color, targetScore);
  }
}

function spawnPointsPopup(color, delta, targetScore){
  if(delta <= 0) return;
  if(color !== "blue" && color !== "green") return;

  enqueuePointsPopup(color, delta, targetScore);
}

function enqueuePointsPopup(color, delta, targetScore){
  const queue = pointsPopupQueue[color];
  if(!queue) return;

  queue.push({ delta, targetScore });
  if(!pointsPopupActive[color]){
    processNextPointsPopup(color);
  }
}

function processNextPointsPopup(color){
  const queue = pointsPopupQueue[color];
  if(!queue || queue.length === 0){
    pointsPopupActive[color] = false;
    activePointsPopupEntries[color] = null;
    return;
  }

  pointsPopupActive[color] = true;
  const entry = queue.shift();
  activePointsPopupEntries[color] = entry;
  showPointsPopup(color, entry);
}

function getScoreForColor(color){
  return color === "blue" ? blueScore : greenScore;
}

function updatePendingMatchProgressTargets(color, targetScore){
  if(!Number.isFinite(targetScore)){
    return;
  }

  const queue = pointsPopupQueue[color];
  if(Array.isArray(queue)){
    for(const entry of queue){
      if(entry && typeof entry === "object"){
        entry.targetScore = targetScore;
      }
    }
  }

  const activeEntry = activePointsPopupEntries[color];
  if(activeEntry && typeof activeEntry === "object"){
    activeEntry.targetScore = targetScore;
  }
}

function setPointsPopupAnchor(host, color, targetScore){
  if(!(host instanceof HTMLElement)){
    return false;
  }

  const anchors = pointsPopupAnchors?.[color];
  const fragmentsPerSlot = matchProgressFragmentsPerSlot;

  const cleanup = () => {
    host.style.removeProperty('--points-popup-ink-left');
    host.style.removeProperty('--points-popup-ink-top');
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
  let scale = Number.parseFloat(computed.getPropertyValue('--points-popup-scale'));
  if(!Number.isFinite(scale) || scale <= 0){
    scale = 1;
  }

  let hostWidth = host.clientWidth;
  if(!Number.isFinite(hostWidth) || hostWidth <= 0){
    const computedWidth = Number.parseFloat(computed.width);
    if(Number.isFinite(computedWidth) && computedWidth > 0){
      hostWidth = computedWidth;
    } else {
      hostWidth = pointsPopupBaseSize.width * scale;
    }
  }

  let hostHeight = host.clientHeight;
  if(!Number.isFinite(hostHeight) || hostHeight <= 0){
    const computedHeight = Number.parseFloat(computed.height);
    if(Number.isFinite(computedHeight) && computedHeight > 0){
      hostHeight = computedHeight;
    } else {
      hostHeight = pointsPopupBaseSize.height * scale;
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

  pxLeft = clampPointsPopupOffset(pxLeft, hostWidth);
  pxTop = clampPointsPopupOffset(pxTop, hostHeight);

  if(Number.isFinite(pxLeft)){
    host.style.setProperty('--points-popup-ink-left', `${pxLeft}px`);
  } else {
    host.style.removeProperty('--points-popup-ink-left');
  }

  if(Number.isFinite(pxTop)){
    host.style.setProperty('--points-popup-ink-top', `${pxTop}px`);
  } else {
    host.style.removeProperty('--points-popup-ink-top');
  }

  return Number.isFinite(pxLeft) && Number.isFinite(pxTop);
}

function showPointsPopup(color, entry){
  const delta = Number.isFinite(entry?.delta) ? entry.delta : 0;
  const resolveTargetScore = () => {
    if(entry && Number.isFinite(entry.targetScore)){
      return entry.targetScore;
    }
    return getScoreForColor(color);
  };

  if(delta <= 0){
    syncMatchProgressState(color, resolveTargetScore());
    pointsPopupActive[color] = false;
    activePointsPopupEntries[color] = null;
    processNextPointsPopup(color);
    return;
  }

  const host = pointsPopupElements[color];
  if(!host){
    pointsPopupActive[color] = false;
    syncMatchProgressState(color, resolveTargetScore());
    activePointsPopupEntries[color] = null;
    processNextPointsPopup(color);
    return;
  }

  const anchorTargetScore = resolveTargetScore();
  setPointsPopupAnchor(host, color, anchorTargetScore);

  const popup = document.createElement("span");
  popup.className = "points-popup-ink";
  popup.textContent = `+${delta}`;

  let cleared = false;
  const finalize = () => {
    if(cleared) return;
    cleared = true;
    syncMatchProgressState(color, resolveTargetScore());
    if(popup.parentNode === host){
      host.removeChild(popup);
    }
    pointsPopupActive[color] = false;
    activePointsPopupEntries[color] = null;
    processNextPointsPopup(color);
  };

  popup.addEventListener("animationend", finalize, { once: true });
  setTimeout(finalize, pointsPopupDurationMs);

  host.appendChild(popup);
}

function clearPointsPopups(){
  for(const key of Object.keys(pointsPopupElements)){
    const host = pointsPopupElements[key];
    if(host){
      host.textContent = "";
    }
    if(Array.isArray(pointsPopupQueue[key])){
      pointsPopupQueue[key].length = 0;
    }
    pointsPopupActive[key] = false;
    activePointsPopupEntries[key] = null;
  }
}

function renderScoreboard(){
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
      turnColors[turnIndex] === "blue"
    );
  }

  if (greenHudFrame) {
    drawPlayerHUD(
      hudCtx,
      greenHudFrame,
      "green",
      turnColors[turnIndex] === "green"
    );
  }

  drawMatchProgress(hudCtx, scaleX, scaleY);

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
    { id: 'BlueMatchProgress', ...HUD_LAYOUT.matchProgress.blue },
    { id: 'GreenMatchProgress', ...HUD_LAYOUT.matchProgress.green },
    { id: 'BluePointsPopup', ...HUD_LAYOUT.pointsPopups.blue },
    { id: 'GreenPointsPopup', ...HUD_LAYOUT.pointsPopups.green }
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
    const maxY = WORLD.height - 80;
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
    syncAllMatchProgressStates();
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
  resetGame({ forceGameScreen: true });
});

function startNewRound(){
  logBootStep("startNewRound");
  loadMatchProgressImagesIfNeeded();
  preloadPlaneSprites();
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
    applyCurrentMap();
  }
  suppressAutoRandomMapForNextRound = false;
  cleanupGreenCrashFx();
  clearPointsPopups();
  endGameDiv.style.display = "none";
  isGameOver=false; winnerColor=null;
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;

  matchProgressLap = { blue: 0, green: 0 };
  matchProgressPos = { blue: 0, green: 0 };
  matchProgressPlacedInLap = { blue: 0, green: 0 };
  matchProgressState.blue  = Array.from({length:5}, ()=> new Set());
  matchProgressState.green = Array.from({length:5}, ()=> new Set());
  syncAllMatchProgressStates();

  lastFirstTurn = 1 - lastFirstTurn;
  turnIndex = lastFirstTurn;

  roundNumber++;
  roundTextTimer = 120;

  globalFrame=0;
  flyingPoints=[];
  hasShotThisRound=false;
  aaUnits = [];

  aiMoveScheduled = false;
  gsBoardCanvas.style.display = "block";
  mantisIndicator.style.display = "block";
  goatIndicator.style.display = "block";
  planeCanvas.style.display = "block";
  aimCanvas.style.display = "block";

  if (needsGameScreenSync) {
    resizeCanvasFixedForGameBoard();
    sizeAndAlignOverlays();
    requestAnimationFrame(() => {
      resizeCanvasFixedForGameBoard();
      sizeAndAlignOverlays();
    });
    needsGameScreenSync = false;
    hasActivatedGameScreen = true;
  }

  requestAnimationFrame(() => {
    const rect = overlayContainer?.getBoundingClientRect?.();
    const cssWidth = Math.max(1, rect?.width || CANVAS_BASE_WIDTH);
    const cssHeight = Math.max(1, rect?.height || CANVAS_BASE_HEIGHT);
    syncOverlayCanvasToGameCanvas(planeCanvas, cssWidth, cssHeight);
    syncAimCanvasLayout();
  });

  setBackgroundImage('ui_gamescreen/background behind the canvas 5.png');

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
  installImageWatch(brickFrameImg, gameplayMap.file, "brickFrameImg");
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

function updateUiScale() {
  if (uiFrameEl instanceof HTMLElement) {
    uiFrameEl.style.width = `${FRAME_BASE_WIDTH}px`;
    uiFrameEl.style.height = `${FRAME_BASE_HEIGHT}px`;
  }

  if (gsFrameEl instanceof HTMLElement) {
    gsFrameEl.style.removeProperty('--points-popup-scale');
    gsFrameEl.style.removeProperty('--game-scale');
    gsFrameEl.style.removeProperty('left');
    gsFrameEl.style.removeProperty('top');
    gsFrameEl.style.width = `${FRAME_BASE_WIDTH}px`;
    gsFrameEl.style.height = `${FRAME_BASE_HEIGHT}px`;
  }

  syncHudCanvasLayout();
  syncAimCanvasLayout();
}

/* ======= CANVAS RESIZE ======= */
function syncAllCanvasBackingStores() {
  logResizeDebug('syncAllCanvasBackingStores');
  trackBootResizeCount('syncAllCanvasBackingStores');
  syncCanvasBackingStore(gsBoardCanvas);
  syncCanvasBackingStore(planeCanvas);
  syncCanvasBackingStore(aimCanvas);
  syncCanvasBackingStore(hudCanvas);
}

function resizeCanvasFixedForGameBoard() {
  const { CANVAS_DPR } = getCanvasDpr();
  updateUiScale();
  syncBackgroundLayout(FRAME_BASE_WIDTH, FRAME_BASE_HEIGHT);

  const cssW = CANVAS_BASE_WIDTH;
  const cssH = CANVAS_BASE_HEIGHT;
  const backingW = Math.max(1, Math.round(cssW * CANVAS_DPR));
  const backingH = Math.max(1, Math.round(cssH * CANVAS_DPR));

  gsBoardCanvas.style.width = `${cssW}px`;
  gsBoardCanvas.style.height = `${cssH}px`;
  gsBoardCanvas.style.left = `${CANVAS_OFFSET_X}px`;
  gsBoardCanvas.style.top = `${FRAME_PADDING_Y}px`;
  if (gsBoardCanvas.width !== backingW) gsBoardCanvas.width = backingW;
  if (gsBoardCanvas.height !== backingH) gsBoardCanvas.height = backingH;
  computeViewFromCanvas(gsBoardCanvas);
  applyViewTransform(gsBoardCtx);
  syncAimCanvasLayout();
}

let lastResizeMetrics = {
  cssW: 0,
  cssH: 0,
  scale: 0,
  dpr: 0
};

function resizeCanvas() {
  logResizeDebug('resizeCanvas');
  trackBootResizeCount('resizeCanvas');
  // Keep the game in portrait mode: if the device rotates to landscape,
  // attempt to re-lock orientation.  Do not skip resizing so the canvases
  // remain correctly sized even if the device starts in landscape.
  if(screen.orientation && screen.orientation.type.startsWith('landscape')){
    lockOrientation();
    // continue resizing instead of early returning
  }

  const safeScale = 1;
  const cssW = CANVAS_BASE_WIDTH;
  const cssH = CANVAS_BASE_HEIGHT;
  const { CANVAS_DPR } = getCanvasDpr();
  const unchanged =
    Math.abs(cssW - lastResizeMetrics.cssW) < 0.1 &&
    Math.abs(cssH - lastResizeMetrics.cssH) < 0.1 &&
    Math.abs(safeScale - lastResizeMetrics.scale) < 0.0001 &&
    Math.abs(CANVAS_DPR - lastResizeMetrics.dpr) < 0.001;

  if (unchanged) {
    logResizeDebug();
    return;
  }

  lastResizeMetrics = {
    cssW,
    cssH,
    scale: safeScale,
    dpr: CANVAS_DPR
  };

  updateUiScale();
  syncBackgroundLayout(FRAME_BASE_WIDTH, FRAME_BASE_HEIGHT);
  const canvas = gsBoardCanvas;
  canvas.style.width = CANVAS_BASE_WIDTH + 'px';
  canvas.style.height = CANVAS_BASE_HEIGHT + 'px';
  canvas.style.left = CANVAS_OFFSET_X + 'px';
  canvas.style.top = FRAME_PADDING_Y + 'px';
  const gsBackingW = Math.max(1, Math.round(CANVAS_BASE_WIDTH * CANVAS_DPR));
  const gsBackingH = Math.max(1, Math.round(CANVAS_BASE_HEIGHT * CANVAS_DPR));
  if (canvas.width !== gsBackingW) canvas.width = gsBackingW;
  if (canvas.height !== gsBackingH) canvas.height = gsBackingH;
  computeViewFromCanvas(canvas);

  sizeAndAlignOverlays();
  syncAimCanvasLayout();
  if (planeCanvas) {
    planeCanvas.style.width = CANVAS_BASE_WIDTH + 'px';
    planeCanvas.style.height = CANVAS_BASE_HEIGHT + 'px';
    const planeBackingW = Math.max(1, Math.round(CANVAS_BASE_WIDTH * CANVAS_DPR));
    const planeBackingH = Math.max(1, Math.round(CANVAS_BASE_HEIGHT * CANVAS_DPR));
    if (planeCanvas.width !== planeBackingW) planeCanvas.width = planeBackingW;
    if (planeCanvas.height !== planeBackingH) planeCanvas.height = planeBackingH;
  }
  applyViewTransform(gsBoardCtx);
  applyViewTransform(aimCtx);
  applyViewTransform(planeCtx);

  [mantisIndicator, goatIndicator].forEach(ind => {
    ind.style.width = FRAME_BASE_WIDTH + 'px';
    ind.style.height = FRAME_BASE_HEIGHT / 2 + 'px';
    ind.style.backgroundSize = FRAME_BASE_WIDTH + 'px ' + FRAME_BASE_HEIGHT + 'px';
  });
  mantisIndicator.style.top = '0px';
  goatIndicator.style.top = FRAME_BASE_HEIGHT / 2 + 'px';

  updateFieldDimensions();

  requestAnimationFrame(syncAllCanvasBackingStores);

  schedulePlaneFlameSync();

  // Переинициализируем самолёты
  if(points.length === 0) {
    initPoints();
  }

  refreshPointsPopupAnchors();
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

  if (DEBUG_RESIZE) {
    console.log('Layout rects after resize', {
      gsFrameEl: rectSummary(gsFrameEl),
      stage: rectSummary(gsFrameEl),
      gameCanvas: rectSummary(gsBoardCanvas),
      aimCanvas: rectSummary(aimCanvas),
      planeCanvas: rectSummary(planeCanvas),
      overlayContainer: rectSummary(overlayContainer),
      greenPlaneCounter: rectSummary(greenPlaneCounter),
      bluePlaneCounter: rectSummary(bluePlaneCounter),
      greenPointsPopup: rectSummary(greenPointsPopup),
      bluePointsPopup: rectSummary(bluePointsPopup)
    });
  }
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('load', updateUiScale);
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
    updateUiScale();
    sizeAndAlignOverlays();
    resizeCanvas();
    resetGame();
  }

bootstrapGame();
