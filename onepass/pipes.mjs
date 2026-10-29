// Fixed-column one-pass wire. Parsing is inert; persistence belongs to tables/service.
import {valueValid} from '../tables/schema.js';
export const PIPE_ROWS=Object.freeze({
 status:{共用:['生效时间','对象','证据','读者','知情者'],描述:['编号','登记字段路径','变化后文本','有效性','锚点事件'],认知:['编号','主体','事实','获知途径','确认程度','认识','心理','授权依据'],习惯锚点:['编号','主体','相关对象','锚点事件','类别','情境','内容','感受','例外','表现方式','回应边界','内在动因','初始成因','心理','动作','神态','语言','触发线索','默契层次','确定性','有效性']},
 vars:{共用:['对象','证据'],变量:['编号','登记字段路径','原值','新值']},
 archive:{归档:['快照','提交编号'],待定:['关联编号','缺项','解除条件']},
 memory:{共用:['故事时间','地点','对象','证据','读者','知情者'],事件:['编号','时间范围','参与者','经过','结果','场面','台词','意象','前因','影响','后续','情感余波','触发线索','关联事件','前置事件','后续事件','标签','原文段号'],事实发现:['编号','对象','命题','条件','生效时间','验证状态','替代事实'],伏笔:['编号','对象','已出现内容','阶段','公开范围','推进条件','事件'],倒计时:['编号','时间基准','起点','到期时间','触发条件','失效条件','重复规则','到期轮次','任务','状态'],前史:['所属事实','主体','时期','地点','参与者','选择','后果','当下影响','原文','涉及对象','当时理解'],关系底稿:['所属事实','主体','对象','性质','形成经过','相处方式','主体边界','成立条件'],隐情:['所属事实','关联对象','可观察线索','揭示条件','影响范围'],世界设定:['所属事实','领域','相关对象','适用范围']}
});
const fail=(message)=>{throw Object.assign(Error(message),{code:'TISYA_ONEPASS_PIPES',detail:message});};
const check=(ok,message)=>{if(!ok)fail(message);};
const missing=v=>v===undefined||v===''||v==='~';
const unxml=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi,x=>{const key=x.slice(1,-1),named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(named,key))return named[key];const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));check(n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff),'无效 XML 实体');return String.fromCodePoint(n);});
export function splitPipeRaw(text,separator){const out=[''];let escape=false;for(const c of text){if(escape){out[out.length-1]+='\\'+c;escape=false;}else if(c==='\\')escape=true;else if(c===separator)out.push('');else out[out.length-1]+=c;}check(!escape,'末尾反斜线未完成转义');return out;}
export function decodePipeCell(s){return s.replace(/\\(.)/gs,(_,c)=>{const map={'\\':'\\','|':'|','&':'&','、':'、',n:'\n',r:'\r',t:'\t','~':'~','=':'=','!':'!'};check(Object.hasOwn(map,c),'未登记转义 '+c);return map[c];});}
function paragraphEvidence(raw){
 let value=raw.trim();
 if(value.startsWith('[')&&value.endsWith(']'))value=value.slice(1,-1).trim();
 if(!/^P[1-9]\d*(?:(?:\s*[,，、;；]\s*|\s+)P[1-9]\d*)*$/i.test(value))return raw;
 return value.toUpperCase().split(/\s*[,，、;；]\s*|\s+/).join('、');
}
export function parsePipeBlock(text,block){
 check(Object.hasOwn(PIPE_ROWS,block),'未登记区块');const rows=[];let common={};
 for(const [index,line] of unxml(text).split(/\r?\n/).entries())for(const part of splitPipeRaw(line,'&')){
  if(!part.trim())continue;const at=part.search(/[:：]/);check(at>0,block+'第 '+(index+1)+' 行缺少类别冒号');const kind=part.slice(0,at).trim(),fields=PIPE_ROWS[block][kind];check(fields,block+' 未登记类别 '+kind);
  let cells=splitPipeRaw(part.slice(at+1).trim(),'|').map(x=>x.trim());
  if(kind==='共用'&&cells.some(c=>fields.some(f=>c.startsWith(f+'=')||c.startsWith(f+'：')))){
   const named=new Map();for(const cell of cells){const match=/^([^=：]+)[=：]([\s\S]*)$/.exec(cell);check(match&&fields.includes(match[1].trim()),block+' 共用命名列无效；不能混用命名列和位置列');const key=match[1].trim();check(!named.has(key),block+' 共用命名列重复：'+key);named.set(key,match[2].trim()||'~');}cells=fields.map(key=>named.get(key)??'~');
  }
  check(cells.length<=fields.length,block+' 第 '+(index+1)+' 行 '+kind+' 列数过多：应为 '+fields.length+' 列，实际 '+cells.length+' 列；正文中的 | 须写为 \\|');while(cells.length<fields.length)cells.push('~');for(const c of cells)decodePipeCell(c);
  if(kind!=='共用'&&cells.every(missing))continue;
  const values=Object.fromEntries(fields.map((key,i)=>[key,cells[i]]));
  for(const key of ['证据','原文段号','台词'])if(Object.hasOwn(values,key))values[key]=paragraphEvidence(values[key]);
  if(kind==='共用'){
   if(Object.hasOwn(values,'证据')&&!missing(values.证据))check(/^P[1-9]\d*(?:、P[1-9]\d*)*$/.test(values.证据),block+' 第 '+(index+1)+' 行 共用.证据 须为 P1、P2 段号；请核对 '+fields.map((key,i)=>(i+1)+'.'+key).join(' | ')+'，中间未知值须保留 ~ 列');
   common=values;continue;
  }rows.push({kind,values,common:{...common},line:index+1});check(rows.length<=400,'记录数量超过上限');
 }return {format:'pipes',rows};
}
const rowTable={事件:'events',事实发现:'facts',伏笔:'clues',倒计时:'timers',认知:'cognition',习惯锚点:'experiences'};
const nested=new Set(['前史','关系底稿','隐情','世界设定']);
export function compilePipeRecords(view,reply,state,{sourceKey=null}={}){
 const pending=[],ops=new Map(),wireIDs=new Set(),paragraphs=reply.publicReply.paragraphs,byId=new Map(view.rows.map(r=>[r.id,r])),aliases=state.aliases??{};
 const ref=raw=>{const s=decodePipeCell(raw);if(/^\+[A-Za-z][\w-]*$/.test(s))return 'new:'+s.slice(1);const id=aliases[s]??s;check(byId.has(id),'引用编号不存在：'+s);return id;};
 const list=(raw,resolve=false)=>{check(!missing(raw)&&!['!','=','null'].includes(raw),'缺少明确列表');if(raw==='[]')return [];const a=splitPipeRaw(raw,'、').map(x=>resolve?ref(x):decodePipeCell(x));check(a.every(x=>x.trim())&&new Set(a).size===a.length,'列表有空项或重复');return a;};
 const inherited=(raw,common,key)=>raw==='='?(check(!missing(common[key])&&common[key]!=='=','没有可继承的 '+key),common[key]):raw;
 const value=(raw,def)=>{
  if(missing(raw))return undefined;check(raw!=='=','此列没有共用继承');
  if(raw==='null'){check(valueValid(null,def),'此字段不可为 null');return null;}
  if(def.type==='ref')return ref(raw);if(def.type==='refs')return list(raw,true);if(def.type==='texts')return list(raw);
  let v=decodePipeCell(raw);if(['number','duration'].includes(def.type)){check(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(v),'数值格式无效');v=Number(v);}else if(def.type==='boolean'){check(['true','false'].includes(v),'布尔只接受 true/false');v=v==='true';}
  else if(def.type==='json'){if(v==='true'||v==='false')v=v==='true';else if(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(v))v=Number(v);else check(!/^[\[{]/.test(v),'复合值须由已登记子字段填写，不填 JSON');}
  check(valueValid(v,def),'字段类型或枚举不符');return v;
 };
 const evidence=raw=>{const ids=list(raw);check(ids.length,'缺少原文证据');check(ids.every(id=>/^P[1-9]\d*$/.test(id)),'证据须为本条正文段号 P1、P2；其他来源先列待定');ids.sort((a,b)=>Number(a.slice(1))-Number(b.slice(1)));const parts=ids.map(id=>{const p=paragraphs.find(p=>p.id===Number(id.slice(1)));check(p,'证据段号不存在：'+id);return p.raw;});return {ids,parts,quote:parts[0]};};
 const commonAccess=(common,old)=>{
  const readers=missing(common.读者)?old?.access.readers:list(common.读者).map(x=>x==='读者'?x:ref(x));
  const knowers=missing(common.知情者)?old?.access.knowers:list(common.知情者,true);
  check(Array.isArray(readers)&&Array.isArray(knowers),'新记录须明确读者与知情者；空范围用 []');return {readers,knowers};
 };
 const make=(r,table)=>{
  const id=ref(r.values.编号),old=byId.get(id);check(!ops.has(id),'同一编号重复提交');check(!old||old.table===table,'编号与表类别不符');check(old||id.startsWith('new:'),'新记录须用 +编号');
  const def=view.registry.tables.find(t=>t.id===table);check(def,'表未登记：'+table);const ev=evidence(r.common.证据);
  const op={id,table,expected:old?.rev??0,values:old?{}:{名称:decodePipeCell(r.values.编号)},access:commonAccess(r.common,old),evidence:ev.quote};ops.set(id,op);wireIDs.add(id);return {op,old,def,ev};
 };
 const set=(op,key,raw,def)=>{if(missing(raw))return;check(def,'字段未登记：'+key);if(raw==='!'){check(!def.required,'不能清空必填字段');(op.unset??=[]).push(key);return;}op.values[key]=value(raw,def);};
 for(const block of ['memory','status'])for(const r of reply.records[block].rows){if(nested.has(r.kind))continue;
  if(r.kind==='描述'){
   const path=decodePipeCell(r.values.登记字段路径).split('.'),tableId=path.shift(),table=view.registry.tables.find(t=>t.id===tableId);check(table&&!['native_cells','preferences'].includes(table.id),'描述路径未登记或属独立写入者');
   const {op,old,def,ev}=make(r,table.id==='state'?'state':table.id);check(old,'描述更新须引用已有记录；新认知和习惯使用各自专行');check(path.length===1&&(def.fields[path[0]]?.type==='text'||def.fields[path[0]]?.type==='json'&&typeof old.values[path[0]]==='string'),'描述只更新已登记文本字段');set(op,path[0],r.values.变化后文本,{...def.fields[path[0]],type:'text'});if(def.fields.生效时间&&!missing(r.common.生效时间))op.values.生效时间=decodePipeCell(r.common.生效时间);
   for(const key of ['有效性','锚点事件'])if(!missing(r.values[key]))set(op,key,r.values[key],def.fields[key]);continue;
  }
  const table=rowTable[r.kind];check(table,'未登记行 '+r.kind);const {op,old,def,ev}=make(r,table);
  for(const [key,raw]of Object.entries(r.values)){if(key==='编号')continue;
   if(key==='原文段号'){if(!missing(raw)){check(raw!=='!','原文段落不得伪清空');const original=evidence(inherited(raw,r.common,'证据'));op.values.原文段落=original.parts;op.values.原文段号=original.ids;}continue;}
   if(table==='events'&&key==='台词'&&!missing(raw)&&/^P[1-9]\d*(?:、P[1-9]\d*)*$/.test(raw)){evidence(raw);op.values.台词=raw;continue;}
   const commonKey=key==='参与者'||key==='主体'?'对象':key==='生效时间'?'故事时间':key;
   let cell=inherited(raw,r.common,commonKey);
   if(raw==='='&&key==='主体'){const a=list(cell,true);check(a.length===1,'主体只能继承单个对象');cell=a[0];}
   // Public scope is stored as text in the existing clues table, never as acquisition permission.
   if(key==='公开范围'&&!missing(cell)&&cell!=='!'){op.values[key]=list(cell).map(x=>x==='读者'?x:ref(x)).join('、');continue;}
   if(key==='确认程度'&&!missing(cell))check(['K0','K1','K2','K3'].includes(decodePipeCell(cell)),'认知程度须为 K0/K1/K2/K3');
   if(r.kind==='伏笔'&&key==='阶段'&&!missing(cell))check(['埋设','推进','回收','作废'].includes(decodePipeCell(cell)),'伏笔阶段无效');
   set(op,key,cell,def.fields[key]);
  }
  if(table==='events'){
   if(!missing(r.common.故事时间))op.values.时间=decodePipeCell(r.common.故事时间);
   if(!missing(r.common.地点))op.values.地点=list(r.common.地点,true).join('、');
   if(!Object.hasOwn(op.values,'参与者')&&!old&& !missing(r.common.对象))op.values.参与者=list(r.common.对象,true);
   const referenceLine=v=>typeof v==='string'&&/^P[1-9]\d*(?:、P[1-9]\d*)*$/.test(v);
   const oldReference=referenceLine(old?.values.台词),newDialogue=Object.hasOwn(op.values,'台词')||(op.unset??[]).includes('台词');
   check(!oldReference||newDialogue||!Object.hasOwn(op.values,'原文段落'),'更新原文时须重申或明确清除旧台词段号，禁止错绑');
   if(!Object.hasOwn(op.values,'原文段落')&&!(oldReference&&!newDialogue)){op.values.原文段落=ev.parts;op.values.原文段号=ev.ids;}
   if(referenceLine(op.values.台词)){
    const ids=[...new Set([...(op.values.原文段号??[]),...list(op.values.台词)])],original=evidence(ids.join('、'));
    op.values.原文段落=original.parts;op.values.原文段号=original.ids;
   }
   if(sourceKey&&Object.hasOwn(op.values,'原文段落'))op.values.原文来源=sourceKey;
  }
 }
 for(const r of reply.records.memory.rows.filter(r=>nested.has(r.kind))){
  const id=ref(r.values.所属事实),op=ops.get(id);check(op?.table==='facts','子表必须属于本次事实发现行');check(!Object.hasOwn(op.values,r.kind),'同类事实子表重复');const def=view.registry.tables.find(t=>t.id==='facts').fields[r.kind];check(def?.fields,'事实子表尚未登记：'+r.kind);
  const base=structuredClone(byId.get(id)?.values[r.kind]??{});for(const [key,input]of Object.entries(r.values)){if(key==='所属事实'||missing(input))continue;let raw=inherited(input,r.common,key==='主体'||key==='参与者'?'对象':key);if(input==='='&&key==='主体'){const ids=list(raw,true);check(ids.length===1,'主体只能继承单个对象');raw=ids[0];}const d=def.fields[key];check(d,'子表字段未登记');if(raw==='!'){check(!d.required,'不能清空必填字段');delete base[key];(op.unsetPaths??=[]).push([r.kind,key]);}else base[key]=value(raw,d);}if(r.kind==='前史'&&base.原文!==undefined)check(paragraphs.some(p=>p.raw.includes(base.原文)),'前史原文须能在本条正文逐字定位');op.values[r.kind]=base;
 }
 for(const r of reply.records.vars.rows){
  const id=ref(r.values.编号),old=byId.get(id);check(old&&!['preferences','native_cells','objects','events','facts','cognition','experiences'].includes(old.table),'变量只更新现有业务数值记录');check(!old.values.原生引用,'原生数值由宿主唯一写入');check(!ops.has(id),'状态与变量不得重复写同一编号');
  const fields=decodePipeCell(r.values.登记字段路径).split('.');check(fields.shift()===old.table&&fields.length===1,'变量路径必须为已有表的直接字段');const key=fields[0],def=view.registry.tables.find(t=>t.id===old.table).fields[key];check(def&&['number','boolean','json'].includes(def.type),'变量字段须为已登记数值或布尔值');
  const owners=list(r.common.对象,true);check(owners.length&&owners.some(x=>[old.values.对象,old.values.主体,old.values.物品].includes(x)),'变量归属与共用对象不符');
  const before=value(r.values.原值,def),after=value(r.values.新值,def);check(before!==undefined&&after!==undefined&&JSON.stringify(before)===JSON.stringify(old.values[key]),'变量原值不匹配');check(typeof after==='number'||typeof after==='boolean'||after===null&&def.nullable,'变量新值须为有效数值或布尔值');
  const ev=evidence(r.common.证据);ops.set(id,{id,table:old.table,expected:old.rev,values:{[key]:after},access:structuredClone(old.access),evidence:ev.quote});wireIDs.add(id);
 }
 for(const op of ops.values())if(op.id.startsWith('new:')){
  const required={events:['经过'],facts:['命题'],clues:['已出现内容'],timers:['时间基准'],cognition:['主体'],experiences:['主体','类别','内容']}[op.table]??[];
  check(required.every(key=>typeof op.values[key]==='string'&&op.values[key].trim()),'新增 '+op.table+' 缺少必要内容，应移到待定');
  if(op.table==='timers')check(op.values.到期时间||op.values.触发条件||Number.isFinite(op.values.到期轮次),'倒计时缺少到期依据');
  if(op.table==='cognition')check(op.values.认识||op.values.心理||op.values.事实?.length,'认知缺少实际变化');
 }
 const archives=reply.records.archive.rows.filter(r=>r.kind==='归档');check(archives.length===1,'须有且仅有一条归档基线');const a=archives[0].values;check(decodePipeCell(a.快照)===state.basis,'存档基线已变化');const submitted=list(a.提交编号,true);check(submitted.length===wireIDs.size&&submitted.every(id=>wireIDs.has(id)),'提交编号清单与实际记录不符');
 for(const r of reply.records.archive.rows.filter(r=>r.kind==='待定')){check(!missing(r.values.缺项)&&!missing(r.values.解除条件),'待定须有精确缺项与解除条件');pending.push(Object.values(r.values).map(decodePipeCell).join('：'));}
 return {changes:[...ops.values()],pending,coverage:view.registry.tables.map(t=>({table:t.id,status:[...ops.values()].some(o=>o.table===t.id)?'updated':'unchanged',reason:'由本次已校验固定列记录派生'}))};
}
