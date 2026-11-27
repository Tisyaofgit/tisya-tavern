import {clone,digest,stableId} from './common.mjs';
import {requirementKey} from './review-workflow.mjs';

export function mountReviewWorkbench(document,{service,run,getSnapshot,onForms}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const button=(text,fn)=>{const n=el('button',text);n.type='button';n.onclick=fn;return n;};
 const input=(label,value='',tag='input')=>{const n=el(tag);n.setAttribute('aria-label',label);n.value=value;return n;};
 const label=(text,...nodes)=>{const n=el('label',text);n.append(...nodes);return n;};
 const option=(value,text)=>{const n=el('option',text);n.value=value;return n;};
 const root=el('div'),tabs=el('nav'),body=el('div'),requirements=el('div');root.className='review-workbench';root.append(tabs,body);root.hidden=true;
 let snapshot=null,settings=null,tableId=null,view='fields',dirty=false,floorId=null,values=[],responseNodes=[],selectedToken=null,editingBackfill=false,importPolicy=null;const drafts=new Map();
 const action=async input=>{const result=await service.reviewAction({...input,contextKey:getSnapshot().contextKey,expectedRevision:getSnapshot().revision});getSnapshot().revision=result.revision;return result;};
 tabs.append(button('常驻字段',()=>{view='fields';render();}),button('历史补录',()=>{view='backfill';render();}),button('三层历史预览',()=>run(async()=>{const preview=await service.previewReviewHistory();view='context';body.replaceChildren();for(const [key,title]of [['historyRecord','统一时间轴 · 已确认归档与按需召回'],['recentSituation','链头快照 · 上轮与本轮']]){const details=el('details');details.open=true;details.append(el('summary',title),el('pre',preview.layers[key]));body.append(details);}body.append(el('p','历史窗口：'+preview.window.configured+' 条。未核实的同义改写保留为独立事实，不做模糊删除。'));})),button('完整表单',onForms));
 const edit=()=>{dirty=true;};
 const typeNames={TEXT:'文字',LONG_TEXT:'长文字',NUMBER:'数字',INTEGER:'整数',BOOLEAN:'是/否',ENUM:'选项',TEXT_LIST:'文字列表',REF:'关联',REF_LIST:'关联列表',CHILD_REF:'附属明细'};
 const channels={cells:'状态更新',archive:'记忆归档'};
 const fieldsFor=table=>[...table.fields,...settings.custom.filter(c=>c.table===table.id&&!table.fields.some(f=>f.key===c.field.key)).map(c=>c.field)];
 const writable=table=>table.program||table.automatic?[]:fieldsFor(table).filter(f=>!f.readonly);
 const chosen=(policy,table)=>new Set([...(policy[table.id]?.cells??[]),...(policy[table.id]?.archive??[])]);
 function setTable(policy,table,keys){delete policy[table.id];if(keys.length)policy[table.id]={[table.channel==='archive'?'archive':'cells']:keys};}
 function policyPicker(parent,policy,changed,prefix='每轮'){
  const tables=snapshot.catalog.filter(t=>writable(t).length),toolbar=el('nav'),list=el('div'),search=input(prefix+'查找表单');search.placeholder='按表名查找';
  toolbar.append(button('全选所有表单',()=>{for(const t of tables)setTable(policy,t,writable(t).map(f=>f.key));changed();render();}),button('全部取消',()=>{for(const key of Object.keys(policy))delete policy[key];changed();render();}));parent.append(toolbar,search,list);
  let rows=[];
  for(const table of tables){
   const fields=writable(table),selected=chosen(policy,table),details=el('details'),summary=el('summary'),check=input(prefix+'整表 '+table.label),name=el('span',table.label),count=el('small',selected.size+' / '+fields.length);check.type='checkbox';check.checked=fields.every(f=>selected.has(f.key));check.indeterminate=selected.size>0&&!check.checked;
   summary.className='review-table-heading';summary.append(check,name,count);details.className='review-table-choice';details.append(summary);const rowsBox=el('div');details.append(rowsBox);let filled=false;
   const updateCount=()=>{const selected=chosen(policy,table);check.checked=fields.every(f=>selected.has(f.key));check.indeterminate=selected.size>0&&!check.checked;count.textContent=selected.size+' / '+fields.length;};
   const fill=()=>{if(filled)return;filled=true;for(const field of fields){const row=el('label'),pick=input(prefix+'字段 '+table.label+' '+field.label);pick.type='checkbox';pick.checked=chosen(policy,table).has(field.key);pick.onchange=()=>{const keys=chosen(policy,table);pick.checked?keys.add(field.key):keys.delete(field.key);setTable(policy,table,[...keys]);changed();updateCount();};row.className='review-field-choice';row.append(pick,el('span',settings.labels[table.id+'|'+field.key]??field.label),el('small',typeNames[field.type]??'内容'));rowsBox.append(row);}};
   details.ontoggle=()=>{if(details.open)fill();};check.onclick=e=>e.stopPropagation();check.onchange=()=>{setTable(policy,table,check.checked?fields.map(f=>f.key):[]);changed();updateCount();rowsBox.replaceChildren();filled=false;if(details.open)fill();};list.append(details);rows.push({details,name:table.label.toLowerCase()});
  }
  search.oninput=()=>{const q=search.value.trim().toLowerCase();for(const row of rows)row.details.hidden=!row.name.includes(q);};
 }
 function renderFields(){
  body.append(el('p','勾选整张表即可每轮核对；展开后可以微调字段。状态表更新当前资料，记忆表保存经历与事实，系统按表的用途处理。'));
  const plan=el('fieldset');plan.append(el('legend','核对方案'));const activePlan=(settings.plans??[]).find(p=>digest(p.policy)===digest(settings.policy));plan.append(el('p','当前：'+(activePlan?.name??(Object.keys(settings.policy).length?'自定义选择 · '+Object.keys(settings.policy).length+' 张表':'按本轮变化'))));const choose=el('select');choose.setAttribute('aria-label','核对方案');choose.append(option('changed','按本轮变化（默认）'),option('filled','常用已填字段'),option('all','全部业务表'));
  for(const [i,p]of (settings.plans??[]).entries())choose.append(option('saved:'+i,p.name));if(activePlan)choose.value='saved:'+settings.plans.indexOf(activePlan);else if(Object.keys(settings.policy).length){choose.append(option('custom','保持当前自定义选择'));choose.value='custom';}
  plan.append(choose,button('应用方案',()=>{if(choose.value==='custom')return;let policy={};if(choose.value.startsWith('saved:'))policy=clone(settings.plans[Number(choose.value.slice(6))].policy);else if(choose.value!=='changed')for(const table of snapshot.catalog){const fields=writable(table).filter(f=>choose.value==='all'||table.records.some(r=>Object.hasOwn(r.values,f.key)));setTable(policy,table,fields.map(f=>f.key));}settings.policy=policy;edit();render();}));
  const name=input('方案名称');name.placeholder='例如：人物与任务';plan.append(name,button('保存为命名方案',()=>run(async()=>{const title=name.value.trim();if(!title)throw Error('请填写方案名称');settings.plans??=[];const old=settings.plans.find(p=>p.name===title),value={name:title,policy:clone(settings.policy)};if(old)Object.assign(old,value);else settings.plans.push(value);await action({action:'settings',settings});dirty=false;})));
  plan.append(el('small','默认只核对本轮实际变化；选择常驻表后，未变化字段也会列入核对。方案随当前聊天存档保存。'));body.append(plan);
  policyPicker(body,settings.policy,edit);
  const advanced=el('details');advanced.append(el('summary','高级：字段命名与新增字段'));const tables=el('select');tables.setAttribute('aria-label','选择表单');for(const t of snapshot.catalog.filter(t=>!t.program))tables.append(option(t.id,t.label));tableId=tableId??snapshot.catalog.find(t=>!t.program)?.id;tables.value=tableId;tables.onchange=()=>{tableId=tables.value;render();};advanced.append(tables);
  const table=snapshot.catalog.find(t=>t.id===tableId);if(table){for(const field of writable(table)){const name=input('字段显示名 '+field.label,settings.labels[tableId+'|'+field.key]??field.label);name.oninput=()=>{settings.labels[tableId+'|'+field.key]=name.value;edit();};advanced.append(label(field.label,name));}
   const key=input('新字段键名'),name=input('新字段显示名'),type=el('select');type.setAttribute('aria-label','新字段类型');for(const t of ['TEXT','LONG_TEXT','NUMBER','INTEGER','BOOLEAN','ENUM','TEXT_LIST'])type.append(option(t,typeNames[t]));const desc=input('新字段说明','','textarea'),min=input('最小值'),max=input('最大值'),options=input('枚举选项（逗号分隔）');advanced.append(label('字段键名',key),label('显示名',name),label('类型',type),label('说明',desc),label('最小值',min),label('最大值',max),label('枚举选项',options),button('加入待保存字段',()=>{const field={key:key.value.trim(),label:name.value.trim(),type:type.value};if(desc.value.trim())field.description=desc.value.trim();if(min.value!=='')field.minimum=Number(min.value);if(max.value!=='')field.maximum=Number(max.value);if(type.value==='ENUM')field.enum=options.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean);settings.custom.push({table:tableId,field});edit();render();}));}
  body.append(advanced,button('保存核对设置',()=>run(async()=>{await action({action:'settings',settings});dirty=false;})));
 }
 function fieldSpec(v){return snapshot.catalog.find(t=>t.id===v.table)?.fields.find(f=>f.key===v.key);}
 function renderBackfill(){
  body.append(el('p','补录勾选与每轮核对独立。遍历所选历史的 char 正文，每层编辑并确认后入档；不重放当前数值或机械动作。'));
  importPolicy??=clone(snapshot.backfill?.policy??settings.policy);const selection=el('details');selection.append(el('summary','选择补录表与字段'),button('沿用每轮勾选',()=>{importPolicy=clone(settings.policy);render();}));policyPicker(selection,importPolicy,()=>{},'补录');body.append(selection);
  const range=el('div'),from=input('补录起始楼层',1),to=input('补录结束楼层',Math.max(1,...snapshot.reviews.map(r=>r.index+1)));from.type=to.type='number';from.min=to.min='1';range.append(label('起始楼层',from),label('结束楼层',to),button('建立补录清单',()=>run(async()=>{if(dirty)throw Error('先保存字段设置再开始补录');await action({action:'prepareBackfill',policy:importPolicy,from:Number(from.value),to:Number(to.value)});floorId=null;editingBackfill=false;})));body.append(range);
  const batch=snapshot.backfill;if(!batch)return;
  const selector=el('select');selector.setAttribute('aria-label','补录楼层');for(const f of batch.floors)selector.append(option(f.id,'第 '+f.floor+' 层 · '+({pending:'待填',ready:'待确认',confirmed:'已归档',skipped:'已覆盖',blocked:'正文待修'}[f.status])));
  floorId=batch.floors.some(f=>f.id===floorId)?floorId:batch.floors.find(f=>['pending','ready'].includes(f.status))?.id??batch.floors[0]?.id;selector.value=floorId;selector.onchange=()=>{floorId=selector.value;render();};body.append(selector);
  const floor=batch.floors.find(f=>f.id===floorId);if(!floor)return;const source=el('details'),summary=el('summary','查看本层原文'),prose=el('pre',floor.body||floor.source.text);source.append(summary,prose);body.append(source);
  if(floor.error)body.append(el('p',floor.error));if(!['pending','ready'].includes(floor.status))return;
  const draftKey=batch.id+'|'+floor.id;values=drafts.get(draftKey)??clone(floor.values.length?floor.values:floor.selection.map(v=>({...v,state:'unknown',response:'',value:null,evidence:'',recordName:'',recordId:''})));drafts.set(draftKey,values);
  if(floor.raw){const raw=input('提炼原始回复',floor.raw,'textarea');body.append(label('原始回复（可修正后重新解析）',raw),button('重新解析候选',()=>run(async()=>{await action({action:'modelBackfill',batchId:batch.id,uid:floor.id,raw:raw.value});drafts.delete(draftKey);editingBackfill=false;})));}
  const rows=el('div');
  const renderValues=()=>{rows.replaceChildren();for(const [i,v]of values.entries()){
   const field=fieldSpec(v),table=snapshot.catalog.find(t=>t.id===v.table),group=el('fieldset');group.append(el('legend',(table?.label??'表单')+'／'+(field?.label??v.label)+' · '+(channels[v.channel]??'资料')));
   const state=el('select');state.setAttribute('aria-label','填写状态 '+i);for(const [id,name]of [['known','已知'],['unknown','仍未知'],['none','明确无'],['not_involved','未涉及']])state.append(option(id,name));state.value=v.state;state.onchange=()=>{v.state=state.value;};
   const who=input('所属记录 '+i,v.recordName??''),value=input('补录值 '+i,v.value==null?'':typeof v.value==='object'?JSON.stringify(v.value):v.value,'textarea'),proof=input('原文依据 '+i,v.evidence??'','textarea'),response=input('核对说明 '+i,v.response??'');
   who.oninput=()=>{v.recordName=who.value.trim();v.recordId=table?.records.find(r=>r.name===v.recordName)?.id??stableId('historical-entity:'+v.table+':'+v.recordName);};value.oninput=()=>{v.value=value.value;};proof.oninput=()=>{v.evidence=proof.value;};response.oninput=()=>{v.response=response.value;};
   const coverage=input('此信息点由这段原文完整承载 '+i);coverage.type='checkbox';coverage.checked=v.coverageReviewed===true;coverage.onchange=()=>{v.coverageReviewed=coverage.checked;};
   group.append(label('状态',state),label('所属记录名称',who),label('字段值',value),label('本层正文中的依据原句',proof),label('核对说明',response),label('已核对：该信息点可由以上原文承载',coverage),button('增加另一条记录',()=>{values.push({...clone(v),recordId:'',recordName:'',value:null,evidence:'',response:'',coverageReviewed:false});renderValues();}));if(values.filter(x=>x.table===v.table&&x.key===v.key&&x.channel===v.channel).length>1)group.append(button('移除此记录',()=>{values.splice(i,1);renderValues();}));rows.append(group);
  }};renderValues();rows.addEventListener('input',()=>{editingBackfill=true;});rows.addEventListener('change',()=>{editingBackfill=true;});body.append(rows);
  const approved=input('我已核对本层全部候选');approved.type='checkbox';approved.checked=false;body.append(label('我已核对本层全部候选',approved));
  const nav=el('nav');if(floor.status==='pending')nav.append(button('提炼本层候选',()=>run(async()=>{await service.generateBackfill({contextKey:getSnapshot().contextKey,expectedRevision:getSnapshot().revision,batchId:batch.id,uid:floor.id});drafts.delete(draftKey);editingBackfill=false;})));
  nav.append(button('保存候选草稿',()=>run(async()=>{await action({action:'fillBackfill',batchId:batch.id,uid:floor.id,values,reviewed:false});editingBackfill=false;drafts.delete(draftKey);})),button('确认本层归档',()=>run(async()=>{if(!approved.checked)throw Error('请先核对本层全部候选');await action({action:'fillBackfill',batchId:batch.id,uid:floor.id,values,reviewed:true});await action({action:'confirmBackfill',batchId:batch.id,uid:floor.id});drafts.delete(draftKey);editingBackfill=false;floorId=null;})));body.append(nav);
 }
 function render(){if(!snapshot)return;body.replaceChildren();if(view==='fields')renderFields();else if(view==='backfill')renderBackfill();}
 function refresh(next){if(snapshot&&snapshot.contextKey!==next.contextKey){dirty=false;editingBackfill=false;importPolicy=null;tableId=null;floorId=null;selectedToken=null;responseNodes=[];drafts.clear();view='fields';}snapshot=next;if(!dirty)settings=clone(next.settings);if(!root.hidden&&view!=='context'&&!(view==='backfill'&&editingBackfill))render();}
 function renderRequirements(next,selected,saved={}){
  const token=selected?.uid+':'+selected?.sourceHash+':'+digest(next.settings.policy);if(token===selectedToken&&responseNodes.length)return;selectedToken=token;requirements.replaceChildren();responseNodes=[];
  const groups=new Map();for(const r of next.requirements??[]){const key=r.table+'|'+r.recordId;if(!groups.has(key))groups.set(key,{title:r.tableName+' · '+r.recordName,items:[]});groups.get(key).items.push(r);}
  if(!groups.size)return;requirements.append(el('h3','常驻字段核对'));
  const defaults=nodes=>{for(const {select,item}of nodes)if(!select.value)select.value=item.recordId==='*'?'未涉及':['known','derived'].includes(item.state)?'沿用':item.state==='none'?'明确无':'仍未知';};
  requirements.append(button('批量填入当前核对状态',()=>defaults(responseNodes)),el('p','已知值标记沿用，空表标记未涉及，未知字段保持未知；本轮实际更新仍由表单内容决定。'));
  for(const group of groups.values()){const details=el('details');details.append(el('summary',group.title+' · '+group.items.length+' 项'));const nodes=[];details.append(button('本组沿用当前状态',()=>defaults(nodes)));
   for(const r of group.items){const select=el('select');select.setAttribute('aria-label','核对 '+r.recordName+' '+r.label);for(const value of ['','沿用','仍未知','明确无','未涉及'])select.append(option(value,value||'待核对；本轮有更新可留空'));select.value=saved[requirementKey(r)]??'';details.append(label(r.label,select));const node={key:requirementKey(r),select,item:r};nodes.push(node);responseNodes.push(node);}requirements.append(details);}
 }

 return {root,requirements,refresh,renderRequirements,responses:()=>Object.fromEntries(responseNodes.map(r=>[r.key,r.select.value])),open(nextView){if(nextView)view=nextView;root.hidden=false;render();},close(){root.hidden=true;},resetRequirements(){selectedToken=null;responseNodes=[];}};
}
