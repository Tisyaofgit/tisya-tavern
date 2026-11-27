import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IDBFactory} from 'fake-indexeddb';
import {Window} from 'happy-dom';
import {createMatrixHost} from '../engine/host.mjs';
import {createTableService} from '../tables/service.js';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {baseline} from '../engine/config.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {acceptReply} from '../engine/reply.mjs';
import {prepareMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {MAIN_PROPOSAL_TABLE_IDS,THREE_SYSTEM_MAPPING,mainProposalReviewChanges,prepareMainProposalRedraw,acceptMainProposalRedraw} from '../engine/main-proposals.mjs';
import {preferenceTextRows} from '../engine/preference-editor.mjs';
import {compileTagProjection,preferenceExtensionPacks} from '../engine/tag-system.mjs';
import {parseDisplayEnvelope} from '../reader-core.js';
import {inspectMessage} from '../reader.js';
import {richFixture} from './fixtures/journey-r4.cjs';

const clone=structuredClone,catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
function form(state,tableId,values,recordId=null){
 const context=prepareMatrixSheets({state},{kind:'rows',task:'main',mode:'revise',operationId:'test-form',tableIds:MAIN_PROPOSAL_TABLE_IDS}),t=context.catalog.templates.find(t=>t.id===tableId),reference=recordId?context.references.find(r=>r.tableId===tableId&&r.recordId===recordId):null;
 if(recordId)assert(reference,'missing proposal reference '+recordId);
 return '【'+(reference?.display??t.label+'／1')+'】\n'+Object.entries(values).map(([key,value])=>{const f=t.fields.find(f=>f.key===key);assert(f,key);const text=Array.isArray(value)?value.join('；'):String(value);return f.row+' '+f.label+'：'+(f.definition.multiline?text.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n'):text);}).join('\n');
}
const preference=(directive='保持克制，先观察再回应',extra={})=>({operation:'新增',name:'克制控场',preference_kind:'文字偏好',directive,owner_type:'user',scope_type:'story',strength:'喜爱',evidence_quote:'不要猴急',...extra});
const reply=(n,proposal='')=>`<reply><task/><title>提案${n}</title><body>1 第${n}轮，他停下来观察对方，用户明确说不要猴急。</body><cells/><archive/>${proposal?`<proposals format="form">${proposal}</proposals>`:'<proposals/>'}<actions/></reply>`;
async function fixture(){
 const macros=new Map(),ctx={chatId:'main-proposals',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(k,f)=>macros.set(k,f)};
 const storage=indexedStorage(new IDBFactory()),source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));let auxiliaryCalls=0;
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand,request:async()=>{auxiliaryCalls++;throw Error('P0 不应调用辅助 API');}};
 const host=createMatrixHost(options);host.register();await host.import({state:initializeState(catalog,{session_ref:ctx.chatId,branch_ref:'main'})});
 async function prepare(type='normal'){if(type==='normal')ctx.chat.push({is_user:true,mes:'继续'});await host.before(type);const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier)),payload={messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};await host.payloadReady(payload);return payload;}
 async function accept(raw){await prepare();ctx.chat.push({mes:raw});await host.event('GENERATION_ENDED');return host.export();}
 async function review(tableId,recordId,action,instruction=''){const db=await host.readDatabase();return host.reviewMainProposal({tableId,recordId,action,instruction,contextKey:db.contextKey,expectedRevision:db.revision});}
 return {ctx,host,options,storage,prepare,accept,review,cold:()=>createMatrixHost(options),auxiliaryCalls:()=>auxiliaryCalls};
}
const only=(state,tableId)=>{const rows=Object.entries(state.tables[tableId]??{});assert.equal(rows.length,1,tableId);return rows[0];};

test('three-system mapping and all six main-API forms are scalar and visible in the real request',async()=>{
 assert.deepEqual(Object.keys(THREE_SYSTEM_MAPPING),['event_chain','global_knowledge','object_archive']);assert.equal(MAIN_PROPOSAL_TABLE_IDS.length,6);
 const f=await fixture(),payload=await f.prepare(),text=payload.messages.map(m=>m.content).join('\n'),start=text.indexOf('proposals 可填写的表单：');assert(start>=0);const section=text.slice(start);
 for(const label of ['偏好提案','标签提案','坐标组提案','语料提案','技法提案','执行链提案'])assert(section.includes(label),label);
 assert(!section.includes('此复杂值仍须JSON'));assert(!section.includes('proposal_status'));assert(!section.includes('original_values_json'));assert(text.includes('<proposals format="form">'));
});

