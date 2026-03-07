#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const { execSync } = require('child_process');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function extractConstValue(sourceText, name, extraContext = {}){
  const match = sourceText.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if(!match) throw new Error(`Constant not found in script.js: ${name}`);
  return Number(vm.runInNewContext(match[1], { Math, ...extraContext }));
}

function createRuntime(source){
  const getStableHashFromPartsSrc = extractFunctionSource(source, 'getStableHashFromParts');
  const getAiCandidateClassLabelSrc = extractFunctionSource(source, 'getAiCandidateClassLabel');
  const isAiRepeatPlaneCriticalCandidateSrc = extractFunctionSource(source, 'isAiRepeatPlaneCriticalCandidate');
  const compareSrc = extractFunctionSource(source, 'compareAiCandidateByScoreAndRotation');

  const MAX_DRAG_DISTANCE = extractConstValue(source, 'MAX_DRAG_DISTANCE');
  const ATTACK_RANGE_PX = extractConstValue(source, 'ATTACK_RANGE_PX', { MAX_DRAG_DISTANCE });

  const context = {
    Math,
    aiRoundState: {
      turnNumber: 1,
      tieBreakerSeed: 0,
      lastLaunchedPlaneId: 'left',
      openingTemplateSuppressed: false,
    },
    AI_REPEAT_OPENING_FORCE_TURN_LIMIT: extractConstValue(source, 'AI_REPEAT_OPENING_FORCE_TURN_LIMIT'),
    AI_REPEAT_FORCE_SCORE_MARGIN: extractConstValue(source, 'AI_REPEAT_FORCE_SCORE_MARGIN', { MAX_DRAG_DISTANCE }),
    AI_ROTATION_TACTICAL_PRIORITY_GAP: extractConstValue(source, 'AI_ROTATION_TACTICAL_PRIORITY_GAP', { MAX_DRAG_DISTANCE }),
    AI_FALLBACK_ATTACK_SCORE_TIE_EPSILON: extractConstValue(source, 'AI_FALLBACK_ATTACK_SCORE_TIE_EPSILON', { ATTACK_RANGE_PX }),
    AI_CLASS_SCORE_TIE_EPSILON: extractConstValue(source, 'AI_CLASS_SCORE_TIE_EPSILON'),
    AI_OPENING_SOFT_RANDOM_TURN_LIMIT: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_TURN_LIMIT'),
    AI_OPENING_SOFT_RANDOM_SCORE_MARGIN: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_SCORE_MARGIN', { MAX_DRAG_DISTANCE }),
    AI_OPENING_SOFT_RANDOM_MAX_SHIFT: extractConstValue(source, 'AI_OPENING_SOFT_RANDOM_MAX_SHIFT'),
    AI_REPEAT_ALLOWED_REASON_CODES: [],
    AI_REPEAT_ALLOWED_REASON_TOKENS: [],
    getAiNoticeableProgressMeta(){ return null; },
    logAiDecision(){},
    scoreMoveForPlane(){ return { idleTurns: 0, repeatInWindow: 0, rotationBonus: 0 }; },
  };

  vm.createContext(context);
  vm.runInContext([getStableHashFromPartsSrc, getAiCandidateClassLabelSrc, isAiRepeatPlaneCriticalCandidateSrc, compareSrc].join('\n\n'), context);
  return context;
}

function measurePattern(source){
  const rt = createRuntime(source);
  const leftCandidate = {
    plane: { id: 'left' },
    score: 100,
    normalizedScore: 100,
    goalName: 'capture_enemy_flag',
    decisionReason: 'flag_capture_direct',
    selectedClass: 'direct',
  };
  const rightCandidate = {
    plane: { id: 'right' },
    score: 100,
    normalizedScore: 100,
    goalName: 'capture_enemy_flag',
    decisionReason: 'flag_capture_direct',
    selectedClass: 'direct',
  };

  function runWindow(openingTemplateSuppressed){
    const result = { left: 0, right: 0 };
    for(let seed = 1; seed <= 500; seed += 1){
      rt.aiRoundState.tieBreakerSeed = seed;
      rt.aiRoundState.openingTemplateSuppressed = openingTemplateSuppressed;
      const prefersRight = rt.compareAiCandidateByScoreAndRotation(rightCandidate, leftCandidate, ['opening_template_probe']);
      const winner = prefersRight ? 'right' : 'left';
      result[winner] += 1;
    }
    return {
      ...result,
      rightShare: result.right / 500,
      leftShare: result.left / 500,
    };
  }

  return {
    templateActive: runWindow(false),
    templateSuppressed: runWindow(true),
  };
}

const currentSource = fs.readFileSync('script.js', 'utf8');
const baselineSource = execSync('git show HEAD:script.js', { encoding: 'utf8' });

const baseline = measurePattern(baselineSource);
const updated = measurePattern(currentSource);

console.log(JSON.stringify({ baseline, updated }, null, 2));
