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
const RANGE_TAPE_IMAGE_WIDTH = 580;
const FIELD_DEBUG_BUILD = '2026-01-11-1106';
const RANGE_DIR_NEXT = 1;
const RANGE_DIR_PREV = -1;
const RANGE_VISUAL_SIGN = -1;
const MIN_AMPLITUDE = 0;
const MAX_AMPLITUDE = 20;
const ACCURACY_DISPLAY_VALUES = Array.from(
  { length: MAX_AMPLITUDE - MIN_AMPLITUDE + 1 },
  (_, index) => (index + MIN_AMPLITUDE) * 5
);
const ACCURACY_CELL_WIDTH = 58;
const ACCURACY_TAPE_IMAGE_WIDTH = 1276;
const FIELD_EXCLUSIVE_MODE = true;

const MAP_PREVIEW_BASE_WIDTH = 360;
const MAP_PREVIEW_BASE_HEIGHT = 640;
const MAP_PREVIEW_BRICK_SPRITE_PATH = 'ui_gamescreen/bricks/brick_1_default.png';
const MAP_PREVIEW_BRICK_SPRITE_PATHS = {
  brick_1_default: 'ui_gamescreen/bricks/brick_1_default.png',
  brick_4_diagonal: 'ui_gamescreen/bricks/brick4_diagonal copy.png'
};

const settingsLayer = document.getElementById('settingsLayer');
const settingsRoot = settingsLayer ?? document;
const selectInSettings = (selector) => settingsRoot.querySelector(selector);
const DEBUG_FIELD_AUDIT = false;
const DEBUG_FIELD_MARKER = false;
const FIELD_DEBUG_MARKER_QUERY_FLAG = 'field_debug_marker';

