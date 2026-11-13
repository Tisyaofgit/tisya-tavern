import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {readFileSync} from 'node:fs';
import {createConfiguration,identitySlots} from '../engine/config.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {mountStoryResources} from '../engine/identity-ui.mjs';
import {DEFAULT_TEMPLATE_BOOK,bundledTemplateEntries,bundledNativeTemplateBook,ensureTemplateBook,readCreationTemplates,excludeTemplateBookEntries,readStoryReferenceBooks,scanStoryReferenceBooks} from '../engine/template-book.mjs';
import * as phoneConfig from '../phone-life-config.mjs';
import * as templateModule from '../engine/template-book.mjs';
import {PHONE_FORM_TEMPLATES} from '../engine/form-template-routing.mjs';
import {prepareWorldbookOrder} from '../worldbook-order.js';
import {WORLD_FORM_TEMPLATE,CHARACTER_FORM_TEMPLATE,MATRIX_CREATION_CONTRACT,FORM_TEMPLATE_GUIDE} from '../engine/builtin-book-data.mjs';

function fixture(){
 const books={},ctx={extensionSettings:{},chatMetadata:{phone:{balance:7431,story:'already progressed'}},chatId:'a',characterId:0};let writes=0,hook=null;
 ctx.loadWorldInfo=async name=>books[name]?{entries:Object.fromEntries(books[name].map(e=>[e.uid,{...structuredClone(e),comment:e.name}]))}:null;
 const config=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const helper={getWorldbookNames:async()=>Object.keys(books),getWorldbook:async name=>structuredClone(books[name]),createWorldbook:async(name,entries)=>{if(books[name])return false;writes++;books[name]=entries.map((e,i)=>({...structuredClone(e),uid:i}));return true;},updateWorldbookWith:async(name,fn)=>{await hook?.(name);const result=fn(structuredClone(books[name]));writes++;books[name]=result.map((e,i)=>({...e,uid:e.uid??i}));return structuredClone(books[name]);}};
 const roles=createStoryIdentity({config,getContext:()=>ctx,getHelper:()=>helper,database:{read:async()=>({state:{tables:{}}}),commit:async()=>{throw Error('not an authoring fixture');}}});return {books,ctx,config,helper,roles,writes:()=>writes,hook:fn=>hook=fn};
}
const button=(root,label)=>[...root.querySelectorAll('button')].find(b=>b.textContent===label);
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));

