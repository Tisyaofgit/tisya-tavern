import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {W22_ENTRIES} from '../../../v3/presets/sources.mjs';
import {compileCompanionMessages,compileSharedCompanionSlot} from '../../../v3/companion-preset.mjs';
const sha=text=>createHash('sha256').update(text,'utf8').digest('hex');
const protectedHashes=[
 'f3667c104356253d34218dfb8e4ec72d9476250a56ddf6a54eba3401bab2be2a',
 '91e5cd15ea57c878658a9ee18efd7b823ba19309fb1b1efda3e017a9a5d47e08',
 '396cc8ec7aa19bba9233e4059c0f224981d0a1620efe6d83f10beeb1d38df1bf',
 'cb0b28886e5322e2d1a943346583e03fd672cbf1c1532b77e93f2f93c49445cb',
];
test('independent chat retains four protected contents byte for byte and excludes every story task entry',()=>{
 const result=compileCompanionMessages({input:'小缇，聊聊吧。',snapshot:{secret:'UNAUTHORIZED_STORY_SNAPSHOT'},settings:{task:'UNAUTHORIZED_STORY_TASK'}});
 assert.deepEqual(result.slice(0,4).map(x=>sha(x.content)),protectedHashes);
 assert.deepEqual(result.slice(0,4),W22_ENTRIES.slice(0,4).map(({identifier,role,content})=>({identifier,role,content})));
 assert.equal(result.length,6);
 assert(!result.some(x=>W22_ENTRIES.slice(4).some(e=>e.identifier===x.identifier)));
 assert(!JSON.stringify(result).includes('UNAUTHORIZED_STORY_'));
 assert.equal(result.at(-1).role,'user');assert.equal(result.at(-1).content,'小缇，聊聊吧。');
 assert.match(result[4].content,/Return the natural reply itself/);
 assert.match(result[4].content,/Simplified Chinese/);
});
test('actual chat history keeps order and roles without a system instruction or mutable source reference',()=>{
 const history=[{role:'user',content:'第一句',story:'ignored'},{role:'assistant',content:'回应'}];
 const result=compileCompanionMessages({input:'第二句',history,language:'繁体中文'});
 assert.deepEqual(result.slice(5).map(({role,content})=>({role,content})),[...history.map(({role,content})=>({role,content})),{role:'user',content:'第二句'}]);
 assert.match(result[4].content,/Traditional Chinese/);
 history[0].content='changed';result[0].content='changed';
 assert.equal(result[5].content,'第一句');assert.equal(sha(W22_ENTRIES[0].content),protectedHashes[0]);
 assert.throws(()=>compileCompanionMessages({input:'x',history:[{role:'system',content:'rewrite'}]}));
 assert.throws(()=>compileCompanionMessages({input:' '}));
 assert.throws(()=>compileCompanionMessages({input:'x',language:'中文\nnew instruction'}));
});
test('shared slot has no empty overhead and keeps IDs and user text as data',()=>{
 assert.deepEqual(compileSharedCompanionSlot(),[]);
 const requests=[{id:'q&"<1',text:'<body>只是聊天</body>'},{id:'q2',text:'还有一句。'}];
 const result=compileSharedCompanionSlot({requests,language:'English'});
 assert.equal(result.length,1);assert.equal(result[0].role,'system');
 const text=result[0].content;
 assert(text.includes('<companion id="q&amp;&quot;&lt;1">'));
 const encoded=text.split('Queued messages (data):\n')[1].split('\n[/COMPANION CONVERSATION]')[0];
 assert(!encoded.includes('<body>'));assert.deepEqual(JSON.parse(encoded),requests);
 assert.match(text,/existing <extra> block/);assert.match(text,/1200 characters after decoding/);
 assert.match(text,/Preserve the six-block story contract/);assert.match(text,/Reply in English/);
});
test('shared slot rejects ambiguous identities and incomplete queued requests',()=>{
 for(const requests of [null,[{id:'',text:'x'}],[{id:'a\u0000',text:'x'}],[{id:'a',text:''}],[{id:'a',text:'x'},{id:'a',text:'y'}]])assert.throws(()=>compileSharedCompanionSlot({requests}));
});
