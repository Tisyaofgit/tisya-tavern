import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixCreator,validateCreationProposal,CREATION_CONTRACT} from '../engine/creation.mjs';
import {digest} from '../engine/common.mjs';
import {bundledNativeTemplateBook} from '../engine/template-book.mjs';

function fixture(){
 const r=new Runtime();r.registerTable('T_SYS_ENTITIES',[{key:'name',type:'TEXT'},{key:'enabled',type:'BOOLEAN'}],'人物主体');r.registerTable('T_CHAR_DOSSIER',[{key:'entity_ref',type:'REF'},{key:'name',label:'显示名称',type:'TEXT'},{key:'description',label:'描述',type:'TEXT'}],'人物');r.registerTable('T_DYN_CURRENCY_BALANCES',[{key:'amount',label:'数额',type:'NUMBER'},{key:'enabled',label:'启用',type:'BOOLEAN'}],'余额');r.registerTable('X_PHONE_RECEIPTS',[{key:'data',type:'JSON'}]);r.data.schema.X_PHONE_RECEIPTS.program_owned=true;
 let snapshot={state:r.data,revision:0,contextKey:'chat-a'},writes=0;const receipts=new Map();
 const database={read:async()=>structuredClone(snapshot),commit:async input=>{const key=input.operationId,hash=digest({changes:input.changes,source:input.source});if(receipts.has(key)){assert.equal(hash,receipts.get(key));return {...structuredClone(snapshot),receipt:{replayed:true}};}assert.equal(input.contextKey,snapshot.contextKey);assert.equal(input.expectedRevision,snapshot.revision,'SAVE_CONFLICT');const rt=new Runtime(snapshot.state);for(const c of input.changes){if(!rt.rows(c.tableId)[c.recordId])rt.newRecord(c.tableId,{},c.recordId);for(const [k,v]of Object.entries(c.values))rt.set([c.tableId,c.recordId,k,[]],v,c.states?.[k]??'known');}snapshot={...snapshot,state:rt.data,revision:snapshot.revision+1};receipts.set(key,hash);writes++;return {...structuredClone(snapshot),receipt:{replayed:false}};}};
 return {database,get snapshot(){return snapshot;},set snapshot(v){snapshot=v;},get writes(){return writes;}};
}
const proposal=()=>({name:'角色与手机初态',unresolved:[],matrix:{binding:{entityId:'person-1',dossierId:'dossier-1'},changes:[{tableId:'T_SYS_ENTITIES',recordId:'person-1',values:{name:'阿清',enabled:false}},{tableId:'T_CHAR_DOSSIER',recordId:'dossier-1',values:{entity_ref:'person-1',description:'已有世界中的新角色'}},{tableId:'T_DYN_CURRENCY_BALANCES',recordId:'balance-1',values:{amount:0}}]}});
const reply=()=>'<reply><task/><anchor phase="before"/><title>角色与手机初态</title><body>1 已有世界中的新角色。</body><anchor phase="after"/><extra/><cells>【人物／1】\n2 显示名称：阿清\n3 描述：已有世界中的新角色\n【余额／1】\n1 数额：0\n2 启用：否</cells><vars/><archive/><actions/></reply>';
test('canonical creation saves typed shared records and preserves zero/false; exact retry is idempotent',async()=>{
 const f=fixture(),creator=createMatrixCreator({database:f.database,getContext:()=>({}),request:async()=>reply()});
 const d=await creator.draft('新角色',{kind:'character',mode:'revise'});assert.equal(d.format,CREATION_CONTRACT);assert.equal(f.writes,0);await creator.save(d);const balance=Object.values(f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES)[0];assert.equal(balance.values.amount,0);assert.equal(balance.values.enabled,false);assert.equal(f.snapshot.state.tables.T_SYS_ENTITIES[d.proposal.matrix.binding.entityId].values.name,'阿清');await creator.save(d);assert.equal(f.writes,1);
});
test('stale draft cannot overwrite a concurrently edited form',async()=>{
 const f=fixture(),creator=createMatrixCreator({database:f.database,getContext:()=>({}),request:async()=>reply()}),d=await creator.draft('新角色',{kind:'character',mode:'revise'});
 await f.database.commit({operationId:'other',expectedRevision:0,contextKey:'chat-a',changes:[{tableId:'T_SYS_ENTITIES',recordId:'existing',values:{name:'不可覆盖'}}]});await assert.rejects(creator.save(d),/SAVE_CONFLICT/);assert.equal(f.writes,1);assert.equal(f.snapshot.state.tables.T_SYS_ENTITIES['existing'].values.name,'不可覆盖');
});
test('legacy JSON replies and saved proposals are rejected; only current reply-sheet drafts can save',async()=>{
 const f=fixture(),creator=createMatrixCreator({database:f.database,getContext:()=>({}),request:async()=>JSON.stringify(proposal())});await assert.rejects(creator.draft('新人物',{kind:'character',mode:'revise'}),e=>e.rawResponse===JSON.stringify(proposal()));
 const nativeSources={card:null,bindings:[],books:[],contractor:null},saved={format:CREATION_CONTRACT,operationId:'saved-json',contextKey:'chat-a',expectedRevision:0,kind:'character',mode:'extend',goal:'旧草稿',source:null,nativeSources,nativeSourceDigest:digest(nativeSources),proposal:proposal()};await assert.rejects(creator.save(saved),/当前可视化表单格式/);assert.equal(f.writes,0);assert.deepEqual(saved.proposal,proposal());
});
test('generation changes no records on malformed response and retains raw evidence',async()=>{
 const f=fixture(),raw='{"name":"broken"',creator=createMatrixCreator({database:f.database,getContext:()=>({}),request:async()=>raw});await assert.rejects(creator.draft('新世界',{mode:'revise'}),e=>e.rawResponse===raw);assert.equal(f.writes,0);
});
test('rejects legacy state payload, unknown fields, program receipts and duplicate targets',()=>{
 const f=fixture();for(const mutate of [p=>p.phone={balance:100},p=>p.matrix.changes[0].values.typo='x',p=>p.matrix.changes.push({tableId:'X_PHONE_RECEIPTS',recordId:'fake',values:{data:{paid:true}}}),p=>p.matrix.changes.push(p.matrix.changes[0])]){const p=proposal();mutate(p);assert.throws(()=>validateCreationProposal(p,f.snapshot,{kind:'character'}));}assert.equal(f.writes,0);
});
test('extend does not reinitialize an existing person and unknown body is not guessed',()=>{
 const f=fixture(),p=proposal(),r=new Runtime(f.snapshot.state);r.newRecord('T_SYS_ENTITIES',{name:'已有名字'},'person-1');f.snapshot={...f.snapshot,state:r.data};assert.throws(()=>validateCreationProposal(p,f.snapshot,{kind:'character',mode:'extend'}),/不能覆盖/);delete p.matrix.binding;assert.throws(()=>validateCreationProposal(p,f.snapshot,{kind:'character',mode:'revise'}),/entityId/);
});

