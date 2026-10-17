import {simpleTaskAnswer} from './helpers/simple-answers.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {defaultRegistry} from '../tables/schema.js';
import {createBookGateway} from '../tables/books.js';
import {createTableService} from '../tables/service.js';
import {prepareSimpleGenesis,parseSimpleGenesis} from '../tables/simple-genesis.js';
import {simpleGenesisAnswer,simpleCoreAnswer,simpleAdaptationAnswer} from './helpers/simple-answers.js';
const access={readers:['读者'],knowers:[]};
const op=(id,table,values,evidence='源',expected=0)=>({id,table,expected,values,access,evidence});
function fixture(nativeConfig=null){
 const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a.png',name:'甲'}],chat:[{is_user:false,mes:'开场白'}],extensionSettings:{[KEY]:d},getRequestHeaders:()=>({csrf:'test'})};d.worlds[worldKey(c)]=defaultWorld();d.worlds[worldKey(c)].tables={injection:'direct'};
 const store=createStore({getContext:()=>c,persist:async()=>true}),saved=new Map(),binding={primary:'角色原书',additional:['数据库资料']};let nextUid=1,writeHook=null;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{assert(saved.has(name));return structuredClone(saved.get(name));},createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(e=>({...structuredClone(e),uid:nextUid++})));return true;},updateWorldbookWith:async(name,fn)=>{await writeHook?.();const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async n=>{assert.equal(n,'current');return structuredClone(binding);},rebindCharWorldbooks:async(n,b)=>{assert.equal(n,'current');Object.assign(binding,b);}};
 const books=createBookGateway(()=>helper,()=>c),calls=[],prompts=[];let responder=async()=>({changes:[],templates:[]});
 const makeService=(overrides={})=>createTableService({store,getContext:()=>c,books,nativeConfig,request:async(task,text,opts)=>{calls.push({task,input:JSON.parse(text),signal:opts.signal});return task==='ruleReview'?{issues:[]}:simpleTaskAnswer(task,JSON.parse(text),await responder(task,JSON.parse(text)));},setPrompt:(text,filter)=>prompts.push({text,filter}),...overrides});const service=makeService();
 const set=async fields=>{const snap=store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,...fields};await store.save(snap.data,snap.revision,snap.key);};
 return {c,d,store,helper,books,saved,binding,calls,prompts,service,makeService,set,responder:f=>responder=f,writeHook:f=>writeHook=f};
}
async function initializeBase(f,changes){return f.service.edit({changes});}
const ai=text=>({is_user:false,name:'甲',mes:text});const user=text=>({is_user:true,name:'用户',mes:text});


