// Display codes do not replace canonical UUIDs. Legacy rows receive a stable
// append-order projection; the code is persisted when that row is next edited.
export function eventCodes(state){
 const rows=Object.entries(state.tables?.T_DYN_EVENTS??{}),codes=new Map(),used=new Set();
 for(const [id,row]of rows){const code=String(row.values?.short_code??'').trim();if(code){codes.set(id,code);used.add(code);}}
 let next=1;
 for(const [id]of rows)if(!codes.has(id)){while(used.has(String(next).padStart(2,'0')))next++;const code=String(next++).padStart(2,'0');codes.set(id,code);used.add(code);}
 return codes;
}
export const identityFieldHidden=(table,key)=>table==='T_DYN_EVENTS'&&key==='title'||table==='T_DYN_RELATIONS_PACTS'&&key==='name';
export function recordIdentityLabel(state,table,id,{read, codes=eventCodes(state)}={}){
 const value=(t,i,k)=>read?read(t,i,k):state.tables?.[t]?.[i]?.values?.[k];
 if(table==='T_DYN_EVENTS')return codes.get(id);
 if(table==='T_DYN_RELATIONS_PACTS'){
  const name=i=>value('T_SYS_ENTITIES',i,'name')??value('T_SYS_ENTITIES',i,'instance_name');
  const a=name(value(table,id,'subject_ref')),b=name(value(table,id,'target_ref'));
  if(a&&b)return a+' → '+b;
 }
 return value(table,id,'name')??value(table,id,'label')??value(table,id,'title')??value(table,id,'instance_name');
}
