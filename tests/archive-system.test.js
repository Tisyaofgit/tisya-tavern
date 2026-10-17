import {simpleTaskAnswer} from './helpers/simple-answers.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {defaultRegistry,copy} from '../tables/schema.js';
import {createBookGateway,digest} from '../tables/books.js';
import {createTableService} from '../tables/service.js';
import {simpleGenesisChangesAnswer,simpleCoreBundleAnswer} from './helpers/simple-answers.js';
import {project} from '../tables/ledger.js';
import {createAtlas,ATLAS_LAYOUT,validateAtlasLayout} from '../tables/atlas.js';
import {originView,validateArchivePackage} from '../tables/archive-system.js';
const access={readers:['读者'],knowers:[]};
const op=(id,table,values,expected=0)=>({id,table,expected,values,access,evidence:'用户手动修改表单'});
function fixture(nativeConfig=null){
 const d=emptyConfig(),c={chatId:'one',characterId:0,characters:[{avatar:'a.png',name:'甲'}],chat:[{is_user:false,mes:'开场白'}],extensionSettings:{[KEY]:d},getRequestHeaders:()=>({csrf:'test'})};d.worlds[worldKey(c)]=defaultWorld();d.worlds[worldKey(c)].tables={injection:'direct'};
 const store=createStore({getContext:()=>c,persist:async()=>true}),saved=new Map(),binding={primary:'角色原书',additional:['数据库资料']};let nextUid=1,writeHook=null;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async name=>{assert(saved.has(name));return structuredClone(saved.get(name));},createWorldbook:async(name,entries)=>{if(saved.has(name))return false;saved.set(name,entries.map(e=>({...structuredClone(e),uid:nextUid++})));return true;},updateWorldbookWith:async(name,fn)=>{await writeHook?.();const entries=fn(structuredClone(saved.get(name)));saved.set(name,entries);return structuredClone(entries);},getCharWorldbookNames:async n=>{assert.equal(n,'current');return structuredClone(binding);},rebindCharWorldbooks:async(n,b)=>{assert.equal(n,'current');Object.assign(binding,b);}};
 const books=createBookGateway(()=>helper,()=>c),calls=[],prompts=[];let responder=async()=>({changes:[],templates:[]});
 const makeService=(overrides={})=>createTableService({store,getContext:()=>c,books,nativeConfig,request:async(task,text,opts)=>{calls.push({task,input:JSON.parse(text),signal:opts.signal});return task==='ruleReview'?{issues:[]}:simpleTaskAnswer(task,JSON.parse(text),await responder(task,JSON.parse(text)));},setPrompt:(text,filter)=>prompts.push({text,filter}),...overrides});const service=makeService();
 const set=async fields=>{const snap=store.read();snap.data.worlds[snap.key].tables={...snap.world.tables,...fields};await store.save(snap.data,snap.revision,snap.key);};
 return {c,d,store,helper,books,saved,binding,calls,prompts,service,makeService,set,responder:f=>responder=f,writeHook:f=>writeHook=f};
}
async function ready(){const f=fixture();await f.service.initialize();const changes=[op('new:p','objects',{名称:'方鹿',类型:'character',描述:'原点人物'}),op('new:i','objects',{名称:'旧铜铃',类型:'item'})];f.responder((task,input)=>{assert.equal(task,'tableGenesis');return simpleGenesisChangesAnswer(input,changes,{name:'测试原点',decisions:['用户手动修改表单']});});await f.service.saveGenesis(await f.service.genesis('用户手动修改表单'));return f;}

