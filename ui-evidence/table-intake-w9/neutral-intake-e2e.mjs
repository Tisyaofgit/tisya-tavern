import {parseSimpleSheet,formatSimpleSheet} from '../../tables/simple-sheet.js';
import {createPersonaGateway,personaProjection} from '../../tables/persona.js';
import {assembleArchiveBook} from '../../tables/archive-book.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey,resolveRoute,registry} from '../../config/core.js';
import {defaultRegistry,addTypes,registryIndex,formula,derive,validateRow,upgradeRegistry} from '../../tables/schema.js';
import {createBookGateway} from '../../tables/books.js';
import {sources,project,prepareCommit,retrieval,taskTags} from '../../tables/ledger.js';
import {createTableService} from '../../tables/service.js';
import {createNativeVectors} from '../../tables/vectors.js';
import {buildMessages} from '../../config/host.js';
import {SLOT_TARGETS} from '../../tables/slots.js';
const access={readers:['读者'],knowers:[]};
const blank=()=>({registry:defaultRegistry(),rows:[],last:null});
const op=(id,table,values,evidence='源',expected=0)=>({id,table,expected,values,access,evidence});
function fixture(nativeConfig=null){
 const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a.png',name:'甲'}],chat:[{is_user:false,mes:'开场白'}],extensionSettings:{[KEY]:d},getRequestHeaders:()=>({csrf:'test'})};d.worlds[worldKey(c)]=defaultWorld();d.worlds[worldKey(c)].tables={injection:'direct'};
 const store=createStore({getContext:()=>c,persist:async()=>true}),saved=new Map(),binding={primary:'角色原书',additional:['数据库资料']};let nextUid=1,writeHook=null;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{assert(saved.has(name));return structuredClone(saved.get(name));},createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(e=>({...structuredClone(e),uid:nextUid++})));return true;},updateWorldbookWith:async(name,fn)=>{await writeHook?.();const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async n=>{assert.equal(n,'current');return structuredClone(binding);},rebindCharWorldbooks:async(n,b)=>{assert.equal(n,'current');Object.assign(binding,b);}};
 const books=createBookGateway(()=>helper,()=>c),calls=[],prompts=[];let responder=async()=>({changes:[],templates:[]});
 const makeService=(overrides={})=>createTableService({store,getContext:()=>c,books,nativeConfig,request:async(task,text,opts)=>{calls.push({task,input:parseSimpleSheet(text),signal:opts.signal});if(task==='ruleReview')return {issues:[]};const answer=await responder(task,parseSimpleSheet(text));return typeof answer==='string'?answer:formatSimpleSheet(answer);},setPrompt:(text,filter)=>prompts.push({text,filter}),...overrides});const service=makeService();
 const set=async fields=>{const snap=store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,...fields};await store.save(snap.data,snap.revision,snap.key);};
 return {c,d,store,helper,books,saved,binding,calls,prompts,service,makeService,set,responder:f=>responder=f,writeHook:f=>writeHook=f};
}

