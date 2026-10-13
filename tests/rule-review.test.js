import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {ruleSources,validateRuleReview,rulePolicy,chooseRule,policyEvidence} from '../tables/rule-review.js';
import {renderRuleReview} from '../tables/rule-review-ui.js';
import {createTableService} from '../tables/service.js';
import {createBookGateway} from '../tables/books.js';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';

const original='每日只有 8 个时段。每次训练占用 10 个时段。';
const makeCard=()=>({name:'测试卡',avatar:'card.png',description:original,mes_example:'示例：一日训练十次',data:{extensions:{tavern_helper:{scripts:[{type:'script',content:'RUNTIME_ONLY'}]}}}});
const proposal=()=>({issues:[{id:'slots',title:'训练无法排入日程',problem:'所需时段超过全天容量。',sources:[{sourceId:'card.field.description',quote:original}],options:[{id:'shorter',label:'缩短单次训练',rationale:'使单次训练能放进一天。',tradeoffs:'训练耗时降低，收益仍需沿用其余规则。',changes:[{sourceId:'card.field.description',before:'每次训练占用 10 个时段。',after:'每次训练占用 4 个时段。'}]},{id:'longer-day',label:'增加日程容量',rationale:'维持训练耗时并扩大可用日程。',tradeoffs:'每日可行动总量增加。',changes:[{sourceId:'card.field.description',before:'每日只有 8 个时段。',after:'每日只有 12 个时段。'}]}]}]});
test('choices preserve originals, silence only the selected issue, and reject stale sources and overlaps',async()=>{
 const card=makeCard(),before=structuredClone(card),source=await ruleSources(card),review=validateRuleReview(proposal(),source);
 assert.doesNotMatch(JSON.stringify(source),/RUNTIME_ONLY/);assert.throws(()=>rulePolicy(review,source),/待选择/);
 const kept=chooseRule(review,source,{issueId:'slots',action:'keep'});assert.equal(rulePolicy(kept,source).decisions[0].action,'keep');assert.equal(policyEvidence(rulePolicy(kept,source)),'');
 const selected=chooseRule(review,source,{issueId:'slots',action:'optimize',optionId:'shorter'});assert.match(policyEvidence(rulePolicy(selected,source)),/每次训练占用 4 个时段/);assert.deepEqual(card,before);assert.deepEqual(review.decisions,{});
 assert.throws(()=>chooseRule(selected,{...source,fingerprint:'changed'},{issueId:'slots',action:'keep'}),/已改变/);
 const duplicate=proposal();duplicate.issues.push({...structuredClone(duplicate.issues[0]),id:'overlap'});const twice=validateRuleReview(duplicate,source),one=chooseRule(twice,source,{issueId:'slots',action:'optimize',optionId:'shorter'});assert.throws(()=>chooseRule(one,source,{issueId:'overlap',action:'optimize',optionId:'shorter'}),/同一段原文/);
 const reopened=chooseRule(selected,source,{issueId:'slots',action:'reopen'});assert.throws(()=>rulePolicy(reopened,source),/待选择/);
});
test('fabricated evidence, outside edits, ambiguous anchors and unsafe IDs are rejected',async()=>{
 const source=await ruleSources(makeCard());
 for(const mutate of [p=>p.issues[0].sources[0].quote='未提供的原文',p=>p.issues[0].sources[0].quote=original.replaceAll(' ',''),p=>p.issues[0].options[0].changes[0].before='每次训练占用10个时段。',p=>p.issues[0].options[0].changes[0].sourceId='missing',p=>p.issues[0].sources[0].quote='每日只有 8 个时段。',p=>p.issues[0].id='constructor',p=>p.issues[0].id='toString',p=>p.issues[0].options[0].id='__proto__']){const p=proposal();mutate(p);assert.throws(()=>validateRuleReview(p,source));}
 const repeated=await ruleSources({...makeCard(),description:original+original});assert.throws(()=>validateRuleReview(proposal(),repeated),/不唯一/);
});
test('inactive definitions are not operative review sources until enabled',async()=>{
 const card=makeCard(),base=await ruleSources(card);card.data.character_book={entries:[{id:9,enabled:false,content:'关闭规则'}]};
 assert.deepEqual(await ruleSources(card),base);card.data.character_book.entries[0].content='仍关闭的新规则';assert.deepEqual(await ruleSources(card),base);
 card.data.character_book.entries[0].enabled=true;const enabled=await ruleSources(card);assert.notEqual(enabled.fingerprint,base.fingerprint);assert(enabled.sources.some(s=>s.text==='仍关闭的新规则'));
});
test('red review displays inert exact source and explicit selectable diffs; silent choice remains reopenable',async()=>{
 const window=new Window(),source=await ruleSources(makeCard()),review=validateRuleReview(proposal(),source),calls=[];
 renderRuleReview(window.document,window.document.body,{review,onChoose:c=>calls.push(c)});
 const title=window.document.querySelector('summary');assert.equal(title.style.color,'#c62828');assert.equal(title.getAttribute('role'),'alert');assert.equal(window.document.querySelector('pre').textContent,original);
 const buttons=[...window.document.querySelectorAll('button')];buttons.find(b=>b.textContent==='保留原规则并静默').click();assert.deepEqual(calls[0],{issueId:'slots',action:'keep'});buttons.find(b=>b.textContent==='应用此方案：缩短单次训练').click();assert.equal(calls[1].optionId,'shorter');
 const kept=chooseRule(review,source,calls[0]);renderRuleReview(window.document,window.document.body,{review:kept,onChoose:c=>calls.push(c)});assert.equal(window.document.querySelector('[role=alert]'),null);assert.equal(window.document.querySelector('details').open,false);window.document.querySelector('button').click();assert.equal(calls.at(-1).action,'reopen');
 renderRuleReview(window.document,window.document.body,{review:kept,stale:true,onChoose(){}});assert(window.document.querySelector('[role=alert]'));assert.equal(window.document.querySelectorAll('button').length,0);await window.happyDOM.abort();
});
function fixture(){
 const d=emptyConfig(),c={chatId:'rule-chat',characterId:0,characters:[makeCard()],chat:[],extensionSettings:{[KEY]:d}};d.worlds[worldKey(c)]=defaultWorld();d.worlds[worldKey(c)].tables={enabled:true,injection:'direct',archive:false,plot:false,offstage:false,preferences:false};const saved=new Map();let uid=0,binding={primary:'',additional:[]};
 const helper={getWorldbookNames:()=>[...saved.keys()],getWorldbook:async n=>structuredClone(saved.get(n)),createWorldbook:async(n,rows)=>{saved.set(n,rows.map(r=>({...r,uid:++uid})));return true;},updateWorldbookWith:async(n,fn)=>{const next=fn(structuredClone(saved.get(n)));saved.set(n,next);return next;},getCharWorldbookNames:async()=>structuredClone(binding),rebindCharWorldbooks:async(_,next)=>{binding=next;}};
 const store=createStore({getContext:()=>c,persist:async()=>true}),calls=[];const service=createTableService({store,getContext:()=>c,books:createBookGateway(()=>helper,()=>c),request:async(task,text)=>{const input=JSON.parse(text);calls.push({task,input});if(task==='ruleReview')return JSON.stringify(proposal());if(task==='templateInit')return JSON.stringify({base:{changes:[]},initial:{changes:[]},notes:[]});return JSON.stringify({changes:[]});}});return {service,c,calls,store};
}
test('production initialization gates on choices, persists scope, propagates through actual presets and narrative, rejects stale decisions',async()=>{
 const f=fixture(),originalCard=structuredClone(f.c.characters[0]);await assert.rejects(f.service.autoInitialize(),/待选择/);assert.deepEqual(f.calls.map(c=>c.task),['ruleReview']);let status=await f.service.ruleReviewStatus();assert.equal(status.review.issues.length,1);assert.equal((await f.service.inspect()).rows.length,0);
 const expected={fingerprint:status.review.fingerprint,sessionRevision:status.sessionRevision};await f.service.saveRuleChoice({issueId:'slots',action:'optimize',optionId:'shorter'},expected);await assert.rejects(f.service.saveRuleChoice({issueId:'slots',action:'keep'},expected),/依据已变化/);
 const draft=await f.service.cardTemplate();const input=f.calls.at(-1).input;assert.equal(input.rulePolicy.decisions[0].changes[0].after,'每次训练占用 4 个时段。');assert.equal(input.sourceCardRaw.fields.description,original);assert.equal(f.calls.filter(c=>c.task==='ruleReview').length,1);
 const cfg=f.store.read(),preset=pairedPreset({task:'templateInit',configuration:{data:cfg.data,world:cfg.world}}),messages=taskMessages({preset,task:'templateInit',input});assert(messages.some(m=>m.content.includes('每次训练占用 4 个时段。')));
 await f.service.saveCardTemplate(draft);const narrative=await f.service.prepare();assert.equal(narrative.slots.state.rulePolicy.decisions[0].action,'optimize');assert.deepEqual(f.c.characters[0],originalCard);
 status=await f.service.ruleReviewStatus();await f.service.saveRuleChoice({issueId:'slots',action:'keep'},{fingerprint:status.review.fingerprint,sessionRevision:status.sessionRevision});assert.equal((await f.service.prepare()).slots.state.rulePolicy.decisions[0].action,'keep');
 f.c.characters[0].description+='新增条款。';assert.equal((await f.service.ruleReviewStatus()).stale,true);await assert.rejects(f.service.prepare(),/原卡或绑定规则已改变/);
});

test('rule review cannot display another session decisions through a misbound book',async()=>{
 const f=fixture();await f.service.reviewCardRules();const settings=(await f.service.inspect()).settings;f.c.chatId='another-chat';const snapshot=f.store.read();snapshot.data.worlds[snapshot.key]={...snapshot.world,tables:{...settings}};await f.store.save(snapshot.data,snapshot.revision,snapshot.key);await assert.rejects(f.service.ruleReviewStatus(),/属于另一会话/);
});
