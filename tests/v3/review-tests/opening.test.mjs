import test from 'node:test';
import assert from 'node:assert/strict';
import {createArchiveService} from '../../../v3/archive-service.mjs';
import {createBookManager} from '../../../v3/books.mjs';
import {createOpeningService,resolveOpeningPlayer} from '../../../v3/opening-service.mjs';
import {createInitialState,projectRetained,tableRegistry} from '../../../v3/host-runtime.mjs';
import {digest} from '../../../tables/books.js';
import {sha256Utf16} from '../../../v3/host-runtime.mjs';
import {formatSimpleSheet} from '../../../tables/simple-sheet.js';
const copy=structuredClone,access={readers:['读者'],knowers:[]};
const row={id:'template:shop',table:'objects',rev:1,values:{名称:'修理铺',类型:'place',描述:'这家修理铺位于南街。'},access:copy(access),source:null,lockedFields:[]};
const opener='沈舟站在修理铺门口，身旁的阿禾负责记账。';
const op=(id,table,values,evidence)=>({id,table,expected:0,values,access:copy(access),evidence});
const response=()=>({templates:[],schemaChanges:[],base:{templates:[],changes:[op('new:he','objects',{名称:'阿禾',类型:'character',描述:'负责记账。'},'阿禾负责记账')]},initial:{templates:[],changes:[op('new:scene','scene',{名称:'开局',地点:'修理铺门口',参与者:['new:opening-user','new:he']},opener)]},notes:[]});
function fixture(request=async()=>response(),{template=true,sourceProvider}={}){
 let state=createInitialState({registry:tableRegistry,rows:template?[copy(row)]:[]}),writes=0,failAck=false,owner={chatId:'chat',branchId:'branch',bindingId:'archive',activeSourceKeys:[],currentSourceKey:null};
 const context={characterId:0,characters:[{avatar:'shop.png',data:{name:'南街修理铺',first_mes:'旧的未选开场。',alternate_greetings:['另一个未选开场。']}}],chat:[{is_user:false,mes:opener}],name1:'沈舟',userAvatar:'persona:zhou',powerUserSettings:{persona_description:'沈舟是一名年轻木匠。'}};
 const binding={player:{id:'persona:zhou',name:'沈舟'},initialRows:template?[copy(row)]:[],origin:{id:'origin'},core:{id:'core'}};
 const session={binding,getScope:()=>owner,guard:()=>{},sourceGuard:async()=>{},storage:{read:async()=>copy(state),compareAndWrite:async(expected,next)=>{assert.equal(state.revision,expected);state=copy(next);writes++;if(failAck){failAck=false;throw Error('acknowledgement lost');}}}};
 let calls=0,payload;const service=createOpeningService({getSession:async()=>session,getContext:()=>context,sourceProvider,requestTask:async(task,input,options)=>{calls++;assert.equal(task,'templateInit');payload=copy(input);return request(input,options);}});
 return {service,context,binding,session,state:()=>copy(state),setState:next=>state=next,writes:()=>writes,calls:()=>calls,payload:()=>payload,failAck:()=>failAck=true,switch:()=>owner={...owner,chatId:'other'}};
}
async function generate(f){const available=await f.service.inspect();return f.service.generate({openingId:available.selectedOpeningId,sourceStamp:available.sourceStamp});}

test('opening reads confirmed definitions and selected actual opener, creates exact user/team dossiers, then persists one opening without history writes',async()=>{
 const f=fixture(async()=>formatSimpleSheet(response())),available=await f.service.inspect();assert.equal(available.ready,true);assert.equal(available.selectedOpeningId,'chat:0');assert.equal(available.openings.length,1);assert.equal(available.canEstablish,true);assert.equal(f.writes(),0);
 const d=await generate(f);assert.equal(f.calls(),1);assert.equal(f.writes(),0);assert.equal(f.payload().phase,'opening');assert.equal(f.payload().sourceUser.objectId,'new:opening-user');assert.equal(f.payload().selectedOpening.text,opener);assert.equal(f.payload().sourceHistory,undefined);assert.deepEqual(f.payload().confirmedTemplate.rowIds,[row.id]);assert.equal(JSON.stringify(f.payload()).includes('未选开场'),false);assert.equal(d.changes[0].values.描述,'沈舟是一名年轻木匠。');assert.deepEqual(d.protectedIds,['new:opening-user']);
 const p=await f.service.preview(d),saved=await f.service.save(p);assert.equal(f.writes(),1);assert.equal(saved.bound,true);const view=projectRetained(f.state(),[]);assert.equal(view.rows.length,4);assert.equal(view.rows.find(r=>r.values.名称==='沈舟').id,saved.player.objectId);assert.equal(resolveOpeningPlayer(view,f.binding),saved.player.objectId);assert.equal(view.rows.find(r=>r.table==='scene').values.参与者[0],saved.player.objectId);assert.equal(view.rows.filter(r=>r.table==='events').length,0);assert.equal(f.context.chat[0].mes,opener);assert.equal(f.state().commits[0].source,null);assert.equal((await f.service.inspect()).alreadyEstablished,true);assert.equal((await f.service.save(p)).reused,true);assert.equal(f.writes(),1);await assert.rejects(generate(f),/已经建立/);
});

