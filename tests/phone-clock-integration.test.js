import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initializeState} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {createPhoneService} from '../phone-core.mjs';
import {phoneProfile,installPhoneClock} from './fixtures/phone-current.mjs';
import {encodePhoneDatabase,decodePhoneDatabase,readPhoneDatabaseProfile,createPhoneDatabaseStorage} from '../engine/phone-database.mjs';

const catalog=JSON.parse(fs.readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const contextKey='clock-context';
const seed={accounts:{me:{name:'本人',role:'self'}},documents:[]};
const profile=phoneProfile({personId:'p',world:{apps:['calendar']},character:{accounts:[{id:'me',name:'本人',owned:true}]}});
const service=createPhoneService({seed,contextKey,storage:{load:async()=>null,save:async value=>value}});
await service.init();
await service.initLife(profile);
const archive=JSON.parse(service.export());
const initialRuntime=new Runtime(initializeState(catalog));installPhoneClock(initialRuntime,profile);const initial=initialRuntime.data,encoded=encodePhoneDatabase(archive,initial),runtime=new Runtime(initial);
for(const table of encoded.schema){
 if(!runtime.data.schema[table.id]){runtime.data.schema[table.id]=structuredClone(table);runtime.data.tables[table.id]={};}
 else for(const field of table.fields)if(!runtime.data.schema[table.id].fields.some(f=>f.key===field.key))runtime.declareField(table.id,field);
}
for(const change of encoded.changes){
 if(change.remove){delete runtime.data.tables[change.tableId][change.recordId];continue;}
 if(!runtime.rows(change.tableId)[change.recordId])runtime.newRecord(change.tableId,{},change.recordId);
 for(const [key,value]of Object.entries(change.values))runtime.set([change.tableId,change.recordId,key,[]],value);
 if(change.metadata)runtime.record(change.tableId,change.recordId).metadata=structuredClone(change.metadata);
}
const baseline=runtime.data;
const fixture=()=>structuredClone(baseline);
const binding=state=>state.tables.X_PHONE_BINDINGS['phone-current'].values;
const ownClock=state=>state.tables.X_WORLD_CLOCKS[binding(state).layout.clock.recordId];
function addForeign(state,id='foreign-clock'){
 const row=structuredClone(ownClock(state));row.values.world_ref='other-world';row.states.world_ref='known';row.values.year=2040;state.tables.X_WORLD_CLOCKS[id]=row;return row;
}
function readOnlyFailure(state,call,code){const before=structuredClone(state);assert.throws(call,error=>error.code===code);assert.deepEqual(state,before);}

test('clock decode accepts its same-world clock and ignores an unrelated runtime selector',()=>{
 const state=fixture();addForeign(state);state.runtime.calendar_record_id='foreign-clock';
 const decoded=decodePhoneDatabase(state,{contextKey});assert.equal(decoded.life.state.clock.year,2033);
 const next=encodePhoneDatabase(archive,state);assert(next.changes.some(c=>c.tableId==='X_WORLD_CLOCKS'&&c.recordId===binding(state).layout.clock.recordId));
 assert(!next.changes.some(c=>c.tableId==='X_WORLD_CLOCKS'&&c.recordId==='foreign-clock'));
});

test('clock decode rejects a wrong table even when that table has the same record ID',()=>{
 const state=fixture(),clock=binding(state).layout.clock;state.tables.NOT_A_WORLD_CLOCK={[clock.recordId]:structuredClone(ownClock(state))};clock.tableId='NOT_A_WORLD_CLOCK';
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK');
});

test('clock decode rejects a foreign-world persisted binding without selecting another row',()=>{
 const state=fixture();addForeign(state);binding(state).layout.clock.recordId='foreign-clock';
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK_SCOPE');
});

test('clock decode rejects a dangling binding despite an available same-world clock',()=>{
 const state=fixture();binding(state).layout.clock.recordId='missing-clock';
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK');
});

test('clock invalid origin is rejected by both read and write paths',()=>{
 const state=fixture();binding(state).layout.clock.origin='not-a-minute';
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK');
 readOnlyFailure(state,()=>encodePhoneDatabase(archive,state),'PHONE_DATABASE_CLOCK');
});

test('clock decode rejects unknown ownership even when its retained value names this world',()=>{
 const state=fixture();ownClock(state).states.world_ref='unknown';
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK_SCOPE');
});

test('clock decode rejects a clock with missing ownership',()=>{
 const state=fixture();delete ownClock(state).values.world_ref;
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK_SCOPE');
});

test('clock decode rejects unknown position instead of presenting the retained hour as known',()=>{
 const state=fixture();ownClock(state).states.hour='unknown';
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK_UNKNOWN');
});

test('clock decode rejects an incomplete position instead of accepting WorldClock defaults',()=>{
 const state=fixture();delete ownClock(state).values.hour;delete ownClock(state).states.hour;
 readOnlyFailure(state,()=>decodePhoneDatabase(state,{contextKey}),'PHONE_DATABASE_CLOCK_UNKNOWN');
});

test('clock encode rejects an existing foreign row at the deterministic initialization ID',()=>{
 const state=fixture();delete state.tables.X_PHONE_BINDINGS;state.tables.X_WORLD_CLOCKS['world-clock:w'].values.world_ref='other-world';
 readOnlyFailure(state,()=>encodePhoneDatabase(archive,state),'PHONE_DATABASE_CLOCK_SCOPE');
});

test('clock encode validates the persisted binding before considering another same-world clock',()=>{
 const state=fixture();addForeign(state);binding(state).layout.clock.recordId='foreign-clock';
 readOnlyFailure(state,()=>encodePhoneDatabase(archive,state),'PHONE_DATABASE_CLOCK_SCOPE');
});

test('clock encode rejects unknown ownership before producing a write set',()=>{
 const state=fixture();ownClock(state).states.world_ref='unknown';
 readOnlyFailure(state,()=>encodePhoneDatabase(archive,state),'PHONE_DATABASE_CLOCK_SCOPE');
});

test('clock initialization still refuses ambiguous same-world clocks',()=>{
 const state=fixture();state.tables.X_WORLD_CLOCKS.second=structuredClone(ownClock(state));delete state.tables.X_PHONE_BINDINGS;
 readOnlyFailure(state,()=>encodePhoneDatabase(archive,state),'CALENDAR_BINDING');
});

test('clock native-profile discovery applies the same ownership-state guard',()=>{
 const state=fixture();ownClock(state).states.world_ref='unknown';delete state.tables.X_PHONE_BINDINGS;
 readOnlyFailure(state,()=>readPhoneDatabaseProfile(state,{worldId:'w',entityId:'p'}),'PHONE_DATABASE_CLOCK_SCOPE');
});

test('clock confirmed derived ownership and old rows without state metadata remain readable',()=>{
 for(const mode of ['derived','legacy']){
  const state=fixture();if(mode==='derived')ownClock(state).states.world_ref='derived';else delete ownClock(state).states;
  assert.equal(decodePhoneDatabase(state,{contextKey}).life.state.clock.year,2033);
 }
});

test('clock storage cold load rejects the actual invalid decode and performs zero commits',async()=>{
 const state=fixture();addForeign(state);binding(state).layout.clock.recordId='foreign-clock';let commits=0;
 const before=structuredClone(state),storage=createPhoneDatabaseStorage({contextKey,database:{read:async()=>({state,revision:1,contextKey}),commit:async()=>{commits++;throw Error('unexpected commit');}}});
 await assert.rejects(storage.load(),error=>error.code==='PHONE_DATABASE_CLOCK_SCOPE');assert.equal(commits,0);assert.deepEqual(state,before);
});

test('clock storage save refuses a corrupt binding before persistence and preserves source data',async()=>{
 const state=fixture();let commits=0;
 const storage=createPhoneDatabaseStorage({contextKey,database:{read:async()=>({state,revision:1,contextKey}),commit:async()=>{commits++;throw Error('unexpected commit');}}});
 const loaded=await storage.load();addForeign(state);binding(state).layout.clock.recordId='foreign-clock';const before=structuredClone(state);
 await assert.rejects(storage.save(loaded,{expectedRevision:loaded.revision}),error=>error.code==='PHONE_DATABASE_CLOCK_SCOPE');assert.equal(commits,0);assert.deepEqual(state,before);
});
