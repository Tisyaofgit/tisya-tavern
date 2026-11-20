import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountContextInspector,contextSnapshotNote} from '../config/context-inspector.js';

const rows=[
 {at:'2026-11-20T10:00:00.000Z',session:'chat-one',task:'main',contextOwner:'matrix',dispatch:{stage:'assembled',at:'2026-11-20T10:00:00.000Z',observation:'pending'},messages:[{role:'system',content:'缇斯亚系统合同'},{role:'user',content:'旧的用户原文'}],tools:[],parameters:{model:'old-model'}},
 {at:'2026-11-20T10:01:00.000Z',session:'chat-one',task:'main',contextOwner:'matrix',dispatch:{stage:'host-fetch',at:'2026-11-20T10:01:01.000Z',observation:'read-back'},messages:[{role:'system',content:'只有缇斯亚占据系统层'},{role:'assistant',content:'角色历史正文'},{role:'user',content:[{type:'text',text:'最新用户完整原文🙂'},{type:'image_url',image_url:{url:'data:image/png;base64,fixture'}}]},{role:'assistant',content:'<NativeDreamSources>\n角色卡原文\n</NativeDreamSources>'}],tools:[{type:'function',function:{name:'fixture'}}],parameters:{model:'fixture-model',max_tokens:999,api_key:'[已隐藏敏感字段]'}},
];
function fixture(contextIO={}){
 const window=new Window(),errors=[],host={preview:()=>structuredClone(rows.at(-1)),snapshots:()=>structuredClone(rows)};
 const ui=mountContextInspector(window.document,window.document.body,{host,version:'fixture-version',contextIO,onError:error=>errors.push(error)}),dom=ui.root.shadowRoot,button=label=>[...dom.querySelectorAll('button')].find(row=>row.textContent===label);
 return {window,ui,dom,button,errors,close(){ui.dispose();window.happyDOM.abort();}};
}

test('context inspector shows every message role and full text, and copies or exports the selected host-fetch record',async()=>{
 const copies=[],exports=[],f=fixture({copy:async text=>copies.push(text),export:async(text,name)=>{exports.push({text,name});return {mode:'android-document-picker'};}});
 try{
  assert.match(f.dom.textContent,/宿主 fetch 发送入口读回/);assert.match(f.dom.textContent,/不是供应商接收回执/);assert.match(f.dom.textContent,/只有缇斯亚占据系统层/);assert.match(f.dom.textContent,/最新用户完整原文🙂/);assert.match(f.dom.textContent,/角色卡原文/);assert.match(f.dom.textContent,/fixture-model/);
  await f.button('复制当前记录').onclick();await f.button('导出当前记录').onclick();const body=JSON.parse(copies[0]);assert.equal(body.snapshot.dispatch.stage,'host-fetch');assert.equal(body.snapshot.messages.length,4);assert.equal(body.version,'fixture-version');assert.equal(exports[0].text,copies[0]);assert.match(exports[0].name,/^缇斯亚__上下文__/);assert.deepEqual(f.errors,[]);
  const picker=f.dom.querySelector('[aria-label="选择当前会话请求快照"]');picker.value=rows[0].at;picker.onchange();assert.match(f.dom.textContent,/旧的用户原文/);assert.doesNotMatch(f.dom.textContent,/最新用户完整原文🙂/);await f.button('复制当前记录').onclick();assert.equal(JSON.parse(copies[1]).snapshot.parameters.model,'old-model');
 }finally{f.close();}
});

test('clipboard failure exposes the exact full record for manual copy',async()=>{
 const f=fixture({copy:async()=>{throw Error('denied');}});
 try{await f.button('复制当前记录').onclick();const manual=f.dom.querySelector('[aria-label="手动复制当前记录"]');assert.equal(manual.hidden,false);assert.equal(JSON.parse(manual.value).snapshot.messages[2].content[0].text,'最新用户完整原文🙂');assert.match(f.dom.textContent,/自动复制失败/);assert.equal(f.errors.length,1);}finally{f.close();}
});

test('empty and assembled states never imply a provider receipt',()=>{
 const window=new Window(),ui=mountContextInspector(window.document,window.document.body,{host:{preview:()=>null,snapshots:()=>[]}});assert.match(ui.root.shadowRoot.textContent,/尚无 Matrix 主请求记录/);ui.dispose();
 assert.match(contextSnapshotNote(rows[0]),/尚未在宿主发送入口读回/);assert.doesNotMatch(contextSnapshotNote(rows[0]),/供应商接收回执。$/);window.happyDOM.abort();
});
