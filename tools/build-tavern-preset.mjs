import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),baseline=process.argv[2];
if(!baseline)throw Error('Usage: node tools/build-tavern-preset.mjs /path/to/r243/runtime');
const require=createRequire(path.resolve(baseline,'package.json'));
const base=require('./src/independent-preset.cjs'),{NARRATIVE:N}=require('./src/narrative.cjs');
const sourcePreset=fs.readFileSync(path.join(baseline,'outputs/Tisya-Preset-0.11.2.json'));
if(JSON.stringify(JSON.parse(sourcePreset))!==JSON.stringify(base))throw Error('Preset/compiler pair mismatch');
const settings={...N.suggestions(),'缇斯亚MVU兼容':false},output={summary:true,directions:['输入评价','回应用户评价','剧情吐槽']};
const activeEntries=base.prompts.filter(p=>p.enabled!==false).map(p=>p.identifier);
const onContext=N.previewSettings(settings,output,{activeEntries,outputEnabled:true});
const {render:renderProtocol}=require('./src/tisya-protocol.cjs');
if(JSON.stringify(renderProtocol(onContext).entries)!==JSON.stringify(onContext.rest.entries))throw Error('Protocol replay differs from original compiler');
const emotionNames=JSON.parse(fs.readFileSync(path.join(root,'emotion-assets.json'),'utf8')).entries.map(r=>r.name);
const values=JSON.parse(onContext.outputValues);values.mood=[null,...emotionNames];onContext.outputValues=JSON.stringify(values);
const on=renderProtocol(onContext).entries,moods=JSON.stringify(values.mood);
if(on.tisya_inner_chain.split('mood must be one of '+moods).length!==2)throw Error('Emotion compilation anchor changed');
const off=N.previewSettings(settings,output,{activeEntries,outputEnabled:false}).rest.entries;
// The optional heart instructions and wire rows come from the same approved
// compiler as the rest of the prompt. Native macros remove exactly these spans
// when structured output is disabled; source drift fails the build.
const directions=on.tisya_inner_chain.match(/\n(输入评价：[^\n]+\n回应用户评价：[^\n]+\n剧情吐槽：[^\n]+)\n/)[1];
const rows=output.directions.map(d=>'心声：有内容|'+d+'|{mood或null}|{该方向短评}').join('\n');
for(const key of Object.keys(on)){
 let expected=on[key];
 if(key==='tisya_inner_chain'){
  if(expected.split(directions).length!==2||expected.split(rows).length!==3)throw Error('Heart compilation anchors changed');
  expected=expected.replace('"kind":"structured"','"kind":"plain"').replace(directions,'').replaceAll(rows,'').replace('mood must be one of '+moods,'mood must be one of [null]');
 }
 if(expected!==off[key])throw Error('Unreviewed output-switch difference: '+key);
}
fs.writeFileSync(path.join(root,'preset-hearts.js'),'// Generated from the approved r243 compiler by tools/build-tavern-preset.mjs.\nexport const HEART_DIRECTIONS='+JSON.stringify(directions)+';\nexport const HEART_ROWS='+JSON.stringify(rows)+';\n');
const controls=output.directions.map((name,i)=>({id:['tisya_heart_input_review','tisya_heart_user_reply','tisya_heart_plot_comment'][i],name}));
const heartBlock=text=>{const matches=[...text.matchAll(/@HEART \{\n[\s\S]*?\n\}/g)];if(matches.length!==1)throw Error('Heart block anchor drift');return matches[0][0];};
const variants=Array.from({length:8},(_,mask)=>{
 const selected=output.directions.filter((_,i)=>mask&(1<<i)),value={};
 for(const enabled of [true,false]){
  const context=N.previewSettings(settings,{...output,directions:selected},{activeEntries,outputEnabled:enabled});
  const inner=context.rest.entries.tisya_inner_chain;
  const found=[...inner.matchAll(/^心声：[^\n]*/gm)].map(m=>m[0]);
  if(found.length%2||found.slice(0,found.length/2).join('\n')!==found.slice(found.length/2).join('\n'))throw Error('Heart positions disagree');
  value[enabled?'on':'off']={protocol:heartBlock(inner),rows:found.slice(0,found.length/2).join('\n')};
 }
 return value;
});
fs.writeFileSync(path.join(root,'preset-heart-variants.js'),'// Generated from every original r243 heart-direction/output combination; do not edit.\nexport const HEART_CONTROLS='+JSON.stringify(controls)+';\nexport const HEART_VARIANTS='+JSON.stringify(variants)+';\n');
const preset=structuredClone(base),changes=[];
for(const entry of preset.prompts){
 const id=entry.identifier;
 if(entry.marker){entry.content='';changes.push({id,reason:'Native marker supplies live host data'});}
 else if(Object.hasOwn(on,id))entry.content=on[id];
 else if(id==='tisya_delivery_warning')entry.content='{{tisya_delivery_warning}}';
 else if(id==='tisya_output')entry.content='';
 else if(id.startsWith('tisya_material_')||['tisya_recent_reply','tisya_current_input'].includes(id)){
  entry.content='';changes.push({id,reason:'Tavo service not connected; editable slot kept empty; native sources remain enabled'});
 }else throw Error('Unmapped preset entry: '+id);
 if(id==='tisya_inner_chain')entry.content=entry.content.replace('"kind":"structured"','"kind":"{{tisya_output_kind}}"').replace(heartBlock(on.tisya_inner_chain),'{{tisya_heart_protocol}}').replaceAll(rows,'{{tisya_heart_rows}}');
}
const marks={identifier:'tisya_prose_marks',name:'正文 · 美化标记',role:'system',system_prompt:false,marker:false,injection_position:0,injection_depth:4,forbid_overrides:false,enabled:true,content:'正文可依实际内容使用短标记：〔标题〕小标题〔/标题〕；〔信笺:信件标题〕信件正文〔/信笺〕；〔档案:档案标题〕档案正文〔/档案〕；〔密档:折叠标题〕读者已经获准看到的内容〔/密档〕；〔收获:标题〕本轮实际收获〔/收获〕。没有对应内容时不添加。标签必须成对闭合，每个标记完整放在同一编号段内；标记内部换行不插入新的段号。密档仅是折叠展示，不授权公开秘密。结构化回复时这些标记只放在 body 中；普通交付时可直接用于正文。'};
preset.prompts.splice(preset.prompts.findIndex(p=>p.identifier==='tisya_registry'),0,marks);
for(const order of preset.prompt_order)order.order.splice(order.order.findIndex(p=>p.identifier==='tisya_registry'),0,{identifier:marks.identifier,enabled:true});
for(const control of controls){
 const entry={...marks,identifier:control.id,name:'心声 · '+control.name,content:''};
 preset.prompts.splice(preset.prompts.findIndex(p=>p.identifier==='tisya_output'),0,entry);
 for(const order of preset.prompt_order)order.order.splice(order.order.findIndex(p=>p.identifier==='tisya_output'),0,{identifier:control.id,enabled:true});
 changes.push({id:control.id,reason:'Native preset switch owns this selected heart direction; empty control prompt'});
}
// Full native macro expansion, not just a snippet comparison, must match the
// frozen compiler in all eight direction selections and both output modes.
const {registerPresetProtocol}=await import(new URL('../preset.js',import.meta.url));
let heartConfigurationsVerified=0;
for(let mask=0;mask<8;mask++)for(const enabled of [true,false]){
 const selected=output.directions.filter((_,i)=>mask&(1<<i)),trial=structuredClone(preset),order=trial.prompt_order[0].order;
 controls.forEach((c,i)=>order.find(p=>p.identifier===c.id).enabled=!!(mask&(1<<i)));
 order.find(p=>p.identifier==='tisya_output').enabled=enabled;
 const macros=new Map();registerPresetProtocol({registerMacro:(name,fn)=>macros.set(name,fn),unregisterMacro:name=>macros.delete(name)},()=>({prompts:trial.prompts,order}),error=>{throw error;},()=>emotionNames);
 const context=N.previewSettings(settings,{...output,directions:selected},{activeEntries,outputEnabled:enabled});
 if(enabled&&selected.length){const value=JSON.parse(context.outputValues);value.mood=[null,...emotionNames];context.outputValues=JSON.stringify(value);}
 const expected=renderProtocol(context).entries;
 for(const [id,original]of Object.entries(expected)){
  const raw=trial.prompts.find(p=>p.identifier===id).content;
  const actual=raw.replace(/\{\{(tisya_[a-z_]+)\}\}/g,(_,name)=>{if(!macros.has(name))throw Error('Unresolved native macro: '+name);return macros.get(name)();});
  if(actual!==original)throw Error('Native heart expansion drift: '+mask+'/'+enabled+'/'+id);
 }
 heartConfigurationsVerified++;
}
if(/<%|getvar\(|print\(c\./.test(JSON.stringify(preset)))throw Error('Tavo template leaked into native preset');
const dir=path.join(root,'presets');fs.mkdirSync(dir,{recursive:true});
const dest=path.join(dir,'Tisya-TauriTavern-0.2.0-alpha.10.json'),bytes=JSON.stringify(preset,null,2)+'\n';fs.writeFileSync(dest,bytes);
const sha=x=>createHash('sha256').update(x).digest('hex');
fs.writeFileSync(path.join(dir,'provenance.json'),JSON.stringify({schema:'tisya.tavern-preset/1',source:'Foundation r243 + Tisya-Preset-0.11.2',source_sha256:sha(sourcePreset),compiler_source_sha256:sha(fs.readFileSync(path.join(baseline,'src/tisya-protocol/source.json'))),compiled_settings:settings,output,heart_configurations_verified:heartConfigurationsVerified,heart_variants_sha256:sha(fs.readFileSync(path.join(root,'preset-heart-variants.js'))),compiled_emotion_names:emotionNames,emotion_assets_sha256:sha(fs.readFileSync(path.join(root,'emotion-assets.json'))),version:'0.2.0-alpha.10',sha256:sha(bytes),heart_macros_sha256:sha(fs.readFileSync(path.join(root,'preset-hearts.js'))),changes,limits:['Narrative default settings compiled at build time; not a live Tavo settings migration','Native character/persona/worldbook/history slots provide actual request data','Built-in emotion catalog only; custom atlas/state/memory recall/commit services are not claimed']},null,2)+'\n');
console.log(JSON.stringify({file:dest,prompts:preset.prompts.length,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}));
