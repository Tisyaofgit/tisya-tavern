import test from 'node:test';
import assert from 'node:assert/strict';
import {readTaskResponse,safeDiagnostic} from '../config/stream-response.js';

const encoder=new TextEncoder();
const event=(delta,finish_reason=null)=>'data: '+JSON.stringify({choices:[{index:0,delta,finish_reason}]})+'\n\n';
const done='data: [DONE]\n\n';
function streamResponse(text,{size=17,close=true,onCancel=()=>{},headers={'content-type':'text/event-stream'}}={}){
 const bytes=encoder.encode(text),stream=new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=size)controller.enqueue(bytes.slice(i,i+size));if(close)controller.close();},cancel:onCancel});
 return new Response(stream,{headers});
}
const jsonResponse=payload=>new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
async function expectFailure(response,code,pattern){
 const events=[];await assert.rejects(readTaskResponse(response,{onProgress:entry=>events.push(entry)}),error=>{assert.equal(error.code,code);if(pattern)assert.match(error.message,pattern);return true;});
 assert.equal(events.some(entry=>entry.stage==='received'),false);return events;
}

test('SSE decodes arbitrary byte boundaries and emits cumulative content without reasoning',async()=>{
 const hidden='PRIVATE_REASONING_NOT_FOR_UI',expected=' {"changes":[],"note":"中文🙂"}\n';
 const wire=': keepalive\r\n\r\n'+event({role:'assistant',reasoning_content:hidden}).replaceAll('\n','\r\n')+event({content:expected.slice(0,13)})+event({content:expected.slice(13)},'stop')+done;
 for(const size of [1,2,7,64]){
  const updates=[],value=await readTaskResponse(streamResponse(wire,{size}),{onProgress:entry=>updates.push(entry)});
  assert.equal(value,expected);assert.equal(updates[0].stage,'connected');assert.equal(updates.at(-1).stage,'received');assert.equal(updates.at(-1).characters,expected.length);
  assert.ok(updates.some(entry=>entry.stage==='thinking'));assert.ok(updates.some(entry=>entry.stage==='receiving'));
  assert.ok(updates.every(entry=>entry.characters===entry.text.length));assert.doesNotMatch(JSON.stringify(updates),new RegExp(hidden));assert.ok(updates.every(entry=>entry.stage!=='complete'));
 }
});

test('SSE handles folded data lines, comments, metadata and content parts',async()=>{
 const folded='id: 7\nevent: message\ndata: {"choices":\ndata: [{"index":0,"delta":{"content":[{"type":"reasoning","text":"HIDDEN"},{"type":"text","text":"{\\"changes\\":[]}"}]},"finish_reason":"stop"}]}\n\n';
 const updates=[],value=await readTaskResponse(streamResponse(folded+'data: {"choices":[],"usage":{"total_tokens":3}}\n\n'+done,{size:3}),{onProgress:entry=>updates.push(entry)});
 assert.equal(value,'{"changes":[]}');assert.doesNotMatch(JSON.stringify(updates),/HIDDEN/);
});

test('terminal DONE cancels an otherwise open reader, while stop also completes at EOF',async()=>{
 let canceled=0;const value=await readTaskResponse(streamResponse(event({content:'{"ok":true}'})+done,{close:false,onCancel:()=>canceled++}));
 assert.equal(value,'{"ok":true}');assert.equal(canceled,1);
 assert.equal(await readTaskResponse(streamResponse(event({content:'{"ok":true}'},'stop'))),'{"ok":true}');
 let stopCanceled=0;
 assert.equal(await readTaskResponse(streamResponse(event({content:'{"ok":true}'},'stop'),{close:false,onCancel:()=>stopCanceled++}),{signal:AbortSignal.timeout(1000)}),'{"ok":true}');
 assert.equal(stopCanceled,1);
});

test('the full visible result survives many chunks without trimming or truncation',async()=>{
 const expected='\n '+JSON.stringify({text:'完整🙂'.repeat(12000),changes:[]})+' \n',pieces=[];
 for(let offset=0;offset<expected.length;offset+=503)pieces.push(event({content:expected.slice(offset,offset+503)}));
 const updates=[],value=await readTaskResponse(streamResponse(pieces.join('')+event({},'stop')+done,{size:113}),{onProgress:entry=>updates.push(entry)});
 assert.equal(value,expected);assert.equal(updates.at(-1).text,expected);assert.equal(updates.at(-1).characters,expected.length);
});

