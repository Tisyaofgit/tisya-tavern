const copy=value=>structuredClone(value);
const phases={preparing:'正在读取来源与模板',streaming:'缇斯亚正在创作',ready:'草稿已就绪，等待你核对',error:'这次创作没有完成',cancelled:'已停止，已收到的内容保留'};
export const creationTaskRunning=task=>['preparing','streaming'].includes(task?.status);
export function creationChatText(raw){
 const text=String(raw??''),body=text.match(/<body(?:\s[^>]*)?>([\s\S]*?)(?:<\/body>|$)/i);
 if(body)return body[1].replace(/\n?<[^>]*$/,'').trim();
 return /^\s*<reply\b/i.test(text)?'':text;
}

// The service owns the task. This component only observes it; removing the view
// must never abort the stream or discard its eventual draft.
export function mountCreationWorkbench(document,root,{composer,onSend,onCancel,onError=()=>{}}){
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;return node;};
 root.dataset.creationWorkbench='';root.className='tisya-creation-workbench';
 const style=el('style');style.textContent=`.tisya-creation-workbench{display:grid;gap:10px;min-width:0}.tisya-creation-conversation{display:flex;flex-direction:column;gap:10px;max-height:42dvh;min-height:120px;overflow:auto;overscroll-behavior:contain}.tisya-creation-message{max-width:94%;margin:0;padding:10px;border:1px solid #91a89e55;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}.tisya-creation-message[data-role=user]{align-self:flex-end;background:#ffffff0b}.tisya-creation-message[data-role=assistant]{align-self:flex-start}.tisya-creation-composer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.tisya-creation-composer textarea{grid-column:1/-1;width:100%;box-sizing:border-box;min-height:75px}.tisya-creation-composer button{min-height:44px}.tisya-creation-table{width:100%;border-collapse:collapse;table-layout:fixed}.tisya-creation-table th,.tisya-creation-table td{padding:8px;border-bottom:1px solid #91a89e55;vertical-align:top;overflow-wrap:anywhere;text-align:left}.tisya-creation-table th:first-child{width:25%}.tisya-creation-table input,.tisya-creation-table textarea,.tisya-creation-table select{max-width:100%;width:100%;box-sizing:border-box;min-height:38px}.tisya-creation-table textarea{resize:vertical}.tisya-creation-value{display:grid;gap:6px;min-width:0}.tisya-creation-value fieldset{padding:8px;margin:4px 0}.tisya-creation-value button{min-height:36px}.tisya-creation-field-rule{font-size:12px;opacity:.8}.tisya-creation-progress{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tisya-creation-progress progress{max-width:140px}.tisya-creation-message strong{display:block;white-space:normal;margin-bottom:5px}`;
 const conversation=el('div');conversation.className='tisya-creation-conversation';conversation.dataset.creationConversation='';conversation.setAttribute('role','log');conversation.setAttribute('aria-live','polite');
 const progressRow=el('div');progressRow.className='tisya-creation-progress';const progress=el('progress'),status=el('span'),cancel=el('button','停止创作');progress.removeAttribute('value');progress.setAttribute('aria-label','创作进行中');status.dataset.creationProgress='';status.setAttribute('role','status');cancel.type='button';cancel.className='menu_button';cancel.dataset.creationCancel='';cancel.onclick=()=>Promise.resolve(onCancel?.()).catch(onError);progressRow.append(progress,status,cancel);
 const error=el('p');error.dataset.creationTaskError='';error.setAttribute('role','alert');
 const diagnostics=el('details');diagnostics.dataset.creationDiagnostics='';diagnostics.append(el('summary','查看本次提示词、模板和失败位置'));const diagnosticBody=el('div');diagnostics.append(diagnosticBody);
 function copyButton(text){return Object.assign(el('button','复制全文'),{type:'button',className:'menu_button',onclick:async()=>{try{if(document.defaultView?.navigator?.clipboard?.writeText)await document.defaultView.navigator.clipboard.writeText(text);else {const box=el('textarea');box.value=text;box.readOnly=true;box.setAttribute('aria-label','待复制内容');diagnosticBody.append(box);box.select();}}catch(error){onError(error);}}});}
 const form=el('form');form.className='tisya-creation-composer';composer.rows=3;composer.placeholder='说说你想创作什么，或继续提出修改要求…';composer.setAttribute('aria-label','发给缇斯亚的创作要求');
 const send=el('button','生成表单草稿');send.type='submit';send.className='menu_button';send.title='发送创作要求';send.dataset.creationSend='';const hint=el('small','Enter 发送 · Shift+Enter 换行；收起页面后任务继续。');form.append(composer,hint,send);
 form.onsubmit=event=>{event.preventDefault();if(!send.disabled)Promise.resolve(onSend()).catch(onError);};composer.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();if(!send.disabled)form.requestSubmit();}});
 root.append(style,conversation,progressRow,error,diagnostics,form);let disposed=false,locked=false,current=null;
 function render(task,messages=task?.messages??[]){if(disposed)return;current=task;const nearBottom=conversation.scrollHeight-conversation.scrollTop-conversation.clientHeight<60;conversation.replaceChildren();
  for(const message of messages){if(!['user','assistant'].includes(message.role))continue;const text=message.role==='assistant'?creationChatText(message.content):String(message.content??'');if(!text)continue;const article=el('article');article.className='tisya-creation-message';article.dataset.role=message.role;article.append(el('strong',message.role==='user'?'你':'缇斯亚'),el('span',text));conversation.append(article);}
  const streamed=creationChatText(task?.text),last=messages.at(-1);if(streamed&&!(last?.role==='assistant'&&creationChatText(last.content)===streamed)){const article=el('article');article.className='tisya-creation-message';article.dataset.role='assistant';article.dataset.creationStream='';article.append(el('strong','缇斯亚'),el('span',streamed));conversation.append(article);}
  if(!conversation.childNodes.length)conversation.append(el('p','把想法告诉我。我们可以边聊边修改，结果会整理到下方的表格与档案。'));
  const running=creationTaskRunning(task);progress.hidden=cancel.hidden=!running;cancel.disabled=!running;status.textContent=task?(phases[task.status]??'正在处理')+(task.phase?' · '+task.phase:'')+(running&&task.text?' · 已接收 '+task.text.length+' 字符':''):'等待你的想法';
  error.textContent=[typeof task?.error==='string'?task.error:task?.error?.message,task?.persistenceError?'恢复记录尚未保存：'+(task.persistenceError.message??task.persistenceError):''].filter(Boolean).join('；');error.hidden=!error.textContent;
  diagnosticBody.replaceChildren();diagnostics.hidden=!task;
  if(task?.promptMessages?.length){const text=task.promptMessages.map(message=>'['+message.role+']\n'+(typeof message.content==='string'?message.content:JSON.stringify(message.content,null,2))).join('\n\n');const pre=el('pre',text);pre.dataset.creationPrompt='';pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';diagnosticBody.append(el('h4','实际发送给模型的完整提示词'),copyButton(text),pre);}else if(task)diagnosticBody.append(el('p','本次请求尚未提供已发送提示词记录。'));
  if(task?.templateInfo||task?.templates){const text=JSON.stringify(task.templateInfo??task.templates,null,2);diagnosticBody.append(el('h4','本次模板依据'),el('pre',text));}
  if(task?.formLocation){diagnosticBody.append(el('h4','失败位置'),el('pre',typeof task.formLocation==='string'?task.formLocation:JSON.stringify(task.formLocation,null,2)));}
  if(task?.text){const raw=el('details');raw.dataset.creationRawReply='';raw.append(el('summary','本次模型原答（含未完成片段）'),copyButton(task.text),el('pre',task.text));diagnosticBody.append(raw);}
  send.disabled=composer.disabled=locked||running;send.textContent=messages.length?'继续创作':'生成表单草稿';if(nearBottom)conversation.scrollTop=conversation.scrollHeight;
 }
 render(null);return {render,setLocked(value){locked=!!value;render(current);},dispose(){disposed=true;}};
}

