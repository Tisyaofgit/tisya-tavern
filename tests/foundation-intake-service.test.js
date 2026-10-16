import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createTableService} from '../tables/service.js';
import {createBookGateway} from '../tables/books.js';
import {mountTablePanel} from '../tables/panel.js';
const source=readFileSync(new URL('./fixtures/foundation-sheet/fanglu-narrative-r4.txt',import.meta.url),'utf8');
const raw=readFileSync(new URL('./fixtures/foundation-sheet/fanglu-r10-user.raw.txt',import.meta.url),'utf8');
// Explicit authored revision used only in this test; original response stays immutable.
const revised=raw.replace('7 参与者：方鹿；阿禾；乘客','7 参与者：方鹿；阿禾').replace('听木辨裂适用 = 是\n','听木辨裂适用 = 是；听木辨裂不能听人心或探测北峡水底\n');
async function fixture(){
 const data=emptyConfig(),context={chatId:'intake-test',characterId:0,characters:[{avatar:'test.png',name:'测试'}],chat:[{is_user:false,mes:'开场'}],extensionSettings:{[KEY]:data}};
 data.worlds[worldKey(context)]=defaultWorld();const store=createStore({getContext:()=>context,persist:async()=>true}),saved=new Map(),binding={primary:'',additional:[]};let uid=1,writes=0,before=null,after=null,readFailure=false;
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async n=>{if(readFailure)throw Error('模拟回读失败');return structuredClone(saved.get(n));},createWorldbook:async(n,entries)=>{saved.set(n,entries.map(e=>({...structuredClone(e),uid:uid++})));return true;},updateWorldbookWith:async(n,fn)=>{await before?.();saved.set(n,fn(structuredClone(saved.get(n))));writes++;await after?.();},getCharWorldbookNames:async()=>structuredClone(binding),rebindCharWorldbooks:async(_,v)=>Object.assign(binding,structuredClone(v))};
 const books=createBookGateway(()=>helper,()=>context),make=()=>createTableService({store,getContext:()=>context,books,request:async()=>{throw Error('不允许模型调用');}}),service=make();await service.initialize();
 const refs=[['character','沈砚〔船匠〕'],['character','沈砚〔药商〕'],['character','阿禾'],['character','顾槐'],['place','青溪渡'],['place','白沙滩'],['place','北峡'],['item','旧铜铃'],['rule','听木辨裂']];
 await service.edit({changes:refs.map(([kind,name],i)=>({id:'new:ref-'+i,table:'objects',expected:0,values:{名称:name,类型:kind},access:{readers:['读者'],knowers:[]},evidence:'用户手动修改表单'}))});
 const rows=(await service.inspect()).rows,referenceIds=rows.filter(r=>r.table==='objects').map(r=>r.id),args={source,ownerName:'方鹿',model:'external-test',referenceIds};
 return {service,make,args,context,store,saved,writes:()=>writes,before:f=>before=f,after:f=>after=f,failRead:v=>readFailure=v};
}
async function ready(f){const d=await f.service.createFoundationDraft(f.args);await f.service.saveFoundationResponse(d.id,revised,0);return {d,p:await f.service.previewFoundationDraft(d.id)};}
test('original response with unresolved passenger persists across restart, keeps all 114 cells and never becomes canonical rows',async()=>{
 const f=await fixture(),d=await f.service.createFoundationDraft(f.args),n=f.writes();
 assert.equal((await f.service.createFoundationDraft(f.args)).id,d.id);assert.equal(f.writes(),n);
 const result=await f.service.saveFoundationResponse(d.id,raw,0);assert.equal(result.diagnosis.cells.length,114);assert(result.diagnosis.issues.some(x=>x.code==='reference'&&x.name==='乘客'));
 assert.equal((await f.make().readFoundationDraft(d.id)).responses[0].text,raw);
 assert.equal((await f.service.inspect()).rows.length,9);await assert.rejects(f.service.previewFoundationDraft(d.id),/待修/);
 assert.equal((await f.service.inspect()).session.commits.some(c=>c.foundationImport),false);
});
test('explicit revision previews and commits schema/rows once to the session; source and secrets cannot leak into public anchors',async()=>{
 const f=await fixture(),d=await f.service.createFoundationDraft(f.args);await f.service.saveFoundationResponse(d.id,raw,0);await f.service.saveFoundationResponse(d.id,revised,1);
 const before=await f.service.inspect(),n=f.writes(),p=await f.service.previewFoundationDraft(d.id);assert.equal(p.changes.length,12);assert.equal(f.writes(),n);
 await assert.rejects(f.service.commitFoundationDraft(p.token),/核对/);p.changes[0].values.名称='伪造';
 await f.service.commitFoundationDraft(p.token,{reviewed:true});assert.equal(f.writes(),n+1);
 const after=await f.make().inspect();assert.deepEqual(after.origin,before.origin);assert.equal(after.rows.length,21);assert(after.rows.some(r=>r.values.名称==='方鹿'));assert(!after.rows.some(r=>r.values.名称==='伪造'));
 const secret=after.rows.find(r=>r.values.隐情);assert(secret);assert.deepEqual(secret.access,{readers:[],knowers:[]});
 const imported=after.session.commits.find(c=>c.foundationImport);assert(imported);assert(imported.anchors.every(a=>!a.evidence.includes('欠款')));
 assert(imported.changes.every(c=>c.after.table!=='state'&&c.after.table!=='events'));assert.equal(imported.foundationImport.runtime,'conditions-not-bound');
 await f.make().commitFoundationDraft(p.token,{reviewed:true});assert.equal(f.writes(),n+1);
 const final=await f.make().readFoundationDraft(d.id);assert.equal(final.responses[0].text,raw);assert.equal(final.responses[1].text,revised);
});
test('source/reference changes and stale edits reject without losing the preserved draft',async()=>{
 const f=await fixture(),{d,p}=await ready(f);await f.service.saveFoundationResponse(d.id,revised+'\n',1);const n=f.writes();await assert.rejects(f.service.commitFoundationDraft(p.token,{reviewed:true}),/已改变/);assert.equal(f.writes(),n);
 await assert.rejects(f.service.saveFoundationResponse(d.id,raw,1),/另一页面/);
 const row=(await f.service.inspect()).rows[0];await f.service.edit({changes:[{id:row.id,table:'objects',expected:row.rev,values:{描述:'有修订'},access:row.access,evidence:'用户手动修改表单'}]});await assert.rejects(f.service.previewFoundationDraft(d.id),/引用对象已改变/);
 assert.equal((await f.service.readFoundationDraft(d.id)).responses.length,2);
});
test('pre-write failure changes no canonical data; post-write failure uses durable receipt after restart',async()=>{
 const f=await fixture(),{p}=await ready(f),before=JSON.stringify([...f.saved]),n=f.writes();f.before(()=>{throw Error('模拟写前失败');});await assert.rejects(f.service.commitFoundationDraft(p.token,{reviewed:true}),/写前失败/);assert.equal(JSON.stringify([...f.saved]),before);
 f.before(null);f.after(()=>f.failRead(true));await assert.rejects(f.service.commitFoundationDraft(p.token,{reviewed:true}),/回读失败/);f.failRead(false);f.after(null);await f.make().commitFoundationDraft(p.token,{reviewed:true});assert.equal(f.writes(),n+1);
});
test('malformed response survives as a repairable draft; reading does not execute it or write',async()=>{
 const f=await fixture(),d=await f.service.createFoundationDraft(f.args),bad='{broken';await f.service.saveFoundationResponse(d.id,bad,0);const n=f.writes(),r=await f.make().readFoundationDraft(d.id);assert.equal(r.responses[0].text,bad);assert.equal(r.diagnosis.issues[0].code,'response');assert.equal(f.writes(),n);
});
test('actual author page loads a saved draft, saves an explicit revision, previews and confirms without model calls',async()=>{
 const f=await fixture(),d=await f.service.createFoundationDraft(f.args);await f.service.saveFoundationResponse(d.id,raw,0);
 const win=new Window(),doc=win.document,panel=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await panel.ready;
 const page=doc.querySelector('[aria-label="表单功能"]');page.value='foundation';page.dispatchEvent(new win.Event('change'));await panel.settled();
 const click=async label=>{const b=[...doc.querySelectorAll('button')].find(b=>b.textContent===label);assert(b,label);b.click();await panel.settled();assert.equal(doc.querySelector('[role="alert"]'),null,doc.querySelector('[role="alert"]')?.textContent);};
 await click('方鹿 · 第1版');assert.match(doc.body.textContent,/待解析引用：乘客/);
 const area=doc.querySelector('[aria-label="填表原文"]');area.value=revised;area.dispatchEvent(new win.Event('input'));await click('保存原答或修订');await click('预览入档');
 doc.querySelector('[aria-label="已核对语义、漏项和隐情归属"]').checked=true;await click('确认入档');assert.match(doc.body.textContent,/这份草稿已经入档/);assert((await f.make().inspect()).rows.some(r=>r.values.名称==='方鹿'));panel.dispose();await win.happyDOM.close();
});

