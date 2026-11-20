import test from 'node:test';
import assert from 'node:assert/strict';
import {baseline} from '../engine/config.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {createNativeSourceLayers} from '../engine/native-source-layers.mjs';
import {loadNativeHost} from './fixtures/native-layers/load-host-fragments.mjs';

// Host integration fixture. Native provenance and token accounting have their
// separate fixed-host-source tests; this fixture never claims a live model run.
const cardText='角色：港口守夜人。\n叙事人称：第三人称\n事实：旧伞放在门边。';
const clone=structuredClone;
async function fixture({readyError=null,legacy=false,cardContent=cardText,realNative=false,customPrompt=null,getDisplayRules=()=>[]}={}){
 const disk=new Map(),macros=new Map(),calls=[];
 const eventNames=['GENERATION_AFTER_COMMANDS','WORLDINFO_ENTRIES_LOADED','WORLD_INFO_ACTIVATED','GENERATE_AFTER_COMBINE_PROMPTS','CHAT_COMPLETION_SETTINGS_READY','GENERATION_ENDED','GENERATION_STOPPED'];
 const context={chatId:'layer-host',characterId:0,characters:[{avatar:'guard.png',data:{description:cardContent}}],extensionSettings:{},chatMetadata:{},chat:[{is_user:false,mes:'他将旧伞放在门边。'},{is_user:true,mes:'继续谈话。'}],registerMacro:(key,fn)=>macros.set(key,fn),saveChat:async()=>true};
 if(realNative)Object.assign(context,{eventTypes:Object.fromEntries(eventNames.map(name=>[name,name])),extensionPrompts:{}});
 const source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)};
 if(legacy){
  source.prompts=source.prompts.filter(p=>p.identifier!=='tisya_layer_authority');
  source.order=source.order.filter(p=>p.identifier!=='tisya_layer_authority');
  const at=source.order.findIndex(p=>p.identifier==='tisya_material_boundary_open');
  const [open]=source.order.splice(at,1);source.order.splice(source.order.findIndex(p=>p.identifier==='tisya_pref_narrative'),0,open);
 }
 if(customPrompt){source.prompts.push(clone(customPrompt));source.order.splice(2,0,{identifier:customPrompt.identifier,enabled:true});}
 const stored=clone(source);
 const expand=text=>text.replace(/\{\{([^{}]+)\}\}/g,(raw,key)=>macros.get(key)?.()??(key==='char'?'守夜人':key==='user'?'阿青':raw));
 const native=realNative?loadNativeHost({substitute:value=>expand(String(value??''))}):null;
 let host;
 const nativeSources=realNative?createNativeSourceLayers({relocateSources:true,PromptManager:native.PromptManager,Message:native.Message,ChatCompletion:native.ChatCompletion,getContext:()=>context,getScope:()=>'chat:fixed:window12',getAuthorsNotePolicy:()=>({enabled:true}),preparePreset:(...args)=>host.prepareNativePreset(...args),finalizeMessages:(...args)=>host.finalizeNativeMessages(...args)}):{begin:()=>calls.push('begin'),end:()=>calls.push('end'),entriesLoaded:()=>calls.push('entriesLoaded'),activated:()=>calls.push('activated'),afterCombine:()=>calls.push('afterCombine'),assertReady(){calls.push('assertReady');if(readyError)throw readyError;},audit:()=>({status:'fixture-only',sources:['card:description'],liveHost:false})};
 const storage={get:async key=>clone(disk.get(key)),set:async(key,value)=>disk.set(key,clone(value)),commit:async(key,revision,value)=>{if((disk.get(key)?.local_revision??0)!==revision)return false;disk.set(key,clone(value));return true;}};
 host=createMatrixHost({getContext:()=>context,getSource:()=>source,loadCatalog:async()=>({tables:[]}),storage,persistSettings:async()=>true,persistMetadata:async()=>true,nativeSources,expand,getDisplayRules});
 host.register();const runtime=new Runtime();runtime.registerTable('ACTOR',[{key:'name',type:'TEXT'}]);runtime.newRecord('ACTOR',{name:'阿青'},'u');await host.import({state:runtime.data});
 const settings=host.config.read();settings.story.play={choices:{N02:'N02-C'}};await host.config.save(settings);
 function payload(){
  const byId=new Map(source.prompts.map(row=>[row.identifier,row])),messages=[];
  for(const item of source.order){const row=byId.get(item.identifier);if(!item.enabled||row.enabled===false)continue;
   if(row.identifier==='charDescription'){messages.push({role:'system',content:'<DreamMaterial source="角色卡·描述">\n'+cardContent+'\n</DreamMaterial>'});continue;}
   if(row.identifier==='chatHistory'){messages.push(...context.chat.map(m=>({role:m.is_user?'user':'assistant',content:m.mes})));continue;}
   if(row.marker)continue;const content=expand(row.content??'');if(content)messages.push({role:row.role,content});
  }
  return {messages};
 }
 async function nativePayload(){
  const owner=new native.PromptManager();owner.serviceSettings={prompts:clone(source.prompts),prompt_order:clone(source.order)};
  const prompts=owner.getPromptCollection('normal'),messages=new native.MessageCollection('all'),completion=new native.ChatCompletion();completion.setTokenBudget(1000000,0);
  const card=owner.preparePrompt({identifier:'charDescription',role:'system',content:cardContent});
  for(const item of owner.serviceSettings.prompt_order){if(!item.enabled)continue;const prompt=prompts.get(item.identifier);if(!prompt)continue;
   if(item.identifier==='charDescription'){messages.add(await native.Message.fromPromptAsync(card,owner.tokenHandler));continue;}
   if(item.identifier==='chatHistory'){for(const [index,row]of context.chat.entries())messages.add(await native.Message.createAsync(row.is_user?'user':'assistant',row.mes,'chatHistory-'+index,owner.tokenHandler));continue;}
   if(prompt.content)messages.add(await native.Message.fromPromptAsync(prompt,owner.tokenHandler));
  }
  completion.add(messages,0);return completion.getChat();
 }
 return {context,source,stored,calls,host,payload,nativePayload,dispose:()=>nativeSources.dispose?.()};
}

