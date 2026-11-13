import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {initializeState,materials} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {createMatrixHost} from '../engine/host.mjs';
import {baseline} from '../engine/config.mjs';
import {indexedStorage} from '../engine/controller.mjs';
import {IDBFactory} from 'fake-indexeddb';

test('both archive products reach actual host material macros after persistence and cold reopen',async()=>{
 const e=new Runtime(initializeState(catalog,{session_ref:'archive-projection',branch_ref:'main'}));
 e.newRecord('T_DYN_EVENTS',{short_code:'e1',title:'渡口交信',spine_digest:'已向渡口交付信件。'},'event-1');
 e.newRecord('T_DYN_STAGE_SUMMARIES',{name:'渡口阶段',summary_text:'送信已完成，船仍未到。',ongoing_impact:'等待下一班船。'},'summary-1');
 const ctx={chatId:'archive-projection',characterId:0,extensionSettings:{},chatMetadata:{},chat:[],saveChat:async()=>true,saveSettingsDebounced(){}};
 const options={getContext:()=>ctx,getSource:()=>baseline,loadCatalog:async()=>catalog,storage:indexedStorage(new IDBFactory()),persistSettings:async()=>true,persistMetadata:async()=>true};
 const host=createMatrixHost(options);await host.import({state:e.data});
 const cold=createMatrixHost(options);await cold.sync({preview:true});const slots=cold.latest().materials;
 assert.match(slots.tisya_material_memory_archive,/渡口交付信件/);
 assert.match(slots.tisya_material_memory_summary,/T_DYN_STAGE_SUMMARIES#summary-1.*送信已完成/);
 assert.doesNotMatch(slots.tisya_material_memory_archive,/送信已完成/);
 const character=materials(new Runtime(e.data),{...e.data.runtime.scope,subject_ref:'someone',audience:'character'});
 assert.doesNotMatch(JSON.stringify(character),/送信已完成|渡口交付信件/);
 assert.equal((await host.export()).state.tables.T_DYN_STAGE_SUMMARIES['summary-1'].values.summary_text,'送信已完成，船仍未到。');
});
