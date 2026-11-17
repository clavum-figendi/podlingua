// Pure, bounded byte parser. No fetching, playback-time inference or storage writes.
import {safeUrl} from './podcasts.js';
const MAX_TAG_BYTES=16*1024*1024, MAX_FRAMES=20000, MAX_CHAPTERS=10000;
const bad=()=>{throw new Error('Invalid or truncated ID3 chapter tag.');};
const uint=(b,p)=>b[p]*16777216+b[p+1]*65536+b[p+2]*256+b[p+3];
function synchsafe(b,p){if(p+4>b.length||b.subarray(p,p+4).some(x=>x&128))bad();return b[p]*2097152+b[p+1]*16384+b[p+2]*128+b[p+3];}
function deunsync(b){const out=new Uint8Array(b.length);let n=0;for(let i=0;i<b.length;i++){out[n++]=b[i];if(b[i]===255&&b[i+1]===0)i++;}return out.subarray(0,n);}
const latin=b=>Array.from(b,c=>String.fromCharCode(c)).join('');
function stringPart(b,p,encoding){
 const wide=encoding===1||encoding===2;let end=p;
 while(end<b.length){if(wide?end+1<b.length&&b[end]===0&&b[end+1]===0:b[end]===0)break;end+=wide?2:1;}
 const raw=b.subarray(p,Math.min(end,b.length));let s='';
 if(encoding===0)s=latin(raw);
 else if(encoding===3)s=new TextDecoder('utf-8').decode(raw);
 else if(wide){let data=raw,enc='utf-16be';if(encoding===1){if(raw[0]===255&&raw[1]===254)enc='utf-16le';else if(!(raw[0]===254&&raw[1]===255))return {text:'',next:b.length};data=raw.subarray(2);}s=new TextDecoder(enc).decode(data);}
 return {text:s.replace(/\u0000/g,'').replace(/<[^>]*>/g,' ').replace(/[<>\u0001-\u001f]/g,'').trim().slice(0,100000),next:Math.min(b.length,end+(wide?2:1))};
}
/** Parse ID3v2.3/2.4 CHAP frames to {id,start,end?,title,url?}, in seconds.
 * Non-ID3 data returns []; malformed/oversized supported tags throw.
 * Full declared tag bytes are required; trailing audio is ignored.
 */
export function parseID3Chapters(input){
 const b=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
 if(!b)throw new TypeError('Expected media bytes (ArrayBuffer or typed array).');
 if(b.length<3||latin(b.subarray(0,3))!=='ID3')return [];
 if(b.length<10)bad();const v=b[3];if(v!==3&&v!==4)throw new Error('Only ID3v2.3 and ID3v2.4 chapters are supported.');
 const size=synchsafe(b,6);if(size>MAX_TAG_BYTES)throw new Error('ID3 tag exceeds the 16 MiB limit.');if(size+10>b.length)bad();
 if(b[5]&(v===3?0x1f:0x0f))throw new Error('Unsupported ID3 tag flags.');
 let body=b.subarray(10,10+size);if(v===3&&(b[5]&128))body=deunsync(body);
 if(b[5]&64){if(body.length<4)bad();const extended=v===3?uint(body,0)+4:synchsafe(body,0);if(extended<(v===3?10:6)||extended>body.length)bad();body=body.subarray(extended);}
 if(v===4&&(b[5]&16)){if(body.length<10||latin(body.subarray(-10,-7))!=='3DI')bad();body=body.subarray(0,-10);}
 const chapters=[];let count=0;
 function frames(data,visit,alreadyUnsynced=false){let p=0;while(p<data.length){if(data[p]===0){if(data.subarray(p).some(x=>x!==0))bad();break;}if(p+10>data.length)bad();
  const id=latin(data.subarray(p,p+4));if(!/^[A-Z0-9]{4}$/.test(id))bad();const length=v===4?synchsafe(data,p+4):uint(data,p+4);const flags=data[p+9];if(++count>MAX_FRAMES)throw new Error('ID3 has too many frames.');if(p+10+length>data.length)bad();
  // Compressed/encrypted/grouped frames cannot be interpreted as raw CHAP data.
  if(!(flags&(v===3?0xc0:0x0c))){let payload=data.subarray(p+10,p+10+length);
   const unsynced=alreadyUnsynced||v===4&&Boolean((flags&2)||(b[5]&128));if(unsynced&&!alreadyUnsynced)payload=deunsync(payload);
   let skip=flags&(v===3?0x20:0x40)?1:0;if(v===4&&(flags&1)){if(skip+4>payload.length)bad();synchsafe(payload,skip);skip+=4;}if(skip>payload.length)bad();visit(id,payload.subarray(skip),unsynced);
  }p+=10+length;
 }}
 frames(body,(id,data,unsynced)=>{
  if(id!=='CHAP')return;const zero=data.indexOf(0);if(zero<1||zero>1024||zero+17>data.length)bad();
  const start=uint(data,zero+1),end=uint(data,zero+5);if(start===0xffffffff||end!==0xffffffff&&end<start)bad();
  const chapter={id:latin(data.subarray(0,zero)),start:start/1000,title:''};if(end!==0xffffffff)chapter.end=end/1000;
  frames(data.subarray(zero+17),(sub,payload)=>{if(!payload.length)return;if(sub==='TIT2')chapter.title=stringPart(payload,1,payload[0]).text;
   if(sub==='WXXX'){const desc=stringPart(payload,1,payload[0]);const url=safeUrl(latin(payload.subarray(desc.next)).replace(/\0.*$/s,''));if(url)chapter.url=url;}
   if(sub==='APIC'){const mimeEnd=payload.indexOf(0,1);const mime={text:latin(payload.subarray(1,mimeEnd)),next:mimeEnd+1};if(mimeEnd>0&&mime.text==='-->'&&mime.next<payload.length){const type=payload[mime.next];const desc=stringPart(payload,mime.next+1,payload[0]);const image=safeUrl(latin(payload.subarray(desc.next)).replace(/\0.*$/s,''));if(image&&(!chapter.image||type===3))chapter.image=image;}}
  },unsynced);
  if(chapters.length>=MAX_CHAPTERS)throw new Error('ID3 has too many chapters.');chapters.push(chapter);
 },v===3&&Boolean(b[5]&128));
 return chapters.sort((a,b)=>a.start-b.start);
}
