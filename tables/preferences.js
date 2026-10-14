import {check,defaultRegistry,validateRow} from './schema.js';
// Scope identities are exact host IDs. Labels and partial string matches never
// activate a preference in a different persona, card, world or chat.
export function preferenceMatches(row,{context={},world={},persona=null,binding=null}={}){
 const scope=row?.values?.作用域;if(!scope)return true;
 const identities={用户角色:[persona?.id,...(binding?.state==='bound'&&binding.personaId===persona?.id?[binding.objectId]:[])],角色卡:[context.characters?.[context.characterId]?.avatar],世界:[world.key],会话:[context.chatId]};
 for(const [key,values]of Object.entries(identities)){const required=scope[key];if(required!==undefined&&(!Array.isArray(required)||required.length&&!required.some(id=>typeof id==='string'&&id&&values.includes(id))))return false;}
 return true;
}

export function validateGlobalPreferences(bank){
 if(bank===undefined)return;
 check(bank&&typeof bank==='object'&&!Array.isArray(bank)&&Array.isArray(bank.记录)&&Array.isArray(bank.确认)&&Array.isArray(bank.历史),'全局偏好结构损坏，原数据保留');
 const ids=new Set(),registry=defaultRegistry();
 for(const row of bank.记录){validateRow(registry,row);check(row.table==='preferences'&&row.preferenceConfirmed===true&&row.values.作用域?.全局===true&&row.source===null&&!row.access.knowers.length&&!ids.has(row.id),'全局偏好记录或作用域损坏');ids.add(row.id);}
 const receipts=new Set();for(const item of bank.确认){check(item&&typeof item.编号==='string'&&item.编号&&typeof item.会话==='string'&&item.会话&&typeof item.时间==='string'&&!receipts.has(item.编号),'全局偏好确认记录损坏');receipts.add(item.编号);}
 for(const item of bank.历史)check(item&&typeof item.id==='string'&&Array.isArray(item.changes)&&Array.isArray(item.anchors),'全局偏好修改历史损坏');
}
export function withGlobalPreferences(view,bank){
 const shared=bank?.记录??[],ids=new Set(shared.map(row=>row.id));
 return {...view,rows:[...view.rows.filter(row=>!ids.has(row.id)),...structuredClone(shared)]};
}
export function confirmedPreferenceDraft(draft,bank,world){
 const receipt=bank?.确认.find(item=>item.编号===draft.id&&item.会话===world);
 return receipt?{...draft,status:'accepted',reviewedAt:receipt.时间}:draft;
}
export function preferenceBatches(proposal,rows){
 const current=new Map(rows.map(row=>[row.id,row])),groups=[[],[]];
 for(const change of proposal.changes){const scope=change.values?.作用域??current.get(change.id)?.values.作用域;groups[scope?.全局===true?1:0].push(change);}
 return groups.filter(changes=>changes.length).map(changes=>({...structuredClone(proposal),changes:structuredClone(changes)}));
}
