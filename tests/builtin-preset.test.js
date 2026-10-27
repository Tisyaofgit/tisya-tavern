import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import bundled from '../presets/Tisya.json' with {type:'json'};
import original from '../presets/Tisya-One-Pass-1.json' with {type:'json'};
import {installBuiltInPreset,BUILTIN_PRESET_REVISION} from '../builtin-preset.js';
const copy=x=>structuredClone(x);
function fixture({selected='Other',existing=true,failSave=false,silentRefresh=false}={}){
 const w=new Window(),document=w.document;document.body.innerHTML='<select id="presets"></select><input id="bind_preset_to_connection" type="checkbox" checked>';
 const select=document.querySelector('select'),disk=new Map([['Other',{prompts:[{content:'unrelated'}],extensions:{other:true}}]]);
 if(existing)disk.set('Tisya',{prompts:[{identifier:'old',content:'old'}],prompt_order:[],temperature:.2,custom_model:'stored-model',extensions:{tisya:{worldbooks:['saved-book']},userNote:'saved'}});
 const list={presets:[...disk.values()].map(copy),preset_names:Object.fromEntries([...disk.keys()].map((name,i)=>[name,i]))};
 for(const [name,i] of Object.entries(list.preset_names)){const option=document.createElement('option');option.value=String(i);option.textContent=name;select.appendChild(option);}select.value=String(list.preset_names[selected]);
 const events=new Map(),emit=async(e,data)=>{for(const fn of [...(events.get(e)??[])])await fn(data);};let saves=0,refreshes=0;
 const context={chatCompletionSettings:{prompts:[{content:'live draft'}],prompt_order:[],custom_model:'live-model',temp_openai:.8,bind_preset_to_connection:true,extensions:{activeNote:'live',tisya:{worldbooks:['live-book']}}},eventTypes:{OAI_PRESET_CHANGED_BEFORE:'before',OAI_PRESET_CHANGED_AFTER:'after'},eventSource:{on(e,f){if(!events.has(e))events.set(e,new Set());events.get(e).add(f);},removeListener(e,f){events.get(e)?.delete(f);}},saveSettingsDebounced(){}};
 const manager={select:'#presets',getAllPresets:()=>[...select.options].map(o=>o.text),getSelectedPresetName:()=>select.selectedOptions[0]?.text??'',getCompletionPresetByName:name=>list.presets[list.preset_names[name]],getPresetList:()=>list,findPreset:name=>String(list.preset_names[name]),async savePreset(name,value,{skipUpdate}={}){saves++;assert.equal(skipUpdate,true);assert.equal(name,'Tisya');if(failSave)throw Error('native disk failure');disk.set(name,copy(value));},selectPreset(value){refreshes++;select.value=value;if(silentRefresh)return;void (async()=>{const name=manager.getSelectedPresetName(),preset=copy(manager.getCompletionPresetByName(name));const mapping={prompts:['','prompts',false,false],prompt_order:['','prompt_order',false,false],temperature:['','temp_openai',false,false],custom_model:['','custom_model',false,true],extensions:['','extensions',false,false]};await emit('before',{preset,presetName:name,settings:context.chatCompletionSettings,settingsToUpdate:mapping});for(const [key,[,dest,,connection]]of Object.entries(mapping)){if(connection&&!context.chatCompletionSettings.bind_preset_to_connection)continue;if(preset[key]!==undefined)context.chatCompletionSettings[dest]=preset[key];}await emit('after');})();}};
 // The real PresetManager constructor receives a jQuery-wrapped select.
 manager.select={0:select,length:1};
 context.getPresetManager=id=>{assert.equal(id,'openai');return manager;};return {w,document,context,manager,disk,list,events,saves:()=>saves,refreshes:()=>refreshes};
}
test('built-in keeps the complete 62-entry plaintext preset and both creative digests',()=>{
 assert.equal(bundled.name,'Tisya');assert.deepEqual(bundled.prompts,original.prompts);assert.deepEqual(bundled.prompt_order,original.prompt_order);assert.equal(bundled.prompts.length,62);assert.match(BUILTIN_PRESET_REVISION,/^[a-f0-9]{64}$/);assert(!bundled.prompts.some(p=>p.content?.includes('{{tisya_live_onepass_')));
});
test('first install uses native persistence, adds one Tisya and leaves another selected preset/settings untouched',async()=>{
 const f=fixture({existing:false}),settings=copy(f.context.chatCompletionSettings),other=copy(f.disk.get('Other'));
 const result=await installBuiltInPreset(f.context,f.document);assert.equal(result.status,'installed');assert.equal(f.saves(),1);assert.equal(f.manager.getSelectedPresetName(),'Other');assert.deepEqual(f.context.chatCompletionSettings,settings);assert.deepEqual(f.disk.get('Other'),other);assert.deepEqual(f.disk.get('Tisya').prompts,bundled.prompts);assert.equal(f.refreshes(),0);
 await installBuiltInPreset(f.context,f.document);assert.equal(f.saves(),1);assert.deepEqual(f.manager.getAllPresets(),['Other','Tisya']);await f.w.happyDOM.close();
});
test('upgrade overwrites the same saved Tisya, retains extensions and never changes another selected preset',async()=>{
 const f=fixture(),before=copy(f.context.chatCompletionSettings);assert.equal((await installBuiltInPreset(f.context,f.document)).status,'updated');assert.equal(f.list.presets.length,2);assert.equal(f.disk.get('Tisya').custom_model,'stored-model');assert.deepEqual(f.disk.get('Tisya').extensions.tisya.worldbooks,['saved-book']);assert.deepEqual(f.context.chatCompletionSettings,before);assert.equal(f.manager.getSelectedPresetName(),'Other');await f.w.happyDOM.close();
});
test('selected Tisya refreshes native prompts and preserves live API, sampling, binding and extensions',async()=>{
 const f=fixture({selected:'Tisya'});await installBuiltInPreset(f.context,f.document);assert.deepEqual(f.context.chatCompletionSettings.prompts,bundled.prompts);assert.deepEqual(f.context.chatCompletionSettings.prompt_order,bundled.prompt_order);assert.equal(f.context.chatCompletionSettings.custom_model,'live-model');assert.equal(f.context.chatCompletionSettings.temp_openai,.8);assert.equal(f.context.chatCompletionSettings.bind_preset_to_connection,true);assert.equal(f.document.querySelector('input').checked,true);assert.deepEqual(f.context.chatCompletionSettings.extensions.tisya.worldbooks,['live-book']);assert.equal(f.refreshes(),1);assert.equal([...f.events.values()].reduce((n,s)=>n+s.size,0),0);
 f.context.chatCompletionSettings.prompts[0].content='same-release custom draft';await installBuiltInPreset(f.context,f.document);assert.equal(f.saves(),1);assert.equal(f.context.chatCompletionSettings.prompts[0].content,'same-release custom draft');await f.w.happyDOM.close();
});
test('failed native save keeps saved and live data, and does not report an installation',async()=>{
 const f=fixture({selected:'Tisya',failSave:true}),disk=copy(f.disk.get('Tisya')),live=copy(f.context.chatCompletionSettings),list=copy(f.list);
 await assert.rejects(installBuiltInPreset(f.context,f.document),/native disk failure/);assert.deepEqual(f.disk.get('Tisya'),disk);assert.deepEqual(f.context.chatCompletionSettings,live);assert.deepEqual(f.list,list);assert.equal(f.refreshes(),0);await f.w.happyDOM.close();
});
test('missing native capability and active generation reject before a write',async()=>{
 for(const kind of ['busy','missing']){const f=fixture();if(kind==='missing')delete f.manager.savePreset;await assert.rejects(installBuiltInPreset(f.context,f.document,{isBusy:()=>kind==='busy'}),kind==='busy'?/仍在生成/:/savePreset/);assert.equal(f.saves(),0);await f.w.happyDOM.close();}
});
test('concurrent initialization is one native save',async()=>{
 const f=fixture();await Promise.all([installBuiltInPreset(f.context,f.document),installBuiltInPreset(f.context,f.document)]);assert.equal(f.saves(),1);await f.w.happyDOM.close();
});
test('refresh timeout stays visible; reopened stale active settings load the saved release',async()=>{
 const f=fixture({selected:'Tisya',silentRefresh:true});await assert.rejects(installBuiltInPreset(f.context,f.document,{timeout:5}),/刷新超时/);assert.equal(f.disk.get('Tisya').extensions.tisya_builtin.revision,BUILTIN_PRESET_REVISION);assert.equal([...f.events.values()].reduce((n,s)=>n+s.size,0),0);
 const reopened=fixture({selected:'Tisya'});reopened.list.presets[1]=copy(f.disk.get('Tisya'));await installBuiltInPreset(reopened.context,reopened.document);assert.deepEqual(reopened.context.chatCompletionSettings.prompts,bundled.prompts);assert.equal(reopened.refreshes(),1);await f.w.happyDOM.close();await reopened.w.happyDOM.close();
});