const kindOf=value=>value===null?'null':Array.isArray(value)?'array':typeof value;
const emptyValue=kind=>({string:'',number:0,boolean:false,object:{},array:[],null:null})[kind];
const safeKey=key=>key.trim()&&!['__proto__','prototype','constructor'].includes(key);

export function renderCreationAcceptance(document,root,{acceptance,rawResponse='',saved=false,onRepair,disabled=false}){
 if(!acceptance)return null;const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;},section=el('section');section.dataset.creationAcceptance='';
 const pending=acceptance.pending??[],warnings=acceptance.warnings??[];section.append(el('h4',(saved?'已保存':'已通过')+' '+(acceptance.acceptedCount??0)+' 条 · 待修复 '+pending.length+' 条'));
 if(pending.length){const table=el('table');table.className='tisya-creation-table';table.dataset.creationPending='';const head=el('tr');head.append(el('th','条目 / 字段'),el('th','问题与原文'));table.append(head);
  for(const row of pending){const tr=el('tr'),label=el('th',[row.heading??row.tableId??row.id,row.label??row.field].filter(Boolean).join(' / ')),cell=el('td');label.scope='row';
   const problems=[row.reason??row.message,...(row.errors??[]).map(problem=>typeof problem==='string'?problem:[problem.field,problem.message??problem.reason].filter(Boolean).join('：'))].filter(Boolean);for(const message of new Set(problems.length?problems:['需要核对']))cell.append(el('p',message));
   const dependencies=row.dependencies??row.dependency;if(dependencies){const values=Array.isArray(dependencies)?dependencies:[dependencies];cell.append(el('p','等待关联条目：'+values.map(value=>typeof value==='string'?value:value.heading??value.label??[value.tableId,value.recordId].filter(Boolean).join(' / ')).join('、')));}
   const value=row.rawValue??row.raw;if(value!==undefined)cell.append(el('pre',typeof value==='string'?value:JSON.stringify(value,null,2)));tr.append(label,cell);table.append(tr);}section.append(table);
 }
 if(warnings.length){const details=el('details');details.dataset.creationWarnings='';details.append(el('summary','优化建议（'+warnings.length+'）'));for(const warning of warnings)details.append(el('p',typeof warning==='string'?warning:warning.message??warning.reason??JSON.stringify(warning)));section.append(details);}
 if(pending.length||warnings.length){section.append(el('p',saved?(pending.length?'已通过条目已有保存回执；下一轮只修待办，并沿用已保存条目的身份与引用。':'条目已保存；优化建议供之后明确修订时参考。'):(pending.length?'可先核对并保存已通过条目；待修条目与原文会继续保留。':'优化建议供你参考，确认后可以保存这些条目。')));
  const original=el('details');original.dataset.creationPendingRaw='';original.append(el('summary','保留的本次原答'),el('pre',rawResponse));section.append(original);
  if(onRepair&&pending.length){const repair=el('button','继续修复待办');repair.type='button';repair.className='menu_button';repair.dataset.creationRepair='';repair.disabled=disabled;repair.onclick=onRepair;section.append(repair);}
 }
 root.append(section);return section;
}

