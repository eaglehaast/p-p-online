/*
 * Archived legacy AI v2 decision/diagnostics block.
 * Source: script.js (pre-removal snapshot on 2026-04-13).
 * This file is intentionally not loaded by runtime.
 */

const AI_DECISION_DEBUG_FLAGS = Object.freeze({
  routePlanning: false,
  candidateScoring: false,
  fallbackReplan: false,
  narrowCorridor: false,
});

const AI_DECISION_DEBUG_EVENT_FLAGS = Object.freeze({
  plan_path_range_profile: "routePlanning",
  fallback_safe_angle_candidate_scored: "candidateScoring",
  fallback_attack_candidate_scored: "candidateScoring",
  final_compared: "candidateScoring",
  fallback_replan_candidate_missing: "fallbackReplan",
  fallback_replan_candidate_invalid: "fallbackReplan",
  fallback_replan_execution_started: "fallbackReplan",
  fallback_replan_execution_committed: "fallbackReplan",
  stale_target_replanned: "fallbackReplan",
  narrow_corridor_phase_started: "narrowCorridor",
  narrow_corridor_rejected: "narrowCorridor",
  narrow_corridor_selected: "narrowCorridor",
  narrow_corridor_phase_completed: "narrowCorridor",
});

const AI_DECISION_ENRICHED_EVENT_SET = new Set([
  "fallback_safe_angle_selected",
  "fallback_safe_angle_rejected",
  "fallback_selected_candidate_class",
  "base_candidate_selected",
  "flag_capture_candidate_summary",
  "final_compared_direct_low_passability_win",
  "fallback_move",
  "super_reserve_move",
  "forced_progress_move",
  "ai_no_move_fail_safe",
  "fallback_replan_exhausted",
  "direct_finisher",
  "role_move",
  "mode_move",
]);
const AI_DECISION_VERBOSE_DEBUG_FLAG = false;
const AI_DECISION_DEEP_DEBUG_FLAG = false;
const AI_DECISION_KEY_NUMERIC_FIELDS = Object.freeze([
  "score",
  "bestScore",
  "adjustedScore",
  "finalScore",
  "rawDistance",
  "distance",
  "moveDistance",
  "moveTotalDist",
  "totalDist",
  "launchScale",
  "scale",
  "angle",
  "targetAngle",
  "risk",
  "riskScore",
  "threatScore",
  "value",
  "priority",
  "penalty",
  "reward",
  "expectedDamage",
  "hitChance",
  "waitMs",
  "delayMs",
  "idleTurns",
  "repeatPenalty",
  "repeatInWindow",
  "rotationBonus",
]);
const AI_DECISION_AGGREGATED_EVENT_SET = new Set([
  "narrow_corridor_rejected",
  "detour_not_found",
  "blocked_after_deviation",
  "fallback_direct_attack_blocked_after_deviation",
]);
let aiDecisionScopeSequence = 0;
const aiDecisionScopeStack = [];

function beginAiDecisionScope(meta = {}){
  const scope = {
    id: `ai_scope_${++aiDecisionScopeSequence}`,
    meta: meta && typeof meta === "object" ? { ...meta } : {},
    aggregatedEvents: new Map(),
  };
  aiDecisionScopeStack.push(scope);
  return scope;
}

function getCurrentAiDecisionScope(){
  if(aiDecisionScopeStack.length === 0) return null;
  return aiDecisionScopeStack[aiDecisionScopeStack.length - 1] || null;
}

