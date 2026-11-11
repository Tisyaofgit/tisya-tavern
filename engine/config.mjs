import {applyGeneration,assertGeneration,validateGeneration} from './generation.mjs';
import {storyAvatar,projectDatabaseIdentity} from './identity.mjs';
import {validateStoryLibraries} from './template-book.mjs';
import {applyPreferences,validatePreferences,effectivePreferences,wishPreferences} from './preferences.mjs';
import {configureRenderingResources,renderingResources} from '../rendering-resources.js';
import {applyOutputConfiguration} from './output-config.mjs';
import original from '../presets/Tisya-Matrix.json' with {type:'json'};
import configuration from './configuration.json' with {type:'json'};
import {clone,fail,digest,asError} from './common.mjs';
import {DEFAULT_TAGS,validateTags,rewriteTagReferences,configureTags} from './tags.mjs';
export {configuration};
export const CONFIG_KEY='tisya_matrix_configuration';
export const REPLY_ENVELOPE_RULE=`@ENVELOPE :: Whole response boundary
禁止在唯一 reply 根块之前或之后输出任何内容，包括说明文字、原卡触发符、变量更新、Markdown 代码围栏或第二个回复根块。
整条响应从 <reply id="tisya-onepass-1"> 开始，以对应的 </reply> 结束；按下方骨架把本轮全部交付内容放入这个根块。
正文与互动使用各自的 body、anchor、actions 区块。用于正文就地展示的原卡标记与美化标签放在 body 对应位置，独立扩展面板的显示标记放在 extra；两处都使用当前启用的正则渲染，每个显示组件只在实际展示位置输出一次。
extra 同时收纳唯一的 cells 与 vars 直接子块。它们是隐藏的机器数据，不复制到可见正文或扩展面板；完整原生 UpdateVariable 更新只放在 extra 内的 vars 中，由原卡执行器解析。显示标记不得塞进 vars 或 cells。
原卡的 <start></start> 等开局或创角触发符仅在本轮明确请求进入该页面时输出：正文就地页面放在 body，独立面板放在 extra；普通剧情续写沿当前场景继续。素材或历史中的前缀、后缀和示例遵循同一内部归属。
@END_ENVELOPE`;
function withReplyEnvelope(text){return String(text).replace(/^@ENVELOPE :: Whole response boundary\n[\s\S]*?^@END_ENVELOPE\n?/gm,'').replace('[REGISTRY]','[REGISTRY]\n'+REPLY_ENVELOPE_RULE);}
export const MATRIX_REVISION=digest({original,identity_slots:2,engine:'matrix-js-v4-unified-avatar-wish-history',reply_envelope:REPLY_ENVELOPE_RULE});
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
 registry.content=withReplyEnvelope(registry.content);
 const personaAt=p.prompts.findIndex(row=>row.identifier==='personaDescription');p.prompts.splice(personaAt+1,0,{...clone(original.prompts[personaAt]),identifier:'tisya_user_identity',name:'user · 故事身份（世界书绑定）',system_prompt:false,marker:false,enabled:true,role:'system',content:'{{tisya_user_identity}}'});
 for(const entry of p.prompt_order)entry.order=entry.order.flatMap(row=>row.identifier==='personaDescription'?[{...row,enabled:false},{...row,identifier:'tisya_user_identity',enabled:true}]:[row]);
 return p;
}
export const isMatrixPreset=source=>source?.prompts?.some(p=>p.identifier==='tisya_user_identity')===true;
export const baseline=matrixPreset();
export const materialNames=[...new Set(baseline.prompts.flatMap(p=>[...(p.content??'').matchAll(/\{\{(tisya_[\w]+)\}\}/g)].map(m=>m[1])))];
export function createConfiguration({getContext,persist,assertIdle=()=>{}}){
 let saving=false;
 function key(){const c=getContext();return JSON.stringify([c.groupId?'group':'character',String(c.groupId??c.characterId??''),String(c.chatId)]);}
 function story(all){const keys=[key(),...(getContext().chatMetadata?.tisya_engine?.origin_chat_keys??[])],normalize=k=>{try{return JSON.stringify(JSON.parse(k).map(String));}catch{return k;}};for(const candidate of keys){const found=Object.keys(all.stories??{}).find(k=>normalize(k)===normalize(candidate));if(found)return all.stories[found];}return {userBinding:null,userName:'',wish:''};}
 function read(){const all=getContext().extensionSettings[CONFIG_KEY]??{format:1,tags:{...DEFAULT_TAGS},aliases:[],prompts:{},generation:{},stories:{},revision:0};if(all.format!==1)fail('CONFIG_VERSION','新版配置格式不受支持');return {...clone(all),story:clone(story(all)),contextKey:key()};}
 function validate(next){validatePreferences(next.playDefaults);validatePreferences(next.story?.play);validatePreferences(effectivePreferences(next));validateGeneration(next.generation??{},getContext());renderingResources(next.resources??[]);validateStoryLibraries(next);validateTags(next.tags);return clone(next);}
 async function save(next){
  if(saving)fail('CONFIG_BUSY','上一项配置保存尚未结束');assertIdle();const c=getContext(),scope=key(),previous=c.extensionSettings[CONFIG_KEY],hadPrevious=Object.hasOwn(c.extensionSettings,CONFIG_KEY),before=read();
  if(next.contextKey!==undefined&&next.contextKey!==scope)fail('CONFIG_SCOPE','配置草稿属于另一聊天，请重新打开配置');
  if(next.revision!==before.revision)fail('CONFIG_CONFLICT','配置已被其他页面更新，请重新打开');
  validate(next);
  const value=clone(next);value.tags=validateTags(value.tags);value.aliases=[...before.aliases];if(JSON.stringify(value.tags)!==JSON.stringify(before.tags))value.aliases.push(before.tags);value.aliases=[...new Map(value.aliases.map(a=>[JSON.stringify(a),a])).values()];value.stories??={};value.stories[scope]=value.story;delete value.story;delete value.contextKey;value.revision++;
  const undoGeneration=applyGeneration(c,value.generation);saving=true;c.extensionSettings[CONFIG_KEY]=value;let confirmed=false;
  try{if(await persist()!==true)fail('CONFIG_SAVE','宿主尚未确认配置保存');confirmed=true;if(key()!==scope||getContext().extensionSettings!==c.extensionSettings)fail('CONFIG_SCOPE','保存期间聊天已切换；已停止当前配置操作，请重新核对');if(c.extensionSettings[CONFIG_KEY]!==value)fail('CONFIG_CONFLICT','保存期间配置已被其他位置替换');assertGeneration(c,value.generation);}
  catch(error){
   if(c.extensionSettings[CONFIG_KEY]!==value)fail('CONFIG_ROLLBACK_FAILED','保存期间配置被其他位置替换，未覆盖新内容；请重新读取持久配置核对。',{original:asError(error)});
   if(hadPrevious)c.extensionSettings[CONFIG_KEY]=previous;else delete c.extensionSettings[CONFIG_KEY];undoGeneration();
   if(confirmed)try{if(await persist()!==true)throw Error('宿主尚未确认恢复原配置');}catch(rollback){fail('CONFIG_ROLLBACK_FAILED','配置保存后发生冲突，恢复原配置也未获确认；请重开配置核对实际状态。',{original:asError(error),rollback:asError(rollback)});}
   throw error;
  }finally{saving=false;}
  configureTags(value.tags,value.aliases);configureRenderingResources(value.resources??[]);return read();
 }
 configureTags(read().tags,read().aliases);configureRenderingResources(read().resources??[]);return {read,save,validate};
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
  p.content=compilePromptText(p.identifier==='tisya_registry'?withReplyEnvelope(p.content??''):p.content??'',config,slots);
 }
 return out;
}
export async function identitySlots(ctx,config,persona,databaseSnapshot=null){
 const story=config.story,slots={},avatar=storyAvatar(config);if(avatar.mode==='bound'&&!avatar.binding)fail('USER_BINDING_REQUIRED','请在“用户身份”选择基点书的【角色】档案');let bound='',name=story.userName||'user';
 if(avatar.binding?.database){const snapshot=databaseSnapshot??await ctx.tisyaReadDatabase?.();if(!snapshot)fail('USER_DATABASE_MISSING','当前表单尚未读取，角色资料没有使用旧书替代');const projection=projectDatabaseIdentity(snapshot,avatar.binding);name=projection.name;bound=projection.text;}
 else if(avatar.binding)fail('USER_BINDING','请选择当前表单中的人物档案');
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
