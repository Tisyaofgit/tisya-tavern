import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {Runtime} from '../engine/runtime.mjs';
import {initializeState} from '../engine/materials.mjs';
import {prepareMatrixSheets,acceptMatrixSheets} from '../tables/foundation/engine.js';
import {describeReviewForms} from '../engine/review-form-document.mjs';
import {REPLY_FORM_OWNERSHIP_VERSION,replyFormDecoding} from '../engine/reply-form-ownership.mjs';
const PRE_STATE_PATCH_VERSION='tisya.reply-form-ownership/6';

function fixture(){
 const e=new Runtime(initializeState(catalog));
 for(const [id,name]of [['a','甲'],['b','乙'],['c','丙']])e.newRecord('T_SYS_ENTITIES',{name,kind:'character'},id);
 for(const [id,entity_id]of [['sa','a'],['sb','b'],['sc','c']])e.newRecord('T_DYN_ENTITY_STATE',{name:'即时外观',entity_id,live_appearance:'旧值'},id);
 return e;
}
function context(e,version=REPLY_FORM_OWNERSHIP_VERSION){return prepareMatrixSheets({state:e.data},{...replyFormDecoding(version),operationId:'state-heading-test',task:'main',mode:'revise'});}
function compile(e,text,version=REPLY_FORM_OWNERSHIP_VERSION){return acceptMatrixSheets(context(e,version),{state:e.data},{blocks:{cells:text},collectErrors:true});}
function patch(heading,owner='甲',value='新值'){return '【'+heading+'】\n4{'+owner+'}\n5{'+value+'}';}

test('live state references use their owner identity and full headings patch the canonical row',()=>{
 const e=fixture(),c=context(e),refs=c.references.filter(r=>r.tableId==='T_DYN_ENTITY_STATE');
 assert.deepEqual(refs.map(r=>r.display),['实时状态值／已有：甲〔1〕','实时状态值／已有：乙〔1〕','实时状态值／已有：丙〔1〕']);
 assert.deepEqual(refs.map(r=>r.legacyDisplay),['实时状态值／已有：即时外观〔1〕','实时状态值／已有：即时外观〔2〕','实时状态值／已有：即时外观〔3〕']);
 const text=['甲','乙','丙'].map(name=>patch('实时状态值／已有：'+name+'〔1〕',name,name+'的新外观')).join('\n'),accepted=compile(e,text);
 assert.deepEqual(accepted.proposal.matrix.changes.filter(r=>r.tableId==='T_DYN_ENTITY_STATE').map(r=>r.recordId).sort(),['sa','sb','sc']);
 for(const change of accepted.proposal.matrix.changes.filter(r=>r.tableId==='T_DYN_ENTITY_STATE'))assert.equal(change.values.name,undefined);
});

test('legacy state-name headings and the pre-state-patch decoder remain readable',()=>{
 const e=fixture(),text=['甲','乙','丙'].map((name,index)=>patch('实时状态值／已有：即时外观〔'+(index+1)+'〕',name,name+'兼容')).join('\n');
 assert.equal(compile(e,text).proposal.matrix.changes.filter(r=>r.tableId==='T_DYN_ENTITY_STATE').length,3);
 const previous=compile(e,patch('实时状态值／已有：甲〔1〕','甲','旧协议'),PRE_STATE_PATCH_VERSION);
 assert.equal(previous.proposal.matrix.changes.find(r=>r.tableId==='T_DYN_ENTITY_STATE').recordId,'sa');
});

test('numbered live states with an explicit owner continue existing rows instead of duplicating them',()=>{
 const e=fixture(),text=['甲','乙','丙'].map((name,index)=>'【实时状态值／'+(index+1)+'】\n3{即时外观}\n4{'+name+'}\n5{'+name+'续写}').join('\n'),accepted=compile(e,text),changes=accepted.proposal.matrix.changes.filter(r=>r.tableId==='T_DYN_ENTITY_STATE');
 assert.deepEqual(changes.map(r=>r.recordId).sort(),['sa','sb','sc']);
 assert.deepEqual(changes.map(r=>r.values.live_appearance).sort(),['丙续写','甲续写','乙续写'].sort());
 for(const change of changes)assert.equal(change.values.name,'即时外观');
});

test('state heading resolution stays inside record visibility and preserves review bindings',()=>{
 const e=fixture();e.data.tables.T_DYN_ENTITY_STATE.sb.values.lock_level='D';
 const c=prepareMatrixSheets({state:e.data},{...replyFormDecoding(REPLY_FORM_OWNERSHIP_VERSION),operationId:'state-heading-test',task:'main',mode:'revise',scope:{audience:'reader'}});
 assert(!c.references.some(r=>r.tableId==='T_DYN_ENTITY_STATE'&&r.recordId==='sb'));
 assert.throws(()=>acceptMatrixSheets(c,{state:e.data},{blocks:{cells:patch('实时状态值／已有：乙〔1〕','乙')}}),/表单标题/);
 const model=describeReviewForms(e.data,{cells:patch('实时状态值／已有：甲〔1〕','甲','审阅更新')}).cells;
 assert.equal(model.groups[0].recordId,'sa');assert.equal(model.groups[0].rows[1].value,'审阅更新');
});
