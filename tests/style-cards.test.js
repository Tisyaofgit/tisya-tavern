import test from 'node:test';import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {STYLE_CARDS} from '../config/style-cards.js';
import {emptyConfig,defaultWorld,compileSelected,validateConfig,cleanExport} from '../config/core.js';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';import {onePassEntries} from '../onepass/preset.mjs';
import {mountActionChoice} from '../actions.js';
test('three cards resolve independently, expand viewpoint fields, survive backup, and leave unselected lenses absent',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;
 assert.equal(compileSelected(d,w).text,'');assert.equal(w.styleCards,undefined);
 w.styleCards={tone:'builtin.card.tone.tender',view:'builtin.card.view.female',sentence:'builtin.card.sentence.subtext'};
 w.parameters[w.styleCards.view]={direction:'char 凝视 user',focus:'声音与手部'};
 validateConfig(d);const text=compileSelected(d,w,'main',{labels:true}).text;
 assert.match(text,/基调卡/);assert.match(text,/视角卡/);assert.match(text,/句式卡/);assert.match(text,/char 凝视 user/);assert.match(text,/声音与手部/);assert.ok(!text.includes('${'));assert.ok(!text.includes('男凝·视觉欲望'));
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
 choose('视角卡','builtin.card.view.user');await win.happyDOM.whenAsyncComplete();choose('凝视关系','user 凝视 char');
 const focus=ui.root.shadowRoot.querySelector('[aria-label="关注偏好"]');focus.value='声音';focus.dispatchEvent(new win.Event('change'));
 [...ui.root.shadowRoot.querySelectorAll('button')].find(b=>b.textContent==='保存配置').click();await ui.settled();assert.equal(store.read().world.parameters['builtin.card.view.user'].focus,'声音');ui.dispose();ui=mount();await ui.ready;
 assert.equal(JSON.parse(ui.root.shadowRoot.querySelector('[aria-label="视角卡"]').value),'builtin.card.view.user');assert.equal(JSON.parse(ui.root.shadowRoot.querySelector('[aria-label="凝视关系"]').value),'user 凝视 char');assert.equal(ui.root.shadowRoot.querySelector('[aria-label="关注偏好"]').value,'声音');ui.dispose();await win.happyDOM.abort();
});

test('char gaze is an independent viewpoint card with a character-owned attention rule and fixed direction',()=>{
 const d=emptyConfig(),w=defaultWorld();d.worlds.a=w;w.styleCards={view:'builtin.card.view.char'};validateConfig(d);const text=compileSelected(d,w,'main',{labels:true}).text;assert.match(text,/char凝视/);assert.match(text,/char 自己的审美/);assert.match(text,/凝视关系：char 凝视 user/);assert.ok(!text.includes('${'));w.styleCards.view='builtin.card.view.user';assert.match(compileSelected(d,w).text,/凝视关系：user 凝视 char/);w.styleCards.view='builtin.card.view.char';w.parameters[w.styleCards.view]={direction:'user 凝视 char'};assert.throws(()=>compileSelected(d,w),/参数无效/);
});
