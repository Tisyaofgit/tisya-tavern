import test from 'node:test';
import assert from 'node:assert/strict';
import {makePreferencePackage,validatePreferencePackage,planPreferenceImport,applyPreferenceImport} from '../engine/preference-packages.mjs';
import {preferenceTextKey} from '../engine/preferences.mjs';
import {createPreferenceAssistant} from '../engine/preference-assistant.mjs';
const record={id:'one',group:'S05',selection:'"S05-A"',text:'完整文风原文，不省略。',enabled:true,kind:'override'};
const entry={record,scope:'story',parameters:{min_length:1234,max_length:2345},source:'本地文件'};
test('preference packages contain only selected text and validated fields, with explicit keep/overwrite/duplicate conflicts',()=>{
 const pack=makePreferencePackage([entry]);assert.equal(pack.entries.length,1);assert.equal(pack.entries[0].record.text,record.text);assert.equal(pack.entries[0].parameters.min_length,1234);
 assert.throws(()=>validatePreferencePackage({...pack,chat:[]}),/格式/);assert.throws(()=>makePreferencePackage([{...entry,token:'credential'}]),/未支持/);assert.throws(()=>makePreferencePackage([{...entry,record:{...record,rawResponse:'private'}}]),/未支持/);
 const key=preferenceTextKey(record.group,record.selection,true),existing={[key]:{...record,text:'本地旧文'}};const plans=planPreferenceImport(pack,existing);assert.equal(plans[0].action,'keep');assert.deepEqual(applyPreferenceImport(plans,existing),existing);
 plans[0].action='overwrite';const overwrite=applyPreferenceImport(plans,existing);assert.equal(overwrite[key].text,record.text);assert.equal(overwrite[key].enabled,false);assert.equal(existing[key].text,'本地旧文');
 plans[0].action='duplicate';const copy=applyPreferenceImport(plans,existing);assert.equal(Object.keys(copy).length,2);const custom=Object.values(copy).find(x=>x.kind==='custom');assert(custom);assert.equal(custom.enabled,false);assert(custom.selection.includes('custom:'+custom.id));
});
const response=cells=>'<reply id="tisya-onepass-1"><task/><anchor phase="before"/><title>偏好草稿</title><body>已按目标改写。</body><anchor phase="after"/><extra/><cells>'+cells+'</cells><vars/><archive/><actions/></reply>';
test('assistant reuses simple fields and task routing, returns editable full text and original response without persisting',async()=>{
 let call,state=1;const assistant=createPreferenceAssistant({run:fn=>fn(new AbortController().signal),snapshot:async()=>({state}),request:async(task,text)=>{call={task,input:JSON.parse(text)};return response('【偏好草稿】\n1 名称 灯下叙事\n2 分类 文风\n3 完整创作指令 这是完整的新原文。');}});
 const result=await assistant({goal:'凝练一点',name:'旧名称',text:'旧原文',category:'文风'});assert.equal(call.task,'tableAssistant');assert.equal(call.input.formContract,'tisya.simple-form/1');assert.equal(result.text,'这是完整的新原文。');assert.equal(result.before.text,'旧原文');assert.match(result.rawResponse,/<reply/);assert.equal(state,1);
});
test('assistant keeps raw failure and rejects results if the source changes while generating',async()=>{
 let revision=0;const assistant=createPreferenceAssistant({run:fn=>fn(new AbortController().signal),snapshot:async()=>({revision}),request:async()=>{revision++;return response('【偏好草稿】\n1 名称 新名称\n2 分类 文风\n3 完整创作指令 新原文');}});
 await assert.rejects(()=>assistant({goal:'改写'}),error=>/已经变化/.test(error.message)&&error.rawResponse.includes('新原文'));
 const broken=createPreferenceAssistant({run:fn=>fn(new AbortController().signal),snapshot:async()=>({}),request:async()=> '不完整的模型原答'});await assert.rejects(()=>broken({goal:'改写'}),error=>error.rawResponse==='不完整的模型原答');
});

test('assistant preserves multiline prose and literal backslashes through the shared field codec',async()=>{
 const assistant=createPreferenceAssistant({run:fn=>fn(new AbortController().signal),snapshot:async()=>({}),request:async()=>response('【偏好草稿】\n1 名称 多段\n2 分类 文风\n3 完整创作指令 第一段。\\n第二段，保留路径C:\\\\texts。')});
 const result=await assistant({goal:'保留段落'});assert.equal(result.text,'第一段。\n第二段，保留路径C:\\texts。');
});
