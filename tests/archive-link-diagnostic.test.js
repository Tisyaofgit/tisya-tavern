import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {collectArchiveLinkDiagnostic,archiveLinkDiagnosticSummary} from '../archive-link-diagnostic.js';
import {phoneSource} from '../phone-turn-host.js';
import {sha256} from '../engine/common.mjs';
import {initializeState} from '../engine/materials.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const row=values=>({values:{row_uuid:values.name??values.title??'row',...values},states:Object.fromEntries(['row_uuid',...Object.keys(values)].map(key=>[key,'known']))});
const entry=(title='PRIVATE_NAME')=>({reference:{tableId:'T_SYS_ENTITIES',recordId:'PRIVATE_RECORD',snapshotId:'PRIVATE_SNAPSHOT'},kind:'人物',title,names:[title],fields:[['公开身份','PRIVATE_FIELD']],contextKey:'ctx',allowed:true});
function setup(html=''){
 const w=new Window({settings:{disableIframePageLoading:true,disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),d=w.document;
 d.body.innerHTML='<div class="mes"><div class="mes_block">'+html+'</div></div>';
 return {w,d,node:d.querySelector('.mes')};
}
function fixture(message){
 const state=initializeState(catalog,{session_ref:'session',branch_ref:'main'});state.tables.T_SYS_ENTITIES={'entity-a':row({name:'PRIVATE_NAME',kind:'character',description:'PRIVATE_DESCRIPTION'})};
 const source=phoneSource(message);
 return {state,contextKey:'ctx',snapshotId:source.sourceId,uid:source.uid,sourceId:source.sourceId,hostMessageSha256:sha256(message.mes)};
}

test('successful service, light DOM and shadow DOM links are counted without leaking private content',async()=>{
 const {w,d,node}=setup('<div class="tisya-message-visual"></div><div class="mes_text"><span data-tisya-archive-anchor data-archive-open="true"><button data-tisya-archive-link>PRIVATE_NAME</button><span data-tisya-archive-tooltip>PRIVATE_TOOLTIP</span></span></div>');
 const host=d.querySelector('.tisya-message-visual'),shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<span data-tisya-archive-anchor><button data-tisya-archive-link>PRIVATE_NAME</button><span data-tisya-archive-tooltip></span></span>';
 const message={mes:'PRIVATE_NAME enters PRIVATE_PROSE',is_user:false,is_system:false,extra:{tisya_engine:{uid:'PRIVATE_UID'}}};let disposed=0;
 const before=node.outerHTML,observer=new w.MutationObserver(()=>{});observer.observe(node,{subtree:true,childList:true,attributes:true,characterData:true});
 try{
  const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>({messageSnapshotId:'PRIVATE_SNAPSHOT',contextKey:'ctx',archiveLinks:{entries:[entry()]},dispose:()=>{disposed++;}})});
  assert.equal(result.assessment,'links-present');assert.equal(result.presentation.index.entries,1);assert.equal(result.presentation.index.uniqueNames,1);assert.equal(result.presentation.index.matchedOccurrences,1);
  assert.equal(result.dom.links,2);assert.equal(result.dom.tooltips,2);assert.equal(result.dom.openTooltips,1);assert.equal(result.dom.styleVisibleLinks,2);
  assert.deepEqual(result.dom.roots.map(row=>row.kind),['message-light-dom','projection-shadow']);assert.equal(disposed,1);
  const json=JSON.stringify(result);assert.doesNotMatch(json,/PRIVATE_|PRIVATE-/);assert.equal(node.outerHTML,before);assert.equal(observer.takeRecords().length,0);
  assert.match(archiveLinkDiagnosticSummary(result),/DOM 链接 2/);assert.doesNotMatch(archiveLinkDiagnosticSummary(result),/PRIVATE_/);
 }finally{observer.disconnect();await w.happyDOM.abort();}
});

test('a real readable snapshot distinguishes an empty production service from missing archive data',async()=>{
 const {w,d,node}=setup('<div class="tisya-message-visual"></div>');
 const message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}},snapshot=fixture(message);
 try{
  const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>null,database:{snapshot:async()=>snapshot}});
  assert.equal(result.assessment,'service-returned-empty');assert.equal(result.presentation.status,'null');assert.equal(result.snapshot.status,'object');assert.equal(result.snapshot.index.entries,1);assert.equal(result.snapshot.index.byTable.T_SYS_ENTITIES,1);assert.equal(result.snapshot.index.matchedNames,1);
  assert.equal(result.identity.snapshotUidMatches,true);assert.equal(result.identity.snapshotRawDigestMatches,true);assert.equal(result.identity.snapshotSourceMatches,true);assert.equal(result.identity.snapshotContextMatches,true);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NAME|PRIVATE_DESCRIPTION|entity-a|stable:/);
 }finally{await w.happyDOM.abort();}
});

test('matching service entries with no final anchors identify a DOM consumption break',async()=>{
 const {w,d,node}=setup('<div class="tisya-message-visual"></div>'),message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}};
 try{const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>({contextKey:'ctx',archiveLinks:{entries:[entry()]}})});assert.equal(result.assessment,'links-not-projected');assert.equal(result.presentation.index.matchedNames,1);assert.equal(result.dom.links,0);}finally{await w.happyDOM.abort();}
});

test('snapshot and presentation failures expose fixed codes but never private error text',async()=>{
 const {w,d,node}=setup(),message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}};
 try{const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>{throw Object.assign(new Error('PRIVATE_PRESENTATION'),{code:'SNAPSHOT_REJECTED'});},database:{snapshot:async()=>{throw Object.assign(new Error('PRIVATE_SNAPSHOT'),{code:'SNAPSHOT_UNVERIFIED'});}}});assert.equal(result.assessment,'presentation-error');assert.equal(result.presentation.error,'SNAPSHOT_REJECTED');assert.equal(result.snapshot.error,'SNAPSHOT_UNVERIFIED');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);}finally{await w.happyDOM.abort();}
});

