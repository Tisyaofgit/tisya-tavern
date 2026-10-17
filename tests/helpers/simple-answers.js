import {prepareSimpleGenesis} from '../../tables/simple-genesis.js';

const text=value=>{
 if(value===null)return 'null';
 if(value===true)return '是';
 if(value===false)return '否';
 if(Array.isArray(value))return value.length?value.join('；'):'无';
 if(typeof value==='object')return JSON.stringify(value);
 const out=String(value);return out.startsWith('"')||out.trim()!==out||/[\r\n；;|]/u.test(out)?JSON.stringify(out):out;
};

/** Build a model-facing simple genesis answer from business fields only. */
export function simpleGenesisAnswer(input,{name='测试草稿',decisions=[],records=[],pending=[]}={}){
 const {compactPlan}=prepareSimpleGenesis(input),parts=['【设计】','1 名称：'+name];
 decisions.forEach((content,index)=>parts.push('【设计说明：说明'+(index+1)+'】','1 内容：'+text(content)));
 for(const record of records){
  const schema=compactPlan.schema.find(item=>record.form?item.form===record.form:item.table===record.table&&(record.type===undefined||item.type===record.type));
  if(!schema)throw Error('测试夹具找不到表格：'+JSON.stringify(record));
  const values={来源依据:record.evidence,读者:record.readers??['读者'],知情者:record.knowers??[] ,...(record.fields??{})};
  const rows=[];for(const [label,value]of Object.entries(values)){if(value===undefined)continue;const field=schema.fields.find(item=>item.label===label);if(!field)throw Error(schema.form+'没有测试字段：'+label);rows.push([field.row,label,value]);}
  rows.sort((a,b)=>a[0]-b[0]);parts.push('【'+schema.form+'：'+record.name+'】',...rows.map(([row,label,value])=>row+' '+label+'：'+text(value)));
 }
 parts.push('【完成】','1 状态：完成','2 待处理：'+(pending.length?pending.join('；'):'无'),'3 补读记录：无');return parts.join('\n');
}

const flatten=(value,prefix='',out={})=>{for(const [key,item]of Object.entries(value??{})){const label=prefix?prefix+'·'+key:key;if(item&&typeof item==='object'&&!Array.isArray(item))flatten(item,label,out);else out[label]=item;}return out;};

/** Convert host-authored business row changes into the public genesis sheet. */
export function simpleGenesisChangesAnswer(input,changes,{name='测试原点',decisions=[]}={}){
 const records=changes.map(change=>{
  const prior=input.currentRows?.find(row=>row.id===change.id),values={...(prior?.values??{}),...(change.values??{})};
  if(prior?.values?.属性||change.values?.属性)values.属性={...(prior?.values?.属性??{}),...(change.values?.属性??{})};
  const plan=prepareSimpleGenesis(input).compactPlan,schema=plan.schema.find(item=>item.table===change.table&&(change.table!=='objects'||item.type===values.类型));
  if(!schema)throw Error('测试夹具找不到业务表：'+change.table+'／'+values.类型);
  const fields=flatten(change.values);delete fields.名称;delete fields.类型;
  return {form:schema.form,name:values.名称,evidence:change.evidence,readers:change.access?.readers??prior?.access?.readers??['读者'],knowers:change.access?.knowers??prior?.access?.knowers??[],fields};
 });
 return simpleGenesisAnswer(input,{name,decisions,records});
}

const itemRows=item=>['1 项名：'+item.name,'2 内容：'+text(item.value),'3 依据：'+text(item.evidence)];

export function simpleCoreAnswer({name,traits,growth=[]}){
 const parts=['【基点】','1 名称：'+name];
 traits.forEach((item,index)=>parts.push('【核心／'+(index+1)+'】',...itemRows(item)));
 growth.forEach((item,index)=>parts.push('【成长／'+(index+1)+'】',...itemRows(item)));
 parts.push('【完成】','1 待处理：无');return parts.join('\n');
}

export function simpleCoreBundleAnswer({name,members,links=[]}){
 const parts=['【基点】','1 名称：'+name];
 members.forEach((member,memberIndex)=>{
  const m=memberIndex+1;parts.push('【成员／'+m+'】','1 名称：'+member.name);
  member.traits.forEach((item,index)=>parts.push('【核心／'+m+'／'+(index+1)+'】',...itemRows(item)));
  (member.growth??[]).forEach((item,index)=>parts.push('【成长／'+m+'／'+(index+1)+'】',...itemRows(item)));
 });
 links.forEach((item,index)=>parts.push('【关联／'+(index+1)+'】',...itemRows(item)));
 parts.push('【完成】','1 待处理：无');return parts.join('\n');
}

