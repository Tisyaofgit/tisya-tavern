import {archiveLayer} from './archive-book.js';
import {storyMaterial,storyContext} from './story-material.js';
import {nativeReferences} from './native-state.js';
import {copy,check,normalized,references} from './schema.js';
// Read-only generation projection. Storage journals never become active lore.
export function worldbookEntries({rows,registry,scope,bookName=null,tags=[],forcedIds=[],temporary=null,due=[],userId=null,focusObjects=[],nativeState=null}){
 const byId=new Map(rows.map(r=>[r.id,r])),forced=new Set(forcedIds),dueIds=new Set(due.filter(x=>x.due===true).map(x=>x.id));
 const names=r=>[r?.values.名称,...(r?.values.别名??[])].filter(x=>typeof x==='string'&&x.trim());
 const entries=[];
 function entry(id,name,content,keys,constant,reason){entries.push({uid:entries.length+1,world:'Tisya tables / '+scope,key:[...new Set(keys)],keysecondary:[],comment:name,content,constant,selective:false,selectiveLogic:0,disable:false,position:4,depth:1,role:0,order:constant?200:100,probability:100,useProbability:false,ignoreBudget:false,excludeRecursion:true,preventRecursion:true,delayUntilRecursion:false,matchWholeWords:false,caseSensitive:false,scanDepth:null,vectorized:false,sticky:0,cooldown:0,delay:0,group:'',triggers:[],tisyaTable:{id,reason,...(bookName?{book:bookName}:{}),...(byId.has(id)?{layer:archiveLayer(byId.get(id).table,registry)}:{})}});}
 for(const row of rows){
  const def=registry.tables.find(t=>t.id===row.table);check(def,'缺少表定义：'+row.table);
  const refs=references(row,registry);
  const keys=[...names(row),...(row.values.标签??[]),...(row.table==='events'?[]:refs.flatMap(id=>names(byId.get(id))))].filter(x=>typeof x==='string'&&x.trim());
  const tagged=keys.some(key=>tags.some(tag=>normalized(tag).includes(normalized(key))));
  const reason=tagged?'上回合引用':forced.has(row.id)?'检索命中':dueIds.has(row.id)?'到期检查':['scene','preferences'].includes(row.table)?'当前场景／偏好':'关键词';
  const constant=reason!=='关键词';
  // Native syntax can interpret /name/ as a regular expression; escape literal names.
  const safeKeys=keys.map(key=>key.startsWith('/')?'/'+key.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+'/i':key);
  const paths=new Set(nativeReferences([row]));
  const snapshot=nativeState&&paths.size?{...nativeState,values:(nativeState.values??[]).filter(v=>paths.has(v.path)),missing:(nativeState.missing??[]).filter(p=>paths.has(p))}:null;
  const content=storyMaterial({rows,selectedRows:[row],registry,userId,focusObjects,due});
  if(content)entry(row.id,row.values.名称,content+(snapshot?'\n'+storyContext({nativeState:snapshot},[row]):''),safeKeys,constant,reason);
 }
 if(temporary?.text)entry('latest-temporary','最新回复暂存','最新回复接续资料（尚未确认归档）：\n'+temporary.text,[],true,'最新回复暂存');
 return entries;
}
export function createWorldbookProjection({getContext}){
 let active=null,last=null,fault=null;
 const available=()=>{const t=getContext().eventTypes;return !!(t?.WORLDINFO_ENTRIES_LOADED&&t?.WORLD_INFO_ACTIVATED);};
 function valid(){if(!active)return false;try{active.guard();return true;}catch(e){fault=e;active=null;return false;}}
 function selectedProjection(){const ok=valid();if(fault)throw fault;if(!ok)return {text:'',slots:undefined};check(active.loaded,'本轮未经过原生世界书扫描，不能确认表单激活结果');if(!last)last={candidates:active.entries.length,blue:active.entries.filter(e=>e.constant).length,green:active.entries.filter(e=>!e.constant).length,active:[],characters:0};if(!active.projected){const result=active.projectSelection?active.projectSelection(active.selected):active.selected.map(e=>e.content).join('\n\n');active.projected=typeof result==='string'?{text:result}:result;}return active.projected;}
 return {
  available,
  install(entries,guard,{projectSelection=null}={}){check(available(),'当前宿主缺少原生世界书扫描事件，请更新宿主或选择“直接组装”');active={entries:copy(entries),guard,projectSelection,loaded:false,selected:[]};last=null;fault=null;},
  entriesLoaded(payload){if(!valid())return;check(Array.isArray(payload?.chatLore),'世界书扫描数据格式不支持');const world=active.entries[0]?.world;payload.chatLore.push(...copy(active.entries.filter(e=>!payload.chatLore.some(old=>old.world===world&&old.uid===e.uid))));active.loaded=true;},
  activated(entries){if(!valid())return;active.projected=null;const ours=new Map(active.entries.map(e=>[e.world+'.'+e.uid,e]));active.selected=[...new Map((Array.isArray(entries)?entries:[]).filter(e=>ours.has(e.world+'.'+e.uid)).map(e=>[e.world+'.'+e.uid,{...ours.get(e.world+'.'+e.uid),content:String(e.content??'')}])).values()];last={candidates:active.entries.length,blue:active.entries.filter(e=>e.constant).length,green:active.entries.filter(e=>!e.constant).length,active:active.selected.map(e=>({id:e.tisyaTable.id,name:e.comment,light:e.constant?'蓝':'绿',reason:e.tisyaTable.reason,characters:e.content.length})),characters:active.selected.reduce((n,e)=>n+e.content.length,0)};},
  selectedText(){return selectedProjection().text;},
  selectedSlots(){return selectedProjection().slots;},
  preview:()=>copy(last??(active?{candidates:active.entries.length,blue:active.entries.filter(e=>e.constant).length,green:active.entries.filter(e=>!e.constant).length,active:[],pending:true}:null)),
  clear(){fault=null;if(active&&!last)last={candidates:active.entries.length,active:[],pending:true};active=null;}
 };
}
