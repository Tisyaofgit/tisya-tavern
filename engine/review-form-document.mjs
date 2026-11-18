import {paragraphEvidence,stripParagraphEvidence} from './paragraph-evidence.mjs';
import {recordIdentityLabel,identityFieldHidden} from './record-identity.mjs';
import {dialogueFieldHint,unattributedDialogue} from '../tables/foundation/narrative-contract.js';
import {prepareMatrixSheets,acceptMatrixSheets,matrixInputField,sheetLine,existingRecordCandidates,reusesNamedRow,sheetSections} from '../tables/foundation/engine.js';
import {Runtime} from './runtime.mjs';

// A view of the existing protocol. Edits replace only the original value span;
// the normal review service still parses, validates and commits the whole turn.
export function describeReviewForms(state,blocks){
 const context=prepareMatrixSheets({state},{operationId:'review-editor',mode:'revise',task:'main',scope:{...state.runtime.scope,audience:'author'}});
 return Object.fromEntries(['cells','archive'].map(channel=>[channel,describeReviewDocument(state,context,String(blocks[channel]??''))]));
}
function describeReviewDocument(state,context,text){
 const groups=[],runtime=new Runtime(state);let group=null,offset=0,compiled;
 try{compiled=acceptMatrixSheets(context,{state},{blocks:{cells:text}});}catch{} // Invalid drafts remain editable; saving still uses the full validator.
 const changes=compiled?.proposal.matrix.changes??[];
 const form=/^\s*【/m.test(text),sections=form?sheetSections(text,{tolerant:true}):[];
 for(const part of text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)??[]){
  if(!part)continue;
  const line=part.replace(/[\r\n]+$/,''),trimmed=line.trim(),heading=/^【([^】]+)】$/.exec(trimmed);
  if(!trimmed){offset+=part.length;continue;}
  if(heading){
   const refs=existingRecordCandidates(context,heading[1]);let ref=refs.length===1?refs[0]:null;
   const binding=compiled?.bindings.find(r=>r.heading===heading[1]);if(binding)ref={...binding,name:context.references.find(r=>r.tableId===binding.tableId&&r.recordId===binding.recordId)?.name};
   const tableLabel=/^(.+)／[1-9]\d*$/.exec(heading[1])?.[1],template=context.catalog.templates.find(t=>ref?t.id===ref.tableId:t.label===tableLabel);
   if(!ref&&template&&reusesNamedRow(context,template.id)){
    const line=sections.find(s=>s.heading===heading[1])?.lines.find(line=>{try{return ['name','instance_name'].includes(matrixInputField(template,line).key);}catch{return false;}});
    if(line){const field=matrixInputField(template,line),parsed=sheetLine(line),name=stripParagraphEvidence(parsed.compact?parsed.body:parsed.body.slice(field.label.length).replace(/^[\s：:]+/,'')).trim(),matches=context.references.filter(r=>r.tableId===template.id&&r.name===name);if(matches.length===1)ref=matches[0];}
   }
   if(ref&&!ref.name){const value=changes.find(c=>c.tableId===ref.tableId&&c.recordId===ref.recordId)?.values??{};ref.name=value.short_code??value.name??value.title??heading[1];}
   group={title:ref?template?.label+' · '+ref.name:heading[1],tableId:template?.id,recordId:ref?.recordId,template,rows:[]};groups.push(group);offset+=part.length;continue;
  }
  if(!group||!form){if(!group||group.form){group={title:'本轮状态变化',rows:[]};groups.push(group);}}
  const row={raw:line,start:offset,end:offset+line.length};
  try{
   let spec,record,valueStart,bracedEnd;
   if(form){
    if(!group.template)throw Error('此分组没有唯一对应的表单，请在原始内容中检查标题。');
    const field=matrixInputField(group.template,trimmed);spec=state.schema[group.tableId].fields.find(f=>f.key===field.key);record=state.tables[group.tableId]?.[group.recordId];
    const parsed=sheetLine(trimmed),prefix=parsed.valueStart!==undefined?trimmed.slice(0,parsed.valueStart):parsed.compact?(/^\d+\s*[：:]\s*/.exec(trimmed)[0]):trimmed.slice(0,trimmed.length-parsed.body.length)+field.label;
    valueStart=line.indexOf(trimmed)+prefix.length;while(parsed.valueStart===undefined&&/[\s：:]/.test(line[valueStart]??'')&&valueStart<line.length)valueStart++;
    if(parsed.valueEnd!==undefined)bracedEnd=line.indexOf(trimmed)+parsed.valueEnd;
    row.tableId=group.tableId;row.recordId=group.recordId;
   }else{
    const separator=line.search(/[：:]/);if(separator<0||trimmed.startsWith('@'))throw Error('此行是旧版指令，保留在原始内容中查看；不会自动改写。');
    const address=line.slice(0,separator).trim(),[tableId,recordId,key,path]=runtime.resolve(address);if(path.length)throw Error('此行修改嵌套内容，保留原始指令。');
    spec=runtime.spec(tableId,key);record=runtime.record(tableId,recordId);row.tableId=tableId;row.recordId=recordId;row.recordName=record.values.name??record.values.title??'已有记录';
    valueStart=separator+1;while(/\s/.test(line[valueStart]??'')&&valueStart<line.length)valueStart++;
   }
   const evidence=paragraphEvidence(line),valueEnd=bracedEnd??(evidence?evidence.index:line.length);
   Object.assign(row,{key:spec.key,label:spec.label??spec.key,type:spec.type,options:spec.enum??spec.options,minimum:spec.minimum,maximum:spec.maximum,previous:record?.values[spec.key],previousState:record?.states[spec.key]??'unset',value:line.slice(valueStart,valueEnd),valueStart:offset+valueStart,valueEnd:offset+valueEnd,evidence:evidence?.[1]??'',delta:!form});
   const canonicalName=changes.find(c=>c.tableId===row.tableId&&c.recordId===row.recordId)?.values?.name;if(spec.key==='name'&&canonicalName&&canonicalName!==row.value)row.help='已识别为已有对象“'+canonicalName+'”，本轮更新原记录并沿用正式名称。';
   row.hidden=identityFieldHidden(row.tableId,spec.key);if(row.tableId==='T_DYN_EVENTS'&&spec.key==='short_code')row.label='事件编号';
   if(spec.ref&&row.previous!=null){const display=id=>{const r=state.tables[spec.ref]?.[id]?.values;if(!r)return '关联记录待核对';if(spec.ref==='M_QUANTITIES'){const u=state.tables.M_UNITS?.[r.unit_ref]?.values;return r.quantity_mode==='exact'?String(r.value)+' '+(u?.label??'单位待核对'):r.narrative??'尚未填写';}return recordIdentityLabel(state,spec.ref,id)??r.original_text??r.narrative??'已有关联明细';};row.previousDisplay=(Array.isArray(row.previous)?row.previous:[row.previous]).map(display).join('；');}
   if(['T_STATIC_PLACES','T_STATIC_ORGANIZATIONS','T_STATIC_ITEMS_SKILLS','T_CHAR_DOSSIER','T_SYS_ENTITIES'].includes(spec.ref))row.help='填写名称即可：已有档案自动引用，首次出现自动建立最小档案；其余资料按后续信息补充。';
   if(spec.key==='exact_dialogues')row.help=dialogueFieldHint+(unattributedDialogue(row.value)?'。此记录有台词未标说话人，请对照原文补齐；不自动猜测。':'');
   if(spec.ref==='M_WORLD_TIME')row.help='可直接填写时间原文，如当晚、次日清晨；也兼容“原文：当晚”。仅保存原文，不推算历法或到期时间。已有精确时间请引用原记录，未知填“?”。';
   if(spec.ref==='M_QUANTITIES')row.help='可填 18岁、2小时、3米，或数值：3；单位：米。常见单位自动登记；自定义单位可在本轮单位定义中补充，不自动推算换算率。';
   if(!form){runtime.micro(line);row.proposed=runtime.get([row.tableId,row.recordId,row.key,[]]);}
  }catch(error){row.error=error.message;}
  group.rows.push(row);offset+=part.length;
 }
 for(const group of groups)delete group.template;
 return {text,groups};
}
export function editReviewDocument(document,changes){
 const edits=document.groups.flatMap(g=>g.rows).filter(r=>Object.hasOwn(changes,r.start));let text=document.text;
 for(const row of edits.sort((a,b)=>b.valueStart-a.valueStart)){
  if(row.error||!Number.isInteger(row.valueStart))throw Error('此行不能通过字段编辑器改写。');
  const value=String(changes[row.start]);if(/[\r\n]/.test(value))throw Error('字段内容请保持一行；分段使用原表单约定。');
  text=text.slice(0,row.valueStart)+value+text.slice(row.valueEnd);
 }
 return text;
}
