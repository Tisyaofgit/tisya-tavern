import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultRegistry} from '../tables/schema.js';
import {project,retrieval} from '../tables/ledger.js';
import {snapshotAnchor,branchSeed} from '../tables/branches.js';
const row=(id,table,values,rev=1)=>({id,table,rev,values,access:{readers:['读者'],knowers:[]},source:null});
function fixture(){
 const registry=defaultRegistry(),early=row('early','objects',{名称:'少年岚',类型:'character',描述:'尚未离乡'}),late=row('late','objects',{名称:'未来的澄',类型:'character',描述:'终局才相识'}),scene=row('scene','scene',{名称:'村口',参与者:['early']}),event=row('meeting','events',{名称:'日后相遇',经过:'岚多年后认识澄',参与者:['early','late']});
 const commits=[{id:'c1',source:'s1',changes:[{id:'scene',before:null,after:scene}],anchors:[]},{id:'c2',source:'s2',changes:[{id:'late',before:null,after:late,origin:'late@1'},{id:'meeting',before:null,after:event}],anchors:[]}];
 const origin={registry,bases:[early,late]},session={id:'old',revision:2,registry,pins:['early@1','late@1'],commits},chain=[{key:'s1'},{key:'s2'}];
 return {origin:{data:origin},session:{data:session},chain,view:project(origin,session,chain.map(x=>x.key))};
}
test('future node actors remain reference assets through snapshot, reload, branch and current retrieval',()=>{
 const loaded=fixture(),before=structuredClone(loaded),anchor=snapshotAnchor(loaded,{name:'离乡之前',cut:'c1'});
 assert.equal(anchor.nodes.length,1);assert(!anchor.rows.some(r=>r.id==='late'));assert(anchor.referenceRows.some(r=>r.id==='late'));assert(!anchor.rows.some(r=>r.id==='meeting'));
 const seed=branchSeed(JSON.parse(JSON.stringify(anchor))),session={...loaded.session.data,pins:[],commits:[],branchSeed:seed},view=project(loaded.origin.data,session,[]);
 assert(!view.rows.some(r=>r.id==='late'));assert.equal(retrieval(view,{query:'未来的澄',topK:100}).optional.some(r=>r.id==='late'),false);
 assert.deepEqual(loaded,before);assert.equal(anchor.rows.find(r=>r.id==='early').values.描述,'尚未离乡');
 const nested=snapshotAnchor({...loaded,session:{data:session},view,chain:[]},{name:'平行线再冻结'});assert.equal(nested.nodes.length,1);assert(!nested.rows.some(r=>r.id==='late'));
});
test('future asset reference closure is isolated and does not overwrite an earlier actor version',()=>{
 const loaded=fixture(),earlier=loaded.origin.data.bases[0],future=structuredClone(earlier);future.rev=2;future.values.描述='多年后成为老师';loaded.origin.data.bases.push(future);
 const late=loaded.origin.data.bases.find(r=>r.id==='late');late.values.描述='认识多年后的岚';
 const anchor=snapshotAnchor(loaded,{name:'旧时',cut:'c1'});assert.equal(anchor.rows.find(r=>r.id==='early').values.描述,'尚未离乡');assert(!anchor.referenceRows.some(r=>r.id==='early'));
 const broken=structuredClone(anchor);broken.referenceRows=[];assert.throws(()=>branchSeed(broken),/蓝本参与者/);
});
test('floor-bounded snapshots exclude out-of-order later sources instead of selecting by last commit alone',()=>{
 const loaded=fixture();loaded.session.data.commits.reverse();loaded.view=project(loaded.origin.data,loaded.session.data,['s1','s2']);
 const anchor=snapshotAnchor(loaded,{name:'第一楼',cut:'c1',sourceKeys:['s1']});assert(!anchor.rows.some(r=>r.id==='late'));assert(!anchor.rows.some(r=>r.id==='meeting'));assert.deepEqual(anchor.archivedSources,[]);
});
