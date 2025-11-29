const MIN_FLIGHT_RANGE_CELLS = 5;
const MAX_FLIGHT_RANGE_CELLS = 30;
const MIN_AMPLITUDE = 0;
const MAX_AMPLITUDE = 20;

const MAP_PREVIEW_BASE_WIDTH = 360;
const MAP_PREVIEW_BASE_HEIGHT = 640;

const MAPS = [
  { name: 'Clear Sky', file: 'map 1 - clear sky 3.png', buildings: [] },
  {
    name: '5 Bricks',
    file: 'map 2 - 5 bricks.png',
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
    file: 'map 3 diagonals.png',
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
    previewBuildings: [
      { x: 108, y: 6, width: 126, height: 6 },
      { x: 84, y: 11, width: 174, height: 6 },
      { x: 66, y: 17, width: 204, height: 6 },
      { x: 48, y: 23, width: 234, height: 6 },
      { x: 36, y: 29, width: 258, height: 6 },
      { x: 24, y: 34, width: 276, height: 6 },
      { x: 18, y: 40, width: 288, height: 6 },
      { x: 0, y: 46, width: 312, height: 6 },
      { x: 0, y: 51, width: 318, height: 6 },
      { x: 0, y: 57, width: 324, height: 6 },
      { x: 0, y: 63, width: 330, height: 6 },
      { x: 0, y: 69, width: 336, height: 11 },
      { x: 0, y: 80, width: 114, height: 6 },
      { x: 216, y: 80, width: 126, height: 6 },
      { x: 0, y: 86, width: 90, height: 6 },
      { x: 222, y: 86, width: 120, height: 6 },
      { x: 0, y: 91, width: 78, height: 6 },
      { x: 228, y: 91, width: 120, height: 6 },
      { x: 0, y: 97, width: 66, height: 6 },
      { x: 234, y: 97, width: 114, height: 6 },
      { x: 0, y: 103, width: 54, height: 6 },
      { x: 240, y: 103, width: 108, height: 6 },
      { x: 0, y: 109, width: 42, height: 6 },
      { x: 246, y: 109, width: 108, height: 6 },
      { x: 0, y: 114, width: 36, height: 6 },
      { x: 0, y: 120, width: 24, height: 6 },
      { x: 252, y: 114, width: 102, height: 11 },
      { x: 0, y: 126, width: 12, height: 6 },
      { x: 258, y: 126, width: 96, height: 74 },
      { x: 252, y: 200, width: 102, height: 6 },
      { x: 246, y: 206, width: 102, height: 6 },
      { x: 240, y: 211, width: 108, height: 6 },
      { x: 234, y: 217, width: 108, height: 6 },
      { x: 228, y: 223, width: 114, height: 6 },
      { x: 222, y: 229, width: 114, height: 6 },
      { x: 216, y: 234, width: 114, height: 6 },
      { x: 210, y: 240, width: 114, height: 6 },
      { x: 204, y: 246, width: 114, height: 6 },
      { x: 198, y: 251, width: 114, height: 6 },
      { x: 192, y: 257, width: 114, height: 6 },
      { x: 186, y: 263, width: 114, height: 6 },
      { x: 180, y: 269, width: 114, height: 6 },
      { x: 174, y: 274, width: 114, height: 6 },
      { x: 168, y: 280, width: 114, height: 6 },
      { x: 162, y: 286, width: 114, height: 6 },
      { x: 156, y: 291, width: 114, height: 6 },
      { x: 150, y: 297, width: 114, height: 6 },
      { x: 144, y: 303, width: 114, height: 6 },
      { x: 138, y: 309, width: 114, height: 6 },
      { x: 138, y: 314, width: 108, height: 6 },
      { x: 132, y: 320, width: 108, height: 6 },
      { x: 126, y: 326, width: 108, height: 6 },
      { x: 126, y: 331, width: 102, height: 6 },
      { x: 126, y: 337, width: 96, height: 6 },
      { x: 120, y: 343, width: 96, height: 11 },
      { x: 120, y: 354, width: 90, height: 6 },
      { x: 114, y: 360, width: 96, height: 6 },
      { x: 114, y: 366, width: 90, height: 109 },
      { x: 114, y: 531, width: 90, height: 86 }
    ]
  }
];