test('missing completion, malformed frames and malformed envelope shapes fail explicitly',async()=>{
 await expectFailure(streamResponse(event({content:'{"changes":[]}'})),'TISYA_RESPONSE_TRUNCATED',/完成标记/);
 for(const wire of ['data: {broken}\n\n','data: {"choices":"wrong"}\n\n','data: {"choices":[{"delta":4}]}\n\n','data: {"choices":[{}]}\n\n','data: {"unexpected":1}\n\n','data: [1,2]\n\n'])await expectFailure(streamResponse(wire+done),'TISYA_RESPONSE_PROTOCOL');
});

test('length, content_filter and unsupported finish reasons never become success',async()=>{
 for(const [reason,code] of [['length','TISYA_RESPONSE_TRUNCATED'],['content_filter','TISYA_RESPONSE_FILTERED'],['tool_calls','TISYA_RESPONSE_FINISH']]){
  await expectFailure(streamResponse(event({content:'{"changes":[]}'},reason)+done),code,new RegExp(reason));
  await expectFailure(jsonResponse({choices:[{message:{content:'{"changes":[]}'},finish_reason:reason}]}),code,new RegExp(reason));
 }
});

test('stream API errors and error events retain readable diagnostics but redact credentials',async()=>{
 for(const wire of [
  'data: {"error":{"message":"quota exceeded; api-key=credential-123"}}\n\n',
  'event: error\ndata: server unavailable; Authorization: Bearer credential-456\n\n',
  'data: {"error":""}\n\n',
 ]){
  const updates=[];await assert.rejects(readTaskResponse(streamResponse(wire),{onProgress:entry=>updates.push(entry)}),error=>{assert.equal(error.code,'TISYA_RESPONSE_API');assert.doesNotMatch(error.message,/credential-/);return true;});
  assert.equal(updates.some(entry=>entry.stage==='received'),false);
 }
});

test('reasoning-only, empty completion and refusal are not successful empty results',async()=>{
 await expectFailure(streamResponse(event({reasoning:'HIDDEN'})+done),'TISYA_RESPONSE_EMPTY');
 await expectFailure(streamResponse(done),'TISYA_RESPONSE_EMPTY');
 await expectFailure(streamResponse(event({content:' \n '},'stop')+done),'TISYA_RESPONSE_EMPTY');
 await expectFailure(streamResponse(event({refusal:'Cannot complete this request'})+done),'TISYA_RESPONSE_REFUSED');
 await expectFailure(jsonResponse({choices:[{message:{content:null,reasoning_content:'HIDDEN'},finish_reason:'stop'}]}),'TISYA_RESPONSE_EMPTY');
});

test('non-stream OpenAI content stays exact and emits buffered then received',async()=>{
 const expected='\n {"changes":[]} \n',updates=[];
 assert.equal(await readTaskResponse(jsonResponse({choices:[{message:{content:expected,reasoning_content:'HIDDEN'},finish_reason:'stop'}]}),{onProgress:entry=>updates.push(entry)}),expected);
 assert.deepEqual(updates.map(entry=>entry.stage),['buffered','received']);assert.equal(updates.at(-1).text,expected);assert.doesNotMatch(JSON.stringify(updates),/HIDDEN/);
});

test('legacy json-only response mocks and direct task JSON objects remain supported',async()=>{
 const object={changes:[],pending:[]},updates=[];
 assert.equal(await readTaskResponse({ok:true,json:async()=>object},{onProgress:entry=>updates.push(entry)}),JSON.stringify(object));
 assert.equal(await readTaskResponse({ok:true,json:async()=>({choices:[{message:{content:'{"changes":[]}'}}]})}),'{"changes":[]}');
 const raw=' {\n  "changes": []\n} ';
 assert.equal(await readTaskResponse(new Response(raw,{headers:{'content-type':'application/json'}})),raw);
 assert.equal(updates.at(-1).stage,'received');
});

