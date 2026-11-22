import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSha256,sha256,sha256Async,digest,digestAsync,stable,clone} from '../engine/common.mjs';
import {reviewProjection} from '../engine/turn-review.mjs';
import {inversePatch,rewind} from '../engine/journal.mjs';

test('streaming SHA-256 preserves Unicode bytes, split boundaries and immutable prefixes',()=>{
 const text='世界🌙'.repeat(500)+'abc';
 for(const parts of [[text],['',text],['世界🌙'.repeat(100),text.slice('世界🌙'.repeat(100).length)],['a','b','c']]){
  const stream=createSha256();for(const part of parts)stream.update(part);assert.equal(stream.digest(),createHash('sha256').update(parts.join('')).digest('hex'));
 }
 const prefix=createSha256().update('ab');assert.equal(prefix.digest('c'),sha256('abc'));assert.equal(prefix.digest(),sha256('ab'));
});

test('async SHA-256 and canonical digests preserve the exact synchronous signatures',async()=>{
 const text='世界🌙'.repeat(500)+'abc';assert.equal(await sha256Async(text),createHash('sha256').update(text).digest('hex'));assert.equal(await sha256Async(text),sha256(text));
 assert.equal(await digestAsync({b:[2,'世界'],a:1}),digest({a:1,b:[2,'世界']}));
});

test('review context fingerprints remain the exact canonical hashes of every projected prefix',()=>{
 const messages=Array.from({length:120},(_,i)=>({uid:'m'+i,role:i%2?'assistant':'user',text:'正文 '+i+' 🌙'}));
 const firstContext=digest([messages[0]]),decision={uid:'m1',contextHash:firstContext,sourceHash:sha256(messages[1].text),reply:'已确认回复',active:true};
 const bundle={turn_review:{decisions:[decision],legacy:[]},journal:{baseline_messages:[]}};
 const projected=reviewProjection(bundle,messages);assert.equal(projected.messages[1].text,'已确认回复');
 for(const review of projected.reviews){
  const expected=digest(projected.messages.slice(0,review.index).map(m=>({uid:m.uid,role:m.role,text:m.text??''})));
  assert.equal(review.contextHash,expected,review.uid);
 }
});

test('inverse patches retain canonical JSON equality and exact rollback without whole-state serialization',()=>{
 const before={b:2,a:{x:1,omitted:undefined},list:[undefined,{v:1}]},after={a:{x:1,omitted:undefined},b:2,list:[null,{v:1}]};assert.deepEqual(inversePatch(before,after),[]);
 const changed={a:{x:3},b:4,list:[null,{v:2},'新增']},patch=inversePatch(before,changed);assert(patch.length>0);assert.equal(stable(rewind(clone(changed),patch)),stable(before));
});
