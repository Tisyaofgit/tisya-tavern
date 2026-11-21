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

function timelineSnapshot(){
 const data=snapshot(),e=new Runtime(data.state);
 e.newRecord('M_WORLD_TIME',{owner_table:'T_DYN_EVENTS',owner_row_uuid:'e',owner_field:'story_time',year:102,month:4,day:2,precision:'day',original_text:'景和二年四月初二',value_state:'known'},'time-e');
 e.set(['T_DYN_EVENTS','e','story_time',[]],'time-e');
 e.newRecord('T_DYN_EVENTS',{title:'雨后修桥',spine_digest:'阿青参与修桥，后来才有人受托交信。',story_time:'time-before'},'before');
 e.newRecord('M_WORLD_TIME',{owner_table:'T_DYN_EVENTS',owner_row_uuid:'before',owner_field:'story_time',year:101,month:9,day:3,precision:'day',original_text:'景和元年九月初三',value_state:'known'},'time-before');
 e.newRecord('T_DYN_EVENT_PARTICIPANTS',{event_ref:'before',entity_ref:'a',role:'participant'},'participant-before');
 e.newRecord('T_DYN_EVENT_LINKS',{event_ref:'before',target_event_ref:'e',edge_kind:'明确因果',connection_evidence:'修桥时建立的信任促成随后交信。'},'link-before-e');
 e.newRecord('T_DYN_EVENTS',{title:'隐密截信',spine_digest:'不得向读者披露的秘密事件。',lock_level:'L3',story_time:'time-secret'},'secret-event');
 e.record('T_DYN_EVENTS','secret-event').values.lock_level='D';
 e.newRecord('M_WORLD_TIME',{owner_table:'T_DYN_EVENTS',owner_row_uuid:'secret-event',owner_field:'story_time',year:100,value_state:'known'},'time-secret');
 e.newRecord('T_DYN_EVENT_PARTICIPANTS',{event_ref:'secret-event',entity_ref:'a',role:'witness'},'participant-secret');
 data.state=e.data;return data;
}

test('canonical atlas reads formal rows, links actual references and shows source paragraphs without changing data',()=>{
 const data=snapshot(),before=structuredClone(data),atlas=createMatrixAtlas(data),person=atlas.detail('T_SYS_ENTITIES#a');
 assert(atlas.list().items.some(r=>r.id==='T_DYN_STAGE_SUMMARIES#s'));
 assert(person.related.some(r=>r.id==='T_DYN_EVENTS#e'));
 assert(person.history.some(item=>item.field==='name'&&item.after==='阿青'&&item.readback==='阿青'),'field growth history reaches the readable atlas');
 assert.deepEqual(atlas.detail('T_DYN_EVENTS#e').record.values.正文来源,{回复:'m1',修订:2,段落:['P1']});
 assert.deepEqual(data,before);
 const reader=createMatrixAtlas(data,{scope:{...data.state.runtime.scope,audience:'reader'}});
 assert.equal(reader.list({query:'未公开'}).total,0);assert.throws(()=>reader.detail('T_CHAR_SECRETS#secret'),/不可读取/);
 const character=createMatrixAtlas(data,{scope:{...data.state.runtime.scope,audience:'character',subject_ref:'a'}});
 assert.equal(character.list({query:'已完成交信'}).total,0);assert.equal(character.timeline().total,0);
});

test('timeline automatically orders formal events, resolves participants and relations, and preserves visibility',()=>{
 const data=timelineSnapshot(),before=structuredClone(data),atlas=createMatrixAtlas(data),timeline=atlas.timeline();
 assert.deepEqual(timeline.items.map(item=>item.id),['T_DYN_EVENTS#secret-event','T_DYN_EVENTS#before','T_DYN_EVENTS#e']);
 const bridge=timeline.items.find(item=>item.id==='T_DYN_EVENTS#before');
 assert.equal(bridge.time.label,'景和元年九月初三');assert.equal(bridge.participants[0].name,'阿青');
 assert.equal(bridge.relations[0].kind,'明确因果');assert.equal(bridge.relations[0].target.id,'T_DYN_EVENTS#e');assert.match(bridge.relations[0].evidence,/修桥时/);
 assert.deepEqual(atlas.timeline({subject:'T_SYS_ENTITIES#a'}).items.map(item=>item.id),['T_DYN_EVENTS#secret-event','T_DYN_EVENTS#before','T_DYN_EVENTS#e']);
 const reader=createMatrixAtlas(data,{scope:{...data.state.runtime.scope,audience:'reader'}}),visible=reader.timeline({subject:'T_SYS_ENTITIES#a'});
 assert.deepEqual(visible.items.map(item=>item.id),['T_DYN_EVENTS#before','T_DYN_EVENTS#e']);assert(!JSON.stringify(visible).includes('隐密截信'));assert(!JSON.stringify(visible).includes('不得向读者披露'));
 assert.deepEqual(data,before,'timeline projection must remain read-only');
});

