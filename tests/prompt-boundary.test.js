import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {PROGRAM_TABLE_IDS,programOwnedTable,compactCreationSchema} from '../engine/prompt-boundary.mjs';
import {createMatrixCreator,validateCreationProposal} from '../engine/creation.mjs';
import {createMatrixHost} from '../engine/host.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8'));
const character=()=>({name:'真实表单人物',unresolved:[],matrix:{binding:{entityId:'person-a',dossierId:'dossier-a'},changes:[{tableId:'T_SYS_ENTITIES',recordId:'person-a',values:{kind:'character',origin_record_ref:'origin-a'}},{tableId:'T_CHAR_DOSSIER',recordId:'dossier-a',values:{name:'青',manifest:'已给定叙述'}},{tableId:'M_FIELD_REFERENCES',recordId:'origin-a',values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:'person-a',owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:'dossier-a',reference_kind:'record'}}]}});
function contaminated(){const e=new Runtime(initializeState(catalog));for(const id of PROGRAM_TABLE_IDS){if(!e.data.schema[id])e.registerTable(id,[{key:'snapshot',type:'JSON'}]);if(!e.data.schema[id].fields.some(f=>f.key==='snapshot'))e.declareField(id,{key:'snapshot',type:'JSON'});e.newRecord(id,{snapshot:{hidden:'SEALED_HISTORY_'+id}},'sealed');}e.newRecord('X_SOCIAL_POSTS',{id:'post-current',text:'当前微博可以读取',visibility:'public'},'post-current');e.newRecord('T_DYN_CURRENCY_BALANCES',{balance:0},'balance-current');e.newRecord('T_DYN_MESSAGE_CONTENT',{kind:'text',text:'当前小剧场消息'},'message-current');return e;}