test('uninitialized archive reads never create books or settings',async()=>{const f=fixture();await assert.rejects(f.service.archiveLibrary(),/建立/);await assert.rejects(f.service.openAtlas(),/建立/);assert.equal(f.saved.size,0);});
test('origin, current and saved atlas remain separate; snapshot does not mutate source; stale views fail',async()=>{
 const f=await ready(),before=await f.service.inspect(),person=before.rows[0],anchor=await f.service.saveAnchor({name:'渡口清晨',nodes:[]});
 const a=await f.service.openAtlas();assert.equal((await a.list()).total,2);await f.service.edit({changes:[op(person.id,'objects',{描述:'后来成为名匠'},person.rev)]});await assert.rejects(a.list(),/版本/);
 const historical=await f.service.openAtlas({layer:'save',anchorId:anchor.id});assert.equal((await historical.detail(person.id)).record.values.描述,'原点人物');
 const origin=await f.service.openAtlas({layer:'origin',pins:[person.id+'@1']});assert.equal((await origin.list()).total,1);assert.equal((await origin.detail(person.id)).record.values.描述,'原点人物');
 const library=await f.service.archiveLibrary();assert.equal(library.saves.length,1);assert.equal(library.origin.versions.filter(x=>x.id===person.id).length,1);assert.equal(library.current.objects,2);
 const doc=(await historical.detail(person.id));doc.record.values.描述='外部修改';assert.equal((await historical.detail(person.id)).record.values.描述,'原点人物');
});
test('archive package reconstructs exact selected ledger and restores only into an empty matching origin, once after restart',async()=>{
 const f=await ready(),modelCalls=f.calls.length,before=await f.service.inspect(),pack=await f.service.exportArchive({name:'渡口起点'}),checked=await validateArchivePackage(pack);assert.deepEqual(checked.view.rows,before.rows);
 await assert.rejects(f.service.previewArchiveRestore(pack),/空会话或未推进的自动开局/);f.c.chatId='new-branch';f.c.chat=[];await f.service.initialize();const empty=await f.service.inspect(),p=await f.service.previewArchiveRestore(pack);assert.equal(p.written,false);assert.equal((await f.service.inspect()).rows.length,0);
 pack.payload.anchor.rows[0].values.描述='外部篡改';const receipt=await f.service.restoreArchive(p.token),after=await f.makeService().inspect();assert.deepEqual(after.rows.map(r=>r.values),before.rows.map(r=>r.values));assert.notEqual(after.session.id,before.session.id);assert.equal(after.origin.id,before.origin.id);assert.equal(after.session.owner,empty.session.owner);assert.deepEqual(await f.makeService().restoreArchive(p.token),receipt);assert.deepEqual(after.origin,before.origin);assert.equal(f.calls.length,modelCalls);
});
test('tamper, detached anchor, catalog change, target edits and chat changes reject restore',async()=>{
 const f=await ready(),pack=await f.service.exportArchive({name:'存档'}),bad=copy(pack);bad.payload.anchor.rows[0].values.描述='坏';await assert.rejects(validateArchivePackage(bad),/校验/);bad.sha256=await digest(bad.payload);await assert.rejects(validateArchivePackage(bad),/不一致/);
 f.c.chatId='restore-target';f.c.chat=[];await f.service.initialize();const p=await f.service.previewArchiveRestore(pack);await f.service.edit({changes:[op('new:x','objects',{名称:'新的东西',类型:'item'})]});await assert.rejects(f.service.restoreArchive(p.token),/变化/);
 f.c.chatId='restore-target2';await f.service.initialize();const p2=await f.service.previewArchiveRestore(pack);f.c.chatId='another';await assert.rejects(f.service.restoreArchive(p2.token));
});
test('reader ACL precedes search/count/related links, and cannot inspect arbitrary origin or saved layers',async()=>{
 const f=await ready(),before=await f.service.inspect(),person=before.rows[0],secret=op('new:secret','facts',{名称:'禁见秘文',命题:'欠款数额七千',对象:[person.id]});secret.access={readers:[],knowers:[person.id]};await f.service.edit({changes:[secret]});
 const s=f.makeService({archiveQueryPolicy:async()=>({task:'atlas-reader',authorizeRow:r=>r.access.readers.includes('读者'),authorizeField:()=>true,guard:()=>{}})}),atlas=await s.openAtlas({audience:'reader'});assert.equal((await atlas.list({query:'欠款'})).total,0);assert(!JSON.stringify(await atlas.detail(person.id)).includes('禁见秘文'));
 await assert.rejects(s.openAtlas({audience:'reader',layer:'origin'}),/当前/);await assert.rejects(f.service.openAtlas({audience:'reader'}),/权限/);
});
test('custom type descendants use nearest registered category, opaque keys stay text, field ACL hides values and references',()=>{
 const registry=defaultRegistry();registry.types.push({id:'boat',name:'船只',version:1,parent:'item',aliases:[],fields:{吨位:{type:'number'}}});const row=(id,type,values={})=>({id,table:'objects',rev:1,source:null,access,values:{名称:id,类型:type,...values}});
 const rows=[row('方鹿','character',{关联:['秘密船'],属性:{身份:'匠人',背景:'隐藏债务'}}),row('秘密船','boat',{描述:'<img src=x onerror=alert(1)>'})];
 const atlas=createAtlas({view:{registry,rows},context:{},authorizeRow:r=>r.id!=='秘密船',authorizeField:(r,p)=>p.join('.')!=='属性.背景'});assert.equal(atlas.list().groups[0].count,1);assert.equal(atlas.list({query:'债务'}).total,0);assert.deepEqual(atlas.detail('方鹿').links,[]);assert(!JSON.stringify(atlas.detail('方鹿')).includes('秘密船'));
 const all=createAtlas({view:{registry,rows},context:{},authorizeRow:()=>true,authorizeField:()=>true});assert.equal(all.list({category:'items'}).total,1);
 const custom={version:1,groups:[...ATLAS_LAYOUT.groups,{id:'boats',name:'舟船',types:['boat'],accent:'blue'}]};assert.equal(createAtlas({view:{registry,rows},context:{},layout:custom,authorizeRow:()=>true,authorizeField:()=>true}).list({category:'boats'}).total,1);assert.throws(()=>validateAtlasLayout({...custom,groups:[...custom.groups,{id:'again',name:'重复',types:['boat'],accent:'blue'}]},registry),/重复/);
});
test('classification edits persist once in origin, invalidate readers, never rewrite dossier values',async()=>{const f=await ready(),before=await f.service.inspect(),atlas=await f.service.openAtlas();const next=copy(ATLAS_LAYOUT);next.groups[0].name='众生';await f.service.saveAtlasLayout(next,before.origin.revision);const after=await f.service.inspect();assert.deepEqual(after.rows,before.rows);assert.equal(after.session.revision,before.session.revision);assert.equal((await (await f.makeService().openAtlas()).list()).groups[0].name,'众生');await assert.rejects(atlas.list(),/变化/);});
test('archive integrity also covers condition receipts, rule history and unique inherited turn count',async()=>{const f=await ready(),pack=await f.service.exportArchive({name:'规则继承'});for(const key of ['conditionTurns','conditionRuleHistory','conditionRules','conditionReceipts','stateEventReceipts']){const changed=copy(pack);changed.payload.anchor[key].push({injected:true});changed.sha256=await digest(changed.payload);await assert.rejects(validateArchivePackage(changed),/继承字段.*不一致/);}});
test('write-before and write-after failures never report a false successful restore; durable receipt recovers after restart',async()=>{const f=await ready(),pack=await f.service.exportArchive({name:'恢复检查'});f.c.chatId='empty-target';f.c.chat=[];await f.service.initialize();const p=await f.service.previewArchiveRestore(pack),before=JSON.stringify([...f.saved]);f.writeHook(()=>{throw Error('写前失败');});await assert.rejects(f.service.restoreArchive(p.token),/写前失败/);assert.equal(JSON.stringify([...f.saved]),before);f.writeHook(null);const update=f.helper.updateWorldbookWith;f.helper.updateWorldbookWith=async(...args)=>{await update(...args);throw Error('写后响应断开');};await assert.rejects(f.service.restoreArchive(p.token),/写后响应断开/);f.helper.updateWorldbookWith=update;const receipt=await f.makeService().restoreArchive(p.token);assert.equal(receipt.token,p.token);assert.equal((await f.service.inspect()).rows.length,2);});
test('core asset lookup requires exact version and returns lineage without mutating source',async()=>{const f=await ready(),snap=await f.books.read(f.store.read().world.tables.originBook),next=copy(snap.data);next.revision++;next.coreAssets=[{id:'core-a',version:1,name:'内核1',traits:[]},{id:'core-a',version:2,name:'内核2',traits:[]}];next.coreAdaptations=[{id:'adapt-a',core:{id:'core-a',version:1},members:[]}];await f.books.write(snap,next);assert.equal((await f.service.readCoreAsset('core-a',1)).asset.name,'内核1');assert.equal((await f.service.readCoreAsset('core-a',1)).adaptations.length,1);assert.equal((await f.service.readCoreAsset('core-a',2)).adaptations.length,0);await assert.rejects(f.service.readCoreAsset('core-a'),/明确/);});
test('core revisions append immutable versions, preserve old adaptations and reject ambiguous or stale selection',async()=>{
 const f=await ready(),person=(await f.service.inspect()).rows[0];f.responder((task,input)=>{assert.equal(task,'assetAdapt');assert.equal(input.mode,'bundle');assert(input.simpleForm.messages.every(x=>!x.content.includes(person.id)));return simpleCoreBundleAnswer({name:'修船者',members:[{name:'方鹿',traits:[{name:'核心',value:'认真负责',evidence:'原点人物'}]}]});});
 const core=await f.service.saveCoreBundle(await f.service.coreBundleDraft([person.id]));const before=await f.service.archiveLibrary(),revision=copy(core);revision.name='修船者的责任';revision.reason='明确核心措辞';revision.members[0].traits[0].value='愿意为修船安全负责';const next=await f.service.reviseCoreBundle(revision,before.origin.revision);assert.equal(next.id,core.id);assert.equal(next.version,2);assert.deepEqual((await f.service.readCoreAsset(core.id,1)).asset,core);assert.equal((await f.service.readCoreAsset(core.id,2)).asset.name,revision.name);await assert.rejects(f.service.adaptCoreBundle(f.store.read().world.tables.originBook,core.id),/唯一/);await assert.rejects(f.service.reviseCoreBundle(revision,(await f.service.archiveLibrary()).origin.revision),/最新/);
 const bad=copy(next);bad.reason='改写';bad.members[0].traits[0].evidence='来源里不存在的事实';await assert.rejects(f.service.reviseCoreBundle(bad,(await f.service.archiveLibrary()).origin.revision),/原文依据/);
});
test('a changed world numeric catalog blocks restoring old mechanics instead of silently using new values',async()=>{const f=await ready(),pack=await f.service.exportArchive({name:'旧目录'});f.c.chatId='empty-catalog-target';f.c.chat=[];await f.service.initialize();await f.service.saveStateCatalog({definitions:'人物／体力：数值 = 点 [0,100]',items:'人物：基础'},(await f.service.stateCatalog()).originRevision);await assert.rejects(f.service.previewArchiveRestore(pack),/数值目录已改变/);assert.equal((await f.service.inspect()).rows.length,0);});

