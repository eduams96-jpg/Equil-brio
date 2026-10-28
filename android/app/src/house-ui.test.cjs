'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),UI=require('./house-ui.cjs');
test('Preços em gramas, mililitros e centilitros comparam em kg/L sem arredondar para zero',()=>{assert.deepEqual(UI.priceReference('g',{per:2.5/500}),{per:5,unit:'kg'});assert.deepEqual(UI.priceReference('ml',{per:3/750}),{per:4,unit:'L'});assert.deepEqual(UI.priceReference('cl',{per:2/50}),{per:4,unit:'L'});assert.deepEqual(UI.priceReference('un',{per:2/4}),{per:.5,unit:'un'});});