test('proposal block survives the public display parser without becoming visible prose',()=>{
 const source=richFixture().replace('<archive/>','<archive/>\n<proposals format="form">【偏好提案／1】\n8 操作：新增</proposals>'),parsed=parseDisplayEnvelope(source),view=inspectMessage(source);
 assert(parsed.blocks.proposals.includes('偏好提案'));assert.deepEqual(parsed.attrs.proposals,{format:'form'});assert.deepEqual(parsed.wire.order.slice(-4),['archive','proposals','memory','actions']);assert.deepEqual(parsed.wire.attrs.proposals,{format:'form'});assert(view.body.value);assert.equal(view.details.error,undefined);assert.equal(view.journey.error,undefined);assert(!view.body.value.includes('偏好提案'));
 const empty=parseDisplayEnvelope(richFixture().replace('<archive/>','<archive/><proposals format="form"/>'));assert.equal(empty.blocks.proposals,'');
 for(const invalid of [
  richFixture().replace('<archive/>','<archive/><proposals/><proposals/>'),
  richFixture().replace('<actions','<proposals/><actions'),
  richFixture().replace('<archive/>','<archive/><proposals><nested/></proposals>'),
  richFixture().replace('<archive/>','<archive/><proposals><!--填写--></proposals>')
 ])assert.throws(()=>parseDisplayEnvelope(invalid));
});

test('one main reply stages a preference without auxiliary API or projection; explicit adoption persists and reaches payload',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1,form(initializeState(catalog),'T_PROP_PREFERENCES',preference())));assert.equal(f.auxiliaryCalls(),0);
 const [id,row]=only(saved.state,'T_PROP_PREFERENCES');assert.equal(row.values.proposal_status,'pending');assert.equal(Object.keys(saved.state.tables.T_PREF_SCOPES).length,0);assert(!materials(new Runtime(saved.state)).tisya_material_cell_prompts.includes('不要猴急'));
 const accepted=await f.review('T_PROP_PREFERENCES',id,'accept');saved=await f.host.export();assert.equal(accepted.receipt.status,'COMMITTED');assert.equal(Object.values(saved.state.tables.T_PREF_SCOPES).length,1);assert.equal(saved.state.tables.T_PROP_PREFERENCES[id].values.proposal_status,'accepted');
 assert(Object.values(preferenceTextRows(saved.state)).some(row=>row.text.includes('先观察再回应')));const payload=await f.prepare();assert(payload.messages.some(m=>m.content.includes('先观察再回应')));
 const cold=f.cold();await cold.sync();assert.deepEqual((await cold.export()).state,saved.state);assert.equal(f.auxiliaryCalls(),0);
});

test('forged review source cannot write ordinary read-only fields',async()=>{
 const f=await fixture(),db=await f.host.readDatabase();
 await assert.rejects(f.host.commitDatabase({operationId:'forged-main-proposal-review',expectedRevision:db.revision,contextKey:db.contextKey,changes:[{tableId:'T_CHAR_DOSSIER',recordId:'ordinary',values:{likes_with_reasons:'越权派生值'}}],source:{kind:'main-proposal-review',tableId:'T_CHAR_DOSSIER',recordId:'ordinary'}}),{code:'DERIVED_WRITE'});
 assert.equal((await f.host.readDatabase()).revision,db.revision);
});

