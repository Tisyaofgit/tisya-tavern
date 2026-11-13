import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import catalog from '../engine/catalog.json' with {type:'json'};
import {initializeState} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixAtlas,readMatrixAtlasSnapshot} from '../tables/matrix-atlas.js';
import {mountArchiveAtlas} from '../tables/atlas-ui.js';
import {createTableService} from '../tables/service.js';

function snapshot(){
 const e=new Runtime(initializeState(catalog,{session_ref:'atlas',branch_ref:'main'}));
 e.newRecord('T_SYS_ENTITIES',{name:'阿青',kind:'character'},'a');
 e.newRecord('T_DYN_EVENTS',{title:'渡口交信',spine_digest:'阿青交付信件。'},'e');
 e.newRecord('T_DYN_EVENT_PARTICIPANTS',{event_ref:'e',entity_ref:'a',role:'witness',then_understanding:'看见了信。'},'p');
 e.newRecord('T_DYN_STAGE_SUMMARIES',{name:'送信阶段',summary_text:'已完成交信。'},'s');
 e.newRecord('T_CHAR_SECRETS',{name:'秘密',char_ref:'a',fact_proposition:'未公开的事实。'},'secret');
 e.record('T_DYN_EVENTS','e').metadata.archive_source={entry_id:'m1',revision:2,paragraphs:['P1']};
 return {state:e.data,revision:4,contextKey:'atlas'};
}

test('canonical atlas reads formal rows, links actual references and shows source paragraphs without changing data',()=>{
 const data=snapshot(),before=structuredClone(data),atlas=createMatrixAtlas(data),person=atlas.detail('T_SYS_ENTITIES#a');
 assert(atlas.list().items.some(r=>r.id==='T_DYN_STAGE_SUMMARIES#s'));
 assert(person.related.some(r=>r.id==='T_DYN_EVENTS#e'));
 assert.deepEqual(atlas.detail('T_DYN_EVENTS#e').record.values.正文来源,{回复:'m1',修订:2,段落:['P1']});
 assert.deepEqual(data,before);
 const reader=createMatrixAtlas(data,{scope:{...data.state.runtime.scope,audience:'reader'}});
 assert.equal(reader.list({query:'未公开'}).total,0);assert.throws(()=>reader.detail('T_CHAR_SECRETS#secret'),/不可读取/);
 const character=createMatrixAtlas(data,{scope:{...data.state.runtime.scope,audience:'character',subject_ref:'a'}});
 assert.equal(character.list({query:'已完成交信'}).total,0);
});

test('actual table-service atlas selects the shared database without requiring legacy worldbooks',async()=>{
 let current=snapshot(),subscribed=null;
 const service=createTableService({store:{read:()=>({key:'atlas',world:{}})},getContext:()=>({chatId:'atlas'}),request:()=>{throw Error('no model call');},books:{read(){throw Error('must not read old ledger');}},matrixDatabase:{read:async()=>structuredClone(current),commit(){throw Error('atlas must stay read only');}},matrixHost:{subscribe(fn){subscribed=fn;return ()=>{subscribed=null;};}}});
 let notified=0;const off=service.subscribeArchive(()=>notified++);subscribed();assert.equal(notified,1);off();assert.equal(subscribed,null);
 const view=await service.readAtlasSnapshot();assert(view.data.matrix);assert(view.data.matrixAtlas.list().total>0);await view.verify();
 current.state.tables.T_DYN_EVENTS.e.values.title='同修订的另一候选';await assert.rejects(view.verify(),/档案已变化/);
 current=snapshot();const other=await service.readAtlasSnapshot();current.contextKey='another';await assert.rejects(other.verify(),/会话或档案/);
});

test('shared UI opens canonical entity history and stage summary by stable identity',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const current=snapshot(),snap=await readMatrixAtlasSnapshot({read:async()=>structuredClone(current)});
 const ui=mountArchiveAtlas(root,snap.data,{beforeRead:snap.verify});
 assert.equal(root.querySelectorAll('[aria-label="资料层"] option').length,1);
 root.querySelector('[aria-label="打开阿青"]').click();await ui.settled();
 [...root.querySelectorAll('button')].find(b=>b.textContent==='履历').click();await ui.settled();
 assert.match(root.textContent,/渡口交信/);root.querySelector('[aria-label="打开渡口交信"]').click();await ui.settled();assert.equal(ui.state().selected,'T_DYN_EVENTS#e');assert.match(root.textContent,/正文来源/);
 ui.dispose();await win.happyDOM.close();
});