async function scenario(name,fn){return test(name,async()=>{
 const result=await fn();
 if(name==='no-persona-existing-records-genesis'){
  assert.equal(result.success,true);assert.equal(result.writesDuringDraft,false);return;
 }
 assert.equal(result.accepted,false,JSON.stringify(result));
 assert.equal(result.savedStateUnchanged,true,'Rejected draft must leave all persisted books untouched');
 assert.equal(typeof result.error,'string');
});}
await scenario('editable-genesis-overwrites-bound-native-user',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.userAvatar='review-user';f.c.name1='旅人';const original='原生完整定义：必须逐字保留。';f.c.powerUserSettings={personas:{'review-user':'旅人'},persona_descriptions:{'review-user':{description:original}},persona_description:original};
 await f.service.initialize();f.responder(()=>'【完成】\n1 状态：完成\n2 待处理：无\n3 补读记录：无');await f.service.saveCardTemplate(await f.service.cardTemplate('card'));
 const before=await f.service.inspect(),native=before.rows.find(r=>r.id===before.session.personaBinding.objectId);
 f.responder((task,input)=>simpleGenesisAnswer(input,{name:'审计草稿'}));const d=await f.service.genesis('将描述改成编辑后替代定义。');d.proposal.artifacts.base.changes.push({id:native.id,table:'objects',expected:native.rev,values:{描述:'编辑后替代定义。'},access:{readers:[],knowers:[]},evidence:'编辑后替代定义。'});
 const booksBefore=JSON.stringify([...f.saved]);let accepted=true,error=null;try{await f.service.saveGenesis(d);}catch(e){accepted=false;error=e.message;}const after=await f.service.inspect(),row=after.rows.find(r=>r.id===native.id);
 return {accepted,error,savedStateUnchanged:JSON.stringify([...f.saved])===booksBefore,beforeDescription:native.values.描述,afterDescription:row.values.描述,beforeAccess:native.access,afterAccess:row.access,nativeSourceUnchanged:f.c.powerUserSettings.persona_description===original};
});
await scenario('identity-core-meaning-removed-through-editable-source-snapshot',async()=>{
 const f=fixture();f.c.name1='旁观用户';f.c.userAvatar='review-observer';f.c.powerUserSettings={personas:{'review-observer':'旁观用户'},persona_descriptions:{'review-observer':{description:'旁观者。'}},persona_description:'旁观者。'};await f.service.initialize();await initializeBase(f,[op('new:person','objects',{名称:'旧守门人',类型:'character',描述:'守约与不能离岗。'},'用户手动修改表单')]);let info=await f.service.inspect();const person=info.rows[0];
 f.responder(()=>simpleCoreAnswer({name:'守门核心',traits:[{name:'职责',value:'守约',evidence:'守约'},{name:'限制',value:'不能离岗',evidence:'不能离岗'}]}));const core=await f.service.saveCore(await f.service.coreDraft(person.id));const book=info.settings.originBook;
 f.responder((task,input)=>simpleAdaptationAnswer(simpleGenesisAnswer(input,{name:'新人',decisions:['新守卫守约且不能离岗。'],records:[{form:'人物',name:'新守卫',evidence:'新守卫守约且不能离岗。',fields:{描述:'新守卫守约且不能离岗。'}}]}),{members:['人物／新守卫'],items:[{member:1,item:1,expression:'守约'},{member:1,item:2,expression:'不能离岗'}]}));
 const d=await f.service.createIdentityDraft({goal:'设计新守卫。',core:{book,id:core.id,version:core.version}});
 d.coreSource.data.traits.pop();d.proposal.coreMapping.members[0].items.pop();d.proposal.artifacts.base.changes[0].values.描述='新守卫守约。';
 const booksBefore=JSON.stringify([...f.saved]);let accepted=true,error=null;try{await f.service.saveIdentityDraft(d);}catch(e){accepted=false;error=e.message;}
 const after=await f.service.inspect(),actual=(await f.service.listCores(book)).find(x=>x.id===core.id);
 return {accepted,error,savedStateUnchanged:JSON.stringify([...f.saved])===booksBefore,storedCoreTraitCount:actual.traits.length,editedSnapshotTraitCount:d.coreSource.data.traits.length,savedNewDescription:after.origin.bases.find(r=>r.values.名称==='新守卫')?.values.描述};
});
await scenario('adaptation-binding-removed-from-editable-draft',async()=>{
 const f=fixture();f.c.name1='旁观用户';f.c.userAvatar='review-observer';f.c.powerUserSettings={personas:{'review-observer':'旁观用户'},persona_descriptions:{'review-observer':{description:'旁观者。'}},persona_description:'旁观者。'};await f.service.initialize();await initializeBase(f,[op('new:person','objects',{名称:'旧守门人',类型:'character',描述:'守约与不能离岗。'},'用户手动修改表单')]);const info=await f.service.inspect();
 f.responder(()=>simpleCoreAnswer({name:'守门核心',traits:[{name:'职责',value:'守约',evidence:'守约'},{name:'限制',value:'不能离岗',evidence:'不能离岗'}]}));const core=await f.service.saveCore(await f.service.coreDraft(info.rows[0].id));
 f.responder((task,input)=>simpleAdaptationAnswer(simpleGenesisAnswer(input,{name:'新人',decisions:['新守卫守约且不能离岗。'],records:[{form:'人物',name:'新守卫',evidence:'新守卫守约且不能离岗。',fields:{描述:'新守卫守约且不能离岗。'}}]}),{members:['人物／新守卫'],items:[{member:1,item:1,expression:'守约'},{member:1,item:2,expression:'不能离岗'}]}));
 const d=await f.service.adaptCore(info.settings.originBook,core.id);delete d.coreBinding;delete d.proposal.coreMapping;d.proposal.artifacts.base.changes[0].values.描述='新守卫守约。';
 const booksBefore=JSON.stringify([...f.saved]);let accepted=true,error=null;try{await f.service.saveGenesis(d);}catch(e){accepted=false;error=e.message;}const after=await f.service.inspect();
 return {accepted,error,savedStateUnchanged:JSON.stringify([...f.saved])===booksBefore,savedNewDescription:after.rows.find(r=>r.values.名称==='新守卫')?.values.描述,recordedAdaptations:after.origin.coreAdaptations?.length??0};
});

