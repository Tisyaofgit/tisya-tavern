import {createDefaultActivation} from '../default-activation.js';
import catalog from '../engine/catalog.json' with {type:'json'};
import {createMatrixHost} from '../engine/host.mjs';
import {indexedStorage,NS} from '../engine/controller.mjs';
import {createNativeChatArchiveBooks} from '../engine/chat-archive-book.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {baseline} from '../engine/config.mjs';
import {PANEL_CSS} from '../config/panel-style.js';
const PREFIX='tisya-archive-browser-38-v2-',copy=structuredClone;
const bookDB=indexedStorage({open:(name,version)=>indexedDB.open(PREFIX+'native-books-'+name,version)});
const saved=JSON.parse(localStorage.getItem(PREFIX+'contexts')??'{}'),files=await bookDB.get('files')??{},settings={};let selected=localStorage.getItem(PREFIX+'selected')??'甲',failNext=false,panel,writes=Number(localStorage.getItem(PREFIX+'writes')??0);
const persist=()=>{localStorage.setItem(PREFIX+'contexts',JSON.stringify(saved));localStorage.setItem(PREFIX+'selected',selected);localStorage.setItem(PREFIX+'writes',String(writes));return true;};
const context=id=>saved[id]??={chatId:id,characterId:0,chatMetadata:{integrity:'fixture',world_info:'已有剧情书'},chat:[]};
const ctx=()=>({...context(selected),extensionSettings:settings,saveChat:async()=>persist(),saveSettingsDebounced(){},getRequestHeaders:()=>({'Content-Type':'application/json'})});
const native={world_names:[],async flushWorldInfoSaves(){},async updateWorldInfoList(){this.world_names=Object.keys(files);},async saveWorldInfo(name,data,immediate){if(!immediate)throw Error('expected immediate native save');if(failNext){failNext=false;throw Error('隔离测试：模拟世界书保存失败');}files[name]=copy(data);await bookDB.set('files',files);writes++;persist();}};
const books=createNativeChatArchiveBooks({native,getContext:ctx,fetchImpl:async(_url,options)=>{const name=JSON.parse(options.body).name;return {ok:!!files[name],status:files[name]?200:404,json:async()=>copy(files[name])};}});
const storage=indexedStorage({open:(name,version)=>indexedDB.open(PREFIX+name,version)}),source={prompts:copy(baseline.prompts),order:copy(baseline.prompt_order[1].order)};
const host=createMatrixHost({retryBinding:()=>activation.retry(),manualReview:true,getContext:ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,archiveBooks:books,persistSettings:async()=>true,persistMetadata:async()=>persist()});
const activation=createDefaultActivation({getContext:ctx,activatePreset:async()=>({active:true}),ensureBound:options=>host.ensureBound(options)});
const style=document.createElement('style');style.textContent=PANEL_CSS;document.head.append(style);
async function draw(){
 persist();const meta=ctx().chatMetadata[NS],bundle=meta?await storage.get(meta.chat_uid):null,book=files[meta?.archive_book?.name],checkpoint=book?JSON.parse(book.entries[0].content):null;
 const summary={version:'candidate.38-archive.13 / CAB-2',chat:selected,bookCount:Object.keys(files).length,writeCount:writes,localRevision:bundle?.local_revision,bookRevision:checkpoint?.revision,localValue:bundle?.state.tables.TEST_ARCHIVE?.actor?.values.hp??null,bookValue:checkpoint?.bundle.state.tables.TEST_ARCHIVE?.actor?.values.hp??null,allDisabled:Object.values(files).every(b=>Object.values(b.entries).every(e=>e.disable===true)),dossierBook:meta?.dossier_book?.name??null,historyBook:meta?.history_book?.name??null,nativeChatBook:ctx().chatMetadata.world_info,status:host.archiveStatus()};
 document.querySelector('#summary').textContent=JSON.stringify(summary,null,2);panel?.dispose();panel=mountMatrixConfiguration(document,document.querySelector('#panel'),{service:host,initialTab:'tables',onError:e=>{document.querySelector('#error').textContent=e.message;},onClose(){}});
}
async function run(fn){document.querySelector('#error').textContent='';try{await fn();}catch(e){document.querySelector('#error').textContent=e.message;}await draw();}
for(const id of ['甲','乙'])document.querySelector('#'+(id==='甲'?'open-a':'open-b')).onclick=()=>run(async()=>{selected=id;await host.ensureBound();});
document.querySelector('#repeat').onclick=()=>run(()=>Promise.all([host.ensureBound(),host.ensureBound()]));
document.querySelector('#save').onclick=()=>run(()=>host.mutate(e=>{if(!e.data.schema.TEST_ARCHIVE)e.registerTable('TEST_ARCHIVE',[{key:'name',type:'TEXT'},{key:'hp',type:'NUMBER'}]);if(!e.rows('TEST_ARCHIVE').actor)e.newRecord('TEST_ARCHIVE',{name:'旅人',hp:0},'actor');e.set(['TEST_ARCHIVE','actor','hp',[]],e.rows('TEST_ARCHIVE').actor.values.hp+1);}));
document.querySelector('#fork').onclick=()=>run(async()=>{const from=context(selected);selected='分支';saved[selected]={...copy(from),chatId:selected};await host.ensureBound();});
document.querySelector('#fail-first').onclick=()=>run(async()=>{selected='首次失败';failNext=true;await activation.chatChanged();});
document.querySelector('#fail').onclick=()=>{failNext=true;document.querySelector('#error').textContent='下一次世界书写入将模拟失败；然后点保存测试值。';};
document.querySelector('#retry').onclick=()=>run(()=>host.syncArchive());
document.querySelector('#reload').onclick=()=>location.reload();
await run(()=>activation.start());
