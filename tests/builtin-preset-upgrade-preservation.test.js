import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import predecessor from './fixtures/candidate29-installed-preset.json' with {type:'json'};
import {installBuiltInPreset,BUILTIN_PRESET_REVISION} from '../builtin-preset.js';
import {matrixPreset,compilePrompts,compilePromptText,CONFIG_KEY} from '../engine/config.mjs';
import {resolveProseStyleText} from '../engine/prose-style-policy.mjs';
import {DEFAULT_TAGS} from '../engine/tags.mjs';
const clone=structuredClone,bundled=matrixPreset(),row=(p,id)=>p.prompts.find(r=>r.identifier===id);
function fixture(previous,{active=false,failSave=false}={}){
 const w=new Window(),document=w.document;document.body.innerHTML='<select id="presets"><option value="0">Other</option><option value="1">Tisya</option></select><input id="bind_preset_to_connection" type="checkbox" checked>';
 const select=document.querySelector('select');select.value=active?'1':'0';const other={name:'Other',prompts:[],prompt_order:[],extensions:{}},list={presets:[other,clone(previous)],preset_names:{Other:0,Tisya:1}},disk=new Map([['Other',clone(other)],['Tisya',clone(previous)]]),listeners=new Map();let writes=0,refreshes=0;
 const settings={...clone(active?previous:other),custom_model:'live-model',temp_openai:.73,bind_preset_to_connection:true};
 const config={format:1,tags:clone(DEFAULT_TAGS),prompts:{main:row(predecessor,'main').content},generation:{},story:{userName:'阿青',play:{choices:{}}}};
 const context={chatCompletionSettings:settings,extensionSettings:{[CONFIG_KEY]:config},eventTypes:{OAI_PRESET_CHANGED_BEFORE:'before',OAI_PRESET_CHANGED_AFTER:'after'},eventSource:{on(k,f){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(f);},removeListener(k,f){listeners.get(k)?.delete(f);}},saveSettingsDebounced(){}};
 const emit=async(k,p)=>{for(const f of [...(listeners.get(k)??[])])await f(p);};
 const manager={select:{0:select},getAllPresets:()=>[...select.options].map(o=>o.text),getSelectedPresetName:()=>select.selectedOptions[0].text,getPresetList:()=>list,getCompletionPresetByName:n=>list.presets[list.preset_names[n]],findPreset:n=>String(list.preset_names[n]),async savePreset(n,p,{skipUpdate}){assert.equal(skipUpdate,true);writes++;if(failSave)throw Error('save rejected');disk.set(n,clone(p));},selectPreset(value){refreshes++;select.value=value;void(async()=>{const preset=clone(manager.getCompletionPresetByName('Tisya'));await emit('before',{preset,presetName:'Tisya',settings,settingsToUpdate:{}});Object.assign(settings,preset);await emit('after');})();}};
 context.getPresetManager=()=>manager;return {w,document,context,settings,list,disk,config,manager,writes:()=>writes,refreshes:()=>refreshes};
}
function authored(){
 const p=clone(predecessor);assert(row(p,'tisya_pref_portrayal'),'deletion fixture is a real prior slot');row(p,'tisya_pref_style').content+='字';row(p,'tisya_pref_style').role='assistant';row(p,'tisya_pref_narrative').role='user';row(p,'tisya_pref_plot').enabled=false;row(p,'tisya_pref_plot').custom_metadata={keep:'row'};
 p.prompts.push({identifier:'author-note',name:'我的补充',role:'user',content:'这段自己留着。',enabled:false,custom:{keep:true}});
 p.prompts=p.prompts.filter(r=>r.identifier!=='tisya_pref_portrayal');
 for(const group of p.prompt_order){group.order=group.order.filter(r=>r.identifier!=='tisya_pref_portrayal');group.order.reverse();const off=group.order.find(r=>r.identifier==='tisya_pref_plot');if(off)off.enabled=false;group.order.push({identifier:'author-note',enabled:false,custom:'order'});group.extra='group';}
 p.unknown_top={keep:'top'};p.extensions.author={keep:'extension'};p.extensions.tisya_builtin.custom={keep:'builtin'};p.extensions.tisya_matrix.custom={keep:'matrix'};return p;
}
for(const active of [false,true])test('candidate.29 upgrade saves exact-stock changes while preserving authored content, roles, order, off/deleted slots and metadata; active='+active,async()=>{
 const previous=authored(),f=fixture(previous,{active}),before=clone(previous),configBefore=clone(f.context.extensionSettings);
 try{
  assert.notEqual(previous.extensions.tisya_builtin.revision,BUILTIN_PRESET_REVISION);assert.equal(predecessor.prompts.length,71);
  const result=await installBuiltInPreset(f.context,f.document);assert.equal(result.status,'updated');assert.equal(f.writes(),1);
  const saved=clone(f.disk.get('Tisya'));assert.deepEqual(previous,before);assert.deepEqual(saved.prompt_order,before.prompt_order);assert.equal(saved.prompts.length,before.prompts.length);assert.deepEqual(saved.prompts.map(({content,...m})=>m),before.prompts.map(({content,...m})=>m));
  let upgraded=0;for(const p of before.prompts){const actual=row(saved,p.identifier),resolved=resolveProseStyleText(p.identifier,p.content);assert.equal(actual.content,resolved===p.content?p.content:row(bundled,p.identifier).content,p.identifier);if(resolved!==p.content)upgraded++;}
  assert(upgraded>10,'real predecessor stock must actually migrate');assert.equal(row(saved,'tisya_pref_style').content,row(before,'tisya_pref_style').content);assert.equal(row(saved,'tisya_pref_style').role,'assistant');assert.equal(row(saved,'tisya_pref_plot').enabled,false);assert(!row(saved,'tisya_pref_portrayal'));
  assert.deepEqual(saved.unknown_top,before.unknown_top);for(const key of ['author'])assert.deepEqual(saved.extensions[key],before.extensions[key]);assert.deepEqual(saved.extensions.tisya_builtin.custom,before.extensions.tisya_builtin.custom);assert.deepEqual(saved.extensions.tisya_matrix.custom,before.extensions.tisya_matrix.custom);assert.equal(saved.extensions.tisya_builtin.revision,BUILTIN_PRESET_REVISION);assert.deepEqual(f.context.extensionSettings,configBefore);
  // Compile the persisted/read-back object, not the pre-install input.
  const compiled=compilePrompts(saved,f.config,{});assert.deepEqual(compiled.prompt_order,before.prompt_order);assert.equal(row(compiled,'tisya_pref_style').role,'assistant');assert.equal(row(compiled,'tisya_pref_style').content,compilePromptText(row(before,'tisya_pref_style').content,f.config,{}));assert.equal(row(compiled,'main').content,compilePromptText(f.config.prompts.main,f.config,{}));assert(!row(compiled,'tisya_pref_portrayal'));assert.deepEqual(f.context.extensionSettings,configBefore);
  if(active){assert.equal(f.settings.custom_model,'live-model');assert.equal(f.settings.temp_openai,.73);assert.equal(f.settings.bind_preset_to_connection,true);assert.deepEqual(f.settings.prompts,saved.prompts);assert.deepEqual(f.settings.extensions.tisya_builtin.custom,before.extensions.tisya_builtin.custom);}else assert.equal(f.manager.getSelectedPresetName(),'Other');
  await installBuiltInPreset(f.context,f.document);assert.equal(f.writes(),1,'successful revision is idempotent');
 }finally{await f.w.happyDOM.close();}
});

