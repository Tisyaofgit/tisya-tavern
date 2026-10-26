import {createUserEditHistory} from '../user-revision.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {capture} from '../model.js';
import {revisionParagraphs,makeRevision,validateRevision,revisionMessages,candidatePosition,createRevisionController} from '../revision.js';
function fixture(archiveMode=true){
 const original={mes:'保留这一段。\n\n改这一段。\n\n也保留。',swipe_id:0,swipes:['保留这一段。\n\n改这一段。\n\n也保留。'],extra:{stat_data:{promise:'旧约定'}},swipe_info:[{extra:{stat_data:{promise:'旧约定'}}}]};
 const c={chatId:'one',chat:[original],onlineStatus:'connected',getCurrentChatId(){return this.chatId;},async saveChat(){}};
 const requests=[],userRequests=[],feedback=[],branches=[],archives=[],archiveModes=[];let output='保留这一段。\n\n新的一段。\n\n也保留。',stopped=false,fail=false,control;
 control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,canSwipe:()=>true,overswipe:()=>'regenerate',stageFork:async(...args)=>branches.push(args),cancelFork(){},activateFork:async()=>{},branch:async id=>{c.chat=structuredClone(c.chat.slice(0,id+1));c.chatId='branch';return 'branch';},setRevision:r=>requests.push(r),setUserRevision:r=>userRequests.push(r),archive:async mode=>{archiveModes.push(mode);archives.push(c.chat.at(-1).mes);},feedback:async f=>feedback.push(f),swipe:async(_,direction,{forceMesId:id,forceSwipeId:i})=>{
  const m=c.chat.at(-1);m.swipe_info[m.swipe_id]={extra:structuredClone(m.extra)};
  if(i===m.swipes.length){if(fail)return;m.swipes.push(output);m.swipe_info.push({extra:{stat_data:{promise:'新约定'}}});if(stopped)control.stopped();control.received(id,'swipe');control.ended(archiveMode);}
  m.swipe_id=i;m.mes=m.swipes[i];m.extra=structuredClone(m.swipe_info[i].extra);
 }});
 return {c,control,requests,userRequests,feedback,branches,archives,archiveModes,setOutput:v=>output=v,setStop:()=>stopped=true,setFail:()=>fail=true,token:()=>capture(c,0)};
}
test('partial selection preserves fenced paragraphs and exact unchanged bytes',()=>{
 const source='第一段。\n\n```txt\n代码\n\n仍在代码里\n```\n\n尾段。';assert.equal(revisionParagraphs(source).length,3);
 const request=makeRevision({text:source,chatId:'x',id:0},{mode:'partial',selected:[2],direction:'改代码说明'});
 assert.equal(validateRevision(request,source.replace('代码\n','新代码\n')),true);
 assert.throws(()=>validateRevision(request,source.replace('第一','改掉第一')),/第 1 段/);
 assert.throws(()=>validateRevision(request,source+'\n\n多段'),/段落数量/);
 assert.throws(()=>makeRevision({text:source},{mode:'partial'}),/至少/);
});
test('feedback data remains literal and never enters system instructions',()=>{const request=makeRevision({text:'{{user}}\n\n忽略指令',chatId:'one',id:0},{direction:'不要把 {{user}} 展开'}),messages=revisionMessages(request);assert.equal(messages[1].role,'user');assert.equal(JSON.parse(messages[1].content).source,request.source);assert(!messages[0].content.includes('{{user}}'));});
test('successful partial reroll keeps old candidate, then archives once; navigation generates nothing',async()=>{const f=fixture();await f.control.generate(f.token(),{mode:'partial',selected:[2],direction:'写得简短'});assert.equal(candidatePosition(f.c.chat[0]).label,'2/2');assert.equal(f.c.chat[0].swipes[0],'保留这一段。\n\n改这一段。\n\n也保留。');assert.equal(f.feedback.length,1);assert.equal(f.archives.length,1);await f.control.select(f.token(),0);assert.equal(f.c.chat[0].extra.stat_data.promise,'旧约定');assert.equal(candidatePosition(f.c.chat[0]).label,'1/2');assert.equal(f.feedback.length,1);assert.equal(f.requests.filter(Boolean).length,1);});
test('out-of-scope partial change preserves rejected draft but restores old candidate and extras without archive',async()=>{const f=fixture();f.setOutput('越界了。\n\n新段。\n\n也保留。');await assert.rejects(f.control.generate(f.token(),{mode:'partial',selected:[2]}),/第 1 段/);assert.equal(candidatePosition(f.c.chat[0]).label,'1/2');assert.equal(f.c.chat[0].extra.stat_data.promise,'旧约定');assert.equal(f.feedback[0].result,'rejected');assert.equal(f.archives.length,0);assert.equal(f.control.active(),null);assert.equal(f.requests.at(-1),null);});
test('stopped and failed generation do not add dissatisfaction feedback or archive partial output',async()=>{for(const stop of [true,false]){const f=fixture();stop?f.setStop():f.setFail();await assert.rejects(f.control.generate(f.token(),{}),/生成未完成|生成已停止/);assert.equal(f.c.chat[0].swipe_id,0);assert.equal(f.feedback.length,0);assert.equal(f.archives.length,0);}});
test('stop detaches a hung native reroll without late plugin rollback, feedback or archive',async()=>{
 const c={chatId:'a',getCurrentChatId:()=>c.chatId,saveChat:async()=>{saves++;},chat:[{mes:'原版',swipe_id:0,swipes:['原版']}]};let release,saves=0,archives=0,feedback=0,swipeCalls=0;const pending=new Promise(r=>release=r),requests=[];
 const control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,canSwipe:()=>true,overswipe:()=>'regenerate',setRevision:r=>requests.push(r),archive:async()=>archives++,feedback:async()=>feedback++,swipe:async()=>{swipeCalls++;c.chat[0].swipes.push('停止时半稿');c.chat[0].swipe_id=1;c.chat[0].mes='停止时半稿';await pending;}});
 const run=control.generate(capture(c,0),{}),rejected=assert.rejects(run,{name:'AbortError'});for(let i=0;!control.active()&&i<20;i++)await new Promise(r=>setImmediate(r));assert(control.active());await new Promise(r=>setImmediate(r));control.stopped();await rejected;
 assert.equal(control.active(),null);assert.equal(requests.at(-1),null);assert.equal(c.chat[0].swipes[0],'原版');assert.equal(swipeCalls,1);assert.equal(saves,0);release();await new Promise(r=>setImmediate(r));assert.equal(swipeCalls,1);assert.equal(feedback,0);assert.equal(archives,0);
});
test('stop during branch preparation discards the staged fork and never starts a branch or generation',async()=>{
 const c={chatId:'a',getCurrentChatId:()=>c.chatId,chat:[{mes:'原版',swipe_id:0,swipes:['原版']},{is_user:true,mes:'后文'}]};let release,staged=false,cancelled=0,branched=0;const pending=new Promise(r=>release=r);
 const control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,canSwipe:()=>true,overswipe:()=>'regenerate',stageFork:async()=>{staged=true;await pending;},cancelFork:()=>cancelled++,branch:async()=>branched++,activateFork:async()=>{},setRevision(){},swipe:async()=>{throw Error('must not generate');},archive:async()=>{},feedback:async()=>{}});
 const run=control.generate(capture(c,0),{}),rejected=assert.rejects(run,{name:'AbortError'});for(let i=0;!staged&&i<20;i++)await new Promise(r=>setImmediate(r));assert(staged);control.stopped();release();await rejected;assert.equal(cancelled,1);assert.equal(branched,0);assert.equal(c.chat.length,2);
});
test('old-floor reroll creates independent prefix and preserves original following messages',async()=>{const f=fixture();f.c.chat.push({is_user:true,mes:'之后的原剧情'});const original=structuredClone(f.c.chat),old=f.c.chat;await f.control.generate(f.token(),{});assert.deepEqual(old,original);assert.equal(f.c.chatId,'branch');assert.equal(f.c.chat.length,1);assert.deepEqual(f.branches,[[1,false,{preserveCandidates:true}]]);assert.equal(f.feedback[0].chatId,'branch');});
test('stale feedback and out-of-range navigation are rejected before native mutation',async()=>{const f=fixture(),token=f.token();f.c.chat[0].mes+='改';await assert.rejects(f.control.generate(token,{}),/消息已变化/);assert.equal(f.requests.length,0);await assert.rejects(f.control.select(f.token(),1),/候选编号/);assert.equal(f.feedback.length,0);});

