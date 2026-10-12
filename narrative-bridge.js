import {nativeMvuDeclaration,applyNativeMvuContract} from './config/native-mvu.js';
import {requireMoodNames} from './heart-contract.js';
import {modularSource,currentConfiguration,refineCompiled} from './config/compiler.js';
import {NARRATIVE as N} from './settings-core.js';
import {outputEnabled,heartSelection} from './preset.js';
import {HEART_CONTROLS} from './preset-heart-variants.js';
export const NARRATIVE_DEFAULTS=Object.freeze({...N.suggestions(),'缇斯亚MVU兼容':false});
export const LIVE_PREFIX='tisya_live_';
const MARK='缇斯亚叙事配置提交记录',SUMMARY='缇斯亚构思显示',INDEX='缇斯亚叙事方案目录',PROFILE='缇斯亚叙事方案_';
const clone=v=>structuredClone(v),stamp=v=>JSON.stringify(v),plain=v=>v&&typeof v==='object'&&!Array.isArray(v),fail=text=>{throw Object.assign(Error(text),{code:text});};
const key=(k,scope)=>scope==='global'?k.replace('缇斯亚','缇斯亚默认'):k;
const fields=Object.keys(NARRATIVE_DEFAULTS);
export function isLivePreset(source){return source.prompts.some(p=>typeof p.content==='string'&&/\{\{tisya_live_[a-z_]+\}\}/.test(p.content));}
export function nativeSelection(source){return {summary:true,directions:HEART_CONTROLS.filter((_,i)=>heartSelection(source)&(1<<i)).map(c=>c.name)};}
function variables(context,scope){const v=scope==='global'?context.extensionSettings.variables?.global:context.chatMetadata?.variables;if(v!==undefined&&!plain(v))fail('原生变量格式损坏，配置未改动。');return v??{};}
export function readNarrative(context,scope='chat'){
 if(!['chat','global'].includes(scope))fail('配置范围无效。');const tree=variables(context,scope),marker=tree[key(MARK,scope)];
 const present=fields.filter(k=>Object.hasOwn(tree,key(k,scope)));
 if(marker===undefined&&!present.length)return {kind:'absent',revision:null,settings:clone(NARRATIVE_DEFAULTS),summary:true};
 if(!plain(marker)||marker.状态!=='就绪'||typeof marker.修订!=='string'||present.length!==fields.length)fail('叙事设置未完整保存，请保留现有配置并重新核对。');
 const settings=Object.fromEntries(fields.map(k=>[k,clone(tree[key(k,scope)])]));N.validate(settings);if(settings.缇斯亚MVU兼容)fail('本扩展的 MVU 状态服务尚未接通。');
 const summary=tree[key(SUMMARY,scope)];if(typeof summary!=='boolean')fail('公开摘要配置损坏。');return {kind:'ready',revision:stamp([marker.修订,settings,summary]),storageRevision:marker.修订,settings,summary};
}
export function compileNarrative(context,source,moods=[]){
 const modular=modularSource(source),current=modular?currentConfiguration(context,()=>readNarrative(context).settings):null,config=modular?{settings:current.world.modes[current.world.mode].narrative,summary:current.world.modes[current.world.mode].summary}:readNarrative(context),selection=modular&&current.world.modes[current.world.mode].heartDirections?{directions:current.world.modes[current.world.mode].heartDirections}:nativeSelection(source),activeEntries=source.order.filter(s=>s.enabled&&source.prompts.some(p=>p.identifier===s.identifier&&p.enabled!==false)).map(p=>p.identifier);
 const c=N.previewSettings(config.settings,{summary:config.summary,directions:selection.directions},{activeEntries,outputEnabled:outputEnabled(source)});
 if(c.prose&&c.outputEnabled&&c.heartActive){const values=JSON.parse(c.outputValues);const before='mood must be one of '+JSON.stringify(values.mood);values.mood=requireMoodNames(moods);c.outputValues=JSON.stringify(values);const inner=c.rest.entries.tisya_inner_chain;if(inner.split(before).length!==2)fail('原版心声表情格式发生变化。');c.rest.entries.tisya_inner_chain=inner.replace(before,'mood must be one of '+JSON.stringify(values.mood)).replaceAll('{mood或null}','{mood}');}
 const result=modular?refineCompiled(c,current,source):c;if(modular&&c.prose&&c.outputEnabled&&nativeMvuDeclaration(context,current.world))applyNativeMvuContract(result.rest.entries);return result;
}
export function registerLivePreset(context,getSource,getContext,getMoods,onError=()=>{}){
 const ids=Object.keys(N.previewSettings(NARRATIVE_DEFAULTS,{summary:true,directions:[]}).rest.entries);let cacheKey=null,cached=null;
 const execution=()=>{const source=getSource(),ctx=getContext(),current=modularSource(source)?currentConfiguration(ctx,()=>readNarrative(ctx).settings):null,legacy=current?null:readNarrative(ctx),config=current?{settings:current.world.modes[current.world.mode].narrative,summary:current.world.modes[current.world.mode].summary}:legacy,selection=current?.world.modes[current.world.mode].heartDirections?{directions:current.world.modes[current.world.mode].heartDirections}:nativeSelection(source);const enabled=outputEnabled(source);const moods=enabled&&selection.directions.length&&config.settings.缇斯亚当前任务==='叙事'&&['互动叙事','大纲扩写'].includes(config.settings.缇斯亚叙事创作模式)?getMoods():[];
  const next=stamp([current?nativeMvuDeclaration(ctx,current.world)?.signature??null:null,modularSource(source)?currentConfiguration(ctx):null,config.settings,config.summary,source.order,source.prompts.map(p=>[p.identifier,p.enabled]),moods]);if(next!==cacheKey){cacheKey=null;cached=null;cached=compileNarrative(ctx,source,moods);cacheKey=next;}return cached;};
 for(const id of ids)context.registerMacro(LIVE_PREFIX+id,()=>{try{return execution().rest.entries[id]??'';}catch(e){cacheKey=null;cached=null;onError(e);throw e;}},'缇斯亚：当前聊天配置 · '+id);
 return {execution,dispose(){ids.forEach(id=>context.unregisterMacro(LIVE_PREFIX+id));cached=null;cacheKey=null;}};
}
export function createNarrativeBridge({getContext,getSource,persistChat,persistGlobal,refreshPrompts=()=>{},assertIdle=()=>{}}){
 let pending=false,alive=true;
 function token(){const c=getContext();if(!c.chatId||!c.chatMetadata)fail('请先打开一个聊天。');return {id:c.chatId,character:c.characterId,group:c.groupId,meta:c.chatMetadata};}
 function guard(t){const c=getContext();if(!alive||c.chatId!==t.id||c.characterId!==t.character||c.groupId!==t.group||c.chatMetadata!==t.meta)fail('聊天已切换，本页操作已停止。');}
 function sourceStamp(){const s=getSource();return stamp([s.identity,s.prompts,s.order]);}
 function inspect(scope='chat'){const c=getContext(),s=getSource(),state=readNarrative(c,scope);return {...state,output:{kind:'ready',revision:sourceStamp(),value:{summary:state.summary,directions:nativeSelection(s).directions}},preview:{activeEntries:s.order.filter(x=>x.enabled&&s.prompts.some(p=>p.identifier===x.identifier&&p.enabled!==false)).map(x=>x.identifier),outputEnabled:outputEnabled(s),presetState:isLivePreset(s)?'match':'unrelated'}};}
 async function work(fn){if(pending)fail('上一项设置尚未保存完成。');try{assertIdle();}catch(e){fail(e.message??e);}pending=true;try{return await fn();}catch(e){if(!e.code)e.code=e.message;throw e;}finally{pending=false;}}
 async function write(tree,scope,t){guard(t);const c=getContext();if(scope==='chat'){const prior=c.chatMetadata.variables;c.chatMetadata.variables=tree;try{await persistChat(c,t);}catch(e){if(c.chatMetadata.variables===tree){if(prior===undefined)delete c.chatMetadata.variables;else c.chatMetadata.variables=prior;}fail('聊天设置未确认保存，草稿保留：'+(e.code==='integrity'?'聊天的磁盘版本已变化，请重新载入后核对':e.message??e));}}else{const v=c.extensionSettings.variables;if(v!==undefined&&!plain(v))fail('全局变量格式损坏。');const next={...(v??{}),global:tree};c.extensionSettings.variables=next;try{if(await persistGlobal()!==true)throw Error('宿主未确认保存');}catch(e){if(c.extensionSettings.variables===next){if(v===undefined)delete c.extensionSettings.variables;else c.extensionSettings.variables=v;}fail('全局设置未确认保存，草稿保留：'+(e.message??e));}}guard(t);}
 function checked(settings){N.validate(settings);if(settings.缇斯亚MVU兼容)fail('MVU 状态服务尚未接通，请保持关闭。');}
 function checkNative(source,directions){if(!isLivePreset(source))fail('请先导入并选用 alpha.12 配套预设，再保存叙事设置。');if(!Array.isArray(directions)||new Set(directions).size!==directions.length||directions.some(d=>!HEART_CONTROLS.some(c=>c.name===d)))fail('心声方向无效。');
  for(const c of HEART_CONTROLS){const p=source.prompts.filter(p=>p.identifier===c.id),o=source.order.filter(p=>p.identifier===c.id);if(p.length!==1||o.length!==1)fail('当前预设缺少或重复心声开关，请在原生提示词列表核对。');}}
 async function save(raw,expected,scope,out){return work(async()=>{const t=token(),settings=JSON.parse(raw),payload=JSON.parse(out),source=getSource();checked(settings);if(typeof payload.value.summary!=='boolean')fail('公开摘要选项无效。');checkNative(source,payload.value.directions);if(readNarrative(getContext(),scope).revision!==expected||sourceStamp()!==payload.revision)fail('配置或预设已在别处修改，请重新打开后再保存。');
  const revision=crypto.randomUUID().replaceAll('-',''),tree={...variables(getContext(),scope)};fields.forEach(k=>tree[key(k,scope)]=clone(settings[k]));tree[key(SUMMARY,scope)]=payload.value.summary;tree[key(MARK,scope)]={状态:'就绪',修订:revision};
  const nativeChanged=stamp(nativeSelection(source).directions)!==stamp(payload.value.directions);await write(tree,scope,t);
  if(nativeChanged){if(sourceStamp()!==payload.revision)fail('叙事设置已保存，但预设已变化，心声开关未写入；请重新打开核对。');for(const c of HEART_CONTROLS){const on=payload.value.directions.includes(c.name);source.order.find(o=>o.identifier===c.id).enabled=on;source.prompts.find(p=>p.identifier===c.id).enabled=on;}const applied=sourceStamp();if(await persistGlobal()!==true)fail('叙事设置已保存，心声开关已应用但保存未确认；请重新打开核对。');guard(t);if(sourceStamp()!==applied)fail('开关已提交，但当前预设已变化，请重新打开核对。');await refreshPrompts();guard(t);}
  if(readNarrative(getContext(),scope).storageRevision!==revision)fail('设置读回不一致。');return inspect(scope);
 });}
 function libraryValue(){const v=variables(getContext(),'global')[INDEX];if(v===undefined)return {修订:null,条目:[]};if(!plain(v)||!Array.isArray(v.条目)||v.条目.length>100||v.条目.some(r=>!plain(r)||typeof r.编号!=='string'||typeof r.名称!=='string'))fail('方案目录损坏。');return clone(v);}
 async function library(op,raw){if(op==='list')return libraryValue();const p=JSON.parse(raw),tree=variables(getContext(),'global'),list=libraryValue(),row=list.条目.find(r=>r.编号===p.id),stored=row&&tree[PROFILE+p.id];if(['load','load-output'].includes(op)){if(!stored)fail('方案不存在。');checked(stored.配置);return clone(op==='load'?stored.配置:stored.输出);}
  return work(async()=>{const t=token(),next={...tree},name=p.name;if(['save','rename'].includes(op)&&(!name||name!==name.trim()||name.length>32||list.条目.some(r=>r.名称===name&&r.编号!==p.id)))fail('方案名称须为 1—32 字，且不能重名。');if(p.revision!==list.修订||op!=='save'&&!row)fail('方案已变化，请重新打开。');
   if(op==='save'||op==='update'){checked(p.settings);if(typeof p.output?.summary!=='boolean'||(!Array.isArray(p.output.directions)||new Set(p.output.directions).size!==p.output.directions.length||p.output.directions.some(d=>!HEART_CONTROLS.some(c=>c.name===d))))fail('方案输出选项无效。');const id=op==='save'?crypto.randomUUID().replaceAll('-',''):p.id;if(op==='save'){if(list.条目.length>=100)fail('方案数量已达上限。');list.条目.push({编号:id,名称:name});}next[PROFILE+id]={结构版本:1,名称:name??row.名称,配置:clone(p.settings),输出:clone(p.output)};}
   else if(op==='rename'){row.名称=name;next[PROFILE+p.id]={...stored,名称:name};}else if(op==='delete'){if(p.confirm!==row.名称)fail('删除确认不符。');list.条目=list.条目.filter(r=>r.编号!==p.id);delete next[PROFILE+p.id];}else fail('方案操作无效。');list.修订=crypto.randomUUID().replaceAll('-','');next[INDEX]=list;await write(next,'global',t);return libraryValue();
  });}
 async function initialize(){if(pending)return;const c=getContext();if(!c.chatId||!Array.isArray(c.chat)||c.chat.some(m=>m.is_user)||c.chat.length>1)return;const current=readNarrative(c),defaults=readNarrative(c,'global');if(current.kind!=='absent'||defaults.kind!=='ready')return;return work(async()=>{const t=token(),tree={...variables(getContext(),'chat')};fields.forEach(k=>tree[k]=clone(defaults.settings[k]));tree[SUMMARY]=defaults.summary;tree[MARK]={状态:'就绪',修订:crypto.randomUUID().replaceAll('-','')};await write(tree,'chat',t);});}
 async function setOutput(on,expected){return work(async()=>{const t=token(),s=getSource();if(typeof on!=='boolean'||!isLivePreset(s)||sourceStamp()!==expected)fail('预设已变化，请重新打开设置。');const p=s.prompts.filter(x=>x.identifier==='tisya_output'),o=s.order.filter(x=>x.identifier==='tisya_output');if(p.length!==1||o.length!==1)fail('结构化输出开关缺少或重复。');p[0].enabled=on;o[0].enabled=on;const applied=sourceStamp();if(await persistGlobal()!==true)fail('已应用，宿主尚未确认保存；请重新打开核对。');guard(t);if(sourceStamp()!==applied)fail('开关已提交，但当前预设已变化，请重新打开核对。');await refreshPrompts();guard(t);return inspect();});}
 return {inspect,save,library,initialize,setOutput,busy:()=>pending,dispose(){alive=false;}};
}
