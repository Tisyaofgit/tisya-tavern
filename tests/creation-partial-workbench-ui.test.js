import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator,prepareCreationSheets} from '../engine/creation.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createBookGateway,readMatrixDefinition} from '../tables/books.js';
import {mountMatrixCreation} from '../engine/identity-ui.mjs';
import {mountCreationTable} from '../engine/creation-workbench.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url),'utf8')),copy=structuredClone;
const reply=(cells,extra='')=>'<reply><title>核对资料</title><body>1 这是可继续讨论的创作说明。</body><extra>'+extra+'</extra><cells>'+cells+'</cells><vars/><archive/></reply>';
function section(context,id,values){const table=context.catalog.templates.find(row=>row.id===id);return '【'+table.label+'／1】\n'+Object.entries(values).map(([key,value])=>{const i=table.fields.findIndex(field=>field.key===key);assert(i>=0,key);return (i+1)+' '+table.fields[i].label+'：'+value;}).join('\n');}
let serial=0;
async function fixture(){
 const ctx={chatId:'partial-ui-'+(++serial),characterId:null,characters:[],chat:[],chatMetadata:{},extensionSettings:{},saveChat:async()=>true},disk=new Map(),cache=new Map(),books=new Map([['作者基点',[]]]),responses=[],inputs=[];
 const storage={get:async key=>copy(disk.get(key)),set:async(key,value)=>disk.set(key,copy(value)),commit:async(key,revision,value)=>{if((disk.get(key)?.local_revision??0)!==revision)return false;disk.set(key,copy(value));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true});await host.ensureDatabase();
 const helper={getWorldbookNames:async()=>[...books.keys()],getWorldbook:async name=>copy(books.get(name)),createWorldbook:async(name,entries)=>{books.set(name,copy(entries));return true;},updateWorldbookWith:async(name,fn)=>books.set(name,copy(fn(copy(books.get(name)))))};
 const sourceBooks=createBookGateway(()=>helper,()=>ctx),database={read:()=>host.readDatabase(),commit:patch=>host.commitDatabase(patch)},win=new Window(),root=win.document.createElement('main');win.document.body.append(root);let view,creator,roles,personaCalls=0;
 const identity={read:()=>({personas:[],active:'',revision:0,description:'',scope:{chatId:ctx.chatId,characterId:null,groupId:null}}),createFromMatrix:async()=>{personaCalls++;}};
 function service(){creator=createMatrixCreator({database,getContext:()=>ctx,sourceBooks,taskStorage:{getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)},request:async(_task,input,{onProgress})=>{inputs.push(JSON.parse(input));assert(responses.length,'unexpected request');const raw=responses.shift();onProgress?.({stage:'prepared',promptMessages:[{role:'system',content:'本次实际创作提示词'},{role:'user',content:input}]});onProgress?.({stage:'streaming',text:raw});return raw;}});roles=createStoryIdentity({sourceBooks,config:host.config,getContext:()=>ctx,database,creator,getHelper:()=>helper});}
 service();const initial={kind:'character',goal:'整理中性人物与世界资料',createPersona:true,destination:{book:'作者基点'}};
 async function mount({cold=false,clearCache=false,initialCreation}={}){view?.dispose();if(clearCache)cache.clear();if(cold)service();view=mountMatrixCreation(win.document,root,{roles,config:host.config,identity,...(initialCreation?{initialCreation}:{})});assert.equal(await view.ready,true,root.textContent);return view;}
 await mount({initialCreation:initial});const context=prepareCreationSheets(await database.read(),{kind:'character',operationId:'ui-labels',mode:'extend'});
 const click=async selector=>{const node=root.querySelector(selector);assert(node,selector);node.click();await view.settled();};
 return {ctx,root,win,context,responses,inputs,books,host,database,cache,mount,initial,get creator(){return creator;},get view(){return view;},get personaCalls(){return personaCalls;},click,setGoal(value){const node=root.querySelector('[data-creation-goal]');node.value=value;node.dispatchEvent(new win.Event('input'));},review(){const node=root.querySelector('[data-creation-confirm]');assert(node,root.textContent);node.checked=true;node.dispatchEvent(new win.Event('change'));},async close(){view?.dispose();await win.happyDOM.abort();}};
}

