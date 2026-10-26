import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,newBody,wrap,sheet,xml} from './installer-harness.mjs';
import {createRuntimePreset} from '../../../v3/preset-template.mjs';
import {markRequestFailureForSettlement} from '../../../v3/request-failure.mjs';

const copy=structuredClone;
const idleJournal=f=>{assert.equal(f.workspaceLayer.status().blocked,false);assert.deepEqual(f.workspaceLayer.status().pendingBooks,[]);};
const retainedJournal=f=>{assert.equal(f.workspaceLayer.status().blocked,true);assert(f.workspaceLayer.status().pendingBooks.length>0);};
async function fixture(t,options={}){const f=await createInstallerHarness({mvu:false,workspace:true,...options});t.after(()=>f.api.dispose());await f.api.getSession();return f;}

for(const kind of ['syntax','envelope'])test('rejected auxiliary '+kind+' preserves exact response and allows a fresh explicit send',async t=>{
 let bad=true,raw;
 const f=await fixture(t,{provider:({stage,messages})=>{if(stage==='b')return wrap(newBody);raw=sheet(messages);if(bad)raw=kind==='syntax'?'invalid auxiliary response':raw.replace(xml(messages,'TISYA.DATA.STATE').requestKey,'wrong-request');return raw;}});
 const before=copy(f.ctx.chat);await f.intercept('normal');const rejected=raw;
 assert.equal(f.errors.length,1);assert.equal(f.errors[0].workspacePreparationSaved,true);assert.equal(f.errors[0].responseText,rejected);assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat,before);idleJournal(f);
 const state=await (await f.api.getSession()).storage.read();assert.equal(Object.values(state.requests)[0].response,rejected);assert.equal(Object.values(state.requests)[0].status,'response');assert.equal(state.commits.length,0);await f.books.globalBinding();
 bad=false;await f.intercept('normal');assert.equal(f.errors.length,1);assert.equal(f.requests.length,3);assert.equal(f.ctx.chat.length,before.length+1);idleJournal(f);
});

test('rejected writer protocol is private diagnostic evidence, never chat, and does not lock the next explicit turn',async t=>{
 let bad=true;const rejected='A complete model response without the required protocol.';
 const f=await fixture(t,{provider:()=>bad?rejected:wrap(newBody)});f.config.auxiliaryEnabled=false;const before=copy(f.ctx.chat);
 await f.intercept('normal');assert.equal(f.errors.length,1);assert.equal(f.errors[0].code,'TISYA_V3_REPLY_ROOT');assert.equal(f.errors[0].responseText,rejected);assert(!JSON.stringify(f.errors[0]).includes(rejected));assert.equal(f.errors[0].workspacePreparationSaved,true);assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat,before);idleJournal(f);
 const state=await (await f.api.getSession()).storage.read(),failed=Object.values(state.requests)[0];assert.equal(failed.status,'writer-running');assert.equal(failed.writerFailure.response,rejected);assert.equal(failed.writerFailure.code,'TISYA_V3_REPLY_ROOT');assert.equal(state.commits.length,0);await f.books.globalBinding();
 bad=false;await f.intercept('normal');assert.equal(f.errors.length,1);assert.equal(f.requests.length,2);assert.equal(f.ctx.chat.length,before.length+1);assert(!f.ctx.chat.some(m=>m.mes===rejected));assert(!JSON.stringify(f.requests.at(-1).messages).includes(rejected));idleJournal(f);
});

for(const kind of ['route','host-payload','transport'])test('settled '+kind+' assembly failure preserves first error and does not poison later generation',async t=>{
 let bad=true;const first=Object.assign(Error('fixture '+kind+' rejected before send'),{code:'FIXTURE_PREPARATION'}),options={};
 if(kind==='route')options.resolveConnection=async()=>{if(bad)throw first;return {settings:{},model:'fixture'};};
 if(kind==='transport')options.prepareRequest=async()=>{if(bad)throw first;return {};};
 const f=await fixture(t,options);f.config.auxiliaryEnabled=false;
 if(kind==='host-payload'){const original=f.native.openai.createGenerationParameters;f.native.openai.createGenerationParameters=(...args)=>{if(bad)throw first;return original(...args);};}
 const before=copy(f.ctx.chat);await f.intercept('normal');assert.equal(f.errors[0],first);assert.equal(first.workspacePreparationSaved,true);assert.equal(f.requests.length,0);assert.deepEqual(f.ctx.chat,before);idleJournal(f);await f.books.globalBinding();
 bad=false;await f.intercept('normal');assert.equal(f.errors.length,1);assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,before.length+1);idleJournal(f);
});

