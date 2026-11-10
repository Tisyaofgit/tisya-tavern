import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator,prepareCreationSheets,acceptCreationSheets} from '../engine/creation.mjs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';

const reply=(cells,extra='')=>'<reply><title>测试方案</title><body>1 可核对的作者资料。</body><extra>'+extra+'</extra><cells>'+cells+'</cells><vars/><archive/></reply>';
function section(context,tableId,values,number=1){const table=context.catalog.templates.find(t=>t.id===tableId);return '【'+table.label+'／'+number+'】\n'+Object.entries(values).map(([key,value])=>{const index=table.fields.findIndex(f=>f.key===key);assert(index>=0,key);return (index+1)+' '+table.fields[index].label+'：'+value;}).join('\n');}
function minimal(){const rt=new Runtime();rt.registerTable('NODES',[{key:'name',label:'名称',type:'TEXT',required:true},{key:'amount',label:'数量',type:'INTEGER',minimum:0},{key:'peer',label:'关联',type:'REF',ref:'NODES'}],'节点');const snapshot={state:rt.data,revision:0,contextKey:'partial'};return {snapshot,context:prepareCreationSheets(snapshot,{operationId:'partial-seed',kind:'world',mode:'extend'})};}

test('partial acceptance isolates a failed row and its dependency closure while valid cycles pass together',()=>{
 const {snapshot,context}=minimal(),raw=reply([
  section(context,'NODES',{name:'独立甲',amount:'1'},1),section(context,'NODES',{name:'坏项',amount:'坏数字'},2),
  section(context,'NODES',{name:'依赖项',peer:'节点／2'},3),section(context,'NODES',{name:'互联甲',peer:'节点／5'},4),section(context,'NODES',{name:'互联乙',peer:'节点／4'},5)
 ].join('\n'),'建议：补充名称说明');
 const result=acceptCreationSheets(context,snapshot,raw,{partial:true});
 assert.deepEqual(result.acceptance.accepted.map(x=>x.heading),['节点／1','节点／4','节点／5']);assert.equal(result.acceptance.pending.length,2);assert.equal(result.acceptance.warnings.length,1);assert.equal(result.proposal.unresolved.length,0);
 assert(result.acceptance.pending.every(x=>x.raw.includes('【节点／')));assert.equal(Object.keys(snapshot.state.tables.NODES).length,0);
 const ids=new Map(result.proposal.matrix.changes.map(c=>[c.values.name,c.recordId]));assert.equal(result.proposal.matrix.changes.find(c=>c.values.name==='互联甲').values.peer,ids.get('互联乙'));
});

test('duplicate groups, unknown tables and missing required fields leave independent rows reviewable',()=>{
 const {snapshot,context}=minimal(),raw=reply([section(context,'NODES',{name:'保留'},1),section(context,'NODES',{name:'重复甲'},2),section(context,'NODES',{name:'重复乙'},2),section(context,'NODES',{amount:'2'},3),'【未知表／1】\n1 名称：原文'].join('\n'));
 const result=acceptCreationSheets(context,snapshot,raw,{partial:true});assert.equal(result.acceptance.acceptedCount,1);assert.equal(result.acceptance.pending.length,4);assert.equal(result.proposal.matrix.changes[0].values.name,'保留');assert(result.acceptance.pending.some(row=>row.reason.includes('必填')));
});

let serial=0;
async function fixture(responses){
 const ctx={chatId:'partial-'+(++serial),characterId:null,characters:[],chat:[],chatMetadata:{},extensionSettings:{},saveChat:async()=>true},disk=new Map(),cache=new Map(),inputs=[];
 const storage={get:async id=>structuredClone(disk.get(id)),set:async(id,value)=>disk.set(id,structuredClone(value)),commit:async(id,revision,value)=>{if((disk.get(id)?.local_revision??0)!==revision)return false;disk.set(id,structuredClone(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});await host.ensureDatabase();
 const database={read:()=>host.readDatabase(),commit:input=>host.commitDatabase(input)},taskStorage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)};
 const cold=()=>createMatrixCreator({database,getContext:()=>ctx,taskStorage,request:async(_task,input)=>{inputs.push(JSON.parse(input));assert(responses.length,'unexpected model request');return responses.shift();}});
 return {ctx,host,cache,inputs,cold,responses,creator:cold(),snapshot:()=>host.readDatabase()};
}

