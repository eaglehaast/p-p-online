const MIN_FLIGHT_RANGE_CELLS = 5;
const MAX_FLIGHT_RANGE_CELLS = 30;
const MIN_AMPLITUDE = 0;
const MAX_AMPLITUDE = 20;

const MAPS = [
  { name: 'Clear Sky', file: 'map 1 - clear sky 3.png' },
  { name: '5 Bricks', file: 'map 2 - 5 bricks.png' },
  { name: 'Diagonals', file: 'map 3 diagonals.png' }
];

const DEFAULT_SETTINGS = {
  flightRangeCells: 15,
  aimingAmplitude: 10 / 5,
  addAA: false,
  sharpEdges: false,
  addCargo: false,
  mapIndex: 0
};

class JetFlameRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.baseWidth = options.baseWidth ?? 54;
    this.baseHeight = options.baseHeight ?? 24;
    this.scale = 1;
    this.displayWidth = this.baseWidth;
    this.displayHeight = this.baseHeight;
    this.dpr = window.devicePixelRatio || 1;
    this.elapsed = 0;
    this.particles = [];
    this.spawnAccumulator = 0;
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

    this.update(dt);
    this.draw();

    requestAnimationFrame(this._tick);
  }

  update(dt) {
    const emissionRate = 45 * this.scale;
    this.spawnAccumulator += dt * emissionRate;

    while (this.spawnAccumulator > 1) {
      this.spawnParticle();
      this.spawnAccumulator -= 1;
    }

    this.particles = this.particles.filter(particle => {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.size += particle.growth * dt;
      return particle.life > 0 && particle.x + particle.size > 0;
    });
  }

  spawnParticle() {
    const baseSpeed = 90 + Math.random() * 70;
    const wobble = (Math.random() - 0.5) * 0.3;
    const vx = -(baseSpeed + Math.random() * 20) * (1 + wobble) * this.scale;
    const vy = (Math.random() - 0.5) * 28 * this.scale;
    const size = (6 + Math.random() * 5) * this.scale;
    const life = 0.4 + Math.random() * 0.35;
    const originX = this.displayWidth * 0.9;
    const originY = this.displayHeight * 0.55 + (Math.random() - 0.5) * 4;

    this.particles.push({
      x: originX,
      y: originY,
      vx,
      vy,
      size,
      life,
      maxLife: life,
      growth: (8 + Math.random() * 10) * this.scale
    });
  }

  drawFlameBody(ctx) {
    const w = this.displayWidth;
    const h = this.displayHeight;
    const mid = h / 2;

    const baseLength = w * 0.9;
    const length = baseLength + Math.sin(this.elapsed * 2.8) * w * 0.05;
    const topWave = Math.sin(this.elapsed * 5.2) * h * 0.08;
    const bottomWave = Math.cos(this.elapsed * 4.1) * h * 0.07;

    const gradient = ctx.createLinearGradient(w, mid, w - length, mid);
    gradient.addColorStop(0, 'rgba(255, 233, 186, 0.95)');
    gradient.addColorStop(0.28, 'rgba(255, 194, 116, 0.9)');
    gradient.addColorStop(0.55, 'rgba(255, 141, 64, 0.78)');
    gradient.addColorStop(0.82, 'rgba(255, 78, 34, 0.45)');
    gradient.addColorStop(1, 'rgba(160, 28, 18, 0)');

    ctx.beginPath();
    ctx.moveTo(w, mid);
    ctx.bezierCurveTo(w - length * 0.16, mid - h * 0.08 + topWave, w - length * 0.52, mid - h * 0.46, w - length, mid);
    ctx.bezierCurveTo(w - length * 0.52, mid + h * 0.46 + bottomWave, w - length * 0.16, mid + h * 0.08, w, mid);
    ctx.fillStyle = gradient;
    ctx.fill();

    const innerLength = length * 0.68;
    const innerGradient = ctx.createLinearGradient(w, mid, w - innerLength, mid);
    innerGradient.addColorStop(0, 'rgba(255, 247, 224, 0.96)');
    innerGradient.addColorStop(0.42, 'rgba(255, 205, 132, 0.75)');
    innerGradient.addColorStop(1, 'rgba(255, 160, 60, 0.15)');

    ctx.beginPath();
    ctx.moveTo(w, mid);
    ctx.bezierCurveTo(w - innerLength * 0.22, mid - h * 0.05 + topWave * 0.55, w - innerLength * 0.5, mid - h * 0.28, w - innerLength, mid);
    ctx.bezierCurveTo(w - innerLength * 0.5, mid + h * 0.28 + bottomWave * 0.55, w - innerLength * 0.22, mid + h * 0.05, w, mid);
    ctx.fillStyle = innerGradient;
    ctx.fill();

    const coreLength = innerLength * 0.7;
    const coreGradient = ctx.createLinearGradient(w, mid, w - coreLength, mid);
    coreGradient.addColorStop(0, 'rgba(255, 255, 245, 0.9)');
    coreGradient.addColorStop(1, 'rgba(255, 210, 140, 0.25)');

    ctx.beginPath();
    ctx.moveTo(w, mid);
    ctx.bezierCurveTo(w - coreLength * 0.24, mid - h * 0.03 + topWave * 0.35, w - coreLength * 0.46, mid - h * 0.15, w - coreLength, mid);
    ctx.bezierCurveTo(w - coreLength * 0.46, mid + h * 0.15 + bottomWave * 0.35, w - coreLength * 0.24, mid + h * 0.03, w, mid);
    ctx.fillStyle = coreGradient;
    ctx.fill();
  }

  drawParticles(ctx) {
    this.particles.forEach(particle => {
      const t = particle.life / particle.maxLife;
      const radius = particle.size * (0.6 + (1 - t) * 0.9);
      const alpha = Math.max(0, t * 0.9);

      const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius);
      gradient.addColorStop(0, `rgba(255, 250, 230, ${0.8 * alpha})`);
      gradient.addColorStop(0.35, `rgba(255, 205, 125, ${0.65 * alpha})`);
      gradient.addColorStop(0.7, `rgba(255, 120, 60, ${0.45 * alpha})`);
      gradient.addColorStop(1, 'rgba(160, 40, 20, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(particle.x, particle.y, radius * 1.35, radius * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    this.drawFlameBody(ctx);
    this.drawParticles(ctx);
  }
}

class ContrailRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.baseWidth = options.baseWidth ?? 98;
    this.baseHeight = options.baseHeight ?? 68;
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
const mapPreview = document.getElementById('mapPreview');
const rangeFlameCanvas = document.getElementById('rangeFlameCanvas');
const rangeContrailCanvas = document.getElementById('rangeContrailCanvas');
const menuFlameCanvas = document.getElementById('menuFlame');
const flameOptions = { baseWidth: 54, baseHeight: 24 };
const rangeFlameRenderer = rangeFlameCanvas ? new JetFlameRenderer(rangeFlameCanvas, flameOptions) : null;
const contrailRenderer = rangeContrailCanvas instanceof HTMLCanvasElement ? new ContrailRenderer(rangeContrailCanvas) : null;
const menuFlameRenderer = menuFlameCanvas instanceof HTMLCanvasElement ? new JetFlameRenderer(menuFlameCanvas, flameOptions) : null;
const isTestHarnessPage = document.body.classList.contains('test-harness');

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

  if(rangeFlameRenderer){
    rangeFlameRenderer.setScale(ratio);
  }

  if(menuFlameRenderer){
    menuFlameRenderer.setScale(ratio);
  }

  if(contrailRenderer){
    contrailRenderer.setScale(ratio);
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
  mapPreview.style.backgroundImage = map ? `url('${map.file}')` : '';
}

function updateMapNameDisplay(){
  if(!mapNameDisplay) return;
  const map = MAPS[mapIndex];
  mapNameDisplay.textContent = map ? map.name : '';
  if(map){
    mapNameDisplay.setAttribute('aria-label', `Selected map: ${map.name}`);
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
  if(rangeFlameRenderer) rangeFlameRenderer.stop();
  if(menuFlameRenderer) menuFlameRenderer.stop();
  if(contrailRenderer) contrailRenderer.stop();
}

window.addEventListener('pagehide', cleanupRenderers);
window.addEventListener('beforeunload', cleanupRenderers);

updateFlightRangeDisplay();
updateFlightRangeFlame();
updateAmplitudeDisplay();
updateAmplitudeIndicator();
