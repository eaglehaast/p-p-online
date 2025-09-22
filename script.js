/***************************************************************
 * Paper Wings — mobile-friendly build
 * Flight range shown with a plane and animated exhaust flame.
 * Includes fixes for plane orientation, AI turns, and mini-icon counter.
 ***************************************************************/



/* ======= DOM ======= */
const mantisIndicator = document.getElementById("mantisIndicator");
const goatIndicator   = document.getElementById("goatIndicator");

const gameContainer = document.getElementById("gameContainer");
const gameCanvas  = document.getElementById("gameCanvas");
const gameCtx     = gameCanvas.getContext("2d");

const aimCanvas   = document.getElementById("aimCanvas");
const aimCtx      = aimCanvas.getContext("2d");

const planeCanvas = document.getElementById("planeCanvas");
const planeCtx    = planeCanvas.getContext("2d");

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

const endGameDiv  = document.getElementById("endGameButtons");
const yesBtn      = document.getElementById("yesButton");
const noBtn       = document.getElementById("noButton");

// Images for planes
const bluePlaneImg = new Image();
bluePlaneImg.src = "blue plane 24.png";

const greenPlaneImg = new Image();

greenPlaneImg.src = "green plane 3.png";
const backgroundImg = new Image();
backgroundImg.src = "background paper 1.png";
const CANVAS_BASE_WIDTH = 360;
const CANVAS_BASE_HEIGHT = 640;
const FRAME_PADDING_X = 50;
const FRAME_PADDING_Y = 80;
const FRAME_BASE_WIDTH = CANVAS_BASE_WIDTH + FRAME_PADDING_X * 2; // 460
const FRAME_BASE_HEIGHT = CANVAS_BASE_HEIGHT + FRAME_PADDING_Y * 2; // 800
const FIELD_BORDER_THICKNESS = 10; // px, width of brick frame edges

// ---- STAR_LAYOUT safe shim (не даём получить ReferenceError) ----
window.STAR_LAYOUT = window.STAR_LAYOUT || {};

function getDefaultStarScaleX(){
  const rect = gameCanvas.getBoundingClientRect();
  const width = rect.width || CANVAS_BASE_WIDTH;
  return width / CANVAS_BASE_WIDTH;
}

function getDefaultStarScaleY(){
  const rect = gameCanvas.getBoundingClientRect();
  const height = rect.height || CANVAS_BASE_HEIGHT;
  return height / CANVAS_BASE_HEIGHT;
}

if (typeof STAR_LAYOUT.sx !== 'function') STAR_LAYOUT.sx = () => getDefaultStarScaleX();
if (typeof STAR_LAYOUT.sy !== 'function') STAR_LAYOUT.sy = () => getDefaultStarScaleY();
if (typeof STAR_LAYOUT.anchorX !== 'number') STAR_LAYOUT.anchorX = 0;
if (typeof STAR_LAYOUT.anchorY !== 'number') STAR_LAYOUT.anchorY = 0;
if (typeof window.STAR_READY === 'undefined') window.STAR_READY = false;

const brickFrameImg = new Image();
// Load the default map on startup so we don't request a missing image
// and fail to initialize the playing field before `applyCurrentMap()` runs.
brickFrameImg.src = "map 1 - clear sky 3.png";
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


