import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/condition-service-host.js';
import {prepareCommit,prepareRecoverable,project} from '../tables/ledger.js';
import {defaultRegistry} from '../tables/schema.js';
import {archiveTrace,changedPaths} from '../tables/archive-book.js';
import {archiveBookEntries} from '../tables/archive-book-entries.js';
import {mountTablePanel} from '../tables/panel.js';
import {Window} from 'happy-dom';
const access={readers:['读者'],knowers:[]};
const op=(id,values,expected=0,table='objects')=>({id,table,values,expected,access,evidence:'用户手动修改表单'});
const blank=()=>({registry:defaultRegistry(),rows:[],anchors:[],commits:[],last:null});
const options={source:'s1',kind:'archive',allowedTables:['objects','facts','events'],evidence:'依据'};
const edit=(id,values={},expected=0,table='objects')=>({...op(id,values,expected,table),evidence:'依据'});
test('single worldbook write contains generated layers, preserves unrelated lore, detects projection drift and excludes mirrors from AI materials',async()=>{
 const f=await fixture(),settings=f.store.read().world.tables,name=settings.sessionBook,origin=(await f.books.read(settings.originBook)).raw;
 f.saved.get(name).push({uid:999,name:'用户自己的世界书条目',content:'保留原文',enabled:true});
 await f.service.edit({changes:[op(f.owner,{描述:'当前修船人'},1)]});
 const saved=await f.books.read(name),entries=f.saved.get(name);assert.equal(entries.length,9);assert(entries.some(e=>e.content==='保留原文'&&e.enabled));
 for(const e of archiveBookEntries(saved.data)){const actual=entries.find(x=>x.name===e.name);assert.equal(actual.content,e.content);assert.equal(actual.enabled,false);}
 assert.equal(saved.data.archiveView.layers.static.find(r=>r.id===f.owner).values.描述,'当前修船人');assert.equal(saved.data.archiveView.basis.sessionRevision,saved.data.revision);
 assert.equal((await f.books.read(settings.originBook)).raw,origin,'ordinary save must not modify origin');
 await f.books.bindOrigin('test.png',name);const materials=await f.books.materials('test.png',{includeDisabled:true});assert.deepEqual(materials.map(x=>x.entry),['用户自己的世界书条目']);
 const projection=entries.find(e=>e.name==='【图鉴／静态】存档最新版');projection.content+=' ';await assert.rejects(f.books.read(name),/外部改动/);assert.equal(projection.content.at(-1),' ');
});
test('deletion tombstones retain exact before image, source and paths; replaying earlier branch revives only the historical version',()=>{
 const first=prepareCommit(blank(),{changes:[edit('new:p',{名称:'甲',类型:'character'})]},options),id=first.rows[0].id;
 const view={...blank(),rows:first.rows,commits:[first.commit],last:first.commit.id};
 const deleted=prepareCommit(view,{changes:[{...edit(id,{},1),delete:true}]},{...options,source:'s2',worldTime:'第三日午后'});
 const origin={kind:'origin',registry:defaultRegistry(),bases:[]},session={id:'save-a',revision:2,pins:[],commits:[first.commit,deleted.commit]};
 const current=project(origin,session,['s1','s2']);assert.equal(current.rows.length,0);assert.equal(project(origin,session,['s1']).rows[0].id,id);
 const trace=archiveTrace(current,session.id,[{key:'s2',floor:8,role:'assistant'}]);const last=trace.at(-1);assert.equal(last.operation,'delete');assert.equal(last.after,null);assert.equal(last.before.名称,'甲');assert.equal(last.sourceFloor,8);assert.equal(last.worldTime,'第三日午后');assert.deepEqual(last.path,[session.id,deleted.commit.id,last.id]);
});
test('delete and reference repair are atomic; locks and native/global ownership cannot be removed by AI',()=>{
 const first=prepareCommit(blank(),{changes:[edit('new:p',{名称:'甲',类型:'character'}),edit('new:f',{名称:'原事实',命题:'依据',对象:['new:p']},0,'facts')]},options),[p,f]=first.rows,view={...blank(),rows:first.rows,last:first.commit.id};
 const del={...edit(p.id,{},1),delete:true};assert.throws(()=>prepareRecoverable(view,{changes:[del]},options),/关联对象不存在/);
 const batch=prepareCommit(view,{changes:[del,{...edit(f.id,{},1,'facts'),delete:true}]},options);assert.equal(batch.rows.length,0);
 assert.throws(()=>prepareCommit({...view,rows:[{...p,lockedFields:['名称']},f]},{changes:[del]},options),/锁定/);
 assert.throws(()=>prepareCommit(view,{changes:[{...del,values:{描述:'同时改'}}]},options),/同时/);
 assert.throws(()=>prepareCommit(view,{changes:[{...del,expected:9}]},options),/版本/);
});
test('generated trace links changes to actual same-commit events and field pointers retain missing versus null',()=>{
 assert.deepEqual(changedPaths({a:{'x/y':null}},{a:{'x/y':0}}),[{path:'/a/x~1y',before:null,after:0,beforePresent:true,afterPresent:true}]);
 const view={commits:[{id:'c',kind:'archive',changes:[{id:'e',after:{table:'events',values:{名称:'修船完工'}}}],anchors:[{id:'a',row:'p',before:{名称:'甲'},after:{名称:'甲',描述:'新'},source:'s'}]}]};
 const trace=archiveTrace(view,'save',[{key:'s',floor:3,role:'assistant'}]);assert.deepEqual(trace[0].events,[{id:'e',name:'修船完工'}]);assert.equal(trace[0].fields[0].beforePresent,false);
});
test('real service restarts with latest rows, deletion persists and stale atlas handle fails without resurrecting origin',async()=>{
 const f=await fixture(),snap=await f.service.readAtlasSnapshot();assert.equal(snap.data.rows.length,2);assert.equal(snap.data.originRows.length,0);
 await f.service.edit({changes:[{...op(f.other,{},1),delete:true}]});await assert.rejects(snap.verify(),/变化/);
 const latest=await f.make().readAtlasSnapshot();assert.equal(latest.data.rows.length,1);assert.equal(latest.data.trace.at(-1).operation,'delete');assert.equal(latest.data.trace.at(-1).row,f.other);
});
test('host atlas uses actual current save, switches origin and refreshes after writes; read-only actions never write',async()=>{
 const f=await fixture(),window=new Window(),doc=window.document,panel=mountTablePanel(doc,doc.body,{service:f.service,store:f.store});await panel.ready;
 const select=panel.root.querySelector('[aria-label="表单功能"]');select.value='atlas';await select.onchange();
 let app=panel.root.querySelector('div div')?.shadowRoot;const shadow=()=>[...panel.root.querySelectorAll('div')].find(e=>e.shadowRoot)?.shadowRoot;
 assert(shadow().textContent.includes('方鹿'));assert(!shadow().textContent.includes('渡口清晨'));const writes=f.writes();
 const layer=shadow().querySelector('[aria-label="资料层"]');layer.value='origin';layer.dispatchEvent(new window.Event('change'));for(let i=0;i<100&&!shadow().textContent.includes('0 份可读档案');i++)await new Promise(r=>setTimeout(r,10));assert.equal(shadow().querySelector('.result-count')?.textContent,'0 份可读档案');assert.equal(f.writes(),writes);
 await f.service.edit({changes:[op(f.owner,{描述:'即时更新'},1)]});await panel.settled();assert(shadow().textContent.includes('即时更新'));
 panel.dispose();await window.happyDOM.abort();
});
test('prefix routing is anchored, entry-specific and never grants ledger authority',async()=>{
 const {archivePrefixRole}=await import('../tables/archive-prefix.js');
 for(const [name,role]of [['缇斯亚原点 · 甲','origin'],['【存档书】第一幕','session'],['图鉴／人物','atlas'],['基点书：甲','core']])assert.equal(archivePrefixRole(name),role);
 assert.equal(archivePrefixRole('普通书','【存档】第二日'),'session');assert.equal(archivePrefixRole('记录原点变化的说明'),null);assert.equal(archivePrefixRole('图鉴员日记'),null);
});
test('automatic model fill sees the latest save, commits once and deletes only this branch without changing origin',async()=>{
 const f=await fixture(),ai=mes=>({is_user:false,mes}),user=mes=>({is_user:true,mes});f.context.chat=[ai('旅人到了。'),user('继续')];let requests=0;
 f.respond((task,input)=>{requests++;const existing=input.currentRows.find(r=>r.values.名称==='旅人');if(input.archiveSource.text==='旅人到了。')return {changes:[{...edit('new:visitor',{名称:'旅人',类型:'character',描述:'刚到渡口'}),evidence:'旅人到了。'}]};assert(existing);assert.equal(existing.values.描述,'刚到渡口');return {changes:[{...edit(existing.id,{},existing.rev),delete:true,evidence:'撤回旅人这个误登记的档案。'}]};});
 const origin=(await f.service.inspect()).origin;await f.service.archive();assert((await f.service.inspect()).rows.some(r=>r.values.名称==='旅人'));const n=requests;await f.service.archive();assert.equal(requests,n);
 f.context.chat.push(ai('撤回旅人这个误登记的档案。'),user('继续'));await f.service.archive();const result=await f.make().inspect();assert(!result.rows.some(r=>r.values.名称==='旅人'));assert.deepEqual(result.origin,origin);assert.equal(result.session.archiveView.trace.at(-1).operation,'delete');
});
test('archive restore carries historical change paths without claiming old floors belong to the new conversation',async()=>{
 const f=await fixture();await f.service.edit({changes:[op(f.owner,{描述:'受伤后仍在修船'},1)]});const pack=await f.service.exportArchive({name:'旧路'}),prior=pack.payload.anchor.history;assert(prior.length>0);
 f.context.chatId='new-history-branch';f.context.chat=[];await f.service.initialize();const preview=await f.service.previewArchiveRestore(pack);await f.service.restoreArchive(preview.token);
 const data=(await f.service.readAtlasSnapshot()).data;assert.deepEqual(data.trace,prior);assert(data.trace.every(a=>a.path[0]!==data.overview.current.id));
});
