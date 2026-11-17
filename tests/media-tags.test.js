import test from 'node:test';
import assert from 'node:assert/strict';
import {parseID3Chapters} from '../src/media-tags.js';
const api={parseID3Chapters};
 const ascii=s=>Uint8Array.from([...s].map(c=>c.charCodeAt(0)));
const join=(...xs)=>Uint8Array.from(xs.flatMap(x=>[...x]));
const u32=n=>Uint8Array.of(n>>>24,n>>>16&255,n>>>8&255,n&255);
const sync=n=>Uint8Array.of(n>>>21&127,n>>>14&127,n>>>7&127,n&127);
function frame(id,data,v=3,flags=0){return join(ascii(id),v===4?sync(data.length):u32(data.length),[0,flags],data);}
function chap(id,start,end,title,v=3,extra=[]){return frame('CHAP',join(ascii(id),[0],u32(start),u32(end),u32(0xffffffff),u32(0xffffffff),frame('TIT2',join([3],new TextEncoder().encode(title)),v),extra),v);}
function tag(frames,v=3,flags=0){const body=join(...frames);return join(ascii('ID3'),[v,0,flags],sync(body.length),body);}
test('ID3 CHAP reads actual unsigned millisecond times, titles and safe links in v2.3/v2.4',()=>{
 assert.equal(typeof api.parseID3Chapters,'function');
 for(const v of [3,4]){
  const link=frame('WXXX',join([3],ascii('Visit'),[0],ascii('https://example.org/a?x=1%202')),v);
  const bytes=tag([chap('first',1250,5500,'Intro',v,link),chap('later',3000000000,0xffffffff,'Later',v)],v);
  assert.deepEqual(api.parseID3Chapters(bytes),[{id:'first',start:1.25,end:5.5,title:'Intro',url:'https://example.org/a?x=1%202'},{id:'later',start:3000000,title:'Later'}]);
  assert.deepEqual(api.parseID3Chapters(bytes.buffer),api.parseID3Chapters(bytes));
 }
});
test('ID3 handles version-specific extended headers and unsynchronisation',()=>{
 const unsync=b=>Uint8Array.from([...b].flatMap((x,i)=>x===255&&(i+1===b.length||b[i+1]===0||b[i+1]>=224)?[255,0]:[x]));
 const raw=chap('one',0,0xffffffff,'Intro');
 const v3=tag([unsync(join(u32(6),[0,0],u32(0),raw))],3,0xc0);
 assert.equal(api.parseID3Chapters(v3)[0].title,'Intro');
 const v4raw=chap('two',1,0xffffffff,'Next',4);const payload=unsync(v4raw.subarray(10));
 const v4=tag([join(sync(6),[1,0]),frame('CHAP',payload,4,2)],4,0x40);
 assert.equal(api.parseID3Chapters(v4)[0].start,0.001);
});
test('ID3 decodes UTF16 titles and linked APIC artwork while rejecting unsafe URLs',()=>{
 const title=frame('TIT2',join([1,255,254],Buffer.from('Café','utf16le')));
 const picture=url=>frame('APIC',join([3],ascii('-->'),[0,3],ascii('Cover'),[0],ascii(url)));
 const payload=join(ascii('one'),[0],u32(7250),u32(9900),u32(0xffffffff),u32(0xffffffff),title,picture('https://example.org/cover.jpg'));
 const result=api.parseID3Chapters(tag([frame('CHAP',payload)]))[0];assert.equal(result.title,'Café');assert.equal(result.image,'https://example.org/cover.jpg');assert.equal(result.start,7.25);assert.equal(result.end,9.9);
 const unsafe=join(ascii('two'),[0],u32(0),u32(0xffffffff),u32(0xffffffff),u32(0xffffffff),picture('javascript:bad'),frame('WXXX',join([3,0],ascii('http://unsafe.example/'))));
 const e=api.parseID3Chapters(tag([frame('CHAP',unsafe)]))[0];assert.equal(e.image,undefined);assert.equal(e.url,undefined);
});
test('ID3 enforces byte boundaries and resource limits without scanning audio as chapters',()=>{
 assert.deepEqual(api.parseID3Chapters(ascii('audio CHAP not a tag')),[]);
 const valid=tag([chap('one',0,1000,'One')]);
 for(let i=3;i<valid.length;i++)assert.throws(()=>api.parseID3Chapters(valid.subarray(0,i)));
 const invalidSize=valid.slice();invalidSize[6]=128;assert.throws(()=>api.parseID3Chapters(invalidSize));
 const oversized=join(ascii('ID3'),[3,0,0],sync(16*1024*1024+1));assert.throws(()=>api.parseID3Chapters(oversized),/limit/);
 const brokenFrame=tag([join(ascii('CHAP'),u32(0xffffffff),[0,0])]);assert.throws(()=>api.parseID3Chapters(brokenFrame));
 assert.throws(()=>api.parseID3Chapters(tag([chap('bad',2000,1000,'Bad')])));
 assert.deepEqual(api.parseID3Chapters(join(valid,ascii('CHAP garbage'))),api.parseID3Chapters(valid));
 const padded=join([1,2],valid,[3]);assert.deepEqual(api.parseID3Chapters(new DataView(padded.buffer,2,valid.length)),api.parseID3Chapters(valid));
});
