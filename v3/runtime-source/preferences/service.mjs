import {check,copy,object,validateRow} from '../../../tables/schema.js';
import {preferenceMatches} from '../../../tables/preferences.js';

const HARD=new Set(['必须','禁止']);
const SCOPES=['用户角色','角色卡','世界','会话'];
const sortedStrings=value=>[...new Set(value??[])].sort();
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const nonempty=value=>typeof value==='string'&&value.trim().length>0;

/** Group membership does not include a score or its sign. Each source owns one contribution. */
export function preferenceGroup(values){
 check(object(values),'Preference values are required');
 const scope=copy(values.作用域??{});
 for(const key of SCOPES)if(Array.isArray(scope[key]))scope[key]=sortedStrings(scope[key]);
 return JSON.stringify(canonical([values.核心标签??'',values.偏好维度??'',values.角色指向??'',values.适用情境??'',values.范围??'',scope,sortedStrings(values.例外)]));
}

export function preferenceFeedbackIdentity(source,origin){return JSON.stringify([source.startsWith('feedback:')?'':origin?.chatId??'',source]);}
export function preferenceContributionIdentity(row){return JSON.stringify([preferenceFeedbackIdentity(row.preferenceSource,row.preferenceOrigin),preferenceGroup(row.values)]);}
export function preferenceContributionIdentities(row){return [...new Set([preferenceGroup(row.values),...(row.preferenceIdentityGroups??[])])].map(group=>JSON.stringify([preferenceFeedbackIdentity(row.preferenceSource,row.preferenceOrigin),group]));}

function bank(state){
 check(object(state)&&object(state.baseView?.registry)&&Array.isArray(state.preferenceDrafts),'Preference state is invalid');
 check(state.preferenceRows===undefined||Array.isArray(state.preferenceRows),'Preference rows must be a list');
 check(state.preferenceHistory===undefined||Array.isArray(state.preferenceHistory),'Preference history must be a list');
 return {registry:state.baseView.registry,rows:state.preferenceRows??[],history:state.preferenceHistory??[]};
}

function validateContribution(row,registry,{confirmed=true}={}){
 validateRow(registry,row);
 check(row.table==='preferences'&&nonempty(row.preferenceSource)&&(!row.preferenceSource.startsWith('feedback:')||row.preferenceSource.length>9),'Preference source is missing');
 if(row.preferenceOrigin!==undefined)check(object(row.preferenceOrigin)&&nonempty(row.preferenceOrigin.chatId),'Preference source chat identity is invalid');
 check(row.preferenceConfirmed===confirmed,'Preference confirmation flag is invalid');
 if(row.preferenceIdentityGroups!==undefined)check(Array.isArray(row.preferenceIdentityGroups)&&row.preferenceIdentityGroups.every(nonempty)&&new Set(row.preferenceIdentityGroups).size===row.preferenceIdentityGroups.length,'Preference source identity groups are invalid');
 check(!row.access.knowers.length,'User preference does not grant character knowledge');
 check(nonempty(row.values.核心标签)&&nonempty(row.values.内容)&&nonempty(row.values.证据),'Preference tag, instruction and source excerpt are required');
 check(row.values.性质!=='推测偏好'||!HARD.has(row.values.强度),'Inferred preference cannot create a hard constraint');
 if(!HARD.has(row.values.强度))check(Number.isFinite(row.values.赋分),'A preference contribution requires its original signed score');
 else if(Object.hasOwn(row.values,'赋分'))check(Number.isFinite(row.values.赋分),'Hard-constraint score must be finite when present');
 if(row.values.强度==='喜爱')check(row.values.赋分>=0,'Encouragement contribution cannot have a negative score');
 if(row.values.强度==='厌恶')check(row.values.赋分<=0,'Aversion contribution cannot have a positive score');
 const scope=row.values.作用域;
 if(scope!==undefined){
  check(object(scope)&&Object.keys(scope).every(k=>k==='全局'||SCOPES.includes(k)),'Unknown preference scope');
  if(Object.hasOwn(scope,'全局'))check(typeof scope.全局==='boolean','Global scope must be boolean');
  for(const key of SCOPES)if(Object.hasOwn(scope,key))check(Array.isArray(scope[key])&&scope[key].every(nonempty)&&new Set(scope[key]).size===scope[key].length,'Preference scopes require exact unique host IDs');
 }
 return row.preferenceSource+'\0'+preferenceGroup(row.values);
}

