import {frameworkFields,WORLD_FRAMEWORK_GROUPS} from '../engine/world-framework.mjs';
import {unitSeedOptions} from './foundation/unit-seeds.js';
export function worldFrameworkEditor({data,el,field,button,section,check,isDirty,changed,saved,reload,save,importSeeds,selection={}}){
 const enumLabels={FIXED:'等长月份',MONTH_TABLE:'逐月定义',SEASON_FIXED:'按季计日',astronomical:'含零年',historical_no_zero:'无零年',custom:'自定义',time:'时间',length:'长度',mass:'质量',volume:'体积',area:'面积',currency:'货币',count:'数量',ratio:'比例',score:'分值',temperature:'温度'};
 const top=section('世界总框架');top.append(el('p','公共定义在这里填写一次。人物、事件和条件引用原字段；当前时间、当前位置与余额各归自己的状态表。'));
 let selectedWorld=data.worldId??'';field(top,'所属世界',selectedWorld,{track:false,choices:[['','新建世界'],...data.worlds.map(([id,r])=>[id,r.values.name??'未命名世界'])],change:v=>selectedWorld=v});
 button(top,'载入世界',()=>{check(!isDirty(),'请先保存或放弃当前修改');return reload(selectedWorld,{newWorld:!selectedWorld});});
 const records=data.groups.flatMap(g=>g.records),table=selection.newWorld?'T_STATIC_WORLDS':selection.table??'T_STATIC_WORLDS';
 function displayName(row){
  if(!['M_UNITS','M_UNIT_RATIOS'].includes(row.table_id)||!records.some(other=>other!==row&&other.table_id===row.table_id&&other.name===row.name))return row.name;
  if(row.table_id==='M_UNITS')return row.name+'（'+(enumLabels[row.values.dimension]??row.values.dimension)+'）';
  const scope=data.state.tables.M_UNIT_RATIOS[row.record_id].values.scope_world_id;
  return row.name+(scope===data.worldId?'（本世界）':'（通用）');
 }
 const overview=section('公共定义');
 for(const g of data.groups){const row=el('div');row.append(el('strong',g.name+' · '+g.records.length+' 条'));overview.append(row);for(const r of g.records)button(row,displayName(r),()=>{check(!isDirty(),'请先保存或放弃当前修改');return reload(data.worldId,{table:r.table_id,id:r.record_id});});}
 let newTable=table;field(overview,'新增定义类型',newTable,{track:false,choices:WORLD_FRAMEWORK_GROUPS.flatMap(g=>g.tables.filter(t=>data.state.schema[t]).map(t=>[t,g.name+'／'+(t==='T_STATIC_ITEMS_SKILLS'?'币种':data.state.schema[t].label)])),change:v=>newTable=v});
 button(overview,'新增定义',()=>{check(!isDirty(),'请先保存或放弃当前修改');check(data.worldId||newTable==='T_STATIC_WORLDS','请先建立世界');return reload(data.worldId,{table:newTable,newRecord:true});});
 if(data.worldId&&importSeeds)mountUnitSeedEditor({overview,data,el,field,button,check,isDirty,reload,importSeeds});
 const id=selection.newWorld||selection.newRecord?null:selection.id??(table==='T_STATIC_WORLDS'?data.worldId:null),record=id?data.state.tables[table]?.[id]:null;
 if(!record&&table!=='T_STATIC_WORLDS'&&!selection.newRecord)return;
 const form=section((record?'编辑':'新建')+(table==='T_STATIC_ITEMS_SKILLS'?'币种':data.state.schema[table].label)),values={},specs=frameworkFields(data.state,table);
 const basic=new Set(['name','core_proposition','era_name','mode','year_numbering','epoch_year','months_per_year','days_per_month','seasons_per_year','days_per_season','narrative','label','dimension','calendar_ref','month','days','base_value','value_currency_ref','parent_place_ref','macro_region','from_place_ref','to_place_ref','travel_mode','from_unit','to_unit','conversion_mode','numerator','denominator']);
 const details=el('details');details.append(el('summary','更多细节（按需填写）'));
 for(const f of specs){
  const original=record?.values[f.key],value=original??'',opts={change:v=>{values[f.key]=v;}};
  if(f.type==='REF'){
   const options=records.filter(r=>r.table_id===f.ref).map(r=>[r.record_id,displayName(r)]);
   if(original&&!options.some(([v])=>v===original))options.push([original,'已有引用（原样保留）']);
   opts.choices=[['','未指定'],...options];opts.change=v=>values[f.key]=v||null;
  }else if(f.type==='ENUM'){opts.choices=[['','未指定'],...(f.enum??[]).map(v=>[String(v),enumLabels[v]??String(v)])];opts.change=v=>values[f.key]=v===''?null:(f.enum??[]).find(x=>String(x)===v);}
  else if(['NUMBER','INTEGER'].includes(f.type)){opts.type='text';opts.change=v=>{values[f.key]=v.trim()===''?null:Number(v);};}
  else if(f.type==='BOOLEAN'){opts.type='checkbox';}
  else if(f.type==='LONG_TEXT')opts.type='textarea';
  const target=basic.has(f.key)||f.required?form:details;field(target,f.label.replace(/n$/,'')+(f.required?' *':''),value,opts);
 }
 if(details.children.length>1)form.append(details);
 button(form,'保存公共定义',async()=>{check(Object.keys(values).length,'请先填写或修改字段');const result=await save({table,id,worldId:data.worldId,values,revision:data.revision,contextKey:data.contextKey});saved();await reload(result.worldId,{table,id:result.recordId});});
}