function flushAiDecisionScope(scope){
  if(!scope || !(scope.aggregatedEvents instanceof Map) || scope.aggregatedEvents.size === 0) return;
  for(const [reason, entry] of scope.aggregatedEvents.entries()){
    if(!entry || !Number.isFinite(entry.count) || entry.count <= 0) continue;
    const lastPayload = entry.lastPayload && typeof entry.lastPayload === "object" ? entry.lastPayload : {};
    const planeId = lastPayload.planeId ?? lastPayload.plane?.id ?? scope.meta?.planeId ?? null;
    const rawDistance = [lastPayload.rawDistance, lastPayload.moveTotalDist, lastPayload.totalDist, lastPayload.distance]
      .find((value) => Number.isFinite(value));
    const derived = {
      planeId,
      rawDistance,
      adjustedScore: Number.isFinite(lastPayload.adjustedScore) ? lastPayload.adjustedScore : null,
      finalScore: Number.isFinite(lastPayload.finalScore) ? lastPayload.finalScore : null,
      rotationBonus: null,
    };
    const summaryPayload = AI_DECISION_DEEP_DEBUG_FLAG
      ? {
          ...lastPayload,
          suppressedRepeatCount: entry.count,
          lastReasonCode: entry.lastReasonCode,
          aggregatedWithin: scope.meta?.type || "ai_scope",
          aggregatedScopeId: scope.id,
          aggregatedPlaneId: scope.meta?.planeId ?? null,
          aggregatedGoalName: scope.meta?.goalName ?? null,
        }
      : {
          ...buildAiDecisionCompactPayload(lastPayload, derived),
          suppressedRepeatCount: entry.count,
          aggregatedWithin: scope.meta?.type || "ai_scope",
          aggregatedPlaneId: scope.meta?.planeId ?? null,
        };
    console.debug(`[ai] ${reason}_summary`, summaryPayload);
  }
  scope.aggregatedEvents.clear();
}

function endAiDecisionScope(scope){
  if(!scope) return;
  const currentScope = getCurrentAiDecisionScope();
  if(currentScope === scope){
    flushAiDecisionScope(scope);
    aiDecisionScopeStack.pop();
    return;
  }

  const scopeIndex = aiDecisionScopeStack.lastIndexOf(scope);
  if(scopeIndex >= 0){
    flushAiDecisionScope(scope);
    aiDecisionScopeStack.splice(scopeIndex, 1);
  }
}

function shouldAggregateAiDecision(reason, payload = {}){
  if(AI_DECISION_DEEP_DEBUG_FLAG || AI_DECISION_VERBOSE_DEBUG_FLAG) return false;
  if(!AI_DECISION_AGGREGATED_EVENT_SET.has(reason)) return false;
  return payload?.forceImmediateLog !== true;
}

function shouldEmitAiDecision(reason, payload = {}){
  if(payload?.summaryOnly === true){
    return true;
  }

  const debugFlagName = AI_DECISION_DEBUG_EVENT_FLAGS[reason];
  if(debugFlagName){
    return AI_DECISION_DEBUG_FLAGS[debugFlagName] === true;
  }

  if(reason === "fallback_safe_angle_rejected"){
    return payload?.reasonCode === "weak_candidates_only";
  }

  return true;
}

function shouldEnrichAiDecision(reason){
  return AI_DECISION_DEEP_DEBUG_FLAG && AI_DECISION_ENRICHED_EVENT_SET.has(reason);
}

