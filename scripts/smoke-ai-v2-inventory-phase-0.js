#!/usr/bin/env node
'use strict';
const fs = require('fs');
const vm = require('vm');
function extract(source, name){ const s = source.indexOf(`function ${name}(`); if(s<0) throw new Error('not found'); const b=source.indexOf('{',s); let d=0; for(let i=b;i<source.length;i++){ if(source[i]==='{') d++; if(source[i]==='}') d--; if(d===0) return source.slice(s,i+1);} throw new Error('bad'); }
function assert(c,m){ if(!c) throw new Error(m); }
const src = fs.readFileSync('script.js','utf8');
const fn = extract(src,'maybeUseInventoryBeforeLaunch');
let applied = 0;
const ctx = { Math, Number, Boolean, Infinity, AI_ENGINE_MODE:'v2', AI_V2_INVENTORY_PHASE:0, MAX_DRAG_DISTANCE:300, FIELD_FLIGHT_DURATION_SEC:1, AI_INVENTORY_SOFT_FALLBACK_IDLE_TURN_THRESHOLD:2,
  INVENTORY_ITEM_TYPES:{FUEL:'fuel',CROSSHAIR:'crosshair',MINE:'mine',DYNAMITE:'dynamite',INVISIBILITY:'invisible',WINGS:'wings'},
  aiRoundState:{inventoryPhase:0,lastInventorySoftFallbackUsed:false,inventoryIdleTurns:0,inventorySoftFallbackCooldown:0},
  evaluateBlueInventoryState:()=>({total:3,counts:{fuel:1,crosshair:1,mine:1,dynamite:0,wings:0,invisible:0}}),
  logAiDecision:()=>{}, applyItemToOwnPlane:()=>{applied+=1; return true;}, removeItemFromInventory:()=>{},
  getBluePriorityEnemy:()=>null, getAiMoveLandingPoint:()=>null, getBaseAnchor:()=>null, evaluateCrosshairBestUse:()=>null,
  dist:()=>999, isPathClear:()=>false, getDynamiteCandidateForCurrentRoute:()=>null, getNearestDynamiteTargetToPoint:()=>null,
  isDynamiteTargetUsefulForCurrentRoute:()=>false, placeBlueDynamiteAt:()=>false, tryPlaceBlueDefensiveMine:()=>false, tryPlaceBlueMineNearEnemyBase:()=>false,
  queueInvisibilityEffectForPlayer:()=>false, settings:{aimingAmplitude:80}, ATTACK_RANGE_PX:100 };
vm.createContext(ctx); vm.runInContext(fn, ctx);
const used = ctx.maybeUseInventoryBeforeLaunch({enemies:[]}, {plane:{id:'p',x:0,y:0},vx:1,vy:0,totalDist:100});
assert(used === false, 'phase 0 must disable inventory usage');
assert(applied === 0, 'phase 0 must not apply any buff');
console.log('Smoke test passed: v2 inventory phase 0 disables all inventory actions.');
