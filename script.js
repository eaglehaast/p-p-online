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

const modeMenuDiv = document.getElementById("modeMenu");
const hotSeatBtn  = document.getElementById("hotSeatBtn");
const computerBtn = document.getElementById("computerBtn");
const onlineBtn   = document.getElementById("onlineBtn");

const playBtn     = document.getElementById("playBtn");

const flightRangeMinusBtn = document.getElementById("flightRangeMinus");
const flightRangePlusBtn  = document.getElementById("flightRangePlus");
const buildingsMinusBtn   = document.getElementById("buildingsMinus");
const buildingsPlusBtn    = document.getElementById("buildingsPlus");
const amplitudeMinusBtn   = document.getElementById("amplitudeMinus");
const amplitudePlusBtn    = document.getElementById("amplitudePlus");

const endGameDiv  = document.getElementById("endGameButtons");
const yesBtn      = document.getElementById("yesButton");
const noBtn       = document.getElementById("noButton");

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
const HANDLE_SIZE          = 10;     // px
const BOUNCE_FRAMES        = 68;
const MAX_DRAG_DISTANCE    = 100;    // px
const ATTACK_RANGE_PX      = 300;    // px
const MAX_TRAIL_SEGMENTS   = 120;
const BUILDING_BUFFER      = CELL_SIZE / 2;
const MAX_BUILDINGS_GLOBAL = 100;

const MIN_FLIGHT_RANGE_CELLS = 1;
const MAX_FLIGHT_RANGE_CELLS = 25;

const MIN_AMPLITUDE        = 0;
const MAX_AMPLITUDE        = 30;     // UI показывает как *2°
const AI_MAX_ANGLE_DEVIATION = 0.25; // ~14.3°

/* ======= STATE ======= */
let flightRangeCells = 10;     // значение «в клетках» для меню/физики
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

let greenVictories = 0;
let blueVictories  = 0;

let animationFrameId = null;
let menuAnimFrameId  = null;

/* Планирование хода ИИ */
let aiMoveScheduled = false;

