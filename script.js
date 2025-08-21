/***************************************************************
 * Paper Wings — mobile-friendly build
 * Flight range shown with a plane and animated exhaust flame.
 * Includes fixes for plane orientation, AI turns, and mini-icon counter.
 ***************************************************************/

/* ======= DOM ======= */
const scoreCanvas = document.getElementById("scoreCanvas");
const scoreCtx    = scoreCanvas.getContext("2d");

const scoreCanvasBottom = document.getElementById("scoreCanvasBottom");
const scoreCtxBottom    = scoreCanvasBottom.getContext("2d");

const gameCanvas  = document.getElementById("gameCanvas");
const gameCtx     = gameCanvas.getContext("2d");

const aimCanvas   = document.getElementById("aimCanvas");
const aimCtx      = aimCanvas.getContext("2d");

const modeMenuDiv = document.getElementById("modeMenu");
const hotSeatBtn  = document.getElementById("hotSeatBtn");
const computerBtn = document.getElementById("computerBtn");
const onlineBtn   = document.getElementById("onlineBtn");

const playBtn     = document.getElementById("playBtn");

const flightRangeMinusBtn = document.getElementById("flightRangeMinus");
const flightRangePlusBtn  = document.getElementById("flightRangePlus");
const mapMinusBtn   = document.getElementById("mapMinus");
const mapPlusBtn    = document.getElementById("mapPlus");
const amplitudeMinusBtn   = document.getElementById("amplitudeMinus");
const amplitudePlusBtn    = document.getElementById("amplitudePlus");
const addAAToggle         = document.getElementById("addAAToggle");

const endGameDiv  = document.getElementById("endGameButtons");
const yesBtn      = document.getElementById("yesButton");
const noBtn       = document.getElementById("noButton");
const flame       = document.getElementById("flame");


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
const CELL_SIZE            = 20;     // px
const POINT_RADIUS         = 15;     // px (увеличено для мобильных)
const AA_HIT_RADIUS        = POINT_RADIUS + 5; // slightly larger zone to hit Anti-Aircraft center
const HANDLE_SIZE          = 10;     // px
const BOUNCE_FRAMES        = 68;
const MAX_DRAG_DISTANCE    = 100;    // px
const ATTACK_RANGE_PX      = 300;    // px
const FIELD_BORDER_THICKNESS = 10;    // px, ширина кирпичной рамки по краям
let FIELD_BORDER_OFFSET = FIELD_BORDER_THICKNESS; // внутренняя граница для отражения
// Используем бесконечное количество сегментов,
// чтобы следы самолётов сохранялись до конца раунда.
const MAX_TRAIL_SEGMENTS   = Infinity;
const BUILDING_BUFFER      = CELL_SIZE / 2;
const MAX_BUILDINGS_GLOBAL = 100;
const PLANES_PER_SIDE      = 4;      // количество самолётов у каждой команды


const MIN_FLIGHT_RANGE_CELLS = 5;
const MAX_FLIGHT_RANGE_CELLS = 30;

const MIN_AMPLITUDE        = 0;
const MAX_AMPLITUDE        = 30;     // UI показывает как *2°
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




const MAPS = ["clear sky", "wall", "two walls", "sharp edges"];
let mapIndex = 1;

let flightRangeCells = 15;     // значение «в клетках» для меню/физики
let buildingsCount   = 0;


let aimingAmplitude  = 10;     // 0..30 (UI показывает *2)

let isGameOver   = false;
let winnerColor  = null;
let gameMode     = null;
let selectedMode = null;

let hasShotThisRound = false;

let globalFrame  = 0;
let oscillationPhase = 0;
const oscillationSpeed = 0.02;

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

let settings = {
  addAA: localStorage.getItem('settings.addAA') === 'true'
};


let greenVictories = 0;
let blueVictories  = 0;

let animationFrameId = null;
let menuAnimFrameId  = null;

/* Планирование хода ИИ */
let aiMoveScheduled = false;

/* ======= INIT ======= */
function initPoints(){
  points = [];
  const spacing = gameCanvas.width / (PLANES_PER_SIDE + 1);

  // Green (низ поля) — смотрят ВВЕРХ (к сопернику)
  for(let i = 1; i <= PLANES_PER_SIDE; i++){
    const x = spacing * i;
    points.push(makePlane(x, gameCanvas.height - 40, "green", 0)); // 0 рад — нос вверх
  }

  // Blue (верх поля) — смотрят ВНИЗ
  for(let i = 1; i <= PLANES_PER_SIDE; i++){
    const x = spacing * i;
    points.push(makePlane(x, 40, "blue", Math.PI)); // π рад — нос вниз
  }
}
function makePlane(x,y,color,angle){
  return {
    x, y,
    color,
    isAlive:true,
    burning:false,
    angle,
    segments:[],
    collisionX:null,
    collisionY:null,
    prevX: x,
    prevY: y
  };
}