test('rejection stays out of projection and main reply replay cannot duplicate proposals',()=>{
 const e=new Runtime(initializeState(catalog,{session_ref:'replay',branch_ref:'main'})),raw=reply(1,form(e.data,'T_PROP_PREFERENCES',preference()));acceptReply(e,raw,'m1');const [id]=only(e.data,'T_PROP_PREFERENCES');
 const replay=acceptReply(e,raw,'m1');assert.equal(replay.status,'REPLAY');assert.equal(Object.keys(e.rows('T_PROP_PREFERENCES')).length,1);
 const changes=mainProposalReviewChanges(e.data,{tableId:'T_PROP_PREFERENCES',recordId:id,action:'reject'});for(const change of changes)for(const [key,value]of Object.entries(change.values))e.set([change.tableId,change.recordId,key,[]],value);
 assert.equal(e.rows('T_PROP_PREFERENCES')[id].values.proposal_status,'rejected');assert.equal(Object.keys(e.rows('T_PREF_SCOPES')).length,0);assert.throws(()=>mainProposalReviewChanges(e.data,{tableId:'T_PROP_PREFERENCES',recordId:id,action:'accept'}),/已处理/);
});

test('redraw keeps the same proposal and original snapshot, then adoption creates one formal preference',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1,form(initializeState(catalog),'T_PROP_PREFERENCES',preference())));const [id]=only(saved.state,'T_PROP_PREFERENCES');await f.review('T_PROP_PREFERENCES',id,'redraw','更强调停顿，不要重复');
 saved=await f.host.export();assert.equal(saved.state.tables.T_PROP_PREFERENCES[id].values.proposal_status,'redraw_pending');assert(materials(new Runtime(saved.state)).tisya_material_cell_prompts.includes('更强调停顿'));
 saved=await f.accept(reply(2,form(saved.state,'T_PROP_PREFERENCES',{directive:'先停顿半拍，再克制回应'},id)));const row=saved.state.tables.T_PROP_PREFERENCES[id];assert.equal(row.values.proposal_status,'pending');assert.equal(row.values.revision_count,1);assert(row.values.original_values_json.includes('先观察再回应'));
 await f.review('T_PROP_PREFERENCES',id,'accept');saved=await f.host.export();assert.equal(Object.keys(saved.state.tables.T_PROP_PREFERENCES).length,1);assert.equal(Object.keys(saved.state.tables.T_PREF_SCOPES).length,1);assert(Object.values(saved.state.tables.T_PREF_SCOPES)[0].values.compiled_directive.includes('停顿半拍'));
});

test('P4 specialist redraw reuses form ownership and the same review transaction without direct adoption',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1,form(initializeState(catalog),'T_PROP_PREFERENCES',preference())));const [id]=only(saved.state,'T_PROP_PREFERENCES');await f.review('T_PROP_PREFERENCES',id,'redraw','增加停顿，保持克制');
 const snapshot=await f.host.readDatabase(),prepared=prepareMainProposalRedraw(snapshot,{tableId:'T_PROP_PREFERENCES',recordId:id});assert.equal(prepared.task,'preferenceAnalysis');assert.equal(prepared.input.source.recordId,id);
 const raw=reply(2).replace('<cells/>','<cells>'+form(snapshot.state,'T_PROP_PREFERENCES',{directive:'先停顿半拍，再克制回应'},id)+'</cells>'),accepted=acceptMainProposalRedraw(snapshot,prepared,raw);assert.equal(accepted.values.directive,'先停顿半拍，再克制回应');
 const result=await f.host.reviewMainProposal({tableId:'T_PROP_PREFERENCES',recordId:id,action:'revise',values:accepted.values,contextKey:snapshot.contextKey,expectedRevision:snapshot.revision});saved=await f.host.export();const row=saved.state.tables.T_PROP_PREFERENCES[id];assert.equal(row.values.proposal_status,'pending');assert.equal(row.values.revision_count,1);assert.equal(row.values.review_instruction,'');assert.equal(Object.keys(saved.state.tables.T_PREF_SCOPES).length,0);
 await f.review('T_PROP_PREFERENCES',id,'accept');saved=await f.host.export();assert(Object.values(saved.state.tables.T_PREF_SCOPES)[0].values.compiled_directive.includes('停顿半拍'));
});

