import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials,materialFormTables} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {acceptReply,recall} from '../engine/reply.mjs';
import {compileWorkbookPayload} from '../engine/mechanical_runtime.mjs';

const scope={world_ref:'world-a',session_ref:'session',branch_ref:'main',audience:'author'};
const engine=()=>new Runtime(initializeState(catalog,scope));
const context=(e,options={})=>prepareMatrixSheets({state:e.data},{operationId:'minimal-test',kind:'rows',mode:'revise',task:'main',...options});
function section(c,id,values,{number=1,heading,legacy=false}={}){const t=c.catalog.templates.find(t=>t.id===id);assert(t,id);return '【'+(heading??t.label+'／'+number)+'】\n'+Object.entries(values).map(([key,value])=>{const f=t.fields.find(f=>f.key===key);assert(f,key);return (legacy?t.fields.indexOf(f)+1:f.row)+' '+f.label+'：'+value;}).join('\n');}
const reply=cells=>'<reply><title>渡口记录</title><body>1 渡口登记了来客的姓名。\n\n2 账目归零，灯尚未点亮。</body><cells format="form">'+cells+'</cells><archive format="form"/></reply>';
function apply(e,c,text){const accepted=acceptMatrixSheets(c,{state:e.data},{blocks:{title:'渡口记录',body:'有据资料',cells:text}});applyMatrixChanges(e,accepted.proposal.matrix.changes);return accepted;}
const child=(e,parent,field,table)=>e.rows(table)[parent.values[field]].values;

test('empty main forms retain canonical creation and empty custom business tables, and expand enabled apps without a dictionary',()=>{
 const e=engine();e.registerTable('TRAVEL_JOURNAL',[{key:'name',label:'标题',type:'TEXT'},{key:'count',label:'计数',type:'NUMBER'}],'行旅见闻');
 let slots=materials(e),form=slots.tisya_material_cell_prompts;
 for(const label of ['人物原点档案','地点底档','双层历史事件','行旅见闻'])assert(form.includes('【'+label+'／序号】'),label);
 for(const marker of ['用途：','关联说明：','字段：','@TIME:','owner_table','source_key','sha256=','【格位引用／序号】','【列表原子与关联／序号】','【读取与披露规则／序号】','【新参数注册表单／序号】'])assert(!form.includes(marker),marker);
 assert(!materialFormTables(e,{},scope).includes('R_TYPED_VALUES'));
 const social=e.data.schema.X_SOCIAL_POSTS.label;assert(!form.includes('【'+social+'／序号】'));
 e.newRecord('X_PHONE_WORLD_CONFIG',{world_ref:'world-a',apps:['weibo','music']},'apps');form=materials(e).tisya_material_cell_prompts;
 assert(form.includes('【'+social+'／序号】'));assert(materialFormTables(e,{},scope).some(id=>id.startsWith('X_MEDIA_')));
 const creation=context(e,{task:'tableGenesis'}).form;assert(creation.includes('【数值与量纲／序号】'));assert(creation.includes('【效果与数值变化／序号】'));
});

for(const legacy of [false,true])test('schema row gaps and '+(legacy?'legacy compact':'canonical')+' rows preserve typed cells and exact paragraph evidence',()=>{
 const e=engine();e.registerTable('NEUTRAL_ROWS',[
  {key:'hidden',label:'内部',type:'TEXT',prompt_omit:true},{key:'name',label:'名称',type:'TEXT',required:true},
  {key:'count',label:'数目',type:'NUMBER'},{key:'active',label:'点亮',type:'BOOLEAN'},
  {key:'empty',label:'备注',type:'TEXT'},{key:'pending',label:'待核',type:'NUMBER'},{key:'derived',label:'计算项',type:'NUMBER',read_only:true}
 ],'中性行表');const c=context(e),t=c.catalog.templates.find(t=>t.id==='NEUTRAL_ROWS');
 assert.equal(t.fields.find(f=>f.key==='name').row,e.data.schema.NEUTRAL_ROWS.fields.findIndex(f=>f.key==='name')+1);
 assert(!t.fields.some(f=>['row_uuid','hidden','derived'].includes(f.key)));
 const raw=reply(section(c,'NEUTRAL_ROWS',{name:'阿青 | P1',count:'0 | P2',active:'否 | P2',empty:'"" | P1',pending:'? | P2'},{legacy})),result=acceptReply(e,raw,'typed-'+legacy);
 assert.equal(result.result.operations[0].status,'COMMITTED',JSON.stringify(result.result));const row=Object.values(e.rows('NEUTRAL_ROWS'))[0];
 assert.equal(row.values.count,0);assert.equal(row.values.active,false);assert.equal(row.values.empty,'');assert.equal(row.values.pending,null);assert.equal(row.states.pending,'unknown');assert.equal(row.values.hidden,undefined);
 assert.equal(row.metadata.name.source_pointer.paragraph_reference,'P1');assert.equal(row.metadata.count.source_pointer.paragraph_reference,'P2');assert.equal(row.metadata.active.source_pointer.paragraph_reference,'P2');assert.equal(row.metadata.empty.source_pointer.paragraph_reference,'P1');
 assert.equal(e.data.runtime.sources['main/typed-'+legacy+'@1'].reply_raw,raw);assert.match(recall(e,'渡口')[0].fragments[0].raw_block,/来客的姓名/);
 const projected=materials(e,scope,'渡口');assert.match(projected.tisya_material_memory_excerpt,/第1条已接纳回复.*P1/s);assert.doesNotMatch(projected.tisya_material_memory_excerpt,/sha256|typed-(?:true|false)@/);
});

