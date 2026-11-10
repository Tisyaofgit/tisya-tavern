import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBuiltinBookInstaller,BUILTIN_BOOK_SETTINGS,bundledNativeBuiltinBook} from '../engine/builtin-books.mjs';
import {builtinBookDefinitions,BUILTIN_PACKAGE} from '../engine/builtin-book-data.mjs';
import {excludeTemplateBookEntries,readCreationTemplates} from '../engine/template-book.mjs';

const clone=structuredClone;
const defs=(content='初版')=>[{id:'templates',name:'模板测试',entries:[{id:'stable.a',name:'同一条目',purpose:'template',content}]}];
function fixture(definitions=defs()){
 const ctx={extensionSettings:{}},books={},writes=[];let writeHook=null,persistHook=null;
 const args={getContext:()=>ctx,listBooks:async()=>Object.keys(books),readBook:async name=>clone(books[name]),writeBook:async(name,data)=>{writes.push(name);if(writeHook)return writeHook(name,data);books[name]=clone(data);},persistSettings:async()=>persistHook?persistHook():true,definitions};
 return {ctx,books,writes,args,installer:createBuiltinBookInstaller(args),replace:next=>createBuiltinBookInstaller({...args,definitions:next}),writeHook:fn=>writeHook=fn,persistHook:fn=>persistHook=fn};
}
const first=f=>Object.values(f.books['模板测试'].entries)[0];

