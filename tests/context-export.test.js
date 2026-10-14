import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountConfiguration} from '../config/panel.js';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {transportSummary,exportContextText,copyContextText} from '../config/context-export.js';

async function fixture(contextIO={}){
 const window=new Window(),data=emptyConfig();data.worlds.one=defaultWorld();let saves=0;
 const rows=[{at:'2026-10-14T21:37:49.981Z',task:'main',messages:[{role:'user',content:'第一条原文🙂'}],transport:{mode:'tool-text',state:'bypassed',reason:'search',label:'本次使用搜索'}},{at:'2026-10-14T21:38:00.000Z',task:'summary',messages:[{role:'user',content:'第二条原文'}],transport:{mode:'tool-text',state:'complete',restored:true,label:'本次协议完整结束'}}];
 const store={read:()=>({key:'one',world:data.worlds.one,data,revision:0}),save:async()=>{saves++;throw Error('must not save');}},host={preview:()=>structuredClone(rows[1]),snapshots:()=>structuredClone(rows),transportStatus:()=>({state:'error',label:'另一请求的错误'}),connections:()=>[],presets:()=>[]};
 const ui=mountConfiguration(window.document,window.document.body,{store,host,initialTab:'api',version:'fixture-version',contextIO});await ui.ready;const dom=ui.root.shadowRoot,button=label=>[...dom.querySelectorAll('button')].find(b=>b.textContent===label);await button('上下文一览').onclick();return {window,ui,dom,button,rows,saves:()=>saves,close(){ui.dispose();window.happyDOM.abort();}};
}

test('copy and export select the displayed snapshot, preserve full Unicode text and use its own status',async()=>{
 const copies=[],exports=[],f=await fixture({copy:async text=>copies.push(text),export:async(text,name)=>{exports.push({text,name});return {mode:'android-document-picker'};}});
 try{
  assert.match(f.dom.textContent,/正文抗截断已生效/);assert.doesNotMatch(f.dom.textContent,/另一请求的错误/);await f.button('复制当前记录').onclick();assert.equal(JSON.parse(copies[0]).snapshot.task,'summary');
  const picker=f.dom.querySelector('[aria-label="选择请求快照"]');picker.value='0';picker.onchange();assert.match(f.dom.textContent,/本次未启用抗截断：请求已开启搜索/);await f.button('复制当前记录').onclick();await f.button('导出当前记录').onclick();
  const body=JSON.parse(copies[1]);assert.deepEqual(body.snapshot,f.rows[0]);assert.equal(body.version,'fixture-version');assert.equal(exports[0].text,copies[1]);assert.equal(f.dom.querySelector('pre').textContent,copies[1]);assert.match(exports[0].name,/^缇斯亚__上下文__.*\.json$/);assert.equal(f.saves(),0);
 }finally{f.close();}
});

test('clipboard/export failure is visible and manual text contains the exact selected record',async()=>{
 const f=await fixture({copy:async()=>{throw Error('denied');},export:async()=>({mode:'failed'})});
 try{await f.button('复制当前记录').onclick();assert.match(f.dom.textContent,/自动复制失败/);const manual=f.dom.querySelector('[aria-label="手动复制当前记录"]');assert.equal(manual.hidden,false);assert.equal(manual.value,f.dom.querySelector('pre').textContent);await f.button('导出当前记录').onclick();assert.match(f.dom.textContent,/导出未完成/);assert.equal(f.saves(),0);}finally{f.close();}
});

test('export uses the host runtime file API and propagates unsupported/failure; clipboard awaits actual write',async()=>{
 let called=0;const result=await exportContextText('正文🙂','context.json',{load:async()=>({downloadBlobWithRuntime:async(blob,name)=>{called++;assert.equal(await blob.text(),'正文🙂');assert.equal(name,'context.json');return {mode:'android-document-picker'};}})});assert.equal(result.mode,'android-document-picker');assert.equal(called,1);
 await assert.rejects(exportContextText('x','x',{load:async()=>({})}),/缺少/);await assert.rejects(exportContextText('x','x',{load:async()=>({downloadBlobWithRuntime:async()=>({mode:'failed'})})}),/未确认/);
 let copied;await copyContextText({defaultView:{navigator:{clipboard:{writeText:async x=>{copied=x;}}}}},'原文');assert.equal(copied,'原文');await assert.rejects(copyContextText({defaultView:{navigator:{}}},'x'),/不支持/);
 assert.match(transportSummary({mode:'verify-tools',state:'tool-handoff'}),/尚非最终正文/);assert.match(transportSummary({mode:'verify-tools',state:'complete',label:'完整'}),/仅完整性检查/);assert.match(transportSummary({mode:'verify',state:'complete',label:'完整'}),/仅完整性检查/);assert.match(transportSummary({mode:'tool-text',state:'receiving'}),/尚未完成/);
});
