import test from 'node:test';
import assert from 'node:assert/strict';
import {capture} from '../model.js';
import {revisionParagraphs,makeRevision,validateRevision,revisionMessages,candidatePosition,createRevisionController} from '../revision.js';
function fixture(){
 const original={mes:'保留这一段。\n\n改这一段。\n\n也保留。',swipe_id:0,swipes:['保留这一段。\n\n改这一段。\n\n也保留。'],extra:{stat_data:{promise:'旧约定'}},swipe_info:[{extra:{stat_data:{promise:'旧约定'}}}]};
 const c={chatId:'one',chat:[original],onlineStatus:'connected',getCurrentChatId(){return this.chatId;},async saveChat(){}};
 const requests=[],feedback=[],branches=[],archives=[];let output='保留这一段。\n\n新的一段。\n\n也保留。',stopped=false,fail=false,control;
 control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,canSwipe:()=>true,overswipe:()=>'regenerate',stageFork:async(...args)=>branches.push(args),cancelFork(){},activateFork:async()=>{},branch:async id=>{c.chat=structuredClone(c.chat.slice(0,id+1));c.chatId='branch';return 'branch';},setRevision:r=>requests.push(r),archive:async()=>archives.push(c.chat.at(-1).mes),feedback:async f=>feedback.push(f),swipe:async(_,direction,{forceSwipeId:i})=>{
  const m=c.chat.at(-1);m.swipe_info[m.swipe_id]={extra:structuredClone(m.extra)};
  if(i===m.swipes.length){if(fail)return;m.swipes.push(output);m.swipe_info.push({extra:{stat_data:{promise:'新约定'}}});if(stopped)control.stopped();control.received(0,'swipe');control.ended(true);}
  m.swipe_id=i;m.mes=m.swipes[i];m.extra=structuredClone(m.swipe_info[i].extra);
 }});
 return {c,control,requests,feedback,branches,archives,setOutput:v=>output=v,setStop:()=>stopped=true,setFail:()=>fail=true,token:()=>capture(c,0)};
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
test('stopped and failed generation do not add dissatisfaction feedback or archive partial output',async()=>{for(const stop of [true,false]){const f=fixture();stop?f.setStop():f.setFail();await assert.rejects(f.control.generate(f.token(),{}),/生成未完成/);assert.equal(f.c.chat[0].swipe_id,0);assert.equal(f.feedback.length,0);assert.equal(f.archives.length,0);}});
test('old-floor reroll creates independent prefix and preserves original following messages',async()=>{const f=fixture();f.c.chat.push({is_user:true,mes:'之后的原剧情'});const original=structuredClone(f.c.chat),old=f.c.chat;await f.control.generate(f.token(),{});assert.deepEqual(old,original);assert.equal(f.c.chatId,'branch');assert.equal(f.c.chat.length,1);assert.deepEqual(f.branches,[[1,false,{preserveCandidates:true}]]);assert.equal(f.feedback[0].chatId,'branch');});
test('stale feedback and out-of-range navigation are rejected before native mutation',async()=>{const f=fixture(),token=f.token();f.c.chat[0].mes+='改';await assert.rejects(f.control.generate(token,{}),/消息已变化/);assert.equal(f.requests.length,0);await assert.rejects(f.control.select(f.token(),1),/候选编号/);assert.equal(f.feedback.length,0);});

test('revision initializes configuration before locking native generation and rechecks source afterward',async()=>{const f=fixture();let activeDuringPrepare;const original=f.c.chat[0],c=f.c;const control=createRevisionController({getContext:()=>c,assertIdle(){},hydrate:async()=>true,canSwipe:()=>true,overswipe:()=>'regenerate',stageFork:async()=>{},activateFork:async()=>{},cancelFork(){},branch:async()=>{},prepare:async()=>{activeDuringPrepare=control.active();original.mes='初始化期间被改';},swipe:async()=>{throw Error('MUST NOT GENERATE');},setRevision(){},archive:async()=>{},feedback:async()=>{}});await assert.rejects(control.generate(f.token(),{}),/消息已变化/);assert.equal(activeDuringPrepare,null);assert.equal(control.active(),null);});
