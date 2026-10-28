import test from 'node:test';import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {STYLE_CARDS,styleProjection,viewSelection} from '../config/style-cards.js';
import {emptyConfig,defaultWorld,compileSelected,validateConfig,cleanExport} from '../config/core.js';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';import {onePassEntries} from '../onepass/preset.mjs';
import {mountActionChoice} from '../actions.js';
test('three cards resolve independently, expand viewpoint fields, survive backup, and leave unselected lenses absent',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;
 assert.equal(compileSelected(d,w).text,'');assert.equal(w.styleCards,undefined);
 w.styleCards={tone:'builtin.card.tone.tender',view:'builtin.card.view.female',sentence:'builtin.card.sentence.subtext'};
 w.parameters[w.styleCards.view]={direction:'char 凝视 user',focus:'声音与手部'};
 validateConfig(d);const text=compileSelected(d,w,'main',{labels:true}).text;
 assert.match(text,/基调卡/);assert.match(text,/视角卡/);assert.match(text,/句式卡/);assert.match(text,/char→user/);assert.match(styleProjection(w),/声音与手部/);assert.ok(!text.includes('${'));assert.ok(!text.includes('男凝·视觉欲望'));
 const restored=JSON.parse(JSON.stringify(cleanExport(d))).configuration;validateConfig(restored);assert.deepEqual(restored.worlds.a.styleCards,w.styleCards);
 w.styleCards.view='builtin.card.tone.tender';assert.throws(()=>validateConfig(d),/类型不符/);
});
test('selected lenses reach the current style owner while the eleven-block skeleton and paired comments remain',()=>{
 const c=fullDefaultConfiguration();c.world.styleCards={view:'builtin.card.view.user'};c.resources=[STYLE_CARDS.find(r=>r.id===c.world.styleCards.view)];
 const out=onePassEntries(c,DEFAULT_MOODS);assert.match(out.tisya_material_style,/user凝视/);assert.match(out.tisya_registry,/<think phase="after">/);assert.match(out.tisya_registry,/回应用户评价/);assert.match(out.tisya_registry,/<memory/);
});
test('action pressure cancels on scrolling and teardown without executing a choice',async()=>{
 const w=new Window(),d=w.document,host=d.createElement('div');d.body.append(host);let calls=0;const ui=mountActionChoice(d,host,{rows:[{text:'读信'}],onChoose:()=>calls++}),b=host.querySelector('.action');
 const pointer=(target,type,x)=>target.dispatchEvent(new w.PointerEvent(type,{bubbles:true,isPrimary:true,button:0,pointerId:1,clientX:x,clientY:0}));
 pointer(b,'pointerdown',0);assert.equal(b.dataset.tuiPress,'true');pointer(d,'pointermove',20);assert.equal(b.hasAttribute('data-tui-press'),false);assert.equal(calls,0);
 pointer(b,'pointerdown',0);pointer(d,'pointercancel',0);assert.equal(b.hasAttribute('data-tui-press'),false);ui.dispose();pointer(b,'pointerdown',0);assert.equal(b.hasAttribute('data-tui-press'),false);assert.equal(calls,0);await w.happyDOM.abort();
});
test('configuration saves and reopens a viewpoint card with its gaze relation and attention fields',async()=>{
 const {mountConfiguration}=await import('../config/panel.js'),{createStore}=await import('../config/core.js');const win=new Window(),doc=win.document,box=doc.createElement('div');doc.body.append(box);
 const ctx={chatId:'lens-ui',characterId:0,characters:[{avatar:'lens.png'}],chatMetadata:{variables:{}},extensionSettings:{}},store=createStore({getContext:()=>ctx,persist:async()=>true});
 const mount=()=>mountConfiguration(doc,box,{store,host:{archives:async()=>[]},getSettings:()=>({联系人分组:{}}),initialTab:'world'});let ui=mount();await ui.ready;
 const choose=(label,value)=>{const input=ui.root.shadowRoot.querySelector('[aria-label="'+label+'"]');assert.ok(input,label);input.value=JSON.stringify(value);input.dispatchEvent(new win.Event('change'));};
 choose('视角卡','builtin.card.view.female');await win.happyDOM.whenAsyncComplete();choose('谁凝视谁','builtin.card.view.user');await win.happyDOM.whenAsyncComplete();choose('user体位倾向','主受');
 const focus=ui.root.shadowRoot.querySelector('[aria-label="凝视关注"]');focus.value='声音';focus.dispatchEvent(new win.Event('change'));
 [...ui.root.shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='保存配置').click();await ui.settled();assert.equal(store.read().world.styleGaze.focus,'声音');ui.dispose();ui=mount();await ui.ready;
 assert.equal(JSON.parse(ui.root.shadowRoot.querySelector('[aria-label="视角卡"]').value),'builtin.card.view.female');assert.equal(JSON.parse(ui.root.shadowRoot.querySelector('[aria-label="谁凝视谁"]').value),'builtin.card.view.user');assert.equal(ui.root.shadowRoot.querySelector('[aria-label="凝视关注"]').value,'声音');ui.dispose();await win.happyDOM.abort();
});

