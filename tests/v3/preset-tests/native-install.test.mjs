import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {ensureInstalledPreset,readInstalledPreset} from '../../../v3/preset-install.mjs';
import {createRuntimePreset} from '../../../v3/preset-template.mjs';
const methods=fs.readFileSync(new URL('../native-fixtures/preset-manager-methods.js',import.meta.url),'utf8');
// The DOM/network are fixtures. Preset save/list/select/lookup execute the extracted host methods.
function nativeFixture(old){
 const disk=new Map(old?[['Tisya',structuredClone(old)]]:[]),presets=old?[structuredClone(old)]:[],preset_names=old?{Tisya:0}:{},select={value:old?'0':'',options:old?[{value:'0',text:'Tisya',selected:true}]:[]},calls=[],listeners=new Set();let application=Promise.resolve(),failName=null;
 const settings={openai_model:'original-model',custom_url:'original-endpoint',bind_preset_to_connection:true};
 function query(nodes){return {find(selector){return query(nodes.flatMap(n=>n.options??[]).filter(n=>selector.includes('selected')?n.selected:selector.includes('value=')?n.value===/value="([^"]*)"/.exec(selector)[1]:true));},filter(fn){return query(nodes.filter(n=>fn.call(n)));},text(){return nodes[0]?.text;},map(fn){return {toArray:()=>nodes.map((n,i)=>fn(i,n))};},val(v){if(v===undefined)return nodes[0]?.value;for(const n of nodes){n.value=String(v);for(const o of n.options??[])o.selected=o.value===String(v);}return this;},prop(k,v){for(const n of nodes)n[k]=v;return this;},append(q){for(const n of nodes)n.options.push(...q.nodes);return this;},trigger(){application=application.then(async()=>{const name=select.options.find(o=>o.selected)?.text,preset=structuredClone(presets[preset_names[name]]);const change={presetName:name,preset,settings,settingsToUpdate:{openai_model:['#model','openai_model',false,true],custom_url:['#url','custom_url',false,true]}};for(const fn of listeners)await fn(change);Object.assign(settings,preset);});return this;},nodes};}
 const $=(value,props)=>typeof value==='string'?query([{...props,value:String(props.value)}]):query([value]);
 const realm=vm.createContext({structuredClone,console,$,getPresetApplicationPromise:()=>application,getRequestHeaders:()=>({'content-type':'application/json'}),t:parts=>parts.join(''),toastr:{error(){}},fetch:async(url,init)=>{assert.equal(url,'/api/presets/save');const data=JSON.parse(init.body);calls.push(data);assert.equal(data.apiId,'openai');if(data.name===failName)return {ok:false};disk.set(data.name,structuredClone(data.preset));return {ok:true,json:async()=>({name:data.name})};}});
 vm.runInContext(methods,realm);const manager=new realm.NativePresetManager();manager.apiId='openai';manager.select=select;manager.getPresetList=()=>({presets,preset_names});
 const context={getPresetManager:()=>manager,chatCompletionSettings:settings,eventTypes:{OAI_PRESET_CHANGED_BEFORE:'before'},eventSource:{on:(_,f)=>listeners.add(f),removeListener:(_,f)=>listeners.delete(f)}};
 return {context,manager,disk,calls,settings,getContext:()=>context,fail:name=>failName=name};
}
test('actual host preset methods install once, preserve connection, and reload the managed data without an auxiliary import',async()=>{
 const f=nativeFixture();const r=await ensureInstalledPreset(f);assert.equal(r.status,'installed');assert.equal(f.manager.getSelectedPresetName(),'Tisya');assert.deepEqual([...f.disk.keys()],['Tisya']);assert.equal(f.settings.openai_model,'original-model');assert.equal(f.settings.custom_url,'original-endpoint');assert.equal(f.calls.length,1);await ensureInstalledPreset(f);assert.equal(f.calls.length,1);const restarted=nativeFixture(f.disk.get('Tisya'));assert.equal((await ensureInstalledPreset(restarted)).status,'current');assert.equal(readInstalledPreset(restarted.context).prompts.find(p=>p.identifier==='tisya_material_user_identity').content,'{{tisya_v3:tisya_material_user_identity}}');
});
test('actual host save rejects failed upgrade after a durable backup without replacing the existing preset',async()=>{
 const old=createRuntimePreset('writer');old.extensions.tisya.version='older';old.prompts[1].content='user-edit';const f=nativeFixture(old);f.fail('Tisya');await assert.rejects(ensureInstalledPreset(f),/could not be saved/);assert.equal(f.disk.get('Tisya').prompts[1].content,'user-edit');assert.equal(f.disk.size,2);assert.equal(f.calls[0].preset.prompts[1].content,'user-edit');assert.equal(f.manager.getSelectedPresetName(),'Tisya');
});
