import {readFile,writeFile} from 'node:fs/promises';
import {onePassEntries} from '../onepass/preset.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const preset=JSON.parse(await read('presets/Tisya-TauriTavern-0.2.0-alpha.13.json'));
const defaults=onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS);
for(const p of preset.prompts){const id=p.identifier==='tisya_material_style_card'?'tisya_material_style':p.identifier;if(!p.marker&&Object.hasOwn(defaults,id)&&!['chatHistory','chatHistory／当前user'].includes(id))p.content=defaults[id];if(p.identifier==='tisya_selected_resources')p.content='';}
const reference=preset.prompts.filter(p=>!p.marker&&p.enabled!==false).map(p=>p.content).filter(Boolean).join('\n\n');
for(const [path,text] of [['presets/Tisya-One-Pass-1.json',JSON.stringify(preset,null,2)+'\n'],['presets/Tisya-One-Pass-1.txt',reference+'\n']]){if(process.argv.includes('--check')){if(await read(path)!==text)throw Error('Stale '+path);}else await writeFile(new URL(path,root),text);}
console.log('One-pass preset: all '+preset.prompts.length+' original entries preserved');
