import test from 'node:test';import assert from 'node:assert/strict';
import {resumePosition,nextQueued,listeningDelta} from '../src/playback.js';
test('resume respects feed intro, remembered position and completion',()=>{
 assert.equal(resumePosition({position:50,played:false},100,{skipIntro:10,rememberPosition:true}),50);
 assert.equal(resumePosition({position:50,played:true},100,{skipIntro:10,rememberPosition:true}),10);
 assert.equal(resumePosition({position:50},100,{skipIntro:10,rememberPosition:false}),10);
});
test('queue skips missing, current and completed episodes without duplicates',()=>{
 assert.equal(nextQueued(['missing','done','next','next'],[{id:'done',played:true},{id:'next'}],'current',true),'next');
 assert.equal(nextQueued(['current'],[{id:'current'}],'current',true),undefined);
});
test('statistics count listening rather than seeks or accelerated media seconds',()=>{
 assert.deepEqual(listeningDelta(0,10,5,2),{wall:5,media:10});
 assert.deepEqual(listeningDelta(0,300,1,1),{wall:0,media:0});
 assert.deepEqual(listeningDelta(30,20,1,1),{wall:0,media:0});
});
