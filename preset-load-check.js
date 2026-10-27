// TauriTavern a1855be4 PromptManager adds these missing definitions and Agent
// position markers during its AFTER listener. They are not shipped Tisya text.
const agents=new Map([['agentSystemPrompt',{name:'Agent System Prompt',role:'system'}],['agentTask',{name:'Agent Task',role:'user'}],['agentResults',{name:'Agent Results',role:'system'}]]);
const defaults=new Map([
 ...[...agents].map(([identifier,row])=>[identifier,{identifier,...row,content:'',system_prompt:true,marker:true}]),
 ['nsfw',{identifier:'nsfw',name:'Auxiliary Prompt',role:'system',content:'',system_prompt:true}],
 ['jailbreak',{identifier:'jailbreak',name:'Post-History Instructions',role:'system',content:'',system_prompt:true}],
 ['enhanceDefinitions',{identifier:'enhanceDefinitions',name:'Enhance Definitions',role:'system',content:"If you have more knowledge of {{char}}, add to the character's lore and personality to enhance them but keep the Character Sheet's definitions absolute.",system_prompt:true,marker:false}],
]);
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,sorted(value[k])])):value;
const equal=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));

// Check every shipped field, rejecting missing/duplicate/changed prompts and
// unknown extra rows. Only observed native defaults may be projected away.
export function presetLoadMismatch(actual,expected){
 if(actual?.extensions?.tisya_builtin?.revision!==expected?.extensions?.tisya_builtin?.revision)return '载入修订号不一致';
 if(!Array.isArray(actual?.prompts)||!Array.isArray(actual?.prompt_order))return '提示词或排序不可读';
 const expectedIds=new Set(expected.prompts.map(row=>row.identifier)),seen=new Set(),managed=[];
 for(const row of actual.prompts){
  if(!row||seen.has(row.identifier))return '提示条目标识缺失或重复';
  seen.add(row.identifier);
  if(expectedIds.has(row.identifier))managed.push(row);
  else if(!defaults.has(row.identifier)||!equal(row,defaults.get(row.identifier)))return '未确认的宿主条目：'+String(row.identifier);
 }
 if(!equal(managed,expected.prompts))return 'Tisya 提示词正文或属性不一致';
 const groups=[];
 for(const group of actual.prompt_order){
  if(!group||!Array.isArray(group.order))return '提示词排序不可读';
  const ids=new Set(),order=[];
  for(const row of group.order){
   if(!row||ids.has(row.identifier))return '提示词排序缺失或重复';
   ids.add(row.identifier);
   if(expectedIds.has(row.identifier))order.push(row);
   else if(!agents.has(row.identifier)||!seen.has(row.identifier)||!equal(row,{identifier:row.identifier,enabled:true}))return '未确认的排序条目：'+String(row.identifier);
  }
  groups.push({...group,order});
 }
 if(!equal(groups,expected.prompt_order))return 'Tisya 提示词顺序或开关不一致';
 return null;
}
