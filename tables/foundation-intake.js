// Author-only intake. Raw drafts are never rows, state values or narrative input.
import {sheetCatalog} from './foundation/catalog.js';
import {prepareExtraction,acceptExtraction,unwrapChatResponse} from './foundation/extraction.js';
import {visibleExtractionFields,extractionLabel} from './foundation/extraction-layout.js';
import {foundationTemplatePlan} from './foundation-templates.js';
import {check,copy,valueValid,mapRowReferences,isObjectType} from './schema.js';

export const FOUNDATION_INTAKE_VERSION='tisya.foundation-intake/1';
const catalog=()=>sheetCatalog();
const kinds={前史:'history',关系:'relationships',隐情:'secrets'};
const bound=raw=>check(typeof raw==='string'&&raw.length<=300000,'材料或回答须为不超过300000字符的文本');
export function createFoundationInput(view,{source,ownerName,model='填写接口模型名',referenceIds=[]}){
 bound(source);check(source.trim()&&typeof ownerName==='string'&&ownerName.trim(),'请填写材料与人物名称');
 check(!view.rows.some(r=>r.table==='objects'&&r.values.名称===ownerName),'已有同名人物或对象，请使用现有档案编辑入口');
 check(Array.isArray(referenceIds)&&new Set(referenceIds).size===referenceIds.length,'引用选择重复或无效');
 const bindings=referenceIds.map(id=>{
  const row=view.rows.find(r=>r.id===id&&r.table==='objects');check(row,'引用对象不存在');
  const kind=['character','item','place','organization','rule'].find(k=>isObjectType(view.registry,row,k));check(kind,'此引用对象类型尚未支持：'+row.values.名称);
  return {id:row.id,name:row.values.名称,kind,revision:row.rev};
 });
 const context=prepareExtraction(catalog(),valueValid,{source,ownerName,model,references:bindings.map(({name,kind})=>({name,kind})),layout:'compact-v2'});
 const names=new Map(bindings.map(b=>[b.name,b.id]));
 for(const record of context.before.records)if(record.id!==context.rootId){const binding=bindings.find(b=>b.id===names.get(record.values.名称));binding.draftId=record.id;}
 return {format:FOUNDATION_INTAKE_VERSION,context,bindings,catalog:JSON.stringify(catalog())};
}
export function assertFoundationInput(input,view){
 check(input?.format===FOUNDATION_INTAKE_VERSION&&input.catalog===JSON.stringify(catalog()),'提炼模板已改变，请保留原稿并重新建立任务');
 for(const ref of input.bindings){const row=view.rows.find(r=>r.id===ref.id);check(row&&row.table==='objects'&&row.rev===ref.revision&&row.values.名称===ref.name&&isObjectType(view.registry,row,ref.kind),'提炼引用对象已改变：'+ref.name);}
 check(!view.rows.some(r=>r.table==='objects'&&r.values.名称===input.context.ownerName),'同名对象已经存在，未重复建档');
}
export function inspectFoundationInput(input,raw){
 bound(raw);const result={status:'needs-repair',cells:[],issues:[],parsed:null,canonicalWrites:0,semantic:'pending-author-review',runtime:'conditions-not-bound'};
 let text;try{text=unwrapChatResponse(raw).text;}catch(e){result.issues.push({code:'response',message:e.message});return result;}
 const cats=catalog(),allowed=new Set(input.context.before.records.map(r=>r.values.名称??r.title));let heading='',template=null;
 for(const [i,line]of text.split(/\r?\n/).entries()){
  if(!line.trim())continue;const head=line.trim().match(/^【([^】]+)】$/);
  if(head){heading=head[1];const child=heading.match(/^(前史|关系|隐情)／[1-9]\d*$/);template=cats.templates.find(t=>t.id===(heading.startsWith('人物／')?'origin.character':child?'origin.character.'+kinds[child[1]]:''));continue;}
  const number=line.trim().match(/^(\d+)\s+/),row=number?Number(number[1]):null;
  const field=template&&visibleExtractionFields(template.fields.map((f,j)=>({...f,row:j+1})),template.id,input.context.layout).find(f=>f.row===row);
  const label=field?extractionLabel(field,template.id,input.context.layout):'';
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=field&&line.trim().match(new RegExp('^'+row+'\\s+'+escaped+'(?:\\s*[：:]\\s*|\\s+)(.*)$'));
  const cell={heading,row,line:i+1,label:match?label:'',raw:match?.[1]??line,...(field?{key:field.key,type:field.definition.type}:{}),status:'unchecked'};
  result.cells.push(cell);
  if(!field||extractionLabel(field,template.id,input.context.layout)!==cell.label){result.issues.push({code:'field',heading,row,line:i+1,message:'分组、行号或字段名不匹配'});cell.status='invalid';continue;}
  cell.status='parsed';
  if(['ref','refs'].includes(field.definition.type)&&cell.raw.trim()&&!['无','[]'].includes(cell.raw.trim()))for(const name of (field.definition.type==='refs'?cell.raw.split(/[；;]/):[cell.raw]).map(s=>s.trim()))if(!allowed.has(name)){
   cell.status='unresolved';result.issues.push({code:'reference',heading,row,line:i+1,name,message:'待解析引用：'+name});
  }
 }
 try{result.parsed=acceptExtraction(cats,valueValid,input.context,raw);result.status='ready-for-review';}
 catch(e){result.issues.push({code:'contract',message:e.message});}
 return result;
}
export function foundationInputProposal(input,raw,view){
 assertFoundationInput(input,view);const diagnosis=inspectFoundationInput(input,raw);check(diagnosis.parsed&&!diagnosis.issues.length,'草稿仍有待修问题，未写入档案');
 const parsed=diagnosis.parsed,plan=foundationTemplatePlan('character',{registry:view.registry}),cat=catalog();
 const records=parsed.snapshot.records.filter(r=>r.id===input.context.rootId||r.parentId===input.context.rootId);
 const ids=new Map(input.bindings.map(r=>[r.draftId,r.id]));for(const r of records)ids.set(r.id,'new:foundation-'+r.id);
 const evidence='作者核对人物提炼：'+input.context.ownerName;
 const changes=records.map(r=>{
  const template=cat.templates.find(t=>t.id===r.template),values=copy(r.values);
  if(template.table==='objects')values.类型=template.kind;
  mapRowReferences({table:template.table,values},plan.registry,id=>{check(ids.has(id),'草稿引用映射缺失');return ids.get(id);});
  const secret=r.template==='origin.character.secrets';
  return {id:ids.get(r.id),table:template.table,expected:0,values,access:{readers:secret?[]:['读者'],knowers:[]},evidence};
 });
 return {proposal:{changes,schemaChanges:plan.schemaChanges},evidence,counts:parsed.counts,rows:diagnosis.cells.length,semantic:'author-review-required',runtime:'conditions-not-bound'};
}
