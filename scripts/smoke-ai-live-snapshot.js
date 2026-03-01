#!/usr/bin/env node
'use strict';

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
const fnSrc = extractFunctionSource(source, 'getAiSelfAnalyzerSnapshot');

const activeMatch = { turns: [1], nested: { key: 'value' } };
const history = [{ id: 'done-match' }];

const context = {
  Boolean,
  JSON,
  aiSelfAnalyzerState: { activeMatch },
  getAnalyticsHistoryFromStorage: () => history,
};

vm.createContext(context);
vm.runInContext(fnSrc, context);

const minimal = context.getAiSelfAnalyzerSnapshot();
assert(minimal.activeMatch && minimal.activeMatch.turns.length === 1, 'Snapshot should include active match data.');
assert(minimal.totalFinishedMatches === 0, 'Snapshot without includeHistory should not load storage history.');

minimal.activeMatch.turns.push(2);
assert(activeMatch.turns.length === 1, 'Snapshot should return cloned active match, not mutable original object.');

const full = context.getAiSelfAnalyzerSnapshot({ includeHistory: true });
assert(full.totalFinishedMatches === 1, 'Snapshot with includeHistory should report finished match count.');
assert(full.latestFinishedMatch && full.latestFinishedMatch.id === 'done-match', 'Snapshot should expose latest finished match.');

console.log('Smoke test passed: live AI analyzer snapshot works during active match.');
