(function(global){
  'use strict';

  const DEFAULT_STORAGE_KEY = 'paperWingsInspectorState';
  const DEFAULT_FIELD_WIDTH = 460;
  const DEFAULT_FIELD_HEIGHT = 800;

  function clamp(value, min, max){
    if(!Number.isFinite(value)) return value;
    if(Number.isFinite(min) && value < min) return min;
    if(Number.isFinite(max) && value > max) return max;
    return value;
  }

  function isElement(value){
    return value instanceof Element || value instanceof SVGElement;
  }

  function parsePersistedState(storageKey){
    try {
      const raw = global.sessionStorage?.getItem(storageKey);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === 'object'){
        return {
          active: !!parsed.active,
          ruler: !!parsed.ruler
        };
      }
    } catch(err){
      console.warn('[Inspector] Unable to read persisted state.', err);
    }
    return null;
  }

  function persistState(storageKey, state){
    try {
      global.sessionStorage?.setItem(storageKey, JSON.stringify({
        active: !!state.active,
        ruler: !!state.rulerActive
      }));
    } catch(err){
      console.warn('[Inspector] Unable to persist state.', err);
    }
  }

  function normalizeRoot(entry, defaults){
    if(!entry) return null;

    if(isElement(entry)){
      return {
        element: entry,
        mode: 'pixel',
        label: null,
        fieldWidth: defaults.fieldWidth,
        fieldHeight: defaults.fieldHeight
      };
    }

    if(typeof entry !== 'object') return null;

    let element = null;
    if(isElement(entry.element)){
      element = entry.element;
    } else if(typeof entry.selector === 'string'){
      element = document.querySelector(entry.selector);
    }
    if(!element) return null;

    const mode = entry.mode === 'field' ? 'field' : 'pixel';
    const fieldWidth = Number.isFinite(entry.fieldWidth) ? entry.fieldWidth : defaults.fieldWidth;
    const fieldHeight = Number.isFinite(entry.fieldHeight) ? entry.fieldHeight : defaults.fieldHeight;
    const label = typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : null;

    return { element, mode, fieldWidth, fieldHeight, label };
  }

  function getElementLabel(element){
    if(!element) return '—';
    const explicit = element.getAttribute?.('data-inspector-name');
    if(explicit) return explicit;
    const aria = element.getAttribute?.('aria-label');
    if(aria) return aria;
    if(element.id) return `#${element.id}`;
    if(element.classList && element.classList.length){
      return `${element.tagName.toLowerCase()}.${Array.from(element.classList).join('.')}`;
    }
    return element.tagName ? element.tagName.toLowerCase() : 'элемент';
  }

  function createIgnoreChecker(elements){
    const nodes = elements.filter(Boolean);
    return function shouldIgnore(el){
      if(!el) return false;
      if(el.dataset && el.dataset.inspectorIgnore === 'true'){
        return true;
      }
      for(const node of nodes){
        if(!node) continue;
        if(el === node) return true;
        if(typeof node.contains === 'function' && node.contains(el)){
          return true;
        }
      }
      return false;
    };
  }

  function pickInspectableNode(node, container, shouldIgnore){
    let current = node;
    while(current && current !== container){
      if(shouldIgnore(current)){
        return null;
      }
      const hasLabel = current.getAttribute?.('data-inspector-name') ||
                       current.getAttribute?.('aria-label') ||
                       current.id ||
                       (current.classList && current.classList.length);
      if(hasLabel){
        break;
      }
      current = current.parentElement;
    }
    if(!current || current === document.body || current === document.documentElement){
      return container;
    }
    return current;
  }

  function computeRelativeMetrics(element, root){
    if(!element || !root || !root.element) return { coordsText: null, sizeText: null };
    const rect = element.getBoundingClientRect();
    const rootRect = root.element.getBoundingClientRect();
    if(!rect || !rootRect || rootRect.width <= 0 || rootRect.height <= 0){
      return { coordsText: null, sizeText: null };
    }

    if(root.mode === 'field'){
      const width = Number.isFinite(root.fieldWidth) && root.fieldWidth > 0 ? root.fieldWidth : rootRect.width;
      const height = Number.isFinite(root.fieldHeight) && root.fieldHeight > 0 ? root.fieldHeight : rootRect.height;
      if(width <= 0 || height <= 0){
        return { coordsText: null, sizeText: null };
      }
      const relLeft = rect.left - rootRect.left;
      const relTop = rect.top - rootRect.top;
      const baseLeft = clamp(Math.round((relLeft / rootRect.width) * width), 0, width);
      const baseTop = clamp(Math.round((relTop / rootRect.height) * height), 0, height);
      const baseWidth = Math.max(0, Math.round((rect.width / rootRect.width) * width));
      const baseHeight = Math.max(0, Math.round((rect.height / rootRect.height) * height));
      return {
        coordsText: `${baseLeft}, ${baseTop}`,
        sizeText: `${baseWidth}×${baseHeight}`
      };
    }

    const left = Math.round(rect.left - rootRect.left);
    const top = Math.round(rect.top - rootRect.top);
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    return {
      coordsText: `${left}px, ${top}px`,
      sizeText: `${width}px×${height}px`
    };
  }

  function describeTargetsAt(clientX, clientY, roots, shouldIgnore){
    if(!Number.isFinite(clientX) || !Number.isFinite(clientY)) return [];
    const elements = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(clientX, clientY)
      : [];
    const source = elements && elements.length
      ? elements
      : [document.elementFromPoint(clientX, clientY)].filter(Boolean);

    const targets = [];
    const seen = new Set();

    for(const el of source){
      if(!el || shouldIgnore(el)) continue;
      let matchedRoot = null;
      for(const root of roots){
        if(root.element && (root.element === el || root.element.contains(el))){
          matchedRoot = root;
          break;
        }
      }
      if(!matchedRoot) continue;
      const inspected = pickInspectableNode(el, matchedRoot.element, shouldIgnore);
      if(!inspected || shouldIgnore(inspected) || seen.has(inspected)) continue;
      const metrics = computeRelativeMetrics(inspected, matchedRoot);
      targets.push({
        element: inspected,
        label: getElementLabel(inspected),
        coordsText: metrics.coordsText,
        sizeText: metrics.sizeText,
        source: matchedRoot.label || null
      });
      seen.add(inspected);
    }

    return targets;
  }

  function formatPoint(point){
    if(!point) return '—';
    const x = Number.isFinite(point.baseX) ? Math.round(point.baseX) : null;
    const y = Number.isFinite(point.baseY) ? Math.round(point.baseY) : null;
    if(x === null || y === null) return '—';
    return `${x}, ${y}`;
  }

  function formatDistance(pointA, pointB){
    if(!pointA || !pointB) return null;
    if(!Number.isFinite(pointA.baseX) || !Number.isFinite(pointA.baseY) ||
       !Number.isFinite(pointB.baseX) || !Number.isFinite(pointB.baseY)){
      return null;
    }
    const dx = pointA.baseX - pointB.baseX;
    const dy = pointA.baseY - pointB.baseY;
    const dist = Math.hypot(dx, dy);
    if(!Number.isFinite(dist)) return null;
    return dist >= 100 ? `${Math.round(dist)} px` : `${dist.toFixed(1)} px`;
  }

  function formatTargetLines(targets){
    if(!targets || !targets.length) return [];
    return targets.map((info, index) => {
      const prefix = `${index + 1}.`;
      const labelParts = [];
      labelParts.push(info.label || '—');
      if(info.source){
        labelParts[labelParts.length - 1] = `${labelParts[labelParts.length - 1]} [${info.source}]`;
      }
      if(info.coordsText){
        labelParts.push(`@ ${info.coordsText}`);
      }
      if(info.sizeText){
        labelParts.push(info.sizeText);
      }
      return `${prefix} ${labelParts.join(' · ')}`;
    });
  }

  function init(options = {}){
    const container = options.container || document.getElementById('gameContainer');
    const overlay = options.overlay || document.getElementById('harnessInspectorOverlay');
    const svg = options.svg || overlay?.querySelector('svg');
    const tooltip = options.tooltip || overlay?.querySelector('.inspector-overlay__tooltip');
    const tooltipContent = options.tooltipContent || tooltip?.querySelector('.inspector-overlay__tooltip-content');
    const tooltipCursorValue = options.cursorValue || document.getElementById('inspectorCursorText');
    const tooltipTargetValue = options.targetValue || document.getElementById('inspectorTargetText');
    const tooltipRulerValue = options.rulerValue || document.getElementById('inspectorRulerText');
    const crosshairH = options.crosshairH || svg?.querySelector('#inspectorCrosshairH');
    const crosshairV = options.crosshairV || svg?.querySelector('#inspectorCrosshairV');
    const rulerLine = options.rulerLine || svg?.querySelector('#inspectorRulerLine');
    const pointAEl = options.pointA || svg?.querySelector('#inspectorPointA');
    const pointBEl = options.pointB || svg?.querySelector('#inspectorPointB');

    const buttons = options.buttons || {};
    const panel = options.panel || {};

    const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    const defaults = {
      fieldWidth: Number.isFinite(options.fieldWidth) ? options.fieldWidth : DEFAULT_FIELD_WIDTH,
      fieldHeight: Number.isFinite(options.fieldHeight) ? options.fieldHeight : DEFAULT_FIELD_HEIGHT
    };

    const roots = [];
    let containerRoot = null;
    if(container){
      containerRoot = normalizeRoot({
        element: container,
        mode: options.containerMode === 'pixel' ? 'pixel' : 'field',
        fieldWidth: options.fieldWidth,
        fieldHeight: options.fieldHeight,
        label: options.containerLabel || null
      }, defaults);
      if(containerRoot){
        roots.push(containerRoot);
      }
    }
    if(Array.isArray(options.extraRoots)){
      for(const entry of options.extraRoots){
        const normalized = normalizeRoot(entry, defaults);
        if(normalized && !roots.some(root => root.element === normalized.element)){
          roots.push(normalized);
        }
      }
    }

    if(!roots.length){
      return null;
    }

    const shouldIgnore = createIgnoreChecker([
      overlay,
      tooltip,
      ...(Array.isArray(options.ignoreElements) ? options.ignoreElements : [])
    ]);

    const state = {
      active: false,
      pointerInside: false,
      rulerActive: false,
      firstPoint: null,
      secondPoint: null,
      lastCursor: null,
      lastTargets: [],
      measurementWidth: defaults.fieldWidth,
      measurementHeight: defaults.fieldHeight
    };

    const persisted = parsePersistedState(storageKey);
    if(persisted){
      state.active = !!persisted.active;
      state.rulerActive = !!persisted.ruler;
    }

    function updateSvgViewBox(){
      if(!svg || !containerRoot || !containerRoot.element) return;
      const rect = containerRoot.element.getBoundingClientRect();
      if(containerRoot.mode === 'pixel'){
        state.measurementWidth = rect && rect.width > 0 ? Math.round(rect.width) : defaults.fieldWidth;
        state.measurementHeight = rect && rect.height > 0 ? Math.round(rect.height) : defaults.fieldHeight;
      } else {
        state.measurementWidth = Number.isFinite(containerRoot.fieldWidth) ? containerRoot.fieldWidth : defaults.fieldWidth;
        state.measurementHeight = Number.isFinite(containerRoot.fieldHeight) ? containerRoot.fieldHeight : defaults.fieldHeight;
      }
      svg.setAttribute('viewBox', `0 0 ${state.measurementWidth} ${state.measurementHeight}`);
      svg.setAttribute('preserveAspectRatio', 'none');
    }

    function resetTooltipPosition(){
      if(tooltip){
        tooltip.style.transform = 'translate(-9999px, -9999px)';
      }
    }

    function setCrosshairVisible(show){
      const display = show ? 'block' : 'none';
      if(crosshairH) crosshairH.style.display = display;
      if(crosshairV) crosshairV.style.display = display;
    }

    function setTooltipVisible(show){
      if(!tooltip) return;
      tooltip.style.display = show ? 'block' : 'none';
      if(!show){
        resetTooltipPosition();
      }
    }

    function updateInspectorButtons(){
      if(buttons.cursor){
        buttons.cursor.textContent = state.active ? 'Курсор: вкл.' : 'Курсор: выкл.';
        buttons.cursor.setAttribute('aria-pressed', state.active ? 'true' : 'false');
      }
      if(buttons.ruler){
        buttons.ruler.textContent = state.rulerActive ? 'Линейка: вкл.' : 'Линейка: выкл.';
        buttons.ruler.disabled = !state.active;
        buttons.ruler.setAttribute('aria-pressed', state.rulerActive ? 'true' : 'false');
      }
    }

    function updateOverlayVisibility(){
      if(!overlay) return;
      const visible = state.active;
      overlay.style.display = visible ? 'block' : 'none';
      overlay.hidden = !visible;
      overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }

    function renderCrosshair(cursor){
      if(!cursor || !containerRoot) return;
      const width = state.measurementWidth;
      const height = state.measurementHeight;
      if(crosshairH){
        crosshairH.setAttribute('x1', '0');
        crosshairH.setAttribute('x2', String(width));
        crosshairH.setAttribute('y1', String(cursor.baseY ?? 0));
        crosshairH.setAttribute('y2', String(cursor.baseY ?? 0));
      }
      if(crosshairV){
        crosshairV.setAttribute('x1', String(cursor.baseX ?? 0));
        crosshairV.setAttribute('x2', String(cursor.baseX ?? 0));
        crosshairV.setAttribute('y1', '0');
        crosshairV.setAttribute('y2', String(height));
      }
    }

    function updateTooltipPosition(cursor, rect){
      if(!tooltip || !tooltipContent || !cursor || !rect) return;
      const width = tooltipContent.offsetWidth || 0;
      const height = tooltipContent.offsetHeight || 0;
      const offset = 12;
      const maxX = Math.max(rect.width - width - 4, 0);
      const maxY = Math.max(rect.height - height - 4, 0);
      let x = cursor.cssX + offset;
      let y = cursor.cssY + offset;
      if(x > maxX) x = maxX;
      if(y > maxY) y = maxY;
      tooltip.style.transform = `translate(${Math.max(0, x)}px, ${Math.max(0, y)}px)`;
    }

    function updateTooltipContent(cursor, targets){
      if(tooltipCursorValue){
        tooltipCursorValue.textContent = cursor && Number.isFinite(cursor.baseX) && Number.isFinite(cursor.baseY)
          ? formatPoint(cursor)
          : '—';
      }
      const lines = formatTargetLines(targets);
      if(tooltipTargetValue){
        tooltipTargetValue.textContent = lines.length ? lines.join('\n') : '—';
      }
      if(tooltipRulerValue){
        if(state.rulerActive && state.firstPoint){
          const parts = [`A: ${formatPoint(state.firstPoint)}`];
          if(state.secondPoint){
            parts.push(`B: ${formatPoint(state.secondPoint)}`);
            const distance = formatDistance(state.firstPoint, state.secondPoint);
            if(distance){
              parts.push(`Δ: ${distance}`);
            }
          } else {
            parts.push('Выберите точку B');
          }
          tooltipRulerValue.textContent = parts.join('\n');
        } else if(state.rulerActive){
          tooltipRulerValue.textContent = 'ЛКМ — точка A';
        } else {
          tooltipRulerValue.textContent = '—';
        }
      }
    }

    function updatePanelData(){
      if(panel.cursor){
        panel.cursor.textContent = state.active && state.lastCursor && Number.isFinite(state.lastCursor.baseX) && Number.isFinite(state.lastCursor.baseY)
          ? formatPoint(state.lastCursor)
          : '—';
      }
      if(panel.target){
        const lines = state.active ? formatTargetLines(state.lastTargets) : [];
        panel.target.textContent = lines.length ? lines.join(' \n ') : '—';
      }
      const pointA = state.rulerActive ? state.firstPoint : null;
      const pointB = state.rulerActive ? state.secondPoint : null;
      if(panel.pointA){
        panel.pointA.textContent = pointA ? formatPoint(pointA) : '—';
      }
      if(panel.pointB){
        panel.pointB.textContent = pointB ? formatPoint(pointB) : '—';
      }
      if(panel.distance){
        const dist = pointA && pointB ? formatDistance(pointA, pointB) : null;
        panel.distance.textContent = dist || '—';
      }
    }

    function updateMeasurementOverlay(){
      const showA = state.active && state.rulerActive && state.firstPoint;
      if(pointAEl){
        pointAEl.style.display = showA ? 'block' : 'none';
        if(showA){
          pointAEl.setAttribute('cx', String(state.firstPoint.baseX));
          pointAEl.setAttribute('cy', String(state.firstPoint.baseY));
        }
      }
      const showB = state.active && state.rulerActive && state.secondPoint;
      if(pointBEl){
        pointBEl.style.display = showB ? 'block' : 'none';
        if(showB){
          pointBEl.setAttribute('cx', String(state.secondPoint.baseX));
          pointBEl.setAttribute('cy', String(state.secondPoint.baseY));
        }
      }
      const showLine = showA && showB;
      if(rulerLine){
        rulerLine.style.display = showLine ? 'block' : 'none';
        if(showLine){
          rulerLine.setAttribute('x1', String(state.firstPoint.baseX));
          rulerLine.setAttribute('y1', String(state.firstPoint.baseY));
          rulerLine.setAttribute('x2', String(state.secondPoint.baseX));
          rulerLine.setAttribute('y2', String(state.secondPoint.baseY));
        }
      }
      updatePanelData();
      updateTooltipContent(state.lastCursor, state.lastTargets);
    }

    function resetInspectorReadouts(){
      state.lastCursor = null;
      state.lastTargets = [];
      resetTooltipPosition();
      updateTooltipContent(null, []);
      updatePanelData();
    }

    function setInspectorActive(active){
      if(state.active === active) return;
      state.active = active;
      if(!active){
        state.pointerInside = false;
        state.rulerActive = false;
        state.firstPoint = null;
        state.secondPoint = null;
        resetInspectorReadouts();
      }
      updateInspectorButtons();
      updateOverlayVisibility();
      setCrosshairVisible(active && state.pointerInside);
      setTooltipVisible(active && (state.pointerInside || (state.lastTargets && state.lastTargets.length > 0)));
      updateMeasurementOverlay();
      persistState(storageKey, state);
    }

    function setRulerActive(active){
      if(state.rulerActive === active) return;
      state.rulerActive = active;
      if(!active){
        state.firstPoint = null;
        state.secondPoint = null;
      }
      updateInspectorButtons();
      updateMeasurementOverlay();
      persistState(storageKey, state);
    }

    function convertPointer(cssX, cssY, rect){
      if(!containerRoot || !rect) return { baseX: null, baseY: null };
      if(containerRoot.mode === 'field'){
        const baseX = clamp(Math.round((cssX / rect.width) * state.measurementWidth), 0, state.measurementWidth);
        const baseY = clamp(Math.round((cssY / rect.height) * state.measurementHeight), 0, state.measurementHeight);
        return { baseX, baseY };
      }
      return {
        baseX: Math.round(cssX),
        baseY: Math.round(cssY)
      };
    }

    function buildCursorData(event, rect){
      if(!rect || rect.width <= 0 || rect.height <= 0) return null;
      const cssXRaw = event.clientX - rect.left;
      const cssYRaw = event.clientY - rect.top;
      const inside = cssXRaw >= 0 && cssYRaw >= 0 && cssXRaw <= rect.width && cssYRaw <= rect.height;
      const clampedCssX = clamp(cssXRaw, 0, rect.width);
      const clampedCssY = clamp(cssYRaw, 0, rect.height);
      const base = convertPointer(clampedCssX, clampedCssY, rect);
      return {
        cssX: clampedCssX,
        cssY: clampedCssY,
        baseX: inside ? base.baseX : null,
        baseY: inside ? base.baseY : null,
        inside
      };
    }

    function handlePointerMove(event){
      if(!state.active || !containerRoot || !containerRoot.element) return;
      const rect = containerRoot.element.getBoundingClientRect();
      const cursorData = buildCursorData(event, rect);
      state.pointerInside = !!(cursorData && cursorData.inside);
      setCrosshairVisible(state.pointerInside);

      const targets = describeTargetsAt(event.clientX, event.clientY, roots, shouldIgnore);
      state.lastTargets = targets;
      state.lastCursor = cursorData;

      if(state.pointerInside && cursorData){
        renderCrosshair(cursorData);
      }
      const shouldShowTooltip = state.active && (state.pointerInside || (targets && targets.length));
      setTooltipVisible(shouldShowTooltip);
      if(cursorData){
        updateTooltipContent(cursorData, targets);
        updateTooltipPosition(cursorData, rect);
      } else {
        updateTooltipContent(null, targets);
      }
      updatePanelData();
    }

    function handlePointerDown(event){
      if(!state.active || !state.rulerActive || !containerRoot || !containerRoot.element) return;
      if(event.button !== 0) return;
      const rect = containerRoot.element.getBoundingClientRect();
      if(!rect || rect.width <= 0 || rect.height <= 0) return;
      const cssX = event.clientX - rect.left;
      const cssY = event.clientY - rect.top;
      if(cssX < 0 || cssY < 0 || cssX > rect.width || cssY > rect.height) return;
      const base = convertPointer(cssX, cssY, rect);
      const point = { baseX: base.baseX, baseY: base.baseY };
      if(!state.firstPoint || state.secondPoint){
        state.firstPoint = point;
        state.secondPoint = null;
      } else {
        state.secondPoint = point;
      }
      updateMeasurementOverlay();
    }

    function handlePointerLeave(){
      if(!state.active) return;
      state.pointerInside = false;
      setCrosshairVisible(false);
      const shouldShowTooltip = state.active && (state.lastTargets && state.lastTargets.length > 0);
      setTooltipVisible(shouldShowTooltip);
      updatePanelData();
    }

    function attachEvents(){
      global.addEventListener('pointermove', handlePointerMove, { passive: true });
      global.addEventListener('pointerleave', handlePointerLeave);
      if(containerRoot && containerRoot.element){
        containerRoot.element.addEventListener('pointerdown', handlePointerDown);
      }
      global.addEventListener('resize', () => {
        updateSvgViewBox();
        updateMeasurementOverlay();
      });
    }

    function detachEvents(){
      global.removeEventListener('pointermove', handlePointerMove, { passive: true });
      global.removeEventListener('pointerleave', handlePointerLeave);
      if(containerRoot && containerRoot.element){
        containerRoot.element.removeEventListener('pointerdown', handlePointerDown);
      }
    }

    if(buttons.cursor){
      buttons.cursor.addEventListener('click', () => {
        setInspectorActive(!state.active);
      });
    }

    if(buttons.ruler){
      buttons.ruler.addEventListener('click', () => {
        const enable = !state.rulerActive;
        if(enable && !state.active){
          setInspectorActive(true);
        }
        setRulerActive(enable);
      });
    }

    updateSvgViewBox();
    updateInspectorButtons();
    updateOverlayVisibility();
    setCrosshairVisible(state.active && state.pointerInside);
    setTooltipVisible(state.active && state.pointerInside);
    if(!state.active){
      resetTooltipPosition();
    }
    updateMeasurementOverlay();
    attachEvents();

    if(state.active){
      // Force an initial repaint so tooltip reflects persisted state.
      requestAnimationFrame(() => {
        const rect = containerRoot?.element?.getBoundingClientRect();
        if(rect){
          const cursor = {
            cssX: rect.width / 2,
            cssY: rect.height / 2,
            baseX: state.measurementWidth / 2,
            baseY: state.measurementHeight / 2,
            inside: true
          };
          renderCrosshair(cursor);
          updateTooltipContent(cursor, state.lastTargets);
          updateTooltipPosition(cursor, rect);
        }
      });
    }

    return {
      destroy(){
        detachEvents();
      },
      setActive: setInspectorActive,
      setRuler: setRulerActive
    };
  }

  global.paperWingsTestInspector = {
    init
  };
})(window);
