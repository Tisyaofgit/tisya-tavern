import {writeFileSync} from 'node:fs';
import {baseline,compilePrompts,applyCompiledMessages} from '../../../engine/config.mjs';
import previous from './previous-prompts.json' with {type:'json'};
const source=structuredClone(baseline);
for(const [id,content] of Object.entries(previous.installed))source.prompts.find(p=>p.identifier===id).content=content;
const config={tags:{},prompts:{},story:{userName:'合成主控',play:{choices:{R01:'R01-A',R04:'R04-A','S08-Look':'S08-Look-D','S08-Mind':'S08-Mind-D','S08-MindVoice':'S08-MindVoice-B'}}}};
const compiled=compilePrompts(source,config,{});
const expand=s=>s.replace(/\{\{tisya_[\w]+\}\}/g,'').replaceAll('{{char}}','合成人物').replaceAll('{{user}}','合成主控');
const order=source.prompt_order.find(g=>g.character_id===100001).order;
const input=[];
for(const entry of order){const p=source.prompts.find(p=>p.identifier===entry.identifier);if(!entry.enabled||!p||p.marker||p.enabled===false||!expand(p.content).trim())continue;input.push({role:p.role,content:expand(p.content)});}
input.push({role:'user',content:'他合上账本，说今天先谈到这里。我留意到他还压着那张旧借据。'});
const sent=applyCompiledMessages(input,source,compiled,expand);
writeFileSync(new URL('./final-request.json',import.meta.url),JSON.stringify({scope:'Synthetic compile and native-message replacement; no external model call',choices:config.story.play.choices,messages:sent},null,2)+'\n');
