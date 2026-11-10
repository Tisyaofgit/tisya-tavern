import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
const rawReply='<reply><task/><anchor phase="before"/><title>来源创建</title><body>1 世界方案。</body><anchor phase="after"/><extra/><cells>【世界／1】\n1 名称：世界</cells><vars/><archive/><actions/></reply>';
function fixture(){
 const r=new Runtime();r.registerTable('T_WORLD',[{key:'name',label:'名称',type:'TEXT'}],'世界');
 const c={chatId:'a',characterId:0,chatMetadata:{},chat:[],characters:[{avatar:'world.png',data:{name:'原卡',description:'不可飞行',mes_example:'示例不是历史',first_mes:'开场',alternate_greetings:['备选'],extensions:{world:'主书'},character_book:{entries:[{id:1,content:'卡内设定'},{id:2,content:'<% script %>'}]}}}],name1:'契约者',powerUserSettings:{persona_description:'契约者设定'}};
 let bindings={primary:'主书',additional:['副书','主书']},books={'主书':{entries:{1:{uid:1,comment:'主条目',content:'禁止魔法'}}},'副书':{entries:{2:{uid:2,comment:'停用',content:'停用设定',disable:true},3:{uid:3,content:'<% code %>'}}}},writes=[],inputs=[],onRequest=()=>{};
 c.loadWorldInfo=async name=>structuredClone(books[name]);
 const creator=createMatrixCreator({getContext:()=>c,getHelper:()=>undefined,readCharacterBindings:async()=>structuredClone(bindings),database:{read:async()=>({state:structuredClone(r.data),revision:0,contextKey:'a'}),commit:async p=>{writes.push(p);return p;}},request:async(_,input)=>{inputs.push(JSON.parse(input));await onRequest();return rawReply;}});
 return {creator,c,books,bindings,writes,inputs,set onRequest(fn){onRequest=fn;},draft:source=>creator.draft('请严格参照原始来源',{mode:'revise',source})};
}
test('creation includes complete native card, associated books and explicit core independently; saved receipt preserves raw immutable snapshot',async()=>{
 const f=fixture(),core={core:'显式核心',disabled:false},d=await f.draft(core),input=f.inputs[0];core.core='修改外部对象';
 assert.equal(input.source.core,'显式核心');assert.equal(input.nativeSources.card.fields.mes_example,'示例不是历史');assert.deepEqual(input.nativeSources.card.fields.alternate_greetings,['备选']);assert.equal(input.nativeSources.card.runtimeSources.length,1);
 assert.deepEqual(input.nativeSources.bindings,['主书','副书']);assert.equal(input.nativeSources.books[1].enabled,false);assert.equal(input.nativeSources.books[2].content,'');assert.equal(d.nativeSources.books[1].entries[1].content,'<% code %>');
 await f.creator.save(d);assert.equal(f.writes.length,1);assert.equal(f.writes[0].source.explicitSource.core,'显式核心');assert.deepEqual(f.writes[0].source.nativeSources,d.nativeSources);
});
for(const [name,mutate] of Object.entries({card:f=>f.c.characters[0].data.description='能飞行',book:f=>f.books['主书'].entries[1].content='允许魔法',binding:f=>f.bindings.additional=[],persona:f=>f.c.powerUserSettings.persona_description='changed'})){
 test('generation rejects '+name+' drift and retains original raw/draft without writes',async()=>{const f=fixture();f.onRequest=()=>mutate(f);await assert.rejects(f.draft(),e=>e.rawResponse===rawReply&&e.draft.nativeSources.card.data.description==='不可飞行'&&/已经变化/.test(e.message));assert.equal(f.writes.length,0);});
 test('save rejects '+name+' drift without replacing original snapshot',async()=>{const f=fixture(),d=await f.draft(),before=structuredClone(d.nativeSources);mutate(f);await assert.rejects(f.creator.save(d),/已经变化/);assert.deepEqual(d.nativeSources,before);assert.equal(f.writes.length,0);});
}
test('known missing book and source reader failure abort before model and commit',async()=>{const f=fixture();delete f.books['主书'];await assert.rejects(f.draft(),/不存在或损坏/);assert.equal(f.inputs.length,0);assert.equal(f.writes.length,0);f.c.loadWorldInfo=async()=>{throw Error('native load failed');};await assert.rejects(f.draft(),/native load failed/);});
test('chat switch during native read or model request cannot cross-write',async()=>{for(const stage of ['source','model']){const f=fixture();if(stage==='source')f.c.loadWorldInfo=async name=>{f.c.chatId='b';return f.books[name];};else f.onRequest=()=>{f.c.chatId='b';};await assert.rejects(f.draft(),/会话已切换/);assert.equal(f.writes.length,0);}});
test('empty host needs no worldbook API but an actual missing current card fails',async()=>{const f=fixture();delete f.c.loadWorldInfo;f.bindings.primary='';f.bindings.additional=[];delete f.c.characters[0].data.extensions.world;const d=await f.draft();assert.deepEqual(d.nativeSources.books,[]);delete f.c.characters[0];await assert.rejects(f.draft(),/源角色卡不存在/);});
test('editing original snapshot is rejected before commit',async()=>{const f=fixture(),d=await f.draft();d.nativeSources.card.data.description='forged';await assert.rejects(f.creator.save(d),/快照已改变/);assert.equal(f.writes.length,0);});

test('group creation without a current card keeps explicit sources and never guesses a member; group scope remains guarded',async()=>{
 const r=new Runtime();r.registerTable('T_WORLD',[{key:'name',label:'名称',type:'TEXT'}],'世界');
 const c={chatId:'group-chat',groupId:'group-a',chatMetadata:{},chat:[],characters:[{avatar:'member.png',data:{description:'not implicitly selected'}}]};
 let bindingReads=0,writes=0,switchDuringRequest=false,input;
 const creator=createMatrixCreator({getContext:()=>c,readCharacterBindings:async()=>{bindingReads++;throw Error('must not select a group member');},database:{read:async()=>({state:structuredClone(r.data),revision:0,contextKey:'group-chat'}),commit:async value=>{writes++;return value;}},request:async(_,raw)=>{input=JSON.parse(raw);if(switchDuringRequest)c.groupId='group-b';return rawReply;}});
 const explicit={core:'already selected core'},draft=await creator.draft('基于已有资料创作',{mode:'revise',source:explicit});
 assert.equal(bindingReads,0);assert.equal(input.nativeSources.card,null);assert.equal(draft.nativeSources.card,null);assert.deepEqual(input.source,explicit);assert.deepEqual(draft.source,explicit);await creator.save(draft);assert.equal(writes,1);
 switchDuringRequest=true;await assert.rejects(creator.draft('保持当前群聊',{mode:'revise',source:explicit}),/会话已切换/);assert.equal(bindingReads,0);assert.equal(writes,1);
});