function validateBank(state){
 const data=bank(state),ids=new Set(),keys=new Set();
 for(const row of data.rows){validateContribution(row,data.registry);const rowKeys=preferenceContributionIdentities(row);check(!ids.has(row.id)&&rowKeys.every(key=>!keys.has(key)),'Duplicate source contribution in preference bank');ids.add(row.id);rowKeys.forEach(key=>keys.add(key));}
 return data;
}

function history(next,action,subject,before,after,now,reason='',provenance={}){
 next.preferenceHistory??=[];
 next.preferenceHistory.push({id:'preference-history:'+crypto.randomUUID(),action,subject,at:now,reason,...copy(provenance),before:copy(before),after:copy(after)});
}

const originalValues=values=>Object.fromEntries(Object.entries(values).filter(([key])=>!['启用','修订原因'].includes(key)));

/** Pure state transition. Storage revision is owned by the facade. */
export function confirmPreferenceDraft(state,draftId,{enabled=true,now=new Date().toISOString()}={}){
 check(enabled,'Preference processing is disabled');
 const {registry,rows}=validateBank(state),draft=state.preferenceDrafts.find(d=>d.id===draftId);
 check(draft,'Preference draft does not exist');
 if(draft.status==='accepted')return copy(state);
 check(draft.status==='pending'&&Array.isArray(draft.changes)&&Array.isArray(draft.contributions)&&draft.changes.length===draft.contributions.length,'Preference draft is not pending or is malformed');
 check(draft.mutations===undefined||Array.isArray(draft.mutations),'Preference mutations must be a list');
 const mutations=new Map();for(const mutation of draft.mutations??[]){check(object(mutation)&&nonempty(mutation.id)&&!mutations.has(mutation.id)&&nonempty(mutation.feedbackSource)&&nonempty(mutation.evidence)&&nonempty(mutation.reason),'Invalid preference mutation attribution');mutations.set(mutation.id,mutation);}
 const next=copy(state),target=next.preferenceDrafts.find(d=>d.id===draftId),byId=new Map(rows.map(r=>[r.id,copy(r)])),seen=new Set();
 for(const [index,change]of draft.changes.entries()){
  check(object(change)&&change.after&&!change.deleted&&change.id===change.after.id,'Preference deletion is not allowed; disable a contribution');
  const row=copy(change.after),key=validateContribution(row,registry,{confirmed:false}),source=draft.contributions[index];
  check(source?.key===key&&source.source===row.preferenceSource&&source.group===preferenceGroup(row.values),'Preference source attribution changed');
  check(!seen.has(key),'One feedback source contributes once per group');seen.add(key);
  const current=byId.get(row.id),mutation=mutations.get(row.id),identity=preferenceContributionIdentity(row),duplicate=[...byId.values()].find(r=>r.id!==row.id&&preferenceContributionIdentities(r).includes(identity));
  check(!duplicate,'Feedback contribution is already confirmed');
  if(change.before){
   check(mutation&&mutation.reason===row.values.修订原因&&typeof row.values.启用==='boolean','Retraction requires the current feedback source, excerpt and reason');
   if(source.feedbackSource!==undefined)check(source.feedbackSource===mutation.feedbackSource,'Mutation feedback attribution changed');
   check(row.preferenceSource===change.before.preferenceSource&&equal(originalValues(row.values),originalValues(change.before.values))&&equal(row.access,change.before.access),'A contribution update may only change activation and reason; original score and evidence are immutable');
   if(mutation.feedbackOrigin!==undefined)check(object(mutation.feedbackOrigin)&&nonempty(mutation.feedbackOrigin.chatId),'Mutation source chat identity is invalid');
   const receipt=(state.preferenceHistory??[]).find(item=>item.subject===row.id&&item.mutation===true&&preferenceFeedbackIdentity(item.feedbackSource,item.feedbackOrigin)===preferenceFeedbackIdentity(mutation.feedbackSource,mutation.feedbackOrigin));
   if(receipt){check(receipt.evidence===mutation.evidence&&receipt.reason===mutation.reason&&receipt.after.values.启用===row.values.启用,'Mutation feedback identity was reused with different content');continue;}
  }else{check(!mutation,'A new contribution cannot carry a retraction');if(source.feedbackSource!==undefined)check(source.feedbackSource===row.preferenceSource,'New contribution feedback attribution changed');}
  check(equal(current??null,change.before??null),'Preference contribution changed after the draft was prepared');
  if(current){check(row.preferenceSource===current.preferenceSource&&row.rev===current.rev+1,'Preference source or revision changed');row.source=current.source;for(const field of ['preferenceOwner','preferenceOrigin','preferenceIdentityGroups'])if(current[field])row[field]=copy(current[field]);else delete row[field];}
  else check(row.rev===1&&row.values.启用===true,'New preference contribution must start enabled at revision 1');
  row.preferenceConfirmed=true;validateContribution(row,registry);byId.set(row.id,row);
  history(next,'confirm',row.id,current??null,row,now,row.values.修订原因??'',mutation?{mutation:true,feedbackSource:mutation.feedbackSource,...(mutation.feedbackOrigin?{feedbackOrigin:copy(mutation.feedbackOrigin)}:{}),evidence:mutation.evidence}:{feedbackSource:row.preferenceSource,...(row.preferenceOrigin?{feedbackOrigin:copy(row.preferenceOrigin)}:{}),evidence:row.values.证据});
 }
 check([...mutations.keys()].every(id=>draft.changes.some(change=>change.id===id&&change.before)),'Orphaned preference mutation');
 next.preferenceRows=[...byId.values()];target.status='accepted';target.reviewedAt=now;
 validateBank(next);return next;
}

