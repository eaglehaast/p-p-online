#!/usr/bin/env node
'use strict';
const fs = require('fs'); const vm = require('vm');
function extract(source, name){ const s=source.indexOf(`function ${name}(`); const b=source.indexOf('{',s); let d=0; for(let i=b;i<source.length;i++){ if(source[i]==='{') d++; if(source[i]==='}') d--; if(d===0) return source.slice(s,i+1);} throw new Error('not found'); }
function assert(c,m){ if(!c) throw new Error(m); }
const src=fs.readFileSync('script.js','utf8'); const fn=extract(src,'maybeUseInventoryBeforeLaunch');
let invisQueued = 0; const logs=[];
function buildContext(aimingAmplitude){
  return {
    Math, Number, Boolean, Infinity, AI_ENGINE_MODE:'v2', AI_V2_INVENTORY_PHASE:3, MAX_DRAG_DISTANCE:300, FIELD_FLIGHT_DURATION_SEC:1, AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD:2,
    CELL_SIZE:10,
    INVENTORY_ITEM_TYPES:{FUEL:'fuel',CROSSHAIR:'crosshair',MINE:'mine',DYNAMITE:'dynamite',INVISIBILITY:'invisible',WINGS:'wings'},
    aiRoundState:{inventoryPhase:3,lastInventorySoftFallbackUsed:false,inventoryIdleTurns:0,inventorySoftFallbackCooldown:5},
    evaluateBlueInventoryState:()=>({total:1,counts:{fuel:0,crosshair:0,mine:0,dynamite:0,wings:0,invisible:1}}),
    getBluePriorityEnemy:()=>null, getAiMoveLandingPoint:()=>({x:0,y:0}), getBaseAnchor:()=>({x:0,y:0}), evaluateCrosshairBestUse:()=>null,
    logAiDecision:(name,data)=>logs.push({name,data}), applyItemToOwnPlane:()=>false, removeItemFromInventory:()=>{},
    tryPlaceBlueDefensiveMine:()=>false, tryPlaceBlueMineNearEnemyBase:()=>false, getDynamiteCandidateForCurrentRoute:()=>null,
    getNearestDynamiteTargetToPoint:()=>null, isDynamiteTargetUsefulForCurrentRoute:()=>false, placeBlueDynamiteAt:()=>false,
    queueInvisibilityEffectForPlayer:()=>{ invisQueued+=1; return true; },
    dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), isPathClear:()=>true, settings:{aimingAmplitude,flightRangeCells:30}, ATTACK_RANGE_PX:100,
  };
}
const move={plane:{id:'p',x:0,y:0},vx:1,vy:0,totalDist:220};
const ctxLow=buildContext(10); vm.createContext(ctxLow); vm.runInContext(fn,ctxLow);
ctxLow.getPlaneEffectiveRangePx = () => 140;
ctxLow.getEffectiveFlightRangeCells = () => 30;
ctxLow.getAvailableFlagsByColor = () => [];
ctxLow.getFlagAnchor = () => null;
const lowUsed=ctxLow.maybeUseInventoryBeforeLaunch({enemies:[{x:60,y:0}],aiPlanes:[{id:'p'}],aiRiskProfile:{profile:'balanced'}}, move);
assert(lowUsed===false,'phase3 should skip invisibility when expected accuracy penalty is too low');
const ctxHigh=buildContext(80); vm.createContext(ctxHigh); vm.runInContext(fn,ctxHigh);
ctxHigh.getPlaneEffectiveRangePx = () => 140;
ctxHigh.getEffectiveFlightRangeCells = () => 30;
ctxHigh.getAvailableFlagsByColor = () => [];
ctxHigh.getFlagAnchor = () => null;
const highUsed=ctxHigh.maybeUseInventoryBeforeLaunch({enemies:[{x:60,y:0}],aiPlanes:[{id:'p'}],aiRiskProfile:{profile:'balanced'}}, move);
assert(highUsed===true,'phase3 should use invisibility immediately when enemy counter-aim pressure is high');
assert(invisQueued===1,'invisibility should be queued exactly once in high-pressure case');
assert(logs.some((entry)=>entry.name==='invisibility_counter_aiming_check'),'phase3 must log counter-aiming accuracy check');
console.log('Smoke test passed: v2 inventory phase 3 uses invisibility with enemy aiming-accuracy check.');
