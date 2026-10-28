import test from 'node:test';
import assert from 'node:assert/strict';
import {coreStageView} from '../tables/core-stages.js';
import {defaultRegistry} from '../tables/schema.js';
const row=(id,description)=>({id,table:'objects',rev:1,source:'old-source',values:{名称:id,类型:'character',描述:description},access:{readers:['读者'],knowers:[]}});
test('life-stage selection keeps historical source evidence and excludes future-only reference actors',()=>{
 const registry=defaultRegistry(),past=row('person','早期'),future=row('future','未来参照');
 const anchor={id:'early',version:1,name:'早期',sourceSession:'source-session',sourceCommit:'old-commit',worldTime:'清晨',registry,rows:[past],referenceRows:[future],nodes:[{id:'node',name:'未来相遇',summary:'可能遇见',condition:'条件成立',kind:'个人',actors:['future']}]};
 const loaded={view:{registry,rows:[row('person','后来')]},origin:{data:{timelineAnchors:[anchor]}}},before=structuredClone(loaded);
 const x=coreStageView(loaded,'early');assert.equal(x.view.rows[0].values.描述,'早期');assert.equal(x.view.rows[0].source,'old-source');assert.equal(x.view.rows.length,1);assert.equal(x.stage.sourceCommit,'old-commit');
 x.view.rows[0].values.描述='编辑草稿';assert.deepEqual(loaded,before);
 assert.equal(coreStageView(loaded).view,loaded.view);assert.throws(()=>coreStageView(loaded,'missing'),/不存在/);
});
