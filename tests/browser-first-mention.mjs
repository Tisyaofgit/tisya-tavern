import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {mountTurnReview} from '../engine/turn-review-ui.mjs';
import {baseline} from '../engine/config.mjs';
const prefix='tisya-first-mention-browser-v1-',catalog=await(await fetch('./catalog.json')).json(),saved=JSON.parse(localStorage.getItem(prefix+'context')??'null');
const macros=new Map(),ctx={chatId:prefix+'chat',characterId:0,extensionSettings:saved?.extensionSettings??{},chatMetadata:saved?.chatMetadata??{},chat:saved?.chat??[],saveSettingsDebounced(){},registerMacro:(key,fn)=>macros.set(key,fn),saveChat:async()=>persist()};
function persist(){localStorage.setItem(prefix+'context',JSON.stringify({chat:ctx.chat,chatMetadata:ctx.chatMetadata,extensionSettings:ctx.extensionSettings}));return true;}
const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)}),persistSettings:async()=>persist(),persistMetadata:async()=>persist()});host.register();
if(!saved)await host.import({state:new Runtime(initializeState(catalog)).data});
const error=e=>{document.querySelector('#error').textContent=e.message;};
async function form(id,values,heading){const c=prepareMatrixSheets(await host.readDatabase(),{operationId:'browser-fixture',task:'main',mode:'revise'}),t=c.catalog.templates.find(t=>t.id===id);return '【'+(heading??t.label+'／1')+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');}
const reply=(cells,archive='')=>'<reply><body>1 旅人阿青抵达客舍，向守门人问路。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
async function display(){const {state:s}=await host.export();document.querySelector('#state').textContent='地点 '+Object.keys(s.tables.T_STATIC_PLACES).length+'；人物/对象 '+Object.keys(s.tables.T_SYS_ENTITIES).length+'；事件 '+Object.keys(s.tables.T_DYN_EVENTS).length+'\n'+Object.values(s.tables.T_STATIC_PLACES).map(r=>'地点：'+r.values.name+'；光照：'+(r.values.light??'未知')).join('\n')+'\n场景：'+Object.values(s.tables.T_DYN_SCENE_SPACE).map(r=>r.values.name).join('；');persist();}
host.subscribe(()=>display().catch(error));mountTurnReview(document,{service:host,onError:error});
document.querySelector('#generate').onclick=async()=>{try{if(ctx.chat.length)throw Error('已有合成记录，请使用补充或重骰');const cells=await form('T_DYN_SCENE_SPACE',{name:'抵达客舍',place_ref:'青石镇客舍'})+'\n'+await form('T_STATIC_ORGANIZATIONS',{name:'渡口行会',leader_ref:'守门人',headquarters_ref:'青石镇客舍'});ctx.chat.push({mes:reply(cells,await form('T_DYN_EVENTS',{title:'抵达客舍',location_ref:'青石镇客舍'}))});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#patch').onclick=async()=>{try{ctx.chat.push({mes:reply(await form('T_STATIC_PLACES',{light:'窗边自然光'},'地点底档／青石镇客舍'))});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#reroll').onclick=async()=>{try{ctx.chat.at(-1).mes=reply(await form('T_DYN_SCENE_SPACE',{name:'改走码头',place_ref:'码头'}));await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#reload').onclick=()=>location.reload();await host.sync();await display();
