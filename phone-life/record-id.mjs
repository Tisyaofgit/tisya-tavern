// Allocate from the durable sequence while avoiding every id already present
// anywhere in the life state, including nested history and archived records.
export function nextRecordId(state,prefix){
 const used=new Set();
 const walk=value=>{
  if(!value||typeof value!=='object')return;
  if(typeof value.id==='string')used.add(value.id);
  for(const child of Object.values(value))walk(child);
 };
 walk(state);
 let id;
 do{id=`${prefix}-${++state.seq}`;}while(used.has(id));
 return id;
}