test('explicit event chronology orders otherwise undated events without inventing timestamps',()=>{
 const e=new Runtime(initializeState(catalog,{session_ref:'atlas-order'}));e.newRecord('T_DYN_EVENTS',{title:'结果'},'result');e.newRecord('T_DYN_EVENTS',{title:'起因'},'cause');e.newRecord('T_DYN_EVENT_LINKS',{event_ref:'cause',target_event_ref:'result',edge_kind:'前置',connection_evidence:'正式记录标明前置。'},'order');const data={state:e.data,revision:1},atlas=createMatrixAtlas(data),timeline=atlas.timeline();
 assert.deepEqual(timeline.items.map(item=>item.values?.名称??item.name),['起因','结果']);assert(timeline.items.every(item=>item.time.label==='时间未明'));
 e.newRecord('T_DYN_EVENT_LINKS',{event_ref:'result',target_event_ref:'cause',edge_kind:'时间先后'},'cycle');data.state=e.data;assert.equal(createMatrixAtlas(data).timeline().total,2,'conflicting cycles stay readable without infinite recursion');
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

test('shared UI combines search and categories, restores empty results, and changes layout',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const current=timelineSnapshot(),snap=await readMatrixAtlasSnapshot({read:async()=>structuredClone(current)}),ui=mountArchiveAtlas(root,snap.data,{beforeRead:snap.verify});
 const search=root.querySelector('[aria-label="搜索图鉴"]');search.value='阿青';search.dispatchEvent(new win.Event('input',{bubbles:true}));await ui.settled();
 assert(root.querySelector('[data-nav-key="record:T_SYS_ENTITIES#a"]'));assert(root.querySelector('[data-nav-key="record:T_DYN_EVENTS#e"]'));
 [...root.querySelectorAll('.filters button')].find(b=>b.textContent.startsWith('事件与记忆')).click();await ui.settled();
 assert(!root.querySelector('[data-nav-key="record:T_SYS_ENTITIES#a"]'));assert(root.querySelector('[data-nav-key="record:T_DYN_EVENTS#e"]'));
 search.value='绝不存在的关键词';search.dispatchEvent(new win.Event('input',{bubbles:true}));await ui.settled();assert(root.querySelector('.empty-search'));
 [...root.querySelectorAll('button')].find(b=>b.textContent==='清除搜索与分类').click();await ui.settled();assert(root.querySelector('[data-nav-key="record:T_SYS_ENTITIES#a"]'));assert.equal(ui.state().category,null);assert.equal(ui.state().query,'');
 [...root.querySelectorAll('.view-switch button')].find(b=>b.textContent==='网格').click();await ui.settled();assert(root.querySelector('.card-grid.grid'));
 ui.dispose();await win.happyDOM.close();
});

test('shared UI opens the automatic global timeline and follows formal event relations',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const current=timelineSnapshot(),snap=await readMatrixAtlasSnapshot({read:async()=>structuredClone(current)}),ui=mountArchiveAtlas(root,snap.data,{beforeRead:snap.verify});
 assert(!root.querySelector('[data-nav-key="record:T_DYN_EVENT_PARTICIPANTS#participant-before"]'));assert(!root.querySelector('[data-nav-key="record:T_DYN_EVENT_LINKS#link-before-e"]'));
 [...root.querySelectorAll('.navigation button')].find(b=>b.textContent==='时间线').click();await ui.settled();assert.equal(ui.state().page,'timeline');
 const events=[...root.querySelectorAll('.timeline-event')];assert(events.length>=3);assert(events[0].textContent.includes('隐密截信'));assert(events[1].textContent.includes('雨后修桥'));assert(events[2].textContent.includes('渡口交信'));assert.match(root.textContent,/修桥时建立的信任/);
 root.querySelector('[data-nav-key="record:T_DYN_EVENTS#before"]').click();await ui.settled();assert.equal(ui.state().selected,'T_DYN_EVENTS#before');assert.match(root.textContent,/雨后修桥/);
 ui.dispose();await win.happyDOM.close();
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

test('shared UI opens a requested archive detail directly without a collection detour',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const current=snapshot(),snap=await readMatrixAtlasSnapshot({read:async()=>structuredClone(current)});
 const ui=mountArchiveAtlas(root,snap.data,{beforeRead:snap.verify,initialSelected:'T_SYS_ENTITIES#a'});await ui.settled();
 assert.equal(ui.state().selected,'T_SYS_ENTITIES#a');assert(root.querySelector('.detail[aria-label="档案详情"]'));assert.match(root.querySelector('.detail-hero').textContent,/阿青/);assert.equal(root.querySelector('.collection'),null);
 ui.dispose();await win.happyDOM.close();
});

test('shared UI opens canonical entity history and stage summary by stable identity',async()=>{
 const win=new Window(),doc=win.document,root=doc.createElement('div');doc.body.append(root);const current=snapshot(),snap=await readMatrixAtlasSnapshot({read:async()=>structuredClone(current)});
 const ui=mountArchiveAtlas(root,snap.data,{beforeRead:snap.verify});
 assert.equal(root.querySelectorAll('[aria-label="资料层"]').length,0,'single-layer Matrix atlas does not show a redundant world selector');
 root.querySelector('[data-nav-key="record:T_SYS_ENTITIES#a"]').click();await ui.settled();
 [...root.querySelectorAll('button')].find(b=>b.textContent==='履历').click();await ui.settled();
 assert.match(root.textContent,/渡口交信/);root.querySelector('[aria-label="打开渡口交信"]').click();await ui.settled();assert.equal(ui.state().selected,'T_DYN_EVENTS#e');assert.match(root.textContent,/正文来源/);
 ui.dispose();await win.happyDOM.close();
});
