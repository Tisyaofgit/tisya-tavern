import {fail} from './common.mjs';

export const PHONE_CLOCK_TABLE='X_WORLD_CLOCKS';
const validId=value=>typeof value==='string'&&value.trim().length>0;

// Return a same-world row or an unused ID for explicit initialization.
// Never repair a dangling binding by choosing a different clock.
export function selectPhoneWorldClock(state,worldId,options={}){
 if(!validId(worldId))fail('PHONE_DATABASE_CLOCK_SCOPE','手机世界标识缺失，不能选择世界时钟');
 const rows=state?.tables?.[PHONE_CLOCK_TABLE]??{};
 if(!rows||typeof rows!=='object'||Array.isArray(rows))fail('PHONE_DATABASE_CLOCK','世界时钟表格式无效');
 const checked=recordId=>{
  if(!validId(recordId))fail('PHONE_DATABASE_CLOCK','世界时钟绑定标识无效');
  const row=Object.hasOwn(rows,recordId)?rows[recordId]:null;
  if(!row||!row.values||typeof row.values!=='object'||Array.isArray(row.values))fail('PHONE_DATABASE_CLOCK','世界时钟绑定不存在',{recordId});
  const status=row.states?.world_ref;
  if(row.values.world_ref!==worldId||(status!==undefined&&!['known','derived'].includes(status)))
   fail('PHONE_DATABASE_CLOCK_SCOPE','世界时钟不属于当前手机世界或所属世界尚未确认',{recordId,worldId,clockWorld:row.values.world_ref??null,state:status??null});
  return {recordId,row};
 };
 if(Object.hasOwn(options,'recordId'))return checked(options.recordId);
 const active=state?.runtime?.calendar_record_id;
 if(active!==undefined&&active!==null)return checked(active);
 const matches=Object.entries(rows).filter(([,row])=>row?.values?.world_ref===worldId);
 if(matches.length>1)fail('PHONE_DATABASE_CLOCK_AMBIGUOUS','当前世界存在多个时钟，请显式选择',{worldId,recordIds:matches.map(([id])=>id)});
 if(matches.length===1)return checked(matches[0][0]);
 const recordId='world-clock:'+worldId;
 if(Object.hasOwn(rows,recordId))return checked(recordId);
 return {recordId,row:null};
}

export function readPhoneWorldClock(state,worldId,binding){
 if(!binding||binding.tableId!==PHONE_CLOCK_TABLE)fail('PHONE_DATABASE_CLOCK','手机时钟必须绑定统一世界时钟表');
 return selectPhoneWorldClock(state,worldId,{recordId:binding.recordId});
}
