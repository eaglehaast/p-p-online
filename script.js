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
const DEBUG_DROP_COORDS = false;
const DEBUG_INVENTORY_INPUT = false;
const DEBUG_PLANE_GRAB = false;
const DEBUG_CHEATS = typeof location !== "undefined" && location.hash.includes("dev");
const DEBUG_ARCADE_SCORE_TEXT = false;

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
    endGameVisible: endGameDiv?.classList?.contains("is-visible") ?? false,
    loopRunning: animationFrameId !== null,
  });
}


function setEndGamePanelVisible(isVisible){
  if(!(endGameDiv instanceof HTMLElement)) return;
  const visible = Boolean(isVisible);
  endGameDiv.classList.toggle("is-visible", visible);
  endGameDiv.setAttribute("aria-hidden", visible ? "false" : "true");
}

let endGamePanelPreviewEnabled = false;

function placeEndGamePanelAtBoardCenter(){
  if(!(endGameDiv instanceof HTMLElement) || !(gsBoardCanvas instanceof HTMLCanvasElement)) return false;
  const boardRect = getViewportAdjustedBoundingClientRect(gsBoardCanvas);
  const boardWidth = Number.isFinite(boardRect.width) ? boardRect.width : 0;
  const boardHeight = Number.isFinite(boardRect.height) ? boardRect.height : 0;
  if(boardWidth <= 0 || boardHeight <= 0) return false;

  const panelWidth = endGameDiv.offsetWidth || 0;
  const panelHeight = endGameDiv.offsetHeight || 0;
  const targetLeft = Math.round(boardRect.left + (boardWidth - panelWidth) / 2);
  const targetTop = Math.round(boardRect.top + (boardHeight - panelHeight) / 2);
  endGameDiv.style.left = `${targetLeft}px`;
  endGameDiv.style.top = `${targetTop}px`;
  return true;
}

function setPlayAgainPanelPreview(isVisible = true){
  if(!(endGameDiv instanceof HTMLElement)) return false;
  const visible = Boolean(isVisible);
  endGamePanelPreviewEnabled = visible;

  if(!visible){
    setEndGamePanelVisible(false);
    endGameDiv.style.left = "";
    endGameDiv.style.top = "";
    return true;
  }

  placeEndGamePanelAtBoardCenter();
  endGameDiv.classList.remove("is-visible");
  void endGameDiv.offsetWidth;
  setEndGamePanelVisible(true);
  return true;
}

if(typeof window !== "undefined"){
  window.PLAYAGAIN_PANEL = {
    show(){
      return setPlayAgainPanelPreview(true);
    },
    hide(){
      return setPlayAgainPanelPreview(false);
    }
  };
}

function setScreenMode(mode) {
  document.body.classList.toggle('screen--menu', mode === 'MENU');
  document.body.classList.toggle('screen--game', mode === 'GAME');
  document.body.classList.toggle('screen--settings', mode === 'SETTINGS');
  syncMapEditorResetButtonVisibility();
  syncFieldCssVars();
}

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
  const pinchScale = getEffectivePinchScale();
  const effectiveScale = uiScale * pinchScale;
  return {
    x: (clientX - rect.left) / effectiveScale,
    y: (clientY - rect.top) / effectiveScale,
    rect,
    uiScale,
    pinchScale,
    effectiveScale
  };
}

function getPinchScaleFromUiFrameTransform() {
  if (!(uiFrameInner instanceof HTMLElement)) return null;
  const raw = uiFrameInner.style.transform
    || window.getComputedStyle(uiFrameInner).transform
    || "";
  if (!raw || raw === "none") return null;

  const scaleMatch = raw.match(/scale\(([^)]+)\)/i);
  if (scaleMatch) {
    const value = parseFloat(scaleMatch[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const matrixMatch = raw.match(/matrix\(([^)]+)\)/i);
  if (matrixMatch) {
    const values = matrixMatch[1].split(',').map((token) => parseFloat(token.trim()));
    const value = values[0];
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  return null;
}

function getEffectivePinchScale() {
  if (typeof window === 'undefined' || window.PINCH_ACTIVE !== true) {
    return 1;
  }

  const runtimePinchScale = Number.isFinite(pinchScale) && pinchScale > 0 ? pinchScale : null;
  const transformPinchScale = getPinchScaleFromUiFrameTransform();
  const resolvedPinchScale = runtimePinchScale ?? transformPinchScale;

  if (!Number.isFinite(resolvedPinchScale) || resolvedPinchScale <= 0) {
    return 1;
  }

  return resolvedPinchScale;
}

function logDropCoordsDebug(context, payload) {
  if (!DEBUG_DROP_COORDS) return;
  console.log(`[drop-debug] ${context}`, payload);
}

function getInventoryDebugItemFromEvent(event){
  const target = event?.target;
  if(!(target instanceof Element)) return null;
  const itemNode = target.closest?.("[data-item-color][data-item-type]");
  if(!(itemNode instanceof HTMLElement)) return null;
  const color = itemNode.dataset.itemColor || null;
  const type = itemNode.dataset.itemType || null;
  if(!color || !type) return null;
  return { color, type };
}

function logInventoryInputDebug(eventName, event, nextState, details = {}){
  if(!DEBUG_INVENTORY_INPUT) return;
  const pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
  const { clientX, clientY } = getPointerClientCoords(event || {});
  const currentState = inventoryInteractionState.mode;
  const foundItem = details.foundItem
    ?? getInventoryDebugItemFromEvent(event)
    ?? getInventoryInteractionActiveItem()
    ?? null;
  console.log("[inventory-input]", {
    event: eventName,
    pointerId,
    clientX,
    clientY,
    item: foundItem ? { color: foundItem.color, type: foundItem.type } : null,
    currentState,
    nextState: nextState ?? currentState,
    ...details,
  });
}

function logInventoryInputEarlyExit(eventName, event, reason, details = {}){
  if(!DEBUG_INVENTORY_INPUT) return;
  logInventoryInputDebug(eventName, event, inventoryInteractionState.mode, {
    reason,
    earlyExit: true,
    ...details,
  });
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
  // Expected layout chain for every viewport/screen change:
  // 1) syncFieldCssVars() writes fresh CSS vars,
  // 2) updateFieldDimensions() reads them,
  // 3) world field geometry is rebuilt from those values.
  // Keep this order, otherwise stale CSS numbers can desync collisions/canvas.
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
const mapEditorResetBtn = document.getElementById("mapEditorResetBtn");
const mapEditorSaveBtn = document.getElementById("mapEditorSaveBtn");
const mapEditorResetMapBtn = document.getElementById("mapEditorResetMapBtn");
const mapEditorSaveDialog = document.getElementById("mapEditorSaveDialog");
const mapEditorSaveNameInput = document.getElementById("mapEditorSaveNameInput");
const mapEditorSaveDialogCancelBtn = document.getElementById("mapEditorSaveDialogCancelBtn");
const mapEditorSaveDialogSubmitBtn = document.getElementById("mapEditorSaveDialogSubmitBtn");
const mapEditorModeControls = document.getElementById("mapEditorModeControls");
const mapEditorModeBricksBtn = document.getElementById("mapEditorModeBricksBtn");
const mapEditorModePlanesBtn = document.getElementById("mapEditorModePlanesBtn");
const mapEditorBrickSidebar = document.getElementById("mapEditorBrickSidebar");
const blueInventoryHost = document.getElementById("gs_inventory_blue");
const greenInventoryHost = document.getElementById("gs_inventory_green");
const inventoryLayer = document.getElementById("inventoryLayer");
const arcadeScoreEls = Object.freeze({
  blue: document.getElementById("arcadeScoreBlue"),
  green: document.getElementById("arcadeScoreGreen")
});

function syncInventoryVisibility() {
  if (!(inventoryLayer instanceof HTMLElement)) return;
  const visible = settings?.addCargo === true;
  inventoryLayer.style.display = visible ? "block" : "none";
  inventoryLayer.setAttribute("aria-hidden", visible ? "false" : "true");
}

const ROUND_BANNER_AUTO_HIDE_MS = 2000;
const roundBannerState = {
  layer: null,
  element: null,
  hideTimerId: null,
};

function ensureRoundBannerElement() {
  if (roundBannerState.element instanceof HTMLElement) {
    return roundBannerState.element;
  }
  const bannerHost = gsFrameLayer instanceof HTMLElement
    ? gsFrameLayer
    : (uiOverlay instanceof HTMLElement ? uiOverlay : null);
  if (!(bannerHost instanceof HTMLElement)) return null;

  let bannerLayer = roundBannerState.layer;
  if (!(bannerLayer instanceof HTMLElement) || bannerLayer.parentElement !== bannerHost) {
    bannerLayer = document.createElement("div");
    bannerLayer.className = "round-banner-layer";
    bannerLayer.setAttribute("aria-hidden", "true");
    bannerHost.appendChild(bannerLayer);
    roundBannerState.layer = bannerLayer;
  }

  const banner = document.createElement("div");
  banner.className = "round-banner";
  banner.setAttribute("aria-hidden", "true");
  bannerLayer.appendChild(banner);
  roundBannerState.element = banner;
  return banner;
}

function clearRoundBanner() {
  if (roundBannerState.hideTimerId !== null) {
    clearTimeout(roundBannerState.hideTimerId);
    roundBannerState.hideTimerId = null;
  }
  const banner = roundBannerState.element;
  if (!(banner instanceof HTMLElement)) return;
  banner.classList.remove("is-visible");
  banner.textContent = "";
}

function showRoundBanner(text) {
  const banner = ensureRoundBannerElement();
  if (!(banner instanceof HTMLElement)) return;

  clearRoundBanner();
  banner.textContent = String(text ?? "");
  banner.classList.add("is-visible");
  roundBannerState.hideTimerId = setTimeout(() => {
    clearRoundBanner();
  }, ROUND_BANNER_AUTO_HIDE_MS);
}

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
  CROSSHAIR: "crosshair",
  FUEL: "fuel",
  WINGS: "wings",
  DYNAMITE: "dynamite",
  INVISIBILITY: "invisible",
};

const NUCLEAR_STRIKE_ACTION_TYPES = Object.freeze({
  NUCLEAR_STRIKE: "nuclear_strike",
});

const ITEM_USAGE_TARGETS = Object.freeze({
  BOARD: "board",
  SELF_PLANE: "self_plane",
});

const itemUsageConfig = Object.freeze({
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
    hintText: "install it on the field. Stay away!",
    requiresDragAndDrop: true,
  },
  [INVENTORY_ITEM_TYPES.DYNAMITE]: {
    target: ITEM_USAGE_TARGETS.BOARD,
    hintText: "Drag it onto a brick tile to plant dynamite.",
    requiresDragAndDrop: true,
  },
  [INVENTORY_ITEM_TYPES.WINGS]: {
    target: ITEM_USAGE_TARGETS.SELF_PLANE,
    hintText: "",
    requiresDragAndDrop: true,
  },
  [INVENTORY_ITEM_TYPES.INVISIBILITY]: {
    target: ITEM_USAGE_TARGETS.BOARD,
    hintText: "",
    requiresDragAndDrop: true,
  },
});

const NUCLEAR_STRIKE_FX = {
  type: NUCLEAR_STRIKE_ACTION_TYPES.NUCLEAR_STRIKE,
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

// Новый 6-слотовый inventory: все runtime-иконки и рамки только из ui_gamescreen/gs_inventory/.
const INVENTORY_UI_CONFIG = Object.freeze({
  frameAtlasPath: "ui_gamescreen/gs_inventory/gs_inventory_frame_size.png",
  slotOrder: [
    INVENTORY_ITEM_TYPES.CROSSHAIR,
    INVENTORY_ITEM_TYPES.FUEL,
    INVENTORY_ITEM_TYPES.WINGS,
    INVENTORY_ITEM_TYPES.MINE,
    INVENTORY_ITEM_TYPES.DYNAMITE,
    INVENTORY_ITEM_TYPES.INVISIBILITY,
  ],
  containerSize: Object.freeze({ w: 342, h: 55 }),
  slotSize: Object.freeze({ w: 55, h: 55 }),
  containers: Object.freeze({
    blue: Object.freeze({ x: 68, y: 19, w: 342, h: 55 }),
    green: Object.freeze({ x: 68, y: 733, w: 342, h: 55 }),
  }),
  slots: Object.freeze({
    [INVENTORY_ITEM_TYPES.CROSSHAIR]: Object.freeze({
      frame: Object.freeze({ x: 0, y: 0, w: 55, h: 55 }),
      icon: Object.freeze({ x: 14, y: 13, w: 28, h: 27 }),
      countPocket: Object.freeze({ x: 43, y: 3, w: 10, h: 9 }),
      iconPath: "ui_gamescreen/gs_inventory/gs_inventory_crossfire.png",
    }),
    [INVENTORY_ITEM_TYPES.FUEL]: Object.freeze({
      frame: Object.freeze({ x: 57, y: 0, w: 55, h: 55 }),
      icon: Object.freeze({ x: 77, y: 13, w: 17, h: 28 }),
      countPocket: Object.freeze({ x: 100, y: 3, w: 10, h: 9 }),
      iconPath: "ui_gamescreen/gs_inventory/gs_inventory_fuel.png",
    }),
    [INVENTORY_ITEM_TYPES.WINGS]: Object.freeze({
      frame: Object.freeze({ x: 114, y: 0, w: 55, h: 55 }),
      icon: Object.freeze({ x: 129, y: 11, w: 33, h: 30 }),
      countPocket: Object.freeze({ x: 157, y: 3, w: 10, h: 9 }),
      iconPath: "ui_gamescreen/gs_inventory/gs_inventory_wings_sharper_2.png",
    }),
    [INVENTORY_ITEM_TYPES.MINE]: Object.freeze({
      frame: Object.freeze({ x: 171, y: 0, w: 55, h: 55 }),
      icon: Object.freeze({ x: 185, y: 13, w: 28, h: 28 }),
      countPocket: Object.freeze({ x: 214, y: 3, w: 10, h: 9 }),
      iconPath: "ui_gamescreen/gs_inventory/gs_inventory_mine.png",
    }),
    [INVENTORY_ITEM_TYPES.DYNAMITE]: Object.freeze({
      implemented: true,
      frame: Object.freeze({ x: 228, y: 0, w: 55, h: 55 }),
      icon: Object.freeze({ x: 247, y: 9, w: 19, h: 32 }),
      countPocket: Object.freeze({ x: 272, y: 3, w: 10, h: 9 }),
      iconPath: "ui_gamescreen/gs_inventory/gs_inventory_dynamite.png",
    }),
    [INVENTORY_ITEM_TYPES.INVISIBILITY]: Object.freeze({
      implemented: true,
      frame: Object.freeze({ x: 285, y: 0, w: 55, h: 55 }),
      icon: Object.freeze({ x: 298, y: 12, w: 32, h: 31 }),
      countPocket: Object.freeze({ x: 329, y: 3, w: 10, h: 9 }),
      iconPathByColor: Object.freeze({
        blue: "ui_gamescreen/gs_inventory/gs_inventory_invisible_blue.png",
        green: "ui_gamescreen/gs_inventory/gs_inventory_invisible_green.png",
      }),
    }),
  }),
});

const INVENTORY_ITEMS = INVENTORY_UI_CONFIG.slotOrder.map((type) => {
  const slotConfig = INVENTORY_UI_CONFIG.slots[type] ?? null;
  const fallbackIconPath = slotConfig?.iconPathByColor?.blue ?? slotConfig?.iconPath ?? "";
  return { type, iconPath: fallbackIconPath };
});

const INVENTORY_ICON_ASSET_PATHS = Array.from(new Set(
  INVENTORY_UI_CONFIG.slotOrder.flatMap((type) => {
    const slotConfig = INVENTORY_UI_CONFIG.slots[type] ?? null;
    if(!slotConfig) return [];
    if(slotConfig.iconPathByColor){
      return Object.values(slotConfig.iconPathByColor);
    }
    return slotConfig.iconPath ? [slotConfig.iconPath] : [];
  })
));

const INVENTORY_EMPTY_ICON =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const inventoryState = {
  blue: [],
  green: [],
};

const playerInventoryEffects = {
  blue: {
    invisibilityQueued: false,
    invisibilityWaitingEnemyTurn: false,
    invisibilityActive: false,
    invisibilityFeedbackActive: false,
    invisibilityFeedbackStartAtMs: 0,
    invisibilityFeedbackStepDurationMs: 320,
    invisibilityQueuedAlpha: 1,
  },
  green: {
    invisibilityQueued: false,
    invisibilityWaitingEnemyTurn: false,
    invisibilityActive: false,
    invisibilityFeedbackActive: false,
    invisibilityFeedbackStartAtMs: 0,
    invisibilityFeedbackStepDurationMs: 320,
    invisibilityQueuedAlpha: 1,
  },
};

const INVISIBILITY_FEEDBACK_ALPHA_PHASES = Object.freeze([0.5, 0.9, 0.5, 0.9]);
const INVISIBILITY_FADE_DURATION_MS = 1000;
const INVISIBILITY_MIN_ALPHA = 0;

function getOpponentColor(color){
  return color === "blue" ? "green" : (color === "green" ? "blue" : null);
}

function getPlayerInventoryEffectState(color){
  if(color !== "blue" && color !== "green") return null;
  return playerInventoryEffects[color] ?? null;
}

function clearPlayerInvisibilityEffectState(color){
  const state = getPlayerInventoryEffectState(color);
  if(!state) return;
  state.invisibilityQueued = false;
  state.invisibilityWaitingEnemyTurn = false;
  state.invisibilityActive = false;
  state.invisibilityFeedbackActive = false;
  state.invisibilityFeedbackStartAtMs = 0;
  state.invisibilityQueuedAlpha = 1;
}

function ensurePlaneInvisibilityFadeState(plane){
  if(!plane || typeof plane !== "object") return null;
  if(!Number.isFinite(plane.invisibilityAlphaCurrent)) plane.invisibilityAlphaCurrent = 1;
  if(!Number.isFinite(plane.invisibilityFadeTargetAlpha)) plane.invisibilityFadeTargetAlpha = 1;
  if(!Number.isFinite(plane.invisibilityFadeStartAtMs)) plane.invisibilityFadeStartAtMs = 0;
  if(!Number.isFinite(plane.invisibilityFadeDurationMs) || plane.invisibilityFadeDurationMs <= 0){
    plane.invisibilityFadeDurationMs = INVISIBILITY_FADE_DURATION_MS;
  }
  if(!Number.isFinite(plane.invisibilityFadeStartAlpha)){
    plane.invisibilityFadeStartAlpha = plane.invisibilityAlphaCurrent;
  }
  return plane;
}

function startPlaneInvisibilityFade(plane, targetAlpha){
  const state = ensurePlaneInvisibilityFadeState(plane);
  if(!state) return;
  const clampedTarget = Math.max(0, Math.min(1, targetAlpha));
  const nowMs = performance.now();
  const currentAlpha = getPlaneInvisibilityAlpha(plane, nowMs);
  state.invisibilityFadeStartAlpha = currentAlpha;
  state.invisibilityAlphaCurrent = currentAlpha;
  state.invisibilityFadeTargetAlpha = clampedTarget;
  state.invisibilityFadeStartAtMs = nowMs;
  state.invisibilityFadeDurationMs = INVISIBILITY_FADE_DURATION_MS;
}

function getPlaneInvisibilityAlpha(plane, nowMs = performance.now()){
  const state = ensurePlaneInvisibilityFadeState(plane);
  if(!state) return 1;
  const startAtMs = state.invisibilityFadeStartAtMs;
  const durationMs = Math.max(1, state.invisibilityFadeDurationMs || INVISIBILITY_FADE_DURATION_MS);
  const targetAlpha = Math.max(0, Math.min(1, state.invisibilityFadeTargetAlpha));

  if(startAtMs <= 0){
    state.invisibilityAlphaCurrent = targetAlpha;
    return targetAlpha;
  }

  const elapsedMs = Math.max(0, nowMs - startAtMs);
  const progress = Math.max(0, Math.min(1, elapsedMs / durationMs));
  const startAlpha = Math.max(0, Math.min(1, state.invisibilityFadeStartAlpha));
  const currentAlpha = startAlpha + (targetAlpha - startAlpha) * progress;
  state.invisibilityAlphaCurrent = currentAlpha;

  if(progress >= 1){
    state.invisibilityAlphaCurrent = targetAlpha;
    state.invisibilityFadeStartAtMs = 0;
    state.invisibilityFadeStartAlpha = targetAlpha;
  }

  return state.invisibilityAlphaCurrent;
}

function isInventoryInvisibilityEnabled(){
  return true;
}

function resetAllPlaneInvisibilityToOpaque(){
  for(const plane of points){
    if(!plane) continue;
    startPlaneInvisibilityFade(plane, 1);
  }
}

function startPlayerInvisibilityFeedback(color){
  const state = getPlayerInventoryEffectState(color);
  if(!state) return;
  state.invisibilityFeedbackActive = true;
  state.invisibilityFeedbackStartAtMs = performance.now();
}

function getPlayerInvisibilityFeedbackAlpha(color){
  const state = getPlayerInventoryEffectState(color);
  if(!state) return 1;
  if(state.invisibilityFeedbackActive !== true){
    if(state.invisibilityWaitingEnemyTurn === true){
      return Math.max(0, Math.min(1, state.invisibilityQueuedAlpha));
    }
    return 1;
  }

  const phaseCount = INVISIBILITY_FEEDBACK_ALPHA_PHASES.length;
  const stepDurationMs = Math.max(1, state.invisibilityFeedbackStepDurationMs || 0);
  const elapsedMs = performance.now() - state.invisibilityFeedbackStartAtMs;
  const totalDurationMs = phaseCount * stepDurationMs;

  if(elapsedMs >= totalDurationMs){
    state.invisibilityFeedbackActive = false;
    state.invisibilityFeedbackStartAtMs = 0;
    state.invisibilityQueuedAlpha = state.invisibilityWaitingEnemyTurn === true ? 0.5 : 1;
    if(state.invisibilityWaitingEnemyTurn === true) return state.invisibilityQueuedAlpha;
    return 1;
  }

  const phaseIndex = Math.min(phaseCount - 1, Math.floor(elapsedMs / stepDurationMs));
  const phaseProgress = (elapsedMs - phaseIndex * stepDurationMs) / stepDurationMs;
  const fromAlpha = phaseIndex === 0 ? 1 : INVISIBILITY_FEEDBACK_ALPHA_PHASES[phaseIndex - 1];
  const toAlpha = INVISIBILITY_FEEDBACK_ALPHA_PHASES[phaseIndex];
  return fromAlpha + (toAlpha - fromAlpha) * phaseProgress;
}

function isPlayerInvisibilityActive(color){
  const state = getPlayerInventoryEffectState(color);
  return Boolean(state && state.invisibilityActive === true);
}

function shouldHidePlaneByInvisibility(planeColor){
  if(!isPlayerInvisibilityActive(planeColor)) return false;
  const activeTurnColor = turnColors?.[turnIndex] ?? null;
  return activeTurnColor === getOpponentColor(planeColor);
}

function activateQueuedInvisibilityForEnemyTurn(nextTurnColor){
  if(!isInventoryInvisibilityEnabled()){
    resetPlayerInventoryEffects();
    resetAllPlaneInvisibilityToOpaque();
    return;
  }
  for(const color of ["blue", "green"]){
    const state = getPlayerInventoryEffectState(color);
    if(!state || state.invisibilityWaitingEnemyTurn !== true) continue;
    if(nextTurnColor !== getOpponentColor(color)) continue;
    state.invisibilityActive = true;
    state.invisibilityQueued = false;
    state.invisibilityWaitingEnemyTurn = false;
    state.invisibilityFeedbackActive = false;
    state.invisibilityFeedbackStartAtMs = 0;
    state.invisibilityQueuedAlpha = 1;
    for(const plane of points){
      if(plane?.color !== color) continue;
      startPlaneInvisibilityFade(plane, INVISIBILITY_MIN_ALPHA);
    }
  }
}

function expireInvisibilityAfterEnemyTurnEnded(previousTurnColor){
  if(!isInventoryInvisibilityEnabled()){
    resetPlayerInventoryEffects();
    resetAllPlaneInvisibilityToOpaque();
    return;
  }
  for(const color of ["blue", "green"]){
    const state = getPlayerInventoryEffectState(color);
    if(!state || state.invisibilityActive !== true) continue;
    if(previousTurnColor !== getOpponentColor(color)) continue;
    for(const plane of points){
      if(plane?.color !== color) continue;
      startPlaneInvisibilityFade(plane, 1);
    }
    clearPlayerInvisibilityEffectState(color);
  }
}

const inventoryHintState = {
  blue: {
    color: "blue",
    text: "",
    visible: false,
    anchorX: 0,
    anchorY: 0,
    timeoutId: null,
  },
  green: {
    color: "green",
    text: "",
    visible: false,
    anchorX: 0,
    anchorY: 0,
    timeoutId: null,
  },
};

const INVENTORY_DISABLED_HINT_TEXT = "";
const INVENTORY_SELECTED_HINT_TEXT = "";
const INVENTORY_SELECTION_CANCEL_HINT_TEXT = "";

const INVENTORY_TOOLTIP_TEXT_BY_TYPE = Object.freeze({
  [INVENTORY_ITEM_TYPES.CROSSHAIR]: [
    "Install on your plane.",
    "Full precision!",
  ],
  [INVENTORY_ITEM_TYPES.FUEL]: [
    "Install on your plane.",
    "Flight range doubled!",
  ],
  [INVENTORY_ITEM_TYPES.WINGS]: [
    "Install on your plane.",
    "Impact area doubled!",
  ],
  [INVENTORY_ITEM_TYPES.MINE]: [
    "Place on the field.",
    "Handle with care!",
  ],
  [INVENTORY_ITEM_TYPES.DYNAMITE]: [
    "Place on a brick.",
    "Destroy it instantly!",
  ],
  [INVENTORY_ITEM_TYPES.INVISIBILITY]: [
    "Place on the field.",
    "Hide next enemy turn!",
  ],
});

const INVENTORY_TOOLTIP_FIXED_RECT = Object.freeze({
  blue: Object.freeze({
    y: 22,
    width: 166,
    height: 48,
    xBySlotIndex: Object.freeze([127, 184, 241, 70, 127, 184]),
  }),
  green: Object.freeze({
    y: 736,
    width: 166,
    height: 48,
    xBySlotIndex: Object.freeze([127, 184, 241, 70, 127, 184]),
  }),
});

const inventoryTooltipState = {
  element: null,
  layer: null,
  activeSlotIndex: null,
  activeSlotColor: null,
  previewTarget: null,
  previewTimeoutId: null,
  previewPointerOrigin: null,
  pendingClearTimeoutId: null,
  pendingClearOnTransitionEnd: null,
};

const INVENTORY_TOOLTIP_LAYOUT_DEFAULTS = Object.freeze({
  anchorMode: "adjacent",
  sideSwitchSlotIndex: 2,
  offsetXPx: 0,
  offsetYPx: 0,
});

const INVENTORY_TOOLTIP_STYLE_DEFAULTS = Object.freeze({
  fontFamily: '"Palatino Linotype", Palatino, "Book Antiqua", serif',
  fontWeight: "700",
  fontSize: "12px",
  lineHeight: "1.4",
  maxWidth: "240px",
  padding: "8px 12px",
});

const inventoryTooltipRuntimeConfig = {
  layout: { ...INVENTORY_TOOLTIP_LAYOUT_DEFAULTS },
  styles: { ...INVENTORY_TOOLTIP_STYLE_DEFAULTS },
};

applyInventoryTooltipRuntimeStyles();

const INVENTORY_TOOLTIP_MOUSE_MOVE_DISMISS_THRESHOLD_PX = 8;

const inventoryHosts = {
  blue: blueInventoryHost,
  green: greenInventoryHost,
};

const inventorySlotItemElementByColor = {
  blue: new Map(),
  green: new Map(),
};

const INVENTORY_CONSUME_FX_CLASS = "inventory-item--consume-fx";
const INVENTORY_CONSUME_FX_DURATION_MS = 340;

function getInventorySlotItemElement(color, type){
  if(!color || !type) return null;
  const host = inventoryHosts[color];
  if(!(host instanceof HTMLElement)) return null;

  const cache = inventorySlotItemElementByColor[color];
  if(cache instanceof Map){
    const cachedElement = cache.get(type);
    if(cachedElement instanceof HTMLElement && host.contains(cachedElement)){
      return cachedElement;
    }
  }

  const selector = `.inventory-slot[data-slot-color="${color}"][data-slot-type="${type}"] .inventory-item`;
  const item = host.querySelector(selector);
  if(item instanceof HTMLElement && cache instanceof Map){
    cache.set(type, item);
  }
  return item instanceof HTMLElement ? item : null;
}

function playInventoryConsumeFx(color, itemType){
  const itemElement = getInventorySlotItemElement(color, itemType);
  if(!(itemElement instanceof HTMLElement)){
    logAiDecision("inventory_fx_played", {
      color,
      itemType,
      result: "failed",
      reason: "slot_item_not_found",
    });
    return false;
  }

  if(itemElement.dataset.consumeFxTimeoutId){
    const previousTimeoutId = Number.parseInt(itemElement.dataset.consumeFxTimeoutId, 10);
    if(Number.isFinite(previousTimeoutId)){
      clearTimeout(previousTimeoutId);
    }
  }

  itemElement.classList.remove(INVENTORY_CONSUME_FX_CLASS);
  void itemElement.offsetWidth;
  itemElement.classList.add(INVENTORY_CONSUME_FX_CLASS);

  const timeoutId = setTimeout(() => {
    itemElement.classList.remove(INVENTORY_CONSUME_FX_CLASS);
    delete itemElement.dataset.consumeFxTimeoutId;
  }, INVENTORY_CONSUME_FX_DURATION_MS);
  itemElement.dataset.consumeFxTimeoutId = String(timeoutId);

  logAiDecision("inventory_fx_played", {
    color,
    itemType,
    result: "ok",
    durationMs: INVENTORY_CONSUME_FX_DURATION_MS,
  });
  return true;
}

function ensureInventoryTooltipElement(){
  if(inventoryTooltipState.element instanceof HTMLElement){
    return inventoryTooltipState.element;
  }
  const tooltipLayerParent = gsFrameLayer instanceof HTMLElement
    ? gsFrameLayer
    : (inventoryLayer instanceof HTMLElement ? inventoryLayer : null);
  if(!(tooltipLayerParent instanceof HTMLElement)) return null;

  let tooltipLayer = inventoryTooltipState.layer;
  if(!(tooltipLayer instanceof HTMLElement) || tooltipLayer.parentElement !== tooltipLayerParent){
    tooltipLayer = document.createElement("div");
    tooltipLayer.className = "inventory-tooltip-layer";
    tooltipLayer.setAttribute("aria-hidden", "true");
    tooltipLayerParent.appendChild(tooltipLayer);
    inventoryTooltipState.layer = tooltipLayer;
  }

  const tooltip = document.createElement("div");
  tooltip.className = "inventory-tooltip";
  tooltip.setAttribute("aria-hidden", "true");
  tooltipLayer.appendChild(tooltip);
  inventoryTooltipState.element = tooltip;
  return tooltip;
}

function toInventoryTooltipLayerPoint(point){
  if(!point || typeof window === "undefined") return point;
  if(!(gsFrameLayer instanceof HTMLElement) || !(gsFrameEl instanceof HTMLElement)) return point;
  const stageRect = gsFrameLayer.getBoundingClientRect();
  const containerRect = gsFrameEl.getBoundingClientRect();
  if(!Number.isFinite(stageRect.left) || !Number.isFinite(containerRect.left)) return point;
  return {
    ...point,
    x: point.x + (containerRect.left - stageRect.left),
    y: point.y + (containerRect.top - stageRect.top),
  };
}

function resolveInventoryTooltipSlot(target){
  if(!target?.color || !target?.type) return null;
  const host = inventoryHosts[target.color];
  if(!(host instanceof HTMLElement)) return null;
  const selector = `.inventory-slot[data-slot-color="${target.color}"][data-slot-type="${target.type}"]`;
  const slot = host.querySelector(selector);
  return slot instanceof HTMLElement ? slot : null;
}

function getInventorySlotsForColor(color){
  const host = inventoryHosts[color];
  if(!(host instanceof HTMLElement)) return [];
  const slots = Array.from(host.querySelectorAll(`.inventory-slot[data-slot-color="${color}"]`));
  return slots
    .filter((slot) => slot instanceof HTMLElement)
    .sort((a, b) => {
      const aIndexRaw = Number.parseInt(a.dataset.slotIndex ?? "", 10);
      const bIndexRaw = Number.parseInt(b.dataset.slotIndex ?? "", 10);
      const aIndex = Number.isFinite(aIndexRaw) ? aIndexRaw : 0;
      const bIndex = Number.isFinite(bIndexRaw) ? bIndexRaw : 0;
      return aIndex - bIndex;
    });
}

function getInventoryTooltipAnchorLeftPx(slotRects, slotIndex, tooltipWidth, options = {}){
  if(!Array.isArray(slotRects) || slotRects.length === 0) return 0;
  const maxIndex = slotRects.length - 1;
  const clampedIndex = Math.max(0, Math.min(maxIndex, slotIndex));
  const sideSwitchSlotIndexRaw = Number.parseInt(options.sideSwitchSlotIndex, 10);
  const sideSwitchSlotIndex = Number.isFinite(sideSwitchSlotIndexRaw)
    ? Math.max(0, Math.min(maxIndex, sideSwitchSlotIndexRaw))
    : 2;
  const anchorMode = options.anchorMode === "self" ? "self" : "adjacent";
  const activeRect = slotRects[clampedIndex];

  if(clampedIndex <= sideSwitchSlotIndex){
    if(anchorMode === "self"){
      return Number(activeRect?.left) || 0;
    }
    const nextIndex = Math.min(maxIndex, clampedIndex + 1);
    const nextRect = slotRects[nextIndex] ?? slotRects[clampedIndex];
    return Number(nextRect?.left) || 0;
  }
  if(anchorMode === "self"){
    const activeRight = Number(activeRect?.right) || 0;
    return activeRight - tooltipWidth;
  }
  const prevIndex = Math.max(0, clampedIndex - 1);
  const prevRect = slotRects[prevIndex] ?? slotRects[clampedIndex];
  const prevRight = Number(prevRect?.right) || 0;
  return prevRight - tooltipWidth;
}

function applyInventoryTooltipRuntimeStyles(){
  if(typeof document === "undefined") return;
  const root = document.documentElement;
  if(!(root instanceof HTMLElement)) return;
  root.style.setProperty("--inventory-tooltip-font-family", inventoryTooltipRuntimeConfig.styles.fontFamily);
  root.style.setProperty("--inventory-tooltip-font-weight", inventoryTooltipRuntimeConfig.styles.fontWeight);
  root.style.setProperty("--inventory-tooltip-font-size", inventoryTooltipRuntimeConfig.styles.fontSize);
  root.style.setProperty("--inventory-tooltip-line-height", inventoryTooltipRuntimeConfig.styles.lineHeight);
  root.style.setProperty("--inventory-tooltip-max-width", inventoryTooltipRuntimeConfig.styles.maxWidth);
  root.style.setProperty("--inventory-tooltip-padding", inventoryTooltipRuntimeConfig.styles.padding);
}

function isInventoryTooltipAnchorModeSupported(value){
  return value === "adjacent" || value === "self";
}

function setInventoryTooltipLayoutConfig(partialConfig = {}){
  if(!partialConfig || typeof partialConfig !== "object") return false;
  let changed = false;
  if(Object.hasOwn(partialConfig, "anchorMode") && isInventoryTooltipAnchorModeSupported(partialConfig.anchorMode)){
    inventoryTooltipRuntimeConfig.layout.anchorMode = partialConfig.anchorMode;
    changed = true;
  }
  if(Object.hasOwn(partialConfig, "sideSwitchSlotIndex")){
    const parsed = Number.parseInt(partialConfig.sideSwitchSlotIndex, 10);
    if(Number.isFinite(parsed)){
      inventoryTooltipRuntimeConfig.layout.sideSwitchSlotIndex = Math.max(0, Math.min(5, parsed));
      changed = true;
    }
  }
  if(Object.hasOwn(partialConfig, "offsetXPx")){
    const parsed = Number(partialConfig.offsetXPx);
    if(Number.isFinite(parsed)){
      inventoryTooltipRuntimeConfig.layout.offsetXPx = Math.round(parsed);
      changed = true;
    }
  }
  if(Object.hasOwn(partialConfig, "offsetYPx")){
    const parsed = Number(partialConfig.offsetYPx);
    if(Number.isFinite(parsed)){
      inventoryTooltipRuntimeConfig.layout.offsetYPx = Math.round(parsed);
      changed = true;
    }
  }
  if(changed){
    refreshInventoryTooltip();
  }
  return changed;
}

function setInventoryTooltipStyleConfig(partialStyles = {}){
  if(!partialStyles || typeof partialStyles !== "object") return false;
  let changed = false;
  const styleEntries = [
    ["fontFamily", "fontFamily"],
    ["fontWeight", "fontWeight"],
    ["fontSize", "fontSize"],
    ["lineHeight", "lineHeight"],
    ["maxWidth", "maxWidth"],
    ["padding", "padding"],
  ];
  for(const [key, targetKey] of styleEntries){
    if(!Object.hasOwn(partialStyles, key)) continue;
    const nextValue = String(partialStyles[key] ?? "").trim();
    if(!nextValue) continue;
    inventoryTooltipRuntimeConfig.styles[targetKey] = nextValue;
    changed = true;
  }
  if(changed){
    applyInventoryTooltipRuntimeStyles();
    refreshInventoryTooltip();
  }
  return changed;
}

function resetInventoryTooltipRuntimeConfig(){
  inventoryTooltipRuntimeConfig.layout = { ...INVENTORY_TOOLTIP_LAYOUT_DEFAULTS };
  inventoryTooltipRuntimeConfig.styles = { ...INVENTORY_TOOLTIP_STYLE_DEFAULTS };
  applyInventoryTooltipRuntimeStyles();
  refreshInventoryTooltip();
}

function getInventoryTooltipRuntimeConfig(){
  return {
    layout: { ...inventoryTooltipRuntimeConfig.layout },
    styles: { ...inventoryTooltipRuntimeConfig.styles },
  };
}

function getInventoryTooltipTarget(){
  const activeItem = getInventoryInteractionActiveItem();
  if(activeItem?.color && activeItem?.type && inventoryInteractionState.mode !== "idle"){
    return activeItem;
  }
  const previewTarget = inventoryTooltipState.previewTarget;
  if(previewTarget?.color && previewTarget?.type){
    return previewTarget;
  }
  return null;
}

function clearInventoryTooltipPreview(){
  inventoryTooltipState.previewTarget = null;
  inventoryTooltipState.previewPointerOrigin = null;
  if(inventoryTooltipState.previewTimeoutId){
    clearTimeout(inventoryTooltipState.previewTimeoutId);
    inventoryTooltipState.previewTimeoutId = null;
  }
}

function showInventoryTooltipForSlot(color, type, options = {}){
  const lines = INVENTORY_TOOLTIP_TEXT_BY_TYPE[type];
  const slot = resolveInventoryTooltipSlot({ color, type });
  if(!Array.isArray(lines) || lines.length !== 2 || !(slot instanceof HTMLElement)){
    clearInventoryTooltipPreview();
    refreshInventoryTooltip();
    return;
  }
  clearInventoryTooltipPreview();
  inventoryTooltipState.previewTarget = { color, type };
  const pointerX = Number(options.pointerX);
  const pointerY = Number(options.pointerY);
  if(Number.isFinite(pointerX) && Number.isFinite(pointerY)){
    inventoryTooltipState.previewPointerOrigin = { x: pointerX, y: pointerY };
  }
  refreshInventoryTooltip();

  const autoHideMsRaw = Number(options.autoHideMs);
  const autoHideMs = Number.isFinite(autoHideMsRaw) ? autoHideMsRaw : 5000;
  if(autoHideMs > 0){
    inventoryTooltipState.previewTimeoutId = setTimeout(() => {
      clearInventoryTooltipPreview();
      refreshInventoryTooltip();
    }, autoHideMs);
  }
}

function cancelInventoryTooltipDeferredClear(tooltip){
  if(inventoryTooltipState.pendingClearTimeoutId){
    clearTimeout(inventoryTooltipState.pendingClearTimeoutId);
    inventoryTooltipState.pendingClearTimeoutId = null;
  }
  if(
    tooltip instanceof HTMLElement
    && typeof inventoryTooltipState.pendingClearOnTransitionEnd === "function"
  ){
    tooltip.removeEventListener("transitionend", inventoryTooltipState.pendingClearOnTransitionEnd);
  }
  inventoryTooltipState.pendingClearOnTransitionEnd = null;
}

function parseCssTimeToMs(rawValue){
  const value = String(rawValue ?? "").trim();
  if(!value) return 0;
  if(value.endsWith("ms")) return Number.parseFloat(value) || 0;
  if(value.endsWith("s")) return (Number.parseFloat(value) || 0) * 1000;
  return Number.parseFloat(value) || 0;
}

function getInventoryTooltipOpacityFadeOutMs(tooltip){
  if(!(tooltip instanceof HTMLElement) || typeof window === "undefined") return 0;
  const styles = window.getComputedStyle(tooltip);
  const properties = styles.transitionProperty.split(",").map((item) => item.trim());
  const durations = styles.transitionDuration.split(",").map(parseCssTimeToMs);
  const delays = styles.transitionDelay.split(",").map(parseCssTimeToMs);
  const propertyIndex = properties.findIndex((property) => property === "opacity" || property === "all");
  const safeIndex = propertyIndex >= 0 ? propertyIndex : 0;
  const duration = durations[safeIndex] ?? durations[0] ?? 0;
  const delay = delays[safeIndex] ?? delays[0] ?? 0;
  return Math.max(0, duration + delay);
}

function deferInventoryTooltipTextClear(tooltip){
  if(!(tooltip instanceof HTMLElement)) return;
  cancelInventoryTooltipDeferredClear(tooltip);
  const clearText = () => {
    if(tooltip.classList.contains("is-visible")) return;
    tooltip.textContent = "";
    cancelInventoryTooltipDeferredClear(tooltip);
  };
  const transitionHandler = (event) => {
    if(event.propertyName !== "opacity") return;
    clearText();
  };
  inventoryTooltipState.pendingClearOnTransitionEnd = transitionHandler;
  tooltip.addEventListener("transitionend", transitionHandler);

  const fallbackMs = getInventoryTooltipOpacityFadeOutMs(tooltip) + 16;
  inventoryTooltipState.pendingClearTimeoutId = setTimeout(clearText, fallbackMs);
}

function refreshInventoryTooltip(){
  const tooltip = ensureInventoryTooltipElement();
  if(!(tooltip instanceof HTMLElement)) return;
  const target = getInventoryTooltipTarget();
  if(!target){
    inventoryTooltipState.activeSlotIndex = null;
    inventoryTooltipState.activeSlotColor = null;
    tooltip.classList.remove("is-visible");
    deferInventoryTooltipTextClear(tooltip);
    return;
  }
  const lines = INVENTORY_TOOLTIP_TEXT_BY_TYPE[target.type];
  const slot = resolveInventoryTooltipSlot(target);
  if(!Array.isArray(lines) || lines.length !== 2 || !(slot instanceof HTMLElement)){
    inventoryTooltipState.activeSlotIndex = null;
    inventoryTooltipState.activeSlotColor = null;
    tooltip.classList.remove("is-visible");
    deferInventoryTooltipTextClear(tooltip);
    return;
  }
  cancelInventoryTooltipDeferredClear(tooltip);
  tooltip.textContent = `${lines[0]}\n${lines[1]}`;

  const slotIndexRaw = Number.parseInt(slot.dataset.slotIndex ?? "", 10);
  const slotIndex = Number.isFinite(slotIndexRaw) ? slotIndexRaw : 0;
  const slotColor = target.color;
  const fixedRectConfig = INVENTORY_TOOLTIP_FIXED_RECT[slotColor];
  const slotX = Number(fixedRectConfig?.xBySlotIndex?.[slotIndex]);
  const tooltipLeft = Number.isFinite(slotX) ? slotX : 0;
  const tooltipTop = Number.isFinite(fixedRectConfig?.y) ? fixedRectConfig.y : 0;
  const tooltipWidth = Number.isFinite(fixedRectConfig?.width) ? fixedRectConfig.width : 166;
  const tooltipHeight = Number.isFinite(fixedRectConfig?.height) ? fixedRectConfig.height : 48;

  inventoryTooltipState.activeSlotIndex = slotIndex;
  inventoryTooltipState.activeSlotColor = slotColor;

  tooltip.style.left = `${Math.round(tooltipLeft)}px`;
  tooltip.style.top = `${Math.round(tooltipTop)}px`;
  tooltip.style.width = `${Math.round(tooltipWidth)}px`;
  tooltip.style.height = `${Math.round(tooltipHeight)}px`;
  tooltip.style.maxWidth = `${Math.round(tooltipWidth)}px`;
  tooltip.classList.remove("is-left", "is-right");
  tooltip.classList.add("is-right");
  tooltip.classList.toggle(
    "inventory-tooltip--invisibility",
    target.type === INVENTORY_ITEM_TYPES.INVISIBILITY,
  );
  tooltip.classList.add("is-visible");
}

let nuclearStrikeHideTimeoutId = null;
let activeInventoryDrag = null;
let inventoryPickupUiSyncRafId = null;
let pendingInventoryUse = null;
const INVENTORY_PICKUP_DRAG_THRESHOLD_PX = 5;
const MAP_EDITOR_BRICK_PICKUP_DRAG_THRESHOLD_PX = 5;
const inventoryInteractionState = {
  mode: "idle",
  activeItem: null,
  pointerId: null,
  downPoint: null,
  movedPx: 0,
};

const MAP_EDITOR_BRICK_OVERLAP_RULE = "forbid"; // map editor rule: only one brick per grid cell

const mapEditorBrickInteractionState = {
  mode: "idle",
  source: null,
  activeSpriteConfig: null,
  activeSpriteIndex: null,
  pointerId: null,
  downPoint: null,
  movedPx: 0,
  previewClientX: null,
  previewClientY: null,
  previewBoardX: null,
  previewBoardY: null,
  previewCellX: null,
  previewCellY: null,
  previewInsideField: false,
  previewCellOccupied: false,
};

function scheduleInventoryUiSync(){
  if(inventoryPickupUiSyncRafId !== null) return;
  inventoryPickupUiSyncRafId = requestAnimationFrame(() => {
    inventoryPickupUiSyncRafId = null;
    syncInventoryUI("blue");
    syncInventoryUI("green");
  });
}

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

function cancelActiveInventoryDrag(reason = "cancel"){
  resetInventoryDragFallbackGhost();
  if (!activeInventoryDrag) return;
  if (!activeInventoryDrag.consumed && DEBUG_NUKE) {
    console.log(`[NUKE] drag ${reason}`);
  }
  activeInventoryDrag = null;
  if(nuclearStrikeStage === NUCLEAR_STRIKE_STAGES.DRAGGING){
    transitionNuclearStrikeStage(NUCLEAR_STRIKE_STAGES.IDLE, { reason });
  }
}

function setInventoryInteractionState(mode, activeItem){
  clearInventoryTooltipPreview();
  inventoryInteractionState.mode = mode;
  inventoryInteractionState.activeItem = activeItem
    ? {
      color: activeItem.color,
      type: activeItem.type,
      usageTarget: activeItem.usageTarget,
    }
    : null;
  refreshInventoryTooltip();
}

function clearInventoryInteractionPointer(){
  inventoryInteractionState.pointerId = null;
  inventoryInteractionState.downPoint = null;
  inventoryInteractionState.movedPx = 0;
}

function getInventoryInteractionActiveItem(){
  return inventoryInteractionState.activeItem;
}

function clearInventoryHoverState(_color){
  // Hover-driven inventory tooltips were intentionally removed.
  // Keep this function as a compatibility no-op because sync/reset flows
  // still call it while rebuilding inventory UI.
}

function cancelActiveInventoryPickup(){
  setInventoryInteractionState("idle", null);
  clearInventoryInteractionPointer();
  resetInventoryDragFallbackGhost();
  clearInventoryHoverState("blue");
  clearInventoryHoverState("green");
  syncInventoryUI("blue");
  syncInventoryUI("green");
}

function showInventorySelectionCancelHint(color){
  const state = inventoryHintState[color];
  if(!state) return;
  state.text = INVENTORY_SELECTION_CANCEL_HINT_TEXT;
  state.visible = true;
  state.anchorX = INVENTORY_UI_CONFIG.containerSize.w / 2;
  state.anchorY = color === "blue"
    ? INVENTORY_UI_CONFIG.containers.blue.y + INVENTORY_UI_CONFIG.containerSize.h / 2
    : INVENTORY_UI_CONFIG.containers.green.y + INVENTORY_UI_CONFIG.containerSize.h / 2;
  if(state.timeoutId){
    clearTimeout(state.timeoutId);
  }
  state.timeoutId = setTimeout(() => {
    state.visible = false;
    state.text = "";
    state.timeoutId = null;
  }, 800);
}

function resetInventoryInteractionState(){
  resetInventoryDragFallbackGhost();
  activeInventoryDrag = null;
  setInventoryInteractionState("idle", null);
  clearInventoryInteractionPointer();
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

function queueInvisibilityEffectForPlayer(color){
  if(!isInventoryInvisibilityEnabled()){
    resetPlayerInventoryEffects();
    resetAllPlaneInvisibilityToOpaque();
    return false;
  }
  const state = getPlayerInventoryEffectState(color);
  if(!state) return false;
  state.invisibilityQueued = true;
  state.invisibilityWaitingEnemyTurn = true;
  state.invisibilityActive = false;
  state.invisibilityQueuedAlpha = 0.5;
  startPlayerInvisibilityFeedback(color);
  return true;
}

function resetPlayerInventoryEffects(){
  clearPlayerInvisibilityEffectState("blue");
  clearPlayerInvisibilityEffectState("green");
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
  if(
    type === INVENTORY_ITEM_TYPES.CROSSHAIR
    || type === INVENTORY_ITEM_TYPES.FUEL
    || type === INVENTORY_ITEM_TYPES.WINGS
  ){
    if(!plane.activeTurnBuffs || typeof plane.activeTurnBuffs !== "object"){
      plane.activeTurnBuffs = {};
    }

    if(type === INVENTORY_ITEM_TYPES.WINGS && plane.activeTurnBuffs[type] === true){
      // Повторное применение обновляет эффект до 1 хода (текущая модель баффов = флаг на ход).
      plane.activeTurnBuffs[type] = true;
      return true;
    }

    plane.activeTurnBuffs[type] = true;
    return true;
  }

  return false;
}

function getPlaneActiveTurnBuffs(plane){
  const activeEffectTypes = [];

  if(plane?.activeTurnBuffs && typeof plane.activeTurnBuffs === "object"){
    activeEffectTypes.push(...Object.keys(plane.activeTurnBuffs).filter((type) =>
      plane.activeTurnBuffs[type] === true
      && (
        type === INVENTORY_ITEM_TYPES.CROSSHAIR
        || type === INVENTORY_ITEM_TYPES.FUEL
        || type === INVENTORY_ITEM_TYPES.WINGS
      )
    ));
  }

  const planeColor = plane?.color;
  if(
    (planeColor === "blue" || planeColor === "green")
    && isPlayerInvisibilityActive(planeColor)
    && !activeEffectTypes.includes(INVENTORY_ITEM_TYPES.INVISIBILITY)
  ){
    activeEffectTypes.push(INVENTORY_ITEM_TYPES.INVISIBILITY);
  }

  return activeEffectTypes;
}

function planeHasActiveTurnBuff(plane, type){
  if(!type) return false;
  return getPlaneActiveTurnBuffs(plane).includes(type);
}

const PLANE_GEOMETRY_TRUTH = {
  DANGER_HITBOX_WIDTH: 36,
  BENEFICIAL_HITBOX_WIDTH_WITH_WINGS: 96,
  HITBOX_HEIGHT: 36,
};

function getPlaneDangerGeometry(plane){
  const width = PLANE_GEOMETRY_TRUTH.DANGER_HITBOX_WIDTH;
  const height = PLANE_GEOMETRY_TRUTH.HITBOX_HEIGHT;
  return {
    radius: POINT_RADIUS,
    hitbox: {
      x: plane.x,
      y: plane.y,
      width,
      height,
      left: plane.x - width / 2,
      right: plane.x + width / 2,
      top: plane.y - height / 2,
      bottom: plane.y + height / 2
    }
  };
}

function getPlaneBeneficialGeometry(plane){
  const hasWingsBuff = planeHasActiveTurnBuff(plane, INVENTORY_ITEM_TYPES.WINGS);
  const width = hasWingsBuff
    ? PLANE_GEOMETRY_TRUTH.BENEFICIAL_HITBOX_WIDTH_WITH_WINGS
    : PLANE_GEOMETRY_TRUTH.DANGER_HITBOX_WIDTH;
  const height = PLANE_GEOMETRY_TRUTH.HITBOX_HEIGHT;
  return {
    radius: POINT_RADIUS,
    hitbox: {
      x: plane.x,
      y: plane.y,
      width,
      height,
      left: plane.x - width / 2,
      right: plane.x + width / 2,
      top: plane.y - height / 2,
      bottom: plane.y + height / 2
    }
  };
}

function getPlaneDangerHitbox(plane){
  return getPlaneDangerGeometry(plane).hitbox;
}

function getPlaneBeneficialHitbox(plane){
  return getPlaneBeneficialGeometry(plane).hitbox;
}

function getPlaneHitbox(plane){
  return getPlaneDangerHitbox(plane);
}

function getPlaneBeneficialInteractionZone(plane){
  const hitbox = getPlaneBeneficialGeometry(plane).hitbox;
  const baseHalfWidth = PLANE_GEOMETRY_TRUTH.DANGER_HITBOX_WIDTH / 2;
  const baseHalfHeight = PLANE_GEOMETRY_TRUTH.HITBOX_HEIGHT / 2;
  const halfWidth = Math.max(0, hitbox.width / 2 - baseHalfWidth);
  const halfHeight = Math.max(0, hitbox.height / 2 - baseHalfHeight);

  return {
    x: plane.x,
    y: plane.y,
    left: plane.x - halfWidth,
    right: plane.x + halfWidth,
    top: plane.y - halfHeight,
    bottom: plane.y + halfHeight,
  };
}

function doesPlaneZoneIntersectTargetZone(plane, target){
  if(!plane || !target?.anchor || !Number.isFinite(target.radius)) return false;

  const zone = getPlaneBeneficialInteractionZone(plane);
  const closestX = Math.max(zone.left, Math.min(target.anchor.x, zone.right));
  const closestY = Math.max(zone.top, Math.min(target.anchor.y, zone.bottom));
  const dx = target.anchor.x - closestX;
  const dy = target.anchor.y - closestY;

  return dx * dx + dy * dy < target.radius * target.radius;
}

function planeHitboxesIntersect(a, b){
  return a.left < b.right
    && a.right > b.left
    && a.top < b.bottom
    && a.bottom > b.top;
}

function getPlaneHitContactPoint(attackerPlane, targetPlane){
  const targetHitbox = getPlaneBeneficialGeometry(targetPlane).hitbox;
  const clampedX = Math.max(targetHitbox.left, Math.min(attackerPlane.x, targetHitbox.right));
  const clampedY = Math.max(targetHitbox.top, Math.min(attackerPlane.y, targetHitbox.bottom));

  if(
    clampedX === attackerPlane.x
    && clampedY === attackerPlane.y
    && attackerPlane.x >= targetHitbox.left
    && attackerPlane.x <= targetHitbox.right
    && attackerPlane.y >= targetHitbox.top
    && attackerPlane.y <= targetHitbox.bottom
  ){
    return { x: targetPlane.x, y: targetPlane.y };
  }

  return { x: clampedX, y: clampedY };
}

function clearPlaneActiveTurnBuffs(plane){
  if(!plane) return;
  plane.activeTurnBuffs = {};
}

function getEffectiveFlightRangeCells(plane){
  const baseRange = settings.flightRangeCells;
  if(planeHasActiveTurnBuff(plane, INVENTORY_ITEM_TYPES.FUEL)){
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

let sharedInventoryDragPreview = null;
let inventoryDragFallbackGhost = null;
let inventoryDragFallbackActive = false;
let isInventoryPointerHidden = false;
// Safe early defaults to avoid touching mineSizeRuntime before its declaration.
let inventoryDragFallbackWidth = 30;
let inventoryDragFallbackHeight = 30;
let inventoryDragImageMarkedUnstable = false;
const MINE_INVENTORY_ICON_PATH = "ui_gamescreen/gs_inventory/gs_inventory_mine.png";

function getInventoryIconPathForSlot(type, color){
  const slotConfig = INVENTORY_UI_CONFIG.slots[type] ?? null;
  if(!slotConfig) return "";
  if(slotConfig.iconPathByColor){
    return slotConfig.iconPathByColor[color] || slotConfig.iconPathByColor.blue || "";
  }
  return slotConfig.iconPath || "";
}

function getInventoryDragFallbackGhost(){
  if(inventoryDragFallbackGhost instanceof HTMLElement){
    return inventoryDragFallbackGhost;
  }
  const ghost = document.createElement("div");
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.position = "fixed";
  ghost.style.left = "0";
  ghost.style.top = "0";
  ghost.style.width = `${mineSizeRuntime.SCREEN_PX}px`;
  ghost.style.height = `${mineSizeRuntime.SCREEN_PX}px`;
  ghost.style.pointerEvents = "none";
  ghost.style.opacity = "0";
  ghost.style.visibility = "hidden";
  ghost.style.zIndex = "2147483647";
  ghost.style.backgroundSize = "contain";
  ghost.style.backgroundPosition = "center";
  ghost.style.backgroundRepeat = "no-repeat";
  ghost.style.transform = "translate3d(-10000px, -10000px, 0)";
  document.body.appendChild(ghost);
  inventoryDragFallbackGhost = ghost;
  return ghost;
}

function detectProblematicDragImageConditions(event){
  if(isPointerPickupPrimaryMode()) return true;
  const transfer = event?.dataTransfer;
  if(!transfer || typeof transfer.setDragImage !== "function") return true;
  const nav = typeof navigator !== "undefined" ? navigator : null;
  const hasTouchPoints = Boolean(nav && Number.isFinite(nav.maxTouchPoints) && nav.maxTouchPoints > 0);
  const coarsePointer = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
  const ua = (nav?.userAgent || "").toLowerCase();
  const isAppleMobileLike = ua.includes("iphone")
    || ua.includes("ipad")
    || ua.includes("ipod")
    || (ua.includes("macintosh") && hasTouchPoints);
  const isWebKitBrowser = ua.includes("applewebkit")
    && !ua.includes("crios")
    && !ua.includes("fxios")
    && !ua.includes("edgios");
  return inventoryDragImageMarkedUnstable || (isAppleMobileLike && isWebKitBrowser && (hasTouchPoints || coarsePointer));
}

function hasPointerEventsSupport(){
  return typeof window !== "undefined" && "PointerEvent" in window;
}

function hasCoarsePointerPreference(){
  if(typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const anyCoarsePointer = window.matchMedia("(any-pointer: coarse)").matches;
  return coarsePointer || anyCoarsePointer;
}

function isPointerPickupPrimaryMode(){
  return hasPointerEventsSupport() && hasCoarsePointerPreference();
}

function shouldUseLegacyDragDropFallback(){
  return !isPointerPickupPrimaryMode();
}

function updateInventoryDragFallbackPosition(clientX, clientY){
  if(!inventoryDragFallbackActive) return;
  if(!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  const ghost = getInventoryDragFallbackGhost();
  const halfWidth = inventoryDragFallbackWidth / 2;
  const halfHeight = inventoryDragFallbackHeight / 2;
  const drawX = Math.round(clientX - halfWidth);
  const drawY = Math.round(clientY - halfHeight);
  ghost.style.transform = `translate3d(${drawX}px, ${drawY}px, 0)`;
}

function setInventoryPointerHidden(isHidden){
  const hidden = Boolean(isHidden);
  if(hidden === isInventoryPointerHidden) return;
  isInventoryPointerHidden = hidden;
  document.body?.classList.toggle("inventory-pointer-hidden", hidden);
}

function releaseInventoryPointerFromMapEditorInteraction(){
  setInventoryPointerHidden(false);
  if(inventoryDragFallbackActive || activeInventoryDrag){
    setInventoryPointerHidden(true);
  }
}

function activateInventoryDragFallback(target, clientX, clientY, type, options = {}){
  const ghost = getInventoryDragFallbackGhost();
  const width = Number.isFinite(options.width) && options.width > 0
    ? options.width
    : mineSizeRuntime.SCREEN_PX;
  const height = Number.isFinite(options.height) && options.height > 0
    ? options.height
    : mineSizeRuntime.SCREEN_PX;
  inventoryDragFallbackWidth = width;
  inventoryDragFallbackHeight = height;
  ghost.style.width = `${Math.round(width)}px`;
  ghost.style.height = `${Math.round(height)}px`;
  const src = type === INVENTORY_ITEM_TYPES.MINE
    ? MINE_INVENTORY_ICON_PATH
    : (target instanceof HTMLImageElement ? (target.currentSrc || target.src || "") : "");
  ghost.style.backgroundImage = src ? `url("${src}")` : "none";
  ghost.style.visibility = "visible";
  ghost.style.opacity = "0.88";
  inventoryDragFallbackActive = true;
  setInventoryPointerHidden(true);
  updateInventoryDragFallbackPosition(clientX, clientY);
}

function resetInventoryDragFallbackGhost(){
  inventoryDragFallbackActive = false;
  setInventoryPointerHidden(false);
  inventoryDragFallbackWidth = mineSizeRuntime.SCREEN_PX;
  inventoryDragFallbackHeight = mineSizeRuntime.SCREEN_PX;
  if(!(inventoryDragFallbackGhost instanceof HTMLElement)) return;
  inventoryDragFallbackGhost.style.opacity = "0";
  inventoryDragFallbackGhost.style.visibility = "hidden";
  inventoryDragFallbackGhost.style.backgroundImage = "none";
  inventoryDragFallbackGhost.style.transform = "translate3d(-10000px, -10000px, 0)";
}

function getSharedInventoryDragPreview(){
  if(!(sharedInventoryDragPreview instanceof HTMLImageElement)){
    const preview = document.createElement("img");
    preview.alt = "";
    preview.draggable = false;
    preview.setAttribute("aria-hidden", "true");
    preview.style.position = "fixed";
    preview.style.left = "-10000px";
    preview.style.top = "-10000px";
    preview.style.pointerEvents = "none";
    preview.style.opacity = "0";
    preview.style.zIndex = "-1";
    document.body.appendChild(preview);
    sharedInventoryDragPreview = preview;
  }
  resetSharedInventoryDragPreview();
  return sharedInventoryDragPreview;
}

function resetSharedInventoryDragPreview(){
  if(!(sharedInventoryDragPreview instanceof HTMLImageElement)) return;
  sharedInventoryDragPreview.removeAttribute("src");
  sharedInventoryDragPreview.width = 0;
  sharedInventoryDragPreview.height = 0;
  sharedInventoryDragPreview.style.width = "";
  sharedInventoryDragPreview.style.height = "";
  sharedInventoryDragPreview.style.transform = "";
}

function getInventoryDragPreviewConfig(type, target, visualWidth, visualHeight){
  if(type === INVENTORY_ITEM_TYPES.MINE){
    return {
      src: MINE_INVENTORY_ICON_PATH,
      width: mineSizeRuntime.SCREEN_PX,
      height: mineSizeRuntime.SCREEN_PX,
    };
  }

  return {
    src: target.currentSrc || target.src || "",
    width: visualWidth,
    height: visualHeight,
  };
}

function clearInventoryDragArtifacts(){
  resetInventoryDragFallbackGhost();
  resetSharedInventoryDragPreview();
}

function getInventoryDragPreviewOffset(type, event, targetRect, visualWidth, visualHeight){
  if(type === INVENTORY_ITEM_TYPES.MINE){
    return {
      x: Math.round(visualWidth / 2),
      y: Math.round(visualHeight / 2),
    };
  }
  if(Number.isFinite(event.offsetX) && Number.isFinite(event.offsetY)){
    return {
      x: Math.round(event.offsetX),
      y: Math.round(event.offsetY),
    };
  }
  const clientX = Number.isFinite(event.clientX) ? event.clientX : targetRect.left + visualWidth / 2;
  const clientY = Number.isFinite(event.clientY) ? event.clientY : targetRect.top + visualHeight / 2;
  return {
    x: Math.round(clientX - targetRect.left),
    y: Math.round(clientY - targetRect.top),
  };
}

function applyInventoryDragPreviewState(preview, config){
  preview.src = config.src;
  preview.width = Math.max(1, Math.round(config.width));
  preview.height = Math.max(1, Math.round(config.height));
  preview.style.width = `${Math.max(1, Math.round(config.width))}px`;
  preview.style.height = `${Math.max(1, Math.round(config.height))}px`;
}

function getMineFallbackClientPoint(event, targetRect, visualWidth, visualHeight){
  return {
    x: Number.isFinite(event.clientX)
      ? event.clientX
      : targetRect.left + visualWidth / 2,
    y: Number.isFinite(event.clientY)
      ? event.clientY
      : targetRect.top + visualHeight / 2,
  };
}

function resetMapEditorBrickInteraction(){
  mapEditorBrickInteractionState.mode = "idle";
  mapEditorBrickInteractionState.source = null;
  mapEditorBrickInteractionState.activeSpriteConfig = null;
  mapEditorBrickInteractionState.activeSpriteIndex = null;
  mapEditorBrickInteractionState.pointerId = null;
  mapEditorBrickInteractionState.downPoint = null;
  mapEditorBrickInteractionState.movedPx = 0;
  mapEditorBrickInteractionState.previewClientX = null;
  mapEditorBrickInteractionState.previewClientY = null;
  mapEditorBrickInteractionState.previewBoardX = null;
  mapEditorBrickInteractionState.previewBoardY = null;
  mapEditorBrickInteractionState.previewCellX = null;
  mapEditorBrickInteractionState.previewCellY = null;
  mapEditorBrickInteractionState.previewInsideField = false;
  mapEditorBrickInteractionState.previewCellOccupied = false;
  if(mapEditorBrickInteractionState.mode === "idle"){
    releaseInventoryPointerFromMapEditorInteraction();
  }
}

function clampBrickCellIndexX(cellX){
  const maxCellX = Math.max(0, Math.floor((FIELD_WIDTH - 1) / CELL_SIZE));
  return Math.max(0, Math.min(maxCellX, cellX));
}

function clampBrickCellIndexY(cellY){
  const maxCellY = Math.max(0, Math.floor((FIELD_HEIGHT - 1) / CELL_SIZE));
  return Math.max(0, Math.min(maxCellY, cellY));
}

function getBrickSnappedPlacementFromBoardPoint(boardX, boardY){
  if(!Number.isFinite(boardX) || !Number.isFinite(boardY)) return null;
  const rawCellX = Math.floor((boardX - FIELD_LEFT) / CELL_SIZE);
  const rawCellY = Math.floor((boardY - FIELD_TOP) / CELL_SIZE);
  const cellX = clampBrickCellIndexX(rawCellX);
  const cellY = clampBrickCellIndexY(rawCellY);
  return {
    rawCellX,
    rawCellY,
    cellX,
    cellY,
    x: FIELD_LEFT + cellX * CELL_SIZE,
    y: FIELD_TOP + cellY * CELL_SIZE,
    insideField: isPointInsideFieldBounds(boardX, boardY),
  };
}

function getBrickCellFromSprite(sprite){
  if(!sprite || !Number.isFinite(sprite.x) || !Number.isFinite(sprite.y)) return null;
  const snapped = getBrickSnappedPlacementFromBoardPoint(sprite.x, sprite.y);
  if(!snapped) return null;
  return {
    cellX: snapped.cellX,
    cellY: snapped.cellY,
  };
}

function isMapEditorBrickCellOccupied(cellX, cellY, options = null){
  if(!Number.isFinite(cellX) || !Number.isFinite(cellY)) return false;
  if(!Array.isArray(currentMapSprites) || currentMapSprites.length === 0) return false;
  const ignoredSpriteIndex = Number.isInteger(options?.ignoredSpriteIndex)
    ? options.ignoredSpriteIndex
    : -1;
  return currentMapSprites.some((sprite, spriteIndex) => {
    if(spriteIndex === ignoredSpriteIndex) return false;
    const spriteCell = getBrickCellFromSprite(sprite);
    return spriteCell ? spriteCell.cellX === cellX && spriteCell.cellY === cellY : false;
  });
}

function findMapEditorBrickSpriteIndexAtBoardPoint(boardX, boardY){
  if(!Number.isFinite(boardX) || !Number.isFinite(boardY)) return -1;
  if(!Array.isArray(currentMapSprites) || currentMapSprites.length === 0) return -1;
  const snappedPlacement = getBrickSnappedPlacementFromBoardPoint(boardX, boardY);
  if(!snappedPlacement || !snappedPlacement.insideField) return -1;
  for(let spriteIndex = currentMapSprites.length - 1; spriteIndex >= 0; spriteIndex -= 1){
    const sprite = currentMapSprites[spriteIndex];
    const collider = buildSpriteCollider(sprite, spriteIndex);
    if(!collider) continue;
    if(isPointInsideCollider(boardX, boardY, collider)){
      return spriteIndex;
    }
  }
  return -1;
}

function getMapEditorSpriteFromEventTarget(target){
  if(!(target instanceof Element)) return null;
  const brick = target.closest?.("[data-brick-sprite]");
  if(!(brick instanceof HTMLElement)) return null;
  const spriteName = brick.dataset.brickSprite;
  if(typeof spriteName !== "string" || !MAP_VALID_SPRITE_NAMES.has(spriteName)) return null;

  const rotate = Number.parseFloat(brick.dataset.brickRotate ?? "");
  const scaleX = Number.parseFloat(brick.dataset.brickScaleX ?? "");
  const scaleY = Number.parseFloat(brick.dataset.brickScaleY ?? "");

  return {
    spriteName,
    rotate: Number.isFinite(rotate) ? rotate : 0,
    scaleX: Number.isFinite(scaleX) ? scaleX : 1,
    scaleY: Number.isFinite(scaleY) ? scaleY : 1,
    element: brick,
  };
}

function beginMapEditorBrickInteraction(spriteConfig, pointerId, clientX, clientY){
  if(!spriteConfig || typeof spriteConfig.spriteName !== "string") return;
  mapEditorBrickInteractionState.mode = "holding";
  mapEditorBrickInteractionState.source = spriteConfig.source === "mapSprite" ? "mapSprite" : "brickSidebar";
  mapEditorBrickInteractionState.activeSpriteConfig = {
    spriteName: spriteConfig.spriteName,
    rotate: Number.isFinite(spriteConfig.rotate) ? spriteConfig.rotate : 0,
    scaleX: Number.isFinite(spriteConfig.scaleX) ? spriteConfig.scaleX : 1,
    scaleY: Number.isFinite(spriteConfig.scaleY) ? spriteConfig.scaleY : 1,
  };
  mapEditorBrickInteractionState.activeSpriteIndex = Number.isInteger(spriteConfig.spriteIndex)
    ? spriteConfig.spriteIndex
    : null;
  mapEditorBrickInteractionState.pointerId = pointerId;
  mapEditorBrickInteractionState.downPoint = { x: clientX, y: clientY };
  mapEditorBrickInteractionState.movedPx = 0;
  setInventoryPointerHidden(true);
  updateMapEditorBrickPreviewFromClientPoint(clientX, clientY);
}

function isSameMapEditorBrickSelection(spriteConfig){
  const activeSpriteConfig = mapEditorBrickInteractionState.activeSpriteConfig;
  if(!spriteConfig || !activeSpriteConfig) return false;
  return spriteConfig.spriteName === activeSpriteConfig.spriteName
    && spriteConfig.rotate === activeSpriteConfig.rotate
    && spriteConfig.scaleX === activeSpriteConfig.scaleX
    && spriteConfig.scaleY === activeSpriteConfig.scaleY;
}

function updateMapEditorBrickPreviewFromClientPoint(clientX, clientY){
  if(!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
  const designPoint = toDesignCoords(clientX, clientY);
  const boardPoint = designToBoardCoords(designPoint.x, designPoint.y);
  const snappedPlacement = getBrickSnappedPlacementFromBoardPoint(boardPoint.x, boardPoint.y);
  mapEditorBrickInteractionState.previewClientX = clientX;
  mapEditorBrickInteractionState.previewClientY = clientY;
  mapEditorBrickInteractionState.previewBoardX = snappedPlacement ? snappedPlacement.x : null;
  mapEditorBrickInteractionState.previewBoardY = snappedPlacement ? snappedPlacement.y : null;
  mapEditorBrickInteractionState.previewCellX = snappedPlacement ? snappedPlacement.cellX : null;
  mapEditorBrickInteractionState.previewCellY = snappedPlacement ? snappedPlacement.cellY : null;
  mapEditorBrickInteractionState.previewInsideField = snappedPlacement ? snappedPlacement.insideField : false;
  const ignoredSpriteIndex = mapEditorBrickInteractionState.source === "mapSprite"
    ? mapEditorBrickInteractionState.activeSpriteIndex
    : null;
  mapEditorBrickInteractionState.previewCellOccupied = snappedPlacement
    ? isMapEditorBrickCellOccupied(snappedPlacement.cellX, snappedPlacement.cellY, { ignoredSpriteIndex })
    : false;
}

function buildMapEditorBrickPlacementSprite(spriteConfig, boardX, boardY){
  const spriteName = typeof spriteConfig?.spriteName === "string" ? spriteConfig.spriteName : null;
  if(!spriteName || !MAP_VALID_SPRITE_NAMES.has(spriteName)) return null;
  if(!Number.isFinite(boardX) || !Number.isFinite(boardY)) return null;

  const rotate = Number.isFinite(spriteConfig?.rotate) ? spriteConfig.rotate : 0;
  const scaleX = Number.isFinite(spriteConfig?.scaleX) ? spriteConfig.scaleX : 1;
  const scaleY = Number.isFinite(spriteConfig?.scaleY) ? spriteConfig.scaleY : 1;

  const sprite = {
    spriteName,
    x: boardX,
    y: boardY,
  };

  if(rotate !== 0){
    sprite.rotate = rotate;
  }
  if(scaleX !== 1){
    sprite.scaleX = scaleX;
  }
  if(scaleY !== 1){
    sprite.scaleY = scaleY;
  }

  return sprite;
}

function commitMapEditorBrickDrop(clientX, clientY){
  if(!isMapEditorBricksModeActive()) return false;
  const isMoveFromField = mapEditorBrickInteractionState.source === "mapSprite";
  const activeSpriteIndex = mapEditorBrickInteractionState.activeSpriteIndex;
  const isPointerOverBoard = isClientPointOverBoard(clientX, clientY);

  if(isMoveFromField && !isPointerOverBoard){
    if(Number.isInteger(activeSpriteIndex) && Array.isArray(currentMapSprites)){
      currentMapSprites.splice(activeSpriteIndex, 1);
      colliders = buildMapSpriteColliders({
        name: currentMapName,
        sprites: currentMapSprites,
      });
      rebuildCollisionSurfaces();
      return true;
    }
    return false;
  }

  if(!isPointerOverBoard) return false;

  updateMapEditorBrickPreviewFromClientPoint(clientX, clientY);
  const spriteConfig = mapEditorBrickInteractionState.activeSpriteConfig;
  const boardX = mapEditorBrickInteractionState.previewBoardX;
  const boardY = mapEditorBrickInteractionState.previewBoardY;
  if(!spriteConfig) return false;
  if(!Number.isFinite(boardX) || !Number.isFinite(boardY)) return false;
  if(!mapEditorBrickInteractionState.previewInsideField) return false;
  if(MAP_EDITOR_BRICK_OVERLAP_RULE === "forbid" && mapEditorBrickInteractionState.previewCellOccupied) return false;

  const nextSprite = buildMapEditorBrickPlacementSprite(spriteConfig, boardX, boardY);
  if(!nextSprite) return false;

  if(!Array.isArray(currentMapSprites)){
    currentMapSprites = [];
  }
  if(isMoveFromField && Number.isInteger(activeSpriteIndex) && currentMapSprites[activeSpriteIndex]){
    currentMapSprites[activeSpriteIndex] = nextSprite;
  } else {
    currentMapSprites.push(nextSprite);
  }
  colliders = buildMapSpriteColliders({
    name: currentMapName,
    sprites: currentMapSprites,
  });
  rebuildCollisionSurfaces();
  return true;
}

function onCanvasMapEditorBrickPointerDown(event){
  if(!isMapEditorBricksModeActive()) return false;
  const { x: designX, y: designY } = getPointerDesignCoords(event);
  const { x: boardX, y: boardY } = designToBoardCoords(designX, designY);
  const spriteIndex = findMapEditorBrickSpriteIndexAtBoardPoint(boardX, boardY);
  if(spriteIndex < 0) return false;
  const sprite = currentMapSprites?.[spriteIndex];
  if(!sprite) return false;

  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  const { clientX, clientY } = getPointerClientCoords(event);

  beginMapEditorBrickInteraction({
    source: "mapSprite",
    spriteIndex,
    spriteName: sprite.spriteName,
    rotate: Number.isFinite(sprite.rotate) ? sprite.rotate : 0,
    scaleX: Number.isFinite(sprite.scaleX)
      ? sprite.scaleX
      : (Number.isFinite(sprite.scale) ? sprite.scale : 1),
    scaleY: Number.isFinite(sprite.scaleY)
      ? sprite.scaleY
      : (Number.isFinite(sprite.scale) ? sprite.scale : 1),
  }, pointerId, clientX, clientY);
  return true;
}

function getMapEditorBrickPreviewSprite(){
  if(!isMapEditorBricksModeActive()) return null;
  if(mapEditorBrickInteractionState.mode === "idle") return null;
  const spriteConfig = mapEditorBrickInteractionState.activeSpriteConfig;
  const boardX = mapEditorBrickInteractionState.previewBoardX;
  const boardY = mapEditorBrickInteractionState.previewBoardY;
  if(!spriteConfig) return null;
  if(!Number.isFinite(boardX) || !Number.isFinite(boardY)) return null;
  return buildMapEditorBrickPlacementSprite(spriteConfig, boardX, boardY);
}

function onMapEditorBrickPointerDown(event){
  if(!isMapEditorBricksModeActive()) return;
  const brick = getMapEditorSpriteFromEventTarget(event.currentTarget);
  if(!brick) return;

  if(
    mapEditorBrickInteractionState.mode === "sticky"
    && mapEditorBrickInteractionState.source === "brickSidebar"
    && isSameMapEditorBrickSelection(brick)
  ){
    event.preventDefault();
    resetMapEditorBrickInteraction();
    return;
  }

  event.preventDefault();
  cancelActiveInventoryPickup();

  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  const { clientX, clientY } = getPointerClientCoords(event);
  beginMapEditorBrickInteraction(brick, pointerId, clientX, clientY);
}

function onMapEditorBrickDragStart(event){
  if(!isMapEditorBricksModeActive()){
    event.preventDefault();
    return;
  }

  const brick = getMapEditorSpriteFromEventTarget(event.currentTarget);
  if(!brick){
    event.preventDefault();
    return;
  }

  cancelActiveInventoryPickup();
  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  const { clientX, clientY } = getPointerClientCoords(event);
  beginMapEditorBrickInteraction(brick, pointerId, clientX, clientY);

  if(event.dataTransfer){
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      spriteName: brick.spriteName,
      rotate: brick.rotate,
      scaleX: brick.scaleX,
      scaleY: brick.scaleY,
    }));
    if(brick.element instanceof HTMLImageElement){
      try {
        event.dataTransfer.setDragImage(brick.element, 0, 0);
      } catch (_error) {
        // Ignore drag image errors; default browser preview is enough.
      }
    }
  }
}

function onMapEditorBrickPointerMove(event){
  if(!isMapEditorBricksModeActive()) return;
  if(mapEditorBrickInteractionState.mode !== "holding" && mapEditorBrickInteractionState.mode !== "sticky") return;

  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  if(
    mapEditorBrickInteractionState.mode === "holding"
    &&
    mapEditorBrickInteractionState.pointerId !== null
    && pointerId !== null
    && pointerId !== mapEditorBrickInteractionState.pointerId
  ){
    return;
  }

  const { clientX, clientY } = getPointerClientCoords(event);
  const downPoint = mapEditorBrickInteractionState.downPoint;
  if(downPoint){
    mapEditorBrickInteractionState.movedPx = Math.hypot(clientX - downPoint.x, clientY - downPoint.y);
  }
  updateMapEditorBrickPreviewFromClientPoint(clientX, clientY);
}

function onMapEditorBrickPointerFinish(event){
  releaseInventoryPointerFromMapEditorInteraction();
  if(mapEditorBrickInteractionState.mode !== "holding") return;

  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  if(
    mapEditorBrickInteractionState.pointerId !== null
    && pointerId !== null
    && pointerId !== mapEditorBrickInteractionState.pointerId
  ){
    return;
  }

  if(event.type === "pointercancel"){
    resetMapEditorBrickInteraction();
    return;
  }

  const { clientX, clientY } = getPointerClientCoords(event);
  if(mapEditorBrickInteractionState.movedPx < MAP_EDITOR_BRICK_PICKUP_DRAG_THRESHOLD_PX){
    mapEditorBrickInteractionState.mode = "sticky";
    mapEditorBrickInteractionState.pointerId = null;
    mapEditorBrickInteractionState.downPoint = null;
    mapEditorBrickInteractionState.movedPx = 0;
    return;
  }

  commitMapEditorBrickDrop(clientX, clientY);
  resetMapEditorBrickInteraction();
}

function onMapEditorBrickDragEnd(){
  releaseInventoryPointerFromMapEditorInteraction();
  resetMapEditorBrickInteraction();
}

function onMapEditorBrickDragOver(event){
  if(mapEditorBrickInteractionState.mode !== "holding") return;
  event.preventDefault();
  if(event.dataTransfer){
    event.dataTransfer.dropEffect = "copy";
  }
  updateMapEditorBrickPreviewFromClientPoint(event.clientX, event.clientY);
}

function onMapEditorBrickDrop(event){
  releaseInventoryPointerFromMapEditorInteraction();
  if(!isMapEditorBricksModeActive()) return;
  if(mapEditorBrickInteractionState.mode !== "holding") return;
  event.preventDefault();
  commitMapEditorBrickDrop(event.clientX, event.clientY);
  resetMapEditorBrickInteraction();
}

function onGlobalPointerDownMapEditorBrickCancel(event){
  if(mapEditorBrickInteractionState.mode !== "holding" && mapEditorBrickInteractionState.mode !== "sticky") return;
  const target = event.target;
  if(!(target instanceof Node)) return;

  const insideBoard = gsBoardCanvas instanceof HTMLElement && gsBoardCanvas.contains(target);
  const insideSidebar = mapEditorBrickSidebar instanceof HTMLElement && mapEditorBrickSidebar.contains(target);
  if(insideBoard || insideSidebar) return;

  resetMapEditorBrickInteraction();
}

function onInventoryItemDragStart(event){
  if(isPointerPickupPrimaryMode()){
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
  activeInventoryDrag = {
    color,
    type,
    usageTarget: usageConfig.target,
    consumed: false,
  };
  cancelActiveInventoryPickup();
  setInventoryPointerHidden(true);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", type);
    if (target instanceof HTMLImageElement) {
      const hasDragImageIssues = detectProblematicDragImageConditions(event);
      const dragPreview = getSharedInventoryDragPreview();
      const fallbackSize = type === INVENTORY_ITEM_TYPES.MINE
        ? mineSizeRuntime.SCREEN_PX
        : INVENTORY_ITEM_SIZE_PX;
      const targetRect = target.getBoundingClientRect();
      const visualWidth = Number.isFinite(targetRect.width) && targetRect.width > 0
        ? targetRect.width
        : fallbackSize;
      const visualHeight = Number.isFinite(targetRect.height) && targetRect.height > 0
        ? targetRect.height
        : fallbackSize;
      const dragPreviewConfig = getInventoryDragPreviewConfig(type, target, visualWidth, visualHeight);
      applyInventoryDragPreviewState(dragPreview, dragPreviewConfig);
      const dragOffset = getInventoryDragPreviewOffset(type, event, targetRect, visualWidth, visualHeight);
      let dragImageApplied = false;
      if(!hasDragImageIssues){
        try {
          event.dataTransfer.setDragImage(dragPreview, dragOffset.x, dragOffset.y);
          dragImageApplied = true;
        } catch (_error) {
          inventoryDragImageMarkedUnstable = true;
        }
      }
      if(type === INVENTORY_ITEM_TYPES.MINE && (hasDragImageIssues || !dragImageApplied)){
        const mineFallbackPoint = getMineFallbackClientPoint(event, targetRect, visualWidth, visualHeight);
        activateInventoryDragFallback(target, mineFallbackPoint.x, mineFallbackPoint.y, type);
      } else {
        resetInventoryDragFallbackGhost();
      }
    }
  }
}

function isSameInventoryItemSelection(selection, color, type){
  return Boolean(
    selection
    && selection.color === color
    && selection.type === type
  );
}

function onInventoryItemPointerDown(event){
  logInventoryInputDebug("pointerdown", event, inventoryInteractionState.mode);
  const target = event.currentTarget;
  if(!(target instanceof HTMLImageElement)){
    logInventoryInputEarlyExit("pointerdown", event, "target is not inventory image");
    return;
  }
  const type = target.dataset.itemType;
  const color = target.dataset.itemColor;
  const usageConfig = getItemUsageConfig(type);
  if (!usageConfig?.requiresDragAndDrop){
    logInventoryInputEarlyExit("pointerdown", event, "item does not support drag-and-drop", {
      foundItem: color && type ? { color, type } : null,
    });
    return;
  }

  const activeColor = turnColors[turnIndex];
  if (color !== activeColor){
    logInventoryInputEarlyExit("pointerdown", event, "not active player", {
      foundItem: color && type ? { color, type } : null,
      activeColor,
    });
    return;
  }

  const selectedItem = getInventoryInteractionActiveItem();
  if(
    inventoryInteractionState.mode === "sticky"
    && isSameInventoryItemSelection(selectedItem, color, type)
  ){
    logInventoryInputDebug("pointerdown", event, "idle", {
      foundItem: { color, type },
      reason: "toggle off sticky selection",
    });
    cancelActiveInventoryPickup();
    return;
  }

  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  const { clientX, clientY } = getPointerClientCoords(event);
  const nextActiveItem = {
    color,
    type,
    usageTarget: usageConfig.target,
  };

  logInventoryInputDebug("pointerdown", event, "holding", {
    foundItem: nextActiveItem,
    reason: "start holding item",
  });
  setInventoryInteractionState("holding", nextActiveItem);
  inventoryInteractionState.pointerId = pointerId;
  inventoryInteractionState.downPoint = { x: clientX, y: clientY };
  inventoryInteractionState.movedPx = 0;

  const rect = target.getBoundingClientRect();
  const width = Number.isFinite(rect.width) && rect.width > 0
    ? rect.width
    : INVENTORY_ITEM_SIZE_PX;
  const height = Number.isFinite(rect.height) && rect.height > 0
    ? rect.height
    : INVENTORY_ITEM_SIZE_PX;
  activateInventoryDragFallback(target, clientX, clientY, type, { width, height });
  scheduleInventoryUiSync();
}

function onInventoryPickupPointerFinish(event){
  logInventoryInputDebug(event.type, event, inventoryInteractionState.mode);
  if(inventoryInteractionState.mode !== "holding"){
    logInventoryInputEarlyExit(event.type, event, "state is not holding");
    return;
  }
  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  if(
    inventoryInteractionState.pointerId !== null
    && pointerId !== null
    && pointerId !== inventoryInteractionState.pointerId
  ){
    logInventoryInputEarlyExit(event.type, event, "pointerId mismatch", {
      expectedPointerId: inventoryInteractionState.pointerId,
    });
    return;
  }

  if(event.type === "pointercancel"){
    logInventoryInputDebug("pointercancel", event, "idle", { reason: "cancel active pickup" });
    cancelActiveInventoryPickup();
    return;
  }

  const activeItem = getInventoryInteractionActiveItem();
  const { clientX, clientY } = getPointerClientCoords(event);
  const didDrag = inventoryInteractionState.movedPx >= INVENTORY_PICKUP_DRAG_THRESHOLD_PX;

  if(didDrag){
    if(activeItem){
      const applied = applyInventoryItemAtBoardPoint(activeItem, clientX, clientY, "onPointerPickupDragDrop");
      if(applied){
        removeItemFromInventory(activeItem.color, activeItem.type);
      } else {
        logInventoryInputEarlyExit(event.type, event, "drop rejected", { foundItem: activeItem });
      }
    }
    logInventoryInputDebug(event.type, event, "idle", { reason: "finish drag drop" });
    cancelActiveInventoryPickup();
    return;
  }

  logInventoryInputDebug(event.type, event, "sticky", { reason: "switch to sticky mode" });
  setInventoryInteractionState("sticky", activeItem);
  clearInventoryInteractionPointer();
  scheduleInventoryUiSync();
}

function onInventoryItemDragEnd(){
  clearInventoryDragArtifacts();
  cancelActiveInventoryDrag("ended");
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
  if(isPointerPickupPrimaryMode()) return;
  if (!activeInventoryDrag) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
  updateInventoryDragFallbackPosition(event.clientX, event.clientY);
}

function onBoardDrop(event){
  logInventoryInputDebug("drop", event, inventoryInteractionState.mode, {
    foundItem: activeInventoryDrag,
  });
  clearInventoryDragArtifacts();
  if (!activeInventoryDrag){
    logInventoryInputEarlyExit("drop", event, "no active drag item");
    return;
  }
  event.preventDefault();
  const { clientX, clientY } = event;
  if (!isClientPointOverBoard(clientX, clientY)) {
    logInventoryInputEarlyExit("drop", event, "target outside board", {
      foundItem: activeInventoryDrag,
    });
    if (DEBUG_NUKE) {
      console.log("[NUKE] drop rejected");
    }
    return;
  }
  const applied = applyInventoryItemAtBoardPoint(activeInventoryDrag, clientX, clientY, "onBoardDrop");
  if(applied){
    removeItemFromInventory(activeInventoryDrag.color, activeInventoryDrag.type);
    activeInventoryDrag.consumed = true;
  }
  cancelActiveInventoryDrag(applied ? "board dropped" : "board drop rejected");
}

function applyInventoryItemAtBoardPoint(activeItemState, clientX, clientY, dropContext){
  if(!activeItemState){
    logInventoryInputEarlyExit(dropContext, null, "drop rejected: missing active item");
    return false;
  }
  if(!isClientPointOverBoard(clientX, clientY)){
    logInventoryInputEarlyExit(dropContext, { clientX, clientY }, "target outside board", {
      foundItem: activeItemState,
    });
    return false;
  }

  const usageConfig = getItemUsageConfig(activeItemState.type);
  if(!usageConfig){
    logInventoryInputEarlyExit(dropContext, { clientX, clientY }, "drop rejected: missing usage config", {
      foundItem: activeItemState,
    });
    return false;
  }

  if(usageConfig.target === ITEM_USAGE_TARGETS.SELF_PLANE){
    const designPoint = toDesignCoords(clientX, clientY);
    const { x: boardX, y: boardY } = designToBoardCoords(designPoint.x, designPoint.y);
    logDropCoordsDebug(`${dropContext}/self`, {
      clientX,
      clientY,
      uiScale: designPoint.uiScale,
      pinchScale: designPoint.pinchScale,
      effectiveScale: designPoint.effectiveScale,
      boardX,
      boardY
    });
    const ownPlane = getPlaneAtBoardPoint(activeItemState.color, boardX, boardY);
    if(!ownPlane){
      logInventoryInputEarlyExit(dropContext, { clientX, clientY }, "drop rejected: own plane not found", {
        foundItem: activeItemState,
      });
      return false;
    }
    return applyItemToOwnPlane(activeItemState.type, activeItemState.color, ownPlane);
  }

  if(usageConfig.target !== ITEM_USAGE_TARGETS.BOARD){
    logInventoryInputEarlyExit(dropContext, { clientX, clientY }, "drop rejected: unsupported usage target", {
      foundItem: activeItemState,
      usageTarget: usageConfig.target,
    });
    return false;
  }

  if(activeItemState.type === INVENTORY_ITEM_TYPES.MINE){
    const minePlacement = getMinePlacementFromDropPoint(clientX, clientY);
    logDropCoordsDebug(`${dropContext}/mine`, {
      clientX,
      clientY,
      uiScale: minePlacement.uiScale,
      pinchScale: minePlacement.pinchScale,
      effectiveScale: minePlacement.effectiveScale,
      boardX: minePlacement.boardX,
      boardY: minePlacement.boardY,
      cellX: minePlacement.cellX,
      cellY: minePlacement.cellY
    });
    const isPlacementValid = isMinePlacementValid(minePlacement);
    if(!isPlacementValid){
      logInventoryInputEarlyExit(dropContext, { clientX, clientY }, "drop rejected: mine placement invalid", {
        foundItem: activeItemState,
      });
      return false;
    }
    placeMine({
      owner: activeItemState.color,
      x: minePlacement.x,
      y: minePlacement.y,
      cellX: minePlacement.cellX,
      cellY: minePlacement.cellY,
    });
    return true;
  }

  if(activeItemState.type === INVENTORY_ITEM_TYPES.DYNAMITE){
    const dropPlacement = getDynamitePlacementFromDropPoint(clientX, clientY);
    const targetBrick = findMapSpriteForDynamiteDrop(dropPlacement);
    if(!targetBrick){
      logInventoryInputEarlyExit(dropContext, { clientX, clientY }, "drop rejected: no brick target", {
        foundItem: activeItemState,
      });
      return false;
    }
    const dynamiteEntry = {
      id: `dynamite-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      owner: activeItemState.color,
      x: targetBrick.cx,
      y: targetBrick.cy,
      bottomY: targetBrick.cy + targetBrick.halfHeight,
      spriteId: targetBrick.id,
      spriteIndex: targetBrick.spriteIndex,
      spriteRef: targetBrick.spriteRef,
      startedAtMs: performance.now(),
      frameIndex: 0,
      finalFadeStartedAtMs: null,
      brickRemoved: false,
    };
    dynamiteState.push(dynamiteEntry);
    return true;
  }

  if(activeItemState.type === INVENTORY_ITEM_TYPES.INVISIBILITY){
    return queueInvisibilityEffectForPlayer(activeItemState.color);
  }

  return false;
}

function onSelfPlaneItemDrop(event){
  clearInventoryDragArtifacts();
  if(!activeInventoryDrag) return;
  const usageConfig = getItemUsageConfig(activeInventoryDrag.type);
  if(usageConfig?.target !== ITEM_USAGE_TARGETS.SELF_PLANE) return;

  event.preventDefault();
  const { clientX, clientY } = event;
  if(!isClientPointOverBoard(clientX, clientY)){
    cancelActiveInventoryDrag("self target outside board");
    return;
  }

  const applied = applyInventoryItemAtBoardPoint(activeInventoryDrag, clientX, clientY, "onSelfPlaneItemDrop");
  if(applied){
    removeItemFromInventory(activeInventoryDrag.color, activeInventoryDrag.type);
    activeInventoryDrag.consumed = true;
  }
  cancelActiveInventoryDrag("self target drop");
}

function onInventoryDrop(event){
  clearInventoryDragArtifacts();
  if(!activeInventoryDrag) return;
  const usageConfig = getItemUsageConfig(activeInventoryDrag.type);
  if(!usageConfig){
    event.preventDefault();
    cancelActiveInventoryDrag("drop without config");
    return;
  }

  if(usageConfig.target === ITEM_USAGE_TARGETS.SELF_PLANE){
    onSelfPlaneItemDrop(event);
    return;
  }

  onBoardDrop(event);
}

function onInventoryPickupPointerMove(event){
  logInventoryInputDebug("pointermove", event, inventoryInteractionState.mode);
  if(inventoryInteractionState.mode === "sticky"){
    const { clientX, clientY } = getPointerClientCoords(event);
    updateInventoryDragFallbackPosition(clientX, clientY);
    return;
  }
  if(inventoryInteractionState.mode !== "holding"){
    logInventoryInputEarlyExit("pointermove", event, "state is not holding");
    return;
  }
  const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
  if(
    inventoryInteractionState.pointerId !== null
    && pointerId !== null
    && pointerId !== inventoryInteractionState.pointerId
  ){
    logInventoryInputEarlyExit("pointermove", event, "pointerId mismatch", {
      expectedPointerId: inventoryInteractionState.pointerId,
    });
    return;
  }
  const { clientX, clientY } = getPointerClientCoords(event);
  const downPoint = inventoryInteractionState.downPoint;
  if(downPoint){
    inventoryInteractionState.movedPx = Math.hypot(clientX - downPoint.x, clientY - downPoint.y);
  }
  if(inventoryInteractionState.movedPx < INVENTORY_PICKUP_DRAG_THRESHOLD_PX){
    logInventoryInputEarlyExit("pointermove", event, "drag threshold not reached", {
      movedPx: inventoryInteractionState.movedPx,
      thresholdPx: INVENTORY_PICKUP_DRAG_THRESHOLD_PX,
    });
    return;
  }
  updateInventoryDragFallbackPosition(clientX, clientY);
}

function onBoardInventoryStickyApply(event){
  logInventoryInputDebug("click", event, inventoryInteractionState.mode);
  if(inventoryInteractionState.mode !== "sticky"){
    logInventoryInputEarlyExit("click", event, "state is not sticky");
    return false;
  }
  const activeItem = getInventoryInteractionActiveItem();
  if(!activeItem){
    logInventoryInputEarlyExit("click", event, "sticky mode without active item");
    return false;
  }
  const { clientX, clientY } = getPointerClientCoords(event);
  if(!isClientPointOverBoard(clientX, clientY)){
    logInventoryInputEarlyExit("click", event, "target outside board", {
      foundItem: activeItem,
    });
    return false;
  }
  const applied = applyInventoryItemAtBoardPoint(activeItem, clientX, clientY, "onBoardStickyApply");
  if(!applied){
    logInventoryInputEarlyExit("click", event, "drop rejected", {
      foundItem: activeItem,
    });
    return false;
  }
  removeItemFromInventory(activeItem.color, activeItem.type);
  logInventoryInputDebug("click", event, "idle", {
    foundItem: activeItem,
    reason: "sticky apply success",
  });
  cancelActiveInventoryPickup();
  return true;
}

function onInventoryItemClick(event){
  logInventoryInputDebug("click", event, inventoryInteractionState.mode);
}

function getMinePlacementFromDropPoint(clientX, clientY){
  const designPoint = toDesignCoords(clientX, clientY);
  const { x: designX, y: designY } = designPoint;
  const { x: boardX, y: boardY } = designToBoardCoords(designX, designY);
  const cellX = Math.floor((boardX - FIELD_LEFT) / CELL_SIZE);
  const cellY = Math.floor((boardY - FIELD_TOP) / CELL_SIZE);
  return {
    boardX,
    boardY,
    cellX,
    cellY,
    x: boardX,
    y: boardY,
    uiScale: designPoint.uiScale,
    pinchScale: designPoint.pinchScale,
    effectiveScale: designPoint.effectiveScale,
  };
}


function getDynamitePlacementFromDropPoint(clientX, clientY){
  const designPoint = toDesignCoords(clientX, clientY);
  const { x: designX, y: designY } = designPoint;
  const { x: boardX, y: boardY } = designToBoardCoords(designX, designY);
  return {
    boardX,
    boardY,
    uiScale: designPoint.uiScale,
    pinchScale: designPoint.pinchScale,
    effectiveScale: designPoint.effectiveScale,
  };
}

const DYNAMITE_DROP_SNAP_RADIUS = 30;

function removeBrickSpriteForDynamite(entry){
  if(!entry || entry.brickRemoved) return;
  const brickIndex = Array.isArray(currentMapSprites)
    ? currentMapSprites.indexOf(entry.spriteRef)
    : -1;

  entry.brickRemoved = true;

  if(brickIndex < 0){
    return;
  }

  currentMapSprites.splice(brickIndex, 1);
  colliders = buildMapSpriteColliders({
    name: currentMapName,
    sprites: currentMapSprites,
  });
  rebuildCollisionSurfaces();
}

function getDynamiteExplosionFrameIndexByElapsed(elapsedMs){
  let accumulatedMs = 0;
  for(let i = 0; i < DYNAMITE_EXPLOSION_FRAME_DURATIONS_MS.length; i += 1){
    accumulatedMs += DYNAMITE_EXPLOSION_FRAME_DURATIONS_MS[i];
    if(elapsedMs < accumulatedMs){
      return i;
    }
  }
  return DYNAMITE_EXPLOSION_FRAME_DURATIONS_MS.length - 1;
}

function findActiveDynamiteEntryForSprite(sprite){
  if(!sprite || !Array.isArray(dynamiteState) || dynamiteState.length === 0){
    return null;
  }

  const spriteId = typeof sprite?.id === "string" ? sprite.id : null;
  const spriteIndex = Array.isArray(currentMapSprites)
    ? currentMapSprites.indexOf(sprite)
    : -1;

  for(let i = dynamiteState.length - 1; i >= 0; i -= 1){
    const entry = dynamiteState[i];
    if(!entry || entry.brickRemoved) continue;
    if(entry.spriteRef === sprite) return entry;

    const entryHasIndex = Number.isFinite(entry?.spriteIndex) && entry.spriteIndex >= 0;
    if(
      spriteId
      && entry.spriteId === spriteId
      && entryHasIndex
      && spriteIndex >= 0
      && entry.spriteIndex === spriteIndex
    ){
      return entry;
    }
  }

  return null;
}

function updateAndDrawDynamiteExplosions(ctx2d, now){
  const removeDomEntry = (entry) => {
    if(entry?.domEntry?.remove){
      entry.domEntry.remove();
    }
    if(entry){
      delete entry.domEntry;
    }
  };

  const syncDomEntry = (entry, frameImg, frameW, frameH) => {
    const metrics = resolveExplosionMetrics('dynamite');
    if(!metrics || !(metrics.host instanceof HTMLElement)){
      removeDomEntry(entry);
      return;
    }

    const { boardRect, overlayRect, host } = metrics;
    const { overlayX, overlayY } = worldToOverlayLocal(entry.x, entry.bottomY, { boardRect, overlayRect });
    const drawX = overlayX - frameW / 2;
    const drawY = overlayY - frameH;

    if(!(entry.domEntry instanceof HTMLImageElement)){
      const image = document.createElement('img');
      image.className = 'fx-dynamite-explosion-img';
      Object.assign(image.style, {
        position: 'absolute',
        left: '0px',
        top: '0px',
        width: `${frameW}px`,
        height: `${frameH}px`,
        transform: `translate(${drawX}px, ${drawY}px)`,
        transformOrigin: 'top left',
        pointerEvents: 'none',
        imageRendering: 'auto'
      });
      host.appendChild(image);
      entry.domEntry = image;
    }

    entry.domEntry.src = frameImg.src;
    entry.domEntry.style.width = `${frameW}px`;
    entry.domEntry.style.height = `${frameH}px`;
    entry.domEntry.style.transform = `translate(${drawX}px, ${drawY}px)`;
  };

  if(!Array.isArray(dynamiteState) || dynamiteState.length === 0){
    return;
  }

  for(let i = dynamiteState.length - 1; i >= 0; i -= 1){
    const entry = dynamiteState[i];
    if(!entry){
      dynamiteState.splice(i, 1);
      continue;
    }

    entry.startedAtMs = Number.isFinite(entry.startedAtMs) ? entry.startedAtMs : now;
    const elapsedMs = Math.max(0, now - entry.startedAtMs);
    const frameIndex = getDynamiteExplosionFrameIndexByElapsed(elapsedMs);
    entry.frameIndex = frameIndex;

    if(frameIndex + 1 >= DYNAMITE_BRICK_REMOVAL_FRAME_INDEX && !Number.isFinite(entry.finalFadeStartedAtMs)){
      entry.finalFadeStartedAtMs = now;
    }

    const finalFadeElapsedMs = Number.isFinite(entry.finalFadeStartedAtMs)
      ? Math.max(0, now - entry.finalFadeStartedAtMs)
      : 0;
    if(Number.isFinite(entry.finalFadeStartedAtMs) && finalFadeElapsedMs >= DYNAMITE_BRICK_FADE_OUT_DURATION_MS){
      removeBrickSpriteForDynamite(entry);
    }

    const frameImg = DYNAMITE_EXPLOSION_FRAMES[frameIndex] || null;
    if(frameImg && isSpriteReady(frameImg)){
      const frameW = frameImg.naturalWidth || 107;
      const frameH = frameImg.naturalHeight || 157;
      syncDomEntry(entry, frameImg, frameW, frameH);
    } else {
      removeDomEntry(entry);
    }

    if(elapsedMs >= DYNAMITE_EXPLOSION_TOTAL_DURATION_MS){
      removeBrickSpriteForDynamite(entry);
      removeDomEntry(entry);
      dynamiteState.splice(i, 1);
    }
  }
}

function clearDynamiteExplosionDomEntries(){
  if(!Array.isArray(dynamiteState) || dynamiteState.length === 0){
    return;
  }

  for(const entry of dynamiteState){
    if(entry?.domEntry?.remove){
      entry.domEntry.remove();
    }
    if(entry){
      delete entry.domEntry;
    }
  }
}

function getMapSpriteGeometry(sprite, spriteIndex){
  if(!sprite) return null;
  const spriteName = typeof sprite?.spriteName === "string" ? sprite.spriteName : MAP_DEFAULT_SPRITE_NAME;
  if(!MAP_VALID_SPRITE_NAMES.has(spriteName)) return null;
  const { width: baseWidth, height: baseHeight } = getMapSpriteBaseSize(spriteName);
  const { scaleX, scaleY } = getSpriteScale(sprite);
  const rotationDeg = Number.isFinite(sprite?.rotate) ? sprite.rotate : 0;
  const rotation = rotationDeg * Math.PI / 180;
  const { cx, cy } = getSpriteColliderCenter(sprite, baseWidth, baseHeight, scaleX, scaleY, rotationDeg);
  const collider = buildSpriteCollider(sprite, spriteIndex);
  if(!collider) return null;

  const baseId = sprite?.id ?? `${spriteName}-${spriteIndex}`;
  const id = typeof baseId === "string" ? baseId : `${spriteName}-${spriteIndex}`;

  return {
    id,
    spriteIndex,
    spriteRef: sprite,
    cx,
    cy,
    halfWidth: collider.halfWidth,
    halfHeight: collider.halfHeight,
    rotation,
    collider,
  };
}

function findMapSpriteForDynamiteDrop(placement){
  if(!placement) return null;

  let nearestSprite = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  const spriteEntries = Array.isArray(currentMapSprites) ? currentMapSprites : [];
  for(let i = 0; i < spriteEntries.length; i += 1){
    const geometry = getMapSpriteGeometry(spriteEntries[i], i);
    if(!geometry) continue;

    if(isPointInsideCollider(placement.boardX, placement.boardY, geometry.collider)){
      return geometry;
    }

    const distanceToCenter = Math.hypot(placement.boardX - geometry.cx, placement.boardY - geometry.cy);
    if(distanceToCenter < nearestDistance){
      nearestDistance = distanceToCenter;
      nearestSprite = geometry;
    }
  }

  if(nearestSprite && nearestDistance <= DYNAMITE_DROP_SNAP_RADIUS){
    return nearestSprite;
  }

  return null;
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

  // «установка мины — в свободную точку, не в центр клетки»:
  // проверяем фактическую дистанцию между минами в мировых пикселях,
  // а не совпадение координат вычисленной клетки.
  const tooCloseToAnotherMine = mines.some(mine => {
    if(!Number.isFinite(mine?.x) || !Number.isFinite(mine?.y)) return false;
    return Math.hypot(mine.x - placement.x, mine.y - placement.y) < MINE_PLACEMENT_MIN_DISTANCE;
  });
  if(tooCloseToAnotherMine) return false;

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

  return true;
}

function placeMine({ owner, x, y, cellX, cellY }){
  // «установка мины — в свободную точку, не в центр клетки»:
  // главным источником истины остаются мировые координаты x/y.
  // cellX/cellY оставляем как вспомогательные данные для аналитики.
  mines.push({
    id: `mine-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    owner,
    x,
    y,
    cellX: Number.isFinite(cellX) ? cellX : null,
    cellY: Number.isFinite(cellY) ? cellY : null,
  });
}

let inventoryCssSizeWarningShown = false;

function validateInventoryCssSizing(host){
  if(inventoryCssSizeWarningShown) return;
  if(!(host instanceof HTMLElement)) return;
  const expectedContainer = INVENTORY_UI_CONFIG.containerSize;
  const expectedSlot = INVENTORY_UI_CONFIG.slotSize;
  const computedHost = getComputedStyle(host);
  const hostWidth = Math.round(parseFloat(computedHost.width));
  const hostHeight = Math.round(parseFloat(computedHost.height));
  if(hostWidth !== expectedContainer.w || hostHeight !== expectedContainer.h){
    console.warn("[inventory] Container CSS size mismatch", {
      expected: expectedContainer,
      actual: { w: hostWidth, h: hostHeight },
    });
    inventoryCssSizeWarningShown = true;
    return;
  }
  const tempSlot = document.createElement("div");
  tempSlot.className = "inventory-slot";
  host.appendChild(tempSlot);
  const computedSlot = getComputedStyle(tempSlot);
  const slotWidth = Math.round(parseFloat(computedSlot.width));
  const slotHeight = Math.round(parseFloat(computedSlot.height));
  tempSlot.remove();
  if(slotWidth !== expectedSlot.w || slotHeight !== expectedSlot.h){
    console.warn("[inventory] Slot CSS size mismatch", {
      expected: expectedSlot,
      actual: { w: slotWidth, h: slotHeight },
    });
    inventoryCssSizeWarningShown = true;
  }
}

function applyInventoryContainerLayout(color, host){
  if(!(host instanceof HTMLElement)) return;
  const containerConfig = INVENTORY_UI_CONFIG.containers[color] ?? null;
  if(!containerConfig) return;
  host.style.left = `${containerConfig.x}px`;
  host.style.top = `${containerConfig.y}px`;
  host.style.width = `${containerConfig.w}px`;
  host.style.height = `${containerConfig.h}px`;
}

function showInventoryDisabledHint(color, slotLayout){
  const state = inventoryHintState[color];
  if(!state || !slotLayout?.frame) return;
  const frame = slotLayout.frame;
  state.text = INVENTORY_DISABLED_HINT_TEXT;
  state.visible = true;
  state.anchorX = frame.x + frame.w / 2;
  state.anchorY = frame.y + frame.h / 2;
  if(state.timeoutId){
    clearTimeout(state.timeoutId);
  }
  state.timeoutId = setTimeout(() => {
    state.visible = false;
    state.text = "";
    state.timeoutId = null;
  }, 900);
}

function syncInventoryUI(color){
  syncInventoryVisibility();
  const host = inventoryHosts[color];
  if(!(host instanceof HTMLElement)) return;
  const slotItemCache = inventorySlotItemElementByColor[color];
  if(slotItemCache instanceof Map){
    slotItemCache.clear();
  }
  const hintState = inventoryHintState[color];
  if (hintState && hintState.timeoutId) {
    clearTimeout(hintState.timeoutId);
    hintState.timeoutId = null;
  }
  if (hintState) {
    hintState.visible = false;
    hintState.text = "";
  }
  clearInventoryHoverState(color);
  applyInventoryContainerLayout(color, host);
  validateInventoryCssSizing(host);
  host.style.setProperty("--inventory-mine-size", `${mineSizeRuntime.SCREEN_PX}px`);
  host.innerHTML = "";
  const items = inventoryState[color] ?? [];
  const countsByType = items.reduce((counts, item) => {
    if (!item?.type) return counts;
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, {});
  const slotData = INVENTORY_UI_CONFIG.slotOrder.map((type) => {
    const count = countsByType[type] ?? 0;
    return {
      type,
      count,
      iconPath: getInventoryIconPathForSlot(type, color),
      layout: INVENTORY_UI_CONFIG.slots[type] ?? null,
    };
  });

  const normalizeCountPocketLayout = (layout) => {
    const frameLayout = layout?.frame ?? { x: 0, y: 0 };
    const rawPocket = layout?.countPocket ?? { x: 0, y: 0, w: 10, h: 9 };
    const localX = Math.round((rawPocket.x ?? 0) - (frameLayout.x ?? 0));
    const localY = Math.round((rawPocket.y ?? 0) - (frameLayout.y ?? 0));
    return {
      x: localX,
      y: localY,
      w: 10,
      h: 9,
    };
  };

  const normalizeIconLayout = (layout) => {
    const frameLayout = layout?.frame ?? { x: 0, y: 0 };
    const rawIcon = layout?.icon ?? { x: 0, y: 0, w: 1, h: 1 };
    const localX = Math.round((rawIcon.x ?? 0) - (frameLayout.x ?? 0));
    const localY = Math.round((rawIcon.y ?? 0) - (frameLayout.y ?? 0));
    return {
      x: localX,
      y: localY,
      w: Math.max(1, Math.round(rawIcon.w ?? 1)),
      h: Math.max(1, Math.round(rawIcon.h ?? 1)),
    };
  };

  const normalizeFrameSliceLayout = (layout) => {
    const rawFrame = layout?.frame ?? { x: 0, y: 0, w: 55, h: 55 };
    return {
      sx: Math.max(0, Math.round(rawFrame.x ?? 0)),
      sy: Math.max(0, Math.round(rawFrame.y ?? 0)),
      sw: Math.max(1, Math.round(rawFrame.w ?? 55)),
      sh: Math.max(1, Math.round(rawFrame.h ?? 55)),
    };
  };

  for(const [slotIndex, slot] of slotData.entries()){
    const hasItem = slot.count > 0;
    if(!slot.layout) continue;
    const slotContainer = document.createElement("div");
    const frameImg = document.createElement("img");
    const img = document.createElement("img");
    const usageConfig = getItemUsageConfig(slot.type);
    const iconLayout = normalizeIconLayout(slot.layout);
    const countLayout = normalizeCountPocketLayout(slot.layout);
    const frameLayout = slot.layout.frame;
    const frameSlice = normalizeFrameSliceLayout(slot.layout);
    const isImplemented = slot.layout.implemented !== false;
    const isInteractiveItem = hasItem && isImplemented && Boolean(usageConfig?.requiresDragAndDrop);

    slotContainer.className = "inventory-slot";
    slotContainer.dataset.slotColor = color;
    slotContainer.dataset.slotType = slot.type;
    slotContainer.dataset.slotIndex = String(slotIndex);
    slotContainer.dataset.slotCount = String(slotData.length);
    slotContainer.style.left = `${Math.round(frameLayout.x)}px`;
    if(!isImplemented){
      slotContainer.classList.add("inventory-slot--disabled");
      slotContainer.addEventListener("click", () => {
        showInventoryDisabledHint(color, slot.layout);
      });
    }

    frameImg.src = INVENTORY_UI_CONFIG.frameAtlasPath;
    frameImg.alt = "";
    frameImg.draggable = false;
    frameImg.className = "inventory-slot-frame";
    frameImg.style.width = `${frameSlice.sw}px`;
    frameImg.style.height = `${frameSlice.sh}px`;
    frameImg.style.objectFit = "none";
    frameImg.style.objectPosition = `-${frameSlice.sx}px -${frameSlice.sy}px`;

    img.src = slot.iconPath || INVENTORY_EMPTY_ICON;
    img.alt = "";
    img.draggable = false;
    img.className = "inventory-item";
    img.style.left = `${iconLayout.x}px`;
    img.style.top = `${iconLayout.y}px`;
    img.style.width = `${iconLayout.w}px`;
    img.style.height = `${iconLayout.h}px`;

    if(slotItemCache instanceof Map){
      slotItemCache.set(slot.type, img);
    }

    if(!isImplemented){
      img.classList.add("inventory-item--disabled");
      img.draggable = false;
    }

    if (!hasItem) {
      img.classList.add("inventory-item--ghost");
      img.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showInventoryTooltipForSlot(color, slot.type, {
          pointerX: event.clientX,
          pointerY: event.clientY,
        });
      });
    }

    if (isInteractiveItem) {
      img.dataset.itemType = slot.type;
      img.dataset.itemColor = color;
      img.classList.add("inventory-item--draggable");
      const useLegacyDragDrop = shouldUseLegacyDragDropFallback();
      img.draggable = useLegacyDragDrop;
      if(useLegacyDragDrop){
        img.addEventListener("dragstart", onInventoryItemDragStart);
        img.addEventListener("dragend", onInventoryItemDragEnd);
      }
      img.addEventListener("pointerdown", onInventoryItemPointerDown);
      img.addEventListener("click", onInventoryItemClick);
      if(isSameInventoryItemSelection(getInventoryInteractionActiveItem(), color, slot.type) && inventoryInteractionState.mode !== "idle"){
        img.classList.add("inventory-item--selected");
        slotContainer.classList.add("inventory-slot--selected");
        if (hintState && slot.layout?.frame) {
          const frame = slot.layout.frame;
          hintState.visible = true;
          hintState.text = INVENTORY_SELECTED_HINT_TEXT;
          hintState.anchorX = frame.x + frame.w / 2;
          hintState.anchorY = frame.y + frame.h / 2;
        }
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
    slotContainer.appendChild(frameImg);
    slotContainer.appendChild(img);
    const countBadge = document.createElement("span");
    countBadge.className = "inventory-item-count";
    countBadge.textContent = slot.count;
    countBadge.style.left = `${countLayout.x}px`;
    countBadge.style.top = `${countLayout.y}px`;
    countBadge.style.width = `${countLayout.w}px`;
    countBadge.style.height = `${countLayout.h}px`;
    slotContainer.appendChild(countBadge);
    host.appendChild(slotContainer);
  }

  refreshInventoryTooltip();
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
  resetPlayerInventoryEffects();
  syncInventoryUI("blue");
  syncInventoryUI("green");
}

function seedMapEditorInventory(){
  if(selectedRuleset !== "mapeditor") return;

  const mapEditorQtyPerItem = 100;
  for(const color of ["blue", "green"]){
    inventoryState[color].length = 0;
    for(const itemDef of INVENTORY_ITEMS){
      for(let i = 0; i < mapEditorQtyPerItem; i += 1){
        inventoryState[color].push(itemDef);
      }
    }
    syncInventoryUI(color);
  }
}

if (DEBUG_CHEATS && typeof window !== "undefined") {
  // DevTools usage on /#dev:
  // DEBUG_BANNER_BLUE_WIN(); DEBUG_BANNER_GREEN_WIN(); DEBUG_BANNER_NEXT_ROUND(); DEBUG_BANNER_CLEAR();
  window.DEBUG_BANNER_BLUE_WIN = () => showRoundBanner("BLUE WINS THE ROUND");
  window.DEBUG_BANNER_GREEN_WIN = () => showRoundBanner("GREEN WINS THE ROUND");
  window.DEBUG_BANNER_NEXT_ROUND = () => showRoundBanner("NEXT ROUND");
  window.DEBUG_BANNER_CLEAR = () => clearRoundBanner();
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

const HUD_PLANE_TIMER_FRAME_PATHS = [
  "ui_gamescreen/gs_aracade_timer_cross.png",
  "ui_gamescreen/gs_arcade_timer/gs_arcade_04.png",
  "ui_gamescreen/gs_arcade_timer/gs_arcade_03.png",
  "ui_gamescreen/gs_arcade_timer/gs_arcade_02.png",
  "ui_gamescreen/gs_arcade_timer/gs_arcade_01.png"
];
const HUD_PLANE_TIMER_GO_PATH = "ui_gamescreen/gs_arcade_timer/gs_arcade_go_transperent.png";
const ARCADE_RESPAWN_SHIELD_PATHS = {
  blue: "ui_gamescreen/gs_aracade_shield_blue.png",
  green: "ui_gamescreen/gs_aracade_shield_green.png",
};

const GAME_SCREEN_ASSETS = [
  // Plane counters
  "ui_gamescreen/gamescreen_outside/planecounter_blue.png",
  "ui_gamescreen/gamescreen_outside/planecounter_ green.png",

  // UI extras
  "sprite_ copy.png",
  ...HUD_PLANE_TIMER_FRAME_PATHS,
  HUD_PLANE_TIMER_GO_PATH,
  ARCADE_RESPAWN_SHIELD_PATHS.blue,
  ARCADE_RESPAWN_SHIELD_PATHS.green,

  // Game field background
  "ui_gamescreen/paperwithred.png",
  "ui_gamescreen/gamescreen_outside/gs_background.png",
  "ui_gamescreen/gamescreen_outside/goat and sparrow.png",

  // Game maps
  "ui_gamescreen/bricks/brick_1_default.png",
  "ui_gamescreen/bricks/brick4_diagonal copy.png",
  "ui_controlpanel/cp_adds/cp_cargo_on.png",

  // Новый 6-слотовый inventory: preload только из ui_gamescreen/gs_inventory/.
  INVENTORY_UI_CONFIG.frameAtlasPath,
  ...INVENTORY_ICON_ASSET_PATHS,
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
  "ui_controlpanel/accuracy_tape_percent.png",
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
  },
  mapEditor: {
    default: null,
    active: null
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
  applyMenuButtonSkin(editorBtn, "mapEditor", selection === "mapeditor");
  classicRulesBtn?.classList.toggle("selected", selection === "classic");
  advancedSettingsBtn?.classList.toggle("selected", selection === "advanced");
  editorBtn?.classList.toggle("selected", selection === "mapeditor");
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
  },
  arcadeScore: {
    blue: { x: 412, y: 360, width: 46, height: 35 },
    green: { x: 412, y: 409, width: 46, height: 35 }
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
const DEFAULT_GREEN_BURNING_FLAME_SRC = GREEN_FLAME_SPRITES[0] || DEFAULT_BURNING_FLAME_SRC;
const DEFAULT_BLUE_BURNING_FLAME_SRC = BLUE_FLAME_SPRITES[0] || DEFAULT_BURNING_FLAME_SRC;

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
  const width = Number.isFinite(boardRect?.width) && boardRect.width > 0
    ? boardRect.width
    : (Number.isFinite(WORLD?.width) ? WORLD.width : CANVAS_BASE_WIDTH);
  const height = Number.isFinite(boardRect?.height) && boardRect.height > 0
    ? boardRect.height
    : (Number.isFinite(WORLD?.height) ? WORLD.height : CANVAS_BASE_HEIGHT);
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
  // Keep burning-flame FX below planeCanvas so alive planes are always rendered on top.
  const parent = overlayFxLayer instanceof HTMLElement
    ? overlayFxLayer
    : (fxHostLayer instanceof HTMLElement
      ? fxHostLayer
      : (gsFrameLayer instanceof HTMLElement ? gsFrameLayer : null));
  if (!(parent instanceof HTMLElement)) {
    return null;
  }
  const bounds = getFxHostBounds();
  const useLocalCoordinates = parent === overlayFxLayer;
  return ensureFxHost(parent, PLANE_FLAME_HOST_ID, {
    fillParent: false,
    left: useLocalCoordinates ? 0 : bounds.left,
    top: useLocalCoordinates ? 0 : bounds.top,
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

  return { boardRect: usableBoardRect, overlayRect: hostRect, hostRect, host };
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

function getDefaultFlameSrcForPlane(plane) {
  if (plane?.color === 'green') {
    return DEFAULT_GREEN_BURNING_FLAME_SRC || DEFAULT_BURNING_FLAME_SRC || '';
  }
  if (plane?.color === 'blue') {
    return DEFAULT_BLUE_BURNING_FLAME_SRC || DEFAULT_BURNING_FLAME_SRC || '';
  }
  return DEFAULT_BURNING_FLAME_SRC || '';
}

function resolveFlameImage(flameSrc, plane = null) {
  if (!flameSrc) {
    return { src: '', img: null };
  }
  const cached = flameImages.get(flameSrc) || null;
  if (cached) {
    return { src: flameSrc, img: cached };
  }
  const colorSafeFallbackSrc = getDefaultFlameSrcForPlane(plane);
  const colorSafeFallbackImg = flameImages.get(colorSafeFallbackSrc) || null;
  if (colorSafeFallbackImg) {
    return { src: colorSafeFallbackSrc, img: colorSafeFallbackImg };
  }
  if (defaultFlameImg) {
    return { src: defaultFlameImg.src || flameSrc, img: defaultFlameImg };
  }
  return { src: flameSrc, img: null };
}

function pickRandomBurningFlame(plane) {
  const pool = getPlaneFlameSprites(plane);

  if (!pool.length) {
    return resolveFlameImage(getDefaultFlameSrcForPlane(plane), plane);
  }
  const index = Math.floor(Math.random() * pool.length);
  return resolveFlameImage(pool[index], plane);

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
    return resolveFlameImage(getDefaultFlameSrcForPlane(plane), plane);
  }

  if (normalized === 'cycle') {
    const index = flameCycleIndex % pool.length;
    flameCycleIndex = (flameCycleIndex + 1) % pool.length;
    return resolveFlameImage(pool[index], plane);
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
    const colorSafeFallbackSrc = getDefaultFlameSrcForPlane(plane);
    const colorSafeFallbackImg = flameImages.get(colorSafeFallbackSrc) || null;
    const fallbackImg = isSpriteReady(colorSafeFallbackImg)
      ? colorSafeFallbackImg
      : (isSpriteReady(defaultFlameImg) ? defaultFlameImg : null);
    const fallbackSrc = fallbackImg?.src || colorSafeFallbackSrc || DEFAULT_BURNING_FLAME_SRC || '';
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

  planeFlameFx.set(plane, entry);

  let mounted = false;
  const mountEntry = () => {
    if (planeFlameFx.get(plane) !== entry) {
      entry.stop?.();
      return;
    }
    if (mounted || plane?.flameFxDisabled) {
      entry.stop?.();
      planeFlameFx.delete(plane);
      return;
    }
    host.appendChild(entry.element);
    applyFlameVisualStyle(entry.element, plane?.burningFlameStyleKey || getCurrentFlameStyleKey());
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
const editorBtn = document.getElementById("editorBtn");
const modeMenuButtons = [hotSeatBtn, computerBtn, onlineBtn];
const rulesMenuButtons = [classicRulesBtn, advancedSettingsBtn, editorBtn];

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
  advancedSettingsBtn,
  editorBtn
]);

let selectedMode = "hotSeat";
let selectedRuleset = "classic";
let mapEditorControlMode = "bricks";
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

const GAME_MODE_STORAGE_KEY = 'settings.gameMode';
const VALID_GAME_MODES = new Set(["hotSeat", "computer", "online"]);

function normalizeGameMode(mode){
  return VALID_GAME_MODES.has(mode) ? mode : null;
}

function isMapEditorBricksModeActive(){
  return selectedRuleset === "mapeditor" && mapEditorControlMode === "bricks";
}

function setMapEditorControlMode(nextMode){
  const normalizedMode = nextMode === "planes" ? "planes" : "bricks";
  if(mapEditorControlMode === normalizedMode) return;
  mapEditorControlMode = normalizedMode;

  if(mapEditorControlMode === "planes") {
    resetMapEditorBrickInteraction();
  }

  syncMapEditorResetButtonVisibility();
}

function isAdvancedLikeRuleset(ruleset = selectedRuleset){
  return ruleset === "advanced" || ruleset === "mapeditor";
}

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
      syncMapEditorResetButtonVisibility();
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
  blueBroadwinged: "ui_gamescreen/gs_inventory/broadwinged_blue.png",
  greenBroadwinged: "ui_gamescreen/gs_inventory/broadwinged_green.png",
  blueCounter: "ui_gamescreen/gamescreen_outside/planecounter_blue.png",
  greenCounter: "ui_gamescreen/gamescreen_outside/planecounter_ green.png"
};

let bluePlaneImg = null;
let greenPlaneImg = null;
let blueBroadwingedPlaneImg = null;
let greenBroadwingedPlaneImg = null;
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
  blueBroadwingedPlaneImg = loadImageAsset(PLANE_ASSET_PATHS.blueBroadwinged, GAME_PRELOAD_LABEL).img;
  greenBroadwingedPlaneImg = loadImageAsset(PLANE_ASSET_PATHS.greenBroadwinged, GAME_PRELOAD_LABEL).img;
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
const CARGO_ANIMATION_FRAME_COUNT = 23;
const CARGO_ANIM_START_FRAME = 7;
const CARGO_ANIMATION_FRAME_PATHS = Array.from({ length: CARGO_ANIMATION_FRAME_COUNT }, (_value, index) => {
  const frameNumber = String(index + 1).padStart(2, "0");
  return `ui_gamescreen/gs_cargoanimation_23/gs_cargoanimation_${frameNumber}.png`;
});
const CARGO_ANIM_START_INDEX = Math.max(0, Math.min(CARGO_ANIMATION_FRAME_COUNT - 1, CARGO_ANIM_START_FRAME - 1));
const CARGO_TIMING_EARLY_MS = 40;
const CARGO_TIMING_MID_MS = 55;
const CARGO_TIMING_LATE_MS = 80;
const CARGO_TIMING_NEAR_TOUCH_MS = 115;
const CARGO_TIMING_COLLAPSED_PARACHUTE_MS = 170;
const CARGO_TIMING_CLEAN_BOX_ENTRY_MS = 85;
const CARGO_TIMING_BOX_MS = 95;
const CARGO_ANIM_FRAME_DURATIONS_MS = Array.from({ length: CARGO_ANIMATION_FRAME_COUNT }, (_value, index) => {
  if (index < CARGO_ANIM_START_INDEX) return 0;

  if (index <= 15) return CARGO_TIMING_EARLY_MS;
  if (index <= 18) return CARGO_TIMING_MID_MS;
  if (index === 19) return CARGO_TIMING_LATE_MS;

  // Final sequence explicit holds:
  // index 20 (frame 21): near touch, longer than average;
  // index 21 (frame 22): collapsed parachute, longest final hold;
  // index 22 (frame 23): clean box entry, shorter to avoid sticky final frame.
  if (index === 20) return CARGO_TIMING_NEAR_TOUCH_MS;
  if (index === 21) return CARGO_TIMING_COLLAPSED_PARACHUTE_MS;
  if (index === 22) return CARGO_TIMING_CLEAN_BOX_ENTRY_MS;

  return CARGO_TIMING_BOX_MS;
});
const CARGO_ANIM_MS_FALLBACK = CARGO_ANIM_FRAME_DURATIONS_MS.reduce((sum, duration) => sum + duration, 0);
const CARGO_FADE_IN_MS_DEFAULT = 0;
const CARGO_DIMMING_DEFAULT = 0;
const { img: cargoSprite } = loadImageAsset(CARGO_SPRITE_PATH, GAME_PRELOAD_LABEL, { decoding: 'async' });
const hudPlaneTimerFrames = HUD_PLANE_TIMER_FRAME_PATHS.map((path) => loadImageAsset(path, GAME_PRELOAD_LABEL, { decoding: 'async' }).img);
const { img: hudPlaneTimerGoImage } = loadImageAsset(HUD_PLANE_TIMER_GO_PATH, GAME_PRELOAD_LABEL, { decoding: 'async' });
const arcadeRespawnShieldImages = {
  blue: loadImageAsset(ARCADE_RESPAWN_SHIELD_PATHS.blue, GAME_PRELOAD_LABEL, { decoding: 'async' }).img,
  green: loadImageAsset(ARCADE_RESPAWN_SHIELD_PATHS.green, GAME_PRELOAD_LABEL, { decoding: 'async' }).img,
};
const cargoAnimationFrames = CARGO_ANIMATION_FRAME_PATHS.map((path) => loadImageAsset(path, GAME_PRELOAD_LABEL, { decoding: 'async' }).img);
let cargoAnimDurationMs = CARGO_ANIM_MS_FALLBACK;
let cargoAnimDurationOverrideMs = null;
let cargoFadeInMs = CARGO_FADE_IN_MS_DEFAULT;
let cargoAnimDimming = CARGO_DIMMING_DEFAULT;

function resolveCargoAnimLifetimeMs(){
  if(Number.isFinite(cargoAnimDurationOverrideMs)){
    return Math.max(0, cargoAnimDurationOverrideMs);
  }
  return CARGO_ANIM_MS_FALLBACK;
}

function clampCargoDimming(value){
  if(!Number.isFinite(value)) return CARGO_DIMMING_DEFAULT;
  return Math.max(0, Math.min(1, value));
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
        frameCount: cargoAnimationFrames.length,
        baseLifetimeMs: cargoAnimDurationMs,
        lifetimeOverrideMs: cargoAnimDurationOverrideMs,
        activeLifetimeMs: resolveCargoAnimLifetimeMs(),
        fadeInMs: cargoFadeInMs,
        dimming: cargoAnimDimming,
      };
    },
    setFadeInDuration(ms = 0){
      if(!Number.isFinite(ms)) return false;
      cargoFadeInMs = Math.max(0, Math.round(ms));
      return true;
    },
    setDimming(value = 0){
      if(!Number.isFinite(value)) return false;
      cargoAnimDimming = clampCargoDimming(value);
      return true;
    },
    setAnimationLifetime(ms){
      return setCargoAnimLifetimeOverrideMs(ms);
    },
    clearAnimationLifetimeOverride(){
      return setCargoAnimLifetimeOverrideMs(null);
    },
    setFadeIn(ms = 0){
      return this.setFadeInDuration(ms);
    },
    setLifetime(ms){
      return this.setAnimationLifetime(ms);
    },
    clearLifetimeOverride(){
      return this.clearAnimationLifetimeOverride();
    },
    reset(){
      cargoFadeInMs = CARGO_FADE_IN_MS_DEFAULT;
      cargoAnimDimming = CARGO_DIMMING_DEFAULT;
      setCargoAnimLifetimeOverrideMs(null);
      return true;
    }
  };
}

function normalizeMineDebugSize(value){
  if(!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return Math.max(8, Math.min(128, rounded));
}

function applyMineScreenSizeToDom(){
  if(typeof document !== "undefined"){
    document.documentElement.style.setProperty("--inventory-mine-size", `${mineSizeRuntime.SCREEN_PX}px`);
  }
}

function getMineDebugConfig(){
  return {
    screenPx: mineSizeRuntime.SCREEN_PX,
    logicalPx: mineSizeRuntime.LOGICAL_PX,
    defaults: {
      screenPx: MINE_SIZE_DEFAULTS.SCREEN_PX,
      logicalPx: MINE_SIZE_DEFAULTS.LOGICAL_PX,
    },
  };
}

function runInventoryTooltipConsoleCommand(command, value){
  const normalized = String(command ?? "").trim().toLowerCase();
  switch(normalized){
    case "get":
      return getInventoryTooltipRuntimeConfig();
    case "reset":
      resetInventoryTooltipRuntimeConfig();
      return true;
    case "set-anchor":
      return setInventoryTooltipLayoutConfig({ anchorMode: value });
    case "set-threshold":
      return setInventoryTooltipLayoutConfig({ sideSwitchSlotIndex: value });
    case "set-x":
      return setInventoryTooltipLayoutConfig({ offsetXPx: value });
    case "set-y":
      return setInventoryTooltipLayoutConfig({ offsetYPx: value });
    case "set-font-family":
      return setInventoryTooltipStyleConfig({ fontFamily: value });
    case "set-font-weight":
      return setInventoryTooltipStyleConfig({ fontWeight: value });
    case "set-font-size":
      return setInventoryTooltipStyleConfig({ fontSize: value });
    case "set-line-height":
      return setInventoryTooltipStyleConfig({ lineHeight: value });
    case "set-max-width":
      return setInventoryTooltipStyleConfig({ maxWidth: value });
    case "set-padding":
      return setInventoryTooltipStyleConfig({ padding: value });
    default:
      return false;
  }
}

function ensureInventoryTooltipDebugApi(){
  if(typeof window === "undefined") return;
  window.INVENTORY_TOOLTIP_DEBUG = {
    getConfig(){
      return getInventoryTooltipRuntimeConfig();
    },
    setLayout(config = {}){
      return setInventoryTooltipLayoutConfig(config);
    },
    setStyle(config = {}){
      return setInventoryTooltipStyleConfig(config);
    },
    reset(){
      resetInventoryTooltipRuntimeConfig();
      return true;
    },
    command(command, value){
      return runInventoryTooltipConsoleCommand(command, value);
    },
  };

  window.INVENTORY_TOOLTIP_CMD = (command, value) => runInventoryTooltipConsoleCommand(command, value);

  console.info(
    '[INVENTORY_TOOLTIP_DEBUG] ready. Try: INVENTORY_TOOLTIP_CMD("get"), INVENTORY_TOOLTIP_CMD("set-x", 12), INVENTORY_TOOLTIP_CMD("set-y", -8), INVENTORY_TOOLTIP_CMD("set-anchor", "self"), INVENTORY_TOOLTIP_CMD("set-threshold", 2), INVENTORY_TOOLTIP_CMD("set-font-size", "14px"), INVENTORY_TOOLTIP_CMD("set-font-family", "Roboto, sans-serif"), INVENTORY_TOOLTIP_CMD("set-max-width", "280px"), INVENTORY_TOOLTIP_CMD("reset")'
  );
}

function ensureMineDebugApi(){
  if(typeof window === "undefined") return;
  if(window.MINE_DEBUG) return;
  window.MINE_DEBUG = {
    getConfig(){
      return getMineDebugConfig();
    },
    setScreenSize(px){
      const safePx = normalizeMineDebugSize(px);
      if(safePx === null) return false;
      mineSizeRuntime.SCREEN_PX = safePx;
      applyMineScreenSizeToDom();
      syncInventoryUI("blue");
      syncInventoryUI("green");
      return true;
    },
    setLogicalSize(px){
      const safePx = normalizeMineDebugSize(px);
      if(safePx === null) return false;
      mineSizeRuntime.LOGICAL_PX = safePx;
      return true;
    },
    setBoth(px){
      const safePx = normalizeMineDebugSize(px);
      if(safePx === null) return false;
      mineSizeRuntime.SCREEN_PX = safePx;
      mineSizeRuntime.LOGICAL_PX = safePx;
      applyMineScreenSizeToDom();
      syncInventoryUI("blue");
      syncInventoryUI("green");
      return true;
    },
    reset(){
      mineSizeRuntime.SCREEN_PX = MINE_SIZE_DEFAULTS.SCREEN_PX;
      mineSizeRuntime.LOGICAL_PX = MINE_SIZE_DEFAULTS.LOGICAL_PX;
      applyMineScreenSizeToDom();
      syncInventoryUI("blue");
      syncInventoryUI("green");
      return true;
    },
  };

  console.info(
    "[MINE_DEBUG] ready. Try: MINE_DEBUG.getConfig(), MINE_DEBUG.setScreenSize(42), MINE_DEBUG.setLogicalSize(36), MINE_DEBUG.setBoth(32), MINE_DEBUG.reset()"
  );
}

ensureCargoDebugApi();
ensureInventoryTooltipDebugApi();

function isSpriteReady(img) {
  return Boolean(
    img &&
    img.complete &&
    img.naturalWidth > 0 &&
    img.naturalHeight > 0
  );
}
const { img: backgroundImg } = loadImageAsset("ui_gamescreen/paperwithred.png", GAME_PRELOAD_LABEL);
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
const MAP_EDITOR_CANVAS_LEFT = 10;
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
const FIELD_BORDER_THICKNESS = MAP_BRICK_THICKNESS; // px, width of brick frame edges

function getFieldLeftCssValue() {
  if (selectedRuleset === "mapeditor") {
    return MAP_EDITOR_CANVAS_LEFT;
  }
  const computed = (FRAME_BASE_WIDTH - WORLD.width) / 2;
  return Number.isFinite(computed) ? computed : FRAME_PADDING_X;
}

function getFieldTopCssValue() {
  const computed = (FRAME_BASE_HEIGHT - WORLD.height) / 2;
  return Number.isFinite(computed) ? computed : FRAME_PADDING_Y;
}

setScreenMode('MENU');


let brickFrameImg = null;
let brickFrameData = null;
const MAP_SPRITE_ASSETS = Object.create(null);

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
  "ui_gamescreen/gs_inventory/gs_inventory_crossfire.png",
  GAME_PRELOAD_LABEL
);
const { img: fuelIconSprite } = loadImageAsset(
  "ui_gamescreen/gs_inventory/gs_inventory_fuel.png",
  GAME_PRELOAD_LABEL
);
const { img: wingsIconSprite } = loadImageAsset(
  "ui_gamescreen/gs_inventory/gs_inventory_wings_sharper_2.png",
  GAME_PRELOAD_LABEL
);
const { img: invisibilityIconSpriteBlue } = loadImageAsset(
  INVENTORY_UI_CONFIG.slots[INVENTORY_ITEM_TYPES.INVISIBILITY].iconPathByColor.blue,
  GAME_PRELOAD_LABEL
);
const { img: invisibilityIconSpriteGreen } = loadImageAsset(
  INVENTORY_UI_CONFIG.slots[INVENTORY_ITEM_TYPES.INVISIBILITY].iconPathByColor.green,
  GAME_PRELOAD_LABEL
);
const { img: mineIconSprite } = loadImageAsset(
  "ui_gamescreen/gs_inventory/gs_inventory_mine.png",
  GAME_PRELOAD_LABEL
);
const DYNAMITE_EXPLOSION_FRAME_PATHS = Array.from({ length: 17 }, (_, index) => {
  const frameNumber = String(index + 1).padStart(2, "0");
  return `ui_gamescreen/gs_inventory/gs_dynamiteexplosion_03/gs_dynamiteexplosion_${frameNumber}.png`;
});
const DYNAMITE_EXPLOSION_FRAMES = DYNAMITE_EXPLOSION_FRAME_PATHS.map((path) => loadImageAsset(path, GAME_PRELOAD_LABEL).img);

function buildDynamiteFrameDurations(frameCount){
  if(!Number.isFinite(frameCount) || frameCount <= 0){
    return [];
  }
  const durations = [];
  const fuseCount = Math.min(4, frameCount);
  const explosionCount = Math.max(0, frameCount - fuseCount);
  const growthCount = explosionCount > 0 ? Math.max(1, Math.round(explosionCount * 0.65)) : 0;
  const decayCount = Math.max(0, explosionCount - growthCount);

  const durationScale = 2;

  for(let i = 0; i < fuseCount; i += 1){
    durations.push(46 * durationScale);
  }
  for(let i = 0; i < growthCount; i += 1){
    durations.push(37 * durationScale);
  }
  for(let i = 0; i < decayCount; i += 1){
    durations.push(27 * durationScale);
  }

  return durations;
}

const DYNAMITE_EXPLOSION_FRAME_DURATIONS_MS = buildDynamiteFrameDurations(DYNAMITE_EXPLOSION_FRAMES.length);
const DYNAMITE_EXPLOSION_TOTAL_DURATION_MS = DYNAMITE_EXPLOSION_FRAME_DURATIONS_MS.reduce((sum, value) => sum + value, 0);
const DYNAMITE_BRICK_REMOVAL_FRAME_INDEX = Math.min(
  DYNAMITE_EXPLOSION_FRAMES.length,
  Math.max(6, Math.min(8, Math.min(4, DYNAMITE_EXPLOSION_FRAMES.length) + 3))
);
const DYNAMITE_BRICK_FADE_OUT_DURATION_MS = 280;

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


  resyncFieldDimensions("brick frame loaded");
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
const BROADWING_OVERLAY_DRAW_W = PLANE_GEOMETRY_TRUTH.BENEFICIAL_HITBOX_WIDTH_WITH_WINGS;
const BROADWING_OVERLAY_DRAW_H = PLANE_DRAW_H;
const PLANE_METRIC_SCALE   = PLANE_DRAW_W / 40;

// Single source of truth for mine size.
// LOGICAL_PX controls mine size inside the game world (canvas drawing units).
// SCREEN_PX controls mine size in interface pixels (inventory/drag preview via CSS variable).
// Keep both values here so future tweaks do not create a second, conflicting size source.
const MINE_SIZE_DEFAULTS = Object.freeze({
  LOGICAL_PX: 30,
  SCREEN_PX: 30,
});

const mineSizeRuntime = {
  LOGICAL_PX: MINE_SIZE_DEFAULTS.LOGICAL_PX,
  SCREEN_PX: MINE_SIZE_DEFAULTS.SCREEN_PX,
};

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
const HUD_PLANE_CROSS_MIN_LIFETIME_MS = 1000;
const HUD_BASE_PLANE_ICON_SIZE = planeMetric(16);
const CELL_SIZE            = 20;     // px
const INVENTORY_ITEM_SIZE_PX = 30;
const POINT_RADIUS         = planeMetric(15);     // px (увеличено для мобильных)
const CARGO_PICKUP_RADIUS_MULTIPLIER = 2.2;
const CARGO_RADIUS         = POINT_RADIUS * CARGO_PICKUP_RADIUS_MULTIPLIER;    // увеличенный радиус ящика
const CARGO_SPAWN_SAFE_RADIUS = CARGO_RADIUS + POINT_RADIUS;
const CARGO_FALLBACK_SIZE_PX = 24;
const CARGO_SAFE_MAX_DIM_PX = CARGO_FALLBACK_SIZE_PX * 4;
// Формула выравнивания: ΔX = boxX - animX, ΔY = boxY - animY.
// Контрольные значения для текущего спрайта: ΔX = -34, ΔY = -137.
const CARGO_ANIM_OFFSET_X   = -34;
const CARGO_ANIM_OFFSET_Y   = -137;
const CARGO_LANDING_SETTLE_ENABLED = true;
const CARGO_LANDING_BOUNCE_PX = 1;
const CARGO_LANDING_PHASE1_MS = 60;
const CARGO_LANDING_PHASE2_MS = 60;
const FLAG_INTERACTION_RADIUS = 25;  // px
const BASE_INTERACTION_RADIUS = 40;  // px
const SLIDE_THRESHOLD      = 0.1;
// Larger hit area for selecting planes with touch/mouse
const PLANE_TOUCH_RADIUS   = 20;                   // px
const AA_HIT_RADIUS        = POINT_RADIUS + 5; // slightly larger zone to hit Anti-Aircraft center
const MINE_TRIGGER_RADIUS  = POINT_RADIUS;
const MINE_PLACEMENT_MIN_DISTANCE = 16; // px, минимальная дистанция между центрами мин при установке
const BOUNCE_FRAMES        = 68;
// Duration of a full-speed flight on the field (measured in frames)
// (Restored to the original pre-change speed used for gameplay physics)
// Shortened by 1.5x to speed up on-field flight animation
const FIELD_FLIGHT_DURATION_SEC = (BOUNCE_FRAMES / 60) * 2 / 1.5;
const FIELD_PLANE_SWAY_DEG = 0.75;
const FIELD_PLANE_SWAY_PERIOD_SEC = 2.6 / 1.5;
const FIELD_PLANE_ROLL_BOB_PX = 0.75;
// Mine idle animation keeps only horizontal sway without vertical bobbing.
const FIELD_MINE_SWAY_DEG = 3.2;
const FIELD_MINE_SWAY_OMEGA = 0.075;
const MAX_DRAG_DISTANCE    = 100;    // px
const DRAG_ROTATION_THRESHOLD = 5;   // px slack before the plane starts to turn
const ATTACK_RANGE_PX      = 300;    // px
let FIELD_BORDER_OFFSET_X = FIELD_BORDER_THICKNESS; // внутренняя граница для отражения по горизонтали
let FIELD_BORDER_OFFSET_Y = FIELD_BORDER_THICKNESS; // и по вертикали
// Используем бесконечное количество сегментов,
// чтобы следы самолётов сохранялись до конца раунда.
const MAX_TRAIL_SEGMENTS   = Infinity;
const PLANE_TRAIL_LINE_WIDTH = 1;
const PLANE_TRAIL_ALPHA = 0.22;
const BUILDING_BUFFER      = CELL_SIZE / 2;
const MAX_BUILDINGS_GLOBAL = 100;
const PLANES_PER_SIDE      = 4;      // количество самолётов у каждой команды
const MIDDLE_GAP_EXTRA_PX  = 10;     // доп. расстояние между средними самолётами
const EDGE_PLANE_PADDING_PX = 8;     // смещение крайних самолётов наружу
const FLAG_POLE_HEIGHT     = 20;     // высота флагштока
const FLAG_WIDTH           = 12;     // ширина полотна флага
const FLAG_HEIGHT          = 8;      // высота полотна флага

applyMineScreenSizeToDom();

ensureMineDebugApi();

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

function areFieldCssDimensionsReasonable(width, height) {
  const minWidth = Math.max(64, WORLD.width * 0.4);
  const minHeight = Math.max(64, WORLD.height * 0.4);
  const maxWidth = Math.max(WORLD.width * 3, 1024);
  const maxHeight = Math.max(WORLD.height * 3, 2048);
  return width >= minWidth && width <= maxWidth && height >= minHeight && height <= maxHeight;
}

function logFieldCssAndCanvasMetrics(reason, cssMetrics) {
  if (!DEBUG_RESIZE) return;
  const canvasRect = gsBoardCanvas?.getBoundingClientRect?.();
  console.log('[field-metrics]', {
    reason,
    cssMetrics,
    gameCanvasRect: canvasRect
      ? {
          left: canvasRect.left,
          top: canvasRect.top,
          width: canvasRect.width,
          height: canvasRect.height
        }
      : null,
    gameCanvasBacking: gsBoardCanvas
      ? { width: gsBoardCanvas.width, height: gsBoardCanvas.height }
      : null
  });
}

function getFieldCssMetrics() {
  if (typeof window === "undefined" || !gsFrameEl) {
    return null;
  }
  const fallbackLeft = getFieldLeftCssValue();
  const fallbackTop = getFieldTopCssValue();
  const style = window.getComputedStyle(gsFrameEl);
  const metrics = {
    left: parseCssSize(style.getPropertyValue("--field-left"), fallbackLeft),
    top: parseCssSize(style.getPropertyValue("--field-top"), fallbackTop),
    width: parseCssSize(style.getPropertyValue("--field-width"), CANVAS_BASE_WIDTH),
    height: parseCssSize(style.getPropertyValue("--field-height"), CANVAS_BASE_HEIGHT)
  };

  if (!areFieldCssDimensionsReasonable(metrics.width, metrics.height)) {
    return {
      left: 0,
      top: 0,
      width: WORLD.width,
      height: WORLD.height
    };
  }

  return metrics;
}

function resyncFieldDimensions(reason = 'resync') {
  // Expected call chain:
  // syncFieldCssVars() must always run immediately before updateFieldDimensions().
  // Any UI/screen refactor should preserve this helper call to avoid stale field metrics.
  syncFieldCssVars();
  updateFieldDimensions(reason);
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

function isCargoRectInsidePlayableField(cargoRect){
  const playableLeft = FIELD_LEFT + FIELD_BORDER_OFFSET_X;
  const playableTop = FIELD_TOP + FIELD_BORDER_OFFSET_Y;
  const playableRight = FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X;
  const playableBottom = FIELD_TOP + FIELD_HEIGHT - FIELD_BORDER_OFFSET_Y;

  return (
    cargoRect.left >= playableLeft &&
    cargoRect.right <= playableRight &&
    cargoRect.top >= playableTop &&
    cargoRect.bottom <= playableBottom
  );
}

function doesCargoRectIntersectColliders(cargoRect){
  if(!Array.isArray(colliders) || colliders.length === 0) return false;

  const sampleStep = 3;
  const sampledYs = new Set([cargoRect.top, cargoRect.bottom]);
  const sampledXs = new Set([cargoRect.left, cargoRect.right]);

  for(let y = cargoRect.top; y <= cargoRect.bottom; y += sampleStep){
    sampledYs.add(y);
  }
  for(let x = cargoRect.left; x <= cargoRect.right; x += sampleStep){
    sampledXs.add(x);
  }

  for(const y of sampledYs){
    for(const x of sampledXs){
      for(const collider of colliders){
        if(isPointInsideCollider(x, y, collider)){
          return true;
        }
      }
    }
  }
  return false;
}

function doesCargoRectIntersectGeometry(cargoRect){
  if(!isCargoRectInsidePlayableField(cargoRect)) return true;
  return doesCargoRectIntersectColliders(cargoRect);
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

function getCargoAnimationFrameByIndex(index = 0) {
  if (!Array.isArray(cargoAnimationFrames) || cargoAnimationFrames.length === 0) {
    return null;
  }
  const safeIndex = Math.max(0, Math.min(cargoAnimationFrames.length - 1, Math.floor(index)));
  return cargoAnimationFrames[safeIndex] || cargoAnimationFrames[0] || null;
}

function getCargoAnimationFrameByElapsedMs(elapsedMs = 0, durationMs = CARGO_ANIM_MS_FALLBACK) {
  const frameCount = cargoAnimationFrames.length;
  if (frameCount <= 0) {
    return null;
  }
  const startIndex = Math.max(0, Math.min(frameCount - 1, CARGO_ANIM_START_INDEX));

  const frameDurations = Array.isArray(CARGO_ANIM_FRAME_DURATIONS_MS)
    ? CARGO_ANIM_FRAME_DURATIONS_MS
    : [];
  if (frameDurations.length !== frameCount) {
    const uniformProgress = Math.max(0, Math.min(1, Math.max(0, elapsedMs) / Math.max(1, durationMs)));
    const animatedFrameCount = Math.max(1, frameCount - startIndex);
    const fallbackFrameIndex = Math.min(
      frameCount - 1,
      startIndex + Math.floor(uniformProgress * animatedFrameCount)
    );
    return getCargoAnimationFrameByIndex(fallbackFrameIndex);
  }

  const safeElapsedMs = Math.max(0, elapsedMs);
  const targetDurationMs = Math.max(1, Number.isFinite(durationMs) ? durationMs : CARGO_ANIM_MS_FALLBACK);
  const sourceDurationMs = Math.max(1, CARGO_ANIM_MS_FALLBACK);
  const durationScale = targetDurationMs / sourceDurationMs;

  let cumulativeDuration = 0;
  for (let frameIndex = startIndex; frameIndex < frameCount; frameIndex += 1) {
    cumulativeDuration += Math.max(1, frameDurations[frameIndex]) * durationScale;
    if (safeElapsedMs < cumulativeDuration || frameIndex === frameCount - 1) {
      return getCargoAnimationFrameByIndex(frameIndex);
    }
  }

  return getCargoAnimationFrameByIndex(startIndex);
}

function getCargoAnimationBaseFrame() {
  const startIndex = Math.max(0, Math.min(cargoAnimationFrames.length - 1, CARGO_ANIM_START_INDEX));
  return getCargoAnimationFrameByIndex(startIndex);
}

function createCargoAnimationDomEntry(cargo, metrics) {
  const host = metrics?.host || ensureCargoHost();
  if (!(host instanceof HTMLElement)) {
    return null;
  }

  const baseFrame = getCargoAnimationBaseFrame();
  if (!baseFrame) {
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
  image.src = baseFrame.src;

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

  const elapsedMs = Math.max(0, performance.now() - (cargo.animStartedAt || 0));
  const activeDurationMs = Number.isFinite(cargo.animDurationMs)
    ? cargo.animDurationMs
    : resolveCargoAnimLifetimeMs();
  const activeFrame = getCargoAnimationFrameByElapsedMs(elapsedMs, activeDurationMs) || getCargoAnimationBaseFrame();

  if (activeFrame?.src && cargo.domEntry.img.src !== activeFrame.src) {
    cargo.domEntry.img.src = activeFrame.src;
  }

  const offsetPoint = worldToOverlayLocal(
    cargo.x + CARGO_ANIM_OFFSET_X,
    cargo.y + CARGO_ANIM_OFFSET_Y,
    metrics
  );
  const { scaleX, scaleY } = getCargoOverlayScale(metrics);
  const naturalWidth = activeFrame?.naturalWidth || activeFrame?.width || 0;
  const naturalHeight = activeFrame?.naturalHeight || activeFrame?.height || 0;
  const width = Math.max(1, Math.round(Math.max(1, naturalWidth) * scaleX));
  const height = Math.max(1, Math.round(Math.max(1, naturalHeight) * scaleY));

  Object.assign(cargo.domEntry.element.style, {
    left: `${offsetPoint.overlayX}px`,
    top: `${offsetPoint.overlayY}px`,
    width: `${width}px`,
    height: `${height}px`
  });

  const brightness = Math.max(0, 1 - clampCargoDimming(cargoAnimDimming));

  Object.assign(cargo.domEntry.img.style, {
    position: 'relative',
    zIndex: '1',
    width: '100%',
    height: '100%',
    display: 'block',
    opacity: '1',
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
  const { width: cargoWidth, height: cargoHeight } = getCargoSpriteSize();

  // по X — вся ширина, по Y — средняя треть (по гейм-дизайну),
  // но с учётом габаритов png, чтобы ящик целиком оставался в поле.
  const fieldMinX = FIELD_LEFT + FIELD_BORDER_OFFSET_X;
  const fieldMaxX = FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X - cargoWidth;
  const fieldMinY = FIELD_TOP + FIELD_BORDER_OFFSET_Y;
  const fieldMaxY = FIELD_TOP + FIELD_HEIGHT - FIELD_BORDER_OFFSET_Y - cargoHeight;
  const spawnMinY = FIELD_TOP + FIELD_HEIGHT / 3;
  const spawnMaxY = FIELD_TOP + 2 * FIELD_HEIGHT / 3;

  const minX = fieldMinX;
  const maxX = fieldMaxX;
  const minY = Math.max(fieldMinY, spawnMinY);
  const maxY = Math.min(fieldMaxY, spawnMaxY);

  if(maxX < minX || maxY < minY){
    return null;
  }

  const doesCargoRectIntersectAnyObstacle = (cargoRect) => {
    const playableRect = {
      left: FIELD_LEFT + FIELD_BORDER_OFFSET_X,
      right: FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X,
      top: FIELD_TOP + FIELD_BORDER_OFFSET_Y,
      bottom: FIELD_TOP + FIELD_HEIGHT - FIELD_BORDER_OFFSET_Y
    };

    // Проверка внутренней границы поля: карго должно помещаться целиком.
    if(
      cargoRect.left < playableRect.left
      || cargoRect.right > playableRect.right
      || cargoRect.top < playableRect.top
      || cargoRect.bottom > playableRect.bottom
    ){
      return true;
    }

    if(!Array.isArray(colliders) || colliders.length === 0){
      return false;
    }

    const intersectsRectAabb = (a, b) => (
      a.left <= b.right
      && a.right >= b.left
      && a.top <= b.bottom
      && a.bottom >= b.top
    );

    return colliders.some(collider => {
      if(!collider) return false;
      const hw = Number.isFinite(collider.halfWidth) ? collider.halfWidth : 0;
      const hh = Number.isFinite(collider.halfHeight) ? collider.halfHeight : 0;
      const rotation = Number.isFinite(collider.rotation) ? collider.rotation : 0;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      // AABB вращённого прямоугольника коллайдера.
      const aabbHalfWidth = Math.abs(cos) * hw + Math.abs(sin) * hh;
      const aabbHalfHeight = Math.abs(sin) * hw + Math.abs(cos) * hh;
      const colliderAabb = {
        left: collider.cx - aabbHalfWidth,
        right: collider.cx + aabbHalfWidth,
        top: collider.cy - aabbHalfHeight,
        bottom: collider.cy + aabbHalfHeight
      };

      return intersectsRectAabb(cargoRect, colliderAabb);
    });
  };

  const getPlaneVisualRect = (plane) => {
    const halfPlaneWidth = PLANE_DRAW_W / 2;
    const halfPlaneHeight = PLANE_DRAW_H / 2;
    return {
      left: plane.x - halfPlaneWidth,
      right: plane.x + halfPlaneWidth,
      top: plane.y - halfPlaneHeight,
      bottom: plane.y + halfPlaneHeight
    };
  };

  const isCargoRectBlocked = (cargoRect) => {
    if(doesCargoRectIntersectAnyObstacle(cargoRect)) return true;
    return points.some(point => {
      if(!point?.isAlive || point?.burning) return false;
      return planeHitboxesIntersect(cargoRect, getPlaneVisualRect(point));
    });
  };

  const buildSpawnFromTopLeft = (x, targetY) => ({
    x,
    targetY,
    cargoRect: {
      left: x,
      right: x + cargoWidth,
      top: targetY,
      bottom: targetY + cargoHeight
    }
  });

  const trySpawnAt = (x, targetY) => {
    const spawn = buildSpawnFromTopLeft(x, targetY);
    if(isCargoRectBlocked(spawn.cargoRect)) return null;
    return { x: spawn.x, targetY: spawn.targetY };
  };

  for(let attempt = 0; attempt < CARGO_MAX_SPAWN_ATTEMPTS; attempt++){
    const x = minX + Math.random() * (maxX - minX);
    const targetY = minY + Math.random() * (maxY - minY);
    const spawn = trySpawnAt(x, targetY);
    if(spawn) return spawn;
  }

  // Если случайные попытки не нашли место, перебираем сетку по всей зоне спавна.
  // Это делает спавн стабильным даже на плотно застроенной карте.
  const gridStep = Math.max(2, Math.floor(Math.min(cargoWidth, cargoHeight) / 2));
  for(let y = minY; y <= maxY; y += gridStep){
    for(let x = minX; x <= maxX; x += gridStep){
      const spawn = trySpawnAt(x, y);
      if(spawn) return spawn;
    }
  }

  const edgeSpawn = trySpawnAt(maxX, maxY);
  if(edgeSpawn) return edgeSpawn;

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
    pickedAt: null
  });
}

function getCargoSpriteSize(){
  const loadedWidth = Number.isFinite(cargoSprite?.naturalWidth) && cargoSprite.naturalWidth > 0
    ? cargoSprite.naturalWidth
    : CARGO_FALLBACK_SIZE_PX;
  const loadedHeight = Number.isFinite(cargoSprite?.naturalHeight) && cargoSprite.naturalHeight > 0
    ? cargoSprite.naturalHeight
    : CARGO_FALLBACK_SIZE_PX;

  if(loadedWidth > CARGO_SAFE_MAX_DIM_PX || loadedHeight > CARGO_SAFE_MAX_DIM_PX){
    return { width: CARGO_FALLBACK_SIZE_PX, height: CARGO_FALLBACK_SIZE_PX };
  }

  return { width: loadedWidth, height: loadedHeight };
}

function getCargoSpriteDrawSize(){
  return getCargoSpriteSize();
}

function getCargoVisualCenter(cargo){
  const { width, height } = getCargoSpriteSize();
  return {
    x: cargo.x + width / 2,
    y: cargo.y + height / 2
  };
}

function doesCargoIntersectPlaneBeneficialZone(cargo, plane){
  const { width, height } = getCargoSpriteSize();
  const cargoLeft = cargo.x;
  const cargoRight = cargo.x + width;
  const cargoTop = cargo.y;
  const cargoBottom = cargo.y + height;

  // широкие крылья расширяют только полезные взаимодействия
  const beneficialZone = getPlaneBeneficialGeometry(plane).hitbox;
  return cargoLeft < beneficialZone.right
    && cargoRight > beneficialZone.left
    && cargoTop < beneficialZone.bottom
    && cargoBottom > beneficialZone.top;
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
    if(cargo.state === "animating" && now - cargo.animStartedAt >= animDurationMs){
      cargo.state = "ready";
      cargo.landingSettledAt = now;
      removeCargoAnimationDomEntry(cargo);
    }
    if(cargo.state !== "ready"){
      remainingCargo.push(cargo);
      continue;
    }
    let pickedUp = false;
    for(const plane of points){
      if(!plane?.isAlive || plane?.burning) continue;
      if(doesCargoIntersectPlaneBeneficialZone(cargo, plane)){
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

function getCargoLandingSettleYOffset(cargo, now = performance.now()){
  if(!CARGO_LANDING_SETTLE_ENABLED || cargo?.state !== "ready"){
    return 0;
  }
  if(!Number.isFinite(cargo.landingSettledAt)){
    return 0;
  }

  const elapsedMs = Math.max(0, now - cargo.landingSettledAt);
  const phase1Ms = Math.max(0, CARGO_LANDING_PHASE1_MS);
  const phase2Ms = Math.max(0, CARGO_LANDING_PHASE2_MS);
  const totalMs = phase1Ms + phase2Ms;
  if(totalMs <= 0 || elapsedMs > totalMs){
    return 0;
  }

  const bouncePx = Math.max(0, CARGO_LANDING_BOUNCE_PX);
  if(elapsedMs <= phase1Ms){
    return phase1Ms > 0 ? (elapsedMs / phase1Ms) * bouncePx : bouncePx;
  }

  const phase2ElapsedMs = elapsedMs - phase1Ms;
  return phase2Ms > 0
    ? (1 - phase2ElapsedMs / phase2Ms) * bouncePx
    : 0;
}

function drawCargo(ctx2d){
  if(cargoState.length === 0) return;
  const canDrawCargoBox = isSpriteReady(cargoSprite);
  const now = performance.now();

  for(const cargo of cargoState){
    if(cargo.state === "ready" && canDrawCargoBox){
      const { width, height } = getCargoSpriteDrawSize();
      const yOffset = getCargoLandingSettleYOffset(cargo, now);

      ctx2d.save();
      ctx2d.filter = 'saturate(0.9) brightness(0.98)';
      ctx2d.drawImage(cargoSprite, cargo.x, cargo.y + yOffset, width, height);
      ctx2d.restore();
    }
  }
}

  function updateFieldDimensions(reason = 'update'){
    const cssMetrics = getFieldCssMetrics();
    const scaleX = CANVAS_BASE_WIDTH ? WORLD.width / CANVAS_BASE_WIDTH : 1;
    const scaleY = CANVAS_BASE_HEIGHT ? WORLD.height / CANVAS_BASE_HEIGHT : 1;
    const epsilon = 0.5;
    const hasSafeCssMetrics = cssMetrics && areFieldCssDimensionsReasonable(cssMetrics.width, cssMetrics.height);

    if (hasSafeCssMetrics) {
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

    logFieldCssAndCanvasMetrics(reason, cssMetrics);
    updateFieldBorderOffset();
    rebuildCollisionSurfaces();
  }


const MIN_FLIGHT_RANGE_CELLS = 10;
const MAX_FLIGHT_RANGE_CELLS = 50;

const MIN_ACCURACY_PERCENT = 0;
const MAX_ACCURACY_PERCENT = 100;
const MAX_SPREAD_DEG       = 12;
const AI_MAX_ANGLE_DEVIATION = 0.25; // ~14.3°
const AI_MIRROR_FIRST_BOUNCE_MIN_DISTANCE = CARGO_SPAWN_SAFE_RADIUS * 0.75;
const AI_MIRROR_MAX_PATH_RATIO = 1.95;
const AI_MIRROR_MAX_PATH_RATIO_OBSTACLE_BONUS = 0.35;
const AI_MIRROR_PATH_PRESSURE_BONUS = 0.2;
const AI_MIRROR_STUCK_RECOVERY_PRESSURE_BONUS = 0.08;
const AI_MIRROR_SCORE_PRESSURE_BONUS = 0.12;
const AI_MIRROR_SCORE_BLOCKED_DIRECT_BONUS = 0.06;

const AIMING_TUNING_DEFAULTS = {
  referenceAccuracyPercent: 80,
  spreadAtReferenceDeg: 10,
  amplitudeMultiplier: 0.5,
  speedMultiplier: 0.25,
  curveExponent: 2
};

function clampAimingPercent(value, fallback = 80){
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : fallback;
  return clamp(safe, 0, 100);
}

function normalizeAimingTuning(raw = {}){
  return {
    referenceAccuracyPercent: clampAimingPercent(raw.referenceAccuracyPercent, AIMING_TUNING_DEFAULTS.referenceAccuracyPercent),
    spreadAtReferenceDeg: Number.isFinite(raw.spreadAtReferenceDeg) ? Math.max(0, raw.spreadAtReferenceDeg) : AIMING_TUNING_DEFAULTS.spreadAtReferenceDeg,
    amplitudeMultiplier: Number.isFinite(raw.amplitudeMultiplier) ? Math.max(0, raw.amplitudeMultiplier) : AIMING_TUNING_DEFAULTS.amplitudeMultiplier,
    speedMultiplier: Number.isFinite(raw.speedMultiplier) ? Math.max(0, raw.speedMultiplier) : AIMING_TUNING_DEFAULTS.speedMultiplier,
    curveExponent: Number.isFinite(raw.curveExponent) ? Math.max(0.1, raw.curveExponent) : AIMING_TUNING_DEFAULTS.curveExponent
  };
}

function ensureAimingDebuggerBridge(){
  const existing = window.paperWingsAimingDebugger;
  if(existing && existing.state){
    existing.state.tuning = normalizeAimingTuning(existing.state.tuning);
  }

  const bridge = existing && existing.state ? existing : { state: { enabled: false, tuning: normalizeAimingTuning(AIMING_TUNING_DEFAULTS) } };

  bridge.setEnabled = function(value = true){
    this.state.enabled = !!value;
    return this.snapshot();
  };
  bridge.setAccuracy = function(percent){
    const clamped = clampAimingPercent(percent);
    settings.aimingAmplitude = clamped;
    setStoredSetting('settings.aimingAmplitude', clamped);
    return this.snapshot();
  };
  bridge.setTuning = function(nextTuning = {}){
    this.state.tuning = normalizeAimingTuning({ ...this.state.tuning, ...nextTuning });
    return this.snapshot();
  };
  bridge.reset = function(){
    this.state.enabled = false;
    this.state.tuning = normalizeAimingTuning(AIMING_TUNING_DEFAULTS);
    return this.snapshot();
  };
  bridge.getAccuracyTable = function(step = 10){
    const safeStep = Math.max(1, Math.floor(Number(step) || 10));
    const rows = [];
    for(let accuracy = 0; accuracy <= 100; accuracy += safeStep){
      rows.push({
        accuracyPercent: accuracy,
        spreadDeg: Number(getSpreadAngleDegByAccuracy(accuracy).toFixed(4))
      });
    }
    if(rows[rows.length - 1]?.accuracyPercent !== 100){
      rows.push({
        accuracyPercent: 100,
        spreadDeg: Number(getSpreadAngleDegByAccuracy(100).toFixed(4))
      });
    }
    return rows;
  };
  bridge.snapshot = function(){
    return {
      enabled: this.state.enabled,
      accuracyPercent: clampAimingPercent(settings.aimingAmplitude),
      tuning: { ...this.state.tuning },
      currentSpreadDeg: Number(getSpreadAngleDegByAccuracy(settings.aimingAmplitude).toFixed(4)),
      currentOscillationSpeed: Number(getAimingOscillationSpeed().toFixed(5))
    };
  };

  window.paperWingsAimingDebugger = bridge;
  return bridge;
}

const aimingDebuggerBridge = ensureAimingDebuggerBridge();

function getActiveAimingTuning(){
  const tuning = aimingDebuggerBridge?.state?.tuning;
  return normalizeAimingTuning(tuning || AIMING_TUNING_DEFAULTS);
}

function getAimingSpreadScale(accuracyPercent, tuning = AIMING_TUNING_DEFAULTS){
  const p = clampAimingPercent(accuracyPercent) / 100;
  const refP = clampAimingPercent(tuning.referenceAccuracyPercent, AIMING_TUNING_DEFAULTS.referenceAccuracyPercent) / 100;
  const exp = Number.isFinite(tuning.curveExponent) ? tuning.curveExponent : AIMING_TUNING_DEFAULTS.curveExponent;
  const normalizedRef = Math.max(refP, 1e-6);
  const belowReferenceRatio = clamp((refP - p) / normalizedRef, 0, 1);

  if(p >= refP){
    const numerator = Math.pow(1 - p, exp);
    const denominator = Math.pow(1 - refP, exp);
    const normalizedDenominator = denominator <= 1e-6 ? 1 : denominator;
    return numerator / normalizedDenominator;
  }

  return 1
    + belowReferenceRatio * 1.8
    + belowReferenceRatio * belowReferenceRatio * 2.2;
}

function getAimingOscillationSpeed(){
  const tuning = getActiveAimingTuning();
  const referenceAccuracy = clampAimingPercent(tuning.referenceAccuracyPercent, AIMING_TUNING_DEFAULTS.referenceAccuracyPercent);
  const currentAccuracy = clampAimingPercent(settings.aimingAmplitude, referenceAccuracy);
  const normalizedRef = Math.max(referenceAccuracy, 1e-6);
  const belowReferenceRatio = clamp((referenceAccuracy - currentAccuracy) / normalizedRef, 0, 1);
  const speedPenaltyScale = 1
    + belowReferenceRatio * 0.4
    + belowReferenceRatio * belowReferenceRatio * 0.2;

  return BASE_OSCILLATION_SPEED * tuning.speedMultiplier * speedPenaltyScale;
}

function getDragOscillationMultiplier(dragScale){
  const normalizedScale = clamp(Number.isFinite(dragScale) ? dragScale : 0, 0, 1);
  return normalizedScale;
}

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
const BASE_OSCILLATION_SPEED = 0.01;

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
let dynamiteState = [];
let aaPlacementPreview = null;
let aaPreviewTrail = [];

let aaPointerDown = false;

let phase = "MENU"; // MENU | AA_PLACEMENT (Anti-Aircraft placement) | ROUND_START | TURN | ROUND_END

const cargoState = [];

const CARGO_MAX_SPAWN_ATTEMPTS = 8;
let turnAdvanceCount = 0;

let currentPlacer = null; // 'green' | 'blue'

const mapDataBridge = window.paperWingsMapsData || {};
const MAP_DEFAULT_SPRITE_NAME = mapDataBridge.MAP_DEFAULT_SPRITE_NAME || "brick_1_default";
const MAP_BRICK_SPRITE_PATH = mapDataBridge.MAP_BRICK_SPRITE_PATH || "ui_gamescreen/bricks/brick_1_default.png";
const MAP_SPRITE_PATHS = mapDataBridge.MAP_SPRITE_PATHS || {
  [MAP_DEFAULT_SPRITE_NAME]: MAP_BRICK_SPRITE_PATH
};
const MAP_SPRITE_NAMES = Object.freeze(Object.keys(MAP_SPRITE_PATHS));
const MAP_VALID_SPRITE_NAMES = new Set(MAP_SPRITE_NAMES);
const MAP_DIAGONAL_SPRITE_NAME = "brick_4_diagonal";
const MAP_SPRITE_BASE_SIZES = Object.freeze({
  brick_1_default: { width: 20, height: 40 },
  brick_3_mini: { width: 20, height: 20 },
  brick_4_diagonal: { width: 60, height: 60 },
  brick_5_corner: { width: 40, height: 40 }
});
const MAP_RENDER_MODES = mapDataBridge.MAP_RENDER_MODES || { DATA: 'data' };
const MAPS = Array.isArray(mapDataBridge.MAPS) ? mapDataBridge.MAPS : [];

const MAP_RENDERERS = {
  SPRITES: 'sprites'
};
let currentMapSprites = [];
let currentMapName = "unknown map";

function compactObjectFields(source, defaults = {}){
  const compact = {};
  if(!source || typeof source !== "object"){
    return compact;
  }

  Object.entries(source).forEach(([key, value]) => {
    if(value === undefined || value === null) return;
    if(defaults[key] !== undefined && value === defaults[key]) return;
    compact[key] = value;
  });

  return compact;
}

function serializeMapSpriteForExport(sprite){
  if(!sprite || typeof sprite !== "object") return null;

  const supportedFields = {
    spriteName: typeof sprite.spriteName === "string" ? sprite.spriteName : undefined,
    x: Number.isFinite(sprite.x) ? sprite.x : undefined,
    y: Number.isFinite(sprite.y) ? sprite.y : undefined,
    rotate: Number.isFinite(sprite.rotate) ? sprite.rotate : undefined,
    scale: Number.isFinite(sprite.scale) ? sprite.scale : undefined,
    scaleX: Number.isFinite(sprite.scaleX) ? sprite.scaleX : undefined,
    scaleY: Number.isFinite(sprite.scaleY) ? sprite.scaleY : undefined,
    id: typeof sprite.id === "string" && sprite.id.length > 0 ? sprite.id : undefined,
  };

  return compactObjectFields(supportedFields, {
    rotate: 0,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
  });
}

function resolveCurrentMapForExport(){
  const byName = MAPS.find((map) => map?.name === currentMapName || map?.id === currentMapName);
  if(byName) return byName;

  const byIndex = MAPS[clampMapIndex(settings?.mapIndex)];
  if(byIndex) return byIndex;

  return null;
}

/**
 * Каркас экспорта карты для будущего импорта:
 * {
 *   formatVersion: 1,
 *   map: {
 *     id?, name?, mode?, tier?,
 *     sprites: [{ spriteName, x, y, rotate?, scale?, scaleX?, scaleY?, id? }],
 *     flags?: [...]
 *   }
 * }
 * Поля со значениями по умолчанию можно пропускать для компактного JSON.
 */
function resolveExportMapId(){
  const mapData = resolveCurrentMapForExport();
  const candidate = typeof mapData?.id === "string" && mapData.id.trim().length > 0
    ? mapData.id.trim()
    : (typeof currentMapName === "string" && currentMapName.trim().length > 0 ? currentMapName.trim() : "custom");
  return candidate
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/^_+|_+$/g, "")
    || "custom";
}

function downloadMapJsonFile(serializedMap, mapName = ""){
  const jsonText = JSON.stringify(serializedMap, null, 2);
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  const sanitizedMapName = typeof mapName === "string"
    ? mapName.trim().replace(/[\\/:*?"<>|]/g, "_")
    : "";
  const resolvedName = sanitizedMapName.length > 0 ? sanitizedMapName : resolveExportMapId();
  link.download = `gs_maps_${resolvedName}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

async function copyMapJsonToClipboard(jsonText){
  if(!navigator?.clipboard?.writeText){
    return false;
  }

  try {
    await navigator.clipboard.writeText(jsonText);
    return true;
  } catch (error) {
    console.warn("[mapeditor] Clipboard copy failed", error);
    return false;
  }
}

async function saveCurrentMapFromEditor(){
  const mapName = mapEditorSaveNameInput instanceof HTMLInputElement
    ? mapEditorSaveNameInput.value.trim().slice(0, 10)
    : "";
  const mapDifficultyInput = document.querySelector('input[name="mapEditorDifficulty"]:checked');
  const mapDifficulty = mapDifficultyInput instanceof HTMLInputElement
    ? mapDifficultyInput.value
    : "";

  if(!mapName || !mapDifficulty){
    showRoundBanner("Укажите название и сложность");
    return;
  }

  const spriteValidation = validateMapSpritesForTransfer(currentMapSprites);
  if(spriteValidation.errors.length > 0){
    const errorTitle = "Карту не сохранили: есть проблемы в спрайтах";
    const errorLines = spriteValidation.errors.map((message) => `• ${message}`);
    alert([errorTitle, ...errorLines].join("\n"));
    showRoundBanner("Сохранение остановлено: исправьте спрайты");
    return;
  }

  if(spriteValidation.warnings.length > 0){
    const warningTitle = "Карту сохранили, но есть замечания";
    const warningLines = spriteValidation.warnings.map((message) => `• ${message}`);
    alert([warningTitle, ...warningLines].join("\n"));
  }

  const serializedMap = serializeCurrentMapState({
    mapName,
    mapDifficulty,
  });
  const jsonText = JSON.stringify(serializedMap, null, 2);
  const copied = await copyMapJsonToClipboard(jsonText);

  downloadMapJsonFile(serializedMap, mapName);

  if(copied){
    showRoundBanner("Карта скопирована и скачана");
  } else {
    showRoundBanner("Не удалось скопировать, скачайте файл");
  }
}

function setMapEditorSaveDialogVisible(visible){
  if(!(mapEditorSaveDialog instanceof HTMLElement)) return;
  mapEditorSaveDialog.hidden = !visible;
  mapEditorSaveDialog.setAttribute("aria-hidden", visible ? "false" : "true");

  if(visible){
    mapEditorSaveNameInput?.focus();
  }
}

function syncMapEditorSaveDialogSubmitState(){
  if(!(mapEditorSaveDialogSubmitBtn instanceof HTMLButtonElement)) return;
  const hasName = mapEditorSaveNameInput instanceof HTMLInputElement
    && mapEditorSaveNameInput.value.trim().length > 0;
  const hasDifficulty = !!document.querySelector('input[name="mapEditorDifficulty"]:checked');
  mapEditorSaveDialogSubmitBtn.disabled = !(hasName && hasDifficulty);
}

function openMapEditorSaveDialog(){
  if(!(mapEditorSaveNameInput instanceof HTMLInputElement)) return;
  if(selectedRuleset !== "mapeditor") return;

  mapEditorSaveNameInput.value = "";
  document
    .querySelectorAll('input[name="mapEditorDifficulty"]')
    .forEach((input) => {
      if(input instanceof HTMLInputElement){
        input.checked = false;
      }
    });

  syncMapEditorSaveDialogSubmitState();
  setMapEditorSaveDialogVisible(true);
}

function closeMapEditorSaveDialog(){
  setMapEditorSaveDialogVisible(false);
}

function validateMapSpritesForTransfer(sprites){
  const spriteEntries = Array.isArray(sprites) ? sprites : [];
  const errors = [];
  const warnings = [];
  const allowedFields = new Set(["spriteName", "x", "y", "rotate", "scale", "scaleX", "scaleY", "id"]);

  spriteEntries.forEach((sprite, index) => {
    if(!sprite || typeof sprite !== "object"){
      errors.push(`Кирпич #${index}: запись повреждена`);
      return;
    }

    const spriteName = typeof sprite.spriteName === "string" ? sprite.spriteName : "";
    if(!MAP_VALID_SPRITE_NAMES.has(spriteName)){
      errors.push(`Кирпич #${index}: неизвестный тип спрайта`);
    }

    if(!Number.isFinite(sprite.x) || !Number.isFinite(sprite.y)){
      errors.push(`Кирпич #${index}: некорректная позиция X/Y`);
    }

    if(sprite.rotate !== undefined && !Number.isFinite(sprite.rotate)){
      errors.push(`Кирпич #${index}: угол поворота задан неверно`);
    }

    if(sprite.scale !== undefined && !Number.isFinite(sprite.scale)){
      errors.push(`Кирпич #${index}: общий масштаб задан неверно`);
    }

    if(sprite.scaleX !== undefined && !Number.isFinite(sprite.scaleX)){
      errors.push(`Кирпич #${index}: масштаб по ширине задан неверно`);
    }

    if(sprite.scaleY !== undefined && !Number.isFinite(sprite.scaleY)){
      errors.push(`Кирпич #${index}: масштаб по высоте задан неверно`);
    }

    Object.keys(sprite).forEach((fieldName) => {
      if(!allowedFields.has(fieldName)){
        warnings.push(`Кирпич #${index}: лишнее поле «${fieldName}», его не сохраним`);
      }
    });
  });

  return { errors, warnings };
}

function serializeCurrentMapState(options = {}){
  const customName = typeof options.mapName === "string" ? options.mapName.trim().slice(0, 10) : "";
  const customDifficulty = typeof options.mapDifficulty === "string"
    ? normalizeMapTier(options.mapDifficulty)
    : "";
  const customId = customName
    ? customName
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .replace(/^_+|_+$/g, "")
    : "";
  const currentMapMeta = resolveCurrentMapForExport();
  const rawSprites = Array.isArray(currentMapSprites) ? currentMapSprites : [];
  const sprites = rawSprites
    .map((sprite) => serializeMapSpriteForExport(sprite))
    .filter((sprite) => sprite && Object.keys(sprite).length > 0);

  const rawMap = {
    id: customId || (typeof currentMapMeta?.id === "string" && currentMapMeta.id.length > 0
      ? currentMapMeta.id
      : undefined),
    name: customName || (typeof currentMapName === "string" && currentMapName.length > 0
      ? currentMapName
      : (typeof currentMapMeta?.name === "string" ? currentMapMeta.name : undefined)),
    mode: typeof currentMapMeta?.mode === "string" && currentMapMeta.mode.length > 0
      ? currentMapMeta.mode
      : undefined,
    tier: customDifficulty || (typeof currentMapMeta?.tier === "string" && currentMapMeta.tier.length > 0
      ? currentMapMeta.tier
      : undefined),
    difficulty: customDifficulty || undefined,
    sprites,
    flags: Array.isArray(flagConfigs) && flagConfigs.length > 0 ? flagConfigs : undefined,
  };

  return {
    formatVersion: 1,
    map: compactObjectFields(rawMap),
  };
}

const RANDOM_MAP_SENTINEL_INDEX = MAPS.findIndex(map => map?.name?.toLowerCase?.() === 'random map');
const PLAYABLE_MAP_INDICES = MAPS
  .map((_, index) => index)
  .filter(index => index !== RANDOM_MAP_SENTINEL_INDEX);

let randomMapPairSequenceNumber = null;
let randomMapPairIndex = null;

function normalizeMapTier(tier){
  const normalizedTier = typeof tier === 'string' ? tier.trim().toLowerCase() : '';
  if(normalizedTier === 'easy'){
    return 'easy';
  }
  if(normalizedTier === 'hard'){
    return 'middle';
  }
  return 'middle';
}

function getMapTierForRound(roundNumber){
  if(roundNumber <= 4){
    return 'easy';
  }
  return 'middle';
}

function getPlayableMapIndicesForRound(roundNumber = 1){
  const targetTier = getMapTierForRound(roundNumber);
  const tierMatches = PLAYABLE_MAP_INDICES.filter(index => normalizeMapTier(MAPS[index]?.tier) === targetTier);
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
  aimingAmplitude: 80,
  addAA: true,
  sharpEdges: true,
  flagsEnabled: true,
  addCargo: true,
  mapIndex: 0,
  arcadeMode: false
});

if(!Number.isFinite(sharedSettings.flightRangeCells)){
  sharedSettings.flightRangeCells = 30;
}
if(!Number.isFinite(sharedSettings.aimingAmplitude)){
  sharedSettings.aimingAmplitude = 80;
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
  sharedSettings.addCargo = true;
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
if(typeof sharedSettings.arcadeMode !== 'boolean'){
  sharedSettings.arcadeMode = false;
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

function getStoredGameMode(fallbackMode = "hotSeat"){
  const storedMode = normalizeGameMode(getStoredSetting(GAME_MODE_STORAGE_KEY));
  if(storedMode){
    return storedMode;
  }
  return normalizeGameMode(fallbackMode) || "hotSeat";
}

function setStoredGameMode(mode){
  const normalized = normalizeGameMode(mode);
  if(!normalized) return false;
  setStoredSetting(GAME_MODE_STORAGE_KEY, normalized);
  return true;
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
  if(!Number.isFinite(settings.aimingAmplitude)){
    settings.aimingAmplitude = 80;
  }
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
  settings.addCargo = storedAddCargo === null ? true : storedAddCargo === 'true';
  const mapIdx = parseInt(getStoredSetting('settings.mapIndex'), 10);
  settings.mapIndex = clampMapIndex(mapIdx);
  const storedFlameStyle = normalizeFlameStyleKey(getStoredSetting('settings.flameStyle'));
  settings.flameStyle = storedFlameStyle;
  settings.randomizeMapEachRound = getStoredSetting('settings.randomizeMapEachRound') === 'true';
  const storedArcadeMode = getStoredSetting('settings.arcadeMode');
  settings.arcadeMode = storedArcadeMode === null
    ? false
    : storedArcadeMode === 'true' || storedArcadeMode === true || storedArcadeMode === '1' || storedArcadeMode === 1;

  // Clamp loaded values so corrupted or out-of-range settings
  // don't break the game on startup
  settings.flightRangeCells = Math.min(MAX_FLIGHT_RANGE_CELLS,
    Math.max(MIN_FLIGHT_RANGE_CELLS, settings.flightRangeCells));
  if(!Number.isFinite(settings.aimingAmplitude)){
    settings.aimingAmplitude = 80;
  }

  if(previousFlameStyle !== settings.flameStyle){
    onFlameStyleChanged();
  }
}

function loadSettingsForRuleset(ruleset = selectedRuleset){
  loadSettings();
  if(ruleset === "mapeditor"){
    settingsBridge.setMapIndex(0, { persist: false });
    settings.randomizeMapEachRound = false;
    settings.arcadeMode = false;
  }
  if(ruleset === "classic"){
    settings.arcadeMode = false;
  }
  if(!isInventoryInvisibilityEnabled()){
    resetPlayerInventoryEffects();
    resetAllPlaneInvisibilityToOpaque();
  }
}

loadSettings();
selectedMode = "hotSeat";
syncInventoryVisibility();

window.addEventListener('paperWingsSettingsChanged', (event) => {
  const payloadAddCargo = event?.detail?.addCargo;
  if(typeof payloadAddCargo === 'boolean'){
    settings.addCargo = payloadAddCargo;
  } else if(typeof sharedSettings.addCargo === 'boolean'){
    settings.addCargo = sharedSettings.addCargo;
  }
  syncInventoryVisibility();
});

// Always keep menu defaults on first paint so startup state stays predictable.
selectedRuleset = "classic";

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

const ARCADE_SCORE_CONTAINERS = Object.freeze(HUD_LAYOUT.arcadeScore);

const ARCADE_SCORE_CONTAINER_FILL = "#E6D2AE";
const ARCADE_SCORE_TEXT_STROKE = ARCADE_SCORE_CONTAINER_FILL;

const ARCADE_SCORE_TEXT_STYLES = {
  blue: {
    fill: ARCADE_SCORE_CONTAINER_FILL,
    fontWeight: 500,
    baseFontSize: 24,
    fontFamily: "'Inter', 'Roboto', sans-serif"
  },
  green: {
    fill: ARCADE_SCORE_CONTAINER_FILL,
    fontWeight: 500,
    baseFontSize: 24,
    fontFamily: "'Inter', 'Roboto', sans-serif"
  }
};

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

const AI_SELF_ANALYZER_STORAGE_KEY = "paper-wings-ai-self-analyzer-v1";
const AI_SELF_ANALYZER_MAX_MATCHES = 30;
const AI_SELF_ANALYZER_MAX_DECISION_EVENTS = 140;
const planeAnalyticsIds = new WeakMap();
let nextPlaneAnalyticsId = 1;

const aiSelfAnalyzerState = {
  activeMatch: null,
  history: [],
};

function safeNowIso(){
  try {
    return new Date().toISOString();
  } catch (_error){
    return "";
  }
}

function ensurePlaneAnalyticsId(plane){
  if(!plane || typeof plane !== "object") return null;
  if(!planeAnalyticsIds.has(plane)){
    planeAnalyticsIds.set(plane, `plane_${nextPlaneAnalyticsId++}`);
  }
  return planeAnalyticsIds.get(plane);
}

function getAnalyticsHistoryFromStorage(){
  if(typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(AI_SELF_ANALYZER_STORAGE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error){
    return [];
  }
}

function saveAnalyticsHistoryToStorage(history){
  if(typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AI_SELF_ANALYZER_STORAGE_KEY, JSON.stringify(history));
  } catch (_error){
    // ignore quota errors
  }
}

function startAiSelfAnalyzerMatchIfNeeded(){
  if(aiSelfAnalyzerState.activeMatch) return;
  aiSelfAnalyzerState.activeMatch = {
    version: 1,
    startedAt: safeNowIso(),
    finishedAt: null,
    mode: gameMode || selectedMode || null,
    ruleset: selectedRuleset || null,
    mapIndex: settings?.mapIndex ?? null,
    rounds: [],
    turns: [],
    eventTypes: ["launch", "ai_decision", "human_decision"],
    events: [],
    summary: null,
  };
}

function recordAiSelfAnalyzerEvent(event){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active || !event || typeof event !== "object") return;

  active.events.push(event);

  const decisionEvents = active.events.filter((entry) => (
    entry?.type === "ai_decision" || entry?.type === "human_decision"
  ));
  const overflow = decisionEvents.length - AI_SELF_ANALYZER_MAX_DECISION_EVENTS;
  if(overflow > 0){
    let removed = 0;
    active.events = active.events.filter((entry) => {
      if(entry?.type !== "ai_decision" && entry?.type !== "human_decision") return true;
      if(removed < overflow){
        removed += 1;
        return false;
      }
      return true;
    });
  }
}

function recordAiSelfAnalyzerDecision(stage, details = {}){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active || !stage) return;

  const compactReasonCodes = Array.isArray(details.reasonCodes)
    ? details.reasonCodes
      .filter((code) => typeof code === "string" && code.trim().length > 0)
      .slice(0, 3)
    : [];
  const compactRejectReasons = Array.isArray(details.rejectReasons)
    ? details.rejectReasons
      .filter((code) => typeof code === "string" && code.trim().length > 0)
      .slice(0, 4)
    : [];

  const event = {
    type: "ai_decision",
    at: safeNowIso(),
    roundNumber,
    turnColor: turnColors[turnIndex] ?? null,
    stage,
    goal: details.goal ?? aiRoundState?.currentGoal ?? null,
    planeId: details.planeId ?? null,
    reasonCodes: compactReasonCodes,
  };

  if(compactRejectReasons.length > 0){
    event.rejectReasons = compactRejectReasons;
  }

  if(typeof details.errorMessage === "string" && details.errorMessage.trim().length > 0){
    event.errorMessage = details.errorMessage.trim().slice(0, 240);
  }

  const move = details?.move;
  if(move && typeof move === "object"){
    const movePlane = move.plane;
    const movePlaneId = movePlane?.id ?? details.planeId ?? null;
    const moveDistance = Number.isFinite(move.totalDist)
      ? move.totalDist
      : (Number.isFinite(move.moveTotalDist) ? move.moveTotalDist : null);

    event.selectedMove = {
      planeId: movePlaneId,
      vx: Number.isFinite(move.vx) ? Number(move.vx.toFixed(3)) : null,
      vy: Number.isFinite(move.vy) ? Number(move.vy.toFixed(3)) : null,
      totalDist: Number.isFinite(moveDistance) ? Number(moveDistance.toFixed(2)) : null,
      goalName: move.goalName || null,
      decisionReason: move.decisionReason || null,
    };
  }

  const consideredMoves = Array.isArray(details?.consideredMoves)
    ? details.consideredMoves
      .slice(0, 6)
      .map((candidate) => ({
        planeId: candidate?.planeId ?? candidate?.plane?.id ?? null,
        score: Number.isFinite(candidate?.score) ? Number(candidate.score.toFixed(3)) : null,
        reason: candidate?.reason || null,
        rejectedBy: candidate?.rejectedBy || null,
      }))
      .filter((candidate) => candidate.planeId || candidate.score !== null || candidate.reason || candidate.rejectedBy)
    : [];

  if(consideredMoves.length > 0){
    event.consideredMoves = consideredMoves;
  }

  const initialCandidateSetDiagnostics = details?.initialCandidateSetDiagnostics;
  if(initialCandidateSetDiagnostics && typeof initialCandidateSetDiagnostics === "object"){
    const directCount = Number(initialCandidateSetDiagnostics.directCount);
    const gapCount = Number(initialCandidateSetDiagnostics.gapCount);
    const ricochetCount = Number(initialCandidateSetDiagnostics.ricochetCount);
    const shortlistDiagnostics = initialCandidateSetDiagnostics?.shortlistDiagnostics;
    const safeShortlistDiagnostics = shortlistDiagnostics && typeof shortlistDiagnostics === "object"
      ? ["direct", "gap", "ricochet"].reduce((acc, classKey) => {
          const entry = shortlistDiagnostics[classKey];
          if(!entry || typeof entry !== "object") return acc;
          const safeReasons = {};
          const rawReasons = entry.rejectReasons && typeof entry.rejectReasons === "object" ? entry.rejectReasons : {};
          for(const [reason, count] of Object.entries(rawReasons)){
            const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
            if(safeCount > 0) safeReasons[reason] = safeCount;
          }
          acc[classKey] = {
            initialReachable: Number.isFinite(entry.initialReachable) ? Math.max(0, Math.floor(entry.initialReachable)) : 0,
            shortlistCount: Number.isFinite(entry.shortlistCount) ? Math.max(0, Math.floor(entry.shortlistCount)) : 0,
            rejectedBetweenInitialAndShortlist: Number.isFinite(entry.rejectedBetweenInitialAndShortlist)
              ? Math.max(0, Math.floor(entry.rejectedBetweenInitialAndShortlist))
              : 0,
            rejectReasons: safeReasons,
          };
          return acc;
        }, {})
      : null;
    const safeDisproportionateReasons = Array.isArray(initialCandidateSetDiagnostics?.disproportionateShortlistRejectReasons)
      ? initialCandidateSetDiagnostics.disproportionateShortlistRejectReasons
        .slice(0, 2)
        .map((entry) => ({
          reason: typeof entry?.reason === "string" ? entry.reason : "unknown",
          specialCount: Number.isFinite(entry?.specialCount) ? Math.max(0, Math.floor(entry.specialCount)) : 0,
          directCount: Number.isFinite(entry?.directCount) ? Math.max(0, Math.floor(entry.directCount)) : 0,
          specialRate: Number.isFinite(entry?.specialRate) ? Number(entry.specialRate.toFixed(4)) : 0,
          directRate: Number.isFinite(entry?.directRate) ? Number(entry.directRate.toFixed(4)) : 0,
          disproportionality: Number.isFinite(entry?.disproportionality) ? Number(entry.disproportionality.toFixed(4)) : 0,
        }))
      : [];

    event.initialCandidateSetDiagnostics = {
      directCount: Number.isFinite(directCount) ? Math.max(0, Math.floor(directCount)) : 0,
      gapCount: Number.isFinite(gapCount) ? Math.max(0, Math.floor(gapCount)) : 0,
      ricochetCount: Number.isFinite(ricochetCount) ? Math.max(0, Math.floor(ricochetCount)) : 0,
      hasDirect: Boolean(initialCandidateSetDiagnostics.hasDirect),
      hasGap: Boolean(initialCandidateSetDiagnostics.hasGap),
      hasRicochet: Boolean(initialCandidateSetDiagnostics.hasRicochet),
      goalName: initialCandidateSetDiagnostics.goalName || null,
      shortlistDiagnostics: safeShortlistDiagnostics,
      disproportionateShortlistRejectReasons: safeDisproportionateReasons,
    };
  }

  const finalComparedDiagnostics = details?.finalComparedDiagnostics;
  if(finalComparedDiagnostics && typeof finalComparedDiagnostics === "object"){
    const safeClassPresence = finalComparedDiagnostics?.classPresence && typeof finalComparedDiagnostics.classPresence === "object"
      ? {
          direct: Number.isFinite(finalComparedDiagnostics.classPresence.direct)
            ? Math.max(0, Math.floor(finalComparedDiagnostics.classPresence.direct))
            : 0,
          gap: Number.isFinite(finalComparedDiagnostics.classPresence.gap)
            ? Math.max(0, Math.floor(finalComparedDiagnostics.classPresence.gap))
            : 0,
          ricochet: Number.isFinite(finalComparedDiagnostics.classPresence.ricochet)
            ? Math.max(0, Math.floor(finalComparedDiagnostics.classPresence.ricochet))
            : 0,
        }
      : null;
    const winner = finalComparedDiagnostics?.winner;
    event.finalComparedDiagnostics = {
      source: finalComparedDiagnostics.source || null,
      goalName: finalComparedDiagnostics.goalName || null,
      comparedCount: Number.isFinite(finalComparedDiagnostics.comparedCount)
        ? Math.max(0, Math.floor(finalComparedDiagnostics.comparedCount))
        : 0,
      classPresence: safeClassPresence,
      winnerClass: typeof winner?.classLabel === "string" ? winner.classLabel : null,
    };
  }

  const fallbackDiagnostics = details?.fallbackDiagnostics;
  if(fallbackDiagnostics && typeof fallbackDiagnostics === "object"){
    event.fallbackDiagnostics = {
      stageBeforeFallback: fallbackDiagnostics.stageBeforeFallback || null,
      fallbackGoal: fallbackDiagnostics.fallbackGoal || null,
      fallbackDecisionReason: fallbackDiagnostics.fallbackDecisionReason || null,
      fallbackValidationReason: fallbackDiagnostics.fallbackValidationReason || null,
      rootCauseHint: fallbackDiagnostics.rootCauseHint || null,
    };
  }

  recordAiSelfAnalyzerEvent(event);
}

function getHumanDecisionLandingPoint(plane, vx, vy){
  if(!plane) return null;
  const moveDurationSec = Number.isFinite(FIELD_FLIGHT_DURATION_SEC) && FIELD_FLIGHT_DURATION_SEC > 0
    ? FIELD_FLIGHT_DURATION_SEC
    : 1;
  return {
    x: plane.x + vx * moveDurationSec,
    y: plane.y + vy * moveDurationSec,
  };
}

function getHumanDecisionNearestTarget(plane, landingPoint){
  if(!plane || !landingPoint) return null;
  const enemyColor = plane.color === "blue" ? "green" : "blue";
  const candidates = [];

  points
    .filter((candidate) => candidate?.color === enemyColor && candidate !== plane && isPlaneTargetable(candidate))
    .forEach((enemyPlane) => {
      candidates.push({
        kind: "enemy_plane",
        id: ensurePlaneAnalyticsId(enemyPlane),
        distance: dist(landingPoint, enemyPlane),
      });
    });

  const enemyBase = getBaseAnchor(enemyColor);
  if(enemyBase){
    candidates.push({
      kind: "enemy_base",
      id: `base_${enemyColor}`,
      distance: dist(landingPoint, enemyBase),
    });
  }

  cargoState
    .filter((cargo) => cargo?.state === "ready")
    .forEach((cargo, cargoIndex) => {
      const cargoCenter = getCargoVisualCenter(cargo);
      candidates.push({
        kind: "cargo",
        id: `cargo_${cargoIndex}`,
        distance: dist(landingPoint, cargoCenter),
      });
    });

  getAvailableFlagsByColor(enemyColor).forEach((flag) => {
    const flagAnchor = getFlagAnchor(flag);
    candidates.push({
      kind: "enemy_flag",
      id: flag?.id || `flag_${enemyColor}`,
      distance: dist(landingPoint, flagAnchor),
    });
  });

  if(candidates.length === 0) return null;
  const nearest = candidates.reduce((best, candidate) => (
    !best || candidate.distance < best.distance ? candidate : best
  ), null);

  return {
    kind: nearest.kind,
    id: nearest.id,
    distance: Number(nearest.distance.toFixed(1)),
  };
}

function evaluateHumanDecisionRisk(plane, landingPoint){
  if(!plane || !landingPoint) return { score: null };
  const enemyColor = plane.color === "blue" ? "green" : "blue";
  const enemyPlanes = points.filter((candidate) => candidate?.color === enemyColor && isPlaneTargetable(candidate));
  const nearestEnemyDistance = enemyPlanes.reduce((best, enemyPlane) => {
    const nextDistance = dist(landingPoint, enemyPlane);
    return Math.min(best, nextDistance);
  }, Number.POSITIVE_INFINITY);

  const enemyBase = getBaseAnchor(enemyColor);
  const enemyBaseDistance = enemyBase ? dist(landingPoint, enemyBase) : Number.POSITIVE_INFINITY;
  const hasClearEnemyLane = enemyPlanes.some((enemyPlane) => isPathClear(enemyPlane.x, enemyPlane.y, landingPoint.x, landingPoint.y));

  let score = 0;
  if(Number.isFinite(nearestEnemyDistance)){
    if(nearestEnemyDistance <= ATTACK_RANGE_PX * 0.7) score += 0.65;
    else if(nearestEnemyDistance <= ATTACK_RANGE_PX) score += 0.45;
    else if(nearestEnemyDistance <= ATTACK_RANGE_PX * 1.35) score += 0.25;
  }
  if(Number.isFinite(enemyBaseDistance)){
    if(enemyBaseDistance <= ATTACK_RANGE_PX * 0.85) score += 0.35;
    else if(enemyBaseDistance <= ATTACK_RANGE_PX * 1.2) score += 0.18;
  }
  if(hasClearEnemyLane) score += 0.18;

  return {
    score: Number(Math.min(1, score).toFixed(3)),
    nearestEnemyDistance: Number.isFinite(nearestEnemyDistance) ? Number(nearestEnemyDistance.toFixed(1)) : null,
    enemyBaseDistance: Number.isFinite(enemyBaseDistance) ? Number(enemyBaseDistance.toFixed(1)) : null,
    hasClearEnemyLane,
  };
}

function getHumanDecisionTag(nearestTarget, risk){
  if(nearestTarget?.kind === "enemy_plane" && Number.isFinite(nearestTarget?.distance) && nearestTarget.distance <= ATTACK_RANGE_PX * 0.9){
    return "attack";
  }
  if(nearestTarget?.kind === "cargo" && Number.isFinite(nearestTarget?.distance) && nearestTarget.distance <= ATTACK_RANGE_PX * 0.85){
    return "cargo";
  }
  if(nearestTarget?.kind === "enemy_base" && Number.isFinite(nearestTarget?.distance) && nearestTarget.distance <= ATTACK_RANGE_PX){
    return "block";
  }
  if(Number.isFinite(risk?.score) && risk.score <= 0.35){
    return "safe";
  }
  return "attack";
}

function recordHumanDecisionEvent(plane, vx, vy){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active || !plane) return;

  const planeId = ensurePlaneAnalyticsId(plane);
  const landingPoint = getHumanDecisionLandingPoint(plane, vx, vy);
  const nearestTarget = getHumanDecisionNearestTarget(plane, landingPoint);
  const risk = evaluateHumanDecisionRisk(plane, landingPoint);
  const decisionTag = getHumanDecisionTag(nearestTarget, risk);
  const totalDist = Math.hypot(vx, vy) * FIELD_FLIGHT_DURATION_SEC;

  const event = {
    type: "human_decision",
    at: safeNowIso(),
    roundNumber,
    turnColor: turnColors[turnIndex] ?? null,
    stage: "human_confirm",
    goal: nearestTarget?.kind ?? decisionTag,
    planeId,
    reasonCodes: [decisionTag],
    selectedMove: {
      planeId,
      vx: Number.isFinite(vx) ? Number(vx.toFixed(3)) : null,
      vy: Number.isFinite(vy) ? Number(vy.toFixed(3)) : null,
      totalDist: Number.isFinite(totalDist) ? Number(totalDist.toFixed(2)) : null,
      goalName: nearestTarget?.kind ?? null,
      decisionReason: decisionTag,
    },
    decisionTag,
  };

  if(nearestTarget){
    event.nearestTarget = nearestTarget;
  }
  if(Number.isFinite(risk?.score)){
    event.risk = risk;
  }

  recordAiSelfAnalyzerEvent(event);
}

function ensureAiSelfAnalyzerRound(){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active) return null;
  let round = active.rounds.find((entry) => entry.roundNumber === roundNumber);
  if(!round){
    round = {
      roundNumber,
      startedAt: safeNowIso(),
      launches: [],
      eliminationsByColor: { blue: 0, green: 0 },
      turnSwitches: 0,
      scoreTimeline: []
    };
    active.rounds.push(round);
  }
  return round;
}

function recordAiSelfAnalyzerLaunch(plane, vx, vy, actor){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active || !plane) return;
  const round = ensureAiSelfAnalyzerRound();
  if(!round) return;

  const planeId = ensurePlaneAnalyticsId(plane);
  const maxLaunchSpeed = Math.max(1, (getEffectiveFlightRangeCells(plane) * CELL_SIZE) / FIELD_FLIGHT_DURATION_SEC);
  const launchSpeed = Math.hypot(vx, vy);
  const powerRatio = Math.max(0, Math.min(1, launchSpeed / maxLaunchSpeed));
  const angleDeg = (Math.atan2(vy, vx) * 180 / Math.PI + 360) % 360;

  const event = {
    type: "launch",
    at: safeNowIso(),
    roundNumber,
    turnColor: turnColors[turnIndex] ?? null,
    planeId,
    color: plane.color,
    actor,
    speed: Number(launchSpeed.toFixed(2)),
    powerRatio: Number(powerRatio.toFixed(4)),
    angleDeg: Number(angleDeg.toFixed(2))
  };

  round.launches.push(event);
  round.scoreTimeline.push({
    at: event.at,
    blueScore,
    greenScore
  });
  recordAiSelfAnalyzerEvent(event);
}

function recordAiSelfAnalyzerTurnAdvance(previousTurnColor, nextTurnColor){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active) return;
  const round = ensureAiSelfAnalyzerRound();
  if(!round) return;
  round.turnSwitches += 1;
  active.turns.push({
    at: safeNowIso(),
    roundNumber,
    previousTurnColor,
    nextTurnColor
  });
}

function recordAiSelfAnalyzerElimination(plane){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active || !plane) return;
  const round = ensureAiSelfAnalyzerRound();
  if(!round) return;
  if(plane.color === "blue" || plane.color === "green"){
    round.eliminationsByColor[plane.color] += 1;
  }
}

function buildAiSelfAnalyzerSummary(match){
  const launches = match.rounds.flatMap((round) => round.launches || []);
  const groupedByColor = {
    blue: launches.filter((event) => event.color === "blue"),
    green: launches.filter((event) => event.color === "green")
  };
  const analyzeColor = (color) => {
    const colorLaunches = groupedByColor[color];
    const total = colorLaunches.length;
    const avgPower = total > 0
      ? colorLaunches.reduce((sum, event) => sum + (event.powerRatio || 0), 0) / total
      : 0;
    const longShotRate = total > 0
      ? colorLaunches.filter((event) => (event.powerRatio || 0) >= 0.75).length / total
      : 0;
    const veryLowPowerRate = total > 0
      ? colorLaunches.filter((event) => (event.powerRatio || 0) < 0.30).length / total
      : 0;

    let repeatedPlaneShots = 0;
    for(let i = 1; i < colorLaunches.length; i += 1){
      if(colorLaunches[i].planeId === colorLaunches[i - 1].planeId){
        repeatedPlaneShots += 1;
      }
    }
    const repeatRate = total > 1 ? repeatedPlaneShots / (total - 1) : 0;

    const angleBuckets = {};
    colorLaunches.forEach((event) => {
      const bucket = Math.round((event.angleDeg || 0) / 45) * 45;
      angleBuckets[bucket] = (angleBuckets[bucket] || 0) + 1;
    });
    const dominantAngles = Object.entries(angleBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([angle, count]) => ({ angleDeg: Number(angle), count }));

    return {
      totalLaunches: total,
      avgPowerRatio: Number(avgPower.toFixed(4)),
      longShotRate: Number(longShotRate.toFixed(4)),
      veryLowPowerRate: Number(veryLowPowerRate.toFixed(4)),
      repeatedPlaneRate: Number(repeatRate.toFixed(4)),
      dominantAngles
    };
  };

  const blueStats = analyzeColor("blue");
  const greenStats = analyzeColor("green");

  const aiRecommendations = [];
  if(blueStats.longShotRate >= 0.6){
    aiRecommendations.push("Blue часто использует дальние выстрелы: ИИ стоит чаще играть через короткие ответные ходы и вынуждать ошибки на рикошетах.");
  }
  if(blueStats.repeatedPlaneRate >= 0.5){
    aiRecommendations.push("Blue часто запускает один и тот же самолёт подряд: ИИ может заранее закрывать траектории вокруг этого самолёта.");
  }
  if(blueStats.veryLowPowerRate >= 0.12){
    aiRecommendations.push("Blue слишком часто использует сверхслабые выстрелы: стоит повысить минимальную силу обычных ходов, кроме точных добиваний вблизи.");
  }
  if(greenStats.avgPowerRatio <= 0.45){
    aiRecommendations.push("Green в среднем играет короткими выстрелами: ИИ можно чаще агрессировать и поддавливать по дальности.");
  }

  return {
    totalRounds: match.rounds.length,
    totalLaunches: launches.length,
    launchesByColor: {
      blue: blueStats,
      green: greenStats
    },
    aiRecommendations
  };
}

function finalizeAiSelfAnalyzerMatch(result){
  const active = aiSelfAnalyzerState.activeMatch;
  if(!active) return;

  active.finishedAt = safeNowIso();
  active.result = result;
  active.summary = buildAiSelfAnalyzerSummary(active);

  const previousHistory = getAnalyticsHistoryFromStorage();
  const nextHistory = [active, ...previousHistory].slice(0, AI_SELF_ANALYZER_MAX_MATCHES);
  aiSelfAnalyzerState.history = nextHistory;
  saveAnalyticsHistoryToStorage(nextHistory);
  aiSelfAnalyzerState.activeMatch = null;
}

function exportLatestAiSelfAnalyzerJson(){
  const history = getAnalyticsHistoryFromStorage();
  if(history.length === 0){
    return null;
  }
  const latest = history[0];
  if(typeof document === "undefined"){
    return latest;
  }
  const payload = JSON.stringify(latest, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = latest.finishedAt ? latest.finishedAt.replace(/[:.]/g, "-") : "latest";
  link.href = url;
  link.download = `ai-self-analyzer-${suffix}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return latest;
}

function exportAiSelfAnalyzerTurnsJson(){
  const snapshot = getAiSelfAnalyzerSnapshot({ includeHistory: true });
  const activeMatch = snapshot?.activeMatch;
  const latestFinishedMatch = snapshot?.latestFinishedMatch;
  const source = activeMatch || latestFinishedMatch;
  if(!source){
    return null;
  }

  const turnsCount = Array.isArray(source.turns) ? source.turns.length : 0;
  const events = Array.isArray(source.events) ? source.events : [];
  const aiDecisionEvents = events.filter((event) => event?.type === "ai_decision");
  const humanDecisionEvents = events.filter((event) => event?.type === "human_decision");
  const launches = events.filter((event) => event?.type === "launch");

  const payloadObject = {
    reportType: activeMatch ? "active_turns_report" : "finished_match_turns_report",
    generatedAt: safeNowIso(),
    isMatchFinished: Boolean(source.finishedAt),
    sourceStartedAt: source.startedAt || null,
    sourceFinishedAt: source.finishedAt || null,
    roundNumber: source.rounds?.length || null,
    turnsCount,
    launchEventsCount: launches.length,
    aiDecisionEventsCount: aiDecisionEvents.length,
    humanDecisionEventsCount: humanDecisionEvents.length,
    aiMotivation: {
      description: "Лента решений ИИ по ходу матча. Показывает, какие варианты рассматривались, что было отвергнуто и какой ход выбран.",
      decisionEvents: aiDecisionEvents,
    },
    humanMotivation: {
      description: "Лента подтверждённых ходов человека в компактном формате, сопоставимом с ai_decision.",
      decisionEvents: humanDecisionEvents,
    },
    source,
  };

  if(typeof document === "undefined"){
    return payloadObject;
  }

  const payload = JSON.stringify(payloadObject, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = safeNowIso().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `ai-self-analyzer-turns-${suffix}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return payloadObject;
}

function buildAiSelfAnalyzerGapReport(source){
  if(!source || typeof source !== "object") return null;

  const events = Array.isArray(source.events) ? source.events : [];
  const rounds = Array.isArray(source.rounds) ? source.rounds : [];
  const result = source.result && typeof source.result === "object" ? source.result : {};

  const humanDecisionEvents = events.filter((event) => event?.type === "human_decision");
  const aiDecisionEvents = events.filter((event) => event?.type === "ai_decision");
  const launches = events.filter((event) => event?.type === "launch");

  const humanLaunches = launches.filter((event) => event?.actor === "human");
  const aiLaunches = launches.filter((event) => event?.actor === "computer");

  const humanColors = new Set(humanLaunches.map((event) => event?.color).filter((color) => color === "blue" || color === "green"));
  const aiColors = new Set(aiLaunches.map((event) => event?.color).filter((color) => color === "blue" || color === "green"));

  const eliminationsByColor = rounds.reduce((acc, round) => {
    const row = round?.eliminationsByColor || {};
    acc.blue += Number.isFinite(row.blue) ? row.blue : 0;
    acc.green += Number.isFinite(row.green) ? row.green : 0;
    return acc;
  }, { blue: 0, green: 0 });

  const finalScore = {
    blue: Number.isFinite(result.blueScore) ? result.blueScore : 0,
    green: Number.isFinite(result.greenScore) ? result.greenScore : 0,
  };

  const sumByColors = (sourceByColor, colors) => Array.from(colors).reduce((acc, color) => (
    acc + (Number.isFinite(sourceByColor[color]) ? sourceByColor[color] : 0)
  ), 0);

  const calcHumanDecisionMetrics = () => {
    const riskyDecisions = humanDecisionEvents.filter((event) => Number.isFinite(event?.risk?.score) && event.risk.score >= 0.6);
    const riskyMisses = riskyDecisions.filter((event) => {
      const targetDistance = Number.isFinite(event?.nearestTarget?.distance) ? event.nearestTarget.distance : null;
      return !Number.isFinite(targetDistance) || targetDistance > ATTACK_RANGE_PX;
    });
    const finishingAttempts = humanDecisionEvents.filter((event) => (
      event?.nearestTarget?.kind === "enemy_plane"
      && Number.isFinite(event?.nearestTarget?.distance)
      && event.nearestTarget.distance <= ATTACK_RANGE_PX * 0.9
    ));

    const positionalProgress = humanDecisionEvents
      .map((event) => {
        const targetDistance = Number.isFinite(event?.nearestTarget?.distance) ? event.nearestTarget.distance : null;
        const moveDistance = Number.isFinite(event?.selectedMove?.totalDist) ? event.selectedMove.totalDist : null;
        if(!Number.isFinite(targetDistance) || !Number.isFinite(moveDistance) || targetDistance <= 0) return null;
        return Math.max(0, Math.min(1, moveDistance / targetDistance));
      })
      .filter((value) => Number.isFinite(value));

    const avgPositionalProgress = positionalProgress.length > 0
      ? positionalProgress.reduce((sum, value) => sum + value, 0) / positionalProgress.length
      : 0;

    return {
      decisions: humanDecisionEvents.length,
      riskyDecisions: riskyDecisions.length,
      riskyMisses: riskyMisses.length,
      riskyMissRate: riskyDecisions.length > 0 ? riskyMisses.length / riskyDecisions.length : 0,
      finishingAttempts: finishingAttempts.length,
      finishingRate: humanDecisionEvents.length > 0 ? finishingAttempts.length / humanDecisionEvents.length : 0,
      avgPositionalProgress,
    };
  };

  const calcAiDecisionMetrics = () => {
    const includesFallbackToken = (value) => String(value || "").toLowerCase().includes("fallback");
    const isFallbackStageOrReason = (event) => {
      const stage = typeof event?.stage === "string" ? event.stage.toLowerCase() : "";
      const reasonCodes = Array.isArray(event?.reasonCodes) ? event.reasonCodes : [];
      return stage.includes("fallback") || reasonCodes.some((code) => includesFallbackToken(code));
    };

    const getTurnGroupKey = (event, index) => {
      const colorKey = event?.turnColor || "unknown_color";
      const roundKey = Number.isFinite(event?.roundNumber) ? event.roundNumber : "unknown_round";
      const explicitMarker = event?.turnMarker || event?.turnId || event?.turnNumber;
      if(explicitMarker !== null && explicitMarker !== undefined){
        return `${colorKey}:${roundKey}:${explicitMarker}`;
      }
      if(Number.isFinite(event?.roundNumber) && event?.turnColor){
        return `${colorKey}:${roundKey}`;
      }
      return `${colorKey}:${roundKey}:fallback_turn_${index}`;
    };

    const isExplicitFinalStage = (event) => {
      const stage = typeof event?.stage === "string" ? event.stage.toLowerCase() : "";
      if(!stage) return false;
      return stage.endsWith("_selected") || stage.endsWith("_move") || stage === "no_move_found";
    };

    const fallbackDecisions = aiDecisionEvents.filter((event) => isFallbackStageOrReason(event));

    const decisionsWithoutMove = aiDecisionEvents.filter((event) => !event?.selectedMove);
    const rejectReasonLoad = aiDecisionEvents
      .map((event) => Array.isArray(event?.rejectReasons) ? event.rejectReasons.length : 0)
      .filter((value) => Number.isFinite(value));
    const avgRejectReasonLoad = rejectReasonLoad.length > 0
      ? rejectReasonLoad.reduce((sum, value) => sum + value, 0) / rejectReasonLoad.length
      : 0;

    const avgMoveDistance = aiDecisionEvents
      .map((event) => Number.isFinite(event?.selectedMove?.totalDist) ? event.selectedMove.totalDist : null)
      .filter((value) => Number.isFinite(value));

    const groupedTurnEvents = aiDecisionEvents.reduce((map, event, index) => {
      const key = getTurnGroupKey(event, index);
      if(!map[key]){
        map[key] = [];
      }
      map[key].push(event);
      return map;
    }, {});

    const finalTurnEvents = Object.values(groupedTurnEvents)
      .map((turnEvents) => {
        const explicitFinalEvents = turnEvents.filter((event) => isExplicitFinalStage(event));
        if(explicitFinalEvents.length > 0){
          return explicitFinalEvents[explicitFinalEvents.length - 1];
        }
        return turnEvents[turnEvents.length - 1] || null;
      })
      .filter((event) => Boolean(event));

    const finalDecisionsWithoutMove = finalTurnEvents.filter((event) => !event?.selectedMove);
    const finalFallbackDecisions = finalTurnEvents.filter((event) => {
      if(!event?.selectedMove) return false;
      const move = event.selectedMove || {};
      const stage = typeof event?.stage === "string" ? event.stage.toLowerCase() : "";
      return (
        stage.includes("fallback")
        || includesFallbackToken(move.goalName)
        || includesFallbackToken(move.decisionReason)
        || isFallbackStageOrReason(event)
      );
    });
    const finalAvgMoveDistance = finalTurnEvents
      .map((event) => Number.isFinite(event?.selectedMove?.totalDist) ? event.selectedMove.totalDist : null)
      .filter((value) => Number.isFinite(value));

    const initialSetEvents = aiDecisionEvents.filter((event) => event?.initialCandidateSetDiagnostics);
    const initialSetWithGap = initialSetEvents.filter((event) => event.initialCandidateSetDiagnostics?.hasGap);
    const initialSetWithRicochet = initialSetEvents.filter((event) => event.initialCandidateSetDiagnostics?.hasRicochet);
    const initialSetMissingGapOrRicochet = initialSetEvents.filter((event) => (
      !event.initialCandidateSetDiagnostics?.hasGap
      || !event.initialCandidateSetDiagnostics?.hasRicochet
    ));

    const shortlistRejectStats = {
      direct: { rejected: 0, reasons: {} },
      gap: { rejected: 0, reasons: {} },
      ricochet: { rejected: 0, reasons: {} },
    };
    const addShortlistRejectReason = (classKey, reasonMap) => {
      if(!shortlistRejectStats[classKey] || !reasonMap || typeof reasonMap !== "object") return;
      for(const [reason, count] of Object.entries(reasonMap)){
        const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
        if(safeCount <= 0) continue;
        shortlistRejectStats[classKey].reasons[reason] = (shortlistRejectStats[classKey].reasons[reason] || 0) + safeCount;
      }
    };

    let shortlistDecisionsWithDiagnostics = 0;
    for(const event of initialSetEvents){
      const diagnostics = event?.initialCandidateSetDiagnostics?.shortlistDiagnostics;
      if(!diagnostics || typeof diagnostics !== "object") continue;
      shortlistDecisionsWithDiagnostics += 1;
      for(const classKey of ["direct", "gap", "ricochet"]){
        const meta = diagnostics[classKey] || {};
        const rejected = Number.isFinite(meta?.rejectedBetweenInitialAndShortlist)
          ? Math.max(0, meta.rejectedBetweenInitialAndShortlist)
          : 0;
        shortlistRejectStats[classKey].rejected += rejected;
        addShortlistRejectReason(classKey, meta?.rejectReasons || {});
      }
    }

    const normalModeBothSpecialLossEvents = initialSetEvents.filter((event) => {
      const goalName = `${event?.initialCandidateSetDiagnostics?.goalName || event?.goal || ""}`.toLowerCase();
      const isEmergency = goalName.includes("critical_base_threat") || goalName.includes("emergency_base_defense");
      if(isEmergency) return false;
      const diagnostics = event?.initialCandidateSetDiagnostics?.shortlistDiagnostics;
      if(!diagnostics || typeof diagnostics !== "object") return false;
      const gapInitial = Number.isFinite(diagnostics?.gap?.initialReachable) ? diagnostics.gap.initialReachable : 0;
      const ricochetInitial = Number.isFinite(diagnostics?.ricochet?.initialReachable) ? diagnostics.ricochet.initialReachable : 0;
      const gapShort = Number.isFinite(diagnostics?.gap?.shortlistCount) ? diagnostics.gap.shortlistCount : 0;
      const ricochetShort = Number.isFinite(diagnostics?.ricochet?.shortlistCount) ? diagnostics.ricochet.shortlistCount : 0;
      return gapInitial > 0 && ricochetInitial > 0 && gapShort <= 0 && ricochetShort <= 0;
    });

    const specialRejectedTotal = shortlistRejectStats.gap.rejected + shortlistRejectStats.ricochet.rejected;
    const directRejectedTotal = shortlistRejectStats.direct.rejected;
    const mergedSpecialReasons = {};
    for(const [reason, count] of Object.entries(shortlistRejectStats.gap.reasons)){
      mergedSpecialReasons[reason] = (mergedSpecialReasons[reason] || 0) + count;
    }
    for(const [reason, count] of Object.entries(shortlistRejectStats.ricochet.reasons)){
      mergedSpecialReasons[reason] = (mergedSpecialReasons[reason] || 0) + count;
    }

    const shortlistDisproportionateReasons = Object.entries(mergedSpecialReasons)
      .map(([reason, specialCount]) => {
        const safeSpecialCount = Number.isFinite(specialCount) ? Math.max(0, specialCount) : 0;
        const directCount = Number.isFinite(shortlistRejectStats.direct.reasons[reason])
          ? Math.max(0, shortlistRejectStats.direct.reasons[reason])
          : 0;
        const specialRate = specialRejectedTotal > 0 ? safeSpecialCount / specialRejectedTotal : 0;
        const directRate = directRejectedTotal > 0 ? directCount / directRejectedTotal : 0;
        return {
          reason,
          specialCount: safeSpecialCount,
          directCount,
          specialRate,
          directRate,
          disproportionality: specialRate - directRate,
        };
      })
      .filter((item) => item.specialCount > 0)
      .sort((a, b) => {
        if(Math.abs((b.disproportionality || 0) - (a.disproportionality || 0)) > 0.000001){
          return (b.disproportionality || 0) - (a.disproportionality || 0);
        }
        return (b.specialCount || 0) - (a.specialCount || 0);
      })
      .slice(0, 2)
      .map((item) => ({
        reason: item.reason,
        specialCount: item.specialCount,
        directCount: item.directCount,
        specialRate: Number(item.specialRate.toFixed(4)),
        directRate: Number(item.directRate.toFixed(4)),
        disproportionality: Number(item.disproportionality.toFixed(4)),
      }));

    const pipelineDiagnostics = {
      decisions: aiDecisionEvents.length,
      fallbackDecisions: fallbackDecisions.length,
      fallbackRate: aiDecisionEvents.length > 0 ? fallbackDecisions.length / aiDecisionEvents.length : 0,
      decisionsWithoutMove: decisionsWithoutMove.length,
      noMoveRate: aiDecisionEvents.length > 0 ? decisionsWithoutMove.length / aiDecisionEvents.length : 0,
      avgRejectReasonLoad,
      avgMoveDistance: avgMoveDistance.length > 0
        ? avgMoveDistance.reduce((sum, value) => sum + value, 0) / avgMoveDistance.length
        : 0,
      initialSetDiagnostics: {
        decisionsWithInitialSet: initialSetEvents.length,
        gapPresentRate: initialSetEvents.length > 0 ? initialSetWithGap.length / initialSetEvents.length : 0,
        ricochetPresentRate: initialSetEvents.length > 0 ? initialSetWithRicochet.length / initialSetEvents.length : 0,
        missingGapOrRicochetRate: initialSetEvents.length > 0 ? initialSetMissingGapOrRicochet.length / initialSetEvents.length : 0,
        shortlistDecisionsWithDiagnostics,
        shortlistRejectStats,
        shortlistDisproportionateReasons,
        normalModeBothSpecialLossRate: initialSetEvents.length > 0
          ? normalModeBothSpecialLossEvents.length / initialSetEvents.length
          : 0,
      },
    };

    const turnOutcomeMetrics = {
      turns: finalTurnEvents.length,
      fallbackDecisions: finalFallbackDecisions.length,
      fallbackRate: finalTurnEvents.length > 0 ? finalFallbackDecisions.length / finalTurnEvents.length : 0,
      decisionsWithoutMove: finalDecisionsWithoutMove.length,
      noMoveRate: finalTurnEvents.length > 0 ? finalDecisionsWithoutMove.length / finalTurnEvents.length : 0,
      avgMoveDistance: finalAvgMoveDistance.length > 0
        ? finalAvgMoveDistance.reduce((sum, value) => sum + value, 0) / finalAvgMoveDistance.length
        : 0,
    };

    return {
      pipelineDiagnostics,
      turnOutcomeMetrics,
      decisions: turnOutcomeMetrics.turns,
      fallbackDecisions: turnOutcomeMetrics.fallbackDecisions,
      fallbackRate: turnOutcomeMetrics.fallbackRate,
      decisionsWithoutMove: turnOutcomeMetrics.decisionsWithoutMove,
      noMoveRate: turnOutcomeMetrics.noMoveRate,
      avgRejectReasonLoad: pipelineDiagnostics.avgRejectReasonLoad,
      avgMoveDistance: turnOutcomeMetrics.avgMoveDistance,
    };
  };

  const humanDecisionMetrics = calcHumanDecisionMetrics();
  const aiDecisionMetrics = calcAiDecisionMetrics();

  const factualConsequences = {
    human: {
      launches: humanLaunches.length,
      pointsGained: sumByColors(finalScore, humanColors),
      losses: sumByColors(eliminationsByColor, humanColors),
    },
    ai: {
      launches: aiLaunches.length,
      pointsGained: sumByColors(finalScore, aiColors),
      losses: sumByColors(eliminationsByColor, aiColors),
    },
  };

  factualConsequences.human.pointsPerLaunch = factualConsequences.human.launches > 0
    ? factualConsequences.human.pointsGained / factualConsequences.human.launches
    : 0;
  factualConsequences.ai.pointsPerLaunch = factualConsequences.ai.launches > 0
    ? factualConsequences.ai.pointsGained / factualConsequences.ai.launches
    : 0;

  const humanStrengths = [];
  if(humanDecisionMetrics.riskyMissRate + 0.05 < aiDecisionMetrics.noMoveRate){
    humanStrengths.push("Человек реже теряет ход в рискованных эпизодах: меньше ситуаций, где решение остаётся без полезного продолжения.");
  }
  if(humanDecisionMetrics.finishingRate > 0.2){
    humanStrengths.push("Человек чаще доводит атаку до добивания цели, когда соперник уже в досягаемости.");
  }
  if(factualConsequences.human.pointsPerLaunch > factualConsequences.ai.pointsPerLaunch){
    humanStrengths.push("По фактическому результату у человека выше отдача от каждого запуска (очков за ход больше).");
  }

  const aiWeaknesses = [];
  if(aiDecisionMetrics.fallbackRate >= 0.2){
    aiWeaknesses.push("ИИ слишком часто уходит в fallback-ветку: значит, базовые правила выбора хода не срабатывают стабильно.");
  }
  if(aiDecisionMetrics.noMoveRate >= 0.15){
    aiWeaknesses.push("У ИИ заметная доля решений без выбранного хода — игра теряет темп и инициативу.");
  }
  if(factualConsequences.ai.losses > factualConsequences.human.losses){
    aiWeaknesses.push("ИИ чаще теряет самолёты по фактическим итогам раундов.");
  }

  const gapMetrics = {
    decisionCountGap: humanDecisionMetrics.decisions - aiDecisionMetrics.decisions,
    riskyMissRateGap: Number((humanDecisionMetrics.riskyMissRate - aiDecisionMetrics.noMoveRate).toFixed(4)),
    finishingRateGap: Number((humanDecisionMetrics.finishingRate - aiDecisionMetrics.fallbackRate).toFixed(4)),
    pointsPerLaunchGap: Number((factualConsequences.human.pointsPerLaunch - factualConsequences.ai.pointsPerLaunch).toFixed(4)),
    lossesGap: factualConsequences.human.losses - factualConsequences.ai.losses,
    positionalProgressGap: Number((humanDecisionMetrics.avgPositionalProgress - (aiDecisionMetrics.avgMoveDistance > 0 ? 1 : 0)).toFixed(4)),
    humanDecisionMetrics,
    aiDecisionMetrics,
    factualConsequences,
  };

  const improvementBacklog = [
    {
      condition: "Если noMoveRate ИИ > 0.15",
      changeRule: "добавить принудительный безопасный ход по ближайшей полезной цели вместо пропуска выбора",
      expectedEffect: "снижается число пустых решений и повышается темп партии"
    },
    {
      condition: "Если fallbackRate ИИ > 0.20",
      changeRule: "расширить основной набор эвристик перед fallback: сначала атака в радиусе, затем позиционный выход, и только потом fallback",
      expectedEffect: "ИИ реже уходит в аварийный сценарий и чаще делает объяснимый ход"
    },
    {
      condition: "Если pointsPerLaunchGap в пользу человека > 0.10",
      changeRule: "усилить правило приоритета добивания цели, когда вражеский самолёт уже в зоне атаки",
      expectedEffect: "повышается конверсия ходов ИИ в очки"
    },
    {
      condition: "Если lossesGap < 0 (ИИ теряет больше)",
      changeRule: "повысить штраф за маршруты, где после хода самолёт остаётся в зоне немедленной ответной атаки",
      expectedEffect: "уменьшается число лишних потерь у ИИ"
    }
  ];

  return {
    reportType: "human_vs_ai_gap_report",
    generatedAt: safeNowIso(),
    sourceStartedAt: source.startedAt || null,
    sourceFinishedAt: source.finishedAt || null,
    sections: {
      humanStrengths,
      aiWeaknesses,
      gapMetrics,
      improvementBacklog,
    },
    raw: {
      humanDecisionEvents,
      aiDecisionEvents,
      launches,
      eliminationsByColor,
      finalScore,
    }
  };
}

function buildAiFallbackDiagnosticsReport(source){
  const events = Array.isArray(source?.events) ? source.events : [];
  const aiDecisionEvents = events.filter((event) => event?.type === "ai_decision");
  const fallbackStages = new Set(["fallback_selected", "super_reserve_selected", "forced_progress_selected", "safe_short_fallback_selected"]);
  const routeClasses = ["direct", "gap", "ricochet"];

  const createEmptyFunnelEntry = () => ({
    raw_attempted: 0,
    valid_generated: 0,
    geometryPass: 0,
    pathPass: 0,
    safetyPass: 0,
    shortlistPass: 0,
    selected: 0,
  });

  const fallbackRootCauseStats = {
    no_candidates_generated: 0,
    raw_attempts_but_no_valid_candidates: 0,
    all_valid_candidates_rejected_before_shortlist: 0,
    all_valid_candidates_rejected_by_path: 0,
    all_valid_candidates_rejected_after_bounce: 0,
    all_valid_candidates_rejected_by_safety: 0,
    all_valid_candidates_rejected_in_ranking: 0,
    attempt_budget_exhausted: 0,
    mode_restriction_only: 0,
    opening_restriction_only: 0,
    defense_override: 0,
    unknown: 0,
  };

  const candidateGenerationStats = {
    direct: {
      raw_attempted: 0,
      valid_generated: 0,
      skipped_due_to_mode: 0,
      skipped_due_to_stage: 0,
      rejected_by_geometry: 0,
    },
    gap: {
      raw_attempted: 0,
      valid_generated: 0,
      no_gap_window: 0,
      rejected_by_geometry: 0,
    },
    ricochet: {
      raw_attempted: 0,
      valid_generated: 0,
      invalid_bounce_geometry: 0,
      rejected_by_geometry: 0,
    },
  };

  const candidateFunnelStats = {
    direct: createEmptyFunnelEntry(),
    gap: createEmptyFunnelEntry(),
    ricochet: createEmptyFunnelEntry(),
  };

  const firstBlockingObjectStats = {
    direct: { brick: 0, side_wall: 0, top_bottom_wall: 0, own_plane: 0, enemy_plane: 0, own_base: 0, enemy_base: 0, map_boundary: 0, unknown: 0 },
    gap: { brick: 0, side_wall: 0, top_bottom_wall: 0, own_plane: 0, enemy_plane: 0, own_base: 0, enemy_base: 0, map_boundary: 0, unknown: 0 },
    ricochet: { brick: 0, side_wall: 0, top_bottom_wall: 0, own_plane: 0, enemy_plane: 0, own_base: 0, enemy_base: 0, map_boundary: 0, unknown: 0 },
  };

  const blockedSegmentStats = {
    gap: { before_bounce: 0, after_bounce: 0, gap_entry: 0, gap_exit: 0, final_approach: 0, unknown: 0 },
    ricochet: { before_bounce: 0, after_bounce: 0, gap_entry: 0, gap_exit: 0, final_approach: 0, unknown: 0 },
  };

  const specialRouteFailureStats = {
    gap: { blocked_path: 0, blocked_after_bounce: 0, attempt_budget_exhausted: 0, no_gap_window: 0, invalid_bounce_geometry: 0, unsafe_after_path: 0, rejected_in_shortlist: 0, rejected_in_ranking: 0, unknown: 0 },
    ricochet: { blocked_path: 0, blocked_after_bounce: 0, attempt_budget_exhausted: 0, no_gap_window: 0, invalid_bounce_geometry: 0, unsafe_after_path: 0, rejected_in_shortlist: 0, rejected_in_ranking: 0, unknown: 0 },
  };

  const fallbackEpisodes = [];

  const toText = (value) => `${value || ""}`.toLowerCase();
  const hasAnyToken = (items, tokens) => items.some((item) => tokens.some((token) => item.includes(token)));

  const mapReasonToObject = (reason) => {
    const text = toText(reason);
    if(text.includes("brick") || text.includes("collider") || text.includes("obstacle")) return "brick";
    if(text.includes("boundary") || text.includes("out_of_bounds") || text.includes("field_edge") || text.includes("map_edge") || text.includes("outside_field")) return "map_boundary";
    if(text.includes("top_wall") || text.includes("bottom_wall") || text.includes("ceiling") || text.includes("floor") || ((text.includes("wall") || text.includes("border")) && (text.includes("top") || text.includes("bottom") || text.includes("ceiling") || text.includes("floor")))) return "top_bottom_wall";
    if(text.includes("wall") || text.includes("left") || text.includes("right")) return "side_wall";
    if(text.includes("own_plane") || text.includes("friendly_plane") || text.includes("ally_plane") || text.includes("same_team_plane")) return "own_plane";
    if(text.includes("enemy_plane") || text.includes("opponent_plane") || text.includes("target_plane")) return "enemy_plane";
    if(text.includes("own_base") || text.includes("friendly_base") || text.includes("home_base")) return "own_base";
    if(text.includes("enemy_base") || text.includes("opponent_base")) return "enemy_base";
    return "unknown";
  };

  const mapReasonToSegment = (reason, classKey) => {
    const text = toText(reason);
    if(text.includes("to_bounce_segment") || text.includes("bounce_entry") || text.includes("mirror_entry")) return "before_bounce";
    if(text.includes("from_bounce_segment") || text.includes("bounce_exit") || text.includes("mirror_exit")) return "after_bounce";
    if(text.includes("gap_entry_probe") || text.includes("entry_probe")) return "gap_entry";
    if(text.includes("gap_exit_probe") || text.includes("exit_probe")) return "gap_exit";
    if(text.includes("blocked_after_bounce") || text.includes("after_bounce") || text.includes("post_bounce")) return "after_bounce";
    if(text.includes("before_bounce") || text.includes("pre_bounce")) return "before_bounce";
    if(text.includes("gap_entry") || (text.includes("gap") && text.includes("entry"))) return "gap_entry";
    if(text.includes("gap_exit") || (text.includes("gap") && text.includes("exit"))) return "gap_exit";
    if(text.includes("final") || text.includes("approach") || text.includes("terminal") || text.includes("landing") || text.includes("target_zone")) return "final_approach";
    if(text.includes("blocked_path") || text.includes("path_blocked")) return classKey === "gap" ? "gap_entry" : "before_bounce";
    return "unknown";
  };

  const mapReasonToSpecialFailure = (reason) => {
    const text = toText(reason);
    if(text.includes("attempt_budget_exhausted")) return "attempt_budget_exhausted";
    if(text.includes("shortlist")) return "rejected_in_shortlist";
    if(text.includes("score_cutoff") || text.includes("ranking")) return "rejected_in_ranking";
    if(text.includes("mirror_rejected_too_close") || text.includes("min_bounce_distance") || text.includes("too_close")) return "invalid_bounce_geometry";
    if(text.includes("mirror_rejected_too_long") || text.includes("max_path_ratio") || text.includes("too_long")) return "invalid_bounce_geometry";
    if(text.includes("blocked_after_bounce") || text.includes("after_bounce")) return "blocked_after_bounce";
    if(text.includes("no_mirror_intersection") || text.includes("mirror_entry") || text.includes("to_bounce_segment") || text.includes("entry_probe") || text.includes("pre_validation")) return "blocked_path";
    if(text.includes("blocked") || text.includes("path")) return "blocked_path";
    if(text.includes("gap") && text.includes("window")) return "no_gap_window";
    if(text.includes("bounce") && text.includes("invalid")) return "invalid_bounce_geometry";
    if(text.includes("unsafe")) return "unsafe_after_path";
    return "unknown";
  };

  const getEventContextTokens = (event) => {
    const stage = toText(event?.stage);
    const goal = toText(event?.goal);
    const reasonCodes = Array.isArray(event?.reasonCodes) ? event.reasonCodes.map((code) => toText(code)) : [];
    const rejectReasons = Array.isArray(event?.rejectReasons) ? event.rejectReasons.map((code) => toText(code)) : [];
    const combined = [...reasonCodes, ...rejectReasons, stage, goal].filter(Boolean);
    return { stage, goal, reasonCodes, rejectReasons, combined };
  };

  const getShortlistMeta = (shortlist, classKey) => shortlist?.[classKey] && typeof shortlist[classKey] === "object"
    ? shortlist[classKey]
    : {};

  const getReasonCountByTokens = (rejectReasonsMap, tokens) => Object.entries(rejectReasonsMap || {}).reduce((sum, [reason, count]) => {
    const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if(safeCount <= 0) return sum;
    return tokens.some((token) => toText(reason).includes(token)) ? sum + safeCount : sum;
  }, 0);

  const hasAnyPositiveCounter = (stats) => Object.values(stats || {}).some((count) => Number.isFinite(count) && count > 0);
  const hasAnyPositiveCounterByKeys = (stats, keys) => keys.some((key) => Number.isFinite(stats?.[key]) && stats[key] > 0);

  const buildAttemptedEvidenceForClass = (classKey, rejectReasonsMap) => {
    const safeRejectReasonsMap = rejectReasonsMap && typeof rejectReasonsMap === "object"
      ? rejectReasonsMap
      : {};
    const hasRejectReason = hasAnyPositiveCounter(safeRejectReasonsMap);
    const firstBlockingMap = { brick: 0, side_wall: 0, top_bottom_wall: 0, own_plane: 0, enemy_plane: 0, own_base: 0, enemy_base: 0, map_boundary: 0, unknown: 0 };
    const blockedSegmentsMap = { before_bounce: 0, after_bounce: 0, gap_entry: 0, gap_exit: 0, final_approach: 0, unknown: 0 };
    const specialFailuresMap = { blocked_path: 0, blocked_after_bounce: 0, attempt_budget_exhausted: 0, no_gap_window: 0, invalid_bounce_geometry: 0, unsafe_after_path: 0, rejected_in_shortlist: 0, rejected_in_ranking: 0, unknown: 0 };

    for(const [reason, count] of Object.entries(safeRejectReasonsMap)){
      const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
      if(safeCount <= 0) continue;

      firstBlockingMap[mapReasonToObject(reason)] += safeCount;
      if(classKey === "gap" || classKey === "ricochet"){
        blockedSegmentsMap[mapReasonToSegment(reason, classKey)] += safeCount;
        specialFailuresMap[mapReasonToSpecialFailure(reason)] += safeCount;
      }
    }

    const attemptedEvidence = classKey === "gap"
      ? (
        hasAnyPositiveCounterByKeys(blockedSegmentsMap, ["before_bounce", "after_bounce", "gap_entry", "gap_exit", "final_approach"])
        || hasAnyPositiveCounter(specialFailuresMap)
        || hasRejectReason
      )
      : classKey === "ricochet"
        ? (
          hasAnyPositiveCounterByKeys(blockedSegmentsMap, ["before_bounce", "after_bounce"])
          || hasAnyPositiveCounter(specialFailuresMap)
          || hasRejectReason
        )
        : (hasAnyPositiveCounter(firstBlockingMap) || hasRejectReason);

    return {
      attemptedEvidence,
      hasRejectReason,
      firstBlockingMap,
      blockedSegmentsMap,
      specialFailuresMap,
    };
  };

  const getRawAttemptedCount = (diagnostics, shortlistMeta, classKey) => {
    const earlyAttemptsValue = Number(diagnostics?.[`${classKey}Count`]);
    const hasEarlyAttempts = Number.isFinite(earlyAttemptsValue);
    const rawAttemptedFromDiagnostics = hasEarlyAttempts ? Math.max(0, Math.floor(earlyAttemptsValue)) : 0;
    const initialReachableValue = Number(shortlistMeta?.initialReachable);
    const rejectedBetweenValue = Number(shortlistMeta?.rejectedBetweenInitialAndShortlist);
    const hasShortlistAttemptFields = Number.isFinite(initialReachableValue) && Number.isFinite(rejectedBetweenValue);
    const rawAttemptedFromShortlist = hasShortlistAttemptFields
      ? Math.max(0, Math.floor(initialReachableValue + rejectedBetweenValue))
      : 0;
    const rejectReasonsMap = shortlistMeta?.rejectReasons && typeof shortlistMeta.rejectReasons === "object"
      ? shortlistMeta.rejectReasons
      : {};
    const rawAttemptedFromRejects = Object.values(rejectReasonsMap).reduce((sum, count) => {
      const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
      return sum + safeCount;
    }, 0);
    const hasRejectEvidence = rawAttemptedFromRejects > 0;

    return Math.max(
      rawAttemptedFromDiagnostics,
      rawAttemptedFromShortlist,
      rawAttemptedFromRejects,
      hasRejectEvidence ? 1 : 0,
    );
  };

  const buildPerClassStats = (diagnostics, shortlist) => routeClasses.map((classKey) => {
    const shortlistMeta = getShortlistMeta(shortlist, classKey);
    const validGenerated = Math.max(0, Number(shortlistMeta.initialReachable) || 0);
    const shortlistCount = Math.max(0, Number(shortlistMeta.shortlistCount) || 0);
    const rejectedBetween = Math.max(0, Math.min(validGenerated, Number(shortlistMeta.rejectedBetweenInitialAndShortlist) || 0));
    const rawAttempted = getRawAttemptedCount(diagnostics, shortlistMeta, classKey);
    const rejectReasonsMap = shortlistMeta.rejectReasons && typeof shortlistMeta.rejectReasons === "object"
      ? shortlistMeta.rejectReasons
      : {};
    const attemptedEvidenceMeta = buildAttemptedEvidenceForClass(classKey, rejectReasonsMap);

    return {
      classKey,
      raw_attempted: rawAttempted > 0 ? rawAttempted : (attemptedEvidenceMeta.attemptedEvidence ? 1 : 0),
      valid_generated: validGenerated,
      shortlistCount,
      rejectedBetween,
      rejectReasonsMap,
      attempted_evidence: attemptedEvidenceMeta.attemptedEvidence,
    };
  });

  const getTopRejectReasonByCount = (rejectReasonsMap) => {
    const sortedReasons = Object.entries(rejectReasonsMap || {})
      .map(([reason, count]) => [reason, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0])
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1]);
    return sortedReasons.length > 0 ? sortedReasons[0][0] : null;
  };

  const getCoreClassStats = (perClassStats) => {
    const emptyStats = { raw_attempted: 0, valid_generated: 0, shortlistCount: 0, rejectReasonsMap: {}, attempted_evidence: false };
    return {
      direct: perClassStats.find((stats) => stats.classKey === "direct") || emptyStats,
      gap: perClassStats.find((stats) => stats.classKey === "gap") || emptyStats,
      ricochet: perClassStats.find((stats) => stats.classKey === "ricochet") || emptyStats,
    };
  };

  const normalizeRootCause = (event) => {
    const diagnostics = event?.initialCandidateSetDiagnostics;
    const shortlist = diagnostics?.shortlistDiagnostics;
    const tokens = getEventContextTokens(event);
    const has = (token) => hasAnyToken(tokens.combined, [token]);

    if(has("opening_phase_restriction")) return "opening_restriction_only";
    if(has("critical_base_threat") || has("emergency_base_defense")) return "defense_override";
    if(has("mode_strategy_failed") || has("mode_move_restriction")) return "mode_restriction_only";
    if(has("attempt_budget_exhausted")) return "attempt_budget_exhausted";

    if(diagnostics && typeof diagnostics === "object"){
      const perClassStats = buildPerClassStats(diagnostics, shortlist);
      const coreClassStats = getCoreClassStats(perClassStats);

      const noRawAttemptInCoreClasses = coreClassStats.direct.raw_attempted === 0
        && coreClassStats.gap.raw_attempted === 0
        && coreClassStats.ricochet.raw_attempted === 0;
      if(noRawAttemptInCoreClasses) return "no_candidates_generated";

      const totalValidGenerated = perClassStats.reduce((sum, stats) => sum + stats.valid_generated, 0);
      if(totalValidGenerated <= 0) return "raw_attempts_but_no_valid_candidates";

      const totalShortlist = perClassStats.reduce((sum, stats) => sum + stats.shortlistCount, 0);
      if(totalShortlist <= 0){
        const rejectedReasonTotals = perClassStats.reduce((acc, stats) => {
          const maxByClass = stats.rejectedBetween > 0 ? stats.rejectedBetween : Number.POSITIVE_INFINITY;
          let accounted = 0;
          for(const [reason, count] of Object.entries(stats.rejectReasonsMap)){
            const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
            if(safeCount <= 0) continue;
            const available = Number.isFinite(maxByClass)
              ? Math.max(0, maxByClass - accounted)
              : safeCount;
            if(available <= 0) break;
            const actual = Number.isFinite(maxByClass) ? Math.min(safeCount, available) : safeCount;
            const reasonText = toText(reason);
            accounted += actual;

            if(reasonText.includes("blocked_after_bounce")){
              acc.afterBounce += actual;
              continue;
            }
            if(reasonText.includes("unsafe") || reasonText.includes("threat")){
              acc.safety += actual;
              continue;
            }
            if(reasonText.includes("ranking") || reasonText.includes("score_cutoff") || reasonText.includes("shortlist_cutoff")){
              acc.ranking += actual;
              continue;
            }
            if(reasonText.includes("path") || reasonText.includes("gap_entry") || reasonText.includes("before_bounce") || reasonText.includes("blocked_path")){
              acc.path += actual;
              continue;
            }

            acc.other += actual;
          }
          return acc;
        }, { afterBounce: 0, path: 0, safety: 0, ranking: 0, other: 0 });

        const dominantReason = Object.entries(rejectedReasonTotals)
          .filter(([reasonKey]) => reasonKey !== "other")
          .sort((a, b) => b[1] - a[1])[0];

        if(dominantReason && dominantReason[1] > 0){
          if(dominantReason[0] === "afterBounce") return "all_valid_candidates_rejected_after_bounce";
          if(dominantReason[0] === "path") return "all_valid_candidates_rejected_by_path";
          if(dominantReason[0] === "safety") return "all_valid_candidates_rejected_by_safety";
          if(dominantReason[0] === "ranking") return "all_valid_candidates_rejected_in_ranking";
        }

        return "all_valid_candidates_rejected_before_shortlist";
      }

      if(fallbackStages.has(event?.stage)) return "all_valid_candidates_rejected_in_ranking";
    }

    return "unknown";
  };

  for(const event of aiDecisionEvents){
    const diagnostics = event?.initialCandidateSetDiagnostics;
    const shortlist = diagnostics?.shortlistDiagnostics;
    const eventTokens = getEventContextTokens(event);

    if(diagnostics && typeof diagnostics === "object"){
      for(const classKey of routeClasses){
        const shortlistMeta = getShortlistMeta(shortlist, classKey);
        const validGenerated = Math.max(0, Number(shortlistMeta.initialReachable) || 0);
        const shortlistCount = Math.max(0, Number(shortlistMeta.shortlistCount) || 0);
        const rejectedBetween = Math.max(0, Math.min(validGenerated, Number(shortlistMeta.rejectedBetweenInitialAndShortlist) || 0));
        const rawAttempted = getRawAttemptedCount(diagnostics, shortlistMeta, classKey);
        const rejectReasonsMap = shortlistMeta.rejectReasons && typeof shortlistMeta.rejectReasons === "object"
          ? shortlistMeta.rejectReasons
          : {};
        const attemptedEvidenceMeta = buildAttemptedEvidenceForClass(classKey, rejectReasonsMap);
        const rawAttemptedWithEvidence = rawAttempted > 0 ? rawAttempted : (attemptedEvidenceMeta.attemptedEvidence ? 1 : 0);

        const geometryRejectedRaw = getReasonCountByTokens(rejectReasonsMap, ["geometr", "invalid_bounce_geometry", "validation_failed", "unreachable", "missing_wall_geometry"]);
        const pathRejectedRaw = getReasonCountByTokens(rejectReasonsMap, ["blocked", "path", "bounce", "gap_entry", "gap_exit", "before_bounce", "after_bounce"]);
        const safetyRejectedRaw = getReasonCountByTokens(rejectReasonsMap, ["unsafe", "threat", "danger", "collision_risk"]);
        const rankingRejectedRaw = getReasonCountByTokens(rejectReasonsMap, ["shortlist", "score_cutoff", "ranking"]);

        let remainingRejected = rejectedBetween;
        const geometryRejected = Math.min(remainingRejected, geometryRejectedRaw);
        remainingRejected -= geometryRejected;
        const pathRejected = Math.min(remainingRejected, pathRejectedRaw);
        remainingRejected -= pathRejected;
        const safetyRejected = Math.min(remainingRejected, safetyRejectedRaw);
        remainingRejected -= safetyRejected;
        const rankingRejected = Math.min(remainingRejected, rankingRejectedRaw);
        remainingRejected -= rankingRejected;

        const geometryPass = Math.max(0, validGenerated - geometryRejected);
        const pathPass = Math.max(0, geometryPass - pathRejected);
        const safetyPass = Math.max(0, pathPass - safetyRejected);
        const shortlistPass = Math.max(0, Math.min(safetyPass, validGenerated, shortlistCount));

        candidateFunnelStats[classKey].raw_attempted += rawAttemptedWithEvidence;
        candidateFunnelStats[classKey].valid_generated += validGenerated;
        candidateFunnelStats[classKey].geometryPass += geometryPass;
        candidateFunnelStats[classKey].pathPass += pathPass;
        candidateFunnelStats[classKey].safetyPass += safetyPass;
        candidateFunnelStats[classKey].shortlistPass += shortlistPass;

        candidateGenerationStats[classKey].raw_attempted += rawAttemptedWithEvidence;
        candidateGenerationStats[classKey].valid_generated += validGenerated;
        candidateGenerationStats[classKey].rejected_by_geometry += geometryRejected;

        if(classKey === "gap"){
          candidateGenerationStats.gap.no_gap_window += getReasonCountByTokens(rejectReasonsMap, ["no_gap_window", "gap_window"]);
        } else if(classKey === "ricochet"){
          candidateGenerationStats.ricochet.invalid_bounce_geometry += getReasonCountByTokens(rejectReasonsMap, ["invalid_bounce_geometry", "missing_wall_geometry"]);
        }

        const sortedReasons = Object.entries(rejectReasonsMap)
          .map(([reason, count]) => [reason, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0])
          .filter(([, count]) => count > 0)
          .sort((a, b) => b[1] - a[1]);
        if(sortedReasons.length > 0){
          const [topReason, topCount] = sortedReasons[0];
          const blocker = mapReasonToObject(topReason);
          firstBlockingObjectStats[classKey][blocker] += topCount;
          if(classKey === "gap" || classKey === "ricochet"){
            blockedSegmentStats[classKey][mapReasonToSegment(topReason, classKey)] += topCount;
            specialRouteFailureStats[classKey][mapReasonToSpecialFailure(topReason)] += topCount;
          }
        }
      }
    }

    if(event?.selectedMove && diagnostics && typeof diagnostics === "object"){
      const text = `${event?.selectedMove?.decisionReason || ""} ${event?.selectedMove?.goalName || ""}`.toLowerCase();
      const selectedClass = text.includes("ricochet") ? "ricochet" : (text.includes("gap") ? "gap" : "direct");
      const selectedClassGenerated = Math.max(0, Number(getShortlistMeta(shortlist, selectedClass).initialReachable) || 0);
      if(selectedClassGenerated > 0){
        candidateFunnelStats[selectedClass].selected += 1;
      }
    }

    if(eventTokens.combined.some((token) => token.includes("mode_strategy_failed") || token.includes("mode_move_restriction"))){
      if((Number(getShortlistMeta(shortlist, "direct").initialReachable) || 0) <= 0){
        candidateGenerationStats.direct.skipped_due_to_mode += 1;
      }
    }
    if(eventTokens.combined.some((token) => token.includes("opening_phase_restriction") || token.includes("critical_base_threat") || token.includes("emergency_base_defense"))){
      if((Number(getShortlistMeta(shortlist, "direct").initialReachable) || 0) <= 0){
        candidateGenerationStats.direct.skipped_due_to_stage += 1;
      }
    }

    if(fallbackStages.has(event?.stage)){
      const perClassStats = buildPerClassStats(diagnostics, shortlist);
      const coreClassStats = getCoreClassStats(perClassStats);
      const directStats = coreClassStats.direct;
      const gapStats = coreClassStats.gap;
      const ricochetStats = coreClassStats.ricochet;
      const directTopRejectReason = getTopRejectReasonByCount(directStats.rejectReasonsMap);
      const gapTopRejectReason = getTopRejectReasonByCount(gapStats.rejectReasonsMap);
      const ricochetTopRejectReason = getTopRejectReasonByCount(ricochetStats.rejectReasonsMap);
      const allCoreValidGeneratedAreZero = directStats.valid_generated === 0
        && gapStats.valid_generated === 0
        && ricochetStats.valid_generated === 0;
      const noRawAttemptInCoreClasses = directStats.raw_attempted === 0
        && gapStats.raw_attempted === 0
        && ricochetStats.raw_attempted === 0;
      const hasAnyTopRejectReason = directTopRejectReason !== null
        || gapTopRejectReason !== null
        || ricochetTopRejectReason !== null;

      let rootCause = normalizeRootCause(event);
      if(allCoreValidGeneratedAreZero && hasAnyTopRejectReason){
        rootCause = "raw_attempts_but_no_valid_candidates";
      }
      if(rootCause === "no_candidates_generated" && !noRawAttemptInCoreClasses){
        rootCause = "raw_attempts_but_no_valid_candidates";
      }
      fallbackRootCauseStats[rootCause] = (fallbackRootCauseStats[rootCause] || 0) + 1;

      fallbackEpisodes.push({
        roundNumber: Number.isFinite(event?.roundNumber) ? event.roundNumber : null,
        stageBeforeFallback: event?.fallbackDiagnostics?.stageBeforeFallback || null,
        goalBeforeFallback: event?.goal || null,
        rootCause,
        directSummary: {
          raw_attempted: directStats.raw_attempted,
          valid_generated: directStats.valid_generated,
          shortlistPass: directStats.shortlistCount,
          topRejectReason: directTopRejectReason,
          attempted_evidence: directStats.attempted_evidence || directTopRejectReason !== null,
        },
        gapSummary: {
          raw_attempted: gapStats.raw_attempted,
          valid_generated: gapStats.valid_generated,
          shortlistPass: gapStats.shortlistCount,
          topRejectReason: gapTopRejectReason,
          attempted_evidence: gapStats.attempted_evidence || gapTopRejectReason !== null,
        },
        ricochetSummary: {
          raw_attempted: ricochetStats.raw_attempted,
          valid_generated: ricochetStats.valid_generated,
          shortlistPass: ricochetStats.shortlistCount,
          topRejectReason: ricochetTopRejectReason,
          attempted_evidence: ricochetStats.attempted_evidence || ricochetTopRejectReason !== null,
        },
        fallbackGoal: event?.fallbackDiagnostics?.fallbackGoal || event?.selectedMove?.goalName || null,
        fallbackDecisionReason: event?.fallbackDiagnostics?.fallbackDecisionReason || event?.selectedMove?.decisionReason || null,
      });
    }
  }

  for(const classKey of routeClasses){
    const funnel = candidateFunnelStats[classKey];
    funnel.valid_generated = Math.max(0, Math.min(funnel.raw_attempted, funnel.valid_generated));
    funnel.geometryPass = Math.max(0, Math.min(funnel.valid_generated, funnel.geometryPass));
    funnel.pathPass = Math.max(0, Math.min(funnel.geometryPass, funnel.pathPass));
    funnel.safetyPass = Math.max(0, Math.min(funnel.pathPass, funnel.safetyPass));
    funnel.shortlistPass = Math.max(0, Math.min(funnel.safetyPass, funnel.shortlistPass));
    funnel.selected = Math.max(0, Math.min(funnel.shortlistPass, funnel.selected));
  }

  const hasEpisodeTopRejectReason = (classKey) => fallbackEpisodes.some((episode) => episode?.[`${classKey}Summary`]?.topRejectReason != null);

  const aggregateAttemptedEvidence = {
    gap: (
      hasAnyPositiveCounterByKeys(blockedSegmentStats.gap, ["before_bounce", "after_bounce", "gap_entry", "gap_exit", "final_approach"])
      || hasAnyPositiveCounter(specialRouteFailureStats.gap)
      || hasEpisodeTopRejectReason("gap")
    ),
    ricochet: (
      hasAnyPositiveCounterByKeys(blockedSegmentStats.ricochet, ["before_bounce", "after_bounce"])
      || hasAnyPositiveCounter(specialRouteFailureStats.ricochet)
      || hasEpisodeTopRejectReason("ricochet")
    ),
    direct: (
      hasAnyPositiveCounter(firstBlockingObjectStats.direct)
      || hasEpisodeTopRejectReason("direct")
    ),
  };

  for(const classKey of routeClasses){
    if(candidateFunnelStats[classKey].raw_attempted <= 0 && aggregateAttemptedEvidence[classKey]){
      candidateFunnelStats[classKey].raw_attempted = 1;
    }
    if(candidateGenerationStats[classKey].raw_attempted <= 0 && aggregateAttemptedEvidence[classKey]){
      candidateGenerationStats[classKey].raw_attempted = 1;
    }
  }

  const totalFallbackEpisodes = fallbackEpisodes.length;
  const topRootCause = Object.entries(fallbackRootCauseStats).sort((a, b) => b[1] - a[1])[0] || ["unknown", 0];
  const getTopFailureKey = (stats, keys) => {
    const entries = keys
      .map((key) => [key, Number.isFinite(stats?.[key]) ? Math.max(0, stats[key]) : 0])
      .sort((a, b) => b[1] - a[1]);
    if(!entries[0] || entries[0][1] <= 0) return ["unknown", 0];
    return entries[0];
  };

  const segmentKeys = ["before_bounce", "after_bounce", "gap_entry", "gap_exit", "final_approach", "unknown"];
  const specialFailureKeys = ["blocked_path", "blocked_after_bounce", "attempt_budget_exhausted", "no_gap_window", "invalid_bounce_geometry", "unsafe_after_path", "rejected_in_shortlist", "rejected_in_ranking", "unknown"];

  const gapTopSegmentFailure = getTopFailureKey(blockedSegmentStats.gap, segmentKeys);
  const ricochetTopSegmentFailure = getTopFailureKey(blockedSegmentStats.ricochet, segmentKeys);
  const gapTopSpecialFailure = getTopFailureKey(specialRouteFailureStats.gap, specialFailureKeys);
  const ricochetTopSpecialFailure = getTopFailureKey(specialRouteFailureStats.ricochet, specialFailureKeys);

  const summary = [
    `Всего fallback-эпизодов: ${totalFallbackEpisodes}.`,
    `Самая частая корневая причина: ${topRootCause[0]} (${topRootCause[1]}).`,
    `Direct: raw_attempted=${candidateFunnelStats.direct.raw_attempted}, valid_generated=${candidateFunnelStats.direct.valid_generated}, shortlistPass=${candidateFunnelStats.direct.shortlistPass}, selected=${candidateFunnelStats.direct.selected}.`,
    `Gap: raw_attempted=${candidateFunnelStats.gap.raw_attempted}, valid_generated=${candidateFunnelStats.gap.valid_generated}, shortlistPass=${candidateFunnelStats.gap.shortlistPass}, selected=${candidateFunnelStats.gap.selected}.`,
    `Ricochet: raw_attempted=${candidateFunnelStats.ricochet.raw_attempted}, valid_generated=${candidateFunnelStats.ricochet.valid_generated}, shortlistPass=${candidateFunnelStats.ricochet.shortlistPass}, selected=${candidateFunnelStats.ricochet.selected}.`,
    `Gap ломается на сегменте: ${gapTopSegmentFailure[0]} (count=${gapTopSegmentFailure[1]}).`,
    `Ricochet ломается на сегменте: ${ricochetTopSegmentFailure[0]} (count=${ricochetTopSegmentFailure[1]}).`,
    `Gap special failure: ${gapTopSpecialFailure[0]} (count=${gapTopSpecialFailure[1]}).`,
    `Ricochet special failure: ${ricochetTopSpecialFailure[0]} (count=${ricochetTopSpecialFailure[1]}).`,
  ];

  const fallbackEpisodeSamples = fallbackEpisodes.slice(-6);

  const report = {
    reportType: "ai_fallback_diagnostics_report",
    generatedAt: safeNowIso(),
    sourceStartedAt: source?.startedAt || null,
    sourceFinishedAt: source?.finishedAt || null,
    fallbackRootCauseStats,
    candidateGenerationStats,
    candidateFunnelStats,
    firstBlockingObjectStats,
    blockedSegmentStats,
    specialRouteFailureStats,
    fallbackEpisodeSamples,
    summary,
  };

  const hasPositiveStat = (stats) => Object.values(stats || {}).some((value) => Number.isFinite(value) && value > 0);
  const hasTopRejectReasonInSamples = (classKey) => report.fallbackEpisodeSamples.some((episode) => {
    const classSummary = episode?.[`${classKey}Summary`];
    return classSummary?.topRejectReason != null;
  });

  const summarySignals = [
    { prefix: "Самая частая корневая причина:", stats: report.fallbackRootCauseStats },
    { prefix: "Gap ломается на сегменте:", stats: report.blockedSegmentStats?.gap },
    { prefix: "Ricochet ломается на сегменте:", stats: report.blockedSegmentStats?.ricochet },
    { prefix: "Gap special failure:", stats: report.specialRouteFailureStats?.gap },
    { prefix: "Ricochet special failure:", stats: report.specialRouteFailureStats?.ricochet },
  ];

  const summaryMismatchDetected = summarySignals.some(({ prefix, stats }) => {
    const line = report.summary.find((entry) => entry.startsWith(prefix));
    if(!line) return false;

    const reasonPart = line.slice(prefix.length).trim();
    const reasonKey = reasonPart.split(" ")[0] || "";
    if(!reasonKey || reasonKey === "unknown") return false;

    const reasonCount = Number.isFinite(stats?.[reasonKey]) ? stats[reasonKey] : 0;
    return reasonCount <= 0;
  });

  const rejectReasonPresentInSamples = report.fallbackEpisodeSamples.some((episode) => (
    episode?.directSummary?.topRejectReason != null
    || episode?.gapSummary?.topRejectReason != null
    || episode?.ricochetSummary?.topRejectReason != null
  ));

  report.consistencyChecks = {
    gapAttemptedButZeroRawAttempted: (
      (
        hasPositiveStat(report.blockedSegmentStats?.gap)
        || hasPositiveStat(report.specialRouteFailureStats?.gap)
        || hasTopRejectReasonInSamples("gap")
      )
      && (report.candidateFunnelStats?.gap?.raw_attempted || 0) === 0
    ),
    ricochetAttemptedButZeroRawAttempted: (
      (
        hasPositiveStat(report.blockedSegmentStats?.ricochet)
        || hasPositiveStat(report.specialRouteFailureStats?.ricochet)
        || hasTopRejectReasonInSamples("ricochet")
      )
      && (report.candidateFunnelStats?.ricochet?.raw_attempted || 0) === 0
    ),
    rejectReasonPresentButNoCandidatesGenerated: (
      rejectReasonPresentInSamples
      && (report.fallbackRootCauseStats?.no_candidates_generated || 0) > 0
    ),
    summaryMismatchDetected,
  };

  return report;
}

function exportAiFallbackDiagnosticsReportJson(){
  const snapshot = getAiSelfAnalyzerSnapshot({ includeHistory: true });
  const source = snapshot?.activeMatch || snapshot?.latestFinishedMatch;

  if(!source){
    return {
      reportType: "ai_fallback_diagnostics_report",
      generatedAt: safeNowIso(),
      sourceStartedAt: null,
      sourceFinishedAt: null,
      status: "insufficient_data",
      statusMessage: "Нет данных матча для fallback-диагностики.",
      fallbackRootCauseStats: {},
      candidateGenerationStats: {},
      candidateFunnelStats: {},
      firstBlockingObjectStats: {},
      blockedSegmentStats: {},
      specialRouteFailureStats: {},
      fallbackEpisodeSamples: [],
      summary: ["Недостаточно данных для отчёта."],
    };
  }

  const report = buildAiFallbackDiagnosticsReport(source);
  if(typeof document === "undefined"){
    return report;
  }

  const payload = JSON.stringify(report, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = safeNowIso().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `ai-fallback-diagnostics-report-${suffix}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return report;
}

function exportAiSelfAnalyzerGapJson(){
  const snapshot = getAiSelfAnalyzerSnapshot({ includeHistory: true });
  const source = snapshot?.activeMatch || snapshot?.latestFinishedMatch;
  if(!source) return null;

  const payloadObject = buildAiSelfAnalyzerGapReport(source);
  if(!payloadObject) return null;

  if(typeof document === "undefined"){
    return payloadObject;
  }

  const payload = JSON.stringify(payloadObject, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = safeNowIso().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `ai-self-analyzer-gap-${suffix}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return payloadObject;
}

function exportPlayerVsAiGapReportJson(){
  const snapshot = getAiSelfAnalyzerSnapshot({ includeHistory: true });
  const source = snapshot?.activeMatch || snapshot?.latestFinishedMatch;

  const fallbackReport = {
    reportType: "human_vs_ai_gap_report",
    generatedAt: safeNowIso(),
    sourceStartedAt: source?.startedAt || null,
    sourceFinishedAt: source?.finishedAt || null,
    status: "insufficient_data",
    statusMessage: "Недостаточно данных для сравнения человека и ИИ. Сыграйте минимум один раунд с зафиксированными решениями.",
    humanStrengths: [],
    aiWeaknesses: [],
    gapMetrics: {
      reason: "missing_required_events",
      required: ["human_decision", "ai_decision", "launch"],
      available: {
        humanDecisionEvents: 0,
        aiDecisionEvents: 0,
        launches: 0,
      },
    },
    improvementBacklog: [],
  };

  if(!source){
    if(typeof document === "undefined") return fallbackReport;
    return fallbackReport;
  }

  const events = Array.isArray(source.events) ? source.events : [];
  const humanDecisionEvents = events.filter((event) => event?.type === "human_decision");
  const aiDecisionEvents = events.filter((event) => event?.type === "ai_decision");
  const launches = events.filter((event) => event?.type === "launch");
  const hasEnoughData = humanDecisionEvents.length > 0 && aiDecisionEvents.length > 0 && launches.length > 0;

  let report = fallbackReport;
  if(hasEnoughData){
    const builtReport = buildAiSelfAnalyzerGapReport(source);
    if(builtReport){
      report = {
        reportType: builtReport.reportType,
        generatedAt: builtReport.generatedAt,
        sourceStartedAt: builtReport.sourceStartedAt,
        sourceFinishedAt: builtReport.sourceFinishedAt,
        status: "ok",
        statusMessage: "Сравнительный отчёт успешно собран.",
        humanStrengths: builtReport.sections?.humanStrengths || [],
        aiWeaknesses: builtReport.sections?.aiWeaknesses || [],
        gapMetrics: builtReport.sections?.gapMetrics || {},
        improvementBacklog: builtReport.sections?.improvementBacklog || [],
        sections: builtReport.sections,
        raw: builtReport.raw,
      };
    }
  } else {
    report = {
      ...fallbackReport,
      gapMetrics: {
        ...fallbackReport.gapMetrics,
        available: {
          humanDecisionEvents: humanDecisionEvents.length,
          aiDecisionEvents: aiDecisionEvents.length,
          launches: launches.length,
        },
      },
    };
  }

  if(typeof document === "undefined"){
    return report;
  }

  const payload = JSON.stringify(report, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const suffix = safeNowIso().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `player-vs-ai-gap-report-${suffix}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return report;
}

function getAiSelfAnalyzerSnapshot(options = {}){
  const includeHistory = Boolean(options?.includeHistory);
  const activeMatch = aiSelfAnalyzerState.activeMatch
    ? JSON.parse(JSON.stringify(aiSelfAnalyzerState.activeMatch))
    : null;
  const history = includeHistory ? getAnalyticsHistoryFromStorage() : [];

  return {
    activeMatch,
    latestFinishedMatch: history[0] || null,
    totalFinishedMatches: history.length,
  };
}

function formatAiDebugClock(isoString){
  if(typeof isoString !== "string" || isoString.length === 0) return "--:--:--";
  const timePart = isoString.split("T")[1] || "";
  return timePart.split(".")[0] || "--:--:--";
}

function buildAiDebugDecisionCompactLine(event){
  if(!event || typeof event !== "object") return "(invalid decision event)";
  const reasonCodes = Array.isArray(event.reasonCodes) && event.reasonCodes.length > 0
    ? event.reasonCodes.join(",")
    : "-";
  const rejectReasons = Array.isArray(event.rejectReasons) && event.rejectReasons.length > 0
    ? event.rejectReasons.join(",")
    : "-";
  const planeId = typeof event.planeId === "string" && event.planeId.length > 0 ? event.planeId : "-";

  return [
    formatAiDebugClock(event.at),
    `R${event.roundNumber ?? "?"}`,
    `turn:${event.turnColor ?? "-"}`,
    `stage:${event.stage ?? "-"}`,
    `goal:${event.goal ?? "-"}`,
    `plane:${planeId}`,
    `reasons:${reasonCodes}`,
    `reject:${rejectReasons}`,
  ].join(" | ");
}

function getAiDebugLastDecisions(limit = 5){
  const safeLimit = Math.max(1, Math.min(30, Math.floor(Number(limit) || 5)));
  const snapshot = getAiSelfAnalyzerSnapshot();
  const activeMatch = snapshot?.activeMatch;
  const events = Array.isArray(activeMatch?.events) ? activeMatch.events : [];
  const decisions = events.filter((event) => event?.type === "ai_decision");
  return decisions.slice(-safeLimit);
}

function printAiDebugSnapshot(){
  const snapshot = getAiSelfAnalyzerSnapshot();
  const activeMatch = snapshot?.activeMatch;
  if(!activeMatch){
    console.info("[AI_DEBUG] Активный матч не найден.");
    return null;
  }

  const roundsCount = Array.isArray(activeMatch.rounds) ? activeMatch.rounds.length : 0;
  const turnsCount = Array.isArray(activeMatch.turns) ? activeMatch.turns.length : 0;
  const eventsCount = Array.isArray(activeMatch.events) ? activeMatch.events.length : 0;
  const decisions = getAiDebugLastDecisions(1);
  const lastDecisionLine = decisions.length > 0
    ? buildAiDebugDecisionCompactLine(decisions[0])
    : "(решений ИИ пока нет)";

  const compact = {
    startedAt: activeMatch.startedAt || null,
    mode: activeMatch.mode || null,
    ruleset: activeMatch.ruleset || null,
    mapIndex: activeMatch.mapIndex ?? null,
    roundNumber,
    turnColor: turnColors[turnIndex] ?? null,
    roundsCount,
    turnsCount,
    eventsCount,
    lastDecision: lastDecisionLine,
  };

  console.info("[AI_DEBUG] snapshot", compact);
  return compact;
}

function printAiDebugStatus(){
  const status = {
    mode: aiRoundState?.mode ?? null,
    goal: aiRoundState?.currentGoal ?? null,
    turn: aiRoundState?.turnNumber ?? null,
    turnColor: turnColors[turnIndex] ?? null,
    aiMoveScheduled,
    gameMode: gameMode || selectedMode || null,
    roundNumber,
  };
  console.info("[AI_DEBUG] status", status);
  return status;
}

function printAiDebugLastDecisions(limit = 5){
  const decisions = getAiDebugLastDecisions(limit);
  if(decisions.length === 0){
    console.info("[AI_DEBUG] last-decisions: пока нет decision-событий.");
    return [];
  }

  const lines = decisions.map((event, index) => `${index + 1}. ${buildAiDebugDecisionCompactLine(event)}`);
  console.info(`[AI_DEBUG] last-decisions (${decisions.length}):`);
  lines.forEach((line) => console.info(line));
  return lines;
}

function forceResetCargoNow(){
  const beforeCount = Array.isArray(cargoState) ? cargoState.length : 0;
  const cargoEnabled = Boolean(settings?.addCargo);

  resetCargoState();

  if(cargoEnabled){
    spawnCargoForTurn();
  }

  const afterCount = Array.isArray(cargoState) ? cargoState.length : 0;
  const result = {
    reset: true,
    cargoEnabled,
    beforeCount,
    afterCount,
  };
  console.info('[cargo] force reset complete', result);
  return result;
}

function AI_DEBUG_CMD(command, arg){
  const normalized = typeof command === "string" ? command.trim().toLowerCase() : "";
  if(normalized === "snapshot"){
    return printAiDebugSnapshot();
  }
  if(normalized === "last-decisions"){
    return printAiDebugLastDecisions(arg);
  }
  if(normalized === "status"){
    return printAiDebugStatus();
  }
  if(normalized === "reset-cargo"){
    return forceResetCargoNow();
  }
  if(normalized === "fallback-report"){
    return exportAiFallbackDiagnosticsReportJson();
  }

  console.info('[AI_DEBUG] Неизвестная команда. Доступно: "snapshot", "last-decisions", "status", "reset-cargo", "fallback-report".');
  return null;
}

if(typeof window !== "undefined"){
  window.exportLatestAiSelfAnalyzerJson = exportLatestAiSelfAnalyzerJson;
  window.exportAiSelfAnalyzerTurnsJson = exportAiSelfAnalyzerTurnsJson;
  window.exportAiSelfAnalyzerGapJson = exportAiSelfAnalyzerGapJson;
  window.exportPlayerVsAiGapReportJson = exportPlayerVsAiGapReportJson;
  window.exportAiFallbackDiagnosticsReportJson = exportAiFallbackDiagnosticsReportJson;
  window.getAiSelfAnalyzerSnapshot = getAiSelfAnalyzerSnapshot;
  window.AI_DEBUG_CMD = AI_DEBUG_CMD;
  window.RESET_CARGO = forceResetCargoNow;
}

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
  if(aiPostInventoryLaunchTimeout){
    clearTimeout(aiPostInventoryLaunchTimeout);
    aiPostInventoryLaunchTimeout = null;
  }

  shouldShowEndScreen = Boolean(options.showEndScreen);
  if(shouldShowEndScreen){
    finalizeAiSelfAnalyzerMatch({ type: "winner", winnerColor: color, isDraw: false, blueScore, greenScore });
  }
  if(endGameDiv){
    setEndGamePanelVisible(false);
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
    setEndGamePanelVisible(false);
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
  if(shouldShowEndScreen){
    finalizeAiSelfAnalyzerMatch({ type: "draw", winnerColor: null, isDraw: true, blueScore, greenScore });
  }
  if(endGameDiv){
    setEndGamePanelVisible(false);
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
  if(isArcadeInfiniteScoreMode()) return false;

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
  if(awaitingFlightResolution){
    return;
  }

  if(pendingRoundTransitionDelay !== null){
    const elapsed = performance.now() - pendingRoundTransitionStart;
    const remaining = Math.max(0, pendingRoundTransitionDelay - elapsed);
    if(roundTransitionTimeout){
      clearTimeout(roundTransitionTimeout);
    }
    roundTransitionTimeout = setTimeout(startNewRound, remaining);
    pendingRoundTransitionDelay = null;
    pendingRoundTransitionStart = 0;
    return;
  }

  if(shouldShowEndScreen && !roundEndedByNuke && endGameDiv){
    setEndGamePanelVisible(true);
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

  if(isArcadeDomScoreMode()) {
    const scoreByColor = color === "green" ? greenScore : blueScore;
    updateArcadeScore(color, scoreByColor, { animate: true });
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
let aiPostInventoryLaunchTimeout = null;
const AI_MOVE_INITIAL_DELAY_MS = 300;
const AI_MOVE_CARGO_RETRY_DELAY_MS = 200;
const AI_MOVE_CARGO_WAIT_TIMEOUT_MS = 1800;

function hasAnimatingCargo(){
  return cargoState.some(cargo => cargo?.state === "animating");
}

function scheduleComputerMoveWithCargoGate(startedAt = performance.now(), delayMs = AI_MOVE_INITIAL_DELAY_MS){
  setTimeout(() => {
    const runComputerMoveSafely = (reasonCode) => {
      try {
        doComputerMove();
      } catch (error) {
        logAiDecision("ai_move_exception_fail_safe", {
          reasonCode,
          message: error?.message || String(error),
        });
        aiMoveScheduled = false;
        if (typeof failSafeAdvanceTurn === "function") {
          failSafeAdvanceTurn("ai_move_exception", {
            goal: aiRoundState?.currentGoal || "ai_move_exception",
            reasonCodes: ["ai_move_exception", "fail_safe_turn_advance"],
            rejectReasons: ["do_computer_move_exception"],
            errorMessage: error?.message || String(error),
          });
          return;
        }
        advanceTurn();
      }
    };

    if (
      isGameOver
      || gameMode !== "computer"
      || turnColors[turnIndex] !== "blue"
      || flyingPoints.some(fp => fp.plane.color === "blue")
    ) {
      aiMoveScheduled = false;
      return;
    }

    if (hasAnimatingCargo()) {
      const waitElapsedMs = Math.round(performance.now() - startedAt);
      if (waitElapsedMs >= AI_MOVE_CARGO_WAIT_TIMEOUT_MS) {
        logAiDecision("ai_wait_timeout_reached", {
          waitElapsedMs,
          timeoutMs: AI_MOVE_CARGO_WAIT_TIMEOUT_MS,
        });
        runComputerMoveSafely("cargo_wait_timeout");
        return;
      }

      logAiDecision("ai_wait_for_cargo_animation", {
        waitElapsedMs,
        retryInMs: AI_MOVE_CARGO_RETRY_DELAY_MS,
      });
      scheduleComputerMoveWithCargoGate(startedAt, AI_MOVE_CARGO_RETRY_DELAY_MS);
      return;
    }

    runComputerMoveSafely("cargo_gate_ready");
  }, delayMs);
}

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
    lifeState:"alive",
    respawnState:"at_base",
    respawnStage:3,
    respawnPenaltyActive:false,
    respawnHalfTurnsRemaining:0,
    respawnBlockedByEnemy:false,
    respawnHudCrossStart:null,
    burning:false,
    crashStart:null,
    angle,
    homeAngle: angle,
    segments:[],
    collisionX:null,
    collisionY:null,
    prevX: x,
    prevY: y,
    homeX: x,
    homeY: y,
    flagColor:null,
    carriedFlagId: null,
    flameFxDisabled: false,
    activeTurnBuffs: {},
    invisibilityFadeTargetAlpha: 1,
    invisibilityFadeStartAtMs: 0,
    invisibilityFadeDurationMs: INVISIBILITY_FADE_DURATION_MS,
    invisibilityFadeStartAlpha: 1,
    invisibilityAlphaCurrent: 1,
    killAwardedThisLife: false,
    shieldActive: false,
  };
}

const PLANE_LIFE_STATES = Object.freeze({
  ALIVE: "alive",
  DESTROYED_CLASSIC: "destroyed_classic",
  DESTROYED_ARCADE_UNAVAILABLE: "destroyed_arcade_unavailable",
  DESTROYED_ARCADE_READY: "destroyed_arcade_ready",
});

const ARCADE_SHIELD_COLLIDER_SIZE = 40;

function getPlaneLifeState(plane){
  if(!plane) return PLANE_LIFE_STATES.DESTROYED_CLASSIC;
  return plane.lifeState || (plane.isAlive ? PLANE_LIFE_STATES.ALIVE : PLANE_LIFE_STATES.DESTROYED_CLASSIC);
}

function getRespawnOpacityByStage(stage){
  const stageToOpacity = {
    1: 0.4,
    2: 0.6,
    3: 0.8,
  };
  const normalizedStage = Number.isFinite(stage)
    ? Math.max(1, Math.min(3, Math.round(stage)))
    : 3;
  return stageToOpacity[normalizedStage] ?? stageToOpacity[3];
}

function getInactivePlaneAlpha(now, plane){
  const safeNow = Number.isFinite(now) ? now : performance.now();
  const baseAlpha = 0.2;
  const minAlpha = 0.1;
  const amplitude = (baseAlpha - minAlpha) / 2;
  const waveCenter = minAlpha + amplitude;
  const pulseSpeed = 0.0022;
  const phaseSeed = Number.isFinite(plane?.homeX) && Number.isFinite(plane?.homeY)
    ? plane.homeX * 0.017 + plane.homeY * 0.013
    : (plane?.color === "green" ? Math.PI / 3 : 0);
  const wave = Math.sin(safeNow * pulseSpeed + phaseSeed);
  return waveCenter + amplitude * wave;
}

function isPlaneRespawnComplete(plane){
  return Number.isFinite(plane?.respawnStage) && plane.respawnStage >= 3;
}

function isPlaneRespawnBlockedByEnemy(plane){
  if(!plane) return false;
  if(!isArcadePlaneRespawnEnabled() || !isPlaneAtBase(plane)){
    plane.respawnBlockedByEnemy = false;
    return false;
  }

  const homeX = Number.isFinite(plane.homeX) ? plane.homeX : plane.x;
  const homeY = Number.isFinite(plane.homeY) ? plane.homeY : plane.y;
  const blocked = points.some(enemyPlane => {
    if(!enemyPlane || enemyPlane === plane) return false;
    if(enemyPlane.color === plane.color) return false;
    if(!isPlaneTargetable(enemyPlane)) return false;
    const distanceToRespawn = Math.hypot(enemyPlane.x - homeX, enemyPlane.y - homeY);
    return distanceToRespawn <= POINT_RADIUS * 2;
  });

  plane.respawnBlockedByEnemy = blocked;
  return blocked;
}

function isPlaneInactiveForLaunch(plane){
  if(!plane) return true;
  return !isPlaneLaunchStateReady(plane);
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

function isArcadeFlagRespawnEnabled(){
  return settings.arcadeMode === true && isAdvancedLikeRuleset(selectedRuleset);
}

function isArcadeInfiniteScoreMode(){
  return settings.arcadeMode === true && isAdvancedLikeRuleset(selectedRuleset);
}

function isArcadePlaneRespawnEnabled(){
  return settings.arcadeMode === true && isAdvancedLikeRuleset(selectedRuleset);
}

function isBaseInvulnerabilityEnabled(){
  return settings.arcadeBaseInvulnerability === true;
}

function isPlaneLaunchStateReady(plane){
  if(!plane) return false;
  if(getPlaneLifeState(plane) === PLANE_LIFE_STATES.DESTROYED_ARCADE_READY) return true;
  // Ограничения базы/восстановления — только для arcade, не для classic/advanced/hotseat.
  if(isArcadePlaneRespawnEnabled()){
    if(plane.isAlive !== true || plane.burning) return false;
    if(!isPlaneAtBase(plane)) return true;
    return isPlaneRespawnComplete(plane) && !isPlaneRespawnBlockedByEnemy(plane);
  }
  return plane.isAlive === true && !plane.burning;
}

function isPlaneAtBase(plane){
  return plane?.respawnState === "at_base";
}

function isPlaneRespawnPenaltyActive(plane){
  return plane?.respawnPenaltyActive === true;
}

function isPlaneTargetable(plane){
  if(!plane) return false;
  if(plane.isAlive !== true) return false;
  if(plane.burning) return false;
  const planeLifeState = getPlaneLifeState(plane);
  if(
    isArcadePlaneRespawnEnabled()
    && (
      planeLifeState === PLANE_LIFE_STATES.DESTROYED_ARCADE_UNAVAILABLE
      || planeLifeState === PLANE_LIFE_STATES.DESTROYED_ARCADE_READY
    )
  ){
    return false;
  }
  // Базовая неуязвимость — отдельное правило. По умолчанию самолёт на базе можно поразить,
  // а режим неуязвимости включается только явным флагом.
  if(isArcadePlaneRespawnEnabled() && isBaseInvulnerabilityEnabled() && isPlaneAtBase(plane)) return false;
  return true;
}

function canAwardKillPointForPlane(plane){
  return Boolean(plane) && plane.killAwardedThisLife !== true;
}

function markPlaneKillPointAwarded(plane){
  if(!plane) return;
  plane.killAwardedThisLife = true;
}

function resetPlaneKillPointAwardMarker(plane){
  if(!plane) return;
  plane.killAwardedThisLife = false;
}

function setPlaneReadyAtBase(plane){
  if(!plane) return;
  const now = performance.now();
  const homeX = Number.isFinite(plane.homeX) ? plane.homeX : plane.x;
  const homeY = Number.isFinite(plane.homeY) ? plane.homeY : plane.y;
  plane.x = homeX;
  plane.y = homeY;
  plane.prevX = homeX;
  plane.prevY = homeY;
  if(Number.isFinite(plane.homeAngle)){
    plane.angle = plane.homeAngle;
  }
  plane.burning = false;
  plane.isAlive = true;
  plane.lifeState = PLANE_LIFE_STATES.DESTROYED_ARCADE_UNAVAILABLE;
  plane.crashStart = null;
  plane.killMarkerStart = null;
  plane.collisionX = null;
  plane.collisionY = null;
  plane.respawnState = "at_base";
  plane.respawnStage = 1;
  plane.respawnPenaltyActive = true;
  plane.respawnHalfTurnsRemaining = 5;
  plane.respawnBlockedByEnemy = false;
  plane.respawnHudCrossStart = now;
  plane.shieldActive = false;
}

function markPlaneLaunchedFromBase(plane){
  if(!plane) return;
  // После запуска самолёт считается «в полёте» через respawnState/respawnStage.
  // Отдельный флаг isInvulnerable здесь не переключаем, чтобы не было двойной трактовки состояния.
  plane.respawnPenaltyActive = false;
  plane.respawnHalfTurnsRemaining = 0;
  plane.respawnBlockedByEnemy = false;
  plane.respawnHudCrossStart = null;
  plane.shieldActive = false;
  // Меняем respawn-состояние только в arcade: вне arcade база не должна диктовать этапы полёта.
  if(isArcadePlaneRespawnEnabled()){
    plane.respawnState = "in_flight";
    plane.respawnStage = 3;
    plane.lifeState = PLANE_LIFE_STATES.ALIVE;
    resetPlaneKillPointAwardMarker(plane);
  }
}

function eliminatePlane(plane, options = {}){
  if(!plane) return;
  if(!isPlaneTargetable(plane)) return;
  recordAiSelfAnalyzerElimination(plane);

  const {
    keepBurning = true,
    keepCrashMarkers = true,
    skipFlameFx = false,
  } = options;

  if(isArcadePlaneRespawnEnabled()){
    setPlaneReadyAtBase(plane);
    return;
  }

  plane.isAlive = false;
  plane.lifeState = PLANE_LIFE_STATES.DESTROYED_CLASSIC;
  plane.burning = Boolean(keepBurning);
  if(plane.burning){
    ensurePlaneBurningFlame(plane);
  }
  if(keepCrashMarkers){
    plane.collisionX = plane.x;
    plane.collisionY = plane.y;
    const crashTimestamp = performance.now();
    plane.crashStart = crashTimestamp;
    plane.killMarkerStart = crashTimestamp;
  }
  if(!skipFlameFx && plane.burning){
    schedulePlaneFlameFx(plane);
  }
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

function captureFlag(flag, options = {}){
  if(!flag) return;

  if(options.arcadeRespawn === true){
    flag.state = FLAG_STATES.ACTIVE;
    flag.carrier = null;
    flag.droppedAt = null;
    return;
  }

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
  const { forceGameScreen = false, forceMenu = false, resetModeToDefault = false } = options;
  const shouldShowMenu = forceMenu || (!forceGameScreen && !menuScreenLocked);

  isGameOver= false;
  winnerColor= null;
  roundEndedByNuke = false;
  setEndGamePanelVisible(false);
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;
  aiSelfAnalyzerState.activeMatch = null;

  cleanupGreenCrashFx();

  activeExplosions.length = 0;

  greenScore = 0;
  blueScore  = 0;
  resetMatchScoreAnimations();
  updateArcadeScore({ blue: 0, green: 0 });
  roundNumber = 0;
  randomMapPairSequenceNumber = null;
  randomMapPairIndex = null;
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
  clearDynamiteExplosionDomEntries();
  dynamiteState = [];

  hasShotThisRound = false;

  if(shouldShowMenu){
    selectedMode = resetModeToDefault
      ? "hotSeat"
      : (normalizeGameMode(selectedMode) || "hotSeat");
  }
  gameMode = shouldShowMenu ? null : gameMode;
  phase = shouldShowMenu ? 'MENU' : 'TURN';
  currentPlacer = null;

  if (shouldShowMenu) {
    menuScreenLocked = false;
    setBackgroundImage('ui_gamescreen/paperwithred.png');
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
  setStoredGameMode(selectedMode);
  lastModeSelectionButton = hotSeatBtn;
  updateModeSelection(hotSeatBtn);
});
computerBtn.addEventListener("click",()=>{
  selectedMode = "computer";
  setStoredGameMode(selectedMode);
  lastModeSelectionButton = computerBtn;
  updateModeSelection(computerBtn);
});
onlineBtn.addEventListener("click",()=>{
  selectedMode = "online";
  setStoredGameMode(selectedMode);
  lastModeSelectionButton = onlineBtn;
  updateModeSelection(onlineBtn);
});
if(classicRulesBtn){
  classicRulesBtn.addEventListener('click', () => {
    settings.flightRangeCells = 30;
    settings.aimingAmplitude = 80;
    settings.addAA = false;
    settings.addCargo = true;
    settings.sharpEdges = true;
    const upcomingRoundNumber = roundNumber + 1;
    randomMapPairSequenceNumber = null;
    randomMapPairIndex = null;
    setMapIndexAndPersist(getRandomPlayableMapIndex(upcomingRoundNumber));
    settings.randomizeMapEachRound = true;
    settings.flameStyle = 'random';
    onFlameStyleChanged();
    applyCurrentMap(upcomingRoundNumber);
    selectedRuleset = "classic";
    syncMapEditorResetButtonVisibility();
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
    syncMapEditorResetButtonVisibility();
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
if(editorBtn){
  editorBtn.addEventListener('click', async () => {
    selectedRuleset = "mapeditor";
    mapEditorControlMode = "bricks";
    syncMapEditorResetButtonVisibility();
    loadSettingsForRuleset(selectedRuleset);
    settingsBridge.setMapIndex(0, { persist: true });
    settings.randomizeMapEachRound = false;
    applyCurrentMap();
    syncRulesButtonSkins(selectedRuleset);
    lastRulesSelectionButton = editorBtn;
    updateModeSelection(editorBtn);

    await handlePlayStart();
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
  if(selectedRuleset === "mapeditor") return editorBtn;
  return null;
}

function hasValidMenuPlaneGeometry(btnRect, rootRect, uiScale){
  if(!btnRect || !rootRect) return false;
  if(!Number.isFinite(uiScale) || uiScale <= 0) return false;
  if(btnRect.width <= 0 || btnRect.height <= 0) return false;
  if(rootRect.width <= 0 || rootRect.height <= 0) return false;
  return true;
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
  if(!hasValidMenuPlaneGeometry(btnRect, rootRect, uiScale)){
    leftModePlane.style.opacity = "0";
    rightModePlane.style.opacity = "0";
    return;
  }
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
  if(!hasValidMenuPlaneGeometry(btnRect, rootRect, uiScale)){
    leftRulesPlane.style.opacity = "0";
    rightRulesPlane.style.opacity = "0";
    return;
  }
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

async function handlePlayStart(){
  const normalizedMode = normalizeGameMode(selectedMode);
  if(!normalizedMode){
    const reason = '[MODE] Match start aborted: selectedMode is missing or invalid.';
    console.error(reason, { selectedMode });
    alert("Cannot start match: game mode is not selected. Please pick a mode and try again.");
    return false;
  }
  selectedMode = normalizedMode;
  setStoredGameMode(selectedMode);

  bootTrace.startTs = performance.now();
  bootTrace.markers = [];
  gameDrawFirstLogged = false;
  const readyAtClick = gameAssetsReady;
  console.log("[BOOT] play pressed", { gameReady: readyAtClick, selectedMode });
  gameMode = normalizedMode;

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
  return true;
}

playBtn.addEventListener("click",async ()=>{
  await handlePlayStart();
});

/* ======= INPUT (slingshot) ======= */
const handleCircle={
  baseX:0, baseY:0,
  shakyX:0, shakyY:0,
  offsetX:0, offsetY:0,
  active:false,
  pointRef:null,
  origAngle:null,
  pointerId:null,
  hasGlobalPointerListeners:false,
  pointerDown:false,
  movedWhilePointerDown:false,
  pointerDownStartX:0,
  pointerDownStartY:0
};

const STICKY_AIM_HOLD_MOVE_THRESHOLD_PX = 4;

function shouldUseStickyAimForPointerEvent(event){
  return event?.pointerType !== "touch";
}

function isPlaneGrabbableAt(x, y) {
  if(isGameOver || !gameMode) return false;
  if(pendingInventoryUse) return false;

  const currentColor = turnColors[turnIndex];
  if(gameMode === "computer" && currentColor === "blue") return false; // ход ИИ

  if(flyingPoints.some(fp => fp.plane.color === currentColor)) return false;

  return points.some(pt =>
    pt.color === currentColor &&
    !isPlaneInactiveForLaunch(pt) &&
    Math.hypot(pt.x - x, pt.y - y) <= PLANE_TOUCH_RADIUS
  );
}

function getGrabRejectReason(mx, my, currentColor){
  if(isNuclearStrikeActionLocked()) return "nuclear_action_locked";
  if(isGameOver || !gameMode) return "game_not_active";
  if(pendingInventoryUse) return "pending_inventory_use";
  if(gameMode === "computer" && currentColor === "blue") return "ai_turn";
  if(flyingPoints.some(fp => fp.plane.color === currentColor)) return "plane_already_in_flight";

  const nearCurrentTeamPlane = points.some(pt =>
    pt.color === currentColor &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(!nearCurrentTeamPlane) return "no_plane_under_pointer";

  const nearLaunchReadyPlane = points.some(pt =>
    pt.color === currentColor &&
    !isPlaneInactiveForLaunch(pt) &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );

  if(nearLaunchReadyPlane) return "unknown";

  const blockedByRespawnEnemy = points.some(pt =>
    pt.color === currentColor &&
    isArcadePlaneRespawnEnabled() &&
    isPlaneAtBase(pt) &&
    isPlaneRespawnComplete(pt) &&
    isPlaneRespawnBlockedByEnemy(pt) &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(blockedByRespawnEnemy) return "respawn_blocked_by_enemy";

  const blockedByRespawnStage = points.some(pt =>
    pt.color === currentColor &&
    isPlaneAtBase(pt) &&
    isArcadePlaneRespawnEnabled() &&
    !isPlaneRespawnComplete(pt) &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(blockedByRespawnStage) return "respawn_not_ready";

  const blockedByBurning = points.some(pt =>
    pt.color === currentColor &&
    pt.burning &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(blockedByBurning) return "plane_burning";

  const blockedByFlightState = points.some(pt =>
    pt.color === currentColor &&
    isArcadePlaneRespawnEnabled() &&
    !isPlaneAtBase(pt) &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(blockedByFlightState) return "plane_not_at_base";

  return "plane_unavailable";
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
    !isPlaneInactiveForLaunch(pt) &&
    Math.hypot(pt.x - mx, pt.y - my) <= PLANE_TOUCH_RADIUS
  );
  if(!found){
    if(DEBUG_PLANE_GRAB){
      const reason = getGrabRejectReason(mx, my, currentColor);
      console.debug("[plane-grab-debug] grab rejected", {
        reason,
        currentColor,
        pointer: { x: mx, y: my },
        turnColor: turnColors[turnIndex],
      });
    }
    return;
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
  gsBoardCanvas.style.cursor = 'grabbing';
  document.body.style.cursor = 'grabbing';

  // Show overlay canvas for aiming arrow
  aimCanvas.style.display = "block";
}

function finalizeStickyAimLaunchAt(boardX, boardY){
  if(!handleCircle.active || !handleCircle.pointRef) return;

  handleCircle.baseX = boardX;
  handleCircle.baseY = boardY;
  handleCircle.shakyX = boardX;
  handleCircle.shakyY = boardY;

  onHandleUp();
}

function addStickyAimGlobalPointerListeners(){
  if(handleCircle.hasGlobalPointerListeners) return;
  window.addEventListener("pointerdown", onGlobalStickyAimPointerDownWhileArmed, true);
  window.addEventListener("pointermove", onGlobalStickyAimPointerMove);
  window.addEventListener("pointerup", onGlobalStickyAimPointerUpOrCancel);
  window.addEventListener("pointercancel", onGlobalStickyAimPointerUpOrCancel);
  handleCircle.hasGlobalPointerListeners = true;
}

function removeStickyAimGlobalPointerListeners(){
  if(!handleCircle.hasGlobalPointerListeners) return;
  window.removeEventListener("pointerdown", onGlobalStickyAimPointerDownWhileArmed, true);
  window.removeEventListener("pointermove", onGlobalStickyAimPointerMove);
  window.removeEventListener("pointerup", onGlobalStickyAimPointerUpOrCancel);
  window.removeEventListener("pointercancel", onGlobalStickyAimPointerUpOrCancel);
  handleCircle.hasGlobalPointerListeners = false;
}

function onGlobalStickyAimPointerDownWhileArmed(e){
  if(!handleCircle.active || phase === 'AA_PLACEMENT') return;
  if(handleCircle.pointerDown) return;

  const target = e.target;
  const isInsideBoard = target instanceof Node && gsBoardCanvas instanceof HTMLElement
    ? gsBoardCanvas.contains(target)
    : false;
  if(isInsideBoard) return;

  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x, y } = designToBoardCoords(designX, designY);
  finalizeStickyAimLaunchAt(x, y);

  e.preventDefault();
  e.stopPropagation();
}

function beginStickyAimHoldTracking(e, boardX, boardY){
  if(!handleCircle.active) return;
  if(!Number.isFinite(e?.pointerId)) return;

  handleCircle.pointerId = e.pointerId;
  handleCircle.pointerDown = true;
  handleCircle.movedWhilePointerDown = false;
  handleCircle.pointerDownStartX = boardX;
  handleCircle.pointerDownStartY = boardY;
  addStickyAimGlobalPointerListeners();

  if(typeof gsBoardCanvas?.setPointerCapture === "function"){
    try {
      gsBoardCanvas.setPointerCapture(e.pointerId);
    } catch(_err){
      // Ignore unsupported pointer capture errors.
    }
  }
}

function endStickyAimHoldTracking(e){
  const trackedPointerId = handleCircle.pointerId;
  const samePointer = Number.isFinite(e?.pointerId) && Number.isFinite(trackedPointerId)
    ? e.pointerId === trackedPointerId
    : true;

  if(!samePointer) return { ended: false, moved: false };

  if(Number.isFinite(trackedPointerId) && typeof gsBoardCanvas?.releasePointerCapture === "function"){
    try {
      if(gsBoardCanvas.hasPointerCapture(trackedPointerId)){
        gsBoardCanvas.releasePointerCapture(trackedPointerId);
      }
    } catch(_err){
      // Ignore unsupported pointer capture errors.
    }
  }

  const wasHolding = handleCircle.pointerDown;
  const movedWhileHolding = handleCircle.movedWhilePointerDown;

  handleCircle.pointerId = null;
  handleCircle.pointerDown = false;
  handleCircle.movedWhilePointerDown = false;

  if(!wasHolding) return { ended: false, moved: false };
  return {
    ended: true,
    moved: movedWhileHolding,
  };
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
  if(isMapEditorBricksModeActive()){
    if(mapEditorBrickInteractionState.mode === "sticky"){
      const { clientX, clientY } = getPointerClientCoords(e);
      if(isClientPointOverBoard(clientX, clientY)){
        if(commitMapEditorBrickDrop(clientX, clientY)){
          resetMapEditorBrickInteraction();
        }
        e.preventDefault();
        return;
      }
    }
    if(onCanvasMapEditorBrickPointerDown(e)){
      e.preventDefault();
    }
    return;
  }
  if(onBoardInventoryStickyApply(e)){
    e.preventDefault();
    return;
  }
  if(isNuclearStrikeActionLocked()) return;
  if(handleCircle.active && phase !== 'AA_PLACEMENT'){
    const { x: designX, y: designY } = getPointerDesignCoords(e);
    const { x, y } = designToBoardCoords(designX, designY);
    if(shouldUseStickyAimForPointerEvent(e)){
      beginStickyAimHoldTracking(e, x, y);
    }
    e.preventDefault();
    return;
  }
  if(phase === 'AA_PLACEMENT'){
    e.preventDefault();
    aaPointerDown = true;
    updateAAPreviewFromEvent(e);
  } else if(pendingInventoryUse) {
    handleStart(e);
  } else {
    const { x: designX, y: designY } = getPointerDesignCoords(e);
    const { x, y } = designToBoardCoords(designX, designY);
    handleStart(e);
    if(shouldUseStickyAimForPointerEvent(e)){
      beginStickyAimHoldTracking(e, x, y);
    }
  }
}

function onCanvasPointerMove(e){
  logPointerDebugEvent(e);
  if(isMapEditorBricksModeActive()){
    const { x: designX, y: designY } = getPointerDesignCoords(e);
    const { x: boardX, y: boardY } = designToBoardCoords(designX, designY);
    const spriteIndex = findMapEditorBrickSpriteIndexAtBoardPoint(boardX, boardY);
    const isBrickDraggingActive = mapEditorBrickInteractionState.mode === "holding";
    gsBoardCanvas.style.cursor = spriteIndex >= 0 && !isBrickDraggingActive ? "grab" : "";
    return;
  }
  if(isNuclearStrikeActionLocked()) {
    gsBoardCanvas.style.cursor = '';
    return;
  }
  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x, y } = designToBoardCoords(designX, designY);

  if(handleCircle.active && phase !== 'AA_PLACEMENT'){
    handleCircle.baseX = x;
    handleCircle.baseY = y;

    if(handleCircle.pointerDown){
      const moveDistance = Math.hypot(
        x - handleCircle.pointerDownStartX,
        y - handleCircle.pointerDownStartY
      );
      if(moveDistance >= STICKY_AIM_HOLD_MOVE_THRESHOLD_PX){
        handleCircle.movedWhilePointerDown = true;
      }
    }

    gsBoardCanvas.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
    return;
  }

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
  if(isMapEditorBricksModeActive()) return;
  if(isNuclearStrikeActionLocked()){
    aaPointerDown = false;
    aaPlacementPreview = null;
    aaPreviewTrail = [];
    return;
  }

  if(phase !== 'AA_PLACEMENT'){
    if(!handleCircle.active) return;

    if(!shouldUseStickyAimForPointerEvent(e)){
      const { x: designX, y: designY } = getPointerDesignCoords(e);
      const { x, y } = designToBoardCoords(designX, designY);
      handleCircle.baseX = x;
      handleCircle.baseY = y;
      handleCircle.shakyX = x;
      handleCircle.shakyY = y;
      onHandleUp();
      e.preventDefault();
      return;
    }

    const holdResult = endStickyAimHoldTracking(e);
    if(!holdResult.ended) return;

    const { x: designX, y: designY } = getPointerDesignCoords(e);
    const { x, y } = designToBoardCoords(designX, designY);
    const plane = handleCircle.pointRef;
    if(!plane) return;

    const launchX = holdResult.moved ? x : handleCircle.pointerDownStartX;
    const launchY = holdResult.moved ? y : handleCircle.pointerDownStartY;
    const tapDistanceFromPlane = Math.hypot(launchX - plane.x, launchY - plane.y);
    if(!holdResult.moved && tapDistanceFromPlane < CELL_SIZE){
      e.preventDefault();
      return;
    }

    finalizeStickyAimLaunchAt(launchX, launchY);
    e.preventDefault();
    return;
  }

  aaPointerDown = false;
  if(!aaPlacementPreview) return;
  const {x, y} = aaPlacementPreview;
  handleAAPlacement(x, y);
  aaPlacementPreview = null;
  aaPreviewTrail = [];
}

function onGlobalStickyAimPointerMove(e){
  if(!handleCircle.active || phase === 'AA_PLACEMENT') return;

  const trackedPointerId = handleCircle.pointerId;
  if(handleCircle.pointerDown && Number.isFinite(trackedPointerId) && Number.isFinite(e?.pointerId) && e.pointerId !== trackedPointerId){
    return;
  }

  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x, y } = designToBoardCoords(designX, designY);
  handleCircle.baseX = x;
  handleCircle.baseY = y;

  if(handleCircle.pointerDown){
    const moveDistance = Math.hypot(
      x - handleCircle.pointerDownStartX,
      y - handleCircle.pointerDownStartY
    );
    if(moveDistance >= STICKY_AIM_HOLD_MOVE_THRESHOLD_PX){
      handleCircle.movedWhilePointerDown = true;
    }
  }

  gsBoardCanvas.style.cursor = 'grabbing';
  document.body.style.cursor = 'grabbing';
}

function onGlobalStickyAimPointerUpOrCancel(e){
  if(!handleCircle.active || phase === 'AA_PLACEMENT') return;

  const holdResult = endStickyAimHoldTracking(e);
  if(!holdResult.ended) return;

  const { x: designX, y: designY } = getPointerDesignCoords(e);
  const { x, y } = designToBoardCoords(designX, designY);
  const plane = handleCircle.pointRef;
  if(!plane) return;

  const launchX = holdResult.moved ? x : handleCircle.pointerDownStartX;
  const launchY = holdResult.moved ? y : handleCircle.pointerDownStartY;
  const tapDistanceFromPlane = Math.hypot(launchX - plane.x, launchY - plane.y);
  if(!holdResult.moved && tapDistanceFromPlane < CELL_SIZE){
    return;
  }

  finalizeStickyAimLaunchAt(launchX, launchY);
}

function onGlobalPointerDownInventoryCancel(event){
  if(inventoryInteractionState.mode !== "sticky") return;

  const target = event.target;
  const isInsideBoard = target instanceof Node && gsBoardCanvas instanceof HTMLElement
    ? gsBoardCanvas.contains(target)
    : false;
  const isInsideInventory = target instanceof Node
    && (blueInventoryHost?.contains(target) || greenInventoryHost?.contains(target));

  if(isInsideBoard || isInsideInventory) return;

  cancelActiveInventoryPickup();
}

function onInventoryTooltipPreviewPointerMove(event){
  if(event.pointerType !== "mouse") return;
  if(!inventoryTooltipState.previewTarget) return;

  const origin = inventoryTooltipState.previewPointerOrigin;
  if(!origin){
    clearInventoryTooltipPreview();
    refreshInventoryTooltip();
    return;
  }

  const dx = event.clientX - origin.x;
  const dy = event.clientY - origin.y;
  const movedDistance = Math.hypot(dx, dy);
  if(movedDistance < INVENTORY_TOOLTIP_MOUSE_MOVE_DISMISS_THRESHOLD_PX) return;

  clearInventoryTooltipPreview();
  refreshInventoryTooltip();
}

function onInventoryTooltipPreviewPointerDown(event){
  if(event.pointerType === "mouse") return;
  if(!inventoryTooltipState.previewTarget) return;

  const target = event.target;
  if(!(target instanceof Node)) return;

  const isInsideInventory = Object.values(inventoryHosts).some((host) => host?.contains(target));
  const tooltipElement = inventoryTooltipState.element;
  const isInsideTooltip = tooltipElement instanceof HTMLElement && tooltipElement.contains(target);

  if(isInsideInventory || isInsideTooltip) return;

  clearInventoryTooltipPreview();
  refreshInventoryTooltip();
}

window.addEventListener("resize", () => {
  if(inventoryTooltipState.activeSlotIndex === null) return;
  if(typeof inventoryTooltipState.activeSlotColor !== "string") return;
  refreshInventoryTooltip();
});

gsBoardCanvas.addEventListener("pointerdown", onCanvasPointerDown);
gsBoardCanvas.addEventListener("pointermove", onCanvasPointerMove);
gsBoardCanvas.addEventListener("pointerup", onCanvasPointerUp);
gsBoardCanvas.addEventListener("pointerleave", () => { aaPlacementPreview = null; aaPointerDown = false; aaPreviewTrail = []; });
gsBoardCanvas.addEventListener("dragover", onMapEditorBrickDragOver);
gsBoardCanvas.addEventListener("drop", onMapEditorBrickDrop);
if(shouldUseLegacyDragDropFallback()){
  gsBoardCanvas.addEventListener("dragover", onBoardDragOver);
  gsBoardCanvas.addEventListener("drop", onInventoryDrop);
  window.addEventListener("dragend", () => {
    clearInventoryDragArtifacts();
    cancelActiveInventoryDrag("ended outside board");
  });
  window.addEventListener("drop", () => {
    clearInventoryDragArtifacts();
    cancelActiveInventoryDrag("dropped outside board");
  });
  window.addEventListener("dragcancel", () => cancelActiveInventoryDrag("cancelled"));
  window.addEventListener("dragover", (event) => {
    updateInventoryDragFallbackPosition(event.clientX, event.clientY);
  });
}
window.addEventListener("pointermove", onInventoryPickupPointerMove);
window.addEventListener("pointermove", onInventoryTooltipPreviewPointerMove);
window.addEventListener("pointermove", onMapEditorBrickPointerMove);
window.addEventListener("pointerdown", onGlobalPointerDownInventoryCancel);
window.addEventListener("pointerdown", onInventoryTooltipPreviewPointerDown);
window.addEventListener("pointerdown", onGlobalPointerDownMapEditorBrickCancel);
window.addEventListener("pointerup", onInventoryPickupPointerFinish);
window.addEventListener("pointerup", onMapEditorBrickPointerFinish);
window.addEventListener("pointercancel", onInventoryPickupPointerFinish);
window.addEventListener("pointercancel", onMapEditorBrickPointerFinish);
window.addEventListener("keydown", (event) => {
  if(event.key === "Escape"){
    cancelPendingInventoryUse();
    cancelActiveInventoryPickup();
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
  markPlaneLaunchedFromBase(plane);

  flyingPoints.push({
    plane, vx, vy,
    timeLeft: FIELD_FLIGHT_DURATION_SEC,
    collisionCooldown:0,
    lastHitPlane:null,
    lastHitCooldown:0,
    shieldBreakLockActive:false,
    shieldBreakLockTarget:null
  });
  recordAiSelfAnalyzerLaunch(plane, vx, vy, "human");
  recordHumanDecisionEvent(plane, vx, vy);

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
  handleCircle.pointerId = null;
  handleCircle.pointerDown = false;
  handleCircle.movedWhilePointerDown = false;
  // Hide overlay canvas when aiming ends
  aimCanvas.style.display = "none";
  aimCtx.clearRect(0,0,aimCanvas.width,aimCanvas.height);
  document.body.style.cursor = '';
  removeStickyAimGlobalPointerListeners();
}

/* ======= AI ======= */
const AI_MODES = Object.freeze({
  RESOURCE_FIRST: "resource_first",
  FLAG_PRESSURE: "flag_pressure",
  ATTRITION: "attrition",
  DEFENSE: "defense"
});

const AI_EARLY_GAME_TURN_LIMIT = 6;
const AI_CARGO_RISK_ACCEPTANCE = 0.42;
const AI_CARGO_RISK_YELLOW_ZONE_MARGIN = 0.12;
const AI_CARGO_FAVORABLE_DISTANCE = MAX_DRAG_DISTANCE * 0.72;
const AI_CARGO_IMMEDIATE_THREAT_DISTANCE = ATTACK_RANGE_PX * 0.9;
const AI_CARGO_IMMEDIATE_THREAT_INTERCEPTION = 0.5;
const AI_CARGO_SWITCH_TO_AGGRESSION_ITEMS = 2;
const AI_LONG_SHOT_DISTANCE_THRESHOLD = MAX_DRAG_DISTANCE * 0.85;
const AI_LONG_SHOT_LARGE_PENALTY_LOG_THRESHOLD = 1.2;
const AI_MIN_LAUNCH_SCALE_DEFAULT = 0.22;
const AI_ATTACK_SOFT_MIN_BOOST = 0.06;
const AI_ATTACK_MID_LONG_MIN_BOOST_MAX = 0.08;
const AI_ATTACK_MID_LONG_DISTANCE_RATIO_START = 0.58;
const AI_ATTACK_MID_LONG_DISTANCE_RATIO_FULL = 0.92;
const AI_ATTACK_SCALE_GUARD_FLOOR = 0.32;
const AI_ATTACK_SCALE_GUARD_SHORT_CONTROL_DISTANCE_RATIO_MAX = 0.45;
const AI_ATTACK_CLOSE_RANGE_DISTANCE_RATIO_MAX = 0.4;
const AI_ATTACK_CLOSE_RANGE_SAFE_MIN_SCALE = 0.34;
const AI_LONG_SHOT_POWER_RATIO_THRESHOLD = 0.75;
const AI_TACTICAL_MEDIUM_STREAK_TRIGGER = 2;
const AI_TACTICAL_MEDIUM_TRIGGER_CHANCE = 0.3;
const AI_TACTICAL_MEDIUM_SCALE_MIN = 0.52;
const AI_TACTICAL_MEDIUM_SCALE_MAX = 0.68;
const AI_FINISHER_OVERSHOOT_FACTOR = 1.04;
const AI_OPENING_CENTER_TURN_LIMIT = 2;
const AI_OPENING_DIRECT_FINISHER_MIN_LEAD = 2;
const AI_OPENING_DIRECT_FINISHER_EXCEPTION_DISTANCE = MAX_DRAG_DISTANCE * 0.5;
const AI_OPENING_DIRECT_FINISHER_EXCEPTION_THREAT_COUNT = 2;
const AI_OPENING_DIRECT_FINISHER_EXCEPTION_NEAREST_THREAT_DISTANCE = ATTACK_RANGE_PX * 0.75;
const AI_CENTER_CONTROL_DISTANCE = MAX_DRAG_DISTANCE * 0.35;
const AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD = 2;
const AI_INVENTORY_SOFT_FALLBACK_COOLDOWN_TURNS = 3;
const AI_FALLBACK_DIRECT_QUALITY_MIN = 0.4;
const AI_WALL_LOCKED_TARGET_COMBAT_RADIUS = ATTACK_RANGE_PX;
const AI_WALL_LOCKED_MIRROR_BONUS = 0.04;
const AI_WALL_LOCKED_POOR_DIRECT_QUALITY_PENALTY = 0.2;
const AI_WALL_LOCKED_POOR_DIRECT_SCORE_PENALTY = ATTACK_RANGE_PX * 0.2;
const AI_WALL_LOCKED_DIRECT_TIE_BREAK_PENALTY = 0.0003;
const AI_FALLBACK_ATTACK_SCORE_TIE_EPSILON = ATTACK_RANGE_PX * 0.015;
const AI_FALLBACK_SAFE_ANGLE_SHORT_SCALE = 0.38;
const AI_FALLBACK_SAFE_ANGLE_CANDIDATE_DEG = Object.freeze([28, -28, 44, -44, 62, -62, 88, -88]);
const AI_FALLBACK_RICOCHET_PREP_SCALE = 0.66;
const AI_LANE_PROGRESS_PRIMARY_THRESHOLD_SCALE = 0.12;
const AI_LANE_PROGRESS_RESERVE_THRESHOLD_SCALE = 0.07;
const AI_LANE_TIGHT_PASS_SCORE_PENALTY_SCALE = 0.24;
const AI_REPEAT_PLANE_SOFT_PENALTY = 0.48;
const AI_REPEAT_PLANE_HARD_PENALTY = 0.72;
const AI_RECENT_PLANE_HISTORY_LIMIT = 6;
const AI_ROTATION_BONUS_PER_IDLE_TURN = 0.05;
const AI_ROTATION_BONUS_MAX = 0.26;
const AI_REPEAT_WINDOW_PENALTY_STEP = 0.15;
const AI_REPEAT_FORCE_SCORE_MARGIN = MAX_DRAG_DISTANCE * 0.08;
const AI_ROTATION_TACTICAL_PRIORITY_GAP = MAX_DRAG_DISTANCE * 0.04;
const AI_REPEAT_OPENING_FORCE_TURN_LIMIT = 2;
const AI_OPENING_SOFT_RANDOM_TURN_LIMIT = 2;
const AI_OPENING_SOFT_RANDOM_SCORE_MARGIN = MAX_DRAG_DISTANCE * 0.035;
const AI_OPENING_SOFT_RANDOM_MAX_SHIFT = 0.045;
const AI_POST_INVENTORY_LAUNCH_DELAY_MS = 1000;
const AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX = ATTACK_RANGE_PX * 0.45;
const AI_OPENING_AGGRESSION_BIAS_TURN_LIMIT = 2;
const AI_OPENING_AGGRESSION_BIAS_MAX_LEAD = 1;
const AI_OPENING_AGGRESSION_BIAS_DISCOUNT = 0.92;
const AI_PRE_FALLBACK_ATTACK_RADIUS = ATTACK_RANGE_PX * 1.05;
const AI_IMMEDIATE_RESPONSE_DANGER_RADIUS = ATTACK_RANGE_PX * 0.95;
const AI_FALLBACK_IMMEDIATE_RISK_PENALTY_NON_EMERGENCY_BOOST = 1.08;
const AI_CLASS_SCORE_LENGTH_WEIGHT = 0.38;
const AI_CLASS_SCORE_RESPONSE_RISK_WEIGHT = 0.24;
const AI_CLASS_SCORE_PROGRESS_WEIGHT = 0.22;
const AI_CLASS_SCORE_POSITION_UTILITY_WEIGHT = 0.16;
const AI_CLASS_SCORE_ANTI_SKEW_DENSE_DIRECT_PENALTY = 0.035;
const AI_CLASS_SCORE_ANTI_SKEW_DENSE_RICOCHET_BONUS = -0.03;
const AI_CLASS_SCORE_ANTI_SKEW_DENSE_GAP_BONUS = -0.015;
const AI_CLASS_SCORE_TIE_EPSILON = 0.025;
const AI_DIRECT_LOW_PASSABILITY_CLEARANCE_THRESHOLD_PX = CELL_SIZE * 0.32;
const AI_DIRECT_LOW_PASSABILITY_CORRIDOR_TIGHTNESS_THRESHOLD = 0.72;
const AI_DIRECT_LOW_PASSABILITY_SCORE_PENALTY = MAX_DRAG_DISTANCE * 0.03;
const AI_FLAG_PRESSURE_SAFETY_WINDOW_TURN_LIMIT = 4;
const AI_FLAG_PRESSURE_NEARBY_THREAT_DISTANCE = ATTACK_RANGE_PX * 1.55;
const AI_ANGLE_REPEAT_HISTORY_LIMIT = 3;
const AI_ANGLE_REPEAT_TIGHT_SPREAD_DEG = 7;
const AI_ANGLE_SAFE_FAN_MIN_DEG = 12;
const AI_ANGLE_SAFE_FAN_MAX_DEG = 18;
const AI_ANGLE_REPEAT_STREAK_ALERT_COUNT = 2;
const AI_OPENING_AGGRESSION_TARGETS = Object.freeze([
  "attack_enemy_plane",
  "interceptor",
  "direct_finisher",
]);
const AI_REPEAT_ALLOWED_REASON_CODES = Object.freeze([
  "direct_finisher",
  "opening_center_cargo",
  "mode_flag_pressure",
  "fallback_flag_pressure",
  "emergency_base_defense",
  "emergency_hold_position",
  "critical_base_threat",
]);
const AI_REPEAT_ALLOWED_REASON_TOKENS = Object.freeze([
  "intercept",
  "finisher",
  "defense",
  "flag",
  "cargo",
  "critical",
  "emergency",
  "protect",
  "hold",
]);


function getActualPlanesList(preferredPlanes = null){
  if(Array.isArray(preferredPlanes) && preferredPlanes.length){
    return preferredPlanes;
  }
  if(Array.isArray(points)){
    return points;
  }
  return [];
}

function findActualPlaneById(planeId, preferredPlanes = null){
  if(!planeId) return null;
  return getActualPlanesList(preferredPlanes).find((candidate) => candidate?.id === planeId) || null;
}

function logAiDecision(reason, details = {}){
  const payload = details && typeof details === "object" ? { ...details } : {};
  const planeId = payload.planeId ?? payload.plane?.id ?? null;
  const rawDistance = [payload.rawDistance, payload.moveTotalDist, payload.totalDist, payload.distance]
    .find((value) => Number.isFinite(value));

  let adjustedScore = Number.isFinite(payload.adjustedScore) ? payload.adjustedScore : null;
  let scoringExplanation = null;
  if(adjustedScore === null && Number.isFinite(rawDistance) && planeId){
    const plane = payload.plane || findActualPlaneById(planeId);
    if(plane){
      scoringExplanation = scoreMoveForPlane(rawDistance, plane);
      adjustedScore = scoringExplanation.finalScore;
    }
  }

  if(!scoringExplanation && Number.isFinite(rawDistance) && planeId){
    const plane = payload.plane || findActualPlaneById(planeId);
    if(plane){
      scoringExplanation = scoreMoveForPlane(rawDistance, plane);
    }
  }

  console.debug(`[ai] ${reason}`, {
    ...payload,
    planeId,
    rawDistance: Number.isFinite(rawDistance) ? Number(rawDistance.toFixed(3)) : null,
    adjustedScore: Number.isFinite(adjustedScore) ? Number(adjustedScore.toFixed(3)) : null,
    rotationBonus: Number.isFinite(scoringExplanation?.rotationBonus)
      ? Number(scoringExplanation.rotationBonus.toFixed(3))
      : null,
    idleTurns: Number.isFinite(scoringExplanation?.idleTurns)
      ? Number(scoringExplanation.idleTurns)
      : null,
    repeatInWindow: Number.isFinite(scoringExplanation?.repeatInWindow)
      ? Number(scoringExplanation.repeatInWindow)
      : null,
    repeatPenalty: Number.isFinite(scoringExplanation?.repeatPenalty)
      ? Number(scoringExplanation.repeatPenalty.toFixed(3))
      : null,
    finalScore: Number.isFinite(scoringExplanation?.finalScore)
      ? Number(scoringExplanation.finalScore.toFixed(3))
      : (Number.isFinite(adjustedScore) ? Number(adjustedScore.toFixed(3)) : null),
  });
}

function normalizeAiReasonText(reasonText = ""){
  if(typeof reasonText === "string") return reasonText.toLowerCase();
  if(reasonText && typeof reasonText === "object"){
    return `${reasonText.decisionReason || ""} ${reasonText.goalName || ""}`.toLowerCase();
  }
  return `${reasonText || ""}`.toLowerCase();
}

function isDefenseOrRetreatContext(reasonText = ""){
  const normalizedReasonText = normalizeAiReasonText(reasonText);
  return [
    "defense",
    "defend",
    "retreat",
    "fallback",
    "hold",
    "intercept",
    "protect",
    "emergency_base"
  ].some((marker) => normalizedReasonText.includes(marker));
}

function isAttackContext(reasonText = ""){
  const normalizedReasonText = normalizeAiReasonText(reasonText);
  return [
    "attack",
    "pressure",
    "direct",
    "finisher",
    "long_lane",
    "long_shot",
    "chase",
    "strike"
  ].some((marker) => normalizedReasonText.includes(marker));
}

function isCombatGoal(goalName = ""){
  const goalText = `${goalName || ""}`.toLowerCase();
  if(!goalText) return false;
  return [
    "attack",
    "direct_finisher",
    "eliminate",
    "pressure",
    "strike",
    "chase"
  ].some((marker) => goalText.includes(marker));
}

function isExplicitDefensiveGoal(goalName = ""){
  const goalText = `${goalName || ""}`.toLowerCase();
  if(!goalText) return false;
  return [
    "defense",
    "defend",
    "retreat",
    "hold",
    "intercept",
    "protect",
    "emergency_base"
  ].some((marker) => goalText.includes(marker));
}

function isIntentionalShortControlContext(reasonText = "", moveDistanceRatio = null){
  const normalizedReasonText = normalizeAiReasonText(reasonText);
  const hasShortControlIntent = [
    "hold",
    "intercept",
    "control",
    "close_control",
    "close-range",
    "short_range",
    "careful"
  ].some((marker) => normalizedReasonText.includes(marker));

  if(!hasShortControlIntent) return false;
  if(!Number.isFinite(moveDistanceRatio)) return true;
  return moveDistanceRatio <= AI_ATTACK_SCALE_GUARD_SHORT_CONTROL_DISTANCE_RATIO_MAX;
}

function applyAiMinLaunchScale(scale, details = {}){
  if(!Number.isFinite(scale)) return scale;

  const reasonText = `${details?.decisionReason || ""} ${details?.goalName || ""}`.toLowerCase();
  const moveDistance = Number.isFinite(details?.moveDistance)
    ? details.moveDistance
    : (Number.isFinite(details?.distance) ? details.distance : null);
  const moveDistanceRatio = Number.isFinite(moveDistance) && MAX_DRAG_DISTANCE > 0
    ? moveDistance / MAX_DRAG_DISTANCE
    : null;

  const targetX = Number.isFinite(details?.targetX) ? details.targetX : null;
  const targetY = Number.isFinite(details?.targetY) ? details.targetY : null;
  const enemyBase = getBaseAnchor("green");
  const targetNearEnemyBase = Boolean(enemyBase)
    && Number.isFinite(targetX)
    && Number.isFinite(targetY)
    && Math.hypot(targetX - enemyBase.x, targetY - enemyBase.y) <= ATTACK_RANGE_PX * 1.15;
  const isDirectFinisherGoal = details?.goalName === "direct_finisher";

  const isDefenseContext = isDefenseOrRetreatContext(reasonText);
  const isAttackIntentContext = isAttackContext(reasonText);
  const isCombatGoalContext = isCombatGoal(details?.goalName || "");
  const isDefensiveGoalContext = isExplicitDefensiveGoal(details?.goalName || "");
  const isIntentionalShortControl = isIntentionalShortControlContext(reasonText, moveDistanceRatio);
  const hasDirectLineOfSight = details?.hasDirectLineOfSight === true;
  const isCloseRangeDistance = Number.isFinite(moveDistanceRatio)
    && moveDistanceRatio <= AI_ATTACK_CLOSE_RANGE_DISTANCE_RATIO_MAX;
  const shouldUseCloseRangeCombatMinScale = hasDirectLineOfSight
    && isCloseRangeDistance
    && !isDefensiveGoalContext
    && !isIntentionalShortControl
    && (isAttackIntentContext || isCombatGoalContext);
  const isLongLaneDistanceContext = Number.isFinite(moveDistanceRatio)
    && moveDistanceRatio >= 0.68;

  const isAttackSoftContext = !isDefenseContext
    && (isAttackIntentContext || isLongLaneDistanceContext);
  const shouldUseAttackLocalBoost = isAttackSoftContext
    && (targetNearEnemyBase || isDirectFinisherGoal);
  const hasMidLongAttackDistance = Number.isFinite(moveDistanceRatio)
    && moveDistanceRatio >= AI_ATTACK_MID_LONG_DISTANCE_RATIO_START;
  const shouldUseAttackMidLongBoost = !isDefenseContext
    && isAttackIntentContext
    && hasMidLongAttackDistance;
  const midLongProgress = shouldUseAttackMidLongBoost
    ? Math.max(
      0,
      Math.min(
        1,
        (moveDistanceRatio - AI_ATTACK_MID_LONG_DISTANCE_RATIO_START)
          / Math.max(0.0001, AI_ATTACK_MID_LONG_DISTANCE_RATIO_FULL - AI_ATTACK_MID_LONG_DISTANCE_RATIO_START)
      )
    )
    : 0;
  const attackMidLongBoost = shouldUseAttackMidLongBoost
    ? Math.min(AI_ATTACK_MID_LONG_MIN_BOOST_MAX, AI_ATTACK_MID_LONG_MIN_BOOST_MAX * midLongProgress)
    : 0;

  const baseMinScale = AI_MIN_LAUNCH_SCALE_DEFAULT;
  const closeRangeCombatMinScale = shouldUseCloseRangeCombatMinScale
    ? AI_ATTACK_CLOSE_RANGE_SAFE_MIN_SCALE
    : 0;
  const boostedMinScale = baseMinScale
    + (closeRangeCombatMinScale > 0 ? Math.max(0, closeRangeCombatMinScale - baseMinScale) : 0)
    + (shouldUseAttackLocalBoost ? AI_ATTACK_SOFT_MIN_BOOST : 0)
    + attackMidLongBoost;
  const shouldUseAttackFloorGuard = isAttackIntentContext
    && !isDefenseContext
    && !isIntentionalShortControl;
  const guardedMinScale = shouldUseAttackFloorGuard
    ? Math.max(boostedMinScale, AI_ATTACK_SCALE_GUARD_FLOOR)
    : boostedMinScale;
  const minScale = Math.max(0, Math.min(1, guardedMinScale));
  const adjustedScale = Math.max(scale, minScale);
  if(adjustedScale > scale){
    if(shouldUseAttackFloorGuard && minScale >= AI_ATTACK_SCALE_GUARD_FLOOR){
      logAiDecision("ai_attack_floor_scale_guard_applied", {
        oldScale: Number(scale.toFixed(3)),
        newScale: Number(adjustedScale.toFixed(3)),
        floorScale: Number(AI_ATTACK_SCALE_GUARD_FLOOR.toFixed(3)),
        boostedMinScaleBeforeGuard: Number(boostedMinScale.toFixed(3)),
        moveDistance: Number.isFinite(moveDistance) ? Number(moveDistance.toFixed(2)) : null,
        moveDistanceRatio: Number.isFinite(moveDistanceRatio) ? Number(moveDistanceRatio.toFixed(3)) : null,
        isDefenseContext,
        isDefensiveGoalContext,
        isIntentionalShortControl,
        ...details,
      });
    }
    if(shouldUseAttackLocalBoost){
      logAiDecision("ai_attack_soft_min_launch_scale_applied", {
        oldScale: Number(scale.toFixed(3)),
        newScale: Number(adjustedScale.toFixed(3)),
        baseMinScale: Number(baseMinScale.toFixed(3)),
        boostedMinScale: Number(minScale.toFixed(3)),
        moveDistance: Number.isFinite(moveDistance) ? Number(moveDistance.toFixed(2)) : null,
        moveDistanceRatio: Number.isFinite(moveDistanceRatio) ? Number(moveDistanceRatio.toFixed(3)) : null,
        targetNearEnemyBase,
        isDirectFinisherGoal,
        ...details,
      });
    }
    if(shouldUseCloseRangeCombatMinScale && minScale >= AI_ATTACK_CLOSE_RANGE_SAFE_MIN_SCALE){
      logAiDecision("ai_close_range_min_scale_applied", {
        oldScale: Number(scale.toFixed(3)),
        newScale: Number(adjustedScale.toFixed(3)),
        closeRangeSafeMinScale: Number(AI_ATTACK_CLOSE_RANGE_SAFE_MIN_SCALE.toFixed(3)),
        closeRangeDistanceRatioMax: Number(AI_ATTACK_CLOSE_RANGE_DISTANCE_RATIO_MAX.toFixed(3)),
        moveDistance: Number.isFinite(moveDistance) ? Number(moveDistance.toFixed(2)) : null,
        moveDistanceRatio: Number.isFinite(moveDistanceRatio) ? Number(moveDistanceRatio.toFixed(3)) : null,
        hasDirectLineOfSight,
        isCombatGoalContext,
        isDefenseContext,
        isDefensiveGoalContext,
        isIntentionalShortControl,
        ...details,
      });
    }
    if(attackMidLongBoost > 0){
      logAiDecision("ai_attack_mid_long_soft_min_launch_scale_applied", {
        oldScale: Number(scale.toFixed(3)),
        newScale: Number(adjustedScale.toFixed(3)),
        baseMinScale: Number(baseMinScale.toFixed(3)),
        midLongBoost: Number(attackMidLongBoost.toFixed(3)),
        midLongBoostCap: Number(AI_ATTACK_MID_LONG_MIN_BOOST_MAX.toFixed(3)),
        moveDistance: Number.isFinite(moveDistance) ? Number(moveDistance.toFixed(2)) : null,
        moveDistanceRatio: Number.isFinite(moveDistanceRatio) ? Number(moveDistanceRatio.toFixed(3)) : null,
        moveDistanceRatioStart: Number(AI_ATTACK_MID_LONG_DISTANCE_RATIO_START.toFixed(3)),
        moveDistanceRatioFull: Number(AI_ATTACK_MID_LONG_DISTANCE_RATIO_FULL.toFixed(3)),
        ...details,
      });
    }
    logAiDecision("ai_min_launch_scale_applied", {
      oldScale: Number(scale.toFixed(3)),
      newScale: Number(adjustedScale.toFixed(3)),
      minScale: Number(minScale.toFixed(3)),
      contextType: shouldUseAttackLocalBoost
        ? "attack_soft_local"
        : (shouldUseCloseRangeCombatMinScale ? "attack_close_range_safe_min" : (attackMidLongBoost > 0 ? "attack_mid_long_soft" : "default")),
      moveDistance: Number.isFinite(moveDistance) ? Number(moveDistance.toFixed(2)) : null,
      moveDistanceRatio: Number.isFinite(moveDistanceRatio) ? Number(moveDistanceRatio.toFixed(3)) : null,
      targetNearEnemyBase,
      isDirectFinisherGoal,
      localBoostApplied: shouldUseAttackLocalBoost,
      closeRangeCombatMinApplied: shouldUseCloseRangeCombatMinScale,
      midLongBoostApplied: attackMidLongBoost > 0,
      attackMidLongBoost: Number(attackMidLongBoost.toFixed(3)),
      attackFloorGuardApplied: shouldUseAttackFloorGuard && minScale >= AI_ATTACK_SCALE_GUARD_FLOOR,
      attackFloorGuardScale: Number(AI_ATTACK_SCALE_GUARD_FLOOR.toFixed(3)),
      intentionalShortControl: isIntentionalShortControl,
      ...details,
    });
  }
  return adjustedScale;
}

function createInitialAiRoundState(){
  return {
    mode: AI_MODES.ATTRITION,
    turnNumber: 0,
    targetPriorities: [],
    currentGoal: null,
    inventoryIdleTurns: 0,
    inventorySoftFallbackCooldown: 0,
    lastInventorySoftFallbackUsed: false,
    lastLaunchedPlaneId: null,
    consecutiveSamePlaneLaunches: 0,
    consecutiveLongLaunches: 0,
    lastLaunchTurnByPlaneId: {},
    recentLaunchPlaneIds: [],
    recentLaunchAnglesDeg: [],
    angleRepeatStreakCount: 0,
    planeIdleTurnsById: {},
    stuckByPlaneId: {},
    dynamiteIntent: null,
    tieBreakerSeed: 0,
    openingTemplateSuppressed: false,
    lastOpeningNonTrivialStartMeta: null,
  };
}

function evaluateOpeningNonTrivialStartMeta(context){
  const goalText = `${context?.goalName || aiRoundState?.currentGoal || ""}`.toLowerCase();
  const protectedCriticalBranch = goalText.includes("critical_base_threat") || goalText.includes("emergency_base_defense");
  if(protectedCriticalBranch){
    return {
      suppressTemplate: false,
      protectedCriticalBranch: true,
      hasGapTraversal: false,
      hasSingleBounceRicochet: false,
      hasSafeCenterRoute: false,
      inspectedPlanes: 0,
      inspectedTargets: 0,
      reason: "critical_branch_guard",
    };
  }

  if(turnAdvanceCount > AI_REPEAT_OPENING_FORCE_TURN_LIMIT){
    return {
      suppressTemplate: false,
      protectedCriticalBranch: false,
      hasGapTraversal: false,
      hasSingleBounceRicochet: false,
      hasSafeCenterRoute: false,
      inspectedPlanes: 0,
      inspectedTargets: 0,
      reason: "outside_opening_repeat_window",
    };
  }

  const groundedPlanes = getGroundedAiPlanes(context?.aiPlanes);
  const targets = [];
  const availableEnemyFlags = Array.isArray(context?.availableEnemyFlags) ? context.availableEnemyFlags : [];
  for(const flag of availableEnemyFlags){
    const anchor = getFlagAnchor(flag);
    if(Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y)){
      targets.push({ x: anchor.x, y: anchor.y, id: flag?.id || null });
    }
  }
  if(targets.length === 0 && Array.isArray(context?.enemies)){
    for(const enemy of context.enemies){
      if(enemy?.isAlive && Number.isFinite(enemy?.x) && Number.isFinite(enemy?.y)){
        targets.push({ x: enemy.x, y: enemy.y, id: enemy?.id || null });
      }
    }
  }

  const centerAnchor = getCenterControlAnchor();
  let hasGapTraversal = false;
  let hasSingleBounceRicochet = false;
  let hasSafeCenterRoute = false;

  for(const plane of groundedPlanes){
    if(!plane) continue;

    if(Number.isFinite(centerAnchor?.x) && Number.isFinite(centerAnchor?.y)){
      const centerMove = planPathToPoint(plane, centerAnchor.x, centerAnchor.y, {
        goalName: "opening_non_trivial_probe_center",
        decisionReason: "opening_non_trivial_probe_center",
      });
      if(centerMove){
        const landing = getAiMoveLandingPoint({ plane, ...centerMove });
        const centerThreatMeta = landing
          ? getImmediateResponseThreatMeta(context, landing.x, landing.y)
          : { count: Number.POSITIVE_INFINITY };
        if((centerThreatMeta?.count || 0) === 0){
          hasSafeCenterRoute = true;
        }
      }
    }

    if(hasGapTraversal && hasSingleBounceRicochet && hasSafeCenterRoute) break;

    for(const target of targets){
      if(!hasGapTraversal){
        const gapMove = planPathToPoint(plane, target.x, target.y, {
          goalName: "opening_non_trivial_probe_gap",
          decisionReason: "opening_non_trivial_probe_gap",
          routeClass: "gap",
        });
        if(gapMove) hasGapTraversal = true;
      }
      if(!hasSingleBounceRicochet){
        const ricochetMove = planPathToPoint(plane, target.x, target.y, {
          goalName: "opening_non_trivial_probe_ricochet",
          decisionReason: "opening_non_trivial_probe_ricochet",
          routeClass: "ricochet",
        });
        if(ricochetMove) hasSingleBounceRicochet = true;
      }
      if(hasGapTraversal && hasSingleBounceRicochet && hasSafeCenterRoute) break;
    }
  }

  const suppressTemplate = hasGapTraversal || hasSingleBounceRicochet || hasSafeCenterRoute;
  return {
    suppressTemplate,
    protectedCriticalBranch: false,
    hasGapTraversal,
    hasSingleBounceRicochet,
    hasSafeCenterRoute,
    inspectedPlanes: groundedPlanes.length,
    inspectedTargets: targets.length,
    reason: suppressTemplate ? "non_trivial_opening_available" : "non_trivial_opening_not_found",
  };
}

const AI_STUCK_ATTEMPT_HISTORY_LIMIT = 3;
const AI_STUCK_BLOCKED_STREAK_THRESHOLD = 2;
const AI_STUCK_DIRECTION_SECTOR_STEP_DEG = 45;
const AI_STUCK_REPEAT_SECTOR_SCORE_PENALTY = CELL_SIZE * 0.35;

function getAiDirectionSectorDeg(angleRad){
  if(!Number.isFinite(angleRad)) return null;
  const angleDeg = normalizeAngleDeg(angleRad * 180 / Math.PI);
  const step = Math.max(1, AI_STUCK_DIRECTION_SECTOR_STEP_DEG);
  return normalizeAngleDeg(Math.round(angleDeg / step) * step);
}

function getAiStuckStateForPlane(planeId){
  if(!planeId || !aiRoundState || typeof aiRoundState !== "object") return null;
  if(!aiRoundState.stuckByPlaneId || typeof aiRoundState.stuckByPlaneId !== "object"){
    aiRoundState.stuckByPlaneId = {};
  }
  if(!aiRoundState.stuckByPlaneId[planeId] || typeof aiRoundState.stuckByPlaneId[planeId] !== "object"){
    aiRoundState.stuckByPlaneId[planeId] = {
      attempts: [],
      pathBlockedStreak: 0,
      isStuck: false,
      currentTurnNumber: null,
      currentTurnSectorCounts: {},
      lastSector: null,
      lastProgress: 0,
      lastNoticeableProgress: false,
    };
  }
  return aiRoundState.stuckByPlaneId[planeId];
}

function updateAiStuckAttempt(plane, details = {}){
  const planeId = plane?.id;
  if(!planeId) return null;
  const planeStuckState = getAiStuckStateForPlane(planeId);
  if(!planeStuckState) return null;

  const progressMeta = details?.progressMeta || getAiNoticeableProgressMeta(plane.x, plane.y, plane.x, plane.y, plane.x, plane.y);
  const progress = Number.isFinite(progressMeta?.improvement) ? progressMeta.improvement : 0;
  const hasNoticeableProgress = Boolean(progressMeta?.hasNoticeableProgress);
  const sector = Number.isFinite(details?.sector) ? details.sector : null;
  const pathBlocked = Boolean(details?.pathBlocked);
  const turn = Number.isFinite(aiRoundState?.turnNumber) ? aiRoundState.turnNumber : null;

  planeStuckState.attempts.push({
    turn,
    pathBlocked,
    progress,
    hasNoticeableProgress,
    sector,
  });
  if(planeStuckState.attempts.length > AI_STUCK_ATTEMPT_HISTORY_LIMIT){
    planeStuckState.attempts.splice(0, planeStuckState.attempts.length - AI_STUCK_ATTEMPT_HISTORY_LIMIT);
  }

  let blockedStreak = 0;
  for(let i = planeStuckState.attempts.length - 1; i >= 0; i -= 1){
    const attempt = planeStuckState.attempts[i];
    if(attempt?.pathBlocked && !attempt?.hasNoticeableProgress){
      blockedStreak += 1;
      continue;
    }
    break;
  }

  const wasStuck = planeStuckState.isStuck;
  planeStuckState.pathBlockedStreak = blockedStreak;
  planeStuckState.isStuck = blockedStreak >= AI_STUCK_BLOCKED_STREAK_THRESHOLD;
  planeStuckState.lastSector = sector;
  planeStuckState.lastProgress = progress;
  planeStuckState.lastNoticeableProgress = hasNoticeableProgress;

  if(planeStuckState.isStuck && !wasStuck){
    logAiDecision("ai_stuck_detected", {
      planeId,
      streak: blockedStreak,
      sector,
      progress: Number(progress.toFixed(2)),
    });
  }

  return planeStuckState;
}

function getAiStuckRepeatSectorPenalty(plane, sector){
  const planeId = plane?.id;
  if(!planeId || !Number.isFinite(sector)) return 0;
  const planeStuckState = getAiStuckStateForPlane(planeId);
  if(!planeStuckState?.isStuck) return 0;

  const currentTurn = Number.isFinite(aiRoundState?.turnNumber) ? aiRoundState.turnNumber : null;
  if(planeStuckState.currentTurnNumber !== currentTurn){
    planeStuckState.currentTurnNumber = currentTurn;
    planeStuckState.currentTurnSectorCounts = {};
  }

  const repeatedCount = Number.isFinite(planeStuckState.currentTurnSectorCounts[sector])
    ? planeStuckState.currentTurnSectorCounts[sector]
    : 0;
  if(repeatedCount <= 0) return 0;
  return AI_STUCK_REPEAT_SECTOR_SCORE_PENALTY * repeatedCount;
}

function markAiStuckSectorUsed(plane, sector){
  const planeId = plane?.id;
  if(!planeId || !Number.isFinite(sector)) return;
  const planeStuckState = getAiStuckStateForPlane(planeId);
  if(!planeStuckState) return;

  const currentTurn = Number.isFinite(aiRoundState?.turnNumber) ? aiRoundState.turnNumber : null;
  if(planeStuckState.currentTurnNumber !== currentTurn){
    planeStuckState.currentTurnNumber = currentTurn;
    planeStuckState.currentTurnSectorCounts = {};
  }

  const prevCount = Number.isFinite(planeStuckState.currentTurnSectorCounts[sector])
    ? planeStuckState.currentTurnSectorCounts[sector]
    : 0;
  planeStuckState.currentTurnSectorCounts[sector] = prevCount + 1;
}

const AI_DYNAMITE_INTENT_SCORE_BONUS = 0.94;
const AI_DYNAMITE_INTENT_LINE_TOLERANCE = CELL_SIZE * 0.9;
const AI_MULTI_KILL_PRIMARY_BONUS = CELL_SIZE * 0.55;
const AI_MULTI_KILL_TIE_BREAK_BONUS = CELL_SIZE * 0.08;
const AI_MULTI_KILL_LINE_TOLERANCE = CELL_SIZE * 0.75;
const AI_MULTI_KILL_CONTACT_TOLERANCE = CELL_SIZE * 1.1;

function clearAiDynamiteIntent(reason = "cleared"){
  if(!aiRoundState?.dynamiteIntent) return;
  const previousIntent = aiRoundState.dynamiteIntent;
  aiRoundState.dynamiteIntent = null;
  if(reason === "expired"){
    logAiDecision("dynamite_intent_expired", {
      reason: "turn_window_elapsed",
      colliderId: previousIntent?.colliderId ?? null,
      targetX: Number.isFinite(previousIntent?.x) ? Number(previousIntent.x.toFixed(1)) : null,
      targetY: Number.isFinite(previousIntent?.y) ? Number(previousIntent.y.toFixed(1)) : null,
      expiresTurn: previousIntent?.expiresTurn ?? null,
      turn: aiRoundState?.turnNumber ?? null,
    });
  }
}

function getDistanceFromPointToSegment(pointX, pointY, x1, y1, x2, y2){
  if(![pointX, pointY, x1, y1, x2, y2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const segmentDx = x2 - x1;
  const segmentDy = y2 - y1;
  const segmentLenSq = segmentDx * segmentDx + segmentDy * segmentDy;
  if(segmentLenSq <= 0) return Math.hypot(pointX - x1, pointY - y1);
  const projection = ((pointX - x1) * segmentDx + (pointY - y1) * segmentDy) / segmentLenSq;
  const clampedProjection = Math.max(0, Math.min(1, projection));
  const closestX = x1 + segmentDx * clampedProjection;
  const closestY = y1 + segmentDy * clampedProjection;
  return Math.hypot(pointX - closestX, pointY - closestY);
}

function getAiMultiKillPotentialContext({ plane, enemy, enemies, lineEndX, lineEndY }){
  if(!plane || !enemy || !Array.isArray(enemies)){
    return {
      multiKillPotential: 0,
      secondaryEnemyId: null,
      lineDistance: null,
      contactDistance: null,
    };
  }
  if(![plane.x, plane.y, enemy.x, enemy.y, lineEndX, lineEndY].every(Number.isFinite)){
    return {
      multiKillPotential: 0,
      secondaryEnemyId: null,
      lineDistance: null,
      contactDistance: null,
    };
  }

  let secondaryEnemy = null;
  let bestLineDistance = Number.POSITIVE_INFINITY;
  let bestContactDistance = Number.POSITIVE_INFINITY;
  for(const otherEnemy of enemies){
    if(!otherEnemy || otherEnemy === enemy) continue;
    if(!Number.isFinite(otherEnemy.x) || !Number.isFinite(otherEnemy.y)) continue;
    const lineDistance = getDistanceFromPointToSegment(
      otherEnemy.x,
      otherEnemy.y,
      plane.x,
      plane.y,
      lineEndX,
      lineEndY
    );
    const contactDistance = Math.hypot(otherEnemy.x - enemy.x, otherEnemy.y - enemy.y);
    const onAttackLane = lineDistance <= AI_MULTI_KILL_LINE_TOLERANCE;
    const nearContactPoint = contactDistance <= AI_MULTI_KILL_CONTACT_TOLERANCE;
    if(!onAttackLane && !nearContactPoint) continue;

    if(lineDistance < bestLineDistance || (Math.abs(lineDistance - bestLineDistance) < 0.0001 && contactDistance < bestContactDistance)){
      secondaryEnemy = otherEnemy;
      bestLineDistance = lineDistance;
      bestContactDistance = contactDistance;
    }
  }

  return {
    multiKillPotential: secondaryEnemy ? 1 : 0,
    secondaryEnemyId: secondaryEnemy?.id ?? null,
    lineDistance: Number.isFinite(bestLineDistance) ? bestLineDistance : null,
    contactDistance: Number.isFinite(bestContactDistance) ? bestContactDistance : null,
  };
}

function getAiDynamiteIntentScoreAdjustment(score, move, context = {}){
  const baseScore = Number.isFinite(score) ? score : 0;
  const intent = aiRoundState?.dynamiteIntent;
  if(!intent || !Number.isFinite(intent?.expiresTurn)) return { score: baseScore, usedIntent: false, bonusApplied: false };
  if(!Number.isFinite(aiRoundState?.turnNumber) || aiRoundState.turnNumber > intent.expiresTurn){
    return { score: baseScore, usedIntent: false, bonusApplied: false };
  }

  const plane = move?.plane || context?.plane;
  if(!plane || !Number.isFinite(plane.x) || !Number.isFinite(plane.y)) return { score: baseScore, usedIntent: false, bonusApplied: false };

  const landingPoint = getAiMoveLandingPoint(move);
  const targetX = Number.isFinite(landingPoint?.x) ? landingPoint.x : null;
  const targetY = Number.isFinite(landingPoint?.y) ? landingPoint.y : null;
  if(!Number.isFinite(targetX) || !Number.isFinite(targetY)) return { score: baseScore, usedIntent: false, bonusApplied: false };

  const distanceToIntentLane = getDistanceFromPointToSegment(intent.x, intent.y, plane.x, plane.y, targetX, targetY);
  const usesIntentLane = distanceToIntentLane <= AI_DYNAMITE_INTENT_LINE_TOLERANCE;
  if(!usesIntentLane){
    return { score: baseScore, usedIntent: false, bonusApplied: false };
  }

  return {
    score: baseScore * AI_DYNAMITE_INTENT_SCORE_BONUS,
    usedIntent: true,
    bonusApplied: true,
  };
}

function consumeAiDynamiteIntentIfUsed(plannedMove){
  const intent = aiRoundState?.dynamiteIntent;
  if(!intent) return false;
  const usageCheck = getAiDynamiteIntentScoreAdjustment(1, plannedMove, { plane: plannedMove?.plane });
  if(!usageCheck.usedIntent) return false;
  logAiDecision("dynamite_intent_used", {
    planeId: plannedMove?.plane?.id ?? null,
    colliderId: intent?.colliderId ?? null,
    targetX: Number.isFinite(intent?.x) ? Number(intent.x.toFixed(1)) : null,
    targetY: Number.isFinite(intent?.y) ? Number(intent.y.toFixed(1)) : null,
    turn: aiRoundState?.turnNumber ?? null,
  });
  clearAiDynamiteIntent("used");
  return true;
}

function expireAiDynamiteIntentIfNeeded(){
  const intent = aiRoundState?.dynamiteIntent;
  if(!intent || !Number.isFinite(intent?.expiresTurn)) return;
  if(!Number.isFinite(aiRoundState?.turnNumber)) return;
  if(aiRoundState.turnNumber > intent.expiresTurn){
    clearAiDynamiteIntent("expired");
  }
}

function normalizeAngleDeg(angleDeg){
  if(!Number.isFinite(angleDeg)) return 0;
  const normalized = angleDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function getAngleDeltaDeg(aDeg, bDeg){
  if(!Number.isFinite(aDeg) || !Number.isFinite(bDeg)) return 180;
  const direct = Math.abs(normalizeAngleDeg(aDeg) - normalizeAngleDeg(bDeg));
  return Math.min(direct, 360 - direct);
}

function getAiRecentAngleSpreadMeta(historyAnglesDeg){
  const normalizedHistory = Array.isArray(historyAnglesDeg)
    ? historyAnglesDeg
      .filter((angle) => Number.isFinite(angle))
      .map((angle) => normalizeAngleDeg(angle))
    : [];
  if(normalizedHistory.length < 2){
    return {
      clustered: false,
      spreadDeg: null,
      baselineDeg: null,
      sampleCount: normalizedHistory.length,
    };
  }

  const baselineDeg = normalizedHistory[normalizedHistory.length - 1];
  const deltas = normalizedHistory.map((angle) => getAngleDeltaDeg(angle, baselineDeg));
  const spreadDeg = Math.max(...deltas);
  return {
    clustered: spreadDeg <= AI_ANGLE_REPEAT_TIGHT_SPREAD_DEG,
    spreadDeg,
    baselineDeg,
    sampleCount: normalizedHistory.length,
  };
}

function applyAiAntiRepeatAngleGuard(baseAngleRad, options = {}){
  if(!Number.isFinite(baseAngleRad)){
    return {
      adjustedAngleRad: baseAngleRad,
      usedSafeFan: false,
      safeFanOffsetDeg: 0,
      spreadDeg: null,
      sampleCount: 0,
      repeatStreakCount: Number.isFinite(options?.repeatStreakCount) ? options.repeatStreakCount : 0,
    };
  }

  const repeatHistory = Array.isArray(options?.recentAnglesDeg)
    ? options.recentAnglesDeg
    : [];
  const spreadMeta = getAiRecentAngleSpreadMeta(repeatHistory);
  const repeatStreakCount = Number.isFinite(options?.repeatStreakCount)
    ? Math.max(0, options.repeatStreakCount)
    : 0;
  const shouldUseSafeFan = spreadMeta.clustered
    && (spreadMeta.sampleCount >= AI_ANGLE_REPEAT_HISTORY_LIMIT || repeatStreakCount >= AI_ANGLE_REPEAT_STREAK_ALERT_COUNT);

  if(!shouldUseSafeFan){
    return {
      adjustedAngleRad: baseAngleRad,
      usedSafeFan: false,
      safeFanOffsetDeg: 0,
      spreadDeg: Number.isFinite(spreadMeta.spreadDeg) ? spreadMeta.spreadDeg : null,
      sampleCount: spreadMeta.sampleCount,
      repeatStreakCount,
    };
  }

  const seedParts = Array.isArray(options?.seedParts) ? options.seedParts : [];
  const hashRatio = (getStableHashFromParts([...seedParts, "ai_angle_safe_fan_offset"]) / 0xffffffff);
  const offsetDeg = AI_ANGLE_SAFE_FAN_MIN_DEG
    + (AI_ANGLE_SAFE_FAN_MAX_DEG - AI_ANGLE_SAFE_FAN_MIN_DEG) * hashRatio;
  const direction = (getStableHashFromParts([...seedParts, "ai_angle_safe_fan_direction"]) % 2 === 0) ? -1 : 1;
  const adjustedAngleRad = baseAngleRad + direction * offsetDeg * (Math.PI / 180);

  return {
    adjustedAngleRad,
    usedSafeFan: true,
    safeFanOffsetDeg: direction * offsetDeg,
    spreadDeg: spreadMeta.spreadDeg,
    sampleCount: spreadMeta.sampleCount,
    repeatStreakCount,
  };
}

let aiRoundState = createInitialAiRoundState();

function getAiPlaneSelectionPenalty(plane){
  if(!plane || !aiRoundState?.lastLaunchedPlaneId) return 0;
  if(plane.id !== aiRoundState.lastLaunchedPlaneId) return 0;
  const streak = Math.max(1, Number(aiRoundState.consecutiveSamePlaneLaunches) || 1);
  return AI_REPEAT_PLANE_SOFT_PENALTY + Math.min(0.9, (streak - 1) * AI_REPEAT_PLANE_HARD_PENALTY);
}

function getAiPlaneRotationScoring(score, plane){
  const rawScore = Number.isFinite(score) ? score : 0;
  if(!plane?.id){
    return {
      rawScore,
      rotationBonus: 0,
      repeatPenalty: 0,
      streakPenalty: 0,
      repeatInWindow: 0,
      idleTurns: 0,
      finalMultiplier: 1,
      finalScore: rawScore,
    };
  }

  const historyWindow = Array.isArray(aiRoundState?.recentLaunchPlaneIds)
    ? aiRoundState.recentLaunchPlaneIds
    : [];
  const repeatInWindow = historyWindow.reduce((count, planeId) => (
    planeId === plane.id ? count + 1 : count
  ), 0);

  const idleTurnsMap = aiRoundState?.planeIdleTurnsById;
  const idleTurnsRaw = idleTurnsMap && Number.isFinite(idleTurnsMap[plane.id])
    ? idleTurnsMap[plane.id]
    : getAiPlaneIdleTurns(plane);
  const idleTurns = Math.max(0, idleTurnsRaw);

  const rotationBonus = Math.min(AI_ROTATION_BONUS_MAX, idleTurns * AI_ROTATION_BONUS_PER_IDLE_TURN);
  const repeatPenalty = repeatInWindow * AI_REPEAT_WINDOW_PENALTY_STEP;
  const streakPenalty = getAiPlaneSelectionPenalty(plane);
  const finalMultiplier = Math.max(0.35, 1 + repeatPenalty + streakPenalty - rotationBonus);

  return {
    rawScore,
    rotationBonus,
    repeatPenalty,
    streakPenalty,
    repeatInWindow,
    idleTurns,
    finalMultiplier,
    finalScore: rawScore * finalMultiplier,
  };
}

function scoreMoveForPlane(score, plane){
  return getAiPlaneRotationScoring(score, plane);
}

function getAiPlaneAdjustedScore(score, plane){
  if(!Number.isFinite(score)) return score;
  return scoreMoveForPlane(score, plane).finalScore;
}

function isOpeningAggressionBiasAllowed(context){
  if(turnAdvanceCount > AI_OPENING_AGGRESSION_BIAS_TURN_LIMIT) return false;
  const scoreLead = blueScore - greenScore;
  if(scoreLead > AI_OPENING_AGGRESSION_BIAS_MAX_LEAD) return false;
  if(context?.aiRiskProfile?.profile === "conservative") return false;
  return true;
}

function applyOpeningAggressionBias(score, details = {}){
  if(!Number.isFinite(score)) return { score, applied: false };
  const targetType = details?.targetType;
  if(!AI_OPENING_AGGRESSION_TARGETS.includes(targetType)) return { score, applied: false };
  if(!details?.hasValidPath) return { score, applied: false };

  const riskInfo = details?.riskInfo;
  if(riskInfo){
    if(!riskInfo.isSafePath) return { score, applied: false };
    if(Number.isFinite(riskInfo.totalRisk) && riskInfo.totalRisk > AI_CARGO_RISK_ACCEPTANCE) return { score, applied: false };
  }

  if(!isOpeningAggressionBiasAllowed(details?.context)) return { score, applied: false };

  const biasedScore = score * AI_OPENING_AGGRESSION_BIAS_DISCOUNT;
  logAiDecision("opening_aggression_bias_applied", {
    reason: "opening_aggression_bias_applied",
    targetType,
    planeId: details?.plane?.id ?? null,
    enemyId: details?.enemy?.id ?? null,
    turnAdvanceCount,
    scoreBefore: Number(score.toFixed(3)),
    scoreAfter: Number(biasedScore.toFixed(3)),
  });
  return {
    score: biasedScore,
    applied: true,
  };
}

function appendOpeningAggressionReasonCode(reasonCodes, move){
  if(!Array.isArray(reasonCodes)) return reasonCodes;
  if(!move?.openingAggressionBiasApplied) return reasonCodes;
  if(reasonCodes.includes("opening_aggression_bias_applied")) return reasonCodes;
  return [...reasonCodes, "opening_aggression_bias_applied"];
}

function appendBounceCandidateReasonCode(reasonCodes, move){
  if(!Array.isArray(reasonCodes)) return reasonCodes;
  if(!move?.bounceCandidateUsed) return reasonCodes;
  if(reasonCodes.includes("bounce_candidate_used")) return reasonCodes;
  return [...reasonCodes, "bounce_candidate_used"];
}

function getStableHashFromParts(parts){
  const source = Array.isArray(parts) ? parts.join("|") : String(parts ?? "");
  let hash = 0;
  for(let i = 0; i < source.length; i += 1){
    hash = (hash * 31 + source.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getAiPlaneIdleTurns(plane){
  if(!plane?.id) return 0;
  const history = aiRoundState?.lastLaunchTurnByPlaneId;
  const turnNumber = Number.isFinite(aiRoundState?.turnNumber) ? aiRoundState.turnNumber : 0;
  if(!history || typeof history !== "object") return turnNumber + 1;
  const lastLaunchTurn = history[plane.id];
  if(!Number.isFinite(lastLaunchTurn)) return turnNumber + 1;
  return Math.max(0, turnNumber - lastLaunchTurn);
}

function updateAiPlaneIdleCounters(aiPlanes){
  if(!aiRoundState || typeof aiRoundState !== "object") return;
  if(!aiRoundState.planeIdleTurnsById || typeof aiRoundState.planeIdleTurnsById !== "object"){
    aiRoundState.planeIdleTurnsById = {};
  }

  const idleMap = aiRoundState.planeIdleTurnsById;
  if(!Array.isArray(aiPlanes)) return;

  for(const plane of aiPlanes){
    if(!plane?.id) continue;
    const currentValue = Number.isFinite(idleMap[plane.id]) ? idleMap[plane.id] : 0;
    idleMap[plane.id] = Math.max(0, currentValue + 1);
  }
}

function compareAiCandidateByScoreAndRotation(nextCandidate, currentCandidate, tieSeedParts = []){
  if(!nextCandidate) return false;
  if(!currentCandidate) return true;
  compareAiCandidateByScoreAndRotation.lastClassTieBreakReason = null;

  const epsilon = 0.0001;
  const nextPlaneId = nextCandidate?.plane?.id ?? null;
  const currentPlaneId = currentCandidate?.plane?.id ?? null;
  const repeatedPlaneId = aiRoundState?.lastLaunchedPlaneId ?? null;
  const scoreGap = Math.abs((nextCandidate.score ?? Number.POSITIVE_INFINITY) - (currentCandidate.score ?? Number.POSITIVE_INFINITY));

  const nextIsAttackingCandidate = Boolean(nextCandidate?.enemy) || nextCandidate?.targetType === "attack_enemy_plane";
  const currentIsAttackingCandidate = Boolean(currentCandidate?.enemy) || currentCandidate?.targetType === "attack_enemy_plane";
  const shouldBypassRotationForTacticalPriority = nextIsAttackingCandidate
    && currentIsAttackingCandidate
    && Number.isFinite(scoreGap)
    && scoreGap > AI_ROTATION_TACTICAL_PRIORITY_GAP;

  if(shouldBypassRotationForTacticalPriority){
    const tacticalPriorityReason = (nextCandidate.score ?? Number.POSITIVE_INFINITY) < (currentCandidate.score ?? Number.POSITIVE_INFINITY)
      ? "next_candidate_has_clear_tactical_advantage"
      : "current_candidate_has_clear_tactical_advantage";
    logAiDecision("rotation_tactical_priority_bypass", {
      rotationBypassed: true,
      scoreGap: Number(scoreGap.toFixed(3)),
      tacticalPriorityReason,
      threshold: Number(AI_ROTATION_TACTICAL_PRIORITY_GAP.toFixed(3)),
      nextPlaneId,
      currentPlaneId,
      nextScore: Number.isFinite(nextCandidate?.score) ? Number(nextCandidate.score.toFixed(3)) : null,
      currentScore: Number.isFinite(currentCandidate?.score) ? Number(currentCandidate.score.toFixed(3)) : null,
      tieSeedParts,
    });
  }

  const openingTemplateSuppressed = Boolean(aiRoundState?.openingTemplateSuppressed);
  if(!shouldBypassRotationForTacticalPriority && nextPlaneId && currentPlaneId && repeatedPlaneId && nextPlaneId !== currentPlaneId){
    const nextIsRepeat = nextPlaneId === repeatedPlaneId;
    const currentIsRepeat = currentPlaneId === repeatedPlaneId;

    if(nextIsRepeat !== currentIsRepeat){
      const repeatedCandidate = nextIsRepeat ? nextCandidate : currentCandidate;
      const isRepeatedCandidateCritical = isAiRepeatPlaneCriticalCandidate(repeatedCandidate);

      if(
        Number.isFinite(aiRoundState?.turnNumber)
        && aiRoundState.turnNumber <= AI_REPEAT_OPENING_FORCE_TURN_LIMIT
        && !isRepeatedCandidateCritical
        && !openingTemplateSuppressed
      ){
        return !nextIsRepeat;
      }

      if(scoreGap <= AI_REPEAT_FORCE_SCORE_MARGIN && !isRepeatedCandidateCritical && !openingTemplateSuppressed){
        return !nextIsRepeat;
      }
    }
  }

  const nextNormalizedScore = nextCandidate?.normalizedScore;
  const currentNormalizedScore = currentCandidate?.normalizedScore;
  const nextClass = getAiCandidateClassLabel(nextCandidate);
  const currentClass = getAiCandidateClassLabel(currentCandidate);
  const sameEnemyId = (nextCandidate?.enemy?.id ?? null) && (nextCandidate?.enemy?.id === currentCandidate?.enemy?.id);
  const differentTrajectoryType = nextCandidate?.trajectoryType && currentCandidate?.trajectoryType
    && nextCandidate.trajectoryType !== currentCandidate.trajectoryType;
  if(
    Number.isFinite(nextNormalizedScore)
    && Number.isFinite(currentNormalizedScore)
    && sameEnemyId
    && differentTrajectoryType
  ){
    const normalizedGap = Math.abs(nextNormalizedScore - currentNormalizedScore);
    if(normalizedGap <= AI_FALLBACK_ATTACK_SCORE_TIE_EPSILON){
      const nextResponseRisk = Number.isFinite(nextCandidate?.responseRisk) ? nextCandidate.responseRisk : Number.POSITIVE_INFINITY;
      const currentResponseRisk = Number.isFinite(currentCandidate?.responseRisk) ? currentCandidate.responseRisk : Number.POSITIVE_INFINITY;
      if(nextResponseRisk + epsilon < currentResponseRisk) return true;
      if(nextResponseRisk > currentResponseRisk + epsilon) return false;
    }
  }

  const isCrossClassTie = Number.isFinite(nextNormalizedScore)
    && Number.isFinite(currentNormalizedScore)
    && Math.abs(nextNormalizedScore - currentNormalizedScore) <= AI_CLASS_SCORE_TIE_EPSILON;
  if(isCrossClassTie){
    const nextSolvesWallBlock = nextCandidate?.reasonCode === "wall_locked_target_prefers_ricochet"
      || nextCandidate?.classScoreBreakdown?.denseGeometry === true;
    const currentSolvesWallBlock = currentCandidate?.reasonCode === "wall_locked_target_prefers_ricochet"
      || currentCandidate?.classScoreBreakdown?.denseGeometry === true;
    if(nextSolvesWallBlock !== currentSolvesWallBlock){
      compareAiCandidateByScoreAndRotation.lastClassTieBreakReason = nextSolvesWallBlock
        ? "wall_block_resolved_by_next_candidate"
        : "wall_block_resolved_by_current_candidate";
      return nextSolvesWallBlock;
    }

    const classPriority = {
      ricochet: 3,
      gap: 2,
      direct: 1,
    };
    const nextPriority = classPriority[nextClass] || 0;
    const currentPriority = classPriority[currentClass] || 0;
    if(nextPriority !== currentPriority){
      compareAiCandidateByScoreAndRotation.lastClassTieBreakReason = "cross_class_priority_in_dense_geometry";
      return nextPriority > currentPriority;
    }
  }

  if((nextCandidate.score ?? Number.POSITIVE_INFINITY) < (currentCandidate.score ?? Number.POSITIVE_INFINITY) - epsilon){
    return true;
  }
  if((nextCandidate.score ?? Number.POSITIVE_INFINITY) > (currentCandidate.score ?? Number.POSITIVE_INFINITY) + epsilon){
    return false;
  }

  const nextRouteQuality = Number.isFinite(nextCandidate?.routeQualityScore)
    ? nextCandidate.routeQualityScore
    : (Number.isFinite(nextCandidate?.routeMetrics?.qualityScore) ? nextCandidate.routeMetrics.qualityScore : null);
  const currentRouteQuality = Number.isFinite(currentCandidate?.routeQualityScore)
    ? currentCandidate.routeQualityScore
    : (Number.isFinite(currentCandidate?.routeMetrics?.qualityScore) ? currentCandidate.routeMetrics.qualityScore : null);
  if(Number.isFinite(nextRouteQuality) && Number.isFinite(currentRouteQuality) && Math.abs(nextRouteQuality - currentRouteQuality) > 0.0001){
    compareAiCandidateByScoreAndRotation.lastClassTieBreakReason = "route_quality_priority";
    return nextRouteQuality > currentRouteQuality;
  }

  const nextRotationMeta = scoreMoveForPlane(1, nextCandidate.plane);
  const currentRotationMeta = scoreMoveForPlane(1, currentCandidate.plane);
  const nextIdleTurns = nextCandidate.idleTurns ?? nextRotationMeta.idleTurns ?? 0;
  const currentIdleTurns = currentCandidate.idleTurns ?? currentRotationMeta.idleTurns ?? 0;

  const idleDiff = nextIdleTurns - currentIdleTurns;
  if(Math.abs(idleDiff) > 0){
    return idleDiff > 0;
  }

  const repeatDiff = (nextCandidate.repeatInWindow ?? nextRotationMeta.repeatInWindow ?? 0)
    - (currentCandidate.repeatInWindow ?? currentRotationMeta.repeatInWindow ?? 0);
  if(Math.abs(repeatDiff) > 0){
    return repeatDiff < 0;
  }

  const rotationBonusDiff = (nextCandidate.rotationBonus ?? nextRotationMeta.rotationBonus ?? 0)
    - (currentCandidate.rotationBonus ?? currentRotationMeta.rotationBonus ?? 0);
  if(Math.abs(rotationBonusDiff) > epsilon){
    return rotationBonusDiff > 0;
  }

  const canUseOpeningSoftRandom = Number.isFinite(aiRoundState?.turnNumber)
    && aiRoundState.turnNumber <= AI_OPENING_SOFT_RANDOM_TURN_LIMIT
    && Number.isFinite(scoreGap)
    && scoreGap <= AI_OPENING_SOFT_RANDOM_SCORE_MARGIN;

  if(canUseOpeningSoftRandom){
    const seedPrefix = [
      "opening_soft_random",
      Number.isFinite(aiRoundState?.turnNumber) ? aiRoundState.turnNumber : 0,
      aiRoundState?.tieBreakerSeed ?? 0,
      ...tieSeedParts,
    ];
    const nextNoise = (getStableHashFromParts([...seedPrefix, nextCandidate.plane?.id ?? "", nextCandidate.enemy?.id ?? "", "noise"])
      / 0xffffffff) * AI_OPENING_SOFT_RANDOM_MAX_SHIFT;
    const currentNoise = (getStableHashFromParts([...seedPrefix, currentCandidate.plane?.id ?? "", currentCandidate.enemy?.id ?? "", "noise"])
      / 0xffffffff) * AI_OPENING_SOFT_RANDOM_MAX_SHIFT;
    if(Math.abs(nextNoise - currentNoise) > epsilon){
      return nextNoise < currentNoise;
    }
  }

  const seedPrefix = [
    Number.isFinite(aiRoundState?.turnNumber) ? aiRoundState.turnNumber : 0,
    aiRoundState?.tieBreakerSeed ?? 0,
    ...tieSeedParts,
  ];
  const nextTieHash = getStableHashFromParts([...seedPrefix, nextCandidate.plane?.id ?? "", nextCandidate.enemy?.id ?? ""]);
  const currentTieHash = getStableHashFromParts([...seedPrefix, currentCandidate.plane?.id ?? "", currentCandidate.enemy?.id ?? ""]);
  if(nextTieHash !== currentTieHash){
    return nextTieHash < currentTieHash;
  }

  return false;
}

function isAiRepeatPlaneCriticalCandidate(candidate){
  if(!candidate || typeof candidate !== "object") return false;
  const reasonParts = [candidate.decisionReason, candidate.goalName]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());
  if(reasonParts.length === 0) return false;

  if(reasonParts.some((value) => AI_REPEAT_ALLOWED_REASON_CODES.includes(value))){
    return true;
  }

  const rawReason = reasonParts
    .join(" ")
    .toLowerCase();
  if(!rawReason) return false;

  const reasonTokens = rawReason
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);

  return reasonTokens.some((token) => AI_REPEAT_ALLOWED_REASON_TOKENS.includes(token));
}

function rankAiPlanesForCurrentTurn(aiPlanes){
  if(!Array.isArray(aiPlanes) || aiPlanes.length <= 1) return aiPlanes;

  return [...aiPlanes].sort((a, b) => {
    const rankingScoreA = scoreMoveForPlane(1, a).finalScore;
    const rankingScoreB = scoreMoveForPlane(1, b).finalScore;
    if(Math.abs(rankingScoreA - rankingScoreB) > 0.0001){
      return rankingScoreA - rankingScoreB;
    }

    const scoreGap = Math.abs(rankingScoreA - rankingScoreB);
    const canUseOpeningSoftRandom = Number.isFinite(aiRoundState?.turnNumber)
      && aiRoundState.turnNumber <= AI_OPENING_SOFT_RANDOM_TURN_LIMIT
      && scoreGap <= AI_OPENING_SOFT_RANDOM_SCORE_MARGIN;

    if(canUseOpeningSoftRandom){
      const softRandomA = (getStableHashFromParts([
        "rank_opening_soft_random",
        aiRoundState?.turnNumber ?? 0,
        aiRoundState?.tieBreakerSeed ?? 0,
        a?.id ?? "",
      ]) / 0xffffffff) * AI_OPENING_SOFT_RANDOM_MAX_SHIFT;
      const softRandomB = (getStableHashFromParts([
        "rank_opening_soft_random",
        aiRoundState?.turnNumber ?? 0,
        aiRoundState?.tieBreakerSeed ?? 0,
        b?.id ?? "",
      ]) / 0xffffffff) * AI_OPENING_SOFT_RANDOM_MAX_SHIFT;
      if(Math.abs(softRandomA - softRandomB) > 0.0001){
        return softRandomA - softRandomB;
      }
    }

    const idleA = getAiPlaneIdleTurns(a);
    const idleB = getAiPlaneIdleTurns(b);
    if(idleA !== idleB){
      return idleB - idleA;
    }
    return getStableHashFromParts(["rank", aiRoundState?.turnNumber ?? 0, aiRoundState?.tieBreakerSeed ?? 0, a?.id ?? ""])
      - getStableHashFromParts(["rank", aiRoundState?.turnNumber ?? 0, aiRoundState?.tieBreakerSeed ?? 0, b?.id ?? ""]);
  });
}

function getAvailableInventoryCount(color){
  const items = inventoryState[color];
  if(!Array.isArray(items)) return 0;
  return items.length;
}

function evaluateBlueInventoryState(){
  const items = Array.isArray(inventoryState.blue) ? inventoryState.blue : [];
  const counts = {
    [INVENTORY_ITEM_TYPES.FUEL]: 0,
    [INVENTORY_ITEM_TYPES.CROSSHAIR]: 0,
    [INVENTORY_ITEM_TYPES.MINE]: 0,
    [INVENTORY_ITEM_TYPES.DYNAMITE]: 0,
    [INVENTORY_ITEM_TYPES.INVISIBILITY]: 0,
    [INVENTORY_ITEM_TYPES.WINGS]: 0,
  };

  for(const item of items){
    const type = item?.type;
    if(type in counts){
      counts[type] += 1;
    }
  }

  return {
    total: items.length,
    counts,
  };
}

function hasBlueDynamiteAvailable(){
  const inventory = evaluateBlueInventoryState();
  return (inventory?.counts?.[INVENTORY_ITEM_TYPES.DYNAMITE] || 0) > 0;
}

function findSafePreparationMoveForAttack(plane, enemy){
  if(!plane || !enemy) return null;

  const candidateAngles = [0, 25, -25, 50, -50, 75, -75, 100, -100, 135, -135, 160, -160, 180];
  const candidateRanges = [
    ATTACK_RANGE_PX * 0.72,
    ATTACK_RANGE_PX,
    ATTACK_RANGE_PX * 1.2,
    ATTACK_RANGE_PX * 1.45,
  ];
  let bestCandidate = null;

  for(const range of candidateRanges){
    for(const angleDeg of candidateAngles){
      const angle = Math.atan2(plane.y - enemy.y, plane.x - enemy.x) + (angleDeg * Math.PI / 180);
      const tx = enemy.x + Math.cos(angle) * range;
      const ty = enemy.y + Math.sin(angle) * range;
      if(!isPathClear(tx, ty, enemy.x, enemy.y)) continue;
      const move = planPathToPoint(plane, tx, ty);
      if(!move) continue;

      const score = move.totalDist + dist({x: tx, y: ty}, enemy) * 0.3;
      if(!bestCandidate || score < bestCandidate.score){
        bestCandidate = {
          move,
          score,
        };
      }
    }
  }

  return bestCandidate?.move || null;
}

function getFallbackDirectAttackQuality(plane, enemy, directDist, riskProfile = "balanced"){
  if(!plane || !enemy || !Number.isFinite(directDist) || directDist <= 0) return 0;
  const normalizedDistance = Math.min(1.4, directDist / Math.max(1, MAX_DRAG_DISTANCE));
  const distanceQuality = Math.max(0, 1 - normalizedDistance);
  const pathQuality = isPathClear(plane.x, plane.y, enemy.x, enemy.y) ? 1 : 0;
  const shieldQuality = enemy.shieldActive ? 0.65 : 1;
  const profileShift = riskProfile === "comeback"
    ? 0.07
    : riskProfile === "conservative"
      ? -0.08
      : 0;
  return Math.max(0, Math.min(1, (distanceQuality * 0.65 + pathQuality * 0.35) * shieldQuality + profileShift));
}

function getAiNoticeableProgressMeta(fromX, fromY, toX, toY, targetX, targetY, options = {}){
  const beforeDist = Math.hypot(targetX - fromX, targetY - fromY);
  const afterDist = Math.hypot(targetX - toX, targetY - toY);
  const improvement = beforeDist - afterDist;
  const thresholdScale = Number.isFinite(options?.thresholdScale)
    ? Math.max(0, options.thresholdScale)
    : AI_LANE_PROGRESS_PRIMARY_THRESHOLD_SCALE;
  const noticeableThreshold = CELL_SIZE * thresholdScale;
  const hasNoticeableProgress = improvement >= noticeableThreshold;
  return {
    beforeDist,
    afterDist,
    improvement,
    thresholdScale,
    noticeableThreshold,
    hasNoticeableProgress,
  };
}

function findFallbackSafeAngleRepositionMove(plane, enemy, speedPxPerSec){
  if(!plane || !enemy || !Number.isFinite(speedPxPerSec) || speedPxPerSec <= 0) return null;
  const baseAngle = Math.atan2(enemy.y - plane.y, enemy.x - plane.x);
  const baseScale = AI_FALLBACK_SAFE_ANGLE_SHORT_SCALE;
  const scale = applyAiMinLaunchScale(baseScale, {
    source: "fallback_safe_angle",
    planeId: plane.id,
    enemyId: enemy.id,
    decisionReason: "fallback_safe_angle_reposition",
    goalName: "fallback_safe_angle_reposition",
    moveDistance: MAX_DRAG_DISTANCE * baseScale,
  });

  let bestCandidate = null;

  for(const angleOffsetDeg of AI_FALLBACK_SAFE_ANGLE_CANDIDATE_DEG){
    const angle = baseAngle + (angleOffsetDeg * Math.PI / 180);
    const vx = Math.cos(angle) * scale * speedPxPerSec;
    const vy = Math.sin(angle) * scale * speedPxPerSec;
    const landingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
    const landingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;

    if(!isPathClear(plane.x, plane.y, landingX, landingY)){
      logAiDecision("fallback_safe_angle_rejected", {
        reasonCode: "blocked_path",
        planeId: plane?.id ?? null,
        enemyId: enemy?.id ?? null,
        angleOffsetDeg,
      });
      continue;
    }

    const hasLineOfSightToTarget = isPathClear(landingX, landingY, enemy.x, enemy.y);
    const progressMeta = getAiNoticeableProgressMeta(plane.x, plane.y, landingX, landingY, enemy.x, enemy.y);
    const score =
      (hasLineOfSightToTarget ? 3 : 0)
      + Math.max(-2, Math.min(2, progressMeta.improvement / Math.max(1, CELL_SIZE * 0.2)))
      + (progressMeta.hasNoticeableProgress ? 1 : -2.2);

    logAiDecision("fallback_safe_angle_candidate_scored", {
      planeId: plane?.id ?? null,
      enemyId: enemy?.id ?? null,
      angleOffsetDeg,
      score: Number(score.toFixed(3)),
      hasLineOfSightToTarget,
      distanceBefore: Number(progressMeta.beforeDist.toFixed(2)),
      distanceAfter: Number(progressMeta.afterDist.toFixed(2)),
      improvement: Number(progressMeta.improvement.toFixed(2)),
      hasNoticeableProgress: progressMeta.hasNoticeableProgress,
      noticeableThreshold: Number(progressMeta.noticeableThreshold.toFixed(2)),
    });

    const move = {
      plane,
      enemy,
      vx,
      vy,
      totalDist: Math.hypot(landingX - plane.x, landingY - plane.y),
      goalName: "fallback_safe_angle_reposition",
      decisionReason: "fallback_safe_angle_reposition",
      score: getAiPlaneAdjustedScore(Math.hypot(landingX - plane.x, landingY - plane.y), plane),
      idleTurns: getAiPlaneIdleTurns(plane),
      candidateScore: score,
      hasLineOfSightToTarget,
      progressMeta,
    };

    if(!bestCandidate || score > bestCandidate.candidateScore){
      bestCandidate = move;
    }
  }

  if(!bestCandidate) return null;

  if(!bestCandidate.hasLineOfSightToTarget && !bestCandidate.progressMeta?.hasNoticeableProgress){
    logAiDecision("fallback_safe_angle_rejected", {
      reasonCode: "weak_candidates_only",
      planeId: plane?.id ?? null,
      enemyId: enemy?.id ?? null,
      bestCandidateScore: Number(bestCandidate.candidateScore.toFixed(3)),
      hasLineOfSightToTarget: false,
      hasNoticeableProgress: false,
    });
    return null;
  }

  logAiDecision("fallback_safe_angle_selected", {
    planeId: plane?.id ?? null,
    enemyId: enemy?.id ?? null,
    bestCandidateScore: Number(bestCandidate.candidateScore.toFixed(3)),
    hasLineOfSightToTarget: bestCandidate.hasLineOfSightToTarget,
    improvement: Number((bestCandidate.progressMeta?.improvement ?? 0).toFixed(2)),
    hasNoticeableProgress: Boolean(bestCandidate.progressMeta?.hasNoticeableProgress),
  });

  return bestCandidate;
}

function findFallbackRicochetPreparationMove(plane, enemy){
  if(!plane || !enemy) return null;
  const preparationMove = findSafePreparationMoveForAttack(plane, enemy);
  if(!preparationMove) return null;

  const vx = Number(preparationMove.vx) * AI_FALLBACK_RICOCHET_PREP_SCALE;
  const vy = Number(preparationMove.vy) * AI_FALLBACK_RICOCHET_PREP_SCALE;
  if(!Number.isFinite(vx) || !Number.isFinite(vy)) return null;

  const totalDist = Math.hypot(vx, vy) * FIELD_FLIGHT_DURATION_SEC;

  return {
    plane,
    enemy,
    targetEnemy: enemy,
    ...preparationMove,
    vx,
    vy,
    totalDist,
    goalName: "fallback_prepare_ricochet",
    decisionReason: "fallback_prepare_ricochet",
    score: getAiPlaneAdjustedScore(totalDist, plane),
    idleTurns: getAiPlaneIdleTurns(plane),
  };
}

function getAiMoveLandingPoint(move){
  if(!move?.plane || !Number.isFinite(move.vx) || !Number.isFinite(move.vy)) return null;
  return {
    x: move.plane.x + move.vx * FIELD_FLIGHT_DURATION_SEC,
    y: move.plane.y + move.vy * FIELD_FLIGHT_DURATION_SEC,
  };
}

function getCurrentMapMetaNormalized(){
  const currentMapMeta = (typeof resolveCurrentMapForExport === "function")
    ? resolveCurrentMapForExport()
    : null;
  const mapId = typeof currentMapMeta?.id === "string"
    ? currentMapMeta.id.trim().toLowerCase()
    : "";
  const mapName = typeof currentMapMeta?.name === "string"
    ? currentMapMeta.name.trim().toLowerCase()
    : (typeof currentMapName === "string" ? currentMapName.trim().toLowerCase() : "");
  return { mapId, mapName, mapMeta: currentMapMeta };
}

function isCurrentMapClearSky(){
  const { mapId, mapName } = getCurrentMapMetaNormalized();
  return mapId === "clearsky" || mapName === "clear sky";
}

function getMirrorPathRatioLimit(options = {}){
  const pressureBoost = Number.isFinite(options?.pressureBoost)
    ? Math.max(0, options.pressureBoost)
    : 0;
  const mapBonus = isCurrentMapClearSky() ? 0 : AI_MIRROR_MAX_PATH_RATIO_OBSTACLE_BONUS;
  return AI_MIRROR_MAX_PATH_RATIO + mapBonus + pressureBoost;
}

function isMirrorPressureTarget(enemy, context = null){
  if(!enemy) return false;
  const targetPriority = getAiTargetPriority(enemy, context);
  if(targetPriority === "critical") return true;
  return isDirectFinisherScenario(context?.plane || null, enemy);
}

function getAiLongShotPenaltyMultiplier(distanceToTarget, targetPriority = "normal", riskProfile = "balanced", options = {}){
  if(!Number.isFinite(distanceToTarget) || distanceToTarget <= AI_LONG_SHOT_DISTANCE_THRESHOLD) return 1;

  const maxEffectiveDistance = Math.max(MAX_DRAG_DISTANCE * 1.25, AI_LONG_SHOT_DISTANCE_THRESHOLD + 1);
  const overflowDistance = Math.max(0, distanceToTarget - AI_LONG_SHOT_DISTANCE_THRESHOLD);
  const overflowRatio = Math.min(1, overflowDistance / (maxEffectiveDistance - AI_LONG_SHOT_DISTANCE_THRESHOLD));

  const profilePenaltyCeil = riskProfile === "comeback"
    ? 1.32
    : riskProfile === "conservative"
      ? 1.56
      : 1.46;

  const baseMultiplier = 1 + (profilePenaltyCeil - 1) * overflowRatio;
  const criticalTargetSoftener = targetPriority === "critical" ? 0.62 : 1;
  let penalty = 1 + (baseMultiplier - 1) * criticalTargetSoftener;

  const onlyLineAvailable = Boolean(options?.onlyLineAvailable);
  const cleanRicochetAvailable = Boolean(options?.cleanRicochetAvailable);
  if(onlyLineAvailable){
    penalty = 1 + (penalty - 1) * 0.45;
  }
  if(cleanRicochetAvailable){
    penalty = 1 + (penalty - 1) * 0.75;
  }

  return penalty;
}

function getAiTargetPriority(enemy, context){
  if(!enemy) return "normal";
  const homeBase = context?.homeBase || getBaseAnchor("blue");
  const isFlagCarrier = Boolean(
    context?.stolenBlueFlagCarrier
    && context.stolenBlueFlagCarrier.color !== "blue"
    && context.stolenBlueFlagCarrier === enemy
  );
  const isNearBlueBase = Boolean(homeBase) && dist(enemy, homeBase) <= ATTACK_RANGE_PX * 1.2;
  return (isFlagCarrier || isNearBlueBase) ? "critical" : "normal";
}

function getBluePriorityEnemy(context){
  const carrier = context?.stolenBlueFlagCarrier;
  if(carrier && carrier.color !== "blue"){
    return carrier;
  }
  const blueFlagCarrier = getFlagCarrierForColor("blue");
  if(blueFlagCarrier && blueFlagCarrier.color !== "blue"){
    return blueFlagCarrier;
  }
  const enemies = Array.isArray(context?.enemies) ? context.enemies : [];
  const blueBase = getBaseAnchor("blue");
  return enemies.reduce((best, enemy) => {
    if(!best) return enemy;
    return dist(enemy, blueBase) < dist(best, blueBase) ? enemy : best;
  }, null);
}

function getCriticalBlueBaseThreat(context){
  const enemies = Array.isArray(context?.enemies) ? context.enemies : [];
  if(!enemies.length) return null;

  const blueBase = getBaseAnchor("blue");
  const criticalDistance = ATTACK_RANGE_PX * 1.15;
  const fastAttackDistance = ATTACK_RANGE_PX * 1.05;

  let bestThreat = null;
  for(const enemy of enemies){
    const distanceToBase = dist(enemy, blueBase);
    const hasCleanLineToBase = isPathClear(enemy.x, enemy.y, blueBase.x, blueBase.y);
    const canAttackSoon = distanceToBase <= fastAttackDistance || (distanceToBase <= criticalDistance && hasCleanLineToBase);
    if(!canAttackSoon) continue;

    if(!bestThreat || distanceToBase < bestThreat.distanceToBase){
      bestThreat = {
        enemy,
        base: blueBase,
        distanceToBase,
        hasCleanLineToBase,
      };
    }
  }

  return bestThreat;
}

function getEarlyBaseWarningThreat(context){
  const enemies = Array.isArray(context?.enemies) ? context.enemies : [];
  if(!enemies.length) return null;
  if(turnAdvanceCount > AI_OPENING_CENTER_TURN_LIMIT) return null;

  const blueBase = getBaseAnchor("blue");
  const warningDistance = ATTACK_RANGE_PX * 1.7;
  const criticalDistance = ATTACK_RANGE_PX * 1.15;
  const nearCriticalDistance = criticalDistance + ATTACK_RANGE_PX * 0.2;
  const urgentTrajectoryCosThreshold = 0.74;
  const urgentTrajectorySpeedThreshold = MAX_DRAG_DISTANCE * 0.25;

  let bestThreat = null;
  for(const enemy of enemies){
    const distanceToBase = dist(enemy, blueBase);
    if(distanceToBase > warningDistance) continue;

    const hasCleanLineToBase = isPathClear(enemy.x, enemy.y, blueBase.x, blueBase.y);
    const enemyVelocityX = Number(enemy?.vx) || 0;
    const enemyVelocityY = Number(enemy?.vy) || 0;
    const enemySpeed = Math.hypot(enemyVelocityX, enemyVelocityY);
    const vectorToBaseX = blueBase.x - enemy.x;
    const vectorToBaseY = blueBase.y - enemy.y;
    const vectorToBaseLength = Math.hypot(vectorToBaseX, vectorToBaseY);
    const hasBaseTrajectoryUrgency = enemySpeed >= urgentTrajectorySpeedThreshold
      && vectorToBaseLength > 0.0001
      && ((enemyVelocityX * vectorToBaseX + enemyVelocityY * vectorToBaseY) / (enemySpeed * vectorToBaseLength)) >= urgentTrajectoryCosThreshold;
    const isNearCriticalDistance = distanceToBase <= nearCriticalDistance;
    const passesSoftWarningFilter = hasCleanLineToBase || isNearCriticalDistance || hasBaseTrajectoryUrgency;
    if(!passesSoftWarningFilter) continue;

    if(!bestThreat || distanceToBase < bestThreat.distanceToBase){
      bestThreat = {
        enemy,
        base: blueBase,
        distanceToBase,
        hasCleanLineToBase,
        isNearCriticalDistance,
        hasBaseTrajectoryUrgency,
      };
    }
  }

  return bestThreat;
}

function getEarlyWarningDirectFinisherOverride(context, earlyWarningThreat){
  if(!context || !earlyWarningThreat) return { allow: false, reason: "missing_context_or_warning" };

  const directFinisherMove = findDirectFinisherMove(context.aiPlanes, context.enemies, {
    source: "early_warning_override_probe",
    goalName: "direct_finisher",
    context,
  });
  if(!directFinisherMove) return { allow: false, reason: "no_direct_finisher" };

  const hasCleanDirectLane = Boolean(directFinisherMove?.plane && directFinisherMove?.enemy)
    && isPathClear(
      directFinisherMove.plane.x,
      directFinisherMove.plane.y,
      directFinisherMove.enemy.x,
      directFinisherMove.enemy.y,
    );
  const shortDistanceThreshold = AI_OPENING_DIRECT_FINISHER_EXCEPTION_DISTANCE * 1.1;
  const isShortDirectAttack = Number.isFinite(directFinisherMove?.totalDist)
    && directFinisherMove.totalDist <= shortDistanceThreshold;

  const landingPoint = typeof getAiMoveLandingPoint === "function"
    ? getAiMoveLandingPoint(directFinisherMove)
    : null;
  const immediateResponseThreat = (landingPoint && typeof getImmediateResponseThreatMeta === "function")
    ? getImmediateResponseThreatMeta(
        context,
        landingPoint.x,
        landingPoint.y,
        directFinisherMove.enemy || null
      )
    : { count: 0, nearestDist: Number.POSITIVE_INFINITY };
  const lowImmediateRisk = immediateResponseThreat.count === 0
    || (
      immediateResponseThreat.count <= 1
      && Number.isFinite(immediateResponseThreat.nearestDist)
      && immediateResponseThreat.nearestDist > AI_OPENING_DIRECT_FINISHER_EXCEPTION_NEAREST_THREAT_DISTANCE * 1.2
    );

  const allow = hasCleanDirectLane && isShortDirectAttack && lowImmediateRisk;
  return {
    allow,
    move: directFinisherMove,
    hasCleanDirectLane,
    isShortDirectAttack,
    lowImmediateRisk,
    immediateResponseThreat,
    shortDistanceThreshold,
    reason: allow ? "clean_short_low_risk" : "constraints_not_met",
  };
}

function getEmergencyDefenseMove(context, threat){
  if(!threat || !Array.isArray(context?.aiPlanes) || !context.aiPlanes.length) return null;

  const { aiPlanes } = context;
  let bestIntercept = null;

  for(const plane of aiPlanes){
    const directIntercept = planPathToPoint(plane, threat.enemy.x, threat.enemy.y);
    if(directIntercept){
      const rawScore = directIntercept.totalDist + dist(plane, threat.enemy) * 0.2;
      const candidate = {
        plane,
        enemy: threat.enemy,
        goalName: "emergency_base_defense_intercept",
        ...directIntercept,
        score: getAiPlaneAdjustedScore(rawScore, plane),
        idleTurns: getAiPlaneIdleTurns(plane),
      };
      if(compareAiCandidateByScoreAndRotation(candidate, bestIntercept, ["emergency_defense", "direct"])){
        bestIntercept = candidate;
      }
      continue;
    }

    const prepIntercept = findSafePreparationMoveForAttack(plane, threat.enemy);
    if(prepIntercept){
      const rawScore = prepIntercept.totalDist + dist(plane, threat.enemy) * 0.3;
      const candidate = {
        plane,
        enemy: threat.enemy,
        goalName: "emergency_base_defense_prepare",
        ...prepIntercept,
        score: getAiPlaneAdjustedScore(rawScore, plane),
        idleTurns: getAiPlaneIdleTurns(plane),
      };
      if(compareAiCandidateByScoreAndRotation(candidate, bestIntercept, ["emergency_defense", "prepare"])){
        bestIntercept = candidate;
      }
    }
  }

  if(bestIntercept) return bestIntercept;

  let bestBlock = null;
  for(const plane of aiPlanes){
    const baseToEnemyDistance = Math.max(1, threat.distanceToBase);
    const ratio = Math.min(0.6, ATTACK_RANGE_PX / baseToEnemyDistance);
    const blockPoint = {
      x: threat.base.x + (threat.enemy.x - threat.base.x) * ratio,
      y: threat.base.y + (threat.enemy.y - threat.base.y) * ratio,
    };
    const blockMove = planPathToPoint(plane, blockPoint.x, blockPoint.y);
    if(!blockMove) continue;

    const candidate = {
      plane,
      enemy: threat.enemy,
      goalName: "emergency_base_defense_block",
      blockPoint,
      ...blockMove,
      score: getAiPlaneAdjustedScore(blockMove.totalDist, plane),
      idleTurns: getAiPlaneIdleTurns(plane),
    };
    if(compareAiCandidateByScoreAndRotation(candidate, bestBlock, ["emergency_defense", "block"])){
      bestBlock = candidate;
    }
  }

  return bestBlock;
}

function getEmergencyBaseHoldPositionMove(context, threat){
  if(!threat || !Array.isArray(context?.aiPlanes) || !context.aiPlanes.length) return null;

  const { aiPlanes } = context;
  const base = threat.base || getBaseAnchor("blue");
  if(!base) return null;

  const enemy = threat.enemy;
  if(!enemy) return null;

  const halfCenterY = FIELD_TOP + FIELD_HEIGHT / 2;
  const isTopHalf = base.y <= halfCenterY;
  const halfMinY = isTopHalf ? FIELD_TOP : halfCenterY;
  const halfMaxY = isTopHalf ? halfCenterY : FIELD_TOP + FIELD_HEIGHT;
  const ratio = 0.45;
  const targetX = base.x + (enemy.x - base.x) * ratio;
  const targetY = base.y + (enemy.y - base.y) * ratio;
  const holdPoint = {
    x: Math.max(FIELD_LEFT, Math.min(FIELD_LEFT + FIELD_WIDTH, targetX)),
    y: Math.max(halfMinY, Math.min(halfMaxY, targetY)),
  };

  let bestHoldMove = null;
  for(const plane of aiPlanes){
    const holdMove = planPathToPoint(plane, holdPoint.x, holdPoint.y);
    if(!holdMove) continue;

    const candidate = {
      plane,
      enemy,
      goalName: "emergency_base_hold_position",
      holdPoint,
      ...holdMove,
      score: getAiPlaneAdjustedScore(holdMove.totalDist, plane),
      idleTurns: getAiPlaneIdleTurns(plane),
    };
    if(compareAiCandidateByScoreAndRotation(candidate, bestHoldMove, ["emergency_hold_position"])){
      bestHoldMove = candidate;
    }
  }

  return bestHoldMove;
}

function placeBlueDynamiteAt(boardX, boardY){
  const targetBrick = findMapSpriteForDynamiteDrop({ boardX, boardY });
  if(!targetBrick) return false;
  const dynamiteEntry = {
    id: `dynamite-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    owner: "blue",
    x: targetBrick.cx,
    y: targetBrick.cy,
    bottomY: targetBrick.cy + targetBrick.halfHeight,
    spriteId: targetBrick.id,
    spriteIndex: targetBrick.spriteIndex,
    spriteRef: targetBrick.spriteRef,
    startedAtMs: performance.now(),
    frameIndex: 0,
    finalFadeStartedAtMs: null,
    brickRemoved: false,
  };
  dynamiteState.push(dynamiteEntry);
  return true;
}

function tryPlaceBlueMineNearEnemyBase(){
  const enemyBase = getBaseAnchor("green");
  const candidates = [
    { x: enemyBase.x - CELL_SIZE * 1.2, y: enemyBase.y + CELL_SIZE * 0.8 },
    { x: enemyBase.x + CELL_SIZE * 1.2, y: enemyBase.y + CELL_SIZE * 0.8 },
    { x: enemyBase.x, y: enemyBase.y + CELL_SIZE * 1.6 },
    { x: enemyBase.x, y: enemyBase.y - CELL_SIZE * 1.4 },
  ];

  for(const candidate of candidates){
    const placement = {
      x: candidate.x,
      y: candidate.y,
      cellX: Math.floor((candidate.x - FIELD_LEFT) / CELL_SIZE),
      cellY: Math.floor((candidate.y - FIELD_TOP) / CELL_SIZE),
    };
    if(!isMinePlacementValid(placement)) continue;
    placeMine({
      owner: "blue",
      x: placement.x,
      y: placement.y,
      cellX: placement.cellX,
      cellY: placement.cellY,
    });
    return true;
  }

  return false;
}

function tryPlaceBlueDefensiveMine(context, plannedMove){
  const plane = plannedMove?.plane;
  const landingPoint = getAiMoveLandingPoint(plannedMove);
  const enemies = Array.isArray(context?.enemies) ? context.enemies : [];
  if(!plane || !landingPoint || enemies.length === 0) return false;

  function isPlacementSelfRisky(point){
    if(!point) return true;
    const currentToLandingDistance = Math.hypot(point.x - plane.x, point.y - plane.y);
    const landingToMineDistance = Math.hypot(point.x - landingPoint.x, point.y - landingPoint.y);
    const mineDangerRadius = MINE_TRIGGER_RADIUS * 1.1;
    const blocksImmediateCorridor = currentToLandingDistance <= mineDangerRadius;
    const blocksLandingCorridor = landingToMineDistance <= mineDangerRadius;
    return blocksImmediateCorridor || blocksLandingCorridor;
  }

  let mostDangerousEnemy = null;
  let bestThreatScore = Number.NEGATIVE_INFINITY;
  for(const enemy of enemies){
    const enemyToLanding = Math.hypot(enemy.x - landingPoint.x, enemy.y - landingPoint.y);
    const canContestSoon = enemyToLanding <= MAX_DRAG_DISTANCE * 1.05;
    const hasClearLane = isPathClear(enemy.x, enemy.y, landingPoint.x, landingPoint.y);
    if(!canContestSoon || !hasClearLane) continue;

    const threatScore = MAX_DRAG_DISTANCE - enemyToLanding;
    if(threatScore > bestThreatScore){
      bestThreatScore = threatScore;
      mostDangerousEnemy = enemy;
    }
  }

  if(!mostDangerousEnemy) return false;

  const blockPoint = {
    x: landingPoint.x + (mostDangerousEnemy.x - landingPoint.x) * 0.42,
    y: landingPoint.y + (mostDangerousEnemy.y - landingPoint.y) * 0.42,
  };
  const placement = {
    x: blockPoint.x,
    y: blockPoint.y,
    cellX: Math.floor((blockPoint.x - FIELD_LEFT) / CELL_SIZE),
    cellY: Math.floor((blockPoint.y - FIELD_TOP) / CELL_SIZE),
  };

  if(isPlacementSelfRisky(placement)){
    logAiDecision("mine_skipped_self_risk", {
      planeId: plane?.id ?? null,
      enemyId: mostDangerousEnemy?.id ?? null,
      reason: "defensive_mine_blocks_own_corridor",
      distanceFromPlane: Number(Math.hypot(placement.x - plane.x, placement.y - plane.y).toFixed(1)),
      distanceFromLanding: Number(Math.hypot(placement.x - landingPoint.x, placement.y - landingPoint.y).toFixed(1)),
    });
    return false;
  }

  if(!isMinePlacementValid(placement)) return false;

  placeMine({
    owner: "blue",
    x: placement.x,
    y: placement.y,
    cellX: placement.cellX,
    cellY: placement.cellY,
  });
  return true;
}

function getNearestDynamiteTargetToPoint(anchor){
  if(!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return null;

  const spriteEntries = Array.isArray(currentMapSprites) ? currentMapSprites : [];
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for(let i = 0; i < spriteEntries.length; i += 1){
    const geometry = getMapSpriteGeometry(spriteEntries[i], i);
    if(!geometry) continue;
    const distance = Math.hypot(geometry.cx - anchor.x, geometry.cy - anchor.y);
    if(distance < nearestDistance){
      nearest = geometry;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function getAiStrategicTargetPoint(context, plannedMove){
  if(plannedMove?.targetEnemy && Number.isFinite(plannedMove.targetEnemy.x) && Number.isFinite(plannedMove.targetEnemy.y)){
    return { x: plannedMove.targetEnemy.x, y: plannedMove.targetEnemy.y };
  }

  const landingPoint = getAiMoveLandingPoint(plannedMove);
  const goal = aiRoundState?.currentGoal;

  if(goal === "capture_enemy_flag"){
    const flags = Array.isArray(context?.availableEnemyFlags) ? context.availableEnemyFlags : [];
    if(flags.length > 0){
      const bestFlag = flags
        .map((flag) => getFlagAnchor(flag))
        .filter(Boolean)
        .sort((a, b) => dist(plannedMove.plane, a) - dist(plannedMove.plane, b))[0];
      if(bestFlag) return bestFlag;
    }
  }

  if(goal === "return_with_flag" || goal === "protect_home_flag"){
    const homeBase = context?.homeBase || getBaseAnchor("blue");
    if(homeBase) return homeBase;
  }

  if(goal === "eliminate_flag_carrier"){
    const carrier = context?.stolenBlueFlagCarrier;
    if(carrier) return { x: carrier.x, y: carrier.y };
  }

  const priorityEnemy = getBluePriorityEnemy(context);
  if(priorityEnemy){
    return { x: priorityEnemy.x, y: priorityEnemy.y };
  }

  return landingPoint;
}

function isPathClearIgnoringColliderById(x1, y1, x2, y2, ignoredColliderId){
  for(const collider of colliders){
    if(collider?.id === ignoredColliderId) continue;
    if(checkLineIntersectionWithCollider(x1, y1, x2, y2, collider)) return false;
  }
  return true;
}

function getDynamiteCandidateForCurrentRoute(context, plannedMove){
  const plane = plannedMove?.plane;
  if(!plane) return null;

  const routeTarget = getAiStrategicTargetPoint(context, plannedMove);
  if(!routeTarget || !Number.isFinite(routeTarget.x) || !Number.isFinite(routeTarget.y)) return null;

  const routeBlockedNow = !isPathClear(plane.x, plane.y, routeTarget.x, routeTarget.y);
  if(!routeBlockedNow) return null;

  const spriteEntries = Array.isArray(currentMapSprites) ? currentMapSprites : [];
  const geometries = [];
  for(let i = 0; i < spriteEntries.length; i += 1){
    const geometry = getMapSpriteGeometry(spriteEntries[i], i);
    if(geometry) geometries.push(geometry);
  }

  const lineCandidates = geometries.filter((geometry) =>
    checkLineIntersectionWithCollider(plane.x, plane.y, routeTarget.x, routeTarget.y, geometry.collider)
  );

  const firstBlock = findFirstColliderHit(plane.x, plane.y, routeTarget.x, routeTarget.y);
  const nearestBlockCandidate = firstBlock
    ? geometries.find((geometry) => geometry.collider?.id === firstBlock.collider?.id) || null
    : null;

  const orderedCandidates = [];
  if(nearestBlockCandidate) orderedCandidates.push(nearestBlockCandidate);
  for(const candidate of lineCandidates){
    if(!orderedCandidates.some((entry) => entry.id === candidate.id)){
      orderedCandidates.push(candidate);
    }
  }

  for(const candidate of orderedCandidates){
    const pathClearAfterExplosion = isPathClearIgnoringColliderById(
      plane.x,
      plane.y,
      routeTarget.x,
      routeTarget.y,
      candidate.collider?.id
    );
    if(pathClearAfterExplosion){
      return candidate;
    }
  }

  return null;
}

function isDynamiteTargetUsefulForCurrentRoute(targetGeometry, context, plannedMove){
  const plane = plannedMove?.plane;
  if(!plane || !targetGeometry?.collider?.id) return false;

  const routeTarget = getAiStrategicTargetPoint(context, plannedMove);
  if(!routeTarget || !Number.isFinite(routeTarget.x) || !Number.isFinite(routeTarget.y)) return false;

  const intersectsRoute = checkLineIntersectionWithCollider(
    plane.x,
    plane.y,
    routeTarget.x,
    routeTarget.y,
    targetGeometry.collider
  );
  if(!intersectsRoute) return false;

  const routeBlockedNow = !isPathClear(plane.x, plane.y, routeTarget.x, routeTarget.y);
  if(!routeBlockedNow) return false;

  return isPathClearIgnoringColliderById(
    plane.x,
    plane.y,
    routeTarget.x,
    routeTarget.y,
    targetGeometry.collider.id
  );
}

function evaluateCrosshairBestUse(context, plannedMove){
  const plane = plannedMove?.plane;
  if(!plane) return null;

  const enemies = Array.isArray(context?.enemies) ? context.enemies : [];
  if(enemies.length === 0) return null;

  const aiAliveCount = Array.isArray(context?.aiPlanes) ? context.aiPlanes.length : 1;
  const enemyAliveCount = enemies.length;
  const teamPressureFactor = Math.max(0.8, Math.min(1.25, enemyAliveCount / Math.max(1, aiAliveCount)));
  const landingPoint = getAiMoveLandingPoint(plannedMove) || plane;
  const homeBase = getBaseAnchor("blue");
  const availableEnemyFlags = Array.isArray(context?.availableEnemyFlags) ? context.availableEnemyFlags : [];
  const readyCargo = cargoState.filter((cargo) => cargo?.state === "ready");
  const priorityEnemy = getBluePriorityEnemy(context);

  let bestScenario = null;

  for(const enemy of enemies){
    if(!enemy?.isAlive || enemy.burning) continue;

    const distanceToEnemy = dist(plane, enemy);
    const withinExtendedRange = distanceToEnemy <= MAX_DRAG_DISTANCE * 1.2;
    if(!withinExtendedRange) continue;

    const hasCleanPath = isPathClear(plane.x, plane.y, enemy.x, enemy.y);
    const rangeFactor = Math.max(0, 1 - (distanceToEnemy / (MAX_DRAG_DISTANCE * 1.2)));
    const baseHitChance = hasCleanPath ? 0.75 : 0.35;
    const shieldFactor = enemy.shieldActive ? 0.2 : 1;
    const hitChance = Math.max(0, Math.min(1, baseHitChance * rangeFactor * shieldFactor));

    const carriesBlueFlag = Boolean(context?.stolenBlueFlagCarrier && context.stolenBlueFlagCarrier.id === enemy.id);
    const targetValue = 1
      + (enemy === priorityEnemy ? 0.45 : 0)
      + (carriesBlueFlag ? 1.7 : 0);

    const cargoPickupChance = readyCargo.some((cargo) => dist(landingPoint, cargo) <= CELL_SIZE * 2.4) ? 0.35 : 0;
    const flagCaptureChance = availableEnemyFlags.some((flag) => {
      const anchor = getFlagAnchor(flag);
      return anchor && dist(landingPoint, anchor) <= CELL_SIZE * 2.4;
    }) ? 0.5 : 0;

    const carryingEnemyFlag = Boolean(plane.carriedFlagId && getFlagById(plane.carriedFlagId)?.color === "green");
    const flagReturnChance = carryingEnemyFlag && homeBase && dist(landingPoint, homeBase) <= CELL_SIZE * 2.4
      ? 0.65
      : 0;

    const objectiveValue = (cargoPickupChance * 0.6) + (flagCaptureChance * 1.1) + (flagReturnChance * 1.4);
    const totalValue = hitChance * (targetValue + objectiveValue) * teamPressureFactor;

    const scenario = {
      enemy,
      totalValue,
      hitChance,
      targetValue,
      objectiveValue,
      carriesBlueFlag,
      hasCleanPath,
      distanceToEnemy,
      cargoPickupChance,
      flagCaptureChance,
      flagReturnChance,
      teamPressureFactor,
    };

    if(!bestScenario || scenario.totalValue > bestScenario.totalValue){
      bestScenario = scenario;
    }
  }

  return bestScenario;
}

function maybeUseInventoryBeforeLaunch(context, plannedMove){
  if(!plannedMove?.plane) return false;

  const explicitInventoryUnlock = plannedMove?.allowInventoryUsage === true
    && plannedMove?.inventoryUsageReason === "bad_direct_fallback";
  const strategicGoal = plannedMove?.goalName || aiRoundState?.currentGoal || "";
  const strategicInventoryGoals = new Set([
    "direct_finisher",
    "capture_enemy_flag",
    "return_with_flag",
    "emergency_base_defense",
    "critical_base_hold_position",
  ]);

  aiRoundState.lastInventorySoftFallbackUsed = false;

  const inventory = evaluateBlueInventoryState();
  if(inventory.total <= 0) return false;

  const moveDistance = Number.isFinite(plannedMove.totalDist)
    ? plannedMove.totalDist
    : Math.hypot(plannedMove.vx || 0, plannedMove.vy || 0) * FIELD_FLIGHT_DURATION_SEC;
  const priorityEnemy = getBluePriorityEnemy(context);
  const priorityEnemyDistance = priorityEnemy
    ? dist(plannedMove.plane, priorityEnemy)
    : Infinity;
  const hasPriorityEnemyPathClear = Boolean(priorityEnemy)
    && isPathClear(plannedMove.plane.x, plannedMove.plane.y, priorityEnemy.x, priorityEnemy.y);
  const isPriorityEnemyInDirectRange = priorityEnemyDistance <= MAX_DRAG_DISTANCE;
  const directAttackShieldFactor = priorityEnemy?.shieldActive ? 0.45 : 1;
  const hasGoodDirectHitChance = Boolean(priorityEnemy)
    && isPriorityEnemyInDirectRange
    && hasPriorityEnemyPathClear
    && directAttackShieldFactor >= 0.4;
  const landingPoint = getAiMoveLandingPoint(plannedMove);
  const enemyBase = getBaseAnchor("green");
  const riskProfile = context?.aiRiskProfile?.profile || "balanced";
  const softFallbackReady = aiRoundState.inventoryIdleTurns >= AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD
    && aiRoundState.inventorySoftFallbackCooldown <= 0;
  const attackRangePx = typeof ATTACK_RANGE_PX === "number" && Number.isFinite(ATTACK_RANGE_PX) ? ATTACK_RANGE_PX : MAX_DRAG_DISTANCE * 0.58;
  const baseFlightRange = MAX_DRAG_DISTANCE;
  const fuelFlightRange = baseFlightRange * 2;
  const effectiveCellSize = typeof CELL_SIZE === "number" && Number.isFinite(CELL_SIZE) ? CELL_SIZE : 40;
  const contactTargetsForUnlock = [enemyBase];
  if(context?.shouldUseFlagsMode){
    for(const flag of context.availableEnemyFlags || []){
      const anchor = getFlagAnchor(flag);
      if(anchor) contactTargetsForUnlock.push(anchor);
    }
  }
  const entersContactZoneThisTurn = Boolean(landingPoint)
    && contactTargetsForUnlock.some((target) => target && dist(landingPoint, target) <= effectiveCellSize * 2.8);
  const likelyContactOnNextTurn = Boolean(landingPoint)
    && contactTargetsForUnlock.some((target) => {
      if(!target) return false;
      const distanceFromLanding = dist(landingPoint, target);
      return distanceFromLanding <= baseFlightRange + effectiveCellSize * 2.4
        && isPathClear(landingPoint.x, landingPoint.y, target.x, target.y);
    });
  const safeBoostOpportunity = hasPriorityEnemyPathClear
    && moveDistance >= MAX_DRAG_DISTANCE * 0.65
    && (priorityEnemyDistance <= MAX_DRAG_DISTANCE * 1.2 || entersContactZoneThisTurn || likelyContactOnNextTurn);
  const tacticalInventoryAdvantage = hasGoodDirectHitChance || entersContactZoneThisTurn || safeBoostOpportunity;
  const allowInventoryUsage = explicitInventoryUnlock
    || strategicInventoryGoals.has(strategicGoal)
    || tacticalInventoryAdvantage
    || aiRoundState.inventoryIdleTurns >= 2;

  function evaluateDirectAttackWindow(enemy){
    if(!enemy) return null;
    const carrierPriority = enemy?.carriedFlagId ? 0.45 : 0;
    const shieldPriority = enemy?.shieldActive ? -0.25 : 0.22;
    const directRangePriority = isPriorityEnemyInDirectRange ? 0.3 : -0.18;
    const clearPathPriority = hasPriorityEnemyPathClear ? 0.2 : -0.25;
    const finishingDistance = Math.max(0, 1 - (priorityEnemyDistance / (MAX_DRAG_DISTANCE * 1.15)));
    const finishingPriority = finishingDistance * (enemy?.shieldActive ? 0.08 : 0.22);
    const total = carrierPriority + shieldPriority + directRangePriority + clearPathPriority + finishingPriority;
    return {
      total,
      carrierPriority,
      shieldPriority,
      directRangePriority,
      clearPathPriority,
      finishingPriority,
    };
  }

  function isPlannedMoveLikelyProfitableTrade(enemy){
    if(!enemy || !landingPoint) return false;
    const landingDistance = dist(landingPoint, enemy);
    const fromCurrentDistance = dist(plannedMove.plane, enemy);
    const inFightWindow = landingDistance <= attackRangePx * 1.25 || fromCurrentDistance <= attackRangePx * 1.1;
    const laneOpenAfterMove = isPathClear(landingPoint.x, landingPoint.y, enemy.x, enemy.y);
    const enemyLooksVulnerable = !enemy.shieldActive || landingDistance <= attackRangePx * 0.9;
    return inFightWindow && laneOpenAfterMove && enemyLooksVulnerable;
  }



  function tryApplyAiInventoryItem(itemType){
    if(!allowInventoryUsage){
      logAiDecision("inventory_usage_locked", {
        itemType,
        planeId: plannedMove?.plane?.id ?? null,
        reason: "inventory_locked_for_low_confidence_move",
        goal: strategicGoal || null,
        idleTurns: aiRoundState.inventoryIdleTurns,
      });
      return false;
    }
    return applyItemToOwnPlane(itemType, "blue", plannedMove.plane);
  }
  function markSoftFallbackUse(itemType, details = {}){
    aiRoundState.lastInventorySoftFallbackUsed = true;
    logAiDecision("inventory_soft_fallback_used", {
      itemType,
      idleTurns: aiRoundState.inventoryIdleTurns,
      cooldown: aiRoundState.inventorySoftFallbackCooldown,
      ...details,
    });
  }

  function evaluateFuelMaterialGain(enemyFlagAnchor){
    const contactTargets = [
      {
        name: "enemy_base",
        target: enemyBase,
        contactRadius: CELL_SIZE * 2.4,
      },
      {
        name: "priority_enemy",
        target: priorityEnemy,
        contactRadius: attackRangePx,
      },
      {
        name: "enemy_flag",
        target: enemyFlagAnchor,
        contactRadius: CELL_SIZE * 2.4,
      },
    ];

    const scoredTargets = contactTargets
      .filter((entry) => Boolean(entry.target))
      .map((entry) => {
        const targetDistance = dist(plannedMove.plane, entry.target);
        const reachableWithoutFuel = targetDistance <= baseFlightRange + entry.contactRadius;
        const reachableWithFuel = targetDistance <= fuelFlightRange + entry.contactRadius;
        return {
          ...entry,
          targetDistance,
          reachableWithoutFuel,
          reachableWithFuel,
        };
      });

    const newReachableTarget = scoredTargets.find((entry) => entry.reachableWithFuel && !entry.reachableWithoutFuel) || null;

    return {
      hasMaterialGain: Boolean(newReachableTarget),
      newReachableTarget,
      scoredTargets,
    };
  }

  if(inventory.counts[INVENTORY_ITEM_TYPES.FUEL] > 0){
    const enemyFlag = context?.shouldUseFlagsMode ? getAvailableFlagsByColor("green")[0] : null;
    const enemyFlagAnchor = enemyFlag ? getFlagAnchor(enemyFlag) : null;
    const fuelMaterialGain = evaluateFuelMaterialGain(enemyFlagAnchor);
    const farObjective = (enemyFlagAnchor && dist(plannedMove.plane, enemyFlagAnchor) > MAX_DRAG_DISTANCE * 0.75)
      || (priorityEnemy && dist(plannedMove.plane, priorityEnemy) > MAX_DRAG_DISTANCE * 0.75)
      || moveDistance > MAX_DRAG_DISTANCE * 0.75;
    const moderateObjective = (enemyFlagAnchor && dist(plannedMove.plane, enemyFlagAnchor) > MAX_DRAG_DISTANCE * 0.65)
      || (priorityEnemy && dist(plannedMove.plane, priorityEnemy) > MAX_DRAG_DISTANCE * 0.65)
      || moveDistance > MAX_DRAG_DISTANCE * 0.65;
    const attackGoal = aiRoundState?.currentGoal === "direct_finisher" || plannedMove?.goalName === "direct_finisher";
    const shouldUseFuelForAttackCommit = attackGoal
      && hasPriorityEnemyPathClear
      && priorityEnemyDistance > MAX_DRAG_DISTANCE * 0.55;
    const shouldBoostRange = farObjective
      || shouldUseFuelForAttackCommit
      || (riskProfile === "comeback" && moveDistance > MAX_DRAG_DISTANCE * 0.55);
    const shouldUseFuelBySoftFallback = !shouldBoostRange && softFallbackReady && moderateObjective;
    const shouldTryFuelNow = shouldBoostRange || shouldUseFuelBySoftFallback;
    if(shouldTryFuelNow && !fuelMaterialGain.hasMaterialGain){
      logAiDecision("fuel_saved_no_material_gain", {
        planeId: plannedMove.plane?.id ?? null,
        reason: shouldUseFuelBySoftFallback ? "soft_fallback_without_new_contact" : "boost_without_new_contact",
        riskProfile,
        moveDistance: Number(moveDistance.toFixed(1)),
        attackGoal,
        candidateTarget: null,
      });
    }

    if(shouldTryFuelNow
      && fuelMaterialGain.hasMaterialGain
      && tryApplyAiInventoryItem(INVENTORY_ITEM_TYPES.FUEL, "blue", plannedMove.plane)){
      removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.FUEL);
      logAiDecision("fuel_used_material_gain", {
        planeId: plannedMove.plane?.id ?? null,
        reason: shouldUseFuelBySoftFallback ? "soft_fallback_new_contact" : "boost_new_contact",
        gainedContactTarget: fuelMaterialGain.newReachableTarget?.name || null,
        gainedContactDistance: fuelMaterialGain.newReachableTarget
          ? Number(fuelMaterialGain.newReachableTarget.targetDistance.toFixed(1))
          : null,
      });
      if(shouldUseFuelBySoftFallback){
        markSoftFallbackUse(INVENTORY_ITEM_TYPES.FUEL, {
          moveDistance: Number(moveDistance.toFixed(1)),
          reason: "moderate_far_objective",
        });
      }
      return true;
    }
  }

  if(inventory.counts[INVENTORY_ITEM_TYPES.CROSSHAIR] > 0){
    const bestCrosshairScenario = evaluateCrosshairBestUse(context, plannedMove);
    const CROSSHAIR_MIN_NOTICEABLE_VALUE = 0.74;
    const CROSSHAIR_SOFT_FALLBACK_MIN_VALUE = 0.58;

    if(bestCrosshairScenario && bestCrosshairScenario.totalValue >= CROSSHAIR_MIN_NOTICEABLE_VALUE){
      if(tryApplyAiInventoryItem(INVENTORY_ITEM_TYPES.CROSSHAIR, "blue", plannedMove.plane)){
        removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.CROSSHAIR);
        logAiDecision("crosshair_used_best_value", {
          planeId: plannedMove.plane?.id ?? null,
          enemyId: bestCrosshairScenario.enemy?.id ?? null,
          bestValue: Number(bestCrosshairScenario.totalValue.toFixed(3)),
          hitChance: Number(bestCrosshairScenario.hitChance.toFixed(3)),
          targetValue: Number(bestCrosshairScenario.targetValue.toFixed(3)),
          objectiveValue: Number(bestCrosshairScenario.objectiveValue.toFixed(3)),
          carriesBlueFlag: bestCrosshairScenario.carriesBlueFlag,
          distanceToEnemy: Number(bestCrosshairScenario.distanceToEnemy.toFixed(1)),
          hasCleanPath: bestCrosshairScenario.hasCleanPath,
        });
        return true;
      }
    } else {
      const moderateCrosshairScenario = bestCrosshairScenario
        && bestCrosshairScenario.totalValue >= CROSSHAIR_SOFT_FALLBACK_MIN_VALUE
        && bestCrosshairScenario.distanceToEnemy <= MAX_DRAG_DISTANCE * 1.1;
      const cleanFinishingChance = priorityEnemy
        && isPathClear(plannedMove.plane.x, plannedMove.plane.y, priorityEnemy.x, priorityEnemy.y)
        && dist(plannedMove.plane, priorityEnemy) <= MAX_DRAG_DISTANCE
        && !priorityEnemy.shieldActive;
      const comebackPressureShot = priorityEnemy
        && riskProfile === "comeback"
        && dist(plannedMove.plane, priorityEnemy) <= MAX_DRAG_DISTANCE * 1.2;

      if(!bestCrosshairScenario && (cleanFinishingChance || comebackPressureShot)){
        if(tryApplyAiInventoryItem(INVENTORY_ITEM_TYPES.CROSSHAIR, "blue", plannedMove.plane)){
          removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.CROSSHAIR);
          logAiDecision("crosshair_used_best_value", {
            planeId: plannedMove.plane?.id ?? null,
            enemyId: priorityEnemy?.id ?? null,
            bestValue: null,
            fallback: "legacy_clean_or_comeback",
          });
          return true;
        }
      }

      if(moderateCrosshairScenario && softFallbackReady){
        if(tryApplyAiInventoryItem(INVENTORY_ITEM_TYPES.CROSSHAIR, "blue", plannedMove.plane)){
          removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.CROSSHAIR);
          markSoftFallbackUse(INVENTORY_ITEM_TYPES.CROSSHAIR, {
            bestValue: Number(bestCrosshairScenario.totalValue.toFixed(3)),
            thresholdMain: CROSSHAIR_MIN_NOTICEABLE_VALUE,
            thresholdSoft: CROSSHAIR_SOFT_FALLBACK_MIN_VALUE,
            enemyId: bestCrosshairScenario.enemy?.id ?? null,
          });
          return true;
        }
      }

      logAiDecision("crosshair_saved", {
        planeId: plannedMove.plane?.id ?? null,
        reason: bestCrosshairScenario ? "best_value_below_threshold" : "no_reliable_scenario",
        bestValue: bestCrosshairScenario ? Number(bestCrosshairScenario.totalValue.toFixed(3)) : null,
        threshold: CROSSHAIR_MIN_NOTICEABLE_VALUE,
      });
    }
  }

  if(inventory.counts[INVENTORY_ITEM_TYPES.MINE] > 0){
    const directAttackWindow = evaluateDirectAttackWindow(priorityEnemy);
    const strongAttackWindow = Boolean(directAttackWindow) && directAttackWindow.total >= 0.55;
    const profitableTradeWindow = isPlannedMoveLikelyProfitableTrade(priorityEnemy);
    const shouldSkipMineForAttack = strongAttackWindow || profitableTradeWindow;

    if(shouldSkipMineForAttack){
      logAiDecision("mine_skipped_due_to_attack_window", {
        planeId: plannedMove.plane?.id ?? null,
        enemyId: priorityEnemy?.id ?? null,
        attackWindowScore: directAttackWindow ? Number(directAttackWindow.total.toFixed(3)) : null,
        profitableTradeWindow,
        enemyShieldActive: Boolean(priorityEnemy?.shieldActive),
        carriesFlag: Boolean(priorityEnemy?.carriedFlagId),
      });
      logAiDecision("mine_saved_for_direct_attack", {
        planeId: plannedMove.plane?.id ?? null,
        enemyId: priorityEnemy?.id ?? null,
        enemyShieldActive: Boolean(priorityEnemy?.shieldActive),
        distanceToEnemy: Number(priorityEnemyDistance.toFixed(1)),
        inDirectRange: isPriorityEnemyInDirectRange,
        hasClearPath: hasPriorityEnemyPathClear,
        shieldPriorityFactor: directAttackShieldFactor,
        attackWindowScore: directAttackWindow ? Number(directAttackWindow.total.toFixed(3)) : null,
        carriesFlag: Boolean(priorityEnemy?.carriedFlagId),
        profitableTradeWindow,
      });
    } else if(tryPlaceBlueDefensiveMine(context, plannedMove) || tryPlaceBlueMineNearEnemyBase()){
      logAiDecision("mine_placed_for_cover", {
        planeId: plannedMove.plane?.id ?? null,
        enemyId: priorityEnemy?.id ?? null,
        softFallback: false,
      });
      removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.MINE);
      return true;
    }

    const safeAfterPlacement = !landingPoint
      ? false
      : !Array.isArray(context?.enemies) || context.enemies.every((enemy) => {
        const enemyDistance = dist(landingPoint, enemy);
        const enemyHasLane = isPathClear(enemy.x, enemy.y, landingPoint.x, landingPoint.y);
        return !enemyHasLane || enemyDistance > MAX_DRAG_DISTANCE * 0.95;
      });

    if(!shouldSkipMineForAttack && softFallbackReady && safeAfterPlacement){
      const softMinePlaced = tryPlaceBlueDefensiveMine(context, plannedMove) || tryPlaceBlueMineNearEnemyBase();
      if(softMinePlaced){
        removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.MINE);
        logAiDecision("mine_placed_for_cover", {
          planeId: plannedMove.plane?.id ?? null,
          enemyId: priorityEnemy?.id ?? null,
          softFallback: true,
        });
        markSoftFallbackUse(INVENTORY_ITEM_TYPES.MINE, {
          reason: "mine_soft_fallback",
        });
        return true;
      }
    } else if(!shouldSkipMineForAttack && softFallbackReady && !safeAfterPlacement){
      logAiDecision("mine_skipped_self_risk", {
        planeId: plannedMove.plane?.id ?? null,
        enemyId: priorityEnemy?.id ?? null,
        reason: "unsafe_post_mine_position",
      });
    }
  }

  if(inventory.counts[INVENTORY_ITEM_TYPES.DYNAMITE] > 0){
    const homeBase = getBaseAnchor("blue");
    const pressureEnemy = getBluePriorityEnemy(context);
    const routeAwareTarget = getDynamiteCandidateForCurrentRoute(context, plannedMove);
    const defensiveTargetRaw = getNearestDynamiteTargetToPoint(homeBase);
    const offensiveTargetRaw = getNearestDynamiteTargetToPoint(pressureEnemy);
    const defensiveTarget = isDynamiteTargetUsefulForCurrentRoute(defensiveTargetRaw, context, plannedMove)
      ? defensiveTargetRaw
      : null;
    const offensiveTarget = isDynamiteTargetUsefulForCurrentRoute(offensiveTargetRaw, context, plannedMove)
      ? offensiveTargetRaw
      : null;

    const planted = routeAwareTarget
      ? placeBlueDynamiteAt(routeAwareTarget.cx, routeAwareTarget.cy)
      : false;

    function setDynamiteIntentFromTarget(targetGeometry){
      if(!targetGeometry) return;
      const expiresTurn = (Number.isFinite(aiRoundState?.turnNumber) ? aiRoundState.turnNumber : 0) + 1;
      aiRoundState.dynamiteIntent = {
        colliderId: targetGeometry?.collider?.id ?? null,
        spriteId: targetGeometry?.id ?? null,
        x: targetGeometry?.cx ?? null,
        y: targetGeometry?.cy ?? null,
        expiresTurn,
      };
      logAiDecision("dynamite_intent_set", {
        colliderId: targetGeometry?.collider?.id ?? null,
        spriteId: targetGeometry?.id ?? null,
        targetX: Number.isFinite(targetGeometry?.cx) ? Number(targetGeometry.cx.toFixed(1)) : null,
        targetY: Number.isFinite(targetGeometry?.cy) ? Number(targetGeometry.cy.toFixed(1)) : null,
        expiresTurn,
        turn: aiRoundState?.turnNumber ?? null,
      });
    }

    if(planted){
      removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.DYNAMITE);
      plannedMove.inventoryUsageReason = "dynamite_route_opening";
      setDynamiteIntentFromTarget(routeAwareTarget);
      return true;
    }

    if(!planted && softFallbackReady){
      const relaxedTarget = defensiveTargetRaw || offensiveTargetRaw;
      if(relaxedTarget && placeBlueDynamiteAt(relaxedTarget.cx, relaxedTarget.cy)){
        removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.DYNAMITE);
        plannedMove.inventoryUsageReason = "dynamite_route_opening";
        setDynamiteIntentFromTarget(relaxedTarget);
        markSoftFallbackUse(INVENTORY_ITEM_TYPES.DYNAMITE, {
          reason: "dynamite_soft_fallback_relaxed_target",
          targetX: relaxedTarget.cx,
          targetY: relaxedTarget.cy,
        });
        return true;
      }
    }
  }

  const hasNonInvisibilityItems = inventory.total > (inventory.counts[INVENTORY_ITEM_TYPES.INVISIBILITY] || 0);

  if(inventory.counts[INVENTORY_ITEM_TYPES.INVISIBILITY] > 0){
    const nearestEnemyDistance = Array.isArray(context?.enemies) && context.enemies.length > 0
      ? Math.min(...context.enemies.map(enemy => dist(plannedMove.plane, enemy)))
      : Number.POSITIVE_INFINITY;
    const expectCounterMove = nearestEnemyDistance <= ATTACK_RANGE_PX * 1.15
      || (context?.enemies?.length ?? 0) >= (context?.aiPlanes?.length ?? 0);
    const shouldUseInvisibility = (expectCounterMove
      || (riskProfile === "comeback" && moveDistance >= MAX_DRAG_DISTANCE * 0.6))
      && (!softFallbackReady || !hasNonInvisibilityItems);
    if(shouldUseInvisibility && queueInvisibilityEffectForPlayer("blue")){
      removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.INVISIBILITY);
      return true;
    }
  }

  if(softFallbackReady){
    if(inventory.counts[INVENTORY_ITEM_TYPES.CROSSHAIR] > 0
      && tryApplyAiInventoryItem(INVENTORY_ITEM_TYPES.CROSSHAIR, "blue", plannedMove.plane)){
      removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.CROSSHAIR);
      markSoftFallbackUse(INVENTORY_ITEM_TYPES.CROSSHAIR, {
        reason: "generic_soft_fallback_usage",
      });
      return true;
    }

    if(inventory.counts[INVENTORY_ITEM_TYPES.FUEL] > 0
      && evaluateFuelMaterialGain(null).hasMaterialGain
      && tryApplyAiInventoryItem(INVENTORY_ITEM_TYPES.FUEL, "blue", plannedMove.plane)){
      removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.FUEL);
      markSoftFallbackUse(INVENTORY_ITEM_TYPES.FUEL, {
        reason: "generic_soft_fallback_usage",
      });
      return true;
    } else if(inventory.counts[INVENTORY_ITEM_TYPES.FUEL] > 0){
      logAiDecision("fuel_saved_no_material_gain", {
        planeId: plannedMove.plane?.id ?? null,
        reason: "generic_soft_fallback_without_new_contact",
      });
    }
  }

  if(inventory.counts[INVENTORY_ITEM_TYPES.WINGS] > 0 && landingPoint){
    const contactTargets = [enemyBase];
    if(context?.shouldUseFlagsMode){
      for(const flag of context.availableEnemyFlags || []){
        contactTargets.push(getFlagAnchor(flag));
      }
    }
    const reachesContactZone = contactTargets.some((target) =>
      target && dist(landingPoint, target) <= effectiveCellSize * 2.4
    );
    const reachesModerateContactZone = contactTargets.some((target) =>
      target && dist(landingPoint, target) <= effectiveCellSize * 3.1
    );
    const likelyContactNextTurn = contactTargets.some((target) => {
      if(!target) return false;
      const distanceFromLanding = dist(landingPoint, target);
      return distanceFromLanding <= baseFlightRange + effectiveCellSize * 2.4
        && isPathClear(landingPoint.x, landingPoint.y, target.x, target.y);
    });
    const shouldUseWingsBySoftFallback = !reachesContactZone && softFallbackReady && reachesModerateContactZone;
    if((reachesContactZone || likelyContactNextTurn || shouldUseWingsBySoftFallback)
      && tryApplyAiInventoryItem(INVENTORY_ITEM_TYPES.WINGS, "blue", plannedMove.plane)){
      removeItemFromInventory("blue", INVENTORY_ITEM_TYPES.WINGS);
      if(shouldUseWingsBySoftFallback){
        markSoftFallbackUse(INVENTORY_ITEM_TYPES.WINGS, {
          reason: "approaching_contact_zone",
        });
      } else if(likelyContactNextTurn && !reachesContactZone){
        logAiDecision("wings_used_contact_likely_next_turn", {
          planeId: plannedMove.plane?.id ?? null,
          contactNow: reachesContactZone,
        });
      }
      return true;
    }
  }

  return false;
}

function registerAiInventoryUsageAfterMove(itemUsed){
  if(itemUsed){
    aiRoundState.inventoryIdleTurns = 0;
  } else {
    aiRoundState.inventoryIdleTurns += 1;
  }

  if(aiRoundState.inventorySoftFallbackCooldown > 0){
    aiRoundState.inventorySoftFallbackCooldown -= 1;
  }

  if(aiRoundState.lastInventorySoftFallbackUsed){
    aiRoundState.inventorySoftFallbackCooldown = AI_INVENTORY_SOFT_FALLBACK_COOLDOWN_TURNS;
    aiRoundState.lastInventorySoftFallbackUsed = false;
  }
}

function detectConsumedInventoryType(beforeCounts = {}, afterCounts = {}){
  for(const type of Object.values(INVENTORY_ITEM_TYPES)){
    const before = Number(beforeCounts[type] ?? 0);
    const after = Number(afterCounts[type] ?? 0);
    if(before > after){
      return type;
    }
  }
  return null;
}

function failSafeAdvanceTurn(reason, details = {}){
  const safeReason = typeof reason === "string" && reason ? reason : "unspecified_fail_safe";
  const safeDetails = details && typeof details === "object" ? details : {};
  const rejectReasons = Array.isArray(safeDetails.rejectReasons)
    ? safeDetails.rejectReasons
    : [safeReason];
  const reasonCodes = Array.isArray(safeDetails.reasonCodes)
    ? safeDetails.reasonCodes
    : ["fail_safe_turn_advance"];
  const goal = safeDetails.goal || aiRoundState?.currentGoal || safeReason;
  const planeId = safeDetails.planeId ?? safeDetails?.move?.plane?.id ?? null;

  recordAiSelfAnalyzerDecision(safeReason, {
    goal,
    planeId,
    reasonCodes,
    rejectReasons,
    errorMessage: safeDetails.errorMessage,
  });

  aiMoveScheduled = false;

  if(turnColors[turnIndex] === "blue"){
    const guaranteedMove = getGuaranteedAnyLegalLaunch();
    if(
      guaranteedMove?.plane
      && Number.isFinite(guaranteedMove?.vx)
      && Number.isFinite(guaranteedMove?.vy)
    ){
      logAiDecision("fail_safe_forced_launch_selected", {
        goal,
        previousReason: safeReason,
        planeId: guaranteedMove.plane?.id ?? null,
        selectedMove: {
          planeId: guaranteedMove.plane?.id ?? null,
          vx: Number(guaranteedMove.vx.toFixed(3)),
          vy: Number(guaranteedMove.vy.toFixed(3)),
          totalDist: Number.isFinite(guaranteedMove.totalDist)
            ? Number(guaranteedMove.totalDist.toFixed(2))
            : null,
          goalName: guaranteedMove.goalName ?? "guaranteed_any_legal_launch",
          decisionReason: guaranteedMove.decisionReason ?? "super_reserve_guaranteed_legal_launch",
        },
        reasonCodes: ["fail_safe_forced_launch", "keep_turn_progress"],
      });
      issueAIMove(guaranteedMove.plane, guaranteedMove.vx, guaranteedMove.vy);
      return;
    }
  }

  advanceTurn();
}

function validateAiLaunchMoveCandidate(move){
  const plane = move?.plane;
  if(!plane || typeof plane !== "object"){
    return {
      ok: false,
      reason: "invalid_plane_for_launch",
      message: "Plane object is missing for launch",
    };
  }

  if(!Number.isFinite(plane.x) || !Number.isFinite(plane.y)){
    return {
      ok: false,
      reason: "invalid_plane_coordinates",
      message: "Plane coordinates are missing or not numeric",
    };
  }

  if(!isPlaneLaunchStateReady(plane)){
    return {
      ok: false,
      reason: "invalid_plane_state_for_launch",
      message: "Plane is not in launch-ready state",
    };
  }

  if(!Number.isFinite(move?.vx) || !Number.isFinite(move?.vy)){
    return {
      ok: false,
      reason: "invalid_launch_vector",
      message: "Launch vector is missing or not numeric",
    };
  }

  return {
    ok: true,
    reason: "ok",
  };
}

function issueAIMoveWithInventoryUsage(context, plannedMove){
  const failSafeHandler = typeof failSafeAdvanceTurn === "function"
    ? failSafeAdvanceTurn
    : (fallbackReason, fallbackDetails = {}) => {
        const rejectReasons = Array.isArray(fallbackDetails.rejectReasons)
          ? fallbackDetails.rejectReasons
          : [fallbackReason];
        const reasonCodes = Array.isArray(fallbackDetails.reasonCodes)
          ? fallbackDetails.reasonCodes
          : ["fail_safe_turn_advance"];
        const goal = fallbackDetails.goal || aiRoundState?.currentGoal || fallbackReason;
        const planeId = fallbackDetails.planeId ?? fallbackDetails?.move?.plane?.id ?? null;
        recordAiSelfAnalyzerDecision(fallbackReason, {
          goal,
          planeId,
          reasonCodes,
          rejectReasons,
          errorMessage: fallbackDetails.errorMessage,
        });
        aiMoveScheduled = false;
        advanceTurn();
      };

  function revalidatePlannedMove(move){
    const plane = move?.plane;
    if(!plane || !isPlaneLaunchStateReady(plane)){
      return {
        ok: false,
        reason: "plane_unavailable",
      };
    }
    if(flyingPoints.some((flight) => flight?.plane === plane)){
      return {
        ok: false,
        reason: "plane_already_in_flight",
      };
    }

    const targetEnemy = move?.targetEnemy || move?.enemy || null;
    if(targetEnemy){
      if(!isPlaneTargetable(targetEnemy)){
        return {
          ok: false,
          reason: "target_not_alive",
          expectedEnemyId: targetEnemy?.id ?? null,
        };
      }
      const latestEnemyLive = findActualPlaneById(targetEnemy?.id);
      const latestEnemy = latestEnemyLive || findActualPlaneById(targetEnemy?.id, context?.enemies);
      const revalidationSource = latestEnemyLive ? "live_points" : "context_fallback";
      if(!latestEnemy || !isPlaneTargetable(latestEnemy)){
        return {
          ok: false,
          reason: "target_missing",
          expectedEnemyId: targetEnemy?.id ?? null,
          revalidationSource,
        };
      }
      const drift = Math.hypot(latestEnemy.x - targetEnemy.x, latestEnemy.y - targetEnemy.y);
      if(drift > AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX){
        return {
          ok: false,
          reason: "target_shifted",
          expectedEnemyId: targetEnemy?.id ?? null,
          drift,
          radius: AI_PLANNED_MOVE_TARGET_REVALIDATION_RADIUS_PX,
          revalidationSource,
        };
      }
    }

    const landingPoint = getAiMoveLandingPoint(move);
    if(!landingPoint || !isPathClear(plane.x, plane.y, landingPoint.x, landingPoint.y)){
      return {
        ok: false,
        reason: "path_blocked",
      };
    }

    return {
      ok: true,
      reason: "ok",
    };
  }

  function launchFallbackIfNeeded(staleCheck){
    const fallbackMove = getFallbackAiMove(context) || getGuaranteedAnyLegalLaunch(context);
    const fallbackValidation = validateAiLaunchMoveCandidate(fallbackMove);
    if(fallbackValidation.ok){
      issueAIMove(fallbackMove.plane, fallbackMove.vx, fallbackMove.vy);
      logAiDecision("stale_target_replanned", {
        planeId: plannedMove?.plane?.id ?? null,
        previousEnemyId: plannedMove?.targetEnemy?.id ?? plannedMove?.enemy?.id ?? null,
        previousGoal: plannedMove?.goalName ?? null,
        staleReason: staleCheck?.reason ?? "unknown",
        revalidationSource: staleCheck?.revalidationSource ?? "live_points",
        fallbackPlaneId: fallbackMove?.plane?.id ?? null,
        fallbackEnemyId: fallbackMove?.targetEnemy?.id ?? fallbackMove?.enemy?.id ?? null,
        fallbackGoal: fallbackMove?.goalName ?? null,
      });
      return true;
    }
    return false;
  }

  const plannedMoveValidation = validateAiLaunchMoveCandidate(plannedMove);
  if(!plannedMoveValidation.ok){
    failSafeHandler("invalid_move_fail_safe", {
      goal: aiRoundState?.currentGoal || "invalid_move_fail_safe",
      plannedMove: {
        planeId: plannedMove?.plane?.id ?? null,
        vx: plannedMove?.vx ?? null,
        vy: plannedMove?.vy ?? null,
      },
      rejectReasons: [plannedMoveValidation.reason || "invalid_planned_move"],
      reasonCodes: ["issue_move_validation_failed", "fail_safe_turn_advance", "invalid_plane_for_launch"],
      errorMessage: plannedMoveValidation.message || null,
    });
    return;
  }

  consumeAiDynamiteIntentIfUsed(plannedMove);

  const beforeInventoryState = evaluateBlueInventoryState();
  const dynamiteStateCountBeforeUsage = Array.isArray(dynamiteState) ? dynamiteState.length : 0;
  const itemUsed = maybeUseInventoryBeforeLaunch(context, plannedMove);
  const afterInventoryState = itemUsed ? evaluateBlueInventoryState() : beforeInventoryState;
  const consumedItemType = itemUsed
    ? detectConsumedInventoryType(
      beforeInventoryState?.counts,
      afterInventoryState?.counts
    )
    : null;

  let effectiveItemUsed = itemUsed;
  if(itemUsed && consumedItemType === INVENTORY_ITEM_TYPES.DYNAMITE && aiRoundState?.dynamiteIntent){
    const usageCheck = getAiDynamiteIntentScoreAdjustment(1, plannedMove, { plane: plannedMove?.plane });
    if(!usageCheck.usedIntent){
      const intent = aiRoundState?.dynamiteIntent;
      let removedDynamitePlacement = false;
      if(Array.isArray(dynamiteState) && dynamiteState.length > dynamiteStateCountBeforeUsage){
        for(let i = dynamiteState.length - 1; i >= dynamiteStateCountBeforeUsage; i -= 1){
          const entry = dynamiteState[i];
          const sameSprite = intent?.spriteId && entry?.spriteId === intent.spriteId;
          const sameCollider = intent?.colliderId && entry?.spriteRef?.collider?.id === intent.colliderId;
          const samePoint = Number.isFinite(intent?.x) && Number.isFinite(intent?.y)
            && Math.hypot((entry?.x ?? Infinity) - intent.x, (entry?.y ?? Infinity) - intent.y) <= 0.6;
          if(entry?.owner === "blue" && (sameSprite || sameCollider || samePoint || i === dynamiteState.length - 1)){
            dynamiteState.splice(i, 1);
            removedDynamitePlacement = true;
            break;
          }
        }
      }

      const dynamiteInventoryItem = INVENTORY_ITEMS.find((item) => item?.type === INVENTORY_ITEM_TYPES.DYNAMITE) ?? null;
      if(dynamiteInventoryItem){
        addItemToInventory("blue", dynamiteInventoryItem);
      }

      logAiDecision("dynamite_plan_desync_prevented", {
        planeId: plannedMove?.plane?.id ?? null,
        colliderId: intent?.colliderId ?? null,
        targetX: Number.isFinite(intent?.x) ? Number(intent.x.toFixed(1)) : null,
        targetY: Number.isFinite(intent?.y) ? Number(intent.y.toFixed(1)) : null,
        turn: aiRoundState?.turnNumber ?? null,
        removedDynamitePlacement,
      });
      clearAiDynamiteIntent("plan_desync_prevented");
      effectiveItemUsed = false;
    }
  }

  if(effectiveItemUsed){
    if(consumedItemType){
      playInventoryConsumeFx("blue", consumedItemType);
    } else {
      logAiDecision("inventory_fx_played", {
        color: "blue",
        result: "failed",
        reason: "item_used_but_type_not_detected",
      });
    }
  }
  registerAiInventoryUsageAfterMove(effectiveItemUsed);

  if(effectiveItemUsed === true){
    if(aiPostInventoryLaunchTimeout){
      clearTimeout(aiPostInventoryLaunchTimeout);
      aiPostInventoryLaunchTimeout = null;
    }
    logAiDecision("post_inventory_delay_applied", {
      delayMs: AI_POST_INVENTORY_LAUNCH_DELAY_MS,
      planeId: plannedMove?.plane?.id ?? null,
      goal: aiRoundState?.currentGoal || null,
    });
    aiPostInventoryLaunchTimeout = setTimeout(() => {
      aiPostInventoryLaunchTimeout = null;
      const staleCheck = revalidatePlannedMove(plannedMove);
      if(!staleCheck.ok){
        if(launchFallbackIfNeeded(staleCheck)) return;
        failSafeHandler("stale_target_launch_failed", {
          goal: aiRoundState?.currentGoal || plannedMove?.goalName || "stale_target_launch_failed",
          planeId: plannedMove?.plane?.id ?? null,
          rejectReasons: [staleCheck.reason || "stale_target_revalidation_failed"],
          reasonCodes: ["stale_target_revalidation_failed", "fail_safe_turn_advance"],
        });
        return;
      }
      issueAIMove(plannedMove.plane, plannedMove.vx, plannedMove.vy);
    }, AI_POST_INVENTORY_LAUNCH_DELAY_MS);
    return;
  }

  const immediateCheck = revalidatePlannedMove(plannedMove);
  if(!immediateCheck.ok){
    if(launchFallbackIfNeeded(immediateCheck)) return;
    failSafeHandler("stale_target_launch_blocked", {
      goal: aiRoundState?.currentGoal || plannedMove?.goalName || "stale_target_launch_blocked",
      planeId: plannedMove?.plane?.id ?? null,
      rejectReasons: [immediateCheck.reason || "stale_target_revalidation_failed"],
      reasonCodes: ["stale_target_revalidation_failed", "fail_safe_turn_advance"],
    });
    return;
  }

  issueAIMove(plannedMove.plane, plannedMove.vx, plannedMove.vy);
}

function selectAiModeForCurrentTurn(context){
  const {
    shouldUseFlagsMode,
    aiPlanes,
    enemies,
    availableEnemyFlags,
    stolenBlueFlagCarrier,
    blueInventoryCount,
    aiRiskProfile
  } = context;
  const scoreGap = greenScore - blueScore;
  const aiAliveCount = aiPlanes.length;
  const enemyAliveCount = enemies.length;
  const hasEnoughResourcesForAggression = blueInventoryCount >= AI_CARGO_SWITCH_TO_AGGRESSION_ITEMS;
  const openingAggressionBiasAllowed = isOpeningAggressionBiasAllowed(context);
  const blueBase = context?.homeBase || getBaseAnchor("blue");

  let mode = AI_MODES.ATTRITION;
  let targetPriorities = ["attack_enemy_plane", "close_distance"];

  if(stolenBlueFlagCarrier && stolenBlueFlagCarrier.color !== "blue"){
    mode = AI_MODES.DEFENSE;
    targetPriorities = ["eliminate_flag_carrier", "protect_home_flag"];
  } else if(aiRiskProfile?.profile === "conservative"){
    mode = AI_MODES.ATTRITION;
    targetPriorities = ["force_trade", "attack_enemy_plane", "contest_center"];
  } else if(aiRiskProfile?.profile === "comeback" && shouldUseFlagsMode && availableEnemyFlags.length > 0){
    mode = AI_MODES.FLAG_PRESSURE;
    targetPriorities = ["capture_enemy_flag", "return_with_flag", "high_risk_attack"];
  } else if(hasEnoughResourcesForAggression && shouldUseFlagsMode && availableEnemyFlags.length > 0){
    mode = AI_MODES.FLAG_PRESSURE;
    targetPriorities = ["capture_enemy_flag", "return_with_flag"];
  } else if(hasEnoughResourcesForAggression){
    mode = AI_MODES.ATTRITION;
    targetPriorities = ["attack_enemy_plane", "close_distance"];
  } else if(shouldUseFlagsMode && availableEnemyFlags.length > 0){
    mode = AI_MODES.FLAG_PRESSURE;
    targetPriorities = ["capture_enemy_flag", "return_with_flag"];
  } else if(blueInventoryCount > 0 && aiAliveCount > 1){
    mode = AI_MODES.RESOURCE_FIRST;
    targetPriorities = ["pickup_cargo", "prepare_attack"];
  } else if(scoreGap > 0 || aiAliveCount < enemyAliveCount){
    mode = AI_MODES.DEFENSE;
    targetPriorities = ["preserve_planes", "safe_attack"];
  }

  let flagPressureGatePassed = null;
  let flagPressureGateReason = "flag_pressure_not_requested";
  if(mode === AI_MODES.FLAG_PRESSURE){
    const inSafetyWindow = turnAdvanceCount <= AI_FLAG_PRESSURE_SAFETY_WINDOW_TURN_LIMIT;
    const hasNumericalAdvantage = aiAliveCount > enemyAliveCount;
    const hasCleanRoundTrip = aiPlanes.some((plane) => {
      if(!plane) return false;
      return availableEnemyFlags.some((flag) => {
        const targetAnchor = getFlagAnchor(flag);
        if(!targetAnchor || !Number.isFinite(targetAnchor.x) || !Number.isFinite(targetAnchor.y)) return false;
        return isPathClear(plane.x, plane.y, targetAnchor.x, targetAnchor.y)
          && isPathClear(targetAnchor.x, targetAnchor.y, blueBase.x, blueBase.y);
      });
    });
    const hasNearbyThreat = enemies.some((enemy) => {
      if(!enemy || !Number.isFinite(enemy.x) || !Number.isFinite(enemy.y)) return false;
      const distanceToBase = dist(enemy, blueBase);
      if(distanceToBase > AI_FLAG_PRESSURE_NEARBY_THREAT_DISTANCE) return false;
      return isPathClear(enemy.x, enemy.y, blueBase.x, blueBase.y);
    });
    const noNearbyThreat = !hasNearbyThreat;
    const hasSafetyFactor = hasNumericalAdvantage || hasCleanRoundTrip || noNearbyThreat;
    const explicitBenefit = (aiRiskProfile?.profile === "comeback" && availableEnemyFlags.length > 0)
      || (hasEnoughResourcesForAggression && (hasNumericalAdvantage || hasCleanRoundTrip));

    flagPressureGatePassed = !inSafetyWindow || hasSafetyFactor || explicitBenefit;
    if(!inSafetyWindow){
      flagPressureGateReason = "safety_window_inactive";
    } else if(hasSafetyFactor){
      if(hasNumericalAdvantage) flagPressureGateReason = "safety_factor_numerical_advantage";
      else if(hasCleanRoundTrip) flagPressureGateReason = "safety_factor_clean_round_trip";
      else flagPressureGateReason = "safety_factor_no_nearby_threat";
    } else if(explicitBenefit){
      flagPressureGateReason = "soft_override_explicit_benefit";
    } else {
      flagPressureGateReason = "blocked_in_safety_window";
      mode = (blueInventoryCount > 0 && aiAliveCount > 1) ? AI_MODES.RESOURCE_FIRST : AI_MODES.ATTRITION;
      targetPriorities = mode === AI_MODES.RESOURCE_FIRST
        ? ["pickup_cargo", "prepare_attack"]
        : ["attack_enemy_plane", "close_distance"];
    }
  }

  if(openingAggressionBiasAllowed && mode === AI_MODES.ATTRITION){
    targetPriorities = ["attack_enemy_plane", "close_distance", ...targetPriorities.filter((goal) => goal !== "attack_enemy_plane" && goal !== "close_distance")];
  }

  aiRoundState.mode = mode;
  aiRoundState.targetPriorities = targetPriorities;
  aiRoundState.currentGoal = targetPriorities[0] ?? null;
  logAiDecision("mode_selected", {
    mode,
    turnAdvanceCount,
    blueInventoryCount,
    hasEnoughResourcesForAggression,
    openingAggressionBiasAllowed,
    flagPressureGatePassed,
    flagPressureGateReason,
    riskProfile: aiRiskProfile?.profile || "balanced",
    priorities: targetPriorities,
  });
  return mode;
}

function getCenterControlAnchor(){
  return {
    x: FIELD_LEFT + FIELD_WIDTH / 2,
    y: FIELD_TOP + FIELD_HEIGHT / 2,
  };
}

function shouldSkipDirectFinisherInOpening(context){
  const currentMapMeta = (typeof resolveCurrentMapForExport === "function")
    ? resolveCurrentMapForExport()
    : null;
  const mapId = typeof currentMapMeta?.id === "string"
    ? currentMapMeta.id.trim().toLowerCase()
    : "";
  const mapName = typeof currentMapMeta?.name === "string"
    ? currentMapMeta.name.trim().toLowerCase()
    : (typeof currentMapName === "string" ? currentMapName.trim().toLowerCase() : "");
  const mapTier = typeof currentMapMeta?.tier === "string"
    ? currentMapMeta.tier.trim().toLowerCase()
    : (typeof currentMapMeta?.difficulty === "string" ? currentMapMeta.difficulty.trim().toLowerCase() : "");
  const isClearSkyMap = mapId === "clearsky" || mapName === "clear sky";
  const isHighObstacleMap = !isClearSkyMap && (mapTier === "middle" || mapTier === "hard");
  const openingRestrictionTurnLimit = isHighObstacleMap ? 1 : AI_OPENING_CENTER_TURN_LIMIT;
  const scoreLead = blueScore - greenScore;
  const isOpeningTurn = turnAdvanceCount <= openingRestrictionTurnLimit;
  const mapAdjustedRestrictionApplied = isHighObstacleMap && openingRestrictionTurnLimit !== AI_OPENING_CENTER_TURN_LIMIT;
  shouldSkipDirectFinisherInOpening.lastDecision = {
    mapAdjustedRestrictionApplied,
    openingRestrictionTurnLimit,
    mapId: mapId || null,
    mapName: mapName || null,
  };
  if(!isOpeningTurn) return false;
  if(scoreLead >= AI_OPENING_DIRECT_FINISHER_MIN_LEAD) return false;

  if(isOpeningAggressionBiasAllowed(context)){
    const openingAggressiveFinisher = findDirectFinisherMove(context?.aiPlanes, context?.enemies, {
      source: "opening_bias_probe",
      goalName: "direct_finisher",
      context,
    });
    if(openingAggressiveFinisher?.openingAggressionBiasApplied){
      logAiDecision("opening_direct_finisher_bias_unlocked", {
        turnAdvanceCount,
        scoreLead,
        planeId: openingAggressiveFinisher.plane?.id ?? null,
        enemyId: openingAggressiveFinisher.enemy?.id ?? null,
        reason: "opening_aggression_bias_applied",
      });
      return false;
    }
  }

  const openingExceptionFinisher = findDirectFinisherMove(context?.aiPlanes, context?.enemies, {
    source: "opening_exception_probe",
    goalName: "direct_finisher",
    context,
  });
  if(openingExceptionFinisher?.totalDist <= AI_OPENING_DIRECT_FINISHER_EXCEPTION_DISTANCE){
    const landingPoint = typeof getAiMoveLandingPoint === "function"
      ? getAiMoveLandingPoint(openingExceptionFinisher)
      : (() => {
          const flightDurationSec = typeof FIELD_FLIGHT_DURATION_SEC === "number"
            ? FIELD_FLIGHT_DURATION_SEC
            : 0;
          return {
            x: (openingExceptionFinisher?.plane?.x || 0) + (openingExceptionFinisher?.vx || 0) * flightDurationSec,
            y: (openingExceptionFinisher?.plane?.y || 0) + (openingExceptionFinisher?.vy || 0) * flightDurationSec,
          };
        })();
    const immediateResponseThreat = typeof getImmediateResponseThreatMeta === "function"
      ? getImmediateResponseThreatMeta(
          context,
          landingPoint?.x,
          landingPoint?.y,
          openingExceptionFinisher?.enemy || null
        )
      : { count: 0, nearestDist: Number.POSITIVE_INFINITY };
    const immediateHighThreat = immediateResponseThreat.count > 0 && (
      immediateResponseThreat.count >= AI_OPENING_DIRECT_FINISHER_EXCEPTION_THREAT_COUNT
      || (
        Number.isFinite(immediateResponseThreat.nearestDist)
        && immediateResponseThreat.nearestDist <= AI_OPENING_DIRECT_FINISHER_EXCEPTION_NEAREST_THREAT_DISTANCE
      )
    );
    const hasCriticalBaseThreat = Boolean(context?.criticalBaseThreat);
    if(!hasCriticalBaseThreat && !immediateHighThreat) return false;
  }

  logAiDecision("opening_skip_direct_finisher", {
    turnAdvanceCount,
    scoreLead,
    reason: mapAdjustedRestrictionApplied ? "opening_phase_restriction_map_adjusted" : "opening_center_priority",
    mapAdjustedRestrictionApplied,
    openingRestrictionTurnLimit,
    mapName: currentMapMeta?.name || currentMapName,
  });
  return true;
}

function tryPlanOpeningCenterControlMove(context){
  if(turnAdvanceCount > AI_OPENING_CENTER_TURN_LIMIT){
    return { move: null, rejectReason: "turn_limit" };
  }

  const groundedAiPlanes = getGroundedAiPlanes(context?.aiPlanes);
  if(groundedAiPlanes.length === 0){
    return { move: null, rejectReason: "no_grounded_plane" };
  }

  const center = getCenterControlAnchor();
  const readyCargo = cargoState.filter((cargo) => cargo?.state === "ready");
  const softPathPenaltyBase = Math.max(CELL_SIZE * 0.45, ATTACK_RANGE_PX * 0.1);
  const softPathScaleSteps = [0.82, 0.68, 0.54];
  const activeGoalName = `${context?.goalName || aiRoundState?.currentGoal || ""}`.toLowerCase();
  const strictPathFiltering = activeGoalName.includes("critical_base_threat")
    || activeGoalName.includes("emergency_base_defense");
  let pathCheckPerformed = false;
  const pathRejectCodeHits = new Map();
  function markPathRejectCode(code){
    const safeCode = typeof code === "string" && code.trim().length > 0 ? code : "blocked_path";
    pathRejectCodeHits.set(safeCode, (pathRejectCodeHits.get(safeCode) || 0) + 1);
  }

  function buildSoftPathMove(plane, targetX, targetY){
    if(strictPathFiltering) return null;
    if(!plane || !Number.isFinite(targetX) || !Number.isFinite(targetY)) return null;

    const dx = targetX - plane.x;
    const dy = targetY - plane.y;
    const fullDistance = Math.hypot(dx, dy);
    if(!Number.isFinite(fullDistance) || fullDistance <= CELL_SIZE * 0.2) return null;

    for(const scale of softPathScaleSteps){
      const probeX = plane.x + dx * scale;
      const probeY = plane.y + dy * scale;
      const move = planPathToPoint(plane, probeX, probeY, {
        goalName: "opening_center_soft_path",
        decisionReason: "opening_center_soft_path",
      });
      if(!move) continue;

      const remainingDistance = Math.hypot(targetX - probeX, targetY - probeY);
      const softPathPenalty = softPathPenaltyBase + remainingDistance * 0.16;
      return {
        ...move,
        softPathPenaltyApplied: true,
        softPathPenalty,
        softPathReasonCode: "soft_path_pass_with_penalty",
      };
    }

    return null;
  }

  let bestCargoCandidate = null;
  for(const plane of groundedAiPlanes){
    for(const cargo of readyCargo){
      pathCheckPerformed = true;
      const move = planPathToPoint(plane, cargo.x, cargo.y);
      if(!move){
        markPathRejectCode(planPathToPoint.lastRejectCode);
        continue;
      }
      const riskInfo = evaluateCargoPickupRisk(plane, cargo, context);
      const favorableInfo = evaluateFavorableCargoCandidate(plane, cargo, move, riskInfo);
      const canTakeCargo = riskInfo.isSafePath
        && (riskInfo.totalRisk <= AI_CARGO_RISK_ACCEPTANCE || favorableInfo?.isFavorableCargo);
      if(!canTakeCargo) continue;

      const adjustedScore = getAiPlaneAdjustedScore(move.totalDist, plane);
      const candidate = {
        plane,
        move,
        cargo,
        riskInfo,
        score: adjustedScore,
        idleTurns: getAiPlaneIdleTurns(plane),
      };
      const isLowerRisk = !bestCargoCandidate
        || riskInfo.totalRisk < bestCargoCandidate.riskInfo.totalRisk - 0.0001;
      const isRiskTie = bestCargoCandidate
        && Math.abs(riskInfo.totalRisk - bestCargoCandidate.riskInfo.totalRisk) <= 0.0001;
      if(isLowerRisk || (isRiskTie && compareAiCandidateByScoreAndRotation(candidate, bestCargoCandidate, ["opening_center_cargo", cargo?.id ?? ""]))){
        bestCargoCandidate = candidate;
      }
    }
  }

  if(bestCargoCandidate){
    aiRoundState.currentGoal = "opening_cargo_center";
    logAiDecision("opening_center_cargo", {
      planeId: bestCargoCandidate.plane.id,
      cargoId: bestCargoCandidate.cargo?.id ?? null,
      turnAdvanceCount,
      distance: Number(bestCargoCandidate.move.totalDist.toFixed(1)),
      risk: Number(bestCargoCandidate.riskInfo.totalRisk.toFixed(3)),
    });
    return { move: { plane: bestCargoCandidate.plane, ...bestCargoCandidate.move }, rejectReason: null };
  }

  let bestCenterMove = null;
  for(const plane of groundedAiPlanes){
    if(dist(plane, center) <= AI_CENTER_CONTROL_DISTANCE) continue;
    pathCheckPerformed = true;
    const directMove = planPathToPoint(plane, center.x, center.y);
    if(!directMove){
      markPathRejectCode(planPathToPoint.lastRejectCode);
    }
    const move = directMove || buildSoftPathMove(plane, center.x, center.y);
    if(!move) continue;

    const softPathPenalty = move?.softPathPenaltyApplied ? (move.softPathPenalty || softPathPenaltyBase) : 0;
    const candidate = {
      plane,
      move,
      score: getAiPlaneAdjustedScore(move.totalDist, plane) + softPathPenalty,
      idleTurns: getAiPlaneIdleTurns(plane),
    };
    if(compareAiCandidateByScoreAndRotation(candidate, bestCenterMove, ["opening_center_move"])){
      bestCenterMove = candidate;
    }
  }

  if(bestCenterMove){
    aiRoundState.currentGoal = "opening_center_control";
    logAiDecision("opening_center_move", {
      planeId: bestCenterMove.plane.id,
      turnAdvanceCount,
      distance: Number(bestCenterMove.move.totalDist.toFixed(1)),
      softPathPenaltyApplied: Boolean(bestCenterMove.move?.softPathPenaltyApplied),
      softPathPenalty: Number((bestCenterMove.move?.softPathPenalty || 0).toFixed(2)),
    });
    return { move: { plane: bestCenterMove.plane, ...bestCenterMove.move }, rejectReason: null };
  }

  return {
    move: null,
    rejectReason: pathCheckPerformed
      ? (
        [...pathRejectCodeHits.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        || "no_candidate_after_path_check"
      )
      : "no_opening_target_available",
  };
}


function getAiRiskProfile(context){
  const aiAliveCount = Array.isArray(context?.aiPlanes) ? context.aiPlanes.length : 0;
  const enemyAliveCount = Array.isArray(context?.enemies) ? context.enemies.length : 0;
  const scoreDiff = blueScore - greenScore;
  const blueToWin = Math.max(0, POINTS_TO_WIN - blueScore);
  const greenToWin = Math.max(0, POINTS_TO_WIN - greenScore);

  let profile = "balanced";
  if(scoreDiff <= -4 || (scoreDiff <= -2 && greenToWin <= 4) || (scoreDiff < 0 && aiAliveCount < enemyAliveCount)){
    profile = "comeback";
  } else if(scoreDiff >= 3 || blueToWin <= 3 || (scoreDiff >= 2 && aiAliveCount >= enemyAliveCount + 2)){
    profile = "conservative";
  }

  return {
    profile,
    scoreDiff,
    blueToWin,
    greenToWin,
    aiAliveCount,
    enemyAliveCount,
  };
}

function estimateCargoInterceptionChance(plane, cargoCenter, enemies){
  if(!Array.isArray(enemies) || enemies.length === 0) return 0;

  let threateningEnemies = 0;
  for(const enemy of enemies){
    const enemyDist = dist(enemy, cargoCenter);
    const planeDist = dist(plane, cargoCenter);
    const canEnemyShootLane = isPathClear(enemy.x, enemy.y, cargoCenter.x, cargoCenter.y);
    const enemyCanReachQuickly = enemyDist <= MAX_DRAG_DISTANCE * 0.85;
    if(canEnemyShootLane && enemyCanReachQuickly && enemyDist <= planeDist * 1.15){
      threateningEnemies += 1;
    }
  }
  return Math.min(1, threateningEnemies / Math.max(1, enemies.length));
}

function evaluateCargoPickupRisk(plane, cargo, context){
  const cargoCenter = getCargoVisualCenter(cargo);
  const nearestEnemyDistance = Array.isArray(context?.enemies) && context.enemies.length > 0
    ? Math.min(...context.enemies.map((enemy) => dist(enemy, cargoCenter)))
    : Number.POSITIVE_INFINITY;
  const interceptionChance = estimateCargoInterceptionChance(plane, cargoCenter, context?.enemies || []);
  const carryingEnemyFlag = Boolean(plane?.carriedFlagId && getFlagById(plane.carriedFlagId)?.color === "green");
  const isSafePath = isPathClear(plane.x, plane.y, cargoCenter.x, cargoCenter.y);

  let risk = 0;
  risk += nearestEnemyDistance < ATTACK_RANGE_PX ? 0.55 : nearestEnemyDistance < ATTACK_RANGE_PX * 1.5 ? 0.3 : 0.1;
  risk += interceptionChance * 0.35;
  risk += carryingEnemyFlag ? 0.6 : 0;
  if(!isSafePath) risk += 0.45;

  return {
    totalRisk: Math.min(1, risk),
    nearestEnemyDistance,
    interceptionChance,
    carryingEnemyFlag,
    isSafePath,
    cargoCenter,
  };
}

function evaluateFavorableCargoCandidate(plane, cargo, move, riskInfo){
  if(!plane || !cargo || !move || !riskInfo) return null;

  const yellowRiskMin = AI_CARGO_RISK_ACCEPTANCE;
  const yellowRiskMax = AI_CARGO_RISK_ACCEPTANCE + AI_CARGO_RISK_YELLOW_ZONE_MARGIN;
  const isNearPlane = move.totalDist <= AI_CARGO_FAVORABLE_DISTANCE;
  const inYellowRiskZone = riskInfo.totalRisk > yellowRiskMin && riskInfo.totalRisk <= yellowRiskMax;
  const hasImmediateThreat = riskInfo.nearestEnemyDistance <= AI_CARGO_IMMEDIATE_THREAT_DISTANCE
    || riskInfo.interceptionChance >= AI_CARGO_IMMEDIATE_THREAT_INTERCEPTION
    || riskInfo.carryingEnemyFlag;

  return {
    isFavorableCargo: isNearPlane && inYellowRiskZone && !hasImmediateThreat,
    isNearPlane,
    inYellowRiskZone,
    hasImmediateThreat,
    yellowRiskMin,
    yellowRiskMax,
  };
}

function tryPlanEarlyCargoPickupMove(context){
  tryPlanEarlyCargoPickupMove.lastRejectReason = null;
  if(turnAdvanceCount >= AI_EARLY_GAME_TURN_LIMIT){
    tryPlanEarlyCargoPickupMove.lastRejectReason = "turn_limit";
    return null;
  }

  const groundedAiPlanes = context.aiPlanes.filter((plane) => !flyingPoints.some(fp => fp.plane === plane));
  if(groundedAiPlanes.length === 0){
    tryPlanEarlyCargoPickupMove.lastRejectReason = "no_grounded_plane";
    return null;
  }
  const readyCargo = cargoState.filter((cargo) => cargo?.state === "ready");
  if(readyCargo.length === 0){
    tryPlanEarlyCargoPickupMove.lastRejectReason = "no_ready_cargo";
    return null;
  }

  let bestCandidate = null;
  let skipStats = {
    blockedByPath: 0,
    blockedByRisk: 0,
    blockedByDistance: 0,
    blockedByThreat: 0,
    considered: 0,
  };
  for(const plane of groundedAiPlanes){
    for(const cargo of readyCargo){
      skipStats.considered += 1;
      skipStats.pathChecks = (skipStats.pathChecks || 0) + 1;
      const move = planPathToPoint(plane, cargo.x, cargo.y);
      if(!move) continue;
      const riskInfo = evaluateCargoPickupRisk(plane, cargo, context);
      const favorableInfo = evaluateFavorableCargoCandidate(plane, cargo, move, riskInfo);
      const isAcceptedByBaseRisk = riskInfo.isSafePath && riskInfo.totalRisk <= AI_CARGO_RISK_ACCEPTANCE;
      const isAcceptedByFavorableOverride = riskInfo.isSafePath && favorableInfo?.isFavorableCargo;

      if(!isAcceptedByBaseRisk && !isAcceptedByFavorableOverride){
        if(!riskInfo.isSafePath) skipStats.blockedByPath += 1;
        if(riskInfo.totalRisk > AI_CARGO_RISK_ACCEPTANCE){
          if(favorableInfo?.hasImmediateThreat) skipStats.blockedByThreat += 1;
          else if(!favorableInfo?.isNearPlane) skipStats.blockedByDistance += 1;
          else skipStats.blockedByRisk += 1;
        }
        continue;
      }

      if(!bestCandidate || riskInfo.totalRisk < bestCandidate.riskInfo.totalRisk || (riskInfo.totalRisk === bestCandidate.riskInfo.totalRisk && move.totalDist < bestCandidate.move.totalDist)){
        bestCandidate = { plane, cargo, move, riskInfo, favorableInfo, acceptedBy: isAcceptedByBaseRisk ? "base_threshold" : "favorable_override" };
      }
    }
  }

  if(bestCandidate){
    tryPlanEarlyCargoPickupMove.lastRejectReason = null;
    aiRoundState.currentGoal = "pickup_cargo_early";
    logAiDecision("early_cargo_pickup", {
      planeId: bestCandidate.plane.id,
      risk: Number(bestCandidate.riskInfo.totalRisk.toFixed(3)),
      nearestEnemyDistance: Number(bestCandidate.riskInfo.nearestEnemyDistance.toFixed(1)),
      interceptionChance: Number(bestCandidate.riskInfo.interceptionChance.toFixed(2)),
      carryingEnemyFlag: bestCandidate.riskInfo.carryingEnemyFlag,
      moveTotalDist: Number(bestCandidate.move.totalDist.toFixed(1)),
      acceptedBy: bestCandidate.acceptedBy,
      favorableCargo: Boolean(bestCandidate.favorableInfo?.isFavorableCargo),
      turnAdvanceCount,
    });
    return { plane: bestCandidate.plane, ...bestCandidate.move };
  }

  logAiDecision("early_cargo_skip", {
    reason: "risk_distance_or_threat",
    turnAdvanceCount,
    cargoCount: readyCargo.length,
    skipStats,
  });
  tryPlanEarlyCargoPickupMove.lastRejectReason = skipStats.blockedByPath > 0
    ? "blocked_path"
    : skipStats.blockedByThreat > 0
      ? "cargo_immediate_threat"
      : skipStats.blockedByDistance > 0
        ? "cargo_too_far"
        : "cargo_risk";
  return null;
}

function getGroundedAiPlanes(aiPlanes){
  if(!Array.isArray(aiPlanes)) return [];
  return aiPlanes.filter((plane) => !flyingPoints.some(fp => fp.plane === plane));
}

function assignAiRolesForTurn(context){
  const groundedAiPlanes = getGroundedAiPlanes(context?.aiPlanes);
  if(groundedAiPlanes.length === 0) return null;

  const roles = {
    runner: null,
    interceptor: null,
    collector: null,
    striker: null,
  };
  const reservedPlaneIds = new Set();
  const claimPlaneForRole = (roleName, plane) => {
    if(!plane || reservedPlaneIds.has(plane.id)) return false;
    roles[roleName] = plane;
    reservedPlaneIds.add(plane.id);
    return true;
  };

  const shouldUseFlagsMode = Boolean(context?.shouldUseFlagsMode);
  const availableEnemyFlags = Array.isArray(context?.availableEnemyFlags) ? context.availableEnemyFlags : [];
  const readyCargo = cargoState.filter((cargo) => cargo?.state === "ready");

  const flagCarrier = shouldUseFlagsMode
    ? groundedAiPlanes.find((plane) => {
        if(!plane?.carriedFlagId) return false;
        const carriedFlag = getFlagById(plane.carriedFlagId);
        return carriedFlag?.color === "green";
      })
    : null;
  claimPlaneForRole("runner", flagCarrier);

  if(!roles.runner && shouldUseFlagsMode && availableEnemyFlags.length > 0){
    let bestRunner = null;
    for(const plane of groundedAiPlanes){
      if(reservedPlaneIds.has(plane.id)) continue;
      for(const flag of availableEnemyFlags){
        const anchor = getFlagAnchor(flag);
        const move = planPathToPoint(plane, anchor.x, anchor.y);
        if(move){
          const candidate = {
            plane,
            move,
            adjustedDist: getAiPlaneAdjustedScore(move.totalDist, plane),
            score: getAiPlaneAdjustedScore(move.totalDist, plane),
            idleTurns: getAiPlaneIdleTurns(plane),
          };
          if(compareAiCandidateByScoreAndRotation(candidate, bestRunner, ["assign_roles", "runner", flag?.id ?? ""])){
            bestRunner = candidate;
          }
        }
      }
    }
    claimPlaneForRole("runner", bestRunner?.plane || null);
  }

  if(context?.stolenBlueFlagCarrier){
    let bestInterceptor = null;
    for(const plane of groundedAiPlanes){
      if(reservedPlaneIds.has(plane.id)) continue;
      const toCarrier = planPathToPoint(plane, context.stolenBlueFlagCarrier.x, context.stolenBlueFlagCarrier.y);
      if(toCarrier){
        const baseAdjustedDist = getAiPlaneAdjustedScore(toCarrier.totalDist, plane);
        const aggressionBias = applyOpeningAggressionBias(baseAdjustedDist, {
          targetType: "interceptor",
          context,
          plane,
          enemy: context.stolenBlueFlagCarrier,
          hasValidPath: true,
        });
        const candidate = {
          plane,
          move: toCarrier,
          adjustedDist: aggressionBias.score,
          score: aggressionBias.score,
          openingAggressionBiasApplied: aggressionBias.applied,
          openingAggressionBiasTarget: aggressionBias.applied ? "interceptor" : null,
          idleTurns: getAiPlaneIdleTurns(plane),
        };
        if(compareAiCandidateByScoreAndRotation(candidate, bestInterceptor, ["assign_roles", "interceptor"])){
          bestInterceptor = candidate;
        }
      }
    }
    claimPlaneForRole("interceptor", bestInterceptor?.plane || null);
  }

  if(readyCargo.length > 0){
    let bestCollector = null;
    let bestFavorableCollector = null;
    for(const plane of groundedAiPlanes){
      if(reservedPlaneIds.has(plane.id)) continue;
      for(const cargo of readyCargo){
        const move = planPathToPoint(plane, cargo.x, cargo.y);
        if(!move) continue;
        const riskInfo = evaluateCargoPickupRisk(plane, cargo, context);
        const favorableInfo = evaluateFavorableCargoCandidate(plane, cargo, move, riskInfo);
        if(!riskInfo.isSafePath || riskInfo.totalRisk > AI_CARGO_RISK_ACCEPTANCE){
          const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
          if(favorableInfo?.isFavorableCargo && (!bestFavorableCollector || adjustedDist < bestFavorableCollector.adjustedDist || (adjustedDist === bestFavorableCollector.adjustedDist && riskInfo.totalRisk < bestFavorableCollector.riskInfo.totalRisk))){
            bestFavorableCollector = { plane, move, cargo, riskInfo, favorableInfo, adjustedDist };
          }
          continue;
        }
        const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
        if(!bestCollector || riskInfo.totalRisk < bestCollector.riskInfo.totalRisk || (riskInfo.totalRisk === bestCollector.riskInfo.totalRisk && adjustedDist < bestCollector.adjustedDist)){
          bestCollector = { plane, move, cargo, riskInfo, favorableInfo, adjustedDist };
        }
      }
    }
    if(!bestCollector && bestFavorableCollector){
      bestCollector = bestFavorableCollector;
      logAiDecision("collector_role_soft_override", {
        planeId: bestCollector.plane.id,
        cargoId: bestCollector.cargo?.id ?? null,
        risk: Number(bestCollector.riskInfo.totalRisk.toFixed(3)),
        distance: Number(bestCollector.move.totalDist.toFixed(1)),
      });
    }
    claimPlaneForRole("collector", bestCollector?.plane || null);
  }

  if(Array.isArray(context?.enemies) && context.enemies.length > 0){
    let bestStriker = null;
    for(const plane of groundedAiPlanes){
      if(reservedPlaneIds.has(plane.id)) continue;
      for(const enemy of context.enemies){
        const move = planPathToPoint(plane, enemy.x, enemy.y);
        if(!move) continue;
        const rawScore = move.totalDist + (isPathClear(plane.x, plane.y, enemy.x, enemy.y) ? 0 : ATTACK_RANGE_PX * 0.65);
        const baseScore = getAiPlaneAdjustedScore(rawScore, plane);
        const aggressionBias = applyOpeningAggressionBias(baseScore, {
          targetType: "attack_enemy_plane",
          context,
          plane,
          enemy,
          hasValidPath: true,
        });
        const intentAdjustment = getAiDynamiteIntentScoreAdjustment(aggressionBias.score, { ...move, plane }, { plane });
        const candidate = {
          plane,
          enemy,
          move,
          score: intentAdjustment.score,
          openingAggressionBiasApplied: aggressionBias.applied,
          openingAggressionBiasTarget: aggressionBias.applied ? "attack_enemy_plane" : null,
          idleTurns: getAiPlaneIdleTurns(plane),
        };
        if(compareAiCandidateByScoreAndRotation(candidate, bestStriker, ["assign_roles", "striker", enemy?.id ?? ""])){
          bestStriker = candidate;
        }
      }
    }
    claimPlaneForRole("striker", bestStriker?.plane || null);
  }

  const hasAnyRole = Boolean(roles.runner || roles.interceptor || roles.collector || roles.striker);
  if(!hasAnyRole) return null;

  const roleDebug = {};
  for(const [name, plane] of Object.entries(roles)){
    roleDebug[name] = plane?.id ?? null;
  }
  roleDebug.collectorReason = roles.collector ? "best_available_or_favorable_cargo" : "cargo_skipped_risk_distance_or_threat";
  logAiDecision("roles_assigned", roleDebug);

  return { roles, groundedAiPlanes };
}

function isLandingPointUnderPressure(plane, move, enemies){
  if(!plane || !move || !Array.isArray(enemies) || enemies.length === 0) return false;
  const landingPoint = {
    x: plane.x + (move.vx || 0) * FIELD_FLIGHT_DURATION_SEC,
    y: plane.y + (move.vy || 0) * FIELD_FLIGHT_DURATION_SEC,
  };
  const nearestEnemyDistance = Math.min(...enemies.map((enemy) => dist(enemy, landingPoint)));
  return nearestEnemyDistance < ATTACK_RANGE_PX * 1.1;
}

function planRoleDrivenAiMove(context, rolePack){
  if(!rolePack?.roles) return null;
  const { roles } = rolePack;
  const enemies = Array.isArray(context?.enemies) ? context.enemies : [];

  if(roles.runner){
    const runner = roles.runner;
    const isFlagCarrierRunner = Boolean(
      runner.carriedFlagId
      && getFlagById(runner.carriedFlagId)?.color === "green"
    );
    const runnerTargets = [];
    if(runner.carriedFlagId){
      const carriedFlag = getFlagById(runner.carriedFlagId);
      if(carriedFlag?.color === "green"){
        runnerTargets.push(context.homeBase);
      }
    }
    if(runnerTargets.length === 0 && context.shouldUseFlagsMode){
      for(const flag of context.availableEnemyFlags || []){
        runnerTargets.push(getFlagAnchor(flag));
      }
    }
    let bestRunnerMove = null;
    for(const target of runnerTargets){
      const move = planPathToPoint(runner, target.x, target.y);
      if(!move) continue;
      if(!isFlagCarrierRunner && isLandingPointUnderPressure(runner, move, enemies)) continue;
      const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, runner);
      if(!bestRunnerMove || adjustedDist < bestRunnerMove.adjustedDist){
        bestRunnerMove = { ...move, adjustedDist };
      }
    }
    if(bestRunnerMove){
      aiRoundState.currentGoal = "role_runner";
      return { plane: runner, ...bestRunnerMove };
    }
  }

  if(roles.interceptor && context?.stolenBlueFlagCarrier){
    const interceptor = roles.interceptor;
    const carrier = context.stolenBlueFlagCarrier;
    const blockTargets = [{ x: carrier.x, y: carrier.y }];
    if(context.homeBase){
      blockTargets.push({
        x: (carrier.x + context.homeBase.x) / 2,
        y: (carrier.y + context.homeBase.y) / 2,
      });
    }

    let bestInterceptMove = null;
    for(const target of blockTargets){
      const move = planPathToPoint(interceptor, target.x, target.y);
      if(!move) continue;
      const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, interceptor);
      const aggressionBias = applyOpeningAggressionBias(adjustedDist, {
        targetType: "interceptor",
        context,
        plane: interceptor,
        enemy: carrier,
        hasValidPath: true,
      });
      if(!bestInterceptMove || aggressionBias.score < bestInterceptMove.adjustedDist){
        bestInterceptMove = {
          ...move,
          adjustedDist: aggressionBias.score,
          openingAggressionBiasApplied: aggressionBias.applied,
          openingAggressionBiasTarget: aggressionBias.applied ? "interceptor" : null,
        };
      }
    }
    if(bestInterceptMove){
      aiRoundState.currentGoal = "role_interceptor";
      return { plane: interceptor, ...bestInterceptMove };
    }
  }

  if(roles.collector){
    const collector = roles.collector;
    const readyCargo = cargoState.filter((cargo) => cargo?.state === "ready");
    let bestCollectorMove = null;
    let bestFavorableCollectorMove = null;
    const collectorSkipStats = {
      blockedByPath: 0,
      blockedByRisk: 0,
      blockedByDistance: 0,
      blockedByThreat: 0,
    };
    for(const cargo of readyCargo){
      const move = planPathToPoint(collector, cargo.x, cargo.y);
      if(!move) continue;
      const riskInfo = evaluateCargoPickupRisk(collector, cargo, context);
      const favorableInfo = evaluateFavorableCargoCandidate(collector, cargo, move, riskInfo);
      if(!riskInfo.isSafePath){
        collectorSkipStats.blockedByPath += 1;
        continue;
      }
      if(riskInfo.totalRisk <= AI_CARGO_RISK_ACCEPTANCE){
        const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, collector);
        if(!bestCollectorMove || riskInfo.totalRisk < bestCollectorMove.riskInfo.totalRisk || (riskInfo.totalRisk === bestCollectorMove.riskInfo.totalRisk && adjustedDist < bestCollectorMove.adjustedDist)){
          bestCollectorMove = { cargo, move, riskInfo, favorableInfo, acceptedBy: "base_threshold", adjustedDist };
        }
        continue;
      }
      if(favorableInfo?.isFavorableCargo){
        const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, collector);
        if(!bestFavorableCollectorMove || adjustedDist < bestFavorableCollectorMove.adjustedDist || (adjustedDist === bestFavorableCollectorMove.adjustedDist && riskInfo.totalRisk < bestFavorableCollectorMove.riskInfo.totalRisk)){
          bestFavorableCollectorMove = { cargo, move, riskInfo, favorableInfo, acceptedBy: "favorable_override", adjustedDist };
        }
        continue;
      }

      if(favorableInfo?.hasImmediateThreat) collectorSkipStats.blockedByThreat += 1;
      else if(!favorableInfo?.isNearPlane) collectorSkipStats.blockedByDistance += 1;
      else collectorSkipStats.blockedByRisk += 1;
    }
    const selectedCollectorMove = bestCollectorMove || bestFavorableCollectorMove;
    if(selectedCollectorMove){
      aiRoundState.currentGoal = "role_collector";
      logAiDecision("role_collector_pick", {
        planeId: collector.id,
        cargoId: selectedCollectorMove.cargo?.id ?? null,
        acceptedBy: selectedCollectorMove.acceptedBy,
        risk: Number(selectedCollectorMove.riskInfo.totalRisk.toFixed(3)),
        distance: Number(selectedCollectorMove.move.totalDist.toFixed(1)),
      });
      return { plane: collector, ...selectedCollectorMove.move };
    }

    logAiDecision("role_collector_skip", {
      planeId: collector.id,
      reason: "risk_distance_or_threat",
      collectorSkipStats,
    });
  }

  if(roles.striker && enemies.length > 0){
    const striker = roles.striker;
    const riskProfile = context?.aiRiskProfile?.profile || "balanced";
    let bestStrike = null;
    for(const enemy of enemies){
      const directPathClear = isPathClear(striker.x, striker.y, enemy.x, enemy.y);
      const mirrorPressureTarget = isMirrorPressureTarget(enemy, context);
      const move = planPathToPoint(striker, enemy.x, enemy.y, {
        targetEnemy: enemy,
        targetEnemyId: enemy?.id ?? null,
        decisionReason: "role_striker",
        goalName: "attack_enemy_plane",
      });
      if(!move) continue;
      const isMirrorMove = move?.moveType === "mirror" || !directPathClear;
      const clearLaneBonus = directPathClear ? 0.7 : 1;
      const targetPriority = getAiTargetPriority(enemy, context);
      const longShotPenalty = getAiLongShotPenaltyMultiplier(move.totalDist, targetPriority, riskProfile, {
        onlyLineAvailable: !directPathClear,
        cleanRicochetAvailable: isMirrorMove,
      });
      const mirrorScoreBonus = isMirrorMove
        ? ((directPathClear ? 0 : AI_MIRROR_SCORE_BLOCKED_DIRECT_BONUS) + (mirrorPressureTarget ? AI_MIRROR_SCORE_PRESSURE_BONUS : 0))
        : 0;
      const rawHitChanceScore = move.totalDist * clearLaneBonus * longShotPenalty * (1 - Math.min(0.2, mirrorScoreBonus));
      const baseHitChanceScore = getAiPlaneAdjustedScore(rawHitChanceScore, striker);
      const intentAdjustment = getAiDynamiteIntentScoreAdjustment(baseHitChanceScore, { ...move, plane: striker }, { plane: striker });
      const multiKillMeta = getAiMultiKillPotentialContext({
        plane: striker,
        enemy,
        enemies,
        lineEndX: move?.moveType === "mirror" ? (move?.mirrorTarget?.x ?? enemy.x) : enemy.x,
        lineEndY: move?.moveType === "mirror" ? (move?.mirrorTarget?.y ?? enemy.y) : enemy.y,
      });
      const multiKillBonus = multiKillMeta.multiKillPotential === 1 ? AI_MULTI_KILL_PRIMARY_BONUS : 0;
      const hitChanceScore = Math.max(0, intentAdjustment.score - multiKillBonus);
      if(longShotPenalty > 1){
        logAiDecision("long_shot_penalty_observed", {
          source: "role_striker",
          planeId: striker.id,
          enemyId: enemy.id,
          riskProfile,
          targetPriority,
          distance: Number(move.totalDist.toFixed(1)),
          penalty: Number(longShotPenalty.toFixed(3)),
        });
        if(longShotPenalty >= AI_LONG_SHOT_LARGE_PENALTY_LOG_THRESHOLD){
          logAiDecision("long_shot_penalty_applied", {
            distanceToTarget: Number(move.totalDist.toFixed(1)),
            penalty: Number(longShotPenalty.toFixed(3)),
            targetPriority,
          });
        }
      }
      if(isMirrorMove){
        logAiDecision("mirror_selected_reason", {
          source: "role_striker",
          reason: !directPathClear ? "direct_path_blocked" : "tactical_preference",
          planeId: striker.id,
          enemyId: enemy.id,
          pressureTarget: mirrorPressureTarget,
          mirrorScoreBonus: Number(Math.min(0.2, mirrorScoreBonus).toFixed(3)),
          clearSky: isCurrentMapClearSky(),
          pathDistance: Number(move.totalDist.toFixed(1)),
        });
      }
      if(!bestStrike || hitChanceScore < bestStrike.hitChanceScore){
        bestStrike = {
          enemy,
          move,
          hitChanceScore,
          multiKillPotential: multiKillMeta.multiKillPotential,
          secondaryEnemyId: multiKillMeta.secondaryEnemyId,
          multiKillBonusApplied: multiKillBonus,
        };
      }
    }
    if(bestStrike){
      logAiDecision("role_striker_pick", {
        planeId: striker.id,
        enemyId: bestStrike.enemy?.id ?? null,
        secondaryEnemyId: bestStrike.secondaryEnemyId ?? null,
        multiKillPotential: bestStrike.multiKillPotential ?? 0,
        multiKillBonusApplied: Number((bestStrike.multiKillBonusApplied ?? 0).toFixed(3)),
        scoreAfterBonuses: Number(bestStrike.hitChanceScore.toFixed(3)),
      });
      aiRoundState.currentGoal = "role_striker";
      return { plane: striker, ...bestStrike.move };
    }
  }

  return null;
}

function buildFlagCaptureBaseCandidates(planes, availableEnemyFlags, options = {}){
  if(!Array.isArray(planes) || !Array.isArray(availableEnemyFlags)) return [];

  const goalText = `${options?.goalName || aiRoundState?.currentGoal || ""}`.toLowerCase();
  const isEmergencyDefenseStage = goalText.includes("critical_base_threat")
    || goalText.includes("emergency_base_defense");
  const allowBounceStage = true;
  const leftWallX = FIELD_LEFT + FIELD_BORDER_OFFSET_X;
  const rightWallX = FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X;
  const hasWallData = Number.isFinite(leftWallX) && Number.isFinite(rightWallX);
  const parsedMaxCandidatesPerClass = Number(options?.maxCandidatesPerClass);
  const maxCandidatesPerClass = Number.isFinite(parsedMaxCandidatesPerClass)
    ? Math.max(1, Math.floor(parsedMaxCandidatesPerClass))
    : 3;
  const parsedGapAttemptBudget = Number(options?.gapAttemptBudget);
  const parsedRicochetAttemptBudget = Number(options?.ricochetAttemptBudget);
  const defaultSpecialRouteBudget = Math.max(2, maxCandidatesPerClass * 3);
  let gapAttemptBudget = Number.isFinite(parsedGapAttemptBudget)
    ? Math.max(1, Math.floor(parsedGapAttemptBudget))
    : defaultSpecialRouteBudget;
  const ricochetAttemptBudget = Number.isFinite(parsedRicochetAttemptBudget)
    ? Math.max(1, Math.floor(parsedRicochetAttemptBudget))
    : defaultSpecialRouteBudget;
  const baseGoalName = options?.goalName || "capture_enemy_flag";
  const baseDecisionReason = options?.decisionReason || "flag_capture_direct";
  const groundedPlanes = planes.filter((plane) => !flyingPoints.some((fp) => fp.plane === plane));
  function snapshotRouteClassRejectDiagnosticEntry(entry){
    const safeEntry = entry && typeof entry === "object" ? entry : {};
    const safeRejectCodes = {};
    const rawRejectCodes = safeEntry.rejectCodes && typeof safeEntry.rejectCodes === "object" ? safeEntry.rejectCodes : {};
    for(const [code, count] of Object.entries(rawRejectCodes)){
      const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
      if(safeCount > 0) safeRejectCodes[code] = safeCount;
    }
    return {
      attempted: Number.isFinite(safeEntry.attempted) ? Math.max(0, safeEntry.attempted) : 0,
      accepted: Number.isFinite(safeEntry.accepted) ? Math.max(0, safeEntry.accepted) : 0,
      rejected: Number.isFinite(safeEntry.rejected) ? Math.max(0, safeEntry.rejected) : 0,
      rejectCodes: safeRejectCodes,
    };
  }

  const routeClassRejectDiagnosticsBefore = {
    direct: snapshotRouteClassRejectDiagnosticEntry(aiRoundState?.routeClassRejectDiagnostics?.classes?.direct),
    gap: snapshotRouteClassRejectDiagnosticEntry(aiRoundState?.routeClassRejectDiagnostics?.classes?.gap),
    ricochet: snapshotRouteClassRejectDiagnosticEntry(aiRoundState?.routeClassRejectDiagnostics?.classes?.ricochet),
  };

  const candidateTypeDiagnostics = {
    direct: {
      attempted: 0,
      preValidationRejected: 0,
      preValidationReasons: {},
      validationRejected: 0,
      validationReasons: {},
      accepted: 0,
    },
    gap: {
      attempted: 0,
      attemptsTotal: 0,
      attemptsReachedPlanPath: 0,
      attemptsTrimmedByBudget: 0,
      preValidationRejected: 0,
      preValidationReasons: {},
      validationRejected: 0,
      validationReasons: {},
      accepted: 0,
      attemptBudget: gapAttemptBudget,
    },
    ricochet: {
      attempted: 0,
      preValidationRejected: 0,
      preValidationReasons: {},
      validationRejected: 0,
      validationReasons: {},
      accepted: 0,
      attemptBudget: ricochetAttemptBudget,
    },
  };

  function addRejectReason(target, reason){
    if(!target || typeof target !== "object") return;
    const key = `${reason || "unknown"}`;
    target[key] = (target[key] || 0) + 1;
  }

  function mergeReasonMaps(...maps){
    const merged = {};
    for(const map of maps){
      if(!map || typeof map !== "object") continue;
      for(const [reason, count] of Object.entries(map)){
        const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
        if(safeCount <= 0) continue;
        merged[reason] = (merged[reason] || 0) + safeCount;
      }
    }
    return merged;
  }

  function getDominantShortlistRejectReasons(shortlistDiagnostics){
    if(!shortlistDiagnostics || typeof shortlistDiagnostics !== "object") return [];
    const directReasons = shortlistDiagnostics?.direct?.rejectReasons || {};
    const specialReasons = mergeReasonMaps(
      shortlistDiagnostics?.gap?.rejectReasons || {},
      shortlistDiagnostics?.ricochet?.rejectReasons || {}
    );
    const directRejected = Number.isFinite(shortlistDiagnostics?.direct?.rejectedBetweenInitialAndShortlist)
      ? Math.max(0, shortlistDiagnostics.direct.rejectedBetweenInitialAndShortlist)
      : 0;
    const specialRejected = ["gap", "ricochet"].reduce((sum, key) => {
      const value = shortlistDiagnostics?.[key]?.rejectedBetweenInitialAndShortlist;
      return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
    }, 0);
    if(specialRejected <= 0) return [];

    const ranked = Object.entries(specialReasons)
      .map(([reason, count]) => {
        const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
        const directCount = Number.isFinite(directReasons[reason]) ? Math.max(0, directReasons[reason]) : 0;
        const specialRate = specialRejected > 0 ? safeCount / specialRejected : 0;
        const directRate = directRejected > 0 ? directCount / directRejected : 0;
        return {
          reason,
          specialCount: safeCount,
          directCount,
          specialRate: Number(specialRate.toFixed(4)),
          directRate: Number(directRate.toFixed(4)),
          disproportionality: Number((specialRate - directRate).toFixed(4)),
        };
      })
      .filter((item) => item.specialCount > 0)
      .sort((a, b) => {
        if(Math.abs((b.disproportionality || 0) - (a.disproportionality || 0)) > 0.0001){
          return (b.disproportionality || 0) - (a.disproportionality || 0);
        }
        return (b.specialCount || 0) - (a.specialCount || 0);
      });

    return ranked.slice(0, 2);
  }

  function buildRouteClassRejectDiagnosticsDelta(){
    const runtimeDiagnostics = aiRoundState?.routeClassRejectDiagnostics?.classes;
    if(!runtimeDiagnostics || typeof runtimeDiagnostics !== "object") return null;

    function buildClassDelta(classKey){
      const current = runtimeDiagnostics[classKey] || {};
      const before = routeClassRejectDiagnosticsBefore[classKey] || {};
      const attempted = Math.max(0,
        (Number.isFinite(current.attempted) ? current.attempted : 0)
        - (Number.isFinite(before.attempted) ? before.attempted : 0)
      );
      const accepted = Math.max(0,
        (Number.isFinite(current.accepted) ? current.accepted : 0)
        - (Number.isFinite(before.accepted) ? before.accepted : 0)
      );
      const rejected = Math.max(0,
        (Number.isFinite(current.rejected) ? current.rejected : 0)
        - (Number.isFinite(before.rejected) ? before.rejected : 0)
      );
      const rejectCodes = {};
      const currentRejectCodes = current.rejectCodes && typeof current.rejectCodes === "object" ? current.rejectCodes : {};
      const beforeRejectCodes = before.rejectCodes && typeof before.rejectCodes === "object" ? before.rejectCodes : {};
      for(const [code, count] of Object.entries(currentRejectCodes)){
        const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
        const baseline = Number.isFinite(beforeRejectCodes[code]) ? Math.max(0, beforeRejectCodes[code]) : 0;
        const delta = Math.max(0, safeCount - baseline);
        if(delta > 0) rejectCodes[code] = delta;
      }
      return {
        attempted,
        accepted,
        rejected,
        rejectCodes,
      };
    }

    return {
      direct: buildClassDelta("direct"),
      gap: buildClassDelta("gap"),
      ricochet: buildClassDelta("ricochet"),
    };
  }

  function trimCandidatesByClass(candidates){
    if(!Array.isArray(candidates) || candidates.length === 0) return [];
    const sorted = candidates.slice().sort((a, b) => {
      const scoreA = Number.isFinite(a?.score) ? a.score : Number.POSITIVE_INFINITY;
      const scoreB = Number.isFinite(b?.score) ? b.score : Number.POSITIVE_INFINITY;
      if(Math.abs(scoreA - scoreB) > 0.000001) return scoreA - scoreB;
      const idleA = Number.isFinite(a?.idleTurns) ? a.idleTurns : 0;
      const idleB = Number.isFinite(b?.idleTurns) ? b.idleTurns : 0;
      if(idleA !== idleB) return idleB - idleA;
      return `${a?.plane?.id || ""}`.localeCompare(`${b?.plane?.id || ""}`);
    });
    return sorted.slice(0, maxCandidatesPerClass);
  }

  const directCandidates = [];
  for(const plane of planes){
    const isFlying = flyingPoints.some((fp) => fp.plane === plane);
    if(isFlying){
      candidateTypeDiagnostics.direct.preValidationRejected += availableEnemyFlags.length;
      addRejectReason(candidateTypeDiagnostics.direct.preValidationReasons, "plane_not_grounded");
      continue;
    }
    for(const flag of availableEnemyFlags){
      candidateTypeDiagnostics.direct.attempted += 1;
      const targetAnchor = getFlagAnchor(flag);
      const move = planPathToPoint(plane, targetAnchor.x, targetAnchor.y, {
        goalName: baseGoalName,
        decisionReason: baseDecisionReason,
        routeClass: "direct",
      });
      if(!move){
        candidateTypeDiagnostics.direct.validationRejected += 1;
        addRejectReason(candidateTypeDiagnostics.direct.validationReasons, planPathToPoint.lastRejectCode || "validation_failed");
        continue;
      }
      const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
      const classScoreMeta = getAiCandidateClassComparableScore({
        plane,
        routeDistance: move.totalDist,
        fromPoint: plane,
        landingPoint: { x: plane.x + move.vx * FIELD_FLIGHT_DURATION_SEC, y: plane.y + move.vy * FIELD_FLIGHT_DURATION_SEC },
        targetPoint: targetAnchor,
        candidateClass: "direct",
        directPathBlocked: false,
        goalName: baseGoalName,
      });
      const classWeightPenalty = classScoreMeta.normalizedClassScore * MAX_DRAG_DISTANCE * 0.035;
      const routeQualityPenalty = (Number.isFinite(move?.routeQualityScore) ? (1 - move.routeQualityScore) : 0) * MAX_DRAG_DISTANCE * 0.04;
      const routeMetrics = move?.routeMetrics || null;
      const directLowPassability = Boolean(
        Number.isFinite(routeMetrics?.clearance) && routeMetrics.clearance <= AI_DIRECT_LOW_PASSABILITY_CLEARANCE_THRESHOLD_PX
      ) || Boolean(
        Number.isFinite(routeMetrics?.corridorTightness) && routeMetrics.corridorTightness >= AI_DIRECT_LOW_PASSABILITY_CORRIDOR_TIGHTNESS_THRESHOLD
      );
      const lowPassabilityPenalty = !isEmergencyDefenseStage && directLowPassability
        ? AI_DIRECT_LOW_PASSABILITY_SCORE_PENALTY
        : 0;
      const finalScore = adjustedDist + classWeightPenalty + routeQualityPenalty + lowPassabilityPenalty;
      directCandidates.push({
        plane,
        flag,
        ...move,
        candidateType: "direct",
        adjustedDist,
        score: finalScore,
        normalizedScore: finalScore,
        classScoreBreakdown: classScoreMeta.classScoreBreakdown,
        finalScoreBreakdown: {
          distance: Number(adjustedDist.toFixed(3)),
          classWeightPenalty: Number(classWeightPenalty.toFixed(3)),
          routeQualityPenalty: Number(routeQualityPenalty.toFixed(3)),
          lowPassabilityPenalty: Number(lowPassabilityPenalty.toFixed(3)),
          total: Number(finalScore.toFixed(3)),
        },
        lowPassabilityBlockedLike: directLowPassability,
        selectedClass: "direct",
        idleTurns: getAiPlaneIdleTurns(plane),
      });
      candidateTypeDiagnostics.direct.accepted += 1;
    }
  }

  const gapCandidates = [];
  const gapOffsets = [
    { x: -CELL_SIZE * 0.55, y: 0 },
    { x: CELL_SIZE * 0.55, y: 0 },
    { x: 0, y: -CELL_SIZE * 0.55 },
    { x: 0, y: CELL_SIZE * 0.55 },
  ];
  const gapAttempts = [];
  for(const plane of planes){
    const isFlying = flyingPoints.some((fp) => fp.plane === plane);
    if(isFlying){
      candidateTypeDiagnostics.gap.preValidationRejected += availableEnemyFlags.length * gapOffsets.length;
      addRejectReason(candidateTypeDiagnostics.gap.preValidationReasons, "plane_not_grounded");
      continue;
    }
    for(const flag of availableEnemyFlags){
      const targetAnchor = getFlagAnchor(flag);
      for(const offset of gapOffsets){
        gapAttempts.push({ plane, flag, targetAnchor, offset });
      }
    }
  }

  candidateTypeDiagnostics.gap.attemptsTotal = gapAttempts.length;
  if(!Number.isFinite(parsedGapAttemptBudget)){
    if(isEmergencyDefenseStage){
      gapAttemptBudget = defaultSpecialRouteBudget;
    } else {
      const gapBudgetMin = Math.max(2, maxCandidatesPerClass * 2);
      const gapBudgetMax = Math.max(gapBudgetMin, maxCandidatesPerClass * 12);
      const gapBudgetScaledByAttempts = gapAttempts.length;
      gapAttemptBudget = Math.max(gapBudgetMin, Math.min(gapBudgetMax, gapBudgetScaledByAttempts));
    }
  }
  candidateTypeDiagnostics.gap.attemptBudget = gapAttemptBudget;

  for(let index = 0; index < gapAttempts.length && candidateTypeDiagnostics.gap.attempted < gapAttemptBudget; index += 1){
    const { plane, flag, targetAnchor, offset } = gapAttempts[index];
    candidateTypeDiagnostics.gap.attempted += 1;
    candidateTypeDiagnostics.gap.attemptsReachedPlanPath += 1;
    const move = planPathToPoint(plane, targetAnchor.x + offset.x, targetAnchor.y + offset.y, {
      goalName: baseGoalName,
      decisionReason: "flag_capture_gap_candidate",
      routeClass: "gap",
    });
    if(!move){
      candidateTypeDiagnostics.gap.validationRejected += 1;
      addRejectReason(candidateTypeDiagnostics.gap.validationReasons, planPathToPoint.lastRejectCode || "validation_failed");
      continue;
    }
    const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
    const classScoreMeta = getAiCandidateClassComparableScore({
      plane,
      routeDistance: move.totalDist,
      fromPoint: plane,
      landingPoint: { x: plane.x + move.vx * FIELD_FLIGHT_DURATION_SEC, y: plane.y + move.vy * FIELD_FLIGHT_DURATION_SEC },
      targetPoint: targetAnchor,
      candidateClass: "gap",
      directPathBlocked: !isPathClear(plane.x, plane.y, targetAnchor.x, targetAnchor.y),
      goalName: baseGoalName,
    });
    const classWeightPenalty = classScoreMeta.normalizedClassScore * MAX_DRAG_DISTANCE * 0.035;
    const routeQualityPenalty = (Number.isFinite(move?.routeQualityScore) ? (1 - move.routeQualityScore) : 0) * MAX_DRAG_DISTANCE * 0.04;
    const finalScore = adjustedDist + classWeightPenalty + routeQualityPenalty;
    gapCandidates.push({
      plane,
      flag,
      ...move,
      candidateType: "gap",
      gapOffsetX: Number(offset.x.toFixed(1)),
      gapOffsetY: Number(offset.y.toFixed(1)),
      adjustedDist,
      score: finalScore,
      normalizedScore: finalScore,
      classScoreBreakdown: classScoreMeta.classScoreBreakdown,
      finalScoreBreakdown: {
        distance: Number(adjustedDist.toFixed(3)),
        classWeightPenalty: Number(classWeightPenalty.toFixed(3)),
        routeQualityPenalty: Number(routeQualityPenalty.toFixed(3)),
        lowPassabilityPenalty: 0,
        total: Number(finalScore.toFixed(3)),
      },
      lowPassabilityBlockedLike: false,
      selectedClass: "gap",
      idleTurns: getAiPlaneIdleTurns(plane),
    });
    candidateTypeDiagnostics.gap.accepted += 1;
  }

  if(gapAttempts.length === 0){
    candidateTypeDiagnostics.gap.preValidationRejected += 1;
    addRejectReason(candidateTypeDiagnostics.gap.preValidationReasons, groundedPlanes.length === 0 ? "no_grounded_planes" : "no_target_pairs");
  } else if(candidateTypeDiagnostics.gap.attempted < gapAttempts.length){
    const trimmedByBudget = gapAttempts.length - candidateTypeDiagnostics.gap.attempted;
    candidateTypeDiagnostics.gap.attemptsTrimmedByBudget = trimmedByBudget;
    candidateTypeDiagnostics.gap.preValidationRejected += trimmedByBudget;
    addRejectReason(candidateTypeDiagnostics.gap.preValidationReasons, "attempt_budget_exhausted");
  }

  const bounceCandidates = [];
  const ricochetAttempts = [];
  if(!allowBounceStage){
    candidateTypeDiagnostics.ricochet.preValidationRejected += 1;
    addRejectReason(candidateTypeDiagnostics.ricochet.preValidationReasons, "ricochet_disabled");
  } else if(!hasWallData){
    candidateTypeDiagnostics.ricochet.preValidationRejected += 1;
    addRejectReason(candidateTypeDiagnostics.ricochet.preValidationReasons, "missing_wall_geometry");
  } else {
    for(const plane of planes){
      const isFlying = flyingPoints.some((fp) => fp.plane === plane);
      if(isFlying){
        candidateTypeDiagnostics.ricochet.preValidationRejected += availableEnemyFlags.length * 2;
        addRejectReason(candidateTypeDiagnostics.ricochet.preValidationReasons, "plane_not_grounded");
        continue;
      }
      for(const flag of availableEnemyFlags){
        const targetAnchor = getFlagAnchor(flag);
        const isDirectPathBlockedForTarget = !isPathClear(plane.x, plane.y, targetAnchor.x, targetAnchor.y);
        if(isEmergencyDefenseStage && !isDirectPathBlockedForTarget){
          candidateTypeDiagnostics.ricochet.preValidationRejected += 2;
          addRejectReason(candidateTypeDiagnostics.ricochet.preValidationReasons, "emergency_stage_direct_open_lane");
          continue;
        }
        ricochetAttempts.push({
          plane,
          flag,
          targetAnchor,
          mirroredTarget: {
            wall: "left",
            wallX: leftWallX,
            targetX: 2 * leftWallX - targetAnchor.x,
            targetY: targetAnchor.y,
          },
        });
        ricochetAttempts.push({
          plane,
          flag,
          targetAnchor,
          mirroredTarget: {
            wall: "right",
            wallX: rightWallX,
            targetX: 2 * rightWallX - targetAnchor.x,
            targetY: targetAnchor.y,
          },
        });
      }
    }

    for(let index = 0; index < ricochetAttempts.length && candidateTypeDiagnostics.ricochet.attempted < ricochetAttemptBudget; index += 1){
      const { plane, flag, targetAnchor, mirroredTarget } = ricochetAttempts[index];
      candidateTypeDiagnostics.ricochet.attempted += 1;
      const move = planPathToPoint(plane, mirroredTarget.targetX, mirroredTarget.targetY, {
        goalName: baseGoalName,
        decisionReason: "flag_capture_bounce_candidate",
        routeClass: "ricochet",
      });
      if(!move){
        candidateTypeDiagnostics.ricochet.validationRejected += 1;
        addRejectReason(candidateTypeDiagnostics.ricochet.validationReasons, planPathToPoint.lastRejectCode || "validation_failed");
        continue;
      }
      const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
      const classScoreMeta = getAiCandidateClassComparableScore({
        plane,
        routeDistance: move.totalDist,
        fromPoint: plane,
        landingPoint: { x: plane.x + move.vx * FIELD_FLIGHT_DURATION_SEC, y: plane.y + move.vy * FIELD_FLIGHT_DURATION_SEC },
        targetPoint: targetAnchor,
        candidateClass: "ricochet",
        directPathBlocked: !isPathClear(plane.x, plane.y, targetAnchor.x, targetAnchor.y),
        goalName: baseGoalName,
      });
      const classWeightPenalty = classScoreMeta.normalizedClassScore * MAX_DRAG_DISTANCE * 0.035;
      const routeQualityPenalty = (Number.isFinite(move?.routeQualityScore) ? (1 - move.routeQualityScore) : 0) * MAX_DRAG_DISTANCE * 0.04;
      const finalScore = adjustedDist + classWeightPenalty + routeQualityPenalty;
      bounceCandidates.push({
        plane,
        flag,
        ...move,
        candidateType: "bounce",
        bounceCandidateUsed: true,
        bounceSourceWall: mirroredTarget.wall,
        bounceSourceWallX: mirroredTarget.wallX,
        adjustedDist,
        score: finalScore,
        normalizedScore: finalScore,
        classScoreBreakdown: classScoreMeta.classScoreBreakdown,
        finalScoreBreakdown: {
          distance: Number(adjustedDist.toFixed(3)),
          classWeightPenalty: Number(classWeightPenalty.toFixed(3)),
          routeQualityPenalty: Number(routeQualityPenalty.toFixed(3)),
          lowPassabilityPenalty: 0,
          total: Number(finalScore.toFixed(3)),
        },
        lowPassabilityBlockedLike: false,
        selectedClass: "ricochet",
        idleTurns: getAiPlaneIdleTurns(plane),
      });
      candidateTypeDiagnostics.ricochet.accepted += 1;
    }

    if(ricochetAttempts.length === 0){
      candidateTypeDiagnostics.ricochet.preValidationRejected += 1;
      addRejectReason(candidateTypeDiagnostics.ricochet.preValidationReasons, groundedPlanes.length === 0 ? "no_grounded_planes" : "no_target_pairs");
    } else if(candidateTypeDiagnostics.ricochet.attempted < ricochetAttempts.length){
      candidateTypeDiagnostics.ricochet.preValidationRejected += ricochetAttempts.length - candidateTypeDiagnostics.ricochet.attempted;
      addRejectReason(candidateTypeDiagnostics.ricochet.preValidationReasons, "attempt_budget_exhausted");
    }
  }

  const trimmedDirectCandidates = trimCandidatesByClass(directCandidates);
  const trimmedGapCandidates = trimCandidatesByClass(gapCandidates);
  const trimmedBounceCandidates = trimCandidatesByClass(bounceCandidates);

  const isNormalStage = !isEmergencyDefenseStage;
  const hadSpecialInInitialSet = gapCandidates.length > 0 && bounceCandidates.length > 0;
  const lostBothSpecialInShortlist = trimmedGapCandidates.length === 0 && trimmedBounceCandidates.length === 0;
  if(isNormalStage && hadSpecialInInitialSet && lostBothSpecialInShortlist){
    const fallbackGap = gapCandidates
      .slice()
      .sort((a, b) => (Number.isFinite(a?.score) ? a.score : Number.POSITIVE_INFINITY) - (Number.isFinite(b?.score) ? b.score : Number.POSITIVE_INFINITY))[0] || null;
    const fallbackRicochet = bounceCandidates
      .slice()
      .sort((a, b) => (Number.isFinite(a?.score) ? a.score : Number.POSITIVE_INFINITY) - (Number.isFinite(b?.score) ? b.score : Number.POSITIVE_INFINITY))[0] || null;
    if(fallbackGap) trimmedGapCandidates.push(fallbackGap);
    if(fallbackRicochet) trimmedBounceCandidates.push(fallbackRicochet);
    logAiDecision("flag_capture_shortlist_special_route_restore", {
      goalName: baseGoalName,
      reason: "post_check_preserve_gap_and_ricochet",
      restoredGap: Boolean(fallbackGap),
      restoredRicochet: Boolean(fallbackRicochet),
    });
  }

  function buildShortlistDiagnostics(classKey, initialCandidates, shortlistedCandidates, typeDiagnostics){
    const initialCount = Array.isArray(initialCandidates) ? initialCandidates.length : 0;
    const shortlistCount = Array.isArray(shortlistedCandidates) ? shortlistedCandidates.length : 0;
    const scoreCutoffRejected = Math.max(0, initialCount - shortlistCount);
    const rejectReasons = mergeReasonMaps(
      typeDiagnostics?.preValidationReasons,
      typeDiagnostics?.validationReasons,
      scoreCutoffRejected > 0 ? { shortlist_score_cutoff: scoreCutoffRejected } : null
    );
    const rejectedBetweenInitialAndShortlist = Math.max(0,
      (Number.isFinite(typeDiagnostics?.preValidationRejected) ? typeDiagnostics.preValidationRejected : 0)
      + (Number.isFinite(typeDiagnostics?.validationRejected) ? typeDiagnostics.validationRejected : 0)
      + scoreCutoffRejected
    );
    return {
      classKey,
      initialReachable: initialCount,
      shortlistCount,
      rejectedBetweenInitialAndShortlist,
      rejectReasons,
    };
  }

  const shortlistDiagnostics = {
    direct: buildShortlistDiagnostics("direct", directCandidates, trimmedDirectCandidates, candidateTypeDiagnostics.direct),
    gap: buildShortlistDiagnostics("gap", gapCandidates, trimmedGapCandidates, candidateTypeDiagnostics.gap),
    ricochet: buildShortlistDiagnostics("ricochet", bounceCandidates, trimmedBounceCandidates, candidateTypeDiagnostics.ricochet),
  };
  const routeClassRejectDiagnostics = buildRouteClassRejectDiagnosticsDelta();
  const disproportionateShortlistRejectReasons = getDominantShortlistRejectReasons(shortlistDiagnostics);

  const combinedCandidates = [
    ...trimmedDirectCandidates,
    ...trimmedGapCandidates,
    ...trimmedBounceCandidates,
  ];

  aiRoundState.lastInitialCandidateSetDiagnostics = {
    source: "buildFlagCaptureBaseCandidates",
    goalName: baseGoalName,
    directCount: trimmedDirectCandidates.length,
    gapCount: trimmedGapCandidates.length,
    ricochetCount: trimmedBounceCandidates.length,
    hasDirect: trimmedDirectCandidates.length > 0,
    hasGap: trimmedGapCandidates.length > 0,
    hasRicochet: trimmedBounceCandidates.length > 0,
    candidateTypeDiagnostics,
    shortlistDiagnostics,
    routeClassRejectDiagnostics,
    disproportionateShortlistRejectReasons,
    zeroCandidateReasons: {
      direct: trimmedDirectCandidates.length > 0 ? [] : [
        ...(Object.keys(candidateTypeDiagnostics.direct.preValidationReasons || {}).length > 0 ? ["filtered_before_validation"] : []),
        ...(Object.keys(candidateTypeDiagnostics.direct.validationReasons || {}).length > 0 ? ["geometrically_unreachable_or_rejected"] : []),
      ],
      gap: trimmedGapCandidates.length > 0 ? [] : [
        ...(Object.keys(candidateTypeDiagnostics.gap.preValidationReasons || {}).length > 0 ? ["filtered_before_validation"] : []),
        ...(Object.keys(candidateTypeDiagnostics.gap.validationReasons || {}).length > 0 ? ["geometrically_unreachable_or_rejected"] : []),
      ],
      ricochet: trimmedBounceCandidates.length > 0 ? [] : [
        ...(Object.keys(candidateTypeDiagnostics.ricochet.preValidationReasons || {}).length > 0 ? ["filtered_before_validation"] : []),
        ...(Object.keys(candidateTypeDiagnostics.ricochet.validationReasons || {}).length > 0 ? ["geometrically_unreachable_or_rejected"] : []),
      ],
    },
  };

  logAiDecision("flag_capture_candidate_summary", {
    goalName: baseGoalName,
    decisionReason: options?.decisionReason || null,
    directCount: trimmedDirectCandidates.length,
    gapCount: trimmedGapCandidates.length,
    ricochetCount: trimmedBounceCandidates.length,
    directReachableCount: directCandidates.length,
    gapReachableCount: gapCandidates.length,
    ricochetReachableCount: bounceCandidates.length,
    interclassComparison: true,
    maxCandidatesPerClass,
    gapAttemptBudget,
    ricochetAttemptBudget,
    candidateTypeDiagnostics,
    shortlistDiagnostics,
    routeClassRejectDiagnostics,
    disproportionateShortlistRejectReasons,
    bounceAllowed: allowBounceStage,
    isEmergencyDefenseStage,
    emergencyBounceBlockedDirectOnly: isEmergencyDefenseStage,
  });

  return combinedCandidates;
}

function planModeDrivenAiMove(context){
  planModeDrivenAiMove.lastRejectReason = null;
  const {
    aiPlanes,
    homeBase,
    availableEnemyFlags,
    stolenBlueFlagCarrier,
    shouldUseFlagsMode,
    enemies
  } = context;

  const groundedAiPlanes = aiPlanes.filter((plane) => !flyingPoints.some(fp=>fp.plane===plane));
  if(groundedAiPlanes.length === 0){
    planModeDrivenAiMove.lastRejectReason = "no_grounded_plane";
    return null;
  }

  const carrier = shouldUseFlagsMode ? groundedAiPlanes.find(p => {
    if(!p.carriedFlagId) return false;
    const carriedFlag = getFlagById(p.carriedFlagId);
    return carriedFlag?.color === "green";
  }) : null;
  if(carrier){
    aiRoundState.currentGoal = "return_with_flag";
    const move = planPathToPoint(carrier, homeBase.x, homeBase.y);
    if(move) return { plane: carrier, ...move };

    const directDx = homeBase.x - carrier.x;
    const directDy = homeBase.y - carrier.y;
    const directDist = Math.hypot(directDx, directDy);
    const dirX = directDist > 0 ? directDx / directDist : 1;
    const dirY = directDist > 0 ? directDy / directDist : 0;
    const sideX = -dirY;
    const sideY = dirX;
    const waypointCount = 5;
    const fallbackWaypoints = [];
    for(let i = 1; i <= waypointCount; i += 1){
      const t = i / (waypointCount + 1);
      const lateralMagnitude = Math.max(CELL_SIZE * 0.75, directDist * 0.08);
      const lateralSign = i % 2 === 0 ? -1 : 1;
      const lateralScale = ((i - 1) % 3 === 0) ? 1 : 0.6;
      fallbackWaypoints.push({
        x: carrier.x + directDx * t + sideX * lateralMagnitude * lateralSign * lateralScale,
        y: carrier.y + directDy * t + sideY * lateralMagnitude * lateralSign * lateralScale,
      });
    }

    for(const waypoint of fallbackWaypoints){
      const fallbackMove = planPathToPoint(carrier, waypoint.x, waypoint.y);
      if(!fallbackMove) continue;
      aiRoundState.currentGoal = "return_with_flag_fallback";
      logAiDecision("return_with_flag_fallback_path", {
        planeId: carrier.id,
        goalName: "return_with_flag_fallback",
        fallbackType: "waypoint",
        waypointX: Number(waypoint.x.toFixed(1)),
        waypointY: Number(waypoint.y.toFixed(1)),
        distanceToHome: Number(directDist.toFixed(1)),
      });
      return { plane: carrier, ...fallbackMove, goalName: "return_with_flag_fallback" };
    }

    if(Array.isArray(enemies) && enemies.length > 0){
      const nearestEnemy = enemies.reduce((nearest, enemy) => (
        !nearest || dist(carrier, enemy) < dist(carrier, nearest) ? enemy : nearest
      ), null);
      if(nearestEnemy){
        const awayDx = carrier.x - nearestEnemy.x;
        const awayDy = carrier.y - nearestEnemy.y;
        const awayDist = Math.hypot(awayDx, awayDy);
        const awayX = awayDist > 0 ? awayDx / awayDist : 0;
        const awayY = awayDist > 0 ? awayDy / awayDist : 0;
        const blendX = dirX * 0.65 + awayX * 0.35;
        const blendY = dirY * 0.65 + awayY * 0.35;
        const blendDist = Math.hypot(blendX, blendY);
        const retreatDirX = blendDist > 0 ? blendX / blendDist : dirX;
        const retreatDirY = blendDist > 0 ? blendY / blendDist : dirY;
        const retreatDistance = Math.max(CELL_SIZE * 2, MAX_DRAG_DISTANCE * 0.45);
        const retreatTargetX = carrier.x + retreatDirX * retreatDistance;
        const retreatTargetY = carrier.y + retreatDirY * retreatDistance;
        const safeRetreatMove = planPathToPoint(carrier, retreatTargetX, retreatTargetY);
        if(safeRetreatMove){
          aiRoundState.currentGoal = "return_with_flag_fallback";
          logAiDecision("return_with_flag_fallback_path", {
            planeId: carrier.id,
            goalName: "return_with_flag_fallback",
            fallbackType: "safe_retreat",
            nearestEnemyId: nearestEnemy.id ?? null,
            retreatTargetX: Number(retreatTargetX.toFixed(1)),
            retreatTargetY: Number(retreatTargetY.toFixed(1)),
            distanceToHome: Number(directDist.toFixed(1)),
          });
          return { plane: carrier, ...safeRetreatMove, goalName: "return_with_flag_fallback" };
        }
      }
    }

    logAiDecision("return_with_flag_fallback_failed", {
      planeId: carrier.id,
      goalName: "return_with_flag_fallback",
      reason: "no_valid_waypoint_or_safe_retreat",
      distanceToHome: Number(directDist.toFixed(1)),
      hasEnemies: Array.isArray(enemies) && enemies.length > 0,
    });
    planModeDrivenAiMove.lastRejectReason = "carrier_return_path_blocked";
  }

  if(aiRoundState.mode === AI_MODES.DEFENSE && stolenBlueFlagCarrier){
    aiRoundState.currentGoal = "eliminate_flag_carrier";
    let bestDefenseMove = null;
    let bestPreparationMove = null;
    const dynamiteAvailable = hasBlueDynamiteAvailable();
    for(const plane of groundedAiPlanes){
      const move = planPathToPoint(plane, stolenBlueFlagCarrier.x, stolenBlueFlagCarrier.y);
      if(move){
        const baseAdjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
        const aggressionBias = applyOpeningAggressionBias(baseAdjustedDist, {
          targetType: "interceptor",
          context,
          plane,
          enemy: stolenBlueFlagCarrier,
          hasValidPath: true,
        });
        const intentAdjustment = getAiDynamiteIntentScoreAdjustment(aggressionBias.score, { ...move, plane }, { plane });
        const candidate = {
          plane,
          ...move,
          adjustedDist: intentAdjustment.score,
          score: intentAdjustment.score,
          openingAggressionBiasApplied: aggressionBias.applied,
          openingAggressionBiasTarget: aggressionBias.applied ? "interceptor" : null,
          idleTurns: getAiPlaneIdleTurns(plane),
        };
        if(compareAiCandidateByScoreAndRotation(candidate, bestDefenseMove, ["mode_defense", "direct"])){
          bestDefenseMove = candidate;
        }
        continue;
      }

      const preparationMove = findSafePreparationMoveForAttack(plane, stolenBlueFlagCarrier);
      if(preparationMove){
        const basePreparationScore = getAiPlaneAdjustedScore(preparationMove.totalDist, plane);
        const preparationIntentAdjustment = getAiDynamiteIntentScoreAdjustment(basePreparationScore, { ...preparationMove, plane }, { plane });
        const candidate = {
          plane,
          ...preparationMove,
          adjustedDist: preparationIntentAdjustment.score,
          targetEnemy: stolenBlueFlagCarrier,
          goalName: dynamiteAvailable ? "prepare_dynamite_breach" : "prepare_clear_shot",
          score: preparationIntentAdjustment.score,
          idleTurns: getAiPlaneIdleTurns(plane),
        };
        if(compareAiCandidateByScoreAndRotation(candidate, bestPreparationMove, ["mode_defense", "prepare"])){
          bestPreparationMove = candidate;
        }
      }
    }
    if(bestDefenseMove) return bestDefenseMove;
    if(bestPreparationMove){
      aiRoundState.currentGoal = bestPreparationMove.goalName;
      return bestPreparationMove;
    }
  }

  if(aiRoundState.mode === AI_MODES.FLAG_PRESSURE && availableEnemyFlags.length > 0){
    aiRoundState.currentGoal = "capture_enemy_flag";
    let bestCap = null;
    const capCandidates = buildFlagCaptureBaseCandidates(groundedAiPlanes, availableEnemyFlags, {
      goalName: "capture_enemy_flag",
      decisionReason: "mode_flag_pressure",
    });
    for(const candidate of capCandidates){
      if(compareAiCandidateByScoreAndRotation(candidate, bestCap, ["mode_flag_pressure", candidate?.flag?.id ?? "", candidate?.candidateType || "direct"])){
        candidate.classTieBreakReason = compareAiCandidateByScoreAndRotation.lastClassTieBreakReason || null;
        bestCap = candidate;
      }
    }
    logAiFinalComparedDiagnostics(capCandidates, bestCap, {
      source: "mode_flag_pressure",
      goalName: "capture_enemy_flag",
    });
    if(bestCap) return bestCap;
    planModeDrivenAiMove.lastRejectReason = "no_flag_path";
  }

  if(aiRoundState.mode === AI_MODES.RESOURCE_FIRST){
    aiRoundState.currentGoal = "pickup_cargo";
    let bestCargoMove = null;
    let bestFavorableCargoMove = null;
    const cargoSkipStats = {
      blockedByPath: 0,
      blockedByRisk: 0,
      blockedByDistance: 0,
      blockedByThreat: 0,
    };
    for(const plane of groundedAiPlanes){
      for(const cargo of cargoState){
        if(cargo?.state !== "ready") continue;
        const move = planPathToPoint(plane, cargo.x, cargo.y);
        if(!move) continue;
        const riskInfo = evaluateCargoPickupRisk(plane, cargo, context);
        const favorableInfo = evaluateFavorableCargoCandidate(plane, cargo, move, riskInfo);

        if(!riskInfo.isSafePath){
          cargoSkipStats.blockedByPath += 1;
          continue;
        }

        if(riskInfo.totalRisk <= AI_CARGO_RISK_ACCEPTANCE){
          const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
          if(!bestCargoMove || riskInfo.totalRisk < bestCargoMove.riskInfo.totalRisk || (riskInfo.totalRisk === bestCargoMove.riskInfo.totalRisk && adjustedDist < bestCargoMove.adjustedDist)){
            bestCargoMove = { plane, move, cargo, riskInfo, favorableInfo, acceptedBy: "base_threshold", adjustedDist };
          }
          continue;
        }

        if(favorableInfo?.isFavorableCargo){
          const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
          if(!bestFavorableCargoMove || adjustedDist < bestFavorableCargoMove.adjustedDist || (adjustedDist === bestFavorableCargoMove.adjustedDist && riskInfo.totalRisk < bestFavorableCargoMove.riskInfo.totalRisk)){
            bestFavorableCargoMove = { plane, move, cargo, riskInfo, favorableInfo, acceptedBy: "favorable_override", adjustedDist };
          }
          continue;
        }

        if(favorableInfo?.hasImmediateThreat) cargoSkipStats.blockedByThreat += 1;
        else if(!favorableInfo?.isNearPlane) cargoSkipStats.blockedByDistance += 1;
        else cargoSkipStats.blockedByRisk += 1;
      }
    }

    const selectedCargoMove = bestCargoMove || bestFavorableCargoMove;
    if(selectedCargoMove){
      logAiDecision("mode_cargo_selected", {
        planeId: selectedCargoMove.plane.id,
        cargoId: selectedCargoMove.cargo?.id ?? null,
        acceptedBy: selectedCargoMove.acceptedBy,
        risk: Number(selectedCargoMove.riskInfo.totalRisk.toFixed(3)),
        distance: Number(selectedCargoMove.move.totalDist.toFixed(1)),
      });
      return { plane: selectedCargoMove.plane, ...selectedCargoMove.move };
    }

    logAiDecision("mode_cargo_skipped", {
      reason: "risk_distance_or_threat",
      cargoSkipStats,
    });
    planModeDrivenAiMove.lastRejectReason = cargoSkipStats.blockedByPath > 0
      ? "blocked_path"
      : cargoSkipStats.blockedByThreat > 0
        ? "cargo_immediate_threat"
        : cargoSkipStats.blockedByDistance > 0
          ? "cargo_too_far"
          : "cargo_risk";
  }

  if(aiRoundState.mode === AI_MODES.DEFENSE){
    aiRoundState.currentGoal = "preserve_planes";
    let safestMove = null;
    for(const plane of groundedAiPlanes){
      const nearestEnemy = enemies.reduce((a,b)=> (dist(plane,a) < dist(plane,b) ? a : b), enemies[0]);
      if(!nearestEnemy) continue;
      const awayAngle = Math.atan2(plane.y - nearestEnemy.y, plane.x - nearestEnemy.x);
      const targetX = plane.x + Math.cos(awayAngle) * MAX_DRAG_DISTANCE;
      const targetY = plane.y + Math.sin(awayAngle) * MAX_DRAG_DISTANCE;
      const move = planPathToPoint(plane, targetX, targetY);
      if(move){
        const candidate = {
          plane,
          ...move,
          adjustedDist: getAiPlaneAdjustedScore(move.totalDist, plane),
          score: getAiPlaneAdjustedScore(move.totalDist, plane),
          idleTurns: getAiPlaneIdleTurns(plane),
        };
        if(compareAiCandidateByScoreAndRotation(candidate, safestMove, ["mode_defense", "retreat"])){
          safestMove = candidate;
        }
      }
    }
    if(safestMove) return safestMove;
    planModeDrivenAiMove.lastRejectReason = "no_retreat_path";
  }

  if(!planModeDrivenAiMove.lastRejectReason){
    planModeDrivenAiMove.lastRejectReason = "no_mode_candidate";
  }
  return null;
}

function getImmediateResponseThreatMeta(context, landingX, landingY, primaryEnemy = null){
  if(!context || !Number.isFinite(landingX) || !Number.isFinite(landingY)){
    return { count: 0, nearestDist: Number.POSITIVE_INFINITY };
  }

  let count = 0;
  let nearestDist = Number.POSITIVE_INFINITY;
  for(const enemy of context.enemies || []){
    if(!enemy?.isAlive || enemy === primaryEnemy) continue;
    const enemyDist = Math.hypot((enemy.x || 0) - landingX, (enemy.y || 0) - landingY);
    if(enemyDist > AI_IMMEDIATE_RESPONSE_DANGER_RADIUS) continue;
    if(!isPathClear(enemy.x, enemy.y, landingX, landingY)) continue;
    count += 1;
    if(enemyDist < nearestDist) nearestDist = enemyDist;
  }

  return { count, nearestDist };
}

function findPreFallbackAttackMove(context){
  if(!context?.aiPlanes?.length || !context?.enemies?.length) return null;
  const readyPlanes = context.aiPlanes.filter((plane) => isPlaneLaunchStateReady(plane) && !flyingPoints.some((fp) => fp.plane === plane));
  if(!readyPlanes.length) return null;

  const closeEnemies = context.enemies.filter((enemy) => {
    if(!enemy?.isAlive) return false;
    return readyPlanes.some((plane) => Math.hypot((enemy.x || 0) - plane.x, (enemy.y || 0) - plane.y) <= AI_PRE_FALLBACK_ATTACK_RADIUS);
  });
  if(!closeEnemies.length) return null;

  let nearestEnemy = null;
  let nearestEnemyDist = Number.POSITIVE_INFINITY;
  for(const enemy of closeEnemies){
    for(const plane of readyPlanes){
      const enemyDist = Math.hypot((enemy.x || 0) - plane.x, (enemy.y || 0) - plane.y);
      if(enemyDist < nearestEnemyDist){
        nearestEnemy = enemy;
        nearestEnemyDist = enemyDist;
      }
    }
  }
  if(!nearestEnemy) return null;

  const localAttackMove = findDirectFinisherMove(readyPlanes, [nearestEnemy], {
    source: "pre_fallback_attack",
    goalName: "pre_fallback_attack_radius",
    context,
  });
  if(!localAttackMove) return null;

  const landing = getAiMoveLandingPoint(localAttackMove);
  if(!landing) return null;
  const threatMeta = getImmediateResponseThreatMeta(context, landing.x, landing.y, localAttackMove.enemy || nearestEnemy);
  if(threatMeta.count > 0) return null;

  return localAttackMove;
}

function estimatePreFallbackLocalAttackRisk(context, localAttackMove){
  if(!context || !localAttackMove) return Number.POSITIVE_INFINITY;
  const landing = getAiMoveLandingPoint(localAttackMove);
  if(!landing) return Number.POSITIVE_INFINITY;

  const threatMeta = getImmediateResponseThreatMeta(
    context,
    landing.x,
    landing.y,
    localAttackMove.enemy || null
  );
  if(threatMeta.count <= 0) return 0;

  const nearestThreatFactor = Number.isFinite(threatMeta.nearestDist)
    ? Math.max(0, 1 - (threatMeta.nearestDist / AI_IMMEDIATE_RESPONSE_DANGER_RADIUS))
    : 1;
  const threatCountPenalty = Math.min(0.7, threatMeta.count * 0.32);
  const proximityPenalty = Math.min(0.35, nearestThreatFactor * 0.35);
  return Math.min(1, threatCountPenalty + proximityPenalty);
}

function findPreFallbackPositionalExitMove(context){
  if(typeof planPathToPoint !== "function") return null;
  const safeAiPlanes = Array.isArray(context?.aiPlanes)
    ? context.aiPlanes.filter((plane) => (
        isPlaneLaunchStateReady(plane)
        && !flyingPoints.some((fp) => fp.plane === plane)
      ))
    : [];
  const enemyTargets = Array.isArray(context?.enemies)
    ? context.enemies.filter((enemy) => enemy?.isAlive)
    : [];
  if(!safeAiPlanes.length || !enemyTargets.length) return null;

  let bestThreatAvoidance = null;
  for(const plane of safeAiPlanes){
    const nearestThreat = enemyTargets.reduce((nearest, enemy) => {
      if(!Number.isFinite(enemy?.x) || !Number.isFinite(enemy?.y)) return nearest;
      const distance = Math.hypot(enemy.x - plane.x, enemy.y - plane.y);
      if(!nearest || distance < nearest.distance){
        return { enemy, distance };
      }
      return nearest;
    }, null);
    if(!nearestThreat || nearestThreat.distance <= 0) continue;

    const awayX = (plane.x - nearestThreat.enemy.x) / nearestThreat.distance;
    const awayY = (plane.y - nearestThreat.enemy.y) / nearestThreat.distance;
    const shiftDistance = Math.min(MAX_DRAG_DISTANCE * 0.34, Math.max(CELL_SIZE * 1.2, nearestThreat.distance * 0.32));
    const targetX = Math.max(
      FIELD_LEFT + FIELD_BORDER_OFFSET_X,
      Math.min(FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X, plane.x + awayX * shiftDistance)
    );
    const targetY = Math.max(
      FIELD_TOP + FIELD_BORDER_OFFSET_Y,
      Math.min(FIELD_TOP + FIELD_HEIGHT - FIELD_BORDER_OFFSET_Y, plane.y + awayY * shiftDistance)
    );

    const plannedAvoidanceMove = planPathToPoint(plane, targetX, targetY, {
      goalName: "safe_short_fallback_progress",
      decisionReason: "safe_short_fallback_progress_threat_avoidance",
    });
    if(!plannedAvoidanceMove) continue;

    const landing = getAiMoveLandingPoint({ plane, ...plannedAvoidanceMove });
    if(!landing) continue;
    const beforeDist = nearestThreat.distance;
    const afterDist = Math.hypot(landing.x - nearestThreat.enemy.x, landing.y - nearestThreat.enemy.y);
    const distanceGain = afterDist - beforeDist;
    if(distanceGain <= 0) continue;

    const avoidanceValidation = validateAiLaunchMoveCandidate({ plane, ...plannedAvoidanceMove });
    if(!avoidanceValidation.ok) continue;

    if(!bestThreatAvoidance || distanceGain > bestThreatAvoidance.distanceGain){
      bestThreatAvoidance = {
        move: {
          ...plannedAvoidanceMove,
          plane,
          goalName: "safe_short_fallback_progress",
          decisionReason: "safe_short_fallback_progress_threat_avoidance",
          targetType: "threat_avoidance",
        },
        target: nearestThreat.enemy,
        group: "threat_avoidance",
        distanceGain,
      };
    }
  }

  return bestThreatAvoidance
    ? {
        move: bestThreatAvoidance.move,
        target: bestThreatAvoidance.target,
        group: bestThreatAvoidance.group,
      }
    : null;
}

function isEmergencyDefenseStageGoal(goalName){
  const goalText = `${goalName || ""}`.toLowerCase();
  if(!goalText) return false;
  return goalText.includes("critical_base_threat") || goalText.startsWith("emergency_base_defense_");
}

function getFallbackCandidateResponseRisk(threatMeta){
  if(!threatMeta || threatMeta.count <= 0) return 0;
  const proximityFactor = Number.isFinite(threatMeta.nearestDist)
    ? Math.max(0, 1 - (threatMeta.nearestDist / AI_IMMEDIATE_RESPONSE_DANGER_RADIUS))
    : 1;
  return Number((Math.min(1, threatMeta.count * 0.25 + proximityFactor * 0.75)).toFixed(4));
}

function getAiCandidateClassLabel(candidate){
  const rawType = candidate?.trajectoryType || candidate?.candidateType || "direct";
  if(rawType === "bounce") return "ricochet";
  if(rawType === "mirror") return "ricochet";
  return rawType;
}

function buildAiFinalComparedSnapshot(candidate){
  if(!candidate || typeof candidate !== "object") return null;
  const routeMetrics = candidate?.routeMetrics || null;
  const score = Number.isFinite(candidate?.score) ? Number(candidate.score.toFixed(3)) : null;
  const normalizedScore = Number.isFinite(candidate?.normalizedScore) ? Number(candidate.normalizedScore.toFixed(3)) : null;
  return {
    planeId: candidate?.plane?.id ?? null,
    enemyId: candidate?.enemy?.id ?? null,
    classLabel: getAiCandidateClassLabel(candidate),
    score,
    normalizedScore,
    finalScoreBreakdown: candidate?.finalScoreBreakdown || null,
    lowPassabilityBlockedLike: candidate?.lowPassabilityBlockedLike === true,
    classTieBreakReason: candidate?.classTieBreakReason || null,
    routeMetrics: routeMetrics
      ? {
          clearance: Number.isFinite(routeMetrics?.clearance) ? Number(routeMetrics.clearance.toFixed(2)) : null,
          corridorTightness: Number.isFinite(routeMetrics?.corridorTightness) ? Number(routeMetrics.corridorTightness.toFixed(4)) : null,
          qualityScore: Number.isFinite(routeMetrics?.qualityScore) ? Number(routeMetrics.qualityScore.toFixed(4)) : null,
        }
      : null,
  };
}

function logAiFinalComparedDiagnostics(candidates, bestCandidate, meta = {}){
  if(!Array.isArray(candidates) || candidates.length === 0) return;
  const snapshots = candidates.map((candidate) => buildAiFinalComparedSnapshot(candidate)).filter(Boolean);
  const classPresence = snapshots.reduce((acc, item) => {
    const classLabel = item?.classLabel;
    if(classLabel === "direct" || classLabel === "gap" || classLabel === "ricochet"){
      acc[classLabel] += 1;
    }
    return acc;
  }, { direct: 0, gap: 0, ricochet: 0 });
  const winner = buildAiFinalComparedSnapshot(bestCandidate);
  const winnerClass = winner?.classLabel || null;
  const hasGapOrRicochet = classPresence.gap > 0 || classPresence.ricochet > 0;
  const directLowPassabilityWin = hasGapOrRicochet
    && winnerClass === "direct"
    && winner?.lowPassabilityBlockedLike === true;

  const payload = {
    source: meta?.source || "unknown",
    goalName: meta?.goalName || null,
    comparedCount: snapshots.length,
    classPresence,
    winner,
    finalCompared: snapshots,
  };

  logAiDecision("final_compared", payload);
  if(directLowPassabilityWin){
    logAiDecision("final_compared_direct_low_passability_win", {
      ...payload,
      reason: "gap_or_ricochet_present_but_low_passability_direct_selected",
    });
  }

  if(aiRoundState && typeof aiRoundState === "object"){
    aiRoundState.lastFinalComparedDiagnostics = payload;
  }
}

function getAiCandidateClassComparableScore({
  plane,
  routeDistance,
  responseRisk = 0,
  fromPoint,
  landingPoint,
  targetPoint,
  candidateClass = "direct",
  directPathBlocked = false,
  goalName = "",
}){
  const safeRouteDistance = Number.isFinite(routeDistance) ? Math.max(0, routeDistance) : MAX_DRAG_DISTANCE;
  const distanceNorm = Math.max(0, Math.min(1.5, safeRouteDistance / Math.max(1, MAX_DRAG_DISTANCE * 1.4)));
  const riskNorm = Math.max(0, Math.min(1, Number.isFinite(responseRisk) ? responseRisk : 0));

  const startPoint = fromPoint || plane || null;
  const safeLanding = landingPoint || startPoint || null;
  const safeTarget = targetPoint || null;
  const beforeDist = startPoint && safeTarget ? dist(startPoint, safeTarget) : safeRouteDistance;
  const afterDist = safeLanding && safeTarget ? dist(safeLanding, safeTarget) : safeRouteDistance;
  const progressNorm = beforeDist > 0
    ? Math.max(0, Math.min(1, (beforeDist - afterDist) / beforeDist))
    : 0;

  const centerPoint = {
    x: FIELD_LEFT + FIELD_WIDTH * 0.5,
    y: FIELD_TOP + FIELD_HEIGHT * 0.5,
  };
  const centerDist = safeLanding ? dist(safeLanding, centerPoint) : MAX_DRAG_DISTANCE;
  const positionUtilityNorm = Math.max(0, Math.min(1, 1 - (centerDist / Math.max(1, FIELD_WIDTH * 0.75))));

  const denseGeometry = Boolean(directPathBlocked)
    || candidateClass === "ricochet"
    || candidateClass === "gap";
  const roundGoalText = `${aiRoundState?.currentGoal || ""}`.toLowerCase();
  const emergencyGoal = isEmergencyDefenseStageGoal(goalName)
    || `${goalName || ""}`.toLowerCase().includes("critical_base_threat")
    || isEmergencyDefenseStageGoal(roundGoalText)
    || roundGoalText.includes("critical_base_threat");
  let antiSkewAdjustment = 0;
  if(denseGeometry && !emergencyGoal){
    if(candidateClass === "direct") antiSkewAdjustment = AI_CLASS_SCORE_ANTI_SKEW_DENSE_DIRECT_PENALTY;
    else if(candidateClass === "ricochet") antiSkewAdjustment = AI_CLASS_SCORE_ANTI_SKEW_DENSE_RICOCHET_BONUS;
    else if(candidateClass === "gap") antiSkewAdjustment = AI_CLASS_SCORE_ANTI_SKEW_DENSE_GAP_BONUS;
  }

  const composite =
    (distanceNorm * AI_CLASS_SCORE_LENGTH_WEIGHT)
    + (riskNorm * AI_CLASS_SCORE_RESPONSE_RISK_WEIGHT)
    + ((1 - progressNorm) * AI_CLASS_SCORE_PROGRESS_WEIGHT)
    + ((1 - positionUtilityNorm) * AI_CLASS_SCORE_POSITION_UTILITY_WEIGHT)
    + antiSkewAdjustment;

  return {
    classScoreBreakdown: {
      candidateClass,
      length: Number(distanceNorm.toFixed(4)),
      responseRisk: Number(riskNorm.toFixed(4)),
      progressToGoal: Number(progressNorm.toFixed(4)),
      positionUtility: Number(positionUtilityNorm.toFixed(4)),
      antiSkewAdjustment: Number(antiSkewAdjustment.toFixed(4)),
      denseGeometry,
      emergencyGoal,
    },
    normalizedClassScore: Number(Math.max(0, composite).toFixed(6)),
  };
}

function buildFallbackAttackScoreDetails({
  plane,
  weightedDistance,
  bonusParts = [],
  safetyContext,
  multiKillPotential,
  classScoreMeta = null,
  tieBreakPenalty = 0,
}){
  const bonusTotal = Math.min(0.2, bonusParts.reduce((sum, bonus) => sum + Math.max(0, bonus || 0), 0));
  const rawScore = getAiPlaneAdjustedScore(weightedDistance * (1 - bonusTotal), plane);
  const bonusAllowed = !isDefenseOrRetreatContext(safetyContext);
  const multiKillBonusApplied = bonusAllowed && multiKillPotential?.multiKillPotential === 1
    ? AI_MULTI_KILL_PRIMARY_BONUS
    : 0;
  const scoreAfter = Math.max(0, rawScore - multiKillBonusApplied);
  const classNormalized = Number.isFinite(classScoreMeta?.normalizedClassScore)
    ? classScoreMeta.normalizedClassScore
    : 0;
  const normalizedScore = scoreAfter
    + Math.max(0, tieBreakPenalty || 0)
    + classNormalized * Math.max(1, MAX_DRAG_DISTANCE) * 0.045;
  return {
    bonusTotal,
    scoreBefore: rawScore,
    scoreAfter,
    normalizedScore,
    multiKillBonusApplied,
    classScoreBreakdown: classScoreMeta?.classScoreBreakdown || null,
  };
}

function getFallbackAiMove(context){
  const { aiPlanes, enemies, shouldUseFlagsMode, availableEnemyFlags } = context;
  const homeBase = context.homeBase;
  const riskProfile = context?.aiRiskProfile?.profile || "balanced";

  const carrier = shouldUseFlagsMode ? aiPlanes.find(p => {
    if(!p.carriedFlagId) return false;
    const carriedFlag = getFlagById(p.carriedFlagId);
    return carriedFlag?.color === "green" && !flyingPoints.some(fp=>fp.plane===p);
  }) : null;
  if(carrier){
    const move = planPathToPoint(carrier, homeBase.x, homeBase.y);
    if(move){
      return { plane: carrier, ...move };
    }
  }

  let targetEnemies = enemies;
  const stolenBlueFlagCarrier = shouldUseFlagsMode ? getFlagCarrierForColor("blue") : null;
  if(stolenBlueFlagCarrier && stolenBlueFlagCarrier.color !== "blue"){
    targetEnemies = enemies.filter(e=>e===stolenBlueFlagCarrier);
  } else if(availableEnemyFlags.length && (riskProfile === "comeback" || riskProfile === "balanced")){
    let bestCap = null;
    const capCandidates = buildFlagCaptureBaseCandidates(aiPlanes, availableEnemyFlags, {
      goalName: "capture_enemy_flag",
      decisionReason: "fallback_flag_pressure",
    });
    for(const candidate of capCandidates){
      if(compareAiCandidateByScoreAndRotation(candidate, bestCap, ["fallback_flag_pressure", candidate?.flag?.id ?? "", candidate?.candidateType || "direct"])){
        candidate.classTieBreakReason = compareAiCandidateByScoreAndRotation.lastClassTieBreakReason || null;
        bestCap = candidate;
      }
    }
    logAiFinalComparedDiagnostics(capCandidates, bestCap, {
      source: "fallback_flag_pressure",
      goalName: "capture_enemy_flag",
    });
    if(bestCap){
      return bestCap;
    }
  }

  let directFinisherCandidate = null;
  const directFinisherMove = findDirectFinisherMove(aiPlanes, targetEnemies, {
    source: "fallback",
    goalName: "direct_finisher",
    context,
  });
  if(directFinisherMove){
    const directFinisherQuality = getFallbackDirectAttackQuality(
      directFinisherMove.plane,
      directFinisherMove.enemy,
      directFinisherMove.totalDist,
      riskProfile
    );
    if(directFinisherQuality >= AI_FALLBACK_DIRECT_QUALITY_MIN){
      const finisherClassMeta = getAiCandidateClassComparableScore({
        plane: directFinisherMove.plane,
        routeDistance: directFinisherMove.totalDist,
        responseRisk: 0,
        fromPoint: directFinisherMove.plane,
        landingPoint: getAiMoveLandingPoint(directFinisherMove),
        targetPoint: directFinisherMove.enemy,
        candidateClass: "direct",
        directPathBlocked: false,
        goalName: "direct_finisher",
      });
      const finisherScore = (Number.isFinite(directFinisherMove.score) ? directFinisherMove.score : directFinisherMove.totalDist)
        + finisherClassMeta.normalizedClassScore * MAX_DRAG_DISTANCE * 0.045;
      directFinisherCandidate = {
        ...directFinisherMove,
        trajectoryType: "direct",
        candidateType: "direct",
        score: finisherScore,
        normalizedScore: finisherScore,
        classScoreBreakdown: finisherClassMeta.classScoreBreakdown,
        selectedClass: "direct",
      };
      logAiDecision("direct_finisher", {
        source: "fallback",
        planeId: directFinisherMove.plane?.id ?? null,
        enemyId: directFinisherMove.enemy?.id ?? null,
        distance: Number((directFinisherMove.totalDist || 0).toFixed(1)),
        reason: "direct_finisher",
        classScoreBreakdown: finisherClassMeta.classScoreBreakdown,
      });
    }
    logAiDecision("direct_finisher_rejected_in_fallback", {
      source: "fallback",
      planeId: directFinisherMove.plane?.id ?? null,
      enemyId: directFinisherMove.enemy?.id ?? null,
      distance: Number((directFinisherMove.totalDist || 0).toFixed(1)),
      quality: Number(directFinisherQuality.toFixed(3)),
      threshold: AI_FALLBACK_DIRECT_QUALITY_MIN,
      reason: "low_direct_quality",
    });
  }

  const flightDistancePx = settings.flightRangeCells * CELL_SIZE;
  const speedPxPerSec = flightDistancePx / FIELD_FLIGHT_DURATION_SEC;
  let best = null;
  let bestPreparation = null;
  let bestPreparationScore = Number.POSITIVE_INFINITY;
  let bestPoorDirectCandidate = null;
  const wallLockedRicochetPreferredTargets = new Set();
  const dynamiteAvailable = hasBlueDynamiteAvailable();

  for(const plane of aiPlanes){
    if(flyingPoints.some(fp=>fp.plane===plane)) continue;

    for(const enemy of targetEnemies){
      if(isPathClear(plane.x, plane.y, enemy.x, enemy.y)){
        let dx= enemy.x - plane.x;
        let dy= enemy.y - plane.y;
        let baseAngle= Math.atan2(dy, dx);
        let dev = getRandomDeviation(Math.hypot(dx,dy), AI_MAX_ANGLE_DEVIATION);
        let ang = baseAngle + dev;

        const directDist = Math.hypot(dx,dy);
        const baseScale = Math.min(directDist / MAX_DRAG_DISTANCE, 1);
        const scale = applyAiMinLaunchScale(baseScale, {
          source: "fallback_direct_attack",
          planeId: plane.id,
          enemyId: enemy.id,
          decisionReason: "fallback_direct_attack",
          goalName: "attack_enemy_plane",
          moveDistance: directDist,
          hasDirectLineOfSight: true,
        });

        let vx = Math.cos(ang) * scale * speedPxPerSec;
        let vy = Math.sin(ang) * scale * speedPxPerSec;

        let landingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
        let landingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;
        let selectedDev = dev;
        if(!isPathClear(plane.x, plane.y, landingX, landingY)){
          const fallbackDeviationScales = [0.5, 0.25, 0];
          let foundClearTrajectory = false;

          for(const deviationScale of fallbackDeviationScales){
            const fallbackDev = dev * deviationScale;
            const fallbackAng = baseAngle + fallbackDev;
            const fallbackVx = Math.cos(fallbackAng) * scale * speedPxPerSec;
            const fallbackVy = Math.sin(fallbackAng) * scale * speedPxPerSec;
            const fallbackLandingX = plane.x + fallbackVx * FIELD_FLIGHT_DURATION_SEC;
            const fallbackLandingY = plane.y + fallbackVy * FIELD_FLIGHT_DURATION_SEC;
            if(isPathClear(plane.x, plane.y, fallbackLandingX, fallbackLandingY)){
              ang = fallbackAng;
              vx = fallbackVx;
              vy = fallbackVy;
              landingX = fallbackLandingX;
              landingY = fallbackLandingY;
              selectedDev = fallbackDev;
              foundClearTrajectory = true;
              break;
            }
          }

          if(!foundClearTrajectory){
            logAiDecision("fallback_direct_attack_blocked_after_deviation", {
              source: "fallback_direct_attack",
              planeId: plane.id,
              enemyId: enemy.id,
              distance: Number(directDist.toFixed(1)),
              initialDeviation: Number(dev.toFixed(4)),
              reason: "blocked_after_deviation",
            });
            continue;
          }

          if(Math.abs(selectedDev - dev) > 0.000001){
            logAiDecision("fallback_direct_attack_blocked_after_deviation", {
              source: "fallback_direct_attack",
              planeId: plane.id,
              enemyId: enemy.id,
              distance: Number(directDist.toFixed(1)),
              initialDeviation: Number(dev.toFixed(4)),
              adjustedDeviation: Number(selectedDev.toFixed(4)),
              reason: "deviation_reduced_for_clear_path",
            });
          }
        }

        const directQuality = getFallbackDirectAttackQuality(plane, enemy, directDist, riskProfile);
        const targetPriority = getAiTargetPriority(enemy, context);
        const longShotPenalty = getAiLongShotPenaltyMultiplier(directDist, targetPriority, riskProfile, {
          onlyLineAvailable: false,
        });
        const immediateThreatMeta = getImmediateResponseThreatMeta(context, landingX, landingY, enemy);
        let directAttackScore = getAiPlaneAdjustedScore(directDist * longShotPenalty, plane);
        if(
          immediateThreatMeta.count > 0
          && riskProfile !== "comeback"
          && !enemy?.carriedFlagId
        ){
          const currentGoalText = `${aiRoundState?.currentGoal || ""}`.toLowerCase();
          const isEmergencyGoal = currentGoalText.includes("critical_base_threat")
            || currentGoalText.includes("emergency_");
          const proximityFactor = Number.isFinite(immediateThreatMeta.nearestDist)
            ? Math.max(0, 1 - (immediateThreatMeta.nearestDist / AI_IMMEDIATE_RESPONSE_DANGER_RADIUS))
            : 0;
          const immediateRiskPenaltyBase = ATTACK_RANGE_PX * (
            0.06
            + proximityFactor * 0.08
            + Math.max(0, immediateThreatMeta.count - 1) * 0.02
          );
          const immediateRiskPenalty = immediateRiskPenaltyBase * (
            isEmergencyGoal
              ? 1
              : AI_FALLBACK_IMMEDIATE_RISK_PENALTY_NON_EMERGENCY_BOOST
          );
          directAttackScore += immediateRiskPenalty;
          logAiDecision("fallback_direct_attack_immediate_response_penalty", {
            planeId: plane?.id ?? null,
            enemyId: enemy?.id ?? null,
            threatCount: immediateThreatMeta.count,
            nearestThreatDist: Number.isFinite(immediateThreatMeta.nearestDist)
              ? Number(immediateThreatMeta.nearestDist.toFixed(1))
              : null,
            emergencyStageActive: isEmergencyGoal,
            nonEmergencyBoost: isEmergencyGoal
              ? 1
              : Number(AI_FALLBACK_IMMEDIATE_RISK_PENALTY_NON_EMERGENCY_BOOST.toFixed(3)),
            immediateRiskPenalty: Number(immediateRiskPenalty.toFixed(2)),
            riskProfile,
          });
        }

        if(directQuality < AI_FALLBACK_DIRECT_QUALITY_MIN){
          const poorDirectCandidate = {
            plane,
            enemy,
            directQuality,
            directAttackScore,
            totalDist: directDist,
            idleTurns: getAiPlaneIdleTurns(plane),
          };
          if(compareAiCandidateByScoreAndRotation(poorDirectCandidate, bestPoorDirectCandidate, ["fallback_attack", "poor_direct", enemy?.id ?? ""])){
            bestPoorDirectCandidate = poorDirectCandidate;
          }

          const safeAngleMove = findFallbackSafeAngleRepositionMove(plane, enemy, speedPxPerSec);
          if(safeAngleMove){
            if(compareAiCandidateByScoreAndRotation(safeAngleMove, bestPreparation, ["fallback_attack", "safe_angle", enemy?.id ?? ""])){
              bestPreparation = safeAngleMove;
              bestPreparationScore = safeAngleMove.score;
            }
            continue;
          }

          const ricochetPreparation = findFallbackRicochetPreparationMove(plane, enemy);
          if(ricochetPreparation){
            if(compareAiCandidateByScoreAndRotation(ricochetPreparation, bestPreparation, ["fallback_attack", "prepare_ricochet", enemy?.id ?? ""])){
              bestPreparation = ricochetPreparation;
              bestPreparationScore = ricochetPreparation.score;
            }
            continue;
          }
        }

        if(longShotPenalty > 1){
          logAiDecision("long_shot_penalty_observed", {
            source: "fallback_direct_attack",
            planeId: plane.id,
            enemyId: enemy.id,
            riskProfile,
            targetPriority,
            distance: Number(directDist.toFixed(1)),
            penalty: Number(longShotPenalty.toFixed(3)),
          });
          if(longShotPenalty >= AI_LONG_SHOT_LARGE_PENALTY_LOG_THRESHOLD){
            logAiDecision("long_shot_penalty_applied", {
              distanceToTarget: Number(directDist.toFixed(1)),
              penalty: Number(longShotPenalty.toFixed(3)),
              targetPriority,
            });
          }
        }

        const directMultiKill = getAiMultiKillPotentialContext({
          plane,
          enemy,
          enemies: targetEnemies,
          lineEndX: enemy.x,
          lineEndY: enemy.y,
        });
        const directSafetyContext = {
          goalName: "attack_enemy_plane",
          decisionReason: "fallback_direct_attack",
        };
        const directTieBreakPenalty = wallLockedRicochetPreferredTargets.has(enemy?.id)
          ? AI_WALL_LOCKED_DIRECT_TIE_BREAK_PENALTY
          : 0;
        const directScoreMeta = buildFallbackAttackScoreDetails({
          plane,
          weightedDistance: directDist * longShotPenalty,
          bonusParts: [],
          safetyContext: directSafetyContext,
          multiKillPotential: directMultiKill,
          classScoreMeta: getAiCandidateClassComparableScore({
            plane,
            routeDistance: directDist,
            responseRisk: getFallbackCandidateResponseRisk(immediateThreatMeta),
            fromPoint: plane,
            landingPoint: { x: landingX, y: landingY },
            targetPoint: enemy,
            candidateClass: "direct",
            goalName: directSafetyContext.goalName,
          }),
          tieBreakPenalty: directTieBreakPenalty,
        });
        const directResponseRisk = getFallbackCandidateResponseRisk(immediateThreatMeta);
        logAiDecision("fallback_attack_candidate_scored", {
          source: "fallback_attack",
          candidateType: "direct",
          planeId: plane.id,
          enemyId: enemy.id,
          secondaryEnemyId: directMultiKill.secondaryEnemyId,
          multiKillPotential: directMultiKill.multiKillPotential,
          multiKillBonusApplied: Number(directScoreMeta.multiKillBonusApplied.toFixed(3)),
          scoreBefore: Number(directScoreMeta.scoreBefore.toFixed(3)),
          scoreAfter: Number(directScoreMeta.scoreAfter.toFixed(3)),
          normalizedScore: Number(directScoreMeta.normalizedScore.toFixed(3)),
          normalizedDirectScore: Number(directScoreMeta.normalizedScore.toFixed(3)),
          normalizedMirrorScore: null,
          tieBreakPenalty: Number(directTieBreakPenalty.toFixed(4)),
          responseRisk: Number(directResponseRisk.toFixed(4)),
          classScoreBreakdown: directScoreMeta.classScoreBreakdown,
          selectedClass: "direct",
          classTieBreakReason: compareAiCandidateByScoreAndRotation.lastClassTieBreakReason || null,
          lineDistance: Number.isFinite(directMultiKill.lineDistance) ? Number(directMultiKill.lineDistance.toFixed(2)) : null,
          contactDistance: Number.isFinite(directMultiKill.contactDistance) ? Number(directMultiKill.contactDistance.toFixed(2)) : null,
        });

        const directCandidate = {
          plane,
          enemy,
          vx,
          vy,
          totalDist: directDist,
          directAttackScore,
          score: directScoreMeta.normalizedScore,
          normalizedScore: directScoreMeta.normalizedScore,
          responseRisk: directResponseRisk,
          trajectoryType: "direct",
          candidateType: "direct",
          classScoreBreakdown: directScoreMeta.classScoreBreakdown,
          selectedClass: "direct",
          idleTurns: getAiPlaneIdleTurns(plane),
        };
        if(wallLockedRicochetPreferredTargets.has(enemy?.id)){
          directCandidate.reasonCode = "wall_locked_target_prefers_ricochet";
        }
        if(compareAiCandidateByScoreAndRotation(directCandidate, best, ["fallback_attack", "direct", enemy?.id ?? ""])){
          directCandidate.classTieBreakReason = compareAiCandidateByScoreAndRotation.lastClassTieBreakReason || null;
          best = directCandidate;
        }
      } else {
        const directPathBlocked = true;
        const directDist = Math.hypot(enemy.x - plane.x, enemy.y - plane.y);
        const wallLockedTargetTrigger = directPathBlocked && directDist <= AI_WALL_LOCKED_TARGET_COMBAT_RADIUS;
        const mirrorPressureTarget = isMirrorPressureTarget(enemy, context);
        const mirrorPressureBoost = mirrorPressureTarget ? AI_MIRROR_PATH_PRESSURE_BONUS : 0;

        const blockedDirectQuality = getFallbackDirectAttackQuality(plane, enemy, directDist, riskProfile);
        if(blockedDirectQuality < AI_FALLBACK_DIRECT_QUALITY_MIN){
          const qualityPenalty = wallLockedTargetTrigger ? AI_WALL_LOCKED_POOR_DIRECT_QUALITY_PENALTY : 0;
          const adjustedQuality = Math.max(0, blockedDirectQuality - qualityPenalty);
          const blockedScorePenalty = wallLockedTargetTrigger ? AI_WALL_LOCKED_POOR_DIRECT_SCORE_PENALTY : 0;
          const blockedDirectScore = getAiPlaneAdjustedScore(directDist, plane) + blockedScorePenalty;
          const poorDirectCandidate = {
            plane,
            enemy,
            directQuality: adjustedQuality,
            directAttackScore: blockedDirectScore,
            totalDist: directDist,
            score: blockedDirectScore,
            idleTurns: getAiPlaneIdleTurns(plane),
            reasonCode: wallLockedTargetTrigger ? "wall_locked_target_prefers_ricochet" : "blocked_direct_path",
          };
          if(compareAiCandidateByScoreAndRotation(poorDirectCandidate, bestPoorDirectCandidate, ["fallback_attack", "poor_direct_blocked", enemy?.id ?? ""])){
            bestPoorDirectCandidate = poorDirectCandidate;
          }
        }

        const mirror = riskProfile === "conservative"
          ? null
          : findMirrorShot(plane, enemy, {
            logReject: true,
            pressureBoost: mirrorPressureBoost,
            goalName: "attack_enemy_plane",
          });
        if(mirror){
          const dx = mirror.mirrorTarget.x - plane.x;
          const dy = mirror.mirrorTarget.y - plane.y;
          const ang = Math.atan2(dy, dx) + getRandomDeviation(mirror.totalDist, AI_MAX_ANGLE_DEVIATION);

          const baseScale = Math.min(mirror.totalDist / (2*MAX_DRAG_DISTANCE), 1);
          const scale = applyAiMinLaunchScale(baseScale, {
            source: "fallback_mirror_attack",
            planeId: plane.id,
            enemyId: enemy.id,
            decisionReason: "fallback_mirror_attack",
            goalName: "attack_enemy_plane",
            moveDistance: mirror.totalDist,
          });
          const vx = Math.cos(ang) * scale * speedPxPerSec;
          const vy = Math.sin(ang) * scale * speedPxPerSec;

          const mirrorWeight = riskProfile === "comeback" ? 0.82 : 1;
          const blockedDirectBonus = directPathBlocked ? AI_MIRROR_SCORE_BLOCKED_DIRECT_BONUS : 0;
          const pressureBonus = mirrorPressureTarget ? AI_MIRROR_SCORE_PRESSURE_BONUS : 0;
          const wallLockedBonus = wallLockedTargetTrigger ? AI_WALL_LOCKED_MIRROR_BONUS : 0;
          const mirrorBonus = Math.min(0.2, blockedDirectBonus + pressureBonus + wallLockedBonus);
          const reasonCode = wallLockedTargetTrigger
            ? "wall_locked_target_prefers_ricochet"
            : (directPathBlocked ? "direct_path_blocked" : "tactical_preference");
          if(wallLockedTargetTrigger && enemy?.id){
            wallLockedRicochetPreferredTargets.add(enemy.id);
          }
          logAiDecision("mirror_selected_reason", {
            source: "fallback_attack",
            reason: directPathBlocked ? "direct_path_blocked" : "tactical_preference",
            reasonCode,
            planeId: plane.id,
            enemyId: enemy.id,
            mirrorBonus: Number(mirrorBonus.toFixed(3)),
            blockedDirectBonus: Number(blockedDirectBonus.toFixed(3)),
            pressureBonus: Number(pressureBonus.toFixed(3)),
            wallLockedBonus: Number(wallLockedBonus.toFixed(3)),
            wallLockedTargetTrigger,
            directDistance: Number(directDist.toFixed(1)),
            combatRadius: Number(AI_WALL_LOCKED_TARGET_COMBAT_RADIUS.toFixed(1)),
            clearSky: isCurrentMapClearSky(),
            pathDistance: Number(mirror.totalDist.toFixed(1)),
          });
          const mirrorMultiKill = getAiMultiKillPotentialContext({
            plane,
            enemy,
            enemies: targetEnemies,
            lineEndX: mirror.mirrorTarget.x,
            lineEndY: mirror.mirrorTarget.y,
          });
          const mirrorSafetyContext = {
            goalName: "attack_enemy_plane",
            decisionReason: "fallback_mirror_attack",
          };
          const mirrorLandingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
          const mirrorLandingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;
          const mirrorImmediateThreatMeta = getImmediateResponseThreatMeta(context, mirrorLandingX, mirrorLandingY, enemy);
          const mirrorScoreMeta = buildFallbackAttackScoreDetails({
            plane,
            weightedDistance: mirror.totalDist * mirrorWeight,
            bonusParts: [blockedDirectBonus, pressureBonus, wallLockedBonus],
            safetyContext: mirrorSafetyContext,
            multiKillPotential: mirrorMultiKill,
            classScoreMeta: getAiCandidateClassComparableScore({
              plane,
              routeDistance: mirror.totalDist,
              responseRisk: getFallbackCandidateResponseRisk(mirrorImmediateThreatMeta),
              fromPoint: plane,
              landingPoint: { x: mirrorLandingX, y: mirrorLandingY },
              targetPoint: enemy,
              candidateClass: "ricochet",
              directPathBlocked: directPathBlocked,
              goalName: mirrorSafetyContext.goalName,
            }),
            tieBreakPenalty: 0,
          });
          const mirrorResponseRisk = getFallbackCandidateResponseRisk(mirrorImmediateThreatMeta);
          logAiDecision("fallback_attack_candidate_scored", {
            source: "fallback_attack",
            candidateType: "mirror",
            planeId: plane.id,
            enemyId: enemy.id,
            secondaryEnemyId: mirrorMultiKill.secondaryEnemyId,
            multiKillPotential: mirrorMultiKill.multiKillPotential,
            multiKillBonusApplied: Number(mirrorScoreMeta.multiKillBonusApplied.toFixed(3)),
            scoreBefore: Number(mirrorScoreMeta.scoreBefore.toFixed(3)),
            scoreAfter: Number(mirrorScoreMeta.scoreAfter.toFixed(3)),
            normalizedScore: Number(mirrorScoreMeta.normalizedScore.toFixed(3)),
            normalizedDirectScore: null,
            normalizedMirrorScore: Number(mirrorScoreMeta.normalizedScore.toFixed(3)),
            mirrorBonus: Number(mirrorScoreMeta.bonusTotal.toFixed(3)),
            responseRisk: Number(mirrorResponseRisk.toFixed(4)),
            classScoreBreakdown: mirrorScoreMeta.classScoreBreakdown,
            selectedClass: "ricochet",
            classTieBreakReason: compareAiCandidateByScoreAndRotation.lastClassTieBreakReason || null,
            lineDistance: Number.isFinite(mirrorMultiKill.lineDistance) ? Number(mirrorMultiKill.lineDistance.toFixed(2)) : null,
            contactDistance: Number.isFinite(mirrorMultiKill.contactDistance) ? Number(mirrorMultiKill.contactDistance.toFixed(2)) : null,
          });

          const mirrorCandidate = {
            plane,
            enemy,
            vx,
            vy,
            totalDist: mirror.totalDist,
            directAttackScore: mirrorScoreMeta.scoreBefore,
            score: mirrorScoreMeta.normalizedScore,
            normalizedScore: mirrorScoreMeta.normalizedScore,
            responseRisk: mirrorResponseRisk,
            trajectoryType: "mirror",
            candidateType: "ricochet",
            classScoreBreakdown: mirrorScoreMeta.classScoreBreakdown,
            selectedClass: "ricochet",
            idleTurns: getAiPlaneIdleTurns(plane),
          };
          if(compareAiCandidateByScoreAndRotation(mirrorCandidate, best, ["fallback_attack", "mirror", enemy?.id ?? ""])){
            mirrorCandidate.classTieBreakReason = compareAiCandidateByScoreAndRotation.lastClassTieBreakReason || null;
            best = mirrorCandidate;
          }
        } else {
          const preparationMove = findSafePreparationMoveForAttack(plane, enemy);
          if(preparationMove){
            const prepWeight = riskProfile === "comeback" ? 0.95 : 1;
            const preparationScore = getAiPlaneAdjustedScore(preparationMove.totalDist * prepWeight, plane);
            const preparationCandidate = {
              plane,
              enemy,
              targetEnemy: enemy,
              goalName: dynamiteAvailable ? "prepare_dynamite_breach" : "prepare_clear_shot",
              ...preparationMove,
              score: preparationScore,
              idleTurns: getAiPlaneIdleTurns(plane),
            };
            if(compareAiCandidateByScoreAndRotation(preparationCandidate, bestPreparation, ["fallback_attack", "prepare", enemy?.id ?? ""])){
              bestPreparation = preparationCandidate;
              bestPreparationScore = preparationScore;
            }
          }
        }
      }
    }
  }

  if(directFinisherCandidate && compareAiCandidateByScoreAndRotation(directFinisherCandidate, best, ["fallback_attack", "direct_finisher"])){
    directFinisherCandidate.classTieBreakReason = compareAiCandidateByScoreAndRotation.lastClassTieBreakReason || null;
    best = directFinisherCandidate;
  }

  if(!best && bestPreparation){
    if(bestPoorDirectCandidate){
      bestPreparation.allowInventoryUsage = true;
      bestPreparation.inventoryUsageReason = "bad_direct_fallback";
      bestPreparation.badDirectMeta = {
        planeId: bestPoorDirectCandidate.plane?.id ?? null,
        enemyId: bestPoorDirectCandidate.enemy?.id ?? null,
        quality: Number(bestPoorDirectCandidate.directQuality.toFixed(3)),
        threshold: AI_FALLBACK_DIRECT_QUALITY_MIN,
      };
      logAiDecision("fallback_bad_direct_upgrade", {
        reason: "bad_direct_quality",
        planeId: bestPoorDirectCandidate.plane?.id ?? null,
        enemyId: bestPoorDirectCandidate.enemy?.id ?? null,
        quality: Number(bestPoorDirectCandidate.directQuality.toFixed(3)),
        threshold: AI_FALLBACK_DIRECT_QUALITY_MIN,
        selectedFallback: bestPreparation.decisionReason || bestPreparation.goalName || "fallback_preparation",
      });
    }
    return bestPreparation;
  }

  if(!best){
    let fallbackCandidate = null;
    for(const plane of aiPlanes){
      if(flyingPoints.some(fp=>fp.plane===plane)) continue;
      const enemy = targetEnemies.reduce((a,b)=> (dist(plane,a)<dist(plane,b)?a:b), targetEnemies[0]);
      if(!enemy) continue;

      const idleTurns = getAiPlaneIdleTurns(plane);
      const preparationMove = findSafePreparationMoveForAttack(plane, enemy);
      if(preparationMove){
        const preparationScore = getAiPlaneAdjustedScore(preparationMove.totalDist, plane);
        const candidate = {
          plane,
          enemy,
          targetEnemy: enemy,
          goalName: dynamiteAvailable ? "prepare_dynamite_breach" : "prepare_clear_shot",
          decisionReason: "fallback_rotation",
          score: preparationScore,
          idleTurns,
          ...preparationMove,
        };
        if(compareAiCandidateByScoreAndRotation(candidate, fallbackCandidate, ["fallback_rotation", "prepare"])){
          fallbackCandidate = candidate;
        }
        continue;
      }

      const conservativeRetreat = riskProfile === "conservative";
      const fallbackTarget = conservativeRetreat
        ? {
            x: (plane.x + homeBase.x) * 0.5,
            y: (plane.y + homeBase.y) * 0.5,
          }
        : enemy;
      const dx= fallbackTarget.x - plane.x;
      const dy= fallbackTarget.y - plane.y;
      const angleBase = Math.atan2(dy, dx);

      const retreatScale = conservativeRetreat ? 0.5 : 0.62;
      const desired = Math.min(Math.hypot(dx,dy) * retreatScale, MAX_DRAG_DISTANCE);
      const retreatScore = getAiPlaneAdjustedScore(desired, plane);
      const candidate = {
        plane,
        enemy,
        fallbackTarget,
        desired,
        angleBase,
        decisionReason: "fallback_rotation",
        score: retreatScore,
        idleTurns,
      };
      if(compareAiCandidateByScoreAndRotation(candidate, fallbackCandidate, ["fallback_rotation", "retreat"])){
        fallbackCandidate = candidate;
      }
    }

    if(fallbackCandidate){
      if(Number.isFinite(fallbackCandidate.vx) && Number.isFinite(fallbackCandidate.vy)){
        return fallbackCandidate;
      }

      const ang = fallbackCandidate.angleBase
        + getRandomDeviation(Math.max(0, fallbackCandidate.desired || 0), AI_MAX_ANGLE_DEVIATION);
      const baseScale = Math.max(0, fallbackCandidate.desired || 0) / MAX_DRAG_DISTANCE;
      const scale = applyAiMinLaunchScale(baseScale, {
        source: "fallback_idle_move",
        planeId: fallbackCandidate.plane?.id ?? null,
        enemyId: fallbackCandidate.enemy?.id ?? null,
        decisionReason: fallbackCandidate.decisionReason || "fallback_rotation",
        goalName: fallbackCandidate.goalName || null,
        moveDistance: Math.max(0, fallbackCandidate.desired || 0),
      });

      best = {
        plane: fallbackCandidate.plane,
        enemy: fallbackCandidate.enemy,
        decisionReason: "fallback_rotation",
        vx: Math.cos(ang)*scale*speedPxPerSec,
        vy: Math.sin(ang)*scale*speedPxPerSec,
        totalDist: fallbackCandidate.desired,
      };
    }
  }

  if(best){
    logAiDecision("fallback_selected_candidate_class", {
      selectedClass: getAiCandidateClassLabel(best),
      classTieBreakReason: best.classTieBreakReason || null,
      classScoreBreakdown: best.classScoreBreakdown || null,
      planeId: best.plane?.id ?? null,
      enemyId: best.enemy?.id ?? null,
    });
  }

  return best;
}

function getGuaranteedAnyLegalLaunch(modeContext){
  const fallbackAiPlanes = points.filter(plane =>
    plane.color === "blue"
    && isPlaneLaunchStateReady(plane)
    && !flyingPoints.some(fp => fp.plane === plane)
  );
  if (!fallbackAiPlanes.length) return null;

  const flightDistancePx = settings.flightRangeCells * CELL_SIZE;
  const speedPxPerSec = flightDistancePx / FIELD_FLIGHT_DURATION_SEC;
  const strengthScales = [1, 0.78, 0.58];
  const angleSet = [
    0,
    Math.PI / 12,
    -Math.PI / 12,
    Math.PI / 6,
    -Math.PI / 6,
    Math.PI / 4,
    -Math.PI / 4,
    Math.PI / 2,
    -Math.PI / 2,
    (3 * Math.PI) / 4,
    (-3 * Math.PI) / 4,
    Math.PI,
  ];

  for (const plane of fallbackAiPlanes) {
    for (const scale of strengthScales) {
      for (const angle of angleSet) {
        const vx = Math.cos(angle) * scale * speedPxPerSec;
        const vy = Math.sin(angle) * scale * speedPxPerSec;
        const landingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
        const landingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;
        if (!isPathClear(plane.x, plane.y, landingX, landingY)) {
          continue;
        }

        return {
          plane,
          vx,
          vy,
          totalDist: Math.hypot(landingX - plane.x, landingY - plane.y),
          goalName: "guaranteed_any_legal_launch",
          decisionReason: "super_reserve_guaranteed_legal_launch",
        };
      }
    }
  }

  return null;
}

function getForcedProgressLaunchMove(modeContext){
  const fallbackAiPlanes = points.filter(plane =>
    plane.color === "blue"
    && isPlaneLaunchStateReady(plane)
    && !flyingPoints.some(fp => fp.plane === plane)
  );
  if(!fallbackAiPlanes.length) return null;

  const enemies = Array.isArray(modeContext?.enemies) ? modeContext.enemies : [];
  let safeUsefulMove = null;
  for(const plane of fallbackAiPlanes){
    const nearestEnemy = enemies.reduce((best, enemy) => {
      if(!enemy?.isAlive) return best;
      if(!best) return enemy;
      return dist(plane, enemy) < dist(plane, best) ? enemy : best;
    }, null);
    if(!nearestEnemy) continue;

    const usefulMove = planPathToPoint(plane, nearestEnemy.x, nearestEnemy.y, {
      goalName: "forced_progress_safe_useful",
      decisionReason: "forced_progress_safe_useful",
    });
    if(!usefulMove) continue;

    const landing = getAiMoveLandingPoint({ plane, ...usefulMove });
    if(!landing) continue;
    const threatMeta = getImmediateResponseThreatMeta(modeContext, landing.x, landing.y, nearestEnemy);
    if(threatMeta.count > 0) continue;

    safeUsefulMove = {
      plane,
      ...usefulMove,
      goalName: "forced_progress_safe_useful",
      decisionReason: "forced_progress_safe_useful",
      score: getAiPlaneAdjustedScore(usefulMove.totalDist, plane),
      idleTurns: getAiPlaneIdleTurns(plane),
    };
    break;
  }
  if(safeUsefulMove) return safeUsefulMove;

  const flightDistancePx = settings.flightRangeCells * CELL_SIZE;
  const speedPxPerSec = flightDistancePx / FIELD_FLIGHT_DURATION_SEC;
  if(!Number.isFinite(speedPxPerSec) || speedPxPerSec <= 0) return null;

  const preferredAngles = [
    Math.PI / 2,
    Math.PI / 3,
    (2 * Math.PI) / 3,
    Math.PI / 4,
    (3 * Math.PI) / 4,
    Math.PI,
  ];
  const safeScale = 0.22;

  for(const plane of fallbackAiPlanes){
    for(const angle of preferredAngles){
      const vx = Math.cos(angle) * safeScale * speedPxPerSec;
      const vy = Math.sin(angle) * safeScale * speedPxPerSec;
      if(!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
      return {
        plane,
        vx,
        vy,
        totalDist: Math.hypot(vx, vy) * FIELD_FLIGHT_DURATION_SEC,
        goalName: "forced_progress_launch",
        decisionReason: "forced_progress_launch",
      };
    }
  }

  return null;
}


function doComputerMove(){
  if (gameMode!=="computer" || isGameOver) return;
  aiRoundState.lastInitialCandidateSetDiagnostics = null;
  aiRoundState.lastFinalComparedDiagnostics = null;

  const failSafeHandler = typeof failSafeAdvanceTurn === "function"
    ? failSafeAdvanceTurn
    : (fallbackReason, fallbackDetails = {}) => {
        const rejectReasons = Array.isArray(fallbackDetails.rejectReasons)
          ? fallbackDetails.rejectReasons
          : [fallbackReason];
        const reasonCodes = Array.isArray(fallbackDetails.reasonCodes)
          ? fallbackDetails.reasonCodes
          : ["fail_safe_turn_advance"];
        const goal = fallbackDetails.goal || aiRoundState?.currentGoal || fallbackReason;
        const planeId = fallbackDetails.planeId ?? fallbackDetails?.move?.plane?.id ?? null;
        recordAiSelfAnalyzerDecision(fallbackReason, {
          goal,
          planeId,
          reasonCodes,
          rejectReasons,
          errorMessage: fallbackDetails.errorMessage,
        });
        aiMoveScheduled = false;
        advanceTurn();
      };

  const recordDecisionEvent = (stage, data = {}) => {
    recordAiSelfAnalyzerDecision(stage, {
      goal: data.goal,
      planeId: data.planeId ?? data.move?.plane?.id ?? null,
      reasonCodes: data.reasonCodes,
      rejectReasons: data.rejectReasons,
      move: data.move,
      consideredMoves: data.consideredMoves,
      initialCandidateSetDiagnostics: data.initialCandidateSetDiagnostics || aiRoundState.lastInitialCandidateSetDiagnostics || null,
      finalComparedDiagnostics: data.finalComparedDiagnostics || aiRoundState.lastFinalComparedDiagnostics || null,
      fallbackDiagnostics: data.fallbackDiagnostics || null,
    });
  };

  const aiPlanes = points.filter(p=> p.color==="blue" && p.isAlive && !p.burning);
  const enemies  = points.filter(p=> p.color==="green" && p.isAlive && !p.burning);
  if(!aiPlanes.length || !enemies.length){
    failSafeHandler("no_move_found", {
      goal: aiRoundState.currentGoal || "no_move_found",
      reasonCodes: ["turn_precheck_failed", "fail_safe_turn_advance"],
      rejectReasons: [!aiPlanes.length ? "no_alive_ai_planes" : "no_alive_enemies"],
      counts: {
        aiPlanes: aiPlanes.length,
        enemies: enemies.length,
      },
    });
    return;
  }

  const shouldUseFlagsMode = isFlagsModeEnabled();
  const homeBase = getBaseAnchor("blue");
  const availableEnemyFlags = shouldUseFlagsMode ? getAvailableFlagsByColor("green") : [];

  aiRoundState.turnNumber += 1;
  expireAiDynamiteIntentIfNeeded();
  updateAiPlaneIdleCounters(aiPlanes);
  const stolenBlueFlagCarrier = shouldUseFlagsMode ? getFlagCarrierForColor("blue") : null;
  const rankedAiPlanes = rankAiPlanesForCurrentTurn(aiPlanes);
  const modeContext = {
    aiPlanes: rankedAiPlanes,
    enemies,
    shouldUseFlagsMode,
    homeBase,
    availableEnemyFlags,
    stolenBlueFlagCarrier,
    blueInventoryCount: getAvailableInventoryCount("blue")
  };
  modeContext.aiRiskProfile = getAiRiskProfile(modeContext);
  logAiDecision("risk_profile", modeContext.aiRiskProfile);

  selectAiModeForCurrentTurn(modeContext);

  const criticalBaseThreat = getCriticalBlueBaseThreat(modeContext);
  modeContext.criticalBaseThreat = criticalBaseThreat;
  const hasCriticalBaseThreat = Boolean(criticalBaseThreat);
  const earlyBaseWarningThreat = hasCriticalBaseThreat ? null : getEarlyBaseWarningThreat(modeContext);
  const hasEarlyBaseWarningThreat = Boolean(earlyBaseWarningThreat);

  const openingNonTrivialStartMeta = evaluateOpeningNonTrivialStartMeta({
    ...modeContext,
    goalName: hasCriticalBaseThreat ? "critical_base_threat" : (aiRoundState.currentGoal || ""),
  });
  aiRoundState.lastOpeningNonTrivialStartMeta = openingNonTrivialStartMeta;
  aiRoundState.openingTemplateSuppressed = Boolean(openingNonTrivialStartMeta?.suppressTemplate);
  logAiDecision("opening_non_trivial_start_probe", {
    suppressTemplate: aiRoundState.openingTemplateSuppressed,
    protectedCriticalBranch: Boolean(openingNonTrivialStartMeta?.protectedCriticalBranch),
    hasGapTraversal: Boolean(openingNonTrivialStartMeta?.hasGapTraversal),
    hasSingleBounceRicochet: Boolean(openingNonTrivialStartMeta?.hasSingleBounceRicochet),
    hasSafeCenterRoute: Boolean(openingNonTrivialStartMeta?.hasSafeCenterRoute),
    inspectedPlanes: openingNonTrivialStartMeta?.inspectedPlanes ?? 0,
    inspectedTargets: openingNonTrivialStartMeta?.inspectedTargets ?? 0,
    reason: openingNonTrivialStartMeta?.reason || null,
  });
  if(criticalBaseThreat){
    const emergencyMove = getEmergencyDefenseMove(modeContext, criticalBaseThreat);
    if(emergencyMove){
      aiRoundState.currentGoal = emergencyMove.goalName || "emergency_base_defense";
      recordDecisionEvent("critical_threat_emergency_move", {
        goal: aiRoundState.currentGoal,
        move: emergencyMove,
        reasonCodes: ["critical_base_threat", "protect_home_base", "clean_intercept_available"],
      });
      logAiDecision("emergency_base_defense", {
        enemyId: criticalBaseThreat.enemy?.id ?? null,
        planeId: emergencyMove.plane?.id ?? null,
        distanceToBase: criticalBaseThreat.distanceToBase,
        hasCleanLineToBase: criticalBaseThreat.hasCleanLineToBase,
        goal: aiRoundState.currentGoal,
      });
      issueAIMoveWithInventoryUsage(modeContext, emergencyMove);
      return;
    }

    const holdPositionMove = getEmergencyBaseHoldPositionMove(modeContext, criticalBaseThreat);
    if(holdPositionMove){
      aiRoundState.currentGoal = holdPositionMove.goalName;
      recordDecisionEvent("critical_threat_hold_position", {
        goal: aiRoundState.currentGoal,
        move: holdPositionMove,
        reasonCodes: ["critical_base_threat", "intercept_lane_blocked", "fallback_hold_line"],
        rejectReasons: ["direct_intercept_unavailable"],
      });
      logAiDecision("emergency_base_hold_position", {
        enemyId: criticalBaseThreat.enemy?.id ?? null,
        planeId: holdPositionMove.plane?.id ?? null,
        distanceToBase: criticalBaseThreat.distanceToBase,
        hasCleanLineToBase: criticalBaseThreat.hasCleanLineToBase,
        holdPoint: holdPositionMove.holdPoint
          ? {
              x: Number(holdPositionMove.holdPoint.x.toFixed(1)),
              y: Number(holdPositionMove.holdPoint.y.toFixed(1)),
            }
          : null,
      });
      issueAIMoveWithInventoryUsage(modeContext, holdPositionMove);
      return;
    }
  }

  const hasEnemyBlueFlagCarrier = Boolean(
    modeContext.stolenBlueFlagCarrier
    && modeContext.stolenBlueFlagCarrier.color !== "blue"
  );
  if(hasEnemyBlueFlagCarrier){
    const blueHomeBase = modeContext.homeBase || getBaseAnchor("blue");
    const carrierThreat = {
      enemy: modeContext.stolenBlueFlagCarrier,
      base: blueHomeBase,
      distanceToBase: dist(modeContext.stolenBlueFlagCarrier, blueHomeBase),
      hasCleanLineToBase: isPathClear(
        modeContext.stolenBlueFlagCarrier.x,
        modeContext.stolenBlueFlagCarrier.y,
        blueHomeBase.x,
        blueHomeBase.y,
      ),
    };

    const carrierEmergencyMove = getEmergencyDefenseMove(modeContext, carrierThreat);
    if(carrierEmergencyMove){
      aiRoundState.currentGoal = carrierEmergencyMove.goalName || "eliminate_flag_carrier";
      recordDecisionEvent("flag_carrier_priority_emergency_move", {
        goal: aiRoundState.currentGoal,
        move: carrierEmergencyMove,
        reasonCodes: ["flag_carrier_priority_override", "protect_home_flag", "clean_intercept_available"],
      });
      logAiDecision("flag_carrier_priority_emergency_move", {
        enemyId: carrierThreat.enemy?.id ?? null,
        planeId: carrierEmergencyMove.plane?.id ?? null,
        distanceToBase: carrierThreat.distanceToBase,
        hasCleanLineToBase: carrierThreat.hasCleanLineToBase,
        goal: aiRoundState.currentGoal,
      });
      issueAIMoveWithInventoryUsage(modeContext, carrierEmergencyMove);
      return;
    }

    const carrierHoldMove = getEmergencyBaseHoldPositionMove(modeContext, carrierThreat);
    if(carrierHoldMove){
      aiRoundState.currentGoal = carrierHoldMove.goalName || "emergency_base_hold_position";
      recordDecisionEvent("flag_carrier_priority_hold_position", {
        goal: aiRoundState.currentGoal,
        move: carrierHoldMove,
        reasonCodes: ["flag_carrier_priority_override", "protect_home_flag", "fallback_hold_line"],
        rejectReasons: ["direct_intercept_unavailable"],
      });
      logAiDecision("flag_carrier_priority_hold_position", {
        enemyId: carrierThreat.enemy?.id ?? null,
        planeId: carrierHoldMove.plane?.id ?? null,
        distanceToBase: carrierThreat.distanceToBase,
        hasCleanLineToBase: carrierThreat.hasCleanLineToBase,
      });
      issueAIMoveWithInventoryUsage(modeContext, carrierHoldMove);
      return;
    }

    const previousMode = aiRoundState.mode;
    aiRoundState.mode = AI_MODES.DEFENSE;
    const carrierDefenseModeMove = planModeDrivenAiMove(modeContext);
    if(carrierDefenseModeMove){
      const selectedGoal = aiRoundState.currentGoal || carrierDefenseModeMove.goalName || "eliminate_flag_carrier";
      recordDecisionEvent("flag_carrier_priority_mode_defense", {
        goal: selectedGoal,
        move: carrierDefenseModeMove,
        reasonCodes: ["flag_carrier_priority_override", "mode_defense", "intercept_fallback"],
      });
      logAiDecision("flag_carrier_priority_mode_defense", {
        enemyId: carrierThreat.enemy?.id ?? null,
        planeId: carrierDefenseModeMove.plane?.id ?? null,
        goal: selectedGoal,
      });
      issueAIMoveWithInventoryUsage(modeContext, carrierDefenseModeMove);
      return;
    }
    aiRoundState.mode = previousMode;
    recordDecisionEvent("flag_carrier_priority_rejected", {
      goal: "eliminate_flag_carrier",
      reasonCodes: ["flag_carrier_priority_override", "defense_chain_failed", "search_next_plan"],
      rejectReasons: ["no_emergency_or_defense_move"],
    });
  }

  if(hasCriticalBaseThreat){
    recordDecisionEvent("opening_center_rejected", {
      goal: aiRoundState.currentGoal || "emergency_base_defense",
      reasonCodes: ["critical_base_threat", "opening_center_blocked"],
      rejectReasons: ["critical_base_threat"],
    });
    logAiDecision("critical_threat_center_blocked", {
      enemyId: criticalBaseThreat?.enemy?.id ?? null,
      reason: "critical_base_threat",
    });
  } else if(hasEarlyBaseWarningThreat){
    recordDecisionEvent("opening_center_rejected", {
      goal: aiRoundState.currentGoal || "opening_center_control",
      reasonCodes: ["early_base_warning", "opening_center_blocked"],
      rejectReasons: ["early_base_warning"],
    });
    logAiDecision("early_base_warning_center_skipped", {
      enemyId: earlyBaseWarningThreat?.enemy?.id ?? null,
      distanceToBase: earlyBaseWarningThreat?.distanceToBase ?? null,
      reason: "early_base_warning",
    });
  } else {
    const openingCenterPlan = tryPlanOpeningCenterControlMove(modeContext);
    const openingCenterMove = openingCenterPlan?.move || null;
    if(openingCenterMove){
      const openingCenterReasonCodes = ["opening_center_control", "no_critical_threat", "center_lane_available"];
      if(openingCenterMove?.softPathPenaltyApplied){
        openingCenterReasonCodes.push(openingCenterMove.softPathReasonCode || "soft_path_pass_with_penalty");
      }
      recordDecisionEvent("opening_center_selected", {
        goal: openingCenterMove.goalName || "opening_center_control",
        move: openingCenterMove,
        reasonCodes: openingCenterReasonCodes,
      });
      issueAIMoveWithInventoryUsage(modeContext, openingCenterMove);
      return;
    }

    const openingCenterRejectReason = openingCenterPlan?.rejectReason || "opening_center_attempt_failed";
    const openingCenterRejectReasons = [openingCenterRejectReason];
    recordDecisionEvent("opening_center_rejected", {
      goal: "opening_center_control",
      reasonCodes: ["opening_center_attempt_failed", "search_next_plan"],
      rejectReasons: openingCenterRejectReasons,
    });
  }

  let skippedEarlyDirectFinisher = shouldSkipDirectFinisherInOpening(modeContext);
  let earlyWarningFinisherOverride = null;
  if(skippedEarlyDirectFinisher && hasEarlyBaseWarningThreat && !hasCriticalBaseThreat){
    earlyWarningFinisherOverride = getEarlyWarningDirectFinisherOverride(modeContext, earlyBaseWarningThreat);
    if(earlyWarningFinisherOverride?.allow){
      skippedEarlyDirectFinisher = false;
      recordDecisionEvent("direct_finisher_opening_override", {
        goal: "direct_finisher",
        reasonCodes: ["early_base_warning", "clean_short_attack", "low_immediate_risk"],
      });
      logAiDecision("direct_finisher_opening_override", {
        warningEnemyId: earlyBaseWarningThreat?.enemy?.id ?? null,
        hasCleanLineToBase: earlyBaseWarningThreat?.hasCleanLineToBase ?? null,
        isNearCriticalDistance: earlyBaseWarningThreat?.isNearCriticalDistance ?? null,
        hasBaseTrajectoryUrgency: earlyBaseWarningThreat?.hasBaseTrajectoryUrgency ?? null,
        planeId: earlyWarningFinisherOverride.move?.plane?.id ?? null,
        enemyId: earlyWarningFinisherOverride.move?.enemy?.id ?? null,
        distance: Number((earlyWarningFinisherOverride.move?.totalDist || 0).toFixed(1)),
        immediateThreatCount: earlyWarningFinisherOverride.immediateResponseThreat?.count ?? 0,
        nearestThreatDist: Number.isFinite(earlyWarningFinisherOverride.immediateResponseThreat?.nearestDist)
          ? Number(earlyWarningFinisherOverride.immediateResponseThreat.nearestDist.toFixed(1))
          : null,
      });
    }
  }
  if(skippedEarlyDirectFinisher){
    const openingRestrictionDecision = shouldSkipDirectFinisherInOpening.lastDecision;
    const mapAdjustedRestrictionApplied = Boolean(openingRestrictionDecision?.mapAdjustedRestrictionApplied);
    recordDecisionEvent("direct_finisher_rejected", {
      goal: "direct_finisher",
      reasonCodes: ["direct_finisher_skipped", "opening_safety_priority"],
      rejectReasons: mapAdjustedRestrictionApplied
        ? ["opening_phase_restriction", "opening_phase_restriction_map_adjusted"]
        : ["opening_phase_restriction"],
    });
  }
  const earlyDirectFinisherMove = skippedEarlyDirectFinisher
    ? null
    : findDirectFinisherMove(modeContext.aiPlanes, modeContext.enemies, {
        source: "do_computer_move",
        goalName: "direct_finisher",
        context: modeContext,
      });
  if(earlyDirectFinisherMove){
    aiRoundState.currentGoal = earlyDirectFinisherMove.goalName;
    recordDecisionEvent("direct_finisher_selected", {
      goal: aiRoundState.currentGoal,
      move: earlyDirectFinisherMove,
      reasonCodes: appendOpeningAggressionReasonCode(
        ["direct_finisher_available", "clear_attack_lane", "high_value_target"],
        earlyDirectFinisherMove
      ),
    });
    logAiDecision("direct_finisher", {
      source: "do_computer_move",
      planeId: earlyDirectFinisherMove.plane?.id ?? null,
      enemyId: earlyDirectFinisherMove.enemy?.id ?? null,
      distance: Number((earlyDirectFinisherMove.totalDist || 0).toFixed(1)),
      reason: "direct_finisher",
    });
    issueAIMoveWithInventoryUsage(modeContext, earlyDirectFinisherMove);
    return;
  }

  const rolePack = assignAiRolesForTurn(modeContext);
  if(rolePack){
    const roleMove = planRoleDrivenAiMove(modeContext, rolePack);
    if(roleMove){
      const roleLanePassCode = roleMove?.lanePassReasonCode || "role_lane_found";
      recordDecisionEvent("role_move_selected", {
        goal: aiRoundState.currentGoal,
        move: roleMove,
        reasonCodes: appendOpeningAggressionReasonCode(
          ["role_assignment_ready", roleLanePassCode, "team_balance"],
          roleMove
        ),
      });
      logAiDecision("role_move", {
        goal: aiRoundState.currentGoal,
        planeId: roleMove.plane?.id ?? null,
      });
      issueAIMoveWithInventoryUsage(modeContext, roleMove);
      return;
    }
    recordDecisionEvent("role_move_rejected", {
      goal: aiRoundState.currentGoal || "role_move",
      reasonCodes: ["role_assignment_ready", "role_path_failed"],
      rejectReasons: ["no_role_path"],
    });
    logAiDecision("role_move_skip", { reason: "no_role_path", hasRoles: true });
  } else {
    recordDecisionEvent("role_assignment_rejected", {
      goal: "role_move",
      reasonCodes: ["role_assignment_missing", "search_other_strategy"],
      rejectReasons: ["no_available_roles"],
    });
    logAiDecision("role_assignment_skip", { reason: "no_available_roles" });
  }

  if(modeContext.aiRiskProfile.profile === "comeback" && shouldUseFlagsMode && availableEnemyFlags.length > 0){
    const quickFlagMove = planModeDrivenAiMove(modeContext);
    if(quickFlagMove && aiRoundState.currentGoal === "capture_enemy_flag"){
      recordDecisionEvent("comeback_flag_selected", {
        goal: aiRoundState.currentGoal,
        move: quickFlagMove,
        reasonCodes: appendBounceCandidateReasonCode(
          ["comeback_mode", "flag_pressure", "fast_flag_window"],
          quickFlagMove
        ),
      });
      logAiDecision("comeback_quick_flag", {
        planeId: quickFlagMove.plane?.id ?? null,
      });
      issueAIMoveWithInventoryUsage(modeContext, quickFlagMove);
      return;
    }

    recordDecisionEvent("comeback_flag_rejected", {
      goal: "capture_enemy_flag",
      reasonCodes: ["comeback_mode", "flag_plan_not_confirmed"],
      rejectReasons: ["unsafe_lane"],
    });
  }

  const earlyCargoMove = tryPlanEarlyCargoPickupMove(modeContext);
  if(earlyCargoMove){
    recordDecisionEvent("early_cargo_selected", {
      goal: earlyCargoMove.goalName || "early_cargo_pickup",
      move: earlyCargoMove,
      reasonCodes: ["cargo_priority", "safe_pickup_window", "resource_setup"],
    });
    issueAIMoveWithInventoryUsage(modeContext, earlyCargoMove);
    return;
  }

  const earlyCargoRejectReason = tryPlanEarlyCargoPickupMove.lastRejectReason || "cargo_pickup_rejected";
  recordDecisionEvent("early_cargo_rejected", {
    goal: "early_cargo_pickup",
    reasonCodes: ["cargo_pickup_rejected", "risk_control"],
    rejectReasons: [earlyCargoRejectReason],
  });

  const modeMove = planModeDrivenAiMove(modeContext);
  if(modeMove){
    recordDecisionEvent("mode_move_selected", {
      goal: aiRoundState.currentGoal,
      move: modeMove,
      reasonCodes: appendBounceCandidateReasonCode(
        appendOpeningAggressionReasonCode(
          ["mode_strategy", "best_available_lane", "no_better_finisher"],
          modeMove
        ),
        modeMove
      ),
    });
    logAiDecision("mode_move", {
      mode: aiRoundState.mode,
      goal: aiRoundState.currentGoal,
      planeId: modeMove.plane?.id ?? null,
    });
    issueAIMoveWithInventoryUsage(modeContext, modeMove);
    return;
  }

  const modeMoveRejectReason = planModeDrivenAiMove.lastRejectReason || "mode_strategy_failed";
  recordDecisionEvent("mode_move_rejected", {
    goal: aiRoundState.currentGoal || "mode_strategy",
    reasonCodes: ["mode_strategy_failed", "fallback_required"],
    rejectReasons: [modeMoveRejectReason],
  });

  const rejectedReserveReasons = [];
  const emergencyDefenseStageActive = isEmergencyDefenseStageGoal(aiRoundState.currentGoal);
  if(!emergencyDefenseStageActive){
    const preFallbackAttackMove = findPreFallbackAttackMove(modeContext);
    const preFallbackAttackRisk = estimatePreFallbackLocalAttackRisk(modeContext, preFallbackAttackMove);
    if(preFallbackAttackMove && preFallbackAttackRisk <= AI_CARGO_RISK_ACCEPTANCE){
      aiRoundState.currentGoal = preFallbackAttackMove.goalName || "pre_fallback_attack_radius";
      recordDecisionEvent("pre_fallback_bridge_selected", {
        goal: aiRoundState.currentGoal,
        move: preFallbackAttackMove,
        reasonCodes: ["pre_fallback_bridge", "local_attack_radius", "risk_threshold_respected"],
      });
      logAiDecision("pre_fallback_bridge_selected", {
        stage: "local_attack_radius",
        planeId: preFallbackAttackMove.plane?.id ?? null,
        enemyId: preFallbackAttackMove.enemy?.id ?? null,
        risk: Number(preFallbackAttackRisk.toFixed(3)),
        riskThreshold: AI_CARGO_RISK_ACCEPTANCE,
      });
      issueAIMoveWithInventoryUsage(modeContext, preFallbackAttackMove);
      return;
    }

    const positionalExitMove = findPreFallbackPositionalExitMove(modeContext);
    if(positionalExitMove?.move){
      aiRoundState.currentGoal = "safe_short_fallback_progress";
      recordDecisionEvent("pre_fallback_bridge_selected", {
        goal: aiRoundState.currentGoal,
        move: positionalExitMove.move,
        reasonCodes: ["pre_fallback_bridge", "positional_exit", "corridor_recovery"],
      });
      logAiDecision("pre_fallback_bridge_selected", {
        stage: "positional_exit",
        planeId: positionalExitMove.move.plane?.id ?? null,
        targetId: positionalExitMove.target?.id ?? null,
        targetType: positionalExitMove.group,
      });
      issueAIMoveWithInventoryUsage(modeContext, positionalExitMove.move);
      return;
    }
  }

  const fallbackMove = getFallbackAiMove(modeContext);
  const fallbackValidation = validateAiLaunchMoveCandidate(fallbackMove);
  if(fallbackMove && fallbackValidation.ok){
    aiRoundState.currentGoal = fallbackMove.goalName || "fallback_legacy_logic";
    recordDecisionEvent("fallback_selected", {
      goal: aiRoundState.currentGoal,
      move: fallbackMove,
      reasonCodes: appendBounceCandidateReasonCode(
        appendOpeningAggressionReasonCode(
          ["fallback_strategy", "last_resort_plan", "keep_turn_progress"],
          fallbackMove
        ),
        fallbackMove
      ),
      fallbackDiagnostics: {
        stageBeforeFallback: "mode_move_rejected",
        fallbackGoal: fallbackMove.goalName || aiRoundState.currentGoal || null,
        fallbackDecisionReason: fallbackMove.decisionReason || "fallback_legacy_logic",
        rootCauseHint: modeMoveRejectReason || null,
      },
    });
    logAiDecision("fallback_move", {
      planeId: fallbackMove.plane?.id ?? null,
      reason: fallbackMove.decisionReason || "fallback_legacy_logic",
    });
    issueAIMoveWithInventoryUsage(modeContext, fallbackMove);
    return;
  }
  if(fallbackMove && !fallbackValidation.ok){
    rejectedReserveReasons.push(fallbackValidation.reason || "invalid_fallback_move");
    logAiDecision("fallback_move_invalid", {
      planeId: fallbackMove?.plane?.id ?? null,
      reason: fallbackValidation.reason || "invalid_fallback_move",
      message: fallbackValidation.message || null,
    });
  }

  const guaranteedLaunchMove = getGuaranteedAnyLegalLaunch(modeContext);
  const guaranteedValidation = validateAiLaunchMoveCandidate(guaranteedLaunchMove);
  if(guaranteedLaunchMove && guaranteedValidation.ok){
    aiRoundState.currentGoal = guaranteedLaunchMove.goalName || "guaranteed_any_legal_launch";
    recordDecisionEvent("super_reserve_selected", {
      goal: aiRoundState.currentGoal,
      move: guaranteedLaunchMove,
      reasonCodes: ["super_reserve", "guaranteed_any_legal_launch", "keep_turn_progress"],
      fallbackDiagnostics: {
        stageBeforeFallback: "fallback_selected",
        fallbackGoal: guaranteedLaunchMove.goalName || aiRoundState.currentGoal || null,
        fallbackDecisionReason: guaranteedLaunchMove.decisionReason || "super_reserve_guaranteed_legal_launch",
        rootCauseHint: rejectedReserveReasons[0] || "invalid_fallback_move",
      },
    });
    logAiDecision("super_reserve_move", {
      planeId: guaranteedLaunchMove.plane?.id ?? null,
      reason: guaranteedLaunchMove.decisionReason || "super_reserve_guaranteed_legal_launch",
    });
    issueAIMoveWithInventoryUsage(modeContext, guaranteedLaunchMove);
    return;
  }
  if(guaranteedLaunchMove && !guaranteedValidation.ok){
    rejectedReserveReasons.push(guaranteedValidation.reason || "invalid_guaranteed_launch_move");
    logAiDecision("super_reserve_move_invalid", {
      planeId: guaranteedLaunchMove?.plane?.id ?? null,
      reason: guaranteedValidation.reason || "invalid_guaranteed_launch_move",
      message: guaranteedValidation.message || null,
    });
  }

  const forcedProgressMove = getForcedProgressLaunchMove(modeContext);
  const forcedProgressValidation = validateAiLaunchMoveCandidate(forcedProgressMove);
  if(forcedProgressMove && forcedProgressValidation.ok){
    aiRoundState.currentGoal = forcedProgressMove.goalName || "forced_progress_launch";
    recordDecisionEvent("forced_progress_selected", {
      goal: aiRoundState.currentGoal,
      move: forcedProgressMove,
      reasonCodes: ["forced_progress", "prevent_ai_stall", "keep_turn_progress"],
      rejectReasons: ["no_legal_path_found_by_standard_planners"],
      fallbackDiagnostics: {
        stageBeforeFallback: "super_reserve_rejected",
        fallbackGoal: forcedProgressMove.goalName || aiRoundState.currentGoal || null,
        fallbackDecisionReason: forcedProgressMove.decisionReason || "forced_progress_launch",
        rootCauseHint: rejectedReserveReasons[0] || "no_legal_path_found_by_standard_planners",
      },
    });
    logAiDecision("forced_progress_move", {
      planeId: forcedProgressMove.plane?.id ?? null,
      reason: forcedProgressMove.decisionReason || "forced_progress_launch",
    });
    issueAIMoveWithInventoryUsage(modeContext, forcedProgressMove);
    return;
  }
  if(forcedProgressMove && !forcedProgressValidation.ok){
    rejectedReserveReasons.push(forcedProgressValidation.reason || "invalid_forced_progress_move");
    logAiDecision("forced_progress_move_invalid", {
      planeId: forcedProgressMove?.plane?.id ?? null,
      reason: forcedProgressValidation.reason || "invalid_forced_progress_move",
      message: forcedProgressValidation.message || null,
    });
  }

  const currentGoalText = `${aiRoundState.currentGoal || ""}`.toLowerCase();
  const isCriticalOrEmergencyStage = currentGoalText.startsWith("critical_") || currentGoalText.startsWith("emergency_");
  if(!isCriticalOrEmergencyStage && typeof planPathToPoint === "function"){
    const safeAiPlanes = Array.isArray(modeContext?.aiPlanes)
      ? modeContext.aiPlanes.filter((plane) => (
          isPlaneLaunchStateReady(plane)
          && !flyingPoints.some((fp) => fp.plane === plane)
        ))
      : [];
    const enemyTargets = Array.isArray(modeContext?.enemies)
      ? modeContext.enemies.filter((enemy) => enemy?.isAlive)
      : [];
    const shortMoveMaxDist = Math.min(MAX_DRAG_DISTANCE * 0.36, ATTACK_RANGE_PX * 0.72);

    let safeShortMove = null;
    let bestEnemyCandidate = null;
    for(const plane of safeAiPlanes){
      for(const enemy of enemyTargets){
        if(!Number.isFinite(enemy?.x) || !Number.isFinite(enemy?.y)) continue;
        const enemyDistance = Math.hypot(enemy.x - plane.x, enemy.y - plane.y);
        if(enemyDistance > MAX_DRAG_DISTANCE * 1.05) continue;
        if(!isPathClear(plane.x, plane.y, enemy.x, enemy.y)) continue;
        if(bestEnemyCandidate && bestEnemyCandidate.distance <= enemyDistance) continue;
        bestEnemyCandidate = { plane, enemy, distance: enemyDistance };
      }
    }

    if(bestEnemyCandidate){
      const plannedEnemyMove = planPathToPoint(bestEnemyCandidate.plane, bestEnemyCandidate.enemy.x, bestEnemyCandidate.enemy.y, {
        goalName: "safe_short_fallback_progress",
        decisionReason: "safe_short_fallback_progress_enemy_plane",
      });
      if(plannedEnemyMove){
        const baseDist = Number.isFinite(plannedEnemyMove.baseTotalDist) && plannedEnemyMove.baseTotalDist > 0
          ? plannedEnemyMove.baseTotalDist
          : (Number.isFinite(plannedEnemyMove.totalDist) ? plannedEnemyMove.totalDist : 0);
        if(Number.isFinite(baseDist) && baseDist > 0){
          const distanceScale = Math.max(0.22, Math.min(0.4, shortMoveMaxDist / baseDist));
          const shortEnemyMove = {
            ...plannedEnemyMove,
            plane: bestEnemyCandidate.plane,
            vx: plannedEnemyMove.vx * distanceScale,
            vy: plannedEnemyMove.vy * distanceScale,
            totalDist: baseDist * distanceScale,
            goalName: "safe_short_fallback_progress",
            decisionReason: "safe_short_fallback_progress_enemy_plane",
            targetType: "enemy_plane",
          };
          const shortEnemyValidation = validateAiLaunchMoveCandidate(shortEnemyMove);
          if(shortEnemyValidation.ok){
            safeShortMove = { move: shortEnemyMove, target: bestEnemyCandidate.enemy, group: "enemy_plane" };
          }
        }
      }
    }

    if(!safeShortMove){
      let bestThreatAvoidance = null;
      for(const plane of safeAiPlanes){
        const nearestThreat = enemyTargets.reduce((nearest, enemy) => {
          if(!Number.isFinite(enemy?.x) || !Number.isFinite(enemy?.y)) return nearest;
          const distance = Math.hypot(enemy.x - plane.x, enemy.y - plane.y);
          if(!nearest || distance < nearest.distance){
            return { enemy, distance };
          }
          return nearest;
        }, null);
        if(!nearestThreat || nearestThreat.distance <= 0) continue;

        const awayX = (plane.x - nearestThreat.enemy.x) / nearestThreat.distance;
        const awayY = (plane.y - nearestThreat.enemy.y) / nearestThreat.distance;
        const shiftDistance = Math.min(MAX_DRAG_DISTANCE * 0.34, Math.max(CELL_SIZE * 1.2, nearestThreat.distance * 0.32));
        const targetX = Math.max(
          FIELD_LEFT + FIELD_BORDER_OFFSET_X,
          Math.min(FIELD_LEFT + FIELD_WIDTH - FIELD_BORDER_OFFSET_X, plane.x + awayX * shiftDistance)
        );
        const targetY = Math.max(
          FIELD_TOP + FIELD_BORDER_OFFSET_Y,
          Math.min(FIELD_TOP + FIELD_HEIGHT - FIELD_BORDER_OFFSET_Y, plane.y + awayY * shiftDistance)
        );

        const plannedAvoidanceMove = planPathToPoint(plane, targetX, targetY, {
          goalName: "safe_short_fallback_progress",
          decisionReason: "safe_short_fallback_progress_threat_avoidance",
        });
        if(!plannedAvoidanceMove) continue;

        const landing = getAiMoveLandingPoint({ plane, ...plannedAvoidanceMove });
        if(!landing) continue;
        const beforeDist = nearestThreat.distance;
        const afterDist = Math.hypot(landing.x - nearestThreat.enemy.x, landing.y - nearestThreat.enemy.y);
        const distanceGain = afterDist - beforeDist;
        if(distanceGain <= 0) continue;

        const avoidanceValidation = validateAiLaunchMoveCandidate({ plane, ...plannedAvoidanceMove });
        if(!avoidanceValidation.ok) continue;

        if(!bestThreatAvoidance || distanceGain > bestThreatAvoidance.distanceGain){
          bestThreatAvoidance = {
            move: {
              ...plannedAvoidanceMove,
              plane,
              goalName: "safe_short_fallback_progress",
              decisionReason: "safe_short_fallback_progress_threat_avoidance",
              targetType: "threat_avoidance",
            },
            target: nearestThreat.enemy,
            group: "threat_avoidance",
            distanceGain,
          };
        }
      }

      if(bestThreatAvoidance){
        safeShortMove = {
          move: bestThreatAvoidance.move,
          target: bestThreatAvoidance.target,
          group: bestThreatAvoidance.group,
        };
      }
    }

    if(safeShortMove){
      aiRoundState.currentGoal = "safe_short_fallback_progress";
      recordDecisionEvent("safe_short_fallback_selected", {
        goal: aiRoundState.currentGoal,
        move: safeShortMove.move,
        reasonCodes: [
          "safe_short_fallback_progress",
          "mode_fallback_gap_covered",
          `safe_short_target_${safeShortMove.group}`,
        ],
        fallbackDiagnostics: {
          stageBeforeFallback: "forced_progress_rejected",
          fallbackGoal: safeShortMove.move?.goalName || aiRoundState.currentGoal || null,
          fallbackDecisionReason: safeShortMove.move?.decisionReason || "safe_short_fallback_progress",
          rootCauseHint: rejectedReserveReasons[0] || "no_legal_path_found_by_standard_planners",
        },
      });
      logAiDecision("safe_short_fallback_selected", {
        planeId: safeShortMove.move.plane?.id ?? null,
        targetType: safeShortMove.group,
        targetId: safeShortMove.target?.id ?? null,
        distance: Number((safeShortMove.move.totalDist || 0).toFixed(1)),
        reasonCode: "safe_short_fallback_progress",
      });
      issueAIMoveWithInventoryUsage(modeContext, safeShortMove.move);
      return;
    }
  }

  recordDecisionEvent("no_move_found", {
    goal: aiRoundState.currentGoal || "no_move_found",
    reasonCodes: ["all_strategies_failed", "fail_safe_turn_advance"],
    rejectReasons: rejectedReserveReasons.length
      ? ["no_valid_move_found", ...rejectedReserveReasons.slice(0, 3)]
      : ["no_valid_move_found"],
  });
  logAiDecision("ai_no_move_fail_safe", {
    turn: aiRoundState.turnNumber,
    mode: aiRoundState.mode || null,
    counts: {
      aiPlanes: aiPlanes.length,
      enemies: enemies.length,
      availableEnemyFlags: availableEnemyFlags.length,
      blueInventory: modeContext.blueInventoryCount,
    },
  });
  failSafeHandler("no_move_found", {
    goal: aiRoundState.currentGoal || "no_move_found",
    turn: aiRoundState.turnNumber,
    mode: aiRoundState.mode || null,
    counts: {
      aiPlanes: aiPlanes.length,
      enemies: enemies.length,
      availableEnemyFlags: availableEnemyFlags.length,
      blueInventory: modeContext.blueInventoryCount,
    },
    reasonCodes: ["all_strategies_failed", "fail_safe_turn_advance"],
    rejectReasons: rejectedReserveReasons.length
      ? ["no_valid_move_found", ...rejectedReserveReasons.slice(0, 3)]
      : ["no_valid_move_found"],
  });
}

function tryGetAiTacticalMediumScale(baseScale, baseAngle, plane, speedPxPerSec){
  const normalizedBaseScale = Math.max(0, Math.min(1, Number.isFinite(baseScale) ? baseScale : 0));
  if(normalizedBaseScale < AI_LONG_SHOT_POWER_RATIO_THRESHOLD) return null;

  const longStreak = Number.isFinite(aiRoundState?.consecutiveLongLaunches)
    ? aiRoundState.consecutiveLongLaunches
    : 0;
  if(longStreak < AI_TACTICAL_MEDIUM_STREAK_TRIGGER) return null;
  if(Math.random() > AI_TACTICAL_MEDIUM_TRIGGER_CHANCE) return null;

  const cappedScale = Math.min(
    AI_TACTICAL_MEDIUM_SCALE_MAX,
    Math.max(AI_TACTICAL_MEDIUM_SCALE_MIN, normalizedBaseScale * 0.78)
  );
  const mediumScale = Math.min(normalizedBaseScale, cappedScale);
  if(mediumScale >= normalizedBaseScale) return null;

  const safeDeviationSteps = [0, Math.PI / 90, Math.PI / 72];
  for(const step of safeDeviationSteps){
    const deviations = step === 0 ? [0] : [-step, step];
    for(const deviation of deviations){
      const angle = baseAngle + deviation;
      const vx = Math.cos(angle) * mediumScale * speedPxPerSec;
      const vy = Math.sin(angle) * mediumScale * speedPxPerSec;
      const landingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
      const landingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;
      if(isPathClear(plane.x, plane.y, landingX, landingY)){
        return {
          mediumScale,
          safetyDeviation: deviation,
          longStreak,
        };
      }
    }
  }

  return null;
}

function countRouteNearbyColliders(x1, y1, x2, y2, radiusPx){
  if(!Array.isArray(colliders) || colliders.length === 0) return 0;
  const safeRadius = Number.isFinite(radiusPx) ? Math.max(0, radiusPx) : 0;
  const segmentDx = x2 - x1;
  const segmentDy = y2 - y1;
  const segmentLengthSq = segmentDx * segmentDx + segmentDy * segmentDy;

  let nearbyCount = 0;
  for(const collider of colliders){
    if(!collider) continue;
    const cx = Number.isFinite(collider.cx) ? collider.cx : null;
    const cy = Number.isFinite(collider.cy) ? collider.cy : null;
    if(cx === null || cy === null) continue;

    const halfWidth = Number.isFinite(collider.halfWidth) ? collider.halfWidth : 0;
    const halfHeight = Number.isFinite(collider.halfHeight) ? collider.halfHeight : 0;
    const rotation = Number.isFinite(collider.rotation) ? collider.rotation : 0;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const aabbHalfWidth = Math.abs(halfWidth * cos) + Math.abs(halfHeight * sin);
    const aabbHalfHeight = Math.abs(halfWidth * sin) + Math.abs(halfHeight * cos);

    const expandedLeft = cx - aabbHalfWidth - safeRadius;
    const expandedRight = cx + aabbHalfWidth + safeRadius;
    const expandedTop = cy - aabbHalfHeight - safeRadius;
    const expandedBottom = cy + aabbHalfHeight + safeRadius;

    let closestX;
    let closestY;
    if(segmentLengthSq <= 0.000001){
      closestX = x1;
      closestY = y1;
    } else {
      const t = Math.max(0, Math.min(1, ((cx - x1) * segmentDx + (cy - y1) * segmentDy) / segmentLengthSq));
      closestX = x1 + segmentDx * t;
      closestY = y1 + segmentDy * t;
    }

    if(closestX >= expandedLeft
      && closestX <= expandedRight
      && closestY >= expandedTop
      && closestY <= expandedBottom){
      nearbyCount += 1;
    }
  }

  return nearbyCount;
}

function planPathToPoint(plane, tx, ty, options = {}){
  const flightDistancePx = settings.flightRangeCells * CELL_SIZE;
  const speedPxPerSec    = flightDistancePx / FIELD_FLIGHT_DURATION_SEC;
  const extendedDetourColliderThreshold = 18;
  const narrowCorridorColliderThreshold = 26;
  const narrowCorridorRouteNearbyThreshold = 5;
  const narrowCorridorRouteProbeRadiusPx = CELL_SIZE * 1.1;
  const activeGoalName = `${options?.goalName || aiRoundState?.currentGoal || ""}`.toLowerCase();
  const isCriticalOrEmergencyStage = isEmergencyDefenseStageGoal(options?.goalName || aiRoundState?.currentGoal);
  const strictGapPathRejectStage = activeGoalName.includes("critical_base_threat")
    || activeGoalName.includes("emergency_");
  const relaxedEmergencyThreshold = isCriticalOrEmergencyStage
    && (typeof options?.goalName === "string")
    && (options.goalName.includes("critical_base_threat") || options.goalName.includes("emergency_base_defense"));
  const defaultRouteClass = typeof options?.routeClass === "string"
    ? options.routeClass
    : ((`${options?.decisionReason || ""}`.toLowerCase().includes("gap") || `${options?.goalName || ""}`.toLowerCase().includes("gap"))
      ? "gap"
      : "direct");
  const requestedRouteClass = `${defaultRouteClass || "direct"}`.toLowerCase();
  const shouldForceNonDirectBranch = requestedRouteClass === "ricochet";
  const routeClassRejectDiagnosticsEnabled = options?.enableRouteClassRejectDiagnostics !== false;
  planPathToPoint.lastRejectCode = null;

  function recordRouteClassRejectDiagnostic(candidateClass, rejectCode){
    if(!routeClassRejectDiagnosticsEnabled || !aiRoundState || typeof aiRoundState !== "object") return;
    const classKey = `${candidateClass || "direct"}`.toLowerCase();
    if(classKey !== "direct" && classKey !== "gap" && classKey !== "ricochet") return;

    const safePlaneId = plane?.id ?? "unknown_plane";
    const safeTx = Number.isFinite(tx) ? Number(tx.toFixed(2)) : tx;
    const safeTy = Number.isFinite(ty) ? Number(ty.toFixed(2)) : ty;
    const pairKey = `${safePlaneId}:${safeTx}:${safeTy}`;
    const diagnostics = aiRoundState.routeClassRejectDiagnostics && typeof aiRoundState.routeClassRejectDiagnostics === "object"
      ? aiRoundState.routeClassRejectDiagnostics
      : {
          pairOrder: [],
          pairs: {},
          classes: {
            direct: { attempted: 0, accepted: 0, rejected: 0, rejectCodes: {} },
            gap: { attempted: 0, accepted: 0, rejected: 0, rejectCodes: {} },
            ricochet: { attempted: 0, accepted: 0, rejected: 0, rejectCodes: {} },
          },
        };
    aiRoundState.routeClassRejectDiagnostics = diagnostics;

    if(!diagnostics.pairs[pairKey]){
      diagnostics.pairs[pairKey] = {
        pairKey,
        planeId: safePlaneId,
        targetX: safeTx,
        targetY: safeTy,
        classes: {
          direct: { attempted: 0, accepted: 0, rejected: 0, rejectCodes: {} },
          gap: { attempted: 0, accepted: 0, rejected: 0, rejectCodes: {} },
          ricochet: { attempted: 0, accepted: 0, rejected: 0, rejectCodes: {} },
        },
      };
      diagnostics.pairOrder.push(pairKey);
      if(diagnostics.pairOrder.length > 200) diagnostics.pairOrder.shift();
    }

    const pairMeta = diagnostics.pairs[pairKey];
    const pairClassMeta = pairMeta.classes[classKey];
    const classMeta = diagnostics.classes[classKey];
    pairClassMeta.attempted += 1;
    classMeta.attempted += 1;
    if(rejectCode){
      pairClassMeta.rejected += 1;
      classMeta.rejected += 1;
      pairClassMeta.rejectCodes[rejectCode] = (pairClassMeta.rejectCodes[rejectCode] || 0) + 1;
      classMeta.rejectCodes[rejectCode] = (classMeta.rejectCodes[rejectCode] || 0) + 1;
    } else {
      pairClassMeta.accepted += 1;
      classMeta.accepted += 1;
    }
  }

  function estimateRouteClearancePx(x1, y1, x2, y2){
    if(!Array.isArray(colliders) || colliders.length === 0) return CELL_SIZE * 2;
    let minClearance = Number.POSITIVE_INFINITY;
    for(const collider of colliders){
      if(!collider || !Number.isFinite(collider.cx) || !Number.isFinite(collider.cy)) continue;
      const toRouteDist = getDistanceFromPointToSegment(collider.cx, collider.cy, x1, y1, x2, y2);
      const halfWidth = Number.isFinite(collider.halfWidth) ? collider.halfWidth : 0;
      const halfHeight = Number.isFinite(collider.halfHeight) ? collider.halfHeight : 0;
      const colliderRadius = Math.hypot(halfWidth, halfHeight);
      const clearance = toRouteDist - colliderRadius;
      if(clearance < minClearance) minClearance = clearance;
    }
    if(!Number.isFinite(minClearance)) return CELL_SIZE * 2;
    return Math.max(0, minClearance);
  }

  function evaluateRouteMetrics({ landingX, landingY, distance, candidateClass = defaultRouteClass, progressMeta }){
    const safeProgressMeta = progressMeta || getAiNoticeableProgressMeta(plane.x, plane.y, landingX, landingY, tx, ty);
    const clearancePx = estimateRouteClearancePx(plane.x, plane.y, landingX, landingY);
    const nearbyCount = countRouteNearbyColliders(plane.x, plane.y, landingX, landingY, CELL_SIZE * 0.85);
    const corridorTightness = Math.max(0, Math.min(1, nearbyCount / 6));
    const progress = Number.isFinite(safeProgressMeta?.improvement)
      ? Math.max(0, safeProgressMeta.improvement)
      : 0;

    let responseRisk = 0;
    if(typeof getImmediateResponseThreatMeta === "function" && options?.context){
      const threatMeta = getImmediateResponseThreatMeta(options.context, landingX, landingY, options?.targetEnemy || null);
      responseRisk = getFallbackCandidateResponseRisk(threatMeta);
    }

    const minProgressBase = safeProgressMeta?.noticeableThreshold
      ? safeProgressMeta.noticeableThreshold * (relaxedEmergencyThreshold ? 0.6 : 1)
      : CELL_SIZE * (relaxedEmergencyThreshold ? 0.24 : 0.4);
    const minProgress = candidateClass === "ricochet"
      ? minProgressBase * 0.9
      : (candidateClass === "gap" && !relaxedEmergencyThreshold ? minProgressBase * 0.85 : minProgressBase);
    const maxResponseRiskBase = relaxedEmergencyThreshold ? 0.95 : 0.8;
    const maxResponseRisk = candidateClass === "ricochet"
      ? Math.min(0.97, maxResponseRiskBase + 0.12)
      : maxResponseRiskBase;
    const maxCorridorTightness = candidateClass === "ricochet"
      ? 0.985
      : (candidateClass === "gap" && !relaxedEmergencyThreshold ? 0.965 : 0.95);
    const minGapClearanceBase = relaxedEmergencyThreshold ? CELL_SIZE * 0.04 : CELL_SIZE * 0.08;
    const minGapClearance = candidateClass === "gap"
      ? Math.max(0, minGapClearanceBase * (relaxedEmergencyThreshold ? 0.6 : 0))
      : minGapClearanceBase;

    let rejectCode = null;
    if(progress + 0.0001 < minProgress){
      rejectCode = "insufficient_progress";
    } else if(responseRisk > maxResponseRisk || corridorTightness > maxCorridorTightness){
      rejectCode = "unsafe_lane";
    } else if(candidateClass === "gap" && clearancePx < minGapClearance){
      rejectCode = "blocked_at_gap";
    }

    recordRouteClassRejectDiagnostic(candidateClass, rejectCode);

    const clearanceNorm = Math.max(0, Math.min(1, clearancePx / Math.max(1, CELL_SIZE * 1.5)));
    const progressNorm = Math.max(0, Math.min(1, progress / Math.max(1, distance)));
    const qualityScore = Number((
      progressNorm * 0.5
      + clearanceNorm * 0.25
      + (1 - responseRisk) * 0.15
      + (1 - corridorTightness) * 0.1
    ).toFixed(6));

    return {
      clearance: Number(clearancePx.toFixed(2)),
      progress: Number(progress.toFixed(2)),
      responseRisk: Number(responseRisk.toFixed(4)),
      corridorTightness: Number(corridorTightness.toFixed(4)),
      qualityScore,
      rejectCode,
    };
  }

  function finalizePlannedMove(move, actualAngle, progressMeta){
    if(!move) return null;
    const sector = getAiDirectionSectorDeg(actualAngle);
    const safeProgressMeta = progressMeta || getAiNoticeableProgressMeta(plane.x, plane.y, plane.x, plane.y, tx, ty);
    const repeatSectorPenalty = getAiStuckRepeatSectorPenalty(plane, sector);
    const baseTotalDist = Number.isFinite(move.totalDist) ? move.totalDist : 0;
    const adjustedTotalDist = baseTotalDist + repeatSectorPenalty;

    markAiStuckSectorUsed(plane, sector);
    updateAiStuckAttempt(plane, {
      pathBlocked: false,
      progressMeta: safeProgressMeta,
      sector,
    });

    return {
      ...move,
      totalDist: adjustedTotalDist,
      baseTotalDist,
      sector,
      repeatSectorPenalty,
    };
  }

  function buildMoveWithSafeDeviation(baseAngle, distance, scale, meta = {}){
    const tacticalMedium = tryGetAiTacticalMediumScale(scale, baseAngle, plane, speedPxPerSec);
    const workingScale = tacticalMedium ? tacticalMedium.mediumScale : scale;
    if(tacticalMedium){
      logAiDecision("ai_tactical_medium_launch_applied", {
        planeId: plane?.id ?? null,
        targetX: tx,
        targetY: ty,
        baseScale: Number(scale.toFixed(3)),
        tacticalScale: Number(workingScale.toFixed(3)),
        longStreak: tacticalMedium.longStreak,
        safetyDeviation: Number(tacticalMedium.safetyDeviation.toFixed(4)),
        goalName: meta?.goalName ?? options?.goalName ?? null,
        decisionReason: meta?.decisionReason ?? options?.decisionReason ?? null,
      });
    }

    const angleGuard = applyAiAntiRepeatAngleGuard(baseAngle, {
      recentAnglesDeg: aiRoundState?.recentLaunchAnglesDeg,
      repeatStreakCount: aiRoundState?.angleRepeatStreakCount,
      seedParts: [
        aiRoundState?.turnNumber ?? 0,
        aiRoundState?.tieBreakerSeed ?? 0,
        plane?.id ?? "",
        Number.isFinite(tx) ? tx.toFixed(2) : "",
        Number.isFinite(ty) ? ty.toFixed(2) : "",
        meta?.moveType ?? "direct",
      ],
    });
    const effectiveBaseAngle = angleGuard.adjustedAngleRad;
    const attemptDeviation = getRandomDeviation(distance, AI_MAX_ANGLE_DEVIATION);
    const deviations = [
      attemptDeviation,
      attemptDeviation * 0.5,
      attemptDeviation * 0.25
    ];

    let bestRoute = null;
    let bestRouteScore = Number.NEGATIVE_INFINITY;
    let bestRejectCode = null;

    function considerCandidate(vx, vy, actualAngle, totalDist, candidateMeta = {}, progressMeta = null){
      const landingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
      const landingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;
      const candidateClass = candidateMeta?.candidateClass || meta?.candidateClass || defaultRouteClass;
      const fullPathClear = isPathClear(plane.x, plane.y, landingX, landingY);
      if(!fullPathClear){
        let canUseGapCandidateAfterEntryCheck = false;
        if(candidateClass === "gap" && !strictGapPathRejectStage){
          const dx = landingX - plane.x;
          const dy = landingY - plane.y;
          const fullPathLength = Math.hypot(dx, dy);
          const minEntryProbePx = CELL_SIZE * 0.2;
          const maxEntryProbePx = CELL_SIZE * 0.6;
          const entryProbePx = Math.max(minEntryProbePx, Math.min(maxEntryProbePx, fullPathLength * 0.2));
          if(fullPathLength > 0.0001){
            const entryRatio = Math.max(0, Math.min(1, entryProbePx / fullPathLength));
            const entryX = plane.x + dx * entryRatio;
            const entryY = plane.y + dy * entryRatio;
            canUseGapCandidateAfterEntryCheck = isPathClear(plane.x, plane.y, entryX, entryY);
          }
        }
        if(!canUseGapCandidateAfterEntryCheck){
          bestRejectCode = candidateClass === "gap"
            ? "blocked_at_gap__gap_entry_probe_blocked"
            : (bestRejectCode || "blocked_path__candidate_segment_blocked");
          return;
        }
      }
      const routeMetrics = evaluateRouteMetrics({
        landingX,
        landingY,
        distance: totalDist,
        candidateClass,
        progressMeta,
      });
      if(routeMetrics.rejectCode){
        bestRejectCode = routeMetrics.rejectCode;
        return;
      }
      const move = finalizePlannedMove(
        {
          vx,
          vy,
          totalDist,
          moveType: meta?.moveType || "direct",
          routeMetrics,
          routeQualityScore: routeMetrics.qualityScore,
          ...candidateMeta,
        },
        actualAngle,
        progressMeta || getAiNoticeableProgressMeta(plane.x, plane.y, landingX, landingY, tx, ty)
      );
      const candidateScore = routeMetrics.qualityScore;
      if(candidateScore > bestRouteScore + 0.000001
        || (Math.abs(candidateScore - bestRouteScore) <= 0.000001 && move.totalDist < (bestRoute?.totalDist ?? Number.POSITIVE_INFINITY))){
        bestRoute = move;
        bestRouteScore = candidateScore;
      }
    }

    for(const deviation of deviations){
      const actualAngle = effectiveBaseAngle + deviation;
      const vx = Math.cos(actualAngle) * workingScale * speedPxPerSec;
      const vy = Math.sin(actualAngle) * workingScale * speedPxPerSec;
      considerCandidate(vx, vy, actualAngle, distance, { candidateClass: defaultRouteClass });
    }

    const colliderCount = Array.isArray(colliders) ? colliders.length : 0;
    const routeNearbyColliderCount = countRouteNearbyColliders(
      plane.x,
      plane.y,
      tx,
      ty,
      narrowCorridorRouteProbeRadiusPx
    );
    const shouldUseNarrowCorridorAttempt = routeNearbyColliderCount >= narrowCorridorRouteNearbyThreshold
      || colliderCount >= narrowCorridorColliderThreshold;

    const deterministicDeviationSteps = shouldUseNarrowCorridorAttempt
      ? [
        Math.PI / 96,
        Math.PI / 72,
        Math.PI / 60,
        Math.PI / 48,
        Math.PI / 40,
        Math.PI / 36,
        Math.PI / 30,
        Math.PI / 24,
      ]
      : [
        0,
        Math.PI / 96,
        Math.PI / 72,
        Math.PI / 60,
        Math.PI / 48,
        Math.PI / 40,
        Math.PI / 36,
        Math.PI / 30,
        Math.PI / 24,
      ];
    const deterministicDeviations = [];
    for(const step of deterministicDeviationSteps){
      if(step === 0){
        deterministicDeviations.push(0);
      } else {
        deterministicDeviations.push(-step, step);
      }
    }

    for(const deviation of deterministicDeviations){
      const actualAngle = effectiveBaseAngle + deviation;
      const vx = Math.cos(actualAngle) * workingScale * speedPxPerSec;
      const vy = Math.sin(actualAngle) * workingScale * speedPxPerSec;
      considerCandidate(vx, vy, actualAngle, distance, { candidateClass: defaultRouteClass });
      if(bestRoute){
        logAiDecision("detour_angle_selected", {
          planeId: plane?.id ?? null,
          targetX: tx,
          targetY: ty,
          distance,
          deviation,
          ...meta
        });
        break;
      }
    }

    if(angleGuard.usedSafeFan){
      logAiDecision("ai_safe_fan_angle_applied", {
        planeId: plane?.id ?? null,
        goalName: meta?.goalName ?? null,
        decisionReason: meta?.decisionReason ?? null,
        targetX: tx,
        targetY: ty,
        safeFanOffsetDeg: Number(angleGuard.safeFanOffsetDeg.toFixed(2)),
        spreadDeg: Number.isFinite(angleGuard.spreadDeg) ? Number(angleGuard.spreadDeg.toFixed(2)) : null,
        sampleCount: angleGuard.sampleCount,
        repeatStreakCount: angleGuard.repeatStreakCount,
      });
    }

    if(shouldUseNarrowCorridorAttempt){
      const narrowCorridorDeviationSteps = [
        0,
        Math.PI / 120,
        Math.PI / 90,
        Math.PI / 72,
      ];
      const narrowCorridorScaleFactors = [1, 0.92, 0.84, 0.76];

      for(const scaleFactor of narrowCorridorScaleFactors){
        const narrowedScale = Math.max(0.2, Math.min(1, workingScale * scaleFactor));
        for(const step of narrowCorridorDeviationSteps){
          const deviationsToTry = step === 0 ? [0] : [-step, step];
          for(const deviation of deviationsToTry){
            const actualAngle = effectiveBaseAngle + deviation;
            const vx = Math.cos(actualAngle) * narrowedScale * speedPxPerSec;
            const vy = Math.sin(actualAngle) * narrowedScale * speedPxPerSec;
            const landingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
            const landingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;
            if(isPathClear(plane.x, plane.y, landingX, landingY)){
              const primaryProgressMeta = getAiNoticeableProgressMeta(
                plane.x,
                plane.y,
                landingX,
                landingY,
                tx,
                ty,
                { thresholdScale: AI_LANE_PROGRESS_PRIMARY_THRESHOLD_SCALE }
              );
              if(!primaryProgressMeta.hasNoticeableProgress){
                const reserveProgressMeta = getAiNoticeableProgressMeta(
                  plane.x,
                  plane.y,
                  landingX,
                  landingY,
                  tx,
                  ty,
                  { thresholdScale: AI_LANE_PROGRESS_RESERVE_THRESHOLD_SCALE }
                );
                if(!isCriticalOrEmergencyStage && reserveProgressMeta.hasNoticeableProgress){
                  const laneTightPenalty = CELL_SIZE * AI_LANE_TIGHT_PASS_SCORE_PENALTY_SCALE;
                  considerCandidate(vx, vy, actualAngle, distance * narrowedScale + laneTightPenalty, {
                    laneTightPassApplied: true,
                    laneTightPenalty,
                    lanePassType: "lane_tight_pass",
                    lanePassReasonCode: "lane_tight_pass",
                    candidateClass: "gap",
                  }, reserveProgressMeta);
                  const tightMove = bestRoute;
                  logAiDecision("narrow_corridor_selected", {
                    reasonCode: "narrow_corridor_selected",
                    lanePassType: "lane_tight_pass",
                    planeId: plane?.id ?? null,
                    targetX: tx,
                    targetY: ty,
                    distance,
                    deviation,
                    narrowedScale: Number(narrowedScale.toFixed(3)),
                    improvement: Number(reserveProgressMeta.improvement.toFixed(2)),
                    noticeableThreshold: Number(reserveProgressMeta.noticeableThreshold.toFixed(2)),
                    colliderCount,
                    routeNearbyColliderCount,
                    ...meta
                  });
                  if(tightMove) return tightMove;
                }

                logAiDecision("narrow_corridor_rejected", {
                  reasonCode: "no_noticeable_progress",
                  planeId: plane?.id ?? null,
                  targetX: tx,
                  targetY: ty,
                  distance,
                  deviation,
                  narrowedScale: Number(narrowedScale.toFixed(3)),
                  improvement: Number(primaryProgressMeta.improvement.toFixed(2)),
                  noticeableThreshold: Number(primaryProgressMeta.noticeableThreshold.toFixed(2)),
                  reserveThreshold: Number((CELL_SIZE * AI_LANE_PROGRESS_RESERVE_THRESHOLD_SCALE).toFixed(2)),
                  reservePassAllowed: !isCriticalOrEmergencyStage,
                  colliderCount,
                  routeNearbyColliderCount,
                  ...meta
                });
                continue;
              }

              considerCandidate(vx, vy, actualAngle, distance * narrowedScale, {
                lanePassType: "lane_comfort_pass",
                lanePassReasonCode: "lane_comfort_pass",
                candidateClass: "gap",
              }, primaryProgressMeta);
              const comfortMove = bestRoute;
              logAiDecision("narrow_corridor_selected", {
                reasonCode: "narrow_corridor_selected",
                lanePassType: "lane_comfort_pass",
                planeId: plane?.id ?? null,
                targetX: tx,
                targetY: ty,
                distance,
                deviation,
                narrowedScale: Number(narrowedScale.toFixed(3)),
                improvement: Number(primaryProgressMeta.improvement.toFixed(2)),
                noticeableThreshold: Number(primaryProgressMeta.noticeableThreshold.toFixed(2)),
                colliderCount,
                routeNearbyColliderCount,
                ...meta
              });
              if(comfortMove) return comfortMove;
            }
          }
        }
      }

      logAiDecision("narrow_corridor_rejected", {
        reasonCode: "narrow_corridor_rejected",
        planeId: plane?.id ?? null,
        targetX: tx,
        targetY: ty,
        distance,
        colliderCount,
        routeNearbyColliderCount,
        ...meta
      });
    }

    const shouldUseExtendedDetours = (settings.mapIndex !== 0)
      || (colliderCount > extendedDetourColliderThreshold);
    if(shouldUseExtendedDetours){
      const extendedDeviationSteps = [
        Math.PI / 15,
        Math.PI / 10,
      ];

      for(const step of extendedDeviationSteps){
        for(const deviation of [-step, step]){
          const actualAngle = baseAngle + deviation;
          const vx = Math.cos(actualAngle) * workingScale * speedPxPerSec;
          const vy = Math.sin(actualAngle) * workingScale * speedPxPerSec;
          considerCandidate(vx, vy, actualAngle, distance, { candidateClass: defaultRouteClass });
          if(bestRoute){
            logAiDecision("detour_angle_selected", {
              planeId: plane?.id ?? null,
              targetX: tx,
              targetY: ty,
              distance,
              deviation,
              reason: "detour_extended",
              ...meta
            });
            break;
          }
        }
        if(bestRoute) break;
      }
    }

    if(bestRoute){
      return bestRoute;
    }

    logAiDecision("detour_not_found", {
      planeId: plane?.id ?? null,
      targetX: tx,
      targetY: ty,
      distance,
      extendedDetourEnabled: shouldUseExtendedDetours,
      ...meta
    });

    logAiDecision("blocked_after_deviation", {
      planeId: plane?.id ?? null,
      targetX: tx,
      targetY: ty,
      distance,
      ...meta
    });
    updateAiStuckAttempt(plane, {
      pathBlocked: true,
      progressMeta: getAiNoticeableProgressMeta(plane.x, plane.y, plane.x, plane.y, tx, ty),
      sector: getAiDirectionSectorDeg(baseAngle),
    });
    planPathToPoint.lastRejectCode = bestRejectCode || "blocked_path__detour_exhausted";
    return null;
  }

  if(isPathClear(plane.x, plane.y, tx, ty) && !shouldForceNonDirectBranch){
    const dx = tx - plane.x;
    const dy = ty - plane.y;
    const dist = Math.hypot(dx, dy);
    const baseScale = Math.min(dist / MAX_DRAG_DISTANCE, 1);
    const baseAngle = Math.atan2(dy, dx);

    const finisherTarget = options?.targetEnemy || null;
    const shouldPrioritizeDirectFinisher = Boolean(options?.prioritizeDirectFinisher)
      || (finisherTarget
        && finisherTarget.x === tx
        && finisherTarget.y === ty
        && isDirectFinisherScenario(plane, finisherTarget));

    const scale = applyAiMinLaunchScale(baseScale, {
      source: "plan_path_direct",
      planeId: plane?.id ?? null,
      decisionReason: shouldPrioritizeDirectFinisher ? "direct_finisher" : (options?.decisionReason || null),
      goalName: options?.goalName || null,
      moveDistance: dist,
      hasDirectLineOfSight: true,
      targetX: tx,
      targetY: ty,
    });

    const reasonText = `${options?.decisionReason || ""} ${options?.goalName || ""} ${shouldPrioritizeDirectFinisher ? "direct_finisher" : ""}`
      .toLowerCase();
    const explicitOvershootFactor = Number(options?.overshootFactor);
    const overshootFactor = Number.isFinite(explicitOvershootFactor)
      ? explicitOvershootFactor
      : AI_FINISHER_OVERSHOOT_FACTOR;
    const canApplyAttackOvershoot = shouldPrioritizeDirectFinisher
      && dist <= MAX_DRAG_DISTANCE
      && isAttackContext(reasonText)
      && !isDefenseOrRetreatContext(reasonText)
      && Number.isFinite(overshootFactor)
      && overshootFactor > 1;

    if(shouldPrioritizeDirectFinisher && dist <= MAX_DRAG_DISTANCE){
      const cappedOvershootFactor = Math.min(1.06, Math.max(1.03, overshootFactor));
      const finalScale = canApplyAttackOvershoot
        ? Math.max(scale, Math.min(1, scale * cappedOvershootFactor))
        : scale;

      if(canApplyAttackOvershoot && finalScale > scale){
        logAiDecision("attack_overshoot_applied", {
          reason: "attack_overshoot_applied",
          baseScale: Number(scale.toFixed(3)),
          finalScale: Number(finalScale.toFixed(3)),
          goalName: options?.goalName || null,
          targetEnemyId: finisherTarget?.id ?? options?.targetEnemyId ?? null,
          overshootFactor: Number(cappedOvershootFactor.toFixed(3)),
          planeId: plane?.id ?? null,
        });
      }

      const vx = Math.cos(baseAngle) * finalScale * speedPxPerSec;
      const vy = Math.sin(baseAngle) * finalScale * speedPxPerSec;
      const landingX = plane.x + vx * FIELD_FLIGHT_DURATION_SEC;
      const landingY = plane.y + vy * FIELD_FLIGHT_DURATION_SEC;
      const finisherMove = finalizePlannedMove({
        vx,
        vy,
        totalDist: dist,
        decisionReason: "direct_finisher",
        moveType: "direct",
      }, baseAngle, getAiNoticeableProgressMeta(plane.x, plane.y, landingX, landingY, tx, ty));
      if(finisherMove){
        finisherMove.routeMetrics = evaluateRouteMetrics({ landingX, landingY, distance: dist, candidateClass: "direct" });
        finisherMove.routeQualityScore = finisherMove.routeMetrics.qualityScore;
      }
      return finisherMove;
    }

    return buildMoveWithSafeDeviation(baseAngle, dist, scale, {
      moveType: "direct"
    });
  }

  const mirrorPressureBoost = isMirrorPressureTarget(options?.targetEnemy || { x: tx, y: ty }, { ...options, plane })
    ? AI_MIRROR_PATH_PRESSURE_BONUS
    : 0;
  const mirror = findMirrorShot(plane, {x:tx, y:ty}, {
    logReject: true,
    pressureBoost: mirrorPressureBoost,
    diagnostics: true,
    goalName: options?.goalName || "",
  });
  if(mirror){
    const dx = mirror.mirrorTarget.x - plane.x;
    const dy = mirror.mirrorTarget.y - plane.y;
    const baseAngle = Math.atan2(dy, dx);
    const baseScale = Math.min(mirror.totalDist / (2*MAX_DRAG_DISTANCE), 1);
    const scale = applyAiMinLaunchScale(baseScale, {
      source: "plan_path_mirror",
      planeId: plane?.id ?? null,
      goalName: options?.goalName || null,
      decisionReason: options?.decisionReason || null,
      moveDistance: mirror.totalDist,
      targetX: tx,
      targetY: ty,
    });
    logAiDecision("mirror_selected_reason", {
      source: "plan_path_to_point",
      reason: "direct_path_blocked",
      planeId: plane?.id ?? null,
      targetEnemyId: options?.targetEnemy?.id ?? options?.targetEnemyId ?? null,
      pressureBoost: Number(mirrorPressureBoost.toFixed(2)),
      clearSky: isCurrentMapClearSky(),
      pathDistance: Number(mirror.totalDist.toFixed(1)),
      stuckMirrorRelaxation: false,
    });
    return buildMoveWithSafeDeviation(baseAngle, mirror.totalDist, scale, {
      moveType: "mirror",
      candidateClass: "ricochet",
    });
  }

  const planeStuckState = getAiStuckStateForPlane(plane?.id);
  if(planeStuckState?.isStuck){
    const stuckRecoveryMirror = findMirrorShot(plane, {x:tx, y:ty}, {
      logReject: true,
      pressureBoost: AI_MIRROR_STUCK_RECOVERY_PRESSURE_BONUS,
      minBounceDistanceScale: 0.75,
      maxPathRatioBonus: 0.12,
      stuckMirrorRelaxation: true,
      goalName: options?.goalName || "",
    });
    if(stuckRecoveryMirror){
      const dx = stuckRecoveryMirror.mirrorTarget.x - plane.x;
      const dy = stuckRecoveryMirror.mirrorTarget.y - plane.y;
      const baseAngle = Math.atan2(dy, dx);
      const baseScale = Math.min(stuckRecoveryMirror.totalDist / (2*MAX_DRAG_DISTANCE), 1);
      const scale = applyAiMinLaunchScale(baseScale, {
        source: "plan_path_mirror_stuck_recovery",
        planeId: plane?.id ?? null,
        goalName: options?.goalName || null,
        decisionReason: options?.decisionReason || null,
        moveDistance: stuckRecoveryMirror.totalDist,
        targetX: tx,
        targetY: ty,
      });
      const move = buildMoveWithSafeDeviation(baseAngle, stuckRecoveryMirror.totalDist, scale, {
        moveType: "mirror",
        candidateClass: "ricochet",
      });
      if(move){
        logAiDecision("mirror_selected_reason", {
          source: "plan_path_to_point",
          reason: "stuck_recovery",
          planeId: plane?.id ?? null,
          targetEnemyId: options?.targetEnemy?.id ?? options?.targetEnemyId ?? null,
          pressureBoost: Number(AI_MIRROR_STUCK_RECOVERY_PRESSURE_BONUS.toFixed(2)),
          clearSky: isCurrentMapClearSky(),
          pathDistance: Number(stuckRecoveryMirror.totalDist.toFixed(1)),
          stuckMirrorRelaxation: true,
        });
        return move;
      }
    }
  }

  planPathToPoint.lastRejectCode = findMirrorShot.lastRejectCode || "blocked_path__mirror_not_found";
  return null;
}

function isDirectFinisherScenario(plane, enemy){
  if(!plane || !enemy) return false;
  if(enemy.shieldActive) return false;
  if(!isPathClear(plane.x, plane.y, enemy.x, enemy.y)) return false;
  return Math.hypot(enemy.x - plane.x, enemy.y - plane.y) <= MAX_DRAG_DISTANCE;
}

function findDirectFinisherMove(aiPlanes, enemies, options = {}){
  if(!Array.isArray(aiPlanes) || !Array.isArray(enemies)) return null;

  function hasDirectFinisherObjectiveValue(plane, enemy, landingX, landingY){
    if(!plane || !enemy) return false;

    const context = options?.context || null;
    const readyCargo = cargoState.filter((cargo) => cargo?.state === "ready");
    const cargoPathTolerance = CELL_SIZE * 0.7;
    const hasCargoAlongPath = readyCargo.some((cargo) => {
      if(!cargo || !Number.isFinite(cargo.x) || !Number.isFinite(cargo.y)) return false;
      const toRouteDist = getDistanceFromPointToSegment(cargo.x, cargo.y, plane.x, plane.y, landingX, landingY);
      if(toRouteDist > cargoPathTolerance) return false;

      const toPlaneDist = Math.hypot(cargo.x - plane.x, cargo.y - plane.y);
      const toLandingDist = Math.hypot(cargo.x - landingX, cargo.y - landingY);
      const routeDist = Math.max(1, Math.hypot(landingX - plane.x, landingY - plane.y));
      return toPlaneDist <= routeDist && toLandingDist <= routeDist;
    });

    const stolenBlueFlagCarrier = context?.stolenBlueFlagCarrier;
    const interceptsFlagCarrier = Boolean(
      enemy?.carriedFlagId
      || (stolenBlueFlagCarrier && stolenBlueFlagCarrier.id === enemy.id)
    );

    const activeGoalName = `${options?.goalName || aiRoundState?.currentGoal || ""}`.toLowerCase();
    const defendsHomeBase = isExplicitDefensiveGoal(activeGoalName);

    return hasCargoAlongPath || interceptsFlagCarrier || defendsHomeBase;
  }

  const riskProfile = options?.context?.aiRiskProfile?.profile || "balanced";
  let best = null;
  for(const plane of aiPlanes){
    if(flyingPoints.some(fp=>fp.plane===plane)) continue;

    for(const enemy of enemies){
      if(!isDirectFinisherScenario(plane, enemy)) continue;

      const move = planPathToPoint(plane, enemy.x, enemy.y, {
        prioritizeDirectFinisher: true,
        targetEnemy: enemy,
      });
      if(!move) continue;

      const adjustedDist = getAiPlaneAdjustedScore(move.totalDist, plane);
      const nearbyEnemiesCount = enemies.filter((otherEnemy) => {
        if(!otherEnemy?.isAlive || otherEnemy === enemy) return false;
        return dist(enemy, otherEnemy) <= CELL_SIZE * 1.25;
      }).length;
      const clusterBonus = Math.min(MAX_DRAG_DISTANCE * 0.22, nearbyEnemiesCount * Math.max(CELL_SIZE * 0.35, AI_MULTI_KILL_PRIMARY_BONUS));
      const aggressionBias = applyOpeningAggressionBias(adjustedDist, {
        targetType: "direct_finisher",
        context: options?.context || null,
        plane,
        enemy,
        hasValidPath: true,
      });
      const landingX = plane.x + move.vx * FIELD_FLIGHT_DURATION_SEC;
      const landingY = plane.y + move.vy * FIELD_FLIGHT_DURATION_SEC;

      let biasedAdjustedDist = Math.max(0, aggressionBias.score - clusterBonus);
      const targetIsCritical = Boolean(enemy?.carriedFlagId);
      if(!targetIsCritical && riskProfile !== "comeback"){
        const landingThreatRadius = ATTACK_RANGE_PX * 1.1;
        let landingThreatCount = 0;
        let nearestLandingThreatDist = Number.POSITIVE_INFINITY;

        for(const otherEnemy of enemies){
          if(!otherEnemy?.isAlive || otherEnemy === enemy) continue;
          const enemyToLandingDist = Math.hypot((otherEnemy.x || 0) - landingX, (otherEnemy.y || 0) - landingY);
          if(enemyToLandingDist > landingThreatRadius) continue;
          if(!isPathClear(otherEnemy.x, otherEnemy.y, landingX, landingY)) continue;

          landingThreatCount += 1;
          if(enemyToLandingDist < nearestLandingThreatDist){
            nearestLandingThreatDist = enemyToLandingDist;
          }
        }

        if(landingThreatCount > 0){
          const proximityFactor = Math.max(0, 1 - (nearestLandingThreatDist / landingThreatRadius));
          const landingRiskPenalty = ATTACK_RANGE_PX * (0.055 + proximityFactor * 0.075 + (landingThreatCount - 1) * 0.02);
          biasedAdjustedDist += landingRiskPenalty;
          logAiDecision("direct_finisher_post_risk_penalty_applied", {
            planeId: plane?.id ?? null,
            enemyId: enemy?.id ?? null,
            landingX: Number(landingX.toFixed(1)),
            landingY: Number(landingY.toFixed(1)),
            landingThreatCount,
            landingThreatRadius: Number(landingThreatRadius.toFixed(1)),
            nearestLandingThreatDist: Number.isFinite(nearestLandingThreatDist)
              ? Number(nearestLandingThreatDist.toFixed(1))
              : null,
            landingRiskPenalty: Number(landingRiskPenalty.toFixed(2)),
            riskProfile,
          });
        }

        const hasObjectiveValue = hasDirectFinisherObjectiveValue(plane, enemy, landingX, landingY);
        const goalName = `${options?.goalName || aiRoundState?.currentGoal || ""}`.toLowerCase();
        const emergencyPenaltyGuard = goalName.includes("critical_threat_emergency_move")
          || goalName.includes("critical_base_threat")
          || goalName.includes("emergency_base_defense")
          || goalName.includes("emergency_base_hold_position")
          || goalName.includes("emergency_");
        const isCriticalBaseDefense = isExplicitDefensiveGoal(goalName);
        const highImmediateResponse = landingThreatCount > 0 && (
          landingThreatCount >= 2
          || (Number.isFinite(nearestLandingThreatDist) && nearestLandingThreatDist <= ATTACK_RANGE_PX * 0.75)
        );
        const allowUnprofitableTrade = targetIsCritical || isCriticalBaseDefense || riskProfile === "comeback";

        if(highImmediateResponse && !hasObjectiveValue && !allowUnprofitableTrade){
          const nearestFactor = Number.isFinite(nearestLandingThreatDist)
            ? Math.max(0, 1 - (nearestLandingThreatDist / landingThreatRadius))
            : 0;
          const clearFinishingChance = Number.isFinite(move.totalDist)
            && move.totalDist <= ATTACK_RANGE_PX * 0.9
            && nearbyEnemiesCount === 0;
          const unprofitableTradeNearestFactorCoeff = emergencyPenaltyGuard ? 0.095 : 0.1192;
          const unprofitableTradeFinisherSoftener = (!emergencyPenaltyGuard && clearFinishingChance) ? 0.88 : 1;
          const unprofitableTradePenalty = ATTACK_RANGE_PX * (
            0.08 + nearestFactor * (unprofitableTradeNearestFactorCoeff * unprofitableTradeFinisherSoftener) + (landingThreatCount - 1) * 0.025
          );
          biasedAdjustedDist += unprofitableTradePenalty;
          logAiDecision("direct_finisher_unprofitable_trade_penalty", {
            planeId: plane?.id ?? null,
            enemyId: enemy?.id ?? null,
            landingThreatCount,
            nearestLandingThreatDist: Number.isFinite(nearestLandingThreatDist)
              ? Number(nearestLandingThreatDist.toFixed(1))
              : null,
            hasObjectiveValue,
            allowUnprofitableTrade,
            isCriticalBaseDefense,
            clearFinishingChance,
            riskProfile,
            unprofitableTradeNearestFactorCoeff,
            unprofitableTradeFinisherSoftener,
            unprofitableTradePenalty: Number(unprofitableTradePenalty.toFixed(2)),
          });
        }
      }

      if(!best || biasedAdjustedDist < best.adjustedDist){
        best = {
          plane,
          enemy,
          ...move,
          adjustedDist: biasedAdjustedDist,
          nearbyEnemiesCount,
          clusterBonus,
          openingAggressionBiasApplied: aggressionBias.applied,
          openingAggressionBiasTarget: aggressionBias.applied ? "direct_finisher" : null,
          goalName: options.goalName || "direct_finisher",
          decisionReason: "direct_finisher",
        };
      }
    }
  }
  return best;
}

function issueAIMove(plane, vx, vy){
  const launchValidation = validateAiLaunchMoveCandidate({ plane, vx, vy });
  if(!launchValidation.ok){
    logAiDecision("issue_ai_move_invalid_input", {
      planeId: plane?.id ?? null,
      reason: launchValidation.reason || "invalid_plane_for_launch",
      message: launchValidation.message || null,
    });
    if(typeof failSafeAdvanceTurn === "function"){
      failSafeAdvanceTurn("invalid_move_fail_safe", {
        goal: aiRoundState?.currentGoal || "invalid_move_fail_safe",
        planeId: plane?.id ?? null,
        reasonCodes: ["invalid_plane_for_launch", "fail_safe_turn_advance"],
        rejectReasons: [launchValidation.reason || "invalid_plane_for_launch"],
        errorMessage: launchValidation.message || null,
      });
    }
    return {
      ok: false,
      reason: launchValidation.reason || "invalid_plane_for_launch",
    };
  }

  plane.angle = Math.atan2(vy, vx) + Math.PI/2;
  const launchAngleDeg = normalizeAngleDeg((Math.atan2(vy, vx) * 180 / Math.PI + 360) % 360);
  markPlaneLaunchedFromBase(plane);
  flyingPoints.push({
    plane, vx, vy,
    timeLeft: FIELD_FLIGHT_DURATION_SEC,
    collisionCooldown:0,
    lastHitPlane:null,
    lastHitCooldown:0,
    shieldBreakLockActive:false,
    shieldBreakLockTarget:null
  });
  recordAiSelfAnalyzerLaunch(plane, vx, vy, "computer");
  if(plane?.id){
    if(aiRoundState.lastLaunchedPlaneId === plane.id){
      aiRoundState.consecutiveSamePlaneLaunches += 1;
    } else {
      aiRoundState.lastLaunchedPlaneId = plane.id;
      aiRoundState.consecutiveSamePlaneLaunches = 1;
    }
    if(!aiRoundState.lastLaunchTurnByPlaneId || typeof aiRoundState.lastLaunchTurnByPlaneId !== "object"){
      aiRoundState.lastLaunchTurnByPlaneId = {};
    }
    if(!aiRoundState.planeIdleTurnsById || typeof aiRoundState.planeIdleTurnsById !== "object"){
      aiRoundState.planeIdleTurnsById = {};
    }
    if(!Array.isArray(aiRoundState.recentLaunchPlaneIds)){
      aiRoundState.recentLaunchPlaneIds = [];
    }

    aiRoundState.lastLaunchTurnByPlaneId[plane.id] = Number.isFinite(aiRoundState.turnNumber)
      ? aiRoundState.turnNumber
      : 0;
    aiRoundState.planeIdleTurnsById[plane.id] = 0;

    aiRoundState.recentLaunchPlaneIds.push(plane.id);
    if(aiRoundState.recentLaunchPlaneIds.length > AI_RECENT_PLANE_HISTORY_LIMIT){
      aiRoundState.recentLaunchPlaneIds.splice(0, aiRoundState.recentLaunchPlaneIds.length - AI_RECENT_PLANE_HISTORY_LIMIT);
    }
  }

  if(!Array.isArray(aiRoundState.recentLaunchAnglesDeg)){
    aiRoundState.recentLaunchAnglesDeg = [];
  }
  aiRoundState.recentLaunchAnglesDeg.push(launchAngleDeg);
  if(aiRoundState.recentLaunchAnglesDeg.length > AI_ANGLE_REPEAT_HISTORY_LIMIT){
    aiRoundState.recentLaunchAnglesDeg.splice(0, aiRoundState.recentLaunchAnglesDeg.length - AI_ANGLE_REPEAT_HISTORY_LIMIT);
  }
  const latestAngleSpreadMeta = getAiRecentAngleSpreadMeta(aiRoundState.recentLaunchAnglesDeg);
  if(latestAngleSpreadMeta.clustered && latestAngleSpreadMeta.sampleCount >= 2){
    aiRoundState.angleRepeatStreakCount = (Number.isFinite(aiRoundState.angleRepeatStreakCount)
      ? aiRoundState.angleRepeatStreakCount
      : 0) + 1;
  } else {
    aiRoundState.angleRepeatStreakCount = 0;
  }

  const launchSpeed = Math.hypot(vx, vy);
  const maxLaunchSpeed = MAX_DRAG_DISTANCE > 0
    ? (MAX_DRAG_DISTANCE / FIELD_FLIGHT_DURATION_SEC)
    : 0;
  const powerRatio = maxLaunchSpeed > 0 ? launchSpeed / maxLaunchSpeed : 0;
  if(powerRatio >= AI_LONG_SHOT_POWER_RATIO_THRESHOLD){
    aiRoundState.consecutiveLongLaunches = (Number.isFinite(aiRoundState.consecutiveLongLaunches)
      ? aiRoundState.consecutiveLongLaunches
      : 0) + 1;
  } else {
    aiRoundState.consecutiveLongLaunches = 0;
  }

  if(!hasShotThisRound){
    hasShotThisRound = true;
    renderScoreboard();
  }
  roundTextTimer = 0;
  return { ok: true };
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function getRandomDeviation(distance, maxDev){
  const safeDistance = Math.max(0, Number.isFinite(distance) ? distance : 0);
  const ratio = Math.max(0, Math.min(1, safeDistance / ATTACK_RANGE_PX));
  let distanceFactor = ratio * ratio;

  if(ratio <= 0.55){
    distanceFactor *= 0.2;
  } else if(ratio <= 0.75){
    distanceFactor *= 0.45;
  }

  return (Math.random()*2 - 1) * (maxDev * distanceFactor);
}

function getSpreadAngleDegByAccuracy(accuracyPercent){
  const tuning = getActiveAimingTuning();
  const spreadAtReferenceDeg = Number.isFinite(tuning.spreadAtReferenceDeg)
    ? Math.max(0, tuning.spreadAtReferenceDeg)
    : MAX_SPREAD_DEG * Math.pow(1 - AIMING_TUNING_DEFAULTS.referenceAccuracyPercent / 100, AIMING_TUNING_DEFAULTS.curveExponent);
  const amplitudeMultiplier = Number.isFinite(tuning.amplitudeMultiplier)
    ? Math.max(0, tuning.amplitudeMultiplier)
    : 1;
  return spreadAtReferenceDeg * amplitudeMultiplier * getAimingSpreadScale(accuracyPercent, tuning);
}

/* Зеркальный выстрел (одно отражение) */
function findMirrorShot(plane, enemy, options = {}){
  let best = null; // {mirrorTarget, totalDist}
  const directDist = Math.hypot(plane.x - enemy.x, plane.y - enemy.y);
  const minBounceDistanceScale = Number.isFinite(options?.minBounceDistanceScale)
    ? Math.max(0, options.minBounceDistanceScale)
    : 1;
  const minBounceDistance = AI_MIRROR_FIRST_BOUNCE_MIN_DISTANCE * minBounceDistanceScale;
  const maxPathRatioBonus = Number.isFinite(options?.maxPathRatioBonus)
    ? Math.max(0, options.maxPathRatioBonus)
    : 0;
  const pressureBoost = Number.isFinite(options?.pressureBoost)
    ? Math.max(0, options.pressureBoost)
    : 0;
  const maxPathRatio = getMirrorPathRatioLimit({ pressureBoost }) + maxPathRatioBonus;
  const stuckMirrorRelaxation = options?.stuckMirrorRelaxation === true;
  const mirrorGoalName = `${options?.goalName || ""}`.toLowerCase();
  const isEmergencyMirrorGoal = mirrorGoalName.includes("critical_base_threat")
    || mirrorGoalName.includes("emergency_base_defense")
    || mirrorGoalName.includes("critical")
    || mirrorGoalName.includes("emergency");
  let rejectedTooClose = false;
  let rejectedTooLong = false;
  let rejectedToBounceSegment = false;
  let rejectedAfterBounceSegment = false;
  let rejectedNoMirrorIntersection = false;

  const firstSegmentTouchTolerance = isEmergencyMirrorGoal ? 0 : 0.6;
  const secondSegmentTouchTolerance = isEmergencyMirrorGoal ? 0 : 0.6;
  const isSecondSegmentClear = (fromX, fromY, toX, toY, pathMeta) => {
    const strictClear = pathMeta.isFieldBorder
      ? isPathClear(fromX, fromY, toX, toY)
      : isPathClearExceptEdge(fromX, fromY, toX, toY, pathMeta.collider, pathMeta.ignoreEdge);
    if(strictClear || secondSegmentTouchTolerance <= 0) return strictClear;

    const dx = toX - fromX;
    const dy = toY - fromY;
    const legLen = Math.hypot(dx, dy);
    if(legLen <= 1e-6) return false;

    const shiftedFromX = fromX + (dx / legLen) * secondSegmentTouchTolerance;
    const shiftedFromY = fromY + (dy / legLen) * secondSegmentTouchTolerance;
    return pathMeta.isFieldBorder
      ? isPathClear(shiftedFromX, shiftedFromY, toX, toY)
      : isPathClearExceptEdge(shiftedFromX, shiftedFromY, toX, toY, pathMeta.collider, pathMeta.ignoreEdge);
  };

  const mirrorEdges = [];
  for(const collider of colliders){
    const edges = getColliderEdges(collider, 0);
    for(const edge of edges){
      mirrorEdges.push({
        edge,
        collider,
        ignoreEdge: { colliderId: collider.id, edgeIndex: edge.edgeIndex },
        isFieldBorder: false,
      });
    }
  }
  const fieldBorderEdges = buildFieldBorderSurfaces();
  fieldBorderEdges.forEach((borderEdge, borderIndex) => {
    mirrorEdges.push({
      edge: {
        x1: borderEdge.p1.x,
        y1: borderEdge.p1.y,
        x2: borderEdge.p2.x,
        y2: borderEdge.p2.y,
      },
      collider: null,
      ignoreEdge: { colliderId: `field_border_${borderIndex}`, edgeIndex: borderIndex },
      isFieldBorder: true,
    });
  });

  for(const mirrorEdge of mirrorEdges){
    const { edge: e, collider, ignoreEdge, isFieldBorder } = mirrorEdge;
    const mirrorTarget = reflectPointAcrossLine(enemy.x, enemy.y, e.x1, e.y1, e.x2, e.y2);

    // Пересечение линии (plane -> mirrorTarget) с ребром
    const inter = lineSegmentIntersection(
      plane.x, plane.y, mirrorTarget.x, mirrorTarget.y,
      e.x1, e.y1, e.x2, e.y2
    );
    if(!inter){
      rejectedNoMirrorIntersection = true;
      continue;
    }

    const firstLegDx = inter.x - plane.x;
    const firstLegDy = inter.y - plane.y;
    const firstLegDist = Math.hypot(firstLegDx, firstLegDy);

    const pathClearToBounceStrict = isFieldBorder
      ? isPathClear(plane.x, plane.y, inter.x, inter.y)
      : isPathClearExceptEdge(plane.x, plane.y, inter.x, inter.y, collider, ignoreEdge);
    const canUseFirstSegmentSoftCheck = !isEmergencyMirrorGoal
      && firstSegmentTouchTolerance > 0
      && Number.isFinite(firstLegDist)
      && firstLegDist >= Math.max(minBounceDistance, 1e-6);
    const pathClearToBounceSoft = !pathClearToBounceStrict && canUseFirstSegmentSoftCheck
      ? (() => {
          const shiftedPlaneX = plane.x + (firstLegDx / firstLegDist) * firstSegmentTouchTolerance;
          const shiftedPlaneY = plane.y + (firstLegDy / firstLegDist) * firstSegmentTouchTolerance;
          return isFieldBorder
            ? isPathClear(shiftedPlaneX, shiftedPlaneY, inter.x, inter.y)
            : isPathClearExceptEdge(shiftedPlaneX, shiftedPlaneY, inter.x, inter.y, collider, ignoreEdge);
        })()
      : false;
    const pathClearToBounce = pathClearToBounceStrict || pathClearToBounceSoft;
    if(!pathClearToBounce){
      rejectedToBounceSegment = true;
      continue;
    }

    const pathClearFromBounce = isSecondSegmentClear(inter.x, inter.y, enemy.x, enemy.y, {
      isFieldBorder,
      collider,
      ignoreEdge,
    });
    if(!pathClearFromBounce){
      rejectedAfterBounceSegment = true;
      continue;
    }

    const totalDist = Math.hypot(plane.x - inter.x, plane.y - inter.y) +
                      Math.hypot(inter.x  - enemy.x, inter.y  - enemy.y);
    if(firstLegDist < minBounceDistance){
      rejectedTooClose = true;
      continue;
    }

    if(directDist > 0 && totalDist > directDist * maxPathRatio){
      rejectedTooLong = true;
      continue;
    }

    if(!best || totalDist < best.totalDist){
      best = {mirrorTarget, totalDist};
    }
  }

  if(!best){
    if(rejectedAfterBounceSegment){
      findMirrorShot.lastRejectCode = "blocked_after_bounce__from_bounce_segment_blocked";
    } else if(rejectedToBounceSegment){
      findMirrorShot.lastRejectCode = "blocked_path__to_bounce_segment_blocked";
    } else if(rejectedTooClose){
      findMirrorShot.lastRejectCode = "mirror_rejected_too_close__min_bounce_distance";
    } else if(rejectedTooLong){
      findMirrorShot.lastRejectCode = "mirror_rejected_too_long__max_path_ratio";
    } else if(rejectedNoMirrorIntersection){
      findMirrorShot.lastRejectCode = "blocked_path__no_mirror_intersection";
    } else {
      findMirrorShot.lastRejectCode = "blocked_path__no_mirror_geometry";
    }
  } else {
    findMirrorShot.lastRejectCode = null;
  }

  if(!best && options.logReject){
    if(rejectedAfterBounceSegment){
      logAiDecision("mirror_rejected", {
        reason: "blocked_after_bounce__from_bounce_segment_blocked",
        planeId: plane?.id ?? null,
        enemyId: enemy?.id ?? null,
      });
    } else if(rejectedTooClose){
      logAiDecision("mirror_rejected", {
        reason: "mirror_rejected_too_close__min_bounce_distance",
        planeId: plane?.id ?? null,
        enemyId: enemy?.id ?? null,
        minBounceDistance: Number(minBounceDistance.toFixed(1)),
        stuckMirrorRelaxation,
      });
    } else if(rejectedTooLong){
      logAiDecision("mirror_rejected", {
        reason: "mirror_rejected_too_long__max_path_ratio",
        planeId: plane?.id ?? null,
        enemyId: enemy?.id ?? null,
        maxPathRatio: Number(maxPathRatio.toFixed(2)),
        clearSky: isCurrentMapClearSky(),
        stuckMirrorRelaxation,
      });
    } else if(rejectedToBounceSegment || rejectedNoMirrorIntersection){
      logAiDecision("mirror_rejected", {
        reason: rejectedToBounceSegment
          ? "blocked_path__to_bounce_segment_blocked"
          : "blocked_path__no_mirror_intersection",
        planeId: plane?.id ?? null,
        enemyId: enemy?.id ?? null,
      });
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
  const epsilon = 1e-6;

  function orientation(ax,ay,bx,by,cx,cy){
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if(Math.abs(cross) <= epsilon) return 0;
    return cross > 0 ? 1 : -1;
  }

  function onSegment(ax,ay,bx,by,cx,cy){
    return cx >= Math.min(ax, bx) - epsilon && cx <= Math.max(ax, bx) + epsilon &&
           cy >= Math.min(ay, by) - epsilon && cy <= Math.max(ay, by) + epsilon;
  }

  const o1 = orientation(x1,y1,x2,y2,x3,y3);
  const o2 = orientation(x1,y1,x2,y2,x4,y4);
  const o3 = orientation(x3,y3,x4,y4,x1,y1);
  const o4 = orientation(x3,y3,x4,y4,x2,y2);

  if(o1 !== o2 && o3 !== o4) return true;

  if(o1 === 0 && onSegment(x1,y1,x2,y2,x3,y3)) return true;
  if(o2 === 0 && onSegment(x1,y1,x2,y2,x4,y4)) return true;
  if(o3 === 0 && onSegment(x3,y3,x4,y4,x1,y1)) return true;
  if(o4 === 0 && onSegment(x3,y3,x4,y4,x2,y2)) return true;

  return false;
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

function getShieldColliderForPlane(plane){
  if(!plane || plane.shieldActive !== true) return null;
  const halfSize = ARCADE_SHIELD_COLLIDER_SIZE / 2;
  return {
    minX: plane.x - halfSize,
    maxX: plane.x + halfSize,
    minY: plane.y - halfSize,
    maxY: plane.y + halfSize,
  };
}

function getSweptCircleAabbHit(p0, p1, radius, aabb){
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  const expanded = {
    minX: aabb.minX - radius,
    maxX: aabb.maxX + radius,
    minY: aabb.minY - radius,
    maxY: aabb.maxY + radius,
  };

  const EPS = 1e-6;
  const invX = Math.abs(vx) < EPS ? null : 1 / vx;
  const invY = Math.abs(vy) < EPS ? null : 1 / vy;

  const tx1 = invX === null ? -Infinity : (expanded.minX - p0.x) * invX;
  const tx2 = invX === null ? Infinity : (expanded.maxX - p0.x) * invX;
  const ty1 = invY === null ? -Infinity : (expanded.minY - p0.y) * invY;
  const ty2 = invY === null ? Infinity : (expanded.maxY - p0.y) * invY;

  const tMinX = Math.min(tx1, tx2);
  const tMaxX = Math.max(tx1, tx2);
  const tMinY = Math.min(ty1, ty2);
  const tMaxY = Math.max(ty1, ty2);

  const tEntry = Math.max(tMinX, tMinY);
  const tExit = Math.min(tMaxX, tMaxY);

  if(tExit < 0 || tEntry > tExit || tEntry > 1) return null;
  if(tEntry < 0) return null;

  let normal = { x: 0, y: 0 };
  if(tMinX > tMinY){
    normal = { x: vx > 0 ? -1 : 1, y: 0 };
  } else if(tMinY > tMinX){
    normal = { x: 0, y: vy > 0 ? -1 : 1 };
  } else {
    normal = Math.abs(vx) >= Math.abs(vy)
      ? { x: vx > 0 ? -1 : 1, y: 0 }
      : { x: 0, y: vy > 0 ? -1 : 1 };
  }

  const hitX = p0.x + vx * tEntry;
  const hitY = p0.y + vy * tEntry;
  return {
    t: tEntry,
    normal,
    hitPoint: {
      x: hitX - normal.x * radius,
      y: hitY - normal.y * radius,
    }
  };
}

function findFirstShieldHit(fp, p0, p1, radius){
  if(!isArcadePlaneRespawnEnabled()) return null;
  const attacker = fp?.plane;
  if(!attacker) return null;

  let best = null;
  for(const victim of points){
    if(!victim || victim === attacker) continue;
    if(victim.color === attacker.color) continue;
    if(victim.isAlive !== true || victim.burning) continue;
    if(victim.shieldActive !== true) continue;

    const shieldCollider = getShieldColliderForPlane(victim);
    if(!shieldCollider) continue;
    const hit = getSweptCircleAabbHit(p0, p1, radius, shieldCollider);
    if(!hit) continue;
    if(best && hit.t >= best.t) continue;
    best = {
      ...hit,
      victim,
      surface: { type: "shield", kind: "SHIELD" }
    };
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
  const radius = getPlaneDangerGeometry(p).radius;
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
    const p0 = { x: currX, y: currY };
    const p1 = { x: endX, y: endY };
    const surfaceHit = findFirstSurfaceHit(p0, p1, radius);
    const shieldHit = findFirstShieldHit(fp, p0, p1, radius);
    const hit = (!surfaceHit || (shieldHit && shieldHit.t < surfaceHit.t))
      ? shieldHit
      : surfaceHit;

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

    if(hit.surface?.type === "shield" && hit.victim){
      hit.victim.shieldActive = false;
      hit.victim._shieldAlphaCurrent = 0;
      fp.shieldBreakLockActive = true;
      fp.shieldBreakLockTarget = hit.victim;
      // После отражения от щита «готовый к вылету» самолёт должен
      // перейти в обычное состояние: без щита и с возможностью быть сбитым
      // уже при следующем касании в том же ходу.
      if(hit.victim.lifeState === "destroyed_arcade_ready"){
        hit.victim.lifeState = "alive";
      }
    }

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
  p.x = closest.hit.x + closest.nx * (radius + EPS);
  p.y = closest.hit.y + closest.ny * (radius + EPS);

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
  const radius = getPlaneDangerGeometry(p).radius;

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
  p.x = hitWorldX + worldNormal.x * (radius + EPS);
  p.y = hitWorldY + worldNormal.y * (radius + EPS);

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
    const dangerRadius = getPlaneDangerGeometry(p).radius;
    if(dist2 >= dangerRadius*dangerRadius) break;

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
    p.x = closestWorldX + nx * (dangerRadius + EPS);
    p.y = closestWorldY + ny * (dangerRadius + EPS);
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
  const crashX = p.x;
  const crashY = p.y;
  eliminatePlane(p);
  spawnExplosionForPlane(p, crashX, crashY);


  flyingPoints = flyingPoints.filter(x=>x!==fp);
  if(canAwardKillPointForPlane(p)){
    markPlaneKillPointAwarded(p);
    awardPoint(scoringColor);
  }
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
    const crashX = p.x;
    const crashY = p.y;
    eliminatePlane(p);
    spawnExplosionForPlane(p, crashX, crashY);
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
    eliminatePlane(p, { keepBurning: false, keepCrashMarkers: false, skipFlameFx: true });
    p.nukeEliminated = !isArcadePlaneRespawnEnabled();
    if(!isArcadePlaneRespawnEnabled()){
      p.crashStart = 0;
      p.killMarkerStart = 0;
    }
    flyingPoints = flyingPoints.filter(x => x.plane !== p);
  });

  return scoreDeltas;
}

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

function advanceTurn(){
  cancelPendingInventoryUse();
  cancelActiveInventoryPickup();

  const previousTurnColor = turnColors[turnIndex];
  expireInvisibilityAfterEnemyTurnEnded(previousTurnColor);
  points.forEach((plane) => {
    if(!plane) return;
    clearPlaneActiveTurnBuffs(plane);
  });
  turnIndex = (turnIndex + 1) % turnColors.length;
  const nextTurnColor = turnColors[turnIndex];
  recordAiSelfAnalyzerTurnAdvance(previousTurnColor, nextTurnColor);
  if(isArcadePlaneRespawnEnabled()){
    // Штраф за респаун тикает по полуходам и длится минимум 5 переключений хода.
    points.forEach((plane) => {
      if(!plane || !isPlaneAtBase(plane)) return;

      const planeLifeState = getPlaneLifeState(plane);
      const isRespawnLifecyclePlane = (
        planeLifeState === PLANE_LIFE_STATES.DESTROYED_ARCADE_UNAVAILABLE
        || planeLifeState === PLANE_LIFE_STATES.DESTROYED_ARCADE_READY
      );

      // Уцелевшие самолёты, которые просто стоят на базе, не должны попадать
      // в «послесмертный» цикл прозрачности/недоступности.
      if(!isRespawnLifecyclePlane && plane.isAlive === true){
        plane.respawnHalfTurnsRemaining = 0;
        plane.respawnPenaltyActive = false;
        plane.respawnStage = 3;
        plane.lifeState = PLANE_LIFE_STATES.ALIVE;
        plane.respawnBlockedByEnemy = false;
        return;
      }

      const turnsLeftRaw = Number.isFinite(plane.respawnHalfTurnsRemaining)
        ? Math.max(0, Math.round(plane.respawnHalfTurnsRemaining))
        : 0;
      const turnsLeft = Math.max(0, turnsLeftRaw - 1);
      plane.respawnHalfTurnsRemaining = turnsLeft;
      plane.respawnPenaltyActive = turnsLeft > 0;

      if(turnsLeft >= 3){
        plane.respawnStage = 1;
      } else if(turnsLeft >= 1){
        plane.respawnStage = 2;
      } else {
        plane.respawnStage = 3;
      }

      if(plane.respawnPenaltyActive){
        plane.lifeState = PLANE_LIFE_STATES.DESTROYED_ARCADE_UNAVAILABLE;
        plane.shieldActive = false;
      } else if(isPlaneRespawnComplete(plane)){
        plane.lifeState = PLANE_LIFE_STATES.DESTROYED_ARCADE_READY;
        plane.shieldActive = true;
      }

      isPlaneRespawnBlockedByEnemy(plane);
    });
  }
  activateQueuedInvisibilityForEnemyTurn(nextTurnColor);
  turnAdvanceCount += 1;
  if(turnAdvanceCount >= 1){
    spawnCargoForTurn();
  }
  if(turnColors[turnIndex] === "blue" && gameMode === "computer"){
    aiMoveScheduled = false;
  }

  if(isArcadePlaneRespawnEnabled()){
    const hasCurrentColorFlyingPlane = flyingPoints.some(fp => fp?.plane?.color === nextTurnColor);
    const hasCurrentColorLaunchReadyPlane = points.some(plane => (
      plane &&
      plane.color === nextTurnColor &&
      !isPlaneInactiveForLaunch(plane)
    ));
    if(!hasCurrentColorFlyingPlane && !hasCurrentColorLaunchReadyPlane){
      advanceTurn();
    }
  }
}


function angleDiffDeg(a, b){
  let diff = ((a - b + 540) % 360) - 180;
  return Math.abs(diff);
}

function handleAAForPlane(p, fp){
  if(!isPlaneTargetable(p)) return false;
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
              eliminatePlane(p);
              spawnExplosionForPlane(p, contactX, contactY);
              if(fp) {
                flyingPoints = flyingPoints.filter(x=>x!==fp);
              }
              if(canAwardKillPointForPlane(p)){
                markPlaneKillPointAwarded(p);
                awardPoint(aa.owner);
              }
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
  if(!isPlaneTargetable(p)) return false;
  if(!Array.isArray(mines) || mines.length === 0) return false;

  const prevX = Number.isFinite(p.prevX) ? p.prevX : p.x;
  const prevY = Number.isFinite(p.prevY) ? p.prevY : p.y;

  const segmentIntersectsCircle = (x1, y1, x2, y2, cx, cy, radius) => {
    const segX = x2 - x1;
    const segY = y2 - y1;
    const segLenSq = segX * segX + segY * segY;
    if(segLenSq === 0){
      const pointDx = x1 - cx;
      const pointDy = y1 - cy;
      return pointDx * pointDx + pointDy * pointDy <= radius * radius;
    }
    const toCenterX = cx - x1;
    const toCenterY = cy - y1;
    const t = clamp((toCenterX * segX + toCenterY * segY) / segLenSq, 0, 1);
    const closestX = x1 + segX * t;
    const closestY = y1 + segY * t;
    const missX = closestX - cx;
    const missY = closestY - cy;
    return missX * missX + missY * missY <= radius * radius;
  };

  for(let i = 0; i < mines.length; i++){
    const mine = mines[i];
    if(!mine) continue;

    const dx = p.x - mine.x;
    const dy = p.y - mine.y;
    const dist = Math.hypot(dx, dy);

    const dangerRadius = getPlaneDangerGeometry(p).radius;
    const mineTriggerRadius = Math.max(MINE_TRIGGER_RADIUS, dangerRadius);

    const segmentHit = segmentIntersectsCircle(
      prevX, prevY,
      p.x, p.y,
      mine.x, mine.y,
      mineTriggerRadius,
    );

    if(dist > mineTriggerRadius && !segmentHit) continue;

    const contactX = dist === 0 ? p.x : p.x - dx / dist * dangerRadius;
    const contactY = dist === 0 ? p.y : p.y - dy / dist * dangerRadius;

    eliminatePlane(p);
    spawnExplosionForPlane(p, contactX, contactY);

    if(fp){
      flyingPoints = flyingPoints.filter(x => x !== fp);
    } else {
      flyingPoints = flyingPoints.filter(x => x.plane !== p);
    }

    mines.splice(i, 1);

    // Self-detonation rule: stepping on your own mine destroys your plane,
    // but does not grant a score point to the owner.
    if(mine.owner && mine.owner !== p.color && canAwardKillPointForPlane(p)){
      markPlaneKillPointAwarded(p);
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
  updateAndDrawDynamiteExplosions(gsBoardCtx, performance.now());
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
  updateAndDrawDynamiteExplosions(gsBoardCtx, now);
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
    scheduleComputerMoveWithCargoGate();
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
      if(fp.shieldBreakLockActive){
        const lockTarget = fp.shieldBreakLockTarget;
        const attackerTargetable = isPlaneTargetable(p);
        const lockTargetTargetable = isPlaneTargetable(lockTarget);
        if(!attackerTargetable || !lockTargetTargetable){
          fp.shieldBreakLockActive = false;
          fp.shieldBreakLockTarget = null;
        } else {
          const attackerHitbox = getPlaneHitbox(p);
          const lockTargetHitbox = getPlaneHitbox(lockTarget);
          if(!planeHitboxesIntersect(attackerHitbox, lockTargetHitbox)){
            fp.shieldBreakLockActive = false;
            fp.shieldBreakLockTarget = null;
          }
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
        lineWidth: PLANE_TRAIL_LINE_WIDTH
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
    const activeTurnBuffs = getPlaneActiveTurnBuffs(plane);
    const hasCrosshairBuff = activeTurnBuffs.includes(INVENTORY_ITEM_TYPES.CROSSHAIR);
    let dx = handleCircle.baseX - plane.x;
    let dy = handleCircle.baseY - plane.y;
    let distPx = Math.hypot(dx, dy);

    // clamp drag distance but keep a fixed wobble amplitude in degrees
    const clampedDist = Math.min(distPx, MAX_DRAG_DISTANCE);

    // use a constant aiming amplitude (in degrees) independent of drag distance
    const aimingAccuracyPercent = hasCrosshairBuff
      ? 100
      : settings.aimingAmplitude;
    const dragScale = MAX_DRAG_DISTANCE > 0 ? (clampedDist / MAX_DRAG_DISTANCE) : 0;
    const dragOscillationMultiplier = getDragOscillationMultiplier(dragScale);
    const maxAngleDeg = getSpreadAngleDegByAccuracy(aimingAccuracyPercent) * dragOscillationMultiplier;
    const maxAngleRad = maxAngleDeg * Math.PI / 180;

    // обновляем текущий угол раскачивания
    oscillationAngle += getAimingOscillationSpeed() * dragOscillationMultiplier * delta * oscillationDir;
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

    if(hasCrosshairBuff && vdist > 0){
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
      const panelWidth = endGameDiv.offsetWidth || 0;
      const panelHeight = endGameDiv.offsetHeight || 0;
      const targetLeft = Math.round(anchorClientX - panelWidth / 2);
      const boardTop = Number.isFinite(boardRect.top) ? boardRect.top : 0;
      const targetTop = Math.round(boardTop + (boardHeight - panelHeight) / 2);

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

  if(endGameDiv && !endGamePanelPreviewEnabled && (!shouldShowEndScreen || !isGameOver || (!winnerColor && !isDrawGame) || roundEndedByNuke)){
    setEndGamePanelVisible(false);
    endGameDiv.style.left = "";
    endGameDiv.style.top = "";
  }

  if(roundTextTimer > 0 && selectedRuleset !== "mapeditor"){
    gsBoardCtx.font="48px 'Patrick Hand', cursive";
    gsBoardCtx.fillStyle = '#B22222';
    gsBoardCtx.strokeStyle = '#FFD700';
    gsBoardCtx.lineWidth = 2;
    const useArcadeRoundText = settings.arcadeMode === true && isAdvancedLikeRuleset(selectedRuleset);
    const text = useArcadeRoundText ? "Arcade mode" : `Round ${roundNumber}`;
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

  const now = performance.now();

  for(const sprite of spriteEntries){
    const spriteName = typeof sprite?.spriteName === "string" ? sprite.spriteName : MAP_DEFAULT_SPRITE_NAME;
    const brickSprite = MAP_SPRITE_ASSETS[spriteName] || MAP_SPRITE_ASSETS[MAP_DEFAULT_SPRITE_NAME];
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
    const activeDynamiteEntry = findActiveDynamiteEntryForSprite(sprite);
    const finalFadeStartedAtMs = activeDynamiteEntry?.finalFadeStartedAtMs;
    const isFinalFadeActive = Number.isFinite(finalFadeStartedAtMs);
    const finalFadeElapsedMs = isFinalFadeActive ? Math.max(0, now - finalFadeStartedAtMs) : 0;
    const finalFadeProgress = isFinalFadeActive
      ? Math.min(1, finalFadeElapsedMs / DYNAMITE_BRICK_FADE_OUT_DURATION_MS)
      : 0;
    const brickAlpha = isFinalFadeActive ? Math.max(0, 1 - finalFadeProgress) : 1;

    ctx2d.save();
    if(brickAlpha < 1){
      ctx2d.globalAlpha *= brickAlpha;
    }
    ctx2d.translate(x + drawnWidth / 2, y + drawnHeight / 2);
    ctx2d.rotate(rotationDeg * Math.PI / 180);
    ctx2d.scale(scaleX, scaleY);
    ctx2d.drawImage(brickSprite, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
    ctx2d.restore();
  }
}

function drawMapLayer(ctx2d){
  drawMapSprites(ctx2d);
  const mapEditorPreviewSprite = getMapEditorBrickPreviewSprite();
  if(mapEditorPreviewSprite){
    ctx2d.save();
    const previewAllowed = mapEditorBrickInteractionState.previewInsideField
      && !mapEditorBrickInteractionState.previewCellOccupied;
    ctx2d.globalAlpha = previewAllowed ? 0.55 : 0.25;
    drawMapSprites(ctx2d, [mapEditorPreviewSprite]);
    ctx2d.restore();
  }
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

function drawPlaneSpriteGlow(ctx2d, plane, glowStrength = 0, alphaMultiplier = 1) {
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
  const visibilityAlpha = Math.max(0, Math.min(1, alphaMultiplier));

  if (visibilityAlpha <= 0.01) {
    return;
  }

  ctx2d.save();

  if (!spriteReady) {
    ctx2d.restore();
    return;
  }

  ctx2d.globalCompositeOperation = "lighter";
  ctx2d.globalAlpha *= (0.3 + 0.45 * blend) * visibilityAlpha;
  ctx2d.filter = `blur(${(2 + 4 * blend).toFixed(2)}px)`;

  const baseSize = PLANE_DRAW_W;
  const scale = 1 + 0.18 * blend;
  const drawSize = baseSize * scale;
  const offset = -drawSize / 2;

  ctx2d.imageSmoothingEnabled = true;
  ctx2d.drawImage(spriteImg, offset, offset, drawSize, drawSize);

  ctx2d.restore();
}

function drawThinPlane(ctx2d, plane, glow = 0, invisibilityAlpha = null) {
  const { x: cx, y: cy, color, angle } = plane;
  const isGhostState = plane.burning || (!plane.isAlive && !plane.nukeEliminated);
  const resolvedInvisibilityAlpha = Number.isFinite(invisibilityAlpha)
    ? invisibilityAlpha
    : getPlaneInvisibilityAlpha(plane);
  const invisibilityFeedbackAlpha = (!isGhostState && plane.isAlive)
    ? getPlayerInvisibilityFeedbackAlpha(color)
    : 1;
  const invisibilityVisualAlpha = Math.max(0, Math.min(1, resolvedInvisibilityAlpha * invisibilityFeedbackAlpha));
  const isInvisibilityFullyHidden = resolvedInvisibilityAlpha <= 0.01;
  const halfPlaneWidth = PLANE_DRAW_W / 2;
  const halfPlaneHeight = PLANE_DRAW_H / 2;
  const flightState = flyingPoints.find(fp => fp.plane === plane) || null;
  const isIdle = !flightState;
  const isArcadeRespawnOutline = isArcadePlaneRespawnEnabled()
    && isPlaneRespawnPenaltyActive(plane)
    && isPlaneAtBase(plane);
  const smokeAnchor = getPlaneAnchorOffset("smoke");
  const jetAnchor = getPlaneAnchorOffset("jet");
  const idleSmokeDistance = Math.max(0, smokeAnchor.y - PLANE_VFX_IDLE_SMOKE_DELTA_Y);
  const showEngine = !isGhostState && !plane.nukeEliminated && !isInvisibilityFullyHidden && !isArcadeRespawnOutline;
  const hasWingsBuff = !isArcadeRespawnOutline && planeHasActiveTurnBuff(plane, INVENTORY_ITEM_TYPES.WINGS);
  const broadwingOverlayWidth = BROADWING_OVERLAY_DRAW_W;
  const broadwingOverlayHeight = BROADWING_OVERLAY_DRAW_H;

  ctx2d.save();
  const shouldSway = plane.isAlive === true
    && plane.burning === false
    && !isArcadeRespawnOutline
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
    if (!isInvisibilityFullyHidden) {
      drawDieselSmoke(ctx2d, scale, offsetY, tailTrim);
    }
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

  if (blend > 0 && !isArcadePlaneRespawnEnabled() && !isInvisibilityFullyHidden && !isArcadeRespawnOutline) {
    const glowStrength = blend * 1.25; // boost brightness slightly
    drawPlaneSpriteGlow(ctx2d, plane, glowStrength, invisibilityVisualAlpha);
  }

  ctx2d.shadowColor = "transparent";
  ctx2d.shadowBlur = 0;
  ctx2d.filter = "none";

  const nukeFadeFx = getNukePlaneFadeFx();
  const shouldApplyNukeFade = nukeFadeFx.active && (plane.isAlive || plane.nukeEliminated);
  const previousFilter = ctx2d.filter;
  const baseGhostAlpha = 0.3;
  const planeLifeState = getPlaneLifeState(plane);
  const isArcadeReadyAtBaseState = planeLifeState === PLANE_LIFE_STATES.DESTROYED_ARCADE_READY;
  const respawnVisualAlpha = isArcadeReadyAtBaseState
    ? 1
    : (isPlaneRespawnPenaltyActive(plane)
    ? (isArcadePlaneRespawnEnabled()
      ? getInactivePlaneAlpha(performance.now(), plane)
      : getRespawnOpacityByStage(plane.respawnStage))
    : 1);
  // Держим два канала отдельно: respawn — про этап восстановления самолёта,
  // invisibility — только про предмет невидимости. Так проще менять каждый эффект независимо.
  const finalAlpha = respawnVisualAlpha * invisibilityVisualAlpha;
  if(finalAlpha < 1){
    ctx2d.globalAlpha *= finalAlpha;
  }

  if (isArcadeRespawnOutline) {
    ctx2d.globalAlpha = 0.1;
  }
  if (color === "blue") {
    if (showEngine) {
      const flicker = 1 + 0.05 * Math.sin(globalFrame * 0.1);
      const idleFlicker = PLANE_VFX_JET_IDLE_FLICKER_BASE + PLANE_VFX_JET_IDLE_FLICKER_AMPLITUDE * Math.sin(globalFrame * 0.12);
      const jetScale = isIdle ? idleFlicker : flicker;
      if (!isInvisibilityFullyHidden) {
        drawJetFlame(ctx2d, jetScale, jetAnchor.y);
      }

      if (flightState) {
        const progress = (FIELD_FLIGHT_DURATION_SEC - flightState.timeLeft) / FIELD_FLIGHT_DURATION_SEC;
        const scale = progress < 0.75 ? 4 * progress : 12 * (1 - progress);
        if (!isInvisibilityFullyHidden) {
          drawBlueJetFlame(ctx2d, scale, jetAnchor.y);
        }
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
    if (shouldApplyNukeFade && !isArcadeRespawnOutline) {
      ctx2d.globalAlpha *= nukeFadeFx.alpha;
      ctx2d.filter = `grayscale(${nukeFadeFx.grayscale}%)`;
    }

    ctx2d.drawImage(bluePlaneImg, -halfPlaneWidth, -halfPlaneHeight, PLANE_DRAW_W, PLANE_DRAW_H);
    if (hasWingsBuff && isSpriteReady(blueBroadwingedPlaneImg)) {
      ctx2d.drawImage(
        blueBroadwingedPlaneImg,
        -broadwingOverlayWidth / 2,
        -broadwingOverlayHeight / 2,
        broadwingOverlayWidth,
        broadwingOverlayHeight
      );
    }
    ctx2d.filter = previousFilter;
    if (!isGhostState && !isArcadeRespawnOutline) {
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
    if (shouldApplyNukeFade && !isArcadeRespawnOutline) {
      ctx2d.globalAlpha *= nukeFadeFx.alpha;
      ctx2d.filter = `grayscale(${nukeFadeFx.grayscale}%)`;
    }

    ctx2d.drawImage(greenPlaneImg, -halfPlaneWidth, -halfPlaneHeight, PLANE_DRAW_W, PLANE_DRAW_H);
    if (hasWingsBuff && isSpriteReady(greenBroadwingedPlaneImg)) {
      ctx2d.drawImage(
        greenBroadwingedPlaneImg,
        -broadwingOverlayWidth / 2,
        -broadwingOverlayHeight / 2,
        broadwingOverlayWidth,
        broadwingOverlayHeight
      );
    }
    ctx2d.filter = previousFilter;
    if (!isGhostState && !isArcadeRespawnOutline) {
      addPlaneShading(ctx2d);
    }
  } else {
    ctx2d.restore();
    return;
  }

  ctx2d.restore();
}

function drawArcadeRespawnShield(ctx2d, plane){
  if(!ctx2d || !plane) return;
  if(!isArcadePlaneRespawnEnabled()) return;
  if(!plane.shieldActive) return;

  const isPlaneGrabbed = handleCircle.active && handleCircle.pointRef === plane;
  const shieldAlphaTarget = isPlaneGrabbed ? 0 : 1;
  const hasShieldAlphaCurrent = Number.isFinite(plane._shieldAlphaCurrent);
  const shieldAlphaCurrent = hasShieldAlphaCurrent ? plane._shieldAlphaCurrent : shieldAlphaTarget;
  const shieldAlphaLerp = 0.22;
  const shieldAlpha = shieldAlphaCurrent + (shieldAlphaTarget - shieldAlphaCurrent) * shieldAlphaLerp;

  plane._shieldAlphaCurrent = Math.abs(shieldAlpha - shieldAlphaTarget) < 0.001
    ? shieldAlphaTarget
    : shieldAlpha;

  if(plane._shieldAlphaCurrent <= 0.001) return;

  const baseSize = Math.max(PLANE_DRAW_W, PLANE_DRAW_H) * 1.45;
  const shieldYOffset = plane.color === "blue" ? -5 : 0;
  const drawX = plane.x - baseSize / 2;
  const drawY = plane.y - baseSize / 2 + shieldYOffset;

  ctx2d.save();
  ctx2d.globalAlpha *= plane._shieldAlphaCurrent;

  const shieldSprite = arcadeRespawnShieldImages[plane.color] || null;
  if(isSpriteReady(shieldSprite)){
    ctx2d.drawImage(shieldSprite, drawX, drawY, baseSize, baseSize);
  } else {
    ctx2d.strokeStyle = "rgba(190, 227, 255, 0.9)";
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    ctx2d.arc(plane.x, plane.y + shieldYOffset, baseSize * 0.45, 0, Math.PI * 2);
    ctx2d.stroke();
  }

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
  const isArcadeModeActive = isArcadePlaneRespawnEnabled();
  const showGlow = isArcadeModeActive
    ? false
    : (!handleCircle.active && !flyingPoints.some(fp => fp.plane.color === activeColor));
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
      ctx.strokeStyle = colorWithAlpha(plane.color, PLANE_TRAIL_ALPHA);
      ctx.lineWidth = seg.lineWidth || PLANE_TRAIL_LINE_WIDTH;
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.restore();
  };

  const renderPlane = (p, targetCtx, { allowRangeLabel = false } = {}) => {
    if(!p.isAlive && !p.burning && !isNukeEliminatedPlaneRenderable(p)) return;
    const invisibilityAlpha = getPlaneInvisibilityAlpha(p);

    if (debugDrawOrder) {
      const stateLabel = p.isAlive ? (p.burning ? 'burning' : 'alive') : 'crashed';
      debugDrawOrder.push({
        id: p.id ?? 'unknown',
        team: p.color,
        state: stateLabel,
        frameIndex: globalFrame
      });
    }

    targetCtx.save();

    // Allow wreck sprites to render after crash delay instead of exiting early.
    drawPlaneSegments(targetCtx, p);
    const glowTarget = showGlow && p.color === activeColor && p.isAlive && !p.burning ? 1 : 0;
    if(p.glow === undefined) p.glow = glowTarget;
    if(!p.isAlive || p.burning){
      p.glow = 0;
    } else {
      p.glow += (glowTarget - p.glow) * 0.1;
    }
    const renderGlow = (isArcadeModeActive || !p.isAlive || p.burning) ? 0 : p.glow;
    drawThinPlane(targetCtx, p, renderGlow, invisibilityAlpha);
    drawArcadeRespawnShield(targetCtx, p);

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
        activeEffectTypes: getPlaneActiveTurnBuffs(p),
        planeColor: p.color
      };
    }

    const isPlaneFullyHiddenByInvisibility = invisibilityAlpha <= 0.01;
    if(p.flagColor && !isPlaneFullyHiddenByInvisibility){
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

    targetCtx.restore();
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
  const iconGap = 4;
  const iconsTopOffset = 22;
  const iconX = rangeTextInfo.x;
  const iconY = rangeTextInfo.y + iconsTopOffset;
  const invisibilityIconSprite = rangeTextInfo.planeColor === "green"
    ? invisibilityIconSpriteGreen
    : invisibilityIconSpriteBlue;
  const effectIconByType = {
    [INVENTORY_ITEM_TYPES.CROSSHAIR]: crosshairIconSprite,
    [INVENTORY_ITEM_TYPES.FUEL]: fuelIconSprite,
    [INVENTORY_ITEM_TYPES.WINGS]: wingsIconSprite,
    [INVENTORY_ITEM_TYPES.INVISIBILITY]: invisibilityIconSprite
  };
  const effectDisplayOrder = [
    INVENTORY_ITEM_TYPES.CROSSHAIR,
    INVENTORY_ITEM_TYPES.FUEL,
    INVENTORY_ITEM_TYPES.WINGS,
    INVENTORY_ITEM_TYPES.INVISIBILITY
  ];
  const activeEffectTypes = Array.isArray(rangeTextInfo.activeEffectTypes)
    ? rangeTextInfo.activeEffectTypes
    : [];

  const iconsToDraw = effectDisplayOrder
    .filter((effectType) => activeEffectTypes.includes(effectType))
    .map((effectType) => effectIconByType[effectType])
    .filter(Boolean);

  let drawnIconsCount = 0;
  iconsToDraw.forEach((iconSprite) => {
    if(!isSpriteReady(iconSprite)) return;

    const currentIconX = iconX + drawnIconsCount * (iconSize + iconGap);
    hudCtx.drawImage(iconSprite, currentIconX, iconY, iconSize, iconSize);
    drawnIconsCount += 1;
  });

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
  const mineLogicalSize = mineSizeRuntime.LOGICAL_PX;
  const halfMineSize = mineLogicalSize / 2;

  for(let i = 0; i < mines.length; i++){
    const mine = mines[i];
    if(!mine) continue;
    const phase = ((mine.x + mine.y) * 0.07) + i * 0.37;
    const swayDeg = Math.sin(globalFrame * FIELD_MINE_SWAY_OMEGA + phase) * FIELD_MINE_SWAY_DEG;
    const swayRad = swayDeg * Math.PI / 180;

    gsBoardCtx.save();
    gsBoardCtx.translate(mine.x, mine.y);
    gsBoardCtx.rotate(swayRad);

    if(isSpriteReady(mineIconSprite)){
      gsBoardCtx.drawImage(
        mineIconSprite,
        -halfMineSize,
        -halfMineSize,
        mineLogicalSize,
        mineLogicalSize
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

  const hasExplicitContact = Number.isFinite(x) && Number.isFinite(y);
  const cx = hasExplicitContact
    ? x
    : (Number.isFinite(plane.collisionX) ? plane.collisionX : plane.x);
  const cy = hasExplicitContact
    ? y
    : (Number.isFinite(plane.collisionY) ? plane.collisionY : plane.y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return null;
  }
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
  if(!isPlaneTargetable(plane)) return;
  const enemyColor = (plane.color==="green") ? "blue" : "green";
  const planeHitbox = getPlaneBeneficialGeometry(plane).hitbox;
  for(const p of points){
    if(!isPlaneTargetable(p)) continue;
    if(p.color !== enemyColor) continue;
    if(fp && fp.lastHitPlane === p && fp.lastHitCooldown > 0) continue;
    const targetHitbox = getPlaneBeneficialGeometry(p).hitbox;
    const hitboxesIntersect = planeHitboxesIntersect(planeHitbox, targetHitbox);
    if(fp && fp.shieldBreakLockActive && fp.shieldBreakLockTarget === p){
      if(hitboxesIntersect) continue;
      fp.shieldBreakLockActive = false;
      fp.shieldBreakLockTarget = null;
    }
    if(hitboxesIntersect){
      const contactPoint = getPlaneHitContactPoint(plane, p);
      const cx = contactPoint.x;
      const cy = contactPoint.y;
      eliminatePlane(p);
      flyingPoints = flyingPoints.filter(other => other.plane !== p);
      p.collisionX = cx;
      p.collisionY = cy;
      spawnExplosionForPlane(p, cx, cy);
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
      if(canAwardKillPointForPlane(p)){
        markPlaneKillPointAwarded(p);
        awardPoint(plane.color);
      }
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
      if(doesPlaneZoneIntersectTargetZone(plane, target) && !plane.carriedFlagId){
        assignFlagToPlane(flag, plane);
        break;
      }
    }
  } else {
    if(doesPlaneZoneIntersectTargetZone(plane, ownBase)){
      if(carriedFlag.color !== plane.color){
        addScore(plane.color, 5);
      }
      captureFlag(carriedFlag, { arcadeRespawn: isArcadeFlagRespawnEnabled() });
      clearFlagFromPlane(plane);
    }
  }
}
function checkVictory(options = {}){
  const greenAlive = points.filter(p=>p.isAlive && p.color==="green").length;
  const blueAlive  = points.filter(p=>p.isAlive && p.color==="blue").length;
  const deferRoundLock = Boolean(options.deferRoundLock);
  const isInfiniteScoreMode = isArcadeInfiniteScoreMode();
  if(isGameOver) return;

  if(!isInfiniteScoreMode && !deferRoundLock && blueScore >= POINTS_TO_WIN && greenScore >= POINTS_TO_WIN){
    lockInDraw({ showEndScreen: true });
    return;
  }

  const canContinueSeries = isInfiniteScoreMode || (blueScore < POINTS_TO_WIN && greenScore < POINTS_TO_WIN);

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

function isArcadeScoreUiActive(){
  if(selectedRuleset === "mapeditor") return false;
  return settings.arcadeMode === true && isAdvancedLikeRuleset(selectedRuleset);
}

function isArcadeDomScoreMode(){
  return isArcadeScoreUiActive();
}

function updateArcadeScore(colorOrScores, valueOrOptions, maybeOptions = {}){
  const entries = Object.entries(arcadeScoreEls).filter(([, element]) => element instanceof HTMLElement);
  if(entries.length === 0) return;

  const domMode = isArcadeDomScoreMode();
  for (const [, element] of entries){
    element.style.display = domMode ? "flex" : "none";
    element.setAttribute("aria-hidden", domMode ? "false" : "true");
  }
  if(!domMode) return;

  const hasSingleColorUpdate = typeof colorOrScores === "string";
  const scores = hasSingleColorUpdate
    ? { [colorOrScores]: valueOrOptions }
    : (colorOrScores && typeof colorOrScores === "object" ? colorOrScores : {});
  const options = hasSingleColorUpdate
    ? (maybeOptions && typeof maybeOptions === "object" ? maybeOptions : {})
    : (valueOrOptions && typeof valueOrOptions === "object" ? valueOrOptions : {});

  for (const [color, element] of entries){
    if(!(color in scores)) continue;

    const safeValue = Math.max(0, Number.isFinite(scores[color]) ? Math.floor(scores[color]) : 0);
    element.textContent = String(safeValue).padStart(3, "0");

    if(options.animate === true){
      element.classList.remove("is-animating");
      void element.offsetWidth;
      element.classList.add("is-animating");
    }
  }
}

// Размеры и положение текста аркадного счёта меняются только в ARCADE_SCORE_CONTAINERS (HUD_LAYOUT.arcadeScore), а не в CSS контейнерах.
function drawArcadeScoreCounters(ctx, scaleX = 1, scaleY = 1){
  if(!ctx || isArcadeDomScoreMode()) return;

  const horizontalPadding = 0;
  const verticalPadding = 0;
  const fallbackFontSize = 24;
  const fallbackFontFamily = "'Silkscreen', 'Fantasque Sans Mono', monospace";
  const fallbackFontWeight = 700;

  const pairs = [
    ["blue", blueScore],
    ["green", greenScore]
  ];

  const transform = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  const transformScaleX = Math.max(0.001, Math.abs(transform?.a) || 1);
  const transformScaleY = Math.max(0.001, Math.abs(transform?.d) || 1);
  const pixelUnitX = 1 / transformScaleX;
  const pixelUnitY = 1 / transformScaleY;
  const halfPixelOffsetX = pixelUnitX * 0.5;
  const halfPixelOffsetY = pixelUnitY * 0.5;
  const snapToPixelGridX = (value) => Math.round(value / pixelUnitX) * pixelUnitX;
  const snapToPixelGridY = (value) => Math.round(value / pixelUnitY) * pixelUnitY;
  const stabilizeStrokeWidth = 2.3 / Math.max(transformScaleX, transformScaleY);

  for(const [color, rawScore] of pairs){
    const frame = ARCADE_SCORE_CONTAINERS[color];
    const textStyle = ARCADE_SCORE_TEXT_STYLES[color];
    if(!frame || !textStyle) continue;

    const left = frame.x * scaleX;
    const top = frame.y * scaleY;
    const width = frame.width * scaleX;
    const height = frame.height * scaleY;

    if(!Number.isFinite(left) || !Number.isFinite(top) || width <= 0 || height <= 0) continue;

    const normalizedScore = Math.max(0, Number.isFinite(rawScore) ? Math.floor(rawScore) : 0);
    const scoreText = String(normalizedScore).padStart(3, "0");

    ctx.save();
    ctx.fillStyle = textStyle.fill;

    const insetX = horizontalPadding * scaleX;
    const insetY = verticalPadding * scaleY;
    const availableWidth = Math.max(0, width - insetX * 2);
    const availableHeight = Math.max(0, height - insetY * 2);
    const baseFontSize = Number.isFinite(textStyle.baseFontSize) ? textStyle.baseFontSize : fallbackFontSize;
    const scaledFontSize = Math.max(1, Math.round(baseFontSize * Math.min(scaleX, scaleY)));
    const fontWeight = textStyle.fontWeight || fallbackFontWeight;
    const fontFamily = textStyle.fontFamily || fallbackFontFamily;

    let fontForRender = `${fontWeight} ${scaledFontSize}px ${fontFamily}`;

    const fitFont = (initialSize) => {
      let candidateSize = Math.max(1, initialSize);
      while(candidateSize >= 1){
        const candidate = `${fontWeight} ${candidateSize}px ${fontFamily}`;
        ctx.font = candidate;
        const metrics = ctx.measureText(scoreText);
        const candidateWidth = metrics.width;
        const candidateHeight = (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0);
        if(candidateWidth <= availableWidth && (availableHeight <= 0 || candidateHeight <= availableHeight)){
          return candidate;
        }
        candidateSize -= 1;
      }
      return `${fontWeight} 1px ${fontFamily}`;
    };

    ctx.font = fontForRender;
    const primaryMetrics = ctx.measureText(scoreText);
    const primaryHeight = (primaryMetrics.actualBoundingBoxAscent || 0) + (primaryMetrics.actualBoundingBoxDescent || 0);
    if(primaryMetrics.width > availableWidth || (availableHeight > 0 && primaryHeight > availableHeight)){
      fontForRender = fitFont(scaledFontSize);
    }

    ctx.font = fontForRender;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const textX = snapToPixelGridX(left + insetX + availableWidth / 2) + halfPixelOffsetX;
    const textY = snapToPixelGridY(top + insetY + availableHeight / 2) + halfPixelOffsetY;
    ctx.strokeStyle = ARCADE_SCORE_TEXT_STROKE;
    ctx.lineWidth = stabilizeStrokeWidth;
    ctx.strokeText(scoreText, textX, textY);
    ctx.fillText(scoreText, textX, textY);

    if(DEBUG_ARCADE_SCORE_TEXT){
      const debugLeft = snapToPixelGridX(left) + halfPixelOffsetX;
      const debugTop = snapToPixelGridY(top) + halfPixelOffsetY;
      const debugWidth = snapToPixelGridX(width);
      const debugHeight = snapToPixelGridY(height);
      ctx.save();
      ctx.strokeStyle = color === "blue" ? "#2ec5ff" : "#57ff2e";
      ctx.lineWidth = Math.max(stabilizeStrokeWidth, 1 / Math.max(transformScaleX, transformScaleY));
      ctx.strokeRect(debugLeft, debugTop, debugWidth, debugHeight);
      ctx.fillStyle = "#ff3b30";
      ctx.beginPath();
      ctx.arc(textX, textY, Math.max(1.5 * pixelUnitX, 1.5 * pixelUnitY), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
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
function getHudPlaneTimerFrameImage(plane, now = performance.now()){
  if (!plane) {
    return null;
  }

  if (!isArcadePlaneRespawnEnabled()) {
    return null;
  }

  const isArcadeReadyAtBase = (
    isArcadePlaneRespawnEnabled()
    && getPlaneLifeState(plane) === PLANE_LIFE_STATES.DESTROYED_ARCADE_READY
    && isPlaneAtBase(plane)
    && isPlaneRespawnComplete(plane)
    && !isPlaneRespawnPenaltyActive(plane)
  );
  if (isArcadeReadyAtBase) {
    return hudPlaneTimerGoImage || null;
  }

  if (isPlaneRespawnPenaltyActive(plane)) {
    let crossStart = plane.respawnHudCrossStart;
    if (!Number.isFinite(crossStart)) {
      crossStart = now;
      plane.respawnHudCrossStart = crossStart;
    }
    const elapsedCross = Math.max(0, now - crossStart);
    if (elapsedCross < HUD_PLANE_CROSS_MIN_LIFETIME_MS) {
      return hudPlaneTimerFrames[0] || null;
    }

    const turnsLeft = Number.isFinite(plane.respawnHalfTurnsRemaining)
      ? Math.max(0, Math.round(plane.respawnHalfTurnsRemaining))
      : 0;
    const frameIndex = Math.max(0, Math.min(4, 5 - turnsLeft));
    return turnsLeft >= 1 && turnsLeft <= 5 ? hudPlaneTimerFrames[frameIndex] : null;
  }

  return null;
}

function drawHudPlaneTimerOverlay(ctx2d, cx, cy, size, image){
  const isReady = Boolean(
    image
    && image.complete
    && image.naturalWidth > 0
    && image.naturalHeight > 0
  );
  if (!isReady || size <= 0) {
    return;
  }

  ctx2d.save();
  const previousFilter = ctx2d.filter;
  ctx2d.filter = "none";
  ctx2d.drawImage(image, cx - size / 2, cy - size / 2, size, size);
  ctx2d.filter = previousFilter;
  ctx2d.restore();
}

function renderScoreboard(now = performance.now()){
  updateTurnIndicators();
  updateArcadeScore({ blue: blueScore, green: greenScore });
  if (!hudCtx || !(hudCanvas instanceof HTMLCanvasElement)) {
    return;
  }

  hudCtx.setTransform(1, 0, 0, 1, 0, 0);
  hudCtx.clearRect(0, 0, hudCanvas.width, hudCanvas.height);

  if(selectedRuleset === "mapeditor"){
    return;
  }

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

  if(isArcadeScoreUiActive()){
    drawArcadeScoreCounters(hudCtx, scaleX, scaleY);
  } else {
    drawMatchScore(hudCtx, scaleX, scaleY, now);
  }

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
  const planesBySlot = slotOrderFromCenter.map((planeIndex) => playerPlanes[planeIndex] || null);
  const aliveCount = planesBySlot.reduce((count, plane) => (
    plane && plane.isAlive && !plane.burning ? count + 1 : count
  ), 0);
  updatePlaneCounterDeaths(color, aliveCount, now);

  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha *= HUD_PLANE_DIM_ALPHA;

  const centerX = paddingX + availableWidth / 2;

  for (let slotIndex = 0; slotIndex < planesBySlot.length; slotIndex += 1) {
    const plane = planesBySlot[slotIndex];
    const centerY = paddingY + slotHeight * (slotIndex + 0.5);

    if (iconScale <= 0) {
      continue;
    }

    const isArcadeRespawnActive = isArcadePlaneRespawnEnabled();
    const respawnAlpha = isArcadeRespawnActive && plane && isPlaneRespawnPenaltyActive(plane)
      ? getInactivePlaneAlpha(now, plane)
      : 1;
    const deadPlaneAlpha = plane && !plane.isAlive
      ? (isArcadeRespawnActive ? 0.25 : 0)
      : 1;
    const iconAlpha = respawnAlpha * deadPlaneAlpha;

    ctx.save();
    ctx.globalAlpha *= iconAlpha;
    drawPlaneCounterIcon(ctx, centerX, centerY, color, iconScale);
    ctx.restore();

    const timerFrameImage = getHudPlaneTimerFrameImage(plane, now);
    if (timerFrameImage) {
      const hudStyle = getHudPlaneStyle(color);
      const hudStyleScale = Number.isFinite(hudStyle?.scale) && hudStyle.scale > 0
        ? hudStyle.scale
        : 1;
      const iconSize = HUD_BASE_PLANE_ICON_SIZE * iconScale * MINI_PLANE_ICON_SCALE * hudStyleScale;
      drawHudPlaneTimerOverlay(ctx, centerX, centerY, iconSize, timerFrameImage);
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
    updateArcadeScore({ blue: 0, green: 0 });
    roundNumber = 0;
    randomMapPairSequenceNumber = null;
    randomMapPairIndex = null;
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

if(mapEditorResetBtn){
  mapEditorResetBtn.addEventListener("click", () => {
    resetMapEditorPlanePlacement();
  });
}

if(mapEditorResetMapBtn instanceof HTMLElement){
  mapEditorResetMapBtn.addEventListener("click", () => {
    const clearSkyIndex = MAPS.findIndex((map) => {
      const mapId = typeof map?.id === "string" ? map.id.trim().toLowerCase() : "";
      const mapName = typeof map?.name === "string" ? map.name.trim().toLowerCase() : "";
      return mapId === "clearsky" || mapName === "clear sky";
    });
    const targetMapIndex = clearSkyIndex >= 0 ? clearSkyIndex : 0;
    setMapIndexAndPersist(targetMapIndex);
    applyCurrentMap();
    seedMapEditorInventory();
    mapEditorControlMode = "bricks";
    syncMapEditorResetButtonVisibility();
  });
}

if(mapEditorSaveBtn instanceof HTMLElement){
  mapEditorSaveBtn.addEventListener("click", () => {
    openMapEditorSaveDialog();
  });
}

if(mapEditorSaveNameInput instanceof HTMLInputElement){
  mapEditorSaveNameInput.addEventListener("input", () => {
    if(mapEditorSaveNameInput.value.length > 10){
      mapEditorSaveNameInput.value = mapEditorSaveNameInput.value.slice(0, 10);
    }
    syncMapEditorSaveDialogSubmitState();
  });
}

if(mapEditorSaveDialogCancelBtn instanceof HTMLElement){
  mapEditorSaveDialogCancelBtn.addEventListener("click", () => {
    closeMapEditorSaveDialog();
  });
}

if(mapEditorSaveDialogSubmitBtn instanceof HTMLButtonElement){
  mapEditorSaveDialogSubmitBtn.addEventListener("click", async () => {
    if(mapEditorSaveDialogSubmitBtn.disabled) return;
    await saveCurrentMapFromEditor();
    closeMapEditorSaveDialog();
  });
}

document
  .querySelectorAll('input[name="mapEditorDifficulty"]')
  .forEach((input) => {
    if(input instanceof HTMLInputElement){
      input.addEventListener("change", syncMapEditorSaveDialogSubmitState);
    }
  });

if(mapEditorSaveDialog instanceof HTMLElement){
  mapEditorSaveDialog.addEventListener("click", (event) => {
    if(event.target === mapEditorSaveDialog){
      closeMapEditorSaveDialog();
    }
  });
}

if(mapEditorModeBricksBtn instanceof HTMLElement){
  mapEditorModeBricksBtn.addEventListener("click", () => {
    setMapEditorControlMode("bricks");
  });
}

if(mapEditorModePlanesBtn instanceof HTMLElement){
  mapEditorModePlanesBtn.addEventListener("click", () => {
    setMapEditorControlMode("planes");
  });
}

if(mapEditorBrickSidebar instanceof HTMLElement){
  const brickAssets = mapEditorBrickSidebar.querySelectorAll(".map-editor-brick-sidebar__asset");
  brickAssets.forEach((asset) => {
    asset.addEventListener("pointerdown", onMapEditorBrickPointerDown);
    asset.addEventListener("dragstart", onMapEditorBrickDragStart);
    asset.addEventListener("dragend", onMapEditorBrickDragEnd);
  });
}

function startNewRound(){
  logBootStep("startNewRound");
  console.log('[mode] startNewRound effective gameMode', { gameMode, selectedMode, selectedRuleset, phase });
  loadSettingsForRuleset(selectedRuleset);
  const useStoredRulesetSettings = isAdvancedLikeRuleset(selectedRuleset);
  const isArcadeUiMode = useStoredRulesetSettings && settings.arcadeMode === true;
  if(selectedRuleset === "classic"){
    settings.addCargo = true;
  } else if(selectedRuleset === "mapeditor"){
    settings.randomizeMapEachRound = false;
  }
  console.log('[settings] load at match start', {
    flightRangeCells: settings.flightRangeCells,
    aimingAmplitude: settings.aimingAmplitude,
    addAA: settings.addAA,
    sharpEdges: settings.sharpEdges,
    flagsEnabled: settings.flagsEnabled,
    addCargo: settings.addCargo,
    mapIndex: settings.mapIndex,
    randomizeMapEachRound: settings.randomizeMapEachRound,
    arcadeMode: settings.arcadeMode,
    flameStyle: settings.flameStyle,
    useStoredRulesetSettings,
    isArcadeUiMode
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
  if(aiPostInventoryLaunchTimeout){
    clearTimeout(aiPostInventoryLaunchTimeout);
    aiPostInventoryLaunchTimeout = null;
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
  setEndGamePanelVisible(false);
  isGameOver=false; winnerColor=null; isDrawGame = false; roundEndedByNuke = false;
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;


  lastFirstTurn = 1 - lastFirstTurn;
  turnIndex = lastFirstTurn;
  turnAdvanceCount = 0;
  resetCargoState();
  resetPlayerInventoryEffects();
  resetAllPlaneInvisibilityToOpaque();

  startAiSelfAnalyzerMatchIfNeeded();
  roundNumber++;
  ensureAiSelfAnalyzerRound();
  roundTextTimer = selectedRuleset === "mapeditor" ? 0 : 120;
  aiRoundState = createInitialAiRoundState();
  aiRoundState.tieBreakerSeed = Math.floor(Math.random() * 0x7fffffff);

  globalFrame=0;
  flyingPoints=[];
  resetNukeTimelineState();
  hasShotThisRound=false;
  aaUnits = [];
  mines = [];
  clearDynamiteExplosionDomEntries();
  dynamiteState = [];

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
  seedMapEditorInventory();
  spawnCargoForTurn();
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
  syncMapEditorResetButtonVisibility();
}

/* ======= Map helpers ======= */
function shouldAutoRandomizeMap(){
  if(selectedRuleset === "classic"){
    return true;
  }
  if(selectedRuleset === "mapeditor"){
    return false;
  }
  if(isAdvancedLikeRuleset(selectedRuleset)){
    return !!settings.randomizeMapEachRound;
  }
  return !!settings.randomizeMapEachRound;
}

function getRandomPlayableMapIndex(upcomingRoundNumber = roundNumber + 1){
  const pairSequenceNumber = Math.ceil(Math.max(1, upcomingRoundNumber) / 2);
  if(randomMapPairSequenceNumber === pairSequenceNumber && Number.isInteger(randomMapPairIndex)){
    return randomMapPairIndex;
  }

  const playableForRound = getPlayableMapIndicesForRound(upcomingRoundNumber);
  if(playableForRound.length === 0){
    randomMapPairSequenceNumber = pairSequenceNumber;
    randomMapPairIndex = 0;
    return 0;
  }

  const randomIndex = Math.floor(Math.random() * playableForRound.length);
  randomMapPairSequenceNumber = pairSequenceNumber;
  randomMapPairIndex = playableForRound[randomIndex] ?? 0;
  return randomMapPairIndex;
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
  clearDynamiteExplosionDomEntries();
  dynamiteState = [];
  resetCargoState();

  points = [];
  initPoints();
  resetFlagsForNewRound();
}

function resetMapEditorPlanePlacement(){
  if(selectedRuleset !== "mapeditor") return;

  resetPlanePositionsForCurrentMap();
  seedMapEditorInventory();
  isGameOver = false;
  winnerColor = null;
  isDrawGame = false;
  roundEndedByNuke = false;
  awaitingFlightResolution = false;
  pendingRoundTransitionDelay = null;
  pendingRoundTransitionStart = 0;
  shouldShowEndScreen = false;
  phase = "TURN";
  currentPlacer = null;
  roundTextTimer = 0;

  if(endGameDiv instanceof HTMLElement){
    setEndGamePanelVisible(false);
  }

  renderScoreboard();
}

function syncMapEditorResetButtonVisibility(){
  const editorVisible = selectedRuleset === "mapeditor"
    && document.body.classList.contains("screen--game");
  const bricksModeActive = editorVisible && mapEditorControlMode === "bricks";

  if(mapEditorModeControls instanceof HTMLElement){
    mapEditorModeControls.hidden = !editorVisible;
    mapEditorModeControls.setAttribute("aria-hidden", editorVisible ? "false" : "true");
  }

  if(mapEditorResetBtn instanceof HTMLElement){
    mapEditorResetBtn.hidden = !editorVisible;
    mapEditorResetBtn.setAttribute("aria-hidden", editorVisible ? "false" : "true");
  }

  if(mapEditorSaveBtn instanceof HTMLElement){
    mapEditorSaveBtn.hidden = !editorVisible;
    mapEditorSaveBtn.setAttribute("aria-hidden", editorVisible ? "false" : "true");
  }

  if(mapEditorResetMapBtn instanceof HTMLElement){
    mapEditorResetMapBtn.hidden = !editorVisible;
    mapEditorResetMapBtn.setAttribute("aria-hidden", editorVisible ? "false" : "true");
  }

  if(!editorVisible){
    closeMapEditorSaveDialog();
  }

  if(mapEditorModeBricksBtn instanceof HTMLElement){
    mapEditorModeBricksBtn.setAttribute("aria-pressed", bricksModeActive ? "true" : "false");
  }

  if(mapEditorModePlanesBtn instanceof HTMLElement){
    mapEditorModePlanesBtn.setAttribute("aria-pressed", bricksModeActive ? "false" : "true");
  }

  if(mapEditorBrickSidebar instanceof HTMLElement){
    mapEditorBrickSidebar.hidden = !bricksModeActive;
    mapEditorBrickSidebar.setAttribute("aria-hidden", bricksModeActive ? "false" : "true");
    mapEditorBrickSidebar.style.pointerEvents = "none";
  }

  if(!bricksModeActive){
    resetMapEditorBrickInteraction();
  }
}

function ensureMapSpriteAssets(sprites = []){
  const spriteEntries = Array.isArray(sprites) ? sprites : [];
  const requested = new Set(MAP_SPRITE_NAMES);

  for(const entry of spriteEntries){
    const spriteName = typeof entry?.spriteName === "string" ? entry.spriteName : MAP_DEFAULT_SPRITE_NAME;
    if(MAP_VALID_SPRITE_NAMES.has(spriteName)){
      requested.add(spriteName);
    }
  }

  requested.add(MAP_DEFAULT_SPRITE_NAME);

  for(const spriteName of requested){
    const path = MAP_SPRITE_PATHS[spriteName] || MAP_BRICK_SPRITE_PATH;
    if(!MAP_SPRITE_ASSETS[spriteName]){
      const { img } = loadImageAsset(path, GAME_PRELOAD_LABEL);
      MAP_SPRITE_ASSETS[spriteName] = img;
    }
  }

  return MAP_SPRITE_ASSETS;
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

  const configuredSize = MAP_SPRITE_BASE_SIZES[spriteName];
  if(configuredSize){
    return { width: configuredSize.width, height: configuredSize.height };
  }

  const defaultSize = MAP_SPRITE_BASE_SIZES[MAP_DEFAULT_SPRITE_NAME];
  return {
    width: defaultSize?.width || MAP_BRICK_THICKNESS,
    height: defaultSize?.height || MAP_BRICK_THICKNESS * 2
  };
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
  if(!spriteName || !MAP_VALID_SPRITE_NAMES.has(spriteName)){
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

  if(spriteName === MAP_DIAGONAL_SPRITE_NAME){
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
    const validSpriteNames = MAP_VALID_SPRITE_NAMES;
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
  resyncFieldDimensions("map applied");
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

  resyncFieldDimensions(reason);
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

  if (activeInventoryDrag) {
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
