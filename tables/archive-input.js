import {check,copy,isObjectType,normalized,object,references,registryIndex} from './schema.js';
import {phraseMatch} from './conditions.js';

export const ARCHIVE_EXPANSION_LIMIT = 200;

function rowIndex(view){
 check(object(view)&&object(view.registry)&&Array.isArray(view.rows),'归档视图无效');
 const rows=new Map();
 for(const row of view.rows){
  check(object(row)&&typeof row.id==='string'&&row.id&&typeof row.table==='string'&&object(row.values)&&!rows.has(row.id),'归档视图记录无效或 ID 重复');
  rows.set(row.id,row);
 }
 return rows;
}

function expansionIds(rows,ids){
 check(Array.isArray(ids)&&ids.length<=ARCHIVE_EXPANSION_LIMIT,'归档补读须为至多 '+ARCHIVE_EXPANSION_LIMIT+' 个 ID 的数组');
 for(const id of ids){
  check(typeof id==='string'&&id.trim()===id&&id,'归档补读 ID 无效');
  // The supplied view is the authorization boundary. An identity-only row in
  // that view cannot become readable through a reference or a model request.
  check(rows.has(id)&&rows.get(id).referenceOnly!==true,'归档补读记录不存在或不在完整可读取视图：'+id);
 }
 return [...new Set(ids)];
}

/** Validate exact IDs against the original full view and return the accumulated
 * expansion IDs. The budget applies to the whole archive attempt, not each call.
 */
export function validateArchiveNeedsRows(view,needsRows,{expandedIds=[]}={}){
 const rows=rowIndex(view),previous=expansionIds(rows,expandedIds),requested=expansionIds(rows,needsRows),result=[...new Set([...previous,...requested])];
 check(result.length<=ARCHIVE_EXPANSION_LIMIT,'归档累计补读不能超过 '+ARCHIVE_EXPANSION_LIMIT+' 条');
 return result;
}

function identity(row){
 return {id:row.id,table:row.table,rev:row.rev,values:Object.fromEntries(['名称','类型','别名'].filter(key=>Object.hasOwn(row.values,key)).map(key=>[key,copy(row.values[key])])),referenceOnly:true};
}

/** Archive-only projection. It never changes storage, ACLs, or the narrative
 * assembly conditions. All rows retain their exact IDs, revisions and labels.
 * Call again with the original view and validated expandedIds to supply content.
 */
export function prepareArchiveInput(view,{sourceText='',userText='',actorIds=[],expandedIds=[]}={}){
 const byId=rowIndex(view),expanded=expansionIds(byId,expandedIds),full=new Set(expanded);
 check(typeof sourceText==='string'&&typeof userText==='string','归档来源须为文本');
 check(Array.isArray(actorIds)&&actorIds.every(id=>typeof id==='string'),'归档关注对象须为 ID 数组');
 for(const id of actorIds)if(byId.get(id)?.table==='objects')full.add(id);
 const sceneText=[];
 for(const row of view.rows){
  if(row.referenceOnly===true)continue;
  if(row.nativePersona===true)full.add(row.id);
  if(row.table==='objects')continue;
  full.add(row.id);
  // Only direct typed references select non-rule objects. Historical facts can
  // reference every rule in a card; that is not a reason to load their dossiers.
  // Do not walk object-to-object links or follow global rule/always conditions.
  for(const id of references(row,view.registry)){
   const target=byId.get(id);if(target?.table==='objects'&&!isObjectType(view.registry,target,'rule'))full.add(id);
  }
  if(row.table==='scene')for(const key of ['场景','地点'])if(typeof row.values[key]==='string')sceneText.push(row.values[key]);
 }
 for(const row of view.rows)if(row.table==='objects'&&row.referenceOnly!==true){
  const texts=[sourceText,userText,...(isObjectType(view.registry,row,'rule')?[]:sceneText)];
  const labels=[row.id,row.values.名称,...(row.values.别名??[])];
  if(labels.some(label=>typeof label==='string'&&texts.some(text=>phraseMatch(text,label))))full.add(row.id);
 }
 const currentRows=view.rows.map(row=>full.has(row.id)&&row.referenceOnly!==true?copy(row):identity(row));
 return {registry:copy(view.registry),currentRows,omittedIds:currentRows.filter(row=>row.referenceOnly===true).map(row=>row.id),fullIds:currentRows.filter(row=>row.referenceOnly!==true).map(row=>row.id),expandedIds:expanded};
}

function proposedLabels(values,fields){
 const labels=[];
 for(const [key,value]of Object.entries(values)){
  const name=Object.keys(fields).find(field=>[field,...(fields[field].aliases??[])].some(label=>normalized(label)===normalized(key)));
  if(name==='名称'&&typeof value==='string')labels.push(value);
  if(name==='别名'&&Array.isArray(value))labels.push(...value.filter(label=>typeof label==='string'));
 }
 return labels;
}

/** Return identity-only targets that must be read before this proposal can be
 * validated or committed. This does not resolve a display name into a write ID,
 * alter the proposal, or require full dossiers merely for reference fields.
 */
export function archiveProposalNeedsRows(input,proposal){
 check(object(input)&&object(input.registry)&&Array.isArray(input.currentRows),'归档输入无效');
 check(object(proposal)&&Array.isArray(proposal.changes),'归档提案缺少 changes');
 const rows=new Map(input.currentRows.map(row=>[row.id,row])),index=registryIndex(input.registry),needed=new Set(),labels=new Map();
 for(const row of input.currentRows)if(row.table==='objects'&&row.referenceOnly===true)for(const label of [row.values.名称,...(row.values.别名??[])]){
  if(typeof label!=='string'||!label.trim())continue;
  const key=normalized(label);if(!labels.has(key))labels.set(key,new Set());labels.get(key).add(row.id);
 }
 for(const op of proposal.changes){
  check(object(op)&&typeof op.id==='string'&&op.id,'归档修改 ID 无效');
  // Check the target before resolving table aliases, so a misspelled table
  // cannot bypass the read-before-write requirement for an existing object.
  if(rows.get(op.id)?.referenceOnly===true)needed.add(op.id);
  if(!op.id.startsWith('new:'))continue;
  const table=typeof op.table==='string'?index.tables.get(normalized(op.table)):null;
  if(table?.id!=='objects'||!object(op.values))continue;
  // A proposed new name can collide with an existing identity. Read the
  // candidates first; canonical commit validation still owns any merge/refusal.
  for(const label of proposedLabels(op.values,table.fields))for(const id of labels.get(normalized(label))??[])needed.add(id);
 }
 return [...needed];
}
