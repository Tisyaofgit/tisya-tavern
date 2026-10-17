import {check,copy} from './schema.js';

// Disposable confirmation tickets, never another state store or commit owner.
export function createPreviewStore({prefix,limit=100,missing,stale,full}){
 const records=new Map();
 const sameScope=(record,c)=>record.world===c.key&&record.chat===c.chat;
 return Object.freeze({
  create(c,loaded,data,{replace=null,tokenPrefix=prefix}={}){
   c.guard();
   const value=copy(data),obsolete=[];
   if(replace)for(const [token,record]of records){
    if(sameScope(record,c)&&replace(copy(record.data)))obsolete.push(token);
   }
   check(records.size-obsolete.length<limit,full);
   const token=tokenPrefix+':'+crypto.randomUUID();
   check(!records.has(token),'预览凭据重复');
   // Failed validation/cloning/capacity checks leave existing tickets intact.
   for(const old of obsolete)records.delete(old);
   records.set(token,{world:c.key,chat:c.chat,originStamp:loaded.origin.stamp,sessionStamp:loaded.session.stamp,data:value});
   return token;
  },
  read(token,c,loaded){
   c.guard();const record=records.get(token);
   check(record&&sameScope(record,c),missing);
   check(record.originStamp===loaded.origin.stamp&&record.sessionStamp===loaded.session.stamp,stale);
   return copy(record.data);
  },
  discard:token=>records.delete(token)
 });
}

export function createBoundArchiveContext({capture,load,missing='请先建立当前会话的表单存档'}){
 return async()=>{
  const c=capture();
  check(c.settings.originBook&&c.settings.sessionBook,missing);
  const loaded=await load(c);c.guard();return {c,loaded};
 };
}
