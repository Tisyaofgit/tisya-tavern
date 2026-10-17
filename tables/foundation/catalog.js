import {foundationCatalog,foundationTemplatePlan,foundationSessionTemplates} from '../foundation-templates.js';
export function sheetCatalog(){
 const c=foundationCatalog(),templates=[];
 const fields=fs=>fs.filter(f=>!f.definition.formula).map(f=>({key:f.path.filter(p=>p!=='属性').join('·'),label:f.path.at(-1),path:f.path,group:f.groupLabel??'字段',definition:f.definition}));
 templates.push({id:'core',layer:'基点',label:'基点',table:'core-draft',groups:['核心'],fields:c.coreSlots.map(s=>({key:s.label,label:s.label,path:[s.id],group:'核心',definition:{type:'text',description:s.prompt}}))});
 for(const kind of Object.keys(c.originViews)){
  const p=foundationTemplatePlan(kind),objectFields=p.fieldIndex.filter(f=>f.table==='objects'),factFields=p.fieldIndex.filter(f=>f.table==='facts');
  if(objectFields.length)templates.push({id:'origin.'+kind,layer:'原点',label:{character:'人物',item:'物品',place:'地点',organization:'组织',rule:'规则'}[kind],table:'objects',kind,groups:[...new Set(objectFields.map(f=>f.groupLabel))],fields:fields(objectFields)});
  for(const group of [...new Set(factFields.map(f=>f.group))]){const fs=factFields.filter(f=>f.group===group);templates.push({id:'origin.'+kind+'.'+group,layer:'原点',label:{history:'人物前史',relationships:'关系底稿',secrets:'隐情'}[group]??'世界定义',table:'facts',kind,groups:[fs[0].groupLabel],fields:fields(fs)});}
 }
 for(const s of foundationSessionTemplates())templates.push({id:'session.'+s.table,layer:'会话',label:s.label,table:s.table,groups:['字段'],fields:fields(s.fields)});
 for(const t of templates)if(new Set(t.fields.map(f=>f.key)).size!==t.fields.length)throw Error('字段名重复：'+t.id);
 return {version:'FT35-W55-fields/1',templates};
}
