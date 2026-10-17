import test from 'node:test';
import assert from 'node:assert/strict';
import {TASK_MATERIALS,selectTaskMaterials} from '../tables/task-materials.js';
import {taskRegistry} from '../tables/task-registry.js';
import {archivalText} from '../tables/ledger.js';
const raw='<reply><body>门开了。</body><next>AUDIT_ONLY</next><extra>AUTHOR_ONLY</extra><status>STATUS_ONLY</status><memory>SUMMARY_ONLY</memory></reply>';
test('every registered task declares its material selection and archive never receives auxiliary blocks',()=>{
 for(const d of taskRegistry.definitions)assert(d.materials,d.task);
 const input={sourceCardRaw:{fields:{description:'CARD_ONLY'}},sourceBooks:[{content:'BOOK_ONLY'}],sourceHistory:[{role:'assistant',text:raw},{role:'user',text:'USER_ONLY'}],archiveSource:{key:'stable-original-hash',text:raw},styleRules:[{pattern:'原句禁词'}],nativeState:{value:0},eventResults:[{value:false}]},before=structuredClone(input);
 for(const task of ['tableArchive','historyImport','objectArchive']){const result=selectTaskMaterials(TASK_MATERIALS[task],input),text=JSON.stringify(result);assert.equal(result.archiveSource.text,'门开了。');assert.equal(result.archiveSource.key,'stable-original-hash');assert.doesNotMatch(text,/AUDIT_ONLY|AUTHOR_ONLY|STATUS_ONLY|SUMMARY_ONLY|原句禁词/);assert.deepEqual(result.eventResults,[{value:false}]);}
 assert.deepEqual(input,before);
 const preference=selectTaskMaterials(TASK_MATERIALS.preferenceAnalysis,input);assert.deepEqual(preference.sourceHistory,[{role:'user',text:'USER_ONLY'}]);assert.equal(preference.archiveSource,undefined);assert.equal(preference.sourceCardRaw,undefined);
 const native=selectTaskMaterials(TASK_MATERIALS.nativeFill,input);assert.deepEqual(native.nativeState,{value:0});assert.equal(native.sourceHistory,undefined);assert.equal(native.sourceBooks,undefined);
 const init=selectTaskMaterials(TASK_MATERIALS.templateInit,input);assert.equal(init.sourceCardRaw.fields.description,'CARD_ONLY');assert.equal(init.sourceHistory[0].text,'门开了。');
});
test('malformed structured replies never fall back to whole-reply evidence',()=>{
 for(const text of ['<reply><extra>非剧情</extra></reply>','<reply><body>截断','<reply><body>一</body><body>二</body></reply>'])assert.throws(()=>archivalText(text),/唯一完整正文区/);
});
