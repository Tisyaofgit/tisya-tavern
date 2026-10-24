import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,seedPreferences} from './fixtures.mjs';
import {createSharedPreferenceService} from '../../../v3/runtime-source/preferences/shared-store.mjs';
import {createReviewService} from '../../../v3/review.mjs';
import {projectRetained} from '../../../v3/host-runtime.mjs';
const service=(f,{bank=f.p,bankId='preferences:player',chatId='chat',session=f.b}={})=>createSharedPreferenceService({sessionStorage:session,preferenceStorage:bank,preferenceBankId:bankId,getSessionOwner:()=>({chatId,branchId:'branch'}),getProjectionOptions:()=>({context:{chatId},activeSourceKeys:chatId==='chat'?f.owner().activeSourceKeys:[]})});
function tagged(f){seedPreferences(f);const s=f.b.get();s.preferenceDrafts[0].preferenceBankId='preferences:player';f.b.set(s);}
test('foreign player cannot list confirm batch-preview batch-confirm reject or edit another preference bank candidate',async()=>{
 const f=fixture(),other=fixture();tagged(f);const current=service(f),foreign=service(f,{bank:other.p,bankId:'preferences:other'}),preview=await current.previewBatch(['draft']),before=f.b.get();
 assert.equal((await foreign.list()).drafts.length,0);
 for(const run of [()=>foreign.confirm('draft'),()=>foreign.previewBatch(['draft']),()=>foreign.confirmBatch(['draft'],{operationId:'foreign-batch',fingerprints:preview.fingerprints}),()=>foreign.reject('draft')])await assert.rejects(run,/另一用户身份/);
 const review=createReviewService({storage:f.storage,getScope:f.owner,projectRetained,preferenceService:foreign});await assert.rejects(review.preference('preference/draft/'+encodeURIComponent(before.preferenceDrafts[0].changes[0].id),'edit',{values:{}}),/不存在/);
 assert.deepEqual(f.b.get(),before);assert.equal(other.p.writes(),0);await current.confirm('draft');assert.equal(f.p.get().preferenceRows.length,2);
});
test('legacy unknown candidates remain stored and are counted without being adopted by current player',async()=>{
 const f=fixture();seedPreferences(f);const before=f.b.get(),bound=service(f),read=await bound.list({includeDisabled:true});assert.equal(read.drafts.length,0);assert.equal(read.unresolvedDraftCount,1);await assert.rejects(bound.confirm('draft'),/缺少身份归属/);await assert.rejects(bound.reject('draft'),/缺少身份归属/);assert.deepEqual(f.b.get(),before);assert.equal(f.p.writes(),0);
});
test('legacy P receipts recover already confirmed ownership while another P cannot replay B accepted rows',async()=>{
 const f=fixture();seedPreferences(f);await f.preferences.confirm('draft');const owned=service(f),other=fixture(),foreign=service(f,{bank:other.p,bankId:'preferences:other'});assert.equal((await owned.list()).drafts.length,1);assert.equal((await foreign.list()).drafts.length,0);assert.equal((await owned.confirm('draft')).changed,false);assert.equal(f.p.writes(),1);await assert.rejects(foreign.confirm('draft'),/缺少身份归属/);assert.equal(other.p.writes(),0);
});
test('same player bank survives cross-chat reads and manual revision while local scope remains inactive',async()=>{
 const f=fixture();tagged(f);await service(f).confirm('draft');const bank=f.p.get(),row=bank.preferenceRows[0];await service(f).revise(row.id,{...row.values,作用域:{全局:true}},{reason:'跨聊天沿用',expectedRowRevision:row.rev,operationId:'global'});
 const empty=fixture(),otherChat=service(f,{chatId:'another-chat',session:empty.b});assert.equal((await otherChat.list()).rows.length,2);const projected=await otherChat.project();assert.equal(projected.groups.length,1);assert.equal(projected.groups[0].tag,'拉扯');assert.equal(projected.groups[0].net,2);
 const saved=(await otherChat.list()).rows.find(r=>r.id===row.id);await otherChat.revise(row.id,{...saved.values,赋分:5},{reason:'同身份跨聊天调整',expectedRowRevision:saved.rev,operationId:'cross-chat'});assert.equal((await service(f).project()).groups.find(g=>g.tag==='拉扯').net,5);assert.equal((await otherChat.project()).groups[0].net,5);
});
test('rejected candidate history stays with its preference identity',async()=>{
 const f=fixture(),other=fixture();tagged(f);await service(f).reject('draft',{reason:'不采用'});assert.equal((await service(f).list()).history.some(h=>h.action==='reject'),true);const foreign=service(f,{bank:other.p,bankId:'preferences:other'});assert.equal((await foreign.list()).history.length,0);assert.equal(f.b.get().preferenceReviewHistory.length,1);
});
