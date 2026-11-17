export function findSilence(samples,rate,{threshold=.008,minSeconds=.8,paddingSeconds=.12}={}){
 if(!(samples instanceof Float32Array)||!Number.isFinite(rate)||rate<=0)throw new Error('Invalid audio analysis input.');
 const window=Math.max(1,Math.round(rate*.02)),ranges=[];let begin=null;
 const close=end=>{if(begin!==null&&(end-begin)/rate>=minSeconds){const start=begin/rate+paddingSeconds,stop=end/rate-paddingSeconds;if(stop>start)ranges.push({start,end:stop});}begin=null;};
 for(let i=0;i<samples.length;i+=window){let sum=0,count=Math.min(window,samples.length-i);for(let j=0;j<count;j++)sum+=samples[i+j]**2;if(Math.sqrt(sum/count)<threshold){if(begin===null)begin=i;}else close(i);}close(samples.length);return ranges;
}
export function normalizationGain(samples){let peak=0;for(const sample of samples)peak=Math.max(peak,Math.abs(sample));return peak<.00001?1:Math.max(1,Math.min(2,.9/peak));}