test('packaged authoring templates derive readable rules from canonical definitions and share the form contract',()=>{
 const entries=bundledTemplateEntries();assert.equal(entries.length,13);assert.equal(phoneConfig.parsePhoneWorld,undefined);assert.equal(phoneConfig.parsePhoneCharacter,undefined);assert.equal(templateModule.stripPhoneInitialization,undefined);
 for(const [entry,definition] of [[entries[0],WORLD_FORM_TEMPLATE],[entries[1],CHARACTER_FORM_TEMPLATE]]){
  for(const target of definition.targets)assert(entry.content.includes(target.instruction));
  assert(entry.content.endsWith(MATRIX_CREATION_CONTRACT));assert.doesNotMatch(entry.content,/"(?:tableId|fields|matrix|changes)"\s*:/);
 }
 assert(WORLD_FORM_TEMPLATE.targets.some(t=>t.tableId==='T_STATIC_WORLDS'));assert(CHARACTER_FORM_TEMPLATE.targets.some(t=>t.tableId==='T_CHAR_DOSSIER'));assert.match(entries[1].content,/本领外显只写能力的实际表现/);assert.equal(entries[3].content,FORM_TEMPLATE_GUIDE);
 assert(entries.slice(0,4).every(e=>e.content.includes(MATRIX_CREATION_CONTRACT)));assert(PHONE_FORM_TEMPLATES.every(entry=>entry.tasks.length&&entry.tables.length));assert(!entries.some(e=>/^【模板】.*初态/u.test(e.name)));
});
test('complete native template book contains all thirteen task templates with no legacy field-guide export',()=>{
 const book=JSON.parse(readFileSync(new URL('../templates/tisya-template-book.json',import.meta.url),'utf8'));assert.deepEqual(book,bundledNativeTemplateBook());assert.equal(Object.keys(book.entries).length,13);assert(Object.values(book.entries).every(e=>e.disable===true));
 assert.equal(templateModule.PHONE_FIELDS_GUIDE,undefined);const text=PHONE_FORM_TEMPLATES.map(entry=>entry.content).join('\n');for(const word of ['每年计息期数','当前账号','歌单','逐条授权','故事分钟'])assert(text.includes(word));
});
test('global template preparation appends missing entries and preserves user edits and activation',async()=>{
 const f=fixture(),a=await ensureTemplateBook({getHelper:()=>f.helper});assert.equal(a.created,true);assert.equal(f.books[DEFAULT_TEMPLATE_BOOK].length,13);assert(f.books[DEFAULT_TEMPLATE_BOOK].every(e=>e.enabled===false));
 const row=f.books[DEFAULT_TEMPLATE_BOOK][0];row.content='用户自订世界骨架';row.enabled=true;f.books[DEFAULT_TEMPLATE_BOOK].pop();const old=structuredClone(row);
 const b=await ensureTemplateBook({getHelper:()=>f.helper});assert.equal(b.added.length,1);assert.deepEqual(f.books[DEFAULT_TEMPLATE_BOOK][0],old);const count=f.writes();await ensureTemplateBook({getHelper:()=>f.helper});assert.equal(f.writes(),count);assert.equal(f.books[DEFAULT_TEMPLATE_BOOK].length,13);
});
test('duplicate builtin template names fail without replacing the existing book',async()=>{
 const f=fixture(),row=bundledTemplateEntries()[0];f.books[DEFAULT_TEMPLATE_BOOK]=[{...row,uid:1},{...row,uid:2}];const before=structuredClone(f.books);
 await assert.rejects(ensureTemplateBook({getHelper:()=>f.helper}),/重复/);assert.deepEqual(f.books,before);
});
test('task routing selects matching templates and unknown tasks or configured read failures stay visible',async()=>{
 const f=fixture(),getHelper=()=>f.helper;const packaged=await readCreationTemplates(()=>f.ctx,{getHelper});assert.equal(packaged.source,'bundled-not-yet-installed');
 await ensureTemplateBook({getHelper:()=>f.helper});f.books[DEFAULT_TEMPLATE_BOOK].find(row=>row.id==='template.character.form').content='编辑后的模板';const actual=await readCreationTemplates(()=>f.ctx,{getHelper,task:'newCharacter'});assert.equal(actual.source,'worldbook');assert.equal(actual.entries.find(row=>row.name==='【模板】角色统一表单').content,'编辑后的模板');assert(!actual.entries.some(row=>row.name==='【模板】世界统一表单'));
 await assert.rejects(readCreationTemplates(()=>f.ctx,{getHelper,task:'normal'}),/未知表单模板任务/);const settings=f.config.read();settings.templateBook=DEFAULT_TEMPLATE_BOOK;await f.config.save(settings);delete f.books[DEFAULT_TEMPLATE_BOOK];await assert.rejects(readCreationTemplates(()=>f.ctx,{getHelper}),/格式无效/);
});
test('creation reads an existing default template book before the identity page has configured it',async()=>{
 const f=fixture();f.books[DEFAULT_TEMPLATE_BOOK]=[{uid:8,name:'已编辑的模板',content:'已有用户规则',enabled:false}];
 const actual=await readCreationTemplates(()=>f.ctx,{getHelper:()=>f.helper});assert.equal(actual.source,'worldbook');assert.equal(actual.entries[0].content,'已有用户规则');assert.equal(f.config.read().templateBook,undefined);
 f.helper.getWorldbookNames=async()=>{throw Error('目录暂时不可读');};await assert.rejects(readCreationTemplates(()=>f.ctx,{getHelper:()=>f.helper}),/目录暂时不可读/);
});
test('legacy raw phone initialization is rejected without accepting a separate book binding',()=>{
 const before={world:{format:'tisya.phone-world/1'},character:{format:'tisya.phone-character/1'},binding:{world:{book:'世界',uid:7},character:{book:'基点书',uid:0}}},copy=structuredClone(before);
 assert.throws(()=>phoneConfig.createInitialPhoneLife(before),/统一表单/);assert.deepEqual(before,copy);assert.equal(phoneConfig.parsePhoneWorld,undefined);assert.equal(phoneConfig.parsePhoneCharacter,undefined);
});
test('old book binding cannot bypass current form identity projection and source text remains intact',async()=>{
 const f=fixture(),content='姓名和经历\n<手机初态>{"钱包":{"余额":9876}}</手机初态>\n结语';f.books.基点书=[{uid:0,name:'【角色】青',content}];const value=f.config.read();value.story.userBinding={book:'基点书',uid:0};await f.config.save(value);
 await assert.rejects(identitySlots(f.ctx,f.config.read(),''),/重新预览并采用基点人物原文/);assert.equal(f.books.基点书[0].content,content);assert.equal(templateModule.stripPhoneInitialization,undefined);
});
test('reference scan uses current native conditions, retains source UID and deduplicates without enabling',async()=>{
 const f=fixture(),settings=f.config.read();settings.story.referenceBooks=['资料'];f.books.资料=[{uid:3,name:'世界',content:'叙述<手机世界>{"商品":[]}</手机世界>',disable:true,constant:false,key:['云'],probability:19,useProbability:true,extensions:{custom:{condition:'keep'}}},{uid:4,name:'分支',content:'条件信息',key:['雨'],order:8}];
 const raw=structuredClone(f.books),payload={globalLore:[{world:'资料',uid:3,content:'旧文',disable:false},{world:DEFAULT_TEMPLATE_BOOK,uid:1,content:'不能进入'}],characterLore:[{world:'资料',uid:3,content:'重复'},{world:'资料',uid:99,content:'已删'}],chatLore:[],personaLore:[{world:'其他',uid:1,content:'保持'}]};
 const source=await scanStoryReferenceBooks(payload,{getContext:()=>f.ctx,settings});assert.equal(source[0].entries.length,2);assert.equal(payload.globalLore.length,1);assert.equal(payload.characterLore.length,0);assert.equal(payload.chatLore.length,1);assert.equal(payload.personaLore[0].content,'保持');
 assert.deepEqual(payload.globalLore[0],{...f.books.资料[0],comment:'世界',world:'资料'});assert.deepEqual(f.books,raw);await scanStoryReferenceBooks(payload,{getContext:()=>f.ctx,settings});assert.equal(payload.chatLore.length,1);
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
test('native exclusion removes entire template book while ordinary source text is preserved verbatim',()=>{
 const data={chatLore:[{world:DEFAULT_TEMPLATE_BOOK,uid:2,content:'开启的模板',disable:false},{world:'其他',uid:3,content:'正文<手机初态>{}</手机初态>下文<手机世界>{}</手机世界>',key:['正文']}]};
 excludeTemplateBookEntries(data);assert.deepEqual(data.chatLore,[{world:'其他',uid:3,content:'正文<手机初态>{}</手机初态>下文<手机世界>{}</手机世界>',key:['正文']}]);
});
test('legacy book world selection is rejected by current configuration without changing saved references',async()=>{
 const f=fixture();f.books.资料=[{uid:1,name:'资料',content:'原文'}];await f.roles.saveResources({referenceBooks:['资料']});const before=f.config.read(),next=structuredClone(before);next.story.phoneWorld={book:'世界',uid:6};await assert.rejects(f.config.save(next),/世界表单/);assert.deepEqual(f.config.read(),before);
});
