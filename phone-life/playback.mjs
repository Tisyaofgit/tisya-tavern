// One real audio element per phone. Media time never advances the story clock.
export function createPhonePlayback({audio,read,resolveUrl,save,assertScope=()=>{},onChange=()=>{},onError=()=>{},now=()=>Date.now()}={}){
 let current=null,currentAudioId=null,mode='sequence',queue=[],history=[],pendingPosition=null,dirty=false,saving=null,disposed=false,lastSavedAt=0,lastFailureAt=0,restoring=false;
 const listeners=[];const listen=(type,fn)=>{audio.addEventListener(type,fn);listeners.push(()=>audio.removeEventListener(type,fn));};
 const songs=()=>read()?.media?.songs??[],song=id=>songs().find(s=>s.id===id);
 const changed=()=>{if(!disposed)onChange();};
 const snapshot=()=>({songId:current,position:current?Math.max(0,Number(audio.currentTime)||pendingPosition||0):0,volume:Math.max(0,Math.min(1,Number(audio.volume))),mode,queue:[...queue],history:[...history]});
 async function flush(){
  if(disposed||!dirty)return saving;
  if(saving){await saving;if(dirty)return flush();return;}
  assertScope();const value=snapshot();dirty=false;
  saving=Promise.resolve().then(()=>save(value)).then(()=>{lastSavedAt=now();lastFailureAt=0;},error=>{dirty=true;lastFailureAt=now();throw error;}).finally(()=>{saving=null;changed();});
  return saving;
 }
 const backgroundSave=()=>{if(disposed||restoring||!dirty||saving||lastFailureAt&&now()-lastFailureAt<15000)return;flush().catch(onError);};
 function restorePosition(){if(pendingPosition===null)return;const duration=Number(audio.duration);if(!Number.isFinite(duration)||duration<=0)return;try{audio.currentTime=Math.min(pendingPosition,duration);pendingPosition=null;}catch(error){onError(Error('播放位置尚未恢复：'+error.message));}}
 async function select(id,{autoplay=false,position=0}={}){
  assertScope();const row=song(id);if(!row)throw Error('歌曲已不存在，队列与旧记录仍保留。');
  if(!row.audioId)throw Error('这首作品尚未关联音源，请先选择音频文件。');
  const url=await resolveUrl(row.audioId);assertScope();if(!url)throw Error('音源原件缺失，请重新关联文件。');
  if(song(id)?.audioId!==row.audioId)throw Error('音源已变化，请重新选择歌曲。');
  if(current!==id||currentAudioId!==row.audioId){restoring=true;audio.pause();current=id;currentAudioId=row.audioId;pendingPosition=Math.max(0,Number(position)||0);audio.src=url;restorePosition();restoring=false;}
  if(autoplay){try{await audio.play();}catch(error){changed();throw Error('无法播放该音源：'+(error.message||'浏览器未允许播放'));}history=[id,...history.filter(x=>x!==id)].slice(0,100);dirty=true;await flush();}
  changed();return row;
 }
 async function restore(){
  assertScope();const stored=read()?.media?.playback;if(!stored){changed();return;}
  mode=['sequence','repeat-one','repeat-all','shuffle'].includes(stored.mode)?stored.mode:'sequence';
  queue=(stored.queue??[]).filter(id=>song(id));history=(stored.history??[]).filter(id=>song(id));
  audio.volume=Number.isFinite(stored.volume)?Math.max(0,Math.min(1,stored.volume)):1;audio.loop=false;
  if(stored.songId&&song(stored.songId))await select(stored.songId,{position:stored.position??0});
  dirty=false;changed();
 }
 async function play(id=current){
  if(!id)throw Error('请先选择一首有音源的歌曲。');
  if(current&&id!==current){audio.pause();dirty=true;await flush();}
  if(!queue.includes(id))queue=songs().map(x=>x.id);
  return select(id,{autoplay:true});
 }
 async function pause(){audio.pause();if(current){dirty=true;await flush();}changed();}
 async function next(step=1,{ended=false}={}){
  const rows=(queue.length?queue:songs().map(x=>x.id)).filter(id=>song(id));if(!rows.length)return;
  let at=rows.indexOf(current),next=at+step;
  if(ended&&mode==='repeat-one')next=Math.max(0,at);
  else if(mode==='shuffle'&&rows.length>1)next=(Math.max(0,at)+1+Math.floor(Math.random()*(rows.length-1)))%rows.length;
  else if(next>=rows.length||next<0){if(mode==='repeat-all'||!ended)next=(next+rows.length)%rows.length;else{await pause();return;}}
  if(rows[next]===current){pendingPosition=0;audio.currentTime=0;}return play(rows[next]);
 }
 async function setMode(value){if(!['sequence','repeat-one','repeat-all','shuffle'].includes(value))throw Error('播放方式无效。');mode=value;audio.loop=false;dirty=true;await flush();changed();}
 async function setQueue(ids){if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!song(id)))throw Error('队列含失效或重复歌曲。');queue=[...ids];dirty=true;await flush();changed();}
 async function seek(value){assertScope();const duration=Number(audio.duration);if(!Number.isFinite(duration)||duration<=0)throw Error('音源尚未载入时长，暂不能拖动。');const n=Number(value);if(!Number.isFinite(n))throw Error('播放位置无效。');audio.currentTime=Math.min(duration,Math.max(0,n));pendingPosition=null;dirty=true;await flush();changed();}
 async function volume(value){const n=Number(value);if(!Number.isFinite(n)||n<0||n>1)throw Error('音量超出范围。');audio.volume=n;dirty=true;await flush();changed();}
 function reconcile(){
  const row=song(current);if(current&&(!row||row.audioId!==currentAudioId)){restoring=true;audio.pause();audio.removeAttribute('src');current=null;currentAudioId=null;pendingPosition=null;dirty=false;restoring=false;}
  queue=queue.filter(id=>song(id));history=history.filter(id=>song(id));changed();
 }
 listen('loadedmetadata',()=>{restorePosition();changed();});
 listen('timeupdate',()=>{if(current&&!restoring){dirty=true;if(now()-lastSavedAt>=15000)backgroundSave();}changed();});
 listen('pause',()=>{if(current&&!restoring){dirty=true;backgroundSave();}changed();});
 listen('play',changed);
 listen('ended',()=>{next(1,{ended:true}).catch(onError);});
 listen('error',()=>{restoring=true;audio.pause();restoring=false;onError(Error('音源无法播放，原文件与队列已保留。'+(audio.error?.message??'')));changed();});
 function dispose(){if(disposed)return;disposed=true;for(const off of listeners)off();audio.pause();audio.removeAttribute('src');current=null;currentAudioId=null;}
 return {restore,play,pause,next,setMode,setQueue,seek,volume,flush,reconcile,dispose,state:()=>({...snapshot(),audioId:currentAudioId,playing:!!current&&!audio.paused,dirty,saving:!!saving}),dirty:()=>dirty||!!saving,settled:async()=>{if(saving)await saving;}};
}