test('P4 specialist cannot redraw another row, execute story blocks, or skip the redraw state',async()=>{
 const f=await fixture();const saved=await f.accept(reply(1,form(initializeState(catalog),'T_PROP_PREFERENCES',preference()))),[id]=only(saved.state,'T_PROP_PREFERENCES'),snapshot=await f.host.readDatabase();
 assert.throws(()=>prepareMainProposalRedraw(snapshot,{tableId:'T_PROP_PREFERENCES',recordId:id}),/先.*打回/);await f.review('T_PROP_PREFERENCES',id,'redraw','修正');const current=await f.host.readDatabase(),prepared=prepareMainProposalRedraw(current,{tableId:'T_PROP_PREFERENCES',recordId:id});
 const foreign=reply(2).replace('<cells/>','<cells>'+form(current.state,'T_PROP_CORPORA',{operation:'新增',name:'越权',brief:'a',full:'b'})+'</cells>');assert.throws(()=>acceptMainProposalRedraw(current,prepared,foreign),/只能修改|表单未登记/);
 const executing=reply(2).replace('<cells/>','<cells>'+form(current.state,'T_PROP_PREFERENCES',{directive:'有效修正'},id)+'</cells>').replace('<archive/>','<archive>越权</archive>');assert.throws(()=>acceptMainProposalRedraw(current,prepared,executing),/不能写入/);
});

test('P4 production composition and preference UI redraw through one routed request and one review transaction',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1,form(initializeState(catalog),'T_PROP_PREFERENCES',preference())));const [id]=only(saved.state,'T_PROP_PREFERENCES'),reviews=[],calls=[];
 const matrixHost={...f.host,reviewMainProposal:async input=>{reviews.push(input.action);return f.host.reviewMainProposal(input);}},request=async(task,text,{signal}={})=>{
  assert(signal instanceof AbortSignal);const input=JSON.parse(text),snapshot=await f.host.readDatabase();calls.push({task,input});assert.equal(task,'preferenceAnalysis');assert.equal(input.task,task);assert.equal(input.source.recordId,id);assert.equal(input.source.instruction,'增加停顿，保持克制');assert(input.forms.includes('偏好提案'));
  return reply(2).replace('<cells/>','<cells>'+form(snapshot.state,'T_PROP_PREFERENCES',{directive:'先停顿半拍，再克制回应'},id)+'</cells>');
 };
 const service=createTableService({store:{read:()=>({key:f.ctx.chatId,world:{}})},getContext:()=>f.ctx,request,books:{},conditionService:{},matrixDatabase:{read:()=>f.host.readDatabase(),commit:patch=>f.host.commitDatabase(patch)},matrixHost});
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const errors=[],ui=mountMatrixConfiguration(w.document,root,{service:{...f.host,reviewMainProposal:service.reviewMainProposal,redrawMainProposal:service.redrawMainProposal},onError:e=>errors.push(e)});
 const click=async label=>{const button=[...root.querySelectorAll('button')].find(n=>n.textContent===label);assert(button,label);button.click();await ui.settled();};
 try{
  await ui.ready;let row=root.querySelector('[data-main-proposal="'+id+'"]');assert(row);assert(![...row.querySelectorAll('button')].some(n=>n.textContent==='使用专项 API 重绘'));
  const correction=row.querySelector('[aria-label="提案修正指令"]');correction.value='增加停顿，保持克制';correction.dispatchEvent(new w.Event('input'));await click('打回，等待重绘');
  row=root.querySelector('[data-main-proposal="'+id+'"]');assert([...row.querySelectorAll('button')].some(n=>n.textContent==='使用专项 API 重绘'));assert.equal(Object.keys((await f.host.readDatabase()).state.tables.T_PREF_SCOPES).length,0);
  await click('使用专项 API 重绘');saved=await f.host.readDatabase();assert.equal(saved.state.tables.T_PROP_PREFERENCES[id].values.proposal_status,'pending');assert.equal(saved.state.tables.T_PROP_PREFERENCES[id].values.revision_count,1);assert.equal(Object.keys(saved.state.tables.T_PREF_SCOPES).length,0);assert.equal(calls.length,1);assert.deepEqual(reviews,['redraw','revise']);
  row=root.querySelector('[data-main-proposal="'+id+'"]');assert(![...row.querySelectorAll('button')].some(n=>n.textContent==='使用专项 API 重绘'));await click('采用并生效');saved=await f.host.readDatabase();assert.equal(Object.keys(saved.state.tables.T_PREF_SCOPES).length,1);assert.deepEqual(reviews,['redraw','revise','accept']);assert.deepEqual(errors,[]);
 }finally{ui.dispose();await w.happyDOM.abort();w.close();}
});

