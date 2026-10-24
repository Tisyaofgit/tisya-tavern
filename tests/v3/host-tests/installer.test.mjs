import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness as fixture,wrap,oldBody,newBody,sheet,xml} from './installer-harness.mjs';
import {projectRetained,parseSimpleSheet,formatSimpleSheet} from '../../../v3/host-runtime.mjs';
import {inspectV3Message} from '../../../v3/reply.mjs';

test('installer executes real manifest abort gate, one A, real MVU, one B, real native saveReply, A+B worldbook readback',async()=>{
 const f=await fixture();try{const aborted=await f.intercept('normal');assert.equal(aborted,true);assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.requests.length,2);assert.equal(f.ctx.chat.length,5);assert.equal(f.ctx.chat.at(-1).mes,wrap(newBody));assert.equal(f.nativeMvu.runtime.getMvuData({type:'message',message_id:2}).stat_data.resources.energy,3);assert.equal(f.nativeMvu.counts().parses,1);assert(!JSON.stringify(f.requests[1].messages).includes(oldBody));const s=await f.api.getSession(),state=await s.storage.read();assert.equal(Object.values(state.requests)[0].status,'delivered');assert((await s.system.originals.listMetadata({scope:s.scope})).length>=2);assert(f.host.calls.some(c=>JSON.stringify(c).includes('world_info')));}finally{f.api.dispose();}
});
test('invalid A is blocked by the actual interceptor and makes zero B/saveReply calls',async()=>{const f=await fixture({invalid:true});try{assert.equal(await f.intercept('normal'),true);assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);assert.equal(f.errors.length,1);}finally{f.api.dispose();}});
test('missing enabled native runtime aborts before A and before narrative commit',async()=>{const f=await fixture({mvu:false});f.config.nativeBridge=true;try{assert.equal(await f.intercept('normal'),true);assert.equal(f.requests.length,0);assert.equal(f.ctx.chat.length,4);assert.equal(f.errors[0].code,'V3_MVU_UNAVAILABLE');}finally{f.api.dispose();}});
test('advanced reroll uses native swipe save, stable original ID and repeat receipt without extra A/B',async()=>{const f=await fixture();try{await f.intercept('normal');const s=await f.api.getSession(),floor=f.ctx.chat.length-1,id=await s.system.identities.resolve(floor),entryId=await s.system.originals.entryIdFor(id),prior=await s.system.originals.metadata({entryId,scope:s.scope});await f.api.advancedReroll({floor,instruction:'这一条重新安排谈话。',requestId:'advanced-one'});assert.equal(f.requests.length,4);assert.equal(f.ctx.chat.length,5);assert.equal(f.ctx.chat[floor].swipes.length,2);const after=await s.system.originals.metadata({entryId,scope:s.scope});assert.equal(after.entryId,prior.entryId);assert(after.revision>prior.revision);await f.api.advancedReroll({floor,instruction:'这一条重新安排谈话。',requestId:'advanced-one'});assert.equal(f.requests.length,4);}finally{f.api.dispose();}});

test('partial revision reaches B as task material, feedback reaches A, untouched paragraph survives byte exactly',async()=>{
 let calls=0;const revised=newBody.replace('阿绫把信收到口袋里，随手扣上工具箱。','阿绫把信压在茶杯下，先找了支铅笔。');
 const f=await fixture({provider:({stage,messages})=>stage==='a'?sheet(messages):wrap(++calls===1?newBody:revised)});
 try{await f.intercept('normal');const prior=f.ctx.chat[4].mes;await f.api.advancedReroll({floor:4,requestId:'partial-one',revision:{mode:'partial',selected:[1],source:prior,direction:'今后也保留这种办事时的小幽默。',details:'先找铅笔。',polish:false}});
  const a=xml(f.requests[2].messages,'TISYA.DATA.SOURCE');assert(a.preferenceSources.some(s=>s.kind==='advanced-reroll'&&s.text.includes('小幽默')));assert(!a.archiveSources.some(s=>s.archiveSource.floor===4));
  assert(f.requests[3].messages.some(m=>m.content.includes('candidate-revision')&&m.content.includes('先找铅笔')));assert.equal(f.ctx.chat[4].mes,wrap(revised));assert(!inspectV3Message(f.ctx.chat[4].mes).body.error);
 }finally{f.api.dispose();}
});

test('out-of-range partial edit fails before native chat mutation',async()=>{
 let calls=0;const f=await fixture({provider:({stage,messages})=>stage==='a'?sheet(messages):wrap(++calls===1?newBody:newBody.replace('一小时','三小时'))});
 try{await f.intercept('normal');const prior=f.ctx.chat[4].mes;await assert.rejects(f.api.advancedReroll({floor:4,requestId:'partial-outside',revision:{mode:'partial',selected:[1],source:prior,direction:'只改第一段。',polish:false}}),e=>e.code==='V3_REVISION');assert.equal(f.ctx.chat[4].mes,prior);assert.equal(f.ctx.chat[4].swipes.length,1);}finally{f.api.dispose();}
});

