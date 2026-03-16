(function(global){
  const AI_ENGINE_MODES = {
    LEGACY: "legacy",
    V2: "v2",
  };

  function normalizeEngineMode(rawMode){
    return rawMode === AI_ENGINE_MODES.V2
      ? AI_ENGINE_MODES.V2
      : null;
  }

  function runLegacyAiTurn(context = {}){
    if(typeof context.legacyRunAiTurn !== "function"){
      return null;
    }
    return context.legacyRunAiTurn(context);
  }

  function runAiTurn(context = {}){
    const selectedMode = normalizeEngineMode(context.engineMode);

    if(selectedMode !== AI_ENGINE_MODES.V2){
      throw new Error(`[AI] Unsupported engine mode: ${String(context.engineMode)}. Expected "v2".`);
    }

    if(typeof context.runAiTurnV2 !== "function"){
      throw new Error("[AI] V2 runner is unavailable. Legacy fallback is disabled.");
    }

    return context.runAiTurnV2(context);
  }

  global.PaperWingsAiAdapter = {
    AI_ENGINE_MODES,
    runAiTurn,
    runLegacyAiTurn,
  };
})(typeof window !== "undefined" ? window : globalThis);
