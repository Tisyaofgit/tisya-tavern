import {configuredWorld,defaultWorld,validateConfig} from '../config/core.js';

export const GLOBAL_WORLD='tisya:global';
const copy=structuredClone;
// These are references to story objects, not plugin settings. They must never
// point into another story after changing the globally shared settings.
const localPaths=[['controller'],['focus'],['context','books'],['context','entries'],
  ...['focusObjects','focusText','playerObjects','originBook','sessionBook','originPins'].map(k=>['tables',k])];
const get=(o,p)=>p.reduce((v,k)=>v?.[k],o);
function put(o,p,v){const key=p.at(-1);for(const k of p.slice(0,-1))o=o[k]??={};if(v===undefined)delete o[key];else o[key]=copy(v);}
const scopeOf=(context,key)=>context.chatMetadata?.tisya_v3_books?.archiveId??'unbound:'+key;
export function projectGlobalConfiguration(data,key,context){
 const result=copy(data),shared=result.worlds[GLOBAL_WORLD];
 if(!shared)throw Error('全局创作配置缺失');
 const world=copy(shared),local=result.storyBindings?.[scopeOf(context,key)]??{};
 for(const path of localPaths){const value=get(local,path);if(value!==undefined)put(world,path,value);}
 result.worlds[key]=world;
 return result;
}
export function persistGlobalConfiguration(data,key,context){
 const result=copy(data),world=configuredWorld(result,key),shared=copy(world),local={};
 const defaults=defaultWorld();
 for(const path of localPaths){const value=get(world,path);if(value!==undefined)put(local,path,value);put(shared,path,get(defaults,path));}
 // One shared settings object; story references live under their stable archive.
 result.worlds={[GLOBAL_WORLD]:shared};
 result.storyBindings={...(result.storyBindings??{}),[scopeOf(context,key)]:local};
 validateConfig(result);return result;
}

export function validateGlobalConfiguration(data){
 validateConfig(data);
 if(!data.worlds[GLOBAL_WORLD]||Object.keys(data.worlds).length!==1)throw Error('配置书必须只保存一份全局创作配置');
 if(!data.storyBindings||typeof data.storyBindings!=='object'||Array.isArray(data.storyBindings))throw Error('故事引用索引损坏');
 for(const [scope,local]of Object.entries(data.storyBindings)){
   if(!local||typeof local!=='object'||Array.isArray(local))throw Error('故事引用格式无效');
   const fixture=projectGlobalConfiguration(data,'validation',{chatMetadata:{tisya_v3_books:{archiveId:scope}}});validateConfig(fixture);
   const known={};for(const path of localPaths){const value=get(local,path);if(value!==undefined)put(known,path,value);}
   if(JSON.stringify(known)!==JSON.stringify(local)){
     const stable=o=>o&&typeof o==='object'?Array.isArray(o)?o.map(stable):Object.fromEntries(Object.keys(o).sort().map(k=>[k,stable(o[k])])):o;
     if(JSON.stringify(stable(known))!==JSON.stringify(stable(local)))throw Error('故事引用中包含未登记的配置');
   }
 }
 return data;
}