test('opening cannot run without confirmed template or over actual later progress',async()=>{
 const f=fixture(undefined,{template:false});assert.equal((await f.service.inspect()).canEstablish,false);await assert.rejects(generate(f),/先确认保存/);assert.equal(f.calls(),0);
 const g=fixture(),state=g.state();state.commits.push({id:'progress',kind:'archive',source:null,depends:null,changes:[],anchors:[]});state.revision++;g.setState(state);assert.equal((await g.service.inspect()).canEstablish,false);await assert.rejects(generate(g),/已有进度/);assert.equal(g.calls(),0);
});

test('opening accepts current-ledger confirmed initialization, not only origin definitions',async()=>{
 const f=fixture(undefined,{template:false}),state=f.state();state.commits.push({id:'initialization',kind:'manual',source:null,depends:null,changes:[{id:row.id,before:null,after:copy(row)}],anchors:[],design:{task:'extract',sourceHash:'card-source'}});state.revision++;f.setState(state);assert.equal((await f.service.inspect()).template.kind,'initialization');const d=await generate(f);await f.service.save(d);assert.equal(f.state().commits.length,2);
});

test('opening rejects forged/unselected evidence, model-made native player, events, deletion, schema changes, and overwriting confirmed fields',async()=>{
 const mutations=[r=>r.base.changes[0].evidence='另一个未选开场。',r=>r.base.changes.push(op('new:opening-user','objects',{名称:'沈舟',类型:'character'},opener)),r=>r.initial.changes.push(op('new:event','events',{名称:'后来事件'},opener)),r=>r.base.changes[0].delete=true,r=>r.templates.push({id:'new'}),r=>r.base.changes.push({id:row.id,table:'objects',expected:1,values:{描述:'原设定被换掉'},access:copy(access),evidence:opener})];
 for(const mutate of mutations){const f=fixture(async()=>{const r=response();mutate(r);return r;});await assert.rejects(generate(f));assert.equal(f.writes(),0);}
});

test('native user row cannot be unchecked or edited, dependency removal and forged edit evidence reject',async()=>{
 const f=fixture(),d=await generate(f);await assert.rejects(f.service.preview(d,{changes:d.changes.slice(1)}),/user/);const changed=copy(d.changes);changed[0].values.描述='篡改';await assert.rejects(f.service.save(d,{changes:changed}),/user/);await assert.rejects(f.service.preview(d,{changes:d.changes.filter(ch=>ch.id!=='new:he')}),/关联/);const forged=copy(d.changes);forged[1].evidence='不是原文';await assert.rejects(f.service.preview(d,{changes:forged}),/证据/);assert.equal(f.writes(),0);
});

test('changed opener/persona/templates or binding invalidate generation and pending save, without writes',async()=>{
 for(const mutate of [f=>f.context.chat[0].mes='开场被改动',f=>f.context.powerUserSettings.persona_description='新 user 人设',f=>f.binding.initialRows[0].values.描述='新模板',f=>f.switch()]){const f=fixture(),d=await generate(f);mutate(f);await assert.rejects(f.service.save(d),/改变/);assert.equal(f.writes(),0);}
 const g=fixture(async()=>{g.context.chat[0].mes='请求中换开场';return response();});await assert.rejects(generate(g),/生成期间/);assert.equal(g.writes(),0);
 const h=fixture(),p=await h.service.inspect();h.context.chat[0].mes='读取后换开场';await assert.rejects(h.service.generate({openingId:p.selectedOpeningId,sourceStamp:p.sourceStamp}),/刷新/);assert.equal(h.calls(),0);
});

test('lost save acknowledgement recovers same opening commit without rerunning model or duplicating user',async()=>{
 const f=fixture(),d=await generate(f);f.failAck();await assert.rejects(f.service.save(d),/acknowledgement/);assert.equal(f.writes(),1);const r=await f.service.save(d);assert.equal(f.writes(),1);assert.equal(f.calls(),1);assert.equal(f.state().commits.length,1);assert.equal(r.status,'saved');
});

