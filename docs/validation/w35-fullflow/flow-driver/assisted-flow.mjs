/** Request-by-request assisted API run. Actual product services and extracted host JS;
 * Happy DOM/native disk remain simulated. Never call this Android or provider testing. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setupFlow} from '../../../../tests/v3/ui-tests/w34-flow-harness.mjs';
import {formatSimpleSheet,projectRetained} from '../../../../v3/host-runtime.mjs';
import {readTaskResponse} from '../../../../config/stream-response.js';

const [scenarioFile,outArgument]=process.argv.slice(2);
if(!scenarioFile||!outArgument)throw Error('Usage: node --experimental-vm-modules assisted-flow.mjs SCENARIO.json NEW_OUTPUT_DIR');
const scenario=JSON.parse(await fs.readFile(scenarioFile,'utf8')),out=path.resolve(outArgument);
try{await fs.stat(out);throw Error('Output directory exists; use a new directory to retain first failures');}catch(error){if(error.code!=='ENOENT')throw error;}
await fs.mkdir(out,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const write=(name,value)=>fs.writeFile(path.join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2));
const clock=()=>new Date().toISOString(),deadline=Date.parse(scenario.deadline??'2026-10-24T19:28:00Z');
const cleanups=[],events=[];let f=null,sequence=0,phase='setup';
const event=async(type,details={})=>{const item={at:clock(),type,phase,...details};events.push(item);await write('events.json',events);console.log(JSON.stringify(item));};
function sse(text){const enc=new TextEncoder();return new Response(new ReadableStream({start(controller){for(let i=0;i<text.length;i+=96)controller.enqueue(enc.encode('data: '+JSON.stringify({choices:[{index:0,delta:{content:text.slice(i,i+96)}}]})+'\n\n'));controller.enqueue(enc.encode('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'));controller.close();}}),{headers:{'content-type':'text/event-stream'}});}
async function requestResponse(kind,messages,details={},signal){
 signal?.throwIfAborted();const id=String(++sequence).padStart(3,'0'),base=id+'-'+kind.replace(/[^a-zA-Z0-9_-]/g,'_'),file=base+'.request.json';
 const request={id,kind,at:clock(),phase,messages,...details};await write(file,request);
 const readable=messages.map((m,i)=>'MESSAGE '+i+' '+m.role+'\n'+m.content).join('\n\n');await write(base+'.messages.txt',readable);
 await write(base+'.delivery.json',{requestSha256:hash(JSON.stringify(request,null,2)),messagesSha256:hash(readable),characters:readable.length,messageCount:messages.length,modelReadVerified:false,producer:'awaiting agent; no fixed response'});
 await event('request-awaiting-response',{id,kind,request:file,messages:base+'.messages.txt',response:base+'.response.json',characters:readable.length});
 const responseFile=path.join(out,base+'.response.json');let response;
 for(;;){signal?.throwIfAborted();if(Date.now()>=deadline)throw Object.assign(Error('Window save deadline reached while awaiting assisted API response'),{code:'WINDOW_DEADLINE'});try{response=JSON.parse(await fs.readFile(responseFile,'utf8'));break;}catch(error){if(error.code!=='ENOENT')throw error;}await new Promise(resolve=>setTimeout(resolve,200));}
 assert.equal(typeof response.producer,'string','Response must identify producer');assert.equal(response.requestSha256,hash(JSON.stringify(request,null,2)),'Response must be bound to the captured request');
 const text=typeof response.content==='string'?response.content:response.sheet?formatSimpleSheet(response.sheet):null;assert.equal(typeof text,'string','Response requires content string or sheet object');
 await write(base+'.used.txt',text);await event('response-delivered',{id,kind,responseSha256:hash(text),characters:text.length,producer:response.producer});return text;
}
async function snapshot(label){const session=await f.app.getSession(),state=await session.storage.read(),view=projectRetained(state,session.getScope().activeSourceKeys);await write(label+'.state.json',{at:clock(),phase,chat:f.h.ctx.chat,chatMetadata:f.h.ctx.chatMetadata,worldbooks:[...f.h.host.disk.entries()],state,view,preferences:await session.preferences.list(),progress:f.app.progress.snapshot(),designProgress:f.app.designProgress.snapshot(),actionErrors:f.actionErrors.map(e=>({message:e.message,stack:e.stack,code:e.code})),hostErrors:f.h.errors.map(e=>({message:e.message,stack:e.stack,code:e.code}))});await write(label+'.ui.html',f.shadow.innerHTML);return view;}
async function click(label){phase=label;await event('click',{label});await f.click(label);const alert=f.shadow.querySelector('[role="alert"]')?.textContent??'';if(alert)throw Error('UI alert after '+label+': '+alert);await snapshot('step-'+String(events.length).padStart(3,'0'));}
try{
 assert.equal(typeof scenario.cardPath,'string');const raw=await fs.readFile(scenario.cardPath,'utf8'),source=JSON.parse(raw),card=source.data??source;
 assert.equal(typeof scenario.persona?.name,'string');assert.equal(typeof scenario.persona?.description,'string');assert.equal(scenario.turns?.length,3,'Supply exactly three RP user turns');
 const opening=scenario.opening??card.first_mes;assert.ok(typeof opening==='string'&&opening.trim(),'A real selected opening is required');
 await write('scenario.json',scenario);await write('boundary.json',{environment:'Node + Happy DOM + extracted TauriTavern 2.4.0 JS',android:false,externalProvider:false,model:'agent-authored responses after capture',precreatedBinding:true,setupNotes:'Book manager establishes empty origin/core/archive before UI. Host saveReply is actual extracted function with scenario character identity set in its VM. No original Library/chat files modified.',cardSourceSha256:hash(raw)});
 f=await setupFlow({after:fn=>cleanups.push(fn)},{chat:[{mes:opening,is_user:false,extra:{}}],request:async(task,input,{messages,options})=>{const text=await requestResponse(task+'-'+(input.phase??''),messages,{input},options.signal);return readTaskResponse(sse(text),options);}});
 const avatar='card.png';f.h.ctx.characters[0]={...source,...card,avatar,name:card.name,data:structuredClone(card)};f.h.ctx.name1=scenario.persona.name;f.h.ctx.name2=card.name;f.h.ctx.powerUserSettings.persona_description=scenario.persona.description;
 f.h.script.saveReply.constructor('value','name2=value; characters[0].name=value;')(card.name);
 f.h.host.disk.delete('渡口配套');for(const [name,bookPath]of Object.entries(scenario.books??{}))f.h.host.putDisk(name,JSON.parse(await fs.readFile(bookPath,'utf8')));
 f.h.ctx.worldInfo=structuredClone(scenario.worldInfo??{charLore:[]});
 f.h.native.fetch=async(url,init)=>{assert.equal(url,'/api/backends/chat-completions/generate');const payload=JSON.parse(init.body);f.h.requests.push(payload);const kind=payload.messages.some(m=>m.content.includes('<TISYA.DATA.SOURCE>'))?'A':'B';const content=await requestResponse(kind,payload.messages,{payload},init.signal);return sse(content);};
 if(scenario.preflightMode)f.h.config.preflightMode=scenario.preflightMode;
 f.h.config.timeoutMs=Math.min(900000,Math.max(60000,deadline-Date.now()));
 await f.reopen();await snapshot('00-initial');
 await click('初始化／从资料提炼');await click('读取角色卡和绑定世界书');await click('生成初始化草案');await click('保存已选设定');
 await click('继续建立开局');await click('读取当前开局');await click('生成开局草案');await click('保存已选设定');
 const opened=await snapshot('10-opening-saved');await f.reopen();assert.deepEqual((await snapshot('11-opening-reopened')).rows,opened.rows,'Opening data changes after reopen');
 for(const [i,input]of scenario.turns.entries()){
  phase='RP '+(i+1);assert.equal(typeof input,'string');f.h.ctx.chat.push({name:scenario.persona.name,mes:input,is_user:true,extra:{}});await event('native-send',{turn:i+1,userInput:input});let aborted=false;
  await f.app.host.generateInterceptor(structuredClone(f.h.ctx.chat),10000,value=>{aborted=value;},'normal');assert.equal(aborted,true,'Extension must own the native send');assert.equal(f.h.ctx.chat.at(-1).is_user,false,'No assistant message saved');assert.equal(f.h.ctx.chat.at(-1).name,card.name,'Native saved speaker mismatches scenario');await snapshot('20-rp-'+(i+1));
 }
 // The automatic pipeline archives prior replies on the next turn. Explicitly import
 // the third delivered floor to finish memory without inventing a fourth RP turn.
 await f.reopen();await click('历史补录');await click('读取当前聊天历史');f.fill('从第几楼',f.h.ctx.chat.length);f.fill('到第几楼',f.h.ctx.chat.length);await click('生成历史补录草案');await click('保存已选设定');
 await f.reopen();await click('用户偏好');await snapshot('30-preferences-visible');
 const finalView=await snapshot('90-final-before-reopen');await f.reopen();assert.deepEqual((await snapshot('91-final-reopened')).rows,finalView.rows,'Final data changes after reopen');
 await write('result.json',{status:'complete',at:clock(),requests:sequence,rows:finalView.rows.length,automaticArchiveAndWorldAndPreferences:'inspect A requests and stored evidence for semantic coverage',boundaries:{android:false,externalProvider:false,nativeHostUI:false,realProductWorkbench:true,actualExtractedNativeFunctions:true}});await event('complete');
}catch(error){await write('failure.json',{at:clock(),phase,name:error.name,code:error.code,message:error.message,stack:error.stack});if(f)try{await snapshot('99-failed');}catch(snapshotError){await write('snapshot-failure.json',{message:snapshotError.message,stack:snapshotError.stack});}await event('failed',{message:error.message,code:error.code});process.exitCode=1;}
finally{for(const cleanup of cleanups.reverse())try{await cleanup();}catch(error){console.error(error);}}
