import {PANEL_CSS} from '../config/panel-style.js';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {createConditionService} from '../tables/condition-service.js';
import {createWorldFrameworkService} from '../engine/world-framework.mjs';
import {createWorldbookConditionGate} from '../worldbook-conditions.js';
import {mountTablePanel} from '../tables/panel.js';
const prefix='tisya-world-framework-20261115-v1-',catalog=await(await fetch('./catalog.json')).json(),saved=JSON.parse(localStorage.getItem(prefix+'context')??'null');
const ctx={chatId:prefix+'chat',characterId:0,extensionSettings:saved?.extensionSettings??{},chatMetadata:saved?.chatMetadata??{},chat:saved?.chat??[],saveChat:async()=>persist()};
function persist(){localStorage.setItem(prefix+'context',JSON.stringify({chat:ctx.chat,chatMetadata:ctx.chatMetadata,extensionSettings:ctx.extensionSettings}));return true;}
const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)}),persistSettings:async()=>persist(),persistMetadata:async()=>persist()});
if(!saved){const e=new Runtime(initializeState(catalog,{world_ref:'world'}));e.newRecord('T_STATIC_WORLDS',{name:'临海',calendar_id:'cal',core_proposition:'潮汐之城的商旅'},'world');e.newRecord('M_CALENDAR_RULES',{world_ref:'world',mode:'FIXED',year_numbering:'astronomical',months_per_year:10,days_per_month:30,hours_per_day:24,minutes_per_hour:60,narrative:'潮汐历按港口公约通用。',value_state:'known'},'cal');e.newRecord('T_STATIC_PLACES',{name:'临海城'},'city');e.newRecord('T_STATIC_ITEMS_SKILLS',{name:'青钱',category:'货币'},'coin');e.newRecord('M_UNITS',{scope_world_id:'world',label:'枚',dimension:'currency'},'coin-unit');e.newRecord('T_DYN_CURRENCY_BALANCES',{currency_ref:'coin',balance:7},'wallet');await host.import({state:e.data});persist();}
await host.ensureDatabase();const condition=createConditionService({database:host.createConditionDatabaseBridge(),getContext:()=>ctx}),framework=createWorldFrameworkService({read:host.readDatabase,commit:host.commitDatabase});
const service={...condition,...framework,matrixFoundation:{},state:()=>({jobs:[]}),reportError:()=>{}},store={read:()=>({key:prefix,revision:0})};
const surface=document.querySelector('#app').attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=PANEL_CSS;surface.append(style);
const panel=mountTablePanel(document,surface,{service,store,initialPage:'framework'});await panel.ready;
const error=e=>document.querySelector('#error').textContent=e.message;
async function state(){const db=await host.readDatabase(),text=Object.values(materials(new Runtime(db.state))).join('\n');document.querySelector('#state').textContent='当前版本 WF-4 · 每年 '+db.state.tables.M_CALENDAR_RULES.cal.values.months_per_year+' 个月 · 钱包 '+db.state.tables.T_DYN_CURRENCY_BALANCES.wallet.values.balance+' 青钱 · 公共历法说明出现 '+(text.match(/潮汐历按港口公约通用。/g)??[]).length+' 次';}
document.querySelector('#scan').onclick=async()=>{try{const rules=(await condition.describeConditionRules()).filter(r=>r.valid);if(!rules.length)throw Error('请先在条件页保存一条条件');const rule=rules.at(-1),entry={world:'验收世界书',uid:1,content:'此段只在条件命中时注入',disable:false,extensions:{tisyaWorldbook:{condition:{mode:'external',provider:rule.provider,ruleRef:rule.id,ruleVersion:rule.revision}}}},input={globalLore:[entry,{...structuredClone(entry),uid:2,content:'同一条件的第二条资料'}],characterLore:[],chatLore:[],personaLore:[]},gate=createWorldbookConditionGate({getContext:()=>ctx,engine:condition});gate.begin();await gate.entriesLoaded(input);await gate.scanDone({activated:{entries:new Map()}});await gate.assertReady();document.querySelector('#result').textContent='条件「'+rule.name+'」：'+input.globalLore.length+' / 2 条资料可注入；共用 '+rules.length+' 条条件定义';await state();}catch(e){error(e);}};
document.querySelector('#refresh').onclick=()=>location.reload();host.subscribe(()=>state().catch(error));await state();
