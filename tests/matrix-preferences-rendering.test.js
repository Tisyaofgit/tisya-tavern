import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {PREFERENCE_GROUPS,applyPreferences,effectivePreferences,wishPreferences} from '../engine/preferences.mjs';
import {baseline,createConfiguration,compilePrompts} from '../engine/config.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {BUILTIN_RESOURCES,renderingResources,configureRenderingResources,resourcePromptSlots,resolveRendering,projectRendering} from '../rendering-resources.js';
import {inspectMatrix} from '../engine/display.mjs';
import {mountActionChoice} from '../actions.js';
import {mountHeartBlock} from '../reply-details.js';
const clone=structuredClone;
const fixture=(actions='想怎么做都行|我打开门。|看清屋内')=>'<reply id="tisya-onepass-1"><task/><anchor phase="before">与用户互动|@rendering{emotion.好奇}|看看门后吧。</anchor><title>门前|夜|门外|世界</title><body>1 门上挂着一幅画。@rendering{scene.door}</body><anchor phase="after"/><extra>@rendering{sound.bell}</extra><cells/><vars/><archive/><actions>'+actions+'</actions></reply>';
const extra=[{id:'scene.door',name:'门边的画',kind:'image',slot:'body',url:'https://example.test/door.png'},{id:'sound.bell',name:'钟声',kind:'audio',slot:'extra',url:'https://example.test/bell.ogg'}];
const key=effect=>/^@([^\s:={]+)/u.exec(effect)[1];
const tick=()=>new Promise(r=>setTimeout(r,0));
const button=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
test('all 188 recovered choices compile their exact source effect once and remove competing choices',()=>{
 assert.equal(PREFERENCE_GROUPS.length,43);assert.equal(PREFERENCE_GROUPS.reduce((n,g)=>n+g.options.length,0),188);
 for(const group of PREFERENCE_GROUPS)for(const option of group.options){
  const config={tags:{},prompts:{},story:{userName:'阿青',wish:'只写眼前的事。',play:{choices:{[group.id]:group.multiple?[option.id]:option.id},parameters:{main_language:'中文',active_avatar_dossier_id:'u01'}}}};
  if(option.id==='N01-B')config.story.userBinding={book:'基点书',uid:7};
  const entries=clone(baseline.prompts);applyPreferences(entries,config);
  const actual=group.id==='W'?wishPreferences(config):entries.find(p=>p.identifier===group.slot).content;
  const expected=option.effect.replaceAll('{{main_language}}','中文').replaceAll('{{active_avatar_dossier_id}}',option.id==='N01-B'?'基点书#7':'u01').replaceAll('{{user_custom_wish_raw_text}}',config.story.wish).replaceAll('personaDescription','tisya_user_identity');
  assert(actual.includes(expected),option.id+' did not reach its slot');
  assert.equal(actual.split('\n').filter(line=>line.startsWith('@'+key(option.effect))&&/^@[^\s:={]+\s*(?::=|::|=)/u.test(line)).length,1,option.id+' duplicate');
  for(const other of group.options)if(key(other.effect)!==key(option.effect))assert(!actual.includes('@'+key(other.effect)+' '),option.id+' retained '+other.id);
 }
 const untouched=clone(baseline.prompts);applyPreferences(untouched,{story:{}});assert.deepEqual(untouched,baseline.prompts);
});
test('story overrides inherit global choices and survive UI save, second save and cold reopen',async()=>{
 const w=new Window(),ctx={extensionSettings:{},chatId:'story',characterId:0};const store=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const v=store.read();v.playDefaults={choices:{N02:'N02-B'},parameters:{main_language:'中文'}};await store.save(v);
 const root=w.document.createElement('div');w.document.body.append(root);let ui=mountMatrixConfiguration(w.document,root,{service:{config:store}});await ui.ready;
 assert.equal(root.querySelectorAll('[data-preference-group]').length,41);
 let select=root.querySelector('[data-preference-group="N02"] select');assert.equal(select.value,'N02-B');select.value='N02-C';select.dispatchEvent(new w.Event('change'));
 button(root,'保存').click();await tick();select=root.querySelector('[data-preference-group="N02"] select');select.value='N02-D';select.dispatchEvent(new w.Event('change'));button(root,'保存').click();await tick();assert.equal(store.read().story.play.choices.N02,'N02-D');
 ui.dispose();const reopened=createConfiguration({getContext:()=>ctx,persist:async()=>true});ui=mountMatrixConfiguration(w.document,root,{service:{config:reopened}});await ui.ready;assert.equal(root.querySelector('[data-preference-group="N02"] select').value,'N02-D');
 ctx.chatId='other';assert.equal(effectivePreferences(reopened.read()).choices.N02,'N02-B');ctx.chatId='story';
 const bad=reopened.read();bad.playDefaults.parameters.min_length=100;bad.story.play.parameters={max_length:50};await assert.rejects(()=>reopened.save(bad),/范围/);
 ui.dispose();await w.happyDOM.abort();
});
test('one multimedia declaration lists only registered literal IDs and their slots',()=>{
 const slots=resourcePromptSlots(extra),text=Object.values(slots).join('\n');assert.equal(Object.keys(slots).length,1);assert.equal(text.split('[MULTIMEDIA]').length-1,1);assert.match(text,/逐字重复可选ID/);
 const compiled=compilePrompts(baseline,{tags:{body:'storyBody'},prompts:{},story:{userName:'阿青'}},resourcePromptSlots([{id:'body',name:'{{user}}',kind:'image',slot:'body',url:'https://example.test/p.png'}]));const media=compiled.prompts.find(p=>p.identifier==='tisya_selected_resources').content;assert.match(media, /"id":"body"/);assert.match(media,/"meaning":"\{\{user\}\}"/);assert.match(media,/"slot":"body"/);
 const rows=JSON.parse(text.split('@rendering.resources := ')[1].split('\n')[0]);assert.equal(rows.length,12);for(const row of rows){const actual=renderingResources(extra).find(r=>r.id===row.id);assert.equal(row.meaning,actual.name);assert.equal(row.slot,actual.slot);}
 assert.throws(()=>resolveRendering('@rendering{好奇}','anchor'),/未登记/);assert.throws(()=>resolveRendering('@rendering{scene.door}','extra',renderingResources(extra)),/未登记/);assert.equal(resolveRendering('@rendering{emotion.好奇}','anchor')[0].url,BUILTIN_RESOURCES.find(r=>r.name==='好奇').url);
 assert.throws(()=>renderingResources([{...extra[0],id:'emotion.好奇'}]),/重复/);assert.throws(()=>renderingResources([{...extra[0],url:''}]),/地址/);assert.throws(()=>renderingResources([{...extra[0],url:'javascript:alert(1)'}]),/地址/);
 assert.match(projectRendering('@rendering{scene.door}','body',renderingResources(extra)),/<img src="https:\/\/example.test\/door.png"/);assert.match(projectRendering('@rendering{sound.bell}','extra',renderingResources(extra)),/<audio controls/);
 assert.match(projectRendering('@rendering{not.registered}','body'),/未登记/);
});
test('free and omitted action categories keep exact labels and submit only action text; mapped heart renders',async()=>{
 configureRenderingResources(extra);const raw=fixture('临时起意随口问问|我打开门。|看清屋内\n我坐下等一会儿。\n我敲敲门。|等人回应');const snapshot=raw,v=inspectMatrix(raw);assert.equal(raw,snapshot);assert.equal(v.actions.error,undefined);assert.deepEqual(v.actions.value.map(x=>x.type),['临时起意随口问问','','']);assert.match(v.body.value,/<img /);
 const w=new Window(),root=w.document.createElement('div');w.document.body.append(root);const calls=[];mountActionChoice(w.document,root,{rows:v.actions.value,onChoose:t=>calls.push(t)});assert.equal(root.querySelectorAll('.action-type').length,1);root.querySelectorAll('.action')[1].click();await tick();assert.deepEqual(calls,['我坐下等一会儿。']);
 const host=w.document.createElement('div');w.document.body.append(host);mountHeartBlock(w.document,host,{status:'有内容',items:[{type:'输入评价',mood:'@rendering{emotion.好奇}',text:'看看门后吧。'}]});await tick();assert.equal(host.querySelector('img')?.alt,'好奇');assert.match(host.querySelector('img')?.src,/assets\/emotions\/2.png/);
 configureRenderingResources([]);await w.happyDOM.abort();
});
