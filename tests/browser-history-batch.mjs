import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {createFoundationService} from '../tables/foundation-service.js';
import {mountTablePanel} from '../tables/panel.js';
import {baseline} from '../engine/config.mjs';
const prefix='tisya-history-browser-v1-',catalog=await(await fetch('./catalog.json')).json(),saved=JSON.parse(localStorage.getItem(prefix+'context')??'null');
let calls=Number(localStorage.getItem(prefix+'calls')??0),held=null,panel;
const macros=new Map(),ctx={chatId:prefix+'chat',characterId:0,groupId:null,characters:[{avatar:'bridge.png',data:{name:'青石渡',description:'青石渡在东岸。'}}],extensionSettings:saved?.extensionSettings??{},chatMetadata:saved?.chatMetadata??{},chat:saved?.chat??Array.from({length:5},(_,i)=>[{is_user:true,mes:'看看第'+(i+1)+'座桥。'},{mes:'阿青经过第'+(i+1)+'座桥，说：「明早见。」'}]).flat(),saveSettingsDebounced(){},registerMacro:(k,f)=>macros.set(k,f),saveChat:async()=>persist()};
function persist(){localStorage.setItem(prefix+'context',JSON.stringify({chat:ctx.chat,chatMetadata:ctx.chatMetadata,extensionSettings:ctx.extensionSettings}));return true;}
const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)},host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage:indexedStorage({open:(name,version)=>indexedDB.open(prefix+name,version)}),persistSettings:async()=>persist(),persistMetadata:async()=>persist()});host.register();
if(!saved)await host.import({state:new Runtime(initializeState(catalog)).data});
const error=e=>{document.querySelector('#error').textContent=e.message;};
window.addEventListener('error',e=>error(e.error??e));window.addEventListener('unhandledrejection',e=>error(e.reason));
async function form(id,values){const c=prepareMatrixSheets(await host.readDatabase(),{operationId:'browser-fixture',task:'historyImport',mode:'revise'}),t=c.catalog.templates.find(t=>t.id===id);return '【'+t.label+'／1】\n'+Object.entries(values).map(([k,v])=>t.fields.find(f=>f.key===k).row+'：'+v).join('\n');}
const reply=cells=>'<reply><task/><anchor phase="before"/><title>渡口资料</title><body>1 来自合成原文。</body><anchor phase="after"/><extra/><cells>'+cells+'</cells><vars/><archive/><actions/></reply>';
const api=createFoundationService({run:fn=>fn(),database:{read:()=>host.readDatabase(),commit:i=>host.commitDatabase(i)},books:{cardBooks:async()=>['合成世界书'],listSources:async()=>({exists:true,entries:[{uid:1,name:'河流',content:'清河流经青石渡。',entry:{enabled:true}},{uid:2,name:'停用',content:'不要填写',entry:{enabled:false}}]})},getContext:()=>ctx,ensureDatabase:()=>host.ensureDatabase(),onCommitted:()=>display(),request:async(task,text)=>{
 calls++;localStorage.setItem(prefix+'calls',String(calls));await display();const input=JSON.parse(text),floors=input.sourceHistory?.filter(r=>r.role==='assistant').map(r=>r.floor)??[];
 document.querySelector('#model-input').textContent='模拟请求 '+calls+' · '+task+' · 原楼层 '+floors.join('、')+' · 世界书条目 '+(input.sourceBooks?.length??0);
 if(document.querySelector('#hold').checked){document.querySelector('#held').textContent='模拟模型等待中';await new Promise(resolve=>held=resolve);document.querySelector('#held').textContent='';}
 if(document.querySelector('#fail').checked){document.querySelector('#fail').checked=false;return '模拟坏回复，保留原答';}
 if(task==='templateInit')return reply(await form('T_STATIC_FACTS',{name:'清河流向',proposition:'清河流经青石渡。'}));
 if(input.goal.includes('阶段摘要'))return reply(await form('T_DYN_STAGE_SUMMARIES',{name:'渡口阶段 '+floors.join('—'),summary_text:'阿青经过桥，约定明早见。〔原楼层 '+floors.join('、')+'〕'}));
 return reply(await form('T_DYN_EVENTS',{title:'过桥 '+floors.join('—'),location_ref:'青石渡',exact_dialogues:'阿青：「明早见。」〔第'+floors[0]+'层 P1〕'}));
}}).matrixFoundation;
async function display(){const s=await host.readDatabase();document.querySelector('#state').textContent='模型请求 '+calls+' · 事件 '+Object.keys(s.state.tables.T_DYN_EVENTS).length+' · 地点 '+Object.keys(s.state.tables.T_STATIC_PLACES).length+' · 摘要 '+Object.keys(s.state.tables.T_DYN_STAGE_SUMMARIES).length+' · 事实 '+Object.keys(s.state.tables.T_STATIC_FACTS).length;persist();}
host.subscribe(()=>display().catch(error));
function mount(){panel?.dispose();panel=mountTablePanel(document,document.querySelector('#panel'),{service:{matrixFoundation:api,state:()=>({busy:false,jobs:[]}),openReviewWorkflow:()=>{document.querySelector('#advanced').textContent='高级逐层入口已触发';}},store:{read:()=>({key:'history-fixture',revision:0})},initialPage:'history',onSaved:()=>display()});return panel.ready;}
document.querySelector('#release').onclick=()=>{held?.();held=null;};document.querySelector('#reload').onclick=()=>location.reload();
await host.sync();await mount();await display();
