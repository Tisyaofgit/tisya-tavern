import {PREFERENCE_ENTRY,preferenceFirst} from '../config/preference-layer.js';
import fs from 'node:fs';
import {NARRATIVE as N} from '../settings-core.js';
const root=new URL('../',import.meta.url),file=new URL('presets/Tisya-TauriTavern-0.2.0-alpha.12.json',root);
const preset=JSON.parse(fs.readFileSync(new URL('presets/Tisya-TauriTavern-0.2.0-alpha.10.json',root)));
const ids=Object.keys(N.previewSettings({...N.suggestions(),'缇斯亚MVU兼容':false},{summary:true,directions:[]}).rest.entries);
ids.push(PREFERENCE_ENTRY);
for(const id of ids){const rows=preset.prompts.filter(p=>p.identifier===id);if(rows.length!==1)throw Error('Missing/duplicate original entry: '+id);rows[0].content='{{tisya_live_'+id+'}}';}
for(const row of preset.prompt_order)row.order=preferenceFirst(row.order);
const output=JSON.stringify(preset,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==output)throw Error('Live preset stale');}else fs.writeFileSync(file,output);
console.log('Dynamic preset verified: '+ids.length+' original compiler entries; native roles/order/markers preserved');
