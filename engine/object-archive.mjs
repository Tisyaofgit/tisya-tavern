import {clone,digest,fail,stableId} from './common.mjs';
import {WorldClock} from './math.mjs';
import {worldClockConfiguration} from './world-clock.mjs';

export const OBJECT_ARCHIVE_FORMAT='tisya.object-archive/1';
export const OBJECT_ARCHIVE_TABLES=Object.freeze(['T_CHAR_DOSSIER','T_STATIC_ITEMS_SKILLS','T_STATIC_PLACES','T_STATIC_ORGANIZATIONS','T_STATIC_FACILITIES']);
const check=(ok,code,message)=>{if(!ok)fail(code,message);};
const rows=(state,table)=>Object.entries(state?.tables?.[table]??{});
const titleOf=row=>String(row?.values?.name??row?.values?.title??row?.values?.row_uuid??'未命名对象');

// A source definition is stable across sessions and source revisions. Session
// objects deliberately remain session-scoped: equal display names are not IDs.
export function objectArchiveIdentity(state,table,recordId){
 const row=state?.tables?.[table]?.[recordId];check(row,'ARCHIVE_OBJECT_MISSING','档案对象不存在');
 const source=row.metadata?.sourceDefinition,scope=state.runtime?.scope??{};
 const identity=source&&typeof source.book==='string'&&(typeof source.uid==='string'||Number.isSafeInteger(source.uid))&&typeof source.definitionId==='string'
  ?{kind:'source',book:source.book,uid:String(source.uid),definitionId:source.definitionId,table,record_id:recordId}
  :{kind:'session',session:String(scope.session_ref??''),table,record_id:recordId};
 return {archive_id:'dossier-'+stableId(digest(identity)),identity};
}

// A broken or absent clock stays unknown; device time is never substituted.
export function archiveStoryTime(state){
 const scope=state?.runtime?.scope??{},branch=String(scope.branch_ref??'main');
 try{
  const clocks=rows(state,'X_WORLD_CLOCKS'),selected=state.runtime?.calendar_record_id??(clocks.length===1?clocks[0][0]:null),config=selected?worldClockConfiguration(state,selected):state.runtime?.calendar;
  if(!config)return {branch,status:'unknown',ordinal:null,text:null,calendar_ref:selected??null};
  const clock=new WorldClock(config);return {branch,status:'known',ordinal:clock.ordinal(),text:clock.text(),calendar_ref:selected??'legacy'};
 }catch{return {branch,status:'unknown',ordinal:null,text:null,calendar_ref:null};}
}

function snapshot(row,table,recordId){
 return row?{table_id:table,record_id:recordId,title:titleOf(row),values:clone(row.values??{}),states:clone(row.states??{})}:null;
}
function changes(before,after){
 const left=before?.values??{},right=after?.values??{},ls=before?.states??{},rs=after?.states??{},keys=[...new Set([...Object.keys(left),...Object.keys(right),...Object.keys(ls),...Object.keys(rs)])].sort(),out=[];
 for(const field of keys){const a={value:clone(left[field]??null),state:ls[field]??null,present:Object.hasOwn(left,field)},b={value:clone(right[field]??null),state:rs[field]??null,present:Object.hasOwn(right,field)};if(digest(a)!==digest(b))out.push({field,before:before?a:null,after:after?b:null});}
 return out;
}
function latest(versions){return [...versions].sort((a,b)=>a.revision-b.revision).at(-1)??null;}
// Select one whole version. Fields from different ages are never stitched.
export function projectArchiveVersion(entry,time){
 const candidates=(entry?.versions??[]).filter(v=>v.time?.branch===time?.branch).filter(v=>{
  if(time?.ordinal===null||time?.ordinal===undefined)return true;
  return v.time?.ordinal===null||v.time?.ordinal===undefined||v.time.ordinal<=time.ordinal;
 });
 if(time?.ordinal===null||time?.ordinal===undefined)return latest(candidates)??null;
 return [...candidates].sort((a,b)=>(a.time?.ordinal??-Infinity)-(b.time?.ordinal??-Infinity)||a.revision-b.revision).at(-1)??null;
}