test('an active valid predecessor keeps unsaved authored prompt edits across the native refresh',async()=>{
 const f=fixture(predecessor,{active:true});try{row(f.settings,'tisya_pref_style').content+=' live字';const expected=row(f.settings,'tisya_pref_style').content;f.settings.prompt_order[0].order.reverse();const order=clone(f.settings.prompt_order);await installBuiltInPreset(f.context,f.document);assert.equal(row(f.disk.get('Tisya'),'tisya_pref_style').content,expected);assert.equal(row(f.settings,'tisya_pref_style').content,expected);assert.deepEqual(f.settings.prompt_order,order);}finally{await f.w.happyDOM.close();}
});

test('a failed or busy automatic upgrade does not mutate the saved or live predecessor',async()=>{
 for(const kind of ['save','busy']){const f=fixture(authored(),{active:true,failSave:kind==='save'}),disk=clone(f.disk.get('Tisya')),live=clone(f.settings),list=clone(f.list);try{await assert.rejects(installBuiltInPreset(f.context,f.document,{isBusy:()=>kind==='busy'}),kind==='save'?/save rejected/:/仍在生成/);assert.deepEqual(f.disk.get('Tisya'),disk);assert.deepEqual(f.settings,live);assert.deepEqual(f.list,list);assert.equal(f.refreshes(),0);assert.equal(f.writes(),kind==='save'?1:0);}finally{await f.w.happyDOM.close();}}
});

test('explicit force still reinstalls the shipped prompts and order',async()=>{
 const f=fixture(authored(),{active:true});try{await installBuiltInPreset(f.context,f.document,{force:true});assert.deepEqual(f.disk.get('Tisya').prompts,bundled.prompts);assert.deepEqual(f.settings.prompts,bundled.prompts);assert.deepEqual(f.settings.prompt_order,bundled.prompt_order);assert.equal(f.settings.custom_model,'live-model');assert.equal(f.settings.temp_openai,.73);}finally{await f.w.happyDOM.close();}
});
