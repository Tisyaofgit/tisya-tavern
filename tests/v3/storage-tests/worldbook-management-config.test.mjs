import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../../package.json',import.meta.url));
const {build}=require('esbuild'),copy=v=>structuredClone(v);
/** Production management source, bundled with isolated native import boundaries. */
async function fixture({managed=false}={}){
 const database={Alpha:{entries:{0:{uid:0,content:'原文',extensions:managed?{tisyaBook:{id:'managed'}}:{}}}}},names=['Alpha'],calls=[],ctx={chatId:'chat',characterId:0,characters:[],chatMetadata:{},extensionSettings:{缇斯亚世界书:{bookOrder:['Alpha'],tags:{prefix:[],suffix:[]}}},getRequestHeaders:()=>({})};
 const authority={ready:true,revision:1,domains:{worldbookInterface:copy(ctx.extensionSettings.缇斯亚世界书)}};
 const configurationBook={read:()=>copy(authority),async saveDomain(name,value,expected){calls.push(['domain',name,copy(value)]);assert.equal(expected.revision,authority.revision);authority.domains[name]=copy(value);authority.revision++;ctx.extensionSettings.缇斯亚世界书=copy(value);return copy(authority);}};
 const native={world_info:{charLore:[]},selected_world_info:[],world_names:names,power_user:{persona_descriptions:{}},async updateWorldInfoList(){names.splice(0,names.length,...Object.keys(database));},async flushWorldInfoSaves(){},async saveWorldInfo(name,data){calls.push(['save',name]);database[name]=copy(data);},async deleteWorldInfo(name){calls.push(['delete',name]);delete database[name];return true;},getOneCharacter(){},select_selected_character(){},saveMetadata:async()=>true,download(){},importWorldInfo(){}};
 globalThis.__worldbookManagementFixture=native;const source=await readFile(new URL('../../../worldbook-management.js',import.meta.url),'utf8');
 const modules={'/scripts/world-info.js':['world_info','selected_world_info','world_names','updateWorldInfoList','flushWorldInfoSaves','saveWorldInfo','deleteWorldInfo','importWorldInfo'],'/scripts/power-user.js':['power_user'],'/script.js':['getOneCharacter','select_selected_character','saveMetadata'],'/scripts/utils.js':['download']};
 const bundled=await build({stdin:{contents:source,resolveDir:fileURLToPath(new URL('../../../',import.meta.url)),sourcefile:'worldbook-management.js'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'isolated-native-imports',setup(b){b.onResolve({filter:/^\/(?:scripts\/|script\.js)/},args=>({path:args.path,namespace:'native-fixture'}));b.onLoad({filter:/.*/,namespace:'native-fixture'},args=>({contents:(modules[args.path]??[]).map(name=>`export const ${name}=globalThis.__worldbookManagementFixture.${name};`).join('\n'),loader:'js'}));}}]});
 const {createWorldbookManagement}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text+'\n// '+crypto.randomUUID()).toString('base64'));
 const priorFetch=globalThis.fetch;globalThis.fetch=async(path,options)=>{const body=JSON.parse(options.body);if(path==='/api/worldinfo/get')return {ok:true,text:async()=>JSON.stringify(database[body.name])};if(path==='/api/worldinfo/sanitize-name')return {ok:true,text:async()=>JSON.stringify({name:body.name})};throw Error('Unexpected fixture request '+path);};
 const manager=createWorldbookManagement({getContext:()=>ctx,persistSettings:async()=>{calls.push(['native-settings']);return true;},configurationBook});return {manager,database,calls,ctx,authority,close:()=>{globalThis.fetch=priorFetch;delete globalThis.__worldbookManagementFixture;}};
}

test('ordinary worldbook rename routes plugin order through the versioned configuration service',async()=>{
 const f=await fixture();try{const impact=await f.manager.impact('Alpha');const result=await f.manager.rename({name:'Alpha',newName:'Renamed',confirm:'Alpha',impact});assert.equal(result.name,'Renamed');assert.equal(f.database.Alpha,undefined);assert.equal(f.database.Renamed.entries[0].content,'原文');assert.equal(f.calls.filter(row=>row[0]==='domain').length,1);assert.deepEqual(f.authority.domains.worldbookInterface.bookOrder,['Renamed']);assert.deepEqual(f.ctx.extensionSettings.缇斯亚世界书.bookOrder,['Renamed']);}finally{f.close();}
});

test('managed archive/origin/core physical rename is rejected before file or linkage writes',async()=>{
 const f=await fixture({managed:true});try{const impact=await f.manager.impact('Alpha');await assert.rejects(f.manager.rename({name:'Alpha',newName:'Clone',confirm:'Alpha',impact}),/资料绑定/);assert.deepEqual(Object.keys(f.database),['Alpha']);assert.deepEqual(f.calls,[]);}finally{f.close();}
});

test('managed archive/origin/core deletion is rejected while ordinary deletion remains available',async()=>{
 let f=await fixture({managed:true});try{const impact=await f.manager.impact('Alpha');await assert.rejects(f.manager.remove({name:'Alpha',confirm:'Alpha',impact}),/不能在普通世界书页删除/);assert.deepEqual(f.calls,[]);}finally{f.close();}
 f=await fixture();try{const impact=await f.manager.impact('Alpha');await f.manager.remove({name:'Alpha',confirm:'Alpha',impact});assert.deepEqual(Object.keys(f.database),[]);assert.equal(f.calls.filter(row=>row[0]==='delete').length,1);}finally{f.close();}
});
