import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMatrixHost} from '../engine/host.mjs';
import {baseline} from '../engine/config.mjs';
const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
async function fixture(){
 const disk=new Map(),macros=new Map(),card={avatar:'mvu.png',name:'变量卡',data:{extensions:{tavern_helper:{scripts:[{type:'script',enabled:true,id:'mvu',content:"import 'https://example.test/MagVarUpdate@master/bundle.js'"}]}},character_book:{entries:[{enabled:true,comment:'格式',content:'<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>'}]}}};
 const ctx={chatId:'matrix-mvu',characterId:0,characters:[card],extensionSettings:{},chatMetadata:{},chat:[{mes:'开场'},{mes:'继续',is_user:true}],saveChat:async()=>true,registerMacro:(k,f)=>macros.set(k,f)};
 const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(raw,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'变量卡':raw));
 const storage={get:async k=>structuredClone(disk.get(k)),set:async(k,v)=>disk.set(k,structuredClone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;disk.set(k,structuredClone(v));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand});host.register();await host.initialize();
 const state={count:0,enabled:false,text:''};const runtime={getMvuData:({message_id})=>message_id===0?{stat_data:state}:{},parseMessage(){assert.fail('adapter must never write native variables');}};
 const payload=()=>{const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));return {messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};};
 return {host,ctx,card,state,runtime,payload};
}
for(const change of ['state','disabled','format','new declaration'])test('matrix rejects native MVU drift before final send: '+change,async()=>{
 const previous=globalThis.Mvu,f=await fixture();globalThis.Mvu=f.runtime;
 try{
  const script=f.card.data.extensions.tavern_helper.scripts[0];if(change==='new declaration')script.enabled=false;
  await f.host.before('normal');const p=f.payload(),before=structuredClone(p);
  if(change==='state')f.state.count=1;
  if(change==='disabled')script.enabled=false;
  if(change==='format')f.card.data.character_book.entries[0].content+='\nSOURCE_CHANGED';
  if(change==='new declaration')script.enabled=true;
  await assert.rejects(async()=>await f.host.payloadReady(p),e=>e.code==='NATIVE_MVU_STALE');assert.deepEqual(p,before);assert.equal(f.host.accepted(),false);
 }finally{if(previous===undefined)delete globalThis.Mvu;else globalThis.Mvu=previous;}
});
test('matrix preserves native zero, false and empty values without executing updates',async()=>{
 const previous=globalThis.Mvu,f=await fixture();globalThis.Mvu=f.runtime;
 try{await f.host.before('normal');const p=f.payload();await f.host.payloadReady(p);const text=p.messages.map(m=>m.content).join('\n');assert.match(text,/"count":0,"enabled":false,"text":""/);assert.match(text,/<UpdateVariable><JSONPatch>/);assert.equal(f.host.accepted(),true);assert.deepEqual(f.state,{count:0,enabled:false,text:''});}
 finally{if(previous===undefined)delete globalThis.Mvu;else globalThis.Mvu=previous;}
});
