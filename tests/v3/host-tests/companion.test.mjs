import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,sheet,wrap,newBody,xml} from './installer-harness.mjs';
import {COMPANION_KEY,readCompanionReplies} from '../../../v3/host-companion.mjs';
const requests=messages=>{const marker=messages.find(m=>m.content.includes('[COMPANION CONVERSATION]'))?.content;return marker?JSON.parse(marker.split('Queued messages (data):\n')[1].split('\n[/COMPANION CONVERSATION]')[0]):[];};
const withReplies=(messages,text='嗯，听着呢。')=>wrap(newBody).replace(/<extra>[\s\S]*?<\/extra>/,'<extra>'+requests(messages).map(r=>'<companion id="'+r.id+'">'+text+'</companion>').join('')+'</extra>');
function connect(f,initial='independent'){let mode=initial;const service=f.api.createCompanion({readMode:()=>mode,writeMode:async value=>{mode=value;}});return service;}

test('independent companion uses one real request with full identity, persists chat only and never calls A/MVU/story writer',async()=>{
 const f=await createInstallerHarness({provider:({stage})=>{assert.equal(stage,'companion');return '嗯？这杯茶又是谁替我放凉的。';}});const chat=connect(f);
 try{const before=f.nativeMvu.counts();const result=await chat.sendMessage('小缇，在忙什么？');assert.equal(result.mode,'independent');assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);assert.equal(f.nativeMvu.counts().parses,before.parses);assert(!JSON.stringify(f.requests[0].messages).includes('TISYA.DATA.SOURCE'));assert(!JSON.stringify(f.requests[0].messages).includes('TISYA.DATA.STATE'));assert(f.requests[0].messages.length>=6);const state=await chat.getChatState();assert.equal(state.messages[0].status,'sent');assert.equal(state.messages[0].answer,result.answer);assert(f.ctx.chatMetadata[COMPANION_KEY]);assert.equal(f.ctx.chatMetadata.tisya_v3_host,undefined);}finally{f.api.dispose();}
});
test('queued companion uses the same B only, remains absent from A/preferences/story source and consumes after native save',async()=>{
 const f=await createInstallerHarness({provider:({stage,messages})=>stage==='a'?sheet(messages):withReplies(messages)}),chat=connect(f,'with-story');
 try{const queued=await chat.sendMessage('小缇，今天你的茶好喝吗？');assert.equal(f.requests.length,0);assert.equal((await chat.getChatState()).queued.length,1);await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);assert.equal(f.requests.length,2);assert(!JSON.stringify(f.requests[0].messages).includes(queued.text));const source=xml(f.requests[0].messages,'TISYA.DATA.SOURCE');assert(!source.preferenceSources.some(s=>s.text===queued.text));const state=await chat.getChatState();assert.equal(state.messages[0].status,'sent');assert.equal(state.messages[0].answer,'嗯，听着呢。');assert.equal(state.queued.length,0);const s=await f.api.getSession(),originals=await s.system.originals.listMetadata({scope:s.scope});assert(originals.length>=2);assert(!JSON.stringify(await s.storage.read()).includes(queued.text));assert(!f.ctx.chat.at(-1).mes.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1].includes('小缇'));}finally{f.api.dispose();}
});
test('invalid shared reply blocks native save and preserves the queued message',async()=>{
 const f=await createInstallerHarness({provider:({stage,messages})=>stage==='a'?sheet(messages):wrap(newBody)}),chat=connect(f,'with-story');
 try{await chat.sendMessage('听我说一句。');await f.intercept('normal');assert.equal(f.errors[0]?.code,'COMPANION_REPLY');assert.equal(f.ctx.chat.length,4);const state=await chat.getChatState();assert.equal(state.messages[0].status,'queued');assert.equal(state.messages[0].text,'听我说一句。');}finally{f.api.dispose();}
});
test('reroll does not consume a new queued companion message',async()=>{
 const f=await createInstallerHarness({mvu:false,provider:({stage,messages})=>stage==='a'?sheet(messages):withReplies(messages)}),chat=connect(f,'with-story');
 try{await f.intercept('normal');await chat.sendMessage('留到下一回合再回我。');await f.api.reroll({floor:4,requestId:'new-reroll'});assert.equal(f.errors.length,0);assert.equal(f.requests.length,4);assert.equal(requests(f.requests[3].messages).length,0);assert.equal((await chat.getChatState()).messages[0].status,'queued');}finally{f.api.dispose();}
});
test('parser accepts XML escaped plain answers and rejects duplicate, unsolicited or nested companion responses',()=>{
 const base=extra=>wrap(newBody).replace(/<extra>[\s\S]*?<\/extra>/,'<extra>'+extra+'</extra>');assert.deepEqual(readCompanionReplies(base('<companion id="x">A &amp; B &lt; C</companion>'),['x']),[{id:'x',answer:'A & B < C'}]);for(const extra of ['<companion id="y">x</companion>','<companion id="x"><b>x</b></companion>','<companion id="x">a</companion><companion id="x">b</companion>'])assert.throws(()=>readCompanionReplies(base(extra),['x']));
});

