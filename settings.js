const MIN_FLIGHT_RANGE_CELLS = 5;
const MAX_FLIGHT_RANGE_CELLS = 30;
const MIN_AMPLITUDE = 0;
const MAX_AMPLITUDE = 30;

const MAPS = [
  { name: 'Clear Sky', file: 'map 1 - clear sky 3.png' },
  { name: '5 Bricks', file: 'map 2 - 5 bricks.png' },
  { name: 'Diagonals', file: 'map 3 diagonals.png' }
];

const DEFAULT_SETTINGS = {
  flightRangeCells: 15,
  aimingAmplitude: 10 / 4,
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
    const emissionRate = 30 * this.scale;
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
    const baseSpeed = 70 + Math.random() * 50;
    const wobble = (Math.random() - 0.5) * 0.15;
    const vx = -(baseSpeed + Math.random() * 15) * (1 + wobble) * this.scale;
    const vy = (Math.random() - 0.5) * 18 * this.scale;
    const size = (6 + Math.random() * 4) * this.scale;
    const life = 0.48 + Math.random() * 0.32;
    const originX = this.displayWidth * 0.92;
    const originY = this.displayHeight * 0.55 + (Math.random() - 0.5) * 3;

    this.particles.push({
      x: originX,
      y: originY,
      vx,
      vy,
      size,
      life,
      maxLife: life,
      growth: (6 + Math.random() * 7) * this.scale
    });
  }

  drawFlameBody(ctx) {
    const w = this.displayWidth;
    const h = this.displayHeight;
    const mid = h / 2;
    const length = w * (0.88 + Math.sin(this.elapsed * 1.6) * 0.03);
    const topWave = Math.sin(this.elapsed * 2.2) * 1.3 * this.scale;
    const bottomWave = Math.cos(this.elapsed * 1.8) * 1.3 * this.scale;

    const gradient = ctx.createLinearGradient(w, mid, w - length, mid);
    gradient.addColorStop(0, 'rgba(255, 227, 161, 0.95)');
    gradient.addColorStop(0.45, 'rgba(255, 150, 64, 0.85)');
    gradient.addColorStop(1, 'rgba(255, 70, 0, 0)');

    ctx.beginPath();
    ctx.moveTo(w, mid);
    ctx.bezierCurveTo(w - length * 0.15, mid - 4 + topWave, w - length * 0.55, mid - h * 0.45, w - length, mid);
    ctx.bezierCurveTo(w - length * 0.55, mid + h * 0.45 + bottomWave, w - length * 0.15, mid + 4, w, mid);
    ctx.fillStyle = gradient;
    ctx.fill();

    const innerLength = length * 0.65;
    const innerGradient = ctx.createLinearGradient(w, mid, w - innerLength, mid);
    innerGradient.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
    innerGradient.addColorStop(1, 'rgba(255, 170, 50, 0.1)');

    ctx.beginPath();
    ctx.moveTo(w, mid);
    ctx.bezierCurveTo(w - innerLength * 0.2, mid - 2 + topWave * 0.5, w - innerLength * 0.55, mid - h * 0.25, w - innerLength, mid);
    ctx.bezierCurveTo(w - innerLength * 0.55, mid + h * 0.25 + bottomWave * 0.5, w - innerLength * 0.2, mid + 2, w, mid);
    ctx.fillStyle = innerGradient;
    ctx.fill();
  }

  drawParticles(ctx) {
    this.particles.forEach(particle => {
      const t = particle.life / particle.maxLife;
      const radius = particle.size * (0.5 + (1 - t));
      const alpha = Math.max(0, t);

      const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius);
      gradient.addColorStop(0, `rgba(255, 240, 200, ${0.7 * alpha})`);
      gradient.addColorStop(0.5, `rgba(255, 180, 80, ${0.5 * alpha})`);
      gradient.addColorStop(1, 'rgba(255, 70, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(particle.x, particle.y, radius * 1.1, radius * 0.8, 0, 0, Math.PI * 2);
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
if(Number.isNaN(aimingAmplitude)) aimingAmplitude = 10 / 4;
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
const menuFlameCanvas = document.getElementById('menuFlame');
const flameOptions = { baseWidth: 54, baseHeight: 24 };
const rangeFlameRenderer = rangeFlameCanvas ? new JetFlameRenderer(rangeFlameCanvas, flameOptions) : null;
const menuFlameRenderer = menuFlameCanvas instanceof HTMLCanvasElement ? new JetFlameRenderer(menuFlameCanvas, flameOptions) : null;
const isTestHarnessPage = document.body.classList.contains('test-harness');

function updateFlightRangeDisplay(){
  const el = document.getElementById('flightRangeDisplay');
  if(el) el.textContent = `${flightRangeCells}`;
}

function updateFlightRangeFlame(){
  const contrails = document.querySelectorAll('#flightRangeIndicator .jet-contrail');
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

  if(contrails.length){
    const baseTrailWidth = 40;
    const baseTrailHeight = 4;
    contrails.forEach(trail => {
      trail.style.width = `${baseTrailWidth * ratio}px`;
      trail.style.height = `${baseTrailHeight}px`;
    });
  }
}

function updateAmplitudeDisplay(){
  const disp = document.getElementById('amplitudeAngleDisplay');
  if(disp){
    const maxAngle = aimingAmplitude * 4;
    disp.textContent = `${maxAngle.toFixed(0)}°`;
  }
}

function updateAmplitudeIndicator(){
  const indicator = document.getElementById('amplitudeIndicator');
  if(indicator){
    const maxAngle = aimingAmplitude * 4;
    indicator.style.setProperty('--amp', `${maxAngle}deg`);
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

updateFlightRangeDisplay();
updateFlightRangeFlame();
updateAmplitudeDisplay();
updateAmplitudeIndicator();
