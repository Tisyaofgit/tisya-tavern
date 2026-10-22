import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createStore} from '../config/core.js';
import {mountConfiguration} from '../config/panel.js';
import {NARRATIVE as N} from '../settings-core.js';
import {narrativeRuleDefault} from '../config/rule-text.js';

test('rule editor tracks the newly selected narrative option before wording is edited',async()=>{
 const win=new Window(),context={chatId:'one',characterId:0,characters:[{avatar:'a',name:'甲'}],extensionSettings:{}},store=createStore({getContext:()=>context,persist:async()=>true}),view=mountConfiguration(win.document,win.document.body,{store,host:{connections:()=>[],presets:()=>[]},getSettings:()=>({}),initialTab:'mode'});try{await view.ready;const root=view.root.shadowRoot,picker=root.querySelector('[aria-label="选择润色规则"]');picker.value='B04';picker.dispatchEvent(new win.Event('change'));const area=root.querySelector('[aria-label="当前规则提示词"]');assert.equal(area.value,narrativeRuleDefault('B04','视角人物内心'));
 const label=N.rows.find(row=>row.id==='B04').label,choice=root.querySelector('[aria-label="'+label+'"]');assert(choice);choice.value=JSON.stringify('行为外化');choice.dispatchEvent(new win.Event('change'));await view.settled();[...root.querySelectorAll('.tisya-section-link')].find(b=>b.textContent==='提示词润色 ›').click();
 assert.equal(area.value,narrativeRuleDefault('B04','行为外化'));assert.match(picker.selectedOptions[0].textContent,/行为外化/);area.value='只写可见动作，保留人物声口。';area.dispatchEvent(new win.Event('change'));await [...root.querySelectorAll('button')].find(b=>b.textContent==='保存配置').onclick();assert.equal(store.read().world.modes.narrative.叙事指令.B04.行为外化,'只写可见动作，保留人物声口。');
 }finally{view.dispose();await win.happyDOM.close();}
});
