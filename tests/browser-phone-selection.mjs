import catalog from '../engine/catalog.json' with {type:'json'};
import {createMatrixHost} from '../engine/host.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {createPhoneDatabaseStorage} from '../engine/phone-database.mjs';
import {createPhoneService} from '../phone-core.mjs';
import {bootPhone} from '../phone-app.mjs';
import {fundedPhoneProfile,installPhoneClock,installPhoneIdentities} from './fixtures/phone-current.mjs';

const $=s=>document.querySelector(s),storageKey='tisya-phone-selection-browser-20261114-v1';
const report=e=>{$('#errors').textContent+=`${e.stack??e}\n`;};
window.addEventListener('error',e=>report(e.error??e.message));
window.addEventListener('unhandledrejection',e=>report(e.reason));
try{
 const source=await (await fetch('../index.js',{cache:'no-store'})).text();
 const sourceHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),x=>x.toString(16).padStart(2,'0')).join('');
 const version=(await (await fetch('../package.json',{cache:'no-store'})).json()).version;
 $('#build').textContent=`生产版本 ${version}；index.js SHA-256 ${sourceHash}`;
 const persisted=JSON.parse(localStorage.getItem(storageKey)??'null');
 const disk=persisted?.disk??{},metadata=persisted?.metadata??{};
 let commits=persisted?.commits??0,selection='person-a',release=null,app,service;
 const context={chatId:'browser-phone-selection-20261114',characterId:0,chat:[],chatMetadata:metadata,extensionSettings:{},saveChat:async()=>true};
 const persist=()=>localStorage.setItem(storageKey,JSON.stringify({disk,metadata:context.chatMetadata,commits}));
 const storage={get:async id=>structuredClone(disk[id]),set:async(id,value)=>{disk[id]=structuredClone(value);persist();},commit:async(id,revision,value)=>{if((disk[id]?.local_revision??0)!==revision)return false;disk[id]=structuredClone(value);commits++;persist();return true;}};
 const db=createMatrixHost({getContext:()=>context,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistMetadata:async()=>{persist();return true;},persistSettings:async()=>true});
 await db.ensureDatabase();
 const profile=fundedPhoneProfile(),before=await db.readDatabase(),rt=new Runtime(before.state);
 if(!rt.data.tables.T_STATIC_WORLDS?.[profile.world.id]){
  rt.newRecord('T_STATIC_WORLDS',{name:profile.world.name},profile.world.id);installPhoneClock(rt,profile);installPhoneIdentities(rt,profile);
  const changes=[];for(const [tableId,rows] of Object.entries(rt.data.tables))for(const [recordId,row] of Object.entries(rows))if(!before.state.tables?.[tableId]?.[recordId])changes.push({tableId,recordId,values:Object.fromEntries(Object.entries(row.values).filter(([k])=>k!=='row_uuid'))});
  await db.commitDatabase({contextKey:before.contextKey,expectedRevision:before.revision,operationId:'browser-fixture-world',changes});
 }
 const key=(await db.readDatabase()).contextKey;
 service=createPhoneService({seed:{accounts:{me:{name:'合成测试本人'}},documents:[]},contextKey:key,storage:createPhoneDatabaseStorage({database:db.createPhoneDatabaseBridge(),contextKey:key}),onChange:()=>app?.refresh()});
 await service.init();
 const start=source.indexOf('async function initializeLifeForCurrentSelection('),end=source.indexOf('\nfunction phoneDesktop(',start);
 if(start<0||end<start)throw Error('生产初始化入口未找到');
 const deps={context:()=>context,phoneChatKey:()=>key,phoneSelectionKey:()=>selection,phoneBindingSelection:()=>profile.binding,storyRoles:()=>({phoneProfile:async()=>{if($('#hold').checked){$('#stage').textContent='正在等待人物资料；可切换人物再继续。';await new Promise(resolve=>release=resolve);}return {database:true,worldId:profile.world.id,entityId:profile.character.id};}}),matrixDatabase:{read:()=>db.readDatabase()},readPhoneDatabaseProfile:()=>service.readLife()?{life:service.readLife()}:profile};
 const initialize=Function(...Object.keys(deps),source.slice(start,end)+'\nreturn initializeLifeForCurrentSelection;')(...Object.values(deps));
 const host={service:async()=>service,contextKey:()=>key,selectionKey:()=>selection,initializeLife:async()=>{const c=commits;try{const out=await initialize(service);$('#stage').textContent=`初始化完成；本次数据库写入 ${commits-c} 次`;return out;}catch(e){$('#stage').textContent=`${e.code??'ERROR'}：${e.message}；本次数据库写入 ${commits-c} 次`;throw e;}},openIdentity:()=>{$('#stage').textContent='测试身份入口；当前 '+selection;},open:()=>{},close:()=>{}};
 window.Tisya={phone:host};
 const url=new URL(location.href);url.searchParams.set('chat',key);url.searchParams.set('app','home');history.replaceState(null,'',url);
 async function mount(){app?.dispose();app=await bootPhone({win:window,doc:document});}
 async function assetStore(mode,fn){const conn=await new Promise((resolve,reject)=>{const q=indexedDB.open('tisya-phone-host-media',1);q.onupgradeneeded=()=>q.result.createObjectStore('assets',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});try{return await new Promise((resolve,reject)=>{const tx=conn.transaction('assets',mode),q=fn(tx.objectStore('assets'));tx.oncomplete=()=>resolve(q.result);tx.onerror=()=>reject(tx.error);});}finally{conn.close();}}
 const assetKey=id=>{const life=service.readLife();return JSON.stringify([life.mediaOriginContextKey??key,life.bindingKey,id]);};
 async function inspect(){const life=service.readLife(),photos=life?.state.media.photos??[],results=[];for(const p of photos){const saved=await assetStore('readonly',s=>s.get(assetKey(p.assetId)));const bitmap=saved?await createImageBitmap(saved.blob):null;results.push({id:p.id,name:p.name,derivedFrom:p.derivedFrom??null,visibility:p.visibility,edit:p.edit??null,width:bitmap?.width??null,height:bitmap?.height??null,sha256:saved?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await saved.blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join(''):null});bitmap?.close();}$('#result').textContent=JSON.stringify({version,sourceHash,selection,commits,revision:(await db.readDatabase()).revision,initialized:!!life,photos:results,pageErrors:$('#errors').textContent},null,2);}
 const bind=(id,fn)=>$(id).onclick=()=>Promise.resolve().then(fn).catch(report);
 bind('#switch',()=>{selection='person-b';$('#stage').textContent='当前已选择人物乙';});
 bind('#release',()=>{release?.();release=null;});
 bind('#reopen',async()=>{selection='person-a';$('#hold').checked=false;await mount();$('#stage').textContent='已选回人物甲并重新打开';await inspect();});
 bind('#photo',async()=>{app=window.tisyaPhoneApp;if(!service.readLife())throw Error('先完成初始化');if(service.readLife().state.media.photos.some(p=>p.id==='browser-original'))throw Error('测试原图已经存在');const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;const ctx=canvas.getContext('2d');ctx.fillStyle='#148a83';ctx.fillRect(0,0,100,100);ctx.fillStyle='#eeb95e';ctx.fillRect(100,0,100,100);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await assetStore('readwrite',s=>s.add({id:assetKey('browser-original'),blob}));await app.dispatch({type:'media.photo.add',photo:{id:'browser-original',assetId:'browser-original',name:'浏览器测试原图',source:'file',mime:'image/png',ownerId:'me',visibility:'private',savedAt:new Date().toISOString()}});await mount();app=window.tisyaPhoneApp;app.navigate({app:'album',detail:'browser-original'});await inspect();});
 bind('#inspect',inspect);bind('#narrow',()=>$('#phone-root').style.width='360px');bind('#normal',()=>$('#phone-root').style.width='390px');
 await mount();await inspect();$('#stage').textContent='已就绪；生产页面、服务、数据库桥与原生媒体存储已加载。';
}catch(e){report(e);}
