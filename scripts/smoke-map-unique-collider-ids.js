#!/usr/bin/env node
'use strict';

// Smoke test: buildMapSpriteColliders must hand back colliders with UNIQUE ids.
// The dynamite / path-clearing system ignores colliders by id, so two colliders
// sharing an id (e.g. every interior brick declaring id "brick1") would be removed
// together — the AI would "see" one dynamite clearing many bricks, while detonation
// removes only the one it hit. Uniqueness keeps planning matched to reality.

const fs = require('fs');
const vm = require('vm');

function extractFunctionSource(source, fnName){
  const signature = `function ${fnName}(`;
  const start = source.indexOf(signature);
  if(start === -1) throw new Error(`Function not found in script.js: ${fnName}`);
  const signatureEnd = source.indexOf(')', start);
  const bodyStart = source.indexOf('{', signatureEnd);
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

const context = {
  Map, Set, Array, Object, console,
  // Mock the per-sprite collider builder: echo the sprite's declared id, drop
  // sprites flagged skip (mirrors real "unknown sprite" filtering).
  buildSpriteCollider: (sprite, index) => (sprite && sprite.skip)
    ? null
    : { id: sprite && sprite.id != null ? sprite.id : `auto-${index}`, type: 'rect', cx: index * 10, cy: 0 },
};
vm.createContext(context);
vm.runInContext(extractFunctionSource(source, 'buildMapSpriteColliders'), context);

// Several bricks share id "brick1"; one border brick is unique; one sprite is
// skipped; one sprite pre-declares "brick1#1" to prove the de-dup never collides.
const sprites = [
  { id: 'brick1' },
  { id: 'brick1' },
  { id: 'brick1' },
  { id: 'brick_v_left_1' },
  { skip: true },
  { id: 'brick1#1' },
];
const colliders = context.buildMapSpriteColliders({ name: 'test', sprites });

assert(colliders.length === 5, '1: the skipped sprite is filtered; the rest become colliders.');

const ids = colliders.map((c) => c.id);
assert(new Set(ids).size === ids.length, `2: all collider ids must be unique — got ${JSON.stringify(ids)}`);

assert(ids[0] === 'brick1', '3: the first occurrence keeps its bare id.');
assert(ids[1] !== 'brick1' && ids[2] !== 'brick1', '4: repeated ids are suffixed apart.');
assert(ids.includes('brick_v_left_1'), '5: an already-unique id is left untouched.');

// The pre-declared "brick1#1" must not clash with a suffix generated for a
// duplicate "brick1" — every final id is still distinct.
assert(ids.filter((id) => id === 'brick1#1').length === 1, '6: a pre-suffixed id never ends up duplicated.');

console.log('Smoke test passed: buildMapSpriteColliders yields unique collider ids (duplicates suffixed, unique ids untouched, no collision with pre-suffixed ids).');
