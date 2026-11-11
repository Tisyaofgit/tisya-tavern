// Markdown examples inside a protocol's text slots are source text, not XML.
// Only explicitly closed spans/fences are returned. Callers decide ownership;
// machine blocks, HTML attributes and native scripts must never use this reader.
export function createProtocolLiteralReader(source){
 const starts=[...source.matchAll(/`+|~{3,}/g)].map(m=>({start:m.index,end:m.index+m[0].length,length:m[0].length,mark:m[0][0]})),ticks=starts.filter(row=>row.mark==='`'),byStart=new Map(),nextByLength=new Map();
 for(let i=ticks.length-1;i>=0;i--){const tick=ticks[i];tick.close=nextByLength.get(tick.length)??null;byStart.set(tick.start,tick);nextByLength.set(tick.length,tick);}
 const fences=[];
 for(const m of source.matchAll(/(?:^|\n) {0,3}(`{3,}|~{3,})([^\r\n]*)(?=\r?\n|$)/g)){
  const offset=m[0].indexOf(m[1]);fences.push({start:m.index+offset,end:m.index+m[0].length,mark:m[1][0],length:m[1].length,tail:m[2]});
 }
 // A nearer, longer closing fence dominates a farther shorter one. Keep that
 // frontier monotone so every lookup is logarithmic, not a scan of the tail.
 const closers={'`':[],'~':[]};
 for(let i=fences.length-1;i>=0;i--){const row=fences[i],stack=closers[row.mark];let lo=0,hi=stack.length;while(lo<hi){const mid=(lo+hi)>>1;if(stack[mid].length>=row.length)lo=mid+1;else hi=mid;}row.close=lo?stack[lo-1]:null;if(!row.tail.trim()){while(stack.length&&stack.at(-1).length<=row.length)stack.pop();stack.push(row);}}
 const fenceAt=new Map(fences.map(f=>[f.start,f]));
 const escaped=index=>{let at=index;while(at>0&&source[at-1]==='\\')at--;return (index-at)%2===1;};
 return {next(start,before){
  if(before<=start)return null;
  let lo=0,hi=starts.length;while(lo<hi){const mid=(lo+hi)>>1;if(starts[mid].start<start)lo=mid+1;else hi=mid;}
  for(let i=lo;i<starts.length&&starts[i].start<before;i++){
   const mark=starts[i];if(escaped(mark.start))continue;
   const fence=fenceAt.get(mark.start);
   if(fence&&(fence.mark!=='`'||!fence.tail.includes('`'))){
    if(fence.close)return {start:mark.start,end:fence.close.end,kind:'fence'};
    // An unclosed fence must not consume the remaining protocol envelope.
    continue;
   }
   if(mark.mark!=='`')continue;
   const tick=byStart.get(mark.start);
   if(tick?.close)return {start:mark.start,end:tick.close.end,kind:'inline'};
  }
  return null;
 }};
}
