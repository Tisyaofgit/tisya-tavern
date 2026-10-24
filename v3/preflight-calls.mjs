import {parseSimpleSheet,formatSimpleSheet} from '../tables/simple-sheet.js';
const clone=structuredClone;
const fields=['requestKey','archiveProposal','worldProposal','scope','preferenceCandidates','archiveRequests','creativeBrief','pending'];
const empty=()=>({templates:[],schemaChanges:[],changes:[],pending:[]});
const check=(ok,message)=>{if(!ok)throw Error('拆分辅助调用：'+message);};
const emptyProposal=p=>p&&Object.keys(p).length===4&&['templates','schemaChanges','changes','pending'].every(k=>Array.isArray(p[k])&&!p[k].length);
const emptyObject=x=>x&&typeof x==='object'&&!Array.isArray(x)&&!Object.keys(x).length;
export const SPLIT_STAGE_RULES={
 archive:'This is the ARCHIVE stage of a split preflight. Own only archiveProposal and optional archiveRequests. Process the supplied archive sources in their exact order. Set worldProposal=null, scope={}, preferenceCandidates={templates:[],schemaChanges:[],changes:[],pending:[]}, creativeBrief={}, pending=[]. Keep all eight root fields and requestKey. Do not perform world advancement or infer preferences.',
 preferences:'This is the PREFERENCES stage of a split preflight. Own only preferenceCandidates and optional archiveRequests. Cite only the supplied eligible user sources. Earlier archive candidates are uncommitted proposals; reuse their exact IDs if needed. Set archiveProposal=[], worldProposal=null, scope={}, creativeBrief={}, pending=[]. Keep all eight root fields and requestKey. Do not write story facts or advance the world.',
 plan:'This is the PLAN stage of a split preflight. Own worldProposal, scope, creativeBrief and optional archiveRequests. Earlier archive and preference candidates are uncommitted proposals supplied in additionalInput; account for them and reuse exact new: IDs, without copying their changes. Set archiveProposal=[], preferenceCandidates={templates:[],schemaChanges:[],changes:[],pending:[]}, pending=[]. Return the complete registered scope and creativeBrief. Keep all eight root fields and requestKey.'
};
/** No partial model output mutates the ledger. The existing runner validates
 * the merged result and owns all source/native/write transactions. */
export async function runSplitPreflight(input,{requestStage,guard=()=>{}}){
 const collected={},requests=[];
 for(const stage of ['archive','preferences','plan']){
  guard();const part=clone(input);
  if(stage!=='archive'){part.archiveSources=[];part.archiveEnabled=false;}
  if(stage!=='preferences'){part.preferenceSources=[];part.preferencesEnabled=false;}
  if(stage!=='plan'){part.plotEnabled=false;part.worldWindow=null;}
  part.additionalInput={...(part.additionalInput??{}),splitPreflight:{stage,uncommitted:clone(collected)}};
  const raw=await requestStage(stage,part,SPLIT_STAGE_RULES[stage]);guard();const value=parseSimpleSheet(raw);
  check(value&&JSON.stringify(Object.keys(value))===JSON.stringify(fields),'响应根字段或顺序不符');check(value.requestKey===input.requestKey,'请求编号不符');check(Array.isArray(value.pending)&&!value.pending.length,'有未解决事项');check(Array.isArray(value.archiveRequests),'查询列表无效');requests.push(...value.archiveRequests);
  if(stage==='archive'){check(value.worldProposal===null&&emptyObject(value.scope)&&emptyObject(value.creativeBrief)&&emptyProposal(value.preferenceCandidates),'归档调用越过职责');check(Array.isArray(value.archiveProposal)&&value.archiveProposal.length===input.archiveSources.length&&value.archiveProposal.every((x,i)=>x.source===input.archiveSources[i].archiveSource.key),'归档来源顺序改变');collected.archiveProposal=value.archiveProposal;}
  if(stage==='preferences'){check(Array.isArray(value.archiveProposal)&&!value.archiveProposal.length&&value.worldProposal===null&&emptyObject(value.scope)&&emptyObject(value.creativeBrief),'偏好调用越过职责');collected.preferenceCandidates=value.preferenceCandidates;}
  if(stage==='plan'){check(Array.isArray(value.archiveProposal)&&!value.archiveProposal.length&&emptyProposal(value.preferenceCandidates),'推进调用重复归档或修改偏好');Object.assign(collected,{worldProposal:value.worldProposal,scope:value.scope,creativeBrief:value.creativeBrief});}
 }
 check(requests.length<=8,'合并后的档案查询超出本轮上限');
 return formatSimpleSheet({requestKey:input.requestKey,archiveProposal:collected.archiveProposal,worldProposal:collected.worldProposal,scope:collected.scope,preferenceCandidates:collected.preferenceCandidates,archiveRequests:requests,creativeBrief:collected.creativeBrief,pending:[]});
}