test('duplicate field labels remain stable across author and ordinary scopes',()=>{
 const e=engine();e.registerTable('SAME_LABEL',[{key:'private',label:'说明',type:'TEXT',lock_level:'D'},{key:'public',label:'说明',type:'TEXT'}],'双说明');
 const author=context(e,{scope:{...scope,audience:'author'}}),reader=context(e,{scope:{...scope,audience:'character'}}),get=c=>c.catalog.templates.find(t=>t.id==='SAME_LABEL').fields.find(f=>f.key==='public');
 assert.deepEqual([get(author).row,get(author).label],[get(reader).row,get(reader).label]);assert.equal(get(reader).label,'说明〔2〕');
});

test('same-batch new actors, non-character instances and named references round trip with ambiguity rejected',()=>{
 const e=engine();e.registerTable('ASSIGNMENTS',[{key:'name',label:'事项',type:'TEXT'},{key:'person',label:'来客',type:'REF',ref:'T_SYS_ENTITIES'},{key:'object',label:'物件',type:'REF',ref:'T_SYS_ENTITIES'}],'登记事项');const c=context(e);
 const text=[section(c,'ASSIGNMENTS',{name:'搬运',person:'阿青',object:'木箱'}),section(c,'T_CHAR_DOSSIER',{name:'阿青',core_personality_tags:'审慎；数值：0；布尔：否；关联：人物原点档案／2'}),section(c,'T_CHAR_DOSSIER',{name:'阿白'},{number:2}),section(c,'T_SYS_ENTITIES',{kind:'item',instance_name:'木箱'})].join('\n');
 apply(e,c,text);const assignment=Object.values(e.rows('ASSIGNMENTS'))[0];assert.equal(e.rows('T_SYS_ENTITIES')[assignment.values.person].values.name,'阿青');assert.equal(e.rows('T_SYS_ENTITIES')[assignment.values.object].values.instance_name,'木箱');
 const items=Object.values(e.rows('M_LIST_VALUES')).map(r=>r.values);assert(items.some(v=>v.number_value===0));assert(items.some(v=>v.boolean_value===false));assert(items.some(v=>v.item_type==='reference'));
 const old=Object.entries(e.rows('T_SYS_ENTITIES')).find(([,r])=>r.values.name==='阿青')[1];e.newRecord('T_SYS_ENTITIES',{kind:'character',instance_name:'阿青'},'duplicate');e.set('T_SYS_ENTITIES#duplicate.name','阿青','derived');
 const ambiguous=context(e,{operationId:'duplicate-test'});assert.throws(()=>apply(e,ambiguous,section(ambiguous,'ASSIGNMENTS',{name:'重名',person:'阿青'})),/重名/);assert.equal(old.values.name,'阿青');
 const target=ambiguous.references.find(r=>r.tableId==='T_SYS_ENTITIES'&&r.recordId!=='duplicate'&&r.name==='阿青');apply(e,ambiguous,section(ambiguous,'ASSIGNMENTS',{name:'明确对象',person:target.display}));
});

