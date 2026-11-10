import {createBuiltinBookInstaller} from './builtin-books.mjs';

export function createNativeBuiltinBooks({native,getContext,persistSettings,assertIdle=()=>{},fetchImpl=globalThis.fetch}){
 const readBook=async name=>{
  await native.flushWorldInfoSaves('tisya_builtin_books_read');
  const response=await fetchImpl('/api/worldinfo/get',{method:'POST',headers:getContext().getRequestHeaders(),body:JSON.stringify({name}),cache:'no-store'});
  if(!response.ok)throw Error('内置书读取失败：'+name+' ('+response.status+')');
  return response.json();
 };
 return createBuiltinBookInstaller({getContext,persistSettings,assertIdle,
  async listBooks(){await native.flushWorldInfoSaves('tisya_builtin_books_list');await native.updateWorldInfoList();return [...native.world_names];},
  readBook,async writeBook(name,data){assertIdle();await native.flushWorldInfoSaves('tisya_builtin_books_save');return native.saveWorldInfo(name,structuredClone(data),true);}
 });
}
