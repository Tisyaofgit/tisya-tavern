// Ephemeral derived data only. Complete keys, bounded memory, cached failures.
export function createDisplayCache({entries=64,units=4000000}={}){
 const rows=new Map();let size=0,hits=0,misses=0;
 return {read(key,compute){if(rows.has(key)){const row=rows.get(key);rows.delete(key);rows.set(key,row);hits++;if(row.error)throw row.error;return row.value;}misses++;let value,error;try{value=compute();}catch(e){error=e;}const cost=key.length+(error?0:JSON.stringify(value)?.length??0);if(cost<=units){while(rows.size&&(rows.size>=entries||size+cost>units)){const k=rows.keys().next().value;size-=rows.get(k).cost;rows.delete(k);}rows.set(key,{value,error,cost});size+=cost;}if(error)throw error;return value;},clear(){rows.clear();size=0;},report:()=>({entries:rows.size,units:size,hits,misses})};
}
