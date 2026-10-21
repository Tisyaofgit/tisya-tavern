import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {fixture} from './fixtures/journey-r4.cjs';
import {createNativeDisplayPipeline} from '../native-display.js';
import {inspectMessage} from '../reader.js';
import {nativePanelContentProcessor} from '../native-panel-source.js';

const panel='<!doctype html>\n<html><body><p>计数面板</p><script>window.panelReady=true;</script></body></html>';
const update='<UpdateVariable><Analysis>PRIVATE_ANALYSIS</Analysis><JSONPatch>[{"op":"replace","path":"/计数","value":2}]</JSONPatch></UpdateVariable>';
const brokenMemory='关联：人物甲|D\n关联：人物乙|B\n场景：整训|[某日 午后,某日 黄昏]|营地|测试世界\n事件：人物甲|B|完成整训\n原文：段落1\n心理：人物甲|C|PRIVATE_THOUGHT';
function source(memory=brokenMemory,{extra='',status='',duplicate=false}={}){
 return fixture({extra:extra+(duplicate?'\n<StatusPlaceHolderImpl/>\n':''),status,memory}).replace('<vars/>','<vars format="xml"><![CDATA['+update+'\n<StatusPlaceHolderImpl/>]]></vars>');
}
function pipeline(){return createNativeDisplayPipeline({enabled:()=>true,scripts:()=>[{scriptName:'原卡状态栏',findRegex:'<StatusPlaceHolderImpl/>',replaceString:'```html\n'+panel+'\n```',placement:[2],markdownOnly:true}],regexProvider:{get:s=>new RegExp(s,'g')}});}

test('native panel reads its own permission boundary despite unrelated narrative record errors',()=>{
 const p=pipeline();
 for(const memory of [brokenMemory,'场景：整训|[午后,黄昏]|营地|测试世界\n事件：人物甲|B|完成整训','事件：人物甲|B|完成整训\n心理：人物甲|C|PRIVATE_THOUGHT']){
  const s=source(memory),before=s,view=p.project(s);
  assert.equal(view.extraPanels.length,1);assert.match(view.extraPanels[0].html,/计数面板/);
  assert.ok(inspectMessage(s).journey.error,'record errors must still be reported');
  assert.doesNotMatch(JSON.stringify(view.extraPanels),/PRIVATE_|JSONPatch/);assert.equal(s,before);
 }
 const s=source('事件：人物甲|B|完成整训',{status:'叙事状态：缺少字段'});
 assert.equal(p.project(s).extraPanels.length,1);assert.ok(inspectMessage(s).journey.error);
});
test('private extra permissions still block panels even when their event records are invalid',()=>{
 const p=pipeline();
 for(const permission of ['C','["E",["叙事组织"],[],[]]','{"默认":"A","字段":{"/内容":"D"}}']){
  const s=source('权限：extra|[面板,内容]|'+permission+'\n'+brokenMemory);
  assert.equal(p.project(s).extraPanels.length,0);
 }
});
test('malformed, unknown and misplaced permissions never become public during record isolation',()=>{
 const p=pipeline();
 for(const memory of ['权限：extra|[面板,内容]','权限：extra|[面板,内容]|Z','权限：extra|[面板,内容]|{"默认":"A"}','权限：unknown|[面板,内容]|A','事件：人物甲|A|公开\n权限：extra|[面板,内容]|A','权限错误：extra|[面板,内容]|C', '事件：人物甲|A|"broken'])assert.throws(()=>p.project(source(memory)),undefined,memory);
 const nested=source('<private>权限：extra|[面板,内容]|C</private>');assert.throws(()=>p.project(nested));
});
test('manually copied direct extra marker and terminal vars marker generate only one source',async()=>{
 const w=new Window(),d=w.document,p=pipeline(),s=source(brokenMemory,{duplicate:true}),message={mes:s};
 const processor=nativePanelContentProcessor({document:d,project:s=>p.project(s)});
 const html=await processor.prepare({message,mesid:0},async()=>'<p>原生正文</p>');
 const root=d.createElement('div');root.innerHTML=html;
 assert.equal(p.project(s).extraPanels.length,1);assert.equal(root.querySelectorAll('pre').length,1);
 assert.equal(root.querySelector('code').textContent,panel+'\n');assert.equal(message.mes,s);
 assert.equal(root.querySelector('iframe,script'),null);await w.happyDOM.abort();
});