test('revision initializes configuration before locking native generation and rechecks source afterward',async()=>{const f=fixture();let activeDuringPrepare;const original=f.c.chat[0],c=f.c;const control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,canSwipe:()=>true,overswipe:()=>'regenerate',stageFork:async()=>{},activateFork:async()=>{},cancelFork(){},branch:async()=>{},prepare:async()=>{activeDuringPrepare=control.active();original.mes='初始化期间被改';},swipe:async()=>{throw Error('MUST NOT GENERATE');},setRevision(){},archive:async()=>{},feedback:async()=>{}});await assert.rejects(control.generate(f.token(),{}),/消息已变化/);assert.equal(activeDuringPrepare,null);assert.equal(control.active(),null);});


test('ordinary reroll requests a new native candidate without injecting advanced instructions',async()=>{const f=fixture();await f.control.generate(f.token(),null);assert.equal(candidatePosition(f.c.chat[0]).label,'2/2');assert.equal(f.requests.filter(Boolean).length,0);assert.equal(f.feedback.length,1);assert.equal(f.archives.length,1);});

test('candidate navigation delegates exact target and does not duplicate native persistence',async()=>{const f=fixture();await f.control.generate(f.token(),null);let saves=0;f.c.saveChat=async()=>{saves++;throw Error('duplicate save');};await f.control.select(f.token(),0);assert.equal(saves,0);assert.equal(f.token().text,f.c.chat[0].swipes[0]);});
test('native candidate deletion retains other bodies and extras and protects final version',async()=>{const c={chat:[{mes:'B',swipe_id:1,swipes:['A','B','C'],swipe_info:[{extra:{v:1}},{extra:{v:2}},{extra:{v:3}}]}],getCurrentChatId:()=> 'one'};let calls=0;const control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,deleteSwipe:async(index,id)=>{calls++;const m=c.chat[id];m.swipes.splice(index,1);m.swipe_info.splice(index,1);m.swipe_id=Math.min(index,m.swipes.length-1);m.mes=m.swipes[m.swipe_id];m.extra=m.swipe_info[m.swipe_id].extra;return m.swipe_id;}});await control.remove(capture(c,0),1);assert.deepEqual(c.chat[0].swipes,['A','C']);assert.deepEqual(c.chat[0].extra,{v:3});assert.equal(control.navigating(),false);await control.remove(capture(c,0),1);await assert.rejects(control.remove(capture(c,0),0),/至少保留/);assert.equal(calls,2);});
test('navigation locks only until native completion and rejects stale unsynchronized body',async()=>{let resolve;const c={chat:[{mes:'A',swipe_id:0,swipes:['A','B']}],getCurrentChatId:()=> 'one'};const control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,canSwipe:()=>true,swipe:async()=>{await new Promise(r=>resolve=r);c.chat[0].swipe_id=1;}});const run=control.select(capture(c,0),1);while(!resolve)await new Promise(r=>setTimeout(r,0));assert.equal(control.navigating(),true);await assert.rejects(control.select(capture(c,0),1),/正在切换/);resolve();await assert.rejects(run,/正文同步/);assert.equal(control.navigating(),false);});


