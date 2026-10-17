import {formSections,formTextFields,serializeFormSection} from './foundation/form-text.js';
import {check,copy,normalized,registryIndex} from './schema.js';

const kinds={character:'人物',item:'物品',place:'地点',rule:'规则',organization:'组织'};
const safe=x=>String(x??'');
export function adaptationBundle(core){
 if(core.format==='tisya.core-bundle/1')return copy(core);
 check(Array.isArray(core.traits)&&Array.isArray(core.growth),'基点内容不完整');
 return {format:'tisya.core-bundle/1',id:core.id,version:core.version,name:core.name,members:[{sourceObject:core.sourceObject??core.id,kind:core.kind??'character',name:core.name,traits:core.traits.map((x,i)=>({...copy(x),id:x.id??'trait-'+i})),growth:core.growth.map((x,i)=>({...copy(x),id:x.id??'growth-'+i}))}],links:[]};
}
export function prepareSimpleAdaptation(core,{book,single=false}={}){
 const bundle=adaptationBundle(core);
 check(!single||bundle.members.length===1,'单体适配不能混入多个基点成员');
 const material=['基点名称：'+bundle.name];
 for(const [i,member]of bundle.members.entries()){
  material.push('【待适配成员 '+(i+1)+' · '+safe(member.name)+' · '+(kinds[member.kind]??'对象')+'】');
  for(const [j,item]of [...member.traits,...member.growth].entries())material.push('第 '+(j+1)+' 项'+(j<member.traits.length?'核心':'已选成长')+'：'+safe(item.name)+'\n意义：'+safe(item.value)+'\n原有依据：'+safe(item.evidence));
 }
 for(const [i,link]of bundle.links.entries())material.push('【待适配关联 '+(i+1)+'】\n成员：'+link.members.map(id=>bundle.members.findIndex(x=>x.sourceObject===id)+1).join('、')+'\n名称：'+link.name+'\n意义：'+link.value+'\n原有依据：'+link.evidence);
 const instructions=['将这些基点设计为当前世界的新档案，保留每一项具体意义、限制、代价及已选成长；只创建新原点，开局持有、关系和人物知情另行确认。旧世界的名字、已完成任务、现实关系与知识不直接继承。',
  '照常填写目标档案和设计说明，然后在【完成】之前补下面的对应表。档案填本次新建的“类别／名称”；原句从该档案的描述或详细字段逐字抄取，不用字段路径。每项意义都要有具体世界表现。',
  ...bundle.members.flatMap((member,i)=>['【成员对应：'+(i+1)+'】\n1 档案：____',...[...member.traits,...member.growth].map((item,j)=>'【核心表现：'+(i+1)+'：'+(j+1)+'】\n1 原句：____（'+item.name+'）')]),
  ...bundle.links.map((link,i)=>'【关联表现：'+(i+1)+'：1】\n1 档案：____\n2 原句：____（'+link.name+'；须是这项关联成员的档案。需要多个表现时，最后序号依次为2、3。）'),
  '以上文字若含换行或需保留首尾空白，用双引号字符串及转义填写；只交表格。'].join('\n\n');
 return {bundle,book,single,material:material.join('\n\n'),instructions};
}
export function splitSimpleAdaptation(raw){
 const keep=[],entries=[];
 for(const section of formSections(raw)){
  const m=section.heading.match(/^(成员对应|核心表现|关联表现)：([1-9]\d*)(?:：([1-9]\d*))?$/);
  if(m)entries.push({kind:m[1],member:Number(m[2]),item:m[3]?Number(m[3]):null,lines:section.lines});
  else keep.push(serializeFormSection(section));
 }
 return {text:keep.join('\n'),entries};
}
function findExpression(value,expression,path=[]){
 if(typeof value==='string')return value.includes(expression)?path:null;
 if(!value||typeof value!=='object')return null;
 for(const [key,item]of Object.entries(value)){
  if(['__proto__','constructor','prototype'].includes(key)||!path.length&&['名称','类型','核心引用'].includes(key))continue;
  const found=findExpression(item,expression,[...path,key]);if(found)return found;
 }
 return null;
}
export function applySimpleAdaptation(proposal,plan,entries){
 const objects=proposal.artifacts.base.changes.filter(x=>x.table==='objects'),index=registryIndex(proposal.artifacts.registry);
 const resolve=label=>{const matches=objects.filter(op=>{const type=index.types.get(normalized(op.values.类型));return normalized((type?.name??op.values.类型)+'／'+op.values.名称)===normalized(label);});check(matches.length===1,'基点对应档案不存在或重名：'+label);return matches[0];};
 const mapping={members:[],links:[]},mapped=new Map(),linkMap=new Map();
 for(const e of entries.filter(x=>x.kind==='成员对应')){
  const member=plan.bundle.members[e.member-1];check(member&&e.item===null&&e.lines.length===1,'成员对应序号或字段无效');const op=resolve(formTextFields(e,['档案']).档案);
  check(![...mapped.values()].includes(op),'一个新档案不能代替多个基点成员');mapped.set(e.member,op);
  op.values.核心引用=plan.book+' / '+plan.bundle.id+'@'+plan.bundle.version+(plan.single?'':'/'+member.sourceObject);
  mapping.members.push({member:member.sourceObject,object:op.id,items:[]});
 }
 for(const e of entries.filter(x=>x.kind==='核心表现')){
  const member=plan.bundle.members[e.member-1],item=member&&[...member.traits,...member.growth][e.item-1],op=mapped.get(e.member);check(item&&op&&e.lines.length===1,'核心表现须对应已填写的成员和项目');
  const expression=formTextFields(e,['原句']).原句,path=findExpression(op.values,expression);check(path,'核心表现原句未写入对应档案');mapping.members.find(x=>x.object===op.id).items.push({item:item.id,path,expression});
 }
 for(const e of entries.filter(x=>x.kind==='关联表现')){
  const link=plan.bundle.links[e.member-1];check(link&&e.item&&e.lines.length===2,'关联表现序号或字段无效');const values=formTextFields(e,['档案','原句']),op=resolve(values.档案),expression=values.原句,path=findExpression(op.values,expression);check(path,'关联表现原句未写入对应档案');
  if(!linkMap.has(link.id)){const row={link:link.id,targets:[]};linkMap.set(link.id,row);mapping.links.push(row);}linkMap.get(link.id).targets.push({object:op.id,path,expression});
 }
 proposal.coreMapping=mapping;return proposal;
}