function resetGame(){
  isGameOver= false;
  winnerColor= null;
  endGameDiv.style.display = "none";

  lastFirstTurn= 1 - lastFirstTurn;
  turnIndex= lastFirstTurn;

  globalFrame=0;
  flyingPoints= [];
  buildings = [];
  mapIndex = 1;
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

  aimingAmplitude = 10;
  updateAmplitudeDisplay();
  updateFlightRangeDisplay();
  resetFlightRangeFlame();

  // Кнопки активны
  setControlsEnabled(true);

  // Play disabled
  playBtn.disabled = true;
  playBtn.classList.remove("active");
  playBtn.classList.add("disabled");

  // Показать меню, скрыть канвасы
  modeMenuDiv.style.display = "block";
  scoreCanvas.style.display = "none";
  gameCanvas.style.display = "none";
  scoreCanvasBottom.style.display = "none";
  aimCanvas.style.display = "none";

  // Остановить основной цикл
  stopGameLoop();
  // Запустить анимацию меню (индикатор)
  startMenuAnimation();

  initPoints();
  renderScoreboard();
}
function setControlsEnabled(enabled){
  flightRangeMinusBtn.disabled = !enabled;
  flightRangePlusBtn.disabled  = !enabled;
  mapMinusBtn.disabled   = !enabled;
  mapPlusBtn.disabled    = !enabled;
  amplitudeMinusBtn.disabled   = !enabled;
  amplitudePlusBtn.disabled    = !enabled;
}

