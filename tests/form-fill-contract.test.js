import test from 'node:test';
import assert from 'node:assert/strict';
import {Runtime} from '../engine/runtime.mjs';
import {prepareMatrixSheets,acceptMatrixSheets,applyMatrixChanges} from '../tables/foundation/engine.js';
import {semanticField,FIELD_MERGES} from '../engine/form-semantics.mjs';

function fixture(){
 const engine=new Runtime();
 engine.registerTable('NODES',[
  {key:'name',label:'名称',type:'TEXT',required:true},
  {key:'amount',label:'数量',type:'INTEGER',minimum:0},
  {key:'active',label:'启用',type:'BOOLEAN'},
  {key:'note',label:'备注',type:'TEXT'},
  {key:'tags',label:'标签',type:'TEXT_LIST'}
 ],'节点');
 const prepared=prepareMatrixSheets({state:engine.data},{operationId:'form-contract',kind:'rows',mode:'revise',task:'main'});
 const template=prepared.catalog.templates.find(table=>table.id==='NODES');
 const row=key=>template.fields.find(field=>field.key===key).row;
 const line=(key,value)=>row(key)+'{'+value+'}';
 const accept=(cells,partial=false)=>{
  const accepted=acceptMatrixSheets(prepared,{state:engine.data},{partial,blocks:{title:'测试',body:'依据',cells}});
  const runtime=new Runtime(engine.data);
  if(accepted.proposal.matrix.changes.length)applyMatrixChanges(runtime,accepted.proposal.matrix.changes,{mode:'revise'});
  return accepted;
 };
 return {engine,template,row,line,accept};
}

const canonical=f=>['【节点／1】',f.line('name','阿青'),f.line('amount','3'),f.line('active','否'),f.line('note','""'),f.line('tags','甲；乙')].join('\n');

test('form contract accepts one safe outer fence, bold headings, bullets and full-width braces without changing values',()=>{
 for(const wrap of [text=>text,text=>'```text\n'+text+'\n```',text=>text.replace('【节点／1】','**【节点／1】**'),text=>text.split('\n').map((line,index)=>index?'- '+line:line).join('\n'),text=>text.replace(/(\d+)\{([^}]*)\}/g,'$1｛$2｝')]){
  const f=fixture(),accepted=f.accept(wrap(canonical(f))),values=accepted.proposal.matrix.changes[0].values;
  assert.deepEqual(values,{name:'阿青',amount:3,active:false,note:'',tags:['甲','乙']});
 }
});

test('matching labels inside compact braces are syntax rather than stored text',()=>{
 const f=fixture(),cells=['【节点／1】',f.line('name','名称：阿青'),f.line('amount','数量（整数；≥0）：3'),f.line('note','备注：见闻：下雨')].join('\n');
 assert.deepEqual(f.accept(cells).proposal.matrix.changes[0].values,{name:'阿青',amount:3,note:'见闻：下雨'});
});

test('a mismatched or closed field label is rejected instead of silently polluting the value',()=>{
 for(const key of ['name','amount']){
  const f=fixture(),wrong=key==='name'?'数量：3':'名称：阿青';
  assert.throws(()=>f.accept(['【节点／1】',f.line('name','阿青'),f.line(key,wrong)].join('\n')),/字段行号或名称未开放/);
 }
});

test('copying a field placeholder fails with the exact field and raw value',()=>{
 const f=fixture(),placeholder=f.template.fields.find(field=>field.key==='amount').formPlaceholder;
 assert.ok(placeholder.includes('整数'));
 assert.throws(()=>f.accept(['【节点／1】',f.line('name','阿青'),f.line('amount',placeholder)].join('\n')),error=>{
  assert.match(error.message,/仍是填写说明/);assert.equal(error.formLocation.field,'amount');assert.equal(error.formLocation.label,'数量');assert.equal(error.formLocation.rawValue,placeholder);return true;
 });
 // A plain text field whose hint is only its label may legitimately contain that word.
 const text=fixture();assert.equal(text.accept(['【节点／1】',text.line('name','名称')].join('\n')).proposal.matrix.changes[0].values.name,'名称');
});

test('duplicate field lines and missing required values identify the readable field',()=>{
 const duplicate=fixture();
 assert.throws(()=>duplicate.accept(['【节点／1】',duplicate.line('name','阿青'),duplicate.line('name','阿绿')].join('\n')),error=>{
  assert.match(error.message,/字段重复/);assert.equal(error.formLocation.field,'name');assert.equal(error.formLocation.label,'名称');return true;
 });
 for(const cells of [f=>['【节点／1】',f.line('amount','3')].join('\n'),f=>['【节点／1】',f.line('name','?'),f.line('amount','3')].join('\n')]){
  const f=fixture(),accepted=f.accept(cells(f),true);assert.equal(accepted.proposal.matrix.changes.length,0);assert.equal(accepted.acceptance.pending.length,1);
  const pending=accepted.acceptance.pending[0];assert.equal(pending.field,'名称');assert.match(pending.reason,/【节点】名称/);assert.match(pending.reason,/保留待补/);
 }
});

test('partial acceptance still isolates a bad group without discarding a valid zero/false group',()=>{
 const f=fixture(),cells=canonical(f)+'\n【节点／2】\n'+f.line('name','阿绿')+'\n'+f.line('amount','很多'),accepted=f.accept(cells,true);
 assert.equal(accepted.proposal.matrix.changes.length,1);assert.equal(accepted.proposal.matrix.changes[0].values.amount,3);assert.equal(accepted.proposal.matrix.changes[0].values.active,false);
 assert.equal(accepted.acceptance.pending.length,1);assert.equal(accepted.acceptance.pending[0].field,'数量');assert.equal(accepted.acceptance.pending[0].rawValue,'很多');
});

test('narrative look-alike fields keep distinct boundaries in the actual model form',()=>{
 const keys=['mask_presentation','mask_purpose','mask_gap','mask_fissures','interests','likes_with_reasons','strengths','skilled_abilities'];
 const fields=keys.map(key=>semanticField('T_CHAR_DOSSIER',{key,label:key,type:'LONG_TEXT'})),state={schema:{T_CHAR_DOSSIER:{id:'T_CHAR_DOSSIER',label:'人物',fields}},tables:{}};
 const prepared=prepareMatrixSheets({state},{operationId:'field-boundaries',kind:'character',mode:'revise',task:'tableGenesis'});
 for(const key of ['mask_gap','mask_fissures','interests','strengths'])assert.match(prepared.form,new RegExp(key+'（[^）]+）'));
 assert.match(prepared.form,/外在形象与真实反应之间的稳定落差；何时显露归刺激外显映射/);assert.match(prepared.form,/何种刺激下面具松动及可观察差异/);assert.match(prepared.form,/好恶评价及其原因另填/);assert.match(prepared.form,/专业技能归擅长本领/);
 assert.equal(FIELD_MERGES.T_CHAR_DOSSIER,undefined);assert.equal(fields.find(field=>field.key==='mask_gap').merged_into,undefined);assert.equal(fields.find(field=>field.key==='mask_fissures').merged_into,undefined);
});