test('cancelled opening stops before canonical changes',async()=>{
 let release;const f=fixture((input,{signal})=>new Promise(resolve=>release={resolve,signal})),job=generate(f);while(!release)await new Promise(resolve=>setImmediate(resolve));f.service.cancel();assert.equal(release.signal.aborted,true);release.resolve(response());await assert.rejects(job,{name:'AbortError'});assert.equal(f.writes(),0);
});

test('existing explicit player binding is reused without overwriting native persona or adding a second player',async()=>{
 const f=fixture(input=>{const r=response();r.initial.changes[0].values.参与者[0]=input.sourceUser.objectId;return r;}),player={id:'player:existing',table:'objects',rev:1,values:{名称:'沈舟',类型:'character',描述:'已确认的原点人设'},source:null,access:copy(access),lockedFields:[]};f.binding.player.objectId=player.id;f.binding.initialRows.push(player);const state=f.state();state.baseView.rows.push(copy(player));f.setState(state);const d=await generate(f);assert.equal(d.protectedIds.length,0);await f.service.save(d);const view=projectRetained(f.state(),[]);assert.equal(view.rows.filter(r=>r.values.名称==='沈舟').length,1);assert.equal(view.rows.find(r=>r.id===player.id).values.描述,'已确认的原点人设');assert.equal(resolveOpeningPlayer(view,f.binding),player.id);
});


test('an adopted native opening excludes alternative card greetings, while an empty chat offers explicit candidate sources',async()=>{
 const f=fixture(),available=await f.service.inspect();assert.deepEqual(available.openings.map(o=>o.id),['chat:0']);await assert.rejects(f.service.generate({openingId:'card:alternate:0'}),/选择实际开场/);assert.equal(f.calls(),0);f.context.chat=[];const empty=await f.service.inspect();assert.deepEqual(empty.openings.map(o=>o.id),['card:first','card:alternate:0']);assert.match(empty.sourceNote,/不写入或替换聊天正文/);
});

test('saved opening survives a new service instance and player reference never crosses persona selection',async()=>{
 const f=fixture(),d=await generate(f);await f.service.save(d);const reopened=createOpeningService({getSession:async()=>f.session,getContext:()=>f.context,requestTask:async()=>{throw Error('must not regenerate');}});assert.equal((await reopened.inspect()).alreadyEstablished,true);assert.equal((await reopened.inspect()).canEstablish,false);const view=projectRetained(f.state(),[]);assert(resolveOpeningPlayer(view,f.binding));assert.equal(resolveOpeningPlayer(view,{player:{id:'persona:other'}}),null);
});


test('confirmed native initialization rereads source-backed opening definitions and rejects changed card/worldbook before generation',async()=>{
 const raw={sourceCardRaw:{fields:{name:'南街修理铺'},entries:[]},sourceBooks:[{book:'配套',entry:'初始关系',uid:4,content:'开局时阿禾是沈舟的记账同伴。'}],sourceCard:'开局时阿禾是沈舟的记账同伴。'};let snapshot={...copy(raw),basis:{card:'v1',books:'v1'},definitionBasis:{identity:{cardId:'shop.png'},...copy(raw),names:['配套']}};
 const f=fixture(async input=>{assert.equal(input.sourceBooks[0].content,raw.sourceBooks[0].content);assert.equal(input.sourceSupplement,'开局时携带工具箱。');assert.equal(input.sourceCard,undefined);assert.deepEqual(input.confirmedTemplate.rowIds,[row.id]);const result=response();result.initial.changes.push(op('new:relation','relations',{名称:'开局同伴',主体:'new:he',对象:input.sourceUser.objectId,证据:raw.sourceBooks[0].content},raw.sourceBooks[0].content));return result;},{sourceProvider:{read:async()=>copy(snapshot)}});
 const state=f.state();state.commits.push({id:'init-native',kind:'manual',source:null,depends:null,changes:[],anchors:[],design:{task:'extract',sourceMode:'native',templateConfirmed:true,sourceHash:'source',definitionHash:await digest(snapshot.definitionBasis),sourceSupplement:'开局时携带工具箱。'}});state.revision++;f.setState(state);const d=await generate(f);assert(d.changes.some(ch=>ch.table==='relations'));await f.service.save(d);assert.equal(f.state().commits.at(-1).openingEstablishment.source.hash,await sha256Utf16(opener));
 const g=fixture(undefined,{sourceProvider:{read:async()=>copy(snapshot)}});g.setState(state);snapshot.definitionBasis.sourceBooks[0].content='关系已修改';await assert.rejects(generate(g),/配套世界书已改变/);assert.equal(g.calls(),0);assert.equal(g.writes(),0);
});