test('editing the actual selected template after drafting blocks save and preserves the current records',async()=>{
 const f=fixture(),book=bundledNativeTemplateBook(),ctx={extensionSettings:{},getWorldInfoNames:async()=>['缇斯亚模板书'],loadWorldInfo:async()=>book},creator=createMatrixCreator({database:f.database,getContext:()=>ctx,request:async()=>reply()});
 const draft=await creator.draft('新人物',{kind:'character',mode:'revise'}),before=structuredClone(f.snapshot);const selected=Object.values(book.entries).find(row=>row.extensions.tisyaBuiltin.entryId==='template.character.form');selected.content+='\n用户明确增加的新规则';await assert.rejects(creator.save(draft),/模板内容已经变化/);assert.equal(f.writes,0);assert.deepEqual(f.snapshot,before);assert.equal(draft.rawResponse,reply());
});

// The actual request is inspected: sparse rules must survive task routing and
// prompt assembly, and creating a draft must not fill missing user facts.
test('phone creation request carries progressive known-field rules without requiring a complete profile',async()=>{
 const f=fixture();let sent;
 const creator=createMatrixCreator({database:f.database,getContext:()=>({}),request:async(_task,input)=>{sent=JSON.parse(input);return reply();}});
 await creator.draft('手机初始化：仅建立人物最小档案，网名、住址和日程时间稍后再补',{kind:'character',mode:'revise'});
 assert.match(sent.template,/最小档案/);assert.match(sent.template,/后补/);assert.match(sent.template,/同一表单/);assert.match(sent.template,/时间待定/);assert.match(sent.template,/不能当作零/);
 assert.doesNotMatch(sent.template,/先按来源确定世界、人物和唯一故事时钟，再/);
 for(const rule of [/只填有据的新值/,/保留未改内容/,/未知省略/])assert.match(sent.forms,rule);
 assert.equal(Object.keys(f.snapshot.state.tables.T_CHAR_DOSSIER??{}).length,0);
});