test('proposal block cannot write formal preference, cells, archive, or program-owned tables',()=>{
 const e=new Runtime(initializeState(catalog,{session_ref:'ownership',branch_ref:'main'}));
 for(const tableId of ['T_PREF_SCOPES','T_CHAR_DOSSIER','T_DYN_EVENTS','T_SYS_ARCHIVE_BATCHES']){
  const raw=reply(1,`【${tableId}／1】\n1 名称：越权`);acceptReply(e,raw,'m'+tableId);assert(Object.values(e.data.runtime.sources).at(-1).settlement.warnings.some(w=>w.code==='PROPOSAL_VALIDATION'),tableId);
 }
 assert.equal(Object.keys(e.rows('T_PREF_SCOPES')).length,0);assert.equal(Object.keys(e.rows('T_CHAR_DOSSIER')).length,0);assert.equal(Object.keys(e.rows('T_DYN_EVENTS')).length,0);assert.equal(Object.keys(e.rows('T_PROP_PREFERENCES')).length,0);
});

test('all knowledge forms adopt into one validated shared pack and drive deterministic projection',async()=>{
 const f=await fixture(),base=initializeState(catalog),forms=[
  ['T_PROP_COORDINATES',{operation:'新增',name:'互动四极',x_negative:'内敛',x_positive:'外放',y_negative:'迂回',y_positive:'直觉',pole_semantics:'内敛=克制；外放=直率；迂回=引导；直觉=坦承',quadrants:'外放×直觉=直率坦白'}],
  ['T_PROP_CORPORA',{operation:'新增',name:'雨夜语料',domain:'scene',brief:'雨声与停顿。',full:'雨点敲窗，目光在指尖停留。'}],
  ['T_PROP_TECHNIQUES',{operation:'新增',name:'停顿技法',purpose:'制造呼吸空间',steps:'观察=读取指尖；停顿=保留半拍',brief:'先停半拍。',full:'先读取指尖，再保留半拍，等待回应。'}],
  ['T_PROP_CHAINS',{operation:'新增',name:'渐进链',stages:'注意｜建立关注｜观察独特细节｜对方察觉｜｜锁定细节\n停顿｜留出选择｜触碰前停顿｜对方回应｜注意｜停半拍'}]
 ];
 let saved;for(let i=0;i<forms.length;i++){const [table,values]=forms[i];saved=await f.accept(reply(i+1,form(saved?.state??base,table,values)));const [id]=Object.entries(saved.state.tables[table]).filter(([,r])=>r.values.proposal_status==='pending').map(([id])=>id);await f.review(table,id,'accept');saved=await f.host.export();}
 const pack=preferenceExtensionPacks(saved.state)[0],ids=Object.fromEntries(['axes','corpora','techniques','chains'].map(kind=>[kind,pack[kind][0].id]));
 saved=await f.accept(reply(5,form(saved.state,'T_PROP_TAGS',{operation:'新增',name:'雨夜克制',owner_types:['user'],scope_types:['story'],trigger_types:['tag'],axis_ref:ids.axes,axis_centers:'内敛=20',axis_radiuses:'内敛=30',corpora_refs:[ids.corpora],technique_refs:[ids.techniques],chain_refs:[ids.chains],summary:'雨夜中克制推进'})));
 const [tagProposal]=only(saved.state,'T_PROP_TAGS');await f.review('T_PROP_TAGS',tagProposal,'accept');saved=await f.host.export();const tag=preferenceExtensionPacks(saved.state)[0].tags[0];
 saved=await f.accept(reply(6,form(saved.state,'T_PROP_CORPORA',{operation:'修订',target_ref:'雨夜语料',name:'雨夜语料新版',brief:'新雨夜简述。',full:'新雨夜落在指尖。'}).replace('／1】','／2】')));const corpusRevision=Object.entries(saved.state.tables.T_PROP_CORPORA).find(([,r])=>r.values.proposal_status==='pending')[0];await f.review('T_PROP_CORPORA',corpusRevision,'accept');saved=await f.host.export();const corpora=preferenceExtensionPacks(saved.state)[0].corpora;assert.equal(corpora.length,1);assert.equal(corpora[0].id,ids.corpora);assert.equal(corpora[0].full,'新雨夜落在指尖。');
 saved=await f.accept(reply(7,form(saved.state,'T_PROP_PREFERENCES',preference('',{name:'启用雨夜克制',preference_kind:'标签偏好',tag_ref:tag.label,directive:undefined}))));const [pref]=Object.entries(saved.state.tables.T_PROP_PREFERENCES).filter(([,r])=>r.values.name==='启用雨夜克制').map(([id])=>id);await f.review('T_PROP_PREFERENCES',pref,'accept');saved=await f.host.export();assert.equal(Object.values(saved.state.tables.T_PREF_SCOPES).find(r=>r.values.name==='启用雨夜克制').values.tag_id,tag.id);
 const projection=compileTagProjection({state:saved.state,tier:'full'});assert(projection.hits.some(hit=>hit.tag.id===tag.id));assert(projection.text.includes('新雨夜落在指尖'));assert(projection.text.includes('先读取指尖'));assert(projection.text.includes('观察独特细节'));assert.equal(f.auxiliaryCalls(),0);
});