/** Add the host-private core correspondence sheet to a business genesis form. */
export function simpleAdaptationAnswer(answer,{members=[],items=[],links=[]}){
 const marker='【完成】',at=answer.lastIndexOf(marker);if(at<0)throw Error('创世测试夹具缺少完成组');
 const rows=[];
 members.forEach((archive,index)=>rows.push('【成员对应：'+(index+1)+'】','1 档案：'+archive));
 items.forEach(({member,item=1,expression})=>rows.push('【核心表现：'+member+'：'+item+'】','1 原句：'+expression));
 links.forEach(({link,target=1,archive,expression})=>rows.push('【关联表现：'+link+'：'+target+'】','1 档案：'+archive,'2 原句：'+expression));
 return answer.slice(0,at)+rows.join('\n')+'\n'+answer.slice(at);
}

/** Test-only response fixture writer. Production never accepts operation JSON. */
export async function simpleTaskAnswer(task,input,response){
 const {ARCHIVE_TABLE_TASKS}=await import('../../tables/task-kinds.js');
 if(!ARCHIVE_TABLE_TASKS.includes(task)||typeof response==='string')return response;
 const {prepareCompactFill}=await import('../../tables/compact-fill.js');
 const {mapRowReferences}=await import('../../tables/schema.js');
 const plan=prepareCompactFill(task,input),changes=task==='templateInit'?[...(response.base?.changes??[]),...(response.initial?.changes??[])]:response.changes??[];
 const rows=[...plan.rows,...changes.filter(op=>!(input.currentRows??input.rows??[]).some(row=>row.id===op.id)).map(op=>({id:op.id,table:op.table,values:op.values}))];
 const label=id=>{if(['读者','记录整理','叙事组织'].includes(id))return id;const row=rows.find(row=>row.id===id);if(!row)return '未登记／'+id;const schema=plan.schema.find(s=>s.table===row.table&&(row.table!=='objects'||s.type===row.values.类型));return (schema?.form??(row.table==='objects'?plan.registry.types.find(t=>t.id===row.values.类型)?.name:plan.registry.tables.find(t=>t.id===row.table)?.name)??row.table)+'／'+row.values.名称;};
 const parts=[];
 for(const change of changes){
  const prior=rows.find(row=>row.id===change.id),values={...(prior?.values??{}),...change.values},schema=plan.schema.find(s=>s.table===change.table&&(change.table!=='objects'||s.type===values.类型));
  if(!schema)throw Error('夹具没有对应业务表：'+change.table);
  const patch=structuredClone({...change.values,...(change.table==='objects'?{类型:values.类型}:{})});mapRowReferences({table:change.table,values:patch},plan.registry,label);
  const fields=flatten(patch);delete fields.名称;delete fields.类型;
  const valuesByLabel={来源依据:change.evidence,读者:(change.access?.readers??prior?.access?.readers??[]).map(label),知情者:(change.access?.knowers??prior?.access?.knowers??[]).map(label),...fields,...(change.delete?{处理方式:'撤销'}:change.id?.startsWith('new:')&&!plan.rows.some(row=>row.id===change.id)?{处理方式:'新建'}:{}),...(change.unset?{清空字段:change.unset}:{})};
  parts.push('【'+schema.form+'：'+values.名称+'】');
  for(const [field,value]of Object.entries(valuesByLabel)){
   const cell=schema.fields.find(f=>f.label===field);if(!cell){parts.push('999 '+field+'：'+text(value));continue;}
   parts.push(cell.row+' '+field+'：'+(['json','array','map','object'].includes(cell.definition.type)?JSON.stringify(value):text(value)));
  }
 }
 const pending=task==='templateInit'?[...(response.base?.pending??[]),...(response.initial?.pending??[])]:response.pending??[];
 if(!Array.isArray(pending))return '不合法的待处理填写';
 parts.push('【完成】','1 状态：完成','2 待处理：'+(pending.length?pending.map(x=>typeof x==='string'?x:x.reason??x.error??JSON.stringify(x)).join('；'):'无'),'3 补读记录：'+(response.needsRows?.length?response.needsRows.map(label).join('；'):'无'));
 return parts.join('\n');
}
