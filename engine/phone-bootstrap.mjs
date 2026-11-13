import seed from '../phone-seed.json' with {type:'json'};
import {clone,digest,stable} from './common.mjs';
import {reconcile,inversePatch,rewind} from './journal.mjs';
import {decodePhoneDatabase,encodePhoneDatabase,restorePhoneDatabaseHistory} from './phone-database.mjs';
import {createPhoneState,exportPhone} from '../phone-core.mjs';

const signature=m=>digest({uid:m?.uid,role:m?.role,text:m?.text??''});
function receiptInPatch(edit,id){
 for(const op of edit.patch??[]){
  if(op.op!=='set'||op.path?.[0]!=='runtime'||op.path[1]!=='receipts')continue;
  if(op.path.length===2&&op.value?.[id])return op.value[id];
  if(op.path.length===3&&op.path[2]===id)return op.value;
 }
 return null;
}
function candidateProof(bundle,edit,messages,native){
 const anchors=edit.anchor_chain;if(!edit.strict||!Array.isArray(anchors)||!anchors.length)return null;
 const index=anchors.length-1,target=messages[index],anchor=anchors[index],message=native[index];
 if(!target||target.uid!==anchor.uid||target.role!=='assistant'||signature(target)===anchor.signature)return null;
 if(anchors.slice(0,-1).some((a,i)=>messages[i]?.uid!==a.uid||signature(messages[i])!==a.signature))return null;
 if(message?.extra?.tisya_engine?.uid!==anchor.uid||message.is_user||message.is_system||String(message.mes??'')!==target.text)return null;
 const selected=message.swipe_id;
 if(!Number.isSafeInteger(selected)||selected<0||!Array.isArray(message.swipes)||message.swipes[selected]!==target.text||message.swipe_info?.[selected]?.extra?.tisya_engine?.uid!==anchor.uid)return null;
 let old=message.swipes.find((text,i)=>typeof text==='string'&&message.swipe_info?.[i]?.extra?.tisya_engine?.uid===anchor.uid&&signature({uid:anchor.uid,role:'assistant',text})===anchor.signature);
 // A cold swipe slot can be null. An exact accepted baseline is evidence of
 // the original text; an arbitrary current body is never such evidence.
 if(old===undefined){const baseline=bundle.journal?.baseline_messages?.find(m=>m.uid===anchor.uid&&m.role==='assistant'&&signature(m)===anchor.signature);old=baseline?.text;}
 if(typeof old!=='string')return message.tt_swipe_cold?{index,old:null,uid:anchor.uid}:null;
 return {index,old};
}
function neutralRows(bundle,edit,contextKey,allowedOriginContextKeys){
 const id=edit.uid?.startsWith('database:phone:')?edit.uid.slice('database:'.length):null,operation=id&&bundle.database_operations?.[id],receipt=id&&receiptInPatch(edit,id);
 if(!operation||operation.contextKey!==contextKey&&!allowedOriginContextKeys.includes(operation.contextKey)||receipt?.status!=='COMMITTED'||receipt.operation_id!==id||receipt.request_sha256!==operation.hash)return null;
 const origin=operation.contextKey;
 const source=receipt.result?.source;if(source?.kind!=='phone'||source.lifecycle!=='state'||!Array.isArray(source.newPhoneActions)||source.newPhoneActions.length)return null;
 const projection={schema:clone(bundle.state.schema),tables:Object.fromEntries(Object.keys(bundle.state.tables).map(t=>[t,{}])),runtime:{revision:0}};
 for(const op of edit.patch??[])if(op.op==='set'&&op.path?.length===2&&op.path[0]==='schema'&&/^X_(PHONE|NETWORK)_/.test(op.path[1]))projection.schema[op.path[1]]=clone(op.value);
 const ops=(edit.patch??[]).filter(op=>op.path?.[0]==='tables'&&/^X_(PHONE|NETWORK)_/.test(op.path[1]));
 try{
  for(const op of ops)projection.tables[op.path[1]]??={};rewind(projection,ops);
  const binding=projection.tables.X_PHONE_BINDINGS?.['phone-current']?.values;if(!binding||binding.context_key!==origin||binding.owner_ref!=null||binding.world_ref!=null||binding.revision!==0)return null;
  const archive=decodePhoneDatabase(projection,{contextKey:origin}),expected=JSON.parse(exportPhone(createPhoneState(seed,origin)));
  if(digest(archive)!==binding.archive_digest||stable(archive)!==stable(expected))return null;
  // Select only rows referenced by the exact recorded empty phone. The
  // initializer's unrelated tables, schema edits and runtime receipt stay at
  // their original strict anchor and are not moved into another candidate.
  const encoded=encodePhoneDatabase(archive,projection),rows=[];
  for(const change of encoded.changes){if(change.remove)continue;const row=projection.tables[change.tableId]?.[change.recordId];if(!row)return null;rows.push({table:change.tableId,id:change.recordId,row:clone(row),schema:clone(projection.schema[change.tableId])});}
  return {id,rows};
 }catch{return null;}
}

