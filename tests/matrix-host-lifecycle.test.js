import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {finishMatrixGeneration} from '../engine/lifecycle.mjs';
import {baseline} from '../engine/config.mjs';
import {NS} from '../engine/controller.mjs';
const clone=structuredClone;
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const reply=(cost=3)=>`<reply><body>1 推门受伤。</body><cells>阿青.hp: -${cost} | P1</cells><archive/></reply>`;
async function fixture(){
 const disk=new Map(),macros=new Map();const ctx={chatId:'host-life',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){},registerMacro:(k,f)=>macros.set(k,f)};
 const storage={get:async k=>clone(disk.get(k)),set:async(k,v)=>disk.set(k,clone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;disk.set(k,clone(v));return true;}};
 const source={prompts:clone(baseline.prompts),order:clone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));
 const options={getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand};
 const host=createMatrixHost(options);host.register();const e=new Runtime();e.registerTable('ACTOR',[{key:'name',type:'TEXT'},{key:'hp',type:'NUMBER'}]);e.newRecord('ACTOR',{name:'阿青',hp:10},'u');await host.import({state:e.data});
 async function start(type='normal'){await host.before(type);const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));host.payloadReady({messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))});}
 return {host,ctx,options,start,hp:async()=>(await host.export()).state.tables.ACTOR.u.values.hp};
}
for(const accept of [true,false])test(`delayed communication cannot change an already ${accept?'adopted':'rejected'} reroll`,async()=>{
 const f=await fixture();f.ctx.chat.push({mes:reply()});await f.host.sync();const original=clone(f.ctx.chat[0]);await f.start('swipe');f.ctx.chat[0].mes=reply(4);
 let release;const pending=new Promise(r=>release=r);let delegated=false;
 const finishing=finishMatrixGeneration({host:f.host,revision:{ended:mode=>{assert.equal(mode,'matrix');delegated=true;return true;},stopped(){assert.fail('not stopped');}},communication:{ended(){},finishNative:()=>pending},onError:e=>{throw e;}});
 assert(delegated);assert(f.ctx.chat[0].extra[NS].pending_sha256);assert.equal(await f.hp(),7);
 if(accept)await f.host.acceptCandidate();else{Object.assign(f.ctx.chat[0],original);await f.host.sync();}
 assert.equal(await f.hp(),accept?6:7);release();await finishing;await new createMatrixHost(f.options).sync();assert.equal(await f.hp(),accept?6:7);assert.equal(f.ctx.chat[0].extra[NS].pending_sha256,undefined);
});
test('manual edit after a new user input saves once and survives replay and cold reopen',async()=>{
 const f=await fixture();f.ctx.chat.push({mes:reply()});await f.host.sync();f.ctx.chat.push({is_user:true,mes:'调整为20'});
 await f.host.mutate(e=>e.set('阿青.hp',20));assert.equal(await f.hp(),20);
 f.ctx.chat[0].mes=reply(4);await f.host.event('MESSAGE_EDITED',0);assert.equal(await f.hp(),20);await new createMatrixHost(f.options).sync();assert.equal(await f.hp(),20);
});
