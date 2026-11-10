import test from 'node:test';import assert from 'node:assert/strict';
import {createIdentityService} from '../user-identity-service.js';
test('failed new-slot creation does not block unrelated existing identities or pretend an active binding is pending',async()=>{
 const c={chatId:'one',characterId:0,characters:[{avatar:'world'}],chatMetadata:{},powerUserSettings:{personas:{old:'原人物',other:'另一人物'},persona_descriptions:{old:{description:'旧档'},other:{description:'另一档'}}}};let active='old';
 const api=createIdentityService({getContext:()=>c,getAvatar:()=>active,applyActive:id=>active=id,persistSettings:async()=>true,persistChat:async()=>true,resolveOrigin:async ref=>({name:'新人物',description:'新档',reference:ref}),slotHost:{ensureAvatar:async()=>{throw Error('upload failed')},initialize:async()=>{}}});
 await assert.rejects(api.createFromOrigin({book:'book',originId:'origin',id:'person',rev:1}),/upload failed/);assert.equal(api.hasPending(),false);assert.equal(api.hasCreationPending(),true);await api.select({id:'other',revision:api.read().revision});assert.equal(active,'other');assert.equal(c.powerUserSettings.persona_descriptions.old.description,'旧档');
});
function fixture(overrides={}){const c={chatId:'one',characterId:0,groupId:null,name1:'甲',characters:[{avatar:'card.png'}],chatMetadata:{vendor:false},chat:[{name:'旧名',is_user:true,mes:'旧消息'}],powerUserSettings:{personas:{'a.png':'甲','b.png':'乙'},persona_descriptions:{'a.png':{description:'甲设定',connections:[{type:'character',id:'card.png'},{type:'character',id:'other.png'}],unknown:{zero:0,flag:false,empty:''}},'b.png':{description:'乙设定',vendor:42}},default_persona:'a.png',persona_allow_multi_connections:false}};let avatar='a.png',writes=[];const options={getContext:()=>c,getAvatar:()=>avatar,applyActive:(id,name)=>{avatar=id;c.name1=name},persistSettings:async()=>{writes.push('settings');return true},persistChat:async()=>{writes.push('chat');return true},...overrides};return {c,writes,options,api:createIdentityService(options),avatar:()=>avatar};}
test('selection binds chat and stable card id while preserving history, defaults and unknown values',async()=>{const f=fixture(),history=structuredClone(f.c.chat);await f.api.select({id:'b.png',revision:f.api.read().revision,chat:true,character:true});assert.equal(f.avatar(),'b.png');assert.equal(f.c.chatMetadata.persona,'b.png');assert.equal(f.c.powerUserSettings.default_persona,'a.png');assert.deepEqual(f.c.chat,history);assert.deepEqual(f.c.powerUserSettings.persona_descriptions['a.png'].connections,[{type:'character',id:'other.png'}]);assert.deepEqual(f.c.powerUserSettings.persona_descriptions['a.png'].unknown,{zero:0,flag:false,empty:''});assert.equal(f.c.chatMetadata.vendor,false);assert.equal(f.api.hasPending(),false);assert.deepEqual(f.writes,['settings','chat','settings']);});
test('group selection binds only the group and keeps multi connection alternatives',async()=>{const f=fixture();f.c.groupId=42;f.c.powerUserSettings.persona_allow_multi_connections=true;await f.api.select({id:'b.png',revision:f.api.read().revision,chat:true,character:true});assert.deepEqual(f.c.powerUserSettings.persona_descriptions['b.png'].connections,[{type:'group',id:42}]);assert.equal(f.c.powerUserSettings.persona_descriptions['a.png'].connections.length,2);});
test('selection without scope does not lock chat or alter global default',async()=>{const f=fixture();await f.api.select({id:'b.png',revision:f.api.read().revision});assert.equal(f.c.chatMetadata.persona,undefined);assert.equal(f.c.powerUserSettings.default_persona,'a.png');assert.deepEqual(f.writes,['settings','settings']);});
test('stale identity state and absent chat reject before mutation',async()=>{const f=fixture(),old=f.api.read().revision;f.c.powerUserSettings.personas['b.png']='另名';await assert.rejects(f.api.select({id:'b.png',revision:old,chat:true}),/已变化/);f.c.chatId=null;await assert.rejects(f.api.select({id:'b.png',revision:f.api.read().revision,chat:true}),/没有当前聊天/);assert.equal(f.writes.length,0);});
test('failed chat persistence leaves a durable intent that a recreated service resumes',async()=>{let fail=true;const f=fixture({persistChat:async()=>!fail});await assert.rejects(f.api.select({id:'b.png',revision:f.api.read().revision,chat:true,character:true}),/尚未确认/);assert(f.c.powerUserSettings.tisya_identity_pending);const recovered=createIdentityService(f.options);await assert.rejects(recovered.select({id:'a.png',revision:recovered.read().revision}),/先继续核对/);fail=false;await recovered.resume();assert.equal(f.c.chatMetadata.persona,'b.png');assert.equal(recovered.hasPending(),false);});
test('a context switch during settings save cannot lock the new chat',async()=>{const f=fixture();f.options.persistSettings=async()=>{f.c.chatId='two';f.c.chatMetadata={persona:'a.png'};return true};const api=createIdentityService(f.options);await assert.rejects(api.select({id:'b.png',revision:api.read().revision,chat:true}),/会话已改变/);assert.equal(f.c.chatMetadata.persona,'a.png');assert.equal(f.writes.length,0);await assert.rejects(api.resume(),/会话已改变/);});
test('resume refuses later persona edits and preserves the recovery marker',async()=>{let fail=true;const f=fixture({persistChat:async()=>!fail});await assert.rejects(f.api.select({id:'b.png',revision:f.api.read().revision,chat:true}));f.c.powerUserSettings.persona_descriptions['b.png'].description='外部改稿';fail=false;await assert.rejects(f.api.resume(),/另行修改/);assert(f.api.hasPending());});
test('profile editing keeps all descriptor extensions and validates stale drafts',async()=>{const f=fixture(),revision=f.api.read().revision;await f.api.saveProfile({id:'a.png',revision,name:'新甲',description:''});assert.equal(f.c.powerUserSettings.persona_descriptions['a.png'].description,'');assert.deepEqual(f.c.powerUserSettings.persona_descriptions['a.png'].unknown,{zero:0,flag:false,empty:''});await assert.rejects(f.api.saveProfile({id:'a.png',revision,name:'旧稿',description:'旧'}),/已变化/);});

