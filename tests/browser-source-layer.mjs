import {baseline} from '../engine/config.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
import {createNativeSourceLayers} from '../engine/native-source-layers.mjs';
import {createNativePresetLayers} from '../engine/native-preset-layers.mjs';
import {loadNativeHost,provenance} from './fixtures/native-layers/load-host-fragments.mjs';
const $=s=>document.querySelector(s),version=(await(await fetch('./package.json')).json()).version;
$('#build').textContent=version+' · 宿主装配片段 '+provenance.commit+' · 合成数据，无模型调用';
$('#run').onclick=async()=>{
 let adapter;try{
  $('#status').textContent='正在装配';
  const history=$('#history').value,native=loadNativeHost({substitute:text=>String(text??'').replaceAll('{{char}}','测试守门人').replaceAll('{{description}}','宏内卡片资料：第三人称')});
  const settings={tags:structuredClone(DEFAULT_TAGS),prompts:{},story:{userName:'测试旅人',play:{choices:{N02:$('#person').value,'S08-MindVoice':$('#voice').value,N11:'N11-A'}}}};
  const projection=createNativePresetLayers({settings,slots:{}}),names=['GENERATION_AFTER_COMMANDS','WORLDINFO_ENTRIES_LOADED','WORLD_INFO_ACTIVATED','GENERATE_AFTER_COMBINE_PROMPTS','CHAT_COMPLETION_SETTINGS_READY','GENERATION_ENDED','GENERATION_STOPPED'];
  const context={eventTypes:Object.fromEntries(names.map(n=>[n,n])),extensionPrompts:{DEPTH_PROMPT:{value:'深度卡片资料',position:1,depth:1,role:0},customDepthWI_1_1:{value:'深度世界书资料',position:1,depth:1,role:1}}};
  adapter=createNativeSourceLayers({relocateSources:true,PromptManager:native.PromptManager,Message:native.Message,ChatCompletion:native.ChatCompletion,getContext:()=>context,getScope:()=>'browser-source-v1',getAuthorsNotePolicy:()=>({enabled:true}),preparePreset:projection.preparePreset,finalizeMessages:projection.finalizeMessages});
  adapter.begin();adapter.entriesLoaded({globalLore:[],characterLore:[],chatLore:[],personaLore:[]});adapter.afterCombine();
  const manager=new native.PromptManager();manager.serviceSettings={prompts:structuredClone(baseline.prompts),prompt_order:structuredClone(baseline.prompt_order[1].order)};
  manager.serviceSettings.prompts.push({identifier:'source-fixture',role:'system',content:'上层引用 <tisya> {{description}} 结束',enabled:true});manager.serviceSettings.prompt_order.splice(1,0,{identifier:'source-fixture',enabled:true});
  const prompts=manager.getPromptCollection('normal'),messages=new native.MessageCollection('all'),completion=new native.ChatCompletion();completion.setTokenBudget(1000000,0);
  for(const item of manager.serviceSettings.prompt_order){if(!item.enabled)continue;const prompt=prompts.get(item.identifier);if(!prompt)continue;
   if(item.identifier==='charDescription'){messages.add(await native.Message.fromPromptAsync(manager.preparePrompt({identifier:'charDescription',role:'system',content:'卡片描述：第三人称'}),manager.tokenHandler));continue;}
   if(item.identifier==='chatHistory'){
    let rows=[{role:'user',content:history}];const attached=manager.preparePrompt({identifier:'scenario',role:'system',content:'附加场景资料',attach_role:'user',attach_index:0,attach_side:'end'});native.applyAttachedPromptsToMessages([attached],rows);
    rows=await native.populationInjectionPrompts([],rows,context.extensionPrompts,native.runtime);
    for(const [i,row]of rows.entries())messages.add(await native.Message.createAsync(row.role,row.content,'chatHistory-'+i,manager.tokenHandler));continue;
   }
   if(prompt.content)messages.add(await native.Message.fromPromptAsync(prompt,manager.tokenHandler));
  }
  completion.add(messages,0);const result=completion.getChat(),all=result.map(m=>m.content).join('\n'),start=all.indexOf('[Dream Rules]\n@BOUNDARY'),end=all.indexOf('[/Dream Rules]'),sourceTexts=['宏内卡片资料：第三人称','卡片描述：第三人称','深度卡片资料','深度世界书资料','附加场景资料'];
  if(!sourceTexts.every(t=>all.indexOf(t)>start&&all.indexOf(t)<end))throw Error('资料没有全部归位');
  if(!result.some(m=>m.role==='user'&&m.content.trim()===history.trim()))throw Error('用户历史正文变化');
  if(/TISYA_SOURCE_(START|END)/.test(all))throw Error('残留临时边界');
  const rules=all.slice(0,start),person=rules.match(/@POV\.PERSON[^\n]*/)?.[0],voice=rules.match(/@PSYCHOLOGY\.VOICE[^\n]*/)?.[0],language=rules.match(/@LANG\.GATE[^\n]*/)?.[0];
  $('#status').textContent='通过：5 段原生资料全部移入梦境资料层；原历史文字保留；临时边界已清除。';
  $('#summary').textContent=[person,voice,language,'来源顺序：'+sourceTexts.sort((a,b)=>all.indexOf(a)-all.indexOf(b)).join(' → ')].join('\n\n');$('#payload').textContent=JSON.stringify(result,null,2);
 }catch(e){$('#status').textContent='失败：'+e.message;}finally{adapter?.dispose();}
};
