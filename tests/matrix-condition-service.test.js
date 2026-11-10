import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {createConditionService} from '../tables/condition-service.js';
import {createWorldbookConditionGate} from '../worldbook-conditions.js';
import {CONDITION_PROVIDER} from '../tables/condition-runtime.js';

const catalog=JSON.parse(fs.readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const clone=structuredClone;
async function fixture({oldSchema=false,policy={}}={}){
 const initial=clone(catalog);if(oldSchema)initial.tables.find(t=>t.id==='T_SYS_SOURCE_ROUTES').fields=initial.tables.find(t=>t.id==='T_SYS_SOURCE_ROUTES').fields.filter(f=>!f.key.startsWith('condition_'));
 const disk=new Map(),ctx={chatId:'condition-db',characterId:1,chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true};let writes=0,busy=false,draws=0,drawValue=.2,failCommit=false;
 const storage={get:async id=>clone(disk.get(id)),set:async(id,value)=>{disk.set(id,clone(value));},commit:async(id,revision,value)=>{if(failCommit)throw Error('condition disk failed');if((disk.get(id)?.local_revision??0)!==revision)return false;writes++;disk.set(id,clone(value));return true;}};
 const options={getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>initial,storage,persistSettings:async()=>true,persistMetadata:async()=>true,assertIdle:()=>{if(busy)throw Error('generation busy');}};
 let host=createMatrixHost(options);await host.ensureDatabase();
 const save=async changes=>{const db=await host.readDatabase();return host.commitDatabase({operationId:'test:'+crypto.randomUUID(),expectedRevision:db.revision,contextKey:db.contextKey,changes});};
 const source={tableId:'T_SYS_SOURCE_ROUTES',recordId:'gate',values:{source_name:'体力门禁',source_type:'worldbook',activation_condition:'gate-condition',...policy}};
 await save([
  {tableId:'T_CHAR_DOSSIER',recordId:'person-profile',values:{name:'阿青'}},
  {tableId:'T_SYS_ENTITIES',recordId:'person',values:{kind:'character',origin_record_ref:'person-origin'}},
  {tableId:'M_FIELD_REFERENCES',recordId:'person-origin',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'person',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'person-profile',target_field:'name',reference_kind:'cell',resolution_status:'resolved'}},
  {tableId:'T_DYN_ENTITY_GAUGES',recordId:'stamina',values:{name:'体力',entity_id:'person',field_key:'stamina',value:20}},
  source,
  {tableId:'M_FIELD_REFERENCES',recordId:'stamina-ref',values:{owner_table:'M_CONDITIONS',owner_row_uuid:'gate-condition',owner_field:'lhs_ref',target_table:'T_DYN_ENTITY_GAUGES',target_row_uuid:'stamina',target_field:'value',reference_kind:'cell',resolution_status:'resolved'}},
  {tableId:'M_CONDITIONS',recordId:'gate-condition',values:{owner_table:'T_SYS_SOURCE_ROUTES',owner_row_uuid:'gate',owner_field:'activation_condition',group_key:'eligible',sequence:0,combine:'all',predicate_kind:'comparison',lhs_ref:'stamina-ref',comparator:'ge',rhs_kind:'number',rhs_number:10,value_state:'known'}}
 ]);
 if(oldSchema)host=createMatrixHost({...options,loadCatalog:async()=>catalog});
 const make=()=>createConditionService({database:host.createConditionDatabaseBridge(),getContext:()=>ctx,draw:()=>{draws++;return drawValue;}}),service=make();
 const ref=async()=>{const rule=(await service.describeConditionRules()).find(r=>r.id==='gate');assert(rule.valid,rule.diagnostic);return {bookRef:'世界书',uid:7,provider:CONDITION_PROVIDER,ruleRef:rule.id,ruleVersion:rule.revision};};
 const run=async(options={})=>service.evaluateConditionEntries({requestId:'scan',entryRefs:[await ref()],dryRun:false,...options});
 const next=async()=>{ctx.chat.push({is_user:false,mes:'<reply><body>继续第 '+(ctx.chat.length+1)+' 轮。</body></reply>'});await host.sync();};
 return {ctx,host,service,make,save,ref,run,next,disk,reads:()=>host.readDatabase(),writes:()=>writes,draws:()=>draws,setDraw:n=>drawValue=n,setBusy:v=>busy=v,setFailure:v=>failCommit=v};
}

