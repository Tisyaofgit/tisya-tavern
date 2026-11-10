import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {initializeState} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {prepareCreationSheets,acceptCreationSheets,validateCreationProposal} from '../engine/creation.mjs';
import {compactCreationSchema,programOwnedTable} from '../engine/prompt-boundary.mjs';
import {createSheetEngine} from '../tables/foundation/engine.js';

const snapshot=()=>({state:initializeState(catalog),revision:0,contextKey:'test-chat'});
const prepare=(state,options={})=>prepareCreationSheets(state,{operationId:'test-operation',kind:'character',mode:'extend',...options});
function section(context,id,values,{number=1,heading}={}){const t=context.catalog.templates.find(t=>t.id===id);assert(t,id);return '【'+(heading??t.label+'／'+number)+'】\n'+Object.entries(values).map(([key,value])=>{const row=t.fields.findIndex(f=>f.key===key);assert(row>=0,key);return (row+1)+' '+t.fields[row].label+'：'+value;}).join('\n');}
const reply=(cells,extra='')=>'<reply id="tisya-onepass-1"><task/><anchor phase="before"/><title>可核对方案|~|~|~</title><body>1 可读的方案内容。</body><anchor phase="after"/><extra>'+extra+'</extra><cells format="form">'+cells+'</cells><vars/><archive/><actions/></reply>';

