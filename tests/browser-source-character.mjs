// Isolated browser harness: production services and UI; deterministic model reply.
import {createMatrixHost} from '../engine/host.mjs';
import {createMatrixCreator} from '../engine/creation.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';
import {createBookGateway} from '../tables/books.js';
import {mountMatrixIdentity} from '../engine/identity-ui.mjs';
import {identitySlots} from '../engine/config.mjs';
import catalog from '../engine/catalog.json' with {type:'json'};
const key='tisya-w21-browser-isolated-v1',copy=structuredClone;
const initial={books:{'测试基点书':[{uid:3,name:'【角色】阿青',content:'阿青是河口旅人，习惯先听人说话。\n原文保留：他曾在渡口等过一位旧友。',enabled:false,custom:{keep:0}}]},disk:{},settings:{},metadata:{},modelCalls:0,archiveWrites:0};
const data=JSON.parse(localStorage.getItem(key)??'null')??initial;
const persist=()=>{localStorage.setItem(key,JSON.stringify(data));return true;};
const ctx={chatId:'isolated-source-character',characterId:0,characters:[{avatar:'world.png'}],chat:[],extensionSettings:data.settings,chatMetadata:data.metadata,saveChat:async()=>persist()};
const helper={getWorldbookNames:async()=>Object.keys(data.books),getWorldbook:async n=>copy(data.books[n]),createWorldbook:async(n,rows)=>{data.books[n]=copy(rows);return persist();},updateWorldbookWith:async(n,fn)=>{data.books[n]=copy(fn(copy(data.books[n])));data.archiveWrites++;return persist();}};
const storage={get:async id=>copy(data.disk[id]),set:async(id,value)=>{data.disk[id]=copy(value);persist();},commit:async(id,revision,value)=>{if((data.disk[id]?.local_revision??0)!==revision)return false;data.disk[id]=copy(value);persist();return true;}};
const host=createMatrixHost({getContext:()=>ctx,getSource:()=>({}),loadCatalog:async()=>catalog,storage,persistSettings:async()=>persist(),persistMetadata:async()=>persist()});
await host.ensureDatabase();
const sourceBooks=createBookGateway(()=>helper,()=>ctx),database={read:()=>host.readDatabase(),commit:input=>host.commitDatabase(input)};
const request=async()=>{data.modelCalls++;persist();return '<reply><task/><anchor phase="before"/><title>阿青</title><body>1 阿青是河口旅人。</body><anchor phase="after"/><extra/><cells>【人物原点档案／1】\n1 显示名称：阿青\n20 公开身份：河口旅人</cells><vars/><archive/><actions/></reply>';};
let ui;
async function mount(options){
 ui?.dispose();const roles=createStoryIdentity({config:host.config,getContext:()=>ctx,getHelper:()=>helper,database,sourceBooks,creator:createMatrixCreator({database,getContext:()=>ctx,sourceBooks,request})});
 ui=mountMatrixIdentity(document,document.querySelector('#app'),{config:host.config,roles,resourcesOnly:true,creationOnly:!!options,initialCreation:options,onCreate:mount});await ui.ready;
}
document.querySelector('#back').onclick=()=>mount();
document.querySelector('#verify').onclick=async()=>{await ui.settled();const snapshot=await database.read(),cfg=host.config.read(),slots=await identitySlots(ctx,cfg,'',snapshot);const rows=Object.keys(snapshot.state.tables.T_CHAR_DOSSIER??{}),entry=data.books['测试基点书'].find(e=>e.uid===3);document.querySelector('#result').textContent=JSON.stringify({mode:cfg.story.userMode,binding:cfg.story.userBinding,characters:rows.length,modelCalls:data.modelCalls,archiveWrites:data.archiveWrites,sourceUid:entry.uid,sourceMetadata:entry.custom,sourceOriginal:JSON.parse(entry.content).source?.content,identity:slots.tisya_user_identity},null,2);};
await mount();
