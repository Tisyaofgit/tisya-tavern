import test from 'node:test';
import assert from 'node:assert/strict';
import {createConfiguration} from '../engine/config.mjs';
import {createStoryIdentity} from '../engine/identity.mjs';

function fixture(){
 const context={chatId:'one',characterId:0,extensionSettings:{}},books=['基点书','另一本资料书'];let writes=0,load=async()=>[...books];
 const config=createConfiguration({getContext:()=>context,persist:async()=>{writes++;return true;}});
 const roles=createStoryIdentity({config,getContext:()=>context,getHelper:()=>({getWorldbookNames:()=>load()}),database:{read:async()=>({state:{tables:{}}}),commit:async()=>{throw Error('no database writes expected');}}});
 return {context,config,roles,writes:()=>writes,loader:fn=>load=fn};
}
test('non-bound identity modes preserve a legitimate selected source book',async()=>{
 const f=fixture();
 for(const mode of ['generic','ensemble','unbound']){
  await f.roles.saveResources({referenceBooks:['另一本资料书']});await f.roles.bind({mode},f.config.read().revision);
  const value=f.config.read();assert.deepEqual(value.story.referenceBooks,['另一本资料书']);assert.equal(value.story.userMode,mode);assert.equal(value.story.userBinding,null);
 }
 assert.equal(f.writes(),6);
});
test('a missing source book rejects before a non-bound identity configuration is saved',async()=>{
 const f=fixture(),before=f.config.read();await assert.rejects(f.roles.saveResources({referenceBooks:['已删除的书']},before.revision),/资料书选择/);
 assert.deepEqual(f.config.read(),before);assert.equal(f.writes(),0);
});
test('source lookup that switches chats cannot save the selection into the new chat',async()=>{
 const f=fixture(),before=f.config.read();f.loader(async()=>{f.context.chatId='two';return ['另一本资料书'];});
 await assert.rejects(f.roles.saveResources({referenceBooks:['另一本资料书']},before.revision),/聊天已切换/);assert.equal(f.writes(),0);assert.equal(f.config.read().story.userMode,undefined);
 f.context.chatId='one';assert.deepEqual(f.config.read(),before);
});
