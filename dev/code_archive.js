// Archived dev-only test controls from script.js (was used by test harness UI)

/* ======= Test Controls ======= */
function populateTestControls(){
  if(inGameMapSelect && !inGameMapSelect.options.length){
    MAPS.forEach((map, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = map.name;
      inGameMapSelect.appendChild(option);
    });
  }

  if(inGameFlameStyleSelect && !inGameFlameStyleSelect.options.length){
    FLAME_STYLE_OPTIONS.forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      inGameFlameStyleSelect.appendChild(opt);
    });
  }
}

function syncTestControls(){
  if(inGameMapSelect){
    const desired = String(clampMapIndex(settings.mapIndex));
    if(inGameMapSelect.value !== desired){
      inGameMapSelect.value = desired;
    }
  }
  if(inGameFlameStyleSelect){
    const key = getCurrentFlameStyleKey();
    if(!Array.from(inGameFlameStyleSelect.options).some(opt => opt.value === key)){
      populateTestControls();
    }
    inGameFlameStyleSelect.value = key;
  }
  if(testFlightRangeInput){
    const fallbackRange = Number.isFinite(flightRangeCells) ? flightRangeCells : 15;
    const clampedRange = Math.min(MAX_FLIGHT_RANGE_CELLS, Math.max(MIN_FLIGHT_RANGE_CELLS, fallbackRange));
    const rangeValue = String(Math.round(clampedRange));
    if(testFlightRangeInput.value !== rangeValue){
      testFlightRangeInput.value = rangeValue;
    }
  }
  if(testAmplitudeInput){
    const fallbackAmplitude = Number.isFinite(aimingAmplitude) ? aimingAmplitude : (10 / 5);
    const clampedAmplitude = Math.min(MAX_AMPLITUDE, Math.max(MIN_AMPLITUDE, fallbackAmplitude));
    const amplitudeDegrees = clampedAmplitude * 5;
    const formattedAmplitude = formatNumericInputValue(amplitudeDegrees);
    if(testAmplitudeInput.value !== formattedAmplitude){
      testAmplitudeInput.value = formattedAmplitude;
    }
  }
  if(testAddAAToggle){
    testAddAAToggle.checked = !!settings.addAA;
  }
  if(testSharpEdgesToggle){
    testSharpEdgesToggle.checked = !!settings.sharpEdges;
  }
  if(testRandomizeToggle){
    testRandomizeToggle.checked = !!settings.randomizeMapEachRound;
  }
  if(testControlsToggle){
    testControlsToggle.setAttribute('aria-expanded', String(!testControlPanel?.classList?.contains('collapsed')));
  }
}

function applyTestControlSelections(){
  let mapChanged = false;
  let flameChanged = false;
  let randomizeChanged = false;
  let rangeChanged = false;
  let amplitudeChanged = false;
  let aaChanged = false;
  let sharpChanged = false;

  if(inGameMapSelect){
    const nextIndex = parseInt(inGameMapSelect.value, 10);
    if(Number.isInteger(nextIndex)){
      const clamped = clampMapIndex(nextIndex);
      if(clamped !== settings.mapIndex){
        settings.mapIndex = clamped;
        setStoredSetting('settings.mapIndex', String(settings.mapIndex));
        mapChanged = true;
      }
    }
  }

  if(inGameFlameStyleSelect){
    const nextStyle = normalizeFlameStyleKey(inGameFlameStyleSelect.value);
    if(nextStyle !== settings.flameStyle){
      settings.flameStyle = nextStyle;
      setStoredSetting('settings.flameStyle', settings.flameStyle);
      flameChanged = true;
    }
  }

  if(testFlightRangeInput){
    const rawValue = parseFloat(testFlightRangeInput.value);
    if(Number.isFinite(rawValue)){
      const clamped = Math.min(MAX_FLIGHT_RANGE_CELLS, Math.max(MIN_FLIGHT_RANGE_CELLS, rawValue));
      const normalized = Math.round(clamped);
      if(normalized !== flightRangeCells){
        flightRangeCells = normalized;
        setStoredSetting('settings.flightRangeCells', String(flightRangeCells));
        rangeChanged = true;
      }
    }
  }

  if(testAmplitudeInput){
    const rawDegrees = parseFloat(testAmplitudeInput.value);
    if(Number.isFinite(rawDegrees)){
      const clampedDegrees = Math.min(MAX_AMPLITUDE * 5, Math.max(MIN_AMPLITUDE * 5, rawDegrees));
      const nextAmplitude = clampedDegrees / 5;
      if(!Number.isFinite(aimingAmplitude) || Math.abs(nextAmplitude - aimingAmplitude) > 1e-6){
        aimingAmplitude = nextAmplitude;
        setStoredSetting('settings.aimingAmplitude', String(aimingAmplitude));
        amplitudeChanged = true;
      }
    }
  }

  if(testAddAAToggle){
    const nextAddAA = !!testAddAAToggle.checked;
    if(nextAddAA !== settings.addAA){
      settings.addAA = nextAddAA;
      setStoredSetting('settings.addAA', nextAddAA ? 'true' : 'false');
      aaChanged = true;
    }
  }

  if(testSharpEdgesToggle){
    const nextSharpEdges = !!testSharpEdgesToggle.checked;
    if(nextSharpEdges !== settings.sharpEdges){
      settings.sharpEdges = nextSharpEdges;
      setStoredSetting('settings.sharpEdges', nextSharpEdges ? 'true' : 'false');
      sharpChanged = true;
    }
  }

  if(testRandomizeToggle){
    const nextRandomize = !!testRandomizeToggle.checked;
    if(nextRandomize !== settings.randomizeMapEachRound){
      settings.randomizeMapEachRound = nextRandomize;
      setStoredSetting('settings.randomizeMapEachRound', nextRandomize ? 'true' : 'false');
      randomizeChanged = true;
    }
  }

  if(flameChanged){
    onFlameStyleChanged();
  }

  syncTestControls();

  return {
    mapChanged,
    flameChanged,
    randomizeChanged,
    rangeChanged,
    amplitudeChanged,
    aaChanged,
    sharpChanged
  };
}

populateTestControls();

syncTestControls();

if(testControlsToggle && testControlPanel){
  testControlsToggle.addEventListener('click', () => {
    testControlPanel.classList.toggle('collapsed');
    const expanded = !testControlPanel.classList.contains('collapsed');
    testControlsToggle.setAttribute('aria-expanded', String(expanded));
    if(expanded){
      populateTestControls();
      syncTestControls();
    }
  });
}

if(testApplyBtn){
  testApplyBtn.addEventListener('click', () => {
    const result = applyTestControlSelections();
    if(result.mapChanged){
      applyCurrentMap();
      suppressAutoRandomMapForNextRound = true;
    }
  });
}

if(testRestartBtn){
  testRestartBtn.addEventListener('click', () => {
    const result = applyTestControlSelections();
    if(!gameMode){
      applyCurrentMap();
      return;
    }
    const randomizeNow = shouldAutoRandomizeMap() && !result.mapChanged && !!settings.randomizeMapEachRound;
    restartMatchWithCurrentSettings({ randomizeMap: randomizeNow });
  });
}
