import {check,copy,isObjectType} from './schema.js';

// Native persona remains the only live description owner. Stored snapshots are
// import evidence and conflict guards, not a second prompt injection source.
export function personaSnapshot(context,avatar=context.userAvatar??context.chatMetadata?.persona??''){
 const p=context.powerUserSettings;
 if(!p)return null;
 check(typeof context.name1==='string'&&typeof p.persona_description==='string','宿主用户名称或人设读取失败');
 return {id:String(avatar??''),name:context.name1,description:p.persona_description,
  descriptor:copy(p.persona_descriptions?.[avatar]??{}),storedName:p.personas?.[avatar]??null};
}
export const personaStamp=value=>JSON.stringify(value);
export function personaDefinition(value){return value?'NATIVE.USER.DEFINITION\n'+JSON.stringify({id:value.id,name:value.name,description:value.description}):'';}
export function personaObjectChange(value,rows,binding){
 const prior=binding?.personaId===value.id?rows.find(r=>r.id===binding.objectId&&r.table==='objects'):null;
 check(prior||!rows.some(r=>r.table==='objects'&&r.values.名称===value.name),'已有同名人物但尚未绑定 user；请先在“用户身份”选择该档案绑定，避免合并错人');
 return {id:prior?.id??'new:native-user',table:'objects',expected:prior?.rev??0,
  values:{名称:value.name,类型:prior?.values.类型??'character',描述:value.description},
  access:{readers:['读者'],knowers:[]},evidence:value.description||value.name};
}
export function personaProjection(rows,binding,current,{nativeInjected=true}={}){
 if(!binding)return rows;
 check(binding.state==='bound','用户人设绑定尚未完成，请在“用户身份”继续核对；未注入半份身份');
 if(!current||binding.personaId!==current.id)return rows;
 return rows.map(r=>r.id===binding.objectId?{...r,values:{名称:current.name,类型:r.values.类型,...(nativeInjected?{}:{描述:current.description})},nativePersona:true}:r);
}
export function personaDraft(row,registry,current){
 check(current?.id,'请先在原生“我扮演谁”中选择用户人设');
 check(row?.table==='objects'&&isObjectType(registry,row,'character'),'请选择人物档案绑定为 user');
 const v=row.values,parts=[v.描述,...Object.entries(v.属性??{}).map(([k,x])=>k+'：'+(typeof x==='string'?x:JSON.stringify(x)))].filter(x=>typeof x==='string'&&x);
 return {name:v.名称,description:parts.join('\n'),objectId:row.id,rowRevision:row.rev,personaId:current.id,before:copy(current)};
}
export function createPersonaGateway({getContext,getAvatar,applyActive,persist}){
 const read=()=>personaSnapshot(getContext(),getAvatar?.()??getContext().userAvatar??getContext().chatMetadata?.persona);
 async function write({before,name,description},guard=()=>{}){
  check(typeof name==='string'&&name.trim()&&!/[\r\n]/.test(name)&&typeof description==='string','用户名称须为单行非空文本，人设须为文本');
  check(typeof applyActive==='function'&&typeof persist==='function','宿主用户人设写入接口未接入');
  guard();check(personaStamp(read())===personaStamp(before),'原生用户人设已改变，未覆盖；请重新预览');
  const c=getContext(),p=c.powerUserSettings,id=before.id;check(id,'当前用户人设没有稳定头像标识');
  check(p.personas&&p.persona_descriptions,'宿主用户人设目录不可写');
  p.personas[id]=name;p.persona_descriptions[id]={...copy(before.descriptor),description};p.persona_description=description;
  applyActive(id,name);guard();
  let saved;try{saved=await persist();}catch(e){throw Error('原生人设已在内存更新，持久保存未确认；绑定保留待核对状态：'+e.message);}
  check(saved===true,'原生人设已在内存更新，宿主尚未确认持久保存；请继续核对绑定');
  guard();const after=read();check(after.id===id&&after.name===name&&after.description===description&&after.storedName===name&&after.descriptor.description===description,'原生人设回读不一致，绑定未完成');return after;
 }
 return {read,write};
}
