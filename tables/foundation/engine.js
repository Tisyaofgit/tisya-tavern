import {formSections,formRow,decodeFormText,FORM_TEXT_INSTRUCTIONS} from './form-text.js';
// Shared draft engine. No transport, worldbook, canonical store or network access.
export function createSheetEngine(catalog, validateValue) {
 const clone=x=>structuredClone(x),own=(o,k)=>Object.hasOwn(o,k),check=(ok,m)=>{if(!ok)throw Error(m);};
 const bad=new Set(['__proto__','prototype','constructor']);
 const templates=new Map(catalog.templates.map(t=>[t.id,t]));
 let state={format:'tisya.foundation-workbook/1',catalogVersion:catalog.version,records:[],revision:0},serial=0;
 const pending=new Map();
 const at=(o,path)=>path.reduce((v,k)=>v&&own(v,k)?v[k]:undefined,o);
 const put=(o,path,value)=>{let p=o;for(const key of path.slice(0,-1)){check(!bad.has(key),'字段路径无效');p=p[key]??={};}const key=path.at(-1);check(!bad.has(key),'字段路径无效');if(value===undefined)delete p[key];else p[key]=clone(value);};
 const template=id=>{const t=templates.get(id);check(t,'表单不存在');return t;};
 const record=id=>{const r=state.records.find(r=>r.id===id);check(r,'档案不存在');return r;};
 const field=(t,key)=>{const f=t.fields.find(f=>f.key===key);check(f,'未开放字段：'+key);return f;};
 function validate(v,def,refs){
  check(validateValue(v,def),'值类型或范围不符');
  if(v===null)return;
  if(def.type==='ref')check(refs.has(v),'引用对象不存在或未获授权');
  if(def.type==='refs')for(const id of v)check(refs.has(id),'引用对象不存在或未获授权');
  if(def.type==='array')for(const x of v)validate(x,def.items,refs);
  if(def.type==='map')for(const x of Object.values(v))validate(x,def.items,refs);
  if(def.type==='object'&&def.fields)for(const [k,x]of Object.entries(v))if(def.fields[k])validate(x,def.fields[k],refs);
 }
 const allowedRefs=()=>new Set(state.records.filter(r=>template(r.template).table!=='core-draft').map(r=>r.id));
 function validateRecordValues(values,t,refs){
  check(values&&typeof values==='object'&&!Array.isArray(values),'档案值无效');
  function walk(o,path=[]){for(const [key,v]of Object.entries(o)){check(!bad.has(key),'字段名称无效');const p=[...path,key],f=t.fields.find(f=>JSON.stringify(f.path)===JSON.stringify(p));if(f){validate(v,f.definition,refs);continue;}check(t.fields.some(f=>p.every((k,i)=>f.path[i]===k))&&v&&typeof v==='object'&&!Array.isArray(v),'未登记字段：'+p.join('.'));walk(v,p);}}
  walk(values);
 }
 const refsFor=ids=>state.records.filter(r=>ids.has(r.id)).map(r=>({值:r.id,名称:at(r.values,['名称'])||r.title}));
 function create(templateId){const t=template(templateId),id='draft-'+(++serial);const r={id,template:templateId,title:t.label+' '+(state.records.filter(r=>r.template===templateId).length+1),revision:0,values:{},manual:[]};state.records.push(r);state.revision++;return clone(r);}
 function edit(id,key,value){const r=record(id),f=field(template(r.template),key);if(value!==undefined){validate(value,f.definition,allowedRefs());if(r.parentId&&f.label==='主体')check(value===r.parentId,'主体必须属于当前人物');}put(r.values,f.path,value);if(!r.manual.includes(key))r.manual.push(key);syncObjects(r);r.revision++;state.revision++;return clone(r);}
 // Plain text is the default model surface; stable paths remain host-only.
 const childTypes={history:'前史',relationships:'关系',secrets:'隐情'};
 const childTemplate=t=>t.id.startsWith('origin.character.');
 function syncObjects(r){
  const t=template(r.template);if(!childTemplate(t)||r.manual.includes('对象'))return;
  if(at(r.values,['对象'])!==undefined&&!r.derived?.includes('对象'))return;
  const values=[];if(r.parentId)values.push(r.parentId);
  for(const f of t.fields)if(f.key!=='对象'&&['ref','refs'].includes(f.definition.type)){const v=at(r.values,f.path);if(v!==undefined&&v!==null)values.push(...(Array.isArray(v)?v:[v]));}
  if(!values.length){if(r.derived?.includes('对象'))put(r.values,['对象'],undefined);return;}
  put(r.values,['对象'],[...new Set(values)]);r.derived=[...new Set([...(r.derived??[]),'对象'])];
 }
 function createChild(parentId,kind){
  const parent=record(parentId);check(parent.template==='origin.character'&&childTypes[kind],'子表归属或类型无效');
  const made=create('origin.character.'+kind),r=record(made.id);r.parentId=parentId;
  const subject=template(r.template).fields.find(f=>f.label==='主体');if(subject)put(r.values,subject.path,parentId);
  syncObjects(r);return clone(r);
 }
 function selectedKeys(r,keys,deriveObjects){
  const t=template(r.template),selected=keys??t.fields.filter(f=>at(r.values,f.path)===undefined).map(f=>f.key);
  return selected.filter(k=>!(deriveObjects&&childTemplate(t)&&k==='对象'));
 }
 function makeAliases(refs){
  const items=refsFor(new Set(refs)),counts=new Map();for(const x of items)counts.set(x.名称,(counts.get(x.名称)??0)+1);
  return items.map(x=>({...x,显示:counts.get(x.名称)>1?x.名称+'〔'+x.值+'〕':x.名称}));
 }
 const listType=d=>['texts','refs'].includes(d.type);
 function plainInput(parts,source,refs,rules={}){
  const out=[FORM_TEXT_INSTRUCTIONS,'档案：'+parts[0].ownerName,'按资料填写，保留分组、行号和字段名，每行填一个字段。字段名后可用冒号；未知留空，只返回填好的内容。'];
  if(parts.some(p=>p.cells.some(c=>listType(c.definition))))out.push('列表格多项用“；”分隔，明确没有条目填“无”；普通文字中的标点原样保留。');
  if(rules.table)out.push(rules.table);if(rules.columns?.B)out.push(rules.columns.B);
  const all=parts.flatMap(p=>p.cells);for(const type of new Set(all.map(c=>c.definition.type)))if(rules.types?.[type])out.push(rules.types[type]);
  if(all.some(c=>['ref','refs'].includes(c.definition.type)))out.push('关联格填写已登记名称：'+refs.map(x=>x.显示).join('；')+'。同名对象使用所列完整名称。');
  const form=[];
  for(const p of parts){
   const groups=[...new Set(p.cells.map(c=>c.group))];
   for(const g of groups){const title=p.tid==='origin.character'?'人物／'+g:p.heading;form.push('【'+title+'】');const hints=[];
    for(const c of p.cells.filter(c=>c.group===g)){
     const d=c.definition;let hint=d.description??'';
     if(listType(d))hint=(hint?hint+' ':'')+'多项';
     if(d.values)hint+=' 可选：'+d.values.join('／');
     if(['number','duration'].includes(d.type))hint+=' 数值'+(d.min!==undefined?'，最小'+d.min:'')+(d.max!==undefined?'，最大'+d.max:'');
     if(d.type==='boolean')hint+=' 是或否';
     if(['array','map','object','json'].includes(d.type))hint+=' 此复杂值仍须JSON；尚未展开为子格';
     if(rules.rows?.[c.row])hint+=' '+rules.rows[c.row];if(rules.cells?.['B'+c.row])hint+=' '+rules.cells['B'+c.row];
     if(hint)hints.push(c.row+' '+hint.trim());
     form.push(c.row+' '+c.label);
    }
    if(hints.length)out.push('【'+title+'】填写要求：',...hints);
   }
  }
  return out.join('\n')+'\n\n资料：\n'+source+'\n\n待填写：\n'+form.join('\n');
 }
 function partFor(r,cells,heading){const t=template(r.template);return {record:r.id,tid:t.id,ownerName:at(record(r.parentId??r.id).values,['名称'])||record(r.parentId??r.id).title,heading:heading??t.label,cells:cells.map(c=>({...c,label:t.id==='origin.character.relationships'&&c.key==='关系底稿·对象'?'关系对象':c.label,group:field(t,c.key).group}))};}
 function request(id,options={}){
  check(options.format===undefined||options.format==='plain','只支持当前极简填表格式');
  const r=record(id),t=template(r.template),keys=selectedKeys(r,options.keys,options.deriveObjects!==false);
  check(typeof (options.source??'')==='string','填写依据须为文本');check(keys.length&&new Set(keys).size===keys.length,'没有可填写的字段或字段重复');
  const fields=keys.map(key=>field(t,key));for(const f of fields)check(at(r.values,f.path)===undefined,'已填字段受保护：'+f.label);
  const refs=options.referenceIds??[],known=allowedRefs();check(refs.every(id=>known.has(id)),'引用对象未获授权');
  const cells=fields.map(f=>({row:t.fields.indexOf(f)+1,key:f.key,label:f.label,definition:f.definition})),token='fill-'+(++serial);
  const ticket={record:id,revision:r.revision,workbookRevision:state.revision,keys,refs:[...refs],cells,deriveObjects:options.deriveObjects!==false,aliases:makeAliases(refs),parts:[partFor(r,cells,options.heading)]};pending.set(token,ticket);
  return {token,recordId:id,modelInput:plainInput(ticket.parts,options.source??'',ticket.aliases,options.rules)};
 }
 function requestDossier(id,{source='',referenceIds=[],recordIds,...options}={}){
  const root=record(id);check(root.template==='origin.character','请选择人物档案');check(typeof source==='string','填写依据须为文本');
  const chosen=recordIds??[id];check(Array.isArray(chosen)&&chosen.length&&chosen.includes(id)&&new Set(chosen).size===chosen.length,'请明确选择本次人物及子表');
  const records=chosen.map(record);check(records.every(r=>r.id===id||r.parentId===id),'不能混入其他人物子表');
  const known=allowedRefs();check(referenceIds.every(x=>known.has(x)),'引用对象未获授权');
  const counts={},parts=[];
  for(const r of records){const t=template(r.template),keys=selectedKeys(r,undefined,options.deriveObjects!==false),cells=keys.map(k=>{const f=field(t,k);return {row:t.fields.indexOf(f)+1,key:k,label:f.label,definition:f.definition};});
   if(!cells.length)continue;const kind=r.template.split('.').at(-1),n=(counts[kind]??0)+1;counts[kind]=n;
   const num=['一','二','三','四','五','六','七','八','九','十'][n-1]??String(n);
   parts.push(partFor(r,cells,r.id===id?'人物':childTypes[kind]+'／'+num));
  }
  check(parts.length,'没有可填写的字段');const aliases=makeAliases(referenceIds),token='fill-'+(++serial);
  const ticket={record:id,workbookRevision:state.revision,parts,refs:[...referenceIds],aliases,deriveObjects:options.deriveObjects!==false};pending.set(token,ticket);
  return {token,recordId:id,modelInput:plainInput(parts,source,aliases,options.rules)};
 }
 function resolveReference(raw,ticket){
  const matches=(ticket.aliases??[]).filter(x=>x.显示===raw||x.值===raw);check(matches.length===1,'引用名称不存在、重名或未获授权：'+raw);return matches[0].值;
 }
 function plainValue(raw,c,ticket){
  const d=c.definition;let value;
  if(['text','time'].includes(d.type))value=decodeFormText(raw,c.label);
  else if(d.type==='type')value=raw;
  else if(d.type==='ref')value=resolveReference(raw,ticket);
  else if(listType(d)){
   const items=['无','[]'].includes(raw)?[]:raw.split(/[；;\n]/).map(x=>x.trim());check(items.every(x=>x.length),'列表含空条目：'+c.label);
   value=d.type==='refs'?items.map(x=>resolveReference(x,ticket)):items;
  }else if(['number','duration'].includes(d.type)){check(Number.isFinite(Number(raw)),'数值无效：'+c.label);value=Number(raw);}
  else if(d.type==='boolean'){check(['是','否','true','false'].includes(raw),'请填是或否：'+c.label);value=['是','true'].includes(raw);}
  else if(d.type==='enum')value=raw;
  else if(['json','array','map','object'].includes(d.type)){value=JSON.parse(raw);}
  else throw Error('未支持的单元格类型');return value;
 }
 function parsePlain(ticket,text){
  const sections=new Map();for(const p of ticket.parts)for(const g of new Set(p.cells.map(c=>c.group))){const title=p.tid==='origin.character'?'人物／'+g:p.heading;check(!sections.has(title),'任务分组重复');sections.set(title,{part:p,cells:p.cells.filter(c=>c.group===g)});}
  const seen=new Set(),rawCells=[],result=new Map(ticket.parts.map(p=>[p.record,{}]));
  for(const section of formSections(text,{defaultHeading:ticket.parts.length===1?'':null})){
   const current=section.heading===''?{part:ticket.parts[0],cells:ticket.parts[0].cells}:sections.get(section.heading);check(current,'分组未开放：'+section.heading);
   for(const line of section.lines){
    const {number,field:c,raw}=formRow(line,current.cells),identity=current.part.record+':'+number;check(!seen.has(identity),'行号重复：'+number);seen.add(identity);
    if(raw)rawCells.push({record:current.part.record,cell:c,raw});
   }
  }
  check(seen.size===ticket.parts.reduce((n,p)=>n+p.cells.length,0),'请保留本次全部字段行；未知值留空');
  const aliases=clone(ticket.aliases??[]);for(const x of rawCells)if(x.cell.key==='名称'&&ticket.refs.includes(x.record)&&!aliases.some(a=>a.值===x.record&&a.显示===decodeFormText(x.raw)))aliases.push({值:x.record,名称:decodeFormText(x.raw),显示:decodeFormText(x.raw)});
  for(const x of rawCells)result.get(x.record)[x.cell.key]=plainValue(x.raw,x.cell,{...ticket,aliases});return result;
 }
 function accept(token,text){
  const ticket=pending.get(token);check(ticket,'填值任务已失效或已使用');
  check(state.revision===ticket.workbookRevision,'表单或引用对象已变化，请重新生成填值任务');
  const answers=parsePlain(ticket,text);
  const changed=[],refs=new Set(ticket.refs);let count=0;
  for(const [id,answer]of answers){const r=record(id),t=template(r.template),next=clone(r),keys=ticket.parts?.find(p=>p.record===id)?.cells.map(c=>c.key)??ticket.keys;
   for(const [key,value]of Object.entries(answer)){check(keys.includes(key)&&!bad.has(key),'结果含本次未开放字段：'+key);const f=field(t,key);check(at(r.values,f.path)===undefined,'已填字段受保护：'+f.label);validate(value,f.definition,refs);put(next.values,f.path,value);count++;}
   if(next.parentId){const subject=t.fields.find(f=>f.label==='主体');if(subject&&at(next.values,subject.path)!==undefined)check(at(next.values,subject.path)===next.parentId,'主体必须属于当前人物');}if(ticket.deriveObjects)syncObjects(next);validateRecordValues(next.values,t,allowedRefs());changed.push(next);
  }
  check(count>0,'没有可回填的字段；原内容未改');
  for(const next of changed){next.revision++;state.records[state.records.findIndex(r=>r.id===next.id)]=next;}
  state.revision++;pending.delete(token);return clone(record(ticket.record));
 }
 function restore(input){
  check(input?.format===state.format&&input.catalogVersion===catalog.version&&Array.isArray(input.records),'不是兼容的表单草稿');check(input.records.length<=500,'草稿档案过多');
  const ids=new Set();for(const r of input.records){check(typeof r.id==='string'&&/^draft-\d+$/.test(r.id)&&!ids.has(r.id),'档案编号无效或重复');ids.add(r.id);template(r.template);check(typeof r.title==='string'&&Number.isSafeInteger(r.revision)&&r.revision>=0&&Array.isArray(r.manual),'草稿元数据无效');}
  for(const r of input.records){if(r.parentId!==undefined)check(childTemplate(template(r.template))&&input.records.some(p=>p.id===r.parentId&&p.template==='origin.character'),'子表归属无效');if(r.derived!==undefined)check(Array.isArray(r.derived)&&r.derived.every(k=>k==='对象')&&childTemplate(template(r.template)),'派生标记无效');}
  const refs=new Set(input.records.filter(r=>template(r.template).table!=='core-draft').map(r=>r.id));
  for(const r of input.records){const t=template(r.template);check(r.manual.every(key=>t.fields.some(f=>f.key===key)),'人工字段标记无效');validateRecordValues(r.values,t,refs);const subject=t.fields.find(f=>f.label==='主体');if(r.parentId&&subject&&at(r.values,subject.path)!==undefined)check(at(r.values,subject.path)===r.parentId,'主体必须属于当前人物');}
  const next={format:state.format,catalogVersion:catalog.version,records:clone(input.records),revision:state.revision+1};state=next;serial=Math.max(serial,...input.records.map(r=>Number(r.id.slice(6))),0);pending.clear();return snapshot();
 }
 function snapshot(){return clone(state);}
 function values(id){const r=record(id),t=template(r.template);return {template:r.template,table:t.table,kind:t.kind??null,values:clone(r.values),status:'draft-only',canonicalWrites:0};}
 return {create,createChild,edit,request,requestDossier,accept,restore,snapshot,values,read:id=>clone(record(id)),template:id=>clone(template(id)),references:()=>refsFor(new Set(state.records.filter(r=>template(r.template).table==='objects').map(r=>r.id))),get:(id,key)=>clone(at(record(id).values,field(template(record(id).template),key).path))};
}
