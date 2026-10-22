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
 assert(!archive.includes('<静态图鉴>'));assert(!archive.includes('未提供的关联对象'));
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
 const text=f.service.worldbook.selectedText();assert.match(text,/<关注人物>/);assert(!text.includes('UNSELECTED_OTHER_DOSSIER'));assert(!text.includes('private-source'));
});

test('nested native references do not become technical path prose',()=>{
 const row={id:'r',table:'relations',rev:9,source:'source-key',values:{名称:'交情',主体:'a',对象:'b',好感:{正面:{原生引用:'/characters/a/relation/b',依据:[]}}},access};
 const text=storyRecord(row,{rows:[row,{id:'a',values:{名称:'方鹿'}},{id:'b',values:{名称:'阿禾'}}],registry:defaultRegistry()});
 assert(!text.includes('/characters/a/relation/b'));assert(!text.includes('source-key'));assert.match(text,/主体：方鹿/);
});