test('partial UI saves legal groups without a persona, restores pending after cold reopen and repairs the original record only',async t=>{
 const f=await fixture();t.after(()=>f.close());f.responses.push(reply([section(f.context,'T_STATIC_WORLDS',{name:'清河世界'}),section(f.context,'T_CHAR_DOSSIER',{name:'渡口旅人',birth_place_ref:'不存在的地点'})].join('\n')),reply(section(f.context,'T_CHAR_DOSSIER',{name:'渡口旅人',public_identity:'摆渡人'})));
 await f.click('[data-creation-send]');const pending=f.view.exportDraft().creation.draft.acceptance.pending[0].recordId;assert.match(f.root.querySelector('[data-creation-prompt]').textContent,/本次实际创作提示词/);assert.match(f.root.querySelector('[data-creation-raw-reply]').textContent,/不存在的地点/);assert.equal(f.root.querySelector('[data-creation-persona]').disabled,true);
 f.review();assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert.equal(f.personaCalls,0);assert.equal(Object.keys((await f.database.read()).state.tables.T_STATIC_WORLDS).length,1);const savedEntries=copy(f.books.get('作者基点'));assert.equal(savedEntries.map(readMatrixDefinition).filter(Boolean).length,1);assert(f.root.querySelector('[data-creation-pending]'));assert.equal(f.view.state().canSave,false);
 await f.mount({cold:true,clearCache:true});const retainedRepair=copy(f.view.exportDraft().creation.repair);assert.equal(await f.view.discardDraft(),true);assert.deepEqual(f.view.exportDraft().creation.repair,retainedRepair);assert(f.root.querySelector('[data-creation-pending]'),f.root.textContent);assert.equal(f.root.querySelector('[data-creation-book]').value,'作者基点');await f.click('[data-creation-repair]');assert.equal(f.inputs[1].repair.pending.length,1);assert.equal(f.inputs[1].conversation.some(message=>message.role==='assistant'),false);const draft=f.view.exportDraft().creation.draft;assert.equal(draft.proposal.matrix.changes.find(change=>change.tableId==='T_CHAR_DOSSIER').recordId,pending);assert.equal(draft.proposal.matrix.changes.some(change=>change.tableId==='T_STATIC_WORLDS'),false);
 f.review();assert.equal(await f.view.saveDraft(),true,f.root.textContent);const after=await f.database.read();assert.equal(Object.keys(after.state.tables.T_CHAR_DOSSIER).length,1);assert.equal(Object.keys(after.state.tables.T_STATIC_WORLDS).length,1);for(const row of savedEntries)assert.equal(f.books.get('作者基点').find(now=>now.uid===row.uid).content,row.content);assert.equal(f.books.get('作者基点').map(readMatrixDefinition).filter(row=>row?.matrix.binding?.dossierId===pending).length,1);
});

test('an empty legal set disables save but remains editable through the repair task',async t=>{
 const f=await fixture();t.after(()=>f.close());f.responses.push(reply(section(f.context,'T_CHAR_DOSSIER',{name:'待修人物',birth_place_ref:'缺少地点'})),reply(section(f.context,'T_CHAR_DOSSIER',{name:'待修人物'})));
 await f.click('[data-creation-send]');const draft=f.view.exportDraft().creation.draft,pending=draft.acceptance.pending[0].recordId;assert.equal(draft.proposal.matrix.changes.length,0);assert.equal(f.view.state().canSave,false);assert.equal([...f.root.querySelectorAll('button')].find(node=>node.textContent==='保存').disabled,true);const before=(await f.database.read()).revision;await f.click('[data-creation-repair]');assert.equal((await f.database.read()).revision,before);const repaired=f.view.exportDraft().creation.draft.proposal.matrix.changes.find(row=>row.tableId==='T_CHAR_DOSSIER');assert(repaired,f.root.textContent);assert.equal(repaired.recordId,pending);assert(f.root.querySelector('[data-creation-fields]'));
});

