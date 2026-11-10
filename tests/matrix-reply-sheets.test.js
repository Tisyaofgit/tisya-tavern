import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {acceptReply,parseReply} from '../engine/reply.mjs';
import {reconcile} from '../engine/journal.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';

const context=e=>prepareMatrixSheets({state:e.data},{operationId:'preview',kind:'rows',task:'main',mode:'revise'});
function section(c,id,values,number=1,heading){const t=c.catalog.templates.find(t=>t.id===id);assert(t,id);return '【'+(heading??t.label+'／'+number)+'】\n'+Object.entries(values).map(([key,value])=>{const row=t.fields.findIndex(f=>f.key===key);assert(row>=0,key);return (row+1)+' '+t.fields[row].label+'：'+value;}).join('\n');}
const reply=(cells,body='1 两名旅人抵达。\n\n2 客栈登记了他们的来处。')=>'<reply><title>新来的旅人</title><body>'+body+'</body><extra>仅供显示的面板</extra><cells format="form">'+cells+'</cells><vars/><archive>事件|抵达客栈</archive><actions/></reply>';
function simple(){const e=new Runtime();e.registerTable('PEOPLE',[{key:'name',label:'姓名',type:'TEXT',required:true},{key:'money',label:'钱数',type:'NUMBER'},{key:'active',label:'启用',type:'BOOLEAN'},{key:'friend',label:'同行者',type:'REF',ref:'PEOPLE'}],'人物');return e;}

test('main reply uses one shared grouped codec with forward references, typed values and exact per-field evidence',()=>{
 const e=simple(),c=context(e),cells=section(c,'PEOPLE',{name:'阿青 | P1',money:'0 | P2',active:'否 | P2',friend:'人物／2 | P2'})+'\n'+section(c,'PEOPLE',{name:'阿白 | P2',friend:'人物／1 | P99'},2),raw=reply(cells),result=acceptReply(e,raw,'turn-a');
 assert.equal(result.status,'COMMITTED');assert.equal(result.result.operations.length,1);assert.equal(result.result.operations[0].status,'COMMITTED');const rows=Object.entries(e.rows('PEOPLE')),a=rows.find(([,r])=>r.values.name==='阿青'),b=rows.find(([,r])=>r.values.name==='阿白');assert(a&&b);assert.equal(a[1].values.money,0);assert.equal(a[1].values.active,false);assert.equal(a[1].values.friend,b[0]);assert.equal(b[1].values.friend,a[0]);
 assert.equal(a[1].metadata.name.source_pointer.paragraph_reference,'P1');assert.equal(b[1].metadata.name.source_pointer.paragraph_reference,'P2');assert.equal(b[1].metadata.friend.source_pointer.paragraph_reference,'P2');assert(result.result.warnings.some(w=>w.code==='PARAGRAPH_CLAMPED'));assert.equal(e.data.runtime.sources['main/turn-a@1'].reply_raw,raw);assert.equal(parseReply(raw,'x').cells_raw,cells);
 const before=structuredClone(e.data);assert.equal(acceptReply(e,raw,'turn-a').status,'REPLAY');assert.deepEqual(e.data,before);assert.throws(()=>acceptReply(e,raw.replace('阿青','阿蓝'),'turn-a'),/同一回复版本/);
});

test('any malformed field or unresolved reference rolls back the complete form while retaining the original source and receipt',()=>{
 for(const kind of ['field','reference','type']){const e=simple(),c=context(e),bad=kind==='field'?section(c,'PEOPLE',{name:'阿白'},2)+'\n999 未登记：值':kind==='reference'?section(c,'PEOPLE',{name:'阿白',friend:'不存在'},2):section(c,'PEOPLE',{name:'阿白',money:'不是数值'},2),raw=reply(section(c,'PEOPLE',{name:'阿青'})+'\n'+bad),result=acceptReply(e,raw,'bad-'+kind);
  assert.equal(result.status,'COMMITTED');assert.equal(Object.keys(e.rows('PEOPLE')).length,0);assert.equal(result.result.operations[0].status,'FAILED');assert(result.result.warnings.some(w=>w.code==='CELL_FORM_FAILED'));assert.equal(e.data.runtime.sources['main/bad-'+kind+'@1'].reply_raw,raw);assert.equal(acceptReply(e,raw,'bad-'+kind).status,'REPLAY');
 }
});

