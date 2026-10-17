import {FOUNDATION_DEFINITIONS} from './foundation-definitions.js';
import {check,copy,defaultRegistry,typeFields} from './schema.js';
import {reconcileProposal} from './reconcile.js';

// A read-only compiler. It never initializes storage, guesses values or writes rows.
export const foundationCatalog=()=>copy(FOUNDATION_DEFINITIONS);
// Stable default rows precede optional additions; groups and storage paths stay unchanged.
export const orderedFields=fields=>fields.sort((a,b)=>(a.definition.displayOrder??0)-(b.definition.displayOrder??0));
export function foundationDefinition(registry,kind,table,path){
 let fields=registry.tables.find(t=>t.id===table)?.fields,def;
 check(fields&&Array.isArray(path)&&path.length,'模板字段路径无效');
 for(let i=0;i<path.length;i++){
  const key=path[i];
  if(table==='objects'&&i===0&&key==='属性'){
   def={type:'object',fields:typeFields(registry,kind)};
  }else def=fields?.[key];
  check(def,'模板引用了未登记字段：'+table+'.'+path.slice(0,i+1).join('.'));
  fields=def.fields;
 }
 return copy(def);
}
function leaves(def,path,out){
 if(def.type==='object'&&def.fields){for(const [key,child] of Object.entries(def.fields))leaves(child,[...path,key],out);}
 else out.push({path,definition:copy(def)});
}
export function foundationTemplatePlan(kind,{registry=defaultRegistry()}={}){
 const catalog=foundationCatalog(),views=catalog.originViews[kind];
 check(views,'未登记的基础模板类别：'+kind);
 const factKeys=new Set(views.filter(v=>v.table==='facts').flatMap(v=>v.paths.map(p=>p[0])));
 const schemaChanges=catalog.schemaChanges.flatMap(change=>{
  if(change.kind==='type')return change.id===kind?[change]:[];
  const fields=Object.fromEntries(Object.entries(change.fields).filter(([key])=>factKeys.has(key)));
  return Object.keys(fields).length?[{...change,fields}]:[];
 });
 const prepared=reconcileProposal(registry,{changes:[],schemaChanges},{inferSchemaFields:false});
 const groups=views.map(view=>({...copy(view),fields:view.paths.map(path=>({path,definition:foundationDefinition(prepared.registry,kind,view.table,path)}))}));
 const fieldIndex=orderedFields(groups.flatMap(g=>g.fields.flatMap(({path,definition})=>{
  const out=[];leaves(definition,path,out);
  return out.map(x=>({...x,group:g.id,groupLabel:g.label,table:g.table,layer:'原点',
   inheritance:g.id==='secrets'?'事实单独存档；人物认知另有接触依据':g.id==='relationships'?'保留前史关系；新U当前关系须重新核对':'引用已确认原点版本；不覆盖当前会话增量'}));
 })));
 return {format:'tisya.foundation-template-plan/1',kind,status:catalog.status,registry:prepared.registry,
  schemaChanges,extensions:prepared.extensions,groups,fieldIndex,
  expressionTemplate:{format:'tisya.foundation-expression-template/1',kind,status:'未填写',
   slots:fieldIndex.filter(f=>f.definition.type==='text').map(f=>({group:f.group,table:f.table,path:copy(f.path),
    instruction:f.definition.description??'按明确来源表达；未提供不补默认；不扩大角色知情',
    sourceRequired:true,scope:'仅改明确选中的字段；保存依据和具体表达的对应关系'})),
   rules:['保留核心意义与代价，世界化措辞不得替换因果','表达须落在实际字段，不能只写适配完成','引用、数字、枚举、列表仍按字段类型填值，不塞进叙事文本','表达模板是待填写候选，不是事实或人物知识']},
  draft:{format:'tisya.foundation-authoring-draft/1',kind,values:{},groups:groups.map(g=>({id:g.id,status:'未讨论'})),confirmed:false},
  writes:0};
}
export function foundationSessionTemplates(registry=defaultRegistry()){
 return foundationCatalog().sessionViews.map(v=>{
  const table=registry.tables.find(t=>t.id===v.table);check(table,'会话表缺失：'+v.table);
  const out=[];for(const [key,def]of Object.entries(table.fields))leaves(def,[key],out);
  return {...v,fields:out,values:{},writes:0};
 });
}
