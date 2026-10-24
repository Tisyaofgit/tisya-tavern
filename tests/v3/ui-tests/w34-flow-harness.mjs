import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createInstallerHarness} from '../host-tests/installer-harness.mjs';
import {createApplication} from '../../../v3/application.mjs';
import {createConfigurationBook} from '../../../v3/configuration-book.mjs';
import {validateTagTemplateBank} from '../../../v3/tags.mjs';
import {mountWorkbench} from '../../../v3/workbench.mjs';
import {createRuntimePreset} from '../../../v3/preset-template.mjs';
import {characterWorldbookNames} from '../../../v3/book-host.mjs';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../../../config/core.js';
import {pairedPreset,taskMessages} from '../../../tables/paired-preset.js';
import {formatSimpleSheet} from '../../../tables/simple-sheet.js';

const copy=structuredClone;
export const sourceText=Object.freeze({
 card:'阿绫是渡口修理铺的店主，习惯先核对委托人的姓名。',
 embedded:'小铺的木牌写着“旧器如新”。',
 book:'定风灯是渡口共有的物品，灯座刻着 {{user}} 与旧船号。',
 initialState:'阿绫的开局精力为 6，平常会在柜台旁清点工具。',
 disabled:'停用世界设定：渡口已经毁灭。',
 persona:'林澈是刚到渡口的记账员，随身带着蓝封皮账本。',
 opener:'2001-10-12 11:30，林澈和阿绫在修理铺柜台前相遇；小铺的门仍关着。',
 alternative:'2001-10-11 08:00，林澈独自在远方山道上行走。',
 history:'阿绫把旧钥匙交给林澈，两人约好次日再见。她的精力由 6 降到 5。',
 later:'林澈将旧钥匙收进蓝封皮账本的夹层。',
});
export const access={readers:['读者'],knowers:[]};
export const proposal=changes=>({templates:[],changes,pending:[]});
export const extraction=changes=>({templates:[],schemaChanges:[],notes:[],base:proposal(changes),initial:proposal([])});
export const change=(id,table,values,evidence,expected=0)=>({id,table,expected,values,access:copy(access),evidence});

/** Actual composition root + extracted native worldbook JS; model/UI/native disk are explicit fixtures. */
export async function setupFlow(t,{request,initialRows=[],chat}={}){
 const h=await createInstallerHarness({mvu:false,initialRows});h.api.dispose();
 const nativeBook={entries:{7:{uid:7,comment:'渡口器物',key:['定风灯'],content:sourceText.book,disable:false},8:{uid:8,comment:'停用设定',key:['渡口'],content:sourceText.disabled,disable:true},9:{uid:9,comment:'开局状态',key:['阿绫'],content:sourceText.initialState,disable:false}}};
 h.host.putDisk('渡口配套',nativeBook);
 Object.assign(h.ctx,{chatId:'fixture',characterId:0,userAvatar:'player',name1:'林澈',name2:'阿绫',
  characters:[{avatar:'card.png',name:'阿绫',data:{name:'阿绫',description:sourceText.card,first_mes:sourceText.alternative,alternate_greetings:['另一份未选开局。'],character_book:{entries:[{id:1,comment:'小铺招牌',content:sourceText.embedded,enabled:true}]},extensions:{world:'渡口配套'}}}],
  worldInfo:{charLore:[]},powerUserSettings:{persona_description:sourceText.persona},extensionSettings:{},
  loadWorldInfo:async name=>{const response=await h.host.fetch('/api/worldinfo/get',{method:'POST',body:JSON.stringify({name})});if(!response.ok)throw Error('native worldbook read '+response.status);return response.json();},getWorldInfoNames:()=>[...h.host.disk.keys()]});
 const initialChat=chat??[{mes:sourceText.opener,is_user:false,extra:{}},{mes:'请把旧钥匙交给我。',is_user:true},{mes:'<body>'+sourceText.history+'</body><memory>污染摘要：渡口已经毁灭。</memory>',is_user:false,extra:{}},{mes:'我把钥匙收好了。',is_user:true},{mes:'<body>'+sourceText.later+'</body><vars>污染变量：体力清零。</vars>',is_user:false,extra:{}}];
 h.ctx.chat.splice(0,h.ctx.chat.length,...copy(initialChat));
 const books={...h.books,getLinkedWorldbookNames:avatar=>characterWorldbookNames(h.ctx,h.ctx.worldInfo,avatar),readWorldbook:name=>h.ctx.loadWorldInfo(name)};
 h.ctx.chatMetadata.tisya_v3_books=copy((await h.books.binding()).pointer);
 const config=emptyConfig();config.worlds[worldKey(h.ctx)]=defaultWorld();h.ctx.extensionSettings[KEY]=config;
 let app,view;const tasks=[],actionErrors=[];
 const store=createStore({getContext:()=>h.ctx,persist:async()=>{throw Error('Configuration must use its worldbook');}});
 const configurationBook=createConfigurationBook({books,store,getContext:()=>h.ctx,getPlayerId:()=>h.ctx.userAvatar,domainValidators:{tagTemplates:validateTagTemplateBank}});
 await configurationBook.hydrate({initializeIfMissing:true});
 const configHost={runtimePresetFor:createRuntimePreset,resolveConnectionFor:async()=>({settings:{},model:'deterministic-fixture'}),selectedMaterialsFor:async()=>({lanes:{},ids:[]}),request:async(task,input)=>{
  const snapshot=store.read(),messages=taskMessages({preset:pairedPreset({task,configuration:snapshot,phase:input.phase}),task,input,substitute:s=>s.replaceAll('{{user}}','MUST_NOT_EXPAND_SOURCE')});
  tasks.push({task,input:copy(input),messages:copy(messages)});assert.ok(request,'Unexpected model task '+task);
  const value=await request(task,input,{h,app,tasks,messages});return typeof value==='string'?value:formatSimpleSheet(value);
 }};
 const create=async()=>{app=await createApplication({target:h.target,getContext:()=>h.ctx,store,configHost,books,configurationBook,native:h.native,getPlayerId:()=>h.ctx.userAvatar,readConfiguration:()=>h.config,worldbookScan:false,onError:error=>h.errors.push(error)});const action=app.capabilities.action;app.capabilities.action=async(...args)=>{try{return await action(...args);}catch(error){actionErrors.push(error);throw error;}};};
 await create();const win=new Window({url:'http://localhost/'});
 const mount=async()=>{view=mountWorkbench(win.document,win.document.body,{capabilities:app.capabilities,stylesheetURL:'http://localhost/workbench.css'});await view.ready;};await mount();
 t.after(async()=>{view?.dispose();app?.dispose();await win.happyDOM.abort();});
 const button=name=>[...view.shadow.querySelectorAll('button')].find(b=>b.textContent===name||b.querySelector('strong')?.textContent===name);
 const click=async name=>{const b=button(name);assert.ok(b,'Missing button '+name+'; visible: '+[...view.shadow.querySelectorAll('button')].map(b=>b.textContent).join(' | '));assert.equal(b.disabled,false,'Disabled button '+name);b.click();await view.settled();};
 const fill=(name,value)=>{const field=view.shadow.querySelector('[aria-label="'+name+'"]');assert.ok(field,'Missing input '+name);field.value=String(value);field.dispatchEvent(new win.Event(field.tagName==='SELECT'?'change':'input'));};
 return {h,store,tasks,actionErrors,configurationBook,click,fill,button,get app(){return app;},get view(){return view;},get shadow(){return view.shadow;},async reopen(){view.dispose();app.dispose();await create();await mount();},nativeBook};
}
