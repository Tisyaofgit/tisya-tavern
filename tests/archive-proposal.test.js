import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {createArchiveProposalSession,archiveProposalToolDefinition} from '../tables/archive-proposal.js';
const access={readers:['读者'],knowers:[]},code=c=>e=>e.code===c;
const row=(id,name,aliases=[])=>({id,table:'objects',rev:1,values:{名称:name,别名:aliases,类型:'character'},access,source:'old',lockedFields:[]});
const change=(id='new:a',values={名称:'岚',类型:'character'},extra={})=>({intent:'create',id,table:'objects',expected:0,values,access,evidence:'岚在城门。',...extra});
const input=(changes=[change()],requestId='request-1')=>({requestId,changes});

test('authorized temporal and manual conflicts identify all submitted operations without stored text',async()=>{
 const scene={id:'scene-current',table:'scene',rev:3,values:{名称:'不可回显旧名称',当前时间:'不可回显旧时间'},access,source:'later',lockedFields:['当前时间','未提交秘密锁']};
 const actor={...row('actor','旧人物名'),lockedFields:['描述']},registry=defaultRegistry();registry.tables.find(t=>t.id==='objects').fields.描述.aliases=['说明'];
 const view={registry,rows:[scene,actor],last:null},source={key:'source-1',evidence:'岚在城门。',floor:2,sourceOrder:{'source-1':1,later:2,old:0}};
 const update={intent:'update',id:scene.id,table:'scene',expected:3,values:{当前时间:'岚在城门。'},access,evidence:source.evidence};
 const payload=input([update,change('actor',{说明:'岚在城门。'},{intent:'update',expected:1})]),f=fixture({view,source,allowedTables:['scene','objects']}),before=structuredClone(view);
 await assert.rejects(f.session.propose_archive_change(payload),e=>e.code==='INVALID_PROPOSAL'&&['第 1 项','第 2 项','更晚楼层','values.当前时间','values.描述','notes'].every(x=>e.message.includes(x))&&!/不可回显|未提交秘密锁|旧人物名|scene-current/.test(e.message));
 assert.deepEqual(view,before);assert.throws(()=>f.session.getDraft(payload.requestId),code('DRAFT_NOT_FOUND'));
 const denied=fixture({view,source,allowedTables:['scene','objects'],authorizeChange:op=>op.table!=='objects'});
 await assert.rejects(denied.session.propose_archive_change(payload),e=>e.code==='NOT_AVAILABLE'&&!/第 1|更晚|锁定/.test(e.message));
 for(const order of [{},{'source-1':1,later:0}]){
  const unlocked={...scene,lockedFields:[]},g=fixture({view:{registry,rows:[unlocked],last:null},source:{...source,sourceOrder:order},allowedTables:['scene']});
  assert.equal((await g.session.propose_archive_change(input([update]))).state,'draft');
 }
 const unset=fixture({view:{registry,rows:[actor],last:null},source,allowedTables:['objects']});
 await assert.rejects(unset.session.propose_archive_change(input([change('actor',{}, {intent:'update',expected:1,unset:['说明']})])),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('unset.描述'));
});
function fixture(extra={}){const view={registry:defaultRegistry(),rows:[],last:null};const args={view,context:{world:'w',branch:'b',task:'tableArchive'},source:{key:'source-1',evidence:'岚在城门。',floor:2},allowedTables:['objects','facts'],authorizeChange:()=>true,guard:()=>{},...extra};return {...args,session:createArchiveProposalSession(args)};}
test('proposal stages an immutable zero-write full batch and concurrent repeats share its identity',async()=>{
 const f=fixture(),before=structuredClone(f.view),payload=input(),[a,b]=await Promise.all([f.session.propose_archive_change(payload),f.session.propose_archive_change(payload)]);assert.deepEqual(a,b);assert.equal(a.written,false);assert.equal(a.state,'draft');assert.deepEqual(f.view,before);
 const draft=f.session.getDraft(payload.requestId);draft.proposal.changes[0].values.名称='污染';assert.equal(f.session.getDraft(payload.requestId).proposal.changes[0].values.名称,'岚');
 await assert.rejects(f.session.propose_archive_change(input([change('new:other')])),code('REQUEST_CONFLICT'));assert.equal(archiveProposalToolDefinition().name,'tisya_propose_archive_change');
});
test('hidden formal names and aliases give the same generic identity review receipt without auto merging',async()=>{
 const hidden=row('hidden','秘密人物',['小岚']),f=fixture({view:{registry:defaultRegistry(),rows:[hidden],last:null}});
 for(const name of ['秘密人物','小岚',' 小岚 '])await assert.rejects(f.session.propose_archive_change(input([change('new:a',{名称:name,类型:'character'})])),e=>e.code==='IDENTITY_REVIEW_REQUIRED'&&!e.message.includes(name.trim())&&!e.message.includes('hidden'));
 await assert.rejects(f.session.propose_archive_change(input([change('new:a',{名称:'岚',别名:['小岚'],类型:'character'})])),code('IDENTITY_REVIEW_REQUIRED'));
 await assert.rejects(f.session.propose_archive_change(input([change(),change('new:b',{名称:'别的人',别名:['岚'],类型:'character'})])),code('IDENTITY_REVIEW_REQUIRED'));
 assert.throws(()=>f.session.getDraft('request-1'),code('DRAFT_NOT_FOUND'));
});
test('exact-ID updates retain unrelated existing shared aliases but reject newly introduced identity conflicts',async()=>{
 const f=fixture({view:{registry:defaultRegistry(),rows:[row('a','岚',['旧同名']),row('b','石',['旧同名'])],last:null}});
 const update=change('a',{描述:'岚在城门。'},{intent:'update',expected:1});assert.equal((await f.session.propose_archive_change(input([update]))).state,'draft');
 await assert.rejects(f.session.propose_archive_change(input([{...update,values:{别名:['石']}}],'new-alias')),code('IDENTITY_REVIEW_REQUIRED'));
 await assert.rejects(f.session.propose_archive_change(input([{...update,expected:0}],'old-rev')),code('REVISION_CONFLICT'));
});
test('invalid second operation rejects the entire batch and failed IDs may be corrected',async()=>{
 const source={key:'source-1',floor:2,evidence:'岚在城门。\n\n石在桥上。\n\n明说：“等……一下。”'},f=fixture({source,view:{registry:defaultRegistry(),rows:[row('hidden','隐藏身份')],last:null}}),before=structuredClone(f.view);
 const payload=input([change(),change('new:b',{名称:'石',类型:'character'},{evidence:'岚在城门。……石在桥上。'}),change('new:c',{名称:'明',类型:'character'},{evidence:'不存在的证据'})]);
 await assert.rejects(f.session.propose_archive_change(payload),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('第 2、3 项')&&!/隐藏身份|hidden|不存在的证据/.test(e.message));
 assert.throws(()=>f.session.getDraft('request-1'),code('DRAFT_NOT_FOUND'));assert.deepEqual(f.view,before);
 payload.changes[1].evidence='石在桥上。';payload.changes[2].evidence='明说：“等……一下。”';const accepted=await f.session.propose_archive_change(payload);assert.equal(accepted.state,'draft');assert.equal(accepted.changes,3);assert.equal(accepted.written,false);assert.deepEqual(f.view,before);
});
test('state value-shape feedback is actionable after authorization without exposing existing data',async()=>{
 const state=(values,extra={})=>({intent:'create',id:'new:s',table:'state',expected:0,values:{名称:'状态',对象:'new:o',字段:'位置',...values},access,evidence:'岚在城门。',...extra}),object=change('new:o');
 const f=fixture({allowedTables:['objects','state']});for(const values of [{},{值:'公开',值引用:'new:o'}])await assert.rejects(f.session.propose_archive_change(input([object,state(values)])),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('第 2 项（state）')&&e.message.includes('值引用')&&!e.message.includes('公开'));
 assert.equal((await f.session.propose_archive_change(input([object,state({值:'城门'})]))).state,'draft');
 const secret={id:'secret-state',table:'state',rev:1,values:{名称:'不可回显名称',对象:'known',字段:'位置',值:'不可回显旧值',有效性:'有效'},access,source:'old',lockedFields:[]},known=row('known','岚'),view={registry:defaultRegistry(),rows:[known,secret],last:null};
 const update={intent:'update',id:'secret-state',table:'state',expected:1,values:{有效性:'待确认'},access,evidence:'岚在城门。'};assert.equal((await fixture({view,allowedTables:['state']}).session.propose_archive_change(input([update]))).state,'draft');
 const swap={...update,values:{值引用:'known'},unset:['值']};assert.equal((await fixture({view,allowedTables:['state']}).session.propose_archive_change(input([swap]))).state,'draft');
 const remove={...update,values:{},unset:['值']};await assert.rejects(fixture({view,allowedTables:['state']}).session.propose_archive_change(input([remove])),e=>e.code==='INVALID_PROPOSAL'&&!/不可回显名称|不可回显旧值/.test(e.message));
 await assert.rejects(fixture({view,allowedTables:['state'],authorizeChange:()=>false}).session.propose_archive_change(input([remove])),code('NOT_AVAILABLE'));
});
test('unavailable identities and unauthorized changes are indistinguishable and async authorization is refused',async()=>{
 const f=fixture({view:{registry:defaultRegistry(),rows:[row('hidden','秘密')],last:null},authorizeChange:()=>false});
 for(const id of ['missing','hidden'])await assert.rejects(f.session.propose_archive_change(input([change(id,{}, {intent:'update',expected:1})])),code('NOT_AVAILABLE'));
 await assert.rejects(fixture({authorizeChange:async()=>true}).session.propose_archive_change(input()),code('AUTHORIZATION_REQUIRED'));
 assert.throws(()=>fixture({context:{world:'w',branch:'b',task:'tableAssistant'}}),code('AUTHORIZATION_REQUIRED'));
});
test('model cannot supply host context, non-JSON trees, budget overflow or prohibited tables',async()=>{
 const f=fixture({limits:{maxCalls:2}});await assert.rejects(f.session.propose_archive_change({...input(),source:'forged'}),code('INVALID_PROPOSAL'));
 await assert.rejects(f.session.propose_archive_change(input([change('new:p',{}, {table:'preferences'})])),code('INVALID_PROPOSAL'));
 await assert.rejects(f.session.propose_archive_change(input()),code('BUDGET_EXCEEDED'));
 for(const payload of [JSON.parse('{"requestId":"a","changes":[],"__proto__":{}}'),input([change('new:a',{属性:{bad:NaN}})])])await assert.rejects(fixture().session.propose_archive_change(payload),code('INVALID_PROPOSAL'));
});
test('input is captured before awaiting host guards; disposal and changed guards prevent stale drafts',async()=>{
 let release,waiting=true;const f=fixture({guard:()=>waiting?new Promise(r=>release=r):undefined}),payload=input(),pending=f.session.propose_archive_change(payload);payload.changes[0].values.名称='被改写';waiting=false;release();await pending;assert.equal(f.session.getDraft('request-1').proposal.changes[0].values.名称,'岚');f.session.dispose();await assert.rejects(f.session.propose_archive_change(input()),code('SNAPSHOT_EXPIRED'));
 let count=0;const stale=fixture({guard:()=>{if(++count>2)throw Error('changed');}});await assert.rejects(stale.session.propose_archive_change(input()),/changed/);assert.throws(()=>stale.session.getDraft('request-1'),code('DRAFT_NOT_FOUND'));
});
test('persisted receipts accept only exact original requests and do not revalidate creates as new objects',async()=>{
 const first=fixture();await first.session.propose_archive_change(input());const draft=first.session.getDraft('request-1');
 const recorded=[{requestId:draft.requestId,fingerprint:draft.fingerprint,hash:draft.hash,source:draft.source.key,task:'tableArchive',changes:1}],next=fixture({view:{registry:defaultRegistry(),rows:[row('persisted-id','岚')],last:null},recorded});
 assert.equal((await next.session.propose_archive_change(input())).state,'recorded');assert.equal(next.session.getDraft('request-1').proposal,null);
 await assert.rejects(fixture({recorded}).session.propose_archive_change(input([change('new:changed')])),code('REQUEST_CONFLICT'));
});