test('saved suggestions stay visible and a normal next request never enters repair',async t=>{
 const f=await fixture();t.after(()=>f.close());f.responses.push(reply(section(f.context,'T_CHAR_DOSSIER',{name:'第一位旅人'}),'建议：以后可以补充职业'),reply(section(f.context,'T_CHAR_DOSSIER',{name:'第二位旅人'})));
 await f.click('[data-creation-send]');assert.equal(f.root.querySelector('[data-creation-repair]'),null);f.review();assert.equal(await f.view.saveDraft(),true,f.root.textContent);assert(f.root.querySelector('[data-creation-warnings]'));assert.equal(f.root.querySelector('[data-creation-repair]'),null);f.setGoal('另创作第二位旅人');await f.click('[data-creation-send]');assert.equal(f.inputs.length,2);assert.equal(f.inputs[1].repair,undefined);assert.equal(f.view.exportDraft().creation.draft.acceptance.pending.length,0);
});

test('an empty cached identity page cannot replace an explicit source handoff destination',async t=>{
 const f=await fixture();t.after(()=>f.close());f.view.dispose();f.creator.rememberCreationView({creation:{draft:null,text:'',goal:'',destination:{book:''}},history:[]});await f.mount({initialCreation:f.initial});assert.equal(f.root.querySelector('[data-creation-book]').value,'作者基点');assert.equal(f.root.querySelector('[data-creation-goal]').value,f.initial.goal);
});

test('removing a nested array row clears only its invalid text and preserves shifted sibling input',()=>{
 const win=new Window(),root=win.document.createElement('main'),proposal={matrix:{changes:[{tableId:'TEST',recordId:'one',values:{levels:[{limit:1},{limit:2}]}}]}},fieldTexts={},fieldErrors={};
 mountCreationTable(win.document,root,{proposal,fieldTexts,fieldErrors});const inputs=[...root.querySelectorAll('input[data-creation-key="levels"]')];inputs[0].value='坏数字';inputs[0].dispatchEvent(new win.Event('input'));inputs[1].value='仍待输入';inputs[1].dispatchEvent(new win.Event('input'));const firstRow=[...root.querySelectorAll('fieldset')].find(node=>node.querySelector(':scope > legend')?.textContent==='第 1 项');[...firstRow.children].find(node=>node.tagName==='BUTTON').click();assert.equal(proposal.matrix.changes[0].values.levels.length,1);assert.equal(root.querySelector('input[data-creation-key="levels"]').value,'仍待输入');assert.deepEqual(Object.keys(fieldErrors),['0:levels:["0","limit"]']);win.close();
});


test('destination selectors are editable before generation, pinned for a reviewed draft and restored by the actual cancel action',async t=>{
 const f=await fixture();t.after(()=>f.close());f.books.set('第二基点',[]);await f.mount();f.responses.push(reply(section(f.context,'T_CHAR_DOSSIER',{name:'目的地测试旅人'})));
 const target=()=>f.root.querySelector('[data-creation-book]'),newName=()=>f.root.querySelector('[data-creation-book-name]'),notice=()=>f.root.querySelector('[data-creation-destination-notice]');
 assert.equal(target().disabled,false);assert.equal(newName().disabled,false);target().value='第二基点';target().dispatchEvent(new f.win.Event('change'));assert.equal(f.view.exportDraft().creation.destination.book,'第二基点');const before=await f.database.read();
 await f.click('[data-creation-send]');assert(f.view.exportDraft().creation.draft);assert.equal(target().disabled,true);assert.equal(newName().disabled,true);assert.equal(notice().hidden,false);assert.match(notice().textContent,/已有草稿.*取消修改.*更换目标/);
 const cancel=[...f.root.querySelectorAll('footer button')].find(node=>node.textContent==='取消修改');assert(cancel);cancel.click();await f.view.settled();assert.equal(f.view.exportDraft().creation.draft,null);assert.equal(target().disabled,false);assert.equal(newName().disabled,false);assert.equal(notice().hidden,true);target().value='作者基点';target().dispatchEvent(new f.win.Event('change'));assert.equal(f.view.exportDraft().creation.destination.book,'作者基点');assert.deepEqual(await f.database.read(),before);assert.deepEqual(f.books.get('第二基点'),[]);
});
