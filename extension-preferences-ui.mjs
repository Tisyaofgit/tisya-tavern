import {EXTENSION_PREFERENCE_SCHEMA,EXTENSION_PREFERENCE_TABLE,EXTENSION_VIEWS,normalizeExtensionPreferences,extensionPreferenceRecordId} from './extension-preferences.mjs';
import {selectControl} from './engine/form-controls.mjs';

const names={message:'手机消息',messages:'近日留言',forum:'论坛',danmaku:'弹幕',theater:'小剧场',news:'新闻',notice:'公告',rumor:'风闻',settlement:'结算展示'};
const kinds={text:'文字',transfer:'转账',voice:'语音',image:'图片',news:'新闻',forum:'论坛楼层',danmaku:'弹幕',theater:'小剧场',notice:'公告',rumor:'风闻',settlement:'结算记录'};
const clone=v=>structuredClone(v);
export function mountExtensionPreferences(document,root,{database,books,getScope,assertIdle=()=>{},externalActions=false,onStateChange=()=>{}}){
 let alive=true,busy=false,dirty=false,db=null,scope=null,view='forum',definitions=[],controls=null,operationId=null,lastError=null,lastReceipt=null,acceptedReceipt=null,reviewRequired=false,pending=Promise.resolve(true);
 const drafts=new Map();
 const hasChanges=()=>dirty||drafts.size>0;
 const state=()=>({dirty:hasChanges(),draftDirty:hasChanges(),busy,canSave:hasChanges()&&!busy&&!reviewRequired,scope:clone(scope),error:lastError?.message??null,receipt:clone(lastReceipt),reviewRequired});
 const changed=()=>{operationId=null;onStateChange(state());};
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const status=el('p');status.setAttribute('role','status');
 const run=fn=>{if(busy||!alive)return Promise.resolve(false);busy=true;lastError=null;root.setAttribute('aria-busy','true');onStateChange(state());pending=(async()=>{try{return await fn()!==false;}catch(e){lastError=e;if(alive)status.textContent=e.message;return false;}finally{busy=false;if(alive)root.setAttribute('aria-busy','false');onStateChange(state());}})();return pending;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.className='menu_button';b.onclick=()=>run(fn);return b;};
 const field=(text,node)=>{const label=el('label',text);label.style.cssText='display:grid;gap:6px;margin:12px 0';label.append(node.tagName==='SELECT'?selectControl(document,node):node);return label;};
 const input=(value='',type='text')=>{const n=el(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.className='text_pole';n.value=value;n.oninput=()=>{dirty=true;changed();};if(type==='textarea')n.rows=4;return n;};
 const select=(rows,value)=>{const n=el('select');n.className='text_pole';for(const [v,label]of rows){const option=el('option',label);option.value=v;n.append(option);}n.value=value??'';n.onchange=()=>{dirty=true;changed();};return n;};
 const definitionKey=d=>JSON.stringify([d.source.book,d.source.uid,d.source.digest]);
 const currentScope=()=>getScope();
 function chosen(){return Object.entries(db?.state.tables?.[EXTENSION_PREFERENCE_TABLE]??{}).filter(([,r])=>{const p=normalizeExtensionPreferences(r);return p.view_id===view&&p.owner_ref===scope.ownerId&&p.world_ref===scope.worldId&&p.output_config_ref===(scope.outputConfigId??null);});}
 function draw(){
  if(!alive)return;root.replaceChildren();root.style.cssText='max-width:900px;margin:auto;padding:16px;overflow-wrap:anywhere';root.append(el('h3','小剧场与手机呈现'),status,button('读取当前人物与世界配置',async()=>{if(hasChanges())throw Error('有未保存的呈现修改，请使用页面底部保存或取消修改');await load();}));
  if(reviewRequired){root.append(el('p','本次呈现配置已有保存回执。请重新读取后核对，已提交的修改不会重复保存。'));return;}
  if(!db||!scope?.ownerId||!scope?.worldId){root.append(el('p','先在上方选择表单中的当前人物与世界，再读取这里的配置。'));return;}
  const selector=select(EXTENSION_VIEWS.map(id=>[id,names[id]]),view);selector.dataset.extensionView='';selector.onchange=()=>run(async()=>{const next=selector.value;try{captureCurrent();view=next;dirty=false;draw();changed();}catch(error){selector.value=view;selector.tisyaRefresh?.();throw error;}});root.append(field('配置区域',selector));
  const found=chosen();if(found.length>1){root.append(el('p','这个区域有重复配置，请在表单中核对记录后保留一条。'));return;}
  const [existingId,existing]=found[0]??[],p=drafts.get(view)?.values??normalizeExtensionPreferences(existing??{owner_ref:scope.ownerId,world_ref:scope.worldId,output_config_ref:scope.outputConfigId??null,view_id:view});
  const enabled=input('', 'checkbox');enabled.checked=p.enabled;enabled.dataset.extensionEnabled='';root.append(field('启用这个区域',enabled));
  const extensionRows=definitions.filter(d=>d.definition.kind==='extension'&&d.definition.view===view),styleRows=definitions.filter(d=>d.definition.kind==='presentation'&&d.definition.views.includes(view));
  const selectedSource=prefix=>p[prefix+'_book']?JSON.stringify([p[prefix+'_book'],p[prefix+'_uid'],p[prefix+'_digest']]):'';
  const sources=(rows,chosen,label)=>{const options=[['','未选择'],...rows.map(d=>[definitionKey(d),d.definition.name+' · '+d.source.book])];if(chosen&&!options.some(([key])=>key===chosen))options.push([chosen,'原选择已改变或缺失，请重新选择']);const n=select(options,chosen);n.dataset[label]='';return n;};
  const extension=sources(extensionRows,selectedSource('extension'),'extensionDefinition'),style=sources(styleRows,selectedSource('style'),'extensionStyle');root.append(field('扩展内容定义',extension),field('排版画风',style));
  const count=input(p.generate_count??'','number'),limit=input(p.display_limit??'','number');count.min='0';count.max='50';limit.min='0';limit.max='200';count.dataset.extensionCount='';limit.dataset.extensionLimit='';root.append(field('每轮新增条数（0为本轮不生成）',count),field('本次最多显示条数（不删除历史）',limit));
  const audience=select([['','未指定'],['world_fans','本位面的粉丝或居民'],['higher_dimensional','高维观众'],['mixed','混合来源，分别注明'],['none','没有观众']],p.audience_kind??'');audience.dataset.extensionAudience='';root.append(field('观众来自哪里',audience),el('p','观众类型不赋予知情。高维观众也只使用所选材料；人物隐私与尚未获知的事实继续按原权限处理。'));
  const prefer=input(p.topic_preferences.filter(t=>t.mode==='prefer').map(t=>t.topic).join('\n'),'textarea'),avoid=input(p.topic_preferences.filter(t=>t.mode==='avoid').map(t=>t.topic).join('\n'),'textarea');prefer.placeholder='例如：磕CP、同人创作、日常八卦；每行一项';prefer.dataset.extensionTopics='';root.append(field('更喜欢的主题',prefer),field('尽量少写的主题',avoid));
  const contentTypes=el('fieldset');contentTypes.append(el('legend','允许的内容'));const types=[];for(const [id,label]of Object.entries(kinds)){const n=input('','checkbox');n.checked=p.enabled_kinds.includes(id);n.dataset.extensionKind=id;types.push(n);contentTypes.append(field(label,n));}root.append(contentTypes);
  const worldSources=input(JSON.stringify(p.world_sources,null,2),'textarea'),audienceSources=input(JSON.stringify(p.audience_sources,null,2),'textarea');const advanced=el('details');advanced.append(el('summary','世界与观众材料来源'),el('p','引用已登记的表单记录或书籍条目。这里选择材料，不改变角色权限；无材料可保持空列表。'),field('世界材料引用',worldSources),field('观众材料引用',audienceSources));root.append(advanced);
  controls={existingId,p,enabled,extension,style,count,limit,audience,prefer,avoid,types,worldSources,audienceSources};if(!externalActions){const footer=el('footer');footer.className='tisya-settings-actions';footer.append(button('取消修改',discard),button('保存',save));root.append(footer);}
 }
 const nullableNumber=(node,label)=>{if(node.value==='')return null;const n=Number(node.value);if(!Number.isSafeInteger(n))throw Error(label+'必须是整数');return n;};
 function captureCurrent(){
  if(!controls||!dirty)return;const c=controls;
  const values={...c.p,owner_ref:scope.ownerId,world_ref:scope.worldId,output_config_ref:scope.outputConfigId??null,view_id:view,enabled:c.enabled.checked,enabled_kinds:c.types.filter(n=>n.checked).map(n=>n.dataset.extensionKind),generate_count:nullableNumber(c.count,'生成条数'),display_limit:nullableNumber(c.limit,'显示条数'),audience_kind:c.audience.value||null};
  for(const prefix of ['extension','style']){const key=c[prefix].value,row=definitions.find(d=>definitionKey(d)===key);if(key&&!row)throw Error('原'+(prefix==='style'?'画风':'内容定义')+'已改变，请重新选择');for(const field of ['book','uid','digest'])values[prefix+'_'+field]=row?.source[field]??null;}
  values.topic_preferences=[...c.prefer.value.split('\n').filter(s=>s.trim()).map(topic=>({topic:topic.trim(),mode:'prefer',weight:c.p.topic_preferences.find(t=>t.mode==='prefer'&&t.topic===topic.trim())?.weight??1})),...c.avoid.value.split('\n').filter(s=>s.trim()).map(topic=>({topic:topic.trim(),mode:'avoid',weight:c.p.topic_preferences.find(t=>t.mode==='avoid'&&t.topic===topic.trim())?.weight??1}))];
  for(const [key,node]of [['world_sources',c.worldSources],['audience_sources',c.audienceSources]]){try{values[key]=JSON.parse(node.value);}catch{throw Error('材料引用须为有效JSON列表');}}
  const normalized=normalizeExtensionPreferences(values);delete normalized.row_uuid;const recordId=c.existingId??extensionPreferenceRecordId({worldId:scope.worldId,ownerId:scope.ownerId,view})+':'+encodeURIComponent(scope.outputConfigId??'default');
  const original=db.state.tables?.[EXTENSION_PREFERENCE_TABLE]?.[recordId];
  const previous=normalizeExtensionPreferences(original??{owner_ref:scope.ownerId,world_ref:scope.worldId,output_config_ref:scope.outputConfigId??null,view_id:view});delete previous.row_uuid;
  if(JSON.stringify(normalized)===JSON.stringify(previous))drafts.delete(view);else drafts.set(view,{recordId,values:normalized});
  dirty=false;
 }
 async function validate(){
  assertIdle();if(reviewRequired)throw Error('呈现配置已保存，重新读取尚未完成；请先读取并核对当前配置');captureCurrent();if(!drafts.size)return true;
  if(JSON.stringify(currentScope())!==JSON.stringify(scope))throw Error('人物、世界或输出配置已变化；呈现草稿仍保留，请回到原选择保存或取消修改');
  const latest=await database.read();
  if(!latest?.state||latest.contextKey!==db.contextKey||latest.revision!==db.revision)throw Error('表单已被其他操作修改；呈现草稿仍保留，请核对后重新读取');
  const currentDefinitions=[...await books.definitions('extensions'),...await books.definitions('beauty')];
  if(JSON.stringify(currentScope())!==JSON.stringify(scope))throw Error('读取期间人物、世界或输出配置已变化，未保存');
  for(const {values}of drafts.values()){
   normalizeExtensionPreferences(values);
   for(const prefix of ['extension','style'])if(values[prefix+'_book']&&!currentDefinitions.some(def=>definitionKey(def)===JSON.stringify([values[prefix+'_book'],values[prefix+'_uid'],values[prefix+'_digest']])))throw Error('呈现资料来源已变化，请重新选择');
  }
  return true;
 }
 async function save(){
  await validate();if(!drafts.size)return true;
  operationId??='extension-preferences:'+crypto.randomUUID();lastReceipt=null;
  const result=await database.commit({operationId,expectedRevision:db.revision,contextKey:db.contextKey,schema:[EXTENSION_PREFERENCE_SCHEMA],changes:[...drafts.values()].map(({recordId,values})=>({tableId:EXTENSION_PREFERENCE_TABLE,recordId,values:clone(values)})),source:{kind:'extension-preferences',views:[...drafts.keys()]}});
  if(!result?.state||result.contextKey!==undefined&&result.contextKey!==db.contextKey)throw Error('保存未返回匹配的表单回执');
  lastReceipt={confirmed:true,operationId,contextKey:db.contextKey,beforeRevision:db.revision,revision:result.revision,records:[...drafts.values()].map(({recordId})=>({tableId:EXTENSION_PREFERENCE_TABLE,recordId}))};
  db={...result,contextKey:result.contextKey??db.contextKey};drafts.clear();dirty=false;operationId=null;controls=null;status.textContent='已保存到当前表单。下一轮生成和对应呈现使用这些配置。';
  try{if(JSON.stringify(currentScope())!==JSON.stringify(scope))throw Error('保存期间人物、世界或输出配置已变化');await load();}catch(error){reviewRequired=true;draw();const confirmed=new Error('呈现配置已保存，但重新读取失败：'+error.message+'；请重新读取后核对，本次修改不会重复提交。',{cause:error});confirmed.databaseReceipt=clone(lastReceipt);throw confirmed;}return true;
 }
 async function discard(){drafts.clear();dirty=false;operationId=null;await load();changed();return true;}
 async function acceptDatabaseReceipt(receipt){
  if(!hasChanges())return true;
  const signature=JSON.stringify(receipt),repeated=signature===acceptedReceipt&&receipt?.revision===db?.revision;
  if(!receipt?.confirmed||receipt.contextKey!==db?.contextKey||receipt.beforeRevision!==db.revision&&!repeated)throw Error('同页表单保存回执不匹配，呈现草稿仍保留');
  captureCurrent();const touched=receipt.records??[];
  if([...drafts.values()].some(row=>touched.some(record=>record.tableId===EXTENSION_PREFERENCE_TABLE&&record.recordId===row.recordId)))throw Error('同页修改影响了呈现记录，请重新核对');
  const current=await database.read();
  if(current?.contextKey!==receipt.contextKey||current.revision!==receipt.revision)throw Error('同页保存后表单又有更新，呈现草稿仍保留');
  for(const {recordId}of drafts.values())if(JSON.stringify(current.state.tables?.[EXTENSION_PREFERENCE_TABLE]?.[recordId])!==JSON.stringify(db.state.tables?.[EXTENSION_PREFERENCE_TABLE]?.[recordId]))throw Error('呈现记录已变化，草稿仍保留');
  db=current;acceptedReceipt=signature;return true;
 }
 async function load(){const captured=clone(currentScope()),snapshot=await database.read();if(!alive)return;const loaded=[...await books.definitions('extensions'),...await books.definitions('beauty')];if(!alive)return;if(JSON.stringify(currentScope())!==JSON.stringify(captured))throw Error('读取期间人物、世界或输出配置已变化，请重新读取');scope=captured;db=snapshot;definitions=loaded;controls=null;if(reviewRequired)status.textContent='已重新读取已保存的呈现配置。';reviewRequired=false;draw();onStateChange(state());}
 const ready=load().catch(error=>{if(alive){root.replaceChildren(status);status.textContent='小剧场配置尚未读取：'+error.message;root.append(button('重新读取',load));}});
 return {root,ready,state,validateDraft:validate,saveDraft:()=>run(save),discardDraft:()=>run(discard),acceptDatabaseReceipt,settled:()=>pending,requestLeave:()=>({allowed:!hasChanges()&&!busy,dirty:hasChanges(),reason:busy?'配置仍在保存':'有未保存的呈现配置'}),dispose(){alive=false;root.replaceChildren();}};
}
