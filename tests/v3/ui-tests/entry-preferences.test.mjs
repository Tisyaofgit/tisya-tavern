import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountWorkbench} from '../../../v3/workbench.mjs';
import {createCapabilities} from '../../../v3/capabilities.mjs';
import {createReviewService} from '../../../v3/review.mjs';
import {tableRegistry,projectRetained} from '../../../v3/host-runtime.mjs';
import {createSharedPreferenceService} from '../../../v3/runtime-source/preferences/shared-store.mjs';
import {fixture,seedPreferences} from '../review-tests/fixtures.mjs';
const copy=structuredClone;
async function ui(capabilities,initialPage='home'){
 const win=new Window({url:'http://localhost/'}),view=mountWorkbench(win.document,win.document.body,{capabilities,initialPage,stylesheetURL:'http://localhost/workbench.css'});await view.ready;
 const sh=view.shadow;return {win,view,sh,async click(name){const button=[...sh.querySelectorAll('button')].find(b=>b.textContent===name||b.querySelector('strong')?.textContent===name);assert.ok(button,'button '+name);button.click();await view.settled();},dispose(){view.dispose();capabilities.dispose?.();win.happyDOM.abort();}};
}
for(const [label,heading]of [['初始化／从资料提炼','初始化／从资料提炼'],['世界档案','世界档案'],['历史补录','历史补录']])test('failed '+label+' navigation shows its failure and an explicit fresh retry',async()=>{
 let failed=true,reads=0;const capabilities=createCapabilities({archives:{inspect:async()=>{reads++;if(failed)throw Error('聊天元数据回读不一致：tisya_w24');return {registry:tableRegistry,rows:[],timeline:[]};}},books:{list:async()=>[]}}),v=await ui(capabilities);
 await v.click(label);assert.match(v.sh.querySelector('main').textContent,new RegExp(heading));assert.match(v.sh.querySelector('main').textContent,/读取未完成/);assert.match(v.sh.textContent,/聊天元数据回读不一致/);assert.equal(reads,1);assert.doesNotMatch(v.sh.querySelector('main').textContent,/让故事继续向前/);
 await v.click('全部设置');assert.equal(v.view.getState().page,'settings');await v.view.navigate('home');await v.click(label);assert.equal(reads,2);failed=false;await v.click('重新读取此页');assert.equal(reads,3);assert.doesNotMatch(v.sh.querySelector('main').textContent,/读取未完成/);if(label!=='世界档案')assert.ok(v.sh.querySelector('textarea'));v.dispose();
});
test('user preferences home entry uses actual shared contributions, projection and confirmation service',async()=>{
 const f=fixture();seedPreferences(f);const caps=createCapabilities({review:f.review,getBinding:f.owner}),v=await ui(caps);
 await v.click('用户偏好');assert.equal(v.view.getState().page,'preferences');assert.match(v.sh.textContent,/待确认/);assert.match(v.sh.textContent,/拉扯/);assert.equal(f.p.writes(),0);
 await v.click('拉扯');await v.click('确认偏好');assert.equal(f.p.writes(),1);assert.equal(v.view.getState().page,'preferences');const card=v.sh.querySelector('.preference-group');assert.ok(card);assert.match(card.textContent,/拉扯/);assert.match(card.textContent,/鼓励 \+2/);assert.match(card.textContent,/厌恶 0/);assert.match(card.textContent,/本会话/);assert.match(card.textContent,/当前生效/);assert.match(v.sh.textContent,/待确认/);assert.equal((await f.preferences.project()).groups[0].net,2);v.dispose();
});
test('preference visualization retains positive negative and hard constraints separately and never activates another chat scope',async()=>{
 const f=fixture();seedPreferences(f);await f.preferences.confirm('draft');let bank=f.p.get();const first=bank.preferenceRows[0];const negative=copy(first);Object.assign(negative,{id:'negative',preferenceSource:'user:2'});Object.assign(negative.values,{赋分:-5,强度:'厌恶',证据:'这种拉扯太多了'});bank.preferenceRows.push(negative);const hard=copy(first);Object.assign(hard,{id:'hard',preferenceSource:'feedback:hard'});Object.assign(hard.values,{核心标签:'禁止复述',强度:'禁止',赋分:0});bank.preferenceRows.push(hard);const foreign=copy(first);Object.assign(foreign,{id:'foreign',preferenceSource:'feedback:foreign'});Object.assign(foreign.values,{核心标签:'另一会话偏好',作用域:{会话:['elsewhere']}});bank.preferenceRows.push(foreign);f.p.set(bank);
 const caps=createCapabilities({review:f.review,getBinding:f.owner}),v=await ui(caps,'preferences'),card=[...v.sh.querySelectorAll('.preference-group')].find(n=>n.textContent.includes('拉扯'));
 assert.ok(card);assert.match(card.textContent,/鼓励 \+2/);assert.match(card.textContent,/厌恶 -5/);assert.match(card.textContent,/合计 -3/);assert.match(v.sh.textContent,/禁止复述/);assert.equal([...v.sh.querySelectorAll('.preference-group')].some(n=>n.textContent.includes('另一会话偏好')),false);assert.match(v.sh.textContent,/本会话未生效/);assert.match(v.sh.textContent,/另一会话偏好/);assert.equal(f.p.writes(),1);v.dispose();
});
test('disabled preference processing remains visible read only without becoming an empty bank or active projection',async()=>{
 const f=fixture();seedPreferences(f);await f.preferences.confirm('draft');const preferences=createSharedPreferenceService({sessionStorage:f.b,preferenceStorage:f.p,getSessionOwner:()=>({chatId:'chat',branchId:'branch'}),isEnabled:()=>false,getProjectionOptions:()=>({context:{chatId:'chat'},activeSourceKeys:f.owner().activeSourceKeys})}),review=createReviewService({storage:f.storage,getScope:f.owner,projectRetained,preferenceService:preferences}),caps=createCapabilities({review,getBinding:f.owner}),v=await ui(caps,'preferences');
 assert.match(v.sh.textContent,/偏好处理已关闭/);assert.match(v.sh.textContent,/拉扯/);assert.equal(v.sh.querySelectorAll('.preference-group').length,0);assert.equal(f.p.writes(),1);assert.equal((await preferences.list()).rows.length,0);assert.equal((await preferences.list({includeDisabled:true})).rows.length,2);await v.click('拉扯');for(const label of ['手动编辑','停用此条贡献','确认偏好','重新启用此条贡献','存为标签模板'])assert.equal([...v.sh.querySelectorAll('button')].some(b=>b.textContent===label),false,label);assert.equal(f.p.writes(),1);v.dispose();
});
test('same tag in global and current-chat scopes keeps distinct totals and each contribution shows its own scope and context',async()=>{
 const f=fixture();seedPreferences(f);await f.preferences.confirm('draft');const bank=f.p.get(),local=bank.preferenceRows[0];local.values.适用情境='争执之后';const global=copy(local);Object.assign(global,{id:'global-same-tag',preferenceSource:'feedback:global-same-tag'});Object.assign(global.values,{赋分:4,作用域:{全局:true},适用情境:'日常互动'});bank.preferenceRows.push(global);f.p.set(bank);
 const caps=createCapabilities({review:f.review,getBinding:f.owner}),v=await ui(caps,'preferences'),cards=[...v.sh.querySelectorAll('.preference-group')].filter(n=>n.querySelector('strong')?.textContent==='拉扯');assert.equal(cards.length,2);
 const current=cards.find(n=>n.textContent.includes('本会话')),shared=cards.find(n=>n.textContent.includes('跨会话'));assert.ok(current);assert.ok(shared);assert.match(current.textContent,/合计 \+2/);assert.match(shared.textContent,/合计 \+4/);assert.doesNotMatch(current.textContent,/跨会话/);assert.doesNotMatch(shared.textContent,/本会话/);assert.match(current.querySelector('details .row small').textContent,/本会话.*争执之后/);assert.match(shared.querySelector('details .row small').textContent,/跨会话.*日常互动/);assert.equal(f.p.writes(),1);v.dispose();
});
