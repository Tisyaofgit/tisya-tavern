import catalog from '../engine/catalog.json' with {type:'json'};
import {baseline} from '../engine/config.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {initializeState} from '../engine/materials.mjs';
import {createTableService} from '../tables/service.js';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {MAIN_PROPOSAL_TABLE_IDS} from '../engine/main-proposals.mjs';
const $=s=>document.querySelector(s),clone=structuredClone,fail=e=>$('#errors').textContent+=String(e.stack??e)+'\n';
window.addEventListener('error',e=>fail(e.error??e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('tisya-preferences-asides-20261115',1);q.onupgradeneeded=()=>q.result.createObjectStore('fixture');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
const data=await new Promise((resolve,reject)=>{const q=db.transaction('fixture').objectStore('fixture').get('data');q.onsuccess=()=>resolve(q.result??{disk:{},settings:{},metadata:{}});q.onerror=()=>reject(q.error);});
const persist=()=>new Promise((resolve,reject)=>{const tx=db.transaction('fixture','readwrite');tx.objectStore('fixture').put(clone(data),'data');tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});
const context={saveChat:persist,saveSettingsDebounced(){},registerMacro(){},chatId:'preferences-fixture',characterId:1,chat:[{mes:'合成开场',is_user:true}],characters:[{name:'合成世界'}],extensionSettings:data.settings,chatMetadata:data.metadata};
const host=createMatrixHost({getContext:()=>context,getSource:()=>baseline,loadCatalog:async()=>catalog,storage:{get:async id=>clone(data.disk[id]),set:async(id,v)=>{data.disk[id]=clone(v);await persist();},commit:async(id,revision,v)=>{if((data.disk[id]?.local_revision??0)!==revision)return false;data.disk[id]=clone(v);await persist();return true;}},persistMetadata:persist,persistSettings:persist});
host.register();await host.ensureDatabase();
function proposalForm(state,directive='保持克制，先观察再回应',recordId=null){
 const prepared=prepareMatrixSheets({state},{kind:'rows',task:'main',mode:'revise',operationId:'browser-p4',tableIds:MAIN_PROPOSAL_TABLE_IDS}),table=prepared.catalog.templates.find(t=>t.id==='T_PROP_PREFERENCES'),reference=recordId?prepared.references.find(r=>r.tableId==='T_PROP_PREFERENCES'&&r.recordId===recordId):null;
 const values={operation:'新增',name:'克制控场',preference_kind:'文字偏好',directive,owner_type:'user',scope_type:'story',strength:'喜爱',evidence_quote:'不要猴急'};
 return '【'+(reference?.display??table.label+'／1')+'】\n'+Object.entries(values).map(([key,value])=>{const field=table.fields.find(f=>f.key===key);return field.row+' '+field.label+'：'+value;}).join('\n');
}
const proposalReply=(state,directive,recordId=null)=>'<reply><task/><title>浏览器提案</title><body>1 他停下来观察对方，用户明确说不要猴急。</body><cells/><archive/><proposals format="form">'+proposalForm(state,directive,recordId)+'</proposals><actions/></reply>';
let proposalId=null,specialistCalls=0;
const tables=createTableService({store:{read:()=>({key:context.chatId,world:{}})},getContext:()=>context,books:{},conditionService:{},matrixDatabase:{read:()=>host.readDatabase(),commit:patch=>host.commitDatabase(patch)},matrixHost:host,request:async(task,text,{signal}={})=>{
 if(task!=='preferenceAnalysis'||!(signal instanceof AbortSignal))throw Error('P4 未复用偏好专项路由');specialistCalls++;const input=JSON.parse(text),snapshot=await host.readDatabase();proposalId??=input.source.recordId;if(input.source.recordId!==proposalId)throw Error('P4 提案身份不一致');
 return '<reply><task/><title>专项重绘</title><body>已按指令修正。</body><cells>'+proposalForm(snapshot.state,'先停顿半拍，再克制回应',proposalId)+'</cells><vars/><archive/><proposals/><actions/></reply>';
}});
let ui;async function mount(){ui?.dispose();ui=mountMatrixConfiguration(document,$('#app'),{service:{...host,reviewMainProposal:tables.reviewMainProposal,redrawMainProposal:tables.redrawMainProposal},onError:fail});await ui.ready;}
const version=(await(await fetch('../package.json',{cache:'no-store'})).json()).version;
const sha=async file=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(file,{cache:'no-store'})).arrayBuffer())),n=>n.toString(16).padStart(2,'0')).join('');
$('#build').textContent=`版本 ${version}\n生产偏好页 SHA256 ${await sha('../engine/preferences-ui.mjs')}\n隔离合成宿主 · 实际配置服务 / IndexedDB / 生产偏好 UI`;
const changes=[];document.addEventListener('change',e=>{const group=e.target.closest('[data-preference-group]');if(!group)return;const other=[...$('#app').querySelectorAll('[data-preference-group]')].find(n=>n!==group),before=other,top=$('.tisya-matrix-content').scrollTop,control=e.target;queueMicrotask(()=>changes.push({group:group.dataset.preferenceGroup,otherNodePreserved:before===document.querySelector('[data-preference-group="'+other.dataset.preferenceGroup+'"]'),controlPreserved:control.isConnected,scrollBefore:top,scrollAfter:$('.tisya-matrix-content').scrollTop}));},true);
$('#preferences').onclick=()=>{$('#app').hidden=false;$('#prose').hidden=true;$('h1').textContent='游玩偏好';};
$('#p4-seed').onclick=async()=>{try{
 context.chat.splice(0);await host.import({state:initializeState(catalog,{session_ref:context.chatId,branch_ref:'main'})});context.chat.push({is_user:true,mes:'继续'});await host.before('normal');context.chat.push({mes:proposalReply((await host.readDatabase()).state)});await host.event('GENERATION_ENDED');
 const saved=await host.readDatabase();proposalId=Object.keys(saved.state.tables.T_PROP_PREFERENCES)[0];if(!proposalId)throw Error('主回复未生成待确认提案');await mount();$('#report').textContent='P4 提案已生成；请填写修正指令并点击“打回，等待重绘”。';
}catch(error){fail(error);}};
$('#narrow').onclick=()=>$('#tisya-shell').style.width='360px';$('#wide').onclick=()=>$('#tisya-shell').style.width='709px';$('#reopen').onclick=()=>mount().catch(fail);
$('#inspect').onclick=async()=>{$('#report').textContent=JSON.stringify({version,choices:host.config.read().story.play?.choices??{},changes,newUserPreference:[...$('#app').querySelectorAll('button')].some(b=>/新建用户偏好|复制用户偏好/.test(b.textContent)),p4:{proposalId,specialistCalls,status:proposalId?(await host.readDatabase()).state.tables.T_PROP_PREFERENCES[proposalId]?.values.proposal_status:null,formalPreferences:Object.keys((await host.readDatabase()).state.tables.T_PREF_SCOPES??{}).length},shellWidth:$('#tisya-shell').getBoundingClientRect().width,overflow:$('#tisya-shell').scrollWidth>$('#tisya-shell').clientWidth,errors:$('#errors').textContent},null,2);};
await mount();