test('parallel page previews and confirms a complete archive without a hidden import write',async()=>{
 const {Window}=await import('happy-dom'),{mountTablePanel}=await import('../tables/panel.js');
 const f=await ready(),pack=await f.service.exportArchive({name:'界面恢复'});f.c.chatId='ui-restore';f.c.chat=[];await f.service.initialize();
 const w=new Window(),host=w.document.createElement('div');w.document.body.append(host);const panel=mountTablePanel(w.document,host,{service:f.service,store:f.store});await panel.ready;
 const select=host.querySelector('[aria-label="表单功能"]');select.value='parallel';await select.onchange();
 const file=host.querySelector('[aria-label="选择完整存档文件"]');Object.defineProperty(file,'files',{value:[{text:async()=>JSON.stringify(pack)}]});
 const click=label=>[...host.querySelectorAll('button')].find(b=>b.textContent===label).onclick();await click('预览恢复存档');assert.equal((await f.service.inspect()).rows.length,0);assert.match(host.textContent,/界面恢复/);assert.equal(panel.requestLeave().allowed,false);
 await click('确认恢复此存档');assert.equal((await f.service.inspect()).rows.length,2);assert.match(host.textContent,/存档已恢复/);assert.equal(panel.requestLeave().allowed,true);panel.dispose();await w.happyDOM.abort();
});
