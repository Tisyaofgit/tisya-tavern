import {clone,fail} from './common.mjs';
// Native persona text belongs to the contractor wish in the matrix preset.
// Remove only a confirmed native injection, leaving history and other notes intact.
export function contractorMessages(messages,ctx,persona,expand=s=>s){
 const raw=expand(String(persona??'')).trim(),position=ctx.powerUserSettings?.persona_description_position;
 if(!raw||position==null||position===9)return messages;
 const native=position===4?ctx.extensionPrompts?.PERSONA_DESCRIPTION:[2,3].includes(position)?ctx.extensionPrompts?.['2_floating_prompt']:position===0?{value:persona,role:0}:null;
 if(!native?.value)return messages;
 const injected=expand(native.value).trim();if(!injected.includes(raw))return messages;
 const role=['system','user','assistant'][native.role??0],out=clone(messages),found=[];
 for(const [i,m]of out.entries()){
  if(m.role!==role||typeof m.content!=='string'||m.content.includes('[CONTRACTOR.WISH]'))continue;
  let from=0;while(true){const at=m.content.indexOf(injected,from);if(at<0)break;if((at===0||m.content[at-1]==='\n')&&(at+injected.length===m.content.length||m.content[at+injected.length]==='\n'))found.push({i,at});from=at+injected.length;}
 }
 if(!found.length)return messages;
 if(found.length!==1)fail('CONTRACTOR_NATIVE_DUPLICATE','原生身份注入出现多个相同来源，请核对身份注入位置');
 const {i,at}=found[0],target=out[i];
 // A real history message with the same text is not an injection receipt.
 if(ctx.chat?.some(m=>(m.is_user?'user':m.role??'assistant')===role&&m.mes===target.content))fail('CONTRACTOR_NATIVE_AMBIGUOUS','原生身份注入与历史原文相同，未改动历史');
 const stripped=injected.replace(raw,'').trim();target.content=target.content.slice(0,at)+stripped+target.content.slice(at+injected.length);
 return out.filter(m=>typeof m.content!=='string'||m.content.trim());
}