test('archive review rejects unknown tables and field paths without expanding the registry',async()=>{
 const registry=defaultRegistry(),before=structuredClone(registry),cases=[
  [change('new:a',{名称:'岚',类型:'character',额外:'不可入模'}),'values.额外'],
  [change('new:a',{名称:'岚',类型:'character',发现环境:{地点:[],额外:'不可入模'}}),'values.发现环境.额外'],
  [change('new:a',{名称:'岚',类型:'character',身份:'错层'}),'values.身份'],
  [change('new:a',{名称:'岚',类型:'character',属性:{描述:'错层'}}),'values.属性.描述'],
  [change('new:a',{名称:'岚',类型:'未登记类型'}),'values.类型'],
  [{...change(),table:'未登记表'},'table'],
 ];
 for(let i=0;i<cases.length;i++){const [op,path]=cases[i];await assert.rejects(fixture({view:{registry,rows:[],last:null}}).session.propose_archive_change(input([op],'schema-'+i)),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('第 1 项')&&e.message.includes(path)&&!e.message.includes('不可入模')&&!e.message.includes('错层')&&!e.message.includes('未登记表'));}
 assert.deepEqual(registry,before);
});

test('registered aliases, inherited attributes and open or json fields remain valid',async()=>{
 const registry=defaultRegistry(),objects=registry.tables.find(t=>t.id==='objects');objects.aliases.push('对象档');objects.fields.名称.aliases=['名字'];objects.fields.属性.aliases=['特征'];objects.fields.发现环境.fields.出现条件.aliases=['条件'];objects.fields.扩展档案={type:'object',additionalProperties:true,fields:{已知:{type:'text',aliases:['登记项']}}};registry.types.find(t=>t.id==='character').fields.身份.aliases=['身份说明'];registry.types.push({id:'hero',name:'英雄',aliases:['勇者'],version:1,parent:'character',fields:{称号:{type:'text',aliases:['头衔']},档案:{type:'object',fields:{代号:{type:'text',aliases:['呼号']}}},集合:{type:'array',items:{type:'object',fields:{代号:{type:'text',aliases:['呼号']}}}},映射:{type:'map',items:{type:'object',fields:{说明:{type:'text',aliases:['备注']}}}}}});
 const aliased=change('new:a',{名字:'岚',类型:'勇者',发现环境:{条件:'夜间'},扩展档案:{登记项:'已有定义',自由键:{深层:true}},特征:{身份说明:'旅人',头衔:'先锋',档案:{呼号:'北辰'},集合:[{呼号:'甲'}],映射:{一:{备注:'乙'}}}},{table:'对象档'}),scene={intent:'create',id:'new:scene',table:'scene',expected:0,values:{名称:'当前场景',标志:{任意:{深层:true}}},access,evidence:'岚在城门。'},state={intent:'create',id:'new:state',table:'state',expected:0,values:{名称:'复杂状态',对象:'new:a',字段:'快照',值:{任意:[1,{深层:false}]}},access,evidence:'岚在城门。'};
 const f=fixture({view:{registry,rows:[],last:null},allowedTables:['objects','scene','state']}),receipt=await f.session.propose_archive_change(input([aliased,scene,state]));assert.equal(receipt.state,'draft');
 const [objectDraft]=f.session.getDraft('request-1').proposal.changes;assert.equal(objectDraft.table,'objects');assert.deepEqual(objectDraft.values.扩展档案,{已知:'已有定义',自由键:{深层:true}});assert.deepEqual(objectDraft.values.属性,{身份:'旅人',称号:'先锋',档案:{代号:'北辰'},集合:[{代号:'甲'}],映射:{一:{说明:'乙'}}});
});

