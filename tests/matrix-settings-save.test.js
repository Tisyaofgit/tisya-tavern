import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createConfiguration} from '../engine/config.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const button=(root,text)=>{const result=[...root.querySelectorAll('button')].find(node=>node.textContent===text);assert(result,'Missing button '+text);return result;};
const control=(root,label)=>{const node=root.querySelector('[aria-label="'+label+'"]')??[...root.querySelectorAll('label')].find(node=>node.firstChild?.textContent===label)?.querySelector('input,select,textarea');assert(node,'Missing control '+label);return node;};
const set=(window,node,value,event='input')=>{node.value=value;node.dispatchEvent(new window.Event(event,{bubbles:true}));};
async function fixture(options={}){
 const window=new Window(),root=window.document.createElement('div');window.document.body.append(root);
 const context={extensionSettings:{},chatCompletionSettings:{}},calls={config:0,form:0},errors=[];
 let configFailure=false,formFailure=false;
 const config=createConfiguration({getContext:()=>context,persist:async()=>{calls.config++;if(configFailure)throw Error('磁盘保存失败');return true;}});
 const runtime=new Runtime();runtime.registerTable('T_PREF_OUTPUT_CONFIG',[{key:'name',label:'名称',type:'TEXT'},{key:'amount',label:'数量',type:'NUMBER'}]);runtime.newRecord('T_PREF_OUTPUT_CONFIG',{name:'记录甲',amount:1},'row-a');runtime.newRecord('T_PREF_OUTPUT_CONFIG',{name:'记录乙',amount:2},'row-b');runtime.registerTable('T_OTHER',[{key:'name',label:'名称',type:'TEXT'}]);
 let data=runtime.data;
 const service={config,catalog:async()=>({tables:[{id:'T_PREF_OUTPUT_CONFIG',label:'输出配置'},{id:'T_OTHER',label:'其他'}]}),export:async()=>({state:structuredClone(data)}),latest:()=>null,mutate:async fn=>{calls.form++;if(formFailure)throw Error('表单写入失败');const next=new Runtime(data);fn(next);data=next.data;}};
 const view=mountMatrixConfiguration(window.document,root,{service,onError:error=>errors.push(error),...options});await view.ready;
 return {window,root,view,service,config,calls,errors,data:()=>structuredClone(data),failConfig:value=>configFailure=value,failForm:value=>formFailure=value,close:async()=>{view.dispose();await window.happyDOM.abort();window.close();}};
}
async function selectRecord(f,id='row-a'){
 await button(f.root,'表单与存档').onclick();const select=control(f.root,'记录');select.value=id;await select.onchange();
}

test('all six Matrix settings pages share one bottom action pair and current-page clicks do not prompt',async()=>{
 const f=await fixture();try{
  for(const name of ['游玩偏好','多媒体资源','回复格式','完整预设','表单与存档','生成设置']){
   await button(f.root,name).onclick();assert.equal(f.root.querySelectorAll('footer.tisya-settings-actions').length,1);assert.equal([...f.root.querySelectorAll('button')].filter(node=>node.textContent==='保存').length,1);assert.equal([...f.root.querySelectorAll('button')].filter(node=>node.textContent==='取消修改').length,1);
   assert.equal([...f.root.querySelector('.tisya-matrix-content').querySelectorAll('button')].some(node=>/^保存(?:配置|游玩偏好|回复格式|预设改动|生成设置|表单记录)$/.test(node.textContent)),false);
  }
  await button(f.root,'回复格式').onclick();set(f.window,control(f.root,'正文'),'draftbody');await button(f.root,'回复格式').onclick();assert.equal(f.root.querySelector('[role=dialog]'),null);assert.equal(f.calls.config,0);
 }finally{await f.close();}
});

