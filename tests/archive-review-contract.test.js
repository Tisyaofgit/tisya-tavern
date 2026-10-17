import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {AUX_TASKS,archiveInstructions} from '../tables/prompts.js';
import {prepareCompactFill,parseCompactFill} from '../tables/compact-fill.js';
import {defaultRegistry} from '../tables/schema.js';

test('archive review uses the prepared form and never re-enables model proposal contracts',()=>{
 const configuration={data:emptyConfig(),world:defaultWorld()},normal=pairedPreset({task:'tableArchive',configuration}),review=pairedPreset({task:'tableArchive',configuration,archiveProposal:true});
 const raw={archiveSource:{key:'floor-source',text:'甲把书交给乙。'},archiveRequestId:'untrusted-not-a-switch',toolInstructions:{archiveRequestId:'host-bound-request'},registry:defaultRegistry(),currentRows:[]};
 for(const preset of [normal,review])assert.throws(()=>taskMessages({preset,task:'tableArchive',input:raw}),/需要.*准备.*表格/);
 const plan=prepareCompactFill('tableArchive',raw),input={...raw,compactFill:{contract:plan.contract,modelInput:plan.modelInput,modelState:plan.modelState}};
 const rendered=p=>taskMessages({preset:p,task:'tableArchive',input}).map(m=>m.content).join('\n');
 const text=rendered(review);assert.equal(text,rendered(normal));assert(text.includes(raw.archiveSource.text));assert(text.includes(plan.modelInput));
 assert.doesNotMatch(text,/tisya_propose_archive_change|archiveRequestId|host-bound-request|untrusted-not-a-switch|schemaChanges|new:|expected:|strict JSON|MODE\.ANALYZE/);
 assert.match(text,/来源依据/);assert.match(text,/人物知情/);assert.equal(AUX_TASKS.tableArchive.instructions,archiveInstructions());
 const result=parseCompactFill(plan,'【完成】\n1 状态：完成\n2 待处理：无\n3 补读记录：无');assert.deepEqual(result.changes,[]);assert.equal(result.semantic,'pending-independent-review');
 assert.throws(()=>pairedPreset({task:'tableAssistant',configuration,archiveProposal:true}),/只能用于独立记忆归档/);
});