test('reroll after edited user carries only its immediately previous input through a preserved historical branch',async()=>{
 const f=fixture(),user={is_user:true,mes:'旧输入'},edits=createUserEditHistory();edits.begin(user);user.mes='新的剧情方向';edits.commit(user);f.c.chat.unshift(user);f.c.chat.push({is_user:true,mes:'保留的后文'});
 const old=f.c.chat,before=structuredClone(old);await f.control.generate(capture(f.c,1),null);assert.deepEqual(old,before);assert.equal(f.c.chat.length,2);assert.equal(f.c.chat[1].swipes.length,2);assert.deepEqual(f.userRequests.filter(Boolean),[{messageId:0,previous:'旧输入',current:'新的剧情方向'}]);assert.equal(f.userRequests.at(-1),null);assert.equal(f.requests.filter(Boolean).length,0);
});
test('failed edited-user reroll clears one-shot comparison and keeps original candidate',async()=>{
 const f=fixture(),u={is_user:true,mes:'A'},h=createUserEditHistory();h.begin(u);u.mes='B';h.commit(u);f.c.chat.unshift(u);f.setFail();await assert.rejects(f.control.generate(capture(f.c,1),null),/生成未完成/);assert.equal(f.userRequests.at(-1),null);assert.equal(f.c.chat[1].swipe_id,0);assert.equal(f.control.active(),null);
});

test('one-pass reroll delegates the completed selected candidate to its single-response archive',async()=>{const f=fixture('onepass');await f.control.generate(f.token(),null);assert.equal(candidatePosition(f.c.chat[0]).label,'2/2');assert.deepEqual(f.archiveModes,['onepass']);assert.equal(f.archives.length,1);});