test('changing page asks once, never autosaves, and permits stay then one confirmed save',async()=>{
 const f=await fixture();try{
  await button(f.root,'回复格式').onclick();const input=control(f.root,'正文');set(f.window,input,'storybody');const route=button(f.root,'游玩偏好').onclick();await tick();button(f.root,'多媒体资源').click();
  assert.equal(f.root.querySelectorAll('[role=dialog]').length,1);assert.equal(f.calls.config,0);assert.equal(input.isConnected,true);
  await button(f.root,'继续编辑').onclick();assert.equal(await route,false);assert.equal(input.value,'storybody');
  const next=button(f.root,'多媒体资源').onclick();await tick();await button(f.root,'保存并切换').onclick();assert.equal(await next,true);assert.equal(f.calls.config,1);assert.equal(f.config.read().tags.body,'storybody');assert.equal(f.view.state().page,'resources');assert.equal(f.root.querySelector('[role=dialog]'),null);
 }finally{await f.close();}
});

test('failed save leaves the same modal and inputs editable for a successful retry',async()=>{
 const f=await fixture();try{
  await button(f.root,'回复格式').onclick();const input=control(f.root,'正文');set(f.window,input,'retrybody');f.failConfig(true);
  const route=button(f.root,'多媒体资源').onclick();await tick();await button(f.root,'保存并切换').onclick();assert.match(f.root.querySelector('[role=dialog]').textContent,/磁盘保存失败/);assert.equal(input.value,'retrybody');assert.equal(f.view.state().dirty,true);assert.equal(f.config.read().tags.body,'body');
  f.failConfig(false);await button(f.root,'保存并切换').onclick();assert.equal(await route,true);assert.equal(f.config.read().tags.body,'retrybody');assert.equal(f.view.state().dirty,false);assert.equal(f.calls.config,2);
 }finally{await f.close();}
});

test('record edits have their own dirty state and use the shared save without writing configuration',async()=>{
 const f=await fixture();try{
  await selectRecord(f);set(f.window,control(f.root,'数量 · amount'),'0');assert.deepEqual([f.view.state().configDirty,f.view.state().formDirty],[false,true]);assert.equal(f.view.requestLeave().allowed,false);
  f.failForm(true);assert.equal(await f.view.saveDraft(),false);assert.equal(control(f.root,'数量 · amount').value,'0');assert.equal(f.view.state().formDirty,true);assert.equal(f.calls.config,0);
  f.failForm(false);assert.equal(await f.view.saveDraft(),true);assert.equal(f.data().tables.T_PREF_OUTPUT_CONFIG['row-a'].values.amount,0);assert.equal(f.view.state().dirty,false);assert.equal(f.calls.config,0);
 }finally{await f.close();}
});

test('record and table selection changes use the same prompt and discard only on explicit choice',async()=>{
 const f=await fixture();try{
  await selectRecord(f);set(f.window,control(f.root,'名称 · name'),'尚未保存');const select=control(f.root,'记录');select.value='row-b';const route=select.onchange();await tick();assert.equal(select.value,'row-a');assert.equal(f.calls.form,0);
  await button(f.root,'放弃修改').onclick();assert.equal(await route,true);assert.equal(control(f.root,'记录').value,'row-b');assert.equal(control(f.root,'名称 · name').value,'记录乙');assert.equal(f.data().tables.T_PREF_OUTPUT_CONFIG['row-a'].values.name,'记录甲');
  set(f.window,control(f.root,'名称 · name'),'记录乙修订');const table=control(f.root,'表单');table.value='T_OTHER';const changed=table.onchange();await tick();await button(f.root,'保存并切换').onclick();assert.equal(await changed,true);assert.equal(control(f.root,'表单').value,'T_OTHER');assert.equal(f.data().tables.T_PREF_OUTPUT_CONFIG['row-b'].values.name,'记录乙修订');
 }finally{await f.close();}
});

