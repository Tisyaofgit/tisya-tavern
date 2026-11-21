import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {readFieldHistory,historySummary} from '../engine/field-history.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
const make=()=>new Runtime(initializeState(catalog,{session_ref:'history-test',branch_ref:'main'}));

test('narrative revision contract requires a complete merged current value',()=>{
 const e=make(),context=prepareMatrixSheets({state:e.data},{kind:'rows',task:'main',mode:'revise',operationId:'contract'});
 assert.match(context.instructions,/合并后的完整当前值/);assert.match(context.instructions,/仍有效的发色、瞳色/);assert.match(context.instructions,/只有正文明确否定、替换、移除或时效结束时才删去/);
});

test('an enriched narrative field remains complete in the next model material and has old/new history',()=>{
 const e=make();e.newRecord('M_WORLD_TIME',{owner_table:'T_DYN_EVENTS',owner_row_uuid:'event',owner_field:'story_time',original_text:'雨后黄昏',value_state:'known'},'time-1');e.newRecord('T_DYN_EVENTS',{title:'外貌续写',spine_digest:'新发垂落。',story_time:'time-1'},'event');e.data.runtime.scope.story_time='time-1';
 e.transaction('appearance:create',{source:{kind:'narrative',reason:'初始外貌',eventRef:'event',storyTime:'time-1'}},()=>e.newRecord('T_CHAR_DOSSIER',{name:'青禾',overall_physique:'黑发黑眼'},'person'));
 const next='黑发黑眼；长发及腰，丹凤眼眼角上弯',receipt=e.transaction('appearance:extend',{source:{kind:'narrative',reason:'补充发型与眼形',eventRef:'event',storyTime:'time-1'}},()=>e.set(['T_CHAR_DOSSIER','person','overall_physique',[]],next));
 assert.equal(receipt.status,'COMMITTED');const history=readFieldHistory(e.data,{tableId:'T_CHAR_DOSSIER',recordId:'person',field:'overall_physique'});assert.equal(history.length,2);
 assert.equal(history[0].beforeState,'unset');assert.equal(history[0].after,'黑发黑眼');assert.equal(history[1].before,'黑发黑眼');assert.equal(history[1].after,next);assert.equal(history[1].readback,next);assert.equal(history[1].storyTime,'time-1');assert.equal(history[1].eventRef,'event');assert.equal(history[1].operationId,'appearance:extend');assert.equal(history[1].afterRevision,String(receipt.revision));
 const projected=materials(new Runtime(e.data),{...e.data.runtime.scope,narrativeReading:true});assert.match(projected.tisya_material_character_archives,/黑发黑眼；长发及腰，丹凤眼眼角上弯/);
 assert.deepEqual(historySummary(e.data,{tableId:'T_CHAR_DOSSIER',recordId:'person'}).fieldCount,2);
});

test('history replay is idempotent and a failed transaction leaves no committed candidate',()=>{
 const e=make();e.newRecord('T_CHAR_DOSSIER',{name:'青禾',overall_physique:'黑发黑眼'},'person');
 const receipt=e.transaction('appearance:once',{source:{kind:'narrative'}},()=>e.set(['T_CHAR_DOSSIER','person','overall_physique',[]],'黑发黑眼，长发及腰'));assert.equal(receipt.status,'COMMITTED');const committed=JSON.stringify(e.data.tables.T_SYS_CHANGE_LOG);
 const replay=e.transaction('appearance:once',{source:{kind:'narrative'}},()=>{throw Error('replay must not execute');});assert.equal(replay.status,'REPLAY');assert.equal(JSON.stringify(e.data.tables.T_SYS_CHANGE_LOG),committed);
 const failed=e.transaction('appearance:failed',{source:{kind:'narrative'}},()=>{e.set(['T_CHAR_DOSSIER','person','overall_physique',[]],'不应落账');throw Error('rollback');});assert.equal(failed.status,'FAILED');assert.equal(JSON.stringify(e.data.tables.T_SYS_CHANGE_LOG),committed);assert.equal(e.rows('T_CHAR_DOSSIER').person.values.overall_physique,'黑发黑眼，长发及腰');
});

test('formula recalculation and tag expiry use the same field history service',()=>{
 const e=make();e.data.runtime.calendar={mode:'MONTH_FIXED',year:1,month:1,day:1};
 e.registerTable('X_HISTORY_PROBE',[{key:'base',label:'输入',type:'NUMBER'},{key:'total',label:'派生值',type:'NUMBER'},{key:'tags',label:'状态',type:'TAGS'}]);
 e.newRecord('X_HISTORY_PROBE',{base:3,tags:[{name:'雨夜',duration:30}]},'probe');e.record('X_HISTORY_PROBE','probe').formulas.total="GET('X_HISTORY_PROBE#probe.base')*2";
 e.transaction('history:derive',{},()=>assert.equal(e.get(['X_HISTORY_PROBE','probe','total',[]]),6));
 e.transaction('history:expire',{},()=>e.tick(30));
 const derived=readFieldHistory(e.data,{tableId:'X_HISTORY_PROBE',recordId:'probe',field:'total'}),tags=readFieldHistory(e.data,{tableId:'X_HISTORY_PROBE',recordId:'probe',field:'tags'});
 assert.equal(derived.at(-1).before,null);assert.equal(derived.at(-1).after,6);assert.equal(derived.at(-1).afterState,'derived');assert.deepEqual(tags.at(-1).after,[]);
});