test('first install and concurrent repeated startup are idempotent with stable identity',async()=>{
 const f=fixture();const reports=await Promise.all([f.installer.update(),f.installer.update()]);assert(reports.every(r=>r.status==='ready'));assert.equal(f.writes.length,1);const row=first(f);assert.equal(row.disable,true);assert.equal(row.extensions.tisyaBuiltin.entryId,'stable.a');assert.equal(row.extensions.tisyaBuiltin.package,BUILTIN_PACKAGE);await f.installer.update();assert.equal(f.writes.length,1);
});
test('plugin update changes only managed untouched fields and keeps user settings and entries',async()=>{
 const f=fixture();await f.installer.update();Object.assign(first(f),{disable:false,key:['个人关键词'],order:42,custom:{private:true}});f.books['模板测试'].entries[8]={uid:8,comment:'私人条目',content:'保留',disable:false};const r=await f.replace(defs('新版')).update();assert.equal(r.status,'ready');assert.equal(first(f).content,'新版');assert.equal(first(f).disable,false);assert.deepEqual(first(f).key,['个人关键词']);assert.equal(first(f).order,42);assert.deepEqual(first(f).custom,{private:true});assert.equal(f.books['模板测试'].entries[8].content,'保留');
});
test('user-only edit survives without conflict; simultaneous upstream edit stays visible until explicit resolution',async()=>{
 const f=fixture();await f.installer.update();first(f).content='用户改文';assert.equal((await f.installer.update()).status,'ready');assert.equal(first(f).content,'用户改文');const next=f.replace(defs('新版')),r=await next.update();assert.equal(r.status,'partial');assert.equal(r.conflicts[0].fields[0].current,'用户改文');assert.equal(first(f).content,'用户改文');const done=await next.resolveConflict({...r.conflicts[0],choice:'keep'});assert.equal(done.status,'ready');assert.equal(first(f).content,'用户改文');assert.equal((await next.update()).status,'ready');
});
test('upstream choice requires the exact current conflict snapshot',async()=>{
 const f=fixture();await f.installer.update();first(f).content='用户改文';const next=f.replace(defs('新版')),r=await next.update();first(f).key=['新设置'];await assert.rejects(next.resolveConflict({...r.conflicts[0],choice:'upstream'}),/来源已变化/);const refreshed=await next.update();await next.resolveConflict({...refreshed.conflicts[0],choice:'upstream'});assert.equal(first(f).content,'新版');assert.deepEqual(first(f).key,['新设置']);
});
test('deleted managed entry stays missing and explicit keep remembers the deletion',async()=>{
 const f=fixture();await f.installer.update();f.books['模板测试'].entries={};const r=await f.installer.update();assert.equal(r.conflicts[0].type,'missing');assert.equal(Object.keys(f.books['模板测试'].entries).length,0);await f.installer.resolveConflict({...r.conflicts[0],choice:'keep'});assert.equal((await f.replace(defs('第三版')).update()).status,'ready');assert.equal(Object.keys(f.books['模板测试'].entries).length,0);
});
test('unowned title collision is never adopted and can be preserved explicitly',async()=>{
 const f=fixture();f.books['模板测试']={entries:{7:{uid:7,comment:'同一条目',content:'用户私有',disable:false}}};const r=await f.installer.update();assert.equal(r.conflicts[0].type,'unowned-name');assert.equal(f.books['模板测试'].entries[7].extensions,undefined);await f.installer.resolveConflict({...r.conflicts[0],choice:'keep'});assert.equal((await f.installer.update()).status,'ready');assert.equal(f.books['模板测试'].entries[7].content,'用户私有');
});
test('renamed book resolves by identity and duplicate owners are rejected',async()=>{
 const f=fixture();await f.installer.update();f.books['改名后的书']=f.books['模板测试'];delete f.books['模板测试'];await f.installer.update();assert.equal(f.installer.bookNames().templates,'改名后的书');f.books['重复副本']=clone(f.books['改名后的书']);const r=await f.installer.update();assert.equal(r.status,'partial');assert.match(r.errors[0].message,/多本书/);
});
test('deleted whole book is not silently recreated',async()=>{
 const f=fixture();await f.installer.update();delete f.books['模板测试'];const before=f.writes.length,r=await f.installer.update();assert.equal(r.conflicts[0].type,'missing-book');assert.equal(f.writes.length,before);
});
test('one failed book preserves successful books and reports partial instead of success',async()=>{
 const f=fixture(builtinBookDefinitions());f.writeHook((name,data)=>{if(name==='缇斯亚扩展资料书')throw Error('保存失败');f.books[name]=clone(data);});const r=await f.installer.update();assert.equal(r.status,'partial');assert(r.errors.some(e=>e.bookId==='extensions'));assert(f.books.缇斯亚模板书);assert(f.books.缇斯亚美化书);assert(!f.ctx.extensionSettings[BUILTIN_BOOK_SETTINGS].books.extensions);
});
test('write readback mismatch cannot publish an install receipt',async()=>{
 const f=fixture();f.writeHook((name,data)=>{f.books[name]=clone(data);first(f).content='宿主不同回包';});const r=await f.installer.update();assert.equal(r.status,'partial');assert.match(r.errors[0].message,/回读不同/);assert.equal(f.ctx.extensionSettings[BUILTIN_BOOK_SETTINGS],undefined);
});
test('receipt save failure preserves the book and retry recovers without duplicate entries',async()=>{
 const f=fixture();f.persistHook(()=>false);const r=await f.installer.update();assert.equal(r.status,'partial');assert(f.books['模板测试']);assert.equal(f.ctx.extensionSettings[BUILTIN_BOOK_SETTINGS],undefined);f.persistHook(()=>true);assert.equal((await f.installer.update()).status,'ready');assert.equal(Object.keys(f.books['模板测试'].entries).length,1);
});
test('definitions come from actual installed edited bodies with a precise source wrapper',async()=>{
 const f=fixture(builtinBookDefinitions());await f.installer.update();const row=Object.values(f.books.缇斯亚扩展资料书.entries).find(e=>e.extensions.tisyaBuiltin.purpose==='definition');const data=JSON.parse(row.content);data.name='用户编辑名';row.content=JSON.stringify(data);const actual=await f.installer.definitions('extensions');assert(actual.some(e=>e.definition.name==='用户编辑名'));assert(actual.every(e=>e.source.book==='缇斯亚扩展资料书'&&Number.isInteger(e.source.uid)&&/^[a-f0-9]{64}$/.test(e.source.digest)));row.content='{bad';await assert.rejects(f.installer.definitions('extensions'),/JSON 损坏/);
});
test('normal lore excludes renamed entire template and beauty books plus extension definitions',()=>{
 const definition=Object.values(bundledNativeBuiltinBook('extensions').entries).find(e=>e.extensions.tisyaBuiltin.purpose==='definition');const payload={globalLore:[{world:'更名模板',uid:1,content:'用户新加模板'},{world:'更名美化',uid:2,content:'用户样式'}, {...definition,world:'资料'}, {world:'资料',uid:88,content:'普通设定',disable:false}],chatLore:[]};excludeTemplateBookEntries(payload,{builtinBooks:{templates:{name:'更名模板'},beauty:{name:'更名美化'}}});assert.deepEqual(payload.globalLore,[{world:'资料',uid:88,content:'普通设定',disable:false}]);
});
test('one renamed template book routes all thirteen definitions by the current task without deleting source text',async()=>{
 const book=bundledNativeBuiltinBook('templates');assert.equal(Object.keys(book.entries).length,13);book.entries[99]={uid:99,comment:'用户规则核对模板',content:'只在核对规则时使用',extensions:{tisyaTemplate:{tasks:['ruleReview']}}};const before=clone(book),ctx={extensionSettings:{tisya_builtin_books:{books:{templates:{name:'已改名模板'}}}},getWorldInfoNames:async()=>['已改名模板'],loadWorldInfo:async name=>name==='已改名模板'?book:null};
 const read=options=>readCreationTemplates(()=>ctx,{getHelper:()=>null,...options});const character=await read({task:'newCharacter'}),phone=await read({task:'tableGenesis',goal:'手机全初始化'}),memory=await read({task:'tableArchive'}),rules=await read({task:'ruleReview'});
 assert.equal(character.book,'已改名模板');assert.deepEqual(character.entries.map(entry=>entry.name),['【模板】角色统一表单','【说明】统一表单模板使用说明']);
 assert.equal(phone.entries.filter(entry=>entry.name.startsWith('【模板】手机')||['【模板】商城外卖与赠礼初始化','【模板】相册音乐与主题初始化','【模板】地图交通与地点初始化','【模板】日历邀请与提醒初始化'].includes(entry.name)).length,7);assert(!phone.entries.some(entry=>/每轮记忆|规则修订|用户规则核对/.test(entry.name)));
 assert(memory.entries.some(entry=>entry.name==='【模板】每轮记忆与历史提炼'));assert(!memory.entries.some(entry=>entry.name.includes('初始化')));assert(rules.entries.some(entry=>entry.name==='用户规则核对模板'));assert(rules.entries.some(entry=>entry.name==='【模板】表单配置与规则修订'));assert.deepEqual(book,before);
});