function createExplosionImage(){
  const img = document.createElement("img");
  img.src = `explosion 4.gif?${Date.now()}`;
  img.style.position = "absolute";
  img.style.left = "-1000px";
  img.style.top = "-1000px";
  document.body.appendChild(img);
  return img;
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
const PLANE_SCALE          = 0.9;    // 10% smaller planes
const CELL_SIZE            = 20;     // px
const POINT_RADIUS         = 15 * PLANE_SCALE;     // px (увеличено для мобильных)
// Larger hit area for selecting planes with touch/mouse
const PLANE_TOUCH_RADIUS   = 20;                   // px
const AA_HIT_RADIUS        = POINT_RADIUS + 5; // slightly larger zone to hit Anti-Aircraft center
const BOUNCE_FRAMES        = 68;
// Duration of a full-speed flight in seconds (previously measured in frames)
const FLIGHT_DURATION_SEC  = BOUNCE_FRAMES / 60;
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
const FLAG_POLE_HEIGHT     = 20;     // высота флагштока
const FLAG_WIDTH           = 12;     // ширина полотна флага
const FLAG_HEIGHT          = 8;      // высота полотна флага

// Explosion effect
const EXPLOSION_DURATION_MS = 500;   // time before showing cross
const EXPLOSION_SIZE        = 96;    // px, larger for better visibility

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
const MAX_AMPLITUDE        = 30;     // UI показывает как *4°
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



let flightRangeCells; // cells for menu and physics
let buildingsCount   = 0;
let aimingAmplitude;     // 0..30 (UI показывает *4)

let isGameOver   = false;
let winnerColor  = null;
let gameMode     = null;
let selectedMode = null;

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
let flyingPoints = [];
let buildings    = [];

let aaUnits     = [];
let aaPlacementPreview = null;
let aaPreviewTrail = [];

let aaPointerDown = false;

let phase = "MENU"; // MENU | AA_PLACEMENT (Anti-Aircraft placement) | ROUND_START | TURN | ROUND_END


let currentPlacer = null; // 'green' | 'blue'
const MAPS = [
  { name: 'Clear Sky', file: 'map 1 - clear sky 3.png' },
  { name: '5 Bricks',  file: 'map 2 - 5 bricks.png' },
  { name: 'Diagonals', file: 'map 3 diagonals.png' }

];

let settings = { addAA: false, sharpEdges: false, mapIndex: 0 };

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

function loadSettings(){
  const fr = parseInt(getStoredSetting('settings.flightRangeCells'), 10);
  flightRangeCells = Number.isNaN(fr) ? 15 : fr;
  const amp = parseFloat(getStoredSetting('settings.aimingAmplitude'));
  aimingAmplitude = Number.isNaN(amp) ? 10 / 4 : amp;
  settings.addAA = getStoredSetting('settings.addAA') === 'true';
  settings.sharpEdges = getStoredSetting('settings.sharpEdges') === 'true';
  const mapIdx = parseInt(getStoredSetting('settings.mapIndex'), 10);
  settings.mapIndex = Number.isNaN(mapIdx) ? 0 : Math.min(MAPS.length - 1, Math.max(0, mapIdx));

  // Clamp loaded values so corrupted or out-of-range settings
  // don't break the game on startup
  flightRangeCells = Math.min(MAX_FLIGHT_RANGE_CELLS,
                             Math.max(MIN_FLIGHT_RANGE_CELLS, flightRangeCells));
  aimingAmplitude  = Math.min(MAX_AMPLITUDE,
                             Math.max(MIN_AMPLITUDE, aimingAmplitude));
}

loadSettings();

// Highlight advanced settings button if custom settings are stored
const hasCustomSettings = storageAvailable && [
  'settings.flightRangeCells',
  'settings.aimingAmplitude',
  'settings.addAA',
  'settings.sharpEdges',
  'settings.mapIndex'
].some(key => getStoredSetting(key) !== null);

if(hasCustomSettings && classicRulesBtn && advancedSettingsBtn){
  classicRulesBtn.classList.remove('selected');
  advancedSettingsBtn.classList.add('selected');
}


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

const STAR_IMG = new Image();
const STAR_SOURCE_RECTS = {
  green: [
    [2, 1, 14, 19],
    [40, 0, 14, 20],
    [77, 6, 23, 13],
    [119, 6, 23, 13],
    [161, 0, 13, 22]
  ],
  blue: [
    [0, 40, 15, 19],
    [40, 43, 15, 17],
    [78, 47, 23, 14],
    [120, 47, 23, 14],
    [160, 36, 14, 25]
  ]
};

// Состояние слотов: теперь 5 звёзд на сторону (каждая звезда = до 5 фрагментов)
const STAR_STATE = {
  blue:  Array.from({length:5}, ()=> new Set()),
  green: Array.from({length:5}, ()=> new Set())
};

const STAR_FRAGMENTS_PER_SLOT = 5;

// Куда класть следующий кусок (индекс звезды 0..4 или >=5, если все собраны)
let STAR_NEXT_SLOT = { blue: 0, green: 0 };

// Точные top-left координаты КАЖДОГО фрагмента (макет 460x800)
// Порядок: [звезда 1..5][фрагмент 1..5] = {x, y}
const STAR_PLACEMENT = {
  green: [
    // 1-я зелёная звезда
    [ {x:10,y:417}, {x:10,y:477}, {x:10,y:537}, {x:10,y:597}, {x:10,y:657} ],
    // 2-я зелёная звезда
    [ {x:25,y:418}, {x:25,y:478}, {x:25,y:538}, {x:25,y:598}, {x:25,y:658} ],
    // 3-я зелёная звезда
    [ {x:28,y:428}, {x:28,y:488}, {x:28,y:548}, {x:28,y:608}, {x:28,y:668} ],
    // 4-я зелёная звезда
    [ {x:4,y:428},  {x:4,y:488},  {x:4,y:548},  {x:4,y:608},  {x:4,y:668}  ],
    // 5-я зелёная звезда
    [ {x:18,y:439}, {x:18,y:499}, {x:18,y:559}, {x:18,y:619}, {x:18,y:679} ],
  ],
  blue: [
    // 1-я синяя звезда
    [ {x:421,y:100}, {x:421,y:160}, {x:421,y:220}, {x:421,y:280}, {x:421,y:340} ],
    // 2-я синяя звезда  (исправил опечатку в исходном тексте: было "435 97 4 / 35 157")
    [ {x:435,y:97},  {x:435,y:157}, {x:435,y:217}, {x:435,y:277}, {x:435,y:337} ],
    // 3-я синяя звезда
    [ {x:437,y:108}, {x:437,y:168}, {x:437,y:228}, {x:437,y:288}, {x:437,y:348} ],
    // 4-я синяя звезда
    [ {x:413,y:108}, {x:413,y:168}, {x:413,y:228}, {x:413,y:288}, {x:413,y:348} ],
    // 5-я синяя звезда
    [ {x:428,y:122}, {x:428,y:182}, {x:428,y:242}, {x:428,y:302}, {x:428,y:368} ],
  ]
};

function syncStarState(color, score){
  const slots = STAR_STATE[color];
  if (!Array.isArray(slots)) return;

  const clamped = Math.max(0, Math.min(score, POINTS_TO_WIN));

  slots.forEach(set => set.clear());
  STAR_NEXT_SLOT[color] = 0;

  for (let count = 0; count < clamped; count++){
    if (!addPointToSide(color)) break;
  }
}

function findNextIncompleteSlot(pool, startIndex = 0){
  if (!Array.isArray(pool) || pool.length === 0) return -1;

  const length = pool.length;
  let normalized = Number.isInteger(startIndex) ? startIndex : 0;
  if (normalized < 0) normalized = 0;
  if (normalized >= length) normalized = normalized % length;

  for (let offset = 0; offset < length; offset++){
    const idx = (normalized + offset) % length;
    const slot = pool[idx];
    if (slot && slot.size < STAR_FRAGMENTS_PER_SLOT){
      return idx;
    }
  }

  return -1;
}

// Новый распределитель: заполняем одну звезду полностью, затем переходим к следующей
function addPointToSide(color){
  const pool = STAR_STATE[color];                   // массив из 5 Set'ов (по звездам)
  if (!Array.isArray(pool) || !pool.length) return false;

  const startSlot = Number.isInteger(STAR_NEXT_SLOT[color]) ? STAR_NEXT_SLOT[color] : 0;
  const slot = findNextIncompleteSlot(pool, startSlot);
  if (slot === -1){
    STAR_NEXT_SLOT[color] = pool.length;
    return false;
  }

  const pieces = pool[slot];
  let fragment = 1;
  while (fragment <= STAR_FRAGMENTS_PER_SLOT && pieces.has(fragment)){
    fragment++;
  }

  if (fragment > STAR_FRAGMENTS_PER_SLOT){
    const nextSlot = findNextIncompleteSlot(pool, slot + 1);
    STAR_NEXT_SLOT[color] = nextSlot === -1 ? pool.length : nextSlot;
    return false;
  }

  pieces.add(fragment);

  if (pieces.size >= STAR_FRAGMENTS_PER_SLOT){
    const nextSlot = findNextIncompleteSlot(pool, slot + 1);
    STAR_NEXT_SLOT[color] = nextSlot === -1 ? pool.length : nextSlot;
  } else {
    STAR_NEXT_SLOT[color] = slot;
  }

  return true;
}

function syncAllStarStates(){
  syncStarState("green", greenScore);
  syncStarState("blue",  blueScore);

  ["green", "blue"].forEach(color => {
    const pool = STAR_STATE[color];
    const next = findNextIncompleteSlot(pool, STAR_NEXT_SLOT[color]);

    if (next === -1){
      if (Array.isArray(pool)) {
        STAR_NEXT_SLOT[color] = pool.length;
      }
    } else {
      STAR_NEXT_SLOT[color] = next;
    }
  });
}

STAR_IMG.onload = () => {
  console.log("[STAR] sprite loaded", STAR_IMG.width, STAR_IMG.height);
  window.STAR_READY = true;
  syncAllStarStates();
  if (typeof renderScoreboard === "function"){
    renderScoreboard();
  }
};
STAR_IMG.onerror = (e) => console.warn("[STAR] sprite load ERROR", e);
STAR_IMG.src = "sprite star 3.png";
syncAllStarStates();

function addScore(color, delta){
  if(color === "blue"){
    blueScore = Math.max(0, blueScore + delta);
    syncStarState("blue", blueScore);
  } else if(color === "green"){
    greenScore = Math.max(0, greenScore + delta);
    syncStarState("green", greenScore);
  }

  if(!isGameOver){
    if(blueScore >= POINTS_TO_WIN){
      isGameOver = true;
      winnerColor = "blue";
    } else if(greenScore >= POINTS_TO_WIN){
      isGameOver = true;
      winnerColor = "green";
    }
  }

  renderScoreboard();
}

let animationFrameId = null;

/* Планирование хода ИИ */
let aiMoveScheduled = false;

/* ======= INIT ======= */
function initPoints(){
  points = [];
  const spacing = FIELD_WIDTH / (PLANES_PER_SIDE + 1);
  const middleOffset = MIDDLE_GAP_EXTRA_PX / 2;

  // Green (низ поля) — смотрят ВВЕРХ (к сопернику)
  for(let i = 1; i <= PLANES_PER_SIDE; i++){
    let x = FIELD_LEFT + spacing * i;
    if(i === Math.ceil(PLANES_PER_SIDE / 2)) x -= middleOffset;
    if(i === Math.ceil(PLANES_PER_SIDE / 2) + 1) x += middleOffset;
    points.push(makePlane(x, gameCanvas.height - 40, "green", 0)); // 0 рад — нос вверх
  }

  // Blue (верх поля) — смотрят ВНИЗ
  for(let i = 1; i <= PLANES_PER_SIDE; i++){
    let x = FIELD_LEFT + spacing * i;
    if(i === Math.ceil(PLANES_PER_SIDE / 2)) x -= middleOffset;
    if(i === Math.ceil(PLANES_PER_SIDE / 2) + 1) x += middleOffset;
    points.push(makePlane(x, 40, "blue", Math.PI)); // π рад — нос вниз
  }
}
function makePlane(x,y,color,angle){
  return {
    x, y,
    color,
    isAlive:true,
    burning:false,
    explosionStart:null,
    explosionImg:null,
    angle,
    segments:[],
    collisionX:null,
    collisionY:null,
    prevX: x,
    prevY: y,
    flagColor:null
  };
}


function resetGame(){
  isGameOver= false;
  winnerColor= null;
  endGameDiv.style.display = "none";

  greenScore = 0;
  blueScore  = 0;
  STAR_NEXT_SLOT = { blue: 0, green: 0 };
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
  if(!advancedSettingsBtn?.classList.contains('selected')){
    settings.mapIndex = Math.floor(Math.random() * MAPS.length);
  }
  applyCurrentMap();

  aaUnits = [];

  hasShotThisRound = false;

  selectedMode = null;
  gameMode = null;
  phase = 'MENU';
  currentPlacer = null;

  // UI reset
  hotSeatBtn.classList.remove("selected");
  computerBtn.classList.remove("selected");
  onlineBtn.classList.remove("selected");


  // Play disabled
  playBtn.disabled = true;
  playBtn.classList.remove("active");
  playBtn.classList.add("disabled");

  // Показать меню, скрыть канвасы
  modeMenuDiv.style.display = "block";
  gameCanvas.style.display = "none";
  mantisIndicator.style.display = "none";
  goatIndicator.style.display = "none";
  aimCanvas.style.display = "none";
  planeCanvas.style.display = "none";
  planeCtx.clearRect(0,0,planeCanvas.width,planeCanvas.height);

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
    flightRangeCells = 15;
    aimingAmplitude = 10 / 4; // 10°
    settings.addAA = false;
    settings.sharpEdges = false;
    settings.mapIndex = Math.floor(Math.random() * MAPS.length);
    applyCurrentMap();
    advancedSettingsBtn?.classList.remove('selected');
    classicRulesBtn.classList.add('selected');
  });
}
if(advancedSettingsBtn){
  advancedSettingsBtn.addEventListener('click', () => {
    if(advancedSettingsBtn.classList.contains('selected')){
      window.location.href = 'settings.html';
    } else {
      loadSettings();
      classicRulesBtn?.classList.remove('selected');
      advancedSettingsBtn.classList.add('selected');
      applyCurrentMap();
    }
  });
}
function updateModeSelection(){
  hotSeatBtn.classList.toggle("selected", selectedMode==="hotSeat");
  computerBtn.classList.toggle("selected", selectedMode==="computer");
  onlineBtn.classList.toggle("selected", selectedMode==="online");

  const ready = Boolean(selectedMode);
  playBtn.disabled = !ready;
  playBtn.classList.toggle("disabled", !ready);
  playBtn.classList.toggle("active", ready);
}

