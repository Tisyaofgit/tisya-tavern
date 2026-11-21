import {clone,digest,sha256,fail} from './common.mjs';
import {rewind} from './journal.mjs';

// The editor needs the state before this turn, including when the current
// candidate rerolls an already confirmed turn. Never subtract it twice.
export function databaseSnapshotBeforeMessage(bundle,{uid}={},contextKey){
 if(typeof contextKey!=='string'||!contextKey||typeof uid!=='string'||!uid)fail('SNAPSHOT_SCOPE','本轮预览需要当前会话与消息身份');
 const entries=bundle?.journal?.entries,positions=entries?.flatMap((e,i)=>e.uid===uid?[i]:[])??[];
 if(positions.length!==1||entries[positions[0]].baseline)fail('SNAPSHOT_MISSING','本轮缺少可核对的前置快照');
 let state=clone(bundle.state);
 for(const entry of entries.slice(positions[0]).reverse()){
  const patch=entry.pre_turn_snapshot?.inverse_patch;if(!Array.isArray(patch))fail('SNAPSHOT_PATCH','本轮恢复链缺少可验证补丁');
  state=rewind(state,patch);
 }
 return {state,contextKey,uid};
}

// Read exactly the accepted database state at a message. This function owns no
// persistence, does not reconcile new text, and never substitutes current rows.
export function databaseSnapshotAtMessage(bundle,{uid,raw,role='assistant',sourceId}={},contextKey){
 if(typeof contextKey!=='string'||!contextKey||typeof uid!=='string'||!uid||typeof raw!=='string')fail('SNAPSHOT_SCOPE','历史记录需要当前会话、消息ID与原文');
 if(sourceId!==undefined&&(!sourceId.startsWith(uid+':')||sourceId.length===uid.length+1))fail('SNAPSHOT_SOURCE','历史引用与消息身份不符');
 const entries=bundle?.journal?.entries;if(!bundle?.state||!Array.isArray(entries))fail('SNAPSHOT_MISSING','该消息没有可核对的表单历史快照');
 const indexes=entries.flatMap((entry,index)=>entry.uid===uid?[index]:[]);if(indexes.length!==1)fail('SNAPSHOT_MISSING','历史消息未入档或身份重复');
 const at=indexes[0],entry=entries[at];
 if(entry.baseline||entry.settlement_status==='BASELINE')fail('SNAPSHOT_UNVERIFIED','该消息仅有基线快照，未用当前数据替代',{reason:'BASELINE'});
 if(entry.signature!==digest({role,text:raw,uid}))fail('SNAPSHOT_UNVERIFIED','该消息原文与已保存快照不同，未用当前数据替代',{reason:'SIGNATURE_MISMATCH'});
 if(entry.settlement_status==='FAILED'||entry.role==='assistant_pending')fail('SNAPSHOT_REJECTED','该消息的表单修改没有通过接纳');
 let state=clone(bundle.state);
 for(const later of entries.slice(at+1).reverse()){
  const patch=later.pre_turn_snapshot?.inverse_patch;if(!Array.isArray(patch))fail('SNAPSHOT_PATCH','历史恢复链缺少可验证补丁');
  state=rewind(state,patch);
 }
 return {state,revision:entry.revision,contextKey,snapshotId:'matrix:'+uid+':'+entry.revision+':'+entry.signature,sourceId:sourceId??null,uid,signature:entry.signature,hostMessageSha256:sha256(raw)};
}
