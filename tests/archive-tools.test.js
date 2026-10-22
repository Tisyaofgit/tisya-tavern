import {formatSimpleSheet,parseSimpleSheet} from '../tables/simple-sheet.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveToolDefinitions,registerArchiveQueryTools} from '../tables/archive-tools.js';
import {archiveProposalToolDefinition} from '../tables/archive-proposal.js';
test('archive wire schemas avoid numeric enums rejected by the observed Gemini relay',()=>{
 const visit=value=>{if(!value||typeof value!=='object')return;if(Array.isArray(value.enum))assert(value.enum.every(x=>typeof x==='string'),'provider requires string enum members');for(const child of Object.values(value))visit(child);};
 const definitions=[...archiveToolDefinitions(),archiveProposalToolDefinition()];for(const definition of definitions)visit(definition.parameters);
 const depth=definitions.find(x=>x.name==='tisya_list_archive').parameters.properties.depth;assert.equal(depth.type,'integer');assert.equal(depth.minimum,1);assert.equal(depth.maximum,1);
});
function fixture(){const registry=new Map();const host={ToolManager:{get tools(){return [...registry.values()];}},registerFunctionTool(def){registry.set(def.name,{def,toFunctionOpenAI:()=>({function:{name:def.name}})});},unregisterFunctionTool:name=>registry.delete(name)};let live=true,disposed=false;const calls=[];const session={...Object.fromEntries(archiveToolDefinitions().map(d=>[d.method,async input=>{calls.push({method:d.method,input});return {status:'ok',items:[]};}])),dispose:()=>disposed=true};return {host,session,registry,calls,isActive:()=>live,expire:()=>live=false,isDisposed:()=>disposed};}
test('archive tools register exactly four read-only operations and forward results without granting context parameters',async()=>{
 const f=fixture(),handle=registerArchiveQueryTools(f.host,f.session,{isActive:f.isActive});assert.equal(f.registry.size,4);assert(handle.definitions.every(d=>d.function.parameters.additionalProperties===false));
 const search=f.registry.get('tisya_search_archive').def;assert.equal(search.stealth,false);assert(search.shouldRegister());assert.deepEqual(parseSimpleSheet(await search.action({sheet:formatSimpleSheet({query:'旧约定'})})),{status:'ok',items:[]});assert.equal(f.calls[0].method,'search_archive');assert(!handle.definitions.some(d=>/propose|write|delete/.test(d.function.name)));
 const result=handle.dispose();assert.equal(result.removed.length,4);assert.equal(f.registry.size,0);assert(f.isDisposed());await assert.rejects(search.action({}),/已结束/);
});
test('registration refuses name collisions without replacing existing tools or disposing another session',()=>{
 const f=fixture();f.host.registerFunctionTool({name:'tisya_read_archive'});const original=f.registry.get('tisya_read_archive');assert.throws(()=>registerArchiveQueryTools(f.host,f.session,{isActive:f.isActive}),/同名/);assert.equal(f.registry.size,1);assert.equal(f.registry.get('tisya_read_archive'),original);assert(!f.isDisposed());
});
test('failed partial registration cleans only the registrations it owns',()=>{
 const f=fixture(),register=f.host.registerFunctionTool;f.host.registerFunctionTool=def=>{if(def.name==='tisya_search_archive')throw Error('宿主注册失败');register(def);};assert.throws(()=>registerArchiveQueryTools(f.host,f.session,{isActive:f.isActive}),/宿主注册失败/);assert.equal(f.registry.size,0);assert(f.isDisposed());
});
test('cleanup preserves a foreign replacement and late actions cannot deliver results after a turn switch',async()=>{
 const f=fixture();let release;f.session.read_archive=()=>new Promise(resolve=>release=resolve);const handle=registerArchiveQueryTools(f.host,f.session,{isActive:f.isActive}),action=f.registry.get('tisya_read_archive').def.action,pending=action({sheet:formatSimpleSheet({id:'a'})});f.expire();release({status:'ok',items:[{secret:'must not arrive'}]});await assert.rejects(pending,/结果未交付/);
 f.host.registerFunctionTool({name:'tisya_read_archive'});const foreign=f.registry.get('tisya_read_archive'),result=handle.dispose();assert.deepEqual(result.foreignLeft,['tisya_read_archive']);assert.equal(f.registry.get('tisya_read_archive'),foreign);assert.equal(f.registry.size,1);
});
