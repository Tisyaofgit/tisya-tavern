// One reusable, derived workspace for exact immutable message text. No owner,
// permissions, archive receipts or mutable host state are cached here. Consumers
// keep their own stable identities and validate their live scope independently.
export function createMessageWorkspace({entries=Infinity,units=Infinity,slots=Infinity}={}){
 const rows=new Map();let size=0,hits=0,misses=0;
 const drop=key=>{const row=rows.get(key);if(row){size-=row.cost;rows.delete(key);}};
 const trim=()=>{while(rows.size&&(rows.size>entries||size>units))drop(rows.keys().next().value);};
 function rowFor(source){let row=rows.get(source);if(row){rows.delete(source);rows.set(source,row);return row;}row={source,cost:source.length,values:new Map()};if(source.length<=units){rows.set(source,row);size+=row.cost;trim();}return row;}
 function read(source,kind,compute){
  if(typeof source!=='string')throw TypeError('Message workspace requires exact source text');
  const row=rowFor(source);if(row.values.has(kind)){hits++;return row.values.get(kind).value;}misses++;
  const value=compute(),cell={value,cost:0};row.values.set(kind,cell);
  while(row.values.size>slots){const key=row.values.keys().next().value,old=row.values.get(key);row.values.delete(key);row.cost-=old.cost;if(rows.get(source)===row)size-=old.cost;}
  const accepted=result=>{if(row.values.get(kind)!==cell)return;cell.result=result;cell.complete=true;cell.cost=kind.length+(typeof result==='string'?result.length:JSON.stringify(result)?.length??0);row.cost+=cell.cost;if(rows.get(source)===row){size+=cell.cost;trim();}};
  if(value&&typeof value.then==='function')Promise.resolve(value).then(accepted,()=>{if(row.values.get(kind)===cell)row.values.delete(kind);});else accepted(value);
  return value;
 }
 return {read,snapshot(source){const row=rows.get(source);if(!row)return [];return [...row.values].filter(([,cell])=>cell.complete).map(([kind,cell])=>[kind,structuredClone(cell.result)]);},restore(source,values){if(!Array.isArray(values)||values.some(row=>!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'))throw TypeError('Invalid derived message snapshot');for(const [kind,value]of values)read(source,kind,()=>structuredClone(value));},clear(){rows.clear();size=0;},report:()=>({entries:rows.size,units:size,hits,misses})};
}
export const messageWorkspace=createMessageWorkspace();
