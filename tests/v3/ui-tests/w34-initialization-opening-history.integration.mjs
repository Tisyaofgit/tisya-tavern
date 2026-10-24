import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRetained} from '../../../v3/host-runtime.mjs';
import {parseSimpleSheet} from '../../../tables/simple-sheet.js';
import {setupFlow,sourceText,change,extraction,proposal} from './w34-flow-harness.mjs';
import {xml} from '../host-tests/installer-harness.mjs';

const copy=structuredClone;
const slot=(messages,name)=>{const marker='[TISYA.DATA.'+name.toUpperCase()+']\n',message=messages.find(m=>m.content.startsWith(marker));assert.ok(message,'Expected assembled '+name+' material slot');return parseSimpleSheet(message.content.split('\n').slice(2,-1).join('\n'));};
const noAlert=f=>assert.equal(f.shadow.querySelector('[role="alert"]')?.textContent??'','',f.actionErrors.at(-1)?.stack);
const initialChanges=()=>[
 change('new:shopkeeper','objects',{名称:'阿绫',类型:'character',描述:sourceText.card},sourceText.card),
 change('new:lamp','objects',{名称:'定风灯',类型:'item',描述:sourceText.book},sourceText.book),
];
const currentView=async f=>{const s=await f.app.getSession();return projectRetained(await s.storage.read(),s.getScope().activeSourceKeys);};