test('ordinary and author materials never reveal program history, layouts or writable program tables',()=>{for(const audience of ['author','character']){const e=contaminated(),slots=materials(e,{audience}),text=Object.values(slots).join('\n');assert(!text.includes('SEALED_HISTORY_'));for(const id of PROGRAM_TABLE_IDS)assert(!slots.tisya_material_cell_prompts.includes(id+'('));assert(text.includes('当前微博可以读取'));assert(text.includes('当前小剧场消息'));assert(slots.tisya_material_cell_prompts.includes('【'+e.data.schema.X_SOCIAL_POSTS.label+'／序号】'));assert(slots.tisya_material_cell_prompts.includes('【'+e.data.schema.T_DYN_CURRENCY_BALANCES.label+'／序号】'));}});
test('old schemas without new flags still block phone snapshots and dynamic execution containers',()=>{const e=new Runtime(initializeState(catalog));for(const id of ['X_PHONE_FRAMES','X_PHONE_ACTIONS_LIFEACTION','X_PHONE_LIFE_BINDING_WORLD','X_PHONE_LIFE_INITIALIZATION','X_PHONE_SUITE_BRANCHES_PRIVATE_ENVELOPES','X_PHONE_LIFE_STATE_RECEIPTS_RESULT','X_PHONE_LIFE_STATE_SOCIAL_DRAFTS']){e.registerTable(id,[{key:'payload',type:'TEXT'}]);e.newRecord(id,{payload:'PRIVATE_RAW_'+id},'x');}const text=JSON.stringify(materials(e,{audience:'author'}));assert(!text.includes('PRIVATE_RAW_'));assert(!text.includes('X_PHONE_SUITE_BRANCHES_PRIVATE_ENVELOPES'));});
test('current phone rows remain complete without character or row budgets, while aliases and other scopes are omitted',()=>{const e=new Runtime(initializeState(catalog));for(let i=0;i<80;i++)e.newRecord('X_SOCIAL_POSTS',{id:'p'+i,text:'BODY_'+i+' '+('词'.repeat(1000)),visibility:'public',world_ref:'w'},'p'+i);e.newRecord('X_SOCIAL_POSTS',{text:'FOREIGN_WORLD',world_ref:'elsewhere'},'foreign');e.newRecord('X_SOCIAL_POSTS',{text:'DERIVED_ALIAS'},'alias');e.record('X_SOCIAL_POSTS','alias').metadata.phone_projection=true;const before=JSON.stringify(e.data.tables.X_SOCIAL_POSTS),text=JSON.stringify(materials(e,{audience:'author',world_ref:'w'}));assert(text.includes('BODY_0 '));assert(text.includes('BODY_79 '));assert(!text.includes('FOREIGN_WORLD'));assert(!text.includes('DERIVED_ALIAS'));assert.equal(JSON.stringify(e.data.tables.X_SOCIAL_POSTS),before);});
test('one form contains writable labels without a repeated delta dictionary or invented unknown values',()=>{
 const scope={world_ref:'w',branch_ref:'main'},e=new Runtime(initializeState(catalog,scope));
 e.registerTable('DELTA_FIXTURE',[
  {key:'name',label:'名称',type:'TEXT'},{key:'count',label:'数量',type:'NUMBER'},
  {key:'mode',label:'状态',type:'ENUM',enum:['状态甲','状态乙']},{key:'pending',label:'待核',type:'NUMBER'},
  {key:'unseen',label:'未赋值',type:'TEXT'},{key:'foreign_only',label:'异分支字段',type:'TEXT'},
  {key:'hidden_only',label:'隐藏行字段',type:'TEXT'},{key:'alias_only',label:'投影行字段',type:'TEXT'},
  {key:'sealed',label:'密项',type:'TEXT',lock_level:'E'},
  {key:'computed',label:'只读项',type:'NUMBER',read_only:true},
  {key:'omitted',label:'程序项',type:'TEXT',prompt_omit:true},{key:'lock_level',label:'锁级',type:'TEXT'}
 ],'中性映射测试');
 e.newRecord('DELTA_FIXTURE',{name:'当前人',count:0,mode:'状态甲',sealed:'SEALED_VALUE',computed:7,omitted:'PROGRAM_VALUE'},'current');
 e.set('DELTA_FIXTURE#current.pending',null,'unknown');
 e.data.runtime.scope={world_ref:'w',branch_ref:'other'};
 e.newRecord('DELTA_FIXTURE',{foreign_only:'FOREIGN_VALUE'},'foreign');
 e.data.runtime.scope=scope;
 e.newRecord('DELTA_FIXTURE',{hidden_only:'HIDDEN_ROW_VALUE',lock_level:'E'},'hidden');
 e.newRecord('DELTA_FIXTURE',{alias_only:'ALIAS_ROW_VALUE'},'alias');
 e.record('DELTA_FIXTURE','alias').metadata.phone_projection=true;
 const before=JSON.stringify(e.data.tables),slots=materials(e,{...scope,audience:'character'}),prompt=slots.tisya_material_cell_prompts;
 assert.match(prompt,/【中性映射测试／序号】/);
 assert.doesNotMatch(prompt,/DELTA_FIXTURE\(|字段：|密项|只读项|程序项/);
 for(const label of ['名称','数量','状态','待核','未赋值'])assert(prompt.includes(' '+label));
 assert.equal((prompt.match(/状态甲/g)??[]).length,1);
 const visible=Object.values(slots).join('\n');
 assert.match(visible,/数量=0/);assert.match(visible,/待核=\?/);
 for(const marker of ['SEALED_VALUE','PROGRAM_VALUE','FOREIGN_VALUE','HIDDEN_ROW_VALUE','ALIAS_ROW_VALUE'])assert(!visible.includes(marker));
 assert.equal(e.record('DELTA_FIXTURE','current').states.pending,'unknown');
 assert.equal(e.record('DELTA_FIXTURE','current').values.pending,null);
 assert.equal(e.record('DELTA_FIXTURE','current').values.unseen,undefined);
 assert.equal(JSON.stringify(e.data.tables),before);
});
test('creation contract compacts the full actual catalog and excludes program and field payloads',()=>{const state=initializeState(catalog),schema=compactCreationSchema(state);assert(catalog.tables.length>=200);assert(schema.T_CHAR_DOSSIER);assert(schema.T_STATIC_WORLDS);assert(schema.M_FIELD_REFERENCES);assert(schema.X_SOCIAL_POSTS);assert(schema.T_DYN_MESSAGE_CONTENT);for(const id of Object.keys(schema))assert(!programOwnedTable(id,state.schema[id]));assert(!schema.X_PHONE_BINDINGS);assert(!JSON.stringify(schema).includes('source_pointer'));assert(JSON.stringify(schema).length<JSON.stringify(state.schema).length/4);});
test('proposal blocks every program table and forbidden field, but accepts a canonical character with forward references',()=>{const snapshot={state:initializeState(catalog),revision:0,contextKey:'c'};assert.doesNotThrow(()=>validateCreationProposal(character(),snapshot,{kind:'character'}));for(const table of catalog.tables.filter(t=>programOwnedTable(t.id,t))){const p=character();p.matrix.changes.push({tableId:table.id,recordId:'fake',values:{}});assert.throws(()=>validateCreationProposal(p,snapshot,{kind:'character'}),/程序回执|历史快照/);}const bad=character();bad.matrix.changes[2].values.target_row_uuid='missing';assert.throws(()=>validateCreationProposal(bad,snapshot,{kind:'character'}),/原点引用|引用记录不存在/);});
test('real catalog creator integrates with actual Matrix host, derives actor links and never commits a story turn',async()=>{
 const disk=new Map(),ctx={chatId:'creation-real',characterId:1,characters:[{avatar:'other.png'},{avatar:'world.png',data:{name:'原世界',description:'现有来源定义'}}],chat:[],extensionSettings:{},chatMetadata:{},saveChat:async()=>{}};
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,v)=>disk.set(id,structuredClone(v)),commit:async(id,revision,v)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,structuredClone(v));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>{}});await host.ensureDatabase();let input;
 const creator=createMatrixCreator({database:{read:()=>host.readDatabase(),commit:p=>host.commitDatabase(p)},getContext:()=>ctx,request:async(_task,raw)=>{input=JSON.parse(raw);return '<reply><title>真实表单人物</title><body>1 已给定人物。</body><cells>【人物原点档案／1】\n1 显示名称：青\n20 公开身份：河口旅人\n24 整体体貌：颀长</cells><vars/><archive/></reply>';}});
 const draft=await creator.draft('创建人物',{kind:'character'});assert.match(input.forms,/人物原点档案/);assert.doesNotMatch(input.forms,/X_PHONE_BINDINGS|source_pointer|row_uuid/);assert.equal(input.schema,undefined);assert.equal(input.output,undefined);
 const {entityId,dossierId}=draft.proposal.matrix.binding,saved=await creator.save(draft);assert.equal(saved.state.tables.T_SYS_ENTITIES[entityId].values.name,'青');assert.equal(saved.state.tables.T_SYS_ENTITIES[entityId].states.name,'derived');assert.equal(saved.state.tables.T_CHAR_DOSSIER[dossierId].values.public_identity,'河口旅人');assert.equal(saved.state.tables.T_CHAR_DOSSIER[dossierId].values.overall_physique,'颀长');assert.equal(saved.state.tables.T_CHAR_DOSSIER[dossierId].values.manifest,undefined);assert.equal(saved.state.runtime.turn_order.length,0);assert.equal(Object.keys(saved.state.runtime.sources).length,0);const again=await creator.save(draft);assert.equal(again.receipt.replayed,true);
});
