export const FONT_LIMIT=40*1024*1024;
export function inspectFont(bytes) {
  const a=new Uint8Array(bytes);if(a.length<12||a.length>FONT_LIMIT)throw Error('字体大小须为12字节至40MB');
  const sig=String.fromCharCode(...a.slice(0,4));
  if(!['wOFF','wOF2','OTTO','true'].includes(sig)&&!(a[0]===0&&a[1]===1&&a[2]===0&&a[3]===0))throw Error('不是可识别的字体文件，请导入 TTF、OTF、WOFF 或 WOFF2');
  return sig==='wOF2'?'woff2':sig==='wOFF'?'woff':sig==='OTTO'?'otf':'ttf';
}
export function fontURL(value) {
  let url;try{url=new URL(value);}catch{throw Error('请输入完整的 HTTPS 字体文件地址');}
  if(url.protocol!=='https:'||url.username||url.password)throw Error('请使用不含账号密码的 HTTPS 字体文件地址');
  return url.href;
}
export async function fetchBytes(url,{signal,limit=FONT_LIMIT,fetcher=fetch}={}) {
  const target=fontURL(url);let r;try{r=await fetcher(target,{signal,credentials:'omit',referrerPolicy:'no-referrer'});}catch(error){if(signal?.aborted)throw Error('字体下载已取消');throw new Error('字体下载未成功，请检查网络或来源的跨域权限；也可以下载字体后从本地导入。',{cause:error});}
  if(!r.ok)throw Error(`下载失败（${r.status}）`);
  const declared=Number(r.headers.get('content-length')||0);if(declared>limit)throw Error('文件超出大小限制');
  if(!r.body?.getReader){const b=await r.arrayBuffer();if(b.byteLength>limit)throw Error('文件超出大小限制');return b;}
  const reader=r.body.getReader(),parts=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error('文件超出大小限制');parts.push(value);}}
  catch(error){await reader.cancel().catch(()=>{});throw error;}
  const all=new Uint8Array(size);let offset=0;for(const part of parts){all.set(part,offset);offset+=part.length;}return all.buffer;
}
export async function prepareFont(bytes,{name,source,license='',Font=FontFace,cryptoApi=crypto}={}) {
  const format=inspectFont(bytes),hash=[...new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const family='TisyaCustom_'+hash.slice(0,20),face=new Font(family,bytes,{display:'swap'});await face.load();
  return {record:{id:hash,name:String(name||'本地字体').slice(0,120),source,license,format,bytes,family,added:new Date().toISOString()},face};
}
export async function downloadGoogleFont(entry,catalog,{signal,fetcher=fetch,Font=FontFace,cryptoApi=crypto}={}) {
  if(!entry.license)throw Error('该字体缺少已登记许可，暂不能保存');
  const raw=path=>'https://raw.githubusercontent.com/google/fonts/'+catalog.commit+'/'+path.split('/').map(encodeURIComponent).join('/');
  const results=await Promise.all([
    fetchBytes(raw(entry.file.path),{signal,fetcher}),
    fetchBytes(raw(entry.license),{signal,fetcher,limit:1024*1024}),
    entry.metadata?fetchBytes(raw(entry.metadata),{signal,fetcher,limit:1024*1024}):Promise.resolve(null)
  ]);
  if(!/^[a-f0-9]{40}$/.test(entry.file.sha))throw Error('官方字体目录校验值缺失');
  const header=new TextEncoder().encode('blob '+results[0].byteLength+'\0'),gitBytes=new Uint8Array(header.length+results[0].byteLength);gitBytes.set(header);gitBytes.set(new Uint8Array(results[0]),header.length);
  const blobHash=[...new Uint8Array(await cryptoApi.subtle.digest('SHA-1',gitBytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(blobHash!==entry.file.sha)throw Error('官方字体内容与目录不符，未保存');
  const license=new TextDecoder().decode(results[1]);if(!license.trim())throw Error('字体许可为空，未保存');
  const official=results[2]?new TextDecoder().decode(results[2]).match(/^name:\s*"([^"]+)"/m)?.[1]:null;
  return prepareFont(results[0],{name:official||entry.name,source:{kind:'google',commit:catalog.commit,url:raw(entry.file.path),licenseURL:raw(entry.license)},license,Font,cryptoApi});
}
