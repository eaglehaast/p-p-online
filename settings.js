const MIN_FLIGHT_RANGE_CELLS = 5;
const MAX_FLIGHT_RANGE_CELLS = 30;
const MIN_AMPLITUDE = 0;
const MAX_AMPLITUDE = 30;

const MAPS = [
  "clear sky",
  "wall",
  "two walls",
  "7 bricks",
  "15 diagonals",
  "deadly center line"
];


function getIntSetting(key, defaultValue){
  const value = parseInt(localStorage.getItem(key));
  return Number.isNaN(value) ? defaultValue : value;
}

let flightRangeCells = getIntSetting('settings.flightRangeCells', 15);
let aimingAmplitude  = parseFloat(localStorage.getItem('settings.aimingAmplitude'));
if(Number.isNaN(aimingAmplitude)) aimingAmplitude = 10 / 4;
let mapIndex = getIntSetting('settings.mapIndex', 1);
// Ensure stored index points to an existing map
if(mapIndex < 0 || mapIndex >= MAPS.length){
  mapIndex = 1;
}
let addAA = localStorage.getItem('settings.addAA') === 'true';
let sharpEdges = localStorage.getItem('settings.sharpEdges') === 'true';

const flightRangeMinusBtn = document.getElementById('flightRangeMinus');
const flightRangePlusBtn  = document.getElementById('flightRangePlus');
const amplitudeMinusBtn   = document.getElementById('amplitudeMinus');
const amplitudePlusBtn    = document.getElementById('amplitudePlus');
const mapMinusBtn = document.getElementById('mapMinus');
const mapPlusBtn  = document.getElementById('mapPlus');
const addAAToggle = document.getElementById('addAAToggle');
const sharpEdgesToggle = document.getElementById('sharpEdgesToggle');
const backBtn = document.getElementById('backBtn');

function updateFlightRangeDisplay(){
  const el = document.getElementById('flightRangeDisplay');
  if(el) el.textContent = `${flightRangeCells}`;
}

function updateFlightRangeFlame(){
  const trails = document.querySelectorAll('#flightRangeIndicator .wing-trail');
  const menuFlame = document.getElementById('menuFlame');
  const minScale = 0.8;
  const maxScale = 1.6;
  const t = (flightRangeCells - MIN_FLIGHT_RANGE_CELLS) /
            (MAX_FLIGHT_RANGE_CELLS - MIN_FLIGHT_RANGE_CELLS);
  const ratio = minScale + t * (maxScale - minScale);
  if(menuFlame){
    const baseWidth = 32;
    const baseHeight = 10;
    menuFlame.style.width = `${baseWidth * ratio}px`;
    menuFlame.style.height = `${baseHeight * (0.9 + 0.1 * ratio)}px`;
  }
  if(trails.length){
    const baseTrailWidth = 35;
    const baseTrailHeight = 2;
    trails.forEach(trail => {
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

function updateMapDisplay(){
  const el = document.getElementById('mapNameValue');
  // Normalize index in case map list changed
  mapIndex = ((mapIndex % MAPS.length) + MAPS.length) % MAPS.length;
  if(el) el.textContent = MAPS[mapIndex];
}

function saveSettings(){
  localStorage.setItem('settings.flightRangeCells', flightRangeCells);
  localStorage.setItem('settings.aimingAmplitude', aimingAmplitude);
  localStorage.setItem('settings.mapIndex', mapIndex);
  localStorage.setItem('settings.addAA', addAA);
  localStorage.setItem('settings.sharpEdges', sharpEdges);
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

if(addAAToggle){
  addAAToggle.checked = addAA;
  addAAToggle.addEventListener('change', e => {
    addAA = e.target.checked;
    saveSettings();
  });
}

if(sharpEdgesToggle){
  sharpEdgesToggle.checked = sharpEdges;
  sharpEdgesToggle.addEventListener('change', e => {
    sharpEdges = e.target.checked;
    saveSettings();
  });
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
setupRepeatButton(mapMinusBtn, () => {
  mapIndex = (mapIndex - 1 + MAPS.length) % MAPS.length;
  updateMapDisplay();
  saveSettings();
});
setupRepeatButton(mapPlusBtn, () => {
  mapIndex = (mapIndex + 1) % MAPS.length;
  updateMapDisplay();
  saveSettings();
});

if(backBtn){
  backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
  });
}

updateFlightRangeDisplay();
updateFlightRangeFlame();
updateAmplitudeDisplay();
updateMapDisplay();
updateAmplitudeIndicator();
