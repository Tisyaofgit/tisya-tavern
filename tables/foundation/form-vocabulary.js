const dimensionLabels={
 time:'时间与年龄单位',length:'长度单位',mass:'质量单位',area:'面积单位',volume:'体积单位',
 count:'计数单位',ratio:'比例单位',score:'积分单位',temperature:'温度单位',currency:'货币单位',custom:'自定义单位'
};
const builtins={
 time:['小时','天','周','月','岁'],length:['厘米','米','千米'],mass:['克','千克'],
 area:['平方米'],volume:['升','毫升'],count:['件','个','次'],ratio:['百分比'],score:['点'],temperature:['摄氏度']
};

export function formVocabulary(){return {choices:new Map(),units:new Map(),registeredUnitGroups:new Map()};}

export function enumReference(vocabulary,label,options){
 const key=JSON.stringify([...new Set(options)].sort());
 if(!vocabulary.choices.has(key)){
  let name=label,number=2;
  const names=new Set([...vocabulary.choices.values()].map(entry=>entry.name));
  while(names.has(name))name=label+'〔'+number+++'〕';
  vocabulary.choices.set(key,{name,options});
 }
 return vocabulary.choices.get(key).name;
}

export function addRegisteredUnits(vocabulary,references,state,scope){
 const worlds=Object.keys(state.tables.T_STATIC_WORLDS??{});
 const active=scope.world_ref??(worlds.length===1?worlds[0]:'GLOBAL');
 for(const reference of references){
  if(reference.tableId!=='M_UNITS')continue;
  const unit=state.tables.M_UNITS[reference.recordId]?.values;
  if(!unit?.label||unit.scope_world_id&&!['GLOBAL',active].includes(unit.scope_world_id))continue;
  const dimension=unit.dimension==='custom'&&unit.custom_dimension?'量纲 '+unit.custom_dimension:unit.dimension||'custom';
  const group=vocabulary.registeredUnitGroups.get(dimension)??new Map();
  group.set(reference.recordId,reference);
  vocabulary.registeredUnitGroups.set(dimension,group);
 }
}

export function unitReference(vocabulary,dimension){
 const label=dimensionLabels[dimension]??'单位表';
 if(dimension&&Object.hasOwn(builtins,dimension))vocabulary.units.set(dimension,builtins[dimension]);
 return label;
}

export function formVocabularyText(vocabulary){
 const entry=(name,options)=>name+'{'+options.join('，')+'}';
 const allDimensions=new Set([...vocabulary.units.keys(),...vocabulary.registeredUnitGroups.keys()]);
 const names=new Map();
 for(const refs of vocabulary.registeredUnitGroups.values())for(const r of refs.values())names.set(r.name,(names.get(r.name)??0)+1);
 const units=[...allDimensions].map(dimension=>{
  const refs=[...(vocabulary.registeredUnitGroups.get(dimension)?.values()??[])];
  const labels=refs.map(r=>names.get(r.name)>1?r.display:r.name);
  const options=[...labels,...(vocabulary.units.get(dimension)??[]).filter(name=>!names.has(name))];
  return options.length?entry(dimensionLabels[dimension]??dimension,options):'';
 }).filter(Boolean);
 const enums=[...vocabulary.choices.values()].map(({name,options})=>entry(name,options));
 return [units.length&&['单位表',...units].join('\n'),enums.length&&['枚举表',...enums].join('\n')].filter(Boolean).join('\n\n');
}

export const formWriteSyntax='每行写“序号{值}”；花括号内只写实际值，不写字段名，也不照抄填写说明。';