function roundAiDecisionNumber(value){
  return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function collectAiDecisionKeyNumbers(payload, derived = {}){
  const keyNumbers = {};
  const seenKeys = new Set();
  const addNumber = (key, value) => {
    if(Object.keys(keyNumbers).length >= 4) return;
    if(seenKeys.has(key) || !Number.isFinite(value)) return;
    seenKeys.add(key);
    keyNumbers[key] = roundAiDecisionNumber(value);
  };

  AI_DECISION_KEY_NUMERIC_FIELDS.forEach((key) => {
    addNumber(key, payload?.[key]);
  });

  addNumber("rawDistance", derived.rawDistance);
  addNumber("adjustedScore", derived.adjustedScore);
  addNumber("finalScore", derived.finalScore);
  addNumber("rotationBonus", derived.rotationBonus);

  return keyNumbers;
}

function buildAiDecisionDeepPayload(reason, payload, derived = {}){
  const reservedHomeDefenderIds = Array.isArray(payload.reservedHomeDefenderIds)
    ? payload.reservedHomeDefenderIds.filter((id) => id != null)
    : [];

  return {
    ...payload,
    reservedHomeDefenderIds,
    primaryHomeDefender: payload.primaryHomeDefender ?? null,
    secondaryHomeDefender: payload.secondaryHomeDefender ?? null,
    attemptedFlagPlaneId: payload.attemptedFlagPlaneId ?? null,
    prohibitionReason: payload.prohibitionReason ?? null,
    planeId: derived.planeId,
    rawDistance: roundAiDecisionNumber(derived.rawDistance),
    adjustedScore: roundAiDecisionNumber(derived.adjustedScore),
    rotationBonus: roundAiDecisionNumber(derived.rotationBonus),
    idleTurns: roundAiDecisionNumber(derived.idleTurns),
    repeatInWindow: roundAiDecisionNumber(derived.repeatInWindow),
    repeatPenalty: roundAiDecisionNumber(derived.repeatPenalty),
    finalScore: roundAiDecisionNumber(derived.finalScore),
    deepDiagnostics: true,
    debugReason: reason,
  };
}

function buildAiDecisionCompactPayload(payload, derived = {}){
  const compactPayload = {
    reasonCode: payload?.reasonCode ?? payload?.reason ?? null,
    planeId: derived.planeId,
    numbers: collectAiDecisionKeyNumbers(payload, derived),
  };

  if(Object.keys(compactPayload.numbers).length === 0){
    delete compactPayload.numbers;
  }

  if(compactPayload.reasonCode == null){
    delete compactPayload.reasonCode;
  }

  if(compactPayload.planeId == null){
    delete compactPayload.planeId;
  }

  return compactPayload;
}

function logAiDecision(reason, details = {}){
  const payload = details && typeof details === "object" ? { ...details } : {};
  const normalizedReasonCategory = typeof payload.reasonCategory === "string"
    ? payload.reasonCategory.trim().toLowerCase()
    : "";
  if([
    "move_planning_failure",
    "inventory_selection_failure",
    "technical_exception",
  ].includes(normalizedReasonCategory)){
    payload.reasonCategory = normalizedReasonCategory;
  } else if(payload.reasonCategory !== undefined){
    delete payload.reasonCategory;
  }
  if(!(typeof payload.reasonCode === "string" && payload.reasonCode.trim().length > 0)){
    payload.reasonCode = payload.reason || reason || null;
  }
  if(!shouldEmitAiDecision(reason, payload)) return;
  if(shouldAggregateAiDecision(reason, payload)){
    const scope = getCurrentAiDecisionScope();
    if(scope){
      const currentEntry = scope.aggregatedEvents.get(reason) || {
        count: 0,
        lastPayload: null,
        lastReasonCode: null,
      };
      currentEntry.count += 1;
      currentEntry.lastPayload = payload;
      currentEntry.lastReasonCode = payload?.reasonCode || payload?.reason || currentEntry.lastReasonCode || null;
      scope.aggregatedEvents.set(reason, currentEntry);
      return;
    }
  }

  const planeId = payload.planeId ?? payload.plane?.id ?? null;
  const rawDistance = [payload.rawDistance, payload.moveTotalDist, payload.totalDist, payload.distance]
    .find((value) => Number.isFinite(value));

  let adjustedScore = Number.isFinite(payload.adjustedScore) ? payload.adjustedScore : null;
  let scoringExplanation = null;
  if(shouldEnrichAiDecision(reason) && Number.isFinite(rawDistance) && planeId){
    const plane = payload.plane || findActualPlaneById(planeId);
    if(plane){
      scoringExplanation = scoreMoveForPlane(rawDistance, plane);
      if(adjustedScore === null && Number.isFinite(scoringExplanation?.finalScore)){
        adjustedScore = scoringExplanation.finalScore;
      }
    }
  }

  const derived = {
    planeId,
    rawDistance,
    adjustedScore,
    rotationBonus: scoringExplanation?.rotationBonus ?? null,
    idleTurns: scoringExplanation?.idleTurns ?? null,
    repeatInWindow: scoringExplanation?.repeatInWindow ?? null,
    repeatPenalty: scoringExplanation?.repeatPenalty ?? null,
    finalScore: Number.isFinite(scoringExplanation?.finalScore)
      ? scoringExplanation.finalScore
      : adjustedScore,
  };

  console.debug(
    `[ai] ${reason}`,
    AI_DECISION_DEEP_DEBUG_FLAG
      ? buildAiDecisionDeepPayload(reason, payload, derived)
      : buildAiDecisionCompactPayload(payload, derived)
  );
}

function evaluateAiGoalPriorityModel(context){
  // Legacy goal priority model has been removed from runtime loading.
  // Keep this function as a no-op fallback so AI goal selection continues
  // via the built-in heuristic branch below without hard failures.
  return null;
}

function selectAiModeForCurrentTurn(context){
  const {
    shouldUseFlagsMode,
    aiPlanes,
    enemies,
    availableEnemyFlags,
    stolenBlueFlagCarrier,
    blueInventoryCount,
    aiRiskProfile
  } = context;
  const scoreGap = greenScore - blueScore;
  const aiAliveCount = aiPlanes.length;
  const enemyAliveCount = enemies.length;
  const hasEnoughResourcesForAggression = blueInventoryCount >= AI_CARGO_SWITCH_TO_AGGRESSION_ITEMS;
  const openingAggressionBiasAllowed = isOpeningAggressionBiasAllowed(context);
  const goalModelEnabled = AI_USE_GOAL_PRIORITY_MODEL;
  const defensivePriority = context?.defensivePriority || getBlueDefensivePriority(context);
  const flagPressureOpportunity = evaluateFlagPressureOpportunity(context);
  const ownMineRiskPenalty = flagPressureOpportunity.mineOwnRoutePressure * 0.9
    + flagPressureOpportunity.mineOwnPathIntersectionPenalty * 0.65
    + (flagPressureOpportunity.routeDevaluedByOwnMines ? 0.22 : 0);
  const goalSelection = goalModelEnabled ? evaluateAiGoalPriorityModel({
    ...context,
    defensivePriority,
    flagPressureOpportunity,
  }) : null;
  const goalSelectionBlockedByDefense = Boolean(
    goalSelection
    && goalSelection.selectedMode === AI_MODES.FLAG_PRESSURE
    && defensivePriority?.blocksFlagPressure
  );

  if(goalSelectionBlockedByDefense){
    logAiDecision("mode_flag_pressure", {
      allowed: false,
      blockedByDefense: true,
      source: "goal_priority_model",
      defensivePriorityLevel: defensivePriority?.level || AI_DEFENSIVE_PRIORITY_LEVELS.NONE,
      defensivePrioritySource: defensivePriority?.primarySource || null,
      reason: `blocked_by_defensive_priority_${defensivePriority?.level || AI_DEFENSIVE_PRIORITY_LEVELS.NONE}`,
    });
    logAiDecision("defensive_priority_flag_plan_blocked", {
      blockedPlan: "mode_flag_pressure",
      source: "goal_priority_model",
      defensivePriorityLevel: defensivePriority?.level || AI_DEFENSIVE_PRIORITY_LEVELS.NONE,
      defensivePrioritySource: defensivePriority?.primarySource || null,
    });
  }

  if(goalSelection && !goalSelectionBlockedByDefense && applyAiGoalSelection(goalSelection, {
    toggleEnabled: AI_USE_GOAL_PRIORITY_MODEL,
    flagContinuationStatus: flagPressureOpportunity.flagContinuationStatus,
    flagContinuationReason: flagPressureOpportunity.flagContinuationReason,
    defensiveTriggerReason: defensivePriority?.primarySource || null,
  })){
    return aiRoundState.mode;
  }

  let mode = AI_MODES.ATTRITION;
  let targetPriorities = ["attack_enemy_plane", "close_distance"];

  if(defensivePriority?.hasFlagCarrierThreat){
    mode = AI_MODES.DEFENSE;
    targetPriorities = ["eliminate_flag_carrier", "protect_home_flag"];
  } else if(defensivePriority?.hasQuickFlagPickupThreat){
    mode = AI_MODES.DEFENSE;
    targetPriorities = ["protect_home_flag", "eliminate_flag_carrier", "close_distance"];
  } else if(defensivePriority?.hasDirectBaseThreat){
    mode = AI_MODES.DEFENSE;
    targetPriorities = ["protect_home_base", "eliminate_flag_carrier", "close_distance"];
  } else if(defensivePriority?.hasEarlyBaseWarningThreat){
    mode = AI_MODES.DEFENSE;
    targetPriorities = ["protect_home_base", "close_distance", "attack_enemy_plane"];
  } else if(aiRiskProfile?.profile === "conservative"){
    mode = AI_MODES.ATTRITION;
    targetPriorities = ["force_trade", "attack_enemy_plane", "contest_center"];
  } else if(aiRiskProfile?.profile === "comeback" && shouldUseFlagsMode && availableEnemyFlags.length > 0
      && (flagPressureOpportunity.flagReturnValue - flagPressureOpportunity.homeDefensePressure * 0.7 - ownMineRiskPenalty) >= Math.max(flagPressureOpportunity.cargoAlternativeValue, flagPressureOpportunity.attackAlternativeValue)){
    mode = AI_MODES.FLAG_PRESSURE;
    targetPriorities = flagPressureOpportunity.hasStrongFlagReturn
      ? ["return_with_flag", "capture_enemy_flag", "high_risk_attack"]
      : ["pickup_cargo", "attack_enemy_plane", "capture_enemy_flag"];
  } else if(hasEnoughResourcesForAggression && shouldUseFlagsMode && availableEnemyFlags.length > 0
      && (flagPressureOpportunity.flagReturnValue - flagPressureOpportunity.homeDefensePressure * 0.7 - ownMineRiskPenalty) >= Math.max(flagPressureOpportunity.cargoAlternativeValue, flagPressureOpportunity.attackAlternativeValue)){
    mode = AI_MODES.FLAG_PRESSURE;
    targetPriorities = flagPressureOpportunity.hasStrongFlagReturn
      ? ["return_with_flag", "capture_enemy_flag"]
      : ["attack_enemy_plane", "pickup_cargo", "capture_enemy_flag"];
  } else if(hasEnoughResourcesForAggression){
    mode = AI_MODES.ATTRITION;
    targetPriorities = ["attack_enemy_plane", "close_distance"];
  } else if(shouldUseFlagsMode && availableEnemyFlags.length > 0
      && (flagPressureOpportunity.flagReturnValue - flagPressureOpportunity.homeDefensePressure * 0.7 - ownMineRiskPenalty) >= Math.max(flagPressureOpportunity.cargoAlternativeValue, flagPressureOpportunity.attackAlternativeValue)){
    mode = AI_MODES.FLAG_PRESSURE;
    targetPriorities = flagPressureOpportunity.hasStrongFlagReturn
      ? ["return_with_flag", "capture_enemy_flag"]
      : ["pickup_cargo", "attack_enemy_plane", "capture_enemy_flag"];
  } else if(blueInventoryCount > 0 && aiAliveCount > 1){
    mode = AI_MODES.RESOURCE_FIRST;
    targetPriorities = ["pickup_cargo", "prepare_attack"];
  } else if(scoreGap > 0 || aiAliveCount < enemyAliveCount){
    mode = AI_MODES.DEFENSE;
    targetPriorities = ["preserve_planes", "safe_attack"];
  }

  let flagPressureGatePassed = null;
  let flagPressureGateReason = "flag_pressure_not_requested";
  let flagGrabJustified = false;
  let flagPressureBlockedByDefense = false;
  if(mode === AI_MODES.FLAG_PRESSURE && defensivePriority?.blocksFlagPressure){
    flagPressureBlockedByDefense = true;
    flagPressureGatePassed = false;
    flagPressureGateReason = `blocked_by_defensive_priority_${defensivePriority.level || AI_DEFENSIVE_PRIORITY_LEVELS.NONE}`;
    mode = flagPressureOpportunity.cargoAlternativeValue >= flagPressureOpportunity.attackAlternativeValue
      ? AI_MODES.RESOURCE_FIRST
      : AI_MODES.ATTRITION;
    targetPriorities = mode === AI_MODES.RESOURCE_FIRST
      ? ["pickup_cargo", "prepare_attack", "protect_home_base"]
      : ["attack_enemy_plane", "close_distance", "protect_home_base"];
    logAiDecision("mode_flag_pressure", {
      allowed: false,
      blockedByDefense: true,
      defensivePriorityLevel: defensivePriority?.level || AI_DEFENSIVE_PRIORITY_LEVELS.NONE,
      defensivePrioritySource: defensivePriority?.primarySource || null,
      reason: flagPressureGateReason,
    });
    logAiDecision("defensive_priority_flag_plan_blocked", {
      blockedPlan: "mode_flag_pressure",
      source: "mode_selection",
      defensivePriorityLevel: defensivePriority?.level || AI_DEFENSIVE_PRIORITY_LEVELS.NONE,
      defensivePrioritySource: defensivePriority?.primarySource || null,
    });
  }
  if(mode === AI_MODES.FLAG_PRESSURE){
    const inSafetyWindow = turnAdvanceCount <= AI_FLAG_PRESSURE_SAFETY_WINDOW_TURN_LIMIT;
    const defenseAdjustedFlagValue = flagPressureOpportunity.flagReturnValue - flagPressureOpportunity.homeDefensePressure * 0.7 - ownMineRiskPenalty;
    const strongerThanCargo = defenseAdjustedFlagValue >= flagPressureOpportunity.cargoAlternativeValue;
    const strongerThanAttack = defenseAdjustedFlagValue >= flagPressureOpportunity.attackAlternativeValue;
    const grabOnlyFallback = flagPressureOpportunity.canReachEnemyFlag
      && flagPressureOpportunity.flagGrabValue >= AI_FLAG_PRESSURE_GRAB_ONLY_MAX_VALUE
      && flagPressureOpportunity.flagReturnValue < AI_FLAG_PRESSURE_RETURN_MIN_VALUE;
    const safeEscapeMissing = flagPressureOpportunity.canReachEnemyFlag && !flagPressureOpportunity.hasSafeEscapeOpportunity;
    const blockedByOwnMineRisk = flagPressureOpportunity.routeDevaluedByOwnMines
      && flagPressureOpportunity.mineOwnPathIntersectionPenalty > 0;
    flagGrabJustified = flagPressureOpportunity.hasStrongFlagReturn && strongerThanCargo && strongerThanAttack;

    flagPressureGatePassed = !inSafetyWindow || flagGrabJustified;
    if(!inSafetyWindow){
      flagPressureGateReason = "safety_window_inactive";
    } else if(blockedByOwnMineRisk){
      flagPressureGateReason = "route_devalued_by_own_mine_risk";
      mode = flagPressureOpportunity.cargoAlternativeValue >= flagPressureOpportunity.attackAlternativeValue
        ? AI_MODES.RESOURCE_FIRST
        : AI_MODES.ATTRITION;
      targetPriorities = mode === AI_MODES.RESOURCE_FIRST
        ? ["pickup_cargo", "prepare_attack", "capture_enemy_flag"]
        : ["attack_enemy_plane", "close_distance", "capture_enemy_flag"];
    } else if(safeEscapeMissing){
      flagPressureGateReason = "pickup_without_safe_escape";
      mode = flagPressureOpportunity.cargoAlternativeValue >= flagPressureOpportunity.attackAlternativeValue
        ? AI_MODES.RESOURCE_FIRST
        : AI_MODES.ATTRITION;
      targetPriorities = mode === AI_MODES.RESOURCE_FIRST
        ? ["pickup_cargo", "prepare_attack", "capture_enemy_flag"]
        : ["attack_enemy_plane", "close_distance", "capture_enemy_flag"];
    } else if(flagPressureOpportunity.homeDefensePressure >= 0.55){
      flagPressureGateReason = "flag_pressure_blocked_by_home_defense";
      mode = flagPressureOpportunity.cargoAlternativeValue >= flagPressureOpportunity.attackAlternativeValue
        ? AI_MODES.RESOURCE_FIRST
        : AI_MODES.ATTRITION;
      targetPriorities = mode === AI_MODES.RESOURCE_FIRST
        ? ["pickup_cargo", "prepare_attack", "protect_home_base"]
        : ["attack_enemy_plane", "close_distance", "protect_home_base"];
      logAiDecision("flag_pressure_blocked_by_home_defense", {
        homeDefensePressure: flagPressureOpportunity.homeDefensePressure,
        baseControlLoss: flagPressureOpportunity.baseControlLoss,
        dangerousEnemyNearBlueBase: flagPressureOpportunity.dangerousEnemyNearBlueBase,
        interceptWindowLoss: flagPressureOpportunity.interceptWindowLoss,
        hasComfortableDefensiveResponse: flagPressureOpportunity.hasComfortableDefensiveResponse,
        criticalHomeDefenseThreat: flagPressureOpportunity.criticalHomeDefenseThreat,
      });
    } else if(flagGrabJustified){
      flagPressureGateReason = "flag_available_and_safe_to_continue";
    } else if(grabOnlyFallback){
      flagPressureGateReason = "flag_available_escape_exists_but_return_too_weak";
      mode = flagPressureOpportunity.cargoAlternativeValue >= flagPressureOpportunity.attackAlternativeValue
        ? AI_MODES.RESOURCE_FIRST
        : AI_MODES.ATTRITION;
      targetPriorities = mode === AI_MODES.RESOURCE_FIRST
        ? ["pickup_cargo", "prepare_attack", "capture_enemy_flag"]
        : ["attack_enemy_plane", "close_distance", "capture_enemy_flag"];
    } else {
      flagPressureGateReason = "flag_available_escape_exists_but_return_too_weak";
      mode = flagPressureOpportunity.cargoAlternativeValue >= flagPressureOpportunity.attackAlternativeValue
        ? AI_MODES.RESOURCE_FIRST
        : AI_MODES.ATTRITION;
      targetPriorities = mode === AI_MODES.RESOURCE_FIRST
        ? ["pickup_cargo", "prepare_attack"]
        : ["attack_enemy_plane", "close_distance"];
    }
  }

  if(openingAggressionBiasAllowed && mode === AI_MODES.ATTRITION){
    targetPriorities = ["attack_enemy_plane", "close_distance", ...targetPriorities.filter((goal) => goal !== "attack_enemy_plane" && goal !== "close_distance")];
  }

  aiRoundState.mode = mode;
  aiRoundState.targetPriorities = targetPriorities;
  aiRoundState.currentGoal = targetPriorities[0] ?? null;
  logAiDecision("mode_selected", {
    mode,
    turnAdvanceCount,
    blueInventoryCount,
    hasEnoughResourcesForAggression,
    openingAggressionBiasAllowed,
    flagPressureGatePassed,
    flagPressureGateReason,
    flagGrabJustified,
    defensivePriorityLevel: defensivePriority?.level || AI_DEFENSIVE_PRIORITY_LEVELS.NONE,
    defensivePrioritySource: defensivePriority?.primarySource || null,
    defensivePriorityRequiresIntercept: Boolean(defensivePriority?.requiresImmediateIntercept),
    flagPressureBlockedByDefense,
    expectedRetreatChance: flagPressureOpportunity.expectedRetreatChance,
    returnLaneThreat: flagPressureOpportunity.returnLaneThreat,
    flagGrabValue: flagPressureOpportunity.flagGrabValue,
    postPickupEscapeValue: flagPressureOpportunity.postPickupEscapeValue,
    flagReturnValue: flagPressureOpportunity.flagReturnValue,
    flagContinuationStatus: flagPressureOpportunity.flagContinuationStatus,
    flagContinuationReason: flagPressureOpportunity.flagContinuationReason,
    hasSafeEscapeOpportunity: flagPressureOpportunity.hasSafeEscapeOpportunity,
    cargoAlternativeValue: flagPressureOpportunity.cargoAlternativeValue,
    attackAlternativeValue: flagPressureOpportunity.attackAlternativeValue,
    baseControlLoss: flagPressureOpportunity.baseControlLoss,
    dangerousEnemyNearBlueBase: flagPressureOpportunity.dangerousEnemyNearBlueBase,
    interceptWindowLoss: flagPressureOpportunity.interceptWindowLoss,
    hasComfortableDefensiveResponse: flagPressureOpportunity.hasComfortableDefensiveResponse,
    homeDefensePressure: flagPressureOpportunity.homeDefensePressure,
    criticalHomeDefenseThreat: flagPressureOpportunity.criticalHomeDefenseThreat,
    bestFlagRoute: flagPressureOpportunity.bestFlagRoute,
    ownMineRiskPenalty: Number(ownMineRiskPenalty.toFixed(3)),
    mineOwnRoutePressure: flagPressureOpportunity.mineOwnRoutePressure,
    mineOwnPathIntersectionPenalty: flagPressureOpportunity.mineOwnPathIntersectionPenalty,
    routeDevaluedByOwnMines: flagPressureOpportunity.routeDevaluedByOwnMines,
    riskProfile: aiRiskProfile?.profile || "balanced",
    priorities: targetPriorities,
  });
  return mode;
}
