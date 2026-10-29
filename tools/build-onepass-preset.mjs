import {FAST_RESPONSE_BLOCK,FAST_RESPONSE_ID,QUALITY_PRESET_SETTINGS} from '../config/response-speed.js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {onePassEntries} from '../onepass/preset.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
const preset=JSON.parse(await read('presets/Tisya-TauriTavern-0.2.0-alpha.13.json'));
const defaults=onePassEntries(fullDefaultConfiguration(),DEFAULT_MOODS);
for(const p of preset.prompts){const id=p.identifier==='tisya_material_style_card'?'tisya_material_style':p.identifier;if(!p.marker&&Object.hasOwn(defaults,id)&&!['chatHistory','chatHistory／当前user'].includes(id))p.content=defaults[id];if(p.identifier==='tisya_selected_resources')p.content='';}
Object.assign(preset,QUALITY_PRESET_SETTINGS);
const speed={identifier:FAST_RESPONSE_ID,name:'极速模式（默认关闭）',role:'system',content:FAST_RESPONSE_BLOCK,enabled:true,injection_position:0,injection_depth:4,injection_order:100,forbid_overrides:false};
preset.prompts.splice(preset.prompts.findIndex(p=>p.identifier==='tisya_new_chat')+1,0,speed);
for(const group of preset.prompt_order){const at=group.order.findIndex(p=>p.identifier==='tisya_new_chat');if(at>=0)group.order.splice(at+1,0,{identifier:FAST_RESPONSE_ID,enabled:false});}
const reference=preset.prompts.filter(p=>!p.marker&&p.enabled!==false&&p.identifier!==FAST_RESPONSE_ID).map(p=>p.content).filter(Boolean).join('\n\n');
const builtin={...preset,name:'Tisya',extensions:{tisya_builtin:{id:'tisya-onepass-1',revision:createHash('sha256').update(JSON.stringify(preset)).digest('hex')}}};
for(const [path,text] of [['presets/Tisya-One-Pass-1.json',JSON.stringify(preset,null,2)+'\n'],['presets/Tisya-One-Pass-1.txt',reference+'\n'],['presets/Tisya.json',JSON.stringify(builtin,null,2)+'\n']]){if(process.argv.includes('--check')){if(await read(path)!==text)throw Error('Stale '+path);}else await writeFile(new URL(path,root),text);}
console.log('One-pass preset: all '+preset.prompts.length+' original entries preserved');
