const EXPECTED='b68d6b9e4f3607fad79ab20c744092139aa64590a0c82354d31361929aa3afcb';
const FILE=`tisya-font-${EXPECTED}.woff2`;
const LOCAL=`/user/files/${FILE}`;
export async function loadReadingFont({urls,headers,onState=()=>{},fetcher=fetch,cryptoApi=crypto,Font=FontFace,fonts=document.fonts,signal}) {
 const alive=()=>{if(signal?.aborted)throw Error('字体加载已取消');};
 const verify=async bytes=>{
  alive();
  const hash=[...new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  alive();if(hash!==EXPECTED)throw Error('字体校验不符，未启用');return bytes;
 };
 const activate=async bytes=>{await verify(bytes);const face=new Font('TisyaReading',bytes);await face.load();if(signal?.aborted)throw Error('字体加载已取消');fonts.add(face);onState('本地字体已启用');return ()=>fonts.delete(face);};
 const read=async()=>{const r=await fetcher(LOCAL,{signal,cache:'no-store'});if(r.status===404)return null;if(!r.ok)throw Error(`读取本地字体失败 (${r.status})`);return verify(await r.arrayBuffer());};
 onState('正在检查本地字体');
 const existing=await read();if(existing)return activate(existing);
 if(!Array.isArray(urls)||!urls.length)throw Error('字体下载地址尚未配置');
 const parts=[];let length=0;
 for(let i=0;i<urls.length;i++){
  alive();onState(`下载字体 ${i+1}/${urls.length}`);const r=await fetcher(urls[i],{signal});if(!r.ok)throw Error(`字体下载失败 (${r.status})`);
  const bytes=new Uint8Array(await r.arrayBuffer());length+=bytes.length;if(length>20000000)throw Error('字体文件超出大小限制');parts.push(bytes);
 }
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}await verify(bytes);
 alive();onState('正在保存本地字体');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 const saved=await fetcher('/api/files/upload',{method:'POST',signal,headers:headers(),body:JSON.stringify({name:FILE,data:btoa(binary)})});
 if(!saved.ok)throw Error(`字体保存失败 (${saved.status})`);const result=await saved.json();if(result.path!==LOCAL)throw Error('字体保存回执路径不符');
 const persisted=await read();if(!persisted)throw Error('字体保存后未能读回');return activate(persisted);
}
