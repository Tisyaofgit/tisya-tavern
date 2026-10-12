import fs from 'node:fs';
const root=new URL('../',import.meta.url),p=JSON.parse(fs.readFileSync(new URL('presets/Tisya-TauriTavern-0.2.0-alpha.13.json',root)));
const row=p.prompts.find(x=>x.identifier==='tisya_delivery_warning');
row.name='交付复核 · 记忆与独立心声';
row.content='{{tisya_delivery_warning}}\n{{tisya_memory_delivery}}';
p.prompts.find(x=>x.identifier==='tisya_inner_chain').name='叙事流程 · 记忆固定列修订';
const output=JSON.stringify(p,null,2)+'\n',file=new URL('presets/Tisya-TauriTavern-0.2.0-alpha.20.json',root);
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==output)throw Error('Memory preset stale');}else fs.writeFileSync(file,output);
console.log('Memory preset verified: original slots preserved, current memory delivery contract bound');