const DEFAULT_SETTINGS = {
  flightRangeCells: 15,
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

class JetFlameRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.baseWidth = options.baseWidth ?? 46;
    this.baseHeight = options.baseHeight ?? 14;
    this.scale = 1;
    this.displayWidth = this.baseWidth;
    this.displayHeight = this.baseHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.elapsed = 0;
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
    this.displayHeight = this.baseHeight * (0.8 + 0.2 * this.scale);
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.style.width = `${this.displayWidth}px`;
    this.canvas.style.height = `${this.displayHeight}px`;
    this.canvas.width = Math.max(1, Math.round(this.displayWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.displayHeight * this.dpr));
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

  tick(timestamp) {
    if (!this.running) return;

    const dt = this.lastTimestamp ? (timestamp - this.lastTimestamp) / 1000 : 0;
    this.lastTimestamp = timestamp;
    this.elapsed += dt;
    this.draw();

    requestAnimationFrame(this._tick);
  }

  drawFlameBody(ctx) {
    const w = this.displayWidth;
    const h = this.displayHeight;
    const baseX = w;
    const clampX = (value) => Math.max(0, Math.min(w, value));
    const verticalSway = Math.sin(this.elapsed * 1.4) * h * 0.08;
    const lean = Math.sin(this.elapsed * 0.8) * w * 0.04;
    const mid = h * 0.5 + verticalSway;
    const pulse = 1 + Math.sin(this.elapsed * 2.2) * 0.06;
    const baseLength = w * 0.9;
    const baseHeight = h * 0.65 * pulse;

    const drawLayer = (lengthScale, thicknessScale, color, alpha = 1) => {
      const length = baseLength * lengthScale;
      const thickness = baseHeight * thicknessScale;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(baseX, mid);
      ctx.bezierCurveTo(
        clampX(baseX - length * 0.3 + lean),
        mid - thickness * 0.55 + verticalSway * 0.35,
        clampX(baseX - length * 0.75),
        mid - thickness,
        clampX(baseX - length),
        mid
      );
      ctx.bezierCurveTo(
        clampX(baseX - length * 0.75),
        mid + thickness,
        clampX(baseX - length * 0.3 + lean),
        mid + thickness * 0.55 + verticalSway * 0.35,
        clampX(baseX + lean),
        mid
      );
      ctx.fillStyle = color;
      ctx.fill();
      ctx.restore();
    };

    ctx.save();
    drawLayer(1.05, 0.78, '#ffa64d', 0.8);
    drawLayer(0.86, 0.62, '#ff7d3e', 0.95);
    drawLayer(0.64, 0.48, '#ffe066', 1);
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    this.drawFlameBody(ctx);
  }
}

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

let flightRangeCells = getIntSetting('settings.flightRangeCells', 15);
let aimingAmplitude  = parseFloat(getStoredItem('settings.aimingAmplitude'));
if(Number.isNaN(aimingAmplitude)) aimingAmplitude = 10 / 5;
let addAA = getStoredItem('settings.addAA') === 'true';
let sharpEdges = getStoredItem('settings.sharpEdges') === 'true';
let addCargo = getStoredItem('settings.addCargo') === 'true';
let mapIndex = getIntSetting('settings.mapIndex', 0);
if(mapIndex < 0 || mapIndex >= MAPS.length) mapIndex = 0;

const flightRangeMinusBtn =
  document.getElementById('instance_range_left') ??
  document.getElementById('flightRangeMinus');
const flightRangePlusBtn =
  document.getElementById('instance_range_right') ??
  document.getElementById('flightRangePlus');
const amplitudeMinusBtn =
  document.getElementById('instance_accuracy_left') ??
  document.getElementById('amplitudeMinus');
const amplitudePlusBtn =
  document.getElementById('instance_accuracy_right') ??
  document.getElementById('amplitudePlus');
const addAAToggle = document.getElementById('addAAToggle');
const sharpEdgesToggle = document.getElementById('sharpEdgesToggle');
const addsNailsBtn = document.getElementById('instance_adds_tumbler1_nails');
const addsAABtn = document.getElementById('instance_adds_tumbler2_aa');
const addsCargoBtn = document.getElementById('instance_adds_tumbler3_cargo');
const backBtn = document.getElementById('backBtn');
const resetBtn = document.getElementById('instance_reset');
const exitBtn = document.getElementById('instance_exit');
const mapPrevBtn = document.getElementById('instance_field_left');
const mapNextBtn = document.getElementById('instance_field_right');
const mapNameDisplay = document.getElementById('frame_field_2_counter');
const mapPreviewContainer = document.getElementById('frame_field_1_visual');
const mapPreview = document.getElementById('mapPreview');
const menuFlameCanvas = document.getElementById('menuFlame');
const flameTrailCanvas = document.getElementById('flameTrail');
const flameOptions = { baseWidth: 46, baseHeight: 14 };
const menuFlameRenderer = menuFlameCanvas instanceof HTMLCanvasElement ? new JetFlameRenderer(menuFlameCanvas, flameOptions) : null;
const flameTrailRenderer = flameTrailCanvas instanceof HTMLCanvasElement ? new JetFlameRenderer(flameTrailCanvas, flameOptions) : null;
const isTestHarnessPage = document.body.classList.contains('test-harness');

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
const previewPlaneBaselines = new WeakMap();
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