test('stable invalid writer preset assembly settles its failed request without accepting malformed output',async t=>{
 let bad=true;const valid=createRuntimePreset('writer'),invalid={...copy(valid),prompts:[]};
 const f=await fixture(t,{getRuntimePreset:stage=>stage==='writer'?(bad?invalid:valid):createRuntimePreset('preflight')});f.config.auxiliaryEnabled=false;const before=copy(f.ctx.chat);
 await f.intercept('normal');assert.equal(f.errors.length,1);assert.equal(f.requests.length,0);assert.equal(f.errors[0].workspacePreparationSaved,true);assert.deepEqual(f.ctx.chat,before);idleJournal(f);
 bad=false;f.api.configurationChanged();await f.intercept('normal');assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,before.length+1);idleJournal(f);
});

for(const auxiliary of [false,true])test('source checkpoint failure remains blocked even inside '+(auxiliary?'A':'B')+' request handling',async t=>{
 const original=Object.assign(Error('source changed before model request'),{code:'WORKSPACE_CHANGED'});
 const f=await fixture(t,{onSendCheckpoint:async()=>{throw original;}});f.config.auxiliaryEnabled=auxiliary;const before=copy(f.ctx.chat);
 await f.intercept('normal');assert.equal(f.errors[0],original);assert.equal(original.workspaceRecoveryUnsafe,true);assert.equal(original.workspacePreparationSaved,undefined);assert.equal(f.requests.length,0);assert.deepEqual(f.ctx.chat,before);retainedJournal(f);
});

test('native source mutation while awaiting a response is retained for recovery and never auto-synchronized',async t=>{
 const f=await fixture(t,{provider:({ctx})=>{ctx.chat[1].mes='changed outside the request';return 'invalid';}});f.config.auxiliaryEnabled=false;
 await f.intercept('normal');assert.equal(f.errors[0].code,'V3_CHAT_MUTATED');assert.equal(f.errors[0].workspacePreparationSaved,undefined);assert.equal(f.ctx.chat.length,4);retainedJournal(f);
});

test('changed native rules after A remain blocked before validation or B',async t=>{
 let changed=false;const f=await fixture(t,{readNativeRules:async()=>({text:changed?'changed native rule':'original native rule',sources:[]}),provider:({stage,messages})=>{changed=true;return stage==='a'?sheet(messages):wrap(newBody);}});
 await f.intercept('normal');assert.equal(f.errors[0].code,'V3_NATIVE_RULES_CHANGED');assert.equal(f.errors[0].workspaceRecoveryUnsafe,true);assert.equal(f.errors[0].workspacePreparationSaved,undefined);assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);retainedJournal(f);
});

test('a later failed guard permanently vetoes an earlier safe settlement flag',()=>{
 const first=Object.assign(Error('first error'),{runtimeRequestFailed:true,preparationSettlementSafe:true});markRequestFailureForSettlement(first,{guard:()=>{throw Error('source changed');},stage:'preflight',phase:'request'});assert.equal(first.workspaceRecoveryUnsafe,true);
 markRequestFailureForSettlement(first,{guard:()=>{},stage:'preflight',phase:'request'});assert.equal(first.workspaceRecoveryUnsafe,true);assert.equal(first.message,'first error');
});

test('stop waits for settlement and retains recovery journal, with no late output or automatic retry',async t=>{
 let entered,release;const started=new Promise(r=>entered=r),waiting=new Promise(r=>release=r);
 const f=await fixture(t,{provider:async()=>{entered();await waiting;return wrap(newBody);}});f.config.auxiliaryEnabled=false;const before=copy(f.ctx.chat);
 const job=f.intercept('normal');await started;f.api.cancel('explicit test cancellation');release();await job;
 assert.equal(f.errors[0].code,'V3_CANCELLED');assert.equal(f.errors[0].workspacePreparationSaved,undefined);assert.equal(f.requests.length,1);assert.deepEqual(f.ctx.chat,before);retainedJournal(f);
 await f.workspaceLayer.sync();assert.equal(f.requests.length,1);idleJournal(f);
});

test('uncertain physical save during failure settlement is attempted once and keeps original response plus pending journal',async t=>{
 let armed=false,writes=0;const f=await fixture(t,{provider:()=> 'bad reply',onWorkspaceFlush:()=>{if(armed){writes++;throw Error('physical outcome unknown');}}});f.config.auxiliaryEnabled=false;armed=true;
 await f.intercept('normal');assert.equal(f.errors[0].code,'TISYA_V3_REPLY_ROOT');assert.equal(f.errors[0].responseText,'bad reply');assert.match(f.errors[0].workspaceSyncError.message,/physical outcome unknown/);assert.equal(f.errors[0].workspacePreparationSaved,undefined);assert.equal(writes,1);assert.equal(f.requests.length,1);retainedJournal(f);
});