test('an object attribute root and its registered alias cannot overwrite each other in one operation',async()=>{
 const registry=defaultRegistry(),objects=registry.tables.find(t=>t.id==='objects');objects.fields.属性.aliases=['特征'];const view={registry,rows:[],last:null},before=structuredClone(view),calls=[],f=fixture({view,authorizeChange:change=>{calls.push(change.id);return true;}}),payload=input([change('new:a',{名称:'岚',类型:'character',属性:{身份:'先提交'},特征:{身份:'后提交'}})]);
 await assert.rejects(f.session.propose_archive_change(payload),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('第 1 项')&&e.message.includes('values.')&&!/先提交|后提交/.test(e.message));assert.deepEqual(calls,['new:a']);assert.deepEqual(view,before);assert.throws(()=>f.session.getDraft('request-1'),code('DRAFT_NOT_FOUND'));
});

test('updates use inherited fields from an existing registered subtype without creating a manual lock',async()=>{
 const registry=defaultRegistry();registry.types.find(t=>t.id==='character').fields.身份.aliases=['身份说明'];registry.types.push({id:'hero',name:'英雄',aliases:[],version:1,parent:'character',fields:{称号:{type:'text'}}});
 const existing={id:'hero-1',table:'objects',rev:4,values:{名称:'岚',类型:'hero',属性:{身份:'旧身份',称号:'先锋'}},access,source:'old',lockedFields:['名称']},view={registry,rows:[existing],last:null};
 const update={intent:'update',id:'hero-1',table:'objects',expected:4,values:{属性:{身份说明:'新身份'}},access,evidence:'岚在城门。'},f=fixture({view});
 assert.equal((await f.session.propose_archive_change(input([update]))).state,'draft');assert.deepEqual(f.session.getDraft('request-1').proposal.changes[0].values.属性,{身份:'新身份'});assert.deepEqual(view.rows[0],existing);
});

