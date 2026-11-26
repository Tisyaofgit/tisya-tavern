import BUILTIN from '../data/tag-system/builtin.json' with {type:'json'};
const RESOURCE_TYPES=['corpora','techniques','chains'];
const OWNER_TYPES=new Set(['world','character','relation','user']);
const SCOPE_TYPES=new Set(['global','story','character','pair','scene']);
const TIERS=new Set(['full','brief','coordinate_only']);
const number=v=>typeof v==='number'&&Number.isFinite(v)?Math.max(0,Math.min(100,v)):null;
const parse=(v,fallback={})=>{if(v&&typeof v==='object')return v;try{return JSON.parse(v||'')??fallback;}catch{return fallback;}};
const text=v=>typeof v==='string'?v.trim():'';
const renderText=v=>typeof v==='string'?v:Array.isArray(v)?v.map(renderText).join('\n'):v&&typeof v==='object'?Object.entries(v).map(([k,x])=>k+'：'+renderText(x)).join('\n'):String(v??'');
const preferenceStrength=v=>typeof v==='string'?({禁止:0,偏好:1,喜爱:2,必须:3}[v]??2):Math.min(3,Math.max(0,Number(v??2)||0));
export function validateExtensionPack(pack,{allowDisabled=false}={}){
 const errors=[];if(!pack||typeof pack!=='object')return ['扩展包必须是对象'];
 const m=pack.manifest??{};for(const k of ['package','name','version','schema_version','namespace'])if(m[k]==null||m[k]==='')errors.push('manifest.'+k+' 缺失');
 for(const type of ['poles','axes',...RESOURCE_TYPES,'tags'])if(!Array.isArray(pack[type]))errors.push(type+' 必须是数组');
 if(errors.length)return errors;
 const all=['poles','axes',...RESOURCE_TYPES,'tags'].flatMap(t=>pack[t]),ids=new Set();
 for(const x of all){if(!x?.id)errors.push('资源缺少 id');else if(ids.has(x.id))errors.push('重复 ID：'+x.id);else ids.add(x.id);}
 const resources=new Set(RESOURCE_TYPES.flatMap(t=>pack[t].map(x=>x.id)));
 for(const a of pack.axes)for(const id of a.poles??[])if(!pack.poles.some(p=>p.id===id))errors.push(a.id+' 引用不存在的极点 '+id);
 for(const t of pack.tags){if(!t.label)errors.push(t.id+' 缺少名称');for(const o of t.owners??[])if(!OWNER_TYPES.has(o))errors.push(t.id+' 归属无效');for(const s of t.scopes??[])if(!SCOPE_TYPES.has(s))errors.push(t.id+' 作用域无效');for(const type of RESOURCE_TYPES)for(const id of t.resources?.[type]??[])if(!resources.has(id))errors.push(t.id+' 引用不存在的资源 '+id);}
 return errors;
}
export function createTagRegistry(packs=[]){
 const registry={poles:new Map(),axes:new Map(),corpora:new Map(),techniques:new Map(),chains:new Map(),tags:new Map(),packs:[]};
 const add=pack=>{for(const type of ['poles','axes',...RESOURCE_TYPES,'tags'])for(const x of pack[type]??[]){if(registry[type].has(x.id))throw Error('重复标签资源 ID：'+x.id);registry[type].set(x.id,x);}registry.packs.push(pack.manifest);};
 add(BUILTIN);for(const pack of packs){if(pack?.enabled!==true)continue;const errors=validateExtensionPack(pack);if(errors.length)throw Error(errors.join('\n'));add(pack);}return registry;
}
export function characterCoordinates(row,{readingOffset={}}={}){
 const base=parse(row?.values?.persona_coordinates_json),growth=parse(row?.values?.coordinate_growth_json),offset=readingOffset??{},out={};
 for(const k of new Set([...Object.keys(base),...Object.keys(growth),...Object.keys(offset)])){const b=number(base[k]);if(b==null){out[k]=null;continue;}out[k]=Math.max(0,Math.min(100,b+(Number(growth[k])||0)+(Number(offset[k])||0)));}return out;
}
export function coordinateMatch(trigger,coordinates){
 if(!trigger?.center)return {matched:false,score:0,known:0,total:0};
 const center=trigger.center,radius=trigger.radius??{},weights=trigger.weights??{},keys=Object.keys(center);let sum=0,weight=0,known=0;
 for(const k of keys){const value=number(coordinates[k]);if(value==null)continue;known++;const r=Math.max(1,Number(radius[k])||25),w=Number(weights[k])||1,d=Math.abs(value-(Number(center[k])||0));if(d>r)return {matched:false,score:0,known,total:keys.length};sum+=(1-d/r)*w;weight+=w;}
 const min=Math.max(1,Number(trigger.min_known_axes)||1),score=weight?sum/weight:0;
 return {matched:known>=min&&score>=.25,score,known,total:keys.length,confidence:keys.length?known/keys.length:0};
}
function tagPreferenceRows(state,globalRows={}){return [...Object.values(globalRows??{}),...Object.values(state?.tables?.T_PREF_SCOPES??{}).map(r=>({...r.values,id:r.values.id}))].filter(v=>v.group==='USER'&&v.enabled!==false&&v.confirmation_state!=='pending'&&text(v.tag_id));}
export function preferenceExtensionPacks(state,globalRows={}){return [...Object.values(globalRows??{}),...Object.values(state?.tables?.T_PREF_SCOPES??{}).map(r=>r.values)].filter(v=>v.owner_type==='extension_pack'&&v.enabled!==false).map(v=>({...parse(v.tag_config_json),enabled:true})).filter(v=>v.manifest);}
export function preferenceProjectionTier(state,globalRows={},fallback='full'){const rows=[...Object.values(globalRows??{}),...Object.values(state?.tables?.T_PREF_SCOPES??{}).map(r=>r.values)].filter(v=>v.owner_type==='projection_setting'&&v.enabled!==false);return rows.at(-1)?.projection_tier||parse(rows.at(-1)?.tag_config_json).tier||fallback;}
export function readingOffsets(state,globalRows={}){const out={};for(const r of tagPreferenceRows(state,globalRows)){if(r.owner_type!=='user')continue;const c=parse(r.tag_config_json);if(c.reading_offset)for(const [k,v]of Object.entries(c.reading_offset))out[k]=(out[k]||0)+(Number(v)||0);}return out;}
function scopeMatches(row,worldId){const scope=row.scope_type||'global';if(scope==='global'||scope==='story')return true;if(scope==='scene')return !worldId||!row.subject_ref||row.subject_ref===worldId;return true;}
export function compileTagProjection({state,globalRows={},packs=[],tier=null,activeCharacterIds=null,worldId=null}={}){
 tier??=preferenceProjectionTier(state,globalRows);if(!TIERS.has(tier))throw Error('未知标签投影档位：'+tier);const worldPacks=Object.values(state?.tables?.T_STATIC_WORLDS??{}).filter(r=>r.values?.tag_pack_status==='enabled'&&r.values?.tag_pack_json).map(r=>({...parse(r.values.tag_pack_json),enabled:true})),registry=createTagRegistry([...worldPacks,...preferenceExtensionPacks(state,globalRows),...packs]),offsets=readingOffsets(state,globalRows),characters=Object.entries(state?.tables?.T_CHAR_DOSSIER??{}).filter(([id])=>!activeCharacterIds||activeCharacterIds.includes(id)),relations=Object.values(state?.tables?.T_DYN_RELATION_AXES??{}),preferences=tagPreferenceRows(state,globalRows),selected=new Map(),hits=[];
 const add=(tag,source,strength=2,scope='story')=>{if(!tag||tag.status==='disabled')return;const key=tag.id+'|'+source.owner+'|'+source.subject+'|'+scope,old=selected.get(key);selected.set(key,{tag,source,strength:Math.min(3,Math.max(strength,old?.strength??0)),scope});};
 for(const tag of registry.tags.values()){
  if(tag.owners.includes('world'))for(const [id,row]of Object.entries(state?.tables?.T_STATIC_WORLDS??{})){if(worldId&&id!==worldId)continue;const own=parse(row.values?.world_tag_ids,[]),pack=parse(row.values?.tag_pack_json);if(tag.trigger?.types?.includes('world')&&(Array.isArray(own)&&own.includes(tag.id)||pack.tags?.some(t=>t.id===tag.id)))add(tag,{owner:'world',subject:id},3,'story');}
  if(tag.owners.includes('character'))for(const [id,row]of characters){const coords=characterCoordinates(row,{readingOffset:offsets}),match=coordinateMatch(tag.trigger,coords);if(tag.trigger?.types?.includes('coordinate')&&match.matched)add(tag,{owner:'character',subject:id},2,'character');const own=parse(row.values?.character_tag_ids,[]);if(Array.isArray(own)&&own.includes(tag.id))add(tag,{owner:'character',subject:id},3,'character');}
  if(tag.owners.includes('relation'))for(const [id,row]of Object.entries(state?.tables?.T_DYN_RELATION_AXES??{})){const own=parse(row.values?.relation_tag_ids,[]);if(Array.isArray(own)&&own.includes(tag.id))add(tag,{owner:'relation',subject:id},3,'pair');const coords=characterCoordinates({values:{persona_coordinates_json:row.values?.relation_coordinates_json,coordinate_growth_json:row.values?.relation_growth_json}},{readingOffset:offsets}),match=coordinateMatch(tag.trigger,coords);if(tag.trigger?.types?.includes('coordinate')&&match.matched)add(tag,{owner:'relation',subject:id},2,'pair');}
 }
 for(const row of preferences){const tag=registry.tags.get(row.tag_id);if(!tag||!scopeMatches(row,worldId))continue;add(tag,{owner:row.owner_type||'user',subject:row.subject_ref||'user'},preferenceStrength(row.strength??row.preference),row.scope_type||'story');}
 const resources=new Map(),slots=new Map(),chains=new Map();
 for(const item of selected.values()){for(const type of RESOURCE_TYPES)for(const id of item.tag.resources?.[type]??[]){const resource=registry[type].get(id);if(!resource)continue;const stage=type==='chains'?(resource.stages?.[0]?.id??'start'):'—',key=id+'|'+item.scope+'|'+stage,slot=resource.slot||item.tag.slot||type,old=resources.get(key);if(old){old.sources.push(item.source);old.strength=Math.max(old.strength,item.strength);continue;}const entry={type,id,slot,resource,scope:item.scope,stage,strength:item.strength,sources:[item.source]};resources.set(key,entry);if(!slots.has(slot))slots.set(slot,entry);if(type==='chains'&&!chains.has(id))chains.set(id,entry);}}
 const lines=['[TAG.SYSTEM]','投影档位：'+tier+'；坐标由基础值、事件成长与阅读偏移合成。'];
 if(tier==='coordinate_only'){
  for(const a of registry.axes.values())lines.push('坐标组 '+a.id+'：'+(a.poles??[]).map(id=>registry.poles.get(id)?.label??id).join(' × '));
  for(const {tag,source,strength}of selected.values())lines.push(`${tag.id}｜${tag.label}｜${source.owner}:${source.subject}｜强度${strength}｜资源 ${RESOURCE_TYPES.flatMap(t=>tag.resources?.[t]??[]).join('、')||'无'}`);
 }else{
  for(const [slot,entry]of slots){const r=entry.resource,brief=tier==='brief';let body='';if(entry.type==='corpora')body=brief?r.brief:r.full;else if(entry.type==='techniques')body=brief?r.variants?.brief??r.brief:r.variants?.full??r.full??Object.entries(r.steps??{}).map(([k,v])=>`${k}：${v}`).join('；');else body=(r.stages??[]).map(s=>brief?s.brief:`${s.name}：目标 ${s.goal}；行动 ${s.action}；完成 ${s.complete}；回退 ${s.rollback_to}`).join('\n');lines.push(`[${slot}｜${entry.id}｜强度${entry.strength}]\n${renderText(body)}`);}
 }
 lines.push('[/TAG.SYSTEM]');return {text:lines.join('\n'),hits:[...selected.values()],resources:[...resources.values()],characters:characters.map(([id,row])=>({id,coordinates:characterCoordinates(row,{readingOffset:offsets})})),relations:relations.length};
}
export function buildWorldTagPack(world,{namespace='custom.world',author='缇斯亚创世'}={}){
 const id=world.id||world.recordId||'world',prefix=namespace+'.'+id,name=world.name||world.values?.name||id,genre=world.genre||world.values?.genre||'综合';
 const corpus={id:prefix+'.rules',label:name+'世界规则',slot:'world.rules',brief:text(world.description)||name,full:[world.description,world.rules,world.world_rules].filter(x=>text(x)).join('\n')||name};
 const technique={id:prefix+'.style',label:name+'叙事组织',slot:'world.style',purpose:'保持世界类型、语气和场景材料一致',steps:{observe:'观察当前场景目标、在场人物和已发生事实',select:'从世界规则与类型材料中选择本轮直接相关内容',express:'使用世界自身语汇组织动作、对话与环境反馈',follow:'把可验证变化交给事件归档，把未决行动留在场景中'},variants:{brief:'依据世界规则选材，延续类型语气并衔接事件归档。',full:'先确认当前场景目标与已发生事实，再从世界规则中选择本轮材料；以世界自身语汇组织动作、对话和环境反馈，结尾保留可继续行动的空间。'}};
 const tag={id:prefix+'.resident',label:name+'常驻世界',owners:['world'],scopes:['story'],slot:'world.rules',trigger:{mode:'all',types:['world']},resources:{corpora:[corpus.id],techniques:[technique.id],chains:[]},preference:3,status:'enabled',version:1};
 const candidate={id:prefix+'.candidates',label:genre+'类型候选',owners:['world','user'],scopes:['story','scene'],slot:'world.genre',trigger:{mode:'any',types:['tag'],scenes:['类型强化']},resources:{corpora:[],techniques:[technique.id],chains:[]},preference:1,status:'candidate',version:1};
 return {manifest:{package:prefix,name:name+'配套 Tags',version:'1.0.0',schema_version:1,author,description:'由创世字段确定性组装的配套标签；世界规则常驻，类型技法按场景候选。',depends:[],namespace:prefix},poles:[],axes:[],corpora:[corpus],techniques:[technique],chains:[],tags:[tag,candidate]};
}
export function worldTagChanges(changes,state){return changes.map(c=>{if(c.tableId!=='T_STATIC_WORLDS'||!c.values)return c;const old=state?.tables?.T_STATIC_WORLDS?.[c.recordId]?.values??{};if(old.tag_pack_user_edits||c.values.tag_pack_user_edits||c.values.tag_pack_json)return c;const pack=buildWorldTagPack({...old,...c.values,id:c.recordId});return {...c,values:{...c.values,tag_pack_json:JSON.stringify(pack),tag_pack_status:'enabled',tag_pack_user_edits:old.tag_pack_user_edits??''}};});}
