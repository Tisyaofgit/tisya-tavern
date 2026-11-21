import test from 'node:test';
import assert from 'node:assert/strict';
import {INSPECTION_SCHEMA,pendingInspectionReport,collectInspectionReport,safeDataInspection,safeRuntimeInspection,inspectionReportSummary} from '../inspection-report.js';

test('safety projections retain useful counts and fixed states without host ids, prose or variable values',()=>{
 const data=safeDataInspection({selection:{status:'宿主调用未返回',target:{characterId:'PRIVATE_CHARACTER',chatId:'PRIVATE_CHAT'},chatEvents:2,contentCommits:1,lastContent:4,matchesCharacter:false,matchesChat:false,current:{characterId:'PRIVATE_CHARACTER',chatId:'PRIVATE_CHAT',messageCount:8,hasIntegrity:true}},database:{revision:7,contextKey:'PRIVATE_CONTEXT',state:{tables:{T_SYS_ENTITIES:{PRIVATE_RECORD:{values:{name:'PRIVATE_NAME',description:'PRIVATE_PROSE'}}},other:{x:{values:{secret:'PRIVATE_VALUE'}}}}}}});
 assert.equal(data.selection.report.state,'HOST_PENDING');assert.equal(data.selection.report.lastContent,4);assert.equal(data.selection.report.current.messageCount,8);
 assert.equal(data.database.revision,7);assert.equal(data.database.recordCount,2);assert.equal(data.database.byTable.T_SYS_ENTITIES,1);assert.equal(data.database.byTable.OTHER,1);
 const runtime=safeRuntimeInspection({operation:{label:'PRIVATE_OPERATION'},tasks:{busy:true,progress:{stage:'error',characters:123,text:'PRIVATE_FAILED_REPLY',responseDiagnostic:{httpStatus:200,done:true,reasoningDetected:false,finishReason:'length',contentType:'PRIVATE_CONTENT_TYPE'}},jobs:[{task:'PRIVATE_TASK',status:'失败',detail:'PRIVATE_DETAIL',code:'CELL_FAILED',response:{text:'PRIVATE_JOB_REPLY'},stack:'PRIVATE_STACK'}]}});
 assert.equal(runtime.operation.active,true);assert.equal(runtime.tasks.report.stage,'error');assert.equal(runtime.tasks.report.characters,123);assert.equal(runtime.tasks.report.response.finishReason,'length');assert.deepEqual(runtime.tasks.report.jobs.errorCodes,['CELL_FAILED']);
 const json=JSON.stringify({data,runtime});assert.doesNotMatch(json,/PRIVATE_|PRIVATE-/);assert(!json.includes('contentType'));
});

test('unified collection reaches terminal states independently and reports empty, unavailable and timeout',async()=>{
 let disposed=0,finish;const waiting=new Promise(resolve=>{finish=resolve;});
 const report=await collectInspectionReport({version:'test',managed:true,timeout:5,readDisplay:()=>waiting,onLateDisplay:value=>value?.dispose?.(),readData:async()=>null});
 assert.equal(report.schema,INSPECTION_SCHEMA);assert.equal(report.display.status,'timeout');assert.equal(report.display.error,'DIAGNOSTIC_TIMEOUT');assert.equal(report.data.status,'empty');assert.equal(report.runtime.status,'unavailable');
 finish({dispose:()=>{disposed++;}});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(disposed,1);
 const summary=inspectionReportSummary(report);assert.match(summary,/显示：超时/);assert.match(summary,/数据：空/);assert.match(summary,/运行时：不可用/);
});

test('one fixed-code block failure does not erase successful display and runtime blocks',async()=>{
 const pending=pendingInspectionReport({version:'test'});assert.equal(pending.display.status,'collecting');assert.equal(pending.boundaries.responseTextIncluded,false);
 const report=await collectInspectionReport({version:'test',readDisplay:async()=>({archiveLinkInspection:{assessment:'snapshot-error'}}),readData:async()=>{throw Object.assign(Error('PRIVATE_ERROR'),{code:'DATABASE_READ_FAILED'});},readRuntime:()=>({operation:null,tasks:{busy:false,jobs:[]}})});
 assert.equal(report.display.status,'available');assert.equal(report.data.status,'error');assert.equal(report.data.error,'DATABASE_READ_FAILED');assert.equal(report.runtime.status,'available');
 assert.match(inspectionReportSummary(report),/Tooltips：snapshot-error/);assert.doesNotMatch(JSON.stringify(report),/PRIVATE_ERROR/);
});