test('schema diagnostics are atomic and run only after every change is authorized',async()=>{
 const calls=[],authorizeChange=change=>{calls.push(change.id);return true;},f=fixture({authorizeChange}),payload=input([change(),change('new:b',{名称:'石',类型:'character',额外:'拒绝'})]);
 await assert.rejects(f.session.propose_archive_change(payload),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('第 2 项')&&e.message.includes('values.额外'));assert.deepEqual(calls,['new:a','new:b']);assert.throws(()=>f.session.getDraft('request-1'),code('DRAFT_NOT_FOUND'));
 const deniedCalls=[],denied=fixture({authorizeChange:change=>{deniedCalls.push(change.id);return change.id!=='new:a';}});await assert.rejects(denied.session.propose_archive_change(payload),e=>e.code==='NOT_AVAILABLE'&&!e.message.includes('values.额外'));assert.deepEqual(deniedCalls,['new:a','new:b']);
});

test('explicit evidence-backed optional fields and nested collections stage together without implicit inference',async()=>{
 const f=fixture({authorizeSchemaChange:()=>true}),before=structuredClone(f.view),payload={...input([change('new:a',{名称:'岚',类型:'character',属性:{通行记录:[{编号:'one',地点:'城门',有效:false}]}})]),schemaChanges:[{kind:'type',id:'character',fields:{通行记录:{type:'array',items:{type:'object',fields:{编号:{type:'text',required:true},地点:{type:'text'},有效:{type:'boolean'}}}}},evidence:'岚在城门。'}]};
 const accepted=await f.session.propose_archive_change(payload);assert.equal(accepted.written,false);const draft=f.session.getDraft(payload.requestId);assert.equal(draft.proposal.schemaChanges[0].fields.通行记录.type,'array');assert.deepEqual(draft.proposal.schemaEvidence,[{kind:'type',id:'character',evidence:'岚在城门。'}]);assert(!JSON.stringify(draft.proposal.schemaChanges).includes('岚在城门'));assert.equal(draft.proposal.changes[0].values.属性.通行记录[0].有效,false);assert.deepEqual(f.view,before);
 const bad=structuredClone(payload);bad.requestId='typo';bad.changes[0].values.属性.通行记彔=[];await assert.rejects(f.session.propose_archive_change(bad),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('通行记彔'));
});

