import {complexCell,complexCellInstructions,parseComplexCell,complexShape} from './complex-cell.js';
// FT02 isolated host candidate. No model, worldbook, canonical store or network access.
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
 const hasRef=d=>['ref','refs'].includes(d.type)||Object.values(d.fields??{}).some(hasRef)||(d.items&&hasRef(d.items));
 const refsFor=ids=>state.records.filter(r=>ids.has(r.id)).map(r=>({值:r.id,名称:at(r.values,['名称'])||r.title}));
 function create(templateId){const t=template(templateId),id='draft-'+(++serial);const r={id,template:templateId,title:t.label+' '+(state.records.filter(r=>r.template===templateId).length+1),revision:0,values:{},manual:[]};state.records.push(r);state.revision++;return clone(r);}
 function edit(id,key,value){const r=record(id),f=field(template(r.template),key);if(value!==undefined){validate(value,f.definition,allowedRefs());if(r.parentId&&f.label==='主体')check(value===r.parentId,'主体必须属于当前人物');}put(r.values,f.path,value);if(!r.manual.includes(key))r.manual.push(key);syncObjects(r);r.revision++;state.revision++;return clone(r);}
 function markdownRequest(id,{keys,source='',referenceIds=[],rules={}}={}){
  const r=record(id),t=template(r.template);check(typeof source==='string','填写依据须为文本');
  const selected=keys??t.fields.filter(f=>at(r.values,f.path)===undefined).map(f=>f.key);check(Array.isArray(selected)&&selected.length&&new Set(selected).size===selected.length,'没有可填写的字段或字段重复');
  const fields=selected.map(key=>field(t,key));for(const f of fields)check(at(r.values,f.path)===undefined,'已填字段受保护：'+f.label);
  const known=allowedRefs();check(referenceIds.every(id=>known.has(id)),'引用对象未获授权');const refs=new Set(referenceIds);
  const types={text:'文字',time:'时间文字',duration:'数值',number:'数值',boolean:'true或false',enum:'单选',texts:'文字列表',ref:'对象编号',refs:'对象编号列表',json:'可变类型值',array:'列表',map:'键值对象',object:'对象',type:'类型编号'};
  const encode=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\\','\\\\').replaceAll('|','\\|').replaceAll('\n','<br>');
  const cells=fields.map(f=>({row:t.fields.indexOf(f)+1,key:f.key,label:f.label,definition:f.definition}));
  const token='fill-'+(++serial),ticket={record:id,revision:r.revision,workbookRevision:state.revision,keys:selected,refs:[...refs],cells};pending.set(token,ticket);
  const typeRule=f=>{const def=f.definition;let text=types[def.type]??def.type;if(def.values)text+='，可选：'+def.values.join('／');if(def.min!==undefined)text+='，最小'+def.min;if(def.max!==undefined)text+='，最大'+def.max;if(['texts','refs'].includes(def.type))text+='，每项用<br>分行，无条目填[]';if(def.type==='text'&&!def.required)text+='，明确空文本填""';if(complexCell(def))text+='，展开简表；结构说明：\n'+complexShape(def);return text;};
  const instructions=['表单：'+t.label,'档案：'+(at(r.values,['名称'])||r.title),'表级要求：根据资料填回下表；保留行号、A列和表头，只填B列。未知格留空，不拿0或否代替未知。只返回填好的表格。','列级要求：A为字段名，不修改；B为内容。文字中的竖线写\\|，换行写<br>，字面<br>写&lt;br&gt;。',...(rules.table?['本表补充：'+rules.table]:[]),...(rules.columns?.B?['B列补充：'+rules.columns.B]:[])];
  if(cells.some(c=>complexCell(c.definition)))instructions.push(complexCellInstructions({markdown:true}));
  for(const type of new Set(cells.map(c=>c.definition.type)))if(rules.types?.[type])instructions.push('类型'+types[type]+'：'+rules.types[type]);
  for(const c of cells){instructions.push('B'+c.row+'：'+typeRule(c));if(rules.rows?.[c.row])instructions.push('第'+c.row+'行：'+rules.rows[c.row]);if(rules.cells?.['B'+c.row])instructions.push('B'+c.row+'补充：'+rules.cells['B'+c.row]);}
  if(fields.some(f=>hasRef(f.definition)))instructions.push('可引用对象（格内填编号；多个编号分行）：'+refsFor(refs).map(r=>r.值+'＝'+r.名称).join('；'));
  const grid='| 行 | A | B |\n| --- | --- | --- |\n'+cells.map(c=>'| '+c.row+' | '+encode(c.label)+' |  |').join('\n');
  const modelInput=instructions.join('\n')+'\n\n资料：\n'+source+'\n\n'+grid;
  return {token,recordId:id,modelInput};
 }
 function parseTable(ticket,text){
  check(typeof text==='string','请粘贴AI填好的表格');let input=text.trim();if(/^```(?:markdown|md)?\s*\n/.test(input))input=input.replace(/^```(?:markdown|md)?\s*\n/,'').replace(/\n```$/,'');
  const split=line=>{check(line.startsWith('|')&&line.endsWith('|'),'表格每行须以竖线开始和结束');const parts=[];let cell='';for(let i=1;i<line.length;i++){const c=line[i];if(c==='\\'){check(i+1<line.length,'表格转义不完整');cell+=line[++i];}else if(c==='|'){parts.push(cell);cell='';}else cell+=c;}check(!cell,'表格结尾无效');return parts;};
  const decode=v=>v.replaceAll('<br>','\n').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  const lines=input.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.trim());check(lines.length>=2,'未找到完整表格');const header=split(lines[0]).map(c=>c.trim());check(JSON.stringify(header)===JSON.stringify(['行','A','B']),'请保留“行 / A / B”表头');check(split(lines[1]).length===3&&split(lines[1]).every(c=>/^:?-{3,}:?$/.test(c.trim())),'表格分隔行无效');
  const result={},seen=new Set();for(const line of lines.slice(2)){const row=split(line);row[0]=row[0].trim();row[1]=row[1].trim();check(row.length===3,'每行只能有行号、A、B三格');check(/^\d+$/.test(row[0]),'行号无效');const number=Number(row[0]),c=ticket.cells.find(c=>c.row===number);check(c&&!seen.has(number),'行号未开放或重复：'+row[0]);seen.add(number);check(decode(row[1])===c.label,'A列字段名被修改：A'+number);const d=c.definition,raw=decode(complexCell(d)?row[2].replace(/^ /,'').replace(/ $/,''):row[2].trim());if(raw==='')continue;let value;
   if(['text','time','ref','type'].includes(d.type))value=raw==='""'&&d.type==='text'?'':raw;
   else if(['number','duration'].includes(d.type)){check(raw.trim()!==''&&Number.isFinite(Number(raw)),'数值无效：B'+number);value=Number(raw);}
   else if(d.type==='boolean'){check(['是','否','true','false'].includes(raw),'请填是/否：B'+number);value=['是','true'].includes(raw);}
   else if(d.type==='enum')value=raw;
   else if(['texts','refs'].includes(d.type))value=raw==='[]'?[]:raw.split('\n');
   else if(complexCell(d))value=parseComplexCell(raw);
   else throw Error('未支持的单元格类型');
   result[c.key]=value;
  }
  check(seen.size===ticket.cells.length,'请保留本次表格全部行；未知格留空');return result;
 }

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
  const out=['档案：'+parts[0].ownerName,'按资料填写，保留分组、行号和字段名，每行填一个字段。字段名后可用冒号；未知留空，只返回填好的内容。'];
  if(parts.some(p=>p.cells.some(c=>complexCell(c.definition))))out.push(complexCellInstructions());
  if(parts.some(p=>p.cells.some(c=>listType(c.definition))))out.push('列表格多项用“；”分隔，明确没有条目填“无”；普通文字中的标点原样保留。');
  if(rules.table)out.push(rules.table);if(rules.columns?.B)out.push(rules.columns.B);
  const all=parts.flatMap(p=>p.cells);for(const type of new Set(all.map(c=>c.definition.type)))if(rules.types?.[type])out.push(rules.types[type]);
  if(all.some(c=>hasRef(c.definition)))out.push('关联格填写已登记名称：'+refs.map(x=>x.显示).join('；')+'。同名对象使用所列完整名称。');
  const form=[];
  for(const p of parts){
   const groups=[...new Set(p.cells.map(c=>c.group))];
   for(const g of groups){const title=p.tid==='origin.character'?'人物／'+g:p.heading;form.push('【'+title+'】');const hints=[];
    for(const c of p.cells.filter(c=>c.group===g)){
     const d=c.definition;let hint=d.description??'';if(p.tid==='origin.character.secrets'&&c.label==='关联对象')hint='真相直接涉及的对象；物品来源人物不自动纳入，不据此推定知情。';
     if(listType(d))hint=(hint?hint+' ':'')+'多项';
     if(d.values)hint+=' 可选：'+d.values.join('／');
     if(['number','duration'].includes(d.type))hint+=' 数值'+(d.min!==undefined?'，最小'+d.min:'')+(d.max!==undefined?'，最大'+d.max:'');
     if(d.type==='boolean')hint+=' 是或否';
     if(complexCell(d))hint+=' 此格使用缩进简表，结构说明：\n'+complexShape(d);
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
  if(options.format==='markdown')return markdownRequest(id,options);
  const r=record(id),keys=selectedKeys(r,options.keys,options.deriveObjects!==false);
  const task=markdownRequest(id,{...options,keys}),ticket=pending.get(task.token);
  ticket.deriveObjects=options.deriveObjects!==false;ticket.aliases=makeAliases(ticket.refs);ticket.parts=[partFor(r,ticket.cells,options.heading)];
  task.modelInput=plainInput(ticket.parts,options.source??'',ticket.aliases,options.rules);return task;
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
 function resolveComplexReferences(value,definition,ticket){
  if(value===null||value===undefined)return value;
  if(definition.type==='ref')return resolveReference(value,ticket);
  if(definition.type==='refs'&&Array.isArray(value))return value.map(item=>resolveReference(item,ticket));
  if(definition.type==='array'&&Array.isArray(value))return value.map(item=>resolveComplexReferences(item,definition.items,ticket));
  if(value&&typeof value==='object'&&!Array.isArray(value)&&['object','map'].includes(definition.type))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,definition.type==='map'?resolveComplexReferences(item,definition.items,ticket):definition.fields?.[key]?resolveComplexReferences(item,definition.fields[key],ticket):item]));
  return value;
 }
 function plainValue(raw,c,ticket){
  const d=c.definition;let value;
  if(['text','time','type'].includes(d.type))value=raw==='""'&&d.type==='text'?'':raw;
  else if(d.type==='ref')value=resolveReference(raw,ticket);
  else if(listType(d)){
   const items=['无','[]'].includes(raw)?[]:raw.split(/[；;\n]/).map(x=>x.trim());check(items.every(x=>x.length),'列表含空条目：'+c.label);
   value=d.type==='refs'?items.map(x=>resolveReference(x,ticket)):items;
  }else if(['number','duration'].includes(d.type)){check(Number.isFinite(Number(raw)),'数值无效：'+c.label);value=Number(raw);}
  else if(d.type==='boolean'){check(['是','否','true','false'].includes(raw),'请填是或否：'+c.label);value=['是','true'].includes(raw);}
  else if(d.type==='enum')value=raw;
  else if(complexCell(d))value=resolveComplexReferences(parseComplexCell(raw),d,ticket);
  else throw Error('未支持的单元格类型');return value;
 }
 function parsePlain(ticket,text){
  check(typeof text==='string','请粘贴填好的文本');let input=text.replace(/^\uFEFF/,'');
  if(/^\s*```(?:text|txt)?\s*\n/.test(input))input=input.replace(/^\s*```(?:text|txt)?\s*\n/,'').replace(/\n```\s*$/,'');
  const sections=new Map();for(const p of ticket.parts)for(const g of new Set(p.cells.map(c=>c.group))){const title=p.tid==='origin.character'?'人物／'+g:p.heading;check(!sections.has(title),'任务分组重复');sections.set(title,{part:p,cells:p.cells.filter(c=>c.group===g)});}
  let current=ticket.parts.length===1?{part:ticket.parts[0],cells:ticket.parts[0].cells}:null;const seenSections=new Set(),seen=new Set(),rawCells=[],result=new Map(ticket.parts.map(p=>[p.record,{}]));
  let continuation=null;
  for(const rawLine of input.split(/\r?\n/)){
   if(rawLine.startsWith('  ')&&continuation){continuation.raw+=(continuation.continued?'\n':'')+rawLine.slice(2);continuation.continued=true;continue;}
   continuation=null;const line=rawLine.trim();if(!line)continue;
   const heading=line.match(/^【([^】]+)】$/);if(heading){check(sections.has(heading[1])&&!seenSections.has(heading[1]),'分组未开放或重复：'+heading[1]);current=sections.get(heading[1]);seenSections.add(heading[1]);continue;}
   if(ticket.parts.length===1&&/^行\s+A\s+B$/.test(line)&&!seen.size)continue;
   check(current,'请保留分组标题');const match=line.match(/^(\d+)\s+(.+)$/);check(match,'无法识别字段行：'+line);
   const number=Number(match[1]),c=current.cells.find(c=>c.row===number);check(c,'行号未开放：'+match[1]);
   const identity=current.part.record+':'+number;check(!seen.has(identity),'行号重复：'+number);seen.add(identity);
   const body=match[2];check(body.startsWith(c.label),'字段名被修改：'+number);
   let rest=body.slice(c.label.length);check(!rest||/^[\s：:]/.test(rest),'字段名被修改：'+number);rest=rest.trimStart();if(/^[：:]/.test(rest))rest=rest.slice(1).trimStart();
   if(rest)rawCells.push({record:current.part.record,cell:c,raw:rest});
   else if(complexCell(c.definition)){continuation={record:current.part.record,cell:c,raw:'',continued:false};rawCells.push(continuation);}
  }
  check(seen.size===ticket.parts.reduce((n,p)=>n+p.cells.length,0),'请保留本次全部字段行；未知值留空');
  const aliases=clone(ticket.aliases??[]);for(const x of rawCells)if(x.cell.key==='名称'&&ticket.refs.includes(x.record)&&!aliases.some(a=>a.值===x.record&&a.显示===x.raw))aliases.push({值:x.record,名称:x.raw,显示:x.raw});
  for(const x of rawCells)if(x.raw)result.get(x.record)[x.cell.key]=plainValue(x.raw,x.cell,{...ticket,aliases});return result;
 }
 function accept(token,text){
  const ticket=pending.get(token);check(ticket,'填值任务已失效或已使用');
  check(state.revision===ticket.workbookRevision,'表单或引用对象已变化，请重新生成填值任务');
  let answers;
  if(!ticket.parts||/^\s*(?:```(?:markdown|md)?\s*\n)?\|/.test(text)){
   check(!ticket.parts||ticket.parts.length===1,'多子表请使用分组文本');
   const part=ticket.parts?.[0];answers=new Map([[ticket.record,parseTable(part?{...ticket,cells:part.cells}:ticket,text)]]);
  }else answers=parsePlain(ticket,text);
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