async function archivedFixture(responses){
 const f=await fixture(responses),books=new Map([['测试作者书',[{uid:7,name:'待整理角色',content:'测试角色的作者原文。',enabled:true}]]]);let failBusiness=false,bookWrites=0;
 f.ctx.loadWorldInfo=async name=>books.has(name)?{entries:Object.fromEntries(books.get(name).map(row=>[row.uid,structuredClone(row)]))}:undefined;
 const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>structuredClone(books.get(name)),createWorldbook:async(name,entries)=>{books.set(name,structuredClone(entries));bookWrites++;return true;},updateWorldbookWith:async(name,update)=>{books.set(name,structuredClone(update(structuredClone(books.get(name)))));bookWrites++;}};
 const sourceBooks=createBookGateway(()=>helper,()=>f.ctx),database={read:f.snapshot,commit:async input=>{if(failBusiness&&input.source?.kind==='creation')throw Error('模拟业务确认失败');return f.host.commitDatabase(input);}};
 const cold=()=>createMatrixCreator({database,getContext:()=>f.ctx,sourceBooks,taskStorage:{getItem:key=>f.cache.get(key)??null,setItem:(key,value)=>f.cache.set(key,value)},request:async(_task,input)=>{f.inputs.push(JSON.parse(input));assert(f.responses.length,'unexpected model request');return f.responses.shift();}});
 return {...f,books,sourceBooks,cold,creator:cold(),get bookWrites(){return bookWrites;},set failBusiness(value){failBusiness=value;}};
}

test('confirmed valid rows survive reopen; only pending rows are repaired with stable original record identities',async()=>{
 const f=await fixture([]),snapshot=await f.snapshot(),context=prepareCreationSheets(snapshot,{operationId:'test',kind:'character',mode:'extend'});
 // Build field labels from the production catalog, including the malformed ref.
 const original=reply([section(context,'T_STATIC_WORLDS',{name:'测试世界'}),section(context,'T_CHAR_DOSSIER',{name:'测试角色',birth_place_ref:'不存在地点'})].join('\n'));
 const fixed=reply(section(context,'T_CHAR_DOSSIER',{name:'测试角色',public_identity:'测试职业'}));
 f.responses.push(original,fixed);const creator=f.creator;
 const draft=await creator.draft('生成测试资料',{kind:'character',destination:{book:'测试书'}});assert.equal(draft.acceptance.acceptedCount,1);assert.equal(draft.acceptance.pending.length,1);assert.equal(draft.proposal.matrix.binding?.entityId,undefined);
 const pendingId=draft.acceptance.pending[0].recordId,saved=await creator.save(draft);assert(saved.repairContext.acceptance.pending.length);creator.clearCreationView();assert(creator.creationView().repair);
 f.cache.clear();const reopened=f.cold();assert.equal(await reopened.pending(),null);const restored=reopened.creationView().repair;assert.equal(restored.operationId,draft.operationId);
 const repaired=await reopened.repair(restored);assert.equal(repaired.acceptance.pending.length,0);assert.equal(repaired.proposal.matrix.changes.find(c=>c.tableId==='T_CHAR_DOSSIER').recordId,pendingId);assert.equal(repaired.rawResponses[0].rawResponse,original);assert.equal(repaired.rawResponses[1].rawResponse,fixed);
 assert.equal(f.inputs[1].repair.pending.length,1);assert.equal(f.inputs[1].conversation.filter(m=>m.role==='assistant').length,0);assert.equal(f.inputs[1].repair.accepted.length,1);
 await reopened.save(repaired);await reopened.save(repaired);const after=await f.snapshot();assert.equal(Object.keys(after.state.tables.T_CHAR_DOSSIER).length,1);assert.equal(Object.keys(after.state.tables.T_STATIC_WORLDS).length,1);assert.equal(reopened.creationView(),null);
});

test('soft suggestions do not block saving and a wholly invalid draft never commits an empty archive',async()=>{
 const f=await fixture([reply('【人物原点档案／1】\n1 显示名称：测试角色','建议：可以补充职业细节'),reply('【人物原点档案／1】\n1 显示名称：测试角色二\n999 错误字段：待修')]);
 const good=await f.creator.draft('测试建议',{kind:'character'});assert.equal(good.acceptance.warnings.length,1);await f.creator.save(good);const before=(await f.snapshot()).revision;
 const bad=await f.creator.draft('测试错误',{kind:'character'});assert.equal(bad.proposal.matrix.changes.length,0);assert.equal(bad.acceptance.pending.length,1);await assert.rejects(f.creator.save(bad),/1至2000/);assert.equal((await f.snapshot()).revision,before);
});

test('repair refuses replayed accepted rows and preserves the failed original alongside the next repair',async()=>{
 const f=await fixture([]),context=prepareCreationSheets(await f.snapshot(),{operationId:'seed',kind:'character',mode:'extend'});
 const original=reply([section(context,'T_STATIC_WORLDS',{name:'保留世界'}),section(context,'T_CHAR_DOSSIER',{name:'待修角色',birth_place_ref:'缺失地点'})].join('\n'));
 const unauthorized=reply(section(context,'T_STATIC_WORLDS',{name:'不应重放的世界'})),fixed=reply(section(context,'T_CHAR_DOSSIER',{name:'待修角色',public_identity:'测试职业'}));f.responses.push(original,unauthorized,fixed);
 const draft=await f.creator.draft('分组测试',{kind:'character'}),saved=await f.creator.save(draft),revision=(await f.snapshot()).revision;
 await assert.rejects(f.creator.repair(saved.repairContext),/未授权/);assert.equal((await f.snapshot()).revision,revision);assert.equal(f.creator.creationTask().text,unauthorized);
 const repaired=await f.creator.repair(saved.repairContext);assert.equal(repaired.rawResponses.length,3);assert(repaired.rawResponses.some(row=>row.rawResponse===unauthorized&&row.status==='error'));assert.equal(repaired.proposal.matrix.changes.filter(c=>c.tableId==='T_STATIC_WORLDS').length,0);
});

