// Presentation preferences are projections of the form database. This module
// owns no store and never writes books, phone state, or business records.
export const EXTENSION_PREFERENCE_TABLE='T_PREF_EXTENSION_PRESENTATION';
export const EXTENSION_VIEWS=Object.freeze(['danmaku','rumor','notice','settlement','messages','theater','forum','news']);
export const AUDIENCE_KINDS=Object.freeze(['world_fans','higher_dimensional','mixed','none']);
export const MESSAGE_SUBTYPES=Object.freeze(['text','transfer','voice','image','news']);
export const EXTENSION_KINDS=Object.freeze([...MESSAGE_SUBTYPES,'forum','danmaku','theater','notice','rumor','settlement']);
const field=(key,label,type,extra={})=>({key,label,type,required:false,...extra});
export const EXTENSION_PREFERENCE_SCHEMA=Object.freeze({
 id:EXTENSION_PREFERENCE_TABLE,label:'扩展排版与来源偏好',partition:'IV',sheet:'偏好与演出',
 purpose:'关联既有输出配置。只保存启用、排版来源、材料来源与条数偏好；不另存运行事实。',
 fields:[field('row_uuid','稳定记录ID','ID',{required:true}),
  field('output_config_ref','所属输出配置','REF',{ref:'T_PREF_OUTPUT_CONFIG'}),
  field('owner_ref','所属主体','REF',{ref:'T_SYS_ENTITIES'}),field('world_ref','所属世界','REF',{ref:'T_STATIC_WORLDS'}),
  field('view_id','显示区域','ENUM',{enum:[...EXTENSION_VIEWS],required:true}),field('enabled','启用','BOOLEAN'),
  field('enabled_kinds','允许内容类型','TEXT_LIST'),field('style_book','画风来源书','TEXT'),field('style_uid','画风条目ID','TEXT'),field('style_digest','画风内容摘要','TEXT'),
  field('extension_book','扩展定义来源书','TEXT'),field('extension_uid','扩展定义条目ID','TEXT'),field('extension_digest','扩展定义内容摘要','TEXT'),
  field('world_sources','世界材料来源','ARRAY',{description:'明确选择的书定义或表单记录引用；选择本身不授予读取权限。'}),
  field('audience_sources','观众材料来源','ARRAY',{description:'观众身份/可知材料的引用；模板不等于已经存在或已经知情的角色。'}),
  field('audience_kind','观众本体类型','ENUM',{enum:[...AUDIENCE_KINDS],description:'本世界观众、高维观众、混合或无；未填保持未知，不默认全知或虚构在线人数。'}),
  field('generate_count','每轮生成目标条数','INTEGER',{description:'0表示本轮不生成；未知留空，不套默认。'}),
  field('display_limit','最多显示条数','INTEGER',{description:'0表示不显示；此值不会删除或改写已存历史。'}),
  field('topic_preferences','主题偏好','ARRAY',{description:'[{topic,mode:prefer|avoid,weight:0..1}]；偏好不是世界事实。'})],
 parent_table:'T_PREF_OUTPUT_CONFIG',parent_field:'output_config_ref',common_fields_access:'by_common_contract'
});
const fail=(code,message)=>{throw Object.assign(new Error(message),{code:'TISYA_EXTENSION_'+code});};
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const clone=v=>structuredClone(v);
const own=(v,k)=>Object.hasOwn(v,k);
function text(v,label,{nullable=false,max=4000}={}){
 if(v==null&&nullable)return null;
 if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v))fail('TEXT',label+'须为非空文本');
 return v;
}
function number(v,label,max){if(v==null)return null;if(!Number.isSafeInteger(v)||v<0||v>max)fail('COUNT',label+'须为0至'+max+'的整数');return v;}
export function normalizeRecordReference(value,{historical=false}={}){
 if(!plain(value))fail('REFERENCE','记录引用须为对象');
 const allowed=new Set(['tableId','recordId','snapshotId','revision']);
 if(Object.keys(value).some(k=>!allowed.has(k)))fail('REFERENCE','记录引用含未登记字段');
 const result={tableId:text(value.tableId,'表ID',{max:160}),recordId:text(value.recordId,'记录ID',{max:512})};
 if(value.snapshotId!=null)result.snapshotId=text(value.snapshotId,'历史快照ID',{max:512});
 if(value.revision!=null){if(!Number.isSafeInteger(value.revision)||value.revision<0)fail('REFERENCE','记录版本须为非负整数');result.revision=value.revision;}
 if(historical&&result.snapshotId===undefined&&result.revision===undefined)fail('HISTORY_REQUIRED','历史呈现须指定快照或版本，不能回落到当前记录');
 return result;
}
export function normalizeDefinitionReference(value){
 if(!plain(value)||Object.keys(value).some(k=>!['book','uid','digest'].includes(k)))fail('SOURCE','书定义引用格式无效');
 return {book:text(value.book,'来源书',{max:512}),uid:text(String(value.uid??''),'来源条目',{max:512}),digest:text(value.digest,'来源摘要',{max:256})};
}
function sourceRef(value){
 if(!plain(value))fail('SOURCE','材料来源须为引用对象');
 const {kind,...ref}=value;
 if(kind==='book')return {kind,...normalizeDefinitionReference(ref)};
 if(kind==='record')return {kind,...normalizeRecordReference(ref)};
 fail('SOURCE','材料来源类型须为book或record');
}
function sources(value,label){if(value===undefined)return [];if(!Array.isArray(value)||value.length>100)fail('SOURCE',label+'须为至多100项的明确引用列表');const result=value.map(sourceRef),keys=result.map(x=>JSON.stringify(x));if(new Set(keys).size!==keys.length)fail('SOURCE',label+'有重复引用');return result;}
export function normalizeExtensionPreferences(record){
 if(!plain(record))fail('PREFERENCES','扩展配置须来自一条表单记录');
 const values=plain(record.values)?record.values:record;
 const states=record.states??record.value_states;
 if(states!==undefined&&!plain(states))fail('PREFERENCES','表单值状态格式无效');
 const get=k=>states&&own(states,k)&&!['known','derived'].includes(states[k])?undefined:own(values,k)?values[k]:undefined;
 const result={};
 for(const key of ['row_uuid','output_config_ref','owner_ref','world_ref'])result[key]=text(get(key),key,{nullable:true,max:512});
 result.view_id=get('view_id')==='message'?'messages':get('view_id')??null;if(result.view_id!==null&&!EXTENSION_VIEWS.includes(result.view_id))fail('VIEW','显示区域未登记');
 result.enabled=get('enabled')??false;if(typeof result.enabled!=='boolean')fail('ENABLED','启用值须为布尔值');
 const kinds=get('enabled_kinds')??[];if(!Array.isArray(kinds)||kinds.some(k=>!EXTENSION_KINDS.includes(k))||new Set(kinds).size!==kinds.length)fail('KINDS','内容类型未登记或重复');result.enabled_kinds=[...kinds];
 for(const prefix of ['style','extension']){
  const keys=['book','uid','digest'].map(k=>prefix+'_'+k);for(const key of keys)result[key]=text(get(key),key,{nullable:true,max:512});
  const filled=keys.filter(k=>result[k]!==null).length;if(filled!==0&&filled!==3)fail('STYLE_SOURCE','定义来源须同时指定书、条目和内容摘要');
 }
 result.world_sources=sources(get('world_sources'),'世界材料');result.audience_sources=sources(get('audience_sources'),'观众材料');
 result.audience_kind=get('audience_kind')??null;if(result.audience_kind!==null&&!AUDIENCE_KINDS.includes(result.audience_kind))fail('AUDIENCE_KIND','观众本体类型未登记');
 result.generate_count=number(get('generate_count'),'生成条数',50);result.display_limit=number(get('display_limit'),'显示条数',200);
 const topics=get('topic_preferences')??[];if(!Array.isArray(topics)||topics.length>50)fail('TOPICS','主题偏好须为至多50项的数组');
 result.topic_preferences=topics.map(row=>{if(!plain(row)||Object.keys(row).some(k=>!['topic','mode','weight'].includes(k)))fail('TOPICS','主题偏好结构无效');const topic=text(row.topic,'主题',{max:500}),mode=row.mode??'prefer',weight=row.weight??1;if(!['prefer','avoid'].includes(mode)||!Number.isFinite(weight)||weight<0||weight>1)fail('TOPICS','主题倾向或权重无效');return {topic,mode,weight};});
 if(result.enabled&&!result.view_id)fail('VIEW','启用前须选择显示区域');
 return result;
}
const layoutByView={message:'messages',danmaku:'danmaku',rumor:'feed',notice:'notice',settlement:'ledger',messages:'messages',theater:'theater',forum:'forum',news:'news'};
const names={message:'消息',danmaku:'弹幕',rumor:'风闻',notice:'公告',settlement:'结算展示',messages:'近日留言回读',theater:'小剧场',forum:'论坛',news:'新闻'};
export function builtinExtensionDefinitions(){return EXTENSION_VIEWS.map(view=>({format:'tisya.extension-definition/1',kind:'extension',id:'extension.'+view,view,name:names[view],layout:layoutByView[view],allowedKinds:view==='messages'?[...MESSAGE_SUBTYPES]:view==='forum'?['forum','text','image','news']:view==='settlement'?['transfer','settlement']:[view==='danmaku'?'danmaku':view==='theater'?'theater':view==='news'?'news':'text'],counts:{min:0,max:50,default:5},topicTags:[],sourceRoles:['world','audience']}));}
export function builtinPresentationDefinitions(){return [{format:'tisya.presentation-definition/1',kind:'presentation',id:'presentation.existing',name:'既有缇斯亚排版',views:[...EXTENSION_VIEWS],messageSubtypes:[...MESSAGE_SUBTYPES],tokens:{density:'comfortable',alignment:'start',emphasis:'existing'}}];}
export function validateExtensionDefinition(value){
 if(!plain(value))fail('DEFINITION','定义须为对象');const d=clone(value);text(d.id,'定义ID',{max:256});text(d.name,'定义名称',{max:500});
 if(d.kind==='presentation'){
  if(d.format!=='tisya.presentation-definition/1'||!Array.isArray(d.views)||d.views.some(v=>!EXTENSION_VIEWS.includes(v))||!Array.isArray(d.messageSubtypes)||d.messageSubtypes.some(v=>!MESSAGE_SUBTYPES.includes(v)))fail('DEFINITION','美化定义契约无效');
  const tokens=d.tokens??{};if(!plain(tokens)||Object.keys(tokens).some(k=>!['density','alignment','emphasis'].includes(k))||!['comfortable','compact'].includes(tokens.density??'comfortable')||!['start','center'].includes(tokens.alignment??'start')||!['existing','quiet'].includes(tokens.emphasis??'existing'))fail('STYLE_TOKEN','只允许登记的画风令牌，不能注入CSS或HTML');
  d.tokens={density:tokens.density??'comfortable',alignment:tokens.alignment??'start',emphasis:tokens.emphasis??'existing'};
 }else if(d.kind==='extension'){
  if(d.format!=='tisya.extension-definition/1'||!EXTENSION_VIEWS.includes(d.view)||d.layout!==layoutByView[d.view]||!Array.isArray(d.allowedKinds)||d.allowedKinds.some(k=>!EXTENSION_KINDS.includes(k)))fail('DEFINITION','扩展版式定义无效');
  const c=d.counts;if(!plain(c)||number(c.min,'最少条数',50)===null||number(c.max,'最多条数',50)===null||number(c.default,'建议条数',50)===null||c.min>c.max||c.default<c.min||c.default>c.max)fail('DEFINITION','定义条数范围无效');
  if(!Array.isArray(d.topicTags)||d.topicTags.some(v=>typeof v!=='string'||v.length>500)||!Array.isArray(d.sourceRoles)||d.sourceRoles.some(v=>!['world','audience'].includes(v)))fail('DEFINITION','定义材料来源或主题无效');
 }else fail('DEFINITION','未登记的定义类型');
 const allowed=d.kind==='presentation'?['format','kind','id','name','views','messageSubtypes','tokens']:['format','kind','id','view','name','layout','allowedKinds','counts','topicTags','sourceRoles'];
 if(Object.keys(d).some(k=>!allowed.includes(k)))fail('DEFINITION','定义含未登记字段');return d;
}
function sourceKey(r){return r.kind==='book'?'book:'+JSON.stringify([r.book,r.uid,r.digest]):'record:'+JSON.stringify([r.tableId,r.recordId,r.snapshotId??null,r.revision??null]);}
export function compileExtensionPreferences(record,{definitions=[],context={},sourceMaterials=[]}={}){
 const p=normalizeExtensionPreferences(record);
 for(const [field,key] of [['owner_ref','ownerId'],['world_ref','worldId']])if(p[field]!==null&&context[key]!==p[field])fail('SCOPE','扩展配置不属于当前'+(key==='ownerId'?'主体':'世界'));
 const definitionsByKey=new Map();
 for(const row of definitions){if(!plain(row)||!plain(row.definition))fail('DEFINITION','实际书定义须附来源与definition');const source=normalizeDefinitionReference(row.source??{book:row.book,uid:row.uid,digest:row.digest}),d=validateExtensionDefinition(row.definition),key=JSON.stringify([source.book,source.uid,source.digest]);if(definitionsByKey.has(key))fail('DEFINITION','同一书定义身份重复');definitionsByKey.set(key,{source,definition:d});}
 let presentation=null,extension=null;
 if(p.style_book!==null){const key=JSON.stringify([p.style_book,p.style_uid,p.style_digest]);presentation=definitionsByKey.get(key);if(!presentation||presentation.definition.kind!=='presentation')fail('STYLE_MISSING','选定画风不存在或内容摘要已变化，请明确重新选择');if(p.view_id&&!presentation.definition.views.includes(p.view_id))fail('STYLE_VIEW','选定画风不支持此区域');}
 if(p.extension_book!==null){const key=JSON.stringify([p.extension_book,p.extension_uid,p.extension_digest]);extension=definitionsByKey.get(key);if(!extension||extension.definition.kind!=='extension')fail('DEFINITION_MISSING','选定扩展定义不存在或内容摘要已变化，请明确重新选择');if(extension.definition.view!==p.view_id)fail('DEFINITION_VIEW','选定扩展定义不属于此区域');if(p.generate_count!==null&&p.generate_count!==0&&(p.generate_count<extension.definition.counts.min||p.generate_count>extension.definition.counts.max))fail('COUNT','生成条数不在选定定义允许范围内');}
 // Materials are already permission-filtered by the caller. Every selected
 // source must be explicitly present and allowed; selecting is not permission.
 const materialMap=new Map();for(const item of sourceMaterials){if(!plain(item)||!['world','audience'].includes(item.role)||item.allowed!==true)continue;const ref=sourceRef(item.source);const key=item.role+':'+sourceKey(ref);if(materialMap.has(key))fail('SOURCE','材料投影重复');materialMap.set(key,{source:ref,role:item.role,content:clone(item.content??null)});}
 const pick=(rows,role)=>rows.map(ref=>{const item=materialMap.get(role+':'+sourceKey(ref));if(!item)fail('SOURCE_UNAVAILABLE','选定'+(role==='world'?'世界':'观众')+'材料当前不可读取');return clone(item);});
 const materials={world:pick(p.world_sources,'world'),audience:p.audience_kind==='none'?[]:pick(p.audience_sources,'audience')};
 const kinds=p.enabled_kinds.filter(k=>(!presentation||!MESSAGE_SUBTYPES.includes(k)||presentation.definition.messageSubtypes.includes(k))&&(!extension||extension.definition.allowedKinds.includes(k)));
 if(extension)for(const role of ['world','audience'])if(materials[role].length&&!extension.definition.sourceRoles.includes(role))fail('SOURCE_ROLE','选定扩展定义不接受此类材料');
 const needsAudience=['forum','danmaku'].includes(p.view_id),audienceReady=!needsAudience||p.audience_kind!==null&&p.audience_kind!=='none';
 const generation={enabled:p.enabled&&!!extension&&p.generate_count!==null&&p.generate_count>0&&kinds.length>0&&audienceReady,count:p.generate_count,audienceKind:p.audience_kind,topics:clone(p.topic_preferences),materials};
 const display={enabled:p.enabled&&p.display_limit!==null&&p.display_limit>0&&kinds.length>0,limit:p.display_limit,layout:p.view_id?layoutByView[p.view_id]:null,kinds,tokens:presentation?clone(presentation.definition.tokens):null};
 const contract={format:'tisya.extension-compiled/1',preferenceId:p.row_uuid,scope:{ownerId:p.owner_ref,worldId:p.world_ref},view:p.view_id,outputConfigRef:p.output_config_ref,presentation:presentation?clone(presentation):null,extension:extension?clone(extension):null,generation,display};
 return {...contract,prompt:generation.enabled?'[EXTENSION.CONFIG]\n'+JSON.stringify({view:contract.view,count:generation.count,kinds,audienceKind:p.audience_kind,topics:generation.topics,world:materials.world,audience:materials.audience,rules:['仅使用当前获准材料；来源选择不扩大人物知情或可见范围。','观众模板不是已存在的角色或真实在线人数。',({world_fans:'本世界观众只依据该世界已公开或明确获准的信息，不默认在场或已知私密。',higher_dimensional:'高维观众属于选定输出设定；高维不等于自动全知，仍受所选材料边界限制。',mixed:'混合观众须分别标明本体归属，不因并列而互通私密知识。',none:'不生成观众发言。'})[p.audience_kind]??'观众本体尚未配置，不生成有身份归属的观众发言。','内容仅写入已授权表单路径；渲染标记不结算、不推进时间、不创建媒体。']})+'\n[/EXTENSION.CONFIG]':''};
}
export function extensionPreferenceRecordId({worldId,ownerId,view}){
 if(view==='message')view='messages';
 text(worldId,'世界ID',{max:512});text(ownerId,'主体ID',{max:512});if(!EXTENSION_VIEWS.includes(view))fail('VIEW','显示区域未登记');
 return 'extension:'+encodeURIComponent(worldId)+':'+encodeURIComponent(ownerId)+':'+view;
}
