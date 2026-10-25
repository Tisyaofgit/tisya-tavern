import {mountFocusControl} from './focus-control.mjs';
import {mountAtlasView} from './atlas-view.mjs';
import {mountMemoryTimeline} from './memory-timeline.mjs';
const text=value=>typeof value==='string'?value:value==null?'':Array.isArray(value)?value.map(text).join('、'):typeof value==='object'?Object.entries(value).map(([k,v])=>k+'：'+text(v)).join('；'):String(value);
const noteText=row=>typeof row==='string'?row:row?.content??row?.text??text(row?.values??row);

/** Displays only the public projection returned by the current B/P service. */
export function renderJourneyRecords(document,container,view,{section='all',card,empty,getView=()=>view,focus,onChange=()=>{},onSource,timelineRead,currentAnchor,readAtlas,initialAnchorId,initialObjectId,onObjectSelect,onMemory,onObject,onError=()=>{}}={}){
 const make=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=text(value);if(cls)n.className=cls;return n;},releases=[];
 card??=(title,body)=>{const n=make('article',undefined,'tisya-reader-card');if(title)n.append(make('h3',title));if(body)n.append(make('p',body));container.append(n);return n;};
 empty??=value=>container.append(make('p',value,'tisya-note'));
 if(!view){empty('正在读取已归档资料…');return()=>{};}
 const playerIds=new Set(view.playerIds??[]);
 function person(row){const c=card(row.name,row.description);if(row.aliases?.length)c.append(make('p',row.aliases.join(' · '),'jr-meta'));
  if(focus&&!playerIds.has(row.id)){const control=mountFocusControl(document,c,{character:row,getView,focus,onChange,onError});releases.push(()=>control.dispose());}
  for(const entry of row.cognition??[])c.append(make('p',noteText(entry),'jr-cognition'));
  for(const entry of row.psychology??[])c.append(make('p',noteText(entry),'jr-psychology'));
  if(row.dossiers?.length){const d=make('details');d.append(make('summary','查看人物档案'));for(const entry of row.dossiers){const node=make('section');node.append(make('h4',entry.name??entry.table),make('p',text(entry.values)));d.append(node);}c.append(d);}
 }
 let timeline=null,atlas=null;
 if(['all','memory'].includes(section)){
  if(timelineRead){timeline=mountMemoryTimeline(document,container,{read:timelineRead,currentAnchor,initialAnchorId,initialView:!initialAnchorId||initialAnchorId===view.initialTimeline?.anchor?.id?view.initialTimeline:null,onSource,onObject:onObject??(({id})=>atlas?.select(id)),showPsychology:view.options?.showPsychology===true,onError});releases.push(()=>timeline.dispose());}
  else empty('记忆时间轴尚未接入当前存档。');
 }
 if(['all','player','characters'].includes(section)){
  atlas=mountAtlasView(document,container,{view,read:readAtlas,section:section==='all'?'all':section,initialId:initialObjectId,onSelect:onObjectSelect,focus,onChange,onSource,onMemory:onMemory??(({id})=>timeline?.open(id)),onError});releases.push(()=>atlas.dispose());
  if(section!=='player')for(const row of view.missingFocus??[])person({...row,name:row.name??row.id,description:'关注对象暂不可用',missing:true});
 }
 if(['all','tasks'].includes(section)){
  if(!view.pool?.length&&section==='tasks')empty('当前没有待推进的事项。');
  for(const item of view.pool??[]){const c=card(item.name,item.status);if(item.values)c.append(make('p',text(item.values)));}
 }
 const dispose=()=>releases.splice(0).forEach(fn=>fn());dispose.settled=()=>Promise.all([timeline?.settled(),atlas?.settled()]);return dispose;
}

export function createJourneyReader({read,onChange=()=>{},onError=()=>{}}={}){
 let alive=true,ticket=0,model=null,pending=Promise.resolve(),error=null,lastOptions={};
 async function load(options={}){lastOptions={...options};const current=++ticket;error=null;pending=(async()=>{try{if(typeof read!=='function')throw Error('请先为故事建立资料绑定。');const next=await read(options);if(!alive||current!==ticket)return null;if(next?.recordSource!=='forms-live')throw Error('旅程资料没有连接当前档案。');model=next;onChange(model);return model;}catch(e){if(alive&&current===ticket){model=null;error=e;onChange(null,e);onError(e);}return null;}})();return pending;}
 return {load,get value(){return model;},get error(){return error;},accept(next){if(!alive)return;if(next?.recordSource!=='forms-live')throw Error('关注回执缺少当前档案');model=model?{...model,focusObjects:next.focusObjects,configurationRevision:next.configurationRevision,characters:(model.characters??[]).map(row=>({...row,focused:next.focusObjects.includes(row.id)}))}:next;onChange(model);return load(lastOptions);},settled:()=>pending,dispose(){alive=false;ticket++;}};
}
