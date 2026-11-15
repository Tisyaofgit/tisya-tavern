import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {mountTurnReview} from '../engine/turn-review-ui.mjs';
import {baseline} from '../engine/config.mjs';
const prefix='tisya-review-browser-v5-20261115-',catalog=await (await fetch('./catalog.json')).json();
const saved=JSON.parse(localStorage.getItem(prefix+'context')??'null'),macros=new Map();
const ctx={chatId:prefix+'chat',characterId:0,extensionSettings:saved?.extensionSettings??{},chatMetadata:saved?.chatMetadata??{},chat:saved?.chat??[],saveSettingsDebounced(){},registerMacro:(key,fn)=>macros.set(key,fn),saveChat:async()=>persist()};
const persist=()=>{localStorage.setItem(prefix+'context',JSON.stringify({chat:ctx.chat,chatMetadata:ctx.chatMetadata,extensionSettings:ctx.extensionSettings}));return true;};
const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},expand=s=>s.replace(/\{\{([^{}]+)\}\}/g,(raw,key)=>macros.get(key)?.()??raw);
const host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)}),persistSettings:async()=>persist(),persistMetadata:async()=>persist(),expand});
host.register();
if(!saved){const e=new Runtime(initializeState(catalog));e.registerTable('TEST_ACTOR',[{key:'name',label:'姓名',type:'TEXT'},{key:'hp',label:'体力',type:'NUMBER'}],'旅人状态');e.newRecord('TEST_ACTOR',{name:'旅人',hp:10},'test-actor-internal');await host.import({state:e.data});persist();}
const form=prepareMatrixSheets(await host.readDatabase(),{operationId:'fixture',task:'main'}).catalog.templates.find(t=>t.id==='T_DYN_EVENTS');
const archive='【'+form.label+'／1】\n'+['title','spine_digest'].map(k=>{const f=form.fields.find(f=>f.key===k);return f.row+' '+f.label+'：'+(k==='title'?'渡口交信':'信已交给船夫')+' | P1';}).join('\n');
const reply=cost=>'<reply><body>1 信已交给船夫。</body><cells>旅人.hp: -'+cost+' | P1</cells><archive format="form">'+archive+'</archive></reply>';
const error=e=>{document.querySelector('#error').textContent=e.message;};
async function display(){const b=await host.export();document.querySelector('#state').textContent='体力 '+b.state.tables.TEST_ACTOR['test-actor-internal'].values.hp+' · 已归档事件 '+Object.keys(b.state.tables.T_DYN_EVENTS).length;persist();}
host.subscribe(()=>display().catch(error));
mountTurnReview(document,{service:host,onError:error,onForms:()=>{document.querySelector('#error').textContent='正式入口打开现有完整表单编辑器；此隔离验收页只测试存档流程。';}});
document.querySelector('#generate').onclick=async()=>{try{if(ctx.chat.length)throw Error('本页已有测试回复，请使用重骰。');ctx.chat.push({is_user:true,mes:'我把信递给船夫。'},{mes:reply(3)});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#reroll').onclick=async()=>{try{if(!ctx.chat.length)throw Error('先生成测试回复');ctx.chat.at(-1).mes=reply(5);await host.event('MESSAGE_SWIPED',ctx.chat.length-1);await display();}catch(e){error(e);}};
document.querySelector('#reopen').onclick=()=>location.reload();
document.querySelector('#prompt').onclick=async()=>{try{await host.before('normal');const enabled=new Set(source.order.filter(p=>p.enabled).map(p=>p.identifier));const payload={messages:source.prompts.filter(p=>!p.marker&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}))};await host.payloadReady(payload);const text=JSON.stringify(payload.messages);document.querySelector('#audit').textContent='实际最终请求已组装：'+payload.messages.length+' 条消息；内部记录 ID '+(text.includes('test-actor-internal')?'泄漏':'未出现')+'；数据库表键 '+(text.includes('T_DYN_EVENTS#')?'泄漏':'未出现');host.clear();host.controller.generating.clear();}catch(e){error(e);}};
await host.sync();await display();