function stopGameLoop(){
  if(animationFrameId !== null){
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}
function startGameLoop(){
  if(animationFrameId === null){
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

  scoreCanvas.style.display = "block";
  gameCanvas.style.display = "block";
  scoreCanvasBottom.style.display = "block";
  aimCanvas.style.display = "block";

  stopMenuAnimation();
  if (settings.addAA) {
    phase = 'AA_PLACEMENT';
    currentPlacer = 'green';
  } else {
    phase = 'TURN';
  }
  startGameLoop();
});

/* Меню: анимация индикатора амплитуды */
function startMenuAnimation(){
  if(menuAnimFrameId!==null) return;
  oscillationPhase = 0;
  const loop = ()=>{
    updateAmplitudeIndicator();
    oscillationPhase += oscillationSpeed;
    menuAnimFrameId = requestAnimationFrame(loop);
  };
  loop();
}
function stopMenuAnimation(){
  if(menuAnimFrameId!==null){
    cancelAnimationFrame(menuAnimFrameId);
    menuAnimFrameId = null;
  }
}

/* ======= INPUT (slingshot) ======= */
const handleCircle={
  baseX:0, baseY:0,
  shakyX:0, shakyY:0,
  offsetX:0, offsetY:0,
  active:false,
  pointRef:null
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
    Math.hypot(pt.x - mx, pt.y - my) <= POINT_RADIUS
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
  const color = currentPlacer === 'green'
    ? 'rgba(0,255,0,0.05)'
    : 'rgba(0,0,255,0.05)';

  gameCtx.fillStyle = color;
  if(currentPlacer === 'green'){
    gameCtx.fillRect(0, half, gameCanvas.width, half);
  } else {
    gameCtx.fillRect(0, 0, gameCanvas.width, half);
  }
  gameCtx.restore();
}

function drawAAPreview(){
  if(phase !== 'AA_PLACEMENT' || !aaPlacementPreview) return;
  const {x, y} = aaPlacementPreview;
  if(!isValidAAPlacement(x, y)) return;

  gameCtx.save();
  gameCtx.globalAlpha = 0.3;
  gameCtx.strokeStyle = currentPlacer;
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
    gameCtx.strokeStyle = currentPlacer;
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
  gameCtx.strokeStyle = currentPlacer;
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
  gameCtx.fillStyle = currentPlacer;
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
  gameCtx.fillStyle = currentPlacer;
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
  if(isGameOver || !gameMode){
    cleanupHandle(); return;
  }

  let plane= handleCircle.pointRef;
  let dx= handleCircle.shakyX - plane.x;
  let dy= handleCircle.shakyY - plane.y;

  let dragDistance = Math.hypot(dx, dy);
  // Cancel the move if released before the first tick mark
  if(dragDistance < CELL_SIZE){
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
  const speedPerFrame = (flightDistancePx / BOUNCE_FRAMES);
  const scale = dragDistance / MAX_DRAG_DISTANCE;

  // скорость — ПРОТИВ направления натяжки
  let vx= -Math.cos(dragAngle) * scale * speedPerFrame;
  let vy= -Math.sin(dragAngle) * scale * speedPerFrame;

  // нос по скорости
  plane.angle = Math.atan2(vy, vx) + Math.PI/2;

  flyingPoints.push({
    plane, vx, vy,
    framesLeft: BOUNCE_FRAMES,
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

  let best = null; // {plane, enemy, vx, vy, totalDist}

  const flightDistancePx = flightRangeCells * CELL_SIZE;
  const speedPerFrame    = (flightDistancePx / BOUNCE_FRAMES);

  for(const plane of aiPlanes){
    if(flyingPoints.some(fp=>fp.plane===plane)) continue;

    for(const enemy of enemies){
      // Прямой выстрел (если нет преград)
      if(isPathClear(plane.x, plane.y, enemy.x, enemy.y)){
        let dx= enemy.x - plane.x;
        let dy= enemy.y - plane.y;
        let baseAngle= Math.atan2(dy, dx);
        let dev = getRandomDeviation(Math.hypot(dx,dy), AI_MAX_ANGLE_DEVIATION);
        let ang = baseAngle + dev;

        const dist = Math.hypot(dx,dy);
        const scale = Math.min(dist / MAX_DRAG_DISTANCE, 1);

        const vx = Math.cos(ang) * scale * speedPerFrame;
        const vy = Math.sin(ang) * scale * speedPerFrame;
        const totalDist = dist;

        if(!best || totalDist < best.totalDist){
          best = {plane, enemy, vx, vy, totalDist};
        }
      } else {
        // Одно отражение
        const mirror = findMirrorShot(plane, enemy);
        if(mirror){
          const dx = mirror.mirrorTarget.x - plane.x;
          const dy = mirror.mirrorTarget.y - plane.y;
          const ang = Math.atan2(dy, dx) + getRandomDeviation(mirror.totalDist, AI_MAX_ANGLE_DEVIATION);

          const scale = Math.min(mirror.totalDist / (2*MAX_DRAG_DISTANCE), 1);
          const vx = Math.cos(ang) * scale * speedPerFrame;
          const vy = Math.sin(ang) * scale * speedPerFrame;

          if(!best || mirror.totalDist < best.totalDist){
            best = {plane, enemy, vx, vy, totalDist: mirror.totalDist};
          }
        }
      }
    }
  }

  // Ничего подходящего — подползти
  if(!best){
    const plane = aiPlanes[0];
    const enemy = enemies.reduce((a,b)=> (dist(plane,a)<dist(plane,b)?a:b));
    const dx= enemy.x - plane.x, dy= enemy.y - plane.y;
    const ang = Math.atan2(dy, dx) + getRandomDeviation(Math.hypot(dx,dy), AI_MAX_ANGLE_DEVIATION);

    const desired = Math.min(Math.hypot(dx,dy)*0.5, MAX_DRAG_DISTANCE);
    const scale   = desired / MAX_DRAG_DISTANCE;

    best = {
      plane, enemy,
      vx: Math.cos(ang)*scale*speedPerFrame,
      vy: Math.sin(ang)*scale*speedPerFrame,
      totalDist: desired
    };
  }

  if(best){
    best.plane.angle = Math.atan2(best.vy, best.vx) + Math.PI/2;
    flyingPoints.push({
      plane: best.plane, vx: best.vx, vy: best.vy,
      framesLeft: BOUNCE_FRAMES, hit:false, collisionCooldown:0
    });
    if(!hasShotThisRound){
      hasShotThisRound = true;
      renderScoreboard();
    }
  }
}
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function getRandomDeviation(distance, maxDev){
  let nd = Math.min(distance/ATTACK_RANGE_PX, 1);
  return (Math.random()*2 - 1) * (maxDev * nd);
}

/* Зеркальный выстрел (одно отражение) */
function findMirrorShot(plane, enemy){
  let best = null; // {edge, mirrorTarget, totalDist}

  for(const b of buildings){
    const left = b.x - b.width/2, right = b.x + b.width/2;
    const top  = b.y - b.height/2, bottom = b.y + b.height/2;

    const edges = [
      {type:"H", x1:left, y1:top,    x2:right, y2:top   },
      {type:"H", x1:left, y1:bottom, x2:right, y2:bottom},
      {type:"V", x1:left, y1:top,    x2:left,  y2:bottom},
      {type:"V", x1:right,y1:top,    x2:right, y2:bottom}
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
      if(!isPathClearExceptEdge(plane.x, plane.y, inter.x, inter.y, b, e)) continue;
      if(!isPathClearExceptEdge(inter.x, inter.y, enemy.x, enemy.y, b, e)) continue;

      const totalDist = Math.hypot(plane.x - inter.x, plane.y - inter.y) +
                        Math.hypot(inter.x  - enemy.x, inter.y  - enemy.y);

      if(!best || totalDist < best.totalDist){
        best = {edge:e, mirrorTarget, totalDist};
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
  const left = b.x - b.width/2, right = b.x + b.width/2;
  const top  = b.y - b.height/2, bottom = b.y + b.height/2;

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
  p.isAlive = false;
  p.burning = true;
  p.collisionX = p.x;
  p.collisionY = p.y;
  flyingPoints = flyingPoints.filter(x=>x!==fp);
  checkVictory();
  if(!isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
    turnIndex = (turnIndex + 1) % turnColors.length;
    if(gameMode === "computer" && turnColors[turnIndex] === "blue"){
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
      if(aa.hp<=0){ aaUnits = aaUnits.filter(a=>a!==aa); }
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
              p.isAlive=false; p.burning=true;
              p.collisionX=p.x; p.collisionY=p.y;
              if(fp) {
                flyingPoints = flyingPoints.filter(x=>x!==fp);
              }
              checkVictory();
              if(fp && !isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
                turnIndex = (turnIndex + 1) % turnColors.length;
                if(gameMode==="computer" && turnColors[turnIndex]==="blue"){
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
  globalFrame++;

  // фон
  gameCtx.clearRect(0,0, gameCanvas.width, gameCanvas.height);
  drawNotebookBackground(gameCtx, gameCanvas.width, gameCanvas.height);

  aimCtx.clearRect(0,0, aimCanvas.width, aimCanvas.height);

  // Планирование хода ИИ
  if (!isGameOver 
      && gameMode === "computer" 
      && turnColors[turnIndex] === "blue"
      && !aiMoveScheduled
      && !flyingPoints.some(fp => fp.plane.color === "blue")) {
    aiMoveScheduled = true;
    setTimeout(() => { doComputerMove(); }, 300);
  }

  const now = performance.now();
  for(const aa of aaUnits){
    aa.sweepAngleDeg = (aa.sweepAngleDeg + aa.rotationDegPerSec/60) % 360;
    aa.trail.push({angleDeg: aa.sweepAngleDeg, time: now});
    aa.trail = aa.trail.filter(seg => now - seg.time < AA_TRAIL_MS);
  }


  // полёты
  if(!isGameOver && flyingPoints.length){
    const current = [...flyingPoints];
    for(const fp of current){
      const p = fp.plane;

      p.x += fp.vx;
      p.y += fp.vy;

        // field borders
        if (p.x < FIELD_BORDER_OFFSET) {
          p.x = FIELD_BORDER_OFFSET;
          if (MAPS[mapIndex] === "sharp edges") {
            destroyPlane(fp);
            continue;
          }
          fp.vx = -fp.vx;
        }
        else if (p.x > gameCanvas.width - FIELD_BORDER_OFFSET) {
          p.x = gameCanvas.width - FIELD_BORDER_OFFSET;
          if (MAPS[mapIndex] === "sharp edges") {
            destroyPlane(fp);
            continue;
          }
          fp.vx = -fp.vx;
        }
        if (p.y < FIELD_BORDER_OFFSET) {
          p.y = FIELD_BORDER_OFFSET;
          if (MAPS[mapIndex] === "sharp edges") {
            destroyPlane(fp);
            continue;
          }
          fp.vy = -fp.vy;
        }
        else if (p.y > gameCanvas.height - FIELD_BORDER_OFFSET) {
          p.y = gameCanvas.height - FIELD_BORDER_OFFSET;
          if (MAPS[mapIndex] === "sharp edges") {
            destroyPlane(fp);
            continue;
          }
          fp.vy = -fp.vy;
        }

      // столкновения со зданиями (cooldown)
      if(fp.collisionCooldown>0){ fp.collisionCooldown--; }
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
      if(handleAAForPlane(p, fp)) continue;

      fp.framesLeft--;
      if(fp.framesLeft<=0){
        flyingPoints = flyingPoints.filter(x => x !== fp);
        // смена хода, когда полётов текущего цвета больше нет
        if(!isGameOver && !flyingPoints.some(x=>x.plane.color===p.color)){
          turnIndex = (turnIndex + 1) % turnColors.length;
          if(gameMode==="computer" && turnColors[turnIndex]==="blue"){
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

  // redraw field edges (bricks or nails depending on map)
  drawFieldEdges(gameCtx, gameCanvas.width, gameCanvas.height);

  // установки ПВО
  drawAAUnits();
  drawAAPreview();

  // самолёты + их трейлы
  drawPlanesAndTrajectories();

  // "ручка" при натяжке
  if(handleCircle.active && handleCircle.pointRef){
    oscillationPhase += oscillationSpeed;

    const plane= handleCircle.pointRef;
    let dx= handleCircle.baseX - plane.x;
    let dy= handleCircle.baseY - plane.y;
    let distPx= Math.hypot(dx, dy);

    // базовая амплитуда (чем сильнее натянул — тем больше дрожь)
    let baseAmp=0;
    const distCells= distPx / CELL_SIZE;
    if(distCells <=5)       baseAmp = (distCells/5)*10/4;
    else if(distCells <=10) baseAmp = (10 + ((distCells-5)*30)/5)/4;
    else                    baseAmp = 10;

    const amp = baseAmp * (aimingAmplitude/3);

    handleCircle.offsetX = amp * Math.cos(oscillationPhase);
    handleCircle.offsetY = amp * Math.sin(oscillationPhase);

    handleCircle.shakyX= handleCircle.baseX + handleCircle.offsetX;
    handleCircle.shakyY= handleCircle.baseY + handleCircle.offsetY;

    // ограничение видимой длины
    let vdx = handleCircle.shakyX - plane.x;
    let vdy = handleCircle.shakyY - plane.y;
    let vdist = Math.hypot(vdx, vdy);
    if(vdist > MAX_DRAG_DISTANCE){
      vdx *= MAX_DRAG_DISTANCE/vdist;
      vdy *= MAX_DRAG_DISTANCE/vdist;
      vdist = MAX_DRAG_DISTANCE;
    }

    const rect = gameCanvas.getBoundingClientRect();
    const scaleX = rect.width / gameCanvas.width;
    const scaleY = rect.height / gameCanvas.height;
    const startX = rect.left + plane.x * scaleX;
    const startY = rect.top  + plane.y * scaleY;
    const endX   = rect.left + (plane.x + vdx) * scaleX;
    const endY   = rect.top  + (plane.y + vdy) * scaleY;

    aimCtx.beginPath();
    aimCtx.strokeStyle = "black";
    aimCtx.lineWidth = 2;
    aimCtx.moveTo(startX, startY);
    aimCtx.lineTo(endX, endY);
    aimCtx.stroke();

    // треугольник-рукоятка
    drawHandleTriangle(aimCtx, endX, endY, endX - startX, endY - startY);

    // деления на линии натяжки (до 5)
    const dragAngle = Math.atan2(vdy, vdx);
    const tickAngle = dragAngle + Math.PI/2;
    const numTicks = Math.min(5, Math.floor(vdist / CELL_SIZE));
    for(let i=1; i<=numTicks; i++){
      const d = i*CELL_SIZE;
      if(d > vdist) break;
      const posX = plane.x + d*Math.cos(dragAngle);
      const posY = plane.y + d*Math.sin(dragAngle);
      const halfTick = (CELL_SIZE/2)/2;
      const startGX = posX - halfTick*Math.cos(tickAngle);
      const startGY = posY - halfTick*Math.sin(tickAngle);
      const endGX   = posX + halfTick*Math.cos(tickAngle);
      const endGY   = posY + halfTick*Math.sin(tickAngle);

      const startSX = rect.left + startGX * scaleX;
      const startSY = rect.top  + startGY * scaleY;
      const endSX   = rect.left + endGX   * scaleX;
      const endSY   = rect.top  + endGY   * scaleY;

      aimCtx.beginPath();
      aimCtx.strokeStyle="black";
      aimCtx.lineWidth=2;
      aimCtx.moveTo(startSX, startSY);
      aimCtx.lineTo(endSX, endSY);
      aimCtx.stroke();
    }
  }

  // табло
  renderScoreboard();

  // индикатор амплитуды
  updateAmplitudeIndicator();

  if(isGameOver && winnerColor){
    gameCtx.font="48px 'Patrick Hand', cursive";
    gameCtx.fillStyle= winnerColor;
    const text= `${winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1)} wins!`;
    const w= gameCtx.measureText(text).width;
    gameCtx.fillText(text, (gameCanvas.width - w)/2, gameCanvas.height/2 - 80);

    endGameDiv.style.display="block";
  }
  animationFrameId = requestAnimationFrame(gameDraw);
}

/* ======= RENDER ======= */
function drawNotebookBackground(ctx2d, w, h){
  ctx2d.fillStyle="#fffbea";
  ctx2d.fillRect(0,0,w,h);

  ctx2d.strokeStyle="#d3d3d3";
  ctx2d.lineWidth=1.5;
  for(let y=CELL_SIZE; y<h; y+=CELL_SIZE){
    ctx2d.beginPath(); ctx2d.moveTo(0,y); ctx2d.lineTo(w,y); ctx2d.stroke();
  }
  for(let x=CELL_SIZE; x<w; x+=CELL_SIZE){
    ctx2d.beginPath(); ctx2d.moveTo(x,0); ctx2d.lineTo(x,h); ctx2d.stroke();
  }
  ctx2d.beginPath(); ctx2d.moveTo(w-1,0); ctx2d.lineTo(w-1,h); ctx2d.stroke();

  ctx2d.setLineDash([10,5]);
  ctx2d.beginPath(); ctx2d.moveTo(0,h-1); ctx2d.lineTo(w,h-1); ctx2d.stroke();
  ctx2d.setLineDash([]);
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
  const brickHeight = FIELD_BORDER_THICKNESS;
  // draw all walls fully inside the canvas

  // top border
  ctx2d.save();
  ctx2d.translate(w / 2, brickHeight / 2);
  drawBrickWall(ctx2d, w, brickHeight);
  ctx2d.restore();

  // bottom border
  ctx2d.save();
  ctx2d.translate(w / 2, h - brickHeight / 2);
  drawBrickWall(ctx2d, w, brickHeight);
  ctx2d.restore();

  // left border
  ctx2d.save();
  ctx2d.translate(brickHeight / 2, h / 2);
  ctx2d.rotate(Math.PI / 2);
  drawBrickWall(ctx2d, h, brickHeight);
  ctx2d.restore();

  // right border
  ctx2d.save();
  ctx2d.translate(w - brickHeight / 2, h / 2);
  ctx2d.rotate(Math.PI / 2);
  drawBrickWall(ctx2d, h, brickHeight);
  ctx2d.restore();
}

function drawFieldEdges(ctx2d, w, h){
  if(MAPS[mapIndex] === "sharp edges"){
    drawNailEdges(ctx2d, w, h);
  } else {
    drawBrickEdges(ctx2d, w, h);
  }
}

function drawThinPlane(ctx2d, cx, cy, color, angle){
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.rotate(angle);
  ctx2d.strokeStyle= color;
  ctx2d.lineWidth=2;

  ctx2d.beginPath();
  ctx2d.moveTo(0, -20);
  ctx2d.lineTo(10, 10);
  ctx2d.lineTo(5, 10);
  ctx2d.lineTo(0, 18);
  ctx2d.lineTo(-5, 10);
  ctx2d.lineTo(-10, 10);
  ctx2d.closePath();
  ctx2d.stroke();

  ctx2d.restore();
}

function drawRedCross(ctx2d, cx, cy, size=20){
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.strokeStyle = "red";
  ctx2d.lineWidth = 2;
  ctx2d.beginPath();
  ctx2d.moveTo(-size/2, -size/2);
  ctx2d.lineTo( size/2,  size/2);
  ctx2d.moveTo( size/2, -size/2);
  ctx2d.lineTo(-size/2,  size/2);
  ctx2d.stroke();
  ctx2d.restore();
}

function drawMiniPlaneWithCross(ctx2d, x, y, color, isAlive, isBurning, scale=1){
  ctx2d.save();
  ctx2d.translate(x, y);
  ctx2d.scale(scale, scale);
  const angle = 0; // ВСЕГДА носом ВВЕРХ на табло
  ctx2d.rotate(angle);

  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2/scale;
  ctx2d.beginPath();
  ctx2d.moveTo(0, -8);
  ctx2d.lineTo(4, 4);
  ctx2d.lineTo(2, 4);
  ctx2d.lineTo(0, 7);
  ctx2d.lineTo(-2, 4);
  ctx2d.lineTo(-4, 4);
  ctx2d.closePath();
  ctx2d.stroke();

  if(isBurning){
    drawRedCross(ctx2d, 0, 0, 12);
  }
  ctx2d.restore();
}

function drawPlanesAndTrajectories(){
  for(const p of points){
    if(!p.isAlive && !p.burning) continue;
    for(const seg of p.segments){
      gameCtx.beginPath();
      gameCtx.strokeStyle= p.color;
      gameCtx.lineWidth= seg.lineWidth || 3;
      gameCtx.moveTo(seg.x1, seg.y1);
      gameCtx.lineTo(seg.x2, seg.y2);
      gameCtx.stroke();
    }
    drawThinPlane(gameCtx, p.x, p.y, p.color, p.angle);
    if(p.burning){
      drawRedCross(gameCtx, p.collisionX ?? p.x, p.collisionY ?? p.y, 16);
    }
  }
}

function drawBuildings(){
  for(const b of buildings){
    gameCtx.save();
    gameCtx.translate(b.x, b.y);
    drawBrickWall(gameCtx, b.width, b.height);
    gameCtx.restore();
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
      grad.addColorStop(0.5, aa.owner);
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
    gameCtx.strokeStyle = aa.owner;
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
    gameCtx.fillStyle = aa.owner;
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

function drawHandleTriangle(ctx, x, y, dx, dy){
  const size = HANDLE_SIZE;
  const angle = Math.atan2(dy, dx) - Math.PI/2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-size, size);
  ctx.lineTo(size, size);
  ctx.closePath();
  ctx.fillStyle = "black";
  ctx.fill();
  ctx.restore();
}

/* ======= HITS / VICTORY ======= */
function checkPlaneHits(plane, fp){
  if(isGameOver) return;
  const enemyColor = (plane.color==="green") ? "blue" : "green";
  for(const p of points){
    if(!p.isAlive || p.burning) continue;
    if(p.color !== enemyColor) continue;
    const d = Math.hypot(plane.x - p.x, plane.y - p.y);
    if(d < POINT_RADIUS*2){
      p.isAlive = false;
      p.burning = true;
      p.collisionX = p.x;
      p.collisionY = p.y;
      fp.hit = true;
      checkVictory();
      if(isGameOver) return;
    }
  }
}
function checkVictory(){
  const greenAlive = points.filter(p=>p.isAlive && p.color==="green").length;
  const blueAlive  = points.filter(p=>p.isAlive && p.color==="blue").length;
  if(greenAlive===0 && !isGameOver){
    isGameOver = true; winnerColor="blue"; blueVictories++;
  } else if(blueAlive===0 && !isGameOver){
    isGameOver = true; winnerColor="green"; greenVictories++;
  }
}

/* ======= SCOREBOARD ======= */

function renderScoreboard(){
  drawPlayerPanel(scoreCtx, "blue", blueVictories, turnColors[turnIndex] === "blue");
  drawPlayerPanel(scoreCtxBottom, "green", greenVictories, turnColors[turnIndex] === "green");
}

function drawPlayerPanel(ctx, color, victories, isTurn){
  const canvas = ctx.canvas;
  ctx.clearRect(0,0, canvas.width, canvas.height);
  ctx.fillStyle = "#fffbea";
  ctx.fillRect(0,0, canvas.width, canvas.height);

  const sectionW = canvas.width/3;

  // separators
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.beginPath();
  ctx.moveTo(sectionW,0); ctx.lineTo(sectionW,canvas.height);
  ctx.moveTo(sectionW*2,0); ctx.lineTo(sectionW*2,canvas.height);
  ctx.stroke();

  // plane counters
  const bluePlanes  = points.filter(p => p.color === "blue");
  const greenPlanes = points.filter(p => p.color === "green");
  const maxPerRow = 4;
  const spacingX = 20;
  const startX = sectionW / 2 - ((maxPerRow - 1) * spacingX) / 2;

  const rowSpacingY = 20;
  const startY = canvas.height / 2 - rowSpacingY / 2;
  const blueY = startY;
  const greenY = startY + rowSpacingY;
  for (let i = 0; i < Math.min(bluePlanes.length, maxPerRow); i++) {
    const p = bluePlanes[i];
    const x = startX + i * spacingX;
    drawMiniPlaneWithCross(ctx, x, blueY, "blue", p.isAlive, p.burning, 0.8);
  }
  for (let i = 0; i < Math.min(greenPlanes.length, maxPerRow); i++) {
    const p = greenPlanes[i];
    const x = startX + i * spacingX;
    drawMiniPlaneWithCross(ctx, x, greenY, "green", p.isAlive, p.burning, 0.8);
  }

  // turn indicator
  ctx.font = "14px 'Patrick Hand', cursive";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let statusText;
  if (phase === 'AA_PLACEMENT') {
    if (currentPlacer === color) {
      statusText = 'You are placing Anti-Aircraft';
      ctx.fillStyle = color;
    } else {
      statusText = 'Enemy is placing Anti-Aircraft';
      ctx.fillStyle = '#888';
    }
  } else if (isTurn) {
    statusText = "Your Turn";
    ctx.fillStyle = color;
  } else {
    statusText = "Enemy Pilot's Turn";
    ctx.fillStyle = "#888";
  }
  ctx.fillText(statusText, sectionW*1.5, canvas.height/2);

  // victories
  ctx.fillStyle = color;
  ctx.fillText(String(victories), sectionW*2.5, canvas.height/2);
}

/* ======= UI CONTROLS ======= */
const buttonIntervals = {};
function startButtonInterval(button, action, delay=200, interval=100){
  action();
  buttonIntervals[button.id] = setTimeout(function repeat(){
    action();
    buttonIntervals[button.id] = setTimeout(repeat, interval);
  }, delay);
}
function stopButtonInterval(button){
  clearTimeout(buttonIntervals[button.id]);
  delete buttonIntervals[button.id];
}

// Helper to support pointer and touch/mouse events
function setupRepeatButton(btn, step){
  const start = (event)=>{
    event.preventDefault();
    if(hasShotThisRound) return;
    startButtonInterval(btn, step);
  };
  const stop = ()=>stopButtonInterval(btn);
  if(window.PointerEvent){
    btn.addEventListener("pointerdown", start);
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
  } else {
    btn.addEventListener("mousedown", start);
    btn.addEventListener("mouseup", stop);
    btn.addEventListener("mouseleave", stop);
    btn.addEventListener("touchstart", start);
    btn.addEventListener("touchend", stop);
  }
}


// Add Anti-Aircraft toggle

if (addAAToggle) {
  addAAToggle.checked = settings.addAA;
  addAAToggle.addEventListener('change', (e)=>{
    settings.addAA = e.target.checked;
    localStorage.setItem('settings.addAA', settings.addAA);
  });
}

/* Flight Range */
setupRepeatButton(flightRangeMinusBtn, ()=>{
  if(flightRangeCells > MIN_FLIGHT_RANGE_CELLS){
    flightRangeCells--;
    updateFlightRangeFlame();
    updateFlightRangeDisplay();
  }
});
setupRepeatButton(flightRangePlusBtn, ()=>{
  if(flightRangeCells < MAX_FLIGHT_RANGE_CELLS){
    flightRangeCells++;
    updateFlightRangeFlame();
    updateFlightRangeDisplay();
  }
});

/* Map */
setupRepeatButton(mapMinusBtn, ()=>{
  mapIndex = (mapIndex - 1 + MAPS.length) % MAPS.length;
  applyCurrentMap();
});
setupRepeatButton(mapPlusBtn, ()=>{
  mapIndex = (mapIndex + 1) % MAPS.length;
  applyCurrentMap();
});

/* Aiming amplitude */
setupRepeatButton(amplitudeMinusBtn, ()=>{
  if(aimingAmplitude > MIN_AMPLITUDE){
    aimingAmplitude--;
    updateAmplitudeDisplay();
  }
});
setupRepeatButton(amplitudePlusBtn, ()=>{
  if(aimingAmplitude < MAX_AMPLITUDE){
    aimingAmplitude++;
    updateAmplitudeDisplay();
  }
});

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

    const x = getRandomGridAlignedCoordinate(gameCanvas.width,  width/2);
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
  startNewRound();
  endGameDiv.style.display="none";
});
noBtn.addEventListener("click", () => {
  endGameDiv.style.display="none";
  modeMenuDiv.style.display="block";
  resetGame();
});

function startNewRound(){
  isGameOver=false; winnerColor=null;

  lastFirstTurn = 1 - lastFirstTurn;
  turnIndex = lastFirstTurn;

  globalFrame=0;
  flyingPoints=[];
  hasShotThisRound=false;
  aaUnits = [];

  aiMoveScheduled = false;

  // оставляем текущую карту
  updateMapDisplay();

  aimingAmplitude = 10;
  updateAmplitudeDisplay();
  updateFlightRangeDisplay();
  resetFlightRangeFlame();

  setControlsEnabled(true);

  scoreCanvas.style.display = "block";
  gameCanvas.style.display = "block";
  scoreCanvasBottom.style.display = "block";

  initPoints(); // ориентации на базе
  renderScoreboard();
  if (settings.addAA) {
    phase = 'AA_PLACEMENT';
    currentPlacer = 'green';
  } else {
    phase = 'TURN';
  }
  if(animationFrameId===null) startGameLoop();
}

/* ======= UI Helpers (амплитуда) ======= */
function updateAmplitudeIndicator(){
  const el = document.getElementById("amplitudeIndicator");
  if(!el) return;
  const sight = el.querySelector(".crosshair");
  if(!sight) return;

  const angleDeg = aimingAmplitude * Math.sin(oscillationPhase);
  sight.style.transform = `rotate(${angleDeg}deg)`;

  const disp = document.getElementById("amplitudeAngleDisplay");
  if(disp){
    const maxAngleDeg = aimingAmplitude * 2;
    disp.textContent = `${maxAngleDeg.toFixed(0)}°`;
  }
}
function updateAmplitudeDisplay(){
  const disp = document.getElementById("amplitudeAngleDisplay");
  if(disp){
    const maxAngle = aimingAmplitude * 2;
    disp.textContent = `${maxAngle.toFixed(0)}°`;
  }
}

function updateMapDisplay(){
  const el = document.getElementById("mapNameValue");
  if(el){
    el.textContent = MAPS[mapIndex];
  }
}

function applyCurrentMap(){
  buildings = [];
  FIELD_BORDER_OFFSET = (MAPS[mapIndex] === "sharp edges") ? 0 : FIELD_BORDER_THICKNESS;
  if(MAPS[mapIndex] === "clear sky" || MAPS[mapIndex] === "sharp edges"){
    // no buildings to add
  } else if (MAPS[mapIndex] === "wall") {
    const wallWidth = CELL_SIZE * 8;
    const wallHeight = CELL_SIZE;
    buildings.push({
      type: "wall",
      x: gameCanvas.width / 2,
      y: gameCanvas.height / 2,
      width: wallWidth,
      height: wallHeight,
      color: "darkred"
    });
  } else if (MAPS[mapIndex] === "two walls") {
    const wallWidth = gameCanvas.width / 2;
    const wallHeight = CELL_SIZE;
    const offset = CELL_SIZE * 2;
    buildings.push({
      type: "wall",
      x: wallWidth / 2,
      y: gameCanvas.height / 2 + offset,
      width: wallWidth,
      height: wallHeight,
      color: "darkred"
    });
    buildings.push({
      type: "wall",
      x: gameCanvas.width - wallWidth / 2,
      y: gameCanvas.height / 2 - offset,
      width: wallWidth,
      height: wallHeight,
      color: "darkred"
    });
  }
  updateMapDisplay();
  renderScoreboard();
}

/* ======= Flight Range helpers (самолёт и пламя) ======= */
function updateFlightRangeDisplay(){
  const el = document.getElementById("flightRangeDisplay");
  if(el){
    el.textContent = `${flightRangeCells} cells`;
  }
}
function updateFlightRangeFlame(){
  const trails = document.querySelectorAll("#flightRangeIndicator .wing-trail");
  const minScale = 0.3;
  const maxScale = 1.2;
  const t = (flightRangeCells - MIN_FLIGHT_RANGE_CELLS) /
            (MAX_FLIGHT_RANGE_CELLS - MIN_FLIGHT_RANGE_CELLS);
  const ratio = minScale + t * (maxScale - minScale);


  if(flame){
    const baseWidth = 40;  // matches CSS default
    const baseHeight = 12; // matches CSS default
    flame.style.width = `${baseWidth * ratio}px`;
    flame.style.height = `${baseHeight * (0.9 + 0.1 * ratio)}px`;
  }
  if(trails.length){
    const baseTrailWidth = 35;  // matches CSS default
    const baseTrailHeight = 2;  // matches CSS default
    trails.forEach(trail => {
      trail.style.width = `${baseTrailWidth * ratio}px`;
      trail.style.height = `${baseTrailHeight}px`;
    });
  }
}
function resetFlightRangeFlame(){ updateFlightRangeFlame(); }

/* ======= CANVAS RESIZE ======= */
function resizeCanvas() {
  const canvas = gameCanvas;
  const container = document.body;
  
  // Максимальный размер с учётом табло
  const maxWidth = Math.min(window.innerWidth * 0.95, 350);
  const maxHeight = Math.min(window.innerHeight - 120, window.innerHeight * 0.7);
  
  canvas.style.width = maxWidth + 'px';
  canvas.style.height = maxHeight + 'px';

  // Масштабируем canvas пропорционально
  const scale = Math.min(maxWidth / 300, maxHeight / 400);
  canvas.width = 300 * scale;
  canvas.height = 400 * scale;

  aimCanvas.style.width = window.innerWidth + 'px';
  aimCanvas.style.height = window.innerHeight + 'px';
  aimCanvas.width = window.innerWidth;
  aimCanvas.height = window.innerHeight;


  // Переинициализируем самолёты
  if(points.length === 0) {
    initPoints();
  }
}

window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvas, 100);
});

/* ======= BOOTSTRAP ======= */
resizeCanvas();
resetGame();