test('scope filtering matches visible materials, permits local same-name creation and rejects foreign headings',()=>{
 const e=engine();e.registerTable('SCOPE_PEOPLE',[{key:'name',label:'名称',type:'TEXT'},{key:'count',label:'数值',type:'NUMBER'}],'同行登记');e.data.runtime.scope={...scope,world_ref:'world-b'};e.newRecord('SCOPE_PEOPLE',{name:'同名',count:9},'foreign');const foreign=context(e).references.find(r=>r.recordId==='foreign').display;e.data.runtime.scope=scope;
 const c=context(e);assert(!c.references.some(r=>r.recordId==='foreign'));assert(!Object.values(materials(e)).join('\n').includes(foreign));
 let result=acceptReply(e,reply(section(c,'SCOPE_PEOPLE',{count:'1'},{heading:foreign})),'foreign-write');assert.equal(result.result.operations[0].status,'FAILED');assert.equal(e.rows('SCOPE_PEOPLE').foreign.values.count,9);assert.equal(Object.keys(e.rows('SCOPE_PEOPLE')).length,1);
 result=acceptReply(e,reply(section(c,'SCOPE_PEOPLE',{name:'同名',count:'0'})),'local-create');assert.equal(result.result.operations[0].status,'COMMITTED');const local=Object.entries(e.rows('SCOPE_PEOPLE')).find(([id])=>id!=='foreign');assert(local);assert.equal(local[1].values.count,0);
 const meta=Object.values(e.rows('X_RECORD_META')).find(r=>r.values.table_id==='SCOPE_PEOPLE'&&r.values.record_id===local[0]);assert.equal(meta.values.scope_world_id,'world-a');
});

test('explicit inline business descriptions, zero quantities, false observations and disclosure preserve canonical child storage',()=>{
 const e=engine();e.newRecord('M_UNITS',{scope_world_id:'world-a',label:'岁',dimension:'time'},'years');const c=context(e);
 const text=section(c,'T_CHAR_DOSSIER',{name:'阿青',age_raw:'数值：0；单位：岁',birth_time:'原文：约在上一次春汛',negotiation_conditions:'观察：否；依据：未见约定凭证'})+'\n'+section(c,'T_CHAR_SECRETS',{name:'旧门钥匙',char_ref:'阿青',fact_proposition:'钥匙还在匣中',allowed_disclosure_positions:'受众：阿青；动作：披露；决定：禁止；依据：本人尚未告知旁人'});
 const accepted=apply(e,c,text),person=Object.values(e.rows('T_CHAR_DOSSIER'))[0];assert.equal(child(e,person,'age_raw','M_QUANTITIES').value,0);assert.equal(child(e,person,'age_raw','M_QUANTITIES').quantity_mode,'exact');assert.equal(child(e,person,'birth_time','M_WORLD_TIME').original_text,'约在上一次春汛');assert.equal(child(e,person,'birth_time','M_WORLD_TIME').year,undefined);assert.equal(child(e,person,'negotiation_conditions','M_CONDITIONS').observed_result,false);
 const secret=Object.values(e.rows('T_CHAR_SECRETS'))[0],access=child(e,secret,'allowed_disclosure_positions','M_ACCESS_RULES');assert.equal(access.decision,'deny');assert.equal(access.permission,'disclose');assert.equal(access.audience_kind,'character');assert(accepted.proposal.matrix.changes.every(v=>!Object.hasOwn(v.values,'row_uuid')));
 const edit=context(e),heading=edit.references.find(r=>r.tableId==='T_CHAR_DOSSIER').display;
 for(const value of ['0','数值：0','数值：0；单位：不存在'])assert.throws(()=>apply(e,edit,section(edit,'T_CHAR_DOSSIER',{age_raw:value},{heading})));
 assert.throws(()=>apply(e,edit,section(edit,'T_CHAR_DOSSIER',{age_raw:'描述：仍然年幼'},{heading})),/已有精确值/);
 assert.throws(()=>apply(e,edit,section(edit,'T_CHAR_DOSSIER',{negotiation_conditions:'观察：未知；依据：尚无证据'},{heading})),/TRUE\/FALSE/);
 assert.throws(()=>apply(e,edit,section(edit,'T_CHAR_SECRETS',{name:'未定',allowed_disclosure_positions:'受众：公开；动作：披露；依据：不详'})),/明确决定/);
});

