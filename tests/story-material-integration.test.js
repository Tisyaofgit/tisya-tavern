import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/condition-service-host.js';
import {storyRecord} from '../tables/story-material.js';
import {defaultRegistry} from '../tables/schema.js';

async function ready(injection='direct'){
 const f=await fixture(),config=f.store.read();
 config.world.tables={...config.world.tables,enabled:true,archive:false,preferences:false,plot:false,offstage:false,styleEnabled:false,injection,topK:8};
 await f.store.save(config.data,config.revision,config.key);
 f.context.eventTypes={WORLDINFO_ENTRIES_LOADED:'loaded',WORLD_INFO_ACTIVATED:'active'};
 return f;
}
const access={readers:['读者'],knowers:[]};

test('direct service history keeps participant and knower names without copying their complete dossiers',async()=>{
 const f=await ready();
 await f.service.edit({changes:[{id:'new:event',table:'events',expected:0,values:{名称:'门前旧约',参与者:[f.owner],经过:'在门前交换信件'},access:{readers:['读者'],knowers:[f.owner]},evidence:'用户手动修改表单'}]});
 f.context.chat.push({is_user:true,mes:'回忆门前旧约'});
 const prepared=await f.service.prepare();
 const archive=prepared.slots.archive.narrativeText;
 assert.match(archive,/参与者：方鹿/);assert.match(archive,/已知情人物：方鹿/);
 assert(!archive.includes('<StaticAtlas>'));assert(!archive.includes('未提供的关联对象'));
});

test('direct service does not restore a conditionally omitted native reference through global snapshots',async()=>{
 const f=await ready(),owner=(await f.service.inspect()).rows.find(r=>r.id===f.owner);
 await f.service.edit({schemaChanges:[{kind:'type',id:'character',fields:{秘密:{type:'object',fields:{原生引用:{type:'text'}},include:{op:'not',arg:{op:'always'}}}}}],changes:[{id:owner.id,table:'objects',expected:owner.rev,values:{属性:{秘密:{原生引用:'/privateField'}}},access,evidence:'用户手动修改表单'}]});
 f.context.chat.push({is_user:true,mes:'方鹿现在怎样？'});
 const previous=globalThis.Mvu;globalThis.Mvu={getMvuData:()=>({stat_data:{privateField:'OMITTED_NATIVE_VALUE'}})};
 try{const prepared=await f.service.prepare();assert(prepared.assembly.omitted.some(item=>item.fields.includes('属性.秘密')));assert(!prepared.text.includes('OMITTED_NATIVE_VALUE'));assert(!prepared.text.includes('/privateField'));}finally{globalThis.Mvu=previous;}
});

test('worldbook service activates only requested record body while preserving user/focus groups',async()=>{
 const f=await ready('worldbook'),config=f.store.read();config.world.tables.focusObjects=[f.owner];await f.store.save(config.data,config.revision,config.key);
 const other=(await f.service.inspect()).rows.find(r=>r.id===f.other);
 await f.service.edit({changes:[{id:other.id,table:'objects',expected:other.rev,values:{描述:'UNSELECTED_OTHER_DOSSIER'},access,evidence:'用户手动修改表单'}]});
 f.context.chat.push({is_user:true,mes:'方鹿回应。'});
 await f.service.prepare();const payload={chatLore:[]};f.service.worldbook.entriesLoaded(payload);
 const selected=payload.chatLore.find(e=>e.tisyaTable.id===f.owner);assert(selected);f.service.worldbook.activated([selected]);
 const text=f.service.worldbook.selectedText();assert.match(text,/<FollowedCharacters>/);assert(!text.includes('UNSELECTED_OTHER_DOSSIER'));assert(!text.includes('private-source'));
});

test('nested native references do not become technical path prose',()=>{
 const row={id:'r',table:'relations',rev:9,source:'source-key',values:{名称:'交情',主体:'a',对象:'b',好感:{正面:{原生引用:'/characters/a/relation/b',依据:[]}}},access};
 const text=storyRecord(row,{rows:[row,{id:'a',values:{名称:'方鹿'}},{id:'b',values:{名称:'阿禾'}}],registry:defaultRegistry()});
 assert(!text.includes('/characters/a/relation/b'));assert(!text.includes('source-key'));assert.match(text,/主体：方鹿/);
});


