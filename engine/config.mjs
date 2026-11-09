import {applyGeneration,assertGeneration} from './generation.mjs';
import {storyAvatar} from './identity.mjs';
import {stripPhoneInitialization,validateStoryLibraries} from './template-book.mjs';
import {applyPreferences,validatePreferences,effectivePreferences,wishPreferences} from './preferences.mjs';
import {configureRenderingResources,renderingResources} from '../rendering-resources.js';
import {applyOutputConfiguration} from './output-config.mjs';
import original from '../presets/Tisya-Matrix.json' with {type:'json'};
import configuration from './configuration.json' with {type:'json'};
import {clone,fail,digest,asError} from './common.mjs';
import {DEFAULT_TAGS,validateTags,rewriteTagReferences,configureTags} from './tags.mjs';
export {configuration};
export const CONFIG_KEY='tisya_matrix_configuration';
export const MATRIX_REVISION=digest({original,identity_slots:2,engine:'matrix-js-v4-unified-avatar-wish-history'});
export function matrixPreset(){
 const p=clone(original);p.name='Tisya';p.extensions={tisya_builtin:{revision:MATRIX_REVISION},tisya_matrix:{version:1}};
 for(const row of p.prompts){
  if(row.identifier==='main')row.content=row.content.replace('@U:={id:user,','@U:={id:contractor,');
  if(row.identifier==='personaDescription'){row.enabled=false;}
  else if(typeof row.content==='string')row.content=row.content.replaceAll('`personaDescription`','`tisya_user_identity`');
 }
 const registry=p.prompts.find(row=>row.identifier==='tisya_registry');
 registry.content=registry.content.replace(/<切入维度：[^>]+>/g,'<自由命名的切入点，可留空>')
  .replace(/<挑个心情[^>]*>|<换个新鲜心情>/g,'@rendering{表情ID}');
 const personaAt=p.prompts.findIndex(row=>row.identifier==='personaDescription');p.prompts.splice(personaAt+1,0,{...clone(original.prompts[personaAt]),identifier:'tisya_user_identity',name:'user · 故事身份（世界书绑定）',system_prompt:false,marker:false,enabled:true,role:'system',content:'{{tisya_user_identity}}'});
 for(const entry of p.prompt_order)entry.order=entry.order.flatMap(row=>row.identifier==='personaDescription'?[{...row,enabled:false},{...row,identifier:'tisya_user_identity',enabled:true}]:[row]);
 return p;
}
export const isMatrixPreset=source=>source?.prompts?.some(p=>p.identifier==='tisya_user_identity')===true;
export const baseline=matrixPreset();
export const materialNames=[...new Set(baseline.prompts.flatMap(p=>[...(p.content??'').matchAll(/\{\{(tisya_[\w]+)\}\}/g)].map(m=>m[1])))];
export function createConfiguration({getContext,persist,assertIdle=()=>{}}){
 function key(){const c=getContext();return JSON.stringify([c.groupId?'group':'character',String(c.groupId??c.characterId??''),String(c.chatId)]);}
 function story(all){const keys=[key(),...(getContext().chatMetadata?.tisya_engine?.origin_chat_keys??[])],normalize=k=>{try{return JSON.stringify(JSON.parse(k).map(String));}catch{return k;}};for(const candidate of keys){const found=Object.keys(all.stories??{}).find(k=>normalize(k)===normalize(candidate));if(found)return all.stories[found];}return {userBinding:null,userName:'',wish:''};}
 function read(){const all=getContext().extensionSettings[CONFIG_KEY]??{format:1,tags:{...DEFAULT_TAGS},aliases:[],prompts:{},generation:{},stories:{},revision:0};if(all.format!==1)fail('CONFIG_VERSION','新版配置格式不受支持');return {...clone(all),story:clone(story(all))};}
 async function save(next){
  assertIdle();const c=getContext(),previous=c.extensionSettings[CONFIG_KEY],hadPrevious=Object.hasOwn(c.extensionSettings,CONFIG_KEY),before=read();
  if(next.revision!==before.revision)fail('CONFIG_CONFLICT','配置已被其他页面更新，请重新打开');
  validatePreferences(next.playDefaults);validatePreferences(next.story?.play);validatePreferences(effectivePreferences(next));renderingResources(next.resources??[]);validateStoryLibraries(next);
  const value=clone(next);value.tags=validateTags(value.tags);value.aliases=[...before.aliases];if(JSON.stringify(value.tags)!==JSON.stringify(before.tags))value.aliases.push(before.tags);value.aliases=[...new Map(value.aliases.map(a=>[JSON.stringify(a),a])).values()];value.stories??={};value.stories[key()]=value.story;delete value.story;value.revision++;
  const undoGeneration=applyGeneration(c,value.generation);c.extensionSettings[CONFIG_KEY]=value;let confirmed=false;
  try{if(await persist()!==true)fail('CONFIG_SAVE','宿主尚未确认配置保存');confirmed=true;assertGeneration(c,value.generation);}
  catch(error){
   if(hadPrevious)c.extensionSettings[CONFIG_KEY]=previous;else delete c.extensionSettings[CONFIG_KEY];undoGeneration();
   if(confirmed)try{if(await persist()!==true)throw Error('宿主尚未确认恢复原配置');}catch(rollback){fail('CONFIG_ROLLBACK_FAILED','配置保存后发生冲突，恢复原配置也未获确认；请重开配置核对实际状态。',{original:asError(error),rollback:asError(rollback)});}
   throw error;
  }
  configureTags(value.tags,value.aliases);configureRenderingResources(value.resources??[]);return read();
 }
 configureTags(read().tags,read().aliases);configureRenderingResources(read().resources??[]);return {read,save};
}
export function compilePromptText(text,config,slots={}){
 // Expand injected material before resolving the protagonist macro inside it.
 text=text.replace(/\{\{(tisya_[\w]+)\}\}/g,(_,name)=>Object.hasOwn(slots,name)?slots[name]:'');
 const tags=validateTags(config.tags);
 return text.split(/(\[MULTIMEDIA\][\s\S]*?\[\/MULTIMEDIA\])/g).map(part=>part.startsWith('[MULTIMEDIA]')?part:rewriteTagReferences(part.replaceAll('{{user}}',slots.tisya_user_name||config.story.userName||'user'),DEFAULT_TAGS,tags)).join('');
}
export function compilePrompts(source,config,slots){
 const out=clone(source);
 for(const p of out.prompts)if(Object.hasOwn(config.prompts,p.identifier))p.content=config.prompts[p.identifier];
 if(slots.tisya_output_configuration)applyOutputConfiguration(out.prompts,JSON.parse(slots.tisya_output_configuration));
 const parameters=applyPreferences(out.prompts,config);if(parameters.min_length!=null||parameters.max_length!=null)applyOutputConfiguration(out.prompts,parameters);
 for(const p of out.prompts){if(p.marker)continue;
  // {{user}} names the bound protagonist. The native persona is injected once
  // into the contractor wish and cannot silently become the protagonist.
  p.content=compilePromptText(p.content??'',config,slots);
 }
 return out;
}
export async function identitySlots(ctx,config,persona){
 const story=config.story,slots={},avatar=storyAvatar(config);if(avatar.mode==='bound'&&!avatar.binding)fail('USER_BINDING_REQUIRED','请在“用户身份”选择基点书的【角色】档案');let bound='',name=story.userName||'user';
 if(avatar.binding){const {book,uid}=avatar.binding;if(!book||uid==null)fail('USER_BINDING','user身份绑定缺少世界书或条目ID');const data=await ctx.loadWorldInfo(book);const entry=Object.values(data?.entries??{}).find(e=>String(e.uid)===String(uid));if(!entry)fail('USER_BINDING_MISSING','user绑定条目已不存在：'+book+'/'+uid);const title=entry.comment??entry.name??'';if(/^【角色】.+/u.test(title))name=title.slice('【角色】'.length);bound=String(entry.content??'');if(!bound.trim())fail('USER_BINDING_EMPTY','user绑定条目内容为空');bound=stripPhoneInitialization(bound,'手机初态');}
 slots.tisya_user_identity=avatar.binding?('[USER.IDENTITY]\n故事主角：'+name+'\n'+bound+'\n[/USER.IDENTITY]'):'';
 slots.tisya_user_name=avatar.binding?name:'';
 const wish=wishPreferences({...config,story:{...story,wish:persona}});
 slots.tisya_contractor_wish=wish?['[CONTRACTOR.WISH]','@u 为屏幕外的契约者与读者。',wish,'[/CONTRACTOR.WISH]'].join('\n'):'';return slots;
}
// Native messages may have merged system entries. Replace each enabled preset
// fragment exactly once after native macros, while preserving every history row.
export function applyCompiledMessages(messages,source,compiled,expand=s=>s){
 const out=clone(messages),order=source.order??source.prompt_order?.find(o=>o.character_id===100001)?.order??[],enabled=new Set(order.filter(x=>x.enabled).map(x=>x.identifier)),next=new Map(compiled.prompts.map(p=>[p.identifier,p]));
 for(const p of source.prompts){if(p.marker||p.enabled===false||!enabled.has(p.identifier))continue;const a=expand(p.content??'').trim(),b=expand(next.get(p.identifier)?.content??'').trim();if(a===b||!a)continue;const matches=[];
  for(const m of out){if(m.role!==(p.role??'system'))continue;if(typeof m.content==='string')matches.push({get:()=>m.content,set:v=>m.content=v});else if(Array.isArray(m.content))for(const part of m.content)if(part.type==='text')matches.push({get:()=>part.text,set:v=>part.text=v});}
  const count=matches.reduce((n,c)=>n+c.get().split(a).length-1,0);if(count!==1)fail('PROMPT_MATCH','预设条目在最终请求中缺失或重复，未猜测替换',{identifier:p.identifier,matches:count});const target=matches.find(c=>c.get().includes(a));target.set(target.get().replace(a,()=>b));
 }
 return out;
}
