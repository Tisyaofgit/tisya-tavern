import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeBookHost,BOOK_POINTER_KEY} from '../../../v3/book-host.mjs';
import {resolveRuntimeConfiguration} from '../../../v3/configuration.mjs';
import {defaultWorld,emptyConfig,worldKey} from '../../../config/core.js';

const clone=v=>structuredClone(v),err=code=>e=>e.code===code;
/** Simulated host exports and disk reads, exercising the production callback adapter. */
function hostFixture(){
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
async function prepareFixture({bridge=false}={}){
 const f=hostFixture(),h=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,getHost:()=>({assertIdle(){},configurationChanged(){f.calls.push(['invalidate']);}}),readConfiguration:()=>({nativeBridge:bridge})});
 const options=await h.manager.options(),origin=await h.manager.create({kind:'origin',name:'Origin',operationId:'o'}),core=await h.manager.create({kind:'core',name:'Core',operationId:'c'});
 await h.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global-initial'});
 const request={kind:'archive',name:'Archive',origin:{bookId:origin.id},core:{bookId:core.id},player:{id:'p1'},preferenceOwner:{kind:'player',id:'p1'},operationId:'a'};
 const archive=await h.manager.create(request);await h.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'initial'});
 return {f,h,origin,core,archive,options,request};
}
async function prepareAutomaticFixture({runtime=false,declared=false}={}){
 const f=hostFixture();if(!runtime)delete f.target.Mvu;else f.target.Mvu.getMvuData=()=>{throw Error('Ordinary card must not read unrelated native variables');};
 const ctx=f.getContext();ctx.chat[0].mes='<div>普通美化开场</div>';
 if(declared)ctx.characters[0].data={extensions:{tavern_helper:{scripts:[{type:'script',enabled:true,content:"import 'https://example.invalid/MagVarUpdate/master/bundle.js'"}]}}};
 const world=defaultWorld(),data=emptyConfig(),key=worldKey(ctx);data.worlds[key]=world;
 const h=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,getHost:()=>({assertIdle(){},configurationChanged(){}}),readConfiguration:()=>resolveRuntimeConfiguration({snapshot:{world,data,key,revision:'audit'},context:f.getContext(),target:f.target})});
 const origin=await h.manager.create({kind:'origin',name:'O',operationId:'o'}),core=await h.manager.create({kind:'core',name:'C',operationId:'c'});
 await h.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global'});
 return {f,h,request:{kind:'archive',name:'A',origin:{bookId:origin.id},core:{bookId:core.id},player:{id:'p1'},preferenceOwner:{kind:'player',id:'p1'},operationId:'a'}};
}
for(const runtime of [false,true])test(`automatic ordinary HTML card binds without native variables (global MVU ${runtime})`,async()=>{
 const {f,h,request}=await prepareAutomaticFixture({runtime});const archive=await h.manager.create(request);await h.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'initial'});
 assert.equal((await h.manager.readRuntime()).archive.id,archive.id);assert.equal(f.getContext().chat[0].mes,'<div>普通美化开场</div>');
 const data=JSON.parse(Object.values(f.worlds.get(archive.physicalName).entries).find(e=>e.extensions?.tisyaBook).content);assert.equal(data.nativeCheckpoint.mode,'none');h.dispose();
});
test('declared native MVU card clearly reports its missing dependency without creating an archive',async()=>{
 const {f,h,request}=await prepareAutomaticFixture({declared:true});const size=f.worlds.size;
 await assert.rejects(h.manager.create(request),error=>error.code==='NATIVE_MVU_UNAVAILABLE'&&/酒馆助手/.test(error.message)&&/MVU/.test(error.message));
 assert.equal(f.worlds.size,size);assert.equal(f.getContext().chat[0].mes,'<div>普通美化开场</div>');h.dispose();
});
test('native callback adapter initializes stable owner and directly reads back pointer without dropping other metadata',async()=>{
 const {f,h,archive}=await prepareFixture();f.getContext().chatMetadata.other={untouched:1};await f.getContext().saveChat();
 assert.deepEqual((await h.manager.options()).owner,{chatId:'stable-1',branchId:'stable-1'});assert.equal((await h.manager.readRuntime()).archive.id,archive.id);assert.deepEqual(f.chatFiles.get('f1').metadata.other,{untouched:1});
 assert.equal(f.chatFiles.get('f1').metadata[BOOK_POINTER_KEY].archiveId,archive.id);assert.ok(f.calls.some(x=>x[0]==='saveWorldInfo'));assert.ok(f.calls.some(x=>x[0]==='fetch'&&x[1]==='/api/settings/get'));
});
test('actual persona export path saves settings and chat lock with direct readback',async()=>{
 const {f,h}=await prepareFixture();await h.manager.select({player:{id:'p2'},preferenceOwner:{kind:'player',id:'p2'},expectedBindingRevision:0,operationId:'switch-user'});
 assert.equal(f.getPlayerId(),'p2');assert.equal(f.settings.user_avatar,'p2');assert.equal(f.chatFiles.get('f1').metadata.persona,'p2');assert.equal((await h.manager.readRuntime()).player.id,'p2');assert.ok(f.calls.some(x=>x[0]==='saveSettings'));
});
test('native persona persistence failure leaves a recoverable book intent and original pointer',async()=>{
 const {f,h}=await prepareFixture();f.fail.settings=true;await assert.rejects(h.manager.select({player:{id:'p2'},preferenceOwner:{kind:'player',id:'p2'},expectedBindingRevision:0,operationId:'failed-user'}),err('PLAYER_SETTINGS_UNSAVED'));
 assert.equal(f.chatFiles.get('f1').metadata[BOOK_POINTER_KEY].bindingRevision,0);assert.equal((await h.manager.pending()).length,1);
 f.fail.settings=false;await h.manager.resume('failed-user');assert.equal((await h.manager.readRuntime()).player.id,'p2');assert.equal(f.settings.user_avatar,'p2');assert.equal(f.chatFiles.get('f1').metadata.persona,'p2');
});
test('book host with no open chat lists personas without writing identity metadata',async()=>{
 const f=hostFixture(),ctx=f.getContext();ctx.chatId=null;const h=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,getHost:()=>null});
 const opts=await h.manager.options();assert.equal(opts.owner,null);assert.equal(opts.players.length,2);assert.equal(f.calls.filter(x=>x[0]==='saveChat').length,0);assert.equal((await h.manager.binding()).pointer,null);
});
test('real chat-open export uses stored avatar/file locator and verifies native MVU hash without copying values',async()=>{
 const {f,h,origin,core,archive}=await prepareFixture({bridge:true});
 f.open('f2');await h.prepare();const second=await h.manager.create({kind:'archive',name:'Second',origin:{bookId:origin.id},core:{bookId:core.id},player:{id:'p1'},preferenceOwner:{kind:'player',id:'p1'},operationId:'a2'});await h.manager.select({archiveId:second.id,expectedBindingRevision:null,operationId:'bind2'});
 f.calls.length=0;await h.manager.select({archiveId:archive.id,expectedBindingRevision:0,operationId:'back-to1'});assert.equal(f.currentFile,'f1');assert.ok(f.calls.some(x=>x[0]==='openCharacterChat'&&x[1]==='f1'));assert.equal((await h.manager.readRuntime()).archive.id,archive.id);
 const manifest=Object.values(f.worlds.get(archive.physicalName).entries).find(e=>e.extensions?.tisyaBook);const data=JSON.parse(manifest.content);assert.equal(data.nativeCheckpoint.mode,'mvu');assert.equal(typeof data.nativeCheckpoint.hash,'string');assert.equal('stat_data' in data.nativeCheckpoint,false);
});
test('native draft callback saves current unsent text only in its original archive book',async()=>{
 const f=hostFixture(),h=await createNativeBookHost({target:f.target,native:f.native,getContext:f.getContext,getPlayerId:f.getPlayerId,getHost:()=>({assertIdle(){},configurationChanged(){}}),readDraft:()=> 'still composing'});
 const o=await h.manager.create({kind:'origin',name:'O',operationId:'o'}),c=await h.manager.create({kind:'core',name:'C',operationId:'c'}),a=await h.manager.create({kind:'archive',name:'A',origin:{bookId:o.id},core:{bookId:c.id},player:{id:'p1'},preferenceOwner:{kind:'player',id:'p1'},operationId:'a'});await h.manager.select({archiveId:a.id,expectedBindingRevision:null,operationId:'s'});
 await h.manager.select({player:{id:'p2'},preferenceOwner:{kind:'player',id:'p2'},expectedBindingRevision:0,operationId:'draft'});assert.equal((await h.manager.readDraft(a.id)).draft,'still composing');
 const intent=Object.values(f.worlds.get(a.physicalName).entries).find(e=>e.extensions?.tisyaBindingIntent?.id==='draft');assert.equal(intent.content.includes('still composing'),false);
});
