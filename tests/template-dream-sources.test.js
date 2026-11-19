import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureTemplateSources,projectTemplateSources,ensureTemplateNativeSource} from '../engine/template-dream-sources.mjs';
import {insertNativeDreamSources} from '../engine/native-source-placement.mjs';
import {wrapNativeSource} from '../engine/native-source-layers.mjs';

const item=(role,content)=>({role,content});
const start='[Dream Rules]\n上界',end='[/Dream Rules]';
const compiled={layerPlan:{entries:[
 {identifier:'tisya_material_boundary_open',enabled:true,role:'system',content:start},
 {identifier:'tisya_material_boundary_close',enabled:true,role:'system',content:end},
]}};

test('late template output joins the original card and worldbooks in one assistant batch',()=>{
 const original=[
  item('system','<rule>预设优先。</rule>{{outletPromptsInjected:test}}'),
  item('system',start),item('system',end),item('user','玩家输入。'),
  {role:'tool',tool_call_id:'call-1',content:'工具结果'},
 ];
 const initial=insertNativeDreamSources(original,compiled,[wrapNativeSource('原卡状态。','角色卡'),wrapNativeSource('<%= "被激活的条件世界书" %>','世界书')]);
 const captured=captureTemplateSources(initial.messages,initial.content);
 const working=captured.messages;
 working[0].content='首部模板'+working[0].content.replace('{{outletPromptsInjected:test}}','内联出口');
 working[2].content=working[2].content.replace('<%= "被激活的条件世界书" %>','被激活的条件世界书');
 working.splice(1,0,item('system','独立模板\n</NativeDreamSources>'));
 working.find(row=>row.role==='user').content+='尾部模板';
 const result=projectTemplateSources(working,captured,compiled);
 assert.equal(result.additions,4);
 assert.deepEqual(result.messages.filter(row=>row.role==='system'),[original[0],original[1],original[2]].map((row,i)=>i?row:item('system','<rule>预设优先。</rule>')));
 assert.deepEqual(result.messages.at(-2),original[3]);assert.deepEqual(result.messages.at(-1),original[4]);
 assert.equal(result.messages[2].role,'assistant');
 assert.match(result.messages[2].content,/^<NativeDreamSources>\n/);
 for(const text of ['首部模板','内联出口','独立模板','原卡状态','被激活的条件世界书','尾部模板'])assert(result.messages[2].content.includes(text),text);
 assert.equal(result.messages[2].content.split('</NativeDreamSources>').length,2);
 assert.doesNotMatch(JSON.stringify(result.messages),/TISYA_TEMPLATE_(?:START|END)/);
});

test('roles, lost provenance and unresolved template outlets cannot silently pass',()=>{
 const messages=[item('system',start),item('system','{{outletPromptsInjected:unresolved}}'),item('system',end)];
 const capture=captureTemplateSources(messages,null);
 assert.throws(()=>projectTemplateSources(capture.messages,capture,compiled),{code:'TEMPLATE_SOURCE_UNEXPANDED'});
 capture.messages[0].role='assistant';
 assert.throws(()=>projectTemplateSources(capture.messages,capture,compiled),{code:'TEMPLATE_SOURCE_ROLE'});
 assert.throws(()=>projectTemplateSources(capture.messages.slice(2),capture,compiled),{code:'TEMPLATE_SOURCE_MISSING'});
});

test('a rebuilt pre-template payload recovers the verified native batch once at its boundaries',()=>{
 const original=[item('system',start),item('system',end),item('user','继续。')];
 const initial=insertNativeDreamSources(original,compiled,[wrapNativeSource('人物原文。','角色卡')]);
 const missing=initial.messages.filter(row=>row.content!==initial.content);
 const restored=ensureTemplateNativeSource(missing,initial.content,compiled);
 assert.equal(restored.recovered,true);
 assert.deepEqual(restored.messages,initial.messages);
 const capture=captureTemplateSources(restored.messages,initial.content);
 assert.deepEqual(projectTemplateSources(capture.messages,capture,compiled).messages,initial.messages);
 assert.equal(ensureTemplateNativeSource(restored.messages,initial.content,compiled).recovered,false);
 assert.throws(()=>ensureTemplateNativeSource([...missing,item('assistant','<NativeDreamSources>\n被改写')],initial.content,compiled),{code:'TEMPLATE_SOURCE_BOUNDARY'});
 assert.throws(()=>ensureTemplateNativeSource([...initial.messages,item('assistant',initial.content)],initial.content,compiled),{code:'TEMPLATE_SOURCE_BOUNDARY'});
});
