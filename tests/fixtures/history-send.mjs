import {Runtime} from '../../engine/runtime.mjs';
import {initializeState} from '../../engine/materials.mjs';
import {createMatrixHost} from '../../engine/host.mjs';
import {baseline} from '../../engine/config.mjs';
import catalog from '../../engine/catalog.json' with {type:'json'};

export const oldGreeting='<div class="greeting"><p>旅人来到驿站。<br>灯还亮着。</p><img src="old-card.png"></div>';
export const latestReply='<reply><body>1 守夜人打开门，递来一杯热茶。</body><cells/><archive/></reply>';
export async function historySendFixture({storage,context,persist=async()=>true}={}){
 const disk=new Map(),macros=new Map(),ctx=context??{chatId:'isolated-history-send',characterId:0,extensionSettings:{},chatMetadata:{},chat:[]};
 Object.assign(ctx,{registerMacro:(key,handler)=>macros.set(key,handler),saveChat:persist,saveSettingsDebounced(){}});
 storage??={get:async key=>structuredClone(disk.get(key)),set:async(key,value)=>disk.set(key,structuredClone(value)),commit:async(key,revision,value)=>{if((disk.get(key)?.local_revision??0)!==revision)return false;disk.set(key,structuredClone(value));return true;}};
 const source={prompts:structuredClone(baseline.prompts),order:structuredClone(baseline.prompt_order[1].order)};
 const expand=text=>text.replace(/\{\{([^{}]+)\}\}/g,(raw,key)=>macros.get(key)?.()??(key==='char'?'守夜人':key==='user'?'旅人':raw));
 const host=createMatrixHost({manualReview:true,getContext:()=>ctx,getSource:()=>source,loadCatalog:async()=>catalog,storage,persistSettings:persist,persistMetadata:persist,expand});
 host.register();
 if(!ctx.chatMetadata.tisya_engine){
  ctx.chat.push({mes:oldGreeting},{is_user:true,mes:'有人在吗？'});
  await host.import({state:new Runtime(initializeState(catalog)).data});
  ctx.chat.push({mes:latestReply});await host.sync();
  const review=await host.listTurnReviews(),draft=review.reviews.find(row=>row.status==='pending');
  await host.confirmTurn({...draft,contextKey:review.contextKey,expectedRevision:review.revision});
  ctx.chat.push({is_user:true,mes:'谢谢，请说说今晚的天气。'});await host.sync();await persist();
 }
 async function send(type='normal',{interceptor=true,afterPrepare}={}){
  try{
   await host.before(type);if(afterPrepare)await afterPrepare();
   const core=ctx.chat.map((message,index)=>({...structuredClone(message),index}));
   if(interceptor)await host.historyInput(core,type);
   const byId=new Map(source.prompts.map(row=>[row.identifier,row])),messages=[];
   for(const item of source.order){const row=byId.get(item.identifier);if(!row||!item.enabled||row.enabled===false)continue;
    if(row.identifier==='chatHistory'){messages.push(...core.map(m=>({role:m.is_user?'user':'assistant',content:m.mes})));continue;}
    if(row.marker)continue;const content=expand(row.content??'');if(content.trim())messages.push({role:row.role,content});
   }
   const payload={messages};await host.payloadReady(payload);
   return {accepted:host.accepted(),payload,history:await host.previewReviewHistory(),audit:host.latest().promptAudit};
  }finally{host.clear();host.controller.generating.clear();}
 }
 return {host,ctx,send};
}
