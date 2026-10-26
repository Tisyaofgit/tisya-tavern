import {readFile,writeFile} from 'node:fs/promises';
import {W22_ENTRIES} from '../six/source.mjs';
import {sixEntries,fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
const root=new URL('../',import.meta.url),read=path=>readFile(new URL(path,root),'utf8');
const legacy=JSON.parse(await read('presets/Tisya-TauriTavern-0.2.0-alpha.13.json'));
const entry=(id,content='',role='system')=>({identifier:id,name:id,role,content,system_prompt:false,marker:false,enabled:true,injection_position:0,injection_depth:4,injection_order:100,forbid_overrides:false});
const prompts=W22_ENTRIES.map(e=>entry(e.identifier,'{{tisya_live_six_'+e.identifier+'}}',e.role==='original roles'?'system':e.role));
const history=prompts.find(p=>p.identifier==='chatHistory');Object.assign(history,{content:'',marker:true});
const current=prompts.find(p=>p.identifier==='chatHistory／当前user');Object.assign(current,{content:'',enabled:false});
const markers=legacy.prompts.filter(p=>p.marker&&p.identifier!=='chatHistory').map(p=>({...p,enabled:true}));
prompts.splice(prompts.findIndex(p=>p.identifier==='chatHistory'),0,...markers);
const controls=['tisya_selected_resources','tisya_heart_input_review','tisya_heart_user_reply','tisya_heart_plot_comment','tisya_output'].map(id=>entry(id,id==='tisya_selected_resources'?'{{tisya_config_selected}}':''));
prompts.splice(prompts.findIndex(p=>p.identifier==='tisya_material_boundary_close'),0,...controls);
const preset={...legacy,prompts,prompt_order:[{character_id:100000,order:[]},{character_id:100001,order:prompts.map(p=>({identifier:p.identifier,enabled:p.enabled!==false}))}],extensions:{tisya:{version:'tisya.six.w54.1',format:'six-blocks/1',scope:'single native RP; no form preflight or archive calls'}}};
const defaults=sixEntries(fullDefaultConfiguration(),DEFAULT_MOODS),reference=prompts.map(p=>p.marker?'':defaults[p.identifier]??p.content).filter(Boolean).join('\n\n');
for(const [path,text]of [['presets/Tisya-Six-Blocks-1.json',JSON.stringify(preset,null,2)+'\n'],['presets/Tisya-Six-Blocks-1.txt',reference+'\n']]){
 if(process.argv.includes('--check')){if(await read(path)!==text)throw Error('Stale '+path);}
 else await writeFile(new URL(path,root),text);
}
console.log('Six-block native preset and complete text synchronized');
