(() => {
const MIN_FLIGHT_RANGE_CELLS = 10;
const MAX_FLIGHT_RANGE_CELLS = 50;
const RANGE_DISPLAY_VALUES = [10, 15, 20, 25, 30, 35, 40, 45, 50];
const RANGE_CELL_WIDTH = 58;
const RANGE_HALF_STEP_PX = RANGE_CELL_WIDTH / 2;
const RANGE_MAX_STEP = (RANGE_DISPLAY_VALUES.length - 1) * 2;
const RANGE_DRAG_STEP_PX = 15;
const RANGE_DRAG_VELOCITY_START = 0.45;
const RANGE_DRAG_VELOCITY_MULT = 10;
const RANGE_DRAG_MAX_STEPS = 10;
const RANGE_PEEK_PX = 8;
const RANGE_FAST_SCROLL_THRESHOLD = 4;
const RANGE_BASE_STEP_MS = 200;
const RANGE_FAST_MIN_STEP_MS = 120;
const RANGE_FAST_MAX_STEP_MS = 190;
const RANGE_FAST_VELOCITY_THRESHOLD = 4;
const RANGE_MIN_BATCH_MS = 170;
const RANGE_SCROLL_STEP_PX = RANGE_CELL_WIDTH;
const RANGE_DIR_NEXT = 1;
const RANGE_DIR_PREV = -1;
const RANGE_VISUAL_SIGN = -1;
const MIN_AMPLITUDE = 0;
const MAX_AMPLITUDE = 20;

const MAP_PREVIEW_BASE_WIDTH = 360;
const MAP_PREVIEW_BASE_HEIGHT = 640;
const MAP_PREVIEW_BRICK_SPRITE_PATH = 'ui_gamescreen/bricks/brick_1_default.png';

const CONTROL_PANEL_PREVIEW_CACHE = new Map();

const settingsLayer = document.getElementById('settingsLayer');
const settingsRoot = settingsLayer ?? document;
const selectInSettings = (selector) => settingsRoot.querySelector(selector);

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

function isSpriteReady(img){
  return Boolean(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
}

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
    const registry = window.paperWingsAssets || null;
    const useRegistry = !!registry?.getImage;
    const normalize = (value) => (typeof value === 'string' ? value.trim() : '');
    const { img, url } = useRegistry
      ? registry.getImage(src, "previewBuildings")
      : (() => {
          const normalized = normalize(src);
          if (!normalized) return { img: null, url: '' };
          return { img: new Image(), url: normalized };
        })();

    if (!img || !url) {
      resolve([]);
      return;
    }

    const handleLoad = () => {
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

    const handleError = () => resolve([]);

    if (isSpriteReady(img)) {
      handleLoad();
      return;
    }

    img.addEventListener('load', handleLoad, { once: true });
    img.addEventListener('error', handleError, { once: true });

    if (useRegistry && typeof registry.primeImageLoad === 'function') {
      registry.primeImageLoad(img, url, "previewBuildings");
    } else {
      installImageWatch(img, url, "previewBuildings");
      img.src = url;
    }
  });
}

function getPreviewBuildingsForControlPanelMap(map){
  if(!map?.file?.startsWith('ui_controlpanel/') || !map.file.endsWith('.png')){
    return Promise.resolve([]);
  }

  const cached = CONTROL_PANEL_PREVIEW_CACHE.get(map.file);
  if(cached){
    return cached;
  }

  const pending = generatePreviewBuildingsFromPng(map.file)
    .then(buildings => {
      CONTROL_PANEL_PREVIEW_CACHE.set(map.file, buildings);
      map.previewBuildings = buildings;
      return buildings;
    })
    .catch(() => {
      CONTROL_PANEL_PREVIEW_CACHE.set(map.file, []);
      return [];
    });

  CONTROL_PANEL_PREVIEW_CACHE.set(map.file, pending);
  return pending;
}

const RANDOM_MAP_FILE = 'ui_controlpanel/cp_de_maprandom.png';

const CLEAR_SKY_BUILDINGS = [];
const FIVE_BRICKS_BUILDINGS = [
  { x: 110, y: 180, width: 100, height: 40 },
  { x: 250, y: 180, width: 100, height: 40 },
  { x: 180, y: 320, width: 100, height: 40 },
  { x: 110, y: 460, width: 100, height: 40 },
  { x: 250, y: 460, width: 100, height: 40 }
];
const DIAGONALS_BUILDINGS = [
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
];
const MAPS = [
  {
    name: 'Clear Sky',
    file: 'ui_gamescreen/maps/easy 1-2 round/map 1 - clear sky 3.png',
    tier: 'easy',
    buildings: CLEAR_SKY_BUILDINGS
  },
  {
    name: '5 Bricks',
    file: 'ui_gamescreen/maps/middle 3-4 round/map 2 - 5 bricks.png',
    tier: 'middle',
    buildings: FIVE_BRICKS_BUILDINGS
  },
  {
    name: 'Diagonals',
    file: 'ui_gamescreen/maps/hard 5 round and more/map 3 diagonals.png',
    tier: 'hard',
    buildings: DIAGONALS_BUILDINGS
  },
  {
    name: 'Random map',
    file: RANDOM_MAP_FILE,
    buildings: CLEAR_SKY_BUILDINGS,
    tier: 'random'
  }
];

function isRandomMap(map){
  return map?.file === RANDOM_MAP_FILE;
}

function getSelectableMapIndices(excludeIndex){
  return MAPS
    .map((map, index) => ({ map, index }))
    .filter(({ map, index }) => !isRandomMap(map) && index !== excludeIndex)
    .map(({ index }) => index);
}

function sanitizeMapIndex(index, { excludeIndex, allowRandom } = {}){
  if(index < 0 || index >= MAPS.length){
    index = DEFAULT_SETTINGS.mapIndex;
  }

  if(!isRandomMap(MAPS[index])){
    return index;
  }

  if(allowRandom){
    return index;
  }

  const selectable = getSelectableMapIndices(excludeIndex);
  if(!selectable.length){
    return index;
  }

  const randomIndex = Math.floor(Math.random() * selectable.length);
  return selectable[randomIndex];
}

  const DEFAULT_SETTINGS = {
    rangeCells: 30,
    aimingAmplitude: 10 / 5,
    addAA: false,
    sharpEdges: false,
    addCargo: false,
    mapIndex: 0
  };

const PREVIEW_CELL_SIZE = 20;
const PREVIEW_MAX_DRAG_DISTANCE = 100;
const PREVIEW_DRAG_ROTATION_THRESHOLD = 5;
// Keep extended timing in the preview/container only; field flights use FIELD_FLIGHT_DURATION_SEC
const CONTAINER_FLIGHT_DURATION_SEC = (68 / 60) * 2;
const PREVIEW_FLIGHT_DURATION_SEC = CONTAINER_FLIGHT_DURATION_SEC;
const PREVIEW_PLANE_TOUCH_RADIUS = 12;
const PREVIEW_OSCILLATION_SPEED = 0.01;
const PREVIEW_FLIGHT_DISTANCE_SCALE = 1 / 1.5;
const PREVIEW_FLIGHT_DURATION_SCALE = 1;

class ContrailRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.baseWidth = options.baseWidth ?? 92;
    this.baseHeight = options.baseHeight ?? 60;
    this.scale = 1;
    this.displayWidth = this.baseWidth;
    this.displayHeight = this.baseHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.elapsed = 0;
    this.offset = 0;
    this.streaks = this.createStreaks();
    this._tick = this.tick.bind(this);
    this.running = false;

    this.resizeCanvas();
    this.start();
  }

  setScale(scale) {
    this.scale = scale;
    this.resizeCanvas();
  }

  resizeCanvas() {
    this.displayWidth = this.baseWidth * this.scale;
    this.displayHeight = this.baseHeight * (0.7 + 0.3 * this.scale);
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.style.width = `${this.baseWidth}px`;
    this.canvas.style.height = `${this.baseHeight}px`;
    this.canvas.width = Math.max(1, Math.round(this.displayWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.displayHeight * this.dpr));
    this.canvas.style.setProperty('--trail-scale', this.scale.toFixed(3));
  }

  start() {
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this._tick);
    }
  }

  stop() {
    this.running = false;
  }

  destroy() {
    this.stop();
    this.ctx && this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  createStreaks() {
    return [
      { y: 0.16, thickness: 7, alpha: 0.45, wobble: 0.05, phase: 0 },
      { y: 0.38, thickness: 8, alpha: 0.52, wobble: 0.07, phase: 0.4 },
      { y: 0.58, thickness: 7, alpha: 0.48, wobble: 0.06, phase: 0.7 },
      { y: 0.8, thickness: 6, alpha: 0.42, wobble: 0.04, phase: 0.2 }
    ];
  }

  tick(timestamp) {
    if (!this.running) return;

    const dt = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0;
    this.lastTimestamp = timestamp;
    this.elapsed += dt;

    this.update(dt);
    this.draw();

    requestAnimationFrame(this._tick);
  }

  update(dt) {
    const baseSpeed = 26 + this.scale * 10;
    const spacing = Math.max(28, this.displayWidth * 0.32);
    this.offset = (this.offset - dt * baseSpeed * this.scale) % spacing;
    if (this.offset < 0) {
      this.offset += spacing;
    }
  }

  drawStreak(ctx, x, y, length, thickness, alpha) {
    const gradient = ctx.createLinearGradient(x + length, y, x, y);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.65 * alpha})`);
    gradient.addColorStop(0.32, `rgba(192, 230, 255, ${0.5 * alpha})`);
    gradient.addColorStop(0.74, `rgba(160, 200, 255, ${0.32 * alpha})`);
    gradient.addColorStop(1, 'rgba(140, 190, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    const radius = thickness / 2;
    ctx.moveTo(x + radius, y - radius);
    ctx.lineTo(x + length - radius, y - radius);
    ctx.quadraticCurveTo(x + length, y - radius, x + length, y);
    ctx.quadraticCurveTo(x + length, y + radius, x + length - radius, y + radius);
    ctx.lineTo(x + radius, y + radius);
    ctx.quadraticCurveTo(x, y + radius, x, y);
    ctx.quadraticCurveTo(x, y - radius, x + radius, y - radius);
    ctx.fill();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    const length = this.displayWidth * 0.9;
    const spacing = Math.max(28, this.displayWidth * 0.32);

    ctx.save();
    ctx.filter = 'blur(1.2px)';

    for (const streak of this.streaks) {
      const yBase = this.displayHeight * streak.y;
      const wobble = Math.sin(this.elapsed * 2.4 + streak.phase * Math.PI * 2) * streak.wobble * this.displayHeight;
      const thickness = streak.thickness * (0.7 + 0.3 * this.scale);
      const start = -spacing + this.offset + streak.phase * spacing;

      for (let x = start; x < this.displayWidth + spacing; x += spacing) {
        this.drawStreak(ctx, x, yBase + wobble, length, thickness, streak.alpha);
      }
    }

    ctx.restore();
  }
}

let storageAvailable = true;
function getStoredItem(key){
  if(!storageAvailable){
    return null;
  }
  try {
    const storage = window.localStorage;
    return storage ? storage.getItem(key) : null;
  } catch(err){
    storageAvailable = false;
    console.warn('localStorage unavailable, using default settings.', err);
    return null;
  }
}

function setStoredItem(key, value){
  if(!storageAvailable){
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch(err){
    storageAvailable = false;
    console.warn('localStorage unavailable, settings changes will not persist.', err);
  }
}

function getIntSetting(key, defaultValue){
  const value = parseInt(getStoredItem(key), 10);
  return Number.isNaN(value) ? defaultValue : value;
}

let settingsFlightRangeCells = getIntSetting('settings.flightRangeCells', 30);
let rangeStep = getRangeStepForValue(settingsFlightRangeCells);
let rangeCommittedValue = getRangeValue(rangeStep);
let rangePreviewValue = rangeCommittedValue;
settingsFlightRangeCells = rangeCommittedValue;
let settingsAimingAmplitude  = parseFloat(getStoredItem('settings.aimingAmplitude'));
if(Number.isNaN(settingsAimingAmplitude)) settingsAimingAmplitude = 10 / 5;
let addAA = getStoredItem('settings.addAA') === 'true';
let sharpEdges = getStoredItem('settings.sharpEdges') === 'true';
let addCargo = getStoredItem('settings.addCargo') === 'true';
let mapIndex = sanitizeMapIndex(
  getIntSetting('settings.mapIndex', DEFAULT_SETTINGS.mapIndex),
  { allowRandom: true }
);

let rangeDisplayIdx = Math.floor(rangeStep / 2);
let rangeScrollPos = rangeDisplayIdx;
let rangeScrollRafId = null;
let rangeOvershootTimer = null;

const getRangeDirFromDx = (dx) => (dx < 0 ? RANGE_DIR_NEXT : (dx > 0 ? RANGE_DIR_PREV : 0));
const getRangeDirFromDelta = (delta) => (delta > 0 ? RANGE_DIR_NEXT : (delta < 0 ? RANGE_DIR_PREV : 0));
const getRangeDirectionLabel = (dir) => (dir === RANGE_DIR_NEXT ? 'next' : (dir === RANGE_DIR_PREV ? 'prev' : null));

function clampRangeStep(step){
  return Math.min(RANGE_MAX_STEP, Math.max(0, step));
}

function getRangeStepForValue(value){
  const clamped = Math.min(MAX_FLIGHT_RANGE_CELLS, Math.max(MIN_FLIGHT_RANGE_CELLS, value));
  let closestIndex = 0;
  RANGE_DISPLAY_VALUES.forEach((displayValue, index) => {
    const closestDistance = Math.abs(RANGE_DISPLAY_VALUES[closestIndex] - clamped);
    const currentDistance = Math.abs(displayValue - clamped);
    if(currentDistance < closestDistance){
      closestIndex = index;
    }
  });
  return clampRangeStep(closestIndex * 2);
}

function getRangeValue(step){
  const index = Math.floor(clampRangeStep(step) / 2);
  return RANGE_DISPLAY_VALUES[index] ?? RANGE_DISPLAY_VALUES[RANGE_DISPLAY_VALUES.length - 1];
}

function syncRangeWithStep(step){
  rangeStep = clampRangeStep(step);
  rangeCommittedValue = getRangeValue(rangeStep);
  rangePreviewValue = rangeCommittedValue;
  settingsFlightRangeCells = rangeCommittedValue;
}

function syncRangeStepFromValue(value){
  syncRangeWithStep(getRangeStepForValue(value));
}

syncRangeStepFromValue(settingsFlightRangeCells);

const rangeMinusBtn =
  selectInSettings('#rangeBtnLeft') ??
  selectInSettings('#rangeMinus') ??
  selectInSettings('#flightRangeMinus');
const rangePlusBtn =
  selectInSettings('#rangeBtnRight') ??
  selectInSettings('#rangePlus') ??
  selectInSettings('#flightRangePlus');
const rangeDisplayViewport = selectInSettings('#rangeDisplayViewport');
let rangeDisplayLayer = selectInSettings('#rangeDisplayLayer');
let rangeDisplayTrack = selectInSettings('#rangeDisplayTrack');
let rangeDisplayItem = selectInSettings('#rangeDisplayItem');
const rangeTickTop = selectInSettings('#rangeTickTop');
const rangeTickBottom = selectInSettings('#rangeTickBottom');
const amplitudeMinusBtn =
  selectInSettings('#instance_accuracy_left') ??
  selectInSettings('#amplitudeMinus');
const amplitudePlusBtn =
  selectInSettings('#instance_accuracy_right') ??
  selectInSettings('#amplitudePlus');
const addAAToggle = selectInSettings('#addAAToggle');
const sharpEdgesToggle = selectInSettings('#sharpEdgesToggle');
const addsNailsBtn = selectInSettings('#instance_adds_tumbler1_nails');
const addsAABtn = selectInSettings('#instance_adds_tumbler2_aa');
const addsCargoBtn = selectInSettings('#instance_adds_tumbler3_cargo');
const resetBtn = selectInSettings('#instance_reset');
const exitBtn = selectInSettings('#instance_exit');
const mapPrevBtn = selectInSettings('#instance_field_left');
const mapNextBtn = selectInSettings('#instance_field_right');
const mapNameDisplay = selectInSettings('#frame_field_2_counter');
const mapPreviewContainer = selectInSettings('#frame_field_1_visual');
const mapPreview = selectInSettings('#mapPreview');
const flameTrailImage = selectInSettings('#flameTrail');
const contrailImages = [
  selectInSettings('#contrail1'),
  selectInSettings('#contrail2')
];
const isTestHarnessPage = document.body.classList.contains('test-harness');

const isSettingsLayerVisible = () => (settingsLayer ? !settingsLayer.hidden : true);
let isSettingsActive = isSettingsLayerVisible();
let previewCanvas = null;
let previewCtx = null;
let previewDpr = window.devicePixelRatio || 1;
let previewPlanes = [];
let previewBuildings = [];
let previewLastTimestamp = 0;
let previewOscillationAngle = 0;
let previewOscillationDir = 1;
let previewArrow = null;
let previewAnimationId = null;
let previewSimulationInitialized = false;
const previewPlaneBaselines = new WeakMap();
let mapPreviewBricksCanvas = null;
let mapPreviewBricksCtx = null;
let mapPreviewBrickDpr = window.devicePixelRatio || 1;
let previewBrickSprite = null;
const previewHandle = {
  active: false,
  baseX: 0,
  baseY: 0,
  shakyX: 0,
  shakyY: 0,
  offsetX: 0,
  offsetY: 0,
  plane: null,
  origAngle: 0
};
let isRangeAnimating = false;
let isRangeDragging = false;
let rangeDragStartX = 0;
let rangeDragStartTime = 0;
let rangeDragPointerId = null;
let rangeDragLastDx = 0;
let pendingRangeSteps = 0;
let pendingRangeDir = 0;
let rangeGestureVelocity = 0;

function stopPreviewAnimation(){
  if(previewAnimationId){
    cancelAnimationFrame(previewAnimationId);
    previewAnimationId = null;
  }
  previewLastTimestamp = 0;
}

function startPreviewAnimationIfNeeded(){
  if(!isSettingsActive) return;
  if(previewSimulationInitialized && !previewAnimationId){
    previewLastTimestamp = 0;
    previewAnimationId = requestAnimationFrame(tickPreview);
  }
}

function startPreviewSimulation(){
  if(!isSettingsActive) return;
  if(previewSimulationInitialized){
    return;
  }

  previewSimulationInitialized = true;
  setupPreviewSimulation();
}

function refreshPreviewSimulationIfInitialized(){
  if(!isSettingsActive) return;
  if(previewSimulationInitialized){
    setupPreviewSimulation();
  }
}

function ensureRangeDisplayTrack(){
  if(rangeDisplayTrack instanceof HTMLElement){
    const scale = selectInSettings('.range-display__scale');
    if(scale && scale.parentElement !== rangeDisplayTrack){
      rangeDisplayTrack.appendChild(scale);
    }

    if(rangeDisplayItem instanceof HTMLElement && rangeDisplayItem.parentElement !== rangeDisplayTrack){
      rangeDisplayTrack.appendChild(rangeDisplayItem);
    }

    return rangeDisplayTrack;
  }

  if(!rangeDisplayViewport){
    return null;
  }

  if(!(rangeDisplayLayer instanceof HTMLElement)){
    const fallbackLayer =
      rangeDisplayViewport.querySelector('#rangeDisplayLayer') ??
      rangeDisplayViewport.querySelector('.range-display__layer');

    if(fallbackLayer instanceof HTMLElement){
      rangeDisplayLayer = fallbackLayer;
    } else {
      const createdLayer = document.createElement('div');
      createdLayer.className = 'range-display__layer';
      createdLayer.id = 'rangeDisplayLayer';

      const bottomTick = rangeDisplayViewport.querySelector('.range-display__tick--bottom');
      if(bottomTick instanceof HTMLElement){
        rangeDisplayViewport.insertBefore(createdLayer, bottomTick);
      } else {
        rangeDisplayViewport.appendChild(createdLayer);
      }

      rangeDisplayLayer = createdLayer;
    }
  }

  if(!(rangeDisplayLayer instanceof HTMLElement)){
    return null;
  }

  const track = document.createElement('div');
  track.className = 'range-display__track';
  track.id = 'rangeDisplayTrack';

  const scale = selectInSettings('.range-display__scale');
  if(scale){
    track.appendChild(scale);
  }

  const existingItem =
    rangeDisplayItem ??
    rangeDisplayViewport.querySelector('#rangeDisplayItem') ??
    rangeDisplayViewport.querySelector('.range-display__item');

  if(existingItem instanceof HTMLElement){
    track.appendChild(existingItem);
    rangeDisplayItem = existingItem;
  } else {
    const newItem = document.createElement('div');
    newItem.className = 'range-display__item range-display__item--current';
    newItem.id = 'rangeDisplayItem';
    const value = selectInSettings('#rangeDisplay');
    if(value){
      newItem.appendChild(value);
    }
    track.appendChild(newItem);
    rangeDisplayItem = newItem;
  }

  rangeDisplayLayer.appendChild(track);
  rangeDisplayTrack = track;
  return rangeDisplayTrack;
}

function setRangeDisplayValue(displayedCells){
  const el = selectInSettings('#rangeDisplay');
  const transformTarget = ensureRangeDisplayTrack() ?? rangeDisplayItem ?? el;
  if(el){
    el.textContent = `${displayedCells}`;
    el.classList.add('range-display__value--current');
    el.classList.remove('range-display__value--incoming', 'range-display__value--outgoing');
    if(transformTarget){
      transformTarget.style.removeProperty('transform');
      transformTarget.style.removeProperty('transition');
    }
  }
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t, s = 1.1) => {
  const invT = t - 1;
  return 1 + (s + 1) * Math.pow(invT, 3) + s * invT * invT;
};

function clearRangeScrollAnimation(){
  if(rangeScrollRafId !== null){
    cancelAnimationFrame(rangeScrollRafId);
    rangeScrollRafId = null;
  }
}

function clearRangeOvershoot(){
  if(rangeOvershootTimer !== null){
    clearTimeout(rangeOvershootTimer);
    rangeOvershootTimer = null;
  }

  const transformTarget = ensureRangeDisplayTrack();
  if(transformTarget){
    transformTarget.style.removeProperty('transition');
  }
}

function applyRangeScrollVisual(scrollPos){
  const clampedPos = Math.min(
    RANGE_DISPLAY_VALUES.length - 1,
    Math.max(0, scrollPos)
  );
  const displayIdx = Math.round(clampedPos);
  const currentValue = selectInSettings('#rangeDisplay');
  const transformTarget = ensureRangeDisplayTrack();

  if(displayIdx !== rangeDisplayIdx){
    setRangeDisplayValue(RANGE_DISPLAY_VALUES[displayIdx]);
    rangeDisplayIdx = displayIdx;
  }

  rangeScrollPos = clampedPos;

  if(transformTarget){
    transformTarget.style.transition = 'none';
    const frac = clampedPos - displayIdx;
    transformTarget.style.transform =
      `translateX(${frac * RANGE_SCROLL_STEP_PX * RANGE_VISUAL_SIGN}px)`;
  }

  return displayIdx;
}

function finishRangeScroll(targetIndex, dir, onFinish){
  rangeScrollRafId = null;
  const currentValue = RANGE_DISPLAY_VALUES[targetIndex];
  rangeScrollPos = targetIndex;
  rangeDisplayIdx = targetIndex;
  setRangeDisplayValue(currentValue);

  const transformTarget = ensureRangeDisplayTrack();
  if(transformTarget){
    transformTarget.style.transition = 'none';
    transformTarget.style.transform = 'translateX(0)';
  }
  isRangeAnimating = false;
  if(typeof onFinish === 'function'){
    onFinish();
  }
}

function animateRangeDisplay(displayedCells, direction, options = {}){
  const { onFinish, durationMs, targetIndex, gestureVelocity = 0 } = options;

  const currentValue = selectInSettings('#rangeDisplay');
  const endIndex = Number.isFinite(targetIndex)
    ? Math.max(0, Math.min(RANGE_DISPLAY_VALUES.length - 1, targetIndex))
    : rangeDisplayIdx;

  if(!currentValue || endIndex === rangeDisplayIdx || !Number.isFinite(endIndex)){
    if(Number.isFinite(endIndex)){
      rangeDisplayIdx = endIndex;
      rangeScrollPos = endIndex;
    }
    setRangeDisplayValue(displayedCells);
    if(typeof onFinish === 'function'){
      onFinish();
    }
    return;
  }

  clearRangeScrollAnimation();
  clearRangeOvershoot();
  isRangeAnimating = true;

  const startPos = rangeDisplayIdx;
  const endPos = endIndex;
  rangeScrollPos = startPos;
  const totalSteps = Math.max(1, Math.abs(endPos - startPos));
  const fastScroll = totalSteps >= RANGE_FAST_SCROLL_THRESHOLD;
  const computedDuration = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : getRangeStepDuration(totalSteps, { fastScroll, gestureVelocity }) * totalSteps;

  if(computedDuration === 0){
    const dir = direction === 'next' ? RANGE_DIR_NEXT : RANGE_DIR_PREV;
    finishRangeScroll(endIndex, dir, onFinish);
    return;
  }

  const runAnimation = (startTime, timestamp) => {
    const elapsed = timestamp - startTime;
    const t = Math.min(1, elapsed / computedDuration);
    const overshootStrength = 0.9 * Math.min(1, 1 / totalSteps);
    const eased = easeOutBack(t, overshootStrength);
    const nextPos = startPos + (endPos - startPos) * eased;
    applyRangeScrollVisual(nextPos);

    if(t < 1){
      rangeScrollRafId = requestAnimationFrame((now) => runAnimation(startTime, now));
    } else {
      const dir = direction === 'next' ? RANGE_DIR_NEXT : RANGE_DIR_PREV;
      finishRangeScroll(endIndex, dir, onFinish);
    }
  };

  rangeScrollRafId = requestAnimationFrame((timestamp) => runAnimation(timestamp, timestamp));
}

function updateRangeDisplay(stepOverride, options = {}){
  const transformStep = Number.isFinite(stepOverride) ? stepOverride : rangeStep;
  const displayedCells = getRangeValue(transformStep);

  if(options.animateDirection){
    animateRangeDisplay(displayedCells, options.animateDirection, options);
    return;
  }

  rangeDisplayIdx = Math.floor(clampRangeStep(transformStep) / 2);
  rangeScrollPos = rangeDisplayIdx;
  setRangeDisplayValue(displayedCells);
  if(typeof options.onFinish === 'function'){
    options.onFinish();
  }
}

function getRangePeekOffset(direction){
  const viewportWidth = rangeDisplayViewport?.clientWidth || 0;
  const peekOffset = Math.max(0, viewportWidth - RANGE_PEEK_PX);
  return direction === 'next' ? peekOffset : -peekOffset;
}

function removeIncomingRangeValue(){
  const incomingContainer = ensureRangeDisplayTrack() ?? rangeDisplayLayer;
  if(!incomingContainer) return;
  const incoming = incomingContainer.querySelector('.range-display__value--incoming');
  if(incoming){
    incoming.remove();
  }
}

function prepareIncomingRangeValue(direction){
  const incomingContainer = ensureRangeDisplayTrack() ?? rangeDisplayLayer;
  if(!incomingContainer) return null;

  const currentIndex = Math.floor(rangeStep / 2);
  const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

  if(targetIndex < 0 || targetIndex >= RANGE_DISPLAY_VALUES.length){
    removeIncomingRangeValue();
    return null;
  }

  let incoming = incomingContainer.querySelector('.range-display__value--incoming');
  if(!incoming){
    incoming = document.createElement('span');
    incoming.className = 'range-display__value range-display__value--incoming';
    incomingContainer.appendChild(incoming);
  }

  incoming.textContent = `${RANGE_DISPLAY_VALUES[targetIndex]}`;
  incoming.dataset.direction = direction;
  incoming.style.transition = 'none';

  return incoming;
}

function resetRangeDragVisual(animateReset){
  const transformTarget = ensureRangeDisplayTrack();
  if(!transformTarget) return;
  transformTarget.style.removeProperty('transition');
  if(animateReset){
    transformTarget.style.transform = 'translateX(0)';
  } else {
    transformTarget.style.removeProperty('transform');
  }

  removeIncomingRangeValue();
}

function getRangeStepDuration(pendingSteps, { fastScroll = false, gestureVelocity = 0 } = {}){
  const absVelocity = Math.abs(gestureVelocity);
  const velocityRatio = RANGE_FAST_VELOCITY_THRESHOLD > 0
    ? Math.min(1, absVelocity / RANGE_FAST_VELOCITY_THRESHOLD)
    : 1;

  const fastDuration = RANGE_FAST_MAX_STEP_MS - velocityRatio *
    (RANGE_FAST_MAX_STEP_MS - RANGE_FAST_MIN_STEP_MS);
  const baseDuration = RANGE_BASE_STEP_MS - velocityRatio *
    (RANGE_BASE_STEP_MS - RANGE_FAST_MAX_STEP_MS);

  const isMultiStep = pendingSteps > 1;
  const rawDuration = fastScroll || isMultiStep ? fastDuration : baseDuration;

  const clampedDuration = Math.max(
    RANGE_FAST_MIN_STEP_MS,
    Math.min(RANGE_BASE_STEP_MS, rawDuration)
  );

  const minPerStep = Math.max(
    RANGE_FAST_MIN_STEP_MS,
    RANGE_MIN_BATCH_MS / Math.max(1, pendingSteps)
  );

  return Math.max(minPerStep, Math.min(RANGE_FAST_MAX_STEP_MS, clampedDuration));
}

function clearRangeStepQueue(){
  pendingRangeSteps = 0;
  pendingRangeDir = 0;
  rangeGestureVelocity = 0;
}

function runRangeStepQueue(){
  if(pendingRangeSteps <= 0){
    clearRangeStepQueue();
    return;
  }

  if(isRangeAnimating){
    return;
  }

  const delta = pendingRangeDir * pendingRangeSteps;
  changeRangeStep(delta, {
    onFinish: clearRangeStepQueue,
    animate: true,
    gestureVelocity: rangeGestureVelocity
  });
}

function queueRangeSteps(steps, dir, gestureVelocity = 0){
  if(steps <= 0 || dir === 0){
    clearRangeStepQueue();
    return;
  }

  rangeGestureVelocity = gestureVelocity;
  pendingRangeSteps = Math.min(RANGE_DRAG_MAX_STEPS, steps);
  pendingRangeDir = dir;
  runRangeStepQueue();
}

function handleRangePointerDown(event){
  if(isRangeAnimating || !rangeDisplayViewport) return;
  const transformTarget = ensureRangeDisplayTrack();
  if(!transformTarget) return;
  event.preventDefault();

  clearRangeStepQueue();

  transformTarget.style.transition = 'none';
  transformTarget.style.transform = 'translateX(0)';

  removeIncomingRangeValue();

  isRangeDragging = true;
  rangeDragPointerId = event.pointerId;
  rangeDragStartX = event.clientX;
  rangeDragStartTime = event.timeStamp;
  rangeDragLastDx = 0;

  rangeDisplayViewport.setPointerCapture(event.pointerId);
}

function handleRangePointerMove(event){
  if(!isRangeDragging || isRangeAnimating || !rangeDisplayViewport) return;
  event.preventDefault();

  rangeDragLastDx = event.clientX - rangeDragStartX;

  const transformTarget = ensureRangeDisplayTrack();
  if(!transformTarget) return;

  const maxOffset = (rangeDisplayViewport.clientWidth || 0) * 0.55;
  const clampedDx = Math.max(-maxOffset, Math.min(maxOffset, rangeDragLastDx));
  transformTarget.style.transform = `translateX(${clampedDx}px)`;

  const direction = getRangeDirectionLabel(getRangeDirFromDx(clampedDx));
  const incoming = direction ? prepareIncomingRangeValue(direction) : null;

  if(incoming){
    const peekOffset = getRangePeekOffset(direction);
    incoming.style.transform = `translateX(${peekOffset + clampedDx}px)`;
  } else {
    removeIncomingRangeValue();
  }
}

function handleRangePointerEnd(event){
  if(!isRangeDragging) return;

  if(rangeDisplayViewport && rangeDragPointerId !== null &&
     rangeDisplayViewport.hasPointerCapture(rangeDragPointerId)){
    rangeDisplayViewport.releasePointerCapture(rangeDragPointerId);
  }

  rangeDragLastDx = event.clientX - rangeDragStartX;
  const dx = rangeDragLastDx;
  const absDx = Math.abs(dx);
  const deltaTime = Math.max(event.timeStamp - rangeDragStartTime, 1);
  const velocity = absDx / deltaTime;

  isRangeDragging = false;
  rangeDragPointerId = null;

  if(isRangeAnimating){
    resetRangeDragVisual(false);
    return;
  }

  const stepsByDistance = Math.floor(absDx / RANGE_DRAG_STEP_PX);
  const stepsByVelocity = Math.floor(
    Math.max(0, velocity - RANGE_DRAG_VELOCITY_START) * RANGE_DRAG_VELOCITY_MULT
  );
  const calculatedSteps = Math.max(stepsByDistance, stepsByVelocity);
  const steps = Math.min(RANGE_DRAG_MAX_STEPS, calculatedSteps);
  const dir = getRangeDirFromDx(dx);

  if(steps === 0 || dir === 0){
    resetRangeDragVisual(absDx > 0);
    return;
  }

  resetRangeDragVisual(false);
  queueRangeSteps(steps, dir, velocity);
}

function updateRangeFlame(){
  const minScale = 0.78;
  const maxScale = 1.82;
  const t = (rangeCommittedValue - MIN_FLIGHT_RANGE_CELLS) /
            (MAX_FLIGHT_RANGE_CELLS - MIN_FLIGHT_RANGE_CELLS);
  const ratio = minScale + t * (maxScale - minScale);
  if(flameTrailImage instanceof HTMLElement){
    const trailScaleFactor = 0.55;
    const trailMinScale = minScale * trailScaleFactor;
    const trailMaxScale = maxScale * trailScaleFactor;
    const trailRatio = trailMinScale + t * (trailMaxScale - trailMinScale);

    const widthScale = trailRatio;
    const heightScale = 0.8 + 0.2 * trailRatio;
    flameTrailImage.style.transform = `scale(${widthScale}, ${heightScale})`;
  }

  contrailImages.forEach((image) => {
    if(image instanceof HTMLElement){
      image.style.right = '-15px';
      image.style.removeProperty('left');
      image.style.transformOrigin = 'right center';
      image.style.transform = `scale(${ratio * 0.9})`;
    }
  });
}

function commitRangeValue(value){
  rangeCommittedValue = value;
  settingsFlightRangeCells = value;
  updateRangeFlame();
  saveSettings();
}

function changeRangeStep(delta, options = {}){
  if(isRangeAnimating) return;

  const {
    onFinish,
    animate = true,
    durationMs,
    gestureVelocity = 0,
    commitImmediately = false
  } = options;

  const currentIndex = Math.floor(rangeStep / 2);
  const nextIndex = Math.min(
    RANGE_DISPLAY_VALUES.length - 1,
    Math.max(0, currentIndex + delta)
  );

  if(nextIndex === currentIndex){
    if(typeof onFinish === 'function'){
      onFinish();
    }
    return;
  }

  rangeStep = nextIndex * 2;
  rangePreviewValue = RANGE_DISPLAY_VALUES[nextIndex];

  const finish = () => {
    if(!commitImmediately){
      commitRangeValue(rangePreviewValue);
    }
    if(typeof onFinish === 'function'){
      onFinish();
    }
  };

  const dir = getRangeDirFromDelta(delta);
  const animateDirection = getRangeDirectionLabel(dir);

  if(commitImmediately){
    commitRangeValue(rangePreviewValue);
  }

  updateRangeDisplay(undefined, animate ? {
    animateDirection,
    onFinish: finish,
    durationMs,
    targetIndex: nextIndex,
    gestureVelocity
  } : { onFinish: finish });
}

function updateAmplitudeDisplay(){
  const disp = selectInSettings('#amplitudeAngleDisplay');
  if(disp){
    const maxAngle = settingsAimingAmplitude * 5;
    disp.textContent = `${maxAngle.toFixed(0)}°`;
  }
}

function updateAmplitudeIndicator(){
  const amplitudeHost =
    selectInSettings('#frame_accuracy_1_visual') ??
    settingsRoot.querySelector('.cp-aiming-accuracy') ??
    selectInSettings('#amplitudeIndicator');

  if(amplitudeHost){
    const maxAngle = settingsAimingAmplitude * 5;
    amplitudeHost.style.setProperty('--amp', `${maxAngle}deg`);
  }

  syncAccuracyCrackWatcher();
}

const LEFT_CRACK_STEPS = [
  'ui_controlpanel/steps/left_step 1.png',
  'ui_controlpanel/steps/left_step 4.png',
  'ui_controlpanel/steps/left_step 5.png',
  'ui_controlpanel/steps/left_step 6.png',
  'ui_controlpanel/steps/left_step 7.png',
  'ui_controlpanel/steps/left_step 8.png',
  'ui_controlpanel/steps/left_step 9.png',
  'ui_controlpanel/steps/left_step 10.png'
];

const RIGHT_CRACK_STEPS = [
  'ui_controlpanel/steps/right_step 1.png',
  'ui_controlpanel/steps/right_step 4.png',
  'ui_controlpanel/steps/right_step 5.png',
  'ui_controlpanel/steps/right_step 6.png',
  'ui_controlpanel/steps/right_step 7.png',
  'ui_controlpanel/steps/right_step 8 .png',
  'ui_controlpanel/steps/right_step 9.png',
  'ui_controlpanel/steps/right_step 10 .png'
];

function createCrackImage(src){
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.decoding = 'async';
  img.className = 'accuracy-crack-step';
  return img;
}

function getPendulumAngle(pendulumEl){
  const transform = getComputedStyle(pendulumEl).transform;
  if(!transform || transform === 'none') return 0;

  const matrixMatch = transform.match(/matrix\(([^)]+)\)/);
  if(!matrixMatch) return 0;

  const values = matrixMatch[1].split(',').map(v => parseFloat(v.trim()));
  if(values.length < 2 || Number.isNaN(values[0]) || Number.isNaN(values[1])){
    return 0;
  }

  const angleRad = Math.atan2(values[1], values[0]);
  return angleRad * (180 / Math.PI);
}

function setupAccuracyCrackWatcher(){
  const pendulumEl = settingsRoot.querySelector('#frame_accuracy_1_visual .pendulum');
  const overlay = selectInSettings('#accuracyCrackOverlay');
  if(!pendulumEl || !overlay){
    return null;
  }

  const TARGET_AMPLITUDE = 20;
  const EXTREME_THRESHOLD = 99.5;
  const RESET_THRESHOLD = 90;
  const EPSILON = 0.001;

  let leftIndex = 0;
  let rightIndex = 0;
  let lockedSide = null;
  let running = false;
  let rafId = null;

  const shouldRunForAmplitude = (amplitude) => amplitude >= TARGET_AMPLITUDE - EPSILON;

  const appendCrack = (side) => {
    if(side === 'left' && leftIndex < LEFT_CRACK_STEPS.length){
      overlay.appendChild(createCrackImage(LEFT_CRACK_STEPS[leftIndex++]));
    } else if(side === 'right' && rightIndex < RIGHT_CRACK_STEPS.length){
      overlay.appendChild(createCrackImage(RIGHT_CRACK_STEPS[rightIndex++]));
    }
  };

  const tick = () => {
    if(!running){
      return;
    }

    if(!shouldRunForAmplitude(settingsAimingAmplitude)){
      running = false;
      rafId = null;
      lockedSide = null;
      return;
    }

    const angle = getPendulumAngle(pendulumEl);
    const absAngle = Math.abs(angle);

    if(absAngle < RESET_THRESHOLD){
      lockedSide = null;
    }

    if(angle <= -EXTREME_THRESHOLD && lockedSide !== 'right'){
      appendCrack('right');
      lockedSide = 'right';
    } else if(angle >= EXTREME_THRESHOLD && lockedSide !== 'left'){
      appendCrack('left');
      lockedSide = 'left';
    }

    rafId = requestAnimationFrame(tick);
  };

  const start = () => {
    if(running || !shouldRunForAmplitude(settingsAimingAmplitude)){
      return;
    }

    running = true;
    rafId = requestAnimationFrame(tick);
  };

  const stop = () => {
    if(rafId){
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    running = false;
    lockedSide = null;
  };

  return { start, stop, shouldRunForAmplitude };
}

const accuracyCrackWatcher = setupAccuracyCrackWatcher();

function syncAccuracyCrackWatcher(){
  if(!accuracyCrackWatcher){
    return;
  }

  if(!isSettingsLayerVisible()){
    accuracyCrackWatcher.stop();
    return;
  }

  if(accuracyCrackWatcher.shouldRunForAmplitude(settingsAimingAmplitude)){
    accuracyCrackWatcher.start();
  } else {
    accuracyCrackWatcher.stop();
  }
}

function saveSettings(){
    setStoredItem('settings.flightRangeCells', settingsFlightRangeCells);
  setStoredItem('settings.aimingAmplitude', settingsAimingAmplitude);
  setStoredItem('settings.addAA', addAA);
  setStoredItem('settings.sharpEdges', sharpEdges);
  setStoredItem('settings.addCargo', addCargo);
  mapIndex = sanitizeMapIndex(mapIndex, { allowRandom: true });
  setStoredItem('settings.mapIndex', mapIndex);
}

function hasCurrentMapBricks(){
  const bricks = MAPS[mapIndex]?.bricks;
  return Array.isArray(bricks) && bricks.length > 0;
}

function ensureMapPreviewBricksCanvas(){
  if(!mapPreview) return null;
  if(mapPreviewBricksCanvas) return mapPreviewBricksCanvas;

  mapPreviewBricksCanvas = document.createElement('canvas');
  mapPreviewBricksCanvas.className = 'map-preview-bricks';
  mapPreviewBricksCanvas.setAttribute('aria-hidden', 'true');
  mapPreview.appendChild(mapPreviewBricksCanvas);
  mapPreviewBricksCtx = mapPreviewBricksCanvas.getContext('2d');
  mapPreviewBrickDpr = window.devicePixelRatio || 1;

  return mapPreviewBricksCanvas;
}

function clearMapPreviewBricksCanvas(){
  if(mapPreviewBricksCtx && mapPreviewBricksCanvas){
    mapPreviewBricksCtx.setTransform(1, 0, 0, 1, 0, 0);
    mapPreviewBricksCtx.clearRect(0, 0, mapPreviewBricksCanvas.width, mapPreviewBricksCanvas.height);
  }

  if(mapPreviewBricksCanvas){
    mapPreviewBricksCanvas.style.display = 'none';
  }
}

function getPreviewBrickSprite(onLoad){
  if(previewBrickSprite){
    if(onLoad){
      if(isSpriteReady(previewBrickSprite)){
        onLoad();
      } else {
        previewBrickSprite.addEventListener('load', onLoad, { once: true });
      }
    }
    return previewBrickSprite;
  }

  const registry = window.paperWingsAssets || null;
  const useRegistry = !!registry?.getImage;
  const { img, url } = useRegistry
    ? registry.getImage(MAP_PREVIEW_BRICK_SPRITE_PATH, 'mapPreviewBrick')
    : (() => {
        const normalized = typeof MAP_PREVIEW_BRICK_SPRITE_PATH === 'string'
          ? MAP_PREVIEW_BRICK_SPRITE_PATH.trim()
          : '';
        if (!normalized) return { img: null, url: '' };
        return { img: new Image(), url: normalized };
      })();

  if(!img || !url){
    return null;
  }

  if(onLoad && !isSpriteReady(img)){
    img.addEventListener('load', onLoad, { once: true });
  }

  if(useRegistry && typeof registry.primeImageLoad === 'function'){
    registry.primeImageLoad(img, url, 'mapPreviewBrick');
  } else if(!img.src){
    installImageWatch(img, url, 'mapPreviewBrick');
    img.src = url;
  }

  previewBrickSprite = img;
  return previewBrickSprite;
}

function drawMapPreviewBricks(boundsWidth, boundsHeight){
  if(!hasCurrentMapBricks()){
    clearMapPreviewBricksCanvas();
    return;
  }

  if(!mapPreview || !mapPreviewBricksCtx){
    return;
  }

  const rectWidth = boundsWidth ?? mapPreview.getBoundingClientRect().width;
  const rectHeight = boundsHeight ?? mapPreview.getBoundingClientRect().height;
  mapPreviewBricksCtx.clearRect(0, 0, rectWidth, rectHeight);

  const sprite = getPreviewBrickSprite(() => drawMapPreviewBricks(rectWidth, rectHeight));
  if(!sprite || !isSpriteReady(sprite)){
    return;
  }

  const bricks = Array.isArray(MAPS[mapIndex]?.bricks) ? MAPS[mapIndex].bricks : [];
  const scaleX = rectWidth / MAP_PREVIEW_BASE_WIDTH;
  const scaleY = rectHeight / MAP_PREVIEW_BASE_HEIGHT;
  const previewScale = Math.min(scaleX, scaleY);
  const offsetX = (rectWidth - MAP_PREVIEW_BASE_WIDTH * previewScale) / 2;
  const offsetY = (rectHeight - MAP_PREVIEW_BASE_HEIGHT * previewScale) / 2;

  for(const brick of bricks){
    const brickX = Number.isFinite(brick?.x) ? brick.x : 0;
    const brickY = Number.isFinite(brick?.y) ? brick.y : 0;
    const rotationDeg = Number.isFinite(brick?.rotate) ? brick.rotate : 0;
    const uniformScale = Number.isFinite(brick?.scale) ? brick.scale : 1;
    const scaleXLocal = Number.isFinite(brick?.scaleX) ? brick.scaleX : uniformScale;
    const scaleYLocal = Number.isFinite(brick?.scaleY) ? brick.scaleY : uniformScale;

    const baseWidth = sprite.naturalWidth || 0;
    const baseHeight = sprite.naturalHeight || 0;
    if(baseWidth <= 0 || baseHeight <= 0) continue;

    const normalizedRotation = ((rotationDeg % 360) + 360) % 360;
    const swapsDimensions = normalizedRotation % 180 !== 0;
    const drawnWidth = (swapsDimensions ? baseHeight : baseWidth) * Math.abs(scaleXLocal) * previewScale;
    const drawnHeight = (swapsDimensions ? baseWidth : baseHeight) * Math.abs(scaleYLocal) * previewScale;

    mapPreviewBricksCtx.save();
    mapPreviewBricksCtx.translate(
      offsetX + brickX * previewScale + drawnWidth / 2,
      offsetY + brickY * previewScale + drawnHeight / 2
    );
    mapPreviewBricksCtx.rotate(rotationDeg * Math.PI / 180);
    mapPreviewBricksCtx.scale(scaleXLocal * previewScale, scaleYLocal * previewScale);
    mapPreviewBricksCtx.drawImage(sprite, -baseWidth / 2, -baseHeight / 2, baseWidth, baseHeight);
    mapPreviewBricksCtx.restore();
  }
}

function resizeMapPreviewBricksCanvas(){
  if(!mapPreview) return;
  if(!hasCurrentMapBricks()){
    clearMapPreviewBricksCanvas();
    return;
  }

  const rect = mapPreview.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if(width <= 0 || height <= 0){
    return;
  }

  const canvas = ensureMapPreviewBricksCanvas();
  if(!canvas) return;

  mapPreviewBrickDpr = window.devicePixelRatio || 1;
  canvas.style.display = 'block';
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.width = Math.max(1, Math.round(width * mapPreviewBrickDpr));
  canvas.height = Math.max(1, Math.round(height * mapPreviewBrickDpr));
  if(mapPreviewBricksCtx){
    mapPreviewBricksCtx.setTransform(mapPreviewBrickDpr, 0, 0, mapPreviewBrickDpr, 0, 0);
  }

  drawMapPreviewBricks(width, height);
}

function updateMapPreview(){
  if(!mapPreview) return;
  const map = MAPS[mapIndex];
  const randomSelection = isRandomMap(map);
  mapPreview.classList.toggle('map-preview--random', Boolean(randomSelection));
  restorePreviewPlaneVisibility();
  ensurePreviewCanvasLayering();
  const hasBricks = hasCurrentMapBricks();
  mapPreview.style.backgroundImage = !hasBricks && map ? `url('${map.file}')` : '';
  if(map?.file && !hasBricks){
    const registry = window.paperWingsAssets || null;
    const useRegistry = !!registry?.getImage;
    const { img, url } = useRegistry
      ? registry.getImage(map.file, "mapPreview")
      : (() => {
          const normalized = typeof map.file === 'string' ? map.file.trim() : '';
          if (!normalized) return { img: null, url: '' };
          return { img: new Image(), url: normalized };
        })();

    if (!img || !url) {
      return;
    }

    const handleLoad = () => {
      if(map !== MAPS[mapIndex]) return;
      resizePreviewCanvas();
    };

    if (isSpriteReady(img)) {
      handleLoad();
      return;
    }

    img.addEventListener('load', handleLoad, { once: true });

    if (useRegistry && typeof registry.primeImageLoad === 'function') {
      registry.primeImageLoad(img, url, "mapPreview");
    } else {
      installImageWatch(img, url, "mapPreview");
      img.src = url;
    }
  }
  resizeMapPreviewBricksCanvas();
  refreshPreviewSimulationIfInitialized();
}

function updateMapNameDisplay(){
  if(!mapNameDisplay) return;
  const map = MAPS[mapIndex];
  mapNameDisplay.textContent = map ? map.name : '';
  if(map){
    mapNameDisplay.setAttribute('aria-label', `Selected map: ${map.name}`);
  }
}

function createPreviewCanvas(){
  if(!isSettingsActive) return;
  if(!mapPreviewContainer || previewCanvas) return;
  previewCanvas = document.createElement('canvas');
  previewCanvas.id = 'mapPreviewSimulation';
  previewCanvas.className = 'map-preview-simulation';
  logCanvasCreation(previewCanvas, 'mapPreviewSimulation');
  mapPreviewContainer.appendChild(previewCanvas);
  ensurePreviewCanvasLayering();
  previewCtx = previewCanvas.getContext('2d');
  previewCanvas.addEventListener('pointerdown', onPreviewPointerDown);
  window.addEventListener('pointermove', onPreviewPointerMove);
  window.addEventListener('pointerup', onPreviewPointerUp);
  window.addEventListener('resize', resizePreviewCanvas);
  resizePreviewCanvas();
}

function resizePreviewCanvas(){
  if(!isSettingsActive) return;
  if(!previewCanvas || !mapPreviewContainer) return;
  const rect = mapPreviewContainer.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const map = MAPS[mapIndex];
  if(isRandomMap(map)){
    console.assert(width > 0 && height > 0, 'resizePreviewCanvas dimensions', {
      width,
      height
    });
  }
  previewDpr = window.devicePixelRatio || 1;
  previewCanvas.style.width = `${width}px`;
  previewCanvas.style.height = `${height}px`;
  previewCanvas.width = Math.max(1, Math.round(width * previewDpr));
  previewCanvas.height = Math.max(1, Math.round(height * previewDpr));
  if(previewCtx){
    previewCtx.setTransform(previewDpr, 0, 0, previewDpr, 0, 0);
  }

  resizeMapPreviewBricksCanvas();
  rebuildPreviewBuildings();
}

function ensurePreviewCanvasLayering(){
  if(!mapPreviewContainer || !previewCanvas) return;
  const objectsLayer = mapPreviewContainer.querySelector('.cp-field-selector__objects');
  if(objectsLayer && previewCanvas.nextSibling !== objectsLayer){
    mapPreviewContainer.insertBefore(previewCanvas, objectsLayer);
  }
}

function restorePreviewPlaneVisibility(){
  if(!mapPreviewContainer) return;
  const planeObjects = mapPreviewContainer.querySelectorAll(
    '.cp-field-selector__object--green-plane, .cp-field-selector__object--blue-plane'
  );
  planeObjects.forEach(el => {
    el.style.visibility = 'visible';
    el.style.zIndex = '3';
  });
}

function createPreviewPlaneFromElement(el){
  if(!(el instanceof HTMLElement)) return null;
  const { width, height } = measurePreviewElement(el);
  const baseline = capturePreviewPlaneBaseline(el, width, height);
  const baseRotation = getPreviewPlaneBaseRotation(el);
  const headingDir = el.classList.contains('cp-field-selector__object--blue-plane') ? -1 : 1;
  resetPreviewPlaneElement(el, baseline, width, height);

  el.style.transformOrigin = '50% 50%';
  el.style.willChange = 'left, top, transform';

  return {
    el,
    x: baseline.x,
    y: baseline.y,
    width,
    height,
    vx: 0,
    vy: 0,
    flightTime: 0,
    baseRotation,
    angle: baseline.angle ?? 0,
    headingDir
  };
}

function updatePreviewPlaneHeading(plane, vx = plane?.vx, vy = plane?.vy){
  if(!plane) return;
  const headingDir = plane.headingDir ?? 1;
  plane.angle = Math.atan2(vy * headingDir, vx * headingDir) + Math.PI / 2;
}

function rebuildPreviewPlanes(){
  if(!isSettingsActive) return;
  if(!mapPreviewContainer) return;
  createPreviewCanvas();
  const planeElements = mapPreviewContainer.querySelectorAll(
    '.cp-field-selector__object--green-plane, .cp-field-selector__object--blue-plane'
  );
  previewPlanes = Array.from(planeElements)
    .map(createPreviewPlaneFromElement)
    .filter(Boolean);
  previewPlanes.forEach(syncPreviewPlaneVisual);
  rebuildPreviewBuildings();
}

function rebuildPreviewBuildings(){
  if(!isSettingsActive) return;
  previewBuildings = [];
  if(!mapPreviewContainer) return;
  const map = MAPS[mapIndex];
  const previewSource = Array.isArray(map?.previewBuildings) ? map.previewBuildings : [];
  const physicalBuildings = Array.isArray(map?.buildings) ? map.buildings : [];
  const hasSource = previewSource.length > 0 || physicalBuildings.length > 0;

  if(!map) return;

  if(!hasSource && map?.file?.startsWith('ui_controlpanel/')){
    getPreviewBuildingsForControlPanelMap(map)
      .then(buildings => {
        if(map !== MAPS[mapIndex]) return;
        if(Array.isArray(buildings) && buildings.length){
          rebuildPreviewBuildings();
        }
      })
      .catch(() => {});
    return;
  }

  if(!hasSource) return;

  const sourceBuildings = previewSource.length > 0
    ? previewSource
    : physicalBuildings;

  const rect = mapPreviewContainer.getBoundingClientRect();
  const scaleX = rect.width / MAP_PREVIEW_BASE_WIDTH;
  const scaleY = rect.height / MAP_PREVIEW_BASE_HEIGHT;

  if(!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0){
    return;
  }

  previewBuildings = sourceBuildings
    .map(b => ({
      x: b.x * scaleX,
      y: b.y * scaleY,
      width: b.width * scaleX,
      height: b.height * scaleY
    }))
    .filter(b => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height));
}

function measurePreviewElement(el){
  return {
    width: el.offsetWidth || parseFloat(getComputedStyle(el).width) || 0,
    height: el.offsetHeight || parseFloat(getComputedStyle(el).height) || 0
  };
}

function getPreviewPlaneBaseRotation(el){
  if(!(el instanceof HTMLElement)) return 0;
  return 0;
}

function capturePreviewPlaneBaseline(el, width, height){
  if(previewPlaneBaselines.has(el)){
    return previewPlaneBaselines.get(el);
  }

  const baseline = {
    x: (el.offsetLeft ?? 0) + (width ?? 0) / 2,
    y: (el.offsetTop ?? 0) + (height ?? 0) / 2,
    angle: 0
  };
  previewPlaneBaselines.set(el, baseline);
  return baseline;
}

function resetPreviewPlaneElement(el, baseline = null, width, height){
  const { width: measuredWidth, height: measuredHeight } = measurePreviewElement(el);
  const size = { width: width ?? measuredWidth, height: height ?? measuredHeight };
  const resolvedBaseline = baseline ?? capturePreviewPlaneBaseline(el, size.width, size.height);

  const left = resolvedBaseline.x - size.width / 2;
  const top = resolvedBaseline.y - size.height / 2;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const baseRotation = getPreviewPlaneBaseRotation(el);
  const rotation = (resolvedBaseline.angle ?? 0) + baseRotation;
  el.style.transform = `rotate(${rotation}rad)`;
}

function getPreviewPointerPosition(e){
  if(!mapPreviewContainer) return { x: 0, y: 0 };
  const rect = mapPreviewContainer.getBoundingClientRect();
  const touch = e.touches?.[0] ?? e.changedTouches?.[0];
  const clientX = touch?.clientX ?? e.clientX;
  const clientY = touch?.clientY ?? e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function findPreviewPlaneAt(x, y){
  let closest = null;
  let minDist = Infinity;
  for(const plane of previewPlanes){
    const radius = Math.max(plane.width, plane.height) / 2 + PREVIEW_PLANE_TOUCH_RADIUS;
    const dist = Math.hypot(plane.x - x, plane.y - y);
    if(dist <= radius && dist < minDist){
      closest = plane;
      minDist = dist;
    }
  }
  return closest;
}

function onPreviewPointerDown(e){
  if(!mapPreviewContainer) return;
  const { x, y } = getPreviewPointerPosition(e);
  const plane = findPreviewPlaneAt(x, y);
  if(!plane) return;
  e.preventDefault();
  previewHandle.active = true;
  previewHandle.baseX = x;
  previewHandle.baseY = y;
  previewHandle.shakyX = x;
  previewHandle.shakyY = y;
  previewHandle.offsetX = 0;
  previewHandle.offsetY = 0;
  previewHandle.plane = plane;
  previewHandle.origAngle = plane.angle;
  previewOscillationAngle = 0;
  previewOscillationDir = 1;
}

function onPreviewPointerMove(e){
  if(!previewHandle.active) return;
  const { x, y } = getPreviewPointerPosition(e);
  previewHandle.baseX = x;
  previewHandle.baseY = y;
}

function onPreviewPointerUp(e){
  if(!previewHandle.active || !previewHandle.plane) return;
  const plane = previewHandle.plane;
  let dx = previewHandle.shakyX - plane.x;
  let dy = previewHandle.shakyY - plane.y;
  let dragDistance = Math.hypot(dx, dy);

  if(dragDistance < PREVIEW_CELL_SIZE){
    plane.angle = previewHandle.origAngle;
    cleanupPreviewHandle();
    return;
  }

  if(dragDistance > PREVIEW_MAX_DRAG_DISTANCE){
    dx *= PREVIEW_MAX_DRAG_DISTANCE / dragDistance;
    dy *= PREVIEW_MAX_DRAG_DISTANCE / dragDistance;
    dragDistance = PREVIEW_MAX_DRAG_DISTANCE;
  }

  const dragAngle = Math.atan2(dy, dx);
  const previewFlightDistancePx = settingsFlightRangeCells * PREVIEW_CELL_SIZE * PREVIEW_FLIGHT_DISTANCE_SCALE;
  const previewFlightDurationSec = PREVIEW_FLIGHT_DURATION_SEC * PREVIEW_FLIGHT_DURATION_SCALE;
  const speedPxPerSec = previewFlightDistancePx / previewFlightDurationSec;
  const scale = dragDistance / PREVIEW_MAX_DRAG_DISTANCE;

  plane.vx = -Math.cos(dragAngle) * scale * speedPxPerSec;
  plane.vy = -Math.sin(dragAngle) * scale * speedPxPerSec;
  plane.flightTime = previewFlightDurationSec;
  updatePreviewPlaneHeading(plane);

  cleanupPreviewHandle();
}

function cleanupPreviewHandle(){
  previewHandle.active = false;
  previewHandle.plane = null;
  previewArrow = null;
}

function syncPreviewPlaneVisual(plane){
  const left = plane.x - plane.width / 2;
  const top = plane.y - plane.height / 2;
  plane.el.style.left = `${left}px`;
  plane.el.style.top = `${top}px`;
  const rotation = (Number.isFinite(plane.angle) ? plane.angle : 0) + (plane.baseRotation ?? 0);
  plane.el.style.transform = `rotate(${rotation}rad)`;
}

function updatePreviewHandle(delta){
  if(!previewHandle.active || !previewHandle.plane) return;
  const plane = previewHandle.plane;
  const dx = previewHandle.baseX - plane.x;
  const dy = previewHandle.baseY - plane.y;
  const dist = Math.hypot(dx, dy);
  const clampedDist = Math.min(dist, PREVIEW_MAX_DRAG_DISTANCE);
  const maxAngleDeg = settingsAimingAmplitude * 5;
  const maxAngleRad = maxAngleDeg * Math.PI / 180;

  previewOscillationAngle += PREVIEW_OSCILLATION_SPEED * delta * previewOscillationDir;
  if(previewOscillationDir > 0 && previewOscillationAngle > maxAngleRad){
    previewOscillationAngle = maxAngleRad;
    previewOscillationDir = -1;
  } else if(previewOscillationDir < 0 && previewOscillationAngle < -maxAngleRad){
    previewOscillationAngle = -maxAngleRad;
    previewOscillationDir = 1;
  }

  const baseAngle = Math.atan2(dy, dx);
  const angle = baseAngle + previewOscillationAngle;

  previewHandle.shakyX = plane.x + clampedDist * Math.cos(angle);
  previewHandle.shakyY = plane.y + clampedDist * Math.sin(angle);
  previewHandle.offsetX = previewHandle.shakyX - previewHandle.baseX;
  previewHandle.offsetY = previewHandle.shakyY - previewHandle.baseY;

  let vdx = previewHandle.shakyX - plane.x;
  let vdy = previewHandle.shakyY - plane.y;
  let vdist = Math.hypot(vdx, vdy);
  if(vdist > PREVIEW_MAX_DRAG_DISTANCE){
    vdx *= PREVIEW_MAX_DRAG_DISTANCE / vdist;
    vdy *= PREVIEW_MAX_DRAG_DISTANCE / vdist;
    vdist = PREVIEW_MAX_DRAG_DISTANCE;
  }

  if(vdist > PREVIEW_DRAG_ROTATION_THRESHOLD){
    updatePreviewPlaneHeading(plane, -vdx, -vdy);
  } else {
    plane.angle = previewHandle.origAngle;
  }

  previewArrow = {
    startX: plane.x,
    startY: plane.y,
    endX: plane.x + vdx,
    endY: plane.y + vdy,
    alpha: Math.min(vdist / PREVIEW_MAX_DRAG_DISTANCE, 1) * 0.6
  };
}

function updatePreviewBounds(plane){
  if(!mapPreviewContainer) return;
  const dpr = previewDpr || window.devicePixelRatio || 1;
  const boundsWidth = previewCanvas ? previewCanvas.width / dpr : mapPreviewContainer.clientWidth;
  const boundsHeight = previewCanvas ? previewCanvas.height / dpr : mapPreviewContainer.clientHeight;
  const map = MAPS[mapIndex];
  if(isRandomMap(map)){
    console.assert(boundsWidth > 0 && boundsHeight > 0, 'updatePreviewBounds dimensions', {
      boundsWidth,
      boundsHeight
    });
  }
  const radius = Math.max(plane.width, plane.height) / 2;

  if(plane.x - radius < 0){
    plane.x = radius;
    plane.vx = Math.abs(plane.vx);
  } else if(plane.x + radius > boundsWidth){
    plane.x = boundsWidth - radius;
    plane.vx = -Math.abs(plane.vx);
  }

  if(plane.y - radius < 0){
    plane.y = radius;
    plane.vy = Math.abs(plane.vy);
  } else if(plane.y + radius > boundsHeight){
    plane.y = boundsHeight - radius;
    plane.vy = -Math.abs(plane.vy);
  }
}

function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

function planePreviewBuildingCollision(plane, building){
  const radius = Math.max(plane.width, plane.height) / 2;
  let collided = false;

  for(let i = 0; i < 2; i++){
    const closestX = clamp(plane.x, building.x - building.width / 2, building.x + building.width / 2);
    const closestY = clamp(plane.y, building.y - building.height / 2, building.y + building.height / 2);
    const dx = plane.x - closestX;
    const dy = plane.y - closestY;
    const dist2 = dx * dx + dy * dy;

    if(dist2 >= radius * radius) break;

    collided = true;

    let nx = 0;
    let ny = 0;

    if(dx !== 0 || dy !== 0){
      const dist = Math.sqrt(dist2);
      nx = dx / dist;
      ny = dy / dist;
    } else {
      const penLeft = Math.abs(plane.x - (building.x - building.width / 2));
      const penRight = Math.abs((building.x + building.width / 2) - plane.x);
      const penTop = Math.abs(plane.y - (building.y - building.height / 2));
      const penBottom = Math.abs((building.y + building.height / 2) - plane.y);

      const minPen = Math.min(penLeft, penRight, penTop, penBottom);
      if(minPen === penLeft){ nx = -1; ny = 0; }
      else if(minPen === penRight){ nx = 1; ny = 0; }
      else if(minPen === penTop){ nx = 0; ny = -1; }
      else { nx = 0; ny = 1; }
    }

    const dot = plane.vx * nx + plane.vy * ny;
    plane.vx = plane.vx - 2 * dot * nx;
    plane.vy = plane.vy - 2 * dot * ny;

    const EPS = 0.5;
    plane.x = closestX + nx * (radius + EPS);
    plane.y = closestY + ny * (radius + EPS);
  }

  return collided;
}

function resolvePreviewCollisions(){
  for(let i = 0; i < previewPlanes.length; i++){
    for(let j = i + 1; j < previewPlanes.length; j++){
      const a = previewPlanes[i];
      const b = previewPlanes[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const minDist = (Math.max(a.width, a.height) + Math.max(b.width, b.height)) / 2;

      if(dist < minDist){
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        a.x -= nx * (overlap / 2);
        a.y -= ny * (overlap / 2);
        b.x += nx * (overlap / 2);
        b.y += ny * (overlap / 2);

        const rvx = a.vx - b.vx;
        const rvy = a.vy - b.vy;
        const relVelAlongNormal = rvx * nx + rvy * ny;
        if(relVelAlongNormal < 0){
          const impulse = -(1 + 1) * relVelAlongNormal / 2;
          const impulseX = impulse * nx;
          const impulseY = impulse * ny;
          a.vx += impulseX;
          a.vy += impulseY;
          b.vx -= impulseX;
          b.vy -= impulseY;
        }
      }
    }
  }
}

function updatePreviewPhysics(delta){
  if(!Number.isFinite(delta)) return;
  for(const plane of previewPlanes){
    if(plane.flightTime > 0){
      plane.flightTime = Math.max(0, plane.flightTime - delta);
      if(plane.flightTime === 0){
        plane.vx = 0;
        plane.vy = 0;
      }
    }

    plane.x += plane.vx * delta;
    plane.y += plane.vy * delta;
    updatePreviewBounds(plane);

    for(const building of previewBuildings){
      planePreviewBuildingCollision(plane, building);
    }

    if(Math.hypot(plane.vx, plane.vy) > 0.01){
      updatePreviewPlaneHeading(plane);
    }
  }

  resolvePreviewCollisions();
  previewPlanes.forEach(syncPreviewPlaneVisual);
}

function drawPreviewArrow(){
  if(!previewCtx || !previewCanvas){
    return;
  }

  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);

  if(!previewArrow){
    return;
  }

  const { startX, startY, endX, endY, alpha } = previewArrow;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.hypot(dx, dy);
  if(length < 1){
    return;
  }

  const ux = dx / length;
  const uy = dy / length;
  const head = Math.min(10, length * 0.3);

  previewCtx.save();
  previewCtx.globalAlpha = alpha;
  previewCtx.lineWidth = 2;
  previewCtx.lineCap = 'round';
  previewCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  previewCtx.beginPath();
  previewCtx.moveTo(startX, startY);
  previewCtx.lineTo(endX, endY);
  previewCtx.stroke();

  previewCtx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  previewCtx.beginPath();
  previewCtx.moveTo(endX, endY);
  previewCtx.lineTo(endX - ux * head + uy * head * 0.6, endY - uy * head - ux * head * 0.6);
  previewCtx.lineTo(endX - ux * head - uy * head * 0.6, endY - uy * head + ux * head * 0.6);
  previewCtx.closePath();
  previewCtx.fill();
  previewCtx.restore();
}

function tickPreview(timestamp){
  if(!previewCtx || !isSettingsActive){
    previewAnimationId = null;
    previewLastTimestamp = 0;
    return;
  }

  const delta = previewLastTimestamp ? (timestamp - previewLastTimestamp) / 1000 : 0;
  previewLastTimestamp = timestamp;

  updatePreviewHandle(delta);
  updatePreviewPhysics(delta);
  drawPreviewArrow();

  previewAnimationId = requestAnimationFrame(tickPreview);
}

function setupPreviewSimulation(){
  if(!isSettingsActive) return;
  if(!mapPreviewContainer) return;
  if(!previewCanvas){
    createPreviewCanvas();
  }
  rebuildPreviewPlanes();
  if(!previewAnimationId && isSettingsActive){
    previewAnimationId = requestAnimationFrame(tickPreview);
  }
}

  function resetSettingsToDefaults(){
    settingsFlightRangeCells = DEFAULT_SETTINGS.rangeCells;
    syncRangeStepFromValue(settingsFlightRangeCells);
    settingsAimingAmplitude = DEFAULT_SETTINGS.aimingAmplitude;
    addAA = DEFAULT_SETTINGS.addAA;
    sharpEdges = DEFAULT_SETTINGS.sharpEdges;
    addCargo = DEFAULT_SETTINGS.addCargo;
    mapIndex = DEFAULT_SETTINGS.mapIndex;

    updateRangeFlame();
    updateRangeDisplay();
  updateAmplitudeDisplay();
  updateAmplitudeIndicator();
  updateMapPreview();
  updateMapNameDisplay();
  setTumblerState(addsAABtn, addAA);
  setTumblerState(addsNailsBtn, sharpEdges);
  setTumblerState(addsCargoBtn, addCargo);
  syncToggleInput(addAAToggle, addAA);
  syncToggleInput(sharpEdgesToggle, sharpEdges);
  saveSettings();
}

function setupRepeatButton(btn, cb){
  if(!btn) return;
  let timeoutId = null;
  let intervalId = null;
  const start = () => {
    cb();
    timeoutId = setTimeout(() => {
      intervalId = setInterval(cb, 150);
    }, 400);
  };
  const stop = () => {
    clearTimeout(timeoutId);
    clearInterval(intervalId);
  };
  btn.addEventListener('pointerdown', start);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('pointercancel', stop);
}

function setTumblerState(btn, isOn){
  if(!btn) return;
  const state = isOn ? 'cp_button_on' : 'cp_button_off';
  btn.style.backgroundImage = `url('ui_controlpanel/${state}.png')`;
  btn.setAttribute('aria-pressed', String(isOn));
}

function syncToggleInput(input, value){
  if(input){
    input.checked = value;
  }
}

if(addAAToggle){
  addAAToggle.checked = addAA;
  addAAToggle.addEventListener('change', e => {
    addAA = e.target.checked;
    setTumblerState(addsAABtn, addAA);
    saveSettings();
  });
}

if(sharpEdgesToggle){
  sharpEdgesToggle.checked = sharpEdges;
  sharpEdgesToggle.addEventListener('change', e => {
    sharpEdges = e.target.checked;
    setTumblerState(addsNailsBtn, sharpEdges);
    saveSettings();
  });
}

if(addsNailsBtn){
  setTumblerState(addsNailsBtn, sharpEdges);
  addsNailsBtn.addEventListener('click', () => {
    sharpEdges = !sharpEdges;
    setTumblerState(addsNailsBtn, sharpEdges);
    syncToggleInput(sharpEdgesToggle, sharpEdges);
    saveSettings();
  });
}

if(addsAABtn){
  setTumblerState(addsAABtn, addAA);
  addsAABtn.addEventListener('click', () => {
    addAA = !addAA;
    setTumblerState(addsAABtn, addAA);
    syncToggleInput(addAAToggle, addAA);
    saveSettings();
  });
}

if(addsCargoBtn){
  setTumblerState(addsCargoBtn, addCargo);
  addsCargoBtn.addEventListener('click', () => {
    addCargo = !addCargo;
    setTumblerState(addsCargoBtn, addCargo);
    saveSettings();
  });
}

const hasMapButtons = mapPrevBtn && mapNextBtn;
if(hasMapButtons){
  updateMapPreview();
  updateMapNameDisplay();

  const changeMap = delta => {
    const targetIndex = (mapIndex + delta + MAPS.length) % MAPS.length;
    mapIndex = sanitizeMapIndex(targetIndex, { excludeIndex: mapIndex, allowRandom: true });
    startPreviewSimulation();
    updateMapPreview();
    updateMapNameDisplay();
    saveSettings();
  };

  mapPrevBtn.addEventListener('click', () => changeMap(-1));
  mapNextBtn.addEventListener('click', () => changeMap(1));
} else {
  updateMapPreview();
}

  setupRepeatButton(rangeMinusBtn, () => changeRangeStep(-1, { commitImmediately: true }));
  setupRepeatButton(rangePlusBtn, () => changeRangeStep(1, { commitImmediately: true }));
  const ensuredRangeTrack = ensureRangeDisplayTrack();
  if(rangeDisplayViewport && ensuredRangeTrack){
    rangeDisplayViewport.addEventListener('pointerdown', handleRangePointerDown);
    rangeDisplayViewport.addEventListener('pointermove', handleRangePointerMove);
    rangeDisplayViewport.addEventListener('pointerup', handleRangePointerEnd);
    rangeDisplayViewport.addEventListener('pointercancel', handleRangePointerEnd);
  }
  setupRepeatButton(amplitudeMinusBtn, () => {
  if(settingsAimingAmplitude > MIN_AMPLITUDE){
    settingsAimingAmplitude--;
    updateAmplitudeDisplay();
    updateAmplitudeIndicator();
    saveSettings();
  }
});
setupRepeatButton(amplitudePlusBtn, () => {
  if(settingsAimingAmplitude < MAX_AMPLITUDE){
    settingsAimingAmplitude++;
    updateAmplitudeDisplay();
    updateAmplitudeIndicator();
    saveSettings();
  }
});

function goToMainMenu(event){
  if(isTestHarnessPage && window.paperWingsHarness?.showMainView){
    event.preventDefault();
    window.paperWingsHarness.showMainView({ updateHash: true, focus: 'advancedButton' });
    return;
  }
  if(window.paperWingsApp?.showMenuLayer){
    event.preventDefault();
    window.paperWingsApp.showMenuLayer();
    return;
  }
  window.location.href = 'index.html';
}

if(resetBtn){
  resetBtn.addEventListener('click', resetSettingsToDefaults);
}

if(exitBtn){
  exitBtn.addEventListener('click', goToMainMenu);
}

function handleSettingsLayerShow(){
  isSettingsActive = true;
  syncAccuracyCrackWatcher();
  startPreviewSimulation();
  startPreviewAnimationIfNeeded();
}

function handleSettingsLayerHide(){
  isSettingsActive = false;
  if(accuracyCrackWatcher){
    accuracyCrackWatcher.stop();
  }
  stopPreviewAnimation();
}

function cleanupRenderers(){
  handleSettingsLayerHide();
}

window.addEventListener('pagehide', cleanupRenderers);
window.addEventListener('beforeunload', cleanupRenderers);

  updateRangeDisplay();
  updateRangeFlame();
updateAmplitudeDisplay();
updateAmplitudeIndicator();

window.paperWingsSettings = {
  onShow: handleSettingsLayerShow,
  onHide: handleSettingsLayerHide
};
})();