test('invalid knowledge reference and stale CAS fail closed without marking proposal accepted',async()=>{
 const f=await fixture();let saved=await f.accept(reply(1,form(initializeState(catalog),'T_PROP_TAGS',{operation:'新增',name:'坏引用',owner_types:['user'],scope_types:['story'],corpora_refs:['missing.corpus']})));const [id]=only(saved.state,'T_PROP_TAGS');
 await assert.rejects(f.review('T_PROP_TAGS',id,'accept'),/不存在的资源/);saved=await f.host.export();assert.equal(saved.state.tables.T_PROP_TAGS[id].values.proposal_status,'pending');assert.equal(Object.keys(saved.state.tables.T_PREF_SCOPES).length,0);
 await assert.rejects(f.host.reviewMainProposal({tableId:'T_PROP_TAGS',recordId:id,action:'reject',contextKey:'wrong',expectedRevision:-1}),/提案已随存档更新|存档已更新/);assert.equal((await f.host.export()).state.tables.T_PROP_TAGS[id].values.proposal_status,'pending');
});

test('disable needs only a target and global adoption is explicitly fail-closed in P0',()=>{
 const e=new Runtime(initializeState(catalog,{session_ref:'guards',branch_ref:'main'}));e.newRecord('T_PREF_SCOPES',{name:'旧偏好',compiled_directive:'旧内容',enabled:true},'old');
 acceptReply(e,reply(1,form(e.data,'T_PROP_PREFERENCES',{operation:'停用',target_ref:'old'})),'m1');const [id]=only(e.data,'T_PROP_PREFERENCES'),changes=mainProposalReviewChanges(e.data,{tableId:'T_PROP_PREFERENCES',recordId:id,action:'accept'});assert.equal(changes[0].values.enabled,false);
 acceptReply(e,reply(2,form(e.data,'T_PROP_PREFERENCES',preference('全局内容',{scope_type:'global'})).replace('／1】','／2】')),'m2');const global=Object.entries(e.rows('T_PROP_PREFERENCES')).find(([,r])=>r.values.scope_type==='global')[0];assert.throws(()=>mainProposalReviewChanges(e.data,{tableId:'T_PROP_PREFERENCES',recordId:global,action:'accept'}),/PROPOSAL_GLOBAL_SCOPE|跨工作区半提交/);assert.equal(e.rows('T_PROP_PREFERENCES')[global].values.proposal_status,'pending');
 acceptReply(e,reply(3,form(e.data,'T_PROP_COORDINATES',{operation:'停用',target_ref:'missing.axis'})),'m3');const [coordinate]=only(e.data,'T_PROP_COORDINATES');assert.throws(()=>mainProposalReviewChanges(e.data,{tableId:'T_PROP_COORDINATES',recordId:coordinate,action:'accept'}),/PROPOSAL_TARGET|唯一已登记目标/);assert.equal(e.rows('T_PROP_COORDINATES')[coordinate].values.proposal_status,'pending');
});
