import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';

test('actual built console selects registered gate and explicitly acknowledges its revision',async()=>{
 const w=new Window();try{
  const html=readFileSync(new URL('../worldbook/console.html',import.meta.url),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  w.document.write(html.replace(/<script>[\s\S]*?<\/script>/g,''));
  w.eval(script+`\nwindow.conditionTest={show(){hostCapabilities={conditions:true,conditionRules:[{id:'a',name:'安全',revision:2,valid:true},{id:'bad',name:'失效',revision:1,valid:false}]};draft={...Object.fromEntries(catalog.fields.map(f=>[f.key,f.default])),mode:'condition',ruleRef:'a',ruleVersion:1};document.body.innerHTML=editorActivation();render=()=>{};},get:()=>draft,fire(node,event){return function(){eval(node.getAttribute(event));}.call(node);}};`);
  w.conditionTest.show();const select=w.document.querySelector('[aria-label="条件集合引用"]');assert(select);assert.equal(select.options.length,2);assert.match(select.textContent,/安全 · v2/);assert.equal(w.conditionTest.get().ruleVersion,1);const confirm=[...w.document.querySelectorAll('button')].find(x=>x.textContent==='确认使用当前规则版本');w.conditionTest.fire(confirm,'onclick');assert.equal(w.conditionTest.get().ruleVersion,2);select.value='';w.conditionTest.fire(select,'onchange');assert.equal(w.conditionTest.get().ruleVersion,null);
 }finally{await w.happyDOM.abort();w.close();}
});

test('failed host load offers native management and does not display an endless loading state',async()=>{const w=new Window();try{const html=readFileSync(new URL('../worldbook/console.html',import.meta.url),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];w.document.write(html.replace(/<script>[\s\S]*?<\/script>/g,''));w.eval(script+`\nwindow.recoveryTest=()=>{hostPort={postMessage(){}};hostReady=false;hostBusy=false;hostError='已删原点';render();};`);w.recoveryTest();assert.match(w.document.body.textContent,/打开原生世界书管理/);assert.match(w.document.body.textContent,/世界书读取失败/);assert(!w.document.body.textContent.includes('正在读取宿主世界书…'));}finally{await w.happyDOM.abort();w.close();}});
