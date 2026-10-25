import test from 'node:test';
import assert from 'node:assert/strict';
import {setupFlow,sourceText,change,extraction} from './w34-flow-harness.mjs';
test('actual initialization UI reviews inferred fields and a linked subtable, edits both, then cold-reopens registered data',async t=>{
 const f=await setupFlow(t,{request:(_task,input)=>{assert.equal(input.phase,'definition');const result=extraction([change('new:shopkeeper','objects',{名称:'阿绫',类型:'character',属性:{职责:'修理铺店主'}},sourceText.card),change('new:practice','workshop_duties',{名称:'姓名核对',执行者:'new:shopkeeper',职责:'先核对委托人的姓名'},sourceText.card)]);result.schemaChanges=[{kind:'table',definition:{id:'workshop_duties',name:'修理铺职责',aliases:[],version:1,owner:'archive',fields:{名称:{type:'text',required:true},执行者:{type:'ref',required:true},职责:{type:'text'}}}}];return result;}});
 const state=await (await f.app.getSession()).storage.read();
 await f.click('初始化／从资料提炼');await f.click('读取角色卡和绑定世界书');await f.click('生成初始化草案');
 assert.equal(f.actionErrors.length,0);assert.ok(f.shadow.querySelector('[data-design-schema-review]'));assert.match(f.shadow.textContent,/character.职责/);assert.match(f.shadow.textContent,/workshop_duties/);assert.match(f.shadow.textContent,/仍是草案/);
 assert.equal((await (await f.app.getSession()).storage.read()).revision,state.revision);
 await f.click('姓名核对');assert.match(f.shadow.textContent,/职责/);assert.equal(f.shadow.querySelector('[role="alert"]'),null);await f.click('保留这一项修改');
 await f.click('阿绫');assert.match(f.shadow.textContent,/职责/);await f.click('保留这一项修改');
 await f.click('核对整组变更');await f.click('保存已选设定');assert.equal(f.actionErrors.length,0);
 await f.reopen();const archive=await f.app.capabilities.action('archives.inspect');assert.ok(archive.registry.tables.some(table=>table.id==='workshop_duties'));assert.equal(archive.registry.types.find(type=>type.id==='character').fields.职责.type,'text');const keeper=archive.rows.find(row=>row.values.名称==='阿绫'),duty=archive.rows.find(row=>row.table==='workshop_duties');assert.equal(duty.values.执行者,keeper.id);assert.equal(keeper.values.属性.职责,'修理铺店主');assert.equal(archive.rows.filter(row=>row.table==='workshop_duties').length,1);
});
