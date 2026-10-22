import test from 'node:test';
import assert from 'node:assert/strict';
import {sheetCatalog} from '../tables/foundation/catalog.js';
import {createSheetEngine} from '../tables/foundation/engine.js';
import {valueValid} from '../tables/schema.js';
import {formatSimpleSheet} from '../tables/simple-sheet.js';
import {expandExtractionSection} from '../tables/foundation/extraction-layout.js';
import {MODE_CONTRACT,validateGeneratedTask} from '../config/contracts.js';

const block=value=>formatSimpleSheet(value).split('\n').map(line=>'  '+line).join('\n');
const rowOf=(e,r,key)=>e.template(r.template).fields.findIndex(f=>f.key===key)+1;
function fixture(){const e=createSheetEngine(sheetCatalog(),valueValid),r=e.create('session.state');return {e,r,row:rowOf(e,r,'值')};}

test('foundation complex model cells use recursive sheets and preserve nested typed values and literal source text',()=>{
 const {e,r,row}=fixture(),value={empty:'',unknown:null,zero:0,off:false,list:[],object:{},text:'false；null|[]\n【子表1】\n  1 值：保留\r\n末尾\t ',nested:[{name:'甲',flags:[true,false],num:2.5}],tail:'  精确保留  '};
 const task=e.request(r.id,{keys:['值']});assert.doesNotMatch(task.modelInput,/仍须JSON|结构：\{/);assert.match(task.modelInput,/复杂格展开为完整简表/);
 e.accept(task.token,row+' 值：\n'+block(value));assert.deepEqual(e.get(r.id,'值'),value);
});

test('complex cell rejects a JSON object, extra outer rows and type-invalid values atomically then accepts the same ticket',()=>{
 const e=createSheetEngine(sheetCatalog(),valueValid),r=e.create('session.relations'),row=rowOf(e,r,'印象'),task=e.request(r.id,{keys:['印象']}),before=e.snapshot();
 for(const raw of [row+' 印象：{"甲":"印象"}',row+' 印象：\n'+block({甲:42}),row+' 印象：\n'+block({甲:{依据:['missing']}}),row+' 印象：\n'+block({甲:{值:1}})+'\n999 越权：值']){assert.throws(()=>e.accept(task.token,raw));assert.deepEqual(e.snapshot(),before);}
 e.accept(task.token,row+' 印象：\n'+block({甲:{值:1,低端:'明确印象'}}));assert.deepEqual(e.get(r.id,'印象'),{甲:{值:1,低端:'明确印象'}});
});

test('nested complex references expose only selected names and resolve through the original authorization set',()=>{
 const e=createSheetEngine(sheetCatalog(),valueValid),r=e.create('session.relations'),ref=e.create('origin.character');e.edit(ref.id,'名称','可引用甲');const row=rowOf(e,r,'印象'),task=e.request(r.id,{keys:['印象'],referenceIds:[ref.id]});
 assert.match(task.modelInput,/关联格填写已登记名称：可引用甲/);e.accept(task.token,row+' 印象：\n'+block({甲:{依据:['可引用甲']}}));assert.deepEqual(e.get(r.id,'印象'),{甲:{依据:[ref.id]}});
});

test('markdown complex cells use the same sheet codec and preserve escaped pipes and nested values',()=>{
 const {e,r,row}=fixture(),value={text:'甲|乙\\丙\n<br>&',list:[null,false,0],tail:'  精确保留  '},task=e.request(r.id,{format:'markdown',keys:['值']});
 const wire=formatSimpleSheet(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\\','\\\\').replaceAll('|','\\|').replaceAll('\n','<br>');
 e.accept(task.token,'| 行 | A | B |\n| --- | --- | --- |\n| '+row+' | 值 | '+wire+' |');assert.deepEqual(e.get(r.id,'值'),value);assert.doesNotMatch(task.modelInput,/JSON值|结构：\{/);
});

test('compact extraction keeps complex continuation headings inside the owning field',()=>{
 const field={row:1,key:'值',label:'值',group:'身份',definition:{type:'json'}},value={a:[false,0,'\n【人物／身份】']},rows=['1 值：',...block(value).split('\n')];
 assert.deepEqual(expandExtractionSection(rows,[field],'custom','compact-v2'),[rows.join('\n')]);
});

test('generation contracts continue to reject missing and cyclic workflow dependencies after model transport migration',()=>{
 assert.doesNotMatch(MODE_CONTRACT.compileOutput,/task JSON/);
 const base={id:'flow',name:'流程',version:1,steps:[{id:'a',task:'read',dependsOn:[]},{id:'b',task:'verify',dependsOn:['a']}]};
 assert.deepEqual(validateGeneratedTask('workflow',base),base);
 assert.throws(()=>validateGeneratedTask('workflow',{...base,steps:[{id:'a',task:'read',dependsOn:['missing']}]}),/不存在/);
 assert.throws(()=>validateGeneratedTask('workflow',{...base,steps:[{id:'a',task:'read',dependsOn:['b']},{id:'b',task:'verify',dependsOn:['a']}]}),/循环/);
 assert.throws(()=>validateGeneratedTask('genesis',{blueprint:{},checklist:[],artifacts:{}}),/workflow/);
});
