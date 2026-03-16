#!/usr/bin/env node
'use strict';
const fs = require('fs'); const vm = require('vm');
function extract(source, name){ const s=source.indexOf(`function ${name}(`); const b=source.indexOf('{',s); let d=0; for(let i=b;i<source.length;i++){ if(source[i]==='{') d++; if(source[i]==='}') d--; if(d===0) return source.slice(s,i+1);} throw new Error('not found'); }
function assert(c,m){ if(!c) throw new Error(m); }
const src=fs.readFileSync('script.js','utf8'); const fn=extract(src,'maybeUseInventoryBeforeLaunch');
let removed=[]; let mineCalls=0;
const ctx={ Math, Number, Boolean, Infinity, AI_ENGINE_MODE:'v2', AI_V2_INVENTORY_PHASE:1, MAX_DRAG_DISTANCE:300, FIELD_FLIGHT_DURATION_SEC:1, AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD:2,
CELL_SIZE:10,
INVENTORY_ITEM_TYPES:{FUEL:'fuel',CROSSHAIR:'crosshair',MINE:'mine',DYNAMITE:'dynamite',INVISIBILITY:'invisible',WINGS:'wings'},
aiRoundState:{inventoryPhase:1,lastInventorySoftFallbackUsed:false,inventoryIdleTurns:0,inventorySoftFallbackCooldown:0},
evaluateBlueInventoryState:()=>({total:2,counts:{fuel:0,crosshair:1,mine:1,dynamite:0,wings:0,invisible:0}}),
getBluePriorityEnemy:()=>({id:'e',x:80,y:0,shieldActive:false}), getAiMoveLandingPoint:()=>({x:60,y:0}), getBaseAnchor:()=>({x:200,y:0}),
evaluateCrosshairBestUse:()=>({totalValue:0.9, hitChance:0.9, targetValue:0.7, objectiveValue:0.7, carriesBlueFlag:false, distanceToEnemy:80, hasCleanPath:true, enemy:{id:'e'}}),
logAiDecision:()=>{}, applyItemToOwnPlane:(t)=>t==='crosshair', removeItemFromInventory:(c,t)=>removed.push(t),
tryPlaceBlueDefensiveMine:()=>{mineCalls+=1; return true;}, tryPlaceBlueMineNearEnemyBase:()=>{mineCalls+=1; return true;},
dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y), isPathClear:()=>true, getDynamiteCandidateForCurrentRoute:()=>null, getNearestDynamiteTargetToPoint:()=>null,
isDynamiteTargetUsefulForCurrentRoute:()=>false, placeBlueDynamiteAt:()=>false, queueInvisibilityEffectForPlayer:()=>false, settings:{aimingAmplitude:80,flightRangeCells:30}, ATTACK_RANGE_PX:100 };
ctx.getPlaneEffectiveRangePx = () => 140;
ctx.getEffectiveFlightRangeCells = () => 30;
ctx.getAvailableFlagsByColor = () => [];
ctx.getFlagAnchor = () => null;
ctx.getCenterControlAnchor = () => ({ x: 0, y: 0 });
vm.createContext(ctx); vm.runInContext(fn,ctx);
const used=ctx.maybeUseInventoryBeforeLaunch({enemies:[{x:80,y:0}]},{plane:{id:'p',x:0,y:0},vx:1,vy:0,totalDist:100});
assert(used===true,'phase1 should allow buff use');
assert(removed.includes('crosshair'),'phase1 should consume crosshair buff');
assert(mineCalls===0,'phase1 must not execute tactical mine logic');
console.log('Smoke test passed: v2 inventory phase 1 applies only plane buffs.');
