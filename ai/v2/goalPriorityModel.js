(function(global){
  const GOAL_CLASS_DEFINITIONS = Object.freeze({
    score_by_flag: Object.freeze({
      weight: 0.7,
      mode: "flag_pressure",
      priorities: Object.freeze(["return_with_flag", "capture_enemy_flag", "pickup_cargo", "attack_enemy_plane", "high_risk_attack"]),
    }),
    prevent_enemy_flag_score: Object.freeze({
      weight: 0.98,
      mode: "defense",
      priorities: Object.freeze(["eliminate_flag_carrier", "protect_home_flag"]),
    }),
    secure_kill: Object.freeze({
      weight: 0.74,
      mode: "attrition",
      priorities: Object.freeze(["attack_enemy_plane", "close_distance"]),
    }),
    cargo_swing_pickup: Object.freeze({
      weight: 0.66,
      mode: "resource_first",
      priorities: Object.freeze(["pickup_cargo", "prepare_attack"]),
    }),
    survival_reposition: Object.freeze({
      weight: 0.88,
      mode: "defense",
      priorities: Object.freeze(["preserve_planes", "safe_attack"]),
    }),
  });

  function buildActivationChecks(context = {}){
    const scoreGap = Number.isFinite(context.scoreGap) ? context.scoreGap : 0;
    const aiAliveCount = Number.isFinite(context.aiAliveCount) ? context.aiAliveCount : 0;
    const enemyAliveCount = Number.isFinite(context.enemyAliveCount) ? context.enemyAliveCount : 0;
    const availableEnemyFlagsCount = Number.isFinite(context.availableEnemyFlagsCount) ? context.availableEnemyFlagsCount : 0;
    const blueInventoryCount = Number.isFinite(context.blueInventoryCount) ? context.blueInventoryCount : 0;
    const readyCargoCount = Number.isFinite(context.readyCargoCount) ? context.readyCargoCount : 0;
    const hasStolenBlueFlagCarrier = Boolean(context.hasStolenBlueFlagCarrier);
    const hasImmediateBlueFlagTheftThreat = Boolean(context.hasImmediateBlueFlagTheftThreat);
    const shouldUseFlagsMode = Boolean(context.shouldUseFlagsMode);
    const canReachEnemyFlag = Boolean(context.canReachEnemyFlag);
    const hasReturnRouteOpportunity = Boolean(context.hasReturnRouteOpportunity);
    const hasSafePostPickupEscape = Boolean(context.hasSafePostPickupEscape);
    const expectedRetreatChance = Number.isFinite(context.expectedRetreatChance) ? context.expectedRetreatChance : 0;
    const returnLaneThreat = Number.isFinite(context.returnLaneThreat) ? context.returnLaneThreat : 1;
    const flagGrabValue = Number.isFinite(context.flagGrabValue) ? context.flagGrabValue : 0;
    const postPickupEscapeValue = Number.isFinite(context.postPickupEscapeValue) ? context.postPickupEscapeValue : 0;
    const flagReturnValue = Number.isFinite(context.flagReturnValue) ? context.flagReturnValue : 0;
    const cargoAlternativeValue = Number.isFinite(context.cargoAlternativeValue) ? context.cargoAlternativeValue : 0;
    const attackAlternativeValue = Number.isFinite(context.attackAlternativeValue) ? context.attackAlternativeValue : 0;
    const mineRoutePressure = Number.isFinite(context.mineRoutePressure) ? context.mineRoutePressure : 0;
    const mineDetourValue = Number.isFinite(context.mineDetourValue) ? context.mineDetourValue : 0;
    const mineDefensiveUrgency = Number.isFinite(context.mineDefensiveUrgency) ? context.mineDefensiveUrgency : 0;
    const trappedByMines = Boolean(context.trappedByMines);
    const enemyMineCoverAfterAdvance = Boolean(context.enemyMineCoverAfterAdvance);

    const returnBeatsAlternatives = flagReturnValue >= cargoAlternativeValue
      && flagReturnValue >= attackAlternativeValue;
    const mineAllowsFlagPlan = mineRoutePressure <= 0.32 && !enemyMineCoverAfterAdvance;
    const canOnlyGrabFlag = canReachEnemyFlag && !hasReturnRouteOpportunity;

    return {
      prevent_enemy_flag_score: {
        active: shouldUseFlagsMode && (hasStolenBlueFlagCarrier || hasImmediateBlueFlagTheftThreat),
        reason: hasStolenBlueFlagCarrier
          ? "enemy_carrying_blue_flag"
          : hasImmediateBlueFlagTheftThreat
            ? "enemy_almost_guaranteed_blue_flag_pickup"
            : "no_enemy_flag_carrier_or_immediate_theft_threat",
      },
      score_by_flag: {
        active: shouldUseFlagsMode
          && availableEnemyFlagsCount > 0
          && hasSafePostPickupEscape
          && hasReturnRouteOpportunity
          && expectedRetreatChance >= 0.64
          && returnLaneThreat <= 0.45
          && postPickupEscapeValue >= 0.45
          && mineAllowsFlagPlan
          && returnBeatsAlternatives,
        reason: !shouldUseFlagsMode
          ? "flags_mode_disabled"
          : availableEnemyFlagsCount <= 0
            ? "no_enemy_flags_available"
            : !canReachEnemyFlag
              ? "cannot_reach_enemy_flag"
              : !hasSafePostPickupEscape
                ? "pickup_without_safe_escape"
                : canOnlyGrabFlag
                  ? "grab_without_return_plan"
                  : !hasReturnRouteOpportunity
                    ? "return_route_not_viable"
                    : returnLaneThreat > 0.45
                      ? "return_lane_too_hot"
                      : mineRoutePressure > 0.32
                        ? "objective_delayed_due_to_mine_control"
                        : enemyMineCoverAfterAdvance
                          ? "route_devalued_by_enemy_mine"
                          : postPickupEscapeValue < 0.45
                            ? "safe_escape_too_weak"
                            : !returnBeatsAlternatives
                              ? "alternatives_outvalue_flag_plan"
                              : "flag_return_plan_profitable",
      },
      survival_reposition: {
        active: aiAliveCount > 0
          && (aiAliveCount < enemyAliveCount || (scoreGap < 0 && aiAliveCount <= enemyAliveCount) || trappedByMines || mineDefensiveUrgency >= 0.34),
        reason: trappedByMines || mineDefensiveUrgency >= 0.34
          ? "reposition_due_to_mine_trap"
          : aiAliveCount < enemyAliveCount
            ? "numerical_disadvantage"
            : "score_lead_needs_preservation",
      },
      cargo_swing_pickup: {
        active: readyCargoCount > 0
          && aiAliveCount > 1
          && !hasStolenBlueFlagCarrier
          && (scoreGap >= 0 || blueInventoryCount === 0 || cargoAlternativeValue >= flagReturnValue || mineDetourValue >= 0.24),
        reason: readyCargoCount > 0 ? "cargo_ready_for_swing_turn" : "no_ready_cargo",
      },
      secure_kill: {
        active: aiAliveCount > 0
          && enemyAliveCount > 0
          && !hasStolenBlueFlagCarrier
          && (scoreGap >= 0 || aiAliveCount >= enemyAliveCount || attackAlternativeValue > flagReturnValue),
        reason: attackAlternativeValue > flagReturnValue
          ? "direct_attack_outvalues_flag_plan"
          : "stable_board_for_direct_attack",
      },
    };
  }

  function evaluate(context = {}){
    const activation = buildActivationChecks(context);
    const evaluated = Object.keys(GOAL_CLASS_DEFINITIONS).map((goalClassName) => {
      const goalDefinition = GOAL_CLASS_DEFINITIONS[goalClassName];
      const activationEntry = activation[goalClassName] || { active: false, reason: "activation_missing" };
      return {
        goalClassName,
        active: Boolean(activationEntry.active),
        weight: goalDefinition.weight,
        reason: activationEntry.reason,
        mode: goalDefinition.mode,
        priorities: goalDefinition.priorities.slice(),
      };
    });

    const activeGoals = evaluated
      .filter((entry) => entry.active)
      .sort((a, b) => b.weight - a.weight);

    const selectedGoal = activeGoals[0] || null;

    return {
      selectedGoalClass: selectedGoal?.goalClassName || null,
      selectedMode: selectedGoal?.mode || null,
      selectedPriorities: selectedGoal ? selectedGoal.priorities.slice() : [],
      selectedWeight: selectedGoal?.weight ?? null,
      goalClassEvaluations: evaluated,
      usedModel: true,
    };
  }

  global.PaperWingsGoalPriorityModel = {
    GOAL_CLASS_DEFINITIONS,
    evaluate,
  };
})(typeof window !== "undefined" ? window : globalThis);