// Recovery is a derived, reversible journal event. The original initialization
// and every business edit retain their original strict anchors and bytes.
export function reconcilePhoneBundle(bundle,messages,scope,{contextKey,nativeMessages=[],allowedOriginContextKeys=[]}={}){
 const recoveries=[],hydration=[];
 for(const edit of bundle.manual_edits??[]){
  const proof=candidateProof(bundle,edit,messages,nativeMessages);if(!proof)continue;
  const neutral=neutralRows(bundle,edit,contextKey,allowedOriginContextKeys);if(!neutral)continue;
  if(proof.old===null){hydration.push({index:proof.index,uid:proof.uid});continue;}
  const prefix=messages.slice(0,proof.index),base=reconcile(bundle,prefix,scope).bundle.state,next=clone(base);
  for(const row of neutral.rows){
   if(!next.schema[row.table])next.schema[row.table]=clone(row.schema);
   else for(const field of row.schema?.fields??[])if(!next.schema[row.table].fields.some(f=>f.key===field.key))next.schema[row.table].fields.push(clone(field));
   next.tables[row.table]??={};next.tables[row.table][row.id]=clone(row.row);
  }
  const ids=prefix.map(m=>m.uid),patch=inversePatch({schema:next.schema,tables:next.tables},{schema:base.schema,tables:base.tables});
  recoveries.push({edit:{uid:'phone-bootstrap-recovery:'+neutral.id,after_uid:ids.at(-1),previous_uids:ids.slice(0,-1),strict:true,anchor_chain:edit.anchor_chain.slice(0,-1),patch},proof});
 }
 const staged=recoveries.length?{...bundle,manual_edits:[...(bundle.manual_edits??[]),...recoveries.map(r=>r.edit)]}:bundle;
 let result=reconcile(staged,messages,scope);if(recoveries.length)result.bundle.manual_edits=clone(bundle.manual_edits);
 let previous=bundle.state;
 if(!previous.tables?.X_PHONE_BINDINGS?.['phone-current']&&recoveries.length){
  const {index,old}=recoveries[0].proof,original=clone(messages.slice(0,index+1));original[index].text=old;
  previous=reconcile(bundle,original,scope).bundle.state;
 }
 const current=result.bundle.state,merged=restorePhoneDatabaseHistory(current,previous,{contextKey,allowedOriginContextKeys});
 const patch=merged===current?[]:inversePatch({schema:merged.schema,tables:merged.tables},{schema:current.schema,tables:current.tables});
 if(patch.length){
  const ids=messages.map(m=>m.uid),anchors=messages.map(m=>({uid:m.uid,signature:signature(m)}));
  const edit={uid:'phone-history:'+digest({contextKey,anchors,patch,before:digest(current.tables)}),after_uid:ids.at(-1),previous_uids:ids.slice(0,-1),strict:true,anchor_chain:anchors,patch};
  // History adds layout coordinates as well as immutable evidence. Record its
  // inverse through the same journal so a later swipe cannot delete a field
  // while leaving an unjournaled layout pointing at that removed field.
  const edits=[...(bundle.manual_edits??[])];if(!edits.some(e=>e.uid===edit.uid))edits.push(edit);
  result=reconcile({...result.bundle,manual_edits:[...edits,...recoveries.map(r=>r.edit)]},messages,scope);
  result.bundle.manual_edits=edits;
 }
 if(hydration.length)result.result.phone_bootstrap_hydration=[...new Map(hydration.map(target=>[target.index+':'+target.uid,target])).values()];
 return result;
}
