export function validateAudioDuration(duration){
  if(!Number.isFinite(duration)||duration<=0||duration>3600)throw new Error('Audio duration must be known and at most one hour for browser decoding. Shorten the file or use a hosted provider accepting the original audio.');
  return duration;
}
export function mixChannels(channels,sampleRate){
  if(!Array.isArray(channels)||!channels.length||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)throw new Error('Unsupported audio sample format.');
  const length=channels[0].length;
  if(channels.some(ch=>!(ch instanceof Float32Array)||ch.length!==length)||length*channels.length>64*1024*1024)throw new Error('Decoded audio exceeds the 256 MB sample budget.');
  const n=Math.floor(length*16000/sampleRate);if(!n)throw new Error('No audio samples were decoded.');
  const mono=new Float32Array(n),ratio=sampleRate/16000;
  for(const input of channels)for(let i=0;i<n;i++){
    const position=i*ratio,a=Math.floor(position),b=Math.min(a+1,input.length-1),fraction=position-a;
    mono[i]+=(input[a]*(1-fraction)+input[b]*fraction)/channels.length;
  }
  return mono;
}
if(typeof self!=='undefined' && typeof document==='undefined' && typeof self.postMessage==='function'){
  self.onmessage=({data})=>{
    try{const pcm=mixChannels(data.channels,data.sampleRate);self.postMessage({pcm},[pcm.buffer]);}
    catch(error){self.postMessage({error:error.message});}
  };
}
