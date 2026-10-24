import assert from 'node:assert/strict';
import {createNativeBookHost} from '../../../v3/book-host.mjs';
const clone=v=>structuredClone(v),err=code=>e=>e.code===code;
/** Simulated host exports and disk reads, exercising the production callback adapter. */
export function hostFixture(){
 const worlds=new Map(),chatFiles=new Map(),calls=[],fail={};let avatar='p1',currentFile='f1',savedSettings={user_avatar:avatar,power_user:{personas:{p1:'One',p2:'Two'}}};
 const makeFile=(name,stable)=>({ref:{kind:'character',characterId:'char',fileName:name},stable,chat:[{is_user:false,mes:'Opening'}],metadata:{},native:[{stat_data:{score:1}}]});
 chatFiles.set('f1',makeFile('f1','stable-1'));chatFiles.set('f2',makeFile('f2','stable-2'));
 let ctx;
 const open=name=>{currentFile=name;const saved=chatFiles.get(name);ctx={chatId:name,chat:clone(saved.chat),chatMetadata:clone(saved.metadata),extensionSettings:clone(savedSettings.extension_settings??{}),characters:[{avatar:'char.png'}],characterId:0,groupId:null,name1:savedSettings.power_user.personas[avatar],powerUserSettings:clone(savedSettings.power_user),getRequestHeaders:()=>({'Content-Type':'application/json'}),saveChat:async()=>{calls.push(['saveChat',name]);if(fail.chatSave)throw Error('chat save failed');saved.chat=clone(ctx.chat);saved.metadata=clone(ctx.chatMetadata);}};};open('f1');
 const handle=file=>({ref:clone(file.ref),stableId:async()=>file.stable,metadata:{get:async()=>clone(file.metadata)}});
 const native={worldInfo:{saveWorldInfo:async(name,data,immediate)=>{assert.equal(immediate,true);calls.push(['saveWorldInfo',name]);worlds.set(name,clone(data));},createWorldInfoEntry:(name,data)=>{const uid=Math.max(-1,...Object.keys(data.entries).map(Number))+1,wire={uid,extensions:{}};data.entries[uid]=wire;return wire;}},persistence:{discardWorldInfoDocument:name=>calls.push(['discard',name])},
  script:{isGenerating:()=>false,saveSettings:async()=>{calls.push(['saveSettings']);if(fail.settings)return false;savedSettings={user_avatar:avatar,power_user:clone(ctx.powerUserSettings),extension_settings:clone(ctx.extensionSettings)};return true;},setUserName:name=>{ctx.name1=name;},openCharacterChat:async(name,av)=>{assert.equal(av,'char.png');calls.push(['openCharacterChat',name,av]);open(name);}},
  personas:{initUserAvatar:id=>{calls.push(['persona',id]);avatar=id;},setPersonaDescription:()=>calls.push(['description'])},groups:{openGroupChat:async()=>{throw Error('unexpected group');}}};
 const target={__TAURITAVERN__:{api:{chat:{current:{handle:()=>handle(chatFiles.get(currentFile))},open:ref=>handle(chatFiles.get(ref.fileName))}}},fetch:async(url,options)=>{
  calls.push(['fetch',url]);if(url==='/api/settings/get')return {ok:true,json:async()=>({world_names:[...worlds.keys()],settings:JSON.stringify(savedSettings)})};
  if(url==='/api/worldinfo/get'){const name=JSON.parse(options.body).name;return worlds.has(name)?{ok:true,status:200,json:async()=>clone(worlds.get(name))}:{ok:false,status:404};}
  throw Error('Unexpected network request '+url);
 },Mvu:{getMvuData:({message_id})=>clone(chatFiles.get(currentFile).native[message_id]),parseMessage:async()=>{},replaceMvuData:async(value,{message_id})=>{chatFiles.get(currentFile).native[message_id]=clone(value);}}};
 return {native,target,worlds,chatFiles,calls,fail,getContext:()=>ctx,getPlayerId:()=>avatar,open,get currentFile(){return currentFile;},get settings(){return savedSettings;}};
}
export async function prepareFixture({bridge=false}={}){
 const f=hostFixture(),h=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,getHost:()=>({assertIdle(){},configurationChanged(){f.calls.push(['invalidate']);}}),readConfiguration:()=>({nativeBridge:bridge})});
 const options=await h.manager.options(),origin=await h.manager.create({kind:'origin',name:'Origin',operationId:'o'}),core=await h.manager.create({kind:'core',name:'Core',operationId:'c'});
 await h.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global-initial'});
 const request={kind:'archive',name:'Archive',origin:{bookId:origin.id},core:{bookId:core.id},player:{id:'p1'},preferenceOwner:{kind:'player',id:'p1'},operationId:'a'};
 const archive=await h.manager.create(request);await h.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'initial'});
 return {f,h,origin,core,archive,options,request};
}