/* ======= INIT ======= */
function initPoints(){
  points=[];
  // Green (низ поля) — смотрят ВВЕРХ (к сопернику) 
  for(let x of [60, 120, 180, 240]){
    points.push(makePlane(x, gameCanvas.height - 40, "green", 0));           // 0 рад — нос вверх
  }
  // Blue (верх поля) — смотрят ВНИЗ
  for(let x of [60, 120, 180, 240]){
    points.push(makePlane(x, 40, "blue", Math.PI));      // π рад — нос вниз
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
  buildingsCount = 0;

  hasShotThisRound = false;

  selectedMode = null;
  gameMode = null;

  // UI reset
  hotSeatBtn.classList.remove("selected");
  computerBtn.classList.remove("selected");
  onlineBtn.classList.remove("selected");

  document.getElementById("buildingsCountValue").textContent = buildingsCount;

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
  buildingsMinusBtn.disabled   = !enabled;
  buildingsPlusBtn.disabled    = !enabled;
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

  stopMenuAnimation();
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
}

gameCanvas.addEventListener("mousedown", handleStart);
gameCanvas.addEventListener("touchstart", handleStart);

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

/* Коллизии самолёт <-> здание */
function planeBuildingCollision(fp, b){
  const p = fp.plane;
  const closestX = clamp(p.x, b.x - b.width/2,  b.x + b.width/2);
  const closestY = clamp(p.y, b.y - b.height/2, b.y + b.height/2);
  const dx = p.x - closestX;
  const dy = p.y - closestY;
  const dist2 = dx*dx + dy*dy;
  if(dist2 >= POINT_RADIUS*POINT_RADIUS) return false;

  // нормаль по минимальному проникновению
  const penLeft   = Math.abs(p.x - (b.x - b.width/2));
  const penRight  = Math.abs((b.x + b.width/2) - p.x);
  const penTop    = Math.abs(p.y - (b.y - b.height/2));
  const penBottom = Math.abs((b.y + b.height/2) - p.y);

  let nx=0, ny=0;
  const minPen = Math.min(penLeft, penRight, penTop, penBottom);
  if(minPen === penLeft)      { nx = -1; ny = 0; }
  else if(minPen === penRight){ nx =  1; ny = 0; }
  else if(minPen === penTop)  { nx =  0; ny = -1;}
  else                        { nx =  0; ny =  1;}

  // отражаем скорость
  const dot = fp.vx*nx + fp.vy*ny;
  fp.vx = fp.vx - 2*dot*nx;
  fp.vy = fp.vy - 2*dot*ny;

  // выталкивание
  const EPS = 0.5;
  p.x = p.x + nx * (POINT_RADIUS + EPS);
  p.y = p.y + ny * (POINT_RADIUS + EPS);

  // cooldown
  fp.collisionCooldown = 2;
  return true;
}

function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

/* ======= GAME LOOP ======= */
function gameDraw(){
  globalFrame++;

  // фон
  gameCtx.clearRect(0,0, gameCanvas.width, gameCanvas.height);
  drawNotebookBackground(gameCtx, gameCanvas.width, gameCanvas.height);

  // Планирование хода ИИ
  if (!isGameOver 
      && gameMode === "computer" 
      && turnColors[turnIndex] === "blue"
      && !aiMoveScheduled
      && !flyingPoints.some(fp => fp.plane.color === "blue")) {
    aiMoveScheduled = true;
    setTimeout(() => { doComputerMove(); }, 300);
  }

  // полёты
  if(!isGameOver && flyingPoints.length){
    const current = [...flyingPoints];
    for(const fp of current){
      const p = fp.plane;

      p.x += fp.vx;
      p.y += fp.vy;

      // отражения от границ поля
      if(p.x < POINT_RADIUS){ p.x = POINT_RADIUS; fp.vx = -fp.vx; }
      else if(p.x > gameCanvas.width - POINT_RADIUS){ p.x = gameCanvas.width - POINT_RADIUS; fp.vx = -fp.vx; }
      if(p.y < POINT_RADIUS){ p.y = POINT_RADIUS; fp.vy = -fp.vy; }
      else if(p.y > gameCanvas.height - POINT_RADIUS){ p.y = gameCanvas.height - POINT_RADIUS; fp.vy = -fp.vy; }

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

  // здания
  drawBuildings();

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

    // линия натяжки
    gameCtx.beginPath();
    gameCtx.strokeStyle="black";
    gameCtx.lineWidth=2;
    gameCtx.moveTo(plane.x, plane.y);
    gameCtx.lineTo(plane.x + vdx, plane.y + vdy);
    gameCtx.stroke();

    // треугольник-рукоятка
    drawHandleTriangle(gameCtx, plane.x + vdx, plane.y + vdy, vdx, vdy);

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
      const startX = posX - halfTick*Math.cos(tickAngle);
      const startY = posY - halfTick*Math.sin(tickAngle);
      const endX   = posX + halfTick*Math.cos(tickAngle);
      const endY   = posY + halfTick*Math.sin(tickAngle);

      gameCtx.beginPath();
      gameCtx.strokeStyle="black";
      gameCtx.lineWidth=2;
      gameCtx.moveTo(startX, startY);
      gameCtx.lineTo(endX, endY);
      gameCtx.stroke();
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

function drawBurningSpiral(ctx2d, cx, cy){
  ctx2d.save();
  ctx2d.translate(cx, cy);
  ctx2d.strokeStyle="red";
  ctx2d.lineWidth=2;

  const steps=200, turns=5, maxR=30;
  ctx2d.beginPath();
  for(let i=0; i<=steps; i++){
    let t = i / steps;
    let ang = turns * 2*Math.PI * t;
    let r = maxR * t;
    let xx= r * Math.cos(ang);
    let yy= r * Math.sin(ang);
    if(i===0) ctx2d.moveTo(xx,yy); else ctx2d.lineTo(xx,yy);
  }
  ctx2d.stroke();
  ctx2d.restore();
}

function drawMiniPlaneWithSpiral(ctx2d, x, y, color, isAlive, isBurning){
  ctx2d.save();
  ctx2d.translate(x, y);
  const angle = 0; // ВСЕГДА носом ВВЕРХ на табло
  ctx2d.rotate(angle);

  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = 2;
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
    drawBurningSpiral(ctx2d, 0, 0);
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
      drawBurningSpiral(gameCtx, p.collisionX ?? p.x, p.collisionY ?? p.y);
    }
  }
}

function drawBuildings(){
  for(const b of buildings){
    gameCtx.save();
    gameCtx.translate(b.x, b.y);
    gameCtx.strokeStyle = 'black';
    gameCtx.lineWidth = 1.5;
    gameCtx.strokeRect(-b.width/2, -b.height/2, b.width, b.height);
    drawBuildingGrid(gameCtx, b.width, b.height, 10, "darkred");
    gameCtx.restore();
  }
}
function drawBuildingGrid(ctx, width, height, cellSize, gridColor){
  ctx.strokeStyle = gridColor; ctx.lineWidth = 0.5;
  for(let x=-width/2; x<=width/2; x+=cellSize){
    ctx.beginPath(); ctx.moveTo(x, -height/2); ctx.lineTo(x, height/2); ctx.stroke();
  }
  for(let y=-height/2; y<=height/2; y+=cellSize){
    ctx.beginPath(); ctx.moveTo(-width/2, y); ctx.lineTo(width/2, y); ctx.stroke();
  }
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
  drawScoreCanvas(scoreCtx);
  drawEmptyScoreCanvasBottom(scoreCtxBottom);
}

function drawScoreCanvasBg(ctx2d){
  ctx2d.fillStyle="#fffbea";
  ctx2d.fillRect(0,0, scoreCanvas.width, scoreCanvas.height);

  ctx2d.strokeStyle="rgba(255,165,0,0.1)";
  ctx2d.lineWidth=1.5;
  const cell=20;
  for(let y=cell; y<scoreCanvas.height; y+=cell){
    ctx2d.beginPath(); ctx2d.moveTo(0,y); ctx2d.lineTo(scoreCanvas.width,y); ctx2d.stroke();
  }
  for(let x=cell; x<scoreCanvas.width; x+=cell){
    ctx2d.beginPath(); ctx2d.moveTo(x,0); ctx2d.lineTo(x,scoreCanvas.height); ctx2d.stroke();
  }
  ctx2d.beginPath(); ctx2d.moveTo(scoreCanvas.width-1,0); ctx2d.lineTo(scoreCanvas.width-1,scoreCanvas.height); ctx2d.stroke();
  ctx2d.setLineDash([10,5]);
  ctx2d.beginPath(); ctx2d.moveTo(0,scoreCanvas.height-1); ctx2d.lineTo(scoreCanvas.width,scoreCanvas.height-1); ctx2d.stroke();
  ctx2d.setLineDash([]);
}

function drawScoreCanvas(ctx){
  drawScoreCanvasBg(ctx);

  // подписи
  ctx.font = "20px 'Patrick Hand', cursive";
  ctx.fillStyle = "green";
  ctx.fillText("GREEN", 10, 25);

  ctx.fillStyle = "blue";
  const txtB = "BLUE";
  const twB = ctx.measureText(txtB).width;
  ctx.fillText(txtB, scoreCanvas.width - twB - 10, 25);

  // --- GREEN minis
  const greens = points.filter(p => p.color === "green");
  const greenPlaneSpacing = 20;
  const greenStartX = 50;
  const greenY = 28;
  for (let i = 0; i < greens.length; i++) {
    const p = greens[i];
    const planeX = greenStartX + i * greenPlaneSpacing;
    drawMiniPlaneWithSpiral(ctx, planeX, greenY, "green", p.isAlive, p.burning);
  }

  // --- BLUE minis
  const blues = points.filter(p => p.color === "blue");
  const bluePlaneSpacing = 20;
  const blueEndX = scoreCanvas.width - 50;
  const blueY = 28;
  for (let i = 0; i < blues.length; i++) {
    const p = blues[i];
    const planeX = blueEndX - (blues.length - 1 - i) * bluePlaneSpacing;
    drawMiniPlaneWithSpiral(ctx, planeX, blueY, "blue", p.isAlive, p.burning);
  }

  // центр
  const xCenter = scoreCanvas.width/2;
  const yCenter = scoreCanvas.height/2;

  // счёт побед
  ctx.font = "45px 'Patrick Hand', cursive";

  ctx.fillStyle = "rgba(0,128,0,0.2)";
  const gTxt = String(greenVictories);
  ctx.fillText(gTxt, xCenter - 80, yCenter + CELL_SIZE/2);

  ctx.fillStyle = "rgba(0,0,255,0.2)";
  const bTxt = String(blueVictories);
  ctx.fillText(bTxt, xCenter + 60, yCenter + CELL_SIZE/2);

  // чей ход
  const c = turnColors[turnIndex];
  const turnTxt = "TURN: " + c.toUpperCase();
  ctx.font = "24px 'Patrick Hand', cursive";
  ctx.fillStyle = c;
  const tw = ctx.measureText(turnTxt).width;
  ctx.fillText(turnTxt, (scoreCanvas.width - tw)/2, 30 + CELL_SIZE/2);
}

function drawEmptyScoreCanvasBottom(ctx){
  ctx.clearRect(0,0, scoreCanvasBottom.width, scoreCanvasBottom.height);
  ctx.fillStyle="#fffbea";
  ctx.fillRect(0,0, scoreCanvasBottom.width, scoreCanvasBottom.height);
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

/* Flight Range */
flightRangeMinusBtn.addEventListener("pointerdown", (event)=>{
  event.preventDefault();
  if(hasShotThisRound) return;
  startButtonInterval(flightRangeMinusBtn, ()=>{
    if(flightRangeCells > MIN_FLIGHT_RANGE_CELLS){
      flightRangeCells--;
      updateFlightRangeFlame();
      updateFlightRangeDisplay();
    }
  });
});
flightRangeMinusBtn.addEventListener("pointerup", ()=>stopButtonInterval(flightRangeMinusBtn));
flightRangeMinusBtn.addEventListener("pointerleave", ()=>stopButtonInterval(flightRangeMinusBtn));

flightRangePlusBtn.addEventListener("pointerdown", (event)=>{
  event.preventDefault();
  if(hasShotThisRound) return;
  startButtonInterval(flightRangePlusBtn, ()=>{
    if(flightRangeCells < MAX_FLIGHT_RANGE_CELLS){
      flightRangeCells++;
      updateFlightRangeFlame();
      updateFlightRangeDisplay();
    }
  });
});
flightRangePlusBtn.addEventListener("pointerup", ()=>stopButtonInterval(flightRangePlusBtn));
flightRangePlusBtn.addEventListener("pointerleave", ()=>stopButtonInterval(flightRangePlusBtn));

/* Buildings */
buildingsMinusBtn.addEventListener("pointerdown", (event)=>{
  event.preventDefault();
  if(hasShotThisRound) return;
  startButtonInterval(buildingsMinusBtn, ()=>{
    if(buildingsCount >= 4){
      buildingsCount -= 4;
      buildings.splice(-4,4);
    } else if(buildingsCount>0){
      buildingsCount = 0; buildings = [];
    }
    document.getElementById("buildingsCountValue").textContent = buildingsCount;
    renderScoreboard();
  });
});
buildingsMinusBtn.addEventListener("pointerup", ()=>stopButtonInterval(buildingsMinusBtn));
buildingsMinusBtn.addEventListener("pointerleave", ()=>stopButtonInterval(buildingsMinusBtn));

buildingsPlusBtn.addEventListener("pointerdown", (event)=>{
  event.preventDefault();
  if(hasShotThisRound) return;
  startButtonInterval(buildingsPlusBtn, ()=>{
    if(buildingsCount < MAX_BUILDINGS_GLOBAL){
      const add = Math.min(4, MAX_BUILDINGS_GLOBAL - buildingsCount);
      buildingsCount += add;
      addBuildingsRandomly(add);
      document.getElementById("buildingsCountValue").textContent = buildingsCount;
      renderScoreboard();
    }
  });
});
buildingsPlusBtn.addEventListener("pointerup", ()=>stopButtonInterval(buildingsPlusBtn));
buildingsPlusBtn.addEventListener("pointerleave", ()=>stopButtonInterval(buildingsPlusBtn));

/* Aiming amplitude */
amplitudeMinusBtn.addEventListener("pointerdown", (event)=>{
  event.preventDefault();
  if(hasShotThisRound) return;
  startButtonInterval(amplitudeMinusBtn, ()=>{
    if(aimingAmplitude > MIN_AMPLITUDE){
      aimingAmplitude--;
      updateAmplitudeDisplay();
    }
  });
});
amplitudeMinusBtn.addEventListener("pointerup", ()=>stopButtonInterval(amplitudeMinusBtn));
amplitudeMinusBtn.addEventListener("pointerleave", ()=>stopButtonInterval(amplitudeMinusBtn));

amplitudePlusBtn.addEventListener("pointerdown", (event)=>{
  event.preventDefault();
  if(hasShotThisRound) return;
  startButtonInterval(amplitudePlusBtn, ()=>{
    if(aimingAmplitude < MAX_AMPLITUDE){
      aimingAmplitude++;
      updateAmplitudeDisplay();
    }
  });
});
amplitudePlusBtn.addEventListener("pointerup", ()=>stopButtonInterval(amplitudePlusBtn));
amplitudePlusBtn.addEventListener("pointerleave", ()=>stopButtonInterval(amplitudePlusBtn));

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

  aiMoveScheduled = false;

  // оставляем здания
  document.getElementById("buildingsCountValue").textContent = buildingsCount;

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

  if(animationFrameId===null) startGameLoop();
}

/* ======= UI Helpers (амплитуда) ======= */
function updateAmplitudeIndicator(){
  const el = document.getElementById("amplitudeIndicator");
  if(!el) return;
  const line = el.querySelector(".line3");
  if(!line) return;

  const maxAngleDeg = aimingAmplitude * 2; // отображаемое в UI
  const oscDeg = maxAngleDeg * Math.sin(oscillationPhase);
  line.style.transform = `rotate(${oscDeg}deg) translateZ(0)`;

  const disp = document.getElementById("amplitudeAngleDisplay");
  if(disp){
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

/* ======= Flight Range helpers (самолёт и пламя) ======= */
function updateFlightRangeDisplay(){
  const el = document.getElementById("flightRangeDisplay");
  if(el){
    el.textContent = `${flightRangeCells} cells`;
  }
}
function updateFlightRangeFlame(){
  const flame = document.getElementById("flame");
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
    const baseTrailWidth = 30;
    const baseTrailHeight = 3;
    trails.forEach(trail => {
      trail.style.width = `${baseTrailWidth * ratio}px`;
      trail.style.height = `${baseTrailHeight * (0.9 + 0.1 * ratio)}px`;
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
initPoints();
resetFlightRangeFlame();
updateAmplitudeDisplay();
updateFlightRangeDisplay();
renderScoreboard();
startMenuAnimation();      // пока в меню — крутится индикатор
