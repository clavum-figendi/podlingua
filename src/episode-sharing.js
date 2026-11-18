export function episodeShare(episode,position=0,withPosition=false){
 let url;for(const value of [episode.link,episode.audioUrl]){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)continue;if(value===episode.audioUrl&&withPosition&&Number.isFinite(position))u.hash='t='+Math.max(0,Math.floor(position));url=u.href;break;}catch{/* No shareable public URL. */}}
 const t=Number.isFinite(position)?Math.max(0,Math.floor(position)):0;const title=String(episode.title||'Episode');return {title,text:title+(withPosition?`\nStart at ${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`:'')+(url?'\n'+url:''),...(url?{url}:{})};
}