test('description adapters preserve explicit prose without executing it and reject replacement of executable rules',()=>{
 const e=engine(),c=context(e),text=[section(c,'T_STATIC_PLACES',{name:'渡口',spatial_scale:'描述：两岸相望',resource_transition_rules:'描述：雨季木材较少'}),section(c,'T_STATIC_WORLD_RULES',{name:'航行规则',effect:'描述：逆风时旗面展开'}),section(c,'T_DYN_EVENTS',{title:'验票',time_span:'起始轮次：0；结束轮次：2'})].join('\n');apply(e,c,text);
 const place=Object.entries(e.rows('T_STATIC_PLACES'))[0],rule=Object.values(e.rows('T_STATIC_WORLD_RULES'))[0],event=Object.values(e.rows('T_DYN_EVENTS'))[0];assert.equal(child(e,place[1],'spatial_scale','M_QUANTITIES').narrative,'两岸相望');assert.equal(child(e,place[1],'resource_transition_rules','M_POLICY_RULES').implementation_kind,'narrative_only');assert.equal(child(e,rule,'effect','M_EFFECTS').operation,'narrative_only');assert.equal(child(e,event,'time_span','M_TIME_RANGES').start_turn,0);
 const policy=place[1].values.resource_transition_rules;e.set(['M_POLICY_RULES',policy,'implementation_kind',[]],'registered_script');e.set(['M_POLICY_RULES',policy,'script_key',[]],'TIMER_TICK');const edit=context(e),heading=edit.references.find(r=>r.tableId==='T_STATIC_PLACES'&&r.recordId===place[0]).display;assert.throws(()=>apply(e,edit,section(edit,'T_STATIC_PLACES',{resource_transition_rules:'描述：现在改口了'},{heading})),/已有精确值或执行规则/);assert.equal(e.rows('M_POLICY_RULES')[policy].values.script_key,'TIMER_TICK');
});

test('direct record and field names compile canonical reference rows while wrong or ambiguous fields fail',()=>{
 const e=engine(),c=context(e),text=section(c,'T_STATIC_ITEMS_SKILLS',{name:'青铜钥匙'})+'\n'+section(c,'T_SYS_ENTITIES',{kind:'item',instance_name:'小钥匙',origin_record_ref:'物品技能配方／1'});apply(e,c,text);const entity=Object.values(e.rows('T_SYS_ENTITIES'))[0],ref=child(e,entity,'origin_record_ref','M_FIELD_REFERENCES');assert.equal(ref.target_table,'T_STATIC_ITEMS_SKILLS');assert.equal(ref.reference_kind,'record');assert.equal(e.rows('T_STATIC_ITEMS_SKILLS')[ref.target_row_uuid].values.name,'青铜钥匙');
 const edit=context(e),heading=edit.references.find(r=>r.tableId==='T_SYS_ENTITIES').display,target=edit.references.find(r=>r.tableId==='T_STATIC_ITEMS_SKILLS').display;apply(e,edit,section(edit,'T_SYS_ENTITIES',{type_ref:target+' → 名称'},{heading}));assert.equal(child(e,entity,'type_ref','M_FIELD_REFERENCES').target_field,'name');assert.throws(()=>apply(e,edit,section(edit,'T_SYS_ENTITIES',{type_ref:target+' → 不存在'},{heading})),/字段名称/);
});

test('visible duplicate names keep their original full-table reference suffix across scope changes',()=>{
 const e=engine();e.registerTable('SCOPE_LABELS',[{key:'name',label:'名称',type:'TEXT'},{key:'count',label:'数值',type:'NUMBER'}],'重名登记');e.data.runtime.scope={...scope,world_ref:'world-b'};e.newRecord('SCOPE_LABELS',{name:'同名',count:1},'foreign');e.data.runtime.scope=scope;e.newRecord('SCOPE_LABELS',{name:'同名',count:2},'local');
 const full=context(e,{task:'tableGenesis'}).references.find(r=>r.tableId==='SCOPE_LABELS'&&r.recordId==='local'),c=context(e),visible=c.references.find(r=>r.tableId==='SCOPE_LABELS'&&r.recordId==='local');assert.equal(visible.display,full.display);assert.match(visible.display,/〔2〕$/);assert(!c.references.some(r=>r.recordId==='foreign'));
 const raw=reply(section(c,'SCOPE_LABELS',{count:'0 | P2'},{heading:full.display})),result=acceptReply(e,raw,'old-title');assert.equal(result.result.operations[0].status,'COMMITTED');assert.equal(e.rows('SCOPE_LABELS').local.values.count,0);assert.equal(e.rows('SCOPE_LABELS').foreign.values.count,1);
});

