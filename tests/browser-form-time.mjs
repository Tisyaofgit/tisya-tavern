import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {mountTurnReview} from '../engine/turn-review-ui.mjs';
import {baseline} from '../engine/config.mjs';
import {REPLY_FORM_OWNERSHIP_VERSION} from '../engine/reply-form-ownership.mjs';
import build from '../package.json' with {type:'json'};
const prefix='tisya-form-time-ft1-',catalog=await(await fetch('./catalog.json')).json(),saved=JSON.parse(localStorage.getItem(prefix+'context')??'null');
const ctx={chatId:prefix+'chat',characterId:0,extensionSettings:saved?.extensionSettings??{},chatMetadata:saved?.chatMetadata??{},chat:saved?.chat??[],saveSettingsDebounced(){},registerMacro(){},saveChat:async()=>persist()};
function persist(){localStorage.setItem(prefix+'context',JSON.stringify({chat:ctx.chat,chatMetadata:ctx.chatMetadata,extensionSettings:ctx.extensionSettings}));return true;}
const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)}),persistSettings:async()=>persist(),persistMetadata:async()=>persist()});host.register();
if(!saved)await host.import({state:new Runtime(initializeState(catalog)).data});
const error=e=>{document.querySelector('#error').textContent=e.message;};window.addEventListener('error',e=>error(e.error??e));window.addEventListener('unhandledrejection',e=>error(e.reason));
async function form(id,values){const c=prepareMatrixSheets(await host.readDatabase(),{operationId:'browser-time',task:'main',mode:'revise'}),t=c.catalog.templates.find(t=>t.id===id);return '【'+t.label+'／1】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v+' | P1').join('\n');}
const reply=(cells,archive)=>'<reply><body>1 旅人当晚在客舍灯下被灼伤，次日清晨仍有余痛。</body><cells format="form">'+cells+'</cells><archive format="form">'+archive+'</archive></reply>';
async function display(){
 const {state:s}=await host.export(),reviews=await host.listTurnReviews(),times=Object.values(s.tables.M_WORLD_TIME).map(r=>r.values),conditions=Object.values(s.tables.T_DYN_CONDITIONS).map(r=>r.values),events=Object.values(s.tables.T_DYN_EVENTS).map(r=>r.values);
 document.querySelector('#version').textContent='FT-1 · '+build.version+' · '+REPLY_FORM_OWNERSHIP_VERSION;
 document.querySelector('#state').textContent='伤病 '+conditions.length+'；事件 '+events.length+'；时间 '+times.length+'\n'+times.map(v=>v.owner_field+'：'+v.original_text+' · '+v.precision).join('\n')+'\n'+reviews.reviews.map(r=>'第'+(r.index+1)+'层 '+r.status).join('\n');
 document.querySelector('#raw').textContent=ctx.chat[0]?.mes??'尚无合成回复';persist();
}
host.subscribe(()=>display().catch(error));mountTurnReview(document,{service:host,onError:error});
document.querySelector('#generate').onclick=async()=>{try{
 if(ctx.chat.length)throw Error('已有隔离测试记录');document.querySelector('#error').textContent='';
 const cells=await form('T_STATIC_PLACES',{name:'客舍门厅',macro_region:'山城'})+'\n'+await form('T_DYN_CONDITIONS',{name:'灯灼',time_basis:'故事时刻',start_time:'当晚',due_time:'次日清晨'}),archive=await form('T_DYN_EVENTS',{title:'灯下受伤',story_time:'当晚',spine_digest:'旅人被灯火灼伤'});
 ctx.chat.push({mes:reply(cells,archive)});await host.sync();await display();
 }catch(e){error(e);}};
document.querySelector('#reroll').onclick=async()=>{try{document.querySelector('#error').textContent='';if(!ctx.chat.length)throw Error('请先生成测试回复');ctx.chat[0].mes=ctx.chat[0].mes.replaceAll('当晚','昨晚');await host.sync();await display();}catch(e){error(e);}};
document.querySelector('#reload').onclick=()=>location.reload();await host.sync();await display();