test('mixed form and output selection validate before writing and retry only the unsaved part',async()=>{
 const f=await fixture();try{
  await selectRecord(f);await button(f.root,'用作当前输出配置').onclick();set(f.window,control(f.root,'数量 · amount'),'not a number');assert.equal(await f.view.saveDraft(),false);assert.equal(f.calls.form,0);assert.equal(f.calls.config,0);
  set(f.window,control(f.root,'数量 · amount'),'3');f.failConfig(true);assert.equal(await f.view.saveDraft(),false);assert.equal(f.data().tables.T_PREF_OUTPUT_CONFIG['row-a'].values.amount,3);assert.equal(f.view.state().formDirty,false);assert.equal(f.view.state().configDirty,true);assert.match(f.root.querySelector('footer').textContent,/表单记录已保存/);
  f.failConfig(false);assert.equal(await f.view.saveDraft(),true);assert.equal(f.calls.form,1);assert.equal(f.config.read().story.outputConfigId,'row-a');assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});

test('the shared save includes a complete unqueued resource and retains invalid resource inputs',async()=>{
 const f=await fixture();try{
  await button(f.root,'多媒体资源').onclick();set(f.window,control(f.root,'参数 ID'),'scene.test');set(f.window,control(f.root,'资源含义'),'窗边');assert.equal(await f.view.saveDraft(),false);assert.equal(f.calls.config,0);assert.equal(control(f.root,'参数 ID').value,'scene.test');assert.equal(f.view.state().dirty,true);
  set(f.window,control(f.root,'资源地址'),'https://example.test/window.png');assert.equal(await f.view.saveDraft(),true);assert.equal(f.config.read().resources.length,1);assert.equal(f.config.read().resources[0].id,'scene.test');assert.equal(f.view.state().dirty,false);assert.equal(control(f.root,'参数 ID').value,'');
  set(f.window,control(f.root,'参数 ID'),'scene.other');set(f.window,control(f.root,'资源含义'),'门边');set(f.window,control(f.root,'资源地址'),'https://example.test/door.png');await button(f.root,'加入资源列表').onclick();assert.equal(f.config.read().resources.length,1);assert.equal(f.view.state().dirty,true);await f.view.discardDraft();assert.equal(f.config.read().resources.length,1);assert.equal(f.view.state().dirty,false);
 }finally{await f.close();}
});

test('refresh and stale saves preserve both config and record drafts instead of redrawing them away',async()=>{
 const f=await fixture();try{
  await button(f.root,'回复格式').onclick();const original=control(f.root,'正文');set(f.window,original,'unsubmitted');assert.equal(await f.view.refresh(),false);assert.equal(control(f.root,'正文'),original);
  const competing=f.config.read();competing.tags.body='externalbody';await f.config.save(competing);assert.equal(await f.view.saveDraft(),false);assert.equal(original.value,'unsubmitted');assert.equal(f.config.read().tags.body,'externalbody');await f.view.discardDraft();assert.equal(control(f.root,'正文').value,'externalbody');
  await selectRecord(f);const record=control(f.root,'名称 · name');set(f.window,record,'待保存');assert.equal(await f.view.refresh(),false);assert.equal(control(f.root,'名称 · name'),record);
 }finally{await f.close();}
});

test('external navigation is guarded once and remains permitted to its own clean callback',async()=>{
 let f,visited=0;f=await fixture({onIdentity:()=>{assert.equal(f.view.requestLeave().allowed,true);visited++;}});try{
  await button(f.root,'回复格式').onclick();set(f.window,control(f.root,'正文'),'externalroute');const first=button(f.root,'用户身份').onclick();await tick();assert.equal(await f.view.confirmLeave(),false);assert.equal(f.root.querySelectorAll('[role=dialog]').length,1);assert.equal(visited,0);
  await button(f.root,'继续编辑').onclick();assert.equal(await first,false);assert.equal(visited,0);assert.equal(f.view.state().dirty,true);
  const second=button(f.root,'用户身份').onclick();await tick();await button(f.root,'保存并切换').onclick();assert.equal(await second,true);assert.equal(visited,1);assert.equal(f.config.read().tags.body,'externalroute');assert.equal(await f.view.confirmLeave(),true);
 }finally{await f.close();}
});
