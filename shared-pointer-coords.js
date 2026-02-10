(function initSharedPointerCoords(global) {
  function resolveUiScale() {
    const rootStyle = window.getComputedStyle(document.documentElement);
    const uiScaleRaw = rootStyle.getPropertyValue('--ui-scale');
    const uiScaleValue = uiScaleRaw ? parseFloat(uiScaleRaw) : 1;
    return Number.isFinite(uiScaleValue) && uiScaleValue > 0 ? uiScaleValue : 1;
  }

  function toDesignCoords(clientX, clientY, uiFrameEl) {
    const rect = uiFrameEl?.getBoundingClientRect?.() || { left: 0, top: 0 };
    const uiScale = resolveUiScale();
    return {
      x: (clientX - rect.left) / uiScale,
      y: (clientY - rect.top) / uiScale,
      rect,
      uiScale
    };
  }

  function getPointerClientCoords(event) {
    const touch = event?.touches?.[0] ?? event?.changedTouches?.[0] ?? event?.targetTouches?.[0] ?? null;
    const source = touch || event;
    return {
      clientX: Number.isFinite(source?.clientX) ? source.clientX : 0,
      clientY: Number.isFinite(source?.clientY) ? source.clientY : 0
    };
  }

  function getPointerDesignCoords(event, uiFrameEl) {
    const { clientX, clientY } = getPointerClientCoords(event);
    return toDesignCoords(clientX, clientY, uiFrameEl);
  }

  global.PPInputCoords = {
    toDesignCoords,
    getPointerClientCoords,
    getPointerDesignCoords
  };
})(window);
