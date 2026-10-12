import {check} from './schema.js';
import {digest} from './books.js';
// Native vector backend owns credentials and embeddings. A dedicated collection
// stores only a rebuildable index; returned text is never accepted as a fact.
export function createNativeVectors({getContext,fetcher=(...args)=>fetch(...args)}){
 function options(){const s=getContext().extensionSettings?.vectors;check(s?.source,'请先配置原生“向量存储”扩展');const supported=['transformers','openai','cohere','togetherai','nomicai','mistral','electronhub','openrouter','chutes','nanogpt'];check(supported.includes(s.source),'此向量提供商尚未接入表单索引：'+s.source+'；可在原生设置中选择已支持提供商');const model=s[s.source+'_model'];check(['transformers','nomicai','mistral'].includes(s.source)||typeof model==='string'&&model,'原生向量模型未配置');return {source:s.source,...(model?{model}:{})};}
 async function call(path,body,signal){signal?.throwIfAborted();const r=await fetcher('/api/vector/'+path,{method:'POST',headers:getContext().getRequestHeaders(),body:JSON.stringify(body),signal});check(r.ok,'原生向量 '+path+' 失败（'+r.status+'），未降级为另一检索方式');return path==='insert'||path==='delete'?null:r.json();}
 async function search({scope,rows,query,topK,signal,guard=()=>{}}){
  if(!rows.length||!query.trim()||topK===0)return [];const opts=options(),signature=JSON.stringify(opts),collectionId='tisya-table-'+(await digest([scope,opts])).slice(0,32),map=new Map(),items=[];
  for(const [index,row]of rows.entries()){
   const text=JSON.stringify({id:row.id,rev:row.rev,values:row.values,access:row.access}),hash=parseInt((await digest(text)).slice(0,13),16);check(!map.has(hash),'向量键碰撞，索引未写入');map.set(hash,row);items.push({hash,text,index});
  }
  guard();const saved=await call('list',{...opts,collectionId},signal);check(Array.isArray(saved)&&saved.every(Number.isSafeInteger),'原生向量索引列表格式无效');
  const stale=saved.filter(h=>!map.has(h));if(stale.length)await call('delete',{...opts,collectionId,hashes:stale},signal);
  const known=new Set(saved),missing=items.filter(i=>!known.has(i.hash));for(let i=0;i<missing.length;i+=5){guard();await call('insert',{...opts,collectionId,items:missing.slice(i,i+5)},signal);}
  guard();check(JSON.stringify(options())===signature,'向量提供商或模型已改变，请重试');const result=await call('query',{...opts,collectionId,searchText:query,topK,threshold:0},signal);guard();check(JSON.stringify(options())===signature,'向量提供商或模型已改变，请重试');check(Array.isArray(result.hashes)&&result.hashes.every(h=>map.has(h)),'向量检索返回了失效来源，未使用旧内容');
  return [...new Set(result.hashes)].map(h=>map.get(h));
 }
 return {search};
}
