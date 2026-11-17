import test from 'node:test';import assert from 'node:assert/strict';
import {findSilence,normalizationGain} from '../src/audio-enhancements.js';
test('silence detection preserves speech and ignores short gaps',()=>{const pcm=new Float32Array(4000);pcm.fill(.2,0,1000);pcm.fill(.2,3000);assert.deepEqual(findSilence(pcm,1000,{threshold:.01,minSeconds:1,paddingSeconds:.1}),[{start:1.1,end:2.9}]);});
test('normalization is bounded and silent audio never gains noise',()=>{assert.equal(normalizationGain(new Float32Array(100)),1);assert.equal(normalizationGain(new Float32Array(100).fill(.1)),2);assert.ok(Math.abs(normalizationGain(new Float32Array(100).fill(.9))-1)<1e-6);});