test('inline exact atoms reject embedded unknown markers, while a whole unknown cell preserves its state',()=>{
 for(const marker of ['?','~','!','∅','—']){const e=engine();e.newRecord('M_UNITS',{scope_world_id:'world-a',label:'岁',dimension:'time'},'years');const c=context(e);
  for(const values of [{name:'阿青',age_raw:'数值：'+marker+'；单位：岁'},{name:'阿青',negotiation_conditions:'观察：'+marker+'；依据：未确认'}])assert.throws(()=>apply(e,c,section(c,'T_CHAR_DOSSIER',values)),/须明确/);
  assert.throws(()=>apply(e,c,section(c,'T_DYN_EVENTS',{title:'验票',time_span:'起始轮次：'+marker+'；结束轮次：'+marker})),/须明确/);
  assert.equal(Object.keys(e.rows('T_CHAR_DOSSIER')).length,0);assert.equal(Object.keys(e.rows('M_QUANTITIES')).length,0);
 }
 const e=engine(),c=context(e);apply(e,c,section(c,'T_CHAR_DOSSIER',{name:'阿青',age_raw:'?'}));const row=Object.values(e.rows('T_CHAR_DOSSIER'))[0];assert.equal(row.values.age_raw,null);assert.equal(row.states.age_raw,'unknown');assert.equal(Object.keys(e.rows('M_QUANTITIES')).length,0);
});

test('locked rows and fields cannot reenter main acceptance by saved headings or legacy row numbers',()=>{
 const e=engine();e.registerTable('LOCKED_ROWS',[{key:'name',label:'名称',type:'TEXT'},{key:'private',label:'密项',type:'TEXT',lock_level:'D'},{key:'count',label:'数值',type:'NUMBER'},{key:'lock_level',label:'锁级',type:'TEXT'}],'受限登记');e.newRecord('LOCKED_ROWS',{name:'私密',private:'原值',count:7,lock_level:'D'},'hidden');e.newRecord('LOCKED_ROWS',{name:'公开',private:'原值',count:1},'public');const author=context(e),hidden=author.references.find(r=>r.recordId==='hidden').display,publicHeading=author.references.find(r=>r.recordId==='public').display;e.data.runtime.scope={...scope,audience:'character'};
 for(const cells of [section(author,'LOCKED_ROWS',{count:'0'},{heading:hidden}),section(author,'LOCKED_ROWS',{private:'改值'},{heading:publicHeading,legacy:true})]){const result=acceptReply(e,reply(cells),'locked-'+cells.length);assert.equal(result.result.operations[0].status,'FAILED');}
 assert.equal(e.rows('LOCKED_ROWS').hidden.values.count,7);assert.equal(e.rows('LOCKED_ROWS').public.values.private,'原值');assert.equal(Object.keys(e.rows('LOCKED_ROWS')).length,2);
});

test('repeated inline edits reuse the canonical child and unknown state survives the mechanical compiler without a downgrade bypass',()=>{
 const e=engine();e.registerTable('T_PERIOD_NOTES',[{key:'name',label:'名称',type:'TEXT'},{key:'period',label:'期间',type:'CHILD_REF',ref:'M_TIME_RANGES',source_type:'LONG_TEXT'}],'期间记录');let childId;
 const values=['起始轮次：0；结束轮次：1','起始轮次：0；结束轮次：2','?','描述：一段时间','起始轮次：0；结束轮次：3'];
 for(const [i,value]of values.entries()){
  const c=context(e),heading=i?c.references.find(r=>r.tableId==='T_PERIOD_NOTES').display:undefined,cells=section(c,'T_PERIOD_NOTES',{...(!i?{name:'渡口值守'}:{}),period:value+' | P2'},{heading}),result=acceptReply(e,reply(cells),'period-edit-'+i);
  assert.equal(result.result.operations[0].status,i===3?'FAILED':'COMMITTED',JSON.stringify(result.result));
  const children=Object.entries(e.rows('M_TIME_RANGES'));assert.equal(children.length,1);childId??=children[0][0];assert.equal(children[0][0],childId);
  const compiled=compileWorkbookPayload(e.mechanicalPayload()).tables.T_PERIOD_NOTES[0];
  if(i===2||i===3){assert.equal(compiled.__value_states.period,'unknown');assert.equal(compiled.period,null);assert.equal(children[0][1].values.end_turn,2);}
  else{assert.equal(compiled.__value_states.period,'known');assert.equal(compiled.period.start_turn,0);assert.equal(compiled.period.end_turn,i===4?3:i+1);assert.equal(children[0][1].metadata.end_turn.source_pointer.paragraph_reference,'P2');}
 }
});

