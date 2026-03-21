#!/usr/bin/env node
'use strict';
const fs = require('fs'); const vm = require('vm');
function extract(source, name){ const s=source.indexOf(`function ${name}(`); const b=source.indexOf('{',s); let d=0; for(let i=b;i<source.length;i++){ if(source[i]==='{') d++; if(source[i]==='}') d--; if(d===0) return source.slice(s,i+1);} throw new Error('not found'); }
function assert(c,m){ if(!c) throw new Error(m); }
const src=fs.readFileSync('script.js','utf8'); const fn=extract(src,'maybeUseInventoryBeforeLaunch');
const inv={mine:2,dynamite:1,fuel:0,crosshair:0,wings:0,invisible:0}; const removed=[];
const ctx={ Math, Number, Boolean, Infinity, AI_ENGINE_MODE:'v2', AI_V2_INVENTORY_PHASE:2, MAX_DRAG_DISTANCE:300, FIELD_FLIGHT_DURATION_SEC:1, AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD:2,
CELL_SIZE:10,
INVENTORY_ITEM_TYPES:{FUEL:'fuel',CROSSHAIR:'crosshair',MINE:'mine',DYNAMITE:'dynamite',INVISIBILITY:'invisible',WINGS:'wings'},
aiRoundState:{inventoryPhase:2,lastInventorySoftFallbackUsed:false,inventoryIdleTurns:0,inventorySoftFallbackCooldown:5,turnNumber:1,dynamiteIntent:null},
evaluateBlueInventoryState:()=>({total:Object.values(inv).reduce((a,b)=>a+b,0),counts:{...inv}}),
getBluePriorityEnemy:()=>null, getAiMoveLandingPoint:()=>({x:300,y:0}), getBaseAnchor:()=>({x:0,y:0}), evaluateCrosshairBestUse:()=>null,
logAiDecision:()=>{}, applyItemToOwnPlane:()=>false, removeItemFromInventory:(c,t)=>{inv[t]-=1; removed.push(t);},
tryPlaceBlueDefensiveMine:()=> inv.mine>0, tryPlaceBlueMineNearEnemyBase:()=> false,
getDynamiteCandidateForCurrentRoute:()=> inv.dynamite>0 ? ({cx:10,cy:10,collider:{id:'c1'},id:'s1'}) : null,
getNearestDynamiteTargetToPoint:()=>null, isDynamiteTargetUsefulForCurrentRoute:()=>true,
placeBlueDynamiteAt:()=> inv.dynamite>0, dist:(a,b)=>Math.hypot((a.x||0)-(b.x||0),(a.y||0)-(b.y||0)), isPathClear:()=>true,
queueInvisibilityEffectForPlayer:()=>false, settings:{aimingAmplitude:80,flightRangeCells:30}, ATTACK_RANGE_PX:100 };
ctx.getPlaneEffectiveRangePx = () => 140;
ctx.getEffectiveFlightRangeCells = () => 30;
ctx.getAvailableFlagsByColor = () => [];
ctx.getFlagAnchor = () => null;

ctx.getAiStrategicTargetPoint = () => null;
ctx.evaluateFlagPickupContinuation = () => null;
ctx.evaluateMineEnabledFlagPickupContinuation = () => null;
ctx.evaluatePostLaunchSafetyWithMine = () => ({ beforeSafe:false, afterSafe:false });
vm.createContext(ctx); vm.runInContext(fn,ctx);
const move={plane:{id:'p',x:0,y:0},vx:1,vy:0,totalDist:100};
let safety=0; let tacticalUsed=0;
while(safety<10){ safety+=1; const used=ctx.maybeUseInventoryBeforeLaunch({enemies:[]},move); if(!used) break; tacticalUsed+=1; }
assert(tacticalUsed>=3,'phase2 should allow immediate multi-use tactical inventory before launch without waiting for idle turns');
assert(removed.filter(t=>t==='mine').length===2,'phase2 should spend both mines');
assert(removed.filter(t=>t==='dynamite').length===1,'phase2 should spend dynamite in same pre-launch stage');
console.log('Smoke test passed: v2 inventory phase 2 allows repeated tactical mine/dynamite actions.');
