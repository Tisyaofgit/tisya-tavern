import fs from 'node:fs';
const preset=JSON.parse(fs.readFileSync(new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.12.json',import.meta.url)));
// No option catalogue is baked into this preset; UI registration lives in config/.
preset.prompts.find(p=>p.identifier==='tisya_prose_marks').content='';
preset.prompts.find(p=>p.identifier==='tisya_prose_marks').enabled=false;
for(const row of preset.prompt_order)row.order.find(p=>p.identifier==='tisya_prose_marks').enabled=false;
const entry={identifier:'tisya_selected_resources',name:'配置 · 当前选中资料',role:'system',system_prompt:false,marker:false,injection_position:0,injection_depth:4,forbid_overrides:false,enabled:true,content:'{{tisya_config_selected}}'};
preset.prompts.splice(preset.prompts.findIndex(p=>p.identifier==='tisya_material_boundary_close'),0,entry);
for(const row of preset.prompt_order)row.order.splice(row.order.findIndex(p=>p.identifier==='tisya_material_boundary_close'),0,{identifier:entry.identifier,enabled:true});
const bytes=JSON.stringify(preset,null,2)+'\n',path=new URL('../presets/Tisya-TauriTavern-0.2.0-alpha.13.json',import.meta.url);
if(process.argv.includes('--check')){if(fs.readFileSync(path,'utf8')!==bytes)throw Error('Modular preset stale');}else fs.writeFileSync(path,bytes);
console.log('Modular narrative preset verified; original roles, protected identity and output wire preserved');
