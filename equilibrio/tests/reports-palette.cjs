'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),R=require('../reports-model.js');
const expected=['#2f9e83','#e07a5f','#5b7fd6','#f2b134','#9b6bd3','#3fb4c8','#d4688f','#7a9e3f','#c98a4a','#a7c957','#f08a5d','#7c8ee8','#56b870','#c58fe0'];
test('reports palette lives in the model and wraps by rank',()=>{
 assert.deepEqual(R.palette,expected);
 expected.forEach((c,i)=>assert.equal(R.color(i),c));
 assert.equal(R.color(expected.length),expected[0]);
 assert.equal(R.color(expected.length+3),expected[3]);
});
test('reports-ui uses the model colour instead of its own palette',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'..','reports-ui.js'),'utf8');
 assert.ok(!/const palette=/.test(ui));
 assert.ok(/ReportAnalysis\.color/.test(ui));
});