test('existing non-stream text-part envelopes ignore reasoning blocks',async()=>{
 assert.equal(await readTaskResponse(jsonResponse({content:[{type:'thinking',thinking:'HIDDEN'},{type:'text',text:'{"changes":[]}'}],stop_reason:'end_turn'})),'{"changes":[]}');
 assert.equal(await readTaskResponse(jsonResponse({candidates:[{content:{parts:[{thought:true,text:'HIDDEN'},{text:'{"changes":[]}'}]},finishReason:'STOP'}]})),'{"changes":[]}');
 await expectFailure(jsonResponse({promptFeedback:{blockReason:'SAFETY'}}),'TISYA_RESPONSE_FILTERED');
});

test('JSON API errors, missing text and malformed JSON never stringify into task success',async()=>{
 for(const payload of [{error:{message:'quota exceeded'}},{success:false,message:'upstream failed'},{ok:false,message:'failed'},{status:401,message:'unauthorized'},{type:'authentication_error',message:'bad key'},{code:'invalid_api_key',message:'invalid key'}])await expectFailure(jsonResponse(payload),'TISYA_RESPONSE_API');
 for(const payload of [{},{usage:{total_tokens:1}},{reasoning_content:'HIDDEN'},{object:'chat.completion'},[]])await expectFailure(jsonResponse(payload),'TISYA_RESPONSE_PROTOCOL');
 await expectFailure(jsonResponse({choices:[]}),'TISYA_RESPONSE_EMPTY');
 await expectFailure(new Response('{broken}',{headers:{'content-type':'application/json'}}),'TISYA_RESPONSE_PROTOCOL');
 await expectFailure(new Response(''),'TISYA_RESPONSE_EMPTY');
});

test('HTTP failures show status and sanitized server error instead of parsing a task result',async()=>{
 const response=new Response(JSON.stringify({error:{message:'Unauthorized api_key=HTTP_SECRET'}}),{status:401,headers:{'content-type':'application/json'}});
 await assert.rejects(readTaskResponse(response),error=>{assert.equal(error.code,'TISYA_RESPONSE_HTTP');assert.match(error.message,/401.*Unauthorized/);assert.doesNotMatch(error.message,/HTTP_SECRET/);return true;});
 await expectFailure(new Response('upstream unavailable',{status:503}),'TISYA_RESPONSE_HTTP',/503.*upstream/);
 await expectFailure({ok:false,status:429,json:async()=>({error:{message:'rate limit'}})},'TISYA_RESPONSE_HTTP',/429.*rate limit/);
});

test('abort before reading and while awaiting a stream stops progress and cancels the reader',async()=>{
 const early=new AbortController();early.abort('cancelled early');let earlyCanceled=0;
 await assert.rejects(readTaskResponse(streamResponse('',{close:false,onCancel:()=>earlyCanceled++}),{signal:early.signal}),error=>error.name==='AbortError');assert.equal(earlyCanceled,1);
 const controller=new AbortController();let canceled=0,ready;const began=new Promise(resolve=>ready=resolve),updates=[];
 const response=new Response(new ReadableStream({start(stream){stream.enqueue(encoder.encode(event({content:'partial'})));},cancel(){canceled++;}}),{headers:{'content-type':'text/event-stream'}});
 const reading=readTaskResponse(response,{signal:controller.signal,onProgress:entry=>{updates.push(entry);if(entry.stage==='receiving')ready();}});
 await began;controller.abort('cancelled while reading');await assert.rejects(reading,error=>error.name==='AbortError'&&/cancelled/.test(error.message));
 assert.equal(canceled,1);assert.equal(updates.some(entry=>entry.stage==='received'),false);
});

test('abort also interrupts a pending json-only mock without waiting for its promise',async()=>{
 const controller=new AbortController();let started;const began=new Promise(resolve=>started=resolve);
 const reading=readTaskResponse({ok:true,json(){started();return new Promise(()=>{});}},{signal:controller.signal});
 await began;controller.abort();await assert.rejects(reading,error=>error.name==='AbortError');
});