test('opening source freshness includes raw snapshot changes during a task, while a prior managed-book update does not invalidate confirmed definitions',async()=>{
 const definitionBasis={identity:{cardId:'shop.png'},sourceCardRaw:{fields:{description:'已确认定义'}},sourceBooks:[],names:[]};let rawRevision=2;const provider={read:async()=>({definitionBasis:copy(definitionBasis),basis:{revision:rawRevision},sourceCardRaw:copy(definitionBasis.sourceCardRaw),sourceBooks:[],sourceCard:'已确认定义'})};
 const f=fixture(undefined,{sourceProvider:provider}),state=f.state();state.commits.push({id:'init',kind:'manual',source:null,depends:null,changes:[],anchors:[],design:{task:'extract',sourceMode:'native',definitionHash:await digest(definitionBasis)}});state.revision++;f.setState(state);const d=await generate(f);assert.equal(f.calls(),1);rawRevision++;await assert.rejects(f.service.save(d),/草稿依据已改变/);assert.equal(f.writes(),0);
});


test('native initialization saved as a real origin definition retains source provenance for later opening establishment',async()=>{
 const documents=new Map();let serial=0;const manager=createBookManager({transport:{readFresh:async name=>copy(documents.get(name)??null),save:async(name,value)=>documents.set(name,copy(value)),createEntry:(name,data)=>{const uid=Object.keys(data.entries).length,wire={uid,extensions:{}};data.entries[uid]=wire;return wire;}},listNames:async()=>[...documents.keys()],getContext:()=>({owner:{chatId:'chat',branchId:'branch'},epoch:1}),assertIdle:()=>true,readMetadata:async()=>null,saveMetadata:async()=>{},uuid:()=>String(++serial)});
 const original='这家修理铺位于南街。',initial='开局时阿禾是沈舟的记账同伴。',snapshot={basis:{card:'same'},definitionBasis:{identity:{cardId:'shop.png'},sourceCardRaw:{fields:{description:original}},sourceBooks:[{book:'配套',entry:'初始关系',uid:1,content:initial}],names:['配套']},sourceCard:original+'\n'+initial,sourceCardRaw:{fields:{description:original}},sourceBooks:[{book:'配套',entry:'初始关系',uid:1,content:initial}],summary:{card:{id:'shop.png',name:'南街修理铺'},books:[{name:'配套'}]}};const sourceProvider={read:async()=>copy(snapshot),assertFresh:async()=>copy(snapshot)};
 const f=fixture(undefined,{template:false,sourceProvider}),archives=createArchiveService({getSession:async()=>f.session,sourceProvider,books:manager,requestTask:async()=>({templates:[],schemaChanges:[],base:{templates:[],changes:[op('new:shop','objects',copy(row.values),original)]},initial:{templates:[],changes:[]},notes:[]})}),origin=await manager.create({kind:'origin',name:'角色卡原点',operationId:'origin-create'});
 const draft=await archives.generateDesign({mode:'extract',sourceMode:'native',source:'开局时携带工具箱。',target:{kind:'origin',bookId:origin.id,expectedBookRevision:origin.revision,name:'已确认角色卡'}}),saved=await archives.saveDesign(draft),definition=await manager.readDefinition({bookId:origin.id,definitionId:saved.definition.definitionId,revision:1});assert.equal(f.writes(),0);assert.equal(definition.rows[0].designProvenance.definitionHash,await digest(snapshot.definitionBasis));assert.equal(definition.rows[0].designProvenance.sourceSupplement,'开局时携带工具箱。');
 f.binding.initialRows=copy(definition.rows);f.setState(createInitialState({registry:tableRegistry,rows:definition.rows}));const opening=createOpeningService({getSession:async()=>f.session,getContext:()=>f.context,sourceProvider,requestTask:async(task,input)=>{assert.equal(input.sourceBooks[0].content,initial);assert.equal(input.sourceSupplement,'开局时携带工具箱。');assert.deepEqual(input.confirmedTemplate.rowIds,definition.rows.map(r=>r.id));return response();}});const available=await opening.inspect();assert.equal(available.template.kind,'definitions');const d=await opening.generate({openingId:available.selectedOpeningId,sourceStamp:available.sourceStamp});await opening.save(d);assert.equal(f.writes(),1);assert.equal(projectRetained(f.state(),[]).rows.length,4);
});


test('mixed confirmed native definition versions fail explicitly rather than choosing the last row provenance',async()=>{
 const f=fixture();f.binding.initialRows[0].designProvenance={sourceMode:'native',definitionHash:'first',sourceSupplement:'第一版'};f.binding.initialRows.push({...copy(row),id:'another-definition',values:{...copy(row.values),名称:'北街铺'},designProvenance:{sourceMode:'native',definitionHash:'second',sourceSupplement:'第二版'}});await assert.rejects(f.service.inspect(),/不同角色卡资料版本/);assert.equal(f.calls(),0);assert.equal(f.writes(),0);
});
