(function(global){
  const GOAL_CLASS_DEFINITIONS = Object.freeze({
    score_by_flag: Object.freeze({
      weight: 0.92,
      mode: "flag_pressure",
      priorities: Object.freeze(["capture_enemy_flag", "return_with_flag", "high_risk_attack"]),
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
    const shouldUseFlagsMode = Boolean(context.shouldUseFlagsMode);

    return {
      prevent_enemy_flag_score: {
        active: shouldUseFlagsMode && hasStolenBlueFlagCarrier,
        reason: hasStolenBlueFlagCarrier ? "enemy_carrying_blue_flag" : "no_enemy_flag_carrier",
      },
      score_by_flag: {
        active: shouldUseFlagsMode
          && availableEnemyFlagsCount > 0
          && (scoreGap > 0 || aiAliveCount >= enemyAliveCount || blueInventoryCount >= 2),
        reason: availableEnemyFlagsCount > 0
          ? "enemy_flags_available_with_pressure_window"
          : "no_enemy_flags_available",
      },
      survival_reposition: {
        active: aiAliveCount > 0
          && (aiAliveCount < enemyAliveCount || (scoreGap < 0 && aiAliveCount <= enemyAliveCount)),
        reason: aiAliveCount < enemyAliveCount
          ? "numerical_disadvantage"
          : "score_lead_needs_preservation",
      },
      cargo_swing_pickup: {
        active: readyCargoCount > 0
          && aiAliveCount > 1
          && !hasStolenBlueFlagCarrier
          && (scoreGap >= 0 || blueInventoryCount === 0),
        reason: readyCargoCount > 0 ? "cargo_ready_for_swing_turn" : "no_ready_cargo",
      },
      secure_kill: {
        active: aiAliveCount > 0
          && enemyAliveCount > 0
          && !hasStolenBlueFlagCarrier
          && (scoreGap >= 0 || aiAliveCount >= enemyAliveCount),
        reason: "stable_board_for_direct_attack",
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
