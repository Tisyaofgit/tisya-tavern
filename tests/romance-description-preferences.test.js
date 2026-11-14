import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {baseline,createConfiguration,compilePrompts,applyCompiledMessages} from '../engine/config.mjs';
import {effectivePreferences} from '../engine/preferences.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';

const choices={'S08-Dial':'S08-Dial-D','S08-Look':'S08-Look-D','S08-Mind':'S08-Mind-D','S08-MindVoice':'S08-MindVoice-B',N05:'N05-C',N02:'N02-C'};
test('independent romance controls reach actual outgoing prompts while retaining POV and player boundaries',()=>{
 const config={tags:{},prompts:{},story:{userName:'主控乙',play:{choices}}},compiled=compilePrompts(baseline,config,{});
 const expand=s=>s.replaceAll('{{char}}','角色甲').replaceAll('{{user}}','主控乙').replace(/\{\{tisya_[\w]+\}\}/g,'');
 const enabled=new Set(baseline.prompt_order.find(g=>g.character_id===100001).order.filter(r=>r.enabled).map(r=>r.identifier));
 const input=baseline.prompts.filter(p=>!p.marker&&p.enabled!==false&&enabled.has(p.identifier)&&expand(p.content).trim()).map(p=>({role:p.role,content:expand(p.content)}));
 const text=applyCompiledMessages(input,baseline,compiled,expand).map(p=>p.content).join('\n');
 for(const key of ['APPEARANCE.RATIO','PSYCHOLOGY.RATIO','PSYCHOLOGY.VOICE'])assert.equal(text.split('@'+key+' :=').length-1,1,key);
 assert.match(text,/角色甲.*主控乙.*美貌、帅气/);assert.match(text,/第一人称|「我」直接呈现内心独白/);
 assert.match(text,/严禁新增任何未提供的/);assert.match(text,/全文使用第二人称/);assert.match(text,/台词少而狠准/);
 assert.equal(config.story.play.choices.N05,'N05-C');assert.equal(config.story.play.choices.N02,'N02-C');
 const source=structuredClone(baseline),plain=compilePrompts(source,{tags:{},prompts:{},story:{play:{choices:{}}}},{});
 assert.doesNotMatch(plain.prompts.find(p=>p.identifier==='tisya_pref_style').content,/@APPEARANCE.RATIO|@PSYCHOLOGY\.(RATIO|VOICE)/);
 assert.deepEqual(source,baseline);
});
test('real settings UI saves the three controls, isolates stories, inherits defaults and survives cold reopen',async()=>{
 const w=new Window(),ctx={extensionSettings:{},chatId:'romance-A',characterId:0},store=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const initial=store.read();initial.playDefaults={choices:{'S08-Look':'S08-Look-B'}};await store.save(initial);
 const root=w.document.createElement('div');w.document.body.append(root);let ui=mountMatrixConfiguration(w.document,root,{service:{config:store}});await ui.ready;
 for(const id of ['S08-Look','S08-Mind','S08-MindVoice']){const select=root.querySelector('[data-preference-group="'+id+'"] select');assert.ok(select);select.value=choices[id];select.dispatchEvent(new w.Event('change'));}
 const search=root.querySelector('[aria-label="搜索偏好"]');search.value='描写占比';search.dispatchEvent(new w.Event('input'));assert.deepEqual([...root.querySelectorAll('[data-preference-group]')].filter(n=>!n.hidden).map(n=>n.dataset.preferenceGroup),['S08-Dial','S08-Look','S08-Mind','S08-MindVoice']);
 const save=[...root.querySelectorAll('button')].find(b=>b.textContent==='保存');save.click();await new Promise(r=>setTimeout(r,0));
 assert.equal(effectivePreferences(store.read()).choices['S08-Look'],'S08-Look-D');ui.dispose();
 ctx.chatId='romance-B';assert.equal(effectivePreferences(store.read()).choices['S08-Look'],'S08-Look-B');assert.equal(effectivePreferences(store.read()).choices['S08-Mind'],undefined);
 ctx.chatId='romance-A';const cold=createConfiguration({getContext:()=>ctx,persist:async()=>true});ui=mountMatrixConfiguration(w.document,root,{service:{config:cold}});await ui.ready;
 for(const id of ['S08-Look','S08-Mind','S08-MindVoice'])assert.equal(root.querySelector('[data-preference-group="'+id+'"] select').value,choices[id]);
 ui.dispose();await w.happyDOM.abort();
});
