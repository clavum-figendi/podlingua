import {fetchMedia} from './library-services.js';
// Independent serverless app account; no personal server or VPN route.
export const AUDIO_RELAY_ENDPOINT='https://podlingua-audio.clavum-figendi.workers.dev/fetch';
export function supportsAudioRelay(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443')&&['audio.podigee-cdn.net','adswizz.podigee-cdn.net'].includes(u.hostname)&&/\.(mp3|m4a|ogg|wav|opus|flac)$/i.test(u.pathname);}catch{return false;}}
export async function fetchRelayAudio(url,{consent=false,signal,onProgress,maxMB=100,fetchFn=fetch,endpoint=AUDIO_RELAY_ENDPOINT}={}){
 if(!consent)throw new Error('Permission is required to send this recording URL through the Podlingua relay.');
 if(!supportsAudioRelay(url))throw new Error('This publisher is not supported by the Podlingua relay yet.');
 if(!endpoint)throw new Error('Assisted audio download is currently unavailable. Use the publisher download option.');
 let relayError;try{return await fetchMedia(url,{signal,onProgress,maxMB:Math.min(maxMB,100),fetchFn:async(_,options)=>{const response=await fetchFn(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:options.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});if(response.status===429)relayError=new Error('The shared audio relay is busy or has reached its safety allowance. Try later, or save the publisher audio manually.');else if(!response.ok)relayError=new Error(`The audio relay could not retrieve this recording (HTTP ${response.status}). Try the publisher download instead.`);return response;}});}catch(error){if(relayError)throw relayError;if(error.code==='MEDIA_NETWORK_BLOCKED')throw new Error('Could not reach the Cloudflare audio relay. Check your connection, try later, or use the manual download option.');throw error;}
}
