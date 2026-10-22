import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createBookGateway} from '../tables/books.js';
import {createTableService} from '../tables/service.js';
import {mountTablePanel} from '../tables/panel.js';

async function fixture(){
 const data=emptyConfig(),context={chatId:'atlas-panel',characterId:0,characters:[{avatar:'atlas.png',name:'甲'}],chat:[{is_user:false,mes:'开场'}],extensionSettings:{[KEY]:data}};data.worlds[worldKey(context)]=defaultWorld();data.worlds[worldKey(context)].tables={injection:'direct'};
 const saved=new Map(),binding={primary:'',additional:[]};let uid=0;const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>structuredClone(saved.get(name)),createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(e=>({...structuredClone(e),uid:++uid})));return true;},updateWorldbookWith:async(name,fn)=>{const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async()=>structuredClone(binding),rebindCharWorldbooks:async(_,next)=>Object.assign(binding,next)};
 const store=createStore({getContext:()=>context,persist:async()=>true}),books=createBookGateway(()=>helper,()=>context),service=createTableService({store,getContext:()=>context,books,request:async()=>{throw Error('UI editing must not call a model');}});await service.initialize();await service.edit({templates:[],changes:[{id:'new:gate',table:'objects',expected:0,values:{名称:'北门',类型:'place',属性:{介绍:'城北石门'}},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}]});
 const win=new Window(),root=win.document.createElement('div');win.document.body.append(root);const panel=mountTablePanel(win.document,root,{service,store,initialPage:'atlas'});await panel.ready;
 const find=text=>{const button=[...root.querySelectorAll('button')].find(b=>b.textContent===text);assert(button,'missing button '+text);return button;};
 const click=async text=>{find(text).click();await new Promise(resolve=>setTimeout(resolve,0));await panel.settled();};
 const input=(label,value)=>{const item=root.querySelector('[aria-label="'+label+'"]');assert(item,'missing input '+label);item.value=value;item.dispatchEvent(new win.Event('input',{bubbles:true}));return item;};
 return {root,panel,service,store,win,click,input,find,close:async()=>{panel.dispose();await win.happyDOM.close();}};
}

test('real archive panel edits the single ledger, preserves draft on back, and returns a read-only saved projection',async()=>{
 const f=await fixture();try{
  assert.equal(f.root.querySelector('textarea'),null);assert.match(f.root.textContent,/城北石门/);await f.click('编辑');
  const category=f.input('编辑哪一类','type:place');category.dispatchEvent(new f.win.Event('change'));await f.panel.settled();await f.click('进入内容编辑');
  f.input('名称 · 值','北城门');await f.click('← 返回只读档案');assert.equal(f.root.querySelector('textarea'),null);assert.match(f.root.textContent,/北门/);assert(f.panel.requestLeave({preserve:true}).dirty);
  await f.click('编辑');assert.equal(f.root.querySelector('[aria-label="名称 · 值"]').value,'北城门');await f.click('保存档案修改');
  assert.equal((await f.service.inspect()).rows.find(r=>r.table==='objects').values.名称,'北城门');await f.click('← 返回只读档案');assert.match(f.root.textContent,/北城门/);assert.equal(f.root.querySelector('textarea'),null);assert.equal(f.panel.requestLeave().dirty,false);
 }finally{await f.close();}
});

test('type editor keeps inherited parent and saves optional fields through strict compatibility validation',async()=>{
 const f=await fixture();try{
  const before=await f.service.inspect(),registry=structuredClone(before.registry);registry.types.push({id:'citygate',name:'城门',aliases:[],version:1,parent:'place',fields:{门制:{type:'text'}}});await f.service.saveTemplates(registry,before.origin.revision);await f.panel.navigate('atlas');
  await f.click('编辑 城门 的类型与字段');await f.click('进入类型编辑');assert.equal(f.root.querySelector('[aria-label="父类型"]').value,'place');
  await f.click('新增字段');const fields=[...f.root.querySelectorAll('[aria-label="字段名称"]')];const added=fields.find(x=>!x.disabled);assert(added);added.value='门宽';added.dispatchEvent(new f.win.Event('input',{bubbles:true}));await f.click('保存类型与字段');
  const after=await f.service.inspect(),type=after.registry.types.find(t=>t.id==='citygate');assert.equal(type.parent,'place');assert.equal(type.fields.门宽.type,'text');assert.equal(type.fields.门宽.required,undefined);assert.equal(type.fields.门制.type,'text');
  const incompatible=structuredClone(after.registry);incompatible.types.find(t=>t.id==='citygate').fields.门制={type:'number'};await assert.rejects(f.service.saveTemplates(incompatible,after.origin.revision),/字段|类型|变更|修改/);
 }finally{await f.close();}
});

test('stale record edits retain their draft and never overwrite independently saved rows',async()=>{
 const f=await fixture();try{await f.click('编辑');const category=f.input('编辑哪一类','type:place');category.dispatchEvent(new f.win.Event('change'));await f.panel.settled();await f.click('进入内容编辑');f.input('名称 · 值','草稿名称');const row=(await f.service.inspect()).rows.find(r=>r.table==='objects');await f.service.edit({changes:[{id:row.id,table:row.table,expected:row.rev,values:{名称:'外部新名称'},access:row.access,evidence:'用户手动修改表单'}]});await f.click('保存档案修改');assert.equal((await f.service.inspect()).rows.find(r=>r.id===row.id).values.名称,'外部新名称');assert.equal(f.root.querySelector('[aria-label="名称 · 值"]').value,'草稿名称');assert.equal(f.panel.requestLeave().dirty,true);assert(f.root.querySelector('[role="alert"]'));}finally{await f.close();}
});

test('completed rule review offers a reversible initialization handoff without any new request or write',async()=>{
 const f=await fixture();try{f.service.ruleReviewStatus=async()=>({review:{fingerprint:'reviewed',issues:[],decisions:{}},stale:false});await f.panel.navigate('history');const before=await f.service.inspect();await f.click('继续生成表格');const ruleBox=[...f.root.querySelectorAll('fieldset')].find(x=>x.querySelector('legend')?.textContent==='原卡规则校对 · 缇斯亚版');assert.equal(ruleBox.hidden,true);assert.match(f.root.querySelector('[role="status"]').textContent,/读取并预览初始化模板/);await f.click('‹ 返回规则校对');assert.equal(ruleBox.hidden,false);const after=await f.service.inspect();assert.equal(after.session.revision,before.session.revision);assert.equal(after.origin.revision,before.origin.revision);}finally{await f.close();}
});