test('configured offstage focus recalls current dynamics through existing conditions without assigning scene knowledge',async()=>{
 const f=await ready(),cfg=f.store.read();cfg.world.tables.focusObjects=[f.owner];cfg.world.tables.topK=0;await f.store.save(cfg.data,cfg.revision,cfg.key);
 await f.service.edit({schemaChanges:[{kind:'table',id:'activities',fields:{秘密:{type:'text',include:{op:'not',arg:{op:'always'}}}}}],changes:[
  {id:'new:activity',table:'activities',expected:0,values:{名称:'看守北门',主体:f.owner,行动:'FOCUSED_CURRENT_ACTION',状态:'进行',秘密:'OMITTED_PRIVATE_FIELD'},access:{readers:[],knowers:[f.owner]},evidence:'用户手动修改表单'},
  {id:'new:other-activity',table:'activities',expected:0,values:{名称:'休憩',主体:f.other,行动:'UNRELATED_ACTION',状态:'进行'},access,evidence:'用户手动修改表单'}
 ]});
 f.context.chat.push({is_user:true,mes:'继续眼前的场景'});
 const before=(await f.service.inspect()).rows,result=await f.service.prepare(),after=(await f.service.inspect()).rows;
 assert.match(result.slots.progression.narrativeText,/关注对象当前动态/);assert.match(result.slots.state.narrativeText,/FOCUSED_CURRENT_ACTION/);
 assert.doesNotMatch(result.text,/UNRELATED_ACTION|OMITTED_PRIVATE_FIELD/);assert.match(result.slots.state.narrativeText,/读者可见范围：不向读者展示/);
 assert.deepEqual(after,before);assert.equal((result.text.match(/FOCUSED_CURRENT_ACTION/g)||[]).length,1);
});

test('direct service assigns one shared clue body and event reference across material slots',async()=>{
 const f=await ready();await f.service.edit({changes:[
  {id:'new:event',table:'events',expected:0,values:{名称:'旧钥匙',经过:'EVENT_DETAIL'},access,evidence:'用户手动修改表单'},
  {id:'new:clue',table:'clues',expected:0,values:{名称:'钥匙的归属',已出现内容:'CLUE_DETAIL',事件:['new:event']},access,evidence:'用户手动修改表单'}
 ]});f.context.chat.push({is_user:true,mes:'回忆旧钥匙'});const result=await f.service.prepare();
 assert.match(result.slots.archive.narrativeText,/伏笔：F01/);assert.match(result.slots.foreshadow.narrativeText,/F01 钥匙的归属/);assert.match(result.slots.foreshadow.narrativeText,/事件：E01/);
 assert.equal((result.text.match(/CLUE_DETAIL/g)||[]).length,1);
});

test('activated worldbook set recomputes references without resurrecting unselected bodies',async()=>{
 const f=await ready('worldbook');await f.service.edit({changes:[
  {id:'new:event',table:'events',expected:0,values:{名称:'巷口旧事',经过:'SELECTED_EVENT'},access,evidence:'用户手动修改表单'},
  {id:'new:clue',table:'clues',expected:0,values:{名称:'未送达的信',已出现内容:'UNSELECTED_CLUE',事件:['new:event']},access,evidence:'用户手动修改表单'}
 ]});f.context.chat.push({is_user:true,mes:'回忆巷口旧事'});await f.service.prepare();const payload={chatLore:[]};f.service.worldbook.entriesLoaded(payload);const event=payload.chatLore.find(e=>e.comment==='巷口旧事'),clue=payload.chatLore.find(e=>e.comment==='未送达的信');
 f.service.worldbook.activated([event,event]);let text=f.service.worldbook.selectedText();assert.doesNotMatch(text,/F01|UNSELECTED_CLUE/);assert.equal((text.match(/SELECTED_EVENT/g)||[]).length,1);
 f.service.worldbook.activated([event,clue]);text=f.service.worldbook.selectedText();assert.match(text,/伏笔：F01/);assert.equal((text.match(/UNSELECTED_CLUE/g)||[]).length,1);
});

test('host-transformed worldbook body is retained once without inventing references into it',async()=>{
 const f=await ready('worldbook');await f.service.edit({changes:[
  {id:'new:event',table:'events',expected:0,values:{名称:'带宏的旧事',经过:'ORIGINAL_MACRO_BODY'},access,evidence:'用户手动修改表单'},
  {id:'new:clue',table:'clues',expected:0,values:{名称:'线索',已出现内容:'CLUE_BODY',事件:['new:event']},access,evidence:'用户手动修改表单'}
 ]});f.context.chat.push({is_user:true,mes:'回忆带宏的旧事'});await f.service.prepare();const payload={chatLore:[]};f.service.worldbook.entriesLoaded(payload);
 const event=payload.chatLore.find(e=>e.comment==='带宏的旧事'),clue=payload.chatLore.find(e=>e.comment==='线索');f.service.worldbook.activated([{...event,content:event.content.replace('ORIGINAL_MACRO_BODY','HOST_EXPANDED_BODY')},clue]);const text=f.service.worldbook.selectedText();
 assert.equal((text.match(/HOST_EXPANDED_BODY/g)||[]).length,1);assert.doesNotMatch(text,/ORIGINAL_MACRO_BODY|E01/);assert.match(text,/事件：带宏的旧事/);
});