for(const legacy of [false,true])test('native-layer host preserves card data in dream material and the configured position of the selected person: '+(legacy?'installed preset':'new preset'),async()=>{
 const f=await fixture({legacy}),card=clone(f.context.characters[0]),history=clone(f.context.chat);
 await f.host.before('normal');await f.host.entriesLoaded({characterLore:[]});f.host.activated([]);f.host.afterCombine({dryRun:false});
 const request=f.payload();await f.host.payloadReady(request);
 const system=request.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),dream=request.messages.filter(m=>m.role==='assistant'&&m.content.includes('<NativeDreamSources>')).map(m=>m.content).join('\n');
 assert.equal(f.host.accepted(),true);assert(!system.includes(cardText));assert(dream.includes(cardText));assert.match(system,/<tisya>[\s\S]*@POV\.PERSON := 全文使用第二人称/);
 const materialOpening=system.indexOf('[Dream Rules]\n@BOUNDARY ');assert(materialOpening>=0);
 const position=id=>f.stored.order.findIndex(row=>row.identifier===id);
 const person=system.indexOf('@POV.PERSON := 全文使用第二人称');
 assert(person>=0);
 assert.equal(person<materialOpening,position('tisya_pref_narrative')<position('tisya_material_boundary_open'));
 assert(person<system.indexOf('[/Dream Rules]',materialOpening));
 assert(system.lastIndexOf('<tisya>',person)>system.lastIndexOf('</tisya>',person));
 assert.match(system,/<rule>[\s\S]*\[REGISTRY\]/);
 assert.equal(system.split('[LAYER.AUTHORITY]').length-1,1);
 assert.equal(f.host.latest().promptAudit.narrativeSourceProjection.removed.length,0);
 assert.equal(f.host.latest().promptAudit.nativeSources.liveHost,false);
 assert.deepEqual(f.context.characters[0],card);assert.deepEqual(f.context.chat.map(m=>m.mes),history.map(m=>m.mes));assert.deepEqual(f.source,f.stored);
 assert(request.messages.some(m=>m.role==='assistant'&&m.content==='他将旧伞放在门边。'));
 const context=f.host.contextPreview();assert.equal(context.dispatch.stage,'assembled');assert.equal(context.session,'["character","0","layer-host"]');assert.deepEqual(context.messages,request.messages);assert.equal(f.host.contextSnapshots().at(-1).at,context.at);
 assert.deepEqual(f.calls.slice(-4),['entriesLoaded','activated','afterCombine','assertReady']);
});

