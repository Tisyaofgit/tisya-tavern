import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountSettingsHome} from '../settings-home.js';
import {settingsDestinations} from '../settings-navigation.js';
test('settings exposes five distinct management routes and restores expansion after searching all features',()=>{
 const w=new Window(),d=w.document,box=d.createElement('div');d.body.append(box);
 mountSettingsHome(box,{rows:settingsDestinations(),version:'test'});
 assert.deepEqual([...box.querySelectorAll('[data-settings-group="library"] button')].map(b=>b.textContent.trim()),['用户身份原点档案、角色和会话绑定','角色卡资料、会话与导入导出','预设生成参数与预设管理','世界书条目、角色绑定与批量操作','群聊成员、规则与会话管理']);
 const actions=[...box.querySelectorAll('[data-tisya-action]')].map(n=>n.dataset.tisyaAction);assert.equal(actions.length,new Set(actions).size);
 const input=box.querySelector('input'),comfort=box.querySelector('[data-settings-group="comfort"]');assert(!comfort.open);input.value='背景';input.oninput();assert(comfort.open);assert.equal(box.querySelectorAll('.tisya-setting-destination:not([hidden])').length,1);
 input.value='不存在的功能';input.oninput();assert.match(box.querySelector('[role=status]').textContent,/没有找到/);
 input.value='';input.oninput();assert(!comfort.open);assert.equal(box.querySelectorAll('.tisya-setting-destination:not([hidden])').length,actions.length);w.happyDOM.abort();
});