test('snapshot verification distinguishes baseline entries from edited message signatures without private details',async()=>{
 const {w,d,node}=setup(),message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}};
 try{
  for(const [reason,assessment] of [['BASELINE','snapshot-baseline'],['SIGNATURE_MISMATCH','snapshot-signature-mismatch']]){
   const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>null,database:{snapshot:async()=>{throw Object.assign(Error('PRIVATE_SNAPSHOT'),{code:'SNAPSHOT_UNVERIFIED',details:{reason,privateValue:'PRIVATE_DETAIL'}});}}});
   assert.equal(result.assessment,assessment);assert.equal(result.snapshot.error,'SNAPSHOT_UNVERIFIED');assert.equal(result.snapshot.reason,reason);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
  }
 }finally{await w.happyDOM.abort();}
});

test('pending candidates and style-hidden links have distinct terminal states',async()=>{
 const {w,d,node}=setup('<div class="mes_text" style="display:none"><button data-tisya-archive-link>PRIVATE_NAME</button></div>'),base={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}};
 try{
  const pending=await collectArchiveLinkDiagnostic(d,node,{message:{...base,extra:{tisya_engine:{uid:'stable',pending_sha256:'PRIVATE_PENDING'}}},contextKey:'ctx',getPresentation:async()=>null});
  assert.equal(pending.assessment,'message-pending');assert.equal(pending.message.pending,true);assert.doesNotMatch(JSON.stringify(pending),/PRIVATE_PENDING/);
  const hidden=await collectArchiveLinkDiagnostic(d,node,{message:base,contextKey:'ctx',getPresentation:async()=>({contextKey:'ctx',archiveLinks:{entries:[entry()]}})});
  assert.equal(hidden.assessment,'links-style-hidden');assert.equal(hidden.dom.links,1);assert.equal(hidden.dom.styleVisibleLinks,0);
 }finally{await w.happyDOM.abort();}
});

test('missing message identity is reported by code and cannot leak the raw message',async()=>{
 const {w,d,node}=setup(),message={mes:'PRIVATE_NAME PRIVATE_PROSE',is_user:false,extra:{}};
 try{const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>null});assert.equal(result.assessment,'message-identity-error');assert.equal(result.message.uidPresent,false);assert.equal(result.identity.sourceReady,false);assert.equal(result.identity.error,'PHONE_MESSAGE_ID');assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);}finally{await w.happyDOM.abort();}
});


test('a stalled presentation or snapshot times out with a safe terminal report',async()=>{
 const {w,d,node}=setup(),message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}};
 try{
  const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',timeout:5,getPresentation:()=>new Promise(()=>{}),database:{snapshot:()=>new Promise(()=>{})}});
  assert.equal(result.assessment,'presentation-timeout');assert.equal(result.presentation.status,'timeout');assert.equal(result.presentation.error,'DIAGNOSTIC_TIMEOUT');assert.equal(result.snapshot.status,'timeout');assert.equal(result.snapshot.error,'DIAGNOSTIC_TIMEOUT');
  assert.match(archiveLinkDiagnosticSummary(result),/读取超时/);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
 }finally{await w.happyDOM.abort();}
});

test('a presentation resolving after its diagnostic timeout is still disposed',async()=>{
 const {w,d,node}=setup(),message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}};let finish,disposed=0;
 const waiting=new Promise(resolve=>{finish=resolve;});
 try{
  const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',timeout:5,getPresentation:()=>waiting});assert.equal(result.presentation.status,'timeout');
  finish({contextKey:'ctx',archiveLinks:{entries:[entry()]},dispose:()=>{disposed++;}});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(disposed,1);
 }finally{finish(null);await w.happyDOM.abort();}
});


test('snapshot context and identity mismatches take precedence over an empty index',async()=>{
 const {w,d,node}=setup(),message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}},snapshot=fixture(message);
 try{
  const wrongContext=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>null,database:{snapshot:async()=>({...snapshot,contextKey:'other'})}});
  assert.equal(wrongContext.assessment,'snapshot-context-mismatch');assert.equal(wrongContext.identity.snapshotContextMatches,false);
  const wrongRaw=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>null,database:{snapshot:async()=>({...snapshot,hostMessageSha256:'0'.repeat(64)})}});
  assert.equal(wrongRaw.assessment,'snapshot-identity-mismatch');assert.equal(wrongRaw.identity.snapshotRawDigestMatches,false);
 }finally{await w.happyDOM.abort();}
});

test('style inspection crosses a projection shadow root to its hidden host',async()=>{
 const {w,d,node}=setup('<div class="tisya-message-visual" style="display:none"></div>'),host=d.querySelector('.tisya-message-visual');host.attachShadow({mode:'open'}).innerHTML='<button data-tisya-archive-link>PRIVATE_NAME</button>';
 const message={mes:'PRIVATE_NAME',is_user:false,extra:{tisya_engine:{uid:'stable'}}};
 try{const result=await collectArchiveLinkDiagnostic(d,node,{message,contextKey:'ctx',getPresentation:async()=>({contextKey:'ctx',archiveLinks:{entries:[entry()]}})});assert.equal(result.assessment,'links-style-hidden');assert.equal(result.dom.links,1);assert.equal(result.dom.styleVisibleLinks,0);}finally{await w.happyDOM.abort();}
});
