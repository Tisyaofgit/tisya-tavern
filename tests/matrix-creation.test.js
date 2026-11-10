import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixCreator,validateCreationProposal,CREATION_CONTRACT} from '../engine/creation.mjs';
import {digest} from '../engine/common.mjs';

function fixture(){
 const r=new Runtime();r.registerTable('T_SYS_ENTITIES',[{key:'name',type:'TEXT'},{key:'enabled',type:'BOOLEAN'}]);r.registerTable('T_CHAR_DOSSIER',[{key:'entity_ref',type:'REF'},{key:'description',type:'TEXT'}]);r.registerTable('T_DYN_CURRENCY_BALANCES',[{key:'amount',type:'NUMBER'}]);r.registerTable('X_PHONE_RECEIPTS',[{key:'data',type:'JSON'}]);
 let snapshot={state:r.data,revision:0,contextKey:'chat-a'},writes=0;const receipts=new Map();
 const database={read:async()=>structuredClone(snapshot),commit:async input=>{const key=input.operationId,hash=digest({changes:input.changes,source:input.source});if(receipts.has(key)){assert.equal(hash,receipts.get(key));return {...structuredClone(snapshot),receipt:{replayed:true}};}assert.equal(input.contextKey,snapshot.contextKey);assert.equal(input.expectedRevision,snapshot.revision,'SAVE_CONFLICT');const rt=new Runtime(snapshot.state);for(const c of input.changes){if(!rt.rows(c.tableId)[c.recordId])rt.newRecord(c.tableId,{},c.recordId);for(const [k,v]of Object.entries(c.values))rt.set([c.tableId,c.recordId,k,[]],v,c.states?.[k]??'known');}snapshot={...snapshot,state:rt.data,revision:snapshot.revision+1};receipts.set(key,hash);writes++;return {...structuredClone(snapshot),receipt:{replayed:false}};}};
 return {database,get snapshot(){return snapshot;},set snapshot(v){snapshot=v;},get writes(){return writes;}};
}
const proposal=()=>({name:'角色与手机初态',unresolved:[],matrix:{binding:{entityId:'person-1',dossierId:'dossier-1'},changes:[{tableId:'T_SYS_ENTITIES',recordId:'person-1',values:{name:'阿清',enabled:false}},{tableId:'T_CHAR_DOSSIER',recordId:'dossier-1',values:{entity_ref:'person-1',description:'已有世界中的新角色'}},{tableId:'T_DYN_CURRENCY_BALANCES',recordId:'balance-1',values:{amount:0}}]}});
test('canonical creation saves typed shared records and preserves zero/false; exact retry is idempotent',async()=>{
 const f=fixture(),creator=createMatrixCreator({database:f.database,getContext:()=>({}),request:async()=>JSON.stringify(proposal())});
 const d=await creator.draft('新角色',{kind:'character',mode:'revise'});assert.equal(d.format,CREATION_CONTRACT);assert.equal(f.writes,0);await creator.save(d);assert.equal(f.snapshot.state.tables.T_DYN_CURRENCY_BALANCES['balance-1'].values.amount,0);assert.equal(f.snapshot.state.tables.T_SYS_ENTITIES['person-1'].values.enabled,false);await creator.save(d);assert.equal(f.writes,1);
});
test('stale draft cannot overwrite a concurrently edited form',async()=>{
 const f=fixture(),creator=createMatrixCreator({database:f.database,getContext:()=>({}),request:async()=>JSON.stringify(proposal())}),d=await creator.draft('新角色',{kind:'character',mode:'revise'});
 await f.database.commit({operationId:'other',expectedRevision:0,contextKey:'chat-a',changes:[{tableId:'T_SYS_ENTITIES',recordId:'existing',values:{name:'不可覆盖'}}]});await assert.rejects(creator.save(d),/SAVE_CONFLICT/);assert.equal(f.writes,1);assert.equal(f.snapshot.state.tables.T_SYS_ENTITIES['existing'].values.name,'不可覆盖');
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