function mountUnitSeedEditor({overview,data,el,field,button,check,isDirty,reload,importSeeds}){
 const panel=el('details'),searchResults=el('div'),report=el('div');
 panel.append(el('summary','导入单位与换算种子'));
 const {unitCount,unitChoices,ratioChoices}=unitSeedOptions;
 panel.append(el('p','目录共 '+unitCount+' 条单位、'+ratioChoices.length+' 条换算。可直接选用 '+unitChoices.length+' 条单位，历法语义单位沿用各世界的历法。'));
 let unitId='',ratioId='',draft;
 const invalidate=()=>{draft=null;report.replaceChildren();confirm.hidden=true;};
 function matching(query){
  unitId='';ratioId='';invalidate();searchResults.replaceChildren();
  const needle=query.trim().toLowerCase(),matches=choices=>choices.filter(([,label])=>label.toLowerCase().includes(needle));
  field(searchResults,'选用单位','',{choices:[['','请选择'],...matches(unitChoices)],track:false,change:id=>{unitId=id;invalidate();}});
  field(searchResults,'选用换算','',{choices:[['','请选择'],...matches(ratioChoices)],track:false,change:id=>{ratioId=id;invalidate();}});
 }
 field(panel,'搜索单位或换算','',{track:false,change:matching});
 panel.append(searchResults,report);
 button(panel,'预览导入',async()=>{
  check(!isDirty(),'请先保存或放弃当前修改');
  const request={worldId:data.worldId,contextKey:data.contextKey,revision:data.revision,unitIds:unitId?[unitId]:[],ratioIds:ratioId?[ratioId]:[]};
  const {items}=await importSeeds(request);
  if((request.unitIds[0]??'')!==unitId||(request.ratioIds[0]??'')!==ratioId)return;
  draft=request;
  report.replaceChildren(...items.map(item=>el('p',item.kind+' · '+item.name+' · '+item.status)));
  confirm.hidden=!items.some(item=>item.status==='新增');
 });
 const confirm=button(panel,'确认导入到当前世界',async()=>{
  check(!isDirty()&&draft,'请先完成当前导入预览');
  await importSeeds({...draft,confirm:true});
  await reload(data.worldId,{});
 });
 matching('');
 overview.append(panel);
}
