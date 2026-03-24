#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const paramsStart = source.indexOf('(', start);
  if(paramsStart === -1) throw new Error(`Function params start not found for: ${fnName}`);
  let paramDepth = 0;
  let bodyStart = -1;
  for(let i = paramsStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '(') paramDepth += 1;
    if(ch === ')'){
      paramDepth -= 1;
      if(paramDepth === 0){
        bodyStart = source.indexOf('{', i);
        break;
      }
    }
  }
  if(bodyStart === -1) throw new Error(`Function body start not found for: ${fnName}`);
  let depth = 0;
  for(let i = bodyStart; i < source.length; i += 1){
    const ch = source[i];
    if(ch === '{') depth += 1;
    if(ch === '}') depth -= 1;
    if(depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`Function body end not found for: ${fnName}`);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const source = fs.readFileSync('script.js', 'utf8');
const failSafeSrc = extractFunctionSource(source, 'failSafeAdvanceTurn');
const watchdogSrc = extractFunctionSource(source, 'scheduleAiLaunchSessionWatchdog');

function createBaseContext(){
  const logs = [];
  const launches = [];
  const releases = [];
  const timers = [];
  let advanced = 0;
  let analyzerStage = null;

  const context = {
    Number,
    Math,
    Set,
    aiRoundState: { currentGoal: 'stuck_launch_goal' },
    turnColors: ['blue'],
    turnIndex: 0,
    aiMoveScheduled: true,
    aiLaunchSession: null,
    clearAiLaunchSessionWatchdog: (session) => {
      if(session) session.watchdogTimerId = null;
    },
    performance: { now: () => 1000 },
    setTimeout: (fn, delay) => {
      timers.push({ fn, delay });
      return timers.length;
    },
    resetAiLaunchSessionVisualState: () => {},
    console: { warn: () => {} },
    pickAiLaunchCandidateForRelease: () => null,
    isPlaneLaunchStateReady: () => false,
    releaseAiLaunchSession: (session, reason, now) => {
      releases.push({ session, reason, now });
    },
    recordAiSelfAnalyzerDecision: (stage) => { analyzerStage = stage; },
    logAiDecision: (event, payload) => { logs.push({ event, payload }); },
    getFailSafeMinimalTargetedMove: () => ({ plane: { id: 'blue-failsafe' }, vx: 10, vy: 5, totalDist: 20 }),
    getForcedProgressLaunchMove: () => ({ plane: { id: 'blue-progress' }, vx: 8, vy: 3, totalDist: 10 }),
    getGuaranteedAnyLegalLaunch: () => ({ plane: { id: 'blue-guaranteed' }, vx: 4, vy: 2, totalDist: 5 }),
    normalizeFailSafeLaunchCandidate: (move) => move,
    issueAIMove: (plane, vx, vy) => { launches.push({ planeId: plane.id, vx, vy }); },
    advanceTurn: () => { advanced += 1; },
  };

  vm.createContext(context);
  vm.runInContext(failSafeSrc, context);
  vm.runInContext(watchdogSrc, context);

  return {
    context,
    logs,
    launches,
    releases,
    timers,
    getAdvanced: () => advanced,
    getAnalyzerStage: () => analyzerStage,
  };
}

{
  const runtime = createBaseContext();
  runtime.context.failSafeAdvanceTurn('ai_launch_watchdog_fail_safe', {
    goal: 'stuck_launch_goal',
    planeId: 'blue-stuck',
    reasonCodes: ['watchdog_no_release_candidate'],
    rejectReasons: ['watchdog_no_release_candidate'],
  });

  assert(runtime.launches.length === 0,
    'Watchdog fail-safe must not select another forced launch in the same stuck scenario.');
  assert(runtime.getAdvanced() === 1,
    'Watchdog fail-safe must advance turn exactly once.');
  assert(runtime.context.aiMoveScheduled === false,
    'Watchdog fail-safe must clear aiMoveScheduled before advancing the turn.');
  assert(runtime.getAnalyzerStage() === 'ai_launch_watchdog_fail_safe',
    'Watchdog fail-safe reason must be recorded in analyzer diagnostics.');
  assert(runtime.logs.some((entry) => entry.event === 'fail_safe_direct_turn_advance'),
    'Watchdog fail-safe must log direct turn advance path.');
  assert(!runtime.logs.some((entry) => entry.event === 'fail_safe_forced_launch_selected'),
    'Watchdog fail-safe must not log forced launch selection.');
}

{
  const runtime = createBaseContext();
  runtime.context.pickAiLaunchCandidateForRelease = () => ({ metrics: { score: 1 } });
  runtime.context.isPlaneLaunchStateReady = () => true;
  const session = { plane: { id: 'blue-ready' }, watchdogDeadlineAt: 900, watchdogTimerId: null };
  runtime.context.aiLaunchSession = session;

  runtime.context.scheduleAiLaunchSessionWatchdog(session);
  assert(runtime.timers.length === 1, 'Watchdog should schedule exactly one timeout.');
  runtime.timers[0].fn();

  assert(runtime.releases.length === 1,
    'When a valid release candidate exists, watchdog must perform only immediate release.');
  assert(runtime.getAdvanced() === 0,
    'Immediate release path must not advance turn.');
  assert(runtime.launches.length === 0,
    'Immediate release path must not synthesize a new forced move.');
  assert(runtime.context.aiLaunchSession === session,
    'Immediate release path must keep the active session until release handles it.');
}

{
  const runtime = createBaseContext();
  const session = { plane: { id: 'blue-stuck' }, watchdogDeadlineAt: 900, watchdogTimerId: null };
  runtime.context.aiLaunchSession = session;

  runtime.context.scheduleAiLaunchSessionWatchdog(session);
  assert(runtime.timers.length === 1, 'Watchdog should schedule exactly one timeout for stuck session.');
  runtime.timers[0].fn();

  assert(runtime.releases.length === 0,
    'Without a valid release candidate, watchdog must not attempt immediate release.');
  assert(runtime.getAdvanced() === 1,
    'Without a valid release candidate, watchdog must advance the turn once.');
  assert(runtime.launches.length === 0,
    'Stuck watchdog timeout must not fall back to another forced launch.');
  assert(runtime.context.aiLaunchSession === null,
    'Watchdog fallback path must clear active launch session before direct turn advance.');
}

console.log('Smoke test passed: watchdog timeout keeps a single recovery action and never re-enters forced launch fail-safe.');