const {writeFile}=await import('node:fs/promises');
const {projectStoryDossiers}=await import('../../tables/story-material.js');
const out=new URL('./',import.meta.url).pathname;
const f=fixture();await f.service.initialize();await f.set({enabled:true,archive:false,plot:false,preferences:false,styleEnabled:false});
const sentences={identity:'林青是谨慎的送信人。',place:'北城门是一座石砌城门。',scene:'2026-01-01 09:00，林青站在北城门外。',energy:'林青的体力为0。',entry:'林青尚未进入城门。',task:'林青已经接受送信任务，目标是将信交给守门人，目前仍在进行；下一步是等待守门人接信。',past:'林青于2026-01-01 08:55抵达北城门外。'};
const source=Object.values(sentences).join('\n');
const proposal={templates:[],schemaChanges:[],pending:[],changes:[
 op('new:traveler','objects',{名称:'林青',类型:'character',属性:{身份:'送信人',性格:'谨慎'}},sentences.identity),
 op('new:gate','objects',{名称:'北城门',类型:'place',属性:{特征:'石砌'}},sentences.place),
 op('new:scene','scene',{名称:'城门外',当前时间:'2026-01-01 09:00',地点:'北城门外',参与者:['new:traveler']},sentences.scene),
 op('new:energy','state',{名称:'当前体力',对象:'new:traveler',字段:'体力',值:0,有效性:'有效'},sentences.energy),
 op('new:entry','state',{名称:'是否已进城',对象:'new:traveler',字段:'已进城',值:false,有效性:'有效'},sentences.entry),
 op('new:task','tasks',{名称:'送信任务',负责人:['new:traveler'],目标:'将信交给守门人',状态:'进行',下一步:'等待守门人接信'},sentences.task),
 op('new:event','events',{名称:'抵达北城门',时间:'2026-01-01 08:55',参与者:['new:traveler'],经过:sentences.past},sentences.past)
]};
const preferenceText='今后在这个会话中，描写城门时请简洁。';
const preferenceProposal={templates:[],schemaChanges:[],pending:[],changes:[op('new:pref','preferences',{名称:'城门描写简洁',内容:'描写城门时请简洁',性质:'明确要求',强度:'偏好',类别:'文风',作用域:{会话:['one']},证据:preferenceText,启用:true},preferenceText)]};
const wires=[];f.responder(async(task,input)=>{
 if(task==='historyImport'){assert.equal(input.historyText,source);const wire=formatSimpleSheet(proposal);wires.push({task,wire});return wire;}
 if(task==='preferenceAnalysis'){assert.equal(input.userInput,preferenceText);const wire=formatSimpleSheet(preferenceProposal);wires.push({task,wire});return wire;}
 throw Error('Unexpected task '+task);
});
const before=JSON.stringify([...f.saved]);const draft=await f.service.importHistory(source);assert.equal(JSON.stringify([...f.saved]),before);await f.service.saveHistory(draft);
let reloaded=f.makeService(),view=await reloaded.inspect();const traveler=view.rows.find(r=>r.table==='objects'&&r.values.名称==='林青');assert(traveler);assert.equal(view.rows.length,7);
assert.equal(view.rows.find(r=>r.values.名称==='当前体力').values.值,0);assert.equal(view.rows.find(r=>r.values.名称==='是否已进城').values.值,false);
const dossier=projectStoryDossiers({rows:view.rows,registry:view.registry,userId:traveler.id});
const placement=id=>dossier.placements.find(p=>p.id===view.rows.find(r=>r.values.名称===id).id);
assert.equal(placement('林青').layer,'Basics');assert.equal(placement('当前体力').layer,'ToNarrate');assert.equal(placement('是否已进城').layer,'ToNarrate');assert.equal(placement('送信任务').layer,'ToNarrate');assert.equal(placement('抵达北城门').layer,'History');assert.equal(placement('城门外').layer,'Environment');
assert.match(dossier.text,/<Basics>[\s\S]*林青/);assert.match(dossier.text,/<ToNarrate>[\s\S]*当前体力/);assert.match(dossier.text,/<History>[\s\S]*抵达北城门/);assert.equal(dossier.text.split('当前体力').length-1,1);
f.c.chat.push({is_user:true,mes:preferenceText});const result=await reloaded.analysePreferences();assert.equal(result.pending,1);
reloaded=f.makeService();view=await reloaded.inspect();assert.equal(view.preferenceDrafts.length,1);assert.equal(view.preferenceDrafts[0].status,'pending');assert.equal(view.rows.filter(r=>r.table==='preferences').length,0);
const prepared=await reloaded.prepare();assert(!prepared.slots.preferences.narrativeText.includes('城门描写简洁'));assert(!prepared.text.includes('描写城门时请简洁'));
const summary={source:'synthetic neutral fixture; no private user corpus',mockedModel:true,realParser:true,realCommitValidator:true,realBookGateway:true,memoryHost:true,externalHostWrites:false,recreatedService:true,rows:view.rows.length,zeroPreserved:true,falsePreserved:true,placements:dossier.placements.map(p=>({name:view.rows.find(r=>r.id===p.id).values.名称,layer:p.layer})),preferenceDraftStatus:view.preferenceDrafts[0].status,activePreferenceRows:0,preferenceInjected:false,modelRequests:wires.map(w=>w.task),checks:'passed'};
await writeFile(out+'neutral-intake-e2e-source.txt',source+'\n');
await writeFile(out+'neutral-intake-e2e-model-sheets.txt',wires.map(w=>'===== '+w.task+' =====\n'+w.wire).join('\n\n'));
await writeFile(out+'neutral-intake-e2e-dossier.txt',dossier.text+'\n');
await writeFile(out+'neutral-intake-e2e-result.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