test('underlying stream errors and progress callback failures remain visible failures',async()=>{
 const failed=new Response(new ReadableStream({start(controller){controller.error(Error('network disconnected; secret=READ_SECRET'));}}),{headers:{'content-type':'text/event-stream'}});
 await assert.rejects(readTaskResponse(failed),error=>{assert.equal(error.code,'TISYA_RESPONSE_READ');assert.match(error.message,/network disconnected/);assert.doesNotMatch(error.message,/READ_SECRET/);return true;});
 await assert.rejects(readTaskResponse(streamResponse(event({content:'text'})+done),{onProgress(){throw Error('progress handler failed');}}),/progress handler failed/);
});

test('invalid UTF-8 bytes and unfinished JSON frames cannot produce received progress',async()=>{
 const response=new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([0xff]));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
 await expectFailure(response,'TISYA_RESPONSE_READ');
 await expectFailure(streamResponse('data: {"choices":[{"delta":{"content":"unfinished'), 'TISYA_RESPONSE_PROTOCOL');
});

test('safeDiagnostic redacts common quoted/header/query credentials and remains readable and idempotent',()=>{
 const input='HTTP 401 denied\nAuthorization: Bearer AUTH_SECRET\nProxy-Authorization: Basic BASIC_SECRET\napi-key=API_SECRET&retry=3\n'+JSON.stringify({secret:'SECRET_VALUE',proxy_password:'PROXY_VALUE',client_secret:'CLIENT_VALUE',access_token:'ACCESS_VALUE','x-api-key':'XAPI_VALUE'})+'\nBearer BARE_SECRET\nhttps://user:URL_SECRET@proxy.invalid/path';
 const safe=safeDiagnostic(input);
 for(const word of ['AUTH_SECRET','BASIC_SECRET','API_SECRET','SECRET_VALUE','PROXY_VALUE','CLIENT_VALUE','ACCESS_VALUE','XAPI_VALUE','BARE_SECRET','URL_SECRET'])assert.ok(!safe.includes(word),word);
 assert.match(safe,/HTTP 401 denied/);assert.match(safe,/retry=3/);assert.match(safe,/proxy.invalid\/path/);assert.match(safe,/REDACTED/);assert.equal(safeDiagnostic(safe),safe);
 assert.equal(safeDiagnostic('ordinary error: row 12 has no name'),'ordinary error: row 12 has no name');
});

test('failed streams retain visible final-frame text with safe structural diagnostics',async()=>{
 for(const reason of ['length','content_filter']){
 const hidden='PRIVATE_REASONING',visible='{"changes":["last piece"]}';
 await assert.rejects(readTaskResponse(streamResponse(event({reasoning_content:hidden})+event({content:visible},reason))),e=>{
 assert.equal(e.responseDiagnostic.text,visible);assert.equal(e.responseDiagnostic.finishReason,reason);assert.equal(e.responseDiagnostic.reasoningDetected,true);assert.equal(e.responseDiagnostic.httpStatus,200);assert(e.responseDiagnostic.receivedBytes>0);assert.equal(e.responseDiagnostic.frames,2);assert.equal(e.responseDiagnostic.accepted,false);assert(!JSON.stringify(e.responseDiagnostic).includes(hidden));return true;});
 }
});

test('empty, interrupted and buffered failures keep response evidence without reasoning values',async()=>{
 await assert.rejects(readTaskResponse(streamResponse(event({reasoning_content:'HIDDEN'})+done)),e=>{assert.equal(e.code,'TISYA_RESPONSE_EMPTY');assert.equal(e.responseDiagnostic.reasoningDetected,true);assert.equal(e.responseDiagnostic.done,true);assert.equal(e.responseDiagnostic.text,'');assert(!JSON.stringify(e.responseDiagnostic).includes('HIDDEN'));return true;});
 await assert.rejects(readTaskResponse(streamResponse(event({content:'partial'}))),e=>{assert.equal(e.code,'TISYA_RESPONSE_TRUNCATED');assert.equal(e.responseDiagnostic.text,'partial');return true;});
 await assert.rejects(readTaskResponse(jsonResponse({choices:[{message:{content:'{"api_key":"credential-777","note":"partial"}',reasoning_content:'HIDDEN'},finish_reason:'length'}]})),e=>{assert.equal(e.responseDiagnostic.finishReason,'length');assert.match(e.responseDiagnostic.text,/partial/);assert(!JSON.stringify(e.responseDiagnostic).includes('credential-777'));assert(!JSON.stringify(e.responseDiagnostic).includes('HIDDEN'));return true;});
});
