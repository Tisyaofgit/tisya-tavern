import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness, sheet} from './installer-harness.mjs';
import {COMPANION_KEY} from '../../../v3/host-companion.mjs';

const copy=structuredClone,HOST='tisya_v3_host',ID='tisya_w24';
const messages=metadata=>Object.values(metadata[COMPANION_KEY]?.scopes??{}).flatMap(scope=>scope.messages);

async function connect(t,options){
 const f=await createInstallerHarness({mvu:false,...options});t.after(()=>f.api.dispose());
 await f.api.getSession();
 const companion=f.api.createCompanion({readMode:()=> 'with-story',writeMode:async()=>{}});
 await companion.sendMessage('本轮剧情结束后回我一句。');
 const before=copy(f.ctx.chat),writes=[];let fullSaves=0;
 const saveMetadata=f.ctx.saveMetadata,saveChat=f.ctx.saveChat,handle=f.target.__TAURITAVERN__.api.chat.current.handle();
 f.ctx.saveMetadata=async()=>{await saveMetadata();writes.push(await handle.metadata.get());};
 f.ctx.saveChat=async()=>{fullSaves++;return saveChat();};
 return {...f,companion,before,writes,fullSaves:()=>fullSaves,disk:()=>handle.metadata.get()};
}

test('companion capture acknowledges staged controls before a later native-rules failure',async t=>{
 const f=await connect(t,{readNativeRules:async()=>{throw Error('native rules unavailable after companion capture');}});
 await f.intercept('normal');
 assert.equal(f.errors.length,1);assert.match(f.errors[0].message,/native rules unavailable/);assert.equal(f.requests.length,0);
 assert.equal(f.writes.length,2,'capture and release each make one independent metadata commit');assert.equal(f.fullSaves(),0);
 const captured=messages(f.writes[0])[0],released=messages(f.writes[1])[0],requestId=captured.requestKey;
 assert.equal(captured.status,'sending');assert.equal(released.status,'queued');assert.equal(released.requestKey,undefined);
 assert.equal(f.writes[0][HOST].requests[requestId].type,'normal');
 assert.deepEqual(f.writes[1][HOST].requests[requestId],f.writes[0][HOST].requests[requestId]);
 assert.deepEqual(f.ctx.chatMetadata[HOST].requests[requestId],f.writes[0][HOST].requests[requestId], 'confirmed control must not be rolled back only in memory');
 assert.deepEqual(await f.disk(),f.ctx.chatMetadata);assert.deepEqual(f.ctx.chat,f.before);
 assert.equal(f.api.busy(),false);assert.equal(f.companion.busy(),false);
});

test('cancelled story generation can persist companion release without an aborted-operation save guard',async t=>{
 let arrived,release;const waiting=new Promise(resolve=>arrived=resolve),blocked=new Promise(resolve=>release=resolve);
 const f=await connect(t,{provider:async({stage,messages})=>{assert.equal(stage,'a');arrived();await blocked;return sheet(messages);}});
 t.after(()=>release());
 const job=f.intercept('normal');await waiting;
 const captured=messages(f.writes[0])[0],requestId=captured.requestKey;
 assert.equal(captured.status,'sending');assert.equal(f.writes[0][HOST].requests[requestId].type,'normal');
 f.api.cancel('explicit native cancellation test');release();await job;
 assert.equal(f.requests.length,1,'no writer request after cancellation');assert.equal(f.errors.length,1);assert.equal(f.errors[0].code,'V3_CANCELLED');
 const saved=await f.disk(),released=messages(saved)[0];assert.equal(released.status,'queued');assert.equal(released.requestKey,undefined);
 assert.match(released.error,/explicit native cancellation test/);assert.equal(f.writes.length,2);assert.equal(f.fullSaves(),0);
 assert.deepEqual(saved[ID],f.ctx.chatMetadata[ID]);assert.deepEqual(saved[HOST],f.ctx.chatMetadata[HOST]);assert.deepEqual(saved[COMPANION_KEY],f.ctx.chatMetadata[COMPANION_KEY]);
 assert.deepEqual(f.ctx.chat,f.before);assert.equal(f.api.busy(),false);assert.equal(f.companion.busy(),false);
});
