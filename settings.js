const MIN_FLIGHT_RANGE_CELLS = 5;
const MAX_FLIGHT_RANGE_CELLS = 30;
const MIN_AMPLITUDE = 0;
const MAX_AMPLITUDE = 30;
const MAPS = ["clear sky", "wall", "two walls", "sharp edges"];

let flightRangeCells = parseInt(localStorage.getItem('settings.flightRangeCells')) || 15;
let aimingAmplitude  = parseInt(localStorage.getItem('settings.aimingAmplitude')) || 10;
let mapIndex = parseInt(localStorage.getItem('settings.mapIndex')) || 1;
let addAA = localStorage.getItem('settings.addAA') === 'true';

const flightRangeMinusBtn = document.getElementById('flightRangeMinus');
const flightRangePlusBtn  = document.getElementById('flightRangePlus');
const amplitudeMinusBtn   = document.getElementById('amplitudeMinus');
const amplitudePlusBtn    = document.getElementById('amplitudePlus');
const mapMinusBtn = document.getElementById('mapMinus');
const mapPlusBtn  = document.getElementById('mapPlus');
const addAAToggle = document.getElementById('addAAToggle');
const backBtn = document.getElementById('backBtn');

function updateFlightRangeDisplay(){
  const el = document.getElementById('flightRangeDisplay');
  if(el) el.textContent = `${flightRangeCells} cells`;
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
    const maxAngle = aimingAmplitude * 2;
    disp.textContent = `${maxAngle.toFixed(0)}°`;
  }
}

function updateAmplitudeIndicator(){
  const el = document.getElementById('amplitudeIndicator');
  if(!el) return;

  const sight = el.querySelector('.crosshair');
  if(!sight) return;
  const angleDeg = aimingAmplitude;
  sight.style.transform = `rotate(${angleDeg}deg)`;

}

function updateMapDisplay(){
  const el = document.getElementById('mapNameValue');
  if(el) el.textContent = MAPS[mapIndex];
}

function saveSettings(){
  localStorage.setItem('settings.flightRangeCells', flightRangeCells);
  localStorage.setItem('settings.aimingAmplitude', aimingAmplitude);
  localStorage.setItem('settings.mapIndex', mapIndex);
  localStorage.setItem('settings.addAA', addAA);
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
  btn.addEventListener('mousedown', start);
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
  btn.addEventListener('touchstart', start);
  btn.addEventListener('touchend', stop);
}

if(addAAToggle){
  addAAToggle.checked = addAA;
  addAAToggle.addEventListener('change', e => {
    addAA = e.target.checked;
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
updateAmplitudeIndicator();
updateMapDisplay();
