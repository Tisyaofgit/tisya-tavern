import {createSheetEngine} from '../tables/foundation/engine.js';
import {envelope} from './reply.mjs';
import {clone,fail} from './common.mjs';

// The existing table assistant owns task routing, cancellation and transport.
// This adapter requests readable fields and returns a draft, never a write.
export function createPreferenceAssistant({run,request,snapshot}){
 return async function draft({goal,name='',text='',category=''}){
  if(typeof goal!=='string'||!goal.trim())fail('PREFERENCE_GOAL','请填写想要的风格或修改方向');
  return run(async signal=>{
   const captured=await snapshot(),stamp=JSON.stringify(captured);
   const fields=[['name','名称'],['category','分类'],['text','完整创作指令']].map(([key,label])=>({key,label,path:[key],group:'偏好',definition:{type:'text',...(key==='text'?{multiline:true}:{})}}));
   const engine=createSheetEngine({version:1,templates:[{id:'preference-draft',table:'preference-draft',label:'偏好草稿',fields}]},value=>typeof value==='string');
   const record=engine.create('preference-draft'),ticket=engine.requestWorkbook([{recordId:record.id,heading:'偏好草稿'}]);
   const input={formContract:'tisya.simple-form/1',question:goal,goal:'按用户目标新建或改写偏好原文。只填写给定可读分组简表的名称、分类、完整创作指令。完整reply的body说明改动，cells填写字段；其余机器区块留空。保留完整文字，不以摘要或占位符代替。禁止执行保存。',source:{name,category,text},forms:ticket.modelInput,output:{kind:'preference-draft'}};
   let raw;
   try{
    raw=await request('tableAssistant',JSON.stringify(input),{signal});signal?.throwIfAborted();
    const parsed=envelope(raw);if(parsed.blocks.vars?.trim()||parsed.blocks.archive?.trim())fail('PREFERENCE_DRAFT_OUTPUT','偏好草稿不能执行故事指令');
    engine.accept(ticket.token,parsed.blocks.cells??'');const values=engine.values(record.id).values;
    if(!['name','category','text'].every(k=>typeof values[k]==='string'&&values[k].trim()))fail('PREFERENCE_DRAFT_EMPTY','草稿名称、分类或原文不完整；原答已保留');
    if(JSON.stringify(await snapshot())!==stamp)fail('PREFERENCE_DRAFT_STALE','生成期间会话、配置或表单已经变化；原答已保留');
    return {format:'tisya.preference-draft/1',...clone(values),answer:parsed.blocks.body??'',rawResponse:raw,before:{name,category,text},stamp};
   }catch(error){if(raw!==undefined)error.rawResponse=raw;throw error;}
  });
 };
}
