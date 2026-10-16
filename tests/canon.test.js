import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {sources,project} from '../tables/ledger.js';
import {branchSeed} from '../tables/branches.js';
import {freezeCanonSnapshot as freeze,validateFrozenCanon as validate} from '../tables/canon.js';
const projectToolTurns=chat=>chat.map((message,sourceIndex)=>message.extra?.tool_invocations?{type:'tool-turn',sourceIndices:[sourceIndex]}:{type:'message',sourceIndex,message});
const freezeCanonSnapshot=(loaded,context,options)=>freeze(loaded,{...context,projectToolTurns},options);
const validateFrozenCanon=anchor=>validate(anchor,{projectToolTurns});
async function fixture(){
 const chat=[{is_user:false,name:'岚',mes:'旧原文\n\n保留空行。',swipe_id:0,swipes:['旧原文\n\n保留空行。','废弃候选绝不能入正史'],extra:{原始值:0}},{is_user:true,name:'新U',mes:'去城门。'},{is_user:false,name:'岚',mes:'未归档的未来相遇。'},{is_system:true,mes:'系统标记'},{is_system:true,is_user:false,mes:'非叙事工具结果',extra:{tool_invocations:[{id:'a',name:'lookup',parameters:'{}',result:'资料'}]}}],chain=await sources(chat),registry=defaultRegistry();
 const row={id:'a',table:'objects',rev:1,values:{名称:'少年岚',类型:'character',描述:'还不知道秘密'},access:{readers:['读者'],knowers:[]},source:chain[0].key};
 const origin={id:'origin-1',revision:4,registry,bases:[row]},session={id:'session-1',revision:7,registry,schemaPinned:true,pins:['a@1'],commits:[{id:'c1',kind:'archive',source:chain[0].key,changes:[{id:'a',before:null,after:row,origin:'a@1'}],anchors:[]}]};
 const loaded={origin:{data:origin},session:{data:session},chain,view:project(origin,session,chain.map(s=>s.key))};return {chat,loaded};
}
test('canon freezes exact raw messages and candidates while distinguishing selected and unarchived sources',async()=>{
 const {chat,loaded}=await fixture(),original=structuredClone({chat,loaded}),anchor=await freezeCanonSnapshot(loaded,{chat,world:'one'},{name:'原著'}),receipt=await validateFrozenCanon(JSON.parse(JSON.stringify(anchor)));
 assert.deepEqual(anchor.canon.snapshot.chat,chat);assert.equal(receipt.messages,5);assert.equal(receipt.selectedSources,3);assert.equal(receipt.archivedSources,1);assert.deepEqual(receipt.unarchivedSources,[{key:loaded.chain[2].key,floor:3}]);
 assert(!anchor.canon.snapshot.chain.some(s=>s.text.includes('废弃候选')||s.text.includes('工具结果')));assert.deepEqual({chat,loaded},original);
 chat[0].mes='后来修改的原文';loaded.session.data.commits=[];loaded.origin.data.bases[0].values.描述='后来才知道的秘密';await validateFrozenCanon(anchor);assert.equal(anchor.canon.snapshot.chat[0].mes,original.chat[0].mes);
 const seed=branchSeed(anchor);seed.rows[0].values.描述='平行线改变';assert.equal(anchor.rows[0].values.描述,'还不知道秘密');assert(!JSON.stringify(seed).includes('未归档的未来相遇'));
});
test('canon checksum rejects altered text, selected candidates, table versions and anchor rows',async()=>{
 const {chat,loaded}=await fixture(),anchor=await freezeCanonSnapshot(loaded,{chat,world:'one'},{name:'原著'});
 for(const mutate of [a=>a.canon.snapshot.chat[0].mes='伪造',a=>a.canon.snapshot.chat[0].swipe_id=1,a=>a.canon.snapshot.origin.bases[0].rev++,a=>a.rows[0].values.描述='倒灌',a=>a.canon.coverage.unarchivedSources=[]]){const changed=structuredClone(anchor);mutate(changed);await assert.rejects(validateFrozenCanon(changed),/校验不一致/);}
 await assert.rejects(validateFrozenCanon({...anchor,canon:undefined}),/没有完整原著/);
});
test('canon can freeze a pre-ledger start without pretending later archived sources belong to that start',async()=>{
 const {chat,loaded}=await fixture(),anchor=await freezeCanonSnapshot(loaded,{chat,world:'one'},{name:'开局前',cut:'start'});assert.deepEqual(anchor.rows,[]);assert.deepEqual(anchor.archivedSources,[]);assert.equal(anchor.canon.coverage.archivedSources.length,1);assert.equal((await validateFrozenCanon(anchor)).sourceRevision,7);
 const altered=structuredClone(chat);altered[0].mes='已改变';await assert.rejects(freezeCanonSnapshot(loaded,{chat:altered,world:'one'},{name:'失效'}),/来源已改变/);
});
