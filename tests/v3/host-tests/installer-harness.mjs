import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {installV3Host} from '../../../v3/host.mjs';
import {createBookManager} from '../../../v3/books.mjs';
import {createTauriWorldbookTransport,formatSimpleSheet,projectRetained} from '../../../v3/host-runtime.mjs';
import {fullDefaultConfiguration} from '../../../v3/preset.mjs';
import {fullReply} from '../reply-tests/fixture.mjs';
import {createExtractedHostHarness} from '../native-fixtures/host-harness.mjs';
import {createActualMvuHarness} from '../native-fixtures/mvu/harness.mjs';

const clone=structuredClone,access={readers:[],knowers:[]},empty=()=>({templates:[],schemaChanges:[],changes:[],pending:[]});
const wrap=body=>fullReply.replace(/<body\b[^>]*>[\s\S]*?<\/body>/,'<body min="1" max="5000" unit="字">'+body+'</body>').replace(/<title>[\s\S]*?<\/title>/,'<title>门口|2001-10-12 11:36|店里|测试</title>');
const oldBody='1 阿绫用一格电量打开门锁，把工具箱递给林澈。\n\n2 她提醒他先看看窗台上的信。';
const newBody='1 阿绫把信收到口袋里，随手扣上工具箱。\n\n2 她问林澈明天能否替她照看一小时店。';
function xml(messages,name){const text=messages.map(m=>m.content).join('\n'),start='<'+name+'>\n',end='\n</'+name+'>';const value=text.split(start)[1]?.split(end)[0];return value?JSON.parse(value):null;}
function sheet(messages,{invalid=false}={}){if(invalid)return 'bad sheet';const source=xml(messages,'TISYA.DATA.SOURCE'),state=xml(messages,'TISYA.DATA.STATE');
 const result={requestKey:state.requestKey,archiveProposal:source.archiveSources.map(s=>({source:s.archiveSource.key,proposal:empty()})),worldProposal:null,scope:{goal:'继续交接',targets:[],timeWindow:'当前',stop:'玩家答复',unknowns:[]},preferenceCandidates:empty(),archiveRequests:[],creativeBrief:{goal:'主动安排',beats:[{proposal:'阿绫提出明日代班的请求。',basis:[],condition:'完成交接'}],pendingChoices:[],due:[],clues:[],constraints:[]},pending:[]};
 if(result.archiveProposal.length){const cell=state.rows.find(r=>r.table==='native_cells');if(cell&&!source.archiveSources[0].nativeBridge.nativeOwned&&!source.archiveSources[0].nativeBridge.nativeAlready)result.archiveProposal[0].proposal.changes.push({id:cell.id,table:'native_cells',expected:cell.rev,values:{值:{energy:3}},access,evidence:[1]});}
 return formatSimpleSheet(result);
}

