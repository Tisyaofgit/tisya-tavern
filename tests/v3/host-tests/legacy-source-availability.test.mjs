import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const harness=process.env.TISYA_HARNESS_ROOT?pathToFileURL(process.env.TISYA_HARNESS_ROOT+'/tests/v3/host-tests/installer-harness.mjs'):new URL('./installer-harness.mjs',import.meta.url);
const {createInstallerHarness,xml,wrap,newBody}=await import(harness);
const rawCases=[['unmatched legacy controls','</think><body>她走进房间。</body>'],['incomplete old V3','<reply><think phase="before">旧控制内容</think><body>未编号正文</body></reply>']];
for(const [name,raw]of rawCases)test('retained '+name+' remains locally pending while normal A/B send and deletion work',async()=>{
 const f=await createInstallerHarness({mvu:false});f.ctx.chat[2].mes=raw;f.ctx.chat[2].swipes=[raw];
 try{
  const before=f.ctx.chat.map(m=>m.mes);const s=await f.api.getSession(),id=await s.system.identities.resolve(2);
  await f.intercept('normal');assert.equal(f.requests.length,2,'Legacy source formatting must not veto ordinary send');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.deepEqual(f.ctx.chat.slice(0,before.length).map(m=>m.mes),before);
  const source=xml(f.requests[0].messages,'TISYA.DATA.SOURCE'),state=xml(f.requests[0].messages,'TISYA.DATA.STATE');
  assert(!source.archiveSources.some(x=>x.archiveSource.floor===2),'Unparsed message must not be presented as confirmed archive prose');
  const diagnostic=state.additionalInput.sourceDiagnostics.find(d=>d.floor===2);assert.equal(diagnostic.status,'pending');assert.equal(diagnostic.messageId,id.messageId);assert.match(diagnostic.message,/原文保留/);
  assert.equal(f.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics[0].messageId,id.messageId);
  assert(!(await s.system.originals.listMetadata({scope:s.scope})).some(x=>x.identity.messageId===id.messageId),'Unparsed source must not be falsely marked saved');
  const receipt=await f.api.deleteFloor({floor:2});assert.equal(receipt.identity.messageId,id.messageId);assert(!f.ctx.chat.some(m=>m.mes===raw));assert(f.ctx.chatMetadata.tisya_w24.invalidations.every(x=>x.status==='applied'));assert.equal(f.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics.length,0);
  f.ctx.chat.push({mes:'继续交接。',is_user:true});await f.intercept('normal');assert.equal(f.requests.length,4,'Deletion must not leave the next send blocked');assert.equal(f.errors.length,0);
 }finally{f.api.dispose();}
});
test('HTML card opener and unnumbered old prose do not require Tisya control markup',async()=>{
 const f=await createInstallerHarness({mvu:false});const opening='<html><style>.hero{color:red}</style><body><div>原卡美化开场</div><script>const marker="<think>";</script></body></html>',old='她把旧钥匙放在桌上。\n\n她请来客确认登记。';f.ctx.chat[0].mes=opening;f.ctx.chat[2].mes=old;
 try{await f.intercept('normal');assert.equal(f.requests.length,2);assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.ctx.chat[0].mes,opening);assert.equal(f.ctx.chat[2].mes,old);const source=xml(f.requests[0].messages,'TISYA.DATA.SOURCE');assert(source.archiveSources.every(x=>x.archiveSource.floor!==0));const archived=source.archiveSources.find(x=>x.archiveSource.floor===2);assert.equal(archived.archiveSource.format,'historical');assert.deepEqual(archived.archiveSource.paragraphs.map(p=>p.text),['她把旧钥匙放在桌上。','她请来客确认登记。']);}finally{f.api.dispose();}
});
test('fresh malformed writer output still fails before being saved',async()=>{
 const f=await createInstallerHarness({mvu:false,provider:({stage,messages})=>stage==='b'?'<reply><body>bad current output</body>':import('./installer-harness.mjs').then(({sheet})=>sheet(messages))});
 try{const length=f.ctx.chat.length;await f.intercept('normal');assert.equal(f.requests.length,2);assert.equal(f.ctx.chat.length,length);assert.match(f.errors[0]?.code??'',/^TISYA_V3_REPLY_/);}finally{f.api.dispose();}
});
test('an original storage failure is not disguised as a legacy parsing notice',async()=>{
 const f=await createInstallerHarness({mvu:false});
 try{await f.api.getSession();f.host.failure.saveOnce();await f.intercept('normal');assert.equal(f.requests.length,0);assert.equal(f.errors.length,1);assert.match(f.errors[0].message,/save failed|save failure/i);assert.equal(f.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics?.length??0,0);}finally{f.api.dispose();}
});
test('source text changed after the scan but before materialization is rejected before original writes',async()=>{
 const {createSourceChain}=await import(new URL('../../../v3/host-sources.mjs',harness));
 const {createInitialState,tableRegistry}=await import(new URL('../../../v3/host-runtime.mjs',harness));
 const context={chat:[{mes:'卡片开场',is_user:false},{mes:'交接。',is_user:true},{mes:'她交回旧钥匙。',is_user:false},{mes:'继续。',is_user:true}],chatMetadata:{}};let writes=0;
 const system={identities:{resolve:async floor=>({chatId:'c',branchId:'b',messageId:'m'+floor})},originals:{entryIdFor:async id=>'original:'+id.messageId,metadata:async()=>{throw Object.assign(Error('missing'),{code:'SOURCE_NOT_FOUND'});}},sourceBridge:{archiveSource:async()=>{writes++;throw Error('should not write changed source');}},storage:{read:async()=>{context.chat[2].mes='她改为收回旧钥匙。';return createInitialState({registry:tableRegistry});}}};
 const chain=createSourceChain({getContext:()=>context,system,getNative:()=>null,configuration:()=>({}),guard:()=>{},persist:async()=>{}});
 await assert.rejects(chain.build({requestKey:'race'}),{code:'SOURCE_CHANGED'});assert.equal(writes,0);assert.equal(context.chat[2].mes,'她改为收回旧钥匙。');
});
test('a branch retains malformed legacy chat without requiring that source to become archived prose',async()=>{
 const f=await createInstallerHarness({mvu:false}),raw='</think><body>旧会话中的告别。</body>';f.ctx.chat[2].mes=raw;
 try{await f.api.getSession();const result=await f.api.branch({floor:2});assert.equal(result.owner.branchId,'branch-two');assert.equal(f.ctx.chat[2].mes,raw);f.ctx.chat.push({is_user:true,mes:'从这里接着。'});await f.intercept('normal');assert.equal(f.requests.length,2);assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics[0].status,'pending');}finally{f.api.dispose();}
});
test('editing a pending legacy source to valid prose clears the diagnostic and archives the actual new source',async()=>{
 const f=await createInstallerHarness({mvu:false}),raw='</think><body>旧开门。</body>',fixed='她打开门，把旧钥匙递回给来客。';f.ctx.chat[2].mes=raw;
 try{await f.intercept('normal');assert.equal(f.requests.length,2);assert.equal(f.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics.length,1);f.ctx.chat[2].mes=fixed;await f.ctx.eventSource.emit(f.ctx.eventTypes.MESSAGE_EDITED,2);assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.ctx.chatMetadata.tisya_v3_host.sourceDiagnostics.length,0);f.ctx.chat.push({is_user:true,mes:'我接住钥匙。'});await f.intercept('normal');assert.equal(f.requests.length,4);assert.equal(f.errors.length,0,f.errors[0]?.stack);const sources=xml(f.requests[2].messages,'TISYA.DATA.SOURCE').archiveSources;assert.equal(sources.find(x=>x.archiveSource.floor===2).archiveSource.text,fixed);assert.equal(f.ctx.chat[2].mes,fixed);}finally{f.api.dispose();}
});
