import {createAtlas} from './atlas.js';
import {projectArchiveAccess} from './archive-access.js';
import {typeFields,isObjectType} from './schema.js';

export const RECORD_VIEWS=Object.freeze([
 ['atlas','静态图鉴'],['events','历史事件'],['snapshot','当前快照']
]);
const HISTORY=new Set(['events']);
const SNAPSHOT=new Set(['scene','state','relations','cognition','holdings','tasks','timers','clues','activities','growth','native_cells','preferences','experiences']);
const STABLE_EXPERIENCE=new Set(['喜好','厌恶','习惯','安心方式','边界']);
// Fixed built-ins follow their registry semantics. For custom tables, explicit
// capture policies determine the view; labels and prose are never classifiers.
export function recordView(table,values={},definition){
 if(table==='experiences'&&STABLE_EXPERIENCE.has(values.类别))return 'atlas';
 if(HISTORY.has(table))return 'events';if(SNAPSHOT.has(table))return 'snapshot';
 if(['objects','facts'].includes(table))return 'atlas';
 const captures=[];const walk=fields=>{for(const field of Object.values(fields??{})){if(field.capture)captures.push(field.capture);walk(field.fields);if(field.items)walk({item:field.items});}};walk(definition?.fields);
 if(captures.includes('event'))return 'events';if(captures.some(x=>['state','native','pending','relation','knowledge','preference','meaning'].includes(x)))return 'snapshot';return 'atlas';
}
const tableViews=table=>table.id==='experiences'?['atlas','snapshot']:[recordView(table.id,{},table)];
const text=value=>value===undefined?'未填写':value===null?'空值':typeof value==='boolean'?(value?'是':'否'):typeof value==='object'?JSON.stringify(value):String(value);
// A read-only projection of the existing archive, with the same explicit ACL
// boundary as createAtlas. This component owns no records or persistence.
export function mountCompactAtlas(parent,data,{view='atlas',beforeRead=async()=>{},authorizeRow,authorizeField,onEdit=null,onSchema=null,onIdentity=null,showChanges=false,showSchemas=false,onError=()=>{},onView=()=>{}}={}){
 const doc=parent.ownerDocument,el=(tag,value,cls)=>{const n=doc.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
 const root=el('section',undefined,'tisya-compact-atlas'),style=el('style',COMPACT_ATLAS_CSS);parent.append(style,root);
 let alive=true,pending=Promise.resolve(),layer='session',filter='',query='',selected=null;const trail=[];
 function act(fn){pending=Promise.resolve().then(beforeRead).then(()=>{if(alive)return fn();}).catch(e=>{if(alive)onError(e);});return pending;}
 const button=(label,fn,parentNode=root)=>{const b=el('button',label);b.type='button';b.onclick=()=>act(fn);parentNode.append(b);return b;};
 function select(label,options,value,change,parentNode){const box=el('label'),picker=el('select');box.append(el('span',label),picker);picker.setAttribute('aria-label',label);for(const [id,name]of options){const o=el('option',name);o.value=id;picker.append(o);}picker.value=value;picker.onchange=()=>{const next=picker.value;picker.value=value;act(()=>change(next));};parentNode.append(box);return picker;}
 function projection(){const registry=layer==='origin'?(data.originRegistry??data.registry):data.registry,source=layer==='origin'?data.originRows:data.rows,context={layer,audience:'configured'},args={view:{registry,rows:source},context,authorizeRow,authorizeField};return {registry,...projectArchiveAccess(args),atlas:createAtlas(args)};}
 const state=()=>({view,layer,filter,query,selected});
 function go(id){trail.push(state());selected=id;render();root.scrollIntoView?.({block:'start'});}
 function back(){const old=trail.pop();if(old)({view,layer,filter,query,selected}=old);else selected=null;render();}
 function detailBlock(parentNode,title,renderBody){const d=el('details'),s=el('summary',title);d.append(s);parentNode.append(d);const body=el('div',undefined,'atlas-expanded');d.append(body);renderBody(body);return d;}
 function pairs(parentNode,items){const list=el('dl');parentNode.append(list);for(const [name,value]of items){list.append(el('dt',name),el('dd',text(value)));}return list;}
 function render(){
  if(!alive)return;root.replaceChildren();const {registry,rows,definitions,atlas}=projection();
  const top=el('div',undefined,'atlas-toolbar');root.append(top);
  if(selected)button('← 返回',back,top);
  const heading=el('h2',RECORD_VIEWS.find(x=>x[0]===view)?.[1]??'静态图鉴');top.append(heading);
  if(onEdit)button('编辑',()=>onEdit({kind:'choose',view,layer,recordId:selected}),top);
  const nav=el('div',undefined,'atlas-filters');root.append(nav);
  select('查看内容',RECORD_VIEWS,view,next=>{view=next;filter='';selected=null;trail.length=0;onView(next);render();},nav);
  select('资料层',[['session','当前会话'],['origin','原点定义']],layer,next=>{layer=next;filter='';selected=null;trail.length=0;render();},nav);
  const tableName=t=>t.id==='experiences'?(view==='atlas'?'习惯与偏好':'回忆与心理意义'):t.id==='native_cells'?'原生变量':t.name;
  const groups=view==='atlas'?[...registry.types.map(t=>['type:'+t.id,t.name]),...registry.tables.filter(t=>t.id!=='objects'&&tableViews(t).includes('atlas')).map(t=>['table:'+t.id,tableName(t)])]:registry.tables.filter(t=>tableViews(t).includes(view)).map(t=>['table:'+t.id,tableName(t)]);
  if(!groups.some(x=>x[0]===filter))filter='';
  select('档案类型',[['','全部类型'],...groups],filter,next=>{filter=next;selected=null;render();},nav);
  const label=el('label'),search=el('input');search.type='search';search.value=query;search.placeholder='搜索名称、别名或档案内容';search.setAttribute('aria-label','搜索档案');label.append(search);nav.append(label);
  const note=el('p',layer==='origin'?'正在只读查看原点定义。编辑当前会话记录不会覆盖原点。':'只读查看已保存内容；点“编辑”后选择要修改的对象。','atlas-note');root.append(note);
  const list=el('div',undefined,'atlas-records');root.append(list);
  const candidates=selected?rows.filter(r=>r.id===selected):rows.filter(r=>recordView(r.table,r.values,registry.tables.find(t=>t.id===r.table))===view&&(!filter||(filter.startsWith('type:')?r.table==='objects'&&r.values.类型===filter.slice(5):r.table===filter.slice(6))));
  const result=el('p',undefined,'atlas-result');root.insertBefore(result,list);
  function record(row){
   const d=atlas.detail(row.id),card=el('article',undefined,'atlas-record');card.dataset.record=row.id;card.dataset.search=JSON.stringify(row.values).normalize('NFKC').toLocaleLowerCase();list.append(card);
   const title=el('header'),type=registry.types.find(t=>t.id===row.values.类型);title.append(el('h3',row.values.名称??row.id),el('small',(type?.name??d.kind)+' · v'+row.rev));card.append(title);
   const simple=[],complex=[],bound=[],def=definitions.get(row.id);
   function collect(value,field,path){const name=path.filter(x=>x!=='属性').join(' · ');if(field?.type==='ref'||field?.type==='refs'){bound.push([name,value,path]);return;}if(value&&typeof value==='object'&&!Array.isArray(value)&&field?.fields){for(const [key,child]of Object.entries(value))collect(child,field.fields[key],[...path,key]);return;}if(value&&typeof value==='object'&&(!Array.isArray(value)||value.some(x=>x&&typeof x==='object'))){complex.push([name,value]);return;}simple.push([name,Array.isArray(value)?value.map(text).join('、'):value]);}
   for(const [key,value]of Object.entries(row.values)){if(key==='名称'||key==='类型')continue;collect(value,def.fields[key],[key]);}
   if(simple.length)pairs(card,simple);else card.append(el('p','暂无其他已填写字段。','atlas-note'));
   if(complex.length)detailBlock(card,'详细资料（'+complex.length+'）',body=>pairs(body,complex));
   const identityEligible=onIdentity&&data.live&&layer==='origin'&&row.table==='objects'&&isObjectType(registry,row,'character');
   if(bound.length||d.neighbors.length||identityEligible)detailBlock(card,'绑定对象与关联',body=>{if(identityEligible)button('用作用户身份',()=>onIdentity(row),body);for(const [name,value,path]of bound){const line=el('div',undefined,'atlas-links');line.append(el('strong',name));const refs=d.references.filter(r=>r.path.length>=path.length&&path.every((v,i)=>r.path[i]===v));if(refs.length)for(const ref of refs)button(ref.target.name,()=>go(ref.target.id),line);else line.append(el('span',Array.isArray(value)&&!value.length?'暂无绑定':'暂无可读对象'));body.append(line);}for(const neighbor of d.neighbors){const line=el('div',undefined,'atlas-links');button(neighbor.name,()=>go(neighbor.id),line);line.append(el('small',neighbor.via.map(x=>x.label).join('、')));body.append(line);}});
   const events=d.related.filter(r=>r.table==='events');if(events.length)detailBlock(card,'历史事件（'+events.length+'）',body=>{for(const event of events){button(event.name,()=>go(event.id),body);pairs(body,Object.entries(event.values).filter(([key])=>['时间','经过','结果'].includes(key)));}});
   const changes=showChanges&&layer==='session'?(data.trace??[]).filter(a=>a.row===row.id):[];if(changes.length)detailBlock(card,'变更记录（'+changes.length+'）',body=>{for(const change of [...changes].reverse()){const section=el('section');section.append(el('h4',(change.worldTime??'剧情时间未提供')+' · '+({create:'新增',update:'修改',delete:'删除'}[change.operation]??change.operation)));pairs(section,[['依据',change.evidence],['来源',change.sourceFloor==null?'明确导入或手动记录':'第 '+change.sourceFloor+' 楼'],...(change.fields??[]).map(f=>[f.path,(f.beforePresent?text(f.before):'未设置')+' → '+(f.afterPresent?text(f.after):'已移除')])]);body.append(section);}});
  }
  for(const row of candidates)record(row);
  function searchRows(){const words=(selected?'':query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);let count=0;for(const item of list.children){item.hidden=!words.every(w=>item.dataset.search.includes(w));if(!item.hidden)count++;}result.textContent='共 '+count+' 条'+(selected?' · 单项档案':'');}
  search.oninput=()=>{query=search.value;act(searchRows);};searchRows();
  if(!candidates.length)list.append(el('p','此类型暂无已保存记录。','atlas-note'));
  if(showSchemas&&!selected){const schemas=el('div',undefined,'atlas-types');root.append(schemas);detailBlock(schemas,'基础类型表与字段',body=>{for(const [key,name]of groups.filter(g=>!filter||g[0]===filter)){const kind=key.startsWith('type:')?'types':'tables',id=key.slice(key.indexOf(':')+1),item=registry[kind].find(x=>x.id===id),section=el('section');section.append(el('h3',name));const fields=kind==='types'?[...Object.entries(registry.tables.find(t=>t.id==='objects')?.fields??{}).filter(([key])=>key!=='属性'),...Object.entries(typeFields(registry,id)).map(([key,definition])=>['属性 · '+key,definition])]:Object.entries(item.fields);pairs(section,fields.map(([field,definition])=>[field,definition.type+(definition.required?' · 必填':'')+(definition.description?' · '+definition.description:'')]));if(onSchema)button('编辑 '+name+' 的类型与字段',()=>onSchema({kind,id,layer}),section);body.append(section);}});}
 }
 render();return {root,settled:()=>pending,state,dispose(){alive=false;root.remove();style.remove();}};
}

export const COMPACT_ATLAS_CSS=`.tisya-compact-atlas{min-width:0;width:100%;font:inherit;color:inherit}.tisya-compact-atlas *{box-sizing:border-box}.tisya-compact-atlas .atlas-toolbar{display:flex;align-items:center;gap:8px;margin:0 0 8px}.tisya-compact-atlas h2{font-size:18px;margin:0;flex:1}.tisya-compact-atlas .atlas-filters{display:flex;flex-wrap:wrap;gap:6px}.tisya-compact-atlas label{margin:0;flex:1 1 130px;min-width:0}.tisya-compact-atlas label>span{font-size:12px}.tisya-compact-atlas input,.tisya-compact-atlas select{width:100%;min-width:0}.tisya-compact-atlas .atlas-records{display:block;width:100%}.tisya-compact-atlas .atlas-record{border:0;border-top:1px solid #b5a16d50;padding:8px 0;margin:0;width:100%;min-width:0;background:transparent}.tisya-compact-atlas .atlas-record>header{position:static;display:flex;align-items:baseline;justify-content:space-between;gap:8px;border:0;background:none;padding:0;margin:0 0 6px}.tisya-compact-atlas h3{font-size:15px;margin:0;overflow-wrap:anywhere}.tisya-compact-atlas h4{font-size:13px;margin:8px 0}.tisya-compact-atlas dl{display:grid;grid-template-columns:minmax(70px,22%) minmax(0,1fr);gap:2px 8px;margin:4px 0}.tisya-compact-atlas dt{color:#acb6a9;font-size:12px;overflow-wrap:anywhere}.tisya-compact-atlas dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.5}.tisya-compact-atlas details{border:0;border-top:1px solid #b5a16d22;border-radius:0;background:none;padding:5px 0;margin:4px 0}.tisya-compact-atlas summary{font-size:12px;min-height:30px;display:list-item;cursor:pointer}.tisya-compact-atlas .atlas-expanded{padding:3px 0}.tisya-compact-atlas .atlas-links{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:3px 0}.tisya-compact-atlas .atlas-links button{min-height:34px;padding:3px 7px}.tisya-compact-atlas .atlas-note,.tisya-compact-atlas .atlas-result{font-size:12px;margin:7px 0;color:#acb6a9}.tisya-compact-atlas [hidden]{display:none!important}.tisya-compact-atlas .atlas-types>details{margin-top:12px}@media(max-width:400px){.tisya-compact-atlas dl{grid-template-columns:minmax(64px,25%) minmax(0,1fr);gap:2px 6px}.tisya-compact-atlas .atlas-filters label{flex-basis:110px}.tisya-compact-atlas .atlas-record>header{flex-wrap:wrap}}`;