test('retired factory definitions preserve user text but are no longer executable definitions',async()=>{
 const definitions=builtinBookDefinitions(),f=fixture(definitions);await f.installer.update();const row=Object.values(f.books.缇斯亚扩展资料书.entries).find(e=>e.extensions.tisyaBuiltin.purpose==='definition');const id=row.extensions.tisyaBuiltin.entryId,content=row.content;const next=structuredClone(definitions);next.find(b=>b.id==='extensions').entries=next.find(b=>b.id==='extensions').entries.filter(e=>e.id!==id);const installer=f.replace(next);await installer.update();assert.equal(row.content,content);const actual=Object.values(f.books.缇斯亚扩展资料书.entries).find(e=>e.extensions.tisyaBuiltin.entryId===id);assert.equal(actual.extensions.tisyaBuiltin.retired,true);assert(!(await installer.definitions('extensions')).some(e=>e.definition.id===id));
});

test('ordinary user JSON reference entries are preserved and do not masquerade as executable definitions',async()=>{
 const f=fixture(builtinBookDefinitions());await f.installer.update();const before=(await f.installer.definitions('extensions')).length;f.books.缇斯亚扩展资料书.entries[99]={uid:99,comment:'用户世界资料',content:'{"城市":"既有设定"}',disable:false};assert.equal((await f.installer.definitions('extensions')).length,before);assert.equal(f.books.缇斯亚扩展资料书.entries[99].disable,false);
});

test('all three importable book artifacts exactly match this version of the factories',()=>{
 for(const [id,file]of [['templates','tisya-template-book.json'],['extensions','tisya-extension-book.json'],['beauty','tisya-beauty-book.json']])assert.deepEqual(JSON.parse(readFileSync(new URL('../templates/'+file,import.meta.url),'utf8')),bundledNativeBuiltinBook(id));
});

test('unsupported installation receipt blocks all writes and preserves existing books',async()=>{
 const f=fixture();f.ctx.extensionSettings[BUILTIN_BOOK_SETTINGS]={format:2,revision:1,books:{}};const before=structuredClone(f.ctx.extensionSettings);const r=await f.installer.update();assert.equal(r.status,'partial');assert.match(r.errors[0].message,/版本或结构无效/);assert.equal(f.writes.length,0);assert.deepEqual(f.ctx.extensionSettings,before);
});
