import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {mountTurnReview} from '../engine/turn-review-ui.mjs';
import {baseline} from '../engine/config.mjs';
const prefix='tisya-common-unit-browser-v2-',catalog=await(await fetch('./catalog.json')).json(),saved=JSON.parse(localStorage.getItem(prefix+'context')??'null');
const macros=new Map(),ctx={chatId:prefix+'chat',characterId:0,extensionSettings:saved?.extensionSettings??{},chatMetadata:saved?.chatMetadata??{},chat:saved?.chat??[],saveSettingsDebounced(){},registerMacro:(key,fn)=>macros.set(key,fn),saveChat:async()=>persist()};
function persist(){localStorage.setItem(prefix+'context',JSON.stringify({chat:ctx.chat,chatMetadata:ctx.chatMetadata,extensionSettings:ctx.extensionSettings}));return true;}
const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)}),persistSettings:async()=>persist(),persistMetadata:async()=>persist()});host.register();
if(!saved)await host.import({state:new Runtime(initializeState(catalog)).data});
const error=e=>{document.querySelector('#error').textContent=e.message;};
async function form(id,values,heading){const c=prepareMatrixSheets(await host.readDatabase(),{operationId:'browser-fixture',task:'main',mode:'revise'}),t=c.catalog.templates.find(t=>t.id===id);return '【'+(heading??t.label+'／1')+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');}
const reply=(cells,archive='')=>'<reply><body>1 旅人阿青抵达客舍，向守门人问路。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
async function display(){const {state:s}=await host.export();document.querySelector('#state').textContent='单位 '+Object.keys(s.tables.M_UNITS).length+'；定量 '+Object.keys(s.tables.M_QUANTITIES).length+'\n'+Object.values(s.tables.M_UNITS).map(r=>r.values.label+' · '+r.values.dimension+' · '+r.values.scope_world_id).join('\n')+'\n'+Object.values(s.tables.M_QUANTITIES).map(r=>String(r.values.value)+' '+(s.tables.M_UNITS[r.values.unit_ref]?.values.label??'无单位')).join('\n');persist();}
host.subscribe(()=>display().catch(error));mountTurnReview(document,{service:host,onError:error});
document.querySelector('#generate').onclick=async()=>{try{if(ctx.chat.length)throw Error('已有合成记录');const cells=await form('T_CHAR_DOSSIER',{name:'阿青',age_raw:'18岁'})+'\n'+await form('T_DYN_SCENE_SPACE',{name:'等待',turn_elapsed:'2小时'})+'\n'+await form('T_DYN_SCENE_PARTICIPANTS',{distance_to_target:'3米'});ctx.chat.push({mes:reply(cells)});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#custom').onclick=async()=>{try{ctx.chat.push({mes:reply(await form('T_DYN_SCENE_SPACE',{name:'吐纳',turn_elapsed:'3灵息'})+'\n'+await form('M_UNITS',{label:'灵息',dimension:'custom',custom_dimension:'吐纳计量',narrative:'一次吐纳为一灵息'}))});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#reload').onclick=()=>location.reload();await host.sync();await display();