test('new derived type and new archive table require explicit schema and row authorization',async()=>{
 const payload={...input([change('new:a',{名称:'岚',类型:'gate-keeper',属性:{执勤门:'城门'}}),{...change('new:pass',{名称:'通行记录',持有人:'new:a',门:'城门'}),table:'passes'}]),templates:[{id:'gate-keeper',name:'城门守卫',aliases:[],version:1,parent:'character',fields:{执勤门:{type:'text'}},evidence:'岚在城门。'}],schemaChanges:[{kind:'table',definition:{id:'passes',name:'通行记录',aliases:[],version:1,owner:'archive',fields:{名称:{type:'text',required:true},持有人:{type:'ref'},门:{type:'text'}}},evidence:'岚在城门。'}]};
 const schemas=[],rows=[],f=fixture({authorizeSchemaChange:c=>{schemas.push(c);return true;},authorizeChange:(op,_row,_ctx,scope)=>{rows.push([op.table,scope.newTables]);return ['objects',...scope.newTables].includes(op.table);}});
 assert.equal((await f.session.propose_archive_change(payload)).state,'draft');assert.equal(schemas.length,2);assert.deepEqual(rows,[['objects',['passes']],['passes',['passes']]]);assert.equal(f.session.getDraft(payload.requestId).proposal.templates[0].evidence,undefined);
 await assert.rejects(fixture().session.propose_archive_change(payload),code('NOT_AVAILABLE'));
 await assert.rejects(fixture({authorizeSchemaChange:async()=>true}).session.propose_archive_change(payload),code('AUTHORIZATION_REQUIRED'));
 await assert.rejects(fixture({authorizeSchemaChange:()=>true,authorizeChange:op=>op.table==='objects'}).session.propose_archive_change(payload),code('NOT_AVAILABLE'));
});