export function rejectPreferenceDraft(state,draftId,{reason,now=new Date().toISOString()}={}){
 validateBank(state);check(nonempty(reason),'Rejection requires a reason');
 const draft=state.preferenceDrafts.find(d=>d.id===draftId);check(draft,'Preference draft does not exist');
 if(draft.status==='rejected')return copy(state);
 check(draft.status==='pending','Only a pending preference can be rejected');
 const next=copy(state),target=next.preferenceDrafts.find(d=>d.id===draftId);target.status='rejected';target.reviewedAt=now;target.reason=reason;
 history(next,'reject',draftId,draft,target,now,reason);return next;
}

export function setPreferenceContributionEnabled(state,id,enabled,{reason,expectedRowRevision,now=new Date().toISOString()}={}){
 const {registry,rows}=validateBank(state);check(typeof enabled==='boolean'&&nonempty(reason),'Preference activation requires a boolean and reason');
 const current=rows.find(r=>r.id===id);check(current,'Confirmed contribution does not exist');
 if(expectedRowRevision!==undefined)check(current.rev===expectedRowRevision,'Preference contribution revision conflict');
 if((current.values.启用!==false)===enabled)return copy(state);
 const next=copy(state),row=next.preferenceRows.find(r=>r.id===id);row.rev++;row.values.启用=enabled;row.values.修订原因=reason;row.updatedAt=now;
 validateContribution(row,registry);history(next,enabled?'enable':'disable',id,current,row,now,reason);return next;
}

/** Explicit manual correction revises one contribution; source ownership is never reassigned. */
export function revisePreferenceContribution(state,id,values,{reason,expectedRowRevision,now=new Date().toISOString()}={}){
 const {registry,rows}=validateBank(state);check(object(values)&&nonempty(reason),'Manual preference revision requires complete values and a reason');check(Number.isSafeInteger(expectedRowRevision),'Manual preference revision requires the observed row revision');const current=rows.find(r=>r.id===id);check(current,'Confirmed contribution does not exist');check(current.rev===expectedRowRevision,'Preference contribution revision conflict');
 const revised={...copy(values),修订原因:reason};if(equal(current.values,revised))return copy(state);const next=copy(state),row=next.preferenceRows.find(r=>r.id===id);row.values=revised;row.preferenceIdentityGroups=[...new Set([...(current.preferenceIdentityGroups??[]),preferenceGroup(current.values),preferenceGroup(revised)])];row.rev++;row.updatedAt=now;validateContribution(row,registry);validateBank(next);history(next,'revise',id,current,row,now,reason,{manual:true});return next;
}

