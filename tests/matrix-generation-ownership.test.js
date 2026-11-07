import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createConfiguration,CONFIG_KEY,baseline} from '../engine/config.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {Window} from 'happy-dom';
import {mountMatrixConfiguration} from '../engine/ui.mjs';

test('generation overrides during acknowledged persistence restore both saved configuration and native values',async()=>{
 const ctx={extensionSettings:{},chatCompletionSettings:{max_context_unlocked:true,openai_max_context:2000000,temp_openai:.7}},snapshots=[];
 const store=createConfiguration({getContext:()=>ctx,persist:async()=>{snapshots.push(structuredClone(ctx.extensionSettings));ctx.chatCompletionSettings.max_context_unlocked=true;ctx.chatCompletionSettings.openai_max_context=2000000;return true;}});
 const next=store.read();next.generation={max_context_unlocked:false,openai_max_context:64000,temperature:.61};
 await assert.rejects(store.save(next),error=>error.code==='GENERATION_OVERRIDDEN'&&error.details.changes.length===2);
 assert.equal(snapshots.length,2);
 assert.equal(snapshots[1][CONFIG_KEY],undefined);
 assert.equal(store.read().revision,0);
 assert.deepEqual(ctx.chatCompletionSettings,{max_context_unlocked:true,openai_max_context:2000000,temp_openai:.7});
});

test('failed persistence of the rollback reports both errors instead of claiming recovery',async()=>{
 const ctx={extensionSettings:{},chatCompletionSettings:{temp_openai:.7}};let calls=0;
 const store=createConfiguration({getContext:()=>ctx,persist:async()=>{if(++calls===1){ctx.chatCompletionSettings.temp_openai=.9;return true;}throw Error('rollback disk unavailable');}});
 const next=store.read();next.generation={temperature:.2};
 await assert.rejects(store.save(next),error=>error.code==='CONFIG_ROLLBACK_FAILED'&&error.details.original.code==='GENERATION_OVERRIDDEN'&&error.details.rollback.message==='rollback disk unavailable');
 assert.equal(calls,2);
});

test('zero and false acknowledged generation values remain valid without a rollback save',async()=>{
 const ctx={extensionSettings:{},chatCompletionSettings:{}};let calls=0;
 const store=createConfiguration({getContext:()=>ctx,persist:async()=>{calls++;return true;}}),next=store.read();next.generation={temperature:0,seed:0,stream_openai:false};
 assert.deepEqual((await store.save(next)).generation,next.generation);assert.equal(calls,1);
});

async function fixture(){
 const disk=new Map(),macros=new Map(),ctx={extensionSettings:{},chatMetadata:{},chatId:'generation-guard',characterId:0,characters:[{name:'参数验证'}],chat:[{is_user:true,mes:'继续'}],chatCompletionSettings:{temp_openai:.7,openai_max_context:2000000},saveChat:async()=>true,registerMacro:(k,f)=>macros.set(k,f)};
 const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)};
 const expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(raw,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'参数验证':raw));
 const storage={get:async k=>structuredClone(disk.get(k)),set:async(k,v)=>disk.set(k,structuredClone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;disk.set(k,structuredClone(v));return true;}};
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url))),storage,persistSettings:async()=>true,persistMetadata:async()=>true,expand});host.register();await host.initialize();
 const config=host.config.read();config.generation={temperature:.6,openai_max_context:2000000};await host.config.save(config);
 const payload=()=>{const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));return {messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};};
 return {ctx,host,payload};
}
for(const key of ['temp_openai','openai_max_context'])test('generation drift before final send blocks untouched payload: '+key,async()=>{
 const f=await fixture();await f.host.before('normal');f.ctx.chatCompletionSettings[key]=key==='temp_openai'?.2:64000;const payload=f.payload(),before=structuredClone(payload);
 await assert.rejects(f.host.payloadReady(payload),error=>error.code==='GENERATION_OVERRIDDEN');assert.deepEqual(payload,before);assert.equal(f.host.accepted(),false);
});

test('generation text controls preserve multiline edits and saved values when reopened',async()=>{
 const window=new Window(),document=window.document,root=document.createElement('div');document.body.append(root);
 // happy-dom does not implement the browser Option constructor.
 window.Option=function(text,value){const option=document.createElement('option');option.textContent=text;option.value=value;return option;};
 const ctx={extensionSettings:{},chatCompletionSettings:{}},store=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const errors=[],service={config:store},tick=()=>new Promise(resolve=>setImmediate(resolve));
 async function open(){const view=mountMatrixConfiguration(document,root,{service,onError:e=>errors.push(e)});await view.ready;[...root.querySelectorAll('button')].find(b=>b.textContent==='生成设置').click();await tick();return view;}
 let view=await open();assert.deepEqual(errors,[]);assert.equal(root.querySelectorAll('label').length,46);
 const values={continue_postfix:'\n',new_chat_prompt:'第一行\n第二行',assistant_prefill:'先说\n再说'};
 for(const [key,value]of Object.entries(values)){const label=[...root.querySelectorAll('label')].find(l=>l.firstChild.textContent===key),control=label.querySelector('input,select,textarea');control.value=value;control.dispatchEvent(new window.Event('input',{bubbles:true}));}
 [...root.querySelectorAll('button')].find(b=>b.textContent==='保存生成设置').click();await tick();assert.deepEqual(errors,[]);
 for(const [key,value]of Object.entries(values))assert.equal(store.read().generation[key],value,key);
 view.dispose();view=await open();for(const [key,value]of Object.entries(values)){const label=[...root.querySelectorAll('label')].find(l=>l.firstChild.textContent===key);assert.equal(label.querySelector('textarea').value,value,key);}
 view.dispose();window.happyDOM.abort();
});
