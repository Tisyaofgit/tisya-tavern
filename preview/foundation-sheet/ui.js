export function mountFoundationSheet(root,engine,catalog,{download}={}){
 const d=root.ownerDocument,el=(tag,text,cls)=>{const e=d.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const invalid=new Map(),includedChildren=new Set();
 const action=(text,fn,cls,allowInvalid=false)=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',()=>run(()=>{if(invalid.size&&!allowInvalid)throw Error('请先修正红色单元格，或将它留待填写。');return fn();}));return b;};
 let selectedTemplate='origin.character',selectedRecord=null,group=null,dirty=false,currentTicket=null;
 const header=el('header'),brand=el('div'),badge=el('span','可编辑预览','badge');brand.append(el('p','缇斯亚 · 档案工作台','eyebrow'),el('h1','把设定填进格子里'),badge);header.append(brand);root.append(header);
 const tools=el('div',undefined,'toolbar'),picker=el('select');picker.setAttribute('aria-label','选择表单');
 for(const layer of ['基点','原点','会话']){const opt=el('optgroup');opt.label=layer;for(const t of catalog.templates.filter(t=>t.layer===layer)){const o=el('option',t.label);o.value=t.id;opt.append(o);}picker.append(opt);}picker.value=selectedTemplate;
 const records=el('select');records.setAttribute('aria-label','选择档案');tools.append(picker,records,action('＋ 新档案',()=>{const r=engine.create(selectedTemplate);selectedRecord=r.id;dirty=true;draw();}));
 const file=el('input');file.type='file';file.accept='.json,application/json';file.hidden=true;
 tools.append(action('保存草稿',()=>{if(typeof download!=='function')throw Error('当前环境不支持导出');download('缇斯亚__草稿__基础表单.json',JSON.stringify(engine.snapshot(),null,2));dirty=false;message('草稿已交给浏览器下载。重新打开页面时可导入继续。');}),action('导入草稿',()=>file.click()),file);root.append(tools);
 const notice=el('p','填写会留在当前页面；可保存草稿文件，下次导入继续。','notice');root.append(notice);
 const childrenPanel=el('details',undefined,'child-panel');childrenPanel.append(el('summary','人物子表'));const childTools=el('div',undefined,'actions'),childList=el('div');childrenPanel.append(childTools,childList);root.append(childrenPanel);
 const tabs=el('nav',undefined,'tabs');tabs.setAttribute('aria-label','字段分组');root.append(tabs);
 const sheet=el('section',undefined,'sheet'),caption=el('div',undefined,'sheet-caption'),table=el('table'),thead=el('thead'),hr=el('tr');hr.append(el('th',''),el('th','A · 字段'),el('th','B · 待填写'));thead.append(hr);const tbody=el('tbody');table.append(thead,tbody);sheet.append(caption,table);root.append(sheet);
 const status=el('p','', 'status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');root.append(status);
 const ai=el('details',undefined,'ai-panel'),sum=el('summary','AI 填表');ai.append(sum,el('p','这里只准备填表任务、检查并回填结果；预览未连接模型。'));
 const source=el('textarea');source.placeholder='粘贴本次填写依据或设计要求';source.setAttribute('aria-label','填写依据');ai.append(source);
 const aiTools=el('div',undefined,'actions'),requestText=el('textarea');requestText.readOnly=true;requestText.setAttribute('aria-label','发给AI的任务');requestText.placeholder='准备任务后，这里只显示需要填写的字段';
 aiTools.append(action('准备当前组的空白格',()=>{
  const t=engine.template(selectedTemplate),keys=t.fields.filter(f=>f.group===group&&engine.get(selectedRecord,f.key)===undefined).map(f=>f.key);
  currentTicket=engine.request(selectedRecord,{keys,source:source.value,referenceIds:engine.references().map(r=>r.值)});
  requestText.value=currentTicket.modelInput;answer.value='';message('任务已准备，只含本组空白格。已有值不会交给 AI 覆盖。');
 }),action('导出任务',()=>{if(!currentTicket)throw Error('请先准备填表任务');if(typeof download!=='function')throw Error('当前环境不支持导出');download('缇斯亚__填表__任务.txt',requestText.value);}));
 const answer=el('textarea');answer.setAttribute('aria-label','AI回填结果');answer.placeholder='粘贴 D 老师填好的分组文本';
 aiTools.append(action('准备整份人物（含勾选子表）',()=>{const r=engine.read(selectedRecord),parentId=r.parentId??r.id;if(engine.read(parentId).template!=='origin.character')throw Error('请先选择人物档案');const recordIds=[parentId,...engine.snapshot().records.filter(x=>x.parentId===parentId&&includedChildren.has(x.id)).map(x=>x.id)];currentTicket=engine.requestDossier(parentId,{recordIds,source:source.value,referenceIds:engine.references().map(x=>x.值)});requestText.value=currentTicket.modelInput;answer.value='';message('已准备人物和勾选的子表；填写依据按你粘贴的原文导出。');}));
 ai.append(aiTools,requestText,answer,action('检查并回填',()=>{if(!currentTicket)throw Error('请先准备填表任务');if(currentTicket.recordId!==selectedRecord&&currentTicket.recordId!==engine.read(selectedRecord).parentId)throw Error('当前档案与填值任务不一致，请重新准备任务');engine.accept(currentTicket.token,answer.value);currentTicket=null;dirty=true;draw();message('已回填到草稿。结构检查通过；事实和知情范围仍需核对。');},'primary'));
 root.append(ai,el('footer','草稿预览 · 不写入聊天存档'));
 source.addEventListener('input',()=>{if(currentTicket){currentTicket=null;requestText.value='';message('填写依据已变化，请重新准备任务。');}});
 function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
 function run(fn){try{const p=fn();if(p?.catch)p.catch(e=>message(e.message,true));}catch(e){message(e.message,true);}}
 function saveCell(f,value,input){try{engine.edit(selectedRecord,f.key,value);dirty=true;invalid.delete(f.key);input.removeAttribute('aria-invalid');message('已修改 · '+f.label);}catch(e){dirty=true;invalid.set(f.key,input.value);input.setAttribute('aria-invalid','true');message(f.label+'：'+e.message+'；有效草稿未改变。',true);}}
 function editor(f,current){
  const def=f.definition,box=el('div',undefined,'cell-editor');let input;
  if(['enum','boolean','ref','refs'].includes(def.type)){
   input=el('select');if(def.type==='refs'){input.multiple=true;input.size=3;}
   else{const blank=el('option','待填写');blank.value='';input.append(blank);}
   const choices=def.type==='boolean'?[[false,'否'],[true,'是']]:def.type==='enum'?def.values.map(v=>[v,v]):engine.references().map(r=>[r.值,r.名称]);
   choices.forEach(([v,label],i)=>{const op=el('option',label);op.value=String(i+1);op.selected=def.type==='refs'?(current??[]).includes(v):current===v;input.append(op);});
   if(def.type!=='refs'&&current===undefined)input.value='';
   input.addEventListener('change',()=>{let value;if(def.type==='refs')value=[...input.selectedOptions].map(o=>choices[Number(o.value)-1][0]);else value=input.value===''?undefined:choices[Number(input.value)-1][0];saveCell(f,value,input);});
  }else{
   input=el('textarea');input.rows=1;input.spellcheck=false;input.placeholder='待填写';
   input.value=current===undefined?'':def.type==='texts'?current.join('\n'):['json','array','map','object'].includes(def.type)?JSON.stringify(current,null,2):String(current);
   if(['number','duration'].includes(def.type))input.inputMode='decimal';
   const resize=()=>{input.style.height='auto';input.style.height=Math.max(44,input.scrollHeight)+'px';};
   input.addEventListener('input',()=>{resize();let value;try{const raw=input.value;if(raw==='')value=undefined;else if(['number','duration'].includes(def.type)){if(!raw.trim())throw Error('请填写数值');value=Number(raw);}else if(def.type==='texts')value=raw.split('\n').filter(x=>x.trim());else if(['json','array','map','object'].includes(def.type))value=JSON.parse(raw);else value=raw;saveCell(f,value,input);}catch(e){dirty=true;invalid.set(f.key,input.value);input.setAttribute('aria-invalid','true');message(f.label+'：'+e.message+'；有效草稿未改变。',true);}});
  }
  input.setAttribute('aria-label',f.key);input.dataset.key=f.key;box.append(input);return {box,input};
 }
 function drawChildren(r){
  const parentId=r.parentId??(r.template==='origin.character'?r.id:null);childrenPanel.hidden=!parentId;if(!parentId)return;
  childTools.replaceChildren();childList.replaceChildren();
  const go=id=>{const row=engine.read(id);selectedRecord=id;selectedTemplate=row.template;picker.value=selectedTemplate;group=null;draw();};
  childTools.append(action('回人物主表',()=>go(parentId)));
  for(const [kind,label]of [['history','前史'],['relationships','关系'],['secrets','隐情']])childTools.append(action('＋ '+label,()=>{const child=engine.createChild(parentId,kind);dirty=true;go(child.id);}));
  childList.append(el('p','勾选本次交给 AI 填写的子表；可反复添加同类记录。'));
  for(const child of engine.snapshot().records.filter(x=>x.parentId===parentId)){
   const line=el('div',undefined,'child-choice'),label=el('label'),checkbox=el('input');checkbox.type='checkbox';checkbox.checked=includedChildren.has(child.id);checkbox.setAttribute('aria-label','包含'+child.title);
   checkbox.addEventListener('change',()=>{if(checkbox.checked)includedChildren.add(child.id);else includedChildren.delete(child.id);currentTicket=null;requestText.value='';message('子表选择已变更，请重新准备任务。');});
   label.append(checkbox,d.createTextNode(child.values.名称||child.title));line.append(label,action('编辑',()=>go(child.id)));childList.append(line);
  }
 }
 function draw(){
  const t=engine.template(selectedTemplate),all=engine.snapshot().records.filter(r=>r.template===selectedTemplate);
  if(!all.some(r=>r.id===selectedRecord)){const r=all[0]??engine.create(selectedTemplate);selectedRecord=r.id;}
  const r=engine.read(selectedRecord);drawChildren(r);records.replaceChildren();for(const row of engine.snapshot().records.filter(r=>r.template===selectedTemplate)){const o=el('option',row.values.名称||row.title);o.value=row.id;records.append(o);}records.value=r.id;
  if(!t.groups.includes(group))group=t.groups[0];tabs.replaceChildren();for(const g of t.groups){const b=action(g,()=>{group=g;draw();});b.setAttribute('aria-pressed',String(g===group));tabs.append(b);}
  const fs=t.fields.filter(f=>f.group===group);caption.textContent=t.label+' / '+group;tbody.replaceChildren();
  for(const f of fs){const tr=el('tr'),key=el('th'),cell=el('td');key.scope='row';key.append(el('span',f.label));
   const more=el('details',undefined,'field-help');more.append(el('summary','· · ·'));const text=el('p',f.definition.description||({texts:'每行一项',refs:'可选择多个已建对象',ref:'选择已建对象',json:'填写JSON值，保留实际类型'}[f.definition.type]??'按资料填写；未知可留空。'));more.append(text);
   more.append(action('留待填写',()=>{engine.edit(selectedRecord,f.key,undefined);invalid.delete(f.key);dirty=true;draw();message('已留空 · '+f.label);},undefined,true));
   if(['texts','refs','array'].includes(f.definition.type))more.append(action('明确无条目',()=>{engine.edit(selectedRecord,f.key,[]);dirty=true;draw();message('已明确记录空列表 · '+f.label);}));
   if(f.definition.type==='text'&&!f.definition.required)more.append(action('明确空文本',()=>{engine.edit(selectedRecord,f.key,'');dirty=true;draw();message('已明确记录空文本 · '+f.label);}));
   if(f.definition.nullable||f.definition.type==='json')more.append(action('明确空值',()=>{engine.edit(selectedRecord,f.key,null);dirty=true;draw();message('已明确记录null · '+f.label);}));
   if(r.derived?.includes(f.key)&&!r.manual.includes(f.key))more.append(el('p','由本表明确关联自动汇总；手动修改后保留你的值。'));key.append(more);const current=engine.get(selectedRecord,f.key),control=editor(f,current);if(invalid.has(f.key)){control.input.value=invalid.get(f.key);control.input.setAttribute('aria-invalid','true');}cell.append(control.box);
   if(current!==undefined&&(current===''||current===null||Array.isArray(current)&&!current.length))cell.append(el('small',current===null?'已明确为空':Array.isArray(current)?'已明确无条目':'已明确为空文本','empty-marker'));
   const number=el('th',String(t.fields.indexOf(f)+1),'row-number');number.scope='row';tr.append(number,key,cell);tbody.append(tr);
  }
 }
 picker.addEventListener('change',()=>{if(invalid.size){picker.value=selectedTemplate;message('请先修正红色单元格。',true);return;}selectedTemplate=picker.value;selectedRecord=null;group=null;draw();});records.addEventListener('change',()=>{if(invalid.size){records.value=selectedRecord;message('请先修正红色单元格。',true);return;}selectedRecord=records.value;draw();});
 file.addEventListener('change',()=>run(async()=>{const f=file.files?.[0];if(!f)return;try{if(f.size>5000000)throw Error('草稿文件超过5MB');const input=JSON.parse(await f.text());engine.restore(input);includedChildren.clear();const r=engine.snapshot().records[0];selectedTemplate=r?.template??'origin.character';selectedRecord=r?.id??null;picker.value=selectedTemplate;group=null;currentTicket=null;requestText.value='';answer.value='';dirty=false;draw();message('草稿已导入。');}finally{file.value='';}}));
 draw();return {engine,draw,isDirty:()=>dirty,dispose:()=>root.replaceChildren()};
}
