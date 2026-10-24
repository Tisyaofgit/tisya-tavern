import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitializationSourceProvider} from '../../../v3/initialization-sources.mjs';
import {createArchiveService} from '../../../v3/archive-service.mjs';
import {tableRegistry,createInitialState,projectRetained} from '../../../v3/host-runtime.mjs';
import {digest} from '../../../tables/books.js';
const copy=structuredClone,access={readers:['读者'],knowers:[]};
const definition='温榆是一名守门人。',lore='银钥能够开启西侧小门。';
function fixture(request){
 const context={chatId:'chat',characterId:0,characters:[{avatar:'gate.png',name:'温榆',data:{name:'温榆',description:definition,first_mes:'开场白不可进入模板',mes_example:'示例不可进入模板',alternate_greetings:['备选不可进入模板'],extensions:{world:'门庭'},character_book:{entries:[{id:1,content:'内嵌法则',enabled:true},{id:2,content:'停用内嵌不可进入模板',enabled:false}]}}}],chat:[{mes:'历史不可进入模板'}],name1:'玩家',powerUserSettings:{persona_description:'玩家设定不可进入模板'}};
 const documents={'门庭':{entries:{0:{uid:0,comment:'钥匙',content:lore},1:{uid:1,comment:'停用',content:'停用书不可进入模板',disable:true},2:{uid:2,comment:'脚本',content:'<% throw Error("不要执行") %>'},3:{uid:3,comment:'data',content:'当前进度不可进入模板',extensions:{tisyaTableLedger:{}}}}}},names=['门庭'];
 let reads=0,writes=0,calls=0,input,state=createInitialState({registry:tableRegistry,rows:[]});
 const sourceProvider=createInitializationSourceProvider({getContext:()=>context,getLinkedWorldbookNames:async()=>copy(names),readWorldbook:async name=>{reads++;return copy(documents[name]);}});
 const owner={chatId:'chat',branchId:'branch',bindingId:'archive',activeSourceKeys:['user:1'],currentSourceKey:'user:1'};
 const session={storage:{read:async()=>copy(state),compareAndWrite:async(revision,next)=>{assert.equal(state.revision,revision);writes++;state=copy(next);}},getScope:()=>copy(owner),guard(){},async sourceGuard(){},binding:{initialRows:[]}};
 const proposal=()=>({schemaChanges:[],templates:[],base:{templates:[],changes:[{id:'new:keeper',table:'objects',expected:0,values:{名称:'温榆',类型:'character',描述:'守门人'},access:copy(access),evidence:definition}]},initial:{templates:[],changes:[]},notes:[]});
 const archives=createArchiveService({getSession:async()=>session,getContext:()=>context,sourceProvider,requestTask:async(task,payload,options)=>{calls++;input=copy(payload);assert.equal(task,'templateInit');return request?request({task,payload,options,proposal,context,documents}):proposal();}});
 return {archives,sourceProvider,context,documents,names,owner,proposal,state:()=>copy(state),writes:()=>writes,reads:()=>reads,calls:()=>calls,input:()=>copy(input)};
}
test('automatic initialization reads current card and linked books without paste, then saves only a confirmed reusable baseline',async()=>{
 const f=fixture(),summary=await f.archives.inspectDesignSources();assert.equal(summary.card.id,'gate.png');assert.deepEqual(summary.books,[{name:'门庭',entries:1,disabledEntries:1}]);assert.equal(summary.counts.disabled,2);assert.equal(f.calls(),0);assert.equal(f.writes(),0);
 const draft=await f.archives.generateDesign({mode:'extract',sourceToken:summary.token});assert.equal(f.calls(),1);assert.equal(draft.sourceMode,'native');assert.equal(draft.nextStep,'opening');assert.equal(f.input().phase,'definition');assert.equal(f.input().sourceCardRaw.fields.description,definition);assert.equal(f.input().sourceBooks[0].content,lore);assert.equal(f.writes(),0);
 const payload=JSON.stringify(f.input());for(const text of ['开场白不可进入模板','示例不可进入模板','备选不可进入模板','停用内嵌不可进入模板','历史不可进入模板','玩家设定不可进入模板','停用书不可进入模板','不要执行','当前进度不可进入模板'])assert.equal(payload.includes(text),false,text);
 await f.archives.saveDesign(draft);assert.equal(f.writes(),1);const commit=f.state().commits[0];assert.equal(commit.design.templateConfirmed,true);assert.equal(commit.design.sourceMode,'native');assert.equal(commit.source,null);assert.equal(commit.contextSource,null);assert.equal(projectRetained(f.state(),[]).rows[0].values.名称,'温榆');assert.equal(JSON.stringify(f.state()).includes('银钥能够'),false);
 assert.equal((await f.archives.saveDesign(draft)).reused,true);assert.equal(f.writes(),1);
});
test('initialization holds separate initial-state candidates visibly and never silently writes them during definition save',async()=>{
 const f=fixture(({proposal})=>{const result=proposal();result.initial.changes=[{id:'new:state',table:'state',expected:0,values:{名称:'职务',对象:'new:keeper',字段:'职务',值:'守门人'},access:copy(access),evidence:definition}];return result;});
 const draft=await f.archives.generateDesign({mode:'extract'});assert.equal(draft.changes.length,1);assert.equal(draft.initialCandidates.length,1);assert.match(draft.notes.join('\n'),/开局候选.*尚未保存/);await f.archives.saveDesign(draft);assert.deepEqual(projectRetained(f.state(),[]).rows.map(row=>row.table),['objects']);
});
test('native source changes before generation, after response, and before confirmation fail without fallback or writes',async()=>{
 const before=fixture(),summary=await before.archives.inspectDesignSources();before.documents['门庭'].entries[0].content+='已修改';await assert.rejects(before.archives.generateDesign({mode:'extract',sourceToken:summary.token}),/已改变/);assert.equal(before.calls(),0);assert.equal(before.writes(),0);
 const during=fixture(({proposal,context})=>{context.characters[0].data.description+='已修改';return proposal();});await assert.rejects(during.archives.generateDesign({mode:'extract'}),/已改变/);assert.equal(during.calls(),1);assert.equal(during.writes(),0);
 const after=fixture(),draft=await after.archives.generateDesign({mode:'extract'});after.names.push('新增绑定');after.documents['新增绑定']={entries:{}};await assert.rejects(after.archives.saveDesign(draft),/已改变/);assert.equal(after.writes(),0);
});
test('a read failure cannot turn automatic initialization into manual or incomplete success',async()=>{
 const f=fixture();delete f.documents['门庭'];await assert.rejects(f.archives.generateDesign({mode:'extract',source:'可用的手填补充'}),/无法完整读取/);assert.equal(f.calls(),0);assert.equal(f.writes(),0);
 const readCount=f.reads(),manual=await f.archives.generateDesign({mode:'extract',sourceMode:'manual',source:definition});assert.equal(manual.sourceMode,'manual');assert.equal(f.reads(),readCount);assert.equal(f.input().sourceCard,definition);assert.equal(f.input().sourceBooks,undefined);assert.equal(f.input().phase,undefined);assert.equal(f.calls(),1);await f.archives.saveDesign(manual);assert.equal(f.state().commits[0].design.templateConfirmed,undefined);
});
test('source ownership, disabled state, and cancellation are checked at actual read boundaries',async()=>{
 const f=fixture(),summary=await f.archives.inspectDesignSources();f.owner.bindingId='other';await assert.rejects(f.archives.generateDesign({mode:'extract',sourceToken:summary.token}),/另一存档/);assert.equal(f.calls(),0);
 const g=fixture(),snapshot=await g.sourceProvider.read();g.documents['门庭'].entries[1].disable=false;await assert.rejects(g.sourceProvider.assertFresh(snapshot),/已改变/);
 const controller=new AbortController();controller.abort();await assert.rejects(g.sourceProvider.read({signal:controller.signal}),{name:'AbortError'});
});
test('archive prefixes classify genuine material; only a verified generated projection loses initialization authority',async()=>{
 const f=fixture(),entries=f.documents['门庭'].entries;
 for(const [uid,name]of [[4,'【原点】初始档案'],[5,'【基点】核心版本'],[6,'【存档】旧事'],[7,'【图鉴】植物']])entries[uid]={uid,comment:name,content:'来源正文 '+uid};
 const read=await f.sourceProvider.read();assert.deepEqual(read.sourceBooks.slice(1).map(source=>[source.entry,source.archiveRole]),[['【原点】初始档案','origin'],['【基点】核心版本','core'],['【存档】旧事','session'],['【图鉴】植物','atlas']]);
 entries[8]={uid:8,comment:'缇斯亚 · 表单数据',disable:true,content:JSON.stringify({format:'tisya.tables/1',kind:'origin',revision:1,archiveView:{}})};
 const generated=await f.sourceProvider.read();assert.equal(generated.sourceBooks.some(source=>source.entry==='【原点】初始档案'),false);assert.equal(generated.sourceBooks.some(source=>source.entry==='【基点】核心版本'),false);assert.equal(generated.sourceBooks.some(source=>source.entry==='【存档】旧事'),true);assert.equal(generated.sourceBooks.some(source=>source.entry==='【图鉴】植物'),true);
 entries[8].content='{invalid';await assert.rejects(f.sourceProvider.read(),/旧表单数据已损坏/);
});
test('native initialization retains a source fingerprint and exact supplement for the separate opening stage',async()=>{
 const f=fixture(),snapshot=await f.sourceProvider.read(),supplement='开局时西门尚未开启。',draft=await f.archives.generateDesign({mode:'extract',source:supplement});assert.equal(f.input().sourceSupplement,supplement);await f.archives.saveDesign(draft);const receipt=f.state().commits[0].design;assert.equal(receipt.definitionHash,await digest(snapshot.definitionBasis));assert.equal(receipt.sourceSupplement,supplement);
 const reordered=copy(f.context.characters[0]);f.context.characters[0]=Object.fromEntries(Object.entries(reordered).reverse());assert.equal(await digest((await f.sourceProvider.read()).definitionBasis),receipt.definitionHash);
});
test('saving a managed ledger in a linked book does not change the effective confirmed card definition',async()=>{
 const f=fixture(),draft=await f.archives.generateDesign({mode:'extract'});await f.archives.saveDesign(draft);const fingerprint=f.state().commits[0].design.definitionHash,before=await f.sourceProvider.read();
 f.documents['门庭'].entries[3].content=JSON.stringify(f.state());const after=await f.sourceProvider.read();assert.notDeepEqual(before.basis,after.basis);assert.deepEqual(before.definitionBasis,after.definitionBasis);assert.equal(await digest(after.definitionBasis),fingerprint);
 f.context.chatId='another-chat';assert.equal(await digest((await f.sourceProvider.read()).definitionBasis),fingerprint);
 f.documents['门庭'].entries[1].disable=false;assert.notEqual(await digest((await f.sourceProvider.read()).definitionBasis),fingerprint);
});
