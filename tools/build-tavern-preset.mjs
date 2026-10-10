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
const settings={...N.suggestions(),'缇斯亚MVU兼容':false},output={summary:true,directions:[]};
const activeEntries=base.prompts.filter(p=>p.enabled!==false).map(p=>p.identifier);
const on=N.previewSettings(settings,output,{activeEntries,outputEnabled:true}).rest.entries;
const off=N.previewSettings(settings,output,{activeEntries,outputEnabled:false}).rest.entries;
// This is the only differing compiled line in r243. Preserve editable prompt text;
// the native extension supplies just the current structured/plain mode.
for(const key of Object.keys(on)){
 const expected=key==='tisya_inner_chain'?on[key].replace('"kind":"structured"','"kind":"plain"'):on[key];
 if(expected!==off[key])throw Error('Unreviewed output-switch difference: '+key);
}
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
 if(id==='tisya_inner_chain')entry.content=entry.content.replace('"kind":"structured"','"kind":"{{tisya_output_kind}}"');
}
const marks={identifier:'tisya_prose_marks',name:'正文 · 美化标记',role:'system',system_prompt:false,marker:false,injection_position:0,injection_depth:4,forbid_overrides:false,enabled:true,content:'正文可依实际内容使用短标记：〔标题〕小标题〔/标题〕；〔信笺:信件标题〕信件正文〔/信笺〕；〔档案:档案标题〕档案正文〔/档案〕；〔密档:折叠标题〕读者已经获准看到的内容〔/密档〕；〔收获:标题〕本轮实际收获〔/收获〕。没有对应内容时不添加。标签必须成对闭合，每个标记完整放在同一编号段内；标记内部换行不插入新的段号。密档仅是折叠展示，不授权公开秘密。结构化回复时这些标记只放在 body 中；普通交付时可直接用于正文。'};
preset.prompts.splice(preset.prompts.findIndex(p=>p.identifier==='tisya_registry'),0,marks);
for(const order of preset.prompt_order)order.order.splice(order.order.findIndex(p=>p.identifier==='tisya_registry'),0,{identifier:marks.identifier,enabled:true});
if(/<%|getvar\(|print\(c\./.test(JSON.stringify(preset)))throw Error('Tavo template leaked into native preset');
const dir=path.join(root,'presets');fs.mkdirSync(dir,{recursive:true});
const dest=path.join(dir,'Tisya-TauriTavern-0.2.0-alpha.7.json'),bytes=JSON.stringify(preset,null,2)+'\n';fs.writeFileSync(dest,bytes);
const sha=x=>createHash('sha256').update(x).digest('hex');
fs.writeFileSync(path.join(dir,'provenance.json'),JSON.stringify({schema:'tisya.tavern-preset/1',source:'Foundation r243 + Tisya-Preset-0.11.2',source_sha256:sha(sourcePreset),compiler_source_sha256:sha(fs.readFileSync(path.join(baseline,'src/tisya-protocol/source.json'))),compiled_settings:settings,output,version:'0.2.0-alpha.7',sha256:sha(bytes),changes,limits:['Narrative default settings compiled at build time; not a live Tavo settings migration','Native character/persona/worldbook/history slots provide actual request data','No Tavo state, atlas, memory recall or commit service is claimed']},null,2)+'\n');
console.log(JSON.stringify({file:dest,prompts:preset.prompts.length,bytes:Buffer.byteLength(bytes),sha256:sha(bytes)}));