test('two original-owned MVU floors synchronize their own snapshots in order without reapplying variables',async()=>{
 const f=await fixture();try{
  const tail='\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/resources/energy","value":3}]</JSONPatch></UpdateVariable>';
  f.ctx.chat[2].mes+=tail;f.ctx.chat[2].swipes=[f.ctx.chat[2].mes];f.ctx.chat.push({mes:wrap(oldBody)+tail,is_user:false,extra:{}},{mes:'继续交接。',is_user:true});
  await f.nativeMvu.runtime.replaceMvuData({stat_data:{resources:{energy:3}}},{type:'message',message_id:2});await f.nativeMvu.runtime.replaceMvuData({stat_data:{resources:{energy:2}}},{type:'message',message_id:4});
  const before=f.nativeMvu.counts();await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.requests.length,2);const after=f.nativeMvu.counts();assert.equal(after.parses,before.parses);assert.equal(after.replaces,before.replaces);
  const s=await f.api.getSession(),view=projectRetained(await s.storage.read(),s.getScope().activeSourceKeys);assert.equal(view.rows.find(r=>r.table==='native_cells').values.值.energy,2);
 }finally{f.api.dispose();}
});

test('trailing native deletion tombstones original without rewriting the retained predecessor snapshot',async()=>{
 const f=await fixture();try{await f.intercept('normal');const s=await f.api.getSession(),identity=await s.system.identities.resolve(4),entryId=await s.system.originals.entryIdFor(identity),before=f.nativeMvu.counts();await f.api.deleteFloor({floor:4});const after=f.nativeMvu.counts();assert.equal(f.ctx.chat.length,4);assert.equal(after.replaces,before.replaces);assert.equal((await s.system.originals.metadata({entryId,scope:s.scope,includeDeleted:true})).deleted,true);}finally{f.api.dispose();}
});

test('normal reroll and selected swipe use one stable floor, branch creates distinct original namespace',async()=>{
 let n=0;const f=await fixture({mvu:false,provider:({stage,messages})=>stage==='a'?sheet(messages):wrap(++n===1?newBody:newBody.replace('一小时','两小时'))});
 try{await f.intercept('normal');const s=await f.api.getSession(),id=await s.system.identities.resolve(4),entryId=await s.system.originals.entryIdFor(id);await f.api.reroll({floor:4,requestId:'plain-reroll'});assert.equal(f.ctx.chat[4].swipes.length,2);await f.api.selectSwipe({floor:4,swipeId:0});assert.equal(f.ctx.chat[4].mes,wrap(newBody));assert.equal((await s.system.identities.resolve(4)).messageId,id.messageId);
  const result=await f.api.branch({floor:4,swipeId:0});assert.equal(result.owner.branchId,'branch-two');const next=await f.api.getSession(),newId=await next.system.identities.resolve(4);assert.equal(newId.messageId,id.messageId);assert.notEqual(await next.system.originals.entryIdFor(newId),entryId);
 }finally{f.api.dispose();}
});

test('real group wrapper lifecycle permits exactly one A+B across drafted members',async()=>{
 const f=await fixture({group:true});try{await f.ctx.eventSource.emit(f.ctx.eventTypes.GROUP_WRAPPER_STARTED,{selected_group:'group-one',type:'normal'});assert.equal(await f.intercept('normal'),true);assert.equal(await f.intercept('normal'),true);assert.equal(f.errors.length,0);assert.equal(f.requests.length,2);assert.equal(f.ctx.chat.length,5);assert.equal(f.ctx.chat[4].original_avatar,'none');assert.equal(f.ctx.chat[4].extra.gen_id,100);await f.ctx.eventSource.emit(f.ctx.eventTypes.GROUP_WRAPPER_FINISHED,{selected_group:'group-one'});}finally{f.api.dispose();}
});

test('external native edit invalidates source lineage and updates A rather than retaining the previous reference',async()=>{
 const f=await fixture();try{await f.intercept('normal');const s=await f.api.getSession(),id=await s.system.identities.resolve(4),entryId=await s.system.originals.entryIdFor(id),prior=await s.system.originals.metadata({entryId,scope:s.scope});f.ctx.chat[4].mes=wrap(newBody.replace('一小时','两小时'));await f.ctx.eventSource.emit(f.ctx.eventTypes.MESSAGE_EDITED,4);assert.equal(f.errors.length,0,f.errors[0]?.stack);assert(f.ctx.chatMetadata.tisya_w24.invalidations.some(i=>i.reason==='edit'&&i.status==='applied'));const after=await s.system.originals.metadata({entryId,scope:s.scope});assert(after.revision>prior.revision);assert.notEqual(after.hash,prior.hash);}finally{f.api.dispose();}
});

