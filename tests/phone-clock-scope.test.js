import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPhoneWorldClock,readPhoneWorldClock} from '../engine/phone-clock.mjs';
import {EngineError} from '../engine/common.mjs';
const row=(world,status)=>({values:{world_ref:world,minute:0},...(status===undefined?{}:{states:{world_ref:status}})});
const state=(rows,runtime={})=>({tables:{X_WORLD_CLOCKS:rows},runtime});
const fails=(fn,code)=>assert.throws(fn,error=>error instanceof EngineError&&error.code===code);

test('selects the matching world instead of the first row',()=>{
 const s=state({foreign:row('A'),mine:row('B')});assert.equal(selectPhoneWorldClock(s,'B').recordId,'mine');
});
test('selection does not depend on insertion order',()=>{
 for(const entries of [[['a',row('A')],['b',row('B')]],[['b',row('B')],['a',row('A')]]])assert.equal(selectPhoneWorldClock(state(Object.fromEntries(entries)),'B').recordId,'b');
});
test('honors an explicit same-world runtime clock',()=>{
 const s=state({a:row('B'),b:row('B')},{calendar_record_id:'b'});assert.equal(selectPhoneWorldClock(s,'B').recordId,'b');
});
test('rejects a foreign-world runtime clock even when a matching row exists',()=>{
 fails(()=>selectPhoneWorldClock(state({a:row('A'),b:row('B')},{calendar_record_id:'a'}),'B'),'PHONE_DATABASE_CLOCK_SCOPE');
});
test('a dangling runtime binding cannot silently fall back',()=>{
 fails(()=>selectPhoneWorldClock(state({b:row('B')},{calendar_record_id:'missing'}),'B'),'PHONE_DATABASE_CLOCK');
});
test('an empty runtime ID is invalid rather than absent',()=>{
 fails(()=>selectPhoneWorldClock(state({b:row('B')},{calendar_record_id:''}),'B'),'PHONE_DATABASE_CLOCK');
});
test('a non-string runtime ID is invalid',()=>{
 fails(()=>selectPhoneWorldClock(state({'0':row('B')},{calendar_record_id:0}),'B'),'PHONE_DATABASE_CLOCK');
});
test('a null runtime ID allows same-world discovery',()=>{
 assert.equal(selectPhoneWorldClock(state({b:row('B')},{calendar_record_id:null}),'B').recordId,'b');
});
test('multiple same-world clocks require explicit selection',()=>{
 fails(()=>selectPhoneWorldClock(state({a:row('B'),b:row('B')}),'B'),'PHONE_DATABASE_CLOCK_AMBIGUOUS');
});
test('missing world ID is rejected',()=>fails(()=>selectPhoneWorldClock(state({}),undefined),'PHONE_DATABASE_CLOCK_SCOPE'));
test('blank world ID is rejected without normalization',()=>fails(()=>selectPhoneWorldClock(state({}),'  '),'PHONE_DATABASE_CLOCK_SCOPE'));
test('a numeric world ID is not coerced',()=>fails(()=>selectPhoneWorldClock(state({}),0),'PHONE_DATABASE_CLOCK_SCOPE'));
test('only an unused initialization ID is returned for a new world',()=>{
 const s=state({a:row('A')}),before=structuredClone(s);assert.deepEqual(selectPhoneWorldClock(s,'B'),{recordId:'world-clock:B',row:null});assert.deepEqual(s,before);
});
test('an occupied initialization ID cannot overwrite another world',()=>{
 fails(()=>selectPhoneWorldClock(state({'world-clock:B':row('A')}),'B'),'PHONE_DATABASE_CLOCK_SCOPE');
});
test('an occupied ID with unknown ownership cannot be adopted',()=>{
 fails(()=>selectPhoneWorldClock(state({'world-clock:B':row(null)}),'B'),'PHONE_DATABASE_CLOCK_SCOPE');
});
test('a selected row without world ownership is rejected',()=>{
 fails(()=>selectPhoneWorldClock(state({a:row(undefined)},{calendar_record_id:'a'}),'B'),'PHONE_DATABASE_CLOCK_SCOPE');
});
test('an explicitly unknown world_ref cannot be promoted to a fact',()=>{
 fails(()=>selectPhoneWorldClock(state({b:row('B','unknown')}),'B'),'PHONE_DATABASE_CLOCK_SCOPE');
});
test('known and derived ownership are accepted',()=>{
 for(const status of ['known','derived'])assert.equal(selectPhoneWorldClock(state({b:row('B',status)}),'B').recordId,'b');
});
test('a legacy row without a state map still requires an exact world reference',()=>{
 assert.equal(selectPhoneWorldClock(state({b:row('B')}),'B').recordId,'b');
});
test('malformed clock tables are rejected',()=>fails(()=>selectPhoneWorldClock({tables:{X_WORLD_CLOCKS:[]}},'B'),'PHONE_DATABASE_CLOCK'));
test('prototype properties cannot satisfy an explicit clock ID',()=>{
 const rows=Object.create({b:row('B')});fails(()=>selectPhoneWorldClock(state(rows),'B',{recordId:'b'}),'PHONE_DATABASE_CLOCK');
});
test('an explicit stored binding is checked independently of the active runtime',()=>{
 assert.equal(readPhoneWorldClock(state({a:row('A'),b:row('B')},{calendar_record_id:'a'}),'B',{tableId:'X_WORLD_CLOCKS',recordId:'b'}).recordId,'b');
});
test('decoding rejects a binding into another table',()=>{
 fails(()=>readPhoneWorldClock(state({b:row('B')}),'B',{tableId:'X_OTHER',recordId:'b'}),'PHONE_DATABASE_CLOCK');
});
test('decoding rejects a foreign-world binding',()=>{
 fails(()=>readPhoneWorldClock(state({a:row('A')}),'B',{tableId:'X_WORLD_CLOCKS',recordId:'a'}),'PHONE_DATABASE_CLOCK_SCOPE');
});
test('decoding requires the actual row and never allocates an ID',()=>{
 fails(()=>readPhoneWorldClock(state({}),'B',{tableId:'X_WORLD_CLOCKS',recordId:'world-clock:B'}),'PHONE_DATABASE_CLOCK');
});
test('an incomplete stored binding cannot fall back to the runtime pointer',()=>{
 fails(()=>readPhoneWorldClock(state({b:row('B')},{calendar_record_id:'b'}),'B',{tableId:'X_WORLD_CLOCKS'}),'PHONE_DATABASE_CLOCK');
});
test('selection preserves zero-valued clock data and all input state',()=>{
 const s=state({b:row('B','known')}),before=structuredClone(s);assert.equal(selectPhoneWorldClock(s,'B').row.values.minute,0);assert.deepEqual(s,before);
});
test('failed selection does not mutate current state or binding',()=>{
 const s=state({a:row('A')},{calendar_record_id:'a'}),before=structuredClone(s);fails(()=>selectPhoneWorldClock(s,'B'),'PHONE_DATABASE_CLOCK_SCOPE');assert.deepEqual(s,before);
});