test('complete native/template/finalization chain emits no internal markers and preserves real history roles',async()=>{
 const displayRule={scriptName:'状态组件',findRegex:'<StatusPlaceHolderImpl/>',replaceString:'<span>状态</span>',markdownOnly:true,placement:[2]};
 const f=await fixture({realNative:true,customPrompt:{identifier:'custom-external-system',role:'system',content:'自定义系统原文 {{outletPromptsInjected:demo}}',enabled:true},getDisplayRules:()=>[displayRule]});
 f.context.chat[0].mes+='\n&lt;StatusPlaceHolderImpl/&gt; &lt;Unknown/&gt; &amp;amp;';
 try{
  await f.host.before('normal');await f.host.entriesLoaded({globalLore:[],characterLore:[],chatLore:[],personaLore:[]});f.host.activated([]);f.host.afterCombine({dryRun:false});
  const request={model:'fixture-model',stream:false,tools:[{type:'function',function:{name:'fixture_tool',parameters:{type:'object'}}}],messages:await f.nativePayload()};
  f.host.captureTemplatePayload(request);
  assert.match(JSON.stringify(request.messages),/⟦TISYA_TEMPLATE_START_[0-9a-f-]+⟧/,'the fixture must exercise the marked intermediate state');
  const external=request.messages.find(m=>m.content.includes('{{outletPromptsInjected:demo}}'));assert(external);
  external.content='模板生成的前缀\n'+external.content.replace('{{outletPromptsInjected:demo}}','模板出口资料');
  const user=request.messages.find(m=>m.role==='user');user.content+='\n模板生成的尾部';
  await f.host.payloadReady(request);
  const serialized=JSON.stringify(request.messages);
  assert.doesNotMatch(serialized,/⟦TISYA_(?:TEMPLATE|SOURCE)_(?:START|END)_[0-9a-f-]+⟧|<!--TISYA_NATIVE_SOURCE_(?:START|END):/);
  assert(request.messages.some(m=>m.role==='assistant'&&m.content==='他将旧伞放在门边。\n<StatusPlaceHolderImpl/> &lt;Unknown/&gt; &amp;amp;'));
  assert(request.messages.some(m=>m.role==='user'&&m.content==='继续谈话。'));
  const system=request.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
  assert(!system.includes('自定义系统原文'));assert(!system.includes('模板生成的前缀'));assert.match(system,/@AUTHORITY := FIRST_PRIORITY/);
  const dream=request.messages.filter(m=>m.role==='assistant'&&m.content.includes('<NativeDreamSources>')).map(m=>m.content).join('\n');
  for(const text of ['自定义系统原文','模板出口资料','模板生成的前缀','模板生成的尾部',cardText])assert(dream.includes(text),text);
  assert.equal(f.host.accepted(),true);assert.deepEqual(f.host.contextPreview().messages,request.messages);assert.deepEqual(f.host.contextPreview().tools,request.tools);assert.equal(f.host.contextPreview().parameters.model,'fixture-model');
 }finally{f.dispose();}
});

test('missing native coverage blocks before any outgoing request mutation',async()=>{
 const error=Object.assign(new Error('native after-combine was not observed'),{code:'NATIVE_LAYER_NOT_READY'}),f=await fixture({readyError:error});await f.host.before('normal');
 const request=f.payload(),before=clone(request);await assert.rejects(f.host.payloadReady(request),e=>e===error);
 assert.deepEqual(request,before);assert.equal(f.host.accepted(),false);
});

test('native card quotations do not become a second registry or an unexpanded configuration macro',async()=>{
 const content=cardText+'\n原卡的格式示例：\n[REGISTRY]\n这是引文，不是当前输出合同。\n{{tisya_literal_in_source}}',f=await fixture({cardContent:content});
 await f.host.before('normal');await f.host.entriesLoaded({characterLore:[]});f.host.afterCombine({dryRun:false});const request=f.payload();await f.host.payloadReady(request);
 assert.equal(f.host.accepted(),true);assert(request.messages.some(message=>message.content?.includes(content)));
});

test('native layer ownership ends on stop, chat switch and explicit clear',async()=>{
 const f=await fixture();await f.host.before('normal');let count=f.calls.filter(x=>x==='end').length;
 await f.host.event('GENERATION_STOPPED');assert.equal(f.calls.filter(x=>x==='end').length,count+1);
 await f.host.event('CHAT_CHANGED');assert.equal(f.calls.filter(x=>x==='end').length,count+2);
 f.host.clear();assert.equal(f.calls.filter(x=>x==='end').length,count+3);
});

test('an old native agent resume cannot bypass the source preparation boundary',async()=>{
 const f=await fixture();assert.doesNotThrow(()=>f.host.assertNativeResume({agentResume:false}));
 assert.throws(()=>f.host.assertNativeResume({agentResume:true}),error=>error.code==='NATIVE_LAYER_RESUME_UNAVAILABLE');
 assert.equal(f.host.accepted(),false);assert.deepEqual(f.source,f.stored);
});