function appendVersion(previous,current,{revision,time}){
 const versions=clone(previous?.versions??[]),before=latest(versions),hash=digest(current);
 check(!(before?.revision===revision&&before.hash!==hash),'ARCHIVE_REVISION_CONFLICT','同一存档修订出现不同对象内容，旧版本已保留');
 const sameBranch=versions.some(v=>v.time?.branch===time.branch),same=before?.hash===hash;
 if(same&&sameBranch)return {versions,version:latest(versions.filter(v=>v.time?.branch===time.branch))??before,before,changed:false};
 if(before?.revision===revision&&same)return {versions,version:before,before,changed:false};
 const version={id:'version-'+stableId(digest({archive:previous?.archive_id,revision,time,hash})),revision,time:clone(time),hash,snapshot:clone(current)};
 versions.push(version);return {versions,version,before,changed:true};
}

function historyChanges(entry){
 const versions=[...entry.versions].sort((a,b)=>a.revision-b.revision),rows=[];
 // Rebuild from the durable version chain. If the dossier write succeeded but
 // the history write failed, retry cannot lose the intervening field change.
 for(let i=1;i<versions.length;i++){const before=versions[i-1],version=versions[i],diff=changes(before.snapshot,version.snapshot);if(diff.length)rows.push({version_id:version.id,revision:version.revision,time:clone(version.time),fields:diff});}
 return rows;
}

export function advanceObjectArchive(bundle,previous={dossiers:[],histories:[]}){
 const state=bundle?.state;check(state?.tables&&state.runtime,'ARCHIVE_STATE_MISSING','对象存档缺少完整数据库状态');
 const revision=bundle.local_revision??0;check(Number.isSafeInteger(revision)&&revision>=0,'ARCHIVE_REVISION_INVALID','对象存档修订无效');
 const time=archiveStoryTime(state),oldDossiers=new Map((previous.dossiers??[]).map(x=>[x.archive_id,x])),oldHistories=new Map((previous.histories??[]).map(x=>[x.archive_id,x])),ids=new Set(oldDossiers.keys()),current=new Map();
 for(const table of OBJECT_ARCHIVE_TABLES)for(const [recordId,row]of rows(state,table)){
  const identity=objectArchiveIdentity(state,table,recordId);ids.add(identity.archive_id);current.set(identity.archive_id,{table,recordId,row,identity});
 }
 const dossiers=[],histories=[];
 for(const archive_id of [...ids].sort()){
  const prior=oldDossiers.get(archive_id),now=current.get(archive_id),table=now?.table??prior?.table_id,recordId=now?.recordId??prior?.record_id;
  check(prior||now,'ARCHIVE_OBJECT_MISSING','档案对象映射损坏');
  const nextSnapshot=snapshot(now?.row,table,recordId),advanced=appendVersion(prior?{...prior,archive_id}:null,nextSnapshot,{revision,time});
  const entry={format:OBJECT_ARCHIVE_FORMAT,kind:'dossier',archive_id,identity:now?.identity??clone(prior.identity),table_id:table,record_id:recordId,title:nextSnapshot?.title??prior.title,versions:advanced.versions,observed_revision:revision};
  dossiers.push(entry);
  const oldHistory=oldHistories.get(archive_id),history={format:OBJECT_ARCHIVE_FORMAT,kind:'history',archive_id,table_id:table,record_id:recordId,title:entry.title,changes:historyChanges(entry),observed_revision:revision};
  if(history.changes.length||oldHistory)histories.push(history);
 }
 const events=rows(state,'T_DYN_EVENTS').map(([recordId,row])=>({event_id:recordId,...clone(row.values),value_states:clone(row.states??{})}));
 return {revision,time,dossiers,histories,events:{format:OBJECT_ARCHIVE_FORMAT,kind:'events',archive_id:'world-events',events,observed_revision:revision}};
}
