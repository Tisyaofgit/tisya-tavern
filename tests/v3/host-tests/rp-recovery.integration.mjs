import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,wrap,sheet,xml} from './installer-harness.mjs';
import {installV3Host} from '../../../v3/host.mjs';
import {fullDefaultConfiguration} from '../../../v3/preset.mjs';

const copy=structuredClone;
const body=turn=>`1 阿绫把第${turn}封信收到口袋里，随手扣上工具箱。\n\n2 她问林澈明天能否替她照看一小时店。`;
const cleanWorkspace=f=>{assert.equal(f.workspaceLayer.status().blocked,false);assert.deepEqual(f.workspaceLayer.status().pendingBooks,[]);assert.equal(f.api.busy(),false);};

test('malformed reply can recover into multi-turn RP, delayed archival, rerolls and a cold host readback without clearing a journal',async t=>{
 let bad=true,writerCalls=0;
 const seen=[];
 const f=await createInstallerHarness({mvu:false,workspace:true,provider:({stage,messages})=>{
  seen.push({stage,messages:copy(messages)});
  if(stage==='a')return sheet(messages);
  writerCalls++;
  return bad?'Unstructured fixture response; the original conversation must remain unchanged.':wrap(body(writerCalls));
 }});
 let active=f.api;t.after(()=>active.dispose());
 await f.api.getSession();
 const original=copy(f.ctx.chat);
 await f.intercept('normal');
 assert.equal(f.errors.length,1);assert.equal(f.errors[0].code,'TISYA_V3_REPLY_ROOT');
 assert.deepEqual(f.ctx.chat,original);assert.equal(writerCalls,1,'a failed reply never triggers an automatic model retry');
 cleanWorkspace(f);
 const originalFailure=f.errors[0];bad=false;

 for(let turn=0;turn<3;turn++){
  const priorReply=turn?f.ctx.chat.at(-1).mes:null;
  const priorFloor=f.ctx.chat.length-1;
  if(turn)f.ctx.chat.push({is_user:true,mes:`继续处理第${turn}次交接。`});
  const before=f.ctx.chat.length,requestStart=seen.length;
  await f.intercept('normal');
  assert.equal(f.errors.length,1,f.errors.at(-1)?.stack);assert.equal(f.errors[0],originalFailure);
  assert.equal(f.ctx.chat.length,before+1);assert.equal(f.ctx.chat.at(-1).mes,wrap(body(writerCalls)));
  cleanWorkspace(f);
  const sources=seen.slice(requestStart).filter(r=>r.stage==='a').flatMap(r=>xml(r.messages,'TISYA.DATA.SOURCE').archiveSources);
  if(turn){assert(sources.some(s=>s.archiveSource.floor===priorFloor&&priorReply.includes(s.archiveSource.text)),'the preceding accepted reply enters the next user turn archive');}
  assert(sources.every(s=>s.archiveSource.floor<f.ctx.chat.length-1),'the newly generated last reply is not archived in its own turn');
  const session=await f.api.getSession(),state=await session.storage.read();
  assert(Object.values(state.requests).some(r=>r.status==='delivered'));
 }

 const floor=f.ctx.chat.length-1,count=f.ctx.chat.length;
 const session=await f.api.getSession(),identity=await session.system.identities.resolve(floor);
 await f.api.reroll({floor,requestId:'rp-recovery-ordinary-reroll'});
 assert.equal(f.ctx.chat.length,count);assert.equal(f.ctx.chat[floor].swipes.length,2);cleanWorkspace(f);
 await f.api.advancedReroll({floor,instruction:'这一条保持交接事件，稍微放慢对话节奏。',requestId:'rp-recovery-advanced-reroll'});
 assert.equal(f.ctx.chat.length,count);assert.equal(f.ctx.chat[floor].swipes.length,3);cleanWorkspace(f);
 assert.equal((await session.system.identities.resolve(floor)).messageId,identity.messageId);
 const requests=f.requests.length;
 await f.api.advancedReroll({floor,instruction:'这一条保持交接事件，稍微放慢对话节奏。',requestId:'rp-recovery-advanced-reroll'});
 assert.equal(f.requests.length,requests,'a repeated accepted reroll request reuses its receipt');
 assert.deepEqual(f.ctx.chat.slice(0,original.length).map(m=>m.mes),original.map(m=>m.mes));

 const savedChat=copy(f.ctx.chat),savedConfig=copy(f.config),savedState=await session.storage.read();
 const savedBooks=copy([...f.host.disk]);
 f.api.dispose();
 // This only evicts rebuildable working documents after the actual journal has
 // been confirmed empty. No pending journal or physical book is cleared.
 f.workspaceLayer.clearMemory();
 active=await installV3Host({target:f.target,getContext:()=>f.ctx,
  bookManager:{...f.books,runWorkspace:fn=>f.workspaceLayer.run(fn)},
  readConfiguration:()=>f.config,getConfigurationSnapshot:fullDefaultConfiguration,
  resolveConnection:async()=>({settings:{},model:'fixture'}),selectedMaterials:async()=>({lanes:{},ids:[]}),
  onError:error=>f.errors.push(error),native:f.native});
 const reopened=await active.getSession();
 assert.deepEqual(await reopened.storage.read(),savedState);
 // saveReply is deliberately executed in the extracted host's separate realm;
 // compare the full persisted value rather than its realm's prototype identity.
 assert.deepEqual(copy(f.ctx.chat),savedChat);assert.deepEqual(f.config,savedConfig);assert.deepEqual(copy([...f.host.disk]),savedBooks);
 assert.equal(f.requests.length,requests,'reopening never generates or retries a model request');
 assert.deepEqual(f.workspaceLayer.status().pendingBooks,[]);assert.equal(f.errors.length,1);
 f.ctx.chat.push({is_user:true,mes:'重开后继续接下来的交接。'});
 await active.generateInterceptor(copy(f.ctx.chat),10000,()=>{},'normal');
 assert.equal(f.ctx.chat.length,savedChat.length+2);assert.equal(f.errors.length,1,f.errors.at(-1)?.stack);
 assert.deepEqual(f.workspaceLayer.status().pendingBooks,[]);assert.equal(f.workspaceLayer.status().blocked,false);
});
