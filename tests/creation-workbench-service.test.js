import test from 'node:test';
import assert from 'node:assert/strict';
import {createCreationTasks} from '../engine/creation-task.mjs';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
test('streaming survives view unsubscription, reopens with exact prompt and editable draft, and clear does not revive it',async()=>{
 const s=storage(),ctx={chatId:'a',characterId:0},tasks=createCreationTasks({getContext:()=>ctx,storage:s}),gate=deferred(),seen=[];
 const dispose=tasks.subscribe(t=>seen.push(t));const run=tasks.run('写一位店员',{},async({onProgress})=>{onProgress({stage:'waiting',promptMessages:[{role:'system',content:'实际模板'},{role:'user',content:'实际要求'}]});onProgress({stage:'generating',text:'第一段'});await gate.promise;return {rawResponse:'第一段和表单',contextKey:'a',proposal:{name:'店员'}};});
 assert.equal(tasks.snapshot().status,'streaming');dispose();gate.resolve();await run;assert.equal(tasks.snapshot().status,'ready');assert.equal(tasks.snapshot().text,'第一段和表单');
 tasks.rememberView({taskId:tasks.snapshot().id,creation:{name:'手工改名',enabled:false,amount:0}});
 const reopened=createCreationTasks({getContext:()=>ctx,storage:s});assert.equal(reopened.snapshot().promptMessages[0].content,'实际模板');assert.equal(reopened.view().creation.enabled,false);assert.equal(reopened.view().creation.amount,0);assert.equal(reopened.snapshot().messages.length,2);reopened.clearView();assert.equal(reopened.snapshot(),null);assert.equal(reopened.view(),null);assert(seen.length>=3);
});
test('explicit stop preserves partial text; unloading a request restores interrupted state without resend',async()=>{
 const s=storage(),ctx={chatId:'a',characterId:0},tasks=createCreationTasks({getContext:()=>ctx,storage:s}),gate=deferred();
 const run=tasks.run('继续',{},async({onProgress,signal})=>{onProgress({stage:'generating',text:'收到的一半'});await gate.promise;signal.throwIfAborted();return {};});
 const reopened=createCreationTasks({getContext:()=>ctx,storage:s});assert.equal(reopened.snapshot().status,'error');assert.equal(reopened.snapshot().text,'收到的一半');assert(tasks.cancel());gate.resolve();await assert.rejects(run);assert.equal(tasks.snapshot().status,'cancelled');assert.equal(tasks.snapshot().text,'收到的一半');
});
test('chat scopes isolate task histories and concurrent starts reject before calling model',async()=>{
 const ctx={chatId:'a',characterId:0},tasks=createCreationTasks({getContext:()=>ctx,storage:storage()}),gate=deferred();const run=tasks.run('a',{},async()=>{await gate.promise;return {rawResponse:'回复a',contextKey:'a'};});await assert.rejects(tasks.run('重复',{},()=>{throw Error('不应调用');}),/仍在生成/);ctx.chatId='b';assert.equal(tasks.snapshot(),null);await tasks.run('b',{},async()=>({rawResponse:'回复b',contextKey:'b'}));assert.equal(tasks.snapshot().messages[0].content,'b');ctx.chatId='a';gate.resolve();await run;assert.equal(tasks.snapshot().messages[0].content,'a');
});
test('cache write failure remains visible and parsing errors preserve exact response and field location',async()=>{
 const tasks=createCreationTasks({getContext:()=>({chatId:'a'}),storage:{getItem:()=>null,setItem:()=>{throw Error('quota');}}});
 await assert.rejects(tasks.run('写角色',{},async()=>{throw Object.assign(Error('无法接纳'),{rawResponse:'原始原答',cause:{formLocation:{heading:'关系／1',field:'target'}}});}));const t=tasks.snapshot();assert.equal(t.text,'原始原答');assert.equal(t.formLocation.field,'target');assert.match(t.persistenceError,/quota/);
});