test('existing grouped edits rebase through the original journal and old micro actions still settle normally',()=>{
 const e=simple();e.newRecord('PEOPLE',{name:'阿青',money:10,active:true},'person');const c=context(e),heading=c.references.find(r=>r.recordId==='person').display,a={uid:'a',role:'assistant',text:reply(section(c,'PEOPLE',{money:'7 | P1'},1,heading))};
 let r=reconcile({state:e.data},[a]);assert.equal(r.bundle.state.tables.PEOPLE.person.values.money,7);r=reconcile(r.bundle,[{...a,text:reply(section(c,'PEOPLE',{money:'9 | P1'},1,heading))}]);assert.equal(r.bundle.state.tables.PEOPLE.person.values.money,9);assert.equal(r.result.rewound,1);r=reconcile(r.bundle,[]);assert.equal(r.bundle.state.tables.PEOPLE.person.values.money,10);
 const raw='<reply><body>1 支付两枚钱。</body><cells>阿青.money: -2 | P1</cells></reply>';const old=acceptReply(e,raw,'old');assert.equal(old.result.operations[0].status,'COMMITTED');assert.equal(e.rows('PEOPLE').person.values.money,8);
});

test('actual catalog main forms derive canonical actors and support typed list atoms without another parser',()=>{
 const e=new Runtime(initializeState(catalog)),c=context(e),cells=section(c,'T_CHAR_DOSSIER',{name:'玄素',public_identity:'渡口记账人',core_personality_tags:'审慎；数值：0；布尔：否；关联：人物原点档案／2'})+'\n'+section(c,'T_CHAR_DOSSIER',{name:'阿白'},2),raw=reply(cells),result=acceptReply(e,raw,'canonical');assert.equal(result.result.operations[0].status,'COMMITTED',JSON.stringify(result.result));
 assert.equal(Object.keys(e.rows('T_CHAR_DOSSIER')).length,2);assert.deepEqual(Object.values(e.rows('T_SYS_ENTITIES')).map(r=>r.values.name).sort(),['玄素','阿白'].sort());const items=Object.values(e.rows('M_LIST_VALUES')).map(r=>r.values);assert(items.some(r=>r.item_type==='number'&&r.number_value===0));assert(items.some(r=>r.item_type==='boolean'&&r.boolean_value===false));assert(items.some(r=>r.item_type==='reference'&&r.target_table==='T_CHAR_DOSSIER'));assert.equal(e.data.runtime.turn_order.length,1);
});

test('material instructions and main acceptance share exact group labels while hidden record names stay out of the prompt',()=>{
 const e=simple();e.registerTable('SECRETS',[{key:'name',label:'名称',type:'TEXT'},{key:'lock_level',label:'权限',type:'TEXT'}],'隐秘资料');e.newRecord('PEOPLE',{name:'可见人物',money:2},'visible');e.newRecord('SECRETS',{name:'不可泄露的人物名',lock_level:'D'},'secret');const c=context(e),m=materials(e),input=m.tisya_material_cell_prompts;
 assert(input.includes('【'+c.catalog.templates.find(t=>t.id==='PEOPLE').label+'／序号】'));assert(input.includes(c.references.find(r=>r.recordId==='visible').display));assert.doesNotMatch(Object.values(m).join('\n'),/不可泄露的人物名/);assert.doesNotMatch(input,/@ROW\+.*JSON|matrix\.changes/);assert.match(input,/format="form"/);
 const result=acceptMatrixSheets(c,{state:e.data},{blocks:{title:'独立数据任务',body:'已核对',cells:section(c,'PEOPLE',{name:'新记录',money:'0'})}}),copy=new Runtime(e.data);applyMatrixChanges(copy,result.proposal.matrix.changes);assert.equal(Object.keys(e.rows('PEOPLE')).length,1);assert.equal(Object.keys(copy.rows('PEOPLE')).length,2);
});
