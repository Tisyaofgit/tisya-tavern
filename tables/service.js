import {tableSettings,copy,check,derive,registryIndex,validateRow} from './schema.js';
import {createBookGateway,digest} from './books.js';
import {sources,selectedMessages,memoryBlock,taskTags,project,parseJSONResponse,prepareCommit,retrieval,sourceTime,dueChecks} from './ledger.js';
import {worldbookEntries,createWorldbookProjection} from './worldbook-context.js';
import {NARRATIVE_TAGS} from './prompts.js';
const fields=['objects','facts','scene','state','relations','cognition','holdings','tasks','timers','clues','events'];
const cardBasis=c=>{const card=c.characters?.[c.characterId],data=card?.data??card??{};return [card?.name,data.description,data.personality,data.scenario].filter(x=>typeof x==='string'&&x).join('\n\n');};
const stampChat=c=>JSON.stringify(selectedMessages(c.chat).map(m=>[!!m.is_user,m.name??'',m.mes??'',m.swipe_id??0]));
export function createTableService({store,getContext,request,books=createBookGateway(),vector=null,onNotice=()=>{},setPrompt=()=>{}}){
 let busy=false,controller=null,latest=null;const jobs=[],worldbook=createWorldbookProjection({getContext});
 const state=()=>({busy,jobs:copy(jobs),latest:copy(latest),available:books.available(),worldbook:worldbook.preview()});
 const status=(task,status,detail='')=>{jobs.push({task,status,detail,at:new Date().toISOString()});if(jobs.length>50)jobs.shift();onNotice({task,status,detail});};
 async function exclusive(fn){check(!busy,'表单任务正在处理，请等待完成或停止');busy=true;controller=new AbortController();try{return await fn(controller.signal);}finally{busy=false;controller=null;}}
 function capture(){const snapshot=store.read(),chat=stampChat(getContext());return {...snapshot,settings:tableSettings(snapshot.world),chat,guard(){const now=store.read();check(now.key===snapshot.key&&now.revision===snapshot.revision&&stampChat(getContext())===chat,'聊天、候选或配置已改变，旧辅助结果未提交到当前进度');controller?.signal.throwIfAborted();}};}
 async function load(c,type='normal'){check(c.settings.originBook&&c.settings.sessionBook,'请先在“表单推进”中创建／绑定世界书');const origin=await books.read(c.settings.originBook),session=await books.read(c.settings.sessionBook);c.guard();check(origin.data.kind==='origin'&&session.data.kind==='session','原点书／会话存档类型不匹配');check(session.data.owner===c.key,'此存档属于另一会话；请为当前会话创建独立存档');const chain=await sources(getContext().chat,type);c.guard();const view=project(origin.data,session.data,chain.map(s=>s.key));return {origin,session,chain,view};}
 async function invoke(task,input,c,signal){status(task,'运行中');try{const result=parseJSONResponse(await request(task,JSON.stringify(input),{signal}));c.guard();status(task,'返回待校验');return result;}catch(e){status(task,'失败',e.message);throw e;}}
 async function commit(c,loaded,proposal,options){
  const prepared=prepareCommit(loaded.view,proposal,{...options,sourceOrder:Object.fromEntries(loaded.chain.map(s=>[s.key,s.index]))});c.guard();let origin=loaded.origin;
  const bases=prepared.commit.changes.filter(ch=>ch.after.table==='objects');
  if(bases.length||JSON.stringify(prepared.registry)!==JSON.stringify(origin.data.registry)){
   const next=copy(origin.data);next.revision++;next.registry=prepared.registry;
   for(const change of bases){change.after.rev=Math.max(change.after.rev,...next.bases.filter(b=>b.id===change.id).map(b=>b.rev+1));next.bases.push(copy(change.after));change.origin=change.id+'@'+change.after.rev;delete change.after;}
   origin=await books.write(origin,next,c.guard);
  }
  const next=copy(loaded.session.data);next.revision++;if(options.importSource)prepared.commit.importSource=copy(options.importSource);next.commits.push(prepared.commit);
  try{const session=await books.write(loaded.session,next,c.guard);status(options.kind,'已保存',prepared.commit.changes.length+' 项修改');return {...loaded,origin,session,view:project(origin.data,session.data,loaded.chain.map(s=>s.key))};}
  catch(e){if(origin.stamp!==loaded.origin.stamp)throw Error('原点候选版本已保存，但会话提交未确认；未绑定版本不会注入。'+e.message);throw e;}
 }
 async function archiveLoaded(c,loaded,signal,includeLatest=false,range=null){
  if(!c.settings.archive&&!range)return loaded;
  const ai=loaded.chain.filter(s=>s.role==='assistant'),eligible=(includeLatest?ai:ai.slice(0,-1)).filter(s=>!range||(s.floor>=range.from&&s.floor<=range.to)).filter(s=>!loaded.view.archived.has(s.key)).slice(0,range?.limit??Infinity);
  for(const source of eligible){
   if(loaded.view.archived.has(source.key))continue;
   c.guard();status('楼层归档','运行中','第 '+source.floor+' 层');
   const input={registry:loaded.view.registry,currentRows:loaded.view.rows.map(r=>({...r,sourceFloor:loaded.chain.find(s=>s.key===r.source)?.floor??null})),archiveSource:{...source,memory:memoryBlock(source.text),tags:taskTags(source.text)},memoryOwnedBySource:!!memoryBlock(source.text),instruction:'仅处理这一条已保留来源；最新回复不在输入内。',objectsSeparate:c.settings.objectsSeparate};
   const isHistory=!!range;let proposal=await invoke(isHistory?'historyImport':'tableArchive',input,c,signal);
   if(c.settings.objectsSeparate){const objects=await invoke('objectArchive',input,c,signal);check(!proposal.changes.some(x=>['objects','facts'].includes(x.table)),'已启用独立建档：归档 API 不应重复填写对象／事实');proposal={templates:[...(proposal.templates??[]),...(objects.templates??[])],changes:[...objects.changes,...proposal.changes]};}
   const summary=memoryBlock(source.text);
   if(summary){check(!proposal.changes.some(x=>x.table==='events'||x.table==='历史事件记忆'),'此楼层已有记忆块，事件摘要由程序保留；辅助 API 只填写其他表');proposal={...proposal,changes:[...proposal.changes,{id:'new:source-memory',table:'events',expected:0,values:{名称:'第 '+source.floor+' 层记忆',经过:summary},access:{readers:[],knowers:[]},evidence:summary}]};}
   loaded=await commit(c,loaded,proposal,{source:source.key,kind:isHistory?'history':'archive',worldTime:sourceTime(source.text),evidence:source.text,allowedTables:loaded.view.registry.tables.filter(t=>t.owner==='archive').map(t=>t.id)});
  }
  return loaded;
 }
 async function assemble(c,loaded,type,signal,{runPlan=true}={}){
  const chain=loaded.chain,lastAI=chain.findLast(s=>s.role==='assistant'),user=chain.findLast(s=>s.role==='user'),tags=taskTags(lastAI?.text??'');
  if(c.settings.preferences&&user&&!loaded.view.commits.some(x=>x.kind==='preferences'&&x.source===user.key)){
   const proposal=await invoke('preferenceAnalysis',{registry:loaded.view.registry,currentRows:loaded.view.rows.filter(r=>r.table==='preferences'),userInput:user.text,generationType:type,explicitRules:c.settings.hardRules,antiCliche:c.world.modes[c.world.mode]?.narrative?.缇斯亚叙事防八股===true},c,signal);
   loaded=await commit(c,loaded,proposal,{source:user.key,kind:'preferences',evidence:user.text,allowedTables:['preferences']});
  }
  let found=retrieval(loaded.view,{tags,query:user?.text??'',topK:c.settings.topK});
  if(c.settings.retrieval==='vector'&&c.settings.topK){check(vector,'尚未接入向量驱动；请配置原生向量 API 或选关键词');found.optional=await vector.search({scope:loaded.session.data.id,rows:loaded.view.rows.filter(r=>['objects','facts','events'].includes(r.table)),query:user?.text??'',topK:c.settings.topK,signal,guard:c.guard});c.guard();}
  const selected=[...new Map([...found.mandatory,...found.optional].map(r=>[r.id,r])).values()];
  const data={format:'tisya.context/1',source:'本轮表单资料。人物知识与读者可见范围仍以每行 access 为准；读者展示开关不授予人物知识。',originBook:loaded.origin.name,sessionBook:loaded.session.name,revision:loaded.session.data.revision,rows:derive(selected,loaded.view.registry),latestTemporary:lastAI?{source:lastAI.key,text:lastAI.text,tags}:null,unresolvedTags:found.unresolved,explicitRules:c.settings.hardRules,antiCliche:c.world.modes[c.world.mode]?.narrative?.缇斯亚叙事防八股===true,dueChecks:dueChecks(loaded.view,chain),plot:null};
  if(runPlan&&c.settings.plot)data.plot=await invoke('plotAdvance',{...data,userInput:user?.text??'',generationType:type},c,signal);
  if(data.plot){check(typeof data.plot.goal==='string'&&Array.isArray(data.plot.beats)&&Array.isArray(data.plot.pendingChoices)&&Array.isArray(data.plot.constraints),'剧情推进产物字段不完整');check(!Object.hasOwn(data.plot,'changes'),'剧情推进不得产生事实写入');for(const beat of data.plot.beats)check(beat&&typeof beat.proposal==='string'&&Array.isArray(beat.basis)&&beat.basis.every(x=>typeof x==='string')&&typeof beat.condition==='string','剧情节拍须有提案、依据和触发条件');for(const name of ['pendingChoices','constraints'])check(data.plot[name].every(x=>typeof x==='string'),'剧情设计列表内容无效');}
  let entries=[],text;
  if(c.settings.injection==='worldbook'){
   check(worldbook.available(),'当前宿主缺少原生世界书扫描事件，请更新宿主或选择“直接组装”');
   const rows=derive(loaded.view.rows.filter(r=>r.table!=='preferences'||c.settings.preferences&&r.values.启用!==false),loaded.view.registry);
   const temporary=lastAI?{text:memoryBlock(lastAI.text)||lastAI.text.match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)?.[1]||lastAI.text}:null;
   entries=worldbookEntries({rows,registry:loaded.view.registry,scope:loaded.session.data.id,tags,forcedIds:c.settings.retrieval==='vector'?found.optional.map(r=>r.id):[],temporary,due:data.dueChecks});
   const {rows:unusedRows,latestTemporary:unusedTemporary,...control}=data;
   text=NARRATIVE_TAGS+'\n\n'+JSON.stringify({...control,injection:'原生世界书蓝绿灯；以下仅为规则与推进设计，档案由原生预算和关键词扫描选入。'});
  }else text=NARRATIVE_TAGS+'\n\n'+JSON.stringify(data);
  // Required archives, current facts and explicit rules are never silently cut.
  check(text.length<=c.settings.contextChars,'表单注入超过 '+c.settings.contextChars+' 字符预算；请提高预算、减少检索数量或整理冗余表行');
  c.guard();latest={world:c.key,revision:loaded.session.data.revision,source:lastAI?.key??null,rows:selected.length,tags,unresolved:found.unresolved,text,injection:c.settings.injection};if(entries.length)worldbook.install(entries,c.guard);return latest;
 }
 async function prepare(type='normal'){
  worldbook.clear();setPrompt('');const current=store.read();if(!tableSettings(current.world).enabled||['quiet','impersonate'].includes(type))return null;
  return exclusive(async signal=>{const c=capture();try{if(c.settings.injection==='worldbook')check(worldbook.available(),'当前宿主缺少原生世界书扫描事件，请更新宿主或选择“直接组装”');let loaded=await load(c,type);loaded=await archiveLoaded(c,loaded,signal);const result=await assemble(c,loaded,type,signal);c.guard();setPrompt(result.text,()=>{try{c.guard();return true;}catch{return false;}});return result;}catch(e){status('表单推进','失败',e.message);setPrompt('');throw e;}});
 }
 async function initialize({originBook='',sessionBook=''}={}){return exclusive(async()=>{const c=capture(),context=getContext(),card=context.characters?.[context.characterId]?.avatar;check(card&&!context.groupId,'请先在单角色卡会话中建立原点档案；群组复用需明确选择角色来源');
  const suffix=crypto.randomUUID().slice(0,8);let origin,session;
  if(originBook)origin=await books.read(originBook);else{
   const candidates=[];for(const name of await books.cardBooks(card))if(name.startsWith('缇斯亚原点 · ')){const candidate=await books.read(name);if(candidate.data.kind==='origin')candidates.push(candidate);}
   check(candidates.length<=1,'此角色卡绑定了多本原点书，请填写要复用的书名');origin=candidates[0]??await books.create('origin',card,'缇斯亚原点 · '+context.characters[context.characterId].name+' · '+suffix);
  }
  c.guard();check(origin.data.kind==='origin','所选书不是原点书');await books.bindOrigin(card,origin.name,c.guard);
  if(sessionBook)session=await books.read(sessionBook);else session=await books.create('session',c.key,'缇斯亚存档 · '+context.chatId+' · '+suffix);
  c.guard();check(session.data.kind==='session'&&session.data.owner===c.key,'会话存档不能绑定到另一个会话');
  if(!session.data.origin){const next=copy(session.data);next.revision++;next.origin=origin.name;next.pins=copy(c.settings.originPins);session=await books.write(session,next,c.guard);}else check(session.data.origin===origin.name,'此存档已关联另一原点书，请新建存档或选择原来的原点书');
  const data=copy(c.data);data.worlds[c.key].tables={...c.settings,originBook:origin.name,sessionBook:session.name};await store.save(data,c.revision,c.key);
  status('初始化','已保存','原点书绑定角色卡；独立存档未替换数据库绑定');return {originBook:origin.name,sessionBook:session.name};});}
 async function inspect(){const c=capture(),loaded=await load(c);return {settings:c.settings,registry:loaded.view.registry,rows:loaded.view.rows,anchors:loaded.view.anchors,archived:loaded.view.archived.size,sourceCount:loaded.chain.filter(s=>s.role==='assistant').length,origin:loaded.origin.data,session:loaded.session.data,jobs:copy(jobs)};}
 async function archive({includeLatest=false,range=null}={}){return exclusive(async signal=>{const c=capture();if(range)check(Number.isSafeInteger(range.from)&&Number.isSafeInteger(range.to)&&range.from>=1&&range.to>=range.from&&Number.isSafeInteger(range.limit)&&range.limit>=1&&range.limit<=100,'楼层范围或批量数无效');let loaded=await load(c);loaded=await archiveLoaded(c,loaded,signal,includeLatest,range);return {archived:loaded.view.archived.size,revision:loaded.session.data.revision};});}
 async function scan(){const c=capture(),loaded=await load(c),last=loaded.chain.findLast(s=>s.role==='assistant');return loaded.chain.map(s=>({floor:s.floor,role:s.role,preview:s.text.slice(0,100),archived:loaded.view.archived.has(s.key),latest:s.key===last?.key,hasMemory:!!memoryBlock(s.text)}));}
 async function importHistory(text,{label='手写历史',worldTime=null}={}){return exclusive(async signal=>{const c=capture(),loaded=await load(c);check(typeof text==='string'&&text.trim(),'请填写历史原文');const hash=await digest(text);check(!loaded.session.data.commits.some(x=>x.importSource?.hash===hash),'这份历史已导入，不能重复入账');const proposal=await invoke('historyImport',{registry:loaded.view.registry,currentRows:loaded.view.rows,historyText:text,label,worldTime},c,signal);return {format:'tisya.history-draft/1',text,label,worldTime,hash,proposal,world:c.key,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};});}
 async function saveHistory(draft){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.format==='tisya.history-draft/1'&&draft.world===c.key&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'历史草稿依据已变化，请重新核对');check(await digest(draft.text)===draft.hash,'历史原文已改变，请重新生成草稿');check(!loaded.session.data.commits.some(x=>x.importSource?.hash===draft.hash),'这份历史已经导入');const result=await commit(c,loaded,draft.proposal,{source:null,kind:'import',evidence:draft.text,worldTime:draft.worldTime,allowedTables:loaded.view.registry.tables.filter(t=>t.owner==='archive').map(t=>t.id),importSource:{label:draft.label,text:draft.text,hash:draft.hash,worldTime:draft.worldTime}});return result.session.data.revision;});}
 async function genesis(goal){return exclusive(async signal=>{const c=capture(),loaded=await load(c);check(typeof goal==='string'&&goal.trim(),'请填写创世要求');const basisCard=cardBasis(getContext());const proposal=await invoke('tableGenesis',{goal,sourceCard:basisCard,registry:loaded.view.registry,baseArchives:loaded.view.rows.filter(r=>r.table==='objects')},c,signal);return {format:'tisya.genesis-draft/1',goal,basisCard,proposal,world:c.key,originRevision:loaded.origin.data.revision,sessionRevision:loaded.session.data.revision};});}
 async function saveGenesis(draft){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(draft.basisCard===cardBasis(getContext()),'角色卡资料已修改，请重新生成创世草稿');check(draft.world===c.key&&draft.originRevision===loaded.origin.data.revision&&draft.sessionRevision===loaded.session.data.revision,'创世草稿依据已变化，请重新生成或载入');
  const allowed=['objects','facts'];const view={...loaded.view,last:null};const prepared=prepareCommit(view,draft.proposal,{source:null,kind:'genesis',evidence:[draft.goal,draft.basisCard].filter(Boolean).join('\n\n'),allowedTables:allowed});
  const next=copy(loaded.origin.data);next.revision++;next.registry=prepared.registry;for(const change of prepared.commit.changes){change.after.rev=Math.max(change.after.rev,...next.bases.filter(b=>b.id===change.id).map(b=>b.rev+1));next.bases.push(change.after);}const origin=await books.write(loaded.origin,next,c.guard);
  const session=copy(loaded.session.data);session.revision++;session.pins=[...new Set([...(session.pins??[]),...prepared.commit.changes.map(x=>x.id+'@'+x.after.rev)])];
  try{await books.write(loaded.session,session,c.guard);}catch(e){throw Error('创世原点版本已保存，会话绑定未完成：'+e.message);}
  status('创世','已保存',origin.name);return prepared.commit.changes.length;});}
 async function edit(proposal){return exclusive(async()=>{const c=capture(),loaded=await load(c),source=loaded.chain.at(-1)?.key??null;const evidence='用户手动修改表单';const result=await commit(c,loaded,proposal,{source,kind:'manual',evidence,allowedTables:loaded.view.registry.tables.map(t=>t.id)});return result.session.data.revision;});}
 async function pinOrigins(pins){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(Array.isArray(pins)&&pins.every(p=>loaded.origin.data.bases.some(b=>b.id+'@'+b.rev===p)),'所选原点版本不存在');check(new Set(pins.map(p=>p.slice(0,p.lastIndexOf('@')))).size===pins.length,'同一档案只能选择一个版本');const next=copy(loaded.session.data);next.revision++;next.pins=copy(pins);project(loaded.origin.data,next,loaded.chain.map(s=>s.key));await books.write(loaded.session,next,c.guard);return pins;});}
 async function saveTemplates(nextRegistry,expectedRevision){return exclusive(async()=>{const c=capture(),loaded=await load(c);check(loaded.origin.data.revision===expectedRevision,'模板版本已变化，请重新载入');registryIndex(nextRegistry);
  for(const kind of ['tables','types'])for(const old of loaded.origin.data.registry[kind]){const next=nextRegistry[kind].find(x=>x.id===old.id);check(next&&next.name===old.name&&(old.aliases??[]).every(x=>next.aliases.includes(x)),'现有类型与名称不可删除或改名；请新增字段／别名');for(const [key,field]of Object.entries(old.fields))check(JSON.stringify(next.fields[key])===JSON.stringify(field),'已有字段不可改变类型／公式；请新增字段并明确迁移');check(next.parent===old.parent&&next.owner===old.owner,'不能改变模板继承关系或写入职责');next.version=JSON.stringify({...next,version:old.version})===JSON.stringify(old)?old.version:old.version+1;}
  for(const t of nextRegistry.tables)check(['archive','preferences'].includes(t.owner),'新表必须声明 archive 或 preferences 写入职责');for(const row of [...loaded.origin.data.bases,...loaded.view.rows])validateRow(nextRegistry,row);
  const next=copy(loaded.origin.data);next.revision++;next.registry=copy(nextRegistry);next.schemaHistory??=[];next.schemaHistory.push({at:new Date().toISOString(),before:loaded.origin.data.registry,after:copy(nextRegistry),source:'用户编辑模板'});await books.write(loaded.origin,next,c.guard);status('模板','已保存','新字段和别名已登记');return next.revision;});}
 return {state,worldbook,prepare,initialize,inspect,scan,archive,importHistory,saveHistory,saveTemplates,genesis,saveGenesis,edit,pinOrigins,books,clear(){controller?.abort();worldbook.clear();setPrompt('');latest=null;},preview:()=>copy(latest)};
}