test('stopping A prevents B and does not commit a late API response',async()=>{
 let ready,release;const waiting=new Promise(resolve=>ready=resolve),blocked=new Promise(resolve=>release=resolve);
 const f=await fixture({provider:async({stage,messages})=>{if(stage==='a'){ready();await blocked;return sheet(messages);}return wrap(newBody);}});
 try{const job=f.intercept('normal');await waiting;f.api.cancel('测试取消');release();await job;assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);assert.equal(f.errors[0].code,'V3_CANCELLED');}finally{f.api.dispose();}
});

test('turn direction is a separate A feedback source and B instruction, never appended to roleplay text',async()=>{
 const f=await fixture();try{const note='这一轮先问清工具的用途；今后多写自然的短句。';f.ctx.chat[3].extra={'缇斯亚本轮要求':{format:'tisya.turn-direction/1',text:note}};await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);const a=xml(f.requests[0].messages,'TISYA.DATA.SOURCE'),state=xml(f.requests[0].messages,'TISYA.DATA.STATE');assert.equal(a.currentUser,'继续。');assert.equal(state.additionalInput.directives,note);assert(a.preferenceSources.some(s=>s.kind==='turn-direction'&&s.text===note));assert(f.requests[1].messages.some(m=>m.content.includes('tisya.turn-direction/1')&&m.content.includes(note)));assert.equal(f.ctx.chat[3].mes,'继续。');}finally{f.api.dispose();}
});

test('explicit source tool read returns only selected original paragraphs, pages share one scoped query session, ledger omits raw receipts',async()=>{
 const f=await fixture({provider:({stage,messages})=>{if(stage==='b')return wrap(newBody);const result=parseSimpleSheet(sheet(messages));result.archiveProposal[0].proposal.changes.push({id:'new:handover',table:'events',expected:0,values:{名称:'工具箱交接',经过:'工具箱已经交接。',原文段号:[1]},access:{readers:['读者'],knowers:[]},evidence:[1]});result.archiveRequests=[{method:'read_archive',arguments:{id:'new:handover',source:true,limit:1},purpose:'回看交接时的准确动作'}];return formatSimpleSheet(result);}});
 try{await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.requests.length,2);const b=JSON.stringify(f.requests[1].messages);assert(b.includes('阿绫用一格电量打开门锁，把工具箱递给林澈。'));assert(!b.includes('她提醒他先看看窗台上的信。'));const s=await f.api.getSession(),state=await s.storage.read();assert(!JSON.stringify(state.requests).includes('阿绫用一格电量打开门锁，把工具箱递给林澈。'));assert(Object.values(state.requests)[0].result.snapshot.toolReceipts.length>1);}finally{f.api.dispose();}
});

test('persona changed during A prevents B and native save even without a chat switch',async()=>{
 let ready,release;const waiting=new Promise(resolve=>ready=resolve),blocked=new Promise(resolve=>release=resolve);const f=await fixture({provider:async({stage,messages})=>{if(stage==='a'){ready();await blocked;return sheet(messages);}return wrap(newBody);}});
 try{f.config.playerId='player';const job=f.intercept('normal');await waiting;f.config.playerId='another-player';release();await job;assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);assert.equal(f.errors[0].code,'V3_PLAYER_CHANGED');}finally{f.api.dispose();}
});

test('editing an earlier user evidence source removes its dependent archived facts',async()=>{
 const f=await fixture({mvu:false,provider:({stage,messages})=>{if(stage==='b')return wrap(newBody);const source=xml(messages,'TISYA.DATA.SOURCE'),result=parseSimpleSheet(sheet(messages)),prior=source.archiveSources[0].userSources[0];result.archiveProposal[0].proposal.changes.push({id:'new:request',table:'events',expected:0,values:{名称:'交接请求',经过:'来客提出了开门与交接工具箱的要求。'},access:{readers:['读者'],knowers:[]},evidence:{userSource:prior.key,excerpt:prior.text}});return formatSimpleSheet(result);}});
 try{await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);const s=await f.api.getSession(),before=projectRetained(await s.storage.read(),s.getScope().activeSourceKeys);assert(before.rows.some(r=>r.values.名称==='交接请求'));f.ctx.chat[1].mes='先别开门。';await f.ctx.eventSource.emit(f.ctx.eventTypes.MESSAGE_EDITED,1);assert.equal(f.errors.length,0,f.errors[0]?.stack);const after=projectRetained(await s.storage.read(),s.getScope().activeSourceKeys);assert(!after.rows.some(r=>r.values.名称==='交接请求'));}finally{f.api.dispose();}
});

