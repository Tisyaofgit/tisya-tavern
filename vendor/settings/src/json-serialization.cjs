'use strict';
// Two declared contracts: native JSON semantics vs recursive validated JSON.
// Keeping the distinction preserves undefined/sparse/toJSON boundaries.
function canonical(value,{recursive=false}={}){
 if(!recursive)return JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(v=>canonical(v,{recursive:true})).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k],{recursive:true})).join(',')+'}';
}
const recursiveCanonical=value=>canonical(value,{recursive:true});
async function digest(value,{rawString=true,serialize=canonical}={}){
 const bytes=new TextEncoder().encode(rawString&&typeof value==='string'?value:serialize(value));
 return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
}
const jsonClone=value=>JSON.parse(JSON.stringify(value));
module.exports={canonical,recursiveCanonical,digest,jsonClone};