await scenario('editable-initialization-changes-native-user-permissions',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.userAvatar='review-user';f.c.name1='旅人';const original='原生完整定义：必须逐字保留。';f.c.powerUserSettings={personas:{'review-user':'旅人'},persona_descriptions:{'review-user':{description:original}},persona_description:original};
 await f.service.initialize();f.responder(()=>'【完成】\n1 状态：完成\n2 待处理：无\n3 补读记录：无');const d=await f.service.cardTemplate('card');const user=d.proposal.base.changes.find(x=>x.id===d.userObjectId),before=structuredClone(user.access);user.access={readers:[],knowers:[]};const booksBefore=JSON.stringify([...f.saved]);let accepted=true,error=null;try{await f.service.saveCardTemplate(d);}catch(e){accepted=false;error=e.message;}const after=await f.service.inspect();return {accepted,error,savedStateUnchanged:JSON.stringify([...f.saved])===booksBefore,beforeAccess:before,afterAccess:after.rows.find(r=>r.values.名称==='旅人')?.access};
});


for(const variant of ['unset','table-alias'])await scenario('editable-genesis-native-user-'+variant,async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.userAvatar='review-user';f.c.name1='旅人';const original='原生完整定义：必须逐字保留。';f.c.powerUserSettings={personas:{'review-user':'旅人'},persona_descriptions:{'review-user':{description:original}},persona_description:original};
 await f.service.initialize();f.responder(()=>'【完成】\n1 状态：完成\n2 待处理：无\n3 补读记录：无');await f.service.saveCardTemplate(await f.service.cardTemplate('card'));
 const before=await f.service.inspect(),native=before.rows.find(r=>r.id===before.session.personaBinding.objectId);f.responder((task,input)=>simpleGenesisAnswer(input,{name:'审计草稿'}));const d=await f.service.genesis('编辑后替代定义。');
 d.proposal.artifacts.base.changes.push({id:native.id,table:variant==='table-alias'?'常量档案':'objects',expected:native.rev,values:variant==='unset'?{}:{描述:'编辑后替代定义。'},...(variant==='unset'?{unset:['描述']}:{ }),access:native.access,evidence:'编辑后替代定义。'});
 const booksBefore=JSON.stringify([...f.saved]);let accepted=true,error=null;try{await f.service.saveGenesis(d);}catch(e){accepted=false;error=e.message;}const after=await f.service.inspect();return {accepted,error,savedStateUnchanged:JSON.stringify([...f.saved])===booksBefore,descriptionPresent:Object.hasOwn(after.rows.find(r=>r.id===native.id).values,'描述'),afterDescription:after.rows.find(r=>r.id===native.id).values.描述};
});
await scenario('no-persona-existing-records-genesis',async()=>{const f=fixture();await f.service.initialize();await initializeBase(f,[op('new:p','objects',{名称:'中性对象',类型:'character',描述:'旧定义'},'用户手动修改表单')]);f.responder((task,input)=>simpleGenesisAnswer(input,{name:'无用户'}));const savedBefore=JSON.stringify([...f.saved]),draft=await f.service.genesis('设计新地点。');return {success:!!draft.ticket,writesDuringDraft:JSON.stringify([...f.saved])!==savedBefore};});


