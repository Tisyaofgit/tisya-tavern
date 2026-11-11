import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {displayFormatGroups,displayFormatMaterial} from '../engine/display-format.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {baseline} from '../engine/config.mjs';
import {Runtime} from '../engine/runtime.mjs';
const row=(findRegex,extra={})=>({findRegex,replaceString:'<html><script>PRIVATE_DISPLAY_SENTINEL()</script></html>',markdownOnly:true,placement:[2],...extra});
const rules=[row('<bgm>(.*?)<\\/bgm>'),row('/<日期>([\\s\\S]*?)<\\/日期>[\\s\\S]*?<时间>([\\s\\S]*?)<\\/时间>/')];
test('only eligible literal display groups enter lightweight model material',()=>{
 const candidates=[...rules,row('<bgm>(.*?)<\\/bgm>'),row('<disabled>(.*?)<\\/disabled>',{disabled:true}),row('<prompt>(.*?)<\\/prompt>',{promptOnly:true}),row('<user>(.*?)<\\/user>',{placement:[1]}),row('<deep>(.*?)<\\/deep>',{minDepth:1}),row('<plain>(.*?)<\\/plain>',{markdownOnly:false}),row('<choice>(.*?)<\\/choice>|<other>(.*?)<\\/other>'),row('<open>')];
 const before=structuredClone(candidates),groups=displayFormatGroups(candidates),text=displayFormatMaterial(candidates);
 assert.deepEqual(groups,[{tags:['<bgm>','</bgm>']},{tags:['<日期>','</日期>','<时间>','</时间>']}]);
 assert.match(text,/独立面板完整同组放在 extra/);assert.match(text,/正文内联组件保留在 body/);assert.doesNotMatch(text,/PRIVATE_DISPLAY_SENTINEL|<html>|<script>|disabled|prompt>|<user>|<deep>|<plain>|<choice>|<open>/);assert.deepEqual(candidates,before);assert.equal(displayFormatMaterial([]),'');
});
async function fixture(options={}){
 const disk=new Map(),macros=new Map(),ctx={chatId:'format-fixture',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,registerMacro:(k,f)=>macros.set(k,f)};let allowed=structuredClone(rules);
 const storage={get:async k=>structuredClone(disk.get(k)),set:async(k,v)=>disk.set(k,structuredClone(v)),commit:async(k,n,v)=>{if((disk.get(k)?.local_revision??0)!==n)return false;disk.set(k,structuredClone(v));return true;}};
 const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(s,k)=>macros.get(k)?.()??(k==='user'?'user':k==='char'?'char':s));
 const host=createMatrixHost({getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url))),storage,persistSettings:async()=>true,persistMetadata:async()=>true,getDisplayRules:()=>allowed,expand,...options});
 host.register();const e=new Runtime();e.registerTable('ACTOR',[{key:'name',type:'TEXT'}]);e.newRecord('ACTOR',{name:'测试角色'},'u');await host.import({state:e.data});
 const payload=()=>{const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));return {messages:source.prompts.filter(p=>!p.marker&&p.enabled!==false&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};};
 return {host,payload,ctx,setRules:next=>allowed=next};
}
test('real matrix before/payloadReady feeds one allowed format summary into the existing material slot',async()=>{
 const f=await fixture();await f.host.before('normal');const payload=f.payload();payload.messages.push({role:'system',content:'原格式：正文末输出 <bgm>当前bgm:歌名 - 歌手</bgm>，接着输出日期和时间。'});await f.host.payloadReady(payload);
 const text=payload.messages.map(m=>m.content).join('\n');assert.equal(text.split('[NATIVE.DISPLAY.FORMATS]').length-1,1);assert.match(text,/组1：<bgm> <\/bgm>/);assert.match(text,/组2：<日期> <\/日期> <时间> <\/时间>/);assert.match(text,/原格式：正文末输出/);assert.match(text,/完整同组标签连续放在 extra/);assert.doesNotMatch(text,/PRIVATE_DISPLAY_SENTINEL/);
 await f.host.event('GENERATION_ENDED');f.setRules([]);await f.host.before('normal');const next=f.payload();await f.host.payloadReady(next);assert(!next.messages.some(m=>m.content.includes('[NATIVE.DISPLAY.FORMATS]')));
});
test('changed display permission or format after preparation refuses stale request material',async()=>{
 const f=await fixture();await f.host.before('normal');const payload=f.payload();f.setRules([]);await assert.rejects(f.host.payloadReady(payload),{code:'DISPLAY_FORMAT_STALE'});
});

for(const mode of ['permission','chat'])test('final contractor await rejects '+mode+' changes before accepting the payload',async()=>{
 let enter,release;const entered=new Promise(r=>enter=r);const pending=new Promise(r=>release=r);
 const f=await fixture({getContractorMessages:async options=>{if(options?.prepare)return [];enter();await pending;return [];}});
 await f.host.before('normal');const run=f.host.payloadReady(f.payload());await entered;
 if(mode==='permission')f.setRules([]);else f.ctx.chatId='other-chat';release();
 await assert.rejects(run,{code:mode==='permission'?'DISPLAY_FORMAT_STALE':'PREPARATION_STALE'});assert.equal(f.host.accepted(),false);
});
test('display rule read failures preserve the actual error',async()=>{
 const error=new Error('fixture rule access failure');let broken=false;
 const f=await fixture({getDisplayRules:()=>{if(broken)throw error;return rules;}});await f.host.before('normal');broken=true;
 await assert.rejects(f.host.payloadReady(f.payload()),e=>e===error);assert.equal(f.host.accepted(),false);
});
test('native machine tags never enter display format summaries',()=>{
 assert.equal(displayFormatMaterial(['status','memory','next','think','UpdateVariable','JSONPatch','Analysis'].map(name=>row('<'+name+'>(.*?)</'+name+'>'))),'');
});

test('guarded delimiters preserve the same literal groups while wildcard tag names stay unknown',()=>{
 const guard=String.raw`(?:(?<!\x60)\x60(?!\x60))?`;
 assert.deepEqual(displayFormatGroups([row(guard+rules[0].findRegex+guard)]),[{tags:['<bgm>','</bgm>']}]);
 assert.deepEqual(displayFormatGroups([row('<scene.part>(.*?)</scene.part>')]),[]);
});
