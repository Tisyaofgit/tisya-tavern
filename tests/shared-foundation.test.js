import test from 'node:test';
import assert from 'node:assert/strict';
import {formSections,formTextFields,serializeFormSection} from '../tables/foundation/form-text.js';
import {archiveEvidenceSources} from '../tables/source-text.js';
import {readResponseText} from '../config/response-reader.js';
import {prepareCompactFill,parseCompactFill} from '../tables/compact-fill.js';
import {defaultRegistry} from '../tables/schema.js';

const done='【完成】\n1 状态：完成\n2 待处理：无\n3 补读记录：无';
const form=(plan,fields)=>'【人物：甲】\n'+plan.schema.find(s=>s.type==='character').fields.filter(f=>Object.hasOwn(fields,f.label)).map(f=>f.row+' '+f.label+'：'+fields[f.label]).join('\n')+'\n'+done;
test('literal cells preserve original boundaries and cannot inject form controls',()=>{
 const raw='\uFEFF【资料】\r\n1 原文：|\r\n    前导空格\r\n  【完成】\r\n  \r\n  1 状态：完成\r\n  字面\\n和"引号"  \r\n【结束】\r\n1 状态：完成';
 const sections=formSections(raw);assert.equal(sections.length,2);
 const expected='  前导空格\r\n【完成】\r\n\r\n1 状态：完成\r\n字面\\n和"引号"  ';
 assert.equal(formTextFields(sections[0],['原文']).原文,expected);
 assert.deepEqual(formSections(sections.map(serializeFormSection).join('\n')),sections);
});
test('shared form grammar rejects duplicate groups, fields, forged labels and invalid escapes',()=>{
 for(const raw of ['【资料】\n1 原文：a\n【资料】\n1 原文：b','【资料】\n1 原文：|'])assert.throws(()=>formSections(raw));
 for(const raw of ['1 原文：a\n1 原文：b','1 替换：a','1 原文："bad\\x"'])assert.throws(()=>formTextFields(formSections('【资料】\n'+raw)[0],['原文']));
});
test('archive evidence is current, leaf-contained and excludes old definitions and synthetic join text',()=>{
 const input={registry:defaultRegistry(),currentRows:[],sourceCard:'旧定义',sourceHistory:[{role:'assistant',text:'旧历史'}],archiveSource:{text:'当前正文'},userSource:{text:'甲\n\n乙',sources:[{text:'甲'},{text:'乙'}]}};
 assert.deepEqual(archiveEvidenceSources('tableArchive',input),['当前正文','甲','乙']);
 const plan=prepareCompactFill('tableArchive',input),fields={来源依据:'旧定义',读者:'无',知情者:'无'};
 for(const evidence of ['旧定义','旧历史',JSON.stringify('甲\n\n乙')])assert.throws(()=>parseCompactFill(plan,form(plan,{...fields,来源依据:evidence})),/来源依据/);
 assert.equal(parseCompactFill(plan,form(plan,{...fields,来源依据:'当前正文'})).changes.length,1);
});
test('public operations prevent same-name creation and preserve explicit clears and retractions',()=>{
 const old={id:'person',table:'objects',rev:2,values:{名称:'甲',类型:'character',描述:'旧描述'},access:{readers:['读者'],knowers:[]}};
 const plan=prepareCompactFill('tableArchive',{registry:defaultRegistry(),currentRows:[old],archiveSource:{text:'撤回甲的误登记。旧描述作废。'}}),base={来源依据:'旧描述作废。',读者:'读者',知情者:'无'};
 assert.throws(()=>parseCompactFill(plan,form(plan,{...base,处理方式:'新建'})),/名称冲突/);
 const clear=parseCompactFill(plan,form(plan,{...base,清空字段:'描述'})).changes[0];assert.deepEqual(clear.unset,['描述']);assert.equal(clear.expected,2);
 assert.throws(()=>parseCompactFill(plan,form(plan,{...base,清空字段:'名称'})),/必填/);
 const removed=parseCompactFill(plan,form(plan,{...base,来源依据:'撤回甲的误登记。',处理方式:'撤销'})).changes[0];assert.equal(removed.delete,true);assert.deepEqual(removed.access,old.access);
 assert.throws(()=>parseCompactFill(plan,form(plan,{...base,处理方式:'撤销',描述:'覆盖'})),/同时修改/);
 assert.throws(()=>parseCompactFill(plan,form(plan,{...base,知情者:'objects／character／甲'})),/引用/);
 assert.deepEqual(old.values,{名称:'甲',类型:'character',描述:'旧描述'});
});
const options=signal=>({signal,guard:()=>{},limit:1024,limitError:()=>Error('wire limit')});
test('shared response reader preserves split UTF-8 and the exact original bytes',async()=>{
 const bytes=new TextEncoder().encode('甲\r\n😀\\n'),controller=new AbortController();let index=0;
 const response=new Response(new ReadableStream({pull(c){if(index===bytes.length)c.close();else c.enqueue(bytes.slice(index,index+=1));}}));
 const value=await readResponseText(response,{...options(controller.signal),captureBytes:true});assert.equal(value.text,'甲\r\n😀\\n');assert.equal(value.bytes,bytes.length);assert.deepEqual(Buffer.concat(value.chunks),Buffer.from(bytes));assert.equal(response.body.locked,false);
});
test('shared response reader rejects truncation and counts bytes instead of characters',async()=>{
 const signal=new AbortController().signal;
 await assert.rejects(readResponseText(new Response(new Uint8Array([0xe7,0x94])),options(signal)),/encoded data/);
 await assert.rejects(readResponseText(new Response('甲'),{...options(signal),limit:2}),/wire limit/);
});
test('shared response reader cancels a stalled stream and never acquires an aborted body',async()=>{
 const abort=new AbortController(),reason=Error('cancelled');let cancelled=0;
 const response=new Response(new ReadableStream({cancel(){cancelled++;}}));const reading=readResponseText(response,options(abort.signal));abort.abort(reason);await assert.rejects(reading,e=>e===reason);assert.equal(cancelled,1);assert.equal(response.body.locked,false);
 const untouched=new Response('甲');await assert.rejects(readResponseText(untouched,options(abort.signal)),e=>e===reason);assert.equal(untouched.bodyUsed,false);
});
test('shared response reader checks ownership after pending bytes arrive',async()=>{
 let current=true;const signal=new AbortController().signal;
 const response=new Response(new ReadableStream({pull(c){current=false;c.enqueue(new Uint8Array([65]));c.close();}}));
 await assert.rejects(readResponseText(response,{...options(signal),guard:()=>{if(!current)throw Error('stale owner');}}),/stale owner/);assert.equal(response.body.locked,false);
});
