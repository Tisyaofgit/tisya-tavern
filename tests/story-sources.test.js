import test from 'node:test';
import assert from 'node:assert/strict';
import {sources,precedingUserSource} from '../tables/ledger.js';
import {storySources,assertStoryLedger} from '../tables/story-sources.js';
import {freezeCanonSnapshot,validateFrozenCanon} from '../tables/canon.js';
import {defaultRegistry} from '../tables/schema.js';
import {digest} from '../tables/books.js';
const chat=()=>[{is_user:true,mes:'去城门'},{mes:'检查资料',tool_calls:[{id:'a',name:'lookup',parameters:'{}'}]},{role:'tool',is_system:true,tool_call_id:'a',mes:'资料'},{mes:'他推开城门。'}];
const parser=rows=>[{type:'message',sourceIndex:0,message:rows[0]},{type:'tool-turn',sourceIndices:[1,2]},{type:'message',sourceIndex:3,message:rows[3]}];
test('story projection excludes operations but preserves exact existing keys, parent, index and physical floor',async()=>{
 const rows=chat(),raw=await sources(rows),before=structuredClone(rows),p=await storySources(rows,'normal',parser);
 assert.deepEqual(p.chain,[raw[0],raw[2]]);assert.deepEqual(p.operationalKeys,[raw[1].key]);assert.deepEqual(p.operationalFloors,[2]);assert.deepEqual(rows,before);
 assert.equal(precedingUserSource(p.chain,p.chain[1]).text,'去城门');
 const naive=await sources([rows[0],rows[3]]);assert.notEqual(naive[1].key,p.chain[1].key);
});
test('tool-derived old commits, context links and seed facts cause explicit migration stop, without mutation',async()=>{
 const p=await storySources(chat(),'normal',parser),key=p.operationalKeys[0];
 for(const session of [{commits:[{source:key}]},{commits:[{source:null,contextSource:key}]},{commits:[],branchSeed:{archivedSources:[key]}},{commits:[],branchSeed:{rows:[{source:key}]}}]){
  const before=structuredClone(session);assert.throws(()=>assertStoryLedger({bases:[]},session,p),/需先核对来源迁移/);assert.deepEqual(session,before);
 }
 assert.throws(()=>assertStoryLedger({bases:[{source:key}]},{commits:[]},p),/需先核对来源迁移/);
 assert.doesNotThrow(()=>assertStoryLedger({bases:[]},{commits:[{source:p.chain[1].key}]},p));
});
test('new frozen canon keeps full raw tool history but only story sources; legacy snapshots retain prior interpretation',async()=>{
 const rows=chat(),p=await storySources(rows,'normal',parser),registry=defaultRegistry();
 const origin={id:'origin',revision:1,registry,bases:[]},session={id:'session',revision:1,registry,schemaPinned:true,pins:[],commits:[]};
 const loaded={origin:{data:origin},session:{data:session},chain:p.chain,view:{registry,rows:[],anchors:[],commits:[],archived:new Set(),revision:1,last:null}};
 const anchor=await freezeCanonSnapshot(loaded,{chat:rows,world:'one',projectToolTurns:parser},{name:'原著'});
 assert.deepEqual(anchor.canon.snapshot.chat,rows);assert.deepEqual(anchor.canon.snapshot.chain,p.chain);assert.equal(anchor.canon.snapshot.sourcePolicy,'native-tool-turns/1');assert.equal((await validateFrozenCanon(anchor,{projectToolTurns:parser})).selectedSources,2);
 await assert.rejects(validateFrozenCanon(anchor),/工具历史解析接口不可用/);
 // Exact old format is still readable; do not reinterpret its signed source chain.
 const legacy=structuredClone(anchor);delete legacy.canon.snapshot.sourcePolicy;legacy.canon.snapshot.chain=await sources(rows);legacy.canon.coverage.unarchivedSources=legacy.canon.snapshot.chain.filter(s=>s.role==='assistant').map(({key,floor})=>({key,floor}));
 legacy.canon.sha256=await digest({...legacy,canon:{...legacy.canon,sha256:undefined}});
 assert.equal((await validateFrozenCanon(legacy)).selectedSources,3);
});
