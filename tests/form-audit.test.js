import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {appendBusiness} from '../engine/business.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {baseline} from '../engine/config.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
test('legacy pact routing registers canonical origins and multi-party child references without copied dossiers',()=>{
 const e=new Runtime(initializeState(catalog));for(const name of ['青','白','红'])e.newRecord('T_CHAR_DOSSIER',{name,manifest:name+'的完整档案'},name);
 const raw='同行|青、白、红|一起过河|今夜|生效';
 const result=e.transaction('pact',{},()=>appendBusiness(e,'PACTS',raw));assert.equal(result.status,'COMMITTED');
 const row=e.rows('T_DYN_PACTS')[result.result.record_id];assert(row);assert.equal(Object.keys(e.rows('T_SYS_ENTITIES')).length,3);
 for(const [id,r]of Object.entries(e.rows('T_SYS_ENTITIES'))){assert.equal(typeof r.values.origin_record_ref,'string');const origin=e.rows('M_FIELD_REFERENCES')[r.values.origin_record_ref];assert.equal(origin.values.owner_row_uuid,id);assert.equal(origin.values.target_table,'T_CHAR_DOSSIER');assert.equal(r.values.description,undefined);}
 assert.equal(e.rows('M_LIST_VALUES')[row.values.additional_parties[0]].values.target_table,'T_SYS_ENTITIES');
 assert.equal(appendBusiness(e,'PACTS',raw).status,'REPLAY');assert.equal(Object.keys(e.rows('M_FIELD_REFERENCES')).length,3);
});
test('executor receipts are readable results but not ordinary writable model forms',()=>{
 const e=new Runtime(initializeState(catalog)),form=prepareMatrixSheets({state:e.data},{task:'main',operationId:'audit'});
 for(const table of ['X_FIN_LOANS','X_SHOP_ORDERS','X_EFFECT_INSTANCES','X_ACTIONS','X_UI_BINDINGS','X_WORLD_CLOCKS'])assert(!form.formSections.some(s=>s.tableId===table),table);
 e.newRecord('X_SHOP_ORDERS',{total:450,status:'paid'},'private-order-id');
 const text=Object.values(materials(e,{audience:'author'})).join('\n');assert.match(text,/450/);assert.doesNotMatch(text,/private-order-id/);
});
test('actual final host payload contains canonical facts once and no machine bindings or copied projections',async()=>{
 const e=new Runtime(initializeState(catalog));e.newRecord('T_CHAR_DOSSIER',{name:'青',manifest:'唯一资料点：青只在河口值夜。'},'dossier-private-id');e.newRecord('T_SYS_ENTITIES',{kind:'character'},'entity-private-id');e.set(['T_SYS_ENTITIES','entity-private-id','description',[]],'唯一资料点：青只在河口值夜。','derived');
 e.newRecord('X_ACTIONS',{name:'内部动作',handler:'SECRET_EXECUTOR_HANDLER',actor_table:'T_SYS_ENTITIES'},'action-private-id');
 e.newRecord('T_DYN_RELATIONS_PACTS',{name:'青对旅人'},'relationship-private-id');
 e.newRecord('T_DYN_RELATION_AXES',{name:'好奇',axis_family:'正向态度',relation_ref:'relationship-private-id',axis_key:'SECRET_AXIS_KEY',native_ref:'$.private.path',value:12},'axis-private-id');
 const disk=new Map(),macros=new Map(),ctx={chatId:'audit',characterId:0,chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(k,f)=>macros.set(k,f)};
 const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(m,k)=>macros.get(k)?.()??m);
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,v)=>disk.set(id,structuredClone(v)),commit:async(id,r,v)=>{if((disk.get(id)?.local_revision??0)!==r)return false;disk.set(id,structuredClone(v));return true;}};
 const host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand});host.register();await host.import({state:e.data});await host.before('normal');
 const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier)),payload={messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};await host.payloadReady(payload);
 const text=JSON.stringify(payload.messages);assert.equal(text.split('唯一资料点：青只在河口值夜。').length-1,1);
 assert.match(text,/好奇/);assert.match(text,/青对旅人/);
 assert.doesNotMatch(text,/SECRET_EXECUTOR_HANDLER|SECRET_AXIS_KEY|\$\.private\.path|dossier-private-id|entity-private-id|relationship-private-id|axis-private-id|T_DYN_RELATION_AXES#/);
 if(process.env.TISYA_WRITE_FORM_AUDIT==='1')writeFileSync(new URL('../docs/validation/form-audit-20261115/final-payload.json',import.meta.url),JSON.stringify(payload,null,2)+'\n');
});
test('phone text-backed references use the same registered name mapping as form acceptance',()=>{
 const e=new Runtime(initializeState(catalog));e.newRecord('X_SOCIAL_ACCOUNTS',{id:'account-private-business-key',name:'雨夜客'},'account-private-row');
 e.newRecord('X_SOCIAL_POSTS',{id:'post-private-key',authorId:'account-private-business-key',text:'渡口的雨还没停',visibility:'public'},'post-private-row');
 e.newRecord('X_PHONE_LIFE_STATE_WALLET',{defaultAccountId:'PRIVATE_INTERNAL_WALLET'},'wallet-hidden');
 const text=Object.values(materials(e,{audience:'author'})).join('\n');assert.match(text,/雨夜客/);assert.match(text,/渡口的雨还没停/);assert.doesNotMatch(text,/account-private-business-key|account-private-row|post-private-key|post-private-row|PRIVATE_INTERNAL_WALLET/);
 const form=prepareMatrixSheets({state:e.data},{operationId:'post-only',task:'main',tableIds:['X_SOCIAL_POSTS'],expandReferences:'children'});assert(form.references.some(r=>r.recordId==='account-private-row'));assert.match(form.form,/作者账号（名称：/);
});
