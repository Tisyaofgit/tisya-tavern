import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountSettingsHome} from '../settings-home.js';
import {settingsDestinations} from '../settings-navigation.js';
test('settings exposes five distinct management routes and restores expansion after searching all features',()=>{
 const w=new Window(),d=w.document,box=d.createElement('div');d.body.append(box);
 mountSettingsHome(box,{rows:settingsDestinations(),version:'test'});
 assert.deepEqual([...box.querySelectorAll('[data-settings-group]')].map(n=>n.dataset.settingsGroup),['play','reading','world','model','data','native']);assert(box.querySelector('[data-tisya-action=assistant]'));assert(box.querySelector('[data-tisya-action=user-identity]'));
 const actions=[...box.querySelectorAll('[data-tisya-action]')].map(n=>n.dataset.tisyaAction);assert.equal(actions.length,new Set(actions).size);
 const input=box.querySelector('input'),comfort=box.querySelector('[data-settings-group="reading"]');assert(!comfort.open);input.value='背景';input.oninput();assert(comfort.open);assert.equal(box.querySelectorAll('.tisya-setting-destination:not([hidden])').length,1);
 input.value='不存在的功能';input.oninput();assert.match(box.querySelector('[role=status]').textContent,/没有找到/);
 input.value='';input.oninput();assert(!comfort.open);assert.equal(box.querySelectorAll('.tisya-setting-destination:not([hidden])').length,actions.length-2);w.happyDOM.abort();
});
