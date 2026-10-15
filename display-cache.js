// Ephemeral derived data only. Complete keys, bounded memory, cached failures.
export function createDisplayCache({entries=64,units=4000000,onWrite=()=>{}}={}){
 const rows=new Map();let size=0,hits=0,misses=0;
 const put=(key,value,error)=>{const cost=key.length+(error?0:JSON.stringify(value)?.length??0);if(cost>units)return;while(rows.size&&(rows.size>=entries||size+cost>units)){const k=rows.keys().next().value;size-=rows.get(k).cost;rows.delete(k);}rows.set(key,{value,error,cost});size+=cost;};
 return {read(key,compute){if(rows.has(key)){const row=rows.get(key);rows.delete(key);rows.set(key,row);hits++;if(row.error)throw row.error;return row.value;}misses++;let value,error;try{value=compute();}catch(e){error=e;}put(key,value,error);onWrite();if(error)throw error;return value;},
 snapshot:()=>[...rows].filter(([,r])=>!r.error).map(([key,r])=>({key,value:r.value})),
 restore(saved){if(!Array.isArray(saved))throw Error('本地显示缓存格式无效');for(const r of saved){if(!r||typeof r.key!=='string'||!Object.hasOwn(r,'value'))throw Error('本地显示缓存条目无效');if(!rows.has(r.key))put(r.key,r.value);}return rows.size;},
 clear(){rows.clear();size=0;},report:()=>({entries:rows.size,units:size,hits,misses})};
}
