import {phoneFormReference,PHONE_FORM_LIST_REFERENCES,normalizePhoneFormValue} from '../../engine/phone-form-contract.mjs';
import {programOwnedTable,creationFieldAllowed,compactCreationSchema} from '../../engine/prompt-boundary.mjs';
import {Runtime} from '../../engine/runtime.mjs';
import {clone,digest,fail,decode,stableId} from '../../engine/common.mjs';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
function check(ok,message){if(!ok)fail('MATRIX_CREATION',message);}
// Shared reviewable workbook. This module never writes a canonical store.
export function sheetSections(text){
 if(typeof text!=='string'||!text.trim())throw Error('没有可读取的表单内容');
 const sections=[],seen=new Set();let current;
 for(const raw of text.trim().split(/\r?\n/)){
  const line=raw.trim();if(!line)continue;const heading=/^【([^】]+)】$/.exec(line);
  if(heading){if(seen.has(heading[1]))throw Error('分组重复：'+heading[1]);seen.add(heading[1]);current={heading:heading[1],lines:[]};sections.push(current);}
  else {if(!current)throw Error('结果须从分组标题开始');current.lines.push(line);}
 }
 return sections;
}
export function sheetLine(line){const match=/^(\d+)\s+(.+)$/.exec(line.trim());if(!match)throw Error('无法识别字段行：'+line);return {row:Number(match[1]),body:match[2]};}
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
 function markdownRequest(id,{keys,source='',referenceIds=[],rules={}}={}){
  const r=record(id),t=template(r.template);check(typeof source==='string','填写依据须为文本');
  const selected=keys??t.fields.filter(f=>at(r.values,f.path)===undefined).map(f=>f.key);check(Array.isArray(selected)&&selected.length&&new Set(selected).size===selected.length,'没有可填写的字段或字段重复');
  const fields=selected.map(key=>field(t,key));for(const f of fields)check(at(r.values,f.path)===undefined,'已填字段受保护：'+f.label);
  const known=allowedRefs();check(referenceIds.every(id=>known.has(id)),'引用对象未获授权');const refs=new Set(referenceIds);
  const types={text:'文字',time:'时间文字',duration:'数值',number:'数值',boolean:'true或false',enum:'单选',texts:'文字列表',ref:'对象编号',refs:'对象编号列表',json:'JSON值',array:'列表',map:'键值对象',object:'对象',type:'类型编号'};
  const shape=d=>({类型:types[d.type]??d.type,...(d.values?{选项:clone(d.values)}:{}),...(d.fields?{字段:Object.fromEntries(Object.entries(d.fields).map(([k,v])=>[k,shape(v)]))}:{}),...(d.items?{条目:shape(d.items)}:{}),...(d.required?{必填:true}:{}),...(d.min!==undefined?{最小:d.min}:{}),...(d.max!==undefined?{最大:d.max}:{})});
  const hasRef=d=>['ref','refs'].includes(d.type)||Object.values(d.fields??{}).some(hasRef)||(d.items&&hasRef(d.items));
  const encode=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\\','\\\\').replaceAll('|','\\|').replaceAll('\n','<br>');
  const cells=fields.map(f=>({row:t.fields.indexOf(f)+1,key:f.key,label:f.label,definition:f.definition}));
  const token='fill-'+(++serial),ticket={record:id,revision:r.revision,workbookRevision:state.revision,keys:selected,refs:[...refs],cells};pending.set(token,ticket);
  const typeRule=f=>{const def=f.definition;let text=types[def.type]??def.type;if(def.values)text+='，可选：'+def.values.join('／');if(def.min!==undefined)text+='，最小'+def.min;if(def.max!==undefined)text+='，最大'+def.max;if(['texts','refs'].includes(def.type))text+='，每项用<br>分行，无条目填[]';if(def.type==='text'&&!def.required)text+='，明确空文本填""';if(['object','array','map'].includes(def.type))text+='，结构：'+JSON.stringify(shape(def));return text;};
  const instructions=['表单：'+t.label,'档案：'+(at(r.values,['名称'])||r.title),'表级要求：根据资料填回下表；保留行号、A列和表头，只填B列。未知格留空，不拿0或否代替未知。只返回填好的表格。','列级要求：A为字段名，不修改；B为内容。文字中的竖线写\\|，换行写<br>，字面<br>写&lt;br&gt;。',...(rules.table?['本表补充：'+rules.table]:[]),...(rules.columns?.B?['B列补充：'+rules.columns.B]:[])];
  for(const type of new Set(cells.map(c=>c.definition.type)))if(rules.types?.[type])instructions.push('类型'+types[type]+'：'+rules.types[type]);
  for(const c of cells){instructions.push('B'+c.row+'：'+typeRule(c));if(rules.rows?.[c.row])instructions.push('第'+c.row+'行：'+rules.rows[c.row]);if(rules.cells?.['B'+c.row])instructions.push('B'+c.row+'补充：'+rules.cells['B'+c.row]);}
  if(fields.some(f=>hasRef(f.definition)))instructions.push('可引用对象（格内填编号；多个编号分行）：'+refsFor(refs).map(r=>r.值+'＝'+r.名称).join('；'));
  const grid='| 行 | A | B |\n| --- | --- | --- |\n'+cells.map(c=>'| '+c.row+' | '+encode(c.label)+' |  |').join('\n');
  const modelInput=instructions.join('\n')+'\n\n资料：\n'+source+'\n\n'+grid;
  return {token,recordId:id,modelInput};
 }
 function parseTable(ticket,text){
  check(typeof text==='string','请粘贴AI填好的表格');let input=text.trim();if(/^```(?:markdown|md)?\s*\n/.test(input))input=input.replace(/^```(?:markdown|md)?\s*\n/,'').replace(/\n```$/,'');
  const split=line=>{check(line.startsWith('|')&&line.endsWith('|'),'表格每行须以竖线开始和结束');const parts=[];let cell='';for(let i=1;i<line.length;i++){const c=line[i];if(c==='\\'){check(i+1<line.length,'表格转义不完整');cell+=line[++i];}else if(c==='|'){parts.push(cell.trim());cell='';}else cell+=c;}check(!cell,'表格结尾无效');return parts;};
  const decode=v=>v.replaceAll('<br>','\n').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  const lines=input.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.trim());check(lines.length>=2,'未找到完整表格');const header=split(lines[0]);check(JSON.stringify(header)===JSON.stringify(['行','A','B']),'请保留“行 / A / B”表头');check(split(lines[1]).length===3&&split(lines[1]).every(c=>/^:?-{3,}:?$/.test(c)),'表格分隔行无效');
  const result={},seen=new Set();for(const line of lines.slice(2)){const row=split(line);check(row.length===3,'每行只能有行号、A、B三格');check(/^\d+$/.test(row[0]),'行号无效');const number=Number(row[0]),c=ticket.cells.find(c=>c.row===number);check(c&&!seen.has(number),'行号未开放或重复：'+row[0]);seen.add(number);check(decode(row[1])===c.label,'A列字段名被修改：A'+number);const raw=decode(row[2]);if(raw==='')continue;const d=c.definition;let value;
   if(['text','time','ref','type'].includes(d.type))value=raw==='""'&&d.type==='text'?'':raw;
   else if(['number','duration'].includes(d.type)){check(raw.trim()!==''&&Number.isFinite(Number(raw)),'数值无效：B'+number);value=Number(raw);}
   else if(d.type==='boolean'){check(['是','否','true','false'].includes(raw),'请填是/否：B'+number);value=['是','true'].includes(raw);}
   else if(d.type==='enum')value=raw;
   else if(['texts','refs'].includes(d.type))value=raw==='[]'?[]:raw.split('\n');
   else if(['array','map','object'].includes(d.type))value=JSON.parse(raw);
   else if(d.type==='json'){if(/^(?:[\[{"]|true$|false$|null$|-?\d)/.test(raw))value=JSON.parse(raw);else value=raw;}
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
  if(parts.some(p=>p.cells.some(c=>listType(c.definition))))out.push('列表格多项用“；”分隔，明确没有条目填“无”；普通文字中的标点原样保留。');
  if(rules.table)out.push(rules.table);if(rules.columns?.B)out.push(rules.columns.B);
  const all=parts.flatMap(p=>p.cells);for(const type of new Set(all.map(c=>c.definition.type)))if(rules.types?.[type])out.push(rules.types[type]);
  if(all.some(c=>['ref','refs'].includes(c.definition.type)))out.push('关联格填写已登记名称：'+refs.map(x=>x.显示).join('；')+'。同名对象使用所列完整名称。');
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
 // The same restricted fill parser also accepts registered tables beyond the
 // original character workbook. Coordinates and writable keys stay in tickets.
 function requestWorkbook(selections,{source='',referenceIds=[],rules={}}={}){
  check(Array.isArray(selections)&&selections.length&&new Set(selections.map(s=>s.recordId)).size===selections.length,'请明确选择本次表单记录');
  const known=allowedRefs();check(referenceIds.every(id=>known.has(id)),'引用对象未获授权');
  const parts=selections.map(({recordId,keys,heading})=>{const r=record(recordId),t=template(r.template),selected=selectedKeys(r,keys,false);check(selected.length&&new Set(selected).size===selected.length,'没有可填写的字段或字段重复');const cells=selected.map(key=>{const f=field(t,key);check(at(r.values,f.path)===undefined,'已填字段受保护：'+f.label);return {row:t.fields.indexOf(f)+1,key,label:f.label,definition:f.definition};});return partFor(r,cells,heading);});
  const aliases=makeAliases(referenceIds),token='fill-'+(++serial),ticket={record:parts[0].record,workbookRevision:state.revision,parts,refs:[...referenceIds],aliases,deriveObjects:false};pending.set(token,ticket);
  return {token,recordId:parts[0].record,modelInput:plainInput(parts,source,aliases,rules)};
 }
 function resolveReference(raw,ticket){
  const matches=(ticket.aliases??[]).filter(x=>x.显示===raw||x.值===raw);check(matches.length===1,'引用名称不存在、重名或未获授权：'+raw);return matches[0].值;
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
  else if(['json','array','map','object'].includes(d.type)){value=JSON.parse(raw);}
  else throw Error('未支持的单元格类型');return value;
 }
 function parsePlain(ticket,text){
  check(typeof text==='string','请粘贴填好的文本');let input=text.trim();
  if(/^```(?:text|txt)?\s*\n/.test(input))input=input.replace(/^```(?:text|txt)?\s*\n/,'').replace(/\n```$/,'');
  const sections=new Map();for(const p of ticket.parts)for(const g of new Set(p.cells.map(c=>c.group))){const title=p.tid==='origin.character'?'人物／'+g:p.heading;check(!sections.has(title),'任务分组重复');sections.set(title,{part:p,cells:p.cells.filter(c=>c.group===g)});}
  let current=ticket.parts.length===1?{part:ticket.parts[0],cells:ticket.parts[0].cells}:null;const seenSections=new Set(),seen=new Set(),rawCells=[],result=new Map(ticket.parts.map(p=>[p.record,{}]));
  for(const rawLine of input.split(/\r?\n/)){
   const line=rawLine.trim();if(!line)continue;
   const heading=line.match(/^【([^】]+)】$/);if(heading){check(sections.has(heading[1])&&!seenSections.has(heading[1]),'分组未开放或重复：'+heading[1]);current=sections.get(heading[1]);seenSections.add(heading[1]);continue;}
   if(ticket.parts.length===1&&/^行\s+A\s+B$/.test(line)&&!seen.size)continue;
   check(current,'请保留分组标题');const parsed=sheetLine(line),number=parsed.row,c=current.cells.find(c=>c.row===number);check(c,'行号未开放：'+number);
   const identity=current.part.record+':'+number;check(!seen.has(identity),'行号重复：'+number);seen.add(identity);
   const body=parsed.body;check(body.startsWith(c.label),'字段名被修改：'+number);
   let rest=body.slice(c.label.length);check(!rest||/^[\s：:]/.test(rest),'字段名被修改：'+number);rest=rest.trimStart();if(/^[：:]/.test(rest))rest=rest.slice(1).trimStart();
   if(rest)rawCells.push({record:current.part.record,cell:c,raw:rest});
  }
  check(seen.size===ticket.parts.reduce((n,p)=>n+p.cells.length,0),'请保留本次全部字段行；未知值留空');
  const aliases=clone(ticket.aliases??[]);for(const x of rawCells)if(x.cell.key==='名称'&&ticket.refs.includes(x.record)&&!aliases.some(a=>a.值===x.record&&a.显示===x.raw))aliases.push({值:x.record,名称:x.raw,显示:x.raw});
  for(const x of rawCells)result.get(x.record)[x.cell.key]=plainValue(x.raw,x.cell,{...ticket,aliases});return result;
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
 return {create,createChild,edit,request,requestDossier,requestWorkbook,accept,restore,snapshot,values,read:id=>clone(record(id)),template:id=>clone(template(id)),references:()=>refsFor(new Set(state.records.filter(r=>template(r.template).table==='objects').map(r=>r.id))),get:(id,key)=>clone(at(record(id).values,field(template(record(id).template),key).path))};
}