playBtn.addEventListener("click",()=>{
  if(!selectedMode){
    alert("Please select a game mode before starting.");
    return;
  }
  gameMode = selectedMode;
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

// Поддержка мобильных устройств
function getEventCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  return { clientX: e.clientX, clientY: e.clientY };
}

function handleStart(e) {
  e.preventDefault();
  if(isGameOver || !gameMode) return;

  const currentColor= turnColors[turnIndex];
  if(gameMode==="computer" && currentColor==="blue") return; // ход ИИ

  if(flyingPoints.some(fp=>fp.plane.color===currentColor)) return;

  const coords = getEventCoords(e);
  const rect= gameCanvas.getBoundingClientRect();
  
  // Правильное масштабирование координат
  const scaleX = gameCanvas.width / rect.width;
  const scaleY = gameCanvas.height / rect.height;
  
  let mx= (coords.clientX - rect.left) * scaleX;
  let my= (coords.clientY - rect.top) * scaleY;

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
  const coords = getEventCoords(e);
  const rect = gameCanvas.getBoundingClientRect();
  const scaleX = gameCanvas.width / rect.width;
  const scaleY = gameCanvas.height / rect.height;
  const x = (coords.clientX - rect.left) * scaleX;
  const y = (coords.clientY - rect.top) * scaleY;
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
  const coords = getEventCoords(e);
  const rect= gameCanvas.getBoundingClientRect();
  
  // Правильное масштабирование координат
  const scaleX = gameCanvas.width / rect.width;
  const scaleY = gameCanvas.height / rect.height;
  
  handleCircle.baseX= (coords.clientX - rect.left) * scaleX;
  handleCircle.baseY= (coords.clientY - rect.top) * scaleY;
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
  const flightDistancePx = flightRangeCells * CELL_SIZE;
  const speedPxPerSec = flightDistancePx / FLIGHT_DURATION_SEC;
  const scale = dragDistance / MAX_DRAG_DISTANCE;

  // скорость — ПРОТИВ направления натяжки (px/sec)
  let vx= -Math.cos(dragAngle) * scale * speedPxPerSec;
  let vy= -Math.sin(dragAngle) * scale * speedPxPerSec;

  // нос по скорости
  plane.angle = Math.atan2(vy, vx) + Math.PI/2;

  flyingPoints.push({
    plane, vx, vy,
    timeLeft: FLIGHT_DURATION_SEC,
    hit:false,
    collisionCooldown:0
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
  const topY    = 40;
  const bottomY = gameCanvas.height - 40;

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
  const flightDistancePx = flightRangeCells * CELL_SIZE;
  const speedPxPerSec    = flightDistancePx / FLIGHT_DURATION_SEC;
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
  const flightDistancePx = flightRangeCells * CELL_SIZE;
  const speedPxPerSec    = flightDistancePx / FLIGHT_DURATION_SEC;

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
  flyingPoints.push({ plane, vx, vy, timeLeft: FLIGHT_DURATION_SEC, hit:false, collisionCooldown:0 });
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
  p.explosionImg = createExplosionImage();
  const img = p.explosionImg;
  img.onload = () => {
    p.explosionStart = performance.now();
    setTimeout(() => {
      if (p.explosionImg === img) {
        img.remove();
        p.explosionImg = null;
      }
    }, EXPLOSION_DURATION_MS);
  };
  p.collisionX = p.x;
  p.collisionY = p.y;
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
              p.explosionImg = createExplosionImage();
              const img = p.explosionImg;
              img.onload = () => {
                p.explosionStart = performance.now();
                setTimeout(() => {
                  if (p.explosionImg === img) {
                    img.remove();
                    p.explosionImg = null;
                  }
                }, EXPLOSION_DURATION_MS);
              };
              p.collisionX=p.x; p.collisionY=p.y;
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
  gameCtx.clearRect(0,0, gameCanvas.width, gameCanvas.height);
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
  if(!isGameOver && flyingPoints.length){
    const current = [...flyingPoints];
    for(const fp of current){
      const p = fp.plane;
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
      p.angle = Math.atan2(fp.vy, fp.vx) + Math.PI / 2;

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
    const maxAngleDeg = aimingAmplitude * 4;
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
    const rect = gameCanvas.getBoundingClientRect();
    const scaleX = rect.width / gameCanvas.width;
    const scaleY = rect.height / gameCanvas.height;
    aimCtx.translate(rect.left, rect.top);
    aimCtx.scale(scaleX, scaleY);
    aimCtx.globalAlpha = arrowAlpha;
    drawArrow(aimCtx, plane.x, plane.y, baseDx, baseDy);
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
    const text= `${winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1)} wins!`;
    const w= gameCtx.measureText(text).width;
    gameCtx.fillText(text, (gameCanvas.width - w)/2, gameCanvas.height/2 - 80);

    if(blueScore >= POINTS_TO_WIN || greenScore >= POINTS_TO_WIN){
      endGameDiv.style.display="block";
    }
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
  if(backgroundImg.complete){
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
  if(brickFrameImg.complete){
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

function drawPlaneOutline(ctx2d, color){
  ctx2d.strokeStyle = colorFor(color);
  ctx2d.lineWidth = 2;
  ctx2d.lineJoin = "round";
  ctx2d.lineCap = "round";
  ctx2d.beginPath();
  ctx2d.moveTo(0, -20);
  ctx2d.quadraticCurveTo(12, -5, 10, 10);
  ctx2d.quadraticCurveTo(6, 15, 0, 18);
  ctx2d.quadraticCurveTo(-6, 15, -10, 10);
  ctx2d.quadraticCurveTo(-12, -5, 0, -20);
  ctx2d.closePath();
  ctx2d.stroke();
}


function drawThinPlane(ctx2d, plane, glow = 0) {
  const { x: cx, y: cy, color, angle } = plane;

  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.rotate(angle);
  ctx2d.scale(PLANE_SCALE, PLANE_SCALE);
  ctx2d.filter = "blur(0.3px)"; // slight blur to soften rotated edges

  const blend = Math.max(0, Math.min(1, glow));
  if (blend > 0) {
    const glowStrength = blend * 1.25; // boost brightness slightly
    ctx2d.shadowColor = colorWithAlpha(color, Math.min(1, glowStrength));
    ctx2d.shadowBlur = (color === "green" ? 15 : 10) * glowStrength;
  } else {
    ctx2d.shadowColor = "rgba(0,0,0,0.3)";
    ctx2d.shadowBlur = 1.5;
  }

  const showEngine = !(plane.burning && isExplosionFinished(plane));
  if (color === "blue") {
    if (showEngine) {
      const flicker = 1 + 0.05 * Math.sin(globalFrame * 0.1);
      drawJetFlame(ctx2d, flicker);

      const fp = flyingPoints.find(fp => fp.plane === plane);
      if (fp) {
        const progress = (FLIGHT_DURATION_SEC - fp.timeLeft) / FLIGHT_DURATION_SEC;
        const scale = progress < 0.75 ? 4 * progress : 12 * (1 - progress);
        drawBlueJetFlame(ctx2d, scale);

        drawWingTrails(ctx2d);
      }
    }
    if (bluePlaneImg.complete) {
      ctx2d.drawImage(bluePlaneImg, -20, -20, 40, 40);
    } else {
      drawPlaneOutline(ctx2d, color);
    }
    addPlaneShading(ctx2d);
  } else if (color === "green") {
    const fp = flyingPoints.find(fp => fp.plane === plane);
    if (showEngine) {
      if (fp) {
        const progress = (FLIGHT_DURATION_SEC - fp.timeLeft) / FLIGHT_DURATION_SEC;
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
    if (greenPlaneImg.complete) {
      ctx2d.drawImage(greenPlaneImg, -20, -20, 40, 40);
    } else {
      drawPlaneOutline(ctx2d, color);
    }
    addPlaneShading(ctx2d);
  } else {
    drawPlaneOutline(ctx2d, color);
    addPlaneShading(ctx2d);
  }

  ctx2d.restore();
}

function drawRedCross(ctx2d, cx, cy, size=20){
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.strokeStyle = "red";
  ctx2d.lineWidth = 2 * PLANE_SCALE;
  ctx2d.beginPath();
  ctx2d.moveTo(-size/2, -size/2);
  ctx2d.lineTo( size/2,  size/2);
  ctx2d.moveTo( size/2, -size/2);
  ctx2d.lineTo(-size/2,  size/2);
  ctx2d.stroke();
  ctx2d.restore();
}

function isExplosionFinished(p){
  return p.explosionStart && (performance.now() - p.explosionStart >= EXPLOSION_DURATION_MS);
}

function drawMiniPlaneWithCross(ctx2d, x, y, color, isAlive, isBurning, scale = 1) {
  ctx2d.save();
  ctx2d.translate(x, y);

  // Base size of the icon so it fits within the scoreboard cell
  const size = 16 * PLANE_SCALE * scale;

  let img = null;
  if (color === "blue") {
    img = bluePlaneImg;
  } else if (color === "green") {
    img = greenPlaneImg;
  }

  if (img && img.complete) {
    ctx2d.drawImage(img, -size / 2, -size / 2, size, size);
  } else {
    // Fallback to simple outline if image isn't ready yet
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

  if (isBurning) {
    drawRedCross(ctx2d, 0, 0, size * 0.8);
  }

  ctx2d.restore();
}

function drawPlanesAndTrajectories(){
  planeCtx.clearRect(0, 0, planeCanvas.width, planeCanvas.height);
  const rect = gameCanvas.getBoundingClientRect();
  const scaleX = rect.width / gameCanvas.width;
  const scaleY = rect.height / gameCanvas.height;
  planeCtx.save();
  planeCtx.translate(rect.left, rect.top);
  planeCtx.scale(scaleX, scaleY);

  const burningPlanes = [];
  let rangeTextInfo = null;
  const activeColor = turnColors[turnIndex];
  const showGlow = !handleCircle.active && !flyingPoints.some(fp => fp.plane.color === activeColor);
  for(const p of points){
    if(!p.isAlive && !p.burning) continue;
    for(const seg of p.segments){
      gameCtx.beginPath();
      gameCtx.strokeStyle = colorFor(p.color);
      gameCtx.lineWidth = seg.lineWidth || 3;
      gameCtx.moveTo(seg.x1, seg.y1);
      gameCtx.lineTo(seg.x2, seg.y2);
      gameCtx.stroke();
    }
    const glowTarget = showGlow && p.color === activeColor && p.isAlive && !p.burning ? 1 : 0;
    if(p.glow === undefined) p.glow = glowTarget;
    p.glow += (glowTarget - p.glow) * 0.1;
    drawThinPlane(planeCtx, p, p.glow);

    if(handleCircle.active && handleCircle.pointRef === p){
      let vdx = handleCircle.shakyX - p.x;
      let vdy = handleCircle.shakyY - p.y;
      let vdist = Math.hypot(vdx, vdy);
      if(vdist > MAX_DRAG_DISTANCE){
        vdist = MAX_DRAG_DISTANCE;
      }
      const cells = (vdist / MAX_DRAG_DISTANCE) * flightRangeCells;
      const textX = p.x + POINT_RADIUS + 8;
      rangeTextInfo = { color: colorFor(p.color), cells, x: textX, y: p.y };
    }

    if(p.flagColor){
      planeCtx.save();
      planeCtx.strokeStyle = colorFor(p.flagColor);
      planeCtx.lineWidth = 3;
      planeCtx.beginPath();
      planeCtx.arc(p.x, p.y, POINT_RADIUS + 5, 0, Math.PI*2);
      planeCtx.stroke();
      planeCtx.restore();
    }
    if(p.burning){
      const cx = p.collisionX ?? p.x;
      const cy = p.collisionY ?? p.y;
      burningPlanes.push({plane: p, cx, cy});
    }
  }

  for(const {plane: p, cx, cy} of burningPlanes){
    if(p.explosionImg && !isExplosionFinished(p)){
      planeCtx.save();
      planeCtx.globalAlpha = 1;
      planeCtx.globalCompositeOperation = "source-over";
      planeCtx.drawImage(p.explosionImg, cx - EXPLOSION_SIZE/2, cy - EXPLOSION_SIZE/2, EXPLOSION_SIZE, EXPLOSION_SIZE);
      planeCtx.restore();
    } else {
    drawRedCross(planeCtx, cx, cy, 16 * PLANE_SCALE);
    }
  }

  if(rangeTextInfo){
    planeCtx.save();
    planeCtx.globalAlpha = 0.5;
    planeCtx.font = "14px sans-serif";
    planeCtx.textAlign = "left";
    planeCtx.textBaseline = "middle";
    planeCtx.lineWidth = 1;
    planeCtx.strokeStyle = "white";
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
  if(!blueFlagCarrier){
    drawFlag(gameCtx, centerX, 40, "blue");
  }
  if(!greenFlagCarrier){
    drawFlag(gameCtx, centerX, gameCanvas.height - 40, "green");
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
  if (!arrowSprite.complete) return;

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
  if(color === "blue"){
    greenScore++;
    syncStarState("green", greenScore);
    if(greenScore >= POINTS_TO_WIN){
      isGameOver = true;
      winnerColor = "green";
    }
  } else if(color === "green"){
    blueScore++;
    syncStarState("blue", blueScore);
    if(blueScore >= POINTS_TO_WIN){
      isGameOver = true;
      winnerColor = "blue";
    }
  }

  renderScoreboard();
}
function checkPlaneHits(plane, fp){
  if(isGameOver) return;
  const enemyColor = (plane.color==="green") ? "blue" : "green";
  for(const p of points){
    if(!p.isAlive || p.burning) continue;
    if(p.color !== enemyColor) continue;
    const dx = p.x - plane.x;
    const dy = p.y - plane.y;
    const d  = Math.hypot(dx, dy);
    if(d < POINT_RADIUS*2){
      p.isAlive = false;
      p.burning = true;
      p.explosionImg = createExplosionImage();
      const img = p.explosionImg;
      img.onload = () => {
        p.explosionStart = performance.now();
        setTimeout(() => {
          if (p.explosionImg === img) {
            img.remove();
            p.explosionImg = null;
          }
        }, EXPLOSION_DURATION_MS);
      };
      const cx = d === 0 ? plane.x : plane.x + dx / d * POINT_RADIUS;
      const cy = d === 0 ? plane.y : plane.y + dy / d * POINT_RADIUS;
      p.collisionX = cx;
      p.collisionY = cy;
      fp.hit = true;
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
  const centerX = FIELD_LEFT + FIELD_WIDTH / 2;
  const topY = 40;
  const bottomY = gameCanvas.height - 40;
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
  if(greenAlive===0 && !isGameOver){
    isGameOver = true; winnerColor="blue";
    if(blueScore < POINTS_TO_WIN && greenScore < POINTS_TO_WIN){
      roundTransitionTimeout = setTimeout(startNewRound, 1500);
    }
  } else if(blueAlive===0 && !isGameOver){
    isGameOver = true; winnerColor="green";
    if(blueScore < POINTS_TO_WIN && greenScore < POINTS_TO_WIN){
      roundTransitionTimeout = setTimeout(startNewRound, 1500);
    }
  }
}

/* ======= SCOREBOARD ======= */

function drawStarsUI(ctx){
  if (!STAR_READY) return;

  const rect = gameCanvas.getBoundingClientRect();
  const scaleXRaw = rect.width / CANVAS_BASE_WIDTH;
  const scaleYRaw = rect.height / CANVAS_BASE_HEIGHT;
  const layoutScaleX = Number.isFinite(scaleXRaw) && scaleXRaw > 0 ? scaleXRaw : 1;
  const layoutScaleY = Number.isFinite(scaleYRaw) && scaleYRaw > 0 ? scaleYRaw : 1;

  const frameLeft = (Number.isFinite(rect.left) ? rect.left : 0) - FRAME_PADDING_X * layoutScaleX;
  const frameTop  = (Number.isFinite(rect.top)  ? rect.top  : 0) - FRAME_PADDING_Y * layoutScaleY;

  // коэффициенты перевода макет→экран
  const sxCandidate = (typeof STAR_LAYOUT?.sx === 'function') ? STAR_LAYOUT.sx() : layoutScaleX;
  const syCandidate = (typeof STAR_LAYOUT?.sy === 'function') ? STAR_LAYOUT.sy() : layoutScaleY;
  const sx = Number.isFinite(sxCandidate) && sxCandidate !== 0 ? sxCandidate : layoutScaleX;
  const sy = Number.isFinite(syCandidate) && syCandidate !== 0 ? syCandidate : layoutScaleY;

  ctx.save();
  // рисуем из «чистого» состояния, чтобы чужие трансформации не протекали
  ctx.setTransform(1,0,0,1,0,0);
  ctx.imageSmoothingEnabled = false;

  try {
    ["blue","green"].forEach(color => {
      const placements = STAR_PLACEMENT[color];
      const rects   = STAR_SOURCE_RECTS[color];
      const slots   = STAR_STATE[color] || [];

      if (!Array.isArray(placements) || !Array.isArray(rects)) return;

      placements.forEach((slotPlacements, slotIdx) => {
        const slot = slots[slotIdx];
        if (!slot || slot.size === 0) return;

        for (let frag = 1; frag <= STAR_FRAGMENTS_PER_SLOT; frag++){
          if (!slot.has(frag)) continue;

          const [srcX,srcY,srcW,srcH] = rects[frag-1];
          const pieceScale = (typeof STAR_PIECE_SCALE !== 'undefined') ? STAR_PIECE_SCALE : 1;

          const dstW = Math.round(srcW * pieceScale * sx);
          const dstH = Math.round(srcH * pieceScale * sy);

          const placement = slotPlacements?.[frag-1];
          if (!placement || typeof placement.x !== 'number' || typeof placement.y !== 'number') continue;

          const scaledX = placement.x * sx;
          const scaledY = placement.y * sy;
          const screenX = Math.round(frameLeft + scaledX);
          const screenY = Math.round(frameTop + scaledY);

          ctx.drawImage(STAR_IMG, srcX,srcY,srcW,srcH, screenX, screenY, dstW, dstH);
        }
      });
    });
  } catch (err){
    console.warn('[STAR] drawStarsUI error:', err);
  } finally {
    ctx.restore();
  }
}

function renderScoreboard(){
  updateTurnIndicators();
  // `drawPlanesAndTrajectories()` already clears the plane canvas every frame
  // before rendering the planes. Clearing it again here would erase the planes
  // that were just drawn, making them disappear. Draw the HUD on top of the
  // existing planes without clearing the canvas again.
  planeCtx.save();

  const rect = gameCanvas.getBoundingClientRect();
  const scale = rect.width / CANVAS_BASE_WIDTH;
  const containerLeft = rect.left - FRAME_PADDING_X * scale;
  const containerTop = rect.top - FRAME_PADDING_Y * scale;
  const containerWidth = FRAME_BASE_WIDTH * scale;

  const margin = 10 * scale;

  // Blue player's HUD (mini planes and numeric score)
  drawPlayerHUD(
    planeCtx,
    containerLeft + containerWidth - margin,
    containerTop + margin,
    "blue",
    blueScore,
    turnColors[turnIndex] === "blue",
    true
  );

  // Green player's HUD (numeric score)
  drawPlayerHUD(
    planeCtx,
    containerLeft + margin,
    containerTop + margin,
    "green",
    greenScore,
    turnColors[turnIndex] === "green",
    false
  );

  drawStarsUI(planeCtx);

  planeCtx.restore();
}

function updateTurnIndicators(){
  const color = turnColors[turnIndex];
  const isBlueTurn = color === 'blue';
  mantisIndicator.classList.toggle('active', isBlueTurn);
  goatIndicator.classList.toggle('active', !isBlueTurn);
}

function drawPlayerHUD(ctx, x, y, color, score, isTurn, alignRight){
  ctx.save();
  ctx.translate(x, y);
  ctx.font = "14px 'Patrick Hand', cursive";
  ctx.textBaseline = "top";
  ctx.textAlign = alignRight ? "right" : "left";

  const planes = points.filter(p => p.color === color);
  const maxPerRow = 4;
  const spacingX = 20;
  const iconScale = 0.8;
  const iconSize = 16 * PLANE_SCALE * iconScale;
  const iconHalf = iconSize / 2;

  const scoreText = String(score);
  const scoreWidth = ctx.measureText(scoreText).width;

  let statusText = '';
  if (phase === 'AA_PLACEMENT') {
    if (currentPlacer === color) {
      statusText = 'Placing AA';
    } else {
      statusText = 'Enemy placing AA';
    }
  }
  const statusWidth = statusText ? ctx.measureText(statusText).width : 0;

  const iconCount = Math.min(planes.length, maxPerRow);

  if (!isTurn) {
    ctx.globalAlpha = 0.65;
  }

  for (let i = 0; i < iconCount; i++) {
    const p = planes[i];
    const px = alignRight ? -i * spacingX : i * spacingX;
    drawMiniPlaneWithCross(ctx, px, 0, color, p.isAlive, p.burning && isExplosionFinished(p), iconScale);
  }

  ctx.fillStyle = colorFor(color);
  ctx.fillText(scoreText, 0, 20);

  if (statusText) {
    if (phase === 'AA_PLACEMENT' && currentPlacer !== color) {
      ctx.fillStyle = '#888';
    } else {
      ctx.fillStyle = colorFor(color);
    }
    ctx.fillText(statusText, 0, 40);
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

function addBuildingsRandomly(count){
  for(let i=0;i<count;i++){
    const b = generateRandomBuildingAligned();
    if(b) buildings.push(b);
  }
}
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
    if(!advancedSettingsBtn?.classList.contains('selected')){
      settings.mapIndex = Math.floor(Math.random() * MAPS.length);
      applyCurrentMap();
    }
  }
  startNewRound();
});
noBtn.addEventListener("click", () => {
  modeMenuDiv.style.display="block";
  resetGame();
});

function startNewRound(){
  if(roundTransitionTimeout){
    clearTimeout(roundTransitionTimeout);
    roundTransitionTimeout = null;
  }
  endGameDiv.style.display = "none";
  isGameOver=false; winnerColor=null;

  STAR_NEXT_SLOT = { blue: 0, green: 0 };
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
function applyCurrentMap(){
  buildings = [];
  const map = MAPS[settings.mapIndex] || MAPS[0];
  brickFrameImg.src = map.file;
  updateFieldDimensions();
  renderScoreboard();
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

  const scale = Math.min(
    window.innerWidth / FRAME_BASE_WIDTH,
    window.innerHeight / FRAME_BASE_HEIGHT
  );

  const containerWidth = FRAME_BASE_WIDTH * scale;
  const containerHeight = FRAME_BASE_HEIGHT * scale;
  gameContainer.style.width = containerWidth + 'px';
  gameContainer.style.height = containerHeight + 'px';
  gameContainer.style.left = (window.innerWidth - containerWidth) / 2 + 'px';
  gameContainer.style.top = (window.innerHeight - containerHeight) / 2 + 'px';
  gameContainer.style.backgroundSize = containerWidth + 'px ' + containerHeight + 'px';
  const canvas = gameCanvas;
  canvas.style.width = CANVAS_BASE_WIDTH * scale + 'px';
  canvas.style.height = CANVAS_BASE_HEIGHT * scale + 'px';
  canvas.style.left = FRAME_PADDING_X * scale + 'px';
  canvas.style.top = FRAME_PADDING_Y * scale + 'px';
  canvas.width = CANVAS_BASE_WIDTH;
  canvas.height = CANVAS_BASE_HEIGHT;

  [mantisIndicator, goatIndicator].forEach(ind => {
    ind.style.width = containerWidth + 'px';
    ind.style.height = FRAME_BASE_HEIGHT / 2 * scale + 'px';
    ind.style.backgroundSize = containerWidth + 'px ' + containerHeight + 'px';
  });
  mantisIndicator.style.top = '0px';
  goatIndicator.style.top = containerHeight / 2 + 'px';

  updateFieldDimensions();

  // Overlay canvases cover full screen for proper alignment
  [aimCanvas, planeCanvas].forEach(overlay => {
    overlay.width = window.innerWidth;
    overlay.height = window.innerHeight;
    overlay.style.width = window.innerWidth + 'px';
    overlay.style.height = window.innerHeight + 'px';
  });

  // Переинициализируем самолёты
  if(points.length === 0) {
    initPoints();
  }
}

window.addEventListener('resize', resizeCanvas);
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
resizeCanvas();
resetGame();