function isFieldDebugMarkerEnabled(){
  if(DEBUG_FIELD_MARKER) return true;
  if(typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has(FIELD_DEBUG_MARKER_QUERY_FLAG);
}

function isFieldAuditTarget(target){
  return target instanceof HTMLElement && Boolean(target.closest('.cp-field-selector'));
}

function getFieldAuditSelector(target){
  if(!(target instanceof HTMLElement)) return '';
  const id = target.id ? `#${target.id}` : '';
  const className = typeof target.className === 'string' && target.className.trim()
    ? `.${target.className.trim().split(/\s+/).join('.')}`
    : '';
  return `${target.tagName.toLowerCase()}${id}${className}`;
}

function logFieldAudit(action, target, value){
  if(!DEBUG_FIELD_AUDIT || !isFieldAuditTarget(target)) return;
  console.log(`[field audit] ${action}`, {
    target: getFieldAuditSelector(target),
    value,
    timestamp: new Date().toISOString(),
    stack: new Error().stack
  });
}

function addFieldAuditListener(target, eventName, handler, options){
  if(DEBUG_FIELD_AUDIT &&
    (eventName === 'click' || eventName.startsWith('pointer')) &&
    isFieldAuditTarget(target)){
    console.log('[field audit] listener', {
      event: eventName,
      handler: handler?.name || 'anonymous',
      target: getFieldAuditSelector(target),
      timestamp: new Date().toISOString(),
      stack: new Error().stack
    });
  }
  target.addEventListener(eventName, handler, options);
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


const CLEAR_SKY_VERTICAL_Y = [20,60,100,140,180,220,260,300,340,380,420,460,500,540,580];
const CLEAR_SKY_HORIZONTAL_X = [0,40,80,120,160,200,240,280,320];
const CLEAR_SKY_BRICKS = [
  ...CLEAR_SKY_VERTICAL_Y.map(y => ({ spriteName: "brick_1_default", x: 0, y, rotate: 0, scale: 1 })),
  ...CLEAR_SKY_VERTICAL_Y.map(y => ({ spriteName: "brick_1_default", x: 340, y, rotate: 0, scale: 1 })),
  ...CLEAR_SKY_HORIZONTAL_X.map(x => ({ spriteName: "brick_1_default", x, y: 0, rotate: -90, scale: -1 })),
  ...CLEAR_SKY_HORIZONTAL_X.map(x => ({ spriteName: "brick_1_default", x, y: 620, rotate: -90, scale: -1 }))
];
const BROKEN_X_BRICKS = [
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
const FIVE_BRICKS_BRICKS = [
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

const MAPS = [
  {
    id: 'clearSky',
    name: 'Clear Sky',
    tier: 'easy',
    sprites: CLEAR_SKY_BRICKS
  },
  {
    id: 'fiveBricks',
    name: 'fiveBricks',
    tier: 'easy',
    sprites: FIVE_BRICKS_BRICKS
  },
  {
    id: 'brokenX',
    name: 'brokenX',
    tier: 'easy',
    sprites: BROKEN_X_BRICKS
  }
];

const fieldOptions = MAPS.map((map, index) => ({
  id: index,
  label: map?.name ?? ''
}));

function getFieldLabel(fieldId){
  return fieldOptions.find(option => option.id === fieldId)?.label ?? '';
}

function isRandomMap(map){
  return map?.id === 'random';
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
let rangeTrackTransform = '';
let rangeTrackTransition = '';
let isRangeBumping = false;
let accuracyDisplayIdx = getAccuracyDisplayIndex(settingsAimingAmplitude);
let accuracyScrollPos = accuracyDisplayIdx;
let accuracyScrollRafId = null;
let accuracyTrackTransform = '';
let accuracyTrackTransition = '';
let isAccuracyBumping = false;
let fieldSelectorTransform = '';
let fieldSelectorTransition = '';
let pendulumHost = null;
let pendulumCurrent = null;
let pendulumTarget = null;
let pendulumRafId = null;
let pendulumLastTimestamp = 0;
const rangeTrackState = {
  get transform(){ return rangeTrackTransform; },
  set transform(value){ rangeTrackTransform = value; },
  get transition(){ return rangeTrackTransition; },
  set transition(value){ rangeTrackTransition = value; },
  apply: applyStoredRangeTrackStyles
};
const accuracyTrackState = {
  get transform(){ return accuracyTrackTransform; },
  set transform(value){ accuracyTrackTransform = value; },
  get transition(){ return accuracyTrackTransition; },
  set transition(value){ accuracyTrackTransition = value; },
  apply: applyStoredAccuracyTrackStyles
};
const fieldSelectorState = {
  get transform(){ return fieldSelectorTransform; },
  set transform(value){ fieldSelectorTransform = value; },
  get transition(){ return fieldSelectorTransition; },
  set transition(value){ fieldSelectorTransition = value; },
  apply: applyStoredFieldSelectorStyles
};

const getRangeDirFromDx = (dx) => (dx < 0 ? RANGE_DIR_NEXT : (dx > 0 ? RANGE_DIR_PREV : 0));
const getRangeDirFromDelta = (delta) => (delta > 0 ? RANGE_DIR_NEXT : (delta < 0 ? RANGE_DIR_PREV : 0));
const getRangeDirectionLabel = (dir) => (dir === RANGE_DIR_NEXT ? 'next' : (dir === RANGE_DIR_PREV ? 'prev' : null));
const EDGE_BUMP_PX = 12;
const EDGE_BUMP_OUT_MS = 110;
const EDGE_BUMP_BACK_MS = 150;

function clampRangeStep(step){
  return Math.min(RANGE_MAX_STEP, Math.max(0, step));
}

function clampAccuracyIndex(index){
  return Math.max(0, Math.min(ACCURACY_DISPLAY_VALUES.length - 1, index));
}

function getAccuracyDisplayIndex(amplitude){
  const clampedAmplitude = Math.min(MAX_AMPLITUDE, Math.max(MIN_AMPLITUDE, amplitude));
  return clampAccuracyIndex(Math.round(clampedAmplitude - MIN_AMPLITUDE));
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
const accuracyDisplayViewport = selectInSettings('#accuracyDisplayViewport');
let accuracyDisplayLayer = selectInSettings('#accuracyDisplayLayer');
let accuracyDisplayTrack = selectInSettings('#accuracyDisplayTrack');
let accuracyDisplayItem = selectInSettings('#accuracyDisplayItem');
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
const fieldRightBtn = selectInSettings('#instance_field_right');
const fieldModuleRoot = fieldRightBtn?.closest('.cp-field-selector') ||
  fieldRightBtn?.closest('.cp-controlpanel__module') ||
  fieldRightBtn?.parentElement;
if(settingsRoot instanceof HTMLElement && fieldModuleRoot instanceof HTMLElement &&
  !settingsRoot.contains(fieldModuleRoot)){
  throw new Error('FIELD module root outside settings container');
}
if(!(fieldModuleRoot instanceof HTMLElement)){
  throw new Error('FIELD module root missing for #instance_field_right');
}
const fieldLeftInstance = selectInSettings('#instance_field_left');
if(!(fieldLeftInstance instanceof HTMLElement) || !fieldModuleRoot.contains(fieldLeftInstance)){
  throw new Error('FIELD module missing #instance_field_left');
}
if(!(fieldRightBtn instanceof HTMLElement) || !fieldModuleRoot.contains(fieldRightBtn)){
  throw new Error('FIELD module missing #instance_field_right');
}
const mapNameDisplay = selectInSettings('.cp-field-selector');
const mapNameDisplayBaseLabel =
  mapNameDisplay?.getAttribute('aria-label') ??
  'Selected map';
const fieldSelectorRoot = selectInSettings('#cp_field_selector_root');
if(!(fieldSelectorRoot instanceof HTMLElement)){
  throw new Error('FIELD selector missing #cp_field_selector_root');
}
if(!fieldModuleRoot.contains(fieldSelectorRoot)){
  fieldModuleRoot.appendChild(fieldSelectorRoot);
}
if(!(fieldModuleRoot.querySelector('#cp_field_selector_root') instanceof HTMLElement)){
  throw new Error('FIELD selector root not inside FIELD module');
}
const fieldSelectorLeft = 65;
const fieldSelectorTop = 257;
let hasLoggedFieldSelectorPlacement = false;
const logFieldSelectorPlacementOnce = () => {
  if(hasLoggedFieldSelectorPlacement) return;
  hasLoggedFieldSelectorPlacement = true;

  const fieldRootRect = fieldModuleRoot.getBoundingClientRect();
  const leftRect = fieldLeftInstance.getBoundingClientRect();
  const rightRect = fieldRightBtn.getBoundingClientRect();
  const selectorRect = fieldSelectorRoot.getBoundingClientRect();

  console.debug('FIELD selector placement debug', {
    fieldRootRect,
    leftRect,
    rightRect,
    selectorRect
  });

  const placements = [
    { label: '#instance_field_left', element: fieldLeftInstance },
    { label: '#instance_field_right', element: fieldRightBtn },
    { label: '#cp_field_selector_root', element: fieldSelectorRoot }
  ];

  placements.forEach(({ label, element }) => {
    const childRect = element.getBoundingClientRect();
    const localX = element === fieldSelectorRoot ? fieldSelectorLeft : element.offsetLeft;
    const localY = element === fieldSelectorRoot ? fieldSelectorTop : element.offsetTop;
    const expectedLeft = fieldRootRect.left + localX;
    const expectedTop = fieldRootRect.top + localY;
    const leftDiff = Math.abs(expectedLeft - childRect.left);
    const topDiff = Math.abs(expectedTop - childRect.top);

    if(leftDiff > 1 || topDiff > 1){
      console.warn('FIELD selector placement mismatch', {
        label,
        localX,
        localY,
        expectedLeft,
        expectedTop,
        actualLeft: childRect.left,
        actualTop: childRect.top,
        leftDiff,
        topDiff
      });
    }
  });
};
logFieldSelectorPlacementOnce();
const mapNameLabelPrev = fieldSelectorRoot?.querySelector('.fieldLabelSlot--prev');
const mapNameLabelCurrent = fieldSelectorRoot?.querySelector('.fieldLabelSlot--current');
const mapNameLabelNext = fieldSelectorRoot?.querySelector('.fieldLabelSlot--next');
let fieldLabelTrack = fieldSelectorRoot?.querySelector('.fieldLabelTrack');
let fieldLabelPrev = mapNameLabelPrev ?? null;
let fieldLabelCurrent = mapNameLabelCurrent ?? null;
let fieldLabelNext = mapNameLabelNext ?? null;
let currentIndex = mapIndex;
let nextIndex = mapIndex;
let isAnimating = false;
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
const previewBrickSprites = new Map();
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
let isAccuracyAnimating = false;
let isAccuracyDragging = false;
let accuracyDragStartX = 0;
let accuracyDragStartTime = 0;
let accuracyDragPointerId = null;
let accuracyDragLastDx = 0;
let pendingAccuracySteps = 0;
let pendingAccuracyDir = 0;
let accuracyGestureVelocity = 0;
let isFieldAnimating = false;
let isFieldDragging = false;
const isFieldInteractionActive = () => isFieldDragging || isFieldAnimating || isAnimating;
let fieldDragStartX = 0;
let fieldDragStartTime = 0;
let fieldDragPointerId = null;
let fieldDragLastDx = 0;
let fieldDragExclusiveToken = null;
let pendingFieldSteps = 0;
let pendingFieldDir = 0;
let fieldGestureVelocity = 0;
let fieldAnimationToken = 0;
let fieldAnimationPending = 0;
let fieldLabelTransitionTarget = null;
let fieldLabelTransitionHandler = null;
let fieldLabelFallbackTimeoutId = null;

const FIELD_LABEL_EASING = 'cubic-bezier(0.175, 0.885, 0.32, 1.275)';
const FIELD_LABEL_DURATION_MS = RANGE_BASE_STEP_MS;
const FIELD_LABEL_SLOT_WIDTH = 58;
const FIELD_LABEL_BASE_TRANSFORM = 'translateX(-50%)';

function resetFieldAnimationTracking(){
  fieldAnimationToken += 1;
  fieldAnimationPending = 0;
  isFieldAnimating = false;
  return fieldAnimationToken;
}

function cancelFieldLabelAnimation(){
  if(fieldLabelFallbackTimeoutId){
    clearTimeout(fieldLabelFallbackTimeoutId);
    fieldLabelFallbackTimeoutId = null;
  }
  if(fieldLabelTransitionTarget && fieldLabelTransitionHandler){
    fieldLabelTransitionTarget.removeEventListener('transitionend', fieldLabelTransitionHandler);
  }
  fieldLabelTransitionTarget = null;
  fieldLabelTransitionHandler = null;
}


function markFieldAnimationStart(token){
  if(token !== fieldAnimationToken) return;
  fieldAnimationPending += 1;
  isFieldAnimating = true;
}

function markFieldAnimationEnd(token){
  if(token !== fieldAnimationToken) return;
  fieldAnimationPending = Math.max(0, fieldAnimationPending - 1);
  if(fieldAnimationPending === 0){
    isFieldAnimating = false;
  }
}

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

function ensureRangeTape(track){
  let tape = track.querySelector('.range-tape');
  if(!(tape instanceof HTMLElement)){
    tape = document.createElement('div');
    tape.className = 'range-tape';
    track.insertBefore(tape, track.firstChild);
  }
  return tape;
}

function ensureAccuracyTape(track){
  let tape = track.querySelector('.accuracy-tape');
  if(!(tape instanceof HTMLElement)){
    tape = document.createElement('div');
    tape.className = 'accuracy-tape';
    track.insertBefore(tape, track.firstChild);
  }
  return tape;
}

function ensureFieldLabelTape(track){
  let tape = track.querySelector('.field-label-tape');
  if(!(tape instanceof HTMLElement)){
    tape = document.createElement('div');
    tape.className = 'field-label-tape';
    track.insertBefore(tape, track.firstChild);
  }
  return tape;
}

function syncRangeTrackStylesFrom(target){
  if(target instanceof HTMLElement){
    rangeTrackTransform = target.style.transform || '';
    rangeTrackTransition = target.style.transition || '';
  }
}

function syncAccuracyTrackStylesFrom(target){
  if(target instanceof HTMLElement){
    accuracyTrackTransform = target.style.transform || '';
    accuracyTrackTransition = target.style.transition || '';
  }
}

function syncFieldSelectorStylesFrom(target){
  if(target instanceof HTMLElement){
    fieldSelectorTransform = target.style.transform || '';
    fieldSelectorTransition = target.style.transition || '';
  }
}

function applyStoredRangeTrackStyles(target){
  if(!(target instanceof HTMLElement)) return;

  if(rangeTrackTransition){
    target.style.transition = rangeTrackTransition;
  } else {
    target.style.removeProperty('transition');
  }

  if(rangeTrackTransform){
    target.style.transform = rangeTrackTransform;
  } else {
    target.style.removeProperty('transform');
  }
}

function setRangeTrackStyles(target, styles){
  setSliderTrackStyles(target, rangeTrackState, styles);
}

function setAccuracyTrackStyles(target, styles){
  setSliderTrackStyles(target, accuracyTrackState, styles);
}

function setFieldSelectorStyles(target, styles){
  if(FIELD_EXCLUSIVE_MODE) return;
  logFieldAudit('setFieldSelectorStyles', target, { ...styles });
  setSliderTrackStyles(target, fieldSelectorState, styles);
  if(target instanceof HTMLElement && target.classList.contains('fieldLabelTrack')){
    updateFieldLabelTapePosition(target, styles?.transform ?? null);
  }
}

function applyStoredAccuracyTrackStyles(target){
  if(!(target instanceof HTMLElement)) return;

  if(accuracyTrackTransition){
    target.style.transition = accuracyTrackTransition;
  } else {
    target.style.removeProperty('transition');
  }

  if(accuracyTrackTransform){
    target.style.transform = accuracyTrackTransform;
  } else {
    target.style.removeProperty('transform');
  }
}

function setSliderTrackStyles(target, state, { transform, transition } = {}){
  if(!(target instanceof HTMLElement)) return;

  if(typeof transition === 'string'){
    state.transition = transition;
  } else if(transition === null){
    state.transition = '';
  }

  if(typeof transform === 'string'){
    state.transform = transform;
  } else if(transform === null){
    state.transform = '';
  }

  state.apply(target);
}

function applyStoredFieldSelectorStyles(target){
  if(!(target instanceof HTMLElement)) return;

  if(fieldSelectorTransition){
    target.style.transition = fieldSelectorTransition;
  } else {
    target.style.removeProperty('transition');
  }

  if(fieldSelectorTransform){
    target.style.transform = fieldSelectorTransform;
  } else {
    target.style.removeProperty('transform');
  }
}

function getFieldSelectorTransition(durationMs = FIELD_LABEL_DURATION_MS){
  return `transform ${durationMs}ms ${FIELD_LABEL_EASING}`;
}

function getFieldViewportWidth(){
  const viewport = getFieldDragViewport();
  return viewport?.clientWidth || 0;
}

function getFieldBaseOffsetPx(){
  return 0;
}

function getFieldOffsetTransform(offsetPx){
  const resolvedOffset = Number.isFinite(offsetPx) ? offsetPx : 0;
  if(resolvedOffset === 0){
    return FIELD_LABEL_BASE_TRANSFORM;
  }
  return `translateX(calc(-50% + ${resolvedOffset}px))`;
}

function getFieldBaseTransform(){
  return getFieldOffsetTransform(getFieldBaseOffsetPx());
}

function getFieldSelectorRoot(){
  if(!(fieldSelectorRoot instanceof HTMLElement)){
    throw new Error('FIELD selector missing #cp_field_selector_root');
  }
  return fieldSelectorRoot;
}

function getFieldDragViewport(){
  return getFieldSelectorRoot();
}

function getFieldMotionTrack(){
  assertFieldSelectorSingletons();
  const root = getFieldSelectorRoot();
  fieldLabelTrack = fieldLabelTrack ?? root.querySelector('.fieldLabelTrack');
  if(!(fieldLabelTrack instanceof HTMLElement)){
    throw new Error('FIELD selector missing .fieldLabelTrack');
  }
  syncFieldSelectorStylesFrom(fieldLabelTrack);
  ensureFieldLabelTape(fieldLabelTrack);
  updateFieldLabelTapePosition(fieldLabelTrack);
  return fieldLabelTrack;
}

function normalizeMapIndex(index){
  const totalMaps = Math.max(1, MAPS.length);
  return ((index % totalMaps) + totalMaps) % totalMaps;
}

function getFieldTrackOffsetFromTransform(transformValue){
  if(typeof transformValue !== 'string'){
    return 0;
  }
  const calcMatch = transformValue.match(/calc\(-50% \+ (-?\d+(?:\.\d+)?)px\)/);
  if(calcMatch){
    return Number(calcMatch[1]);
  }
  const pxMatch = transformValue.match(/translateX\((-?\d+(?:\.\d+)?)px\)/);
  if(pxMatch){
    return Number(pxMatch[1]);
  }
  return 0;
}

function updateFieldLabelTapePosition(track = null, transformValue = null){
  const targetTrack = track ?? getFieldMotionTrack();
  if(!(targetTrack instanceof HTMLElement)){
    return;
  }
  const tape = ensureFieldLabelTape(targetTrack);
  if(!(tape instanceof HTMLElement)){
    return;
  }
  const offsetPx = getFieldTrackOffsetFromTransform(transformValue ?? targetTrack.style.transform);
  tape.style.transform = `translateX(calc(-50% + ${offsetPx}px))`;
}

function updateRangeTapePosition(displayPosition = rangeScrollPos, track = null){
  const targetTrack = track ?? ensureRangeDisplayTrack();
  const tape = targetTrack?.querySelector('.range-tape');
  if(!Number.isFinite(displayPosition) || !(tape instanceof HTMLElement)){
    return;
  }

  tape.style.width = `${RANGE_TAPE_IMAGE_WIDTH}px`;

  const middleIndex = Math.floor(RANGE_DISPLAY_VALUES.length / 2);
  const offsetPx = (middleIndex - displayPosition) * RANGE_CELL_WIDTH;
  tape.style.transform = `translateX(calc(-50% + ${offsetPx}px))`;
}

function updateAccuracyTapePosition(displayPosition = accuracyDisplayIdx, track = null){
  const targetTrack = track ?? ensureAccuracyDisplayTrack();
  const tape = targetTrack?.querySelector('.accuracy-tape');
  if(!Number.isFinite(displayPosition) || !(tape instanceof HTMLElement)){
    return;
  }

  tape.style.width = `${ACCURACY_TAPE_IMAGE_WIDTH}px`;

  const middleIndex = Math.floor(ACCURACY_DISPLAY_VALUES.length / 2);
  const offsetPx = (middleIndex - displayPosition) * ACCURACY_CELL_WIDTH;
  tape.style.transform = `translateX(calc(-50% + ${offsetPx}px))`;
}

function ensureRangeDisplayTrack(){
  if(!rangeDisplayViewport){
    return null;
  }

  if(!(rangeDisplayLayer instanceof HTMLElement) || !rangeDisplayViewport.contains(rangeDisplayLayer)){
    const fallbackLayer =
      rangeDisplayViewport.querySelector('#rangeDisplayLayer') ??
      rangeDisplayViewport.querySelector('.range-display__layer');

    if(fallbackLayer instanceof HTMLElement){
      rangeDisplayLayer = fallbackLayer;
    } else {
      const createdLayer = document.createElement('div');
      createdLayer.className = 'range-display__layer';
      createdLayer.id = 'rangeDisplayLayer';
      rangeDisplayViewport.appendChild(createdLayer);

      rangeDisplayLayer = createdLayer;
    }
  }

  const trackIsConnected =
    rangeDisplayTrack instanceof HTMLElement &&
    rangeDisplayLayer instanceof HTMLElement &&
    rangeDisplayLayer.contains(rangeDisplayTrack);

  if(!trackIsConnected){
    rangeDisplayTrack = null;
  }

  if(rangeDisplayTrack instanceof HTMLElement){
    syncRangeTrackStylesFrom(rangeDisplayTrack);
    ensureRangeTape(rangeDisplayTrack);

    if(rangeDisplayItem instanceof HTMLElement && rangeDisplayItem.parentElement !== rangeDisplayTrack){
      rangeDisplayTrack.appendChild(rangeDisplayItem);
    }

    return rangeDisplayTrack;
  }

  if(!(rangeDisplayLayer instanceof HTMLElement)){
    return null;
  }

  const track = document.createElement('div');
  track.className = 'range-display__track';
  track.id = 'rangeDisplayTrack';

  ensureRangeTape(track);

  const existingItem =
    (rangeDisplayItem instanceof HTMLElement && rangeDisplayViewport.contains(rangeDisplayItem) ? rangeDisplayItem : null) ??
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
  updateRangeTapePosition(rangeDisplayIdx, track);
  applyStoredRangeTrackStyles(track);
  return rangeDisplayTrack;
}

function ensureAccuracyDisplayTrack(){
  if(!accuracyDisplayViewport){
    return null;
  }

  if(!(accuracyDisplayLayer instanceof HTMLElement) || !accuracyDisplayViewport.contains(accuracyDisplayLayer)){
    const fallbackLayer =
      accuracyDisplayViewport.querySelector('#accuracyDisplayLayer') ??
      accuracyDisplayViewport.querySelector('.accuracy-display__layer');

    if(fallbackLayer instanceof HTMLElement){
      accuracyDisplayLayer = fallbackLayer;
    } else {
      const createdLayer = document.createElement('div');
      createdLayer.className = 'accuracy-display__layer';
      createdLayer.id = 'accuracyDisplayLayer';
      accuracyDisplayViewport.appendChild(createdLayer);

      accuracyDisplayLayer = createdLayer;
    }
  }

  const trackIsConnected =
    accuracyDisplayTrack instanceof HTMLElement &&
    accuracyDisplayLayer instanceof HTMLElement &&
    accuracyDisplayLayer.contains(accuracyDisplayTrack);

  if(!trackIsConnected){
    accuracyDisplayTrack = null;
  }

  if(accuracyDisplayTrack instanceof HTMLElement){
    syncAccuracyTrackStylesFrom(accuracyDisplayTrack);
    ensureAccuracyTape(accuracyDisplayTrack);

    if(accuracyDisplayItem instanceof HTMLElement && accuracyDisplayItem.parentElement !== accuracyDisplayTrack){
      accuracyDisplayTrack.appendChild(accuracyDisplayItem);
    }

    applyStoredAccuracyTrackStyles(accuracyDisplayTrack);
    return accuracyDisplayTrack;
  }

  if(!(accuracyDisplayLayer instanceof HTMLElement)){
    return null;
  }

  const track = document.createElement('div');
  track.className = 'accuracy-display__track';
  track.id = 'accuracyDisplayTrack';

  ensureAccuracyTape(track);

  const existingItem =
    (accuracyDisplayItem instanceof HTMLElement && accuracyDisplayViewport.contains(accuracyDisplayItem) ? accuracyDisplayItem : null) ??
    accuracyDisplayViewport.querySelector('#accuracyDisplayItem') ??
    accuracyDisplayViewport.querySelector('.accuracy-display__item');

  if(existingItem instanceof HTMLElement){
    track.appendChild(existingItem);
    accuracyDisplayItem = existingItem;
  } else {
    const newItem = document.createElement('div');
    newItem.className = 'accuracy-display__item accuracy-display__item--current';
    newItem.id = 'accuracyDisplayItem';
    const value = selectInSettings('#amplitudeAngleDisplay');
    if(value){
      newItem.appendChild(value);
    }
    track.appendChild(newItem);
    accuracyDisplayItem = newItem;
  }

  accuracyDisplayLayer.appendChild(track);
  accuracyDisplayTrack = track;
  updateAccuracyTapePosition(accuracyDisplayIdx, track);
  applyStoredAccuracyTrackStyles(track);
  return accuracyDisplayTrack;
}

function setRangeDisplayValue(displayedCells){
  const el = selectInSettings('#rangeDisplay');
  const transformTarget = ensureRangeDisplayTrack();
  if(el){
    el.textContent = `${displayedCells}`;
    el.classList.add('range-display__value--current');
    el.classList.remove('range-display__value--incoming', 'range-display__value--outgoing');
  }
  applyStoredRangeTrackStyles(transformTarget);
}

function setAccuracyDisplayValue(displayedAngle){
  const el = selectInSettings('#amplitudeAngleDisplay');
  const transformTarget = ensureAccuracyDisplayTrack();
  if(el){
    el.textContent = `${displayedAngle.toFixed(0)}°`;
    el.classList.add('accuracy-display__value--current');
    el.classList.remove('accuracy-display__value--incoming', 'accuracy-display__value--outgoing');
  }
  applyStoredAccuracyTrackStyles(transformTarget);
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

function clearAccuracyScrollAnimation(){
  if(accuracyScrollRafId !== null){
    cancelAnimationFrame(accuracyScrollRafId);
    accuracyScrollRafId = null;
  }
}

function clearRangeOvershoot(){
  if(rangeOvershootTimer !== null){
    clearTimeout(rangeOvershootTimer);
    rangeOvershootTimer = null;
  }

  const transformTarget = ensureRangeDisplayTrack();
  setRangeTrackStyles(transformTarget, { transition: '' });
}

function applyRangeScrollVisual(scrollPos){
  const clampedPos = Math.min(
    RANGE_DISPLAY_VALUES.length - 1,
    Math.max(0, scrollPos)
  );
  const displayIdx = Math.round(clampedPos);
  const transformTarget = ensureRangeDisplayTrack();

  rangeScrollPos = clampedPos;

  updateRangeTapePosition(clampedPos, transformTarget);

  if(transformTarget){
    setRangeTrackStyles(transformTarget, { transition: 'none', transform: '' });
  }

  return displayIdx;
}

function applyAccuracyScrollVisual(scrollPos){
  const clampedPos = Math.min(
    ACCURACY_DISPLAY_VALUES.length - 1,
    Math.max(0, scrollPos)
  );
  const displayIdx = Math.round(clampedPos);
  const transformTarget = ensureAccuracyDisplayTrack();

  accuracyScrollPos = clampedPos;

  updateAccuracyTapePosition(clampedPos, transformTarget);

  if(transformTarget){
    setAccuracyTrackStyles(transformTarget, { transition: 'none', transform: '' });
  }

  return displayIdx;
}

function finishRangeScroll(targetIndex, dir, onFinish){
  rangeScrollRafId = null;
  const currentValue = RANGE_DISPLAY_VALUES[targetIndex];
  rangeScrollPos = targetIndex;
  rangeDisplayIdx = targetIndex;
  setRangeDisplayValue(currentValue);
  setRangePreviewValue(currentValue);
  updateRangeTapePosition(rangeDisplayIdx);

  const transformTarget = ensureRangeDisplayTrack();
  setRangeTrackStyles(transformTarget, { transition: 'none', transform: '' });
  isRangeAnimating = false;
  if(typeof onFinish === 'function'){
    onFinish();
  }
}

function finishAccuracyScroll(targetIndex, dir, onFinish){
  accuracyScrollRafId = null;
  const currentValue = ACCURACY_DISPLAY_VALUES[targetIndex];
  accuracyScrollPos = targetIndex;
  accuracyDisplayIdx = targetIndex;
  settingsAimingAmplitude = MIN_AMPLITUDE + targetIndex;
  setAccuracyDisplayValue(currentValue);
  updateAccuracyTapePosition(accuracyDisplayIdx);
  updateAmplitudeIndicator();

  const transformTarget = ensureAccuracyDisplayTrack();
  setAccuracyTrackStyles(transformTarget, { transition: 'none', transform: '' });
  isAccuracyAnimating = false;
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

function animateAccuracyDisplay(displayedAngle, direction, options = {}){
  const { onFinish, durationMs, targetIndex, gestureVelocity = 0 } = options;

  const currentValue = selectInSettings('#amplitudeAngleDisplay');
  const endIndex = Number.isFinite(targetIndex)
    ? Math.max(0, Math.min(ACCURACY_DISPLAY_VALUES.length - 1, targetIndex))
    : accuracyDisplayIdx;

  if(!currentValue || endIndex === accuracyDisplayIdx || !Number.isFinite(endIndex)){
    if(Number.isFinite(endIndex)){
      accuracyDisplayIdx = endIndex;
      accuracyScrollPos = endIndex;
    }
    setAccuracyDisplayValue(displayedAngle);
    if(typeof onFinish === 'function'){
      onFinish();
    }
    return;
  }

  clearAccuracyScrollAnimation();
  isAccuracyAnimating = true;

  const startPos = accuracyDisplayIdx;
  const endPos = endIndex;
  accuracyScrollPos = startPos;
  const totalSteps = Math.max(1, Math.abs(endPos - startPos));
  const fastScroll = totalSteps >= RANGE_FAST_SCROLL_THRESHOLD;
  const computedDuration = Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : getRangeStepDuration(totalSteps, { fastScroll, gestureVelocity }) * totalSteps;

  if(computedDuration === 0){
    const dir = direction === 'next' ? RANGE_DIR_NEXT : RANGE_DIR_PREV;
    finishAccuracyScroll(endIndex, dir, onFinish);
    return;
  }

  const runAnimation = (startTime, timestamp) => {
    const elapsed = timestamp - startTime;
    const t = Math.min(1, elapsed / computedDuration);
    const overshootStrength = 0.9 * Math.min(1, 1 / totalSteps);
    const eased = easeOutBack(t, overshootStrength);
    const nextPos = startPos + (endPos - startPos) * eased;
    applyAccuracyScrollVisual(nextPos);

    if(t < 1){
      accuracyScrollRafId = requestAnimationFrame((now) => runAnimation(startTime, now));
    } else {
      const dir = direction === 'next' ? RANGE_DIR_NEXT : RANGE_DIR_PREV;
      finishAccuracyScroll(endIndex, dir, onFinish);
    }
  };

  accuracyScrollRafId = requestAnimationFrame((timestamp) => runAnimation(timestamp, timestamp));
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
  setRangePreviewValue(displayedCells);
  updateRangeTapePosition(rangeDisplayIdx);
  if(typeof options.onFinish === 'function'){
    options.onFinish();
  }
}

function updateAccuracyDisplay(stepOverride, options = {}){
  const displayIdx = Number.isFinite(stepOverride)
    ? clampAccuracyIndex(stepOverride)
    : accuracyDisplayIdx;
  const displayedAngle = ACCURACY_DISPLAY_VALUES[displayIdx];

  if(options.animateDirection){
    animateAccuracyDisplay(displayedAngle, options.animateDirection, options);
    return;
  }

  accuracyDisplayIdx = displayIdx;
  accuracyScrollPos = displayIdx;
  settingsAimingAmplitude = MIN_AMPLITUDE + displayIdx;
  setAccuracyDisplayValue(displayedAngle);
  updateAccuracyTapePosition(displayIdx);
  updateAmplitudeIndicator();
  if(typeof options.onFinish === 'function'){
    options.onFinish();
  }
}

function getSliderPeekOffset(viewport, direction){
  const viewportWidth = viewport?.clientWidth || 0;
  const peekOffset = Math.max(0, viewportWidth - RANGE_PEEK_PX);
  return direction === 'next' ? peekOffset : -peekOffset;
}

function getRangePeekOffset(direction){
  return getSliderPeekOffset(rangeDisplayViewport, direction);
}

function removeIncomingRangeValue(){
  const incomingContainer = ensureRangeDisplayTrack() ?? rangeDisplayLayer;
  if(!incomingContainer) return;
  const incoming = incomingContainer.querySelector('.range-display__value--incoming');
  if(incoming){
    incoming.remove();
  }
}

function removeIncomingAccuracyValue(){
  const incomingContainer = ensureAccuracyDisplayTrack() ?? accuracyDisplayLayer;
  if(!incomingContainer) return;
  const incoming = incomingContainer.querySelector('.accuracy-display__value--incoming');
  if(incoming){
    incoming.remove();
  }
}

function ensureFieldDragTracks(){
  const selectorTrack = getFieldMotionTrack();
  if(!(selectorTrack instanceof HTMLElement)){
    return null;
  }
  return selectorTrack;
}

function setFieldDragTrackStyles(target, styles){
  if(!(target instanceof HTMLElement)) return;
  const resolvedStyles = { ...styles };
  if(typeof resolvedStyles.transform === 'string'){
    const match = resolvedStyles.transform.match(/^translateX\((-?\d+(?:\.\d+)?)px?\)$/);
    if(match){
      const offset = Number(match[1]) + getFieldBaseOffsetPx();
      resolvedStyles.transform = getFieldOffsetTransform(offset);
    }
  }
  if(FIELD_EXCLUSIVE_MODE){
    if(fieldDragExclusiveToken === null) return;
    if(fieldDragExclusiveToken !== fieldControlActiveToken){
      if(fieldControlActiveToken === null){
        fieldDragExclusiveToken = startFieldExclusiveSession();
      } else {
        return;
      }
    }
    setFieldSelectorStylesAuthorized(fieldDragExclusiveToken, target, resolvedStyles);
    return;
  }
  setFieldSelectorStyles(target, resolvedStyles);
}

function ensureFieldLabelsForDrag(){
  const labelLayer = getFieldLabelLayer();
  if(!labelLayer){
    throw new Error('FIELD selector missing label layer');
  }
  if(!fieldLabelPrev){
    fieldLabelPrev = fieldLabelPrev ?? labelLayer.querySelector('.fieldLabelSlot--prev');
  }
  if(!fieldLabelCurrent){
    fieldLabelCurrent = fieldLabelCurrent ?? labelLayer.querySelector('.fieldLabelSlot--current');
  }
  if(!fieldLabelNext){
    fieldLabelNext = fieldLabelNext ?? labelLayer.querySelector('.fieldLabelSlot--next');
  }
  if(!fieldLabelPrev || !fieldLabelCurrent || !fieldLabelNext){
    throw new Error('FIELD selector missing label slots');
  }
  return true;
}

function syncFieldLabelSlots(index, token = null){
  if(FIELD_EXCLUSIVE_MODE){
    assertFieldControlToken(token, 'syncFieldLabelSlots');
  }
  if(!ensureFieldLabelsForDrag()) return;
  const resolvedIndex = normalizeMapIndex(index);
  const prevIndex = normalizeMapIndex(resolvedIndex - 1);
  const nextIndex = normalizeMapIndex(resolvedIndex + 1);
  const prevLabel = getFieldLabel(prevIndex);
  const currentLabel = getFieldLabel(resolvedIndex);
  const nextLabel = getFieldLabel(nextIndex);
  setFieldLabelTextAuthorized(token, fieldLabelPrev, prevLabel, 'syncFieldLabelSlots:prev');
  setFieldLabelTextAuthorized(token, fieldLabelCurrent, currentLabel, 'syncFieldLabelSlots:current');
  setFieldLabelTextAuthorized(token, fieldLabelNext, nextLabel, 'syncFieldLabelSlots:next');
}

function removeIncomingFieldValue(tokenOverride = null){
  if(!ensureFieldLabelsForDrag()) return;
  const track = getFieldLabelLayer();
  const incoming = track.querySelector('.fieldLabelSlot--incoming');
  if(incoming){
    incoming.remove();
  }
  const token = FIELD_EXCLUSIVE_MODE ? (tokenOverride ?? fieldDragExclusiveToken) : null;
  if(FIELD_EXCLUSIVE_MODE && token === null) return;
  syncFieldLabelSlots(currentIndex, token);
}

function prepareIncomingFieldValue(direction, steps = 1){
  if(!ensureFieldLabelsForDrag()) return null;
  if(direction !== 'next' && direction !== 'prev'){
    removeIncomingFieldValue();
    return null;
  }
  const stepCount = Math.max(1, Math.floor(Math.abs(steps)));
  const stepDelta = direction === 'next' ? 1 : -1;
  const targetIndex = normalizeMapIndex(currentIndex + stepDelta * (stepCount + 1));
  const targetLabel = getFieldLabel(targetIndex);
  const track = getFieldLabelLayer();

  let incoming = track.querySelector('.fieldLabelSlot--incoming');
  if(!incoming){
    incoming = document.createElement('div');
    incoming.className = 'fieldLabelSlot fieldLabelSlot--incoming';
  }

  incoming.textContent = targetLabel;
  incoming.dataset.direction = direction;
  incoming.dataset.steps = `${stepCount}`;
  incoming.style.transition = 'none';
  incoming.style.transform = 'translateX(0px)';

  const gapPx = Math.max(0, stepCount - 1) * FIELD_LABEL_SLOT_WIDTH;
  if(direction === 'prev'){
    incoming.style.marginLeft = '';
    incoming.style.marginRight = `${gapPx}px`;
    track.insertBefore(incoming, fieldLabelPrev);
  } else {
    incoming.style.marginLeft = `${gapPx}px`;
    incoming.style.marginRight = '';
    track.insertBefore(incoming, fieldLabelNext?.nextSibling ?? null);
  }

  return incoming;
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

function prepareIncomingAccuracyValue(direction){
  const incomingContainer = ensureAccuracyDisplayTrack() ?? accuracyDisplayLayer;
  if(!incomingContainer) return null;

  const targetIndex = direction === 'next' ? accuracyDisplayIdx + 1 : accuracyDisplayIdx - 1;

  if(targetIndex < 0 || targetIndex >= ACCURACY_DISPLAY_VALUES.length){
    removeIncomingAccuracyValue();
    return null;
  }

  let incoming = incomingContainer.querySelector('.accuracy-display__value--incoming');
  if(!incoming){
    incoming = document.createElement('span');
    incoming.className = 'accuracy-display__value accuracy-display__value--incoming';
    incomingContainer.appendChild(incoming);
  }

  incoming.textContent = `${ACCURACY_DISPLAY_VALUES[targetIndex]}°`;
  incoming.dataset.direction = direction;
  incoming.style.transition = 'none';

  return incoming;
}

function resetRangeDragVisual(animateReset){
  const transformTarget = ensureRangeDisplayTrack();
  if(!transformTarget) return;
  setRangeTrackStyles(transformTarget, {
    transition: '',
    transform: animateReset ? 'translateX(0)' : ''
  });
  updateRangeTapePosition(rangeDisplayIdx, transformTarget);

  removeIncomingRangeValue();
}

function resetAccuracyDragVisual(animateReset){
  const transformTarget = ensureAccuracyDisplayTrack();
  if(!transformTarget) return;
  setAccuracyTrackStyles(transformTarget, {
    transition: '',
    transform: animateReset ? 'translateX(0)' : ''
  });
  updateAccuracyTapePosition(accuracyDisplayIdx, transformTarget);

  removeIncomingAccuracyValue();
}

function resetFieldDragVisual(animateReset){
  const transformTarget = ensureFieldDragTracks();
  if(!transformTarget) return;
  setFieldDragTrackStyles(transformTarget, {
    transition: '',
    transform: getFieldBaseTransform()
  });

  removeIncomingFieldValue();
}

function playEdgeBump(direction, { ensureTrack, setTrackStyles, getIsBumping, setIsBumping }){
  if(direction !== 'next' && direction !== 'prev') return;
  if(getIsBumping()) return;
  const transformTarget = ensureTrack();
  if(!transformTarget) return;

  setIsBumping(true);

  const baseTransform = transformTarget.style.transform || '';
  const baseTransition = transformTarget.style.transition || '';
  const bumpOffset = direction === 'next' ? -EDGE_BUMP_PX * 3 : EDGE_BUMP_PX * 3;
  const bumpTransform = baseTransform
    ? `${baseTransform} translateX(${bumpOffset}px)`
    : `translateX(${bumpOffset}px)`;

  setTrackStyles(transformTarget, {
    transition: `transform ${EDGE_BUMP_OUT_MS}ms ease-out`,
    transform: bumpTransform
  });

  window.setTimeout(() => {
    setTrackStyles(transformTarget, {
      transition: `transform ${EDGE_BUMP_BACK_MS}ms ease-out`,
      transform: baseTransform
    });

    window.setTimeout(() => {
      setTrackStyles(transformTarget, {
        transition: baseTransition,
        transform: baseTransform
      });
      setIsBumping(false);
    }, EDGE_BUMP_BACK_MS);
  }, EDGE_BUMP_OUT_MS);
}

function playRangeEdgeBump(direction){
  playEdgeBump(direction, {
    ensureTrack: ensureRangeDisplayTrack,
    setTrackStyles: setRangeTrackStyles,
    getIsBumping: () => isRangeBumping,
    setIsBumping: (value) => { isRangeBumping = value; }
  });
}

function playAccuracyEdgeBump(direction){
  playEdgeBump(direction, {
    ensureTrack: ensureAccuracyDisplayTrack,
    setTrackStyles: setAccuracyTrackStyles,
    getIsBumping: () => isAccuracyBumping,
    setIsBumping: (value) => { isAccuracyBumping = value; }
  });
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

function getFieldStepDuration(totalSteps, { gestureVelocity = 0 } = {}){
  if(totalSteps <= 1){
    return FIELD_LABEL_DURATION_MS;
  }
  const fastScroll = totalSteps >= RANGE_FAST_SCROLL_THRESHOLD;
  return getRangeStepDuration(totalSteps, { fastScroll, gestureVelocity });
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

function clearAccuracyStepQueue(){
  pendingAccuracySteps = 0;
  pendingAccuracyDir = 0;
  accuracyGestureVelocity = 0;
}

function runAccuracyStepQueue(){
  if(pendingAccuracySteps <= 0){
    clearAccuracyStepQueue();
    return;
  }

  if(isAccuracyAnimating){
    return;
  }

  const delta = pendingAccuracyDir * pendingAccuracySteps;
  changeAccuracyStep(delta, {
    onFinish: clearAccuracyStepQueue,
    animate: true,
    gestureVelocity: accuracyGestureVelocity
  });
}

function queueAccuracySteps(steps, dir, gestureVelocity = 0){
  if(steps <= 0 || dir === 0){
    clearAccuracyStepQueue();
    return;
  }

  accuracyGestureVelocity = gestureVelocity;
  pendingAccuracySteps = Math.min(RANGE_DRAG_MAX_STEPS, steps);
  pendingAccuracyDir = dir;
  runAccuracyStepQueue();
}

function clearFieldStepQueue(){
  pendingFieldSteps = 0;
  pendingFieldDir = 0;
  fieldGestureVelocity = 0;
}

function runFieldStepQueue(){
  if(pendingFieldSteps <= 0){
    clearFieldStepQueue();
    return;
  }

  if(isFieldAnimating || isAnimating){
    return;
  }

  const delta = pendingFieldDir * pendingFieldSteps;
  changeFieldStep(delta, {
    onFinish: clearFieldStepQueue,
    animate: true,
    gestureVelocity: fieldGestureVelocity
  });
}

function queueFieldSteps(steps, dir, gestureVelocity = 0){
  if(steps <= 0 || dir === 0){
    clearFieldStepQueue();
    return;
  }

  fieldGestureVelocity = gestureVelocity;
  pendingFieldSteps = Math.min(RANGE_DRAG_MAX_STEPS, steps);
  pendingFieldDir = dir;
  runFieldStepQueue();
}

function getDragDistanceSteps(dx){
  const absDx = Math.abs(dx);
  const stepsByDistance = Math.floor(absDx / RANGE_DRAG_STEP_PX);
  return Math.min(RANGE_DRAG_MAX_STEPS, stepsByDistance);
}

function getDragMetrics(startX, currentX, startTime, eventTime){
  const dx = currentX - startX;
  const absDx = Math.abs(dx);
  const deltaTime = Math.max(eventTime - startTime, 1);
  const velocity = absDx / deltaTime;

  const stepsByDistance = getDragDistanceSteps(dx);
  const stepsByVelocity = Math.floor(
    Math.max(0, velocity - RANGE_DRAG_VELOCITY_START) * RANGE_DRAG_VELOCITY_MULT
  );
  const calculatedSteps = Math.max(stepsByDistance, stepsByVelocity);
  const steps = Math.min(RANGE_DRAG_MAX_STEPS, calculatedSteps);
  const dir = getRangeDirFromDx(dx);

  return { dx, absDx, velocity, steps, dir };
}

function createSliderDragHandlers(slider){
  const handlePointerDown = (event) => {
    if(slider.isAnimating() || !slider.viewport()) return;
    const transformTarget = slider.ensureTrack();
    if(!transformTarget) return;
    event.preventDefault();

    slider.clearStepQueue();

    const baseTransform = typeof slider.baseTransform === 'function'
      ? slider.baseTransform()
      : (slider.baseTransform ?? 'translateX(0)');
    slider.setTrackStyles(transformTarget, { transition: 'none', transform: baseTransform });

    slider.removeIncomingValue();

    slider.state.setDragging(true);
    slider.state.setPointerId(event.pointerId);
    slider.state.setStartX(event.clientX);
    slider.state.setStartTime(event.timeStamp);
    slider.state.setLastDx(0);

    slider.viewport().setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if(!slider.state.isDragging() || slider.isAnimating() || !slider.viewport()) return;
    event.preventDefault();

    const dx = event.clientX - slider.state.startX();
    slider.state.setLastDx(dx);
    const absDx = Math.abs(dx);

    const transformTarget = slider.ensureTrack();
    if(!transformTarget) return;

    const maxOffset = (slider.viewport().clientWidth || 0) * 0.55;
    const clampedDx = Math.max(-maxOffset, Math.min(maxOffset, dx));
    slider.setTrackStyles(transformTarget, { transform: `translateX(${clampedDx}px)` });
    if(typeof slider.updateTapePosition === 'function' && Number.isFinite(slider.cellWidth)){
      const baseIndex = typeof slider.getBaseIndex === 'function' ? slider.getBaseIndex() : slider.baseIndex;
      if(Number.isFinite(baseIndex)){
        const displayPosition = baseIndex - (clampedDx / slider.cellWidth);
        slider.updateTapePosition(displayPosition, transformTarget);
      }
    }

    const minPreviewDx = Number.isFinite(slider.previewMinDx)
      ? Math.max(0, slider.previewMinDx)
      : 0;
    if(absDx < minPreviewDx){
      slider.removeIncomingValue();
      return;
    }

    const direction = getRangeDirectionLabel(getRangeDirFromDx(clampedDx));
    const previewSteps = slider.previewUsesSteps
      ? (typeof slider.getPreviewSteps === 'function'
        ? slider.getPreviewSteps({
          dx,
          startX: slider.state.startX(),
          currentX: event.clientX,
          startTime: slider.state.startTime(),
          eventTime: event.timeStamp
        })
        : getDragMetrics(
          slider.state.startX(),
          event.clientX,
          slider.state.startTime(),
          event.timeStamp
        ).steps)
      : 1;
    const shouldPreview = direction && previewSteps > 0;
    const incoming = shouldPreview ? slider.prepareIncomingValue(direction, previewSteps) : null;

    if(incoming){
      const peekOffset = slider.getPeekOffset(direction);
      incoming.style.transform = `translateX(${peekOffset}px)`;
    } else {
      slider.removeIncomingValue();
    }
  };

  const handlePointerEnd = (event) => {
    if(!slider.state.isDragging()) return;

    if(slider.viewport() && slider.state.pointerId() !== null &&
       slider.viewport().hasPointerCapture(slider.state.pointerId())){
      slider.viewport().releasePointerCapture(slider.state.pointerId());
    }

    const { dx, absDx, velocity, steps, dir } = getDragMetrics(
      slider.state.startX(),
      event.clientX,
      slider.state.startTime(),
      event.timeStamp
    );

    slider.state.setDragging(false);
    slider.state.setPointerId(null);

    if(slider.isAnimating()){
      slider.resetDragVisual(false);
      return;
    }

    if(steps === 0 || dir === 0){
      slider.resetDragVisual(absDx > 0);
      return;
    }

    slider.resetDragVisual(false);
    slider.queueSteps(steps, dir, velocity);
  };

  return { handlePointerDown, handlePointerMove, handlePointerEnd };
}

const rangeDragHandlers = createSliderDragHandlers({
  viewport: () => rangeDisplayViewport,
  ensureTrack: ensureRangeDisplayTrack,
  setTrackStyles: setRangeTrackStyles,
  removeIncomingValue: removeIncomingRangeValue,
  prepareIncomingValue: prepareIncomingRangeValue,
  resetDragVisual: resetRangeDragVisual,
  queueSteps: queueRangeSteps,
  isAnimating: () => isRangeAnimating,
  clearStepQueue: clearRangeStepQueue,
  getBaseIndex: () => rangeDisplayIdx,
  cellWidth: RANGE_CELL_WIDTH,
  updateTapePosition: updateRangeTapePosition,
  getPeekOffset: (direction) => getSliderPeekOffset(rangeDisplayViewport, direction),
  state: {
    isDragging: () => isRangeDragging,
    setDragging: (value) => { isRangeDragging = value; },
    startX: () => rangeDragStartX,
    setStartX: (value) => { rangeDragStartX = value; },
    startTime: () => rangeDragStartTime,
    setStartTime: (value) => { rangeDragStartTime = value; },
    pointerId: () => rangeDragPointerId,
    setPointerId: (value) => { rangeDragPointerId = value; },
    lastDx: () => rangeDragLastDx,
    setLastDx: (value) => { rangeDragLastDx = value; }
  }
});

const accuracyDragHandlers = createSliderDragHandlers({
  viewport: () => accuracyDisplayViewport,
  ensureTrack: ensureAccuracyDisplayTrack,
  setTrackStyles: setAccuracyTrackStyles,
  removeIncomingValue: removeIncomingAccuracyValue,
  prepareIncomingValue: prepareIncomingAccuracyValue,
  resetDragVisual: resetAccuracyDragVisual,
  queueSteps: queueAccuracySteps,
  isAnimating: () => isAccuracyAnimating,
  clearStepQueue: clearAccuracyStepQueue,
  getBaseIndex: () => accuracyDisplayIdx,
  cellWidth: ACCURACY_CELL_WIDTH,
  updateTapePosition: updateAccuracyTapePosition,
  getPeekOffset: (direction) => getSliderPeekOffset(accuracyDisplayViewport, direction),
  state: {
    isDragging: () => isAccuracyDragging,
    setDragging: (value) => { isAccuracyDragging = value; },
    startX: () => accuracyDragStartX,
    setStartX: (value) => { accuracyDragStartX = value; },
    startTime: () => accuracyDragStartTime,
    setStartTime: (value) => { accuracyDragStartTime = value; },
    pointerId: () => accuracyDragPointerId,
    setPointerId: (value) => { accuracyDragPointerId = value; },
    lastDx: () => accuracyDragLastDx,
    setLastDx: (value) => { accuracyDragLastDx = value; }
  }
});

const fieldDragHandlers = createSliderDragHandlers({
  viewport: () => getFieldDragViewport(),
  ensureTrack: ensureFieldDragTracks,
  setTrackStyles: setFieldDragTrackStyles,
  removeIncomingValue: removeIncomingFieldValue,
  prepareIncomingValue: prepareIncomingFieldValue,
  resetDragVisual: resetFieldDragVisual,
  baseTransform: () => getFieldBaseTransform(),
  queueSteps: queueFieldSteps,
  isAnimating: () => isFieldAnimating || isAnimating,
  clearStepQueue: clearFieldStepQueue,
  previewUsesSteps: true,
  getPreviewSteps: ({ dx }) => getDragDistanceSteps(dx),
  getPeekOffset: (direction) => {
    const viewport = getFieldDragViewport();
    const peek = getSliderPeekOffset(viewport, direction);
    if(direction === 'prev') return -Math.abs(peek);
    if(direction === 'next') return 0;
    return -Math.abs(peek);
  },
  state: {
    isDragging: () => isFieldDragging,
    setDragging: (value) => { isFieldDragging = value; },
    startX: () => fieldDragStartX,
    setStartX: (value) => { fieldDragStartX = value; },
    startTime: () => fieldDragStartTime,
    setStartTime: (value) => { fieldDragStartTime = value; },
    pointerId: () => fieldDragPointerId,
    setPointerId: (value) => { fieldDragPointerId = value; },
    lastDx: () => fieldDragLastDx,
    setLastDx: (value) => { fieldDragLastDx = value; }
  }
});

function handleRangePointerDown(event){
  rangeDragHandlers.handlePointerDown(event);
}

function handleRangePointerMove(event){
  rangeDragHandlers.handlePointerMove(event);
}

function handleRangePointerEnd(event){
  rangeDragHandlers.handlePointerEnd(event);
}

function handleAccuracyPointerDown(event){
  accuracyDragHandlers.handlePointerDown(event);
}

function handleAccuracyPointerMove(event){
  accuracyDragHandlers.handlePointerMove(event);
}

function handleAccuracyPointerEnd(event){
  accuracyDragHandlers.handlePointerEnd(event);
}

function handleFieldPointerDown(event){
  if(FIELD_EXCLUSIVE_MODE){
    if(fieldDragExclusiveToken !== null){
      finalizeFieldExclusiveSession(fieldDragExclusiveToken);
      fieldDragExclusiveToken = null;
    }
    fieldDragExclusiveToken = startFieldExclusiveSession();
  }
  fieldDragHandlers.handlePointerDown(event);
  if(!isFieldDragging && FIELD_EXCLUSIVE_MODE){
    if(fieldDragExclusiveToken !== null){
      finalizeFieldExclusiveSession(fieldDragExclusiveToken);
      fieldDragExclusiveToken = null;
    }
  }
}

function handleFieldPointerMove(event){
  fieldDragHandlers.handlePointerMove(event);
}

function handleFieldPointerEnd(event){
  const isAnimatingNow = isFieldAnimating || isAnimating;
  const dragMetrics = isFieldDragging
    ? getDragMetrics(fieldDragStartX, event.clientX, fieldDragStartTime, event.timeStamp)
    : null;
  const willQueueSteps = !isAnimatingNow && dragMetrics &&
    dragMetrics.steps !== 0 && dragMetrics.dir !== 0;
  fieldDragHandlers.handlePointerEnd(event);
  if(pendingFieldSteps !== 0){
    if(FIELD_EXCLUSIVE_MODE && fieldDragExclusiveToken !== null){
      finalizeFieldExclusiveSession(fieldDragExclusiveToken);
      fieldDragExclusiveToken = null;
    }
    return;
  }
  if(FIELD_EXCLUSIVE_MODE && fieldDragExclusiveToken !== null){
    finalizeFieldExclusiveSession(fieldDragExclusiveToken);
    fieldDragExclusiveToken = null;
  }
}

function updateRangeFlame(value = rangeCommittedValue){
  const minScale = 0.78;
  const maxScale = 1.82;
  const t = (value - MIN_FLIGHT_RANGE_CELLS) /
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
  rangePreviewValue = value;
  settingsFlightRangeCells = value;
  updateRangeFlame(value);
  saveSettings();
}

function setRangePreviewValue(value, { updateVisual = true } = {}){
  const clamped = Math.min(MAX_FLIGHT_RANGE_CELLS, Math.max(MIN_FLIGHT_RANGE_CELLS, value));

  if(rangePreviewValue === clamped){
    return;
  }

  rangePreviewValue = clamped;

  if(updateVisual){
    updateRangeFlame(clamped);
  }
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

  const shouldPreviewImmediately = commitImmediately || !animate;

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
  setRangePreviewValue(RANGE_DISPLAY_VALUES[nextIndex], { updateVisual: shouldPreviewImmediately });

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

function changeAccuracyStep(delta, options = {}){
  if(isAccuracyAnimating) return;

  const {
    onFinish,
    animate = true,
    durationMs,
    gestureVelocity = 0,
    commitImmediately = false
  } = options;

  const currentIndex = accuracyDisplayIdx;
  const nextIndex = clampAccuracyIndex(currentIndex + delta);

  if(nextIndex === currentIndex){
    if(typeof onFinish === 'function'){
      onFinish();
    }
    return;
  }

  const displayedAngle = ACCURACY_DISPLAY_VALUES[nextIndex];
  const finish = () => {
    if(!commitImmediately){
      saveSettings();
    }
    if(typeof onFinish === 'function'){
      onFinish();
    }
  };

  const dir = getRangeDirFromDelta(delta);
  const animateDirection = getRangeDirectionLabel(dir);

  settingsAimingAmplitude = MIN_AMPLITUDE + nextIndex;
  updateAmplitudeIndicator();

  if(commitImmediately){
    saveSettings();
  }

  updateAccuracyDisplay(nextIndex, animate ? {
    animateDirection,
    onFinish: finish,
    durationMs,
    targetIndex: nextIndex,
    gestureVelocity
  } : { onFinish: finish });
}

function changeFieldStep(delta, options = {}){
  const {
    onFinish,
    animate = true,
    gestureVelocity = 0,
    fieldControlToken: providedToken = null
  } = options;
  const exclusiveToken = FIELD_EXCLUSIVE_MODE ? (providedToken ?? startFieldExclusiveSession()) : null;
  if(FIELD_EXCLUSIVE_MODE && providedToken !== null){
    assertFieldControlToken(providedToken, 'changeFieldStep');
  }
  if(isFieldAnimating || isAnimating){
    if(FIELD_EXCLUSIVE_MODE){
      normalizeFieldLabelsControlled({ cancelAnimation: true }, exclusiveToken);
    } else {
      normalizeFieldLabels({ cancelAnimation: true });
    }
    resetFieldAnimationTracking();
    cancelFieldLabelAnimation();
  }

  const totalMaps = Math.max(1, MAPS.length);
  const normalizedCurrent = ((currentIndex % totalMaps) + totalMaps) % totalMaps;
  const nextIndexLocal = ((normalizedCurrent + delta) % totalMaps + totalMaps) % totalMaps;

  if(nextIndexLocal === normalizedCurrent){
    if(typeof onFinish === 'function'){
      onFinish();
    }
    if(FIELD_EXCLUSIVE_MODE){
      finalizeFieldExclusiveSession(exclusiveToken);
    }
    return;
  }

  const direction = getRangeDirectionLabel(getRangeDirFromDelta(delta));
  const totalSteps = Math.max(1, Math.abs(delta));
  const stepDurationMs = getFieldStepDuration(totalSteps, { gestureVelocity });
  const durationMs = stepDurationMs * totalSteps;

  mapIndex = nextIndexLocal;
  nextIndex = nextIndexLocal;
  startPreviewSimulation();
  updateMapPreview();
  mapNameDisplay?.setAttribute(
    'aria-label',
    `${mapNameDisplayBaseLabel}: ${getFieldLabel(nextIndexLocal)}`
  );

  const animationToken = resetFieldAnimationTracking();
  if(animate && direction){
    animateFieldLabelChange(
      nextIndexLocal,
      direction,
      animationToken,
      { steps: totalSteps, stepDurationMs },
      exclusiveToken
    );
  } else {
    updateMapNameDisplayControlled({ index: nextIndexLocal, animationToken }, exclusiveToken);
    if(FIELD_EXCLUSIVE_MODE){
      finalizeFieldExclusiveSession(exclusiveToken);
    }
  }

  if(animate && direction){
    window.setTimeout(() => {
      saveSettings();
      if(typeof onFinish === 'function'){
        onFinish();
      }
    }, durationMs);
  } else {
    saveSettings();
    if(typeof onFinish === 'function'){
      onFinish();
    }
  }
}

function updateAmplitudeDisplay(){
  const displayIdx = getAccuracyDisplayIndex(settingsAimingAmplitude);
  const displayedAngle = ACCURACY_DISPLAY_VALUES[displayIdx];
  accuracyDisplayIdx = displayIdx;
  accuracyScrollPos = displayIdx;
  setAccuracyDisplayValue(displayedAngle);
  updateAccuracyTapePosition(displayIdx);
}

function startPendulumAnimation(){
  if(pendulumRafId !== null){
    return;
  }

  pendulumLastTimestamp = 0;
  pendulumRafId = requestAnimationFrame(stepPendulumAnimation);
}

function stopPendulumAnimation(){
  if(pendulumRafId !== null){
    cancelAnimationFrame(pendulumRafId);
    pendulumRafId = null;
  }
  pendulumLastTimestamp = 0;
}

function stepPendulumAnimation(timestamp){
  if(!isSettingsActive){
    stopPendulumAnimation();
    return;
  }

  if(!pendulumHost){
    pendulumRafId = requestAnimationFrame(stepPendulumAnimation);
    return;
  }

  const target = pendulumTarget ?? 0;
  if(pendulumCurrent === null){
    pendulumCurrent = target;
    pendulumHost.style.setProperty('--amp', `${target}deg`);
    pendulumRafId = requestAnimationFrame(stepPendulumAnimation);
    return;
  }

  const deltaMs = pendulumLastTimestamp ? (timestamp - pendulumLastTimestamp) : 0;
  pendulumLastTimestamp = timestamp;

  const diff = target - pendulumCurrent;
  if(Math.abs(diff) < 0.001){
    pendulumCurrent = target;
    pendulumHost.style.setProperty('--amp', `${pendulumCurrent}deg`);
    pendulumRafId = requestAnimationFrame(stepPendulumAnimation);
    return;
  }

  const baseTau = 170;
  const fastTau = 110;
  const tau = Math.abs(diff) > 40 ? fastTau : baseTau;
  const alpha = deltaMs > 0 ? (1 - Math.exp(-deltaMs / tau)) : 0.16;

  pendulumCurrent += diff * alpha;
  pendulumHost.style.setProperty('--amp', `${pendulumCurrent}deg`);

  pendulumRafId = requestAnimationFrame(stepPendulumAnimation);
}

function updateAmplitudeIndicator(){
  pendulumHost =
    selectInSettings('#frame_accuracy_1_visual') ??
    settingsRoot.querySelector('.cp-aiming-accuracy') ??
    selectInSettings('#amplitudeIndicator');

  if(pendulumHost){
    const maxAngle = settingsAimingAmplitude * 5;
    pendulumTarget = maxAngle;
    if(pendulumCurrent === null){
      pendulumCurrent = maxAngle;
      pendulumHost.style.setProperty('--amp', `${maxAngle}deg`);
    }
    startPendulumAnimation();
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
  if(window.paperWingsSettings?.setMapIndex){
    window.paperWingsSettings.setMapIndex(mapIndex, { persist: true });
  } else {
    setStoredItem('settings.mapIndex', mapIndex);
  }
  console.log('[settings] save', {
    flightRangeCells: settingsFlightRangeCells,
    aimingAmplitude: settingsAimingAmplitude,
    addAA,
    sharpEdges,
    addCargo,
    mapIndex
  });
}

function hasCurrentMapBricks(){
  const map = MAPS[mapIndex];
  const sprites = map?.sprites;
  return Array.isArray(sprites) && sprites.length > 0;
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

function getPreviewBrickSprite(spriteName = "brick_1_default"){
  const key = typeof spriteName === 'string' ? spriteName : "brick_1_default";
  const cached = previewBrickSprites.get(key);
  if(cached){
    return cached;
  }

  const path = MAP_PREVIEW_BRICK_SPRITE_PATHS[key] || MAP_PREVIEW_BRICK_SPRITE_PATH;
  const registry = window.paperWingsAssets || null;
  const useRegistry = !!registry?.getImage;
  const { img, url } = useRegistry
    ? registry.getImage(path, `mapPreviewBrick-${key}`)
    : (() => {
        const normalized = typeof path === 'string' ? path.trim() : '';
        if (!normalized) return { img: null, url: '' };
        return { img: new Image(), url: normalized };
      })();

  if(!img || !url){
    return null;
  }

  if(useRegistry && typeof registry.primeImageLoad === 'function'){
    registry.primeImageLoad(img, url, `mapPreviewBrick-${key}`);
  } else if(!img.src){
    installImageWatch(img, url, `mapPreviewBrick-${key}`);
    img.src = url;
  }

  previewBrickSprites.set(key, img);
  return img;
}

function isBrickItem(item){
  const id = item?.id;
  const spriteName = item?.spriteName;
  return (typeof id === 'string' && id.startsWith('brick'))
    || (typeof spriteName === 'string' && spriteName.startsWith('brick'));
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

  const sprites = Array.isArray(MAPS[mapIndex]?.sprites) ? MAPS[mapIndex].sprites : [];
  const previewBricks = sprites.filter(isBrickItem);
  const scaleX = rectWidth / MAP_PREVIEW_BASE_WIDTH;
  const scaleY = rectHeight / MAP_PREVIEW_BASE_HEIGHT;
  const previewScale = Math.min(scaleX, scaleY);
  const offsetX = (rectWidth - MAP_PREVIEW_BASE_WIDTH * previewScale) / 2;
  const offsetY = (rectHeight - MAP_PREVIEW_BASE_HEIGHT * previewScale) / 2;

  for(const brick of previewBricks){
    const spriteName = typeof brick?.spriteName === 'string' ? brick.spriteName : "brick_1_default";
    const sprite = getPreviewBrickSprite(spriteName);
    if(!sprite){
      continue;
    }
    if(!isSpriteReady(sprite)){
      sprite.addEventListener('load', () => drawMapPreviewBricks(rectWidth, rectHeight), { once: true });
      continue;
    }

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
  mapPreview.style.backgroundImage = '';
  resizeMapPreviewBricksCanvas();
  refreshPreviewSimulationIfInitialized();
}

function getFieldLabelLayer(){
  assertFieldSelectorSingletons();
  const root = getFieldSelectorRoot();
  const track = root.querySelector('.fieldLabelTrack');
  if(!(track instanceof HTMLElement)){
    throw new Error('FIELD selector missing .fieldLabelTrack');
  }
  return track;
}

let fieldControlToken = 0;
let fieldControlActiveToken = null;
let fieldControlObserver = null;

function startFieldExclusiveSession(){
  fieldControlToken += 1;
  fieldControlActiveToken = fieldControlToken;
  return fieldControlActiveToken;
}

function endFieldExclusiveSession(token){
  if(!FIELD_EXCLUSIVE_MODE) return;
  if(fieldControlActiveToken === null) return;
  if(token !== fieldControlActiveToken) return;
  fieldControlActiveToken = null;
}

function finalizeFieldExclusiveSession(token){
  if(!FIELD_EXCLUSIVE_MODE) return;
  if(fieldControlActiveToken === null) return;
  requestAnimationFrame(() => endFieldExclusiveSession(token));
}

function assertFieldControlToken(token, context){
  if(!FIELD_EXCLUSIVE_MODE) return;
  if(token !== fieldControlActiveToken){
    throw new Error(`FIELD exclusive mode violation: ${context}`);
  }
}

function setFieldSelectorStylesAuthorized(token, target, styles){
  if(!FIELD_EXCLUSIVE_MODE){
    setFieldSelectorStyles(target, styles);
    if(target instanceof HTMLElement && target.classList.contains('fieldLabelTrack')){
      updateFieldLabelTapePosition(target, styles?.transform ?? null);
    }
    return;
  }
  assertFieldControlToken(token, 'setFieldSelectorStyles');
  logFieldAudit('setFieldSelectorStyles', target, { ...styles });
  setSliderTrackStyles(target, fieldSelectorState, styles);
  if(target instanceof HTMLElement && target.classList.contains('fieldLabelTrack')){
    updateFieldLabelTapePosition(target, styles?.transform ?? null);
  }
}

function setFieldLabelTextAuthorized(token, label, text, context){
  if(!FIELD_EXCLUSIVE_MODE){
    if(label instanceof HTMLElement){
      label.textContent = text;
    }
    return;
  }
  assertFieldControlToken(token, `setFieldLabelText:${context}`);
  if(label instanceof HTMLElement){
    label.textContent = text;
  }
}

function assertFieldSelectorSingletons(){
  const root = getFieldSelectorRoot();
  const rootChecks = [
    { selector: '.fieldSelectorTrack', label: 'fieldSelectorTrack' },
    { selector: '.fieldLabelTrack', label: 'fieldLabelTrack' },
    { selector: '.fieldSelectorViewport', label: 'fieldSelectorViewport' },
    { selector: '.fieldLabelSlot--prev', label: 'fieldLabelSlot--prev' },
    { selector: '.fieldLabelSlot--current', label: 'fieldLabelSlot--current' },
    { selector: '.fieldLabelSlot--next', label: 'fieldLabelSlot--next' },
  ];
  for(const { selector, label } of rootChecks){
    const matches = root.querySelectorAll(selector);
    if(matches.length !== 1){
      throw new Error(`FIELD selector missing ${label} (${matches.length})`);
    }
  }
  const globalChecks = [
    { selector: '#instance_field_left', label: 'instance_field_left' },
    { selector: '#instance_field_right', label: 'instance_field_right' },
  ];
  for(const { selector, label } of globalChecks){
    const matches = document.querySelectorAll(selector);
    if(matches.length !== 1){
      throw new Error(`FIELD selector duplicate detected: ${label} (${matches.length})`);
    }
  }
}

function setupFieldExclusiveObserver(){
  if(fieldControlObserver || !FIELD_EXCLUSIVE_MODE) return;
  const container = settingsRoot.querySelector('.cp-field-selector');
  if(!(container instanceof HTMLElement)) return;
  fieldControlObserver = new MutationObserver((mutations) => {
    if(!FIELD_EXCLUSIVE_MODE) return;
    for(const mutation of mutations){
      if(mutation.type !== 'attributes') continue;
      if(mutation.attributeName !== 'style' && mutation.attributeName !== 'class') continue;
      const target = mutation.target;
      if(!(target instanceof HTMLElement)) continue;
      if(!target.matches(
        '.fieldSelectorTrack, .fieldLabelTrack, .fieldLabelSlot'
      )){
        continue;
      }
      if(fieldControlActiveToken === null){
        throw new Error('FIELD exclusive mode: external write detected');
      }
    }
  });
  const observerOptions = {
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class'],
  };
  fieldControlObserver.observe(container, observerOptions);
}

function normalizeFieldLabels({ cancelAnimation = false, resetFieldAnimation = true } = {}){
  if(FIELD_EXCLUSIVE_MODE) return null;
  return normalizeFieldLabelsControlled({ cancelAnimation, resetFieldAnimation });
}

function normalizeFieldLabelsControlled({ cancelAnimation = false, resetFieldAnimation = true } = {}, token = null){
  if(FIELD_EXCLUSIVE_MODE){
    assertFieldControlToken(token, 'normalizeFieldLabels');
  }
  const hasActiveInteraction = isFieldInteractionActive();
  ensureFieldLabelsForDrag();

  if(cancelAnimation){
    isAnimating = false;
    const track = getFieldMotionTrack();
    if(track){
      setFieldSelectorStylesAuthorized(token, track, { transition: '' });
    }
    cancelFieldLabelAnimation();
    if(resetFieldAnimation){
      resetFieldAnimationTracking();
    }
  }

  syncFieldLabelSlots(currentIndex, token);
  const track = getFieldMotionTrack();
  if(track && !hasActiveInteraction){
    setFieldSelectorStylesAuthorized(token, track, { transform: getFieldBaseTransform() });
  }
  return fieldLabelCurrent;
}

function animateFieldLabelChange(targetIndex, direction, animationToken, options = {}, token = null){
  if(FIELD_EXCLUSIVE_MODE && !token) return;
  if(FIELD_EXCLUSIVE_MODE){
    assertFieldControlToken(token, 'animateFieldLabelChange');
  }
  if(direction !== 'next' && direction !== 'prev'){
    updateMapNameDisplayControlled({ index: targetIndex, animationToken }, token);
    removeIncomingFieldValue(token);
    if(FIELD_EXCLUSIVE_MODE){
      finalizeFieldExclusiveSession(token);
    }
    return;
  }

  const resolvedTarget = normalizeMapIndex(targetIndex);
  const stepCount = Math.max(1, Math.floor(Math.abs(options.steps ?? 1)));
  const stepDurationMs = Math.max(0, options.stepDurationMs ?? FIELD_LABEL_DURATION_MS);
  const stepDelta = direction === 'next' ? 1 : -1;
  const stepOffsetPx = direction === 'next' ? -FIELD_LABEL_SLOT_WIDTH : FIELD_LABEL_SLOT_WIDTH;
  const baseTransform = getFieldBaseTransform();

  normalizeFieldLabelsControlled({ cancelAnimation: true, resetFieldAnimation: false }, token);
  cancelFieldLabelAnimation();
  ensureFieldLabelsForDrag();

  const track = getFieldMotionTrack();
  if(!track || stepDurationMs === 0){
    currentIndex = resolvedTarget;
    syncFieldLabelSlots(currentIndex, token);
    removeIncomingFieldValue(token);
    if(FIELD_EXCLUSIVE_MODE){
      finalizeFieldExclusiveSession(token);
    }
    return;
  }

  isAnimating = true;
  markFieldAnimationStart(animationToken);
  console.log(`[map selector] ${currentIndex} -> ${resolvedTarget}`, {
    direction,
    isAnimating,
    steps: stepCount
  });

  let remainingSteps = stepCount;

  const finalizeStep = () => {
    if(animationToken !== fieldAnimationToken) return;
    cancelFieldLabelAnimation();
    setFieldSelectorStylesAuthorized(token, track, {
      transition: 'none',
      transform: baseTransform
    });
    currentIndex = normalizeMapIndex(currentIndex + stepDelta);
    syncFieldLabelSlots(currentIndex, token);
    remainingSteps -= 1;

    if(remainingSteps > 0){
      requestAnimationFrame(runStep);
      return;
    }

    currentIndex = resolvedTarget;
    syncFieldLabelSlots(currentIndex, token);
    isAnimating = false;
    markFieldAnimationEnd(animationToken);
    removeIncomingFieldValue(token);
    if(FIELD_EXCLUSIVE_MODE){
      finalizeFieldExclusiveSession(token);
    }
  };

  const runStep = () => {
    if(animationToken !== fieldAnimationToken) return;
    setFieldSelectorStylesAuthorized(token, track, {
      transition: 'none',
      transform: baseTransform
    });

    requestAnimationFrame(() => {
      if(animationToken !== fieldAnimationToken) return;
      const transition = getFieldSelectorTransition(stepDurationMs);
      setFieldSelectorStylesAuthorized(token, track, {
        transition,
        transform: getFieldOffsetTransform(stepOffsetPx)
      });
    });

    let resolved = false;
    const handleTransitionEnd = (event) => {
      if(event.target !== track || event.propertyName !== 'transform') return;
      if(resolved) return;
      resolved = true;
      finalizeStep();
    };

    fieldLabelTransitionTarget = track;
    fieldLabelTransitionHandler = handleTransitionEnd;
    track.addEventListener('transitionend', handleTransitionEnd);
    fieldLabelFallbackTimeoutId = window.setTimeout(() => {
      if(resolved) return;
      resolved = true;
      finalizeStep();
    }, stepDurationMs + 80);
  };

  runStep();
}

function updateMapNameDisplay(options = {}){
  if(FIELD_EXCLUSIVE_MODE) return;
  updateMapNameDisplayControlled(options, null);
}

function syncFieldSelectorLabels({ token } = {}){
  if(FIELD_EXCLUSIVE_MODE){
    assertFieldControlToken(token, 'syncFieldSelectorLabels');
  }
  if(!mapNameDisplay) return;
  const resolvedIndex = mapIndex;
  const nextText = getFieldLabel(resolvedIndex);
  currentIndex = resolvedIndex;
  nextIndex = resolvedIndex;
  mapNameDisplay.setAttribute('aria-label', `${mapNameDisplayBaseLabel}: ${nextText}`);
  syncFieldLabelSlots(resolvedIndex, token);
  const track = getFieldMotionTrack();
  if(track){
    setFieldSelectorStylesAuthorized(token, track, { transform: getFieldBaseTransform() });
  }
}

function updateMapNameDisplayControlled(options = {}, token = null){
  if(FIELD_EXCLUSIVE_MODE){
    assertFieldControlToken(token, 'updateMapNameDisplay');
  }
  if(!mapNameDisplay) return;
  const resolvedIndex = Number.isFinite(options.index) ? options.index : mapIndex;
  const nextText = getFieldLabel(resolvedIndex);
  const shouldResetFieldAnimation = !options.animationToken;
  const hasActiveInteraction = isFieldInteractionActive();
  normalizeFieldLabelsControlled(
    { cancelAnimation: true, resetFieldAnimation: shouldResetFieldAnimation },
    token
  );
  currentIndex = resolvedIndex;
  nextIndex = resolvedIndex;
  mapNameDisplay.setAttribute('aria-label', `${mapNameDisplayBaseLabel}: ${nextText}`);
  syncFieldLabelSlots(resolvedIndex, token);
  logFieldAudit('updateMapNameDisplay', fieldLabelCurrent, {
    index: resolvedIndex,
    textContent: nextText
  });
  const track = getFieldMotionTrack();
  if(track && !hasActiveInteraction){
    setFieldSelectorStylesAuthorized(token, track, { transform: getFieldBaseTransform() });
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
  addFieldAuditListener(previewCanvas, 'pointerdown', onPreviewPointerDown);
  addFieldAuditListener(window, 'pointermove', onPreviewPointerMove);
  addFieldAuditListener(window, 'pointerup', onPreviewPointerUp);
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

function runFieldSelectorInitChecks(){
  assertFieldSelectorSingletons();
  setupFieldExclusiveObserver();
}

function syncFieldSelectorState(){
  if(FIELD_EXCLUSIVE_MODE){
    const token = startFieldExclusiveSession();
    syncFieldSelectorLabels({ token });
    finalizeFieldExclusiveSession(token);
    return;
  }
  syncFieldSelectorLabels();
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
  syncFieldSelectorState();
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
  addFieldAuditListener(btn, 'pointerdown', start);
  addFieldAuditListener(btn, 'pointerup', stop);
  addFieldAuditListener(btn, 'pointerleave', stop);
  addFieldAuditListener(btn, 'pointercancel', stop);
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
  addFieldAuditListener(addsNailsBtn, 'click', () => {
    sharpEdges = !sharpEdges;
    setTumblerState(addsNailsBtn, sharpEdges);
    syncToggleInput(sharpEdgesToggle, sharpEdges);
    saveSettings();
  });
}

if(addsAABtn){
  setTumblerState(addsAABtn, addAA);
  addFieldAuditListener(addsAABtn, 'click', () => {
    addAA = !addAA;
    setTumblerState(addsAABtn, addAA);
    syncToggleInput(addAAToggle, addAA);
    saveSettings();
  });
}

if(addsCargoBtn){
  setTumblerState(addsCargoBtn, addCargo);
  addFieldAuditListener(addsCargoBtn, 'click', () => {
    addCargo = !addCargo;
    setTumblerState(addsCargoBtn, addCargo);
    saveSettings();
  });
}

const hasMapButtons = mapPrevBtn && mapNextBtn;
if(hasMapButtons){
  updateMapPreview();
  runFieldSelectorInitChecks();
  syncFieldSelectorState();
  const changeMap = (delta) => {
    if(delta === 0) return;
    const direction = getRangeDirectionLabel(getRangeDirFromDelta(delta));
    if(direction){
      prepareIncomingFieldValue(direction, 1);
    }
    queueFieldSteps(1, delta, 0);
  };

  addFieldAuditListener(mapPrevBtn, 'click', () => changeMap(-1));
  addFieldAuditListener(mapNextBtn, 'click', () => changeMap(1));
} else {
  updateMapPreview();
  runFieldSelectorInitChecks();
  syncFieldSelectorState();
}

  const handleRangeArrow = (delta) => {
    if(isRangeAnimating || isRangeBumping) return;
    const currentIndex = Math.floor(rangeStep / 2);
    const nextIndex = Math.min(
      RANGE_DISPLAY_VALUES.length - 1,
      Math.max(0, currentIndex + delta)
    );
    if(nextIndex === currentIndex){
      playRangeEdgeBump(getRangeDirectionLabel(getRangeDirFromDelta(delta)));
      return;
    }
    changeRangeStep(delta, { commitImmediately: true });
  };

  const handleAccuracyArrow = (delta) => {
    if(isAccuracyAnimating || isAccuracyBumping) return;
    const currentIndex = accuracyDisplayIdx;
    const nextIndex = clampAccuracyIndex(currentIndex + delta);
    if(nextIndex === currentIndex){
      playAccuracyEdgeBump(getRangeDirectionLabel(getRangeDirFromDelta(delta)));
      return;
    }
    changeAccuracyStep(delta, { commitImmediately: true });
  };

  setupRepeatButton(rangeMinusBtn, () => handleRangeArrow(-1));
  setupRepeatButton(rangePlusBtn, () => handleRangeArrow(1));
  const ensuredRangeTrack = ensureRangeDisplayTrack();
  if(rangeDisplayViewport && ensuredRangeTrack){
    addFieldAuditListener(rangeDisplayViewport, 'pointerdown', handleRangePointerDown);
    addFieldAuditListener(rangeDisplayViewport, 'pointermove', handleRangePointerMove);
    addFieldAuditListener(rangeDisplayViewport, 'pointerup', handleRangePointerEnd);
    addFieldAuditListener(rangeDisplayViewport, 'pointercancel', handleRangePointerEnd);
  }
  const ensuredAccuracyTrack = ensureAccuracyDisplayTrack();
  if(accuracyDisplayViewport && ensuredAccuracyTrack){
    addFieldAuditListener(accuracyDisplayViewport, 'pointerdown', handleAccuracyPointerDown);
    addFieldAuditListener(accuracyDisplayViewport, 'pointermove', handleAccuracyPointerMove);
    addFieldAuditListener(accuracyDisplayViewport, 'pointerup', handleAccuracyPointerEnd);
    addFieldAuditListener(accuracyDisplayViewport, 'pointercancel', handleAccuracyPointerEnd);
  }
  const fieldDragTarget = getFieldSelectorRoot();
  const ensuredFieldTrack = ensureFieldDragTracks();
  if(fieldDragTarget && ensuredFieldTrack){
    addFieldAuditListener(fieldDragTarget, 'pointerdown', handleFieldPointerDown);
    addFieldAuditListener(fieldDragTarget, 'pointermove', handleFieldPointerMove);
    addFieldAuditListener(fieldDragTarget, 'pointerup', handleFieldPointerEnd);
    addFieldAuditListener(fieldDragTarget, 'pointercancel', handleFieldPointerEnd);
  }
  setupRepeatButton(amplitudeMinusBtn, () => handleAccuracyArrow(-1));
  setupRepeatButton(amplitudePlusBtn, () => handleAccuracyArrow(1));

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
  addFieldAuditListener(resetBtn, 'click', resetSettingsToDefaults);
}

if(exitBtn){
  addFieldAuditListener(exitBtn, 'click', goToMainMenu);
}

function handleSettingsLayerShow(){
  isSettingsActive = true;
  if(window.paperWingsSettings){
    window.paperWingsSettings.isActive = true;
  }
  syncAccuracyCrackWatcher();
  startPreviewSimulation();
  startPreviewAnimationIfNeeded();
  if(pendulumHost){
    startPendulumAnimation();
  }
}

function handleSettingsLayerHide(){
  isSettingsActive = false;
  if(window.paperWingsSettings){
    window.paperWingsSettings.isActive = false;
  }
  if(accuracyCrackWatcher){
    accuracyCrackWatcher.stop();
  }
  stopPendulumAnimation();
  stopPreviewAnimation();
}

function cleanupRenderers(){
  handleSettingsLayerHide();
}

window.addEventListener('pagehide', cleanupRenderers);
window.addEventListener('beforeunload', cleanupRenderers);

if(isFieldDebugMarkerEnabled() && !window.__fieldDebugBuildLogged){
  console.warn('FIELD_DEBUG_BUILD', FIELD_DEBUG_BUILD);
  window.__fieldDebugBuildLogged = true;
}

const fieldDebugMarkerTarget = settingsRoot.querySelector('.cp-field-selector');
if(isFieldDebugMarkerEnabled() &&
  fieldDebugMarkerTarget &&
  !settingsRoot.querySelector('[data-field-debug-build]')){
  const fieldDebugMarker = document.createElement('span');
  fieldDebugMarker.dataset.fieldDebugBuild = FIELD_DEBUG_BUILD;
  fieldDebugMarker.textContent = '•';
  fieldDebugMarker.style.cssText = 'margin-left:4px;font-size:10px;opacity:0.4;';
  fieldDebugMarkerTarget.appendChild(fieldDebugMarker);
}

  updateRangeDisplay();
  updateRangeFlame();
updateAmplitudeDisplay();
updateAmplitudeIndicator();
syncFieldSelectorState();

const settingsBridge = window.paperWingsSettings || {};
settingsBridge.onShow = handleSettingsLayerShow;
settingsBridge.onHide = handleSettingsLayerHide;
settingsBridge.isActive = isSettingsActive;
window.paperWingsSettings = settingsBridge;
})();