test('awaited beforeWriter may persist condition receipts before snapshot, avoiding a stale ledger write',async()=>{
 const f=await fixture();try{let called=0;f.api.setBeforeWriter(async({sessionStorage,input})=>{called++;const state=await sessionStorage.read();await sessionStorage.compareAndWrite(state.revision,{...state,revision:state.revision+1,conditionProbe:{requestKey:input.requestKey}});return {lore:['通过本轮实际条件读取的资料。']};});await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(called,1);assert(f.requests[1].messages.some(m=>m.content.includes('通过本轮实际条件读取的资料。')));const s=await f.api.getSession(),state=await s.storage.read();assert(state.conditionProbe.requestKey);assert.equal(Object.values(state.requests)[0].status,'delivered');}finally{f.api.dispose();}
});

test('unnumbered native opening remains untouched as card setup and does not enter numbered archive',async()=>{
 const f=await fixture();try{const opening='<body>修理铺刚开门，柜台上放着一封没有拆开的信。</body>';f.ctx.chat[0].mes=opening;f.ctx.characters=[{data:{name:'阿绫',description:'修理铺店主。'}}];f.ctx.characterId=0;await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.ctx.chat[0].mes,opening);const a=xml(f.requests[0].messages,'TISYA.DATA.STATE'),sources=xml(f.requests[0].messages,'TISYA.DATA.SOURCE');assert(a.additionalInput.cardSetup.some(x=>x.text===opening));assert(sources.archiveSources.every(x=>x.archiveSource.floor!==0));assert(f.requests[1].messages.some(m=>m.content.includes('native-character-opening')&&m.content.includes('没有拆开的信')));}finally{f.api.dispose();}
});

test('disabled business archive preserves A and native state; re-enabling backfills without reapplying native changes',async()=>{
 const f=await fixture({provider:({stage,messages})=>{if(stage==='b')return wrap(newBody);const result=parseSimpleSheet(sheet(messages)),state=xml(messages,'TISYA.DATA.STATE');if(state.archiveEnabled!==false)result.archiveProposal[0].proposal.changes.push({id:'new:handover',table:'events',expected:0,values:{名称:'后来补入的交接',经过:'工具箱完成了交接。',原文段号:[1]},access:{readers:['读者'],knowers:[]},evidence:[1]});return formatSimpleSheet(result);}});
 try{f.config.archiveEnabled=false;await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);const first=await f.api.getSession(),before=await first.storage.read();assert(before.commits.every(c=>c.archiveSkipped));assert.equal(f.nativeMvu.counts().parses,1);assert((await first.system.originals.listMetadata({scope:first.scope})).length>=2);f.config.archiveEnabled=true;f.config.revision='archive-enabled';f.api.configurationChanged();f.ctx.chat.push({is_user:true,mes:'继续。'});await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.nativeMvu.counts().parses,1);const next=await f.api.getSession(),view=projectRetained(await next.storage.read(),next.getScope().activeSourceKeys);assert(view.rows.some(r=>r.values.名称==='后来补入的交接'));}finally{f.api.dispose();}
});

test('a new native user appended during A cannot receive the prior request response',async()=>{
 let ready,release;const waiting=new Promise(resolve=>ready=resolve),blocked=new Promise(resolve=>release=resolve);const f=await fixture({provider:async({stage,messages})=>{if(stage==='a'){ready();await blocked;return sheet(messages);}return wrap(newBody);}});
 try{const job=f.intercept('normal');await waiting;f.ctx.chat.push({is_user:true,mes:'另一个新输入。'});release();await job;assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,5);assert.equal(f.ctx.chat.at(-1).is_user,true);assert.equal(f.errors[0].code,'V3_CHAT_MUTATED');}finally{f.api.dispose();}
});

test('native mode off permits business archival of an original-owned message without requiring or executing MVU',async()=>{
 const f=await fixture({mvu:false});try{f.ctx.chat[2].mes+='\n<UpdateVariable><JSONPatch>[{"op":"replace","path":"/resources/energy","value":3}]</JSONPatch></UpdateVariable>';await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.requests.length,2);assert.equal(f.nativeMvu.counts().parses,0);}finally{f.api.dispose();}
});

test('turning native mode on creates missing projection rows from actual card data without executing historical variables',async()=>{
 const f=await fixture({mvu:false});try{await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);f.target.Mvu=f.nativeMvu.runtime;f.config.nativeBridge=true;f.config.revision='mvu-on';f.api.configurationChanged();const s=await f.api.getSession(),state=await s.storage.read();assert.equal(state.baseView.rows.find(r=>r.table==='native_cells').values.值.energy,4);assert.equal(f.nativeMvu.counts().parses,0);assert.equal(f.nativeMvu.counts().writes,0);}finally{f.api.dispose();}
});
