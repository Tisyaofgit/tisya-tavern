import {formatProse,proseStyles} from '../prose.js';
import {compilePrompts} from '../engine/config.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {mountTurnReview} from '../engine/turn-review-ui.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {baseline} from '../engine/config.mjs';
const prefix='tisya-identity-archive10-browser-v4-',catalog=await(await fetch('./catalog.json')).json(),saved=JSON.parse(localStorage.getItem(prefix+'context')??'null');
const macros=new Map(),ctx={chatId:prefix+'chat',characterId:0,extensionSettings:saved?.extensionSettings??{},chatMetadata:saved?.chatMetadata??{},chat:saved?.chat??[],saveSettingsDebounced(){},registerMacro:(key,fn)=>macros.set(key,fn),saveChat:async()=>persist()};
function persist(){localStorage.setItem(prefix+'context',JSON.stringify({chat:ctx.chat,chatMetadata:ctx.chatMetadata,extensionSettings:ctx.extensionSettings}));return true;}
const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)}),persistSettings:async()=>persist(),persistMetadata:async()=>persist()});host.register();
if(!saved)await host.import({state:new Runtime(initializeState(catalog)).data});
const error=e=>{document.querySelector('#error').textContent=e.message;};
async function form(id,values,heading){const c=prepareMatrixSheets(await host.readDatabase(),{operationId:'browser-fixture',task:'main',mode:'revise'}),t=c.catalog.templates.find(t=>t.id===id);return '【'+(heading??t.label+'／1')+'】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');}
const reply=(cells,archive='')=>'<reply><body>1 旅人阿青抵达客舍，向守门人问路。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
async function display(){const {state:s}=await host.export();document.querySelector('#state').textContent='EVENT-RELATION · archive.10\n事件 '+Object.keys(s.tables.T_DYN_EVENTS).length+'；关系 '+Object.keys(s.tables.T_DYN_RELATIONS_PACTS).length+'；行为锚点 '+Object.keys(s.tables.T_CHAR_ANCHORS).length+'；地点 '+Object.keys(s.tables.T_STATIC_PLACES).length+'；主体 '+Object.keys(s.tables.T_SYS_ENTITIES).length+'；实时状态 '+Object.keys(s.tables.T_DYN_ENTITY_STATE).length+'；资源轴 '+Object.keys(s.tables.T_DYN_ENTITY_GAUGES).length+'\n'+Object.values(s.tables.T_DYN_EVENTS).map(r=>'事件 '+r.values.short_code+'：'+r.values.full_process+'；结果：'+(r.values.result??'未填写')).join('\n')+'\n'+Object.values(s.tables.T_DYN_RELATIONS_PACTS).map(r=>r.values.name+'：'+r.values.attitude_tag).join('\n')+'\n'+Object.values(s.tables.T_CHAR_ANCHORS).map(r=>'锚点：'+r.values.name+'；'+r.values.speech).join('\n');persist();}
host.subscribe(()=>display().catch(error));mountTurnReview(document,{service:host,onError:error});
document.querySelector('#generate').onclick=async()=>{try{if(ctx.chat.length)throw Error('已有合成记录');ctx.chat.push({mes:reply(await form('T_DYN_RELATIONS_PACTS',{subject_ref:'旅人',target_ref:'守门人',attitude_tag:'戒备'}),await form('T_DYN_EVENTS',{full_process:'旅人抵达客舍'})+'\n'+await form('T_CHAR_ANCHORS',{char_ref:'旅人',name:'遇事先观察',speech:'先等等'}))});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#patch').onclick=async()=>{try{ctx.chat.push({is_user:true,mes:'继续交谈'},{mes:reply(await form('T_DYN_RELATIONS_PACTS',{name:'变化后抽象名称',subject_ref:'旅人',target_ref:'守门人',attitude_tag:'信任',effective_from:'当晚'}),await form('T_DYN_EVENTS',{short_code:'01',result:'获准进门'})+'\n'+await form('T_CHAR_ANCHORS',{char_ref:'旅人',name:'遇事先观察',speech:'现在可以进去了'}))});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#reverse').onclick=async()=>{try{ctx.chat.push({mes:reply(await form('T_DYN_RELATIONS_PACTS',{subject_ref:'守门人',target_ref:'旅人',attitude_tag:'好奇'}),await form('T_DYN_EVENTS',{full_process:'另一段经过'}))});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#reload').onclick=()=>location.reload();await host.sync();await display();

document.querySelector('#objects').onclick=async()=>{try{ctx.chat.push({mes:reply(await form('T_STATIC_PLACES',{name:'北门',aliases:'North Gate',light:'明亮'})+'\n'+await form('T_DYN_ENTITY_STATE',{entity_id:'旅人',posture:'坐下'})+'\n'+await form('T_DYN_ENTITY_GAUGES',{name:'注意力',entity_id:'旅人',field_key:'focus',value:'8'}))});await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#aliases').onclick=async()=>{try{ctx.chat.push({mes:reply(await form('T_STATIC_PLACES',{name:'Ｎｏｒｔｈ  Ｇａｔｅ',light:'日光'})+'\n'+await form('T_DYN_ENTITY_STATE',{entity_id:'旅人',posture:'站起'})+'\n'+await form('T_DYN_ENTITY_GAUGES',{name:'专注程度',entity_id:'旅人',field_key:'focus',value:'9'}))});await host.sync();await display();}catch(e){error(e);}};
