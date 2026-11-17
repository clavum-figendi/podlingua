import test from 'node:test';
import assert from 'node:assert/strict';
import {mixChannels,validateAudioDuration} from '../src/audio-worker.js';
test('audio preparation averages stereo and resamples to 16kHz without timing drift',()=>{
 const a=new Float32Array([1,0,-1,0]),b=new Float32Array([0,1,0,-1]);
 assert.deepEqual([...mixChannels([a,b],32000)],[.5,-.5]);
 assert.equal(mixChannels([new Float32Array(44100)],44100).length,16000);
});
test('duration preflight rejects unsupported or hour-plus inputs before browser decoding',()=>{
 for(const d of [Infinity,NaN,0,-1,3601])assert.throws(()=>validateAudioDuration(d),/duration|hour/i);
 assert.equal(validateAudioDuration(3600),3600);
});