test('changed reference creates a fresh task while the original draft remains readable',async()=>{
 const f=await fixture(),d=await f.service.createFoundationDraft(f.args);await f.service.saveFoundationResponse(d.id,raw,0);
 const row=(await f.service.inspect()).rows[0];await f.service.edit({changes:[{id:row.id,table:'objects',expected:row.rev,values:{描述:'新版资料'},access:row.access,evidence:'用户手动修改表单'}]});
 const next=await f.service.createFoundationDraft(f.args);assert.notEqual(next.id,d.id);assert.equal((await f.service.readFoundationDraft(d.id)).responses[0].text,raw);assert.equal((await f.service.createFoundationDraft(f.args)).id,next.id);
});
test('whitespace and colon are equivalent separators in diagnosis and the shared parser',async()=>{
 const f=await fixture(),d=await f.service.createFoundationDraft(f.args),r=await f.service.saveFoundationResponse(d.id,revised.replace('1 名称：方鹿','1 名称 方鹿'),0);assert.equal(r.diagnosis.issues.length,0);assert.equal((await f.service.previewFoundationDraft(d.id)).changes.length,12);
});
test('changed chat stops intake writes; an inactive source receipt cannot republish itself',async()=>{
 const f=await fixture(),{p}=await ready(f),n=f.writes();f.before(()=>{f.context.chatId='changed';});await assert.rejects(f.service.commitFoundationDraft(p.token,{reviewed:true}),/会话|聊天|改变/);assert.equal(f.writes(),n);f.before(null);f.context.chatId='intake-test';
 await f.service.commitFoundationDraft(p.token,{reviewed:true});f.context.chat=[];const count=f.writes();await assert.rejects(f.make().commitFoundationDraft(p.token,{reviewed:true}),/分支/);assert.equal(f.writes(),count);
});
test('switching saved drafts cannot discard an unsaved response edit',async()=>{
 const f=await fixture(),d=await f.service.createFoundationDraft(f.args);await f.service.saveFoundationResponse(d.id,raw,0);await f.service.createFoundationDraft({...f.args,ownerName:'另一人'});
 const win=new Window(),doc=win.document,panel=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await panel.ready;const page=doc.querySelector('[aria-label="表单功能"]');page.value='foundation';page.dispatchEvent(new win.Event('change'));await panel.settled();
 const click=async text=>{[...doc.querySelectorAll('button')].find(b=>b.textContent===text).click();await panel.settled();};await click('方鹿 · 第1版');const area=doc.querySelector('[aria-label="填表原文"]');area.value=revised;area.dispatchEvent(new win.Event('input'));await click('另一人 · 第0版');assert.equal(doc.querySelector('[aria-label="填表原文"]'),area);assert.equal(area.value,revised);assert.match(doc.querySelector('[role="alert"]').textContent,/先保存/);panel.dispose();await win.happyDOM.close();
});
