import {uuid5} from './uuid.mjs';
export class EngineError extends Error {
 constructor(code,message,details={}){super(message);this.code=code;this.details=details;}
 toJSON(){return {code:this.code,message:this.message,details:this.details};}
}
export const fail=(code,message,details)=>{throw new EngineError(code,message,details);};
export const clone=v=>structuredClone(v);
// Persisted engine states and journal patches are acyclic JSON. JSON snapshots
// avoid the higher structured-clone overhead without changing general values.
export const cloneJson=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
export const own=(o,k)=>Object.hasOwn(o??{},k);
export const stable=v=>{
 const stack=new Set();
 function write(x){
  if(x&&typeof x.toJSON==='function')x=x.toJSON();if(x===null||typeof x!=='object')return JSON.stringify(x);if(stack.has(x))throw new TypeError('Converting circular structure to JSON');stack.add(x);let out;
  if(Array.isArray(x))out='['+x.map(item=>write(item)??'null').join(',')+']';else{const parts=[];for(const key of Object.keys(x).sort()){const text=write(x[key]);if(text!==undefined)parts.push(JSON.stringify(key)+':'+text);}out='{'+parts.join(',')+'}';}
  stack.delete(x);return out;
 }
 return write(v);
};
const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
// The streaming form lets callers hash growing canonical prefixes without
// rereading every earlier message. digest(suffix) never mutates the prefix.
export function createSha256(){
 const state={h:[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19],buffer:new Uint8Array(64),used:0,length:0,w:new Uint32Array(64)};
 function compress(s,d,off){
  const {h,w}=s;for(let i=0;i<16;i++)w[i]=d.getUint32(off+4*i);for(let i=16;i<64;i++){const a=w[i-15],z=w[i-2];w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(z,17)^rotr(z,19)^(z>>>10)))>>>0;}
  let [a,c,e,g,j,k,l,m]=h;for(let i=0;i<64;i++){const t1=(m+(rotr(j,6)^rotr(j,11)^rotr(j,25))+((j&k)^(~j&l))+K[i]+w[i])>>>0,t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&c)^(a&e)^(c&e)))>>>0;m=l;l=k;k=j;j=(g+t1)>>>0;g=e;e=c;c=a;a=(t1+t2)>>>0;}[a,c,e,g,j,k,l,m].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
 }
 function update(s,input){
  const raw=typeof input==='string'?new TextEncoder().encode(input):input;s.length+=raw.length;let offset=0;
  if(s.used){const take=Math.min(64-s.used,raw.length);s.buffer.set(raw.subarray(0,take),s.used);s.used+=take;offset=take;if(s.used===64){compress(s,new DataView(s.buffer.buffer),0);s.used=0;}}
  if(offset<raw.length){const d=new DataView(raw.buffer,raw.byteOffset,raw.byteLength);while(offset+64<=raw.length){compress(s,d,offset);offset+=64;}if(offset<raw.length){s.buffer.set(raw.subarray(offset));s.used=raw.length-offset;}}
 }
 const api={update(input){update(state,input);return api;},digest(suffix=''){
  const s={...state,h:[...state.h],buffer:state.buffer.slice(),w:new Uint32Array(64)};if(suffix)update(s,suffix);const n=Math.ceil((s.used+9)/64)*64,tail=new Uint8Array(n);tail.set(s.buffer.subarray(0,s.used));tail[s.used]=128;const d=new DataView(tail.buffer);d.setUint32(n-8,Math.floor(s.length/0x20000000));d.setUint32(n-4,(s.length*8)>>>0);for(let off=0;off<n;off+=64)compress(s,d,off);return s.h.map(v=>v.toString(16).padStart(8,'0')).join('');
 }};
 return api;
}
export const sha256=input=>createSha256().update(input).digest();
export async function sha256Async(input){
 const raw=typeof input==='string'?new TextEncoder().encode(input):input,subtle=globalThis.crypto?.subtle;
 if(subtle){const bytes=await subtle.digest('SHA-256',raw);return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');}
 // Insecure HTTP hosts do not expose SubtleCrypto. Keep the identical fallback
 // hash, but yield between bounded chunks instead of freezing the whole UI.
 const engine=createSha256(),size=256*1024;
 for(let offset=0;offset<raw.length;offset+=size){engine.update(raw.subarray(offset,Math.min(offset+size,raw.length)));if(offset+size<raw.length)await new Promise(resolve=>setTimeout(resolve,0));}
 return engine.digest();
}
export const digest=v=>sha256(stable(v));
export const digestAsync=v=>sha256Async(stable(v));
export const stableId=v=>uuid5(typeof v==='string'?v:digest(v));
export const asError=e=>e?.toJSON?.()??{code:e?.code??'EXECUTION_ERROR',message:String(e?.message??e)};
export function decimal(a,b,op='+'){
 const parts=v=>{const [m,e='0']=String(v).split('e'),d=(m.split('.')[1]??'').length-Number(e);return [BigInt(m.replace('.','')),d];};
 if(!Number.isFinite(a)||!Number.isFinite(b))fail('NUMBER_TYPE','需要有限数字');
 const [x,dx]=parts(a),[y,dy]=parts(b);let v;
 if(op==='*')v=Number(x*y)*10**(-dx-dy);else{const d=Math.max(dx,dy);v=Number(x*10n**BigInt(d-dx)+(op==='-'?-y:y)*10n**BigInt(d-dy))*10**(-d);}
 if(!Number.isFinite(v))fail('NONFINITE','运算结果不是有限数字');return Number(v.toPrecision(15));
}
export function decode(raw,spec={}){
 const type=(spec.type??'TEXT').toUpperCase();if(raw==null)return [null,'unset'];if(raw===''){if(['TEXT','LONG_TEXT','LONGTEXT'].includes(type)||type==='ENUM'&&(spec.enum??spec.options)?.includes(''))return ['','known'];return [null,'unset'];}
 if(typeof raw==='string'&&own({'?':1,'~':1,'!':1,'∅':1,'—':1},raw))return [null,{'?':'unknown','~':'unset','!':'cleared','∅':'none','—':'not_applicable'}[raw]];
 if(['NUMBER','INTEGER','INT','DECIMAL','FLOAT','RATIO'].includes(type)){
  let v=raw;if(typeof v==='string'){const m=/^([+-]?\d+(?:\.\d+)?)(?:\/([+-]?\d+(?:\.\d+)?))?$/.exec(v.trim());if(!m)fail('NUMBER_TYPE','数字字段需要数字',{field:spec.key,value:raw});v=Number(m[1]);}
  if(typeof v!=='number'||!Number.isFinite(v))fail('NUMBER_TYPE','需要有限数字',{field:spec.key});if(['INT','INTEGER'].includes(type)&&!Number.isSafeInteger(v))fail('INTEGER_TYPE','需要安全整数',{field:spec.key});
  if(spec.minimum!=null&&v<spec.minimum||spec.maximum!=null&&v>spec.maximum)fail('RANGE','数值超出字段范围',{field:spec.key,value:v});return [v,'known'];
 }
 if(['BOOL','BOOLEAN'].includes(type)){if(typeof raw==='boolean')return [raw,'known'];if(['TRUE','是'].includes(String(raw).toUpperCase()))return [true,'known'];if(['FALSE','否'].includes(String(raw).toUpperCase()))return [false,'known'];fail('BOOLEAN_TYPE','请填写TRUE/FALSE或是/否');}
 if(type==='BAG'){
  let bag;if(raw&&typeof raw==='object'&&!Array.isArray(raw))bag=clone(raw);else if(['[]','{}','无','空'].includes(String(raw).trim()))bag={};else if(String(raw).trim().startsWith('{'))bag=JSON.parse(raw);else{bag={};for(const p of String(raw).replace(/^\[|\]$/g,'').split(/[;,；，]/)){if(!p.trim())continue;const m=/^(.+?)(?:[×*]\s*(\d+(?:\.\d+)?))?$/.exec(p.trim());if(!m)fail('BAG_SYNTAX','物品数量格式错误');bag[m[1].trim()]=decimal(bag[m[1].trim()]??0,Number(m[2]??1));}}
  if(!bag||Array.isArray(bag)||typeof bag!=='object'||Object.values(bag).some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0))fail('BAG_QUANTITY','物品数量须为非负有限数字');return [Object.fromEntries(Object.entries(bag).filter(([,v])=>v!==0)),'known'];
 }
 if(type==='TAGS'){
  if(Array.isArray(raw))return [clone(raw),'known'];let a;if(/^\s*\[(?:\{|\")/.test(raw))a=JSON.parse(raw);else a=String(raw).replace(/^\[|\]$/g,'').split(/[,，;；]/).map(s=>s.trim()).filter(s=>s&&!['正常','无'].includes(s)).map(s=>{const m=/^(.+?)\((\d+(?:\.\d+)?)([dhmt])\)$/i.exec(s);return m?{name:m[1],duration:Number(m[2]),unit:m[3].toLowerCase()}:{name:s};});
  if(!Array.isArray(a)||a.some(v=>typeof v!=='string'&&(!v||typeof v!=='object')))fail('TAGS_TYPE','状态标签格式错误');return [a.map(v=>typeof v==='string'?{name:v}:v),'known'];
 }
 if(['JSON','ARRAY','OBJECT','REF_LIST','TEXT_LIST'].includes(type)||type==='CHILD_REF'&&(typeof raw==='object'||/^\s*[\[{]/.test(raw))){const v=typeof raw==='string'?JSON.parse(raw):clone(raw);if(['ARRAY','REF_LIST','TEXT_LIST'].includes(type)&&!Array.isArray(v))fail('ARRAY_TYPE','需要数组');if(type==='OBJECT'&&(!v||typeof v!=='object'||Array.isArray(v)))fail('OBJECT_TYPE','需要对象');return [v,'known'];}
 if(type==='ENUM'&&(spec.enum??spec.options)){if(!(spec.enum??spec.options).includes(raw))fail('ENUM_VALUE','值不在注册选项中',{field:spec.key,value:raw});return [raw,'known'];}if(typeof raw!=='string')fail('TEXT_TYPE','文本和ID字段需要文字',{field:spec.key});return [raw,'known'];
}