// Canonical Matrix binding for the shared workbook. Callers own commit lifecycle.
const ownerKeys=new Set(['owner_table','owner_form','owner_row_uuid','owner_field']);
const list=raw=>['无','[]'].includes(raw.trim())?[]:raw.split(/[；;\n]/).map(x=>x.trim()).filter(Boolean);
const atom=raw=>raw==='true'||raw==='是'?true:raw==='false'||raw==='否'?false:raw==='null'?null:/^[+-]?\d+(?:\.\d+)?$/.test(raw)?Number(raw):raw;
// A complex leaf can be entered as dotted cells; the model never builds a
// storage envelope. Registered business validation still owns its meaning.
function structuredCell(raw,array=false){
 const declared=/^(列表|对象|文字|值)[：:]\s*([\s\S]*)$/.exec(raw);if(declared){if(declared[1]==='文字')return declared[2];if(declared[1]==='值')return atom(declared[2]);array=declared[1]==='列表';raw=declared[2];}
 const parts=list(raw);if(!parts.length)return array?[]:{};
 if(parts.every(part=>!part.includes('=')))return array?parts.map(atom):atom(raw);
 const value=array?[]:{},paths=new Set();for(const part of parts){const at=part.indexOf('=');check(at>0,'结构化格请用 属性=值，多个属性用分号分隔');const path=part.slice(0,at).trim().split('.');check(path.every(k=>k&&!['__proto__','prototype','constructor'].includes(k)),'结构化格路径无效');const key=path.join('.');check(!paths.has(key),'结构化格路径重复：'+key);paths.add(key);let target=value;
  for(let i=0;i<path.length;i++){const k=path[i];if(Array.isArray(target))check(/^(0|[1-9]\d*)$/.test(k)&&Number(k)<500,'列表索引无效');if(i===path.length-1){check(!Object.hasOwn(target,k),'结构化格路径重叠：'+key);target[k]=atom(part.slice(at+1).trim());}else{if(!Object.hasOwn(target,k))target[k]=/^\d+$/.test(path[i+1])?[]:{};check(target[k]&&typeof target[k]==='object','结构化格路径重叠：'+key);target=target[k];}}
 }const complete=v=>{if(Array.isArray(v))check(Array.from({length:v.length},(_,i)=>Object.hasOwn(v,i)).every(Boolean),'列表索引须从0连续填写');if(v&&typeof v==='object')for(const child of Object.values(v))complete(child);};complete(value);return value;
}
function ownedTable(schema){return schema.fields.some(f=>f.key==='owner_row_uuid')&&schema.fields.some(f=>['owner_table','owner_form'].includes(f.key));}
const scalarTypes={NUMBER:'数值',INTEGER:'整数',BOOLEAN:'是或否',ENUM:'选项',BAG:'物品×数量，多项分号分隔',TAGS:'状态名称，多项分号分隔',ARRAY:'多项分号分隔；复合项用 从0连续序号.属性=值',JSON:'文字或值；复合内容注明“对象：属性=值”或“列表：序号.属性=值”，分号分隔；空列表/对象写“列表：无”/“对象：无”',OBJECT:'属性=值，分号分隔',TEXT_LIST:'多项分号分隔',REF_LIST:'关联名称，多项分号分隔'};
export function prepareMatrixSheets(snapshot,{kind='world',mode='extend',operationId,task='tableGenesis',scope=snapshot.state.runtime?.scope??{},tableIds=null}={}){
 check(typeof operationId==='string'&&operationId.trim(),'简表任务需要稳定操作标识');
 const allSchemas=compactCreationSchema(snapshot.state),selected=tableIds?new Set(tableIds):null;
 if(selected){let size;do{size=selected.size;for(const id of [...selected])for(const f of allSchemas[id]?.fields??[])if(f.ref&&allSchemas[f.ref])selected.add(f.ref);}while(size!==selected.size);}
 const schemas=selected?Object.fromEntries(Object.entries(allSchemas).filter(([id])=>selected.has(id))):allSchemas,used=new Map(),templates=[],schemaByTemplate={};
 for(const [id,schema]of Object.entries(schemas)){
  let label=schema.label&&schema.label!==id?schema.label:'资料表 '+(templates.length+1);const count=(used.get(label)??0)+1;used.set(label,count);if(count>1)label+='〔'+count+'〕';
  const isOwned=ownedTable(schema),fields=schema.fields.filter(f=>(task!=='main'||scope.audience==='author'||!snapshot.state.schema[id].fields.find(x=>x.key===f.key)?.lock_level)&&!(isOwned&&ownerKeys.has(f.key))&&!(isOwned&&['sequence','value_state'].includes(f.key)));
  if(!fields.length)continue;schema.fields=schema.fields.filter(f=>task!=='main'||scope.audience==='author'||!snapshot.state.schema[id].fields.find(x=>x.key===f.key)?.lock_level);
  const names=new Map();const t={id,table:id,label,fields:fields.map(f=>{let name=f.label||f.key;const n=(names.get(name)??0)+1;names.set(name,n);if(n>1)name+='〔'+n+'〕';return {key:f.key,label:name,path:[f.key],group:'内容',definition:{type:'text',description:f.description??f.instruction??''}};})};templates.push(t);schemaByTemplate[id]=schema;
 }
 const refs=[];for(const t of templates)for(const [index,[recordId,row]]of Object.entries(snapshot.state.tables[t.id]??{}).entries()){
  if(row.metadata?.phone_projection)continue;const name=String(row.values?.name??row.values?.label??row.values?.title??'第'+(index+1)+'项').trim();
  const base=t.label+'／已有：'+name,n=refs.filter(r=>r.base===base).length+1;refs.push({tableId:t.id,recordId,name,base,display:base+'〔'+n+'〕'});
 }
 const fieldsText=templates.map(t=>'【'+t.label+'／序号】\n'+t.fields.map((f,i)=>{const spec=schemaByTemplate[t.id].fields.find(s=>s.key===f.key);let hint=scalarTypes[spec.type]??(['REF','ROW_REF','CHILD_REF'].includes(spec.type)?'已登记名称或本次表单分组名':'文字');if(spec.type==='CHILD_REF'&&spec.ref==='M_LIST_VALUES')hint='多项用分号分隔；文字直接写，关联填“关联：分组名”，数值/布尔填“数值：0”/“布尔：否”，子表填“条目：分组名”；明确无项填“无”';if(spec.enum??spec.options)hint+='：'+(spec.enum??spec.options).join('／');if(spec.unit)hint+='，单位 '+spec.unit;if(spec.required)hint+='，必填';if(spec.ref&&spec.ref!=='M_LIST_VALUES')hint+='；只能关联 '+(templates.find(x=>x.id===spec.ref)?.label??snapshot.state.schema[spec.ref]?.label??spec.ref);return (i+1)+' '+f.label+'（'+hint+'）';}).join('\n')).join('\n\n');
 const instructions='在完整 reply 的 cells 中填写分组简表。每条记录用【表名／1】等标题，同表从1连续编号；每行“行号 字段名：值”。只写本轮有内容的字段，未知省略或留空；不修改行号与字段名。按需要选表，不为凑齐定义创建空记录。关联填写已登记名称或本次“表名／序号”，程序生成稳定编号与归属。人物从人物原点档案填写，主体注册及原点引用由程序建立。列表原子直接写多项，其他子表分组填写后由父格引用。不填写程序回执、原生变量或执行指令。'+(mode==='revise'?'修订已有记录用给定“表名／已有：名称〔序号〕”标题，只写本次任务明确授权且有据的改变。':'本轮只新增定义，不覆盖已有记录。')+(task==='main'?'本次为当前回复已发生的变化；每个有值字段可附 | Pn 指向正文依据，不把设想当既成事实。':task==='tableGenesis'?'本次为获准的创作草稿，不推进现有故事或补造既成历史。':'本次为来源提炼，只填给定原文明确支持的事实与定义；不能用创作补完缺口。');
 return {format:'tisya.matrix-sheets/1',operationId,kind,mode,task,catalog:{version:1,templates},schemas:schemaByTemplate,references:refs,form:instructions+'\n\n'+fieldsText,referenceText:refs.map(r=>r.display).join('\n')};
}
export function acceptMatrixSheets(context,snapshot,{blocks,parsed={}}){
 check(plain(blocks),'简表需要已解析的回复区块');
 const cellText=context.task==='main'?(blocks.cells??'').split(/\r?\n/).map(line=>line.replace(/\|\s*P\d+(?:\.\.P?\d+)?\s*$/i,'').trimEnd()).join('\n'):(blocks.cells??'');
 const sections=sheetSections(cellText),engine=createSheetEngine(context.catalog,v=>typeof v==='string'),rows=[],counts=new Map(),selections=[];
 check(sections.length<=500,'创作表单记录过多');
 for(const section of sections){
  const existing=context.references.find(r=>r.display===section.heading);let t,number,recordId;
  if(existing){check(context.mode==='revise','新增创作不能覆盖已有记录');t=context.catalog.templates.find(t=>t.id===existing.tableId);recordId=existing.recordId;}
  else {const match=/^(.+)／([1-9]\d*)$/.exec(section.heading);check(match,'表单标题须为已登记表名／序号：'+section.heading);t=context.catalog.templates.find(t=>t.label===match[1]);check(t,'表单未登记：'+match[1]);number=Number(match[2]);check(number===(counts.get(t.id)??0)+1,'同表记录须从1连续编号：'+section.heading);counts.set(t.id,number);recordId=stableId(context.operationId+'|'+t.id+'|'+number);}
  const made=engine.create(t.id),keys=section.lines.map(line=>{const {row}=sheetLine(line),f=t.fields[row-1];check(f,'字段行未开放：'+section.heading+'/'+row);return f.key;});
  check(keys.length,'不创建没有字段的记录：'+section.heading);selections.push({recordId:made.id,keys,heading:section.heading});rows.push({tableId:t.id,recordId,workbookId:made.id,heading:section.heading,existing:!!existing,values:{},states:{}});
 }
 const ticket=engine.requestWorkbook(selections);engine.accept(ticket.token,sections.flatMap(s=>['【'+s.heading+'】',...s.lines]).join('\n'));
 for(const row of rows){row.raw=engine.values(row.workbookId).values;const previous=row.existing?snapshot.state.tables[row.tableId]?.[row.recordId]?.values:null;row.name=String(row.raw.name??row.raw.label??row.raw.title??previous?.name??previous?.label??previous?.title??'').trim();check(Object.keys(row.raw).length,'不创建所有字段均未知的空记录：'+row.heading);if(!row.existing&&row.name)check(!context.references.some(r=>r.tableId===row.tableId&&r.name===row.name),'已有同名记录，请明确选择修订对象，不能默建副本：'+row.name);if(row.existing&&ownedTable(context.schemas[row.tableId]))row.owner=Object.fromEntries([...ownerKeys].filter(k=>Object.hasOwn(previous??{},k)).map(k=>[k,previous[k]]));}
 // Build the canonical actor links before resolving references to newly created
 // people. These IDs are private to this draft and stable across save retries.
 const generated=[],actors=[];
 for(const row of rows.filter(r=>r.tableId==='T_CHAR_DOSSIER')){
  check(row.name,'人物档案需要显示名称');const schema=snapshot.state.schema.T_SYS_ENTITIES;check(schema,'人物主体表尚未登记');
  let existingEntity;if(row.existing)existingEntity=Object.entries(snapshot.state.tables.T_SYS_ENTITIES??{}).find(([,e])=>{const ref=snapshot.state.tables.M_FIELD_REFERENCES?.[e.values.origin_record_ref]?.values;return ref?.target_table===row.tableId&&ref.target_row_uuid===row.recordId;});
  const entityId=existingEntity?.[0]??stableId(context.operationId+'|actor|'+row.recordId),values={};const has=k=>schema.fields.some(f=>f.key===k&&!f.read_only&&!f.alias_of);if(has('kind'))values.kind='character';if(has('name'))values.name=row.name;
  if(!existingEntity&&has('origin_record_ref')&&snapshot.state.schema.M_FIELD_REFERENCES){const link=stableId(context.operationId+'|origin|'+row.recordId);values.origin_record_ref=link;generated.push({tableId:'M_FIELD_REFERENCES',recordId:link,values:{owner_table:'T_SYS_ENTITIES',owner_row_uuid:entityId,owner_field:'origin_record_ref',target_table:'T_CHAR_DOSSIER',target_row_uuid:row.recordId,reference_kind:'record',resolution_status:'resolved'}});}
  if(!existingEntity)generated.push({tableId:'T_SYS_ENTITIES',recordId:entityId,values});actors.push({tableId:'T_SYS_ENTITIES',recordId:entityId,name:row.name,display:(schema.label??'主体')+'／'+row.name,dossierId:row.recordId});
  if(snapshot.state.schema.T_CHAR_DOSSIER.fields.some(f=>f.key==='entity_ref'))row.values.entity_ref=entityId;
 }
 const references=[...context.references,...rows.map(r=>({tableId:r.tableId,recordId:r.recordId,name:r.name,display:r.heading})),...actors];
 function tableId(raw){const matches=context.catalog.templates.filter(t=>t.label===raw||t.id===raw);check(matches.length===1,'表名不存在或不唯一：'+raw);return matches[0].id;}
 function reference(raw,target){let candidates=references.filter(r=>r.name===raw||r.display===raw);if(target==='T_SYS_ENTITIES'){const dossiers=candidates.filter(r=>r.tableId==='T_CHAR_DOSSIER');candidates=candidates.concat(actors.filter(a=>dossiers.some(d=>d.recordId===a.dossierId)));}const matches=candidates.filter(r=>(!target||(Array.isArray(target)?target.includes(r.tableId):r.tableId===target))),unique=[...new Map(matches.map(r=>[r.tableId+'#'+r.recordId,r])).values()];if(unique.length!==1){const wanted=(Array.isArray(target)?target:[target]).filter(Boolean).map(id=>snapshot.state.schema[id]?.label??id).join('／'),found=[...new Set(candidates.map(r=>snapshot.state.schema[r.tableId]?.label??r.tableId))].join('／');throw Object.assign(Error('关联名称不存在、重名或表不匹配：'+raw+(wanted?'；需要 '+wanted:'')+(found?'；实际为 '+found:'')),{code:'FORM_REFERENCE',reference:raw,target,actualTables:candidates.map(r=>r.tableId)});}return unique[0];}
 const attach=(parent,field,child)=>{const schema=context.schemas[child.tableId];if(!schema||!ownedTable(schema))return;const metadata={...(schema.fields.some(f=>f.key==='owner_table')?{owner_table:parent.tableId}:{owner_form:parent.tableId}),owner_row_uuid:parent.recordId,owner_field:field.key};if(child.owner)check(digest(child.owner)===digest(metadata),'同一子表不能归属两个字段：'+child.heading);child.owner=metadata;};
 function fieldValue(row,spec,raw){
  if(['?','~','!','∅','—'].includes(raw))return decode(raw,spec);
  if(spec.type==='TABLE_KEY'||['target_table','source_table','output_table'].includes(spec.key))return [tableId(raw),'known'];
  if(spec.type==='FIELD_KEY'||['target_field','source_field','output_field'].includes(spec.key)){
   const prefix=spec.key.replace(/_field(?:_key)?$/,'_table'),target=row.values[prefix]??row.values[prefix+'_id']??row.owner?.owner_table;const tables=target?[snapshot.state.schema[target]]:Object.values(snapshot.state.schema);const matches=tables.flatMap(t=>(t?.fields??[]).filter(f=>f.label===raw||f.key===raw));const keys=[...new Set(matches.map(f=>f.key))];check(keys.length===1,'字段名称不存在或不唯一：'+raw);return [keys[0],'known'];
  }
  const businessRef=phoneFormReference(row.tableId,spec.key),listRef=PHONE_FORM_LIST_REFERENCES[row.tableId]?.[spec.key];
  const phoneId=ref=>{const made=rows.find(r=>r.tableId===ref.tableId&&r.recordId===ref.recordId),old=snapshot.state.tables[ref.tableId]?.[ref.recordId]?.values;return made?.values.id??old?.id??ref.recordId;};
  if(businessRef){const ref=reference(raw,businessRef);return [ref.tableId.startsWith('X_')?phoneId(ref):ref.recordId,'known'];}
  if(listRef)return [list(raw).map(token=>{const ref=reference(token,listRef);return listRef.startsWith('X_')?phoneId(ref):ref.recordId;}),'known'];
  if(spec.type==='CHILD_REF'&&spec.ref==='M_LIST_VALUES'){
   const values=list(raw),ids=[];for(const [i,text]of values.entries()){
    const typed=/^(关联|数值|布尔|条目|文字)[：:]\s*(.*)$/.exec(text);if(typed?.[1]==='条目'){const ref=reference(typed[2],'M_LIST_VALUES'),child=rows.find(r=>r.tableId===ref.tableId&&r.recordId===ref.recordId);if(child)attach(row,spec,child);else{const own=snapshot.state.tables.M_LIST_VALUES?.[ref.recordId]?.values;check(own?.owner_table===row.tableId&&own.owner_row_uuid===row.recordId&&own.owner_field===spec.key,'列表条目不能改挂另一字段');}ids.push(ref.recordId);continue;}
    const id=stableId(context.operationId+'|list|'+row.recordId+'|'+spec.key+'|'+i),item={owner_table:row.tableId,owner_row_uuid:row.recordId,owner_field:spec.key,sequence:i+1,value_state:'known'};ids.push(id);
    if(typed?.[1]==='关联'){const ref=reference(typed[2]);Object.assign(item,{item_type:'reference',target_table:ref.tableId,target_row_uuid:ref.recordId});}
    else if(typed?.[1]==='数值'){const value=Number(typed[2]);check(typed[2].trim()&&Number.isFinite(value),'列表数值无效');Object.assign(item,{item_type:'number',number_value:value});}
    else if(typed?.[1]==='布尔'){check(['是','否','true','false'].includes(typed[2]),'列表布尔值须为是或否');Object.assign(item,{item_type:'boolean',boolean_value:['是','true'].includes(typed[2])});}
    else Object.assign(item,{item_type:'text',text_value:typed?typed[2]:text});generated.push({tableId:'M_LIST_VALUES',recordId:id,values:item});
   }return [ids,'known'];
  }
  if(['REF','CHILD_REF','REF_LIST','ROW_REF'].includes(spec.type)||/^(?:target|source|output)_row_uuid$/.test(spec.key)){
   let target=spec.ref;if(target?.startsWith('@'))target=row.values[target.slice(1)];if(spec.type==='ROW_REF'){const prefix=spec.key.replace(/_row_uuid$/,'_table');target=row.values[prefix]??target;}
   if(/^(?:target|source|output)_row_uuid$/.test(spec.key))target=row.values[spec.key.replace(/_row_uuid$/,'_table')]??target;
   if(target&&!snapshot.state.schema[target])return decode(raw,spec);
   const many=spec.type==='REF_LIST'||spec.type==='CHILD_REF'&&/[；;]/.test(raw),tokens=many?list(raw):[raw],resolved=tokens.map(token=>reference(token,target));for(const ref of resolved){const child=rows.find(r=>r.tableId===ref.tableId&&r.recordId===ref.recordId);if(child)attach(row,spec,child);}return [many?resolved.map(r=>r.recordId):resolved[0]?.recordId,'known'];
  }
  if(['ARRAY','TEXT_LIST'].includes(spec.type))return decode(spec.type==='TEXT_LIST'?list(raw):structuredCell(raw,true),spec);
  if(['JSON','OBJECT'].includes(spec.type)){const value=structuredCell(raw);return decode(typeof value==='string'?JSON.stringify(value):value,spec);}
  if(spec.type==='ENUM'&&(spec.enum??spec.options)?.some(v=>typeof v==='boolean'))return decode(atom(raw),spec);
  return decode(raw,spec);
 }
 // Table selectors precede their row/field references. Value conversion is
 // canonical decode(), while the shared sheet engine owns surface parsing.
 for(const row of rows){const schema=context.schemas[row.tableId];const pairs=Object.entries(row.raw).sort(([a],[b])=>Number(/table/.test(b))-Number(/table/.test(a)));for(const [key,rawValue]of pairs){const spec=schema.fields.find(f=>f.key===key);try{const [value,state]=fieldValue(row,spec,rawValue);row.values[key]=normalizePhoneFormValue(row.tableId,key,value);if(state!=='known')row.states[key]=state;}catch(error){error.message='【'+row.heading+'】'+spec.label+'：'+error.message;error.formLocation={tableId:row.tableId,heading:row.heading,field:key,label:spec.label,rawValue};throw error;}}}
 for(const row of rows){const schema=context.schemas[row.tableId];if(ownedTable(schema)){check(row.owner&&Object.keys(row.owner).length,'子表需要从所属档案字段引用：'+row.heading);Object.assign(row.values,row.owner);if(schema.fields.some(f=>f.key==='value_state')&&!Object.hasOwn(row.values,'value_state'))row.values.value_state=Object.values(row.states).find(s=>['unknown','unset','none','not_applicable','cleared'].includes(s))??'known';if(schema.fields.some(f=>f.key==='sequence')&&!Object.hasOwn(row.values,'sequence'))row.values.sequence=row.existing?snapshot.state.tables[row.tableId][row.recordId].values.sequence:Number(row.heading.split('／').at(-1));}}
 for(const row of rows)if(snapshot.state.schema[row.tableId]?.phone_internal&&snapshot.state.schema[row.tableId].fields.some(f=>f.key==='id')&&!row.existing)row.values.id=row.recordId;
 const changes=[...rows.map(({tableId,recordId,values,states})=>({tableId,recordId,values,...(Object.keys(states).length?{states}:{})})),...generated];
 if(context.kind==='character')check(actors.length===1,'创建单个人物时须有且只有一份人物原点档案');
 const world=rows.find(r=>r.tableId==='T_STATIC_WORLDS');if(context.kind==='world'&&context.task==='tableGenesis'&&context.mode==='extend'&&snapshot.state.schema.T_STATIC_WORLDS)check(world,'创建新世界须填写世界与历法身份');
 const binding=context.kind==='character'?{entityId:actors[0].recordId,dossierId:actors[0].dossierId,...(world?{worldId:world.recordId}:{})}:world?{worldId:world.recordId}:undefined;
 const name=((parsed.title??blocks.title??'').split('|')[0]??'').trim()||rows.find(r=>r.name)?.name||(context.task==='main'?'本轮表单变更':'');check(name,'表单方案需要名称');const unresolved=context.task==='main'?[]:(blocks.extra??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/^待补[：:|]\s*/,''));
 return {proposal:{name,summary:parsed.body_normalized??blocks.body??'',unresolved,matrix:{changes,...(binding?{binding}:{})}},parsed,workbook:engine.snapshot(),bindings:rows.map(({tableId,recordId,workbookId,heading})=>({tableId,recordId,workbookId,heading}))};
}
export function validateMatrixProposal(proposal,snapshot,{mode='extend',kind='world'}={}){
 check(plain(proposal)&&typeof proposal.name==='string'&&proposal.name.trim(),'创作结果缺少名称');
 check(Array.isArray(proposal.unresolved??[])&&(proposal.unresolved??[]).every(x=>typeof x==='string'),'待补事项格式无效');
 check(!proposal.artifacts&&!proposal.phone,'请使用当前表单规范字段，不接受旧原点或独立手机状态');
 check(plain(proposal.matrix)&&Array.isArray(proposal.matrix.changes),'创作结果缺少 matrix.changes');
 check(proposal.matrix.changes.length>0&&proposal.matrix.changes.length<=2000,'创作变更必须在1至2000条之间');
 const runtime=new Runtime(snapshot.state);applyMatrixChanges(runtime,proposal.matrix.changes,{mode});
 const binding=proposal.matrix.binding;
 if(kind==='character'){
  check(plain(binding)&&typeof binding.entityId==='string','新人物必须明确唯一主体 entityId');
  check(runtime.data.tables.T_SYS_ENTITIES?.[binding.entityId],'人物主体未登记在 T_SYS_ENTITIES');
  if(binding.dossierId)check(runtime.data.tables.T_CHAR_DOSSIER?.[binding.dossierId],'人物档案引用不存在');
  if(runtime.data.schema.M_FIELD_REFERENCES&&runtime.data.schema.T_SYS_ENTITIES.fields.some(f=>f.key==='origin_record_ref')){const entity=runtime.data.tables.T_SYS_ENTITIES[binding.entityId].values,ref=runtime.data.tables.M_FIELD_REFERENCES?.[entity.origin_record_ref]?.values;check(ref?.owner_table==='T_SYS_ENTITIES'&&ref.owner_row_uuid===binding.entityId&&ref.owner_field==='origin_record_ref'&&ref.target_table==='T_CHAR_DOSSIER'&&ref.target_row_uuid===binding.dossierId,'人物实体必须以规范原点引用连接所选档案');}
 }
 return clone(proposal);
}