test('legacy direction references stay effective and explicit empty gaze removes that selection without mutating old values',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;w.styleCards={view:'builtin.card.view.char'};const before=JSON.stringify(w);validateConfig(d);assert.match(compileSelected(d,w).text,/char 的审美和欲望凝视 user/);assert.equal(viewSelection(w).gaze,'builtin.card.view.char');assert.equal(JSON.stringify(w),before);w.styleCards.gaze=null;assert.equal(compileSelected(d,w).text,'');
});
test('desire lens and gaze direction combine independently while roles and target aesthetics reach the style owner once',()=>{
 for(const lens of ['female','male'])for(const gaze of ['user','char','audience']){const c=fullDefaultConfiguration();c.world.styleCards={view:'builtin.card.view.'+lens,gaze:'builtin.card.view.'+gaze};c.world.styleGaze={userRole:'主攻',focus:'声音'};c.world.styleAesthetics={user:['高冷化'],others:['富态','慕强']};const out=onePassEntries(c,DEFAULT_MOODS);assert.match(out.tisya_material_style,/user主攻/);assert.match(out.tisya_material_style,/其他角色审美：富态/);assert.match(out.tisya_material_style,/user审美：高冷化/);assert.match(out.tisya_material_style,/凝视关注：声音/);assert.match(out.tisya_material_style,new RegExp(lens==='female'?'女凝':'男凝'));assert.match(out.tisya_material_style,new RegExp(gaze==='user'?'user凝视':gaze==='char'?'char凝视':'观众凝视'));assert.doesNotMatch(out.tisya_material_rule_material,/user主攻/);}
});
test('aesthetic and role configuration validates exact values; necessary youthful-design restriction is singular and front-loaded',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;w.styleAesthetics={user:['幼态（非情色造型）'],others:['可爱化']};w.styleGaze={userRole:'主受'};validateConfig(d);assert.ok(styleProjection(w).startsWith('禁止将幼态特征用于欲望或情色描写。'));assert.equal(styleProjection(w).split('禁止').length-1,1);w.styleGaze.userRole='猜测';assert.throws(()=>validateConfig(d),/凝视倾向/);w.styleGaze.userRole='可攻可受';w.styleAesthetics.user=['未知'];assert.throws(()=>validateConfig(d),/审美选项/);
});
test('built-in writing cards use direct positive instructions without repeated boundary paragraphs',()=>{
 for(const card of STYLE_CARDS){assert.doesNotMatch(card.content,/不把|不从|不替|不让|不要|不借|不强制|禁止/);assert.ok(card.content.length<180);}
});

test('legacy select-style mode accepts actual three-card resources and still rejects an empty selection',()=>{
 const c=fullDefaultConfiguration();c.world.modes.narrative.narrative.缇斯亚叙事文风='选文风卡';assert.throws(()=>onePassEntries(c,DEFAULT_MOODS),/actual style/);c.world.styleCards={view:'builtin.card.view.male',gaze:'builtin.card.view.char'};assert.match(onePassEntries(c,DEFAULT_MOODS).tisya_material_style,/男凝/);
});