/** Closed-bank read projection; caller must supply the actual selected host identities. */
export function projectPreferences(state,{enabled=true,context={},chatId=context.chatId,world={},persona=null,binding=null,activeSourceKeys=[]}={}){
 if(!enabled)return {rows:[],groups:[],hardConstraints:[]};
 const {rows}=validateBank(state);check(Array.isArray(activeSourceKeys)&&activeSourceKeys.every(nonempty),'Retained source keys must be exact IDs');
 const active=new Set(activeSourceKeys),selected=rows.filter(row=>row.values.启用!==false&&(!row.preferenceOwner||row.values.作用域?.全局===true||row.preferenceOwner.chatId===chatId)&&preferenceMatches(row,{context,world,persona,binding})&&(row.values.作用域?.全局===true||row.preferenceSource.startsWith('feedback:')||((!row.preferenceOrigin||row.preferenceOrigin.chatId===chatId)&&active.has(row.preferenceSource))));
 const groups=new Map(),hardConstraints=[];
 for(const row of selected){
  const v=row.values,group=preferenceGroup(v),contribution={id:row.id,source:row.preferenceSource,...(row.preferenceOrigin?{origin:copy(row.preferenceOrigin)}:{}),score:Object.hasOwn(v,'赋分')?v.赋分:null,instruction:v.内容,evidence:v.证据};
  if(HARD.has(v.强度)){hardConstraints.push({group,kind:v.强度,tag:v.核心标签,...contribution});continue;}
  if(!groups.has(group))groups.set(group,{group,tag:v.核心标签,dimension:v.偏好维度??'其他',target:v.角色指向??'',scope:copy(v.作用域??{}),encourage:0,avoid:0,net:0,contributions:[]});
  const entry=groups.get(group);if(v.赋分>0)entry.encourage+=v.赋分;else if(v.赋分<0)entry.avoid+=v.赋分;entry.net+=v.赋分;entry.contributions.push(contribution);
 }
 return {rows:copy(selected),groups:[...groups.values()],hardConstraints};
}

/** Explicit confirmation facade for a future UI or host controller. No old UI is patched. */
export function createPreferenceService({storage,isEnabled=()=>true,getProjectionOptions=()=>({})}){
 check(typeof storage?.read==='function'&&typeof storage?.compareAndWrite==='function','Preference storage requires read and compareAndWrite');
 let busy=false;
 async function change(transition,options={}){
  check(!busy,'Preference update is already running');busy=true;
  try{
   const before=await storage.read();check(Number.isSafeInteger(before.revision),'Preference store revision is invalid');
   if(options.expectedRevision!==undefined)check(before.revision===options.expectedRevision,'Preference store revision conflict');
   const next=transition(before);if(equal(next,before))return {changed:false,revision:before.revision};
   next.revision=before.revision+1;await storage.compareAndWrite(before.revision,next);
   const actual=await storage.read();check(equal(actual,next),'Preference persistence readback did not match');
   return {changed:true,revision:actual.revision};
  }finally{busy=false;}
 }
 return {
  confirm:(id,options={})=>change(state=>confirmPreferenceDraft(state,id,{...options,enabled:isEnabled()}),options),
  reject:(id,options={})=>change(state=>rejectPreferenceDraft(state,id,options),options),
  setEnabled:(id,enabled,options={})=>change(state=>setPreferenceContributionEnabled(state,id,enabled,options),options),
  revise:(id,values,options={})=>change(state=>revisePreferenceContribution(state,id,values,options),options),
  async project(options={}){return projectPreferences(await storage.read(),{...getProjectionOptions(),...options,enabled:isEnabled()&&options.enabled!==false});},
  async list(){if(!isEnabled())return {drafts:[],rows:[],history:[]};const state=await storage.read();const data=validateBank(state);return {drafts:copy(state.preferenceDrafts),rows:copy(data.rows),history:copy(data.history)};}
 };
}
