import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capture,validate,groupContacts } from '../model.js';
function fixture(){return {chat:[{mes:'甲',swipe_id:0},{mes:'乙',swipe_id:1}],getCurrentChatId:()=> 'one'}}
test('stale message, changed swipe and changed branch refuse commit',()=>{for(const mutate of [c=>c.chat[0].mes='改写',c=>c.chat[0].swipe_id=1,c=>c.chat[0]={...c.chat[0]},c=>c.getCurrentChatId=()=> 'two']){const c=fixture(),t=capture(c,0);mutate(c);assert.throws(()=>validate(c,t))}});
test('tail mutation refuses bulk deletion, unloaded slot is not a message',()=>{const c=fixture(),t=capture(c,0);c.chat.push({mes:'丙'});assert.throws(()=>validate(c,t,{tail:true}));c.chat[1]=null;assert.throws(()=>capture(c,1));});
test('duplicate names remain separate contacts and grouping follows stable avatar',()=>{const cards=[{name:'同名',avatar:'a.png',tags:['单人']},{name:'同名',avatar:'b.png',tags:['世界']}];const g=groupContacts(cards,{'a.png':'单人卡','b.png':'世界卡'});assert.equal(g.get('单人卡')[0].avatar,'a.png');assert.equal(g.get('世界卡')[0].avatar,'b.png');assert.deepEqual(g.get('世界卡')[0].tags,['世界']);});
