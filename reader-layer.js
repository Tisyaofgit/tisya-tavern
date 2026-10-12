// Reply-local reader presentation. Story knowledge/ACLs are not reader settings.
// Consume only a validated display envelope; never feed this projection to a
// model, state writer, or recall service. No source fields are changed.
const clone=x=>structuredClone(x);
const unique=rows=>[...new Map(rows.map(row=>[JSON.stringify(row),row])).values()];
function values(row){return {
 hasOldValue:Object.hasOwn(row,'旧值'),...(Object.hasOwn(row,'旧值')?{oldValue:clone(row.旧值)}:{}),
 hasNewValue:Object.hasOwn(row,'新值'),...(Object.hasOwn(row,'新值')?{newValue:clone(row.新值)}:{}),deleted:row.删除===true
};}
export function projectReaderLayer(memory,status,{showPsychology=false,playerName=null}={}){
 const characters=new Map(),memories=[],changes=[];
 const character=name=>{if(!characters.has(name))characters.set(name,{name,cognition:[],psychology:[]});return characters.get(name);};
 for(const event of memory.事件){
  const scene={title:event.标题,time:{start:event.时间.起,end:event.时间.止},places:clone(event.地点),world:event.世界};
  const participants=clone(event.参与者);
  participants.forEach(character);
  for(const row of event.认知)character(row.主体).cognition.push({kind:row.类别,certainty:row.确信,content:row.内容,source:row.来源});
  if(showPsychology===true)for(const row of event.角色心理)character(row.主体).psychology.push({content:row.内容,evidence:row.依据});
  for(const row of event.设定变动)changes.push({kind:'setting',object:row.对象,field:row.字段,...values(row),...(event.设定原因!==null?{reason:event.设定原因}:{})});
  memories.push({scene,participants,summary:event.梗概,
   quote:event.段落!==null?{reference:event.段落,text:event.原文}:null,
   results:clone(event.结果),impact:event.影响,tags:clone(event.标签)});
 }
 for(const [type,objects]of Object.entries(status))for(const [object,fields]of Object.entries(objects))for(const [field,row]of Object.entries(fields)){
  if(type==='叙事状态')changes.push({kind:'status',object,field,...values(row)});
  else changes.push({kind:'status',type,object,field,hasOldValue:false,hasNewValue:true,newValue:clone(row),deleted:false});
 }
 const all=[...characters.values()].map(c=>({...c,cognition:unique(c.cognition),psychology:unique(c.psychology)}));
 const player=typeof playerName==='string'&&playerName?all.find(c=>c.name===playerName):null;
 // Upcoming work, timers and planning/foreshadow rows are deliberately not
 // copied at all (including attributes, diagnostics and search metadata).
 return {scene:memories[0]?.scene??null,associations:clone(memory.关联),memories,
  characters:player?all.filter(c=>c!==player):all,changes:unique(changes),...(player?{player}:{})};
}