test('missing evidence, incompatible schema, alias collision and required additions reject the full batch',async()=>{
 const base={...input(),schemaChanges:[{kind:'type',id:'character',fields:{执勤门:{type:'text'}},evidence:'岚在城门。'}]};
 const variants=[p=>delete p.schemaChanges[0].evidence,p=>p.schemaChanges[0].evidence='不存在',p=>p.schemaChanges[0].fields={身份:{type:'number'}},p=>p.schemaChanges[0].fields={执勤门:{type:'text',required:true}},p=>p.schemaChanges[0].fields={新身份:{type:'text',aliases:['身份']}}];
 for(const mutate of variants){const f=fixture({authorizeSchemaChange:()=>true}),before=structuredClone(f.view),p=structuredClone(base);mutate(p);await assert.rejects(f.session.propose_archive_change(p),code('INVALID_PROPOSAL'));assert.deepEqual(f.view,before);assert.throws(()=>f.session.getDraft(p.requestId),code('DRAFT_NOT_FOUND'));}
 const f=fixture({authorizeSchemaChange:()=>false});await assert.rejects(f.session.propose_archive_change({...base,schemaChanges:[{...base.schemaChanges[0],evidence:'隐藏错误'}]}),e=>e.code==='NOT_AVAILABLE'&&!e.message.includes('依据'));
});

test('derived templates cannot shadow inherited field semantics or inherited aliases',async()=>{
 for(const fields of [{身份:{type:'number'}},{另外身份:{type:'text',aliases:['身份']}}]){const f=fixture({authorizeSchemaChange:()=>true}),p={...input([change('new:a',{名称:'岚',类型:'guard'})]),templates:[{id:'guard',name:'守卫',aliases:[],version:1,parent:'character',fields,evidence:'岚在城门。'}]};await assert.rejects(f.session.propose_archive_change(p),code('INVALID_PROPOSAL'));}
});

