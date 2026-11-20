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
 e.newRecord('T_SYS_ENTITIES',{name:'阿白',kind:'character'},'b');
 e.newRecord('T_CHAR_DOSSIER',{name:'阿青',core_personality_tags:['atom','object-atom']},'d');
 e.newRecord('M_LIST_VALUES',{owner_table:'T_CHAR_DOSSIER',owner_row_uuid:'d',owner_field:'core_personality_tags',sequence:0,item_type:'text',text_value:'外冷内热',narrative:'对陌生人保留距离，对认可的人直接维护。'},'atom');
 e.newRecord('M_LIST_VALUES',{owner_table:'T_CHAR_DOSSIER',owner_row_uuid:'d',owner_field:'core_personality_tags',sequence:1,item_type:'reference',target_table:'T_SYS_ENTITIES',target_row_uuid:'b',narrative:'把阿白视作重要关联对象。'},'object-atom');
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

test('atlas projects list atoms as readable meanings and resolves object atoms to their real targets',()=>{
 const data=snapshot(),before=structuredClone(data),atlas=createMatrixAtlas(data),detail=atlas.detail('T_CHAR_DOSSIER#d');
 assert.deepEqual(detail.references.filter(r=>r.path[0]==='性格核心标签').map(r=>({name:r.target.name,id:r.target.id})),[
  {name:'外冷内热',id:'M_LIST_VALUES#atom'},{name:'阿白',id:'T_SYS_ENTITIES#b'}
 ]);
 const atom=atlas.detail('M_LIST_VALUES#atom');assert.equal(atom.record.values.名称,'外冷内热');assert.match(atom.record.values.本项说明,/对陌生人/);
 assert(!Object.keys(atom.record.values).some(key=>/owner_|target_|row_uuid|source_entry|record_id/.test(key)));
 assert(!JSON.stringify(atom.sections).includes('object-atom'));assert(!atlas.list().items.some(item=>item.id==='M_LIST_VALUES#atom'));
 assert.deepEqual(data,before,'readable projection must not mutate canonical machine coordinates');
});

test('actual table-service atlas selects the shared database without requiring legacy worldbooks',async()=>{
 let current=snapshot(),subscribed=null;
 const service=createTableService({store:{read:()=>({key:'atlas',world:{}})},getContext:()=>({chatId:'atlas'}),request:()=>{throw Error('no model call');},books:{read(){throw Error('must not read old ledger');}},matrixDatabase:{read:async()=>structuredClone(current),commit(){throw Error('atlas must stay read only');}},matrixHost:{subscribe(fn){subscribed=fn;return ()=>{subscribed=null;};}}});
 let notified=0;const off=service.subscribeArchive(()=>notified++);subscribed();assert.equal(notified,1);off();assert.equal(subscribed,null);
 const view=await service.readAtlasSnapshot();assert(view.data.matrix);assert(view.data.matrixAtlas.list().total>0);await view.verify();
 current.state.tables.T_DYN_EVENTS.e.values.title='同修订的另一候选';await assert.rejects(view.verify(),/档案已变化/);
 current=snapshot();const other=await service.readAtlasSnapshot();current.contextKey='another';await assert.rejects(other.verify(),/会话或档案/);
});

test('shared UI exposes field meanings and readable atom navigation without machine keys',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const current=snapshot(),snap=await readMatrixAtlasSnapshot({read:async()=>structuredClone(current)});
 const ui=mountArchiveAtlas(root,snap.data,{beforeRead:snap.verify});
 root.querySelector('[data-nav-key="record:T_CHAR_DOSSIER#d"]').click();await ui.settled();
 [...root.querySelectorAll('button')].find(b=>b.textContent==='档案').click();await ui.settled();
 assert(root.querySelector('[aria-label="打开外冷内热"]'));assert(root.querySelector('[aria-label="打开阿白"]'));
 assert(!root.textContent.includes('列表原子与关联'));assert(!root.textContent.includes('object-atom'));
 root.querySelector('[aria-label="查看字段含义：性格核心标签"]').click();await ui.settled();assert.match(root.textContent,/少量有依据的性格辨识词/);
 root.querySelector('[aria-label="打开外冷内热"]').click();await ui.settled();assert.equal(ui.state().selected,'M_LIST_VALUES#atom');assert.match(root.textContent,/对陌生人保留距离/);assert.doesNotMatch(root.textContent,/owner_table|target_row_uuid|core_personality_tags/);
 ui.dispose();await win.happyDOM.close();
});

test('shared UI opens canonical entity history and stage summary by stable identity',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const current=snapshot(),snap=await readMatrixAtlasSnapshot({read:async()=>structuredClone(current)});
 const ui=mountArchiveAtlas(root,snap.data,{beforeRead:snap.verify});
 assert.equal(root.querySelectorAll('[aria-label="资料层"] option').length,1);
 root.querySelector('[data-nav-key="record:T_SYS_ENTITIES#a"]').click();await ui.settled();
 [...root.querySelectorAll('button')].find(b=>b.textContent==='履历').click();await ui.settled();
 assert.match(root.textContent,/渡口交信/);root.querySelector('[aria-label="打开渡口交信"]').click();await ui.settled();assert.equal(ui.state().selected,'T_DYN_EVENTS#e');assert.match(root.textContent,/正文来源/);
 ui.dispose();await win.happyDOM.close();
});