test('actual application UI automatically initializes card/books, establishes the selected opening, imports native floors and reopens the same records',async t=>{
 const historyInputs=[];
 const f=await setupFlow(t,{request:(task,input,{messages})=>{
  if(task==='templateInit'&&input.phase==='definition'){
   assert.equal(input.sourceCardRaw.fields.description,sourceText.card);
   assert.equal(input.sourceCardRaw.entries[0].content,sourceText.embedded);
   assert.equal(input.sourceBooks.find(b=>b.book==='渡口配套').content,sourceText.book);
   assert.equal(slot(messages,'card').fields.description,sourceText.card);
   assert.equal(slot(messages,'books').find(b=>b.book==='渡口配套').content,sourceText.book);
   const supplied=JSON.stringify(input);for(const excluded of [sourceText.persona,sourceText.opener,sourceText.alternative,sourceText.disabled,sourceText.history])assert.equal(supplied.includes(excluded),false,'Initialization must not import '+excluded);
   assert.equal(messages.some(m=>m.content.includes('MUST_NOT_EXPAND_SOURCE')),false,'Native definition macros stay verbatim');
   return {...extraction(initialChanges()),initial:proposal([change('new:energy','state',{名称:'阿绫精力',对象:'new:shopkeeper',字段:'精力',值:6},sourceText.initialState)])};
  }
  if(task==='templateInit'&&input.phase==='opening'){
   assert.equal(input.sourceUser.name,'林澈');assert.equal(input.sourceUser.description,sourceText.persona);
   assert.equal(input.selectedOpening.id,'chat:0');assert.equal(input.selectedOpening.text,sourceText.opener);
   assert.equal(slot(messages,'source').selectedOpening.text,sourceText.opener);
   assert.equal(JSON.stringify(input).includes(sourceText.alternative),false);
   const character=input.currentRows.find(r=>r.values.名称==='阿绫');assert.ok(character);
   assert.ok(input.sourceBooks.some(b=>b.content===sourceText.initialState),'Opening rereads the exact initialization book source, including states deferred from the base');
   assert.ok(slot(messages,'books').some(b=>b.content===sourceText.initialState));
   return {templates:[],schemaChanges:[],notes:[],base:proposal([]),initial:proposal([
    change('new:opening-scene','scene',{名称:'修理铺开局',当前时间:'2001-10-12 11:30',场景:'修理铺柜台',参与者:[input.sourceUser.objectId,character.id]},sourceText.opener),
    change('new:opening-energy','state',{名称:'阿绫精力',对象:character.id,字段:'精力',值:6},sourceText.initialState),
   ])};
  }
  if(task==='historyImport'){
   historyInputs.push(copy(input));const expected=historyInputs.length===1?sourceText.history:sourceText.later;
   assert.ok(input.historyText.includes(expected));assert.doesNotMatch(input.historyText,/污染摘要|污染变量/);
   assert.ok(JSON.stringify(slot(messages,'history')).includes(expected));
   const energy=input.currentRows.find(r=>r.table==='state'&&r.values.名称==='阿绫精力');assert.ok(energy);
   assert.equal(energy.values.值,historyInputs.length===1?6:5,'Later selected floor receives the earlier reviewed state');
   return proposal([change('new:event','events',{名称:historyInputs.length===1?'旧钥匙交接':'收好旧钥匙',经过:expected},expected),...(historyInputs.length===1?[change(energy.id,'state',{值:5},expected,energy.rev)]:[])]);
  }
  assert.fail('Unexpected task '+task+' / '+input.phase);
 }});
 const chatBefore=f.h.ctx.chat.map(m=>m.mes),bookBefore=copy(f.nativeBook);
 const s=await f.app.getSession(),initialState=await s.storage.read();
 await f.click('初始化／从资料提炼');noAlert(f);assert.equal(f.tasks.length,0);
 await f.click('读取角色卡和绑定世界书');noAlert(f);assert.equal(f.tasks.length,0);
 assert.match(f.shadow.textContent,/阿绫/);assert.match(f.shadow.textContent,/渡口配套/);
 await f.click('生成初始化草案');noAlert(f);assert.equal((await s.storage.read()).commits.length,initialState.commits.length);
 await f.click('保存已选设定');noAlert(f);
 let view=await currentView(f);assert.deepEqual(view.rows.map(r=>r.values.名称).sort(),['定风灯','阿绫']);
 assert.equal(view.commits.find(c=>c.design?.task==='extract')?.design.templateConfirmed,true);
 await f.click('继续建立开局');await f.click('读取当前开局');noAlert(f);
 assert.equal(f.shadow.querySelector('[aria-label="本次开局"]').value,'chat:0');
 await f.click('生成开局草案');noAlert(f);assert.equal((await currentView(f)).rows.some(r=>r.values.名称==='林澈'),false);
 const protectedUser=f.shadow.querySelector('[aria-label="采用设定 林澈"]');assert.ok(protectedUser);assert.equal(protectedUser.disabled,true);
 await f.click('保存已选设定');noAlert(f);view=await currentView(f);
 const player=view.rows.find(r=>r.values.名称==='林澈'),scene=view.rows.find(r=>r.table==='scene');assert.ok(player);assert.equal(player.values.描述,sourceText.persona);assert.ok(scene.values.参与者.includes(player.id));assert.equal(view.commits.find(c=>c.openingEstablishment).openingEstablishment.player.objectId,player.id);
 assert.equal(view.rows.find(r=>r.values.名称==='阿绫精力').values.值,6);
 await f.click('继续历史补录');await f.click('读取当前聊天历史');noAlert(f);
 f.fill('从第几楼',2);f.fill('到第几楼',5);
 const beforeHistory=await s.storage.read(),originalsBefore=await s.system.originals.listMetadata({scope:s.getScope()});
 await f.click('生成历史补录草案');noAlert(f);assert.equal((await s.storage.read()).commits.length,beforeHistory.commits.length);assert.deepEqual(await s.system.originals.listMetadata({scope:s.getScope()}),originalsBefore);
 assert.deepEqual(historyInputs.map(i=>i.archiveSource.floor),[2,4]);
 assert.deepEqual(historyInputs.map(i=>i.userSource.sources.map(s=>s.floor)),[[1],[3]]);
 await f.click('保存已选设定');noAlert(f);view=await currentView(f);
 const events=view.rows.filter(r=>r.table==='events');assert.equal(events.length,2);
 assert.equal(view.rows.find(r=>r.values.名称==='阿绫精力').values.值,5,'Ordered native history advances the opening baseline without inventing a calendar time');
 for(const [index,name]of ['旧钥匙交接','收好旧钥匙'].entries()){
  const event=events.find(e=>e.values.名称===name);assert.ok(event?.values.原文引用);
  const raw=await s.system.originals.read({entryId:event.values.原文引用.entryId,scope:s.getScope(),purpose:'archive-task'});
  assert.ok(raw.content.includes(index===0?sourceText.history:sourceText.later));
 }
 const savedRows=copy(view.rows);assert.deepEqual(f.h.ctx.chat.map(m=>m.mes),chatBefore);assert.deepEqual(f.h.host.disk.get('渡口配套'),bookBefore);
 await f.reopen();view=await currentView(f);assert.deepEqual(view.rows,savedRows);
 await f.click('世界档案');await f.click('表格编辑');noAlert(f);assert.match(f.shadow.textContent,/阿绫/);assert.match(f.shadow.textContent,/林澈/);
 const opened=await f.app.capabilities.action('opening.inspect',{});assert.equal(opened.alreadyEstablished,true);assert.equal(opened.canEstablish,false);
 assert.equal(f.tasks.length,4);
 // Continue through the installed host interceptor after reopening, so a
 // successful form save also proves these records reach the following request.
 f.h.ctx.chat.push({mes:'接下来我去看看柜台上的灯。',is_user:true});let nativeAborted=false;
 await f.app.host.generateInterceptor(copy(f.h.ctx.chat),10000,value=>{nativeAborted=value;},'normal');
 assert.equal(nativeAborted,true);assert.equal(f.h.requests.length,2);
 const a=xml(f.h.requests[0].messages,'TISYA.DATA.STATE'),sources=xml(f.h.requests[0].messages,'TISYA.DATA.SOURCE');
 assert.ok(a.playerObjects.includes(player.id),'Saved opening user is mapped in the following native request');
 assert.equal(sources.archiveSources.length,0,'Imported native floors must not be archived a second time');
 for(const name of ['林澈','阿绫','定风灯','旧钥匙交接','收好旧钥匙'])assert.ok(a.rows.some(row=>row.values.名称===name),'Following request receives '+name);
 assert.match(f.h.requests[1].messages.map(m=>m.content).join('\n'),/旧钥匙交接/);
 assert.equal((await currentView(f)).rows.filter(r=>r.table==='events').length,2);
 assert.deepEqual(f.h.ctx.chat.slice(0,chatBefore.length).map(m=>m.mes),chatBefore);assert.equal(f.h.errors.length,0);
});

