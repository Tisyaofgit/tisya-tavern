import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readFileSync} from 'node:fs';
import {createConfiguration,identitySlots} from '../engine/config.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {mountStoryResources} from '../engine/identity-ui.mjs';
import {DEFAULT_TEMPLATE_BOOK,bundledTemplateEntries,bundledNativeTemplateBook,PHONE_FIELDS_GUIDE,ensureTemplateBook,readCreationTemplates,stripPhoneInitialization,excludeTemplateBookEntries,readStoryReferenceBooks,scanStoryReferenceBooks} from '../engine/template-book.mjs';
import {parsePhoneWorld,parsePhoneCharacter} from '../phone-life-config.mjs';
import {prepareWorldbookOrder} from '../worldbook-order.js';

function fixture(){
 const books={},ctx={extensionSettings:{},chatMetadata:{phone:{balance:7431,story:'already progressed'}},chatId:'a',characterId:0};let writes=0,hook=null;
 ctx.loadWorldInfo=async name=>books[name]?{entries:Object.fromEntries(books[name].map(e=>[e.uid,{...structuredClone(e),comment:e.name}]))}:null;
 const config=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const helper={getWorldbookNames:async()=>Object.keys(books),getWorldbook:async name=>structuredClone(books[name]),createWorldbook:async(name,entries)=>{if(books[name])return false;writes++;books[name]=entries.map((e,i)=>({...structuredClone(e),uid:i}));return true;},updateWorldbookWith:async(name,fn)=>{await hook?.(name);const result=fn(structuredClone(books[name]));writes++;books[name]=result.map((e,i)=>({...e,uid:e.uid??i}));return structuredClone(books[name]);}};
 const roles=createStoryIdentity({config,getContext:()=>ctx,getHelper:()=>helper});return {books,ctx,config,helper,roles,writes:()=>writes,hook:fn=>hook=fn};
}
const button=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));

