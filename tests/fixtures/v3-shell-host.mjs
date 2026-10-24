import {validateWorldbookPreferences} from '../../config/worldbook-preferences.js';
// Explicit platform fixtures around the real V3 composition root for shell UI tests.
import {createNativeBookHost as createBooks} from '../../v3/book-host.mjs';
import {createApplication as createApp} from '../../v3/application.mjs';
import {createConfigurationBook} from '../../v3/configuration-book.mjs';
import {resolveRuntimeConfiguration} from '../../v3/configuration.mjs';
import {selectArchiveIdentity} from '../../v3/identity-selection.mjs';
import {validateTagTemplateBank} from '../../v3/tags.mjs';
import {registerJourneyRoute} from '../../v3/journey-routes.mjs';
import {mountWorkbench} from '../../v3/workbench.mjs';
// Bubble motion is tested in V3 UI tests; the shell fixture has no animation clock.
const mountProgressBubble=()=>({dispose(){},refresh(){}});
import {CAPABILITIES} from '../../v3/capabilities.mjs';
import {createRuntimePreset} from '../../v3/preset-template.mjs';
export function shellV3(w,ctx,{bindStory=false}={}){
 if(bindStory){ctx.powerUserSettings=w.fixture.power_user;ctx.powerUserSettings.personas['fixture-player.png']='Fixture Player';ctx.powerUserSettings.persona_descriptions['fixture-player.png']={description:'Fixture persona'};w.fixture.user_avatar='fixture-player.png';ctx.name1='Fixture Player';}
 const copy=structuredClone,worlds=new Map(),presets=new Map([['Tisya',createRuntimePreset('writer')]]);let selected='Tisya';
 ctx.eventTypes.OAI_PRESET_CHANGED_BEFORE='preset-before';
 ctx.getPresetManager=()=>({getAllPresets:()=>[...presets.keys()],getSelectedPresetName:()=>selected,getCompletionPresetByName:n=>presets.get(n),findPreset:n=>n,savePreset:async(n,p)=>{presets.set(n,copy(p));},selectPreset:async n=>{selected=n;Object.assign(ctx.chatCompletionSettings,copy(presets.get(n)));}});
 Object.assign(ctx.chatCompletionSettings,copy(presets.get('Tisya')));
 const handle=()=>({ref:{kind:ctx.groupId?'group':'character',characterId:String(ctx.characterId??0),fileName:String(ctx.chatId??'welcome')},stableId:async()=>String(ctx.chatId??'welcome'),metadata:{get:async()=>copy(ctx.chatMetadata)}});
 w.__TAURITAVERN__={api:{chat:{current:{handle},open:()=>handle()}}};
 const originalFetch=w.fetch;w.fetch=async(url,init)=>{
  if(url==='/api/settings/get')return new Response(JSON.stringify({world_names:[...worlds.keys()],settings:JSON.stringify({extension_settings:ctx.extensionSettings,power_user:ctx.powerUserSettings??w.fixture.power_user,user_avatar:w.fixture.user_avatar})}));
  if(url==='/api/worldinfo/get'){const name=JSON.parse(init.body).name;return worlds.has(name)?new Response(JSON.stringify(worlds.get(name))):new Response('',{status:404});}
  return originalFetch(url,init);
 };
 const script={setUserName:(...args)=>w.fixture.setUserName(...args),isGenerating:()=>false,saveSettings:async()=>true,saveReply:async({getMessage})=>ctx.chat.push({is_user:false,mes:getMessage}),swipe:(...args)=>w.fixture.swipe(...args),deleteMessage:async n=>ctx.deleteMessage?ctx.deleteMessage(n):ctx.chat.splice(n,1),deleteSwipe:(...args)=>w.fixture.deleteSwipe(...args),hydrateChatMessageSwipes:(...args)=>w.fixture.hydrateChatMessageSwipes(...args),ensureSwipes:()=>{},openCharacterChat:async()=>{},cleanUpMessage:({getMessage})=>getMessage};
 const native={script,worldInfo:{saveWorldInfo:async(n,d)=>worlds.set(n,copy(d)),createWorldInfoEntry:(n,d)=>{const uid=Math.max(-1,...Object.keys(d.entries).map(Number))+1;return d.entries[uid]={uid,extensions:{}};}},persistence:{discardWorldInfoDocument(){}},personas:{initUserAvatar:(...args)=>w.fixture.initUserAvatar(...args),setPersonaDescription:(...args)=>w.fixture.setPersonaDescription(...args)},groups:{},bookmarks:{branchChat:async()=>{}},openai:{createGenerationParameters:async(settings,model,type,messages)=>({generate_data:{messages,model,type}})},authorsNote:{setFloatingPrompt:async()=>{},NOTE_MODULE_NAME:'author',shouldWIAddPrompt:false},fetch:(...args)=>w.fetch(...args)};
 return {validateWorldbookPreferences,createConfigurationBook,resolveRuntimeConfiguration,selectArchiveIdentity,validateTagTemplateBank,registerJourneyRoute,mountWorkbench,mountProgressBubble,CAPABILITIES,BOOK_POINTER_KEY:'tisya_v3_books',
  createNativeBookHost:async options=>{const host=await createBooks({...options,native});const core=await host.manager.create({kind:'core',name:'Fixture global core',operationId:'fixture-global'});await host.manager.selectGlobalCore({coreId:core.id,expectedRevision:null,operationId:'fixture-select'});if(bindStory){const origin=await host.manager.create({kind:'origin',name:'Fixture origin',operationId:'fixture-origin'}),player={id:'fixture-player.png',name:'Fixture Player'},archive=await host.manager.create({kind:'archive',name:'Fixture archive',origin:{bookId:origin.id},core:{bookId:core.id},player,preferenceOwner:{kind:'player',id:player.id},operationId:'fixture-archive'});await host.manager.select({archiveId:archive.id,expectedBindingRevision:null,operationId:'fixture-bind'});}return host;},
  createApplication:options=>createApp({...options,native,worldbookScan:false})};
}
