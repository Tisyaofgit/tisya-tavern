import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatrixContextRecorder,sanitizeContextValue} from '../engine/context-recorder.mjs';
import {createTextTransport} from '../config/text-transport.js';
import {contextRecord} from '../config/context-export.js';

const payload=()=>({model:'fixture-model',stream:true,max_tokens:1234,api_key:'must-not-leak',headers:{Authorization:'Bearer must-not-leak'},messages:[{role:'system',content:'缇斯亚合同'},{role:'user',content:'完整原文🙂'}],tools:[{type:'function',function:{name:'fixture_tool',parameters:{type:'object'}}}],tool_choice:'auto'});

test('Matrix recorder captures complete assembly and upgrades only the matching host-fetch readback',async t=>{
 const target={location:{origin:'https://fixture.local'},fetch:async()=>new Response('{}',{status:200})},transport=createTextTransport({target});transport.install();t.after(()=>transport.dispose());
 let key='chat-one';const recorder=createMatrixContextRecorder({getKey:()=>key,transport}),request=payload(),assembled=recorder.capture(request);
 assert.equal(assembled.dispatch.stage,'assembled');assert.equal(assembled.dispatch.observation,'pending');
 assert.equal(assembled.parameters.api_key,'[已隐藏敏感字段]');assert.equal(assembled.parameters.headers.Authorization,'[已隐藏敏感字段]');assert.equal(assembled.parameters.max_tokens,1234);
 assert.equal(recorder.preview().messages[1].content,'完整原文🙂');
 await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(request)});
 const sent=recorder.preview();assert.equal(sent.dispatch.stage,'host-fetch');assert.equal(sent.dispatch.observation,'read-back');assert.equal(sent.hostFetch.messageCount,2);assert.equal(sent.hostFetch.toolCount,1);assert.equal(sent.parameters.model,'fixture-model');assert.equal(sent.parameters.tool_choice,'auto');
 const record=contextRecord(sent);assert.match(record.note,/宿主发送入口读回/);assert.match(record.note,/不是供应商接收回执/);assert(!JSON.stringify(record).includes('must-not-leak'));
 key='chat-two';assert.equal(recorder.preview(),null);assert.deepEqual(recorder.snapshots(),[]);
});

test('a different request cannot claim the current snapshot and unavailable observation stays explicit',async t=>{
 const target={location:{origin:'https://fixture.local'},fetch:async()=>new Response('{}',{status:200})},transport=createTextTransport({target});transport.install();t.after(()=>transport.dispose());
 const recorder=createMatrixContextRecorder({getKey:()=>'chat-one',transport}),request=payload();recorder.capture(request);
 const other={...request,messages:[{role:'user',content:'另一请求'}]};await target.fetch('/api/backends/chat-completions/generate',{method:'POST',body:JSON.stringify(other)});
 assert.equal(recorder.preview().dispatch.stage,'assembled');assert.equal(recorder.preview().messages[1].content,'完整原文🙂');
 const offline=createMatrixContextRecorder({getKey:()=>'chat-one'});offline.capture(request);assert.equal(offline.preview().dispatch.observation,'unavailable');assert.match(contextRecord(offline.preview()).note,/尚无宿主发送入口读回/);
});

test('sanitization redacts only credential fields and preserves generation parameters and Unicode',()=>{
 const value=sanitizeContextValue({access_token:'x',refresh_token:'y',secret_id:'z',password:'p',max_tokens:99,token_count:12,nested:{text:'正文🙂'}});
 assert.deepEqual(value,{access_token:'[已隐藏敏感字段]',refresh_token:'[已隐藏敏感字段]',secret_id:'[已隐藏敏感字段]',password:'[已隐藏敏感字段]',max_tokens:99,token_count:12,nested:{text:'正文🙂'}});
});