test('packaged templates are empty parser-compatible drafts rather than a demo runtime',()=>{
 const entries=bundledTemplateEntries(),world=parsePhoneWorld(entries[0].content),character=parsePhoneCharacter(entries[1].content);
 assert.equal(world.id,null);assert.equal(character.id,null);assert.deepEqual(character.accounts,[]);assert.deepEqual(character.wallet.accounts,[]);assert.deepEqual(world.catalog,[]);
 assert.match(entries[2].content,/仅供生成新世界/);
});
test('complete native template book and readable field guide match runtime templates exactly',()=>{
 const book=JSON.parse(readFileSync(new URL('../templates/tisya-template-book.json',import.meta.url),'utf8'));assert.deepEqual(book,bundledNativeTemplateBook());assert.equal(Object.keys(book.entries).length,4);assert(Object.values(book.entries).every(e=>e.disable===true));
 assert.equal(readFileSync(new URL('../templates/phone-fields.md',import.meta.url),'utf8'),PHONE_FIELDS_GUIDE);for(const name of ['每年计息期数','默认付款账户','默认收支账户','当前账号','歌单','公开授权','到期分钟'])assert(PHONE_FIELDS_GUIDE.includes(name));
});
test('global template preparation appends missing entries and preserves user edits and activation',async()=>{
 const f=fixture(),a=await f.roles.ensureTemplates();assert.equal(a.created,true);assert.equal(f.books[DEFAULT_TEMPLATE_BOOK].length,4);assert(f.books[DEFAULT_TEMPLATE_BOOK].every(e=>e.enabled===false));
 const row=f.books[DEFAULT_TEMPLATE_BOOK][0];row.content='用户自订世界骨架';row.enabled=true;f.books[DEFAULT_TEMPLATE_BOOK].pop();const old=structuredClone(row);
 const b=await f.roles.ensureTemplates();assert.equal(b.added.length,1);assert.deepEqual(f.books[DEFAULT_TEMPLATE_BOOK][0],old);const count=f.writes();await f.roles.ensureTemplates();assert.equal(f.writes(),count);assert.equal(f.config.read().templateBook,DEFAULT_TEMPLATE_BOOK);
});
test('duplicate builtin template names fail without replacing the existing book',async()=>{
 const f=fixture(),row=bundledTemplateEntries()[0];f.books[DEFAULT_TEMPLATE_BOOK]=[{...row,uid:1},{...row,uid:2}];const before=structuredClone(f.books);
 await assert.rejects(ensureTemplateBook({getHelper:()=>f.helper}),/重复/);assert.deepEqual(f.books,before);
});
test('templates are available only to creation tasks and configured read failure stays visible',async()=>{
 const f=fixture(),getHelper=()=>f.helper;const packaged=await readCreationTemplates(()=>f.ctx,{getHelper});assert.equal(packaged.source,'bundled-not-yet-installed');
 await f.roles.ensureTemplates();f.books[DEFAULT_TEMPLATE_BOOK][0].content='编辑后的模板';const actual=await readCreationTemplates(()=>f.ctx,{getHelper,task:'newCharacter'});assert.equal(actual.source,'worldbook');assert.equal(actual.entries[0].content,'编辑后的模板');
 await assert.rejects(readCreationTemplates(()=>f.ctx,{getHelper,task:'normal'}),/只用于新内容/);delete f.books[DEFAULT_TEMPLATE_BOOK];await assert.rejects(readCreationTemplates(()=>f.ctx,{getHelper}),/格式无效/);
});
test('creation reads an existing default template book before the identity page has configured it',async()=>{
 const f=fixture();f.books[DEFAULT_TEMPLATE_BOOK]=[{uid:8,name:'已编辑的模板',content:'已有用户规则',enabled:false}];
 const actual=await readCreationTemplates(()=>f.ctx,{getHelper:()=>f.helper});assert.equal(actual.source,'worldbook');assert.equal(actual.entries[0].content,'已有用户规则');assert.equal(f.config.read().templateBook,undefined);
 f.helper.getWorldbookNames=async()=>{throw Error('目录暂时不可读');};await assert.rejects(readCreationTemplates(()=>f.ctx,{getHelper:()=>f.helper}),/目录暂时不可读/);
});
test('editing the stable dossier UID preserves metadata and current phone runtime',async()=>{
 const f=fixture();await f.roles.create({name:'青',content:'原有完整档案'});Object.assign(f.books.基点书[0],{custom:{retained:true},enabled:true});f.books.基点书.push({uid:9,name:'【角色】旁人',content:'其他档案'});
 const before=(await f.roles.list()).entries[0],metadata=structuredClone(f.ctx.chatMetadata),original=structuredClone(f.books.基点书[0]);
 await f.roles.edit({book:'基点书',uid:0,name:'青的新名字',content:'编辑后的完整档案',before});
 assert.deepEqual(f.books.基点书[0],{...original,name:'【角色】青的新名字',content:'编辑后的完整档案'});assert.equal(f.books.基点书[1].content,'其他档案');assert.equal(f.config.read().story.userName,'青的新名字');assert.deepEqual(f.ctx.chatMetadata,metadata);
});
test('manual role creation never writes into the template book or adds implicit phone state',async()=>{
 const f=fixture(),before=structuredClone(f.ctx.chatMetadata);await assert.rejects(f.roles.create({book:DEFAULT_TEMPLATE_BOOK,name:'青',content:'手填'}),/模板书不能/);assert.equal(f.writes(),0);await f.roles.create({name:'青',content:'手填'});assert.equal(f.books[DEFAULT_TEMPLATE_BOOK],undefined);assert.deepEqual(f.ctx.chatMetadata,before);
});
test('empty prefixed role name is rejected before creating an unreadable entry',async()=>{const f=fixture();await assert.rejects(f.roles.create({name:'【角色】',content:'正文'}),/名称不能为空/);assert.equal(f.writes(),0);});
test('stale dossier snapshot and write-time race cannot overwrite another page',async()=>{
 const f=fixture();await f.roles.create({name:'青',content:'原文'});const before=(await f.roles.list()).entries[0];f.books.基点书[0].content='别处改文';
 await assert.rejects(f.roles.edit({book:'基点书',uid:0,name:'青',content:'想保存',before}),/其他页面修改/);assert.equal(f.books.基点书[0].content,'别处改文');
 const current=(await f.roles.list()).entries[0];f.hook(()=>{f.books.基点书[0].content='在写入前修改';});await assert.rejects(f.roles.edit({book:'基点书',uid:0,name:'青',content:'另一草稿',before:current}),/其他页面修改/);assert.equal(f.books.基点书[0].content,'在写入前修改');
});
test('dossier saved but chat-name sync failed reports the preserved partial save',async()=>{
 const f=fixture();await f.roles.create({name:'青',content:'原文'});const before=(await f.roles.list()).entries[0],save=f.config.save;f.config.save=async()=>{throw Error('确认写盘失败');};
 await assert.rejects(f.roles.edit({book:'基点书',uid:0,name:'新青',content:'已保存正文',before}),/角色档案已保存.*同步未完成.*确认写盘失败/);
 assert.equal(f.books.基点书[0].content,'已保存正文');assert.equal(f.config.read().story.userName,'青');f.config.save=save;await f.roles.edit({book:'基点书',uid:0,name:'新青',content:'已保存正文',before:(await f.roles.list()).entries[0]});assert.equal(f.books.基点书.length,1);assert.equal(f.config.read().story.userName,'新青');
});
test('world selection and exact raw initialization profile are chat scoped and read only',async()=>{
 const f=fixture();await f.roles.create({name:'青',content:'档案\n<手机初态>{"个人":"原样"}</手机初态>'});f.books.世界=[{uid:7,name:'【手机世界】远方',content:'世界叙述\n<手机世界>{"世界":"原样"}</手机世界>'}];f.books.资料=[{uid:8,name:'支线',content:'隐藏条件'}];
 const before=structuredClone(f.ctx.chatMetadata);assert.equal(await f.roles.phoneProfile(),null);await f.roles.saveResources({referenceBooks:['资料'],phoneWorld:{book:'世界',uid:7}});
 assert.deepEqual(await f.roles.phoneProfile(),{worldText:f.books.世界[0].content,characterText:f.books.基点书[0].content,binding:{world:{book:'世界',uid:7},character:{book:'基点书',uid:0}}});assert.deepEqual(f.ctx.chatMetadata,before);
 f.ctx.chatId='b';assert.equal(await f.roles.phoneProfile(),null);assert.deepEqual((await f.roles.resources()).referenceBooks,[]);f.ctx.chatId='a';assert.deepEqual((await f.roles.resources()).referenceBooks,['资料']);
 await assert.rejects(f.roles.saveResources({referenceBooks:['基点书']}),/包含模板书/);await assert.rejects(f.roles.saveResources({referenceBooks:['资料','资料']}),/重复/);
});
test('normal identity projection strips initial values while preserving narrative and source',async()=>{
 const f=fixture(),content='姓名和经历\n<手机初态>{"钱包":{"余额":9876}}</手机初态>\n结语';await f.roles.create({name:'青',content});
 const slots=await identitySlots(f.ctx,f.config.read(),'');assert.match(slots.tisya_user_identity,/姓名和经历/);assert.match(slots.tisya_user_identity,/结语/);assert.doesNotMatch(slots.tisya_user_identity,/9876|手机初态/);assert.equal(f.books.基点书[0].content,content);
 for(const broken of ['<手机初态>{}', '<手机初态>{}</手机初态><手机初态>{}</手机初态>','<手机初态 x>{}</手机初态>'])assert.throws(()=>stripPhoneInitialization(broken),/格式错误/);
});
test('reference scan uses current native conditions, retains source UID and deduplicates without enabling',async()=>{
 const f=fixture(),settings=f.config.read();settings.story.referenceBooks=['资料'];f.books.资料=[{uid:3,name:'世界',content:'叙述<手机世界>{"商品":[]}</手机世界>',disable:true,constant:false,key:['云'],probability:19,useProbability:true,extensions:{custom:{condition:'keep'}}},{uid:4,name:'分支',content:'条件信息',key:['雨'],order:8}];
 const raw=structuredClone(f.books),payload={globalLore:[{world:'资料',uid:3,content:'旧文',disable:false},{world:DEFAULT_TEMPLATE_BOOK,uid:1,content:'不能进入'}],characterLore:[{world:'资料',uid:3,content:'重复'},{world:'资料',uid:99,content:'已删'}],chatLore:[],personaLore:[{world:'其他',uid:1,content:'保持'}]};
 const source=await scanStoryReferenceBooks(payload,{getContext:()=>f.ctx,settings});assert.equal(source[0].entries.length,2);assert.equal(payload.globalLore.length,1);assert.equal(payload.characterLore.length,0);assert.equal(payload.chatLore.length,1);assert.equal(payload.personaLore[0].content,'保持');
 assert.deepEqual(payload.globalLore[0],{...f.books.资料[0],comment:'世界',content:'叙述',world:'资料'});assert.deepEqual(f.books,raw);await scanStoryReferenceBooks(payload,{getContext:()=>f.ctx,settings});assert.equal(payload.chatLore.length,1);
});
test('reference scan guards before mutation and does not mask missing or duplicate source data',async()=>{
 const f=fixture(),settings=f.config.read();settings.story.referenceBooks=['资料'];f.books.资料=[{uid:1,name:'资料',content:'文'}];const payload={chatLore:[]};
 await assert.rejects(scanStoryReferenceBooks(payload,{getContext:()=>f.ctx,settings,guard(){throw Error('聊天已切换');}}),/聊天已切换/);assert.deepEqual(payload,{chatLore:[]});
 f.books.资料.push({uid:1,name:'重复',content:'文'});f.ctx.loadWorldInfo=async name=>f.books[name]?{entries:Object.fromEntries(f.books[name].map((e,i)=>[i,e]))}:null;await assert.rejects(readStoryReferenceBooks(()=>f.ctx,settings),/条目标识/);delete f.books.资料;await assert.rejects(readStoryReferenceBooks(()=>f.ctx,settings),/不存在或损坏/);
});
test('refreshing a natively selected reference retains the console opt-in scan order',async()=>{
 const f=fixture(),settings=f.config.read();settings.story.referenceBooks=['资料'];f.books.资料=[{uid:4,name:'资料',content:'新原文',order:99,position:1,displayIndex:0}];
 const payload={globalLore:[{...f.books.资料[0],world:'资料'}],characterLore:[],chatLore:[],personaLore:[]};prepareWorldbookOrder(payload,{layoutOrder:true,bookOrder:['资料']});const order=payload.globalLore[0].order,rank=structuredClone(payload.globalLore[0].tisyaConsoleOrder);
 await scanStoryReferenceBooks(payload,{getContext:()=>f.ctx,settings});assert.equal(payload.globalLore[0].order,order);assert.deepEqual(payload.globalLore[0].tisyaConsoleOrder,rank);assert.equal(payload.globalLore[0].content,'新原文');assert.equal(f.books.资料[0].order,99);
});
test('native exclusion removes the entire template book even when enabled and strips both seed types',()=>{
 const data={chatLore:[{world:DEFAULT_TEMPLATE_BOOK,uid:2,content:'开启的模板',disable:false},{world:'其他',uid:3,content:'正文<手机初态>{}</手机初态>下文<手机世界>{}</手机世界>',key:['正文']}]};
 excludeTemplateBookEntries(data);assert.deepEqual(data.chatLore,[{world:'其他',uid:3,content:'正文下文',key:['正文']}]);
});
test('legacy shared resource mount edits the original dossier and saves references without native persona UI',async()=>{
 const f=fixture();await f.roles.create({name:'青',content:'档案旧文'});f.books.资料=[{uid:1,name:'【手机世界】河城',content:'世界定义'}];const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const ui=mountStoryResources(w.document,root,{config:f.config,roles:f.roles});await ui.ready;
 assert.equal(root.querySelector('[data-identity-wish]'),null);assert(root.querySelector('[data-role-edit]'));const editor=root.querySelector('[data-role-edit-content]');editor.value='编辑后的原文';editor.dispatchEvent(new w.Event('input'));assert.equal(ui.requestLeave().allowed,false);button(root,'保存角色档案').click();await settle();assert.equal(f.books.基点书[0].content,'编辑后的原文');assert.equal(ui.requestLeave().allowed,true);
 const checkbox=root.querySelector('[data-reference-book="资料"]');checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change'));button(root,'保存资料书与手机世界选择').click();await settle();assert.deepEqual(f.config.read().story.referenceBooks,['资料']);assert.equal(ui.requestLeave().allowed,true);ui.dispose();await w.happyDOM.abort();
});
test('an unreadable selected phone world remains visible and cannot be silently cleared while saving references',async()=>{
 const f=fixture();await f.roles.create({name:'青',content:'档案'});f.books.世界=[{uid:6,name:'【手机世界】远方',content:'定义'}];await f.roles.saveResources({phoneWorld:{book:'世界',uid:6}});delete f.books.世界;
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const ui=mountStoryResources(w.document,root,{config:f.config,roles:f.roles});await ui.ready;assert.equal(root.querySelector('[data-phone-world-book]').value,'世界');assert.equal(root.querySelector('[data-phone-world-entry]').value,'6');
 button(root,'保存资料书与手机世界选择').click();await settle();assert.deepEqual(f.config.read().story.phoneWorld,{book:'世界',uid:6});assert.match(root.textContent,/不存在/);ui.dispose();await w.happyDOM.abort();
});
test('failed source-book switch restores the editor source and cross-chat save is blocked',async()=>{
 const f=fixture();await f.roles.create({name:'青',content:'原档案'});f.books.另书=[{uid:0,name:'【角色】青',content:'原档案'}];const originalLoad=f.ctx.loadWorldInfo;f.ctx.loadWorldInfo=async name=>{if(name==='另书')throw Error('读取暂不可用');return originalLoad(name);};
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const ui=mountStoryResources(w.document,root,{config:f.config,roles:f.roles});await ui.ready;const select=root.querySelector('[data-role-book]');select.value='另书';select.dispatchEvent(new w.Event('change'));await settle();assert.equal(select.value,'基点书');assert.match(root.textContent,/读取暂不可用/);
 const editor=root.querySelector('[data-role-edit-content]');editor.value='待保存';editor.dispatchEvent(new w.Event('input'));f.ctx.chatId='b';button(root,'保存角色档案').click();await settle();assert.equal(f.books.基点书[0].content,'原档案');assert.equal(f.books.另书[0].content,'原档案');assert.match(root.textContent,/聊天已切换/);ui.dispose();await w.happyDOM.abort();
});