test('schema input snapshots and request fingerprints include definitions and their evidence',async()=>{
 const payload={...input([change('new:a',{名称:'岚',类型:'character',属性:{执勤门:'城门'}})]),schemaChanges:[{kind:'type',id:'character',fields:{执勤门:{type:'text'}},evidence:'岚在城门。'}]};let release,waiting=true;
 const f=fixture({authorizeSchemaChange:()=>true,guard:()=>waiting?new Promise(r=>release=r):undefined});const pending=f.session.propose_archive_change(payload);payload.schemaChanges[0].fields.执勤门.type='number';waiting=false;release();await pending;assert.equal(f.session.getDraft(payload.requestId).proposal.schemaChanges[0].fields.执勤门.type,'text');await assert.rejects(f.session.propose_archive_change(payload),code('REQUEST_CONFLICT'));
});


test('archive proposals reject unbound temporary IDs in ordinary values but accept explicit nested references',async()=>{
 const actor=change('new:a'),activity={...change('new:activity',{名称:'行动',主体:'new:a',资源:{同伴:'new:a'}}),table:'activities'},p=input([actor,activity]);
 const f=fixture({allowedTables:['objects','activities'],authorizeSchemaChange:()=>true}),before=structuredClone(f.view);
 await assert.rejects(f.session.propose_archive_change(p),e=>e.code==='INVALID_PROPOSAL'&&e.message.includes('第 2 项')&&e.message.includes('values.资源.同伴')&&!e.message.includes('岚'));
 assert.deepEqual(f.view,before);assert.throws(()=>f.session.getDraft(p.requestId),code('DRAFT_NOT_FOUND'));
 const permitted=structuredClone(p);permitted.schemaChanges=[{kind:'table',id:'activities',fields:{相关资源:{type:'object',fields:{同伴:{type:'ref'},其他:{type:'array',items:{type:'refs'}}}}},evidence:'岚在城门。'}];delete permitted.changes[1].values.资源;permitted.changes[1].values.相关资源={同伴:'new:a',其他:[['new:a']]};
 assert.equal((await f.session.propose_archive_change(permitted)).state,'draft');assert.deepEqual(f.view,before);
 const denied=fixture({allowedTables:['objects','activities'],authorizeChange:()=>false});await assert.rejects(denied.session.propose_archive_change(p),e=>e.code==='NOT_AVAILABLE'&&!e.message.includes('values.资源'));
 const quoted=input([change('new:a',{名称:'岚',类型:'character',描述:'原文中的 new:a 是引用示意，不作为关系保存。'})]);assert.equal((await fixture().session.propose_archive_change(quoted)).state,'draft');
});
test('delete intent has explicit host authorization, exact revision and a retained tombstone proposal',async()=>{
 const record=row('actor','岚'),view={registry:defaultRegistry(),rows:[record],last:null},payload=input([change('actor',{}, {intent:'delete',expected:1})]);
 const denied=fixture({view,authorizeChange:op=>op.intent!=='delete'});await assert.rejects(denied.session.propose_archive_change(payload),code('NOT_AVAILABLE'));
 const f=fixture({view});await f.session.propose_archive_change(payload);assert.equal(f.session.getDraft(payload.requestId).proposal.changes[0].delete,true);assert.deepEqual(view.rows,[record]);
 const locked=fixture({view:{...view,rows:[{...record,lockedFields:['名称']}]}});await assert.rejects(locked.session.propose_archive_change(payload),code('INVALID_PROPOSAL'));
 const wrong=fixture({view});await assert.rejects(wrong.session.propose_archive_change(input([change('actor',{}, {intent:'delete',expected:2})])),code('REVISION_CONFLICT'));
});
