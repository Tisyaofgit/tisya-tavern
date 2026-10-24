import test from 'node:test';
import assert from 'node:assert/strict';
import {createInstallerHarness,xml,sheet,wrap,newBody} from './installer-harness.mjs';
import {createHistoryImportService} from '../../../v3/history-import.mjs';
import {projectRetained,parseHistoricalBody,parseSimpleSheet,formatSimpleSheet} from '../../../v3/host-runtime.mjs';
const legacy='<reply><task>PRIVATE_TASK</task><body>她递来钥匙。\r\n\r\n她约好明天回来。</body><status>PRIVATE_STATUS</status></reply>';
test('an existing unnumbered chat opens the real session and history import writes an exact original with native worldbook readback',async()=>{
 const f=await createInstallerHarness({mvu:false});f.ctx.chat[2].mes=legacy;
 try{const session=await f.api.getSession();assert.deepEqual(await session.system.originals.listMetadata({scope:session.scope}),[]);
 const service=createHistoryImportService({getSession:()=>f.api.getSession(),requestTask:async()=>({templates:[],changes:[{id:'new:import',table:'events',expected:0,values:{名称:'历史约定',经过:'她约定回来。'},access:{readers:['读者'],knowers:[]},evidence:'她约好明天回来。'}],pending:[]})});
 const draft=await service.generate({source:legacy});const saved=await service.save(draft);const state=await session.storage.read();const event=projectRetained(state,session.getScope().activeSourceKeys).rows.find(r=>r.values.名称==='历史约定');assert.ok(event);const raw=await session.system.originals.resolveReference({reference:event.values.原文引用,scope:session.scope,purpose:'tool-read'});assert.equal((await session.system.originals.read({entryId:saved.original.entryId,scope:session.scope,purpose:'archive-task'})).content,legacy);assert.equal(raw.selected[0].text,'她约好明天回来。');assert.equal(saved.status,'saved');assert.equal(f.ctx.chat[2].mes,legacy);assert.equal(f.requests.length,0);assert(f.host.calls.some(c=>JSON.stringify(c).includes('world_info')));
 }finally{f.api.dispose();}
});
test('historical sources supply explicit prose paragraph indices, never execute old native patches, and do not enter B as raw text',async()=>{
 const old=legacy.replace('</reply>','<UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable></reply>');const f=await createInstallerHarness({provider:({stage,messages})=>{if(stage!=='a')return wrap(newBody);const proposal=parseSimpleSheet(sheet(messages));for(const p of proposal.archiveProposal)p.proposal.changes=[];return formatSimpleSheet(proposal);}});f.ctx.chat[2].mes=old;
 try{await f.intercept('normal');assert.equal(f.errors.length,0,f.errors[0]?.stack);const a=xml(f.requests[0].messages,'TISYA.DATA.SOURCE').archiveSources[0];assert.equal(a.archiveSource.text,old);assert.deepEqual(a.archiveSource.paragraphs.map(p=>p.text),['她递来钥匙。','她约好明天回来。']);assert.equal(a.nativeBridge.enabled,false);assert.equal(f.nativeMvu.counts().parses,0);assert(!JSON.stringify(f.requests[1].messages).includes('PRIVATE_TASK'));assert.equal(f.ctx.chat[2].mes,old);}finally{f.api.dispose();}
});
test('a malformed V3 source never falls back to historical import; one CRLF is not a blank line',async()=>{
 const f=await createInstallerHarness({mvu:false});f.ctx.chat[2].mes='<reply><think phase="before">broken</think><body>unnumbered</body></reply>';
 try{await f.api.getSession();await f.intercept('normal');assert.equal(f.errors.length,1);assert.equal(f.requests.length,0);}finally{f.api.dispose();}
 assert.equal(parseHistoricalBody('一句\r\n换行').length,1);assert.equal(parseHistoricalBody('一句\r\n\r\n另段').length,2);
});
