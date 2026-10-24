import {validateWorldbookPreferences} from './config/worldbook-preferences.js';
// Native lorebooks remain authoritative. The console edits an explicit draft.
const clone=v=>structuredClone(v);
export const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const equal=(a,b)=>stable(a)===stable(b);
const PREFS='缇斯亚世界书';
const filterKeys=['characterFilterNames','characterFilterTags','characterFilterExclude'];
const originalExtra={group:'extensions.group',outletName:'extensions.outlet_name',useProbability:'extensions.use_probability',addMemo:'extensions.add_memo'};
function ensure(value,message){if(!value)throw Error(message);}
export function createWorldbookStore({native,getContext,readFresh,listNames,sanitizeName,persistSettings,orderAvailable=()=>true,getBindings=()=>({primary:'',extra:[],chat:'',persona:''}),conditionEngine=null,configurationBook=null}){
 let conditionRules=[],conditionError='',bases=new Map(),origins=new Map(),uiOrigins=new Map(),bookMap=new Map(),allocations=new Map(),settingsBase,prefsBase,activeBase,scopeBase,loaded=false,busy=false,version=0,pendingSettings=null;
 const scope=()=>{const c=getContext();return stable([c.characterId,c.groupId,c.chatId,getBindings()]);};
 const prefs=()=>{const state=configurationBook?.read();return clone(validateWorldbookPreferences(state?.ready?state.domains.worldbookInterface??{}:getContext().extensionSettings[PREFS]??{}));};
 const settings=()=>{const {world_info,...s}=native.getWorldInfoSettings();return clone(s);};
 const settingsMatch=()=>pendingSettings?equal(settings(),pendingSettings.settings)&&equal(native.selected_world_info,pendingSettings.active)&&(equal(prefs(),prefsBase)||equal(prefs(),pendingSettings.prefs)):equal(settings(),settingsBase)&&equal(native.selected_world_info,activeBase)&&equal(prefs(),prefsBase);
 const defs=()=>native.newWorldInfoEntryDefinition;
 const defaultFields=()=>Object.fromEntries(Object.entries(defs()).map(([k,d])=>[k,clone(d.default)]));
 async function refreshConditionRules(){conditionRules=[];conditionError='';if(!conditionEngine)return;try{const rules=await conditionEngine.describeRules();ensure(Array.isArray(rules),'条件规则列表格式无效');conditionRules=rules;}catch(e){conditionError=String(e.message??e);}}
 function toUI(raw,id,bid){const condition=raw.extensions?.tisyaWorldbook?.condition;return {...defaultFields(),...clone(raw),comment:String(raw.comment??''),content:String(raw.content??''),key:Array.isArray(raw.key)?clone(raw.key):raw.key?[String(raw.key)]:[],keysecondary:Array.isArray(raw.keysecondary)?clone(raw.keysecondary):raw.keysecondary?[String(raw.keysecondary)]:[],uid:id,sourceRef:id,book:bid,nativeUid:raw.uid,mode:condition?.mode==='external'?'condition':raw.constant?'constant':raw.vectorized?'vector':'keyword',provider:condition?.provider??'',ruleRef:condition?.ruleRef??'',ruleVersion:condition?.ruleVersion??null,characterFilterNames:clone(raw.characterFilter?.names??[]),characterFilterTags:clone(raw.characterFilter?.tags??[]),characterFilterExclude:raw.characterFilter?.isExclude??false};}
 async function completeSettings(){
  const pending=pendingSettings;ensure(pending,'没有待完成的世界书设置');ensure(scope()===scopeBase,'会话已切换，世界书配置草稿保留');ensure(settingsMatch(),'未完成的设置已被其他页面改变，请保留草稿核对');
  if(!pending.nativeSaved){ensure(await persistSettings()===true,'宿主尚未确认全局设置保存；请保留草稿并重试');pending.nativeSaved=true;}
  if(!equal(prefs(),pending.prefs)){
   const current=configurationBook?.read();ensure(current&&(current.ready||current.draft?.operationId===pending.operationId),'配置书尚未就绪，世界书界面草稿保留');
   if(current.draft?.operationId===pending.operationId)await configurationBook.retryDraft({expected:current});
   else await configurationBook.saveDomain('worldbookInterface',pending.prefs,pending.expected,{operationId:pending.operationId});
  }
  ensure(scope()===scopeBase&&equal(prefs(),pending.prefs),'世界书界面配置回读未完成');settingsBase=settings();activeBase=clone(pending.active);prefsBase=prefs();pendingSettings=null;
 }
 async function load(){
  ensure(!busy,'正在保存，请等待');const loadScope=scope();busy=true;
  try{await refreshConditionRules();if(pendingSettings)await completeSettings();const loadPrefs=prefs(),loadSettings=settings(),loadActive=clone(native.selected_world_info);await native.flushWorldInfoSaves('tisya_worldbook_load');const names=await listNames(),p=loadPrefs,binding=getBindings();
   ensure(p&&typeof p==='object'&&!Array.isArray(p),'世界书界面配置损坏');ensure(p.bookOrder===undefined||Array.isArray(p.bookOrder)&&p.bookOrder.every(n=>typeof n==='string'),'世界书队列配置损坏');ensure(p.tags===undefined||p.tags&&['prefix','suffix'].every(k=>Array.isArray(p.tags[k])&&p.tags[k].every(t=>typeof t==='string')),'标签配置损坏');const order=p.bookOrder??[];names.sort((a,b)=>{const ai=order.indexOf(a),bi=order.indexOf(b);return (ai<0?order.length:ai)-(bi<0?order.length:bi);});
   const next=new Map();for(const name of names){const data=await readFresh(name);ensure(data?.entries&&!Array.isArray(data.entries),'世界书格式无效：'+name);next.set(name,clone(data));}
   ensure(scope()===loadScope&&equal(prefs(),loadPrefs)&&equal(settings(),loadSettings)&&equal(native.selected_world_info,loadActive),'读取期间作用域或设置发生变化，请重新载入');
   bases=next;origins=new Map();uiOrigins=new Map();bookMap=new Map();allocations=new Map();const books=[],entries=[];let serial=0;
   for(const name of names){const id='book'+serial++;bookMap.set(id,name);const roles=[];if(native.selected_world_info.includes(name))roles.push('全局');if(binding.primary===name||binding.extra?.includes(name))roles.push('角色');if(binding.chat===name)roles.push('聊天');if(binding.persona===name)roles.push('人格');books.push({id,sourceBook:id,name,scope:roles.includes('角色')?'角色':roles[0]??'未绑定',sources:roles,enabled:native.selected_world_info.includes(name)});
    const data=bases.get(name);for(const raw of Object.values(data.entries).sort((a,b)=>(a.displayIndex??a.uid)-(b.displayIndex??b.uid))){ensure(Number.isInteger(raw.uid)||typeof raw.uid==='string'&&/^\d+$/.test(raw.uid),'条目 UID 无效：'+name);const eid=id+'e'+raw.uid;ensure(!uiOrigins.has(eid),'条目 UID 重复：'+name);const ui=toUI(raw,eid,id);entries.push(ui);origins.set(eid,{name,uid:raw.uid,raw:clone(raw)});uiOrigins.set(eid,clone(ui));}
   }
   settingsBase=settings();prefsBase=prefs();activeBase=clone(native.selected_world_info);scopeBase=scope();loaded=true;version++;
   const idFor=n=>books.find(b=>b.name===n)?.id??'';
   return {version,books,entries,tags:p.tags??{prefix:[],suffix:[]},auto:p.auto!==false,globalSettings:{...settingsBase,pin:!!p.pin,layoutOrder:!!p.layoutOrder},bindings:{primary:idFor(binding.primary),extra:(binding.extra??[]).map(idFor).filter(Boolean),chat:idFor(binding.chat),persona:idFor(binding.persona)},capabilities:{entrySave:true,globalSettings:true,characterLink:false,conditions:!!conditionEngine&&!conditionError,conditionError,conditionRules:clone(conditionRules),promptOrder:orderAvailable()}};
  }finally{busy=false;}
 }
 function validateField(key,value){const d=defs()[key];if(!d)return;if(value===null&&d.type.endsWith('?'))return;const type=d.type.replace('?','');if(type==='array')ensure(Array.isArray(value)&&value.every(x=>typeof x==='string'),'数组字段无效：'+key);else if(type==='boolean')ensure(typeof value==='boolean','开关字段无效：'+key);else if(type==='number'||type==='enum')ensure(Number.isInteger(value)&&value>=0,'数值字段无效：'+key);else ensure(typeof value==='string','文本字段无效：'+key);if(key==='probability')ensure(value<=100,'概率必须在 0–100 之间');if(key==='position')ensure(value<=7,'注入位置无效');if(key==='role')ensure(value<=2,'注入角色无效');if(key==='selectiveLogic')ensure(value<=3,'关键词逻辑无效');}
 function writeOriginal(data,raw,changed){if(!data.originalData?.entries)return;for(const key of changed){const path=native.originalWIDataKeyMap[key]??originalExtra[key];if(path)native.setWIOriginalDataValue(data,raw.uid,path,clone(raw[key]));if(key==='disable')native.setWIOriginalDataValue(data,raw.uid,'enabled',!raw.disable);if(key==='position')native.setWIOriginalDataValue(data,raw.uid,'position',raw.position===0?'before_char':'after_char');if(key==='characterFilter')native.setWIOriginalDataValue(data,raw.uid,'character_filter',clone(raw.characterFilter));}}
 function compile(input){
  ensure(Array.isArray(input.books)&&Array.isArray(input.entries),'世界书草稿格式无效');const ids=new Set(),names=new Set(),result=new Map();
  for(const b of input.books){ensure(typeof b.id==='string'&&!ids.has(b.id)&&typeof b.name==='string'&&b.name.trim()&&!names.has(b.name),'世界书名称或身份重复');ids.add(b.id);names.add(b.name);if(bookMap.has(b.id))ensure(bookMap.get(b.id)===b.name,'已存在世界书的改名请使用原生管理');result.set(b.name,clone(bases.get(b.name)??(bookMap.has(b.sourceBook)?{...bases.get(bookMap.get(b.sourceBook)),entries:{},originalData:bases.get(bookMap.get(b.sourceBook)).originalData?{...clone(bases.get(bookMap.get(b.sourceBook)).originalData),entries:[]}:undefined}:{entries:{}})));}
  for(const name of bookMap.values())ensure(names.has(name),'世界书删除请使用原生管理');
  const entriesSeen=new Set(),kept=new Map([...names].map(n=>[n,new Set()]));
  const reordered=new Set(input.books.filter(b=>!equal(input.entries.filter(e=>e.book===b.id).map(e=>e.uid),[...uiOrigins.values()].filter(e=>e.book===b.id).map(e=>e.uid))).map(b=>b.name));
  for(const e of input.entries){ensure(!entriesSeen.has(e.uid),'条目身份重复');entriesSeen.add(e.uid);const book=input.books.find(b=>b.id===e.book);ensure(book,'条目所属世界书不存在');const data=result.get(book.name),origin=origins.get(e.sourceRef??e.uid),before=uiOrigins.get(e.sourceRef??e.uid);let raw,uid;
   if(origin&&origin.name===book.name&&e.uid===(e.sourceRef??e.uid)){uid=origin.uid;raw=clone(origin.raw);}else{const akey=book.name+'\0'+e.uid;uid=allocations.get(akey);if(uid===undefined){const fresh=native.createWorldInfoEntry(book.name,data);ensure(fresh,'无法分配新条目 UID');uid=fresh.uid;allocations.set(akey,uid);}raw=origin?clone(origin.raw):clone(data.entries[uid]??{uid,...Object.fromEntries(Object.entries(defs()).filter(([,d])=>!d.excludeFromTemplate).map(([k,d])=>[k,clone(d.default)]))});raw.uid=uid;}
   const changed=[];for(const key of Object.keys(defs())){if(filterKeys.includes(key)||!Object.hasOwn(e,key))continue;if(!before||!equal(e[key],before[key])){validateField(key,e[key]);raw[key]=clone(e[key]);changed.push(key);}}
   if(!before||e.mode!==before.mode){ensure(['constant','keyword','vector','condition'].includes(e.mode),'未知激活方式');raw.constant=e.mode==='constant';raw.vectorized=e.mode==='vector';changed.push('constant','vectorized');}
   if(e.mode==='condition'&&conditionError&&origin?.name===book.name&&e.uid===(e.sourceRef??e.uid)&&equal(e,before)&&(!book.enabled||activeBase.includes(book.name))){/* Preserve an unchanged gated entry; runtime still denies unresolved gates. */}
   else if(e.mode==='condition'){const rule=conditionRules.find(r=>r.id===e.ruleRef);ensure(e.disable===true||conditionEngine&&rule&&rule.valid!==false,'请先选择当前会话已登记的门禁规则，或关闭条目');const pinned=e.ruleVersion??(before?.mode==='condition'&&before.ruleRef===e.ruleRef?before.ruleVersion:null);ensure(e.disable===true||pinned===rule.revision,'门禁版本已变化，请重新选择规则以确认更新');raw.disable=e.disable===true;raw.constant=false;raw.vectorized=false;raw.extensions={...raw.extensions,tisyaWorldbook:{...raw.extensions?.tisyaWorldbook,condition:{mode:'external',provider:rule?.provider??String(e.provider??''),ruleRef:String(e.ruleRef??''),ruleVersion:pinned??raw.extensions?.tisyaWorldbook?.condition?.ruleVersion}}};changed.push('disable','constant','vectorized');}
   else if(raw.extensions?.tisyaWorldbook?.condition){delete raw.extensions.tisyaWorldbook.condition;}
   if(filterKeys.some(k=>!before||!equal(e[k],before[k]))){for(const k of filterKeys)validateField(k,e[k]);raw.characterFilter={...raw.characterFilter,names:clone(e.characterFilterNames),tags:clone(e.characterFilterTags),isExclude:e.characterFilterExclude};changed.push('characterFilter');}
   const rank=kept.get(book.name).size;if(reordered.has(book.name)&&raw.displayIndex!==rank){raw.displayIndex=rank;changed.push('displayIndex');}data.entries[uid]=raw;kept.get(book.name).add(String(uid));
   // A moved/copied original entry keeps vendor metadata under its new UID.
   if(origin&&(origin.name!==book.name||e.uid!==(e.sourceRef??e.uid))&&data.originalData?.entries&&!data.originalData.entries.some(x=>String(x.uid)===String(uid))){const original=bases.get(origin.name)?.originalData?.entries?.find(x=>String(x.uid)===String(origin.uid));if(original)data.originalData.entries.push({...clone(original),uid});}
   writeOriginal(data,raw,changed);
  }
  for(const [name,data] of result){for(const uid of Object.keys(data.entries))if(!kept.get(name).has(uid)){delete data.entries[uid];native.deleteWIOriginalDataValue(data,uid);}}
  return result;
 }
 async function save(input){
  ensure(loaded,'请先载入世界书');ensure(!busy,'已有保存正在进行');ensure(input.version===version,'页面已更新，请重新载入');ensure(scope()===scopeBase,'角色或聊天已切换，请导出草稿后重新载入');busy=true;const saved=[];
  try{
   await refreshConditionRules();ensure(scope()===scopeBase,'条件登记读取期间会话变化');const compiled=compile(input);const active=input.books.filter(b=>b.enabled).map(b=>b.name);const desiredPrefs={...prefsBase,tags:clone(input.tags),auto:!!input.auto,pin:!!input.globalSettings.pin,layoutOrder:!!input.globalSettings.layoutOrder,bookOrder:input.books.map(b=>b.name)};
   validateWorldbookPreferences(desiredPrefs);if(!equal(desiredPrefs,prefsBase))ensure(configurationBook?.read().ready,'请先绑定并恢复配置书，再保存世界书界面设置');
   ensure(!desiredPrefs.layoutOrder||orderAvailable(),'此宿主缺少排布控制事件，请关闭“按队列顺序扫描与注入”');
   ensure(input.tags&&['prefix','suffix'].every(k=>Array.isArray(input.tags[k])&&input.tags[k].every(t=>typeof t==='string')),'标签格式无效');
   const desiredSettings={};for(const k of Object.keys(settingsBase)){ensure(Object.hasOwn(input.globalSettings,k),'缺少全局设置：'+k);const v=input.globalSettings[k];ensure(typeof v===typeof settingsBase[k]&&(typeof v!=='number'||Number.isInteger(v)&&v>=0),'全局设置无效：'+k);desiredSettings[k]=v;}
   ensure(desiredSettings.world_info_budget>=1&&desiredSettings.world_info_budget<=100,'预算百分比必须在 1–100 之间');ensure(!(desiredSettings.world_info_min_activations>0&&desiredSettings.world_info_max_recursion_steps>0),'最少激活与递归次数不能同时启用');
   await native.flushWorldInfoSaves('tisya_worldbook_preflight');const names=await listNames();
   ensure(settingsMatch(),'全局配置已被其他页面修改，请保留草稿并重新载入');
   // Validate every participating book before writing any. Native has no multi-book transaction.
   const writes=[];for(const [name,data] of compiled){if(bases.has(name)){ensure(names.includes(name),'世界书已被外部删除：'+name);const fresh=await readFresh(name);ensure(equal(fresh,bases.get(name)),'世界书已被其他页面修改：'+name);if(!equal(data,fresh))writes.push([name,data]);}else{ensure(!names.includes(name),'新书与已有世界书重名：'+name);ensure(await sanitizeName(name)===name,'名称含宿主不支持的字符，请修改：'+name);writes.push([name,data]);}}
   for(const [name,data] of writes){ensure(scope()===scopeBase,'角色或聊天在保存期间切换；已完成的书保留');if(bases.has(name))ensure(equal(await readFresh(name),bases.get(name)),'保存前世界书发生变化：'+name);await native.saveWorldInfo(name,clone(data),true);const actual=await readFresh(name);ensure(equal(actual,data),'宿主回读与提交不同：'+name);bases.set(name,clone(data));saved.push(name);}
   ensure(scope()===scopeBase,'角色或聊天在保存期间切换');ensure(settingsMatch(),'保存期间全局配置发生变化；条目保存结果已保留');
   if(pendingSettings||!equal(desiredSettings,settingsBase)||!equal(active,activeBase)||!equal(desiredPrefs,prefsBase)){if(pendingSettings){ensure(equal(pendingSettings.settings,desiredSettings)&&equal(pendingSettings.active,active)&&equal(pendingSettings.prefs,desiredPrefs),'已有待完成设置，请保持原草稿重试');}else pendingSettings={settings:clone(desiredSettings),active:clone(active),prefs:clone(desiredPrefs),expected:configurationBook?.read(),operationId:'worldbook-interface:'+crypto.randomUUID(),nativeSaved:false};native.updateWorldInfoSettings(clone(desiredSettings),clone(active));native.flushPendingWorldInfoSettings();await completeSettings();}
   await native.updateWorldInfoList();return {ok:true,saved};
  }catch(error){error.savedBooks=saved;throw error;}finally{busy=false;}
 }
 return {load,save,isBusy:()=>busy,hasUnconfirmedSettings:()=>!!pendingSettings,getVersion:()=>version,exportBook:id=>{const name=bookMap.get(id);ensure(name,'世界书不存在');return {name,data:clone(bases.get(name))};}};
}