test('all current writable business tables use the shared sheet catalog; storage identity and owner coordinates are private',()=>{
 const s=snapshot(),c=prepare(s),expected=Object.keys(compactCreationSchema(s.state));assert.equal(catalog.tables.length,207);assert.deepEqual(c.catalog.templates.map(t=>t.id),expected);assert(c.catalog.templates.some(t=>t.id==='X_SOCIAL_POSTS'));assert(c.catalog.templates.some(t=>t.id==='M_CONDITIONS'));assert(c.catalog.templates.some(t=>t.id==='register_parameter'));
 assert.doesNotMatch(c.form,/matrix\.changes|row_uuid|owner_table|recordId|source_pointer/);for(const t of c.catalog.templates){assert(!programOwnedTable(t.id,s.state.schema[t.id]));assert(t.fields.every(f=>f.definition.type==='text'));}
});
test('complete character fields and canonical child rows compile into the same database without storing prose in manifest',()=>{
 const s=snapshot(),before=JSON.stringify(s),c=prepare(s),cells=[
  section(c,'M_QUANTITIES',{quantity_mode:'exact',value:'23',unit_ref:'岁'}),
  section(c,'T_STATIC_WORLDS',{name:'雾城',core_proposition:'记忆可以交易，但交换必有代价'}),
  section(c,'M_UNITS',{scope_world_id:'雾城',label:'岁',dimension:'time'}),
  section(c,'T_CHAR_DOSSIER',{name:'玄素',age_raw:'数值与量纲／1',public_identity:'渡口记账人',overall_physique:'颀长，右肩略低',core_personality_tags:'审慎；倔强',desire_double_helix:'想离开，又怕无人照料养母',core_contradiction:'信任规则，却靠一次违约救过人',mask_presentation:'待客时不动声色',mask_gap:'私下会反复核对一句告别',diction:'短句，称人用旧称',skilled_abilities:'辨认账本里的前后改墨',ability_costs_limits:'只能核墨色，不知道被抹去的原句'})
 ].join('\n');
 const {proposal,workbook}=acceptCreationSheets(c,s,reply(cells));validateCreationProposal(proposal,s,{kind:'character'});assert.equal(JSON.stringify(s),before);assert.equal(workbook.records.length,4);const changes=proposal.matrix.changes,dossier=changes.find(x=>x.tableId==='T_CHAR_DOSSIER'),quantity=changes.find(x=>x.tableId==='M_QUANTITIES'),unit=changes.find(x=>x.tableId==='M_UNITS'),actor=changes.find(x=>x.tableId==='T_SYS_ENTITIES');
 assert.equal(dossier.values.public_identity,'渡口记账人');assert.equal(dossier.values.manifest,undefined);assert.equal(dossier.values.age_raw,quantity.recordId);assert.equal(quantity.values.owner_row_uuid,dossier.recordId);assert.equal(quantity.values.owner_field,'age_raw');assert.equal(quantity.values.unit_ref,unit.recordId);assert.equal(quantity.values.value,23);assert.equal(actor.values.kind,'character');assert.equal(proposal.matrix.binding.entityId,actor.recordId);assert.equal(changes.filter(x=>x.tableId==='M_LIST_VALUES').length,2);
 assert.deepEqual(acceptCreationSheets(c,s,reply(cells)).proposal,proposal);
});
test('malformed labels, unauthorized groups, missing references and live operations fail before canonical writes',()=>{
 const s=snapshot(),c=prepare(s),base=section(c,'T_CHAR_DOSSIER',{name:'玄素',public_identity:'渡口记账人'}),before=JSON.stringify(s);
 for(const cells of [base.replace('显示名称','伪字段'),base+'\n'+base,base+'\n999 未开放字段：值',base+'\n【伪造表／1】\n1 名称：值',section(c,'T_CHAR_DOSSIER',{name:'玄素',birth_place_ref:'不存在的地点'}),base+'\n@TIME: tick(+1d)'])assert.throws(()=>acceptCreationSheets(c,s,reply(cells)));
 assert.throws(()=>acceptCreationSheets(c,s,reply(base).replace('<vars/>','<vars>扣钱</vars>')),/原生变量/);assert.throws(()=>acceptCreationSheets(c,s,reply(base).replace('<archive/>','<archive>事件|虚构历史</archive>')),/剧情归档/);assert.equal(JSON.stringify(s),before);
});
test('existing names must select the explicit revision row; partial dossier edits preserve its identity and untouched fields',()=>{
 const s=snapshot(),rt=new Runtime(s.state);rt.newRecord('T_CHAR_DOSSIER',{name:'玄素',public_identity:'既有职业',overall_physique:'保留外貌'},'old-person');s.state=rt.data;const c=prepare(s,{mode:'revise'}),existing=c.references.find(r=>r.tableId==='T_CHAR_DOSSIER');
 assert.throws(()=>acceptCreationSheets(c,s,reply(section(c,'T_CHAR_DOSSIER',{name:'玄素',public_identity:'新职业'}))),/已有同名记录/);
 const result=acceptCreationSheets(c,s,reply(section(c,'T_CHAR_DOSSIER',{public_identity:'新职业'},{heading:existing.display}))),row=result.proposal.matrix.changes.find(r=>r.tableId==='T_CHAR_DOSSIER');assert.equal(row.recordId,'old-person');assert.deepEqual(row.values,{public_identity:'新职业'});validateCreationProposal(result.proposal,s,{kind:'character',mode:'revise'});assert.equal(s.state.tables.T_CHAR_DOSSIER['old-person'].values.overall_physique,'保留外貌');
});
test('typed leaves preserve zero, false, unknown and explicit collection shape without a nested model JSON envelope',()=>{
 const rt=new Runtime();rt.registerTable('VALUES',[{key:'name',label:'名称',type:'TEXT'},{key:'amount',label:'数量',type:'INTEGER',minimum:0},{key:'enabled',label:'启用',type:'BOOLEAN'},{key:'unknown',label:'未定数量',type:'NUMBER'},{key:'items',label:'列表',type:'ARRAY'},{key:'settings',label:'属性',type:'OBJECT'},{key:'payload',label:'复合值',type:'JSON'}],'类型样本');const s={state:rt.data,revision:0,contextKey:'x'},c=prepare(s,{kind:'world'});
 const parsed=acceptCreationSheets(c,s,reply(section(c,'VALUES',{name:'样本',amount:'0',enabled:'否',unknown:'?',items:'无',settings:'数量=0；启用=false',payload:'列表：0.内容=甲；0.启用=false；1.内容=乙；1.启用=true'}))).proposal;validateCreationProposal(parsed,s,{kind:'world'});const row=parsed.matrix.changes[0];assert.equal(row.values.amount,0);assert.equal(row.values.enabled,false);assert.equal(row.states.unknown,'unknown');assert.deepEqual(row.values.items,[]);assert.deepEqual(row.values.settings,{数量:0,启用:false});assert.deepEqual(row.values.payload,[{内容:'甲',启用:false},{内容:'乙',启用:true}]);
 assert.throws(()=>acceptCreationSheets(c,s,reply(section(c,'VALUES',{name:'坏数组',payload:'列表：1.内容=跳过首项'}))),/连续/);assert.throws(()=>acceptCreationSheets(c,s,reply(section(c,'VALUES',{name:'坏路径',settings:'__proto__.polluted=true'}))),/路径/);assert.equal({}.polluted,undefined);
});
test('shared workbook tickets handle independent records and reject stale/manual changes atomically',()=>{
 const c={version:1,templates:[{id:'config',table:'config',label:'配置',fields:[{key:'enabled',label:'启用',path:['enabled'],group:'内容',definition:{type:'boolean'}}]},{id:'history',table:'history',label:'历史',fields:[{key:'text',label:'内容',path:['text'],group:'内容',definition:{type:'text'}}]}]},e=createSheetEngine(c,(value,def)=>def.type==='boolean'?typeof value==='boolean':typeof value==='string'),a=e.create('config'),b=e.create('history'),ticket=e.requestWorkbook([{recordId:a.id,heading:'配置／1'},{recordId:b.id,heading:'历史／1'}]);
 e.accept(ticket.token,'【配置／1】\n1 启用：否\n【历史／1】\n1 内容：已确认来源。');assert.equal(e.get(a.id,'enabled'),false);assert.equal(e.get(b.id,'text'),'已确认来源。');assert.throws(()=>e.accept(ticket.token,''),/失效/);
 const other=e.create('history'),pending=e.requestWorkbook([{recordId:other.id,heading:'新行／1'}]);e.edit(b.id,'text','人工修订');const before=e.snapshot();assert.throws(()=>e.accept(pending.token,'【新行／1】\n1 内容：旧任务'),/已变化/);assert.deepEqual(e.snapshot(),before);
});
