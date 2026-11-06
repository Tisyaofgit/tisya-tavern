import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Controller, chatKey, NS} from '../engine/controller.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {reconcile} from '../engine/journal.mjs';
import {initializeState, materials} from '../engine/materials.mjs';

const reply=(cost=3)=>`<reply><body>1 推门受伤。</body><cells>阿青.hp: -${cost} | P1</cells><archive/></reply>`;
async function fixture(){
 const disk=new Map(),ctx={chatId:'lifecycle',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveMetadata:async()=>{},saveChat:async()=>{},saveSettingsDebounced(){},setExtensionPrompt(){}};
 const storage={get:async k=>structuredClone(disk.get(k)),set:async(k,v)=>disk.set(k,structuredClone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;disk.set(k,structuredClone(v));return true;}};
 const options={getContext:()=>ctx,storage,request:async(_,{bundle,messages,scope})=>reconcile(bundle,messages,scope)};
 const controller=new Controller(options),e=new Runtime();e.registerTable('ACTOR',[{key:'name',type:'TEXT'},{key:'hp',type:'NUMBER'}]);e.newRecord('ACTOR',{name:'阿青',hp:10},'u');await controller.attach({state:e.data});
 return {ctx,controller,options,hp:async()=>(await controller.current()).state.tables.ACTOR.u.values.hp};
}
test('stopped complete response remains uncommitted after a late end and cold reopen',async()=>{
 const f=await fixture();f.controller.generating.set(chatKey(f.ctx),true);f.ctx.chat.push({mes:reply()});await f.controller.event('GENERATION_STOPPED');await f.controller.event('GENERATION_ENDED');
 assert.equal(await f.hp(),10);const reopened=new Controller(f.options);await reopened.run();assert.equal(await f.hp(),10);
});
test('editing a stopped draft does not silently accept its commands',async()=>{
 const f=await fixture();f.controller.generating.set(chatKey(f.ctx),true);f.ctx.chat.push({mes:reply()});await f.controller.event('GENERATION_STOPPED');f.ctx.chat[0].mes=reply(4);await f.controller.event('MESSAGE_EDITED',0);assert.equal(await f.hp(),10);
});
test('reroll preparation reads its prior state without rolling back the accepted saved candidate',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:reply()});await f.controller.run();assert.equal(await f.hp(),7);
 const preview=await f.controller.run({omitLastAssistant:true,preview:true});assert.equal(preview.bundle.state.tables.ACTOR.u.values.hp,10);assert.equal(await f.hp(),7);
});
test('message arrival during generation cannot settle an unaccepted complete draft',async()=>{
 const f=await fixture();f.controller.generating.set(chatKey(f.ctx),true);f.ctx.chat.push({mes:reply()});await f.controller.event('MESSAGE_RECEIVED',0);assert.equal(await f.hp(),10);
});
test('a stopped swipe retains pending status in its native candidate metadata',async()=>{
 const f=await fixture();f.controller.generating.set(chatKey(f.ctx),true);const m={mes:reply(),swipe_id:0,swipes:[reply()],extra:{},swipe_info:[{extra:{}}]};f.ctx.chat.push(m);await f.controller.event('GENERATION_STOPPED');
 assert(m.swipe_info[0].extra[NS]?.pending_sha256);m.extra=structuredClone(m.swipe_info[0].extra);await new Controller(f.options).run();assert.equal(await f.hp(),10);
 await f.controller.event('MESSAGE_SWIPED',0);assert.equal(await f.hp(),7);assert.equal(m.swipe_info[0].extra[NS]?.pending_sha256,undefined);
});
test('event and delayed archive share one short code while complementary detail survives',()=>{
 const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url))),e=new Runtime(initializeState(catalog));
 e.newRecord('T_DYN_EVENTS',{short_code:'e01',title:'门开了',spine_digest:'钥匙转动->门开了'},'event1');
 e.data.runtime.archive=[{rows:[{category:'事件',raw:'事件|e01[傍晚]：钥匙转动->门开了'},{category:'事件',raw:'事件|e01[傍晚]：门后还有一封信'}]}];
 const memory=materials(e).tisya_material_memory_archive;assert.equal(memory.split('e01').length-1,1);assert.match(memory,/门后还有一封信/);
});
