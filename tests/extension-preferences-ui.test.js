import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountExtensionPreferences} from '../extension-preferences-ui.mjs';
import {builtinExtensionDefinitions,builtinPresentationDefinitions,EXTENSION_PREFERENCE_TABLE} from '../extension-preferences.mjs';
const tick=()=>new Promise(r=>setTimeout(r,10));
function fixture(){
 const win=new Window(),root=win.document.createElement('main');win.document.body.append(root);let revision=0,writes=[],scope={ownerId:'a',worldId:'w',outputConfigId:null};
 const database={read:async()=>({contextKey:'chat',revision,state:{tables:{[EXTENSION_PREFERENCE_TABLE]:{}}}}),commit:async input=>{assert.equal(input.expectedRevision,revision);writes.push(input);revision++;return {revision,state:{tables:{}}};}},books={definitions:async kind=>(kind==='extensions'?builtinExtensionDefinitions():builtinPresentationDefinitions()).map((definition,i)=>({definition,source:{book:kind,uid:String(i),digest:'a'.repeat(64)}}))};
 const ui=mountExtensionPreferences(win.document,root,{database,books,getScope:()=>scope});return {win,root,ui,database,writes,setScope(v){scope=v;}};
}
test('actual preference UI persists audience, topics and explicit zero in one database commit',async()=>{
 const f=fixture();await f.ui.ready;const q=s=>f.root.querySelector(s);q('[data-extension-enabled]').checked=true;q('[data-extension-enabled]').dispatchEvent(new f.win.Event('input'));q('[data-extension-count]').value='0';q('[data-extension-limit]').value='0';q('[data-extension-audience]').value='higher_dimensional';q('[data-extension-topics]').value='磕CP同人';q('[data-extension-kind="forum"]').checked=true;
 [...f.root.querySelectorAll('button')].find(b=>b.textContent==='保存').click();await tick();assert.equal(f.writes.length,1);const v=f.writes[0].changes[0].values;assert.equal(v.generate_count,0);assert.equal(v.display_limit,0);assert.equal(v.audience_kind,'higher_dimensional');assert.deepEqual(v.topic_preferences,[{topic:'磕CP同人',mode:'prefer',weight:1}]);assert.equal(v.style_book,null);f.ui.dispose();f.win.happyDOM.abort();
});
test('world or role selection change rejects an old form instead of saving to the new scope',async()=>{
 const f=fixture();await f.ui.ready;const changed=f.root.querySelector('[data-extension-enabled]');changed.checked=true;changed.dispatchEvent(new f.win.Event('input'));f.setScope({ownerId:'other',worldId:'w',outputConfigId:null});[...f.root.querySelectorAll('button')].find(b=>b.textContent==='保存').click();await tick();assert.equal(f.writes.length,0);assert.match(f.root.textContent,/已变化/);f.ui.dispose();f.win.happyDOM.abort();
});
test('confirmed preference commit survives refresh failure without becoming an unsaved repeat transaction',async()=>{
 const f=fixture();await f.ui.ready;const enabled=f.root.querySelector('[data-extension-enabled]');enabled.checked=true;enabled.dispatchEvent(new f.win.Event('input'));const originalRead=f.database.read,originalCommit=f.database.commit;f.database.commit=async input=>{const result=await originalCommit(input);f.database.read=async()=>{throw Error('读取服务暂时中断');};return result;};
 assert.equal(await f.ui.saveDraft(),false);assert.equal(f.writes.length,1);assert.equal(f.ui.state().dirty,false);assert.equal(f.ui.state().reviewRequired,true);assert.equal(f.ui.state().receipt.confirmed,true);assert.equal(f.ui.state().receipt.operationId,f.writes[0].operationId);assert.match(f.root.textContent,/已保存.*重新读取失败.*读取服务暂时中断/);assert.equal(await f.ui.saveDraft(),false);assert.equal(f.writes.length,1);
 f.database.read=originalRead;[...f.root.querySelectorAll('button')].find(b=>b.textContent==='读取当前人物与世界配置').click();await f.ui.settled();assert.equal(f.ui.state().reviewRequired,false);assert.equal(f.ui.state().dirty,false);assert.equal(f.writes.length,1);f.ui.dispose();await f.win.happyDOM.abort();
});
