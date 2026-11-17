export function resumePosition(episode,duration,{skipIntro=0,rememberPosition=true}={}){
 const limit=Number.isFinite(duration)&&duration>0?duration:Infinity;
 const intro=Math.max(0,Math.min(Number(skipIntro)||0,limit===Infinity?3600:Math.max(0,limit-1)));
 const saved=Number(episode.position)||0;
 return rememberPosition!==false&&!episode.played&&saved>intro&&saved<limit?saved:intro;
}
export function nextQueued(queue,episodes,currentId,skipCompleted=true){
 const known=new Map(episodes.map(e=>[e.id,e]));
 return [...new Set(queue)].find(id=>id!==currentId&&known.has(id)&&(!skipCompleted||!known.get(id).played));
}
export function listeningDelta(previous,current,wallSeconds,rate=1){
 const delta=current-previous;
 if(!Number.isFinite(delta)||delta<=0||!Number.isFinite(wallSeconds)||wallSeconds<=0||delta>wallSeconds*rate*1.5+1)return {wall:0,media:0};
 return {wall:Math.min(wallSeconds,delta/rate),media:delta};
}