test('archive binding failure retains intent and resumes with the same active identity',async()=>{let fail=true,calls=[];const f=fixture({afterSelect:async id=>{calls.push(id);if(fail)throw Error('档案写入失败')}});await assert.rejects(f.api.select({id:'b.png',revision:f.api.read().revision,chat:false}),/档案写入失败/);assert(f.api.hasPending());assert.equal(f.c.chatMetadata.persona,undefined);fail=false;await createIdentityService(f.options).resume();assert.deepEqual(calls,['b.png','b.png']);assert.equal(f.api.hasPending(),false);});

function profileFixture(persist){
 const f=fixture(),apply=f.options.applyActive;
 f.c.powerUserSettings.persona_description='甲设定';
 f.options.applyActive=(id,name)=>{apply(id,name);f.c.powerUserSettings.persona_description=f.c.powerUserSettings.persona_descriptions?.[id]?.description??'';};
 f.options.persistSettings=()=>persist(f);
 f.api=createIdentityService(f.options);return f;
}
test('unconfirmed profile persistence restores its own native fields and preserves the original error',async()=>{
 const failure=Error('profile disk failed'),f=profileFixture(()=>{throw failure;}),before=structuredClone(f.c),revision=f.api.read().revision;
 await assert.rejects(f.api.saveProfile({id:'a.png',revision,name:'未存新名',description:'未存新设定'}),error=>error===failure);
 assert.deepEqual(f.c,before);assert.equal(f.api.read().revision,revision);assert.equal(f.api.isBusy(),false);
});
test('a false profile persistence receipt remains a failure even if fields already match the draft',async()=>{
 const f=profileFixture(()=>false),revision=f.api.read().revision;
 await assert.rejects(f.api.saveProfile({id:'a.png',revision,name:'甲',description:'甲设定'}),/未确认/);
 assert.equal(f.c.name1,'甲');assert.equal(f.c.powerUserSettings.persona_description,'甲设定');assert.equal(f.api.isBusy(),false);
});
test('failed profile rollback preserves concurrent values and new descriptor metadata',async()=>{
 const failure=Error('profile save interrupted'),f=profileFixture(f=>{
  const p=f.c.powerUserSettings;p.personas['a.png']='别处改名';p.persona_descriptions['a.png'].description='别处设定';p.persona_descriptions['a.png'].later={kept:true};p.persona_description='别处当前描述';f.c.name1='别处显示名';throw failure;
 });
 await assert.rejects(f.api.saveProfile({id:'a.png',revision:f.api.read().revision,name:'本页新名',description:'本页新设定'}),error=>error===failure);
 const p=f.c.powerUserSettings;assert.equal(p.personas['a.png'],'别处改名');assert.equal(p.persona_descriptions['a.png'].description,'别处设定');assert.deepEqual(p.persona_descriptions['a.png'].later,{kept:true});assert.equal(p.persona_description,'别处当前描述');assert.equal(f.c.name1,'别处显示名');
});
test('failed profile rollback removes only its own fields while preserving unrelated concurrent metadata',async()=>{
 const f=profileFixture(f=>{f.c.powerUserSettings.persona_descriptions['a.png'].later=0;return false;});
 await assert.rejects(f.api.saveProfile({id:'a.png',revision:f.api.read().revision,name:'本页新名',description:'本页新设定'}),/未确认/);
 const p=f.c.powerUserSettings;assert.equal(p.personas['a.png'],'甲');assert.equal(p.persona_descriptions['a.png'].description,'甲设定');assert.equal(p.persona_descriptions['a.png'].later,0);assert.equal(f.c.name1,'甲');assert.equal(p.persona_description,'甲设定');
});
test('confirmed profile persistence survives a chat switch and reports the saved original scope',async()=>{
 const f=profileFixture(f=>{f.c.chatId='two';f.c.chatMetadata={persona:'b.png'};return true;});
 await assert.rejects(f.api.saveProfile({id:'a.png',revision:f.api.read().revision,name:'已存新名',description:'已存新设定'}),error=>{
  assert.match(error.message,/已确认保存/);assert.deepEqual(error.receipt,{kind:'profile',id:'a.png',scope:{chatId:'one',characterAvatar:'card.png',groupId:null},confirmed:true});return true;
 });
 const p=f.c.powerUserSettings;assert.equal(p.personas['a.png'],'已存新名');assert.equal(p.persona_descriptions['a.png'].description,'已存新设定');assert.equal(p.persona_description,'已存新设定');assert.deepEqual(f.c.chatMetadata,{persona:'b.png'});
});
test('confirmed wish persistence is not rolled back when the chat changes after the write',async()=>{
 const f=profileFixture(f=>{f.c.chatId='two';return true;});
 await assert.rejects(f.api.saveWish({revision:f.api.read().revision,description:'已存心愿'}),error=>{
  assert.match(error.message,/已确认保存/);assert.deepEqual(error.receipt,{kind:'wish',id:'a.png',scope:{chatId:'one',characterAvatar:'card.png',groupId:null},confirmed:true});return true;
 });
 assert.equal(f.c.powerUserSettings.persona_description,'已存心愿');assert.equal(f.c.powerUserSettings.persona_descriptions['a.png'].description,'已存心愿');
});
test('failed wish rollback preserves a concurrent active description and descriptor replacement',async()=>{
 const failure=Error('wish disk failed'),f=profileFixture(f=>{const p=f.c.powerUserSettings;p.persona_description='外部当前心愿';p.persona_descriptions['a.png']={description:'外部新档案',kept:false};throw failure;});
 await assert.rejects(f.api.saveWish({revision:f.api.read().revision,description:'本页心愿'}),error=>error===failure);
 assert.equal(f.c.powerUserSettings.persona_description,'外部当前心愿');assert.deepEqual(f.c.powerUserSettings.persona_descriptions['a.png'],{description:'外部新档案',kept:false});
});
test('unconfirmed wish persistence restores exact absent fields and remains retryable',async()=>{
 const f=fixture({persistSettings:async()=>false});delete f.c.powerUserSettings.persona_descriptions['a.png'].description;const revision=f.api.read().revision;
 await assert.rejects(f.api.saveWish({revision,description:'未存心愿'}),/未确认/);
 assert.equal(Object.hasOwn(f.c.powerUserSettings,'persona_description'),false);assert.equal(Object.hasOwn(f.c.powerUserSettings.persona_descriptions['a.png'],'description'),false);assert.equal(f.api.read().revision,revision);assert.equal(f.api.isBusy(),false);
});
test('failed profile persistence restores absent or null native descriptor containers exactly',async()=>{
 for(const initial of ['absent','null-map','null-descriptor']){
  const f=profileFixture(()=>false),p=f.c.powerUserSettings;delete p.persona_description;
  if(initial==='absent')delete p.persona_descriptions;else if(initial==='null-map')p.persona_descriptions=null;else p.persona_descriptions['a.png']=null;
  const before=structuredClone(f.c),revision=f.api.read().revision;
  await assert.rejects(f.api.saveProfile({id:'a.png',revision,name:'未存新名',description:'未存设定'}),/未确认/);
  assert.deepEqual(f.c,before);assert.equal(f.api.read().revision,revision);
 }
});
test('a failed wish save never restores the previous persona description into a different active identity',async()=>{
 const f=profileFixture(f=>{f.options.applyActive('b.png','乙');f.c.powerUserSettings.persona_description='恰好同文';return false;});
 await assert.rejects(f.api.saveWish({revision:f.api.read().revision,description:'恰好同文'}),/未确认/);
 assert.equal(f.avatar(),'b.png');assert.equal(f.c.powerUserSettings.persona_description,'恰好同文');assert.equal(f.c.powerUserSettings.persona_descriptions['a.png'].description,'甲设定');
});
test('a native projection rollback failure reports both failures without hiding the persistence error',async()=>{
 const failure=Error('original persistence failure'),rollback=Error('native display failure'),f=profileFixture(()=>{throw failure;}),apply=f.options.applyActive;let calls=0;
 f.options.applyActive=(...args)=>{if(++calls===2)throw rollback;apply(...args);};f.api=createIdentityService(f.options);
 await assert.rejects(f.api.saveProfile({id:'a.png',revision:f.api.read().revision,name:'未存名字',description:'未存设定'}),error=>{assert(error instanceof AggregateError);assert.deepEqual(error.errors,[failure,rollback]);assert.equal(error.cause,failure);assert.match(error.message,/original persistence failure.*native display failure/);return true;});
 assert.equal(f.c.powerUserSettings.personas['a.png'],'甲');assert.equal(f.c.powerUserSettings.persona_descriptions['a.png'].description,'甲设定');assert.equal(f.api.isBusy(),false);
});
