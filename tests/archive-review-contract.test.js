import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyConfig,defaultWorld} from '../config/core.js';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {AUX_TASKS,archiveInstructions} from '../tables/prompts.js';
import {taskProfile} from '../tables/task-profiles.js';

test('host-selected archive review compiles one compatible contract without altering ordinary tasks',()=>{
 const configuration={data:emptyConfig(),world:defaultWorld()},normal=pairedPreset({task:'tableArchive',configuration});
 const review=pairedPreset({task:'tableArchive',configuration,archiveProposal:true});
 const input={archiveSource:{key:'floor-source',text:'甲把书交给乙。'},archiveRequestId:'untrusted-not-a-switch',toolInstructions:{archiveRequestId:'host-bound-request'},registry:{tables:[],types:[]},currentRows:[]};
 const rendered=p=>taskMessages({preset:p,task:'tableArchive',input}).map(m=>m.content).join('\n');
 const text=rendered(review);assert.match(text,/tisya_propose_archive_change/);assert.match(text,/access and lockedFields/);assert.match(text,/compatible explicit templates\/schemaChanges may be proposed/);assert.match(text,/evidence/);assert.match(text,/Before the FIRST proposal/);assert.match(text,/compatible explicit optional ref\/refs/);assert.match(text,/actual current source order and lockedFields/);assert.match(text,/"changes":\[\],"archiveRequestId"/);
 assert.doesNotMatch(text,/needsRows|this review cannot change their definitions|never new schema|never hide the ID in prose or invent schema|This review cannot extend|pending输出|blocking gaps stay pending|emit schema deltas/);
 assert.match(rendered(normal),/needsRows/);assert.match(rendered(normal),/schemaChanges/);assert.equal(AUX_TASKS.tableArchive.instructions,archiveInstructions());
 for(const id of ['tisya_new_chat','main','tisya_identity_attestation','tisya_user_relation','tisya_prepare_trigger'])assert.equal(review.entries[id],normal.entries[id]);
 assert.throws(()=>pairedPreset({task:'tableAssistant',configuration,archiveProposal:true}),/只能用于独立记忆归档/);
 assert.equal(taskProfile('tableArchive').steps[2].includes('needsRows'),true);
});