test('an explicit quantity edit cannot retain a stale range branch or clear a registered formula into a plain number',()=>{
 const e=engine();e.newRecord('M_UNITS',{scope_world_id:'world-a',unit_key:'years',label:'岁',dimension:'time'},'years');e.registerTable('T_QUANTITY_NOTES',[{key:'name',label:'名称',type:'TEXT'},{key:'amount',label:'年龄资料',type:'CHILD_REF',ref:'M_QUANTITIES',source_type:'LONG_TEXT'}],'数值记录');
 e.newRecord('T_QUANTITY_NOTES',{name:'有界资料',amount:'quantity'},'note');e.newRecord('M_QUANTITIES',{owner_table:'T_QUANTITY_NOTES',owner_row_uuid:'note',owner_field:'amount',quantity_mode:'range',minimum:0,maximum:2,unit_ref:'years',value_state:'known'},'quantity');
 const c=context(e),heading=c.references.find(r=>r.tableId==='T_QUANTITY_NOTES').display;apply(e,c,section(c,'T_QUANTITY_NOTES',{amount:'数值：0；单位：岁'},{heading}));assert.equal(Object.keys(e.rows('M_QUANTITIES')).length,1);assert.equal(e.rows('M_QUANTITIES').quantity.states.minimum,'unset');const compiled=compileWorkbookPayload(e.mechanicalPayload()).tables.T_QUANTITY_NOTES[0];assert.equal(compiled.amount.value,0);
 e.set('M_QUANTITIES#quantity.quantity_mode','formula');e.set('M_QUANTITIES#quantity.formula_ref','registered-formula');assert.throws(()=>apply(e,context(e),section(context(e),'T_QUANTITY_NOTES',{amount:'数值：1；单位：岁'},{heading})),/已有精确值或执行规则/);assert.equal(e.rows('M_QUANTITIES').quantity.values.formula_ref,'registered-formula');
});

test('empty and replaced lists stay empty/current through mechanical export and canonical save/load while historical rows remain',()=>{
 const e=engine();e.registerTable('T_LIST_NOTES',[{key:'name',label:'名称',type:'TEXT'},{key:'items',label:'条目',type:'CHILD_REF',ref:'M_LIST_VALUES'}],'行旅列表');let parentId;
 const cases=[['甲；数值：0；布尔：否',['甲',0,false]],['无',[]],['乙；丙',['乙','丙']]];
 for(const [index,[value,expected]]of cases.entries()){
  const c=context(e),heading=index?c.references.find(r=>r.tableId==='T_LIST_NOTES').display:undefined,result=acceptReply(e,reply(section(c,'T_LIST_NOTES',{...(!index?{name:'渡口清单'}:{}),items:value},{heading})),'list-turn-'+index);assert.equal(result.result.operations[0].status,'COMMITTED');parentId??=Object.keys(e.rows('T_LIST_NOTES'))[0];
  const stored=JSON.stringify(e.data),payload=e.mechanicalPayload(),compiled=compileWorkbookPayload(payload);assert.deepEqual(compiled.tables.T_LIST_NOTES[0].items,expected);assert.deepEqual(compileWorkbookPayload(JSON.parse(JSON.stringify(payload))).tables.T_LIST_NOTES[0].items,expected);const restored=new Runtime(JSON.parse(stored));assert.deepEqual(compileWorkbookPayload(restored.mechanicalPayload()).tables.T_LIST_NOTES[0].items,expected);assert.equal(JSON.stringify(e.data),stored);
 }
 assert.equal(Object.keys(e.rows('M_LIST_VALUES')).length,5);assert.equal(e.rows('T_LIST_NOTES')[parentId].values.items.length,2);
});

test('mechanical export distinguishes absent legacy parent cells from explicit null states and honors multi-item child references',()=>{
 const e=engine();e.registerTable('T_IMPORT_NOTES',[{key:'name',label:'名称',type:'TEXT'},{key:'items',label:'条目',type:'CHILD_REF',ref:'M_LIST_VALUES'},{key:'description',label:'说明',type:'TEXT'}],'导入记录');e.newRecord('T_IMPORT_NOTES',{name:'旧来源'},'note');
 for(const [index,text]of ['甲','乙'].entries())e.newRecord('M_LIST_VALUES',{owner_table:'T_IMPORT_NOTES',owner_row_uuid:'note',owner_field:'items',sequence:index+1,item_type:'text',text_value:text,value_state:'known'},'item-'+index);
 const compile=()=>compileWorkbookPayload(e.mechanicalPayload()).tables.T_IMPORT_NOTES[0];assert.deepEqual(compile().items,['甲','乙']);
 for(const state of ['unset','unknown','none','cleared','not_applicable']){e.set('T_IMPORT_NOTES#note.items',null,state);const row=compile();assert.equal(row.items,null);assert.equal(row.__value_states.items,state);assert.equal(Object.keys(e.rows('M_LIST_VALUES')).length,2);const restored=new Runtime(JSON.parse(JSON.stringify(e.data)));assert.equal(compileWorkbookPayload(restored.mechanicalPayload()).tables.T_IMPORT_NOTES[0].__value_states.items,state);}
 e.set('T_IMPORT_NOTES#note.items',['item-1'],'known');assert.deepEqual(compile().items,['乙']);e.set('T_IMPORT_NOTES#note.items',['item-0','item-1'],'known');assert.deepEqual(compile().items,['甲','乙']);
 // A scalar field never becomes a CHILD_REF selector solely because its value
 // happens to look like a child ID.
 e.set('T_IMPORT_NOTES#note.description','unrelated');e.newRecord('M_LIST_VALUES',{owner_table:'T_IMPORT_NOTES',owner_row_uuid:'note',owner_field:'description',sequence:1,item_type:'text',text_value:'旧结构来源',value_state:'known'},'legacy-scalar');assert(e.mechanicalPayload().child_tables.M_LIST_VALUES.some(row=>row.row_uuid==='legacy-scalar'));
});