test('opening refuses an unconfirmed template before model calls or native archive writes',async t=>{
 const f=await setupFlow(t),s=await f.app.getSession(),before=copy([...f.h.host.disk.entries()]);
 const status=await f.app.capabilities.action('opening.inspect',{});assert.equal(status.ready,false);assert.equal(status.canEstablish,false);
 await assert.rejects(f.app.capabilities.action('design.generate',{mode:'opening',openingId:'chat:0'}),/初始化模板|先确认/);
 assert.equal(f.tasks.length,0);assert.deepEqual([...f.h.host.disk.entries()],before);assert.equal((await s.storage.read()).commits.length,0);
});

test('a changed linked worldbook rejects the reviewed initialization before write, retaining the native book and prior archive',async t=>{
 const f=await setupFlow(t,{request:()=>extraction(initialChanges())});const s=await f.app.getSession();
 const sources=await f.app.capabilities.action('design.sources',{}),draft=await f.app.capabilities.action('design.generate',{mode:'extract',sourceMode:'native',sourceToken:sources.token});
 const before=await s.storage.read(),changed=copy(f.nativeBook);changed.entries[7].content+='新修订。';f.h.host.putDisk('渡口配套',changed);
 await assert.rejects(f.app.capabilities.action('design.save',{draft}),/世界书已改变|重新读取|来源.*改变/);
 assert.deepEqual(await s.storage.read(),before);assert.deepEqual(f.h.host.disk.get('渡口配套'),changed);assert.equal(f.tasks.length,1);
});

test('native initialization save failure stays visible and retries the same reviewed draft without rerunning the model',async t=>{
 const f=await setupFlow(t,{request:()=>extraction(initialChanges())}),s=await f.app.getSession();
 await f.click('初始化／从资料提炼');await f.click('读取角色卡和绑定世界书');await f.click('生成初始化草案');noAlert(f);
 const before=await s.storage.read();f.h.host.failure.saveOnce();await f.click('保存已选设定');
 assert.match(f.shadow.querySelector('[role="alert"]').textContent,/Worldbook save failed|Injected native save failure/);
 assert.deepEqual(await s.storage.read(),before);assert.equal(f.tasks.length,1);
 await f.click('重试保存');noAlert(f);assert.equal(f.tasks.length,1);
 const view=await currentView(f);assert.equal(view.commits.filter(c=>c.design?.task==='extract').length,1);assert.equal(view.rows.length,2);
 await f.reopen();assert.equal((await currentView(f)).rows.length,2);
});

test('editing a native history floor after review rejects save before originals or archive changes',async t=>{
 const f=await setupFlow(t,{request:(task,input)=>{assert.equal(task,'historyImport');const text=input.archiveSource.floor===2?sourceText.history:sourceText.later;return proposal([change('new:event','events',{名称:'待核对事件',经过:text},text)]);}});
 const s=await f.app.getSession(),sources=await f.app.capabilities.action('history.sources',{});
 const draft=await f.app.capabilities.action('design.generate',{mode:'history',sourceKind:'chat',sourceStamp:sources.sourceStamp,range:{from:2,to:5}});
 const before=await s.storage.read(),originals=await s.system.originals.listMetadata({scope:s.getScope()});
 f.h.ctx.chat[2].mes='<body>阿绫收回了旧钥匙。</body>';
 await assert.rejects(f.app.capabilities.action('design.save',{draft}),/正文候选已变化|原文或候选已改变|历史已改变|来源.*变化/);
 assert.deepEqual(await s.storage.read(),before);assert.deepEqual(await s.system.originals.listMetadata({scope:s.getScope()}),originals);assert.equal(f.tasks.length,2);
});