test('independent cancellation keeps the message retryable and rejects a late response',async()=>{
 let ready,release;const waiting=new Promise(r=>ready=r),blocked=new Promise(r=>release=r);const f=await createInstallerHarness({provider:async()=>{ready();await blocked;return '迟来的回答';}}),chat=connect(f);
 try{const job=chat.sendMessage('稍后回复这句。');await waiting;chat.cancel();release();await assert.rejects(job);const state=await chat.getChatState();assert.equal(state.messages[0].status,'cancelled');assert.equal(state.messages[0].answer,undefined);assert.equal(f.ctx.chat.length,4);}finally{f.api.dispose();}
});
test('user switch isolates companion history and leaves an interrupted old request available on return',async()=>{
 let ready,release;const waiting=new Promise(r=>ready=r),blocked=new Promise(r=>release=r);const f=await createInstallerHarness({provider:async()=>{ready();await blocked;return '不能写给另一位用户';}}),chat=connect(f);f.config.playerId='first';
 try{const job=chat.sendMessage('第一位用户的消息');await waiting;f.config.playerId='second';chat.contextChanged();release();await assert.rejects(job);assert.equal((await chat.getChatState()).messages.length,0);f.config.playerId='first';const previous=await chat.getChatState();assert.equal(previous.messages[0].status,'interrupted');assert.equal(previous.messages[0].text,'第一位用户的消息');assert.equal(previous.messages[0].answer,undefined);}finally{f.api.dispose();}
});
test('cancelled story A leaves the shared message queued and does not send an extra companion request',async()=>{
 let ready,release;const waiting=new Promise(r=>ready=r),blocked=new Promise(r=>release=r);const f=await createInstallerHarness({provider:async({stage,messages})=>{assert.equal(stage,'a');ready();await blocked;return sheet(messages);}}),chat=connect(f,'with-story');
 try{await chat.sendMessage('等剧情的时候顺便回我一句。');const job=f.intercept('normal');await waiting;f.api.cancel();release();await job;assert.equal(f.requests.length,1);assert.equal(f.ctx.chat.length,4);assert.equal((await chat.getChatState()).messages[0].status,'queued');}finally{f.api.dispose();}
});
test('explicit withdrawal removes a queued send without discarding its record',async()=>{
 const f=await createInstallerHarness(),chat=connect(f,'with-story');try{const row=await chat.sendMessage('这句先不发。');await chat.withdrawQueued(row.id);const state=await chat.getChatState();assert.equal(state.messages[0].status,'withdrawn');assert.equal(state.queued.length,0);assert.equal(f.requests.length,0);}finally{f.api.dispose();}
});

test('saved companion answer is recovered from the current native reply without an extra API',async()=>{
 const f=await createInstallerHarness({provider:({stage,messages})=>stage==='a'?sheet(messages):withReplies(messages)}),chat=connect(f,'with-story');
 try{await chat.sendMessage('这一句只回一次。');await f.intercept('normal');assert.equal(f.errors.length,0);const all=f.ctx.chatMetadata[COMPANION_KEY],row=Object.values(all.scopes)[0].messages[0];row.status='sending';delete row.answer;await f.ctx.saveChat();const state=await chat.getChatState();assert.equal(state.messages[0].status,'sent');assert.equal(state.messages[0].answer,'嗯，听着呢。');assert.equal(f.requests.length,2);}finally{f.api.dispose();}
});


test('independent request blocks host config mutation until its reply is settled',async()=>{
 let ready,release;const waiting=new Promise(r=>ready=r),blocked=new Promise(r=>release=r);const f=await createInstallerHarness({provider:async()=>{ready();await blocked;return '已经听到。';}}),chat=connect(f);
 try{const job=chat.sendMessage('慢慢说。');await waiting;assert.throws(()=>f.api.configurationChanged(),{code:'V3_BUSY'});await assert.rejects(f.api.deleteFloor({floor:2}),{code:'V3_BUSY'});assert.equal(f.ctx.chat.length,4);release();await job;f.api.configurationChanged();assert.equal((await chat.getChatState()).messages[0].status,'sent');}finally{release?.();f.api.dispose();}
});


test('companion recovery rejects a copied reply moved to another logical floor',async()=>{
 const f=await createInstallerHarness({provider:({stage,messages})=>stage==='a'?sheet(messages):withReplies(messages)}),chat=connect(f,'with-story');
 try{await chat.sendMessage('只认原楼。');await f.intercept('normal');assert.equal(f.errors.length,0);const row=Object.values(f.ctx.chatMetadata[COMPANION_KEY].scopes)[0].messages[0];row.status='sending';delete row.answer;const original=f.ctx.chat.at(-1),copied=structuredClone(original);copied.tisya_w24_floor={branchId:'branch-one',id:'floor:copied'};f.ctx.chat[f.ctx.chat.length-1]=copied;const ids=f.ctx.chatMetadata.tisya_w24;delete ids.rows[ids.order.at(-1)];ids.order[ids.order.length-1]='floor:copied';ids.rows['floor:copied']={id:'floor:copied',floor:f.ctx.chat.length-1,role:'assistant'};await f.ctx.saveChat();const state=await chat.getChatState();assert.equal(state.messages[0].status,'interrupted');assert.equal(state.messages[0].answer,undefined);assert.equal(f.requests.length,2);}finally{f.api.dispose();}
});
