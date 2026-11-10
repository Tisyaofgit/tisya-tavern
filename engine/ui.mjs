import {renderPreferences,renderResources} from './preferences-ui.mjs';
import {baseline,configuration} from './config.mjs';
import {DEFAULT_TAGS,validateTags} from './tags.mjs';
import {validatePreferences,effectivePreferences} from './preferences.mjs';
import {renderingResources} from '../rendering-resources.js';
import {Runtime} from './runtime.mjs';
import {selectControl} from './form-controls.mjs';
import {mountUnsavedPrompt} from '../settings-unsaved.js';

const labels={reply:'回复外壳',task:'任务',anchor:'前后摘要',title:'标题',body:'正文',extra:'附加卡片',cells:'表单指令',vars:'原卡变量',archive:'归档',actions:'行动建议'};
const tabs=[['preferences','游玩偏好'],['resources','多媒体资源'],['tags','回复格式'],['prompts','完整预设'],['tables','表单与存档'],['generation','生成设置']];

export function mountMatrixConfiguration(document,root,{service,onError=()=>{},onClose=()=>{},onAppearance=()=>{},onIdentity=()=>{},onNative=()=>{},onStateChange=()=>{}}){
 let busy=false,navigating=false,dirty=false,formDirty=false,disposed=false,tab='preferences';
 let config=service.config.read(),savedFingerprint=JSON.stringify(config),selectedTable='T_PREF_OUTPUT_CONFIG',selectedRecord='',catalog;
 let formDraft=null,resourceDraft=null,pending=Promise.resolve(true),navigationPending=null,lastError=null;
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const option=(label,value)=>{const n=el('option',label);n.value=value;return n;};
 const content=el('div',null,'tisya-matrix-content'),footer=el('footer',null,'tisya-settings-actions'),status=el('p'),dialogs=el('div');
 status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const cancel=el('button','取消修改','menu_button'),saveButton=el('button','保存','menu_button');
 cancel.type=saveButton.type='button';footer.append(status,cancel,saveButton);
 const hostPage=root.parentElement?.matches('.tisya-page')?root.parentElement:null,hadHostClass=hostPage?.classList.contains('tisya-matrix-page');hostPage?.classList.add('tisya-matrix-page');
 const style=el('style');style.textContent=`
 .tisya-matrix-config{display:flex;flex-direction:column;min-width:0;max-width:100%;min-height:0;height:var(--tisya-settings-height,100dvh);max-height:100dvh;overflow:hidden;overflow-wrap:anywhere}
 #tisya-shell.tisya-page-open .tisya-page.tisya-matrix-page{display:flex;flex-direction:column;overflow:hidden}
 #tisya-shell .tisya-page.tisya-matrix-page>.tisya-sub-header,#tisya-shell .tisya-page.tisya-matrix-page>.tisya-sub-title{flex:none}
 #tisya-shell .tisya-page.tisya-matrix-page>.tisya-matrix-config{flex:1 1 0;min-height:0;height:auto}
 .tisya-matrix-content{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scroll-padding-block:12px}
 .tisya-matrix-config .tisya-settings-actions{position:relative;flex:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;margin:0;padding:10px 0 max(10px,env(safe-area-inset-bottom,0px));border-top:1px solid #b9a66d66;background:#0b3025;z-index:3}
 .tisya-matrix-config .tisya-settings-actions p{grid-column:1/-1;margin:0;font-size:13px;line-height:1.5;overflow-wrap:anywhere}
 .tisya-matrix-config .tisya-settings-actions p:empty{display:none}
 .tisya-matrix-config .tisya-settings-actions button{width:100%;min-width:0;min-height:44px;margin:0!important;padding:10px 12px}
 .tisya-matrix-config .tisya-settings-actions button:disabled{opacity:.5;cursor:default}
 .tisya-matrix-config .tisya-directory-buttons{display:flex;flex-wrap:wrap;gap:6px}
 .tisya-matrix-config [role=alert]{color:#edbd9d}
 `;
 root.classList.add('tisya-matrix-config');root.replaceChildren(style,content,footer,dialogs);
 const hasChanges=()=>dirty||formDirty;
 const state=()=>({dirty:hasChanges(),configDirty:dirty,formDirty,busy:busy||prompt.state().busy,canSave:hasChanges()&&!busy,page:tab,reason:busy?'配置正在保存或读取':hasChanges()?'有未保存的修改':''});
 const prompt=mountUnsavedPrompt(document,dialogs,{onStateChange:()=>syncActions()});
 function syncActions(){if(disposed)return;cancel.disabled=saveButton.disabled=busy||prompt.state().open||!hasChanges();content.inert=busy||prompt.state().open;root.setAttribute('aria-busy',String(busy));onStateChange(state());}
 function report(error){if(disposed)return;lastError=error;status.setAttribute('role','alert');status.textContent=error?.message||String(error);onError(error);}
 function changed(kind='config'){
  if(kind==='form')formDirty=!!formDraft&&Object.keys(formDraft.values).length>0;
  else dirty=JSON.stringify(config)!==savedFingerprint||!!resourceDraft?.isDirty();
  status.setAttribute('role','status');status.textContent=hasChanges()?'有未保存修改':'';syncActions();
 }
 function run(fn){
  if(busy||disposed)return Promise.resolve(false);
  busy=true;lastError=null;status.setAttribute('role','status');syncActions();
  pending=(async()=>{try{return await fn()!==false;}catch(error){report(error);return false;}finally{busy=false;if(!disposed)syncActions();}})();
  return pending;
 }
 const button=(text,fn)=>{const b=el('button',text,'menu_button');b.type='button';b.onclick=()=>run(fn);return b;};
 const routeButton=(text,fn,external=false)=>{const b=el('button',text,'menu_button');b.type='button';b.onclick=()=>route(fn,{external});return b;};
 const field=(label,control)=>{const row=el('label',label);row.style.cssText='display:grid;gap:6px;margin:12px 0';row.append(control.tagName==='SELECT'?selectControl(document,control):control);return row;};
 const input=(value,change,{type='text',options,multi=false,rows=8,readOnly=false,track='config'}={})=>{
  const control=el(options?'select':multi?'textarea':'input');control.className='text_pole';control.style.cssText='max-width:100%;min-width:0;box-sizing:border-box';
  if(options){control.append(option('未填写',''));for(const value of options)control.append(option(String(value),String(value)));}else if(!multi)control.type=type;
  control.value=value??'';if(multi)control.rows=rows;control.disabled=readOnly;
  control.oninput=()=>{if(busy||disposed||readOnly)return;try{change(control.value);changed(track);}catch(error){report(error);}};
  return control;
 };
 const download=(name,data)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function validateConfig(next){
  if(next.revision!==service.config.read().revision)throw Error('配置已被其他页面更新，当前修改仍保留；请取消修改后重新读取。');
  validateTags(next.tags);validatePreferences(next.playDefaults);validatePreferences(next.story?.play);validatePreferences(effectivePreferences(next));renderingResources(next.resources??[]);
 }
 function applyForm(engine,edit){
  if(edit.recordId){
   if(JSON.stringify(engine.rows(edit.tableId)[edit.recordId])!==edit.before)throw Error('表单记录已被其他页面修改，当前输入仍保留；请取消修改后重新读取。');
   for(const [key,value]of Object.entries(edit.values))engine.set([edit.tableId,edit.recordId,key,[]],value);
   return edit.recordId;
  }
  return engine.newRecord(edit.tableId,edit.values,edit.newId);
 }
 async function save(){
  if(!hasChanges())return true;
  const next=resourceDraft?.prepareSave()??config,edit=formDirty?formDraft:null;
  // Validate every pending part before either independent store is changed.
  if(dirty)validateConfig(next);
  if(edit){
   edit.newId??=crypto.randomUUID();const current=await service.export();
   if(!current)throw Error('本会话尚未接入，表单输入仍保留。');
   applyForm(new Runtime(current.state),edit);
  }
  let savedForm=false;
  try{
   if(edit){await service.mutate(engine=>applyForm(engine,edit));selectedRecord=edit.recordId||edit.newId;formDirty=false;formDraft=null;savedForm=true;}
   if(dirty){config=await service.config.save(next);savedFingerprint=JSON.stringify(config);dirty=false;resourceDraft=null;}
  }catch(error){
   // One store may have completed. Do not retry its write or clear the other draft.
   if(savedForm&&!disposed){await render();throw new Error('表单记录已保存，配置保存未完成：'+error.message,{cause:error});}
   throw error;
  }
  if(!disposed){await render();status.setAttribute('role','status');status.textContent='已保存，本页修改下次使用时生效。';}
  return true;
 }
 async function discard(){
  const saved=service.config.read();config=saved;savedFingerprint=JSON.stringify(saved);dirty=false;formDirty=false;formDraft=null;resourceDraft=null;
  await render();status.setAttribute('role','status');status.textContent='已取消修改，恢复到上次保存的内容。';return true;
 }
 const saveDraft=()=>run(save),discardDraft=()=>run(discard);
 async function confirmLeave(){
  if(disposed||busy&&!navigating)return false;
  if(navigating)return true;
  if(navigationPending)return false;
  if(!hasChanges())return !prompt.state().open;
  return prompt.request({
   save:async()=>{if(!await saveDraft())throw lastError??Error('保存未完成，修改仍保留。');return !hasChanges();},
   discard:async()=>{if(!await discardDraft())throw lastError??Error('取消修改未完成。');return !hasChanges();}
  });
 }
 function route(fn,{external=false}={}){
  if(busy||disposed||navigationPending)return Promise.resolve(false);
  navigationPending=(async()=>{
   if(!await confirmLeave()||disposed)return false;
   navigating=external;try{await fn();return true;}catch(error){report(error);return false;}finally{navigating=false;}
  })();
  return navigationPending.finally(()=>{navigationPending=null;});
 }
 cancel.onclick=discardDraft;saveButton.onclick=saveDraft;
 async function render(){
  if(disposed)return;
  content.replaceChildren(el('h3','缇斯亚 · 配置'));resourceDraft=null;formDraft=null;
  const nav=el('div',null,'tisya-directory-buttons');
  for(const [id,name]of tabs){const b=routeButton(name,async()=>{tab=id;await run(render);});if(id===tab)b.onclick=()=>Promise.resolve(true);b.setAttribute('aria-current',String(tab===id));nav.append(b);}
  nav.append(routeButton('用户身份',onIdentity,true),routeButton('连接与模型',onNative,true),routeButton('外观',onAppearance,true),routeButton('返回',onClose,true));content.append(nav);
  const body=el('section',null,'tisya-sub-card');content.append(body);
  if(tab==='preferences')renderPreferences(document,body,{config,changed:()=>changed(),button,navigationButton:(text,fn)=>routeButton(text,fn,true),field,input,el,historyLimit:()=>service.historyLimit?.()??50,onIdentity});
  if(tab==='resources')resourceDraft=renderResources(document,body,{config,changed:()=>changed(),button,field,input,el});
  if(tab==='tags'){
   body.append(el('p','输入标签名即可统一更新输出骨架、预设引用与插件读取。已保存的旧回复继续使用原来的标签。'));
   for(const key of Object.keys(DEFAULT_TAGS))body.append(field(labels[key],input(config.tags[key],value=>config.tags[key]=value)));
  }
  if(tab==='prompts'){
   body.append(el('p','完整新版预设按槽排列。改动随配置保存，动态资料由当前会话提供。'));
   for(const entry of baseline.prompts){if(entry.marker||!entry.content?.trim()||entry.enabled===false||/^\{\{tisya_/.test(entry.content??''))continue;const details=el('details');details.append(el('summary',entry.name??entry.identifier),field('提示词',input(config.prompts[entry.identifier]??entry.content,value=>config.prompts[entry.identifier]=value,{multi:true})));body.append(details);}
  }
  if(tab==='generation'){
   body.append(el('p','采样、长度及供应商支持的生成参数使用当前原生连接；保存后直接写入原生生成设置，后续由宿主按当前供应商能力生成请求。'));
   for(const [key,value]of Object.entries(configuration['生成参数与输出设置'])){if(['prompt_order','prompts'].includes(key)||value&&typeof value==='object')continue;body.append(field(key,input(config.generation[key]??service.generationValues?.()[key]??value,next=>{config.generation[key]=typeof value==='number'?Number(next):typeof value==='boolean'?next==='true':next;},{type:typeof value==='number'?'number':'text',multi:typeof value==='string',rows:3,options:typeof value==='boolean'?['true','false']:undefined})));}
  }
  if(tab==='tables')await renderTables(body);
  syncActions();
 }
 async function renderTables(body){
  catalog??=await service.catalog();const bundle=await service.export();if(disposed)return;
  const tools=el('div',null,'tisya-directory-buttons');
  const requireSaved=()=>{if(hasChanges())throw Error('请先使用底部按钮保存或取消本页修改。');};
  if(bundle){
   tools.append(button('同步回合',async()=>{requireSaved();await service.sync();await render();}),button('导出完整存档',async()=>{const current=await service.export();if(!current)throw Error('本会话尚未接入');download('Tisya-chat-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',current);}));
  }else tools.append(button('重试接入当前聊天',async()=>{requireSaved();if(typeof service.ensureBound!=='function')throw Error('当前聊天的自动接入服务尚未就绪');await service.ensureBound();await render();}));
  const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
  file.onchange=()=>run(async()=>{requireSaved();if(file.files[0])await service.import(JSON.parse(await file.files[0].text()));await render();});
  tools.append(button('导入已有新版状态',()=>{requireSaved();file.click();}),file);body.append(tools);
  if(!bundle){body.append(el('p','当前聊天的表单尚未准备完成。打开聊天会自动接入并开启新引擎；准备中断时可重试，已有存档会保留。'));return;}
  if(!bundle.state.schema[selectedTable])selectedTable=catalog.tables.find(table=>bundle.state.schema[table.id])?.id??'';
  const schema=bundle.state.schema[selectedTable];if(!schema)throw Error('存档没有可编辑的表单。');
  const tableSelect=el('select');tableSelect.className='text_pole';tableSelect.setAttribute('aria-label','表单');
  for(const table of catalog.tables)tableSelect.append(option(table.label+' · '+table.id,table.id));tableSelect.value=selectedTable;
  tableSelect.onchange=()=>{const next=tableSelect.value;if(next===selectedTable)return Promise.resolve(true);tableSelect.value=selectedTable;tableSelect.tisyaRefresh?.();return route(async()=>{selectedTable=next;selectedRecord='';await run(render);});};body.append(field('表单',tableSelect));
  const records=bundle.state.tables[selectedTable]??{},record=el('select');record.className='text_pole';record.setAttribute('aria-label','记录');record.append(option('新建记录',''));
  for(const [id,row]of Object.entries(records))record.append(option(row.values.name??row.values.title??id,id));record.value=selectedRecord;
  record.onchange=()=>{const next=record.value;if(next===selectedRecord)return Promise.resolve(true);record.value=selectedRecord;record.tisyaRefresh?.();return route(async()=>{selectedRecord=next;await run(render);});};body.append(field('记录',record));
  if(selectedRecord&&!records[selectedRecord])throw Error('所选记录已不存在，请重新选择记录。');
  if(selectedTable==='T_PREF_OUTPUT_CONFIG'&&selectedRecord){
   const selected=()=>config.story.outputConfigId===selectedRecord;
   const choose=button(selected()?'当前输出配置':'用作当前输出配置',()=>{config.story.outputConfigId=selectedRecord;changed();choose.textContent='当前输出配置（待保存）';});choose.disabled=selected();body.append(choose);
  }
  const edit=formDraft={tableId:selectedTable,recordId:selectedRecord,before:JSON.stringify(records[selectedRecord]),values:{}};
  for(const spec of schema.fields){
   if(spec.key==='row_uuid'||spec.alias_of)continue;
   const raw=records[selectedRecord]?.values[spec.key],complex=['JSON','ARRAY','OBJECT','REF_LIST','TEXT_LIST','CHILD_REF','BAG','TAGS'].includes(spec.type),value=raw!=null&&typeof raw==='object'?JSON.stringify(raw,null,2):raw;
   const control=input(value,next=>{if(next===String(value??''))delete edit.values[spec.key];else edit.values[spec.key]=next;},{track:'form',multi:complex||['LONGTEXT','LONG_TEXT','TEXT'].includes(spec.type)&&(spec.type!=='TEXT'||String(value??'').length>100),options:spec.enum??spec.options,readOnly:!!spec.read_only});
   control.setAttribute('aria-label',spec.label+' · '+spec.key);body.append(field(spec.label+' · '+spec.key,control));if(spec.description)body.append(el('small',spec.description));
  }
  const warnings=service.latest()?.result?.warnings??[];
  if(warnings.length){const details=el('details');details.append(el('summary','回合提示与失败记录（'+warnings.length+'）'));for(const warning of warnings)details.append(el('pre',JSON.stringify(warning,null,2)));body.append(details);}
 }
 const ready=run(render);
 return {root,ready,state,saveDraft,discardDraft,confirmLeave,settled:()=>Promise.all([pending,...(navigationPending?[navigationPending]:[])]),
  refresh:()=>run(async()=>{if(hasChanges()){status.textContent='当前修改已保留；保存前会核对最新版本。';return false;}config=service.config.read();savedFingerprint=JSON.stringify(config);await render();}),
  requestLeave:()=>{const allowed=navigating||!busy&&!hasChanges()&&!prompt.state().open;return {allowed,dirty:hasChanges(),reason:allowed?'':busy?'配置正在保存或读取':'有未保存的修改'};},
  dispose(){disposed=true;prompt.dispose();if(hostPage&&!hadHostClass)hostPage.classList.remove('tisya-matrix-page');root.inert=false;root.replaceChildren();}
 };
}