test('an unsaved all-invalid draft repairs the original record identity without a business receipt',async()=>{
 const f=await fixture([reply('【人物原点档案／1】\n1 显示名称：测试角色\n999 错误字段：保留'),reply('【人物原点档案／1】\n1 显示名称：测试角色')]);
 const draft=await f.creator.draft('测试空合法集',{kind:'character'}),recordId=draft.acceptance.pending[0].recordId,before=(await f.snapshot()).revision;
 const repaired=await f.creator.repair({draft});assert.equal((await f.snapshot()).revision,before);assert.equal(repaired.proposal.matrix.changes.find(c=>c.tableId==='T_CHAR_DOSSIER').recordId,recordId);assert.equal(repaired.acceptance.pending.length,0);
});

test('an empty cells block remains an explicit repairable item with the original response intact',()=>{
 const {snapshot,context}=minimal(),result=acceptCreationSheets(context,snapshot,reply(''),{partial:true});assert.equal(result.acceptance.acceptedCount,0);assert.equal(result.acceptance.pending.length,1);assert.match(result.acceptance.pending[0].reason,/没有可读取/);
});

test('partial worldbook commit recovers atomically and later repairs the original source UID without replaying accepted entries',async()=>{
 const f=await archivedFixture([]),context=prepareCreationSheets(await f.snapshot(),{operationId:'seed',kind:'character',mode:'revise'}),source=await f.sourceBooks.readSource({book:'测试作者书',uid:7});
 const original=reply([section(context,'T_STATIC_WORLDS',{name:'作者世界'}),section(context,'M_UNITS',{label:'测试单位',dimension:'time',scope_world_id:context.catalog.templates.find(row=>row.id==='T_STATIC_WORLDS').label+'／1'}),section(context,'T_CHAR_DOSSIER',{name:'测试角色',birth_place_ref:'缺失地点'})].join('\n'));
 const fixed=reply(section(context,'T_CHAR_DOSSIER',{name:'测试角色',public_identity:'测试职业'}));f.responses.push(original,fixed);
 const draft=await f.creator.draft('整理测试资料',{kind:'character',mode:'revise',source,destination:{book:'测试作者书',uid:7}});assert.equal(draft.acceptance.acceptedCount,2);assert.equal(draft.acceptance.pending.length,1);const dossierId=draft.acceptance.pending[0].recordId;
 f.failBusiness=true;await assert.rejects(f.creator.save(draft),error=>error.archiveReceipt?.confirmed&&error.archiveReceipt.sourceArchive.entries.length===2);assert.equal(f.books.get('测试作者书').find(row=>row.uid===7).content,source.content);assert.equal(f.bookWrites,1);
 f.cache.clear();const reopened=f.cold(),pending=await reopened.pending();assert(pending.archiveReceipt.confirmed);f.failBusiness=false;const saved=await reopened.save(pending);assert.equal(saved.repairContext.destination.uid,7);assert.equal(f.bookWrites,1);
 const acceptedUids=saved.sourceArchive.entries.map(row=>row.uid),before=f.books.get('测试作者书').map(row=>({uid:row.uid,content:row.content}));
 const runtime=await f.snapshot(),worldId=draft.proposal.matrix.changes.find(row=>row.tableId==='T_STATIC_WORLDS').recordId;await f.host.commitDatabase({operationId:'live-change',contextKey:runtime.contextKey,expectedRevision:runtime.revision,changes:[{tableId:'T_STATIC_WORLDS',recordId:worldId,values:{name:'运行时名称'}}]});
 const repaired=await reopened.repair(saved.repairContext),lastInput=f.inputs.at(-1);assert.equal(lastInput.repair.accepted.find(row=>row.tableId==='T_STATIC_WORLDS').values.name,'作者世界');assert.equal(repaired.proposal.matrix.changes.find(row=>row.tableId==='T_CHAR_DOSSIER').recordId,dossierId);
 const complete=await reopened.save(repaired);await reopened.save(repaired);assert.equal(complete.sourceArchive.uid,7);assert.equal(f.bookWrites,2);assert.equal(f.books.get('测试作者书').length,before.length);
 for(const uid of acceptedUids)assert.equal(f.books.get('测试作者书').find(row=>row.uid===uid).content,before.find(row=>row.uid===uid).content);
 assert.equal(readMatrixDefinition(f.books.get('测试作者书').find(row=>row.uid===7)).matrix.binding.dossierId,dossierId);assert.equal((await f.snapshot()).state.tables.T_STATIC_WORLDS[worldId].values.name,'运行时名称');
});
