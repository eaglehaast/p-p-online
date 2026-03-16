(function(global){
  const AI_ENGINE_MODES = {
    LEGACY: "legacy",
    V2: "v2",
  };

  function normalizeEngineMode(rawMode){
    return rawMode === AI_ENGINE_MODES.V2
      ? AI_ENGINE_MODES.V2
      : AI_ENGINE_MODES.LEGACY;
  }

  function runLegacyAiTurn(context = {}){
    if(typeof context.legacyRunAiTurn !== "function"){
      return null;
    }
    return context.legacyRunAiTurn();
  }

  function runAiTurn(context = {}){
    const selectedMode = normalizeEngineMode(context.engineMode);

    if(selectedMode === AI_ENGINE_MODES.V2 && typeof context.runAiTurnV2 === "function"){
      return context.runAiTurnV2(context);
    }

    return runLegacyAiTurn(context);
  }

  global.PaperWingsAiAdapter = {
    AI_ENGINE_MODES,
    runAiTurn,
    runLegacyAiTurn,
  };
})(typeof window !== "undefined" ? window : globalThis);
