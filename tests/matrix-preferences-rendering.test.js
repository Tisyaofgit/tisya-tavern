import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {PREFERENCE_GROUPS,applyPreferences,defaultPreferenceSelection,effectivePreferences,wishPreferences} from '../engine/preferences.mjs';
import {baseline,createConfiguration,compilePrompts} from '../engine/config.mjs';
import {mountMatrixConfiguration} from '../engine/ui.mjs';
import {BUILTIN_RESOURCES,renderingResources,configureRenderingResources,configureRenderingMedia,resourcePromptSlots,resolveRendering,projectRendering} from '../rendering-resources.js';
import {inspectMatrix} from '../engine/display.mjs';
import {mountActionChoice} from '../actions.js';
import {mountHeartBlock} from '../reply-details.js';
const clone=structuredClone;
const fixture=(actions='想怎么做都行|我打开门。|看清屋内')=>'<reply id="tisya-onepass-1"><task/><anchor phase="before">与用户互动|@rendering{emotion.好奇}|看看门后吧。</anchor><title>门前|夜|门外|世界</title><body>1 门上挂着一幅画。@rendering{scene.door}</body><anchor phase="after"/><extra>@rendering{sound.bell}</extra><cells/><vars/><archive/><actions>'+actions+'</actions></reply>';
const extra=[{id:'scene.door',name:'门边的画',kind:'image',slot:'body',url:'https://example.test/door.png'},{id:'sound.bell',name:'钟声',kind:'audio',slot:'extra',url:'https://example.test/bell.ogg'}];
const key=effect=>/^@([^\s:={]+)/u.exec(effect)[1];
const hasDirective=(text,directive)=>new RegExp('^@'+directive.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*(?::=|::|=)','mu').test(text);
const tick=()=>new Promise(r=>setTimeout(r,0));
const button=(root,text)=>[...root.querySelectorAll('button')].find(b=>b.textContent===text);
test('all recovered and added choices compile their exact source effect once and remove competing choices',()=>{
 assert.equal(PREFERENCE_GROUPS.length,47);assert.equal(PREFERENCE_GROUPS.reduce((n,g)=>n+g.options.length,0),203);
 assert.equal(PREFERENCE_GROUPS.flatMap(g=>g.options).filter(o=>o.default===true).length,53);
 for(const id of ['S04-Sc9','S04-Sc10'])assert.equal(PREFERENCE_GROUPS.flatMap(g=>g.options).find(o=>o.id===id).default,false);
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
 const defaults=clone(baseline.prompts);applyPreferences(defaults,{story:{}});
 for(const group of PREFERENCE_GROUPS){
  if(group.id==='W')continue;
  const original=baseline.prompts.find(prompt=>prompt.identifier===group.slot),row=defaults.find(prompt=>prompt.identifier===group.slot),selection=defaultPreferenceSelection(group),selected=new Set(selection==null?[]:group.multiple?selection:[selection]);
  for(const option of group.options){
   const directive=key(option.effect);
   if(selected.has(option.id))assert.equal(hasDirective(row.content,directive),hasDirective(original.content,directive),group.id+' rewrote its authored default '+option.id);
   else if(!group.options.some(other=>selected.has(other.id)&&key(other.effect)===key(option.effect)))assert(!hasDirective(row.content,directive),group.id+' retained unselected '+option.id);
  }
 }
 for(const id of ['N10-Plus','TECH','CORP']){
  const group=PREFERENCE_GROUPS.find(row=>row.id===id),row=defaults.find(prompt=>prompt.identifier===group.slot);
  for(const option of group.options)assert(!hasDirective(row.content,key(option.effect)),id+' leaked '+option.id);
 }
});
test('the final body seal follows each actual selection and never hardcodes another mode',()=>{
 const selected=(N02,blocks=[])=>compilePrompts(baseline,{tags:{},prompts:{},story:{userName:'林舟',play:{choices:{N02,'S09-Blocks':blocks,TECH:[],CORP:[]}}}},{}).prompts.find(row=>row.identifier==='tisya_registry').content;
 const first=selected('N02-B'),second=selected('N02-C',['S09-Dialogue','S09-Thought']),third=selected('N02-A');
 assert.match(first,/人称最终门禁：正文旁白使用第一人称/);assert.doesNotMatch(first,/必须至少输出一条该人物的署名心声块/);assert.doesNotMatch(first,/主控对白的署名必须使用/);
 assert.match(second,/人称最终门禁：全文使用第二人称/);assert.match(second,/当前场内真实姓名（本轮绑定为 `林舟`）/);assert.doesNotMatch(second,/禁止输出(?:字面量 )?`user`、`林舟`/);assert.match(second,/必须至少输出一条该人物的署名心声块/);
 assert.match(third,/人称最终门禁：正文旁白使用第三人称/);assert.doesNotMatch(third,/人称最终门禁：全文使用第二人称/);assert.doesNotMatch(third,/必须至少输出一条该人物的署名心声块/);
 for(const text of [first,second,third])assert.equal(text.split('[FINAL_BODY_FORMAT]').length-1,1);
});
test('selected scene configuration resolves protagonist macros and excludes competing narration',()=>{
 const choices={N02:'N02-C','S08-MindVoice':'S08-MindVoice-C','S09-Blocks':['S09-Dialogue','S09-Thought'],TECH:[],CORP:[]};
 const named=compilePrompts(baseline,{tags:{},prompts:{},story:{userName:'加茂澄',play:{choices}}},{}),all=JSON.stringify(named.prompts),narrative=named.prompts.find(row=>row.identifier==='tisya_pref_narrative').content,style=named.prompts.find(row=>row.identifier==='tisya_pref_style').content,registry=named.prompts.find(row=>row.identifier==='tisya_registry').content;
 assert.match(narrative,/@POV\.PERSON := 全文使用第二人称/);assert.doesNotMatch(narrative,/@POV\.PERSON := 正文旁白使用第三人称/);
 assert.match(style,/@BODY\.NAMED_DIALOGUE/);assert.match(style,/@BODY\.NAMED_THOUGHT/);assert.match(style,/主控对白使用 `加茂澄` 展开后的真实角色名/);assert.doesNotMatch(style,/禁止写(?:成)?(?:字面量 )?`user`、`加茂澄`/);
 assert.match(style,/@PSYCHOLOGY\.VOICE := 当前对手戏人物开口或以动作回应时，必须/);assert.match(registry,/\[FINAL_BODY_FORMAT\]/);assert.match(registry,/资料层格式防火墙/);assert.match(registry,/当前场内真实姓名（本轮绑定为 `加茂澄`）/);assert.doesNotMatch(registry,/禁止输出(?:字面量 )?`user`、`加茂澄`/);assert.match(registry,/必须至少输出一条该人物的署名心声块/);assert.match(registry,/人称最终门禁：全文使用第二人称/);assert.match(registry,/交付终检/);
 assert.doesNotMatch(all,/\{\{user\}\}/);
 const native=compilePrompts(baseline,{tags:{},prompts:{},story:{play:{choices}}},{});assert(JSON.stringify(native.prompts).includes('{{user}}'),'unbound protagonist must remain available for one native macro expansion');
});
test('story overrides inherit global choices and survive UI save, second save and cold reopen',async()=>{
 const w=new Window(),ctx={extensionSettings:{},chatId:'story',characterId:0};const store=createConfiguration({getContext:()=>ctx,persist:async()=>true});
 const v=store.read();v.playDefaults={choices:{N02:'N02-B'},parameters:{main_language:'中文'}};await store.save(v);
 const root=w.document.createElement('div');w.document.body.append(root);let ui=mountMatrixConfiguration(w.document,root,{service:{config:store}});await ui.ready;
 assert.equal(root.querySelectorAll('[data-preference-group]').length,45);
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

test('heart mounting resolves a plain custom name through the same bound-media service',async()=>{
 const calls=[];configureRenderingMedia({rendering(id,slot){calls.push([id,slot]);return {id:'custom-happy',name:'自定义开心',kind:'image',slot,url:'https://example.test/custom-happy.png',use:'sticker',frame:{aspectRatio:'1 / 1'}};}});
 const w=new Window(),host=w.document.createElement('div');w.document.body.append(host);
 try{
  mountHeartBlock(w.document,host,{status:'有内容',items:[{type:'输入评价',mood:'自定义开心',text:'保留这条心声。'}]});await tick();
  assert.deepEqual(calls,[['自定义开心','anchor']]);assert.equal(host.querySelector('img')?.alt,'自定义开心');assert.equal(host.querySelector('img')?.src,'https://example.test/custom-happy.png');assert.match(host.textContent,/保留这条心声/);
 }finally{configureRenderingMedia(null);await w.happyDOM.abort();}
});
