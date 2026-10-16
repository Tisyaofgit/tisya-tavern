import {storySources,assertStoryLedger} from './story-sources.js';
import {check,copy,sameDefinition} from './schema.js';
import {digest} from './books.js';
import {sources,project} from './ledger.js';
import {snapshotAnchor,branchSeed} from './branches.js';

const FORMAT='tisya.frozen-canon/1';
const signature=anchor=>digest({...anchor,canon:{...anchor.canon,sha256:undefined}});
const coverage=(chain,view)=>({
 archivedSources:chain.filter(s=>view.archived.has(s.key)).map(s=>s.key),
 unarchivedSources:chain.filter(s=>s.role==='assistant'&&!view.archived.has(s.key)).map(s=>({key:s.key,floor:s.floor})),
});

// A canon is an immutable reference, not a second editable current-state ledger.
// Its raw chat includes discarded candidates and non-story messages for fidelity;
// only the separately frozen selected chain can be considered narrative evidence.
export async function freezeCanonSnapshot(loaded,{chat,world,projectToolTurns},options){
 const originalChat=copy(chat),projection=await storySources(originalChat,'normal',projectToolTurns),chain=projection.chain;
 assertStoryLedger(loaded.origin.data,loaded.session.data,projection);
 check(sameDefinition(chain,loaded.chain),'冻结时聊天来源已改变，请重新载入');
 const anchor=snapshotAnchor(loaded,options),origin=loaded.origin.data;
 const snapshot={sourcePolicy:'native-tool-turns/1',world,chat:originalChat,chain:copy(chain),origin:{id:origin.id,revision:origin.revision,registry:copy(origin.registry),bases:copy(origin.bases)},session:copy(loaded.session.data)};
 const view=project(snapshot.origin,snapshot.session,chain.map(s=>s.key));
 anchor.canon={format:FORMAT,snapshot,coverage:coverage(chain,view)};
 anchor.canon.sha256=await signature(anchor);
 await validateFrozenCanon(anchor,{projectToolTurns});
 return anchor;
}

export async function validateFrozenCanon(input,{projectToolTurns}={}){
 const anchor=copy(input),canon=anchor?.canon;
 check(canon?.format===FORMAT&&typeof canon.sha256==='string','此时间锚没有完整原著冻结记录');
 check(await signature(anchor)===canon.sha256,'原著冻结内容校验不一致，未使用该版本');
 const snapshot=canon.snapshot;
 check(snapshot&&typeof snapshot.world==='string'&&Array.isArray(snapshot.chat)&&Array.isArray(snapshot.chain),'原著来源记录不完整');
 check(anchor.sourceSession===snapshot.session?.id,'原著与源会话版本不一致');
 check(snapshot.sourcePolicy===undefined||snapshot.sourcePolicy==='native-tool-turns/1','原著来源策略不受支持');
 const projection=snapshot.sourcePolicy?await storySources(snapshot.chat,'normal',projectToolTurns):{chain:await sources(snapshot.chat),operationalKeys:[]},chain=projection.chain;
 assertStoryLedger(snapshot.origin,snapshot.session,projection);
 // Keep old signed chains readable as recorded, but a host with a native
 // parser must still reject their known tool-derived facts before reuse.
 if(!snapshot.sourcePolicy&&projectToolTurns)assertStoryLedger(snapshot.origin,snapshot.session,await storySources(snapshot.chat,'normal',projectToolTurns));
 check(sameDefinition(chain,snapshot.chain),'原著原文与来源链不一致');
 const view=project(snapshot.origin,snapshot.session,chain.map(s=>s.key));
 check(sameDefinition(coverage(chain,view),canon.coverage),'原著归档边界不一致');
 // Recompute the selected commit boundary using frozen versions, never live books.
 const rebuilt=snapshotAnchor({origin:{data:snapshot.origin},session:{data:snapshot.session},chain,view},{name:anchor.name,cut:anchor.sourceCommit??'start',nodes:anchor.nodes});
 for(const key of ['rows','referenceRows','archivedSources','worldTime','registry'])check(sameDefinition(rebuilt[key],anchor[key]),'原著起点与冻结版本不一致：'+key);
 branchSeed(anchor);
 return {messages:snapshot.chat.length,selectedSources:chain.length,archivedSources:canon.coverage.archivedSources.length,unarchivedSources:copy(canon.coverage.unarchivedSources),sourceSession:snapshot.session.id,sourceRevision:snapshot.session.revision,sha256:canon.sha256};
}
