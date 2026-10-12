import {parseDisplayEnvelope,strictJSON,validateMemoryProjection,validateMemoryLocator,projectJourneyEnvelope} from './reader-core.js';

// A sidecar grants access only to its exact existing native target. Invalid
// sidecars do not invalidate independently permissioned narrative records.
// This ephemeral projection is exclusively for display, never state or recall.
export function readJourney(source,options){
 const envelope=parseDisplayEnvelope(source),memory=envelope.blocks.memory.trim()?strictJSON(envelope.blocks.memory):null;
 if(memory?.protocol!=='tisya.lab.memory/5')throw Object.assign(Error('TISYA_JOURNEY_MEMORY_UNSUPPORTED'),{code:'TISYA_JOURNEY_MEMORY_UNSUPPORTED'});
 validateMemoryProjection({...memory,权限:[]},{body:envelope.blocks.body});
 if(!Array.isArray(memory.权限)||memory.权限.length>256)throw Object.assign(Error('TISYA_MEMORY5_LIST'),{code:'TISYA_MEMORY5_LIST'});
 const diagnostics=[],accepted=[],targets=new Map(),sidecarOnly={...memory,关联:[],关联权限:null,事件:[],未完事项:[],倒计时:[]};
 const key=row=>JSON.stringify([row?.区块,row?.定位]);
 for(const row of memory.权限)targets.set(key(row),(targets.get(key(row))??0)+1);
 for(const [index,row]of memory.权限.entries()){
  try{
   validateMemoryProjection({...sidecarOnly,权限:[row]});
   if(targets.get(key(row))>1)throw Object.assign(Error('TISYA_MEMORY5_ACL_DUPLICATE'),{code:'TISYA_MEMORY5_ACL_DUPLICATE'});
   validateMemoryLocator(row,envelope.blocks);
   accepted.push(row);
  }catch(error){
   const code=/^TIS(?:YA|HA)_[A-Z0-9_]+$/.test(error?.code??'')?error.code:'TISYA_READER_RECORD_INVALID';
   diagnostics.push({code,section:'权限',row:index+1});
  }
 }
 const status=strictJSON(envelope.blocks.status||'{}');
 for(const [type,objects]of Object.entries(status))if(type!=='叙事状态'){
  for(const [name,fields]of Object.entries(objects)){
   for(const field of Object.keys(fields))if(!accepted.some(row=>row.区块==='status'&&JSON.stringify(row.定位)===JSON.stringify([type,name,field]))){
    delete fields[field];diagnostics.push({code:'TISYA_MEMORY5_STATUS_PERMISSION_MISSING',section:'原生状态'});
   }
   if(!Object.keys(fields).length)delete objects[name];
  }
  if(!Object.keys(objects).length)delete status[type];
 }
 // vars is an external writer's payload, not a journey-reader state source.
 // Validate its sidecars above, then omit both from this display-only view.
 const view={...envelope,blocks:{...envelope.blocks,status:JSON.stringify(status),vars:'',memory:JSON.stringify({...memory,权限:accepted.filter(row=>row.区块!=='vars')})}};
 const result=projectJourneyEnvelope(view,options);
 return diagnostics.length?{...result,diagnostics}:result;
}