test('custom partition business tables remain writable when empty, including journal/receipt names, and round trip real typed values',()=>{
 for(const [index,id]of ['NEUTRAL_CUSTOM','TRAVEL_JOURNAL','TRAVEL_RECEIPT'].entries()){
  const e=engine(),label='自定义业务'+index;e.registerTable(id,[{key:'name',label:'名称',type:'TEXT',required:true},{key:'amount',label:'金额',type:'NUMBER'},{key:'active',label:'启用',type:'BOOLEAN'}],label);Object.assign(e.data.schema[id],{partition:'CUSTOM',sheet:'规则与执行'});
  assert(materials(e).tisya_material_cell_prompts.includes('【'+label+'／序号】'));
  const c=context(e),result=acceptReply(e,reply(section(c,id,{name:'中性业务'+index+' | P1',amount:'0 | P2',active:'否 | P2'})),'custom-business-'+index);assert.equal(result.result.operations[0].status,'COMMITTED',JSON.stringify(result.result));const row=Object.values(e.rows(id))[0];assert.equal(row.values.amount,0);assert.equal(row.values.active,false);assert.equal(row.metadata.amount.source_pointer.paragraph_reference,'P2');
  const slots=materials(e);assert(slots.tisya_material_cell_prompts.includes('【'+label+'／序号】'));assert(Object.values(slots).join('\n').includes('中性业务'+index));
  e.data.schema[id].program_owned=true;assert(!materials(e).tisya_material_cell_prompts.includes('【'+label+'／序号】'));assert.equal(Object.values(e.rows(id))[0].values.amount,0);
 }
});


test('main inline cell references share field visibility while readable derived fields and authorized author/creation paths remain available',()=>{
 const e=engine();e.data.runtime.scope={...scope,audience:'character'};
 e.registerTable('T_COORD_TARGET',[{key:'name',label:'名称',type:'TEXT'},{key:'secret',label:'保密数值',type:'NUMBER',lock_level:'D'},{key:'computed',label:'汇总值',type:'NUMBER',read_only:true},{key:'internal',label:'程序数值',type:'NUMBER',program_owned:true},{key:'omitted',label:'未公开数值',type:'NUMBER',prompt_omit:true},{key:'true_name',label:'真名',type:'TEXT'},{key:'true_name_lock',label:'真名锁级',type:'TEXT'}],'中性坐标对象');
 e.newRecord('T_COORD_TARGET',{name:'对象甲',secret:9,computed:0,internal:4,omitted:3,true_name:'密名甲',true_name_lock:'D'},'target');e.set('T_COORD_TARGET#target.computed',0,'derived');
 e.registerTable('T_COORD_OWNER',[{key:'name',label:'名称',type:'TEXT'},{key:'link',label:'关联格',type:'CHILD_REF',ref:'M_FIELD_REFERENCES',source_type:'TEXT'}],'中性坐标引用');
 const c=context(e),target=c.references.find(r=>r.tableId==='T_COORD_TARGET').display;
 assert(!Object.values(materials(e)).join('\n').includes('密名甲'));
 for(const [index,label]of ['保密数值','程序数值','未公开数值','真名'].entries()){
  const result=acceptReply(e,reply(section(c,'T_COORD_OWNER',{name:'受限引用'+index,link:target+' → '+label})),'blocked-coordinate-'+index);assert.equal(result.result.operations[0].status,'FAILED');assert.match(result.result.operations[0].error.message,/本次不可读/);
 }
 assert.equal(Object.keys(e.rows('T_COORD_OWNER')).length,0);assert.equal(Object.keys(e.rows('M_FIELD_REFERENCES')).length,0);
 let result=acceptReply(e,reply(section(c,'T_COORD_OWNER',{name:'可读汇总',link:target+' → 汇总值'})),'readable-coordinate');assert.equal(result.result.operations[0].status,'COMMITTED');assert(Object.values(e.rows('M_FIELD_REFERENCES')).some(r=>r.values.target_field==='computed'));
 e.data.runtime.scope={...scope,audience:'author'};const author=context(e);result=acceptReply(e,reply(section(author,'T_COORD_OWNER',{name:'作者核对',link:target+' → 真名'})),'author-coordinate');assert.equal(result.result.operations[0].status,'COMMITTED');assert(Object.values(e.rows('M_FIELD_REFERENCES')).some(r=>r.values.target_field==='true_name'));
 e.data.runtime.scope={...scope,audience:'character'};const creation=context(e,{task:'tableGenesis',operationId:'explicit-creation-coordinate'});apply(e,creation,section(creation,'T_COORD_OWNER',{name:'授权创作资料',link:target+' → 保密数值'}));assert(Object.values(e.rows('M_FIELD_REFERENCES')).some(r=>r.values.target_field==='secret'));
});