function updateFlightRangeDisplay(){
  const el = document.getElementById('flightRangeDisplay');
  if(el) el.textContent = `${flightRangeCells}`;
}

function updateFlightRangeFlame(){
  const minScale = 0.8;
  const maxScale = 1.6;
  const t = (flightRangeCells - MIN_FLIGHT_RANGE_CELLS) /
            (MAX_FLIGHT_RANGE_CELLS - MIN_FLIGHT_RANGE_CELLS);
  const ratio = minScale + t * (maxScale - minScale);

  if(menuFlameRenderer){
    menuFlameRenderer.setScale(ratio);
  }

  if(flameTrailRenderer){
    flameTrailRenderer.setScale(ratio);
  }
}

function updateAmplitudeDisplay(){
  const disp = document.getElementById('amplitudeAngleDisplay');
  if(disp){
    const maxAngle = aimingAmplitude * 5;
    disp.textContent = `${maxAngle.toFixed(0)}°`;
  }
}

function updateAmplitudeIndicator(){
  const amplitudeHost =
    document.getElementById('frame_accuracy_1_visual') ??
    document.querySelector('.cp-aiming-accuracy') ??
    document.getElementById('amplitudeIndicator');

  if(amplitudeHost){
    const maxAngle = aimingAmplitude * 5;
    amplitudeHost.style.setProperty('--amp', `${maxAngle}deg`);
  }
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
  const pendulumEl = document.querySelector('#frame_accuracy_1_visual .pendulum');
  const overlay = document.getElementById('accuracyCrackOverlay');
  if(!pendulumEl || !overlay){
    return;
  }

  const TARGET_AMPLITUDE = 20;
  const EXTREME_THRESHOLD = 99.5;
  const RESET_THRESHOLD = 90;
  const EPSILON = 0.001;

  let leftIndex = 0;
  let rightIndex = 0;
  let lockedSide = null;

  const appendCrack = (side) => {
    if(side === 'left' && leftIndex < LEFT_CRACK_STEPS.length){
      overlay.appendChild(createCrackImage(LEFT_CRACK_STEPS[leftIndex++]));
    } else if(side === 'right' && rightIndex < RIGHT_CRACK_STEPS.length){
      overlay.appendChild(createCrackImage(RIGHT_CRACK_STEPS[rightIndex++]));
    }
  };

  const tick = () => {
    if(aimingAmplitude < TARGET_AMPLITUDE - EPSILON){
      lockedSide = null;
      requestAnimationFrame(tick);
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

    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function saveSettings(){
  setStoredItem('settings.flightRangeCells', flightRangeCells);
  setStoredItem('settings.aimingAmplitude', aimingAmplitude);
  setStoredItem('settings.addAA', addAA);
  setStoredItem('settings.sharpEdges', sharpEdges);
  setStoredItem('settings.addCargo', addCargo);
  setStoredItem('settings.mapIndex', mapIndex);
}

function updateMapPreview(){
  if(!mapPreview) return;
  const map = MAPS[mapIndex];
  const isRandomMap = map?.file === 'ui_controlpanel/cp_de_maprandom.png';
  mapPreview.classList.toggle('map-preview--random', Boolean(isRandomMap));
  mapPreview.style.backgroundImage = map ? `url('${map.file}')` : '';
  setupPreviewSimulation();
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
  if(!mapPreviewContainer || previewCanvas) return;
  previewCanvas = document.createElement('canvas');
  previewCanvas.id = 'mapPreviewSimulation';
  previewCanvas.className = 'map-preview-simulation';
  mapPreviewContainer.appendChild(previewCanvas);
  previewCtx = previewCanvas.getContext('2d');
  previewCanvas.addEventListener('pointerdown', onPreviewPointerDown);
  window.addEventListener('pointermove', onPreviewPointerMove);
  window.addEventListener('pointerup', onPreviewPointerUp);
  window.addEventListener('resize', resizePreviewCanvas);
  resizePreviewCanvas();
}

function resizePreviewCanvas(){
  if(!previewCanvas || !mapPreviewContainer) return;
  const rect = mapPreviewContainer.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  previewDpr = window.devicePixelRatio || 1;
  previewCanvas.style.width = `${width}px`;
  previewCanvas.style.height = `${height}px`;
  previewCanvas.width = Math.max(1, Math.round(width * previewDpr));
  previewCanvas.height = Math.max(1, Math.round(height * previewDpr));
  if(previewCtx){
    previewCtx.setTransform(previewDpr, 0, 0, previewDpr, 0, 0);
  }

  rebuildPreviewBuildings();
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
  previewBuildings = [];
  if(!mapPreviewContainer) return;
  const map = MAPS[mapIndex];
  const isRandomMap = map?.file === 'ui_controlpanel/cp_de_maprandom.png';
  const previewSource = Array.isArray(map?.previewBuildings) ? map.previewBuildings : [];
  const physicalBuildings = Array.isArray(map?.buildings) ? map.buildings : [];
  const hasSource = previewSource.length > 0 || physicalBuildings.length > 0 || isRandomMap;

  if(!map || !hasSource) return;

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
  const previewFlightDistancePx = flightRangeCells * PREVIEW_CELL_SIZE * PREVIEW_FLIGHT_DISTANCE_SCALE;
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
  const maxAngleDeg = aimingAmplitude * 5;
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
  if(!previewCtx){
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
  if(!mapPreviewContainer) return;
  if(!previewCanvas){
    createPreviewCanvas();
  }
  rebuildPreviewPlanes();
  if(!previewAnimationId){
    previewAnimationId = requestAnimationFrame(tickPreview);
  }
}

function resetSettingsToDefaults(){
  flightRangeCells = DEFAULT_SETTINGS.flightRangeCells;
  aimingAmplitude = DEFAULT_SETTINGS.aimingAmplitude;
  addAA = DEFAULT_SETTINGS.addAA;
  sharpEdges = DEFAULT_SETTINGS.sharpEdges;
  addCargo = DEFAULT_SETTINGS.addCargo;
  mapIndex = DEFAULT_SETTINGS.mapIndex;

  updateFlightRangeFlame();
  updateFlightRangeDisplay();
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
    mapIndex = (mapIndex + delta + MAPS.length) % MAPS.length;
    updateMapPreview();
    updateMapNameDisplay();
    saveSettings();
  };

  mapPrevBtn.addEventListener('click', () => changeMap(-1));
  mapNextBtn.addEventListener('click', () => changeMap(1));
} else {
  updateMapPreview();
}

setupRepeatButton(flightRangeMinusBtn, () => {
  if(flightRangeCells > MIN_FLIGHT_RANGE_CELLS){
    flightRangeCells--;
    updateFlightRangeFlame();
    updateFlightRangeDisplay();
    saveSettings();
  }
});
setupRepeatButton(flightRangePlusBtn, () => {
  if(flightRangeCells < MAX_FLIGHT_RANGE_CELLS){
    flightRangeCells++;
    updateFlightRangeFlame();
    updateFlightRangeDisplay();
    saveSettings();
  }
});
setupRepeatButton(amplitudeMinusBtn, () => {
  if(aimingAmplitude > MIN_AMPLITUDE){
    aimingAmplitude--;
    updateAmplitudeDisplay();
    updateAmplitudeIndicator();
    saveSettings();
  }
});
setupRepeatButton(amplitudePlusBtn, () => {
  if(aimingAmplitude < MAX_AMPLITUDE){
    aimingAmplitude++;
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
  window.location.href = 'index.html';
}

if(backBtn){
  backBtn.addEventListener('click', goToMainMenu);
}

if(resetBtn){
  resetBtn.addEventListener('click', resetSettingsToDefaults);
}

if(exitBtn){
  exitBtn.addEventListener('click', goToMainMenu);
}

function cleanupRenderers(){
  if(menuFlameRenderer) menuFlameRenderer.stop();
}

window.addEventListener('pagehide', cleanupRenderers);
window.addEventListener('beforeunload', cleanupRenderers);

updateFlightRangeDisplay();
updateFlightRangeFlame();
updateAmplitudeDisplay();
updateAmplitudeIndicator();
setupAccuracyCrackWatcher();