export function applyMatrixChanges(runtime,changes,{mode='revise'}={}){
 check(Array.isArray(changes)&&changes.length>0&&changes.length<=2000,'表单变更必须在1至2000条之间');
 const seen=new Set();
 for(const change of changes){
  check(plain(change)&&typeof change.tableId==='string'&&typeof change.recordId==='string'&&change.recordId.trim(),'每条变更需要规范表ID和稳定记录ID');
  check(Object.keys(change).every(k=>['tableId','recordId','values','states'].includes(k)),'创作不能填写程序元数据或未声明的变更属性');
  check(!change.states||plain(change.states)&&Object.keys(change.states).every(k=>Object.hasOwn(change.values??{},k)&&['known','unknown','unset','none','not_applicable','cleared'].includes(change.states[k])),'创作值状态必须对应实际变更字段');
  const {tableId,recordId,values}=change,key=tableId+'#'+recordId;
  check(!seen.has(key),'同一记录须合并为一项变更：'+key);seen.add(key);
  check(runtime.data.schema[tableId]&&plain(values),'表或字段不存在：'+key);
  check(!programOwnedTable(tableId,runtime.data.schema[tableId]),'创作草稿不能编造程序回执或历史快照：'+tableId);
  check(!change.remove,'创作草稿不删除已有记录；请在表单中核对删除');
  const existing=runtime.data.tables[tableId]?.[recordId];check(!existing?.metadata?.phone_projection,'创作不能覆盖程序投影行，请修改其规范原点：'+key);
  check(mode!=='extend'||!existing,'补充创作不能覆盖已有记录：'+key);
  for(const [field,value] of Object.entries(values)){
   const def=runtime.data.schema[tableId].fields.find(f=>f.key===field);
   check(def,'未知字段：'+key+'.'+field);
   check(creationFieldAllowed(def),'创作不能直接填写派生字段：'+key+'.'+field);
  }
  if(!existing)runtime.newRecord(tableId,{},recordId);
  for(const [field,value]of Object.entries(values))runtime.set([tableId,recordId,field,[]],clone(value),change.states?.[field]??'known');
 }
 for(const [rid,row]of Object.entries(runtime.rows('T_SYS_ENTITIES'))){const ref=runtime.rows('M_FIELD_REFERENCES')[row.values.origin_record_ref]?.values;if(ref?.target_table&&ref.target_row_uuid){const name=runtime.rows(ref.target_table)[ref.target_row_uuid]?.values?.[ref.target_field||'name'];if(typeof name==='string'&&runtime.data.schema.T_SYS_ENTITIES.fields.some(f=>f.key==='name'))runtime.set(['T_SYS_ENTITIES',rid,'name',[]],name,'derived');}}
 // References can target a later row in the same proposed batch.
 for(const change of changes){const row=runtime.record(change.tableId,change.recordId);for(const spec of runtime.data.schema[change.tableId].fields){
  const value=row.values[spec.key],state=row.states[spec.key];check(!spec.required||spec.read_only||value!==undefined&&value!==null&&['known','derived'].includes(state),'必填字段尚未完整填写：'+change.tableId+'.'+spec.key);
  if(value===null||value===undefined||!['known','derived'].includes(state))continue;const dynamic=/^(?:target|source|output)_row_uuid$/.test(spec.key);if(!['REF','CHILD_REF','REF_LIST','ROW_REF'].includes(spec.type)&&!dynamic)continue;
  const target=dynamic?row.values[spec.key.replace(/_row_uuid$/,'_table')]:spec.ref?.startsWith('@')?row.values[spec.ref.slice(1)]:spec.ref;if(!runtime.data.schema[target])continue;
  for(const ref of Array.isArray(value)?value:[value])if(typeof ref==='string')check(runtime.data.tables[target]?.[ref],'引用记录不存在：'+change.tableId+'.'+spec.key+' → '+target+'#'+ref);
 }}
 return {changes:clone(changes)};
}
