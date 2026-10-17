// Immutable capability definitions; executable strategies are supplied by code.
// No configuration eval, storage ownership or implicit fallback lives here.
function immutable(value){
 if(Array.isArray(value))return Object.freeze(value.map(immutable));
 if(value&&typeof value==='object'){
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)throw Error('能力定义须为普通数据与函数');
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key,item])=>[key,immutable(item)])));
 }
 return value;
}
export function createCapabilityRegistry(definitions,{key='id',label='能力',validate=()=>{}}={}){
 const bank=new Map();
 for(const input of definitions){
  const id=input?.[key];
  if(typeof id!=='string'||!id.trim()||bank.has(id))throw Error(label+'身份无效或重复：'+id);
  validate(input);
  bank.set(id,immutable(input));
 }
 return Object.freeze({
  definitions:Object.freeze([...bank.values()]),
  has:id=>bank.has(id),
  get(id){if(!bank.has(id))throw Error(label+'未登记：'+id);return bank.get(id);}
 });
}