// Every cell remains typed. Nested rules and lists are edited as individual
// fields; neither model output nor user input is executed as code.
export function mountCreationTable(document,root,{proposal,schema={},fieldTexts={},fieldErrors={},onChange=()=>{},onInvalid=()=>{}}){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
 const button=(text,fn)=>{const n=el('button',text);n.type='button';n.className='menu_button';n.onclick=fn;return n;};
 const options=select=>{for(const [value,label]of [['string','文字'],['number','数字'],['boolean','是 / 否'],['object','字段组'],['array','列表'],['null','未设置']]){const o=el('option',label);o.value=value;select.append(o);}};
 root.dataset.creationFields='';root.dataset.creationDraft='';
 function clearPathState(index,key,path,{arrayIndex}={}){
  const prefix=index+':'+key+':',under=(candidate,ancestor)=>ancestor.every((value,i)=>String(candidate[i])===String(value));
  for(const values of [fieldTexts,fieldErrors]){
   const retained=[];
   for(const token of Object.keys(values)){if(!token.startsWith(prefix))continue;let current;try{current=JSON.parse(token.slice(prefix.length));}catch{continue;}if(!Array.isArray(current)||!under(current,path))continue;
    const value=values[token];delete values[token];
    if(arrayIndex!==undefined){const next=Number(current[path.length]);if(current.length>path.length&&Number.isInteger(next)&&next!==arrayIndex){if(next>arrayIndex)current[path.length]=String(next-1);retained.push([prefix+JSON.stringify(current),value]);}}
   }
   for(const [token,value]of retained)values[token]=value;
  }
  onInvalid('',Object.keys(fieldErrors).length>0);
 }
 function editValue(value,{index,key,path=[],set,def,canChangeType=false}){
  const box=el('div');box.className='tisya-creation-value';const kind=kindOf(value),token=index+':'+key+':'+JSON.stringify(path);
  const mark=(node)=>{node.dataset.creationRow=String(index);node.dataset.creationKey=key;node.dataset.creationPath=JSON.stringify(path);node.setAttribute('aria-label',(def?.label??key)+(path.length?' / '+path.join(' / '):''));};
  const change=next=>{clearPathState(index,key,path);set(next);onInvalid(token,false);onChange(proposal);};
  if(canChangeType||kind==='null'){
   const types=el('select');types.dataset.creationValueType='';options(types);types.value=kind;types.setAttribute('aria-label','字段类型');types.onchange=()=>{change(copy(emptyValue(types.value)));draw();};box.append(types);
  }
  if(kind==='null'){box.append(el('small','未设置；不会被当成空文字或否。'));return box;}
  if(kind==='object'||kind==='array'){
   const entries=Object.entries(value);
   for(const [childKey,childValue]of entries){const group=el('fieldset');group.append(el('legend',kind==='array'?'第 '+(Number(childKey)+1)+' 项':childKey));group.append(editValue(childValue,{index,key,path:[...path,childKey],set:next=>{value[childKey]=next;},canChangeType:true}));group.append(button('移除此项',()=>{if(kind==='array'){clearPathState(index,key,path,{arrayIndex:Number(childKey)});value.splice(Number(childKey),1);}else{clearPathState(index,key,[...path,childKey]);delete value[childKey];}onChange(proposal);draw();}));box.append(group);}
   const add=el('div'),type=el('select');options(type);type.setAttribute('aria-label','新项目类型');const name=el('input');name.placeholder='字段名称';name.setAttribute('aria-label','新字段名称');if(kind==='object')add.append(name);add.append(type,button('添加'+(kind==='array'?'一项':'字段'),()=>{if(kind==='object'){const childKey=name.value.trim();if(!safeKey(childKey)||Object.hasOwn(value,childKey)){name.setCustomValidity('请输入不重复的有效字段名');name.reportValidity();return;}value[childKey]=copy(emptyValue(type.value));}else value.push(copy(emptyValue(type.value)));onChange(proposal);draw();}));box.append(add);return box;
  }
  const node=el(kind==='boolean'?'select':kind==='number'?'input':'textarea');node.className='text_pole';mark(node);
  if(kind==='boolean'){for(const [v,label]of [['true','是'],['false','否']]){const o=el('option',label);o.value=v;node.append(o);}}
  else if(kind==='number'){node.type='text';node.inputMode='decimal';}else node.rows=String(value??'').length>100?5:2;
  node.value=fieldTexts[token]??String(value);if(fieldErrors[token])node.setCustomValidity('请输入有效的'+(kind==='number'?'数字':'内容'));
  const update=()=>{fieldTexts[token]=node.value;let next=node.value;if(kind==='number'){if(!next.trim()||!Number.isFinite(Number(next))){fieldErrors[token]=true;node.setCustomValidity('请输入有效数字');onInvalid(token,true);return;}next=Number(next);}else if(kind==='boolean')next=next==='true';set(next);delete fieldErrors[token];node.setCustomValidity('');onInvalid(token,false);onChange(proposal);};node.oninput=node.onchange=update;box.append(node);return box;
 }
 function draw(){root.replaceChildren();for(const [index,change]of(proposal?.matrix?.changes??[]).entries()){
  const spec=schema[change.tableId],section=el('section');section.dataset.creationTable=change.tableId;section.append(el('h4',(spec?.label??change.tableId)+' · '+(change.values.name??change.values.label??'记录 '+(index+1))));
  const table=el('table');table.className='tisya-creation-table';const head=el('thead'),headRow=el('tr');headRow.append(el('th','项目'),el('th','内容'));head.append(headRow);table.append(head);const body=el('tbody');
  for(const [key,value]of Object.entries(change.values)){const def=spec?.fields?.find(field=>field.key===key),row=el('tr'),label=el('th',def?.label??key),cell=el('td');label.scope='row';const rule=el('div',[def?.description??def?.help??'',def?.required?'必填':'',def?.type?'类型：'+def.type:''].filter(Boolean).join(' · '));rule.className='tisya-creation-field-rule';label.append(rule);cell.append(editValue(value,{index,key,def,set:next=>{change.values[key]=next;}}));row.append(label,cell);body.append(row);}
  table.append(body);section.append(table);root.append(section);
 }}draw();return {redraw:draw,value:()=>copy(proposal)};
}