test('canonical headings that collide with legacy aliases are rejected instead of selecting the first record',()=>{
 const e=engine();e.registerTable('T_ALIAS_FIXTURE',[{key:'name',label:'名称',type:'TEXT'},{key:'instance_name',label:'实例名',type:'TEXT'},{key:'count',label:'计数',type:'NUMBER'}],'中性别名业务');e.newRecord('T_ALIAS_FIXTURE',{instance_name:'甲',count:11},'first-row');e.newRecord('T_ALIAS_FIXTURE',{name:'第1项',count:22},'second-row');e.newRecord('T_ALIAS_FIXTURE',{instance_name:'乙',count:33},'third-row');
 const c=context(e),refs=c.references.filter(r=>r.tableId==='T_ALIAS_FIXTURE'),first=refs.find(r=>r.recordId==='first-row'),second=refs.find(r=>r.recordId==='second-row'),third=refs.find(r=>r.recordId==='third-row');assert.equal(first.legacyDisplay,second.display);
 const before=JSON.stringify(e.rows('T_ALIAS_FIXTURE')),cells=section(c,'T_ALIAS_FIXTURE',{count:'0 | P1'},{heading:second.display}),raw=reply(cells),result=acceptReply(e,raw,'alias-collision');assert.equal(result.result.operations[0].status,'FAILED');assert.match(result.result.operations[0].error.message,/标题有歧义/);assert.equal(JSON.stringify(e.rows('T_ALIAS_FIXTURE')),before);assert.equal(e.data.runtime.sources['main/alias-collision@1'].reply_raw,raw);
 const legacy=acceptReply(e,reply(section(context(e),'T_ALIAS_FIXTURE',{count:'0 | P2'},{heading:third.legacyDisplay})),'unique-legacy');assert.equal(legacy.result.operations[0].status,'COMMITTED');assert.equal(e.rows('T_ALIAS_FIXTURE')['third-row'].values.count,0);assert.equal(e.rows('T_ALIAS_FIXTURE')['first-row'].values.count,11);
 // Repeated aliases for one canonical identity are one candidate, not a false ambiguity.
 const repeated=context(e);repeated.references.push(structuredClone(repeated.references.find(r=>r.recordId==='third-row')));apply(e,repeated,section(repeated,'T_ALIAS_FIXTURE',{count:'4'},{heading:third.display}));assert.equal(e.rows('T_ALIAS_FIXTURE')['third-row'].values.count,4);
 const partial=context(e,{operationId:'alias-partial'}),accepted=acceptMatrixSheets(partial,{state:e.data},{partial:true,blocks:{title:'局部修订',body:'中性依据',cells:section(partial,'T_ALIAS_FIXTURE',{count:'1'},{heading:second.display})+'\n'+section(partial,'T_ALIAS_FIXTURE',{count:'5'},{heading:third.display})}});assert.equal(accepted.acceptance.acceptedCount,1);assert.equal(accepted.acceptance.pending.length,1);assert.match(accepted.acceptance.pending[0].reason,/标题有歧义/);assert.equal(accepted.acceptance.pending[0].tableId,null);applyMatrixChanges(e,accepted.proposal.matrix.changes);assert.equal(e.rows('T_ALIAS_FIXTURE')['first-row'].values.count,11);assert.equal(e.rows('T_ALIAS_FIXTURE')['second-row'].values.count,22);assert.equal(e.rows('T_ALIAS_FIXTURE')['third-row'].values.count,5);
});
