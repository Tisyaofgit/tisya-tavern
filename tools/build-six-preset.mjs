import {readFile,writeFile} from 'node:fs/promises';
import {sixEntries,fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
const legacy=JSON.parse(await read('presets/Tisya-TauriTavern-0.2.0-alpha.13.json'));
const defaults=sixEntries(fullDefaultConfiguration(),DEFAULT_MOODS);
// Preserve every native entry and all metadata, including empty dividers,
// inactive slots, labels, roles, order and both switch layers. Only text changes.
const preset=structuredClone(legacy);
for(const p of preset.prompts){
 const id=p.identifier==='tisya_material_style_card'?'tisya_material_style':p.identifier;
 if(!p.marker&&Object.hasOwn(defaults,id)&&!['chatHistory','chatHistory／当前user'].includes(id))p.content='{{tisya_live_six_'+id+'}}';
}
const reference=preset.prompts.filter(p=>!p.marker&&p.enabled!==false).map(p=>p.content.replace(/\{\{tisya_live_six_([^{}]+)\}\}/g,(_,id)=>defaults[id])).filter(Boolean).join('\n\n');
for(const [path,text]of [['presets/Tisya-Six-Blocks-1.json',JSON.stringify(preset,null,2)+'\n'],['presets/Tisya-Six-Blocks-1.txt',reference+'\n']]){
 if(process.argv.includes('--check')){if(await read(path)!==text)throw Error('Stale '+path);}
 else await writeFile(new URL(path,root),text);
}
console.log('Six-block preset preserves all '+preset.prompts.length+' original native entries');
