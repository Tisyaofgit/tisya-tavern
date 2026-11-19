import test from 'node:test';
import assert from 'node:assert/strict';
import {createNamedChat} from '../character-group-new-chat.js';

function fixture(selectCreates=false){
 const files=['旧会话'];let current='其他角色会话',creates=0,renames=0;
 const adapter={name:'自己取的标题',list:async()=>[...files],current:()=>current,
  select:async()=>{current='旧会话';if(selectCreates){files.push('宿主自动创建');current='宿主自动创建';}},
  create:async()=>{creates++;files.push('宿主新建');current='宿主新建';},
  rename:async(old,name)=>{renames++;files.splice(files.indexOf(old),1,name);current=name;return name;}};
 return {adapter,files,get creates(){return creates;},get renames(){return renames;}};
}
test('selecting an unused role adopts the chat the host already made',async()=>{
 const f=fixture(true);assert.equal(await createNamedChat(f.adapter),'自己取的标题');
 assert.equal(f.creates,0);assert.equal(f.renames,1);assert.deepEqual(f.files,['旧会话','自己取的标题']);
});
test('existing role creates one chat and applies the typed native title',async()=>{
 const f=fixture();assert.equal(await createNamedChat(f.adapter),'自己取的标题');
 assert.equal(f.creates,1);assert.equal(f.renames,1);assert.deepEqual(f.files,['旧会话','自己取的标题']);
});
test('duplicate title and ambiguous host outcome never trigger another creation',async()=>{
 const f=fixture();await assert.rejects(createNamedChat({...f.adapter,name:'旧会话'}),/同名/);assert.equal(f.creates,0);
 const g=fixture();await assert.rejects(createNamedChat({...g.adapter,select:async()=>{g.files.push('甲','乙');}}),/多条新会话/);assert.equal(g.creates,0);
});
test('rename failure reports the created file for recovery without retrying creation',async()=>{
 const f=fixture();await assert.rejects(createNamedChat({...f.adapter,rename:async()=>{throw Error('宿主拒绝');}}),/新会话已创建为「宿主新建」.*改名未完成/);assert.equal(f.creates,1);
});