await scenario('genesis-initial-form-overwrites-established-later-scene',async()=>{
 const f=fixture();await f.service.initialize();f.c.chat=[ai('暮色降临。'),user('继续')];f.responder(()=>({changes:[op('new:scene','scene',{名称:'现状',当前时间:'暮色'},'暮色降临。')]}));await f.service.archive();
 const before=await f.service.inspect(),scene=before.rows.find(r=>r.table==='scene');f.responder((task,input)=>simpleGenesisAnswer(input,{name:'城门设计',decisions:['新设计的开局是清晨。'],records:[{form:'场景与全局进度',name:'现状',evidence:'新设计的开局是清晨。',fields:{当前时间:'清晨'}}]}));
 const d=await f.service.genesis('设计一座新城门。');const booksBefore=JSON.stringify([...f.saved]);let accepted=true,error=null;try{await f.service.saveGenesis(d);}catch(e){accepted=false;error=e.message;}const after=await f.service.inspect(),current=after.rows.find(r=>r.id===scene.id);return {accepted,error,savedStateUnchanged:JSON.stringify([...f.saved])===booksBefore,beforeTime:scene.values.当前时间,beforeSourcePresent:!!scene.source,afterTime:current.values.当前时间,afterSource:current.source};
});


test('genesis cannot manufacture a continuous quote by joining independent card and native-user sources',()=>{
 const input={goal:'整理来源中的两位人物。',registry:defaultRegistry(),currentRows:[],sourceCard:'甲来自山城。',sourceUser:{name:'乙',description:'乙来自海港。'}},evidence='甲来自山城。\n\n乙来自海港。';
 const answer=simpleGenesisAnswer(input,{records:[{form:'人物',name:'甲',evidence,fields:{描述:'甲来自山城。'}}]});
 assert.throws(()=>parseSimpleGenesis(answer,prepareSimpleGenesis(input)),/连续原句|来源/);
});

for(const combined of [true,false])test('editable genesis evidence '+(combined?'cannot join card and user sources':'can quote exact original native-user text'),async()=>{
 const f=fixture();f.c.characters[0].description='原卡定义。';f.c.userAvatar='native-review';f.c.name1='旁观用户';
 const original='原生完整定义："引号"\r\n字面\\n。';f.c.powerUserSettings={personas:{'native-review':'旁观用户'},persona_descriptions:{'native-review':{description:original}},persona_description:original};
 await f.service.initialize();f.responder((task,input)=>simpleGenesisAnswer(input,{name:'来源核验'}));
 const d=await f.service.genesis('提取一项规则。'),evidence=combined?'原卡定义。\n\n'+original:original;
 d.proposal.artifacts.base.changes.push(op('new:rule','objects',{名称:'来源规则',类型:'rule',描述:'保留来源原文的约束。'},evidence));
 const before=JSON.stringify([...f.saved]);
 if(combined){await assert.rejects(f.service.saveGenesis(d),/原句|来源|依据/);assert.equal(JSON.stringify([...f.saved]),before);}
 else{await f.service.saveGenesis(d);assert.equal((await f.service.inspect()).rows.find(r=>r.values.名称==='来源规则').values.描述,'保留来源原文的约束。');assert.equal(f.c.powerUserSettings.persona_description,original);}
});

await scenario('initialization-source-envelope-stripped-to-bypass-native-user-guard',async()=>{
 const f=fixture();f.binding.primary='';f.binding.additional=[];f.c.userAvatar='review-user';f.c.name1='旅人';const original='原生完整定义：必须逐字保留。';f.c.powerUserSettings={personas:{'review-user':'旅人'},persona_descriptions:{'review-user':{description:original}},persona_description:original};
 await f.service.initialize();f.responder(()=>'【完成】\n1 状态：完成\n2 待处理：无\n3 补读记录：无');await f.service.saveCardTemplate(await f.service.cardTemplate('card'));
 const before=await f.service.inspect(),native=before.rows.find(r=>r.id===before.session.personaBinding.objectId),d=await f.service.cardTemplate('card'),userChange=d.proposal.base.changes.find(x=>x.id===d.userObjectId);
 d.mode='generic';d.userSource=null;d.userObjectId=null;d.sourceMaterials=null;d.rulePolicy=null;d.basis='替代原生完整定义。';userChange.values.描述='替代原生完整定义。';userChange.evidence=d.basis;userChange.access={readers:[],knowers:[]};
 const booksBefore=JSON.stringify([...f.saved]);let accepted=true,error=null;try{await f.service.saveCardTemplate(d);}catch(e){accepted=false;error=e.message;}const after=await f.service.inspect();return {accepted,error,savedStateUnchanged:JSON.stringify([...f.saved])===booksBefore,afterDescription:after.rows.find(r=>r.id===native.id).values.描述,afterAccess:after.rows.find(r=>r.id===native.id).access};
});

