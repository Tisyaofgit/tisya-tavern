import catalog from '../engine/catalog.json' with {type:'json'};
import seed from '../phone-seed.json' with {type:'json'};
import {createMatrixHost} from '../engine/host.mjs';
import {chatKey} from '../engine/controller.mjs';
import {createPhoneService} from '../phone-core.mjs';
import {createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {revealPhoneOrigin} from '../phone-origin-navigation.mjs';
import {baseline,compilePrompts,applyCompiledMessages} from '../engine/config.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';

const $=s=>document.querySelector(s),key='tisya-rp-depth-browser-v1',clone=structuredClone;
const fail=e=>$('#errors').textContent+=String(e.stack??e)+'\n';
window.addEventListener('error',e=>fail(e.error??e.message));window.addEventListener('unhandledrejection',e=>fail(e.reason));
try{
 const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(key,1);q.onupgradeneeded=()=>q.result.createObjectStore('fixture');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
 const saved=await new Promise((resolve,reject)=>{const q=db.transaction('fixture').objectStore('fixture').get('data');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}),data=saved??{disk:{},chats:{},settings:{}},chat=[];
 let live,ui,writes=0,jumps=0;
 const persist=()=>{const tx=db.transaction('fixture','readwrite');tx.objectStore('fixture').put(clone(data),'data');tx.onerror=()=>fail(tx.error);};
 const context=()=>({...live,chat,extensionSettings:data.settings,saveChat:async()=>{data.chats[live.chatId].messages=clone(chat);persist();return true;}});
 function load(id){data.chats[id]??={metadata:{integrity:'synthetic-'+id},messages:[{mes:'合成开场 '+id,is_user:false}]};const row=data.chats[id];live={chatId:id,characterId:1,chatMetadata:row.metadata};chat.splice(0,chat.length,...clone(row.messages));}
 load('A');
 const host=createMatrixHost({getContext:context,getSource:()=>baseline,loadCatalog:async()=>catalog,storage:{get:async id=>clone(data.disk[id]),set:async(id,v)=>{data.disk[id]=clone(v);writes++;persist();},commit:async(id,revision,v)=>{if((data.disk[id]?.local_revision??0)!==revision)return false;data.disk[id]=clone(v);writes++;persist();return true;}},persistMetadata:async()=>{persist();return true;},persistSettings:async()=>{persist();return true;}});
 const source=await(await fetch('../index.js',{cache:'no-store'})).text(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),n=>n.toString(16).padStart(2,'0')).join('');
 const version=(await(await fetch('../package.json',{cache:'no-store'})).json()).version;
 const uiSource=await(await fetch('../engine/preferences-ui.mjs',{cache:'no-store'})).text(),uiHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(uiSource))),n=>n.toString(16).padStart(2,'0')).join('');
 $('#build').textContent=`生产版本 ${version}\nindex.js SHA-256 ${hash}\npreferences-ui.mjs SHA-256 ${uiHash}\n隔离合成宿主；生产设置界面、手机入口和数据库服务。`;
 const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start))).replaceAll('import.meta.url',JSON.stringify(new URL('../index.js',location.href).href));
 const deps={context,phoneChatKey:chatKey,matrixDatabase:{peek:()=>host.peekDatabase()},nativeGenerationOpen:false,isGenerating:()=>false,revisionController:{active:()=>false},fetch:async()=>({ok:true,json:async()=>seed}),ensureMatrixDatabase:()=>host.ensureDatabase(),createPhoneDatabaseStorage,matrixHost:host,createPhoneService,window,CustomEvent,appearance:null,pet:null};
 const getPhoneService=Function(...Object.keys(deps),extract('const phoneServices=new Map();','\nconst phoneTurn=')+'\nreturn getPhoneService;')(...Object.values(deps));
 async function mount(){ui?.dispose();ui=mountMatrixConfiguration(document,$('#app'),{service:{config:host.config}});await ui.ready;$('#status').textContent='当前聊天 '+live.chatId;}
 const native={isBoundedChatSurfaceView:()=>true,jumpBoundedChatSurfaceToMessage:async index=>{jumps++;const node=document.createElement('div');node.className='mes';node.setAttribute('mesid',index);node.textContent='已载入第 '+(index+1)+' 楼：'+chat[index].mes;$('#chat').prepend(node);$('#status').textContent='原生定位适配入口已调用；目标第 '+(index+1)+' 楼；调用次数 '+jumps;}};
 const uiDeps={context,phoneChatKey:chatKey,mayLeaveUtility:async()=>true,getPhoneService,initializeLifeForCurrentSelection:async()=>{},close:()=>{},closeNativeDrawers:()=>{},hideAllPanels:()=>{},document,renderEpoch:0,page:(title,html)=>{$('#phone-page').innerHTML='<h2>'+title+'</h2>'+html;},esc:t=>String(t).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),query:$,openIdentity:async()=>{},hidePage:()=>$('#phone-page').replaceChildren(),error:fail,revealPhoneOrigin,hostNative:native,utility:null};
 const open=Function(...Object.keys(uiDeps),extract('async function openVirtualPhone(','\nasync function openWorldSeed(')+'\nreturn openVirtualPhone;')(...Object.values(uiDeps));
 const bind=(id,fn)=>$(id).onclick=()=>Promise.resolve().then(fn).catch(fail);
 for(const id of ['A','B'])bind('#chat-'+id.toLowerCase(),async()=>{await context().saveChat();load(id);await host.ensureDatabase();await mount();});
 bind('#reopen',mount);bind('#narrow',()=>$('#tisya-shell').style.width='360px');
 bind('#inspect',()=>{const c=host.config.read(),compiled=compilePrompts(baseline,c,{}),expand=s=>s.replace(/\{\{tisya_[\w]+\}\}/g,'').replaceAll('{{char}}','合成人物').replaceAll('{{user}}',c.story.userName||'合成主控'),enabled=new Set(baseline.prompt_order.find(g=>g.character_id===100001).order.filter(p=>p.enabled).map(p=>p.identifier)),input=baseline.prompts.filter(p=>!p.marker&&p.enabled!==false&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)})),sent=applyCompiledMessages(input,baseline,compiled,expand).map(p=>p.content).join('\n');$('#report').textContent=JSON.stringify({chat:live.chatId,choices:c.story.play?.choices??{},analysisRows:sent.split('\n').filter(s=>/^(言下之意|可深化点)\|/.test(s)),rpGuide:sent.match(/\[CREATIVE\.GUIDE\][\s\S]*?\[\/CREATIVE\.GUIDE\]/)?.[0],oldSignalPresent:/信号\|<明确要求/.test(sent),directives:sent.split('\n').filter(s=>/^@(APPEARANCE\.RATIO|PSYCHOLOGY\.|DIALOGUE\.RATIO|CHAR\.AUTONOMY|CHAR\.SUBTEXT_AND_COERCION)/.test(s)),pageErrors:$('#errors').textContent},null,2);});
 bind('#phone-open',async()=>{try{const p=await getPhoneService();$('#report').textContent=JSON.stringify({chat:live.chatId,phoneContext:p.getState().contextKey,actions:p.getState().actions.map(a=>a.query),writes},null,2);}catch{await open();}});
 bind('#phone-action',async()=>{const p=await getPhoneService();await p.dispatch({kind:'search',query:'只属于 '+live.chatId});$('#status').textContent='已保存手机记录：只属于 '+live.chatId;});
 bind('#phone-detach',async()=>{await getPhoneService();chat[0].mes+='（合成的真实历史修改）';await host.sync();await context().saveChat();await open();});
 await host.ensureDatabase();await mount();
}catch(e){fail(e);}