test('canonical gate reads standard cells and records one chance through the actual Matrix owner',async()=>{
 const f=await fixture(),before=await f.reads(),start=f.writes(),result=await f.run();assert.equal(result.results[0].state,'matched');assert.equal(f.writes(),start+1);assert.equal(f.draws(),1);await result.assertCurrent();
 const after=await f.reads();assert.deepEqual(after.state.tables,before.state.tables);assert.equal(Object.values(after.state.runtime.receipts).filter(r=>r.result?.source?.kind==='worldbook-condition').length,1);
 assert.equal((await f.run()).results[0].state,'matched');assert.equal(f.draws(),1);assert.equal(f.writes(),start+1);
});
test('current false and unknown values cannot reuse an earlier successful chance',async()=>{
 const f=await fixture();await f.run();const originalRef=await f.ref();
 await f.save([{tableId:'T_DYN_ENTITY_GAUGES',recordId:'stamina',values:{value:2}}]);assert.equal((await f.ref()).ruleVersion,originalRef.ruleVersion);let n=f.writes();assert.equal((await f.run()).results[0].state,'not_matched');assert.equal(f.writes(),n);
 await f.save([{tableId:'T_DYN_ENTITY_GAUGES',recordId:'stamina',values:{value:null},states:{value:'unknown'}}]);n=f.writes();assert.equal((await f.run()).results[0].state,'unknown');assert.equal(f.writes(),n);assert.equal(f.draws(),1);
});
test('all policies retain probability, successful-count limits, cooldown and inclusive turn windows',async()=>{
 const f=await fixture({policy:{condition_chance:50,condition_cooldown_turns:2,condition_limit:2,condition_start_turn:1,condition_end_turn:4}});f.setDraw(.1);
 assert.equal((await f.run()).results[0].reasonCode,'outside-window');assert.equal(f.draws(),0);
 await f.next();assert.equal((await f.run()).results[0].state,'matched');
 await f.next();assert.equal((await f.run()).results[0].reasonCode,'cooldown');
 await f.next();assert.equal((await f.run()).results[0].state,'matched');
 await f.next();assert.equal((await f.run()).results[0].reasonCode,'limit');
 await f.next();assert.equal((await f.run()).results[0].reasonCode,'outside-window');assert.equal(f.draws(),2);
 const miss=await fixture({policy:{condition_chance:0}});assert.equal((await miss.run()).results[0].reasonCode,'miss');await miss.run();assert.equal(miss.draws(),1);
});
test('whole-batch validation precedes any draw or receipt; changed chance cannot reroll an existing opportunity',async()=>{
 const f=await fixture(),ref=await f.ref(),start=f.writes();
 await assert.rejects(f.run({entryRefs:[ref,{...ref,uid:8,ruleRef:'missing'}]}),/尚未登记/);assert.equal(f.draws(),0);assert.equal(f.writes(),start);
 await assert.rejects(f.run({entryRefs:[ref,{...ref,ruleRef:'other'}]}),/重复/);assert.equal(f.draws(),0);
 await assert.rejects(f.run({entryRefs:[{...ref,ruleVersion:1}]}),/版本/);assert.equal(f.draws(),0);
 await f.run({entryRefs:[{...ref,chance:50}]});await assert.rejects(f.run({entryRefs:[{...ref,chance:60}]}),/不能|未重新抽签/);assert.equal(f.draws(),1);
});
test('explicit unknown policy never falls back to a permissive default',async()=>{
 const f=await fixture(),ref=await f.ref();await f.save([{tableId:'T_SYS_SOURCE_ROUTES',recordId:'gate',values:{condition_chance:null},states:{condition_chance:'unknown'}}]);
 const n=f.writes(),listed=await f.service.describeConditionRules();assert.equal(listed[0].valid,false);assert.match(listed[0].diagnostic,/尚未确认/);
 await assert.rejects(f.run({entryRefs:[ref]}),/尚未确认/);assert.equal(f.draws(),0);assert.equal(f.writes(),n);
});
test('restarted and concurrent consumers share one durable opportunity',async()=>{
 const f=await fixture(),ref=await f.ref(),service=f.make(),request={requestId:'second-scan',entryRefs:[ref],dryRun:false};
 const runs=await Promise.allSettled([f.run(),service.evaluateConditionEntries(request)]);assert(runs.some(r=>r.status==='fulfilled'));
 const failures=runs.filter(r=>r.status==='rejected');assert(failures.every(r=>/另一页面|同一操作ID/.test(r.reason.message)));
 const n=f.writes(),before=f.draws();assert.equal((await f.make().evaluateConditionEntries(request)).results[0].state,'matched');assert.equal(f.writes(),n);assert.equal(f.draws(),before);
 assert.equal(Object.values((await f.reads()).state.runtime.receipts).filter(r=>r.result?.source?.kind==='worldbook-condition').length,1);
});
test('source edits invalidate selected rule versions and scanned snapshots',async()=>{
 const f=await fixture(),ref=await f.ref(),result=await f.run();
 await f.save([{tableId:'M_CONDITIONS',recordId:'gate-condition',values:{rhs_number:15}}]);
 assert.notEqual((await f.ref()).ruleVersion,ref.ruleVersion);await assert.rejects(result.assertCurrent(),/已变化/);await assert.rejects(f.run({entryRefs:[ref]}),/版本/);
 await assert.rejects(f.run(),/旧机会不能重抽/);assert.equal(f.draws(),1);
});
test('private input and explicit expiry never reveal a successful gate or consume chance',async()=>{
 const f=await fixture();await f.save([{tableId:'M_ACCESS_RULES',recordId:'secret-access',values:{owner_table:'T_DYN_ENTITY_GAUGES',owner_row_uuid:'stamina',owner_field:'value',audience_kind:'character',audience_entity_ref:'person',permission:'read',decision:'allow',value_state:'known'}}]);
 const n=f.writes();assert.equal((await f.run()).results[0].reasonCode,'private');assert.equal(f.draws(),0);assert.equal(f.writes(),n);
 const g=await fixture();await g.save([{tableId:'T_SYS_SOURCE_ROUTES',recordId:'gate',values:{expiry_condition:'expired'}},{tableId:'M_CONDITIONS',recordId:'expired',values:{owner_table:'T_SYS_SOURCE_ROUTES',owner_row_uuid:'gate',owner_field:'expiry_condition',group_key:'expiry',sequence:0,combine:'all',predicate_kind:'observed_boolean',observed_result:true,value_state:'known'}}]);
 assert.equal((await g.run()).results[0].state,'not_matched');assert.equal(g.draws(),0);
});
test('generation capability only records gate receipts; business writes retain idle guard',async()=>{
 const f=await fixture();f.setBusy(true);assert.equal((await f.run()).results[0].state,'matched');
 await assert.rejects(f.save([{tableId:'T_DYN_ENTITY_GAUGES',recordId:'stamina',values:{value:9}}]),/generation busy/);
 const db=await f.reads();assert.throws(()=>f.host.createConditionDatabaseBridge().commitGate({operationId:'forged',expectedRevision:db.revision,contextKey:db.contextKey,source:{kind:'worldbook-condition'},changes:[{tableId:'T_DYN_ENTITY_GAUGES',recordId:'stamina',values:{value:9}}]}),/不可改写/);
 assert.equal((await f.reads()).state.tables.T_DYN_ENTITY_GAUGES.stamina.values.value,20);
});
test('old schema defaults stay read-only until an explicit normal form edit installs optional fields',async()=>{
 const f=await fixture({oldSchema:true}),before=await f.reads(),n=f.writes();assert(!before.state.schema.T_SYS_SOURCE_ROUTES.fields.some(f=>f.key==='condition_chance'));
 assert.equal((await f.service.describeConditionRules())[0].valid,true);assert.equal(f.writes(),n);assert.deepEqual((await f.reads()).state,before.state);
 await f.save([{tableId:'T_SYS_SOURCE_ROUTES',recordId:'gate',values:{condition_chance:0}}]);assert.equal((await f.run()).results[0].reasonCode,'miss');assert.equal((await f.reads()).state.tables.T_DYN_ENTITY_GAUGES.stamina.values.value,20);
});
test('failed persistence retains the original error and no successful chance receipt',async()=>{
 const f=await fixture(),n=f.writes();f.setFailure(true);await assert.rejects(f.run(),/condition disk failed/);assert.equal(f.writes(),n);assert.equal(Object.values((await f.reads()).state.runtime.receipts).filter(r=>r.result?.source?.kind==='worldbook-condition').length,0);
 f.setFailure(false);assert.equal((await f.run()).results[0].state,'matched');assert.equal(f.writes(),n+1);
});
test('actual scan gate consumes canonical definitions and preserves host entry fields',async()=>{
 const f=await fixture({policy:{condition_chance:0}}),ref=await f.ref(),gate=createWorldbookConditionGate({getContext:()=>f.ctx,engine:f.service});
 const entry={world:'世界书',uid:7,content:'受控资料',disable:false,useProbability:false,order:42,position:3,extensions:{tisyaWorldbook:{condition:{mode:'external',provider:ref.provider,ruleRef:ref.ruleRef,ruleVersion:ref.ruleVersion}}}};
 const original=clone(entry),data={globalLore:[entry],characterLore:[],chatLore:[],personaLore:[]};gate.begin();await gate.entriesLoaded(data);assert.equal(data.globalLore.length,0);assert.deepEqual(entry,original);await gate.scanDone({activated:{entries:new Map()}});await gate.assertReady();assert.equal(f.draws(),1);
});