/** Real extracted saveReply and manifest-interceptor functions; platform UI/network are explicit fixtures. */
export async function createInstallerHarness({invalid=false,mvu=true,provider,initialRows=[],playerObject=null,currentUser='继续。',group=false,readNativeRules=null,getRuntimePreset}={}){
 const host=await createExtractedHostHarness(),transport=createTauriWorldbookTransport({worldInfo:host.worldInfo,fetch:host.fetch});
 const nativeMvu=createActualMvuHarness({initialByFloor:{0:{stat_data:{resources:{energy:4}}},2:{stat_data:{resources:{energy:4}}}}});
 let branchId='branch-one',bookEpoch=1,persisted={},pointer=null,playerId='player',errors=[],requests=[],bindingInvalidations=[];
 const events=host.events.eventSource,eventTypes={GENERATION_STARTED:'generation_started',GENERATION_STOPPED:'generation_stopped',CHAT_CHANGED:'chat_changed',MESSAGE_RECEIVED:'message_received',CHARACTER_MESSAGE_RENDERED:'character_message_rendered',MESSAGE_SWIPED:'message_swiped',MESSAGE_EDITED:'message_edited',MESSAGE_UPDATED:'message_updated',MESSAGE_DELETED:'message_deleted',GROUP_WRAPPER_STARTED:'group_wrapper_started',GROUP_WRAPPER_FINISHED:'group_wrapper_finished'};
 const ctx={groupId:group?'group-one':null,chat:[{mes:'原卡开场',is_user:false},{mes:'开门把箱子拿来。',is_user:true},{mes:wrap(oldBody),is_user:false,extra:{},swipe_id:0,swipes:[wrap(oldBody)],swipe_info:[{extra:{}}]},{mes:currentUser,is_user:true}],chatMetadata:{},eventSource:events,eventTypes,getRequestHeaders:()=>({'content-type':'application/json'}),saveChat:async()=>{persisted=clone(ctx.chatMetadata);}};
 const getOwner=()=>({chatId:ctx.chatMetadata.tisya_w24?.chatId??'branch-one',branchId});
 let globalPointer=null;const books=createBookManager({readGlobalMetadata:async()=>clone(globalPointer),saveGlobalMetadata:async next=>{globalPointer=clone(next);},transport,listNames:async()=>[...host.disk.keys()],getContext:()=>({owner:getOwner(),playerId,epoch:bookEpoch}),assertIdle:()=>true,projectLedger:({state})=>projectRetained(state,ctx.chatMetadata.tisya_v3_host?.active??[]),invalidate:async event=>{bindingInvalidations.push(event);},readMetadata:async()=>clone(pointer),saveMetadata:async next=>{pointer=clone(next);ctx.chatMetadata.bookPointer=clone(next);await ctx.saveChat();},saveCurrentBranch:async()=>({saved:true}),activateUser:async({player})=>{playerId=player.id;}});
 const origin=await books.create({kind:'origin',name:'世界',definitions:initialRows.length?[{id:'initial',revision:1,rows:initialRows}]:[],operationId:'origin'}),core=await books.create({kind:'core',name:'核心',operationId:'core'}),archive=await books.create({kind:'archive',name:'存档',origin:{bookId:origin.id,...(initialRows.length?{definitionId:'initial',revision:1}:{})},core:{bookId:core.id},player:{id:'player',...(playerObject?{objectId:playerObject}:{})},preferenceOwner:{kind:'player',id:'player'},operationId:'archive'});
 await books.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'global-initial'});
 await books.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'select'});
 const source=await fs.readFile(new URL('../native-fixtures/extracted/script.js',import.meta.url),'utf8');
 const saveSource=source.slice(source.indexOf('export async function saveReply('),source.indexOf('\n/**\n * Creates a message',source.indexOf('export async function saveReply('))).replace('export async function','async function');
 const realm=vm.createContext({console,structuredClone,Date,chat:ctx.chat,power_user:{trim_spaces:false},name2:'阿绫',generation_started:new Date(),selected_group:group?'group-one':null,characters:[{name:'阿绫',avatar:'none'}],this_chid:0,group_generation_id:100,getThumbnailUrl:()=>'',eventSource:events,event_types:eventTypes,getMessageTimeStamp:()=>new Date().toISOString(),getGeneratingApi:()=> 'openai',getGeneratingModel:()=> 'fixture',shouldCountMessageTokens:()=>false,shouldEmitCharacterMessageEvents:()=>true,processImageAttachment:async()=>{},withChatSurfaceStructureMutation:async fn=>fn(),addOneMessage:()=>{},finalizeMessageContent:async()=>{},statMesProcess:()=>{},parseReasoningInSwipes:()=>{}});
 const ensureAt=source.indexOf('export function ensureSwipes('),ensureSource=source.slice(ensureAt,source.indexOf('\n/**',ensureAt)).replace('export function','function');
 vm.runInContext(saveSource+'\n'+ensureSource+'\nthis.actualSaveReply=saveReply;this.actualEnsureSwipes=ensureSwipes;',realm);
 const script={saveReply:realm.actualSaveReply,cleanUpMessage:({getMessage})=>getMessage,isGenerating:()=>false,hydrateChatMessageSwipes:async()=>{},ensureSwipes:realm.actualEnsureSwipes,swipe:async(_event,_direction,{forceMesId,forceSwipeId})=>{const m=ctx.chat[forceMesId];m.swipe_id=forceSwipeId;m.mes=m.swipes[forceSwipeId];m.extra=clone(m.swipe_info[forceSwipeId]?.extra??{});await events.emit(eventTypes.MESSAGE_SWIPED,forceMesId);},deleteMessage:async floor=>{ctx.chat.splice(floor,1);await events.emit(eventTypes.MESSAGE_DELETED,ctx.chat.length);},deleteSwipe:async(swipeId,floor)=>{const m=ctx.chat[floor];m.swipes.splice(swipeId,1);m.swipe_info.splice(swipeId,1);m.swipe_id=Math.min(m.swipe_id,m.swipes.length-1);m.mes=m.swipes[m.swipe_id];}};
 const handle=()=>({stableId:async()=>branchId,metadata:{get:async()=>clone(persisted)}});
 const target={Mvu:mvu?nativeMvu.runtime:null,__TAURITAVERN__:{api:{chat:{current:{handle}}}}};
 const native={script,bookmarks:{branchChat:async()=>{branchId='branch-two';bookEpoch++;ctx.chatMetadata=clone(ctx.chatMetadata);await events.emit(eventTypes.CHAT_CHANGED);return 'branched';}},openai:{createGenerationParameters:async(settings,model,type,messages)=>({generate_data:{messages,model,type,chat_completion_source:'openai'}})},fetch:async(url,init)=>{assert.equal(url,'/api/backends/chat-completions/generate');const payload=JSON.parse(init.body);requests.push(payload);const a=!!xml(payload.messages,'TISYA.DATA.SOURCE'),isCompanion=payload.messages.some(m=>m.content?.includes('[CONVERSATION]')),content=provider?await provider({stage:isCompanion?'companion':a?'a':'b',payload,messages:payload.messages,ctx,nativeMvu}):a?sheet(payload.messages,{invalid}):wrap(newBody);return new Response(JSON.stringify({choices:[{index:0,message:{content},finish_reason:'stop'}]}),{headers:{'content-type':'application/json'}});}};
 const config={revision:'config-one',enabled:true,nativeBridge:mvu,preferencesEnabled:true,playerObjects:playerObject?[playerObject]:[],onstageObjects:initialRows.filter(r=>r.table==='objects'&&r.values.类型==='character').map(r=>r.id),focusObjects:[]};
 const api=await installV3Host({target,getContext:()=>ctx,bookManager:books,readConfiguration:()=>config,getConfigurationSnapshot:fullDefaultConfiguration,resolveConnection:async()=>({settings:{},model:'fixture'}),selectedMaterials:async()=>({lanes:{},ids:[]}),onError:e=>errors.push(e),native,readNativeRules,...(getRuntimePreset?{getRuntimePreset}:{})});
 const ext=await fs.readFile(new URL('../native-fixtures/extracted/scripts/extensions.js',import.meta.url),'utf8'),at=ext.indexOf('export async function runGenerationInterceptors('),fn=ext.slice(at,ext.indexOf('\n/**',at)).replace('export async function','async function');
 const exrealm=vm.createContext({console,manifests:{v3:{generate_interceptor:'tisyaHistoryInput'}},sortManifestsByOrder:()=>0,tisyaHistoryInput:target.tisyaHistoryInput});vm.runInContext(fn+'\nthis.run=runGenerationInterceptors;',exrealm);
 return {api,ctx,target,script,native,books,host,nativeMvu,config,errors,requests,intercept:type=>exrealm.run(clone(ctx.chat),10000,type),owner:()=>getOwner()};
}

export {wrap,oldBody,newBody,xml,sheet};
