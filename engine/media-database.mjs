// 统一媒体库契约：三个历史私有库（图鉴 tisya-media-atlas、手机原件
// tisya-phone-host-media、预览 tisya-phone-life-media）合并为单一 tisya-media，
// 各域一个 store。首次打开经框架一次性搬迁旧库原件（复制→条数核对→删旧库），
// 字节零丢失；此后旧库不再被任何读取路径打开。
import {openDatabase,openExistingDatabase,relocateLegacyDatabase} from './idb-framework.mjs';

export const MEDIA_DATABASE='tisya-media';
export const MEDIA_STORES=Object.freeze({atlasAssets:'atlas-assets',atlasBindings:'atlas-bindings',phoneAssets:'phone-assets',previewAssets:'phone-preview-assets'});

export function mediaDatabaseSchema(db){
 for(const name of Object.values(MEDIA_STORES))if(!db.objectStoreNames.contains(name))db.createObjectStore(name,{keyPath:'id'});
}

const LEGACY_SOURCES=Object.freeze([
 Object.freeze({from:'tisya-media-atlas',stores:Object.freeze([Object.freeze({from:'assets',to:MEDIA_STORES.atlasAssets}),Object.freeze({from:'bindings',to:MEDIA_STORES.atlasBindings})])}),
 Object.freeze({from:'tisya-phone-host-media',stores:Object.freeze([Object.freeze({from:'assets',to:MEDIA_STORES.phoneAssets})])}),
 Object.freeze({from:'tisya-phone-life-media',stores:Object.freeze([Object.freeze({from:'assets',to:MEDIA_STORES.previewAssets})])}),
]);

export async function relocateLegacyMediaDatabases({indexedDB,label='媒体'}){
 const results=[];
 for(const source of LEGACY_SOURCES)results.push(await relocateLegacyDatabase({indexedDB,from:source.from,stores:source.stores,target:{name:MEDIA_DATABASE,version:1,schema:mediaDatabaseSchema},label}));
 return results;
}

export async function openMediaDatabase({indexedDB,label='媒体',messages={},watchFor=null,onVersionChange=null}){
 await relocateLegacyMediaDatabases({indexedDB,label});
 return openDatabase({indexedDB,name:MEDIA_DATABASE,version:1,schema:mediaDatabaseSchema,label,messages,watchFor,onVersionChange});
}

// 只读探开：不创建库、不写入任何记录。唯一例外是旧库仍在时执行一次性框架搬迁
// （复制原件并核对后删旧库），除此之外 reading 路径绝不触碰旧库。
export async function openExistingMediaDatabase({indexedDB,label='媒体',messages={},requireStores=[],onVersionChange=null}){
 const existing=await openExistingDatabase({indexedDB,name:MEDIA_DATABASE,label,messages,requireStores,onVersionChange});
 if(existing)return existing;
 for(const source of LEGACY_SOURCES){
  const legacy=await openExistingDatabase({indexedDB,name:source.from,label,messages});
  if(!legacy)continue;
  legacy.close();
  return openMediaDatabase({indexedDB,label,messages,onVersionChange});
 }
 return null;
}
