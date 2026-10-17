// Local neutral-fixture request audit. No real model, private source or canonical storage access.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {KEY,registry,emptyConfig,defaultWorld,createStore,worldKey} from '../config/core.js';
import {createHost} from '../config/host.js';
import {NARRATIVE as N} from '../settings-core.js';
import {defaultRegistry} from '../tables/schema.js';
import {taskRegistry,SIMPLE_TABLE_TASKS} from '../tables/task-registry.js';
import {registerLivePreset,isLivePreset} from '../narrative-bridge.js';
import {registerPresetProtocol} from '../preset.js';
import {EMOTIONS} from '../emotion-catalog.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.resolve(process.argv[2]??path.join(root,'../evidence/prepared-task-forms'));
const tasks=SIMPLE_TABLE_TASKS;
const preset=JSON.parse(fs.readFileSync(path.join(root,'presets/Tisya-TauriTavern-0.2.0-alpha.13.json')));
const data=emptyConfig(),context={chatId:'neutral-audit',characterId:0,characters:[{avatar:'fixture.png',name:'示例人物',description:'中性诊断夹具',data:{description:'中性诊断夹具',personality:'未指定'}}],chatMetadata:{},chat:[{is_user:true,mes:'整理中性诊断资料。'}],powerUserSettings:{persona_description:'中性诊断身份'},extensionSettings:{[KEY]:data,connectionManager:{}},chatCompletionSettings:{model:'fixture-only',chat_completion_source:'openai',prompts:[],function_calling:false},getChatCompletionModel:s=>s.model,getRequestHeaders:()=>({}),getWorldInfoNames:()=>[],getPresetManager:()=>({getAllPresets:()=>['r13'],getSelectedPresetName:()=> 'r13',getCompletionPresetByName:()=>preset})};
const key=worldKey(context);data.worlds[key]=defaultWorld();data.worlds[key].context.owner='tisya';data.worlds[key].tables={taskInstructions:Object.fromEntries(tasks.map(task=>[task,'中性任务补充／'+task]))};
const source={prompts:structuredClone(preset.prompts),order:structuredClone(preset.prompt_order[0].order)},macros=new Map();
context.registerMacro=(n,f)=>macros.set(n,f);context.unregisterMacro=n=>macros.delete(n);
context.substituteParams=s=>s.replace(/\{\{(tisya_\w+)\}\}/g,(_,n)=>{assert(macros.has(n),'Missing '+n);return macros.get(n)()}).replaceAll('{{user}}','不应替换来源正文');
let persistenceCalls=0,transportCalls=0,sent;
const store=createStore({getContext:()=>context,persist:async()=>{persistenceCalls++;throw Error('诊断禁止写入配置');}}),moods=EMOTIONS.map(r=>r.name);
const host=createHost({getContext:()=>context,getSource:()=>source,getBaseSource:()=>({prompts:[{identifier:'main',content:N.previewSettings(N.suggestions(),{summary:false,directions:[]}).rest.entries.main}]}),getMoods:()=>moods,store,createParameters:async(s,model,type,messages)=>({generate_data:{model,messages,stream:false}})});
const live=registerLivePreset(context,()=>source,()=>context,()=>moods);registerPresetProtocol(context,()=>source,()=>{},()=>moods,s=>!isLivePreset(s)||live.execution().prose);context.registerMacro('tisya_config_selected',()=>host.selectedText());
const card='  中性原卡：示例人物看管普通灯。"引号"\r\n{{user}} <tag> 0 false null  ',body='示例人物把普通灯放在桌上。',user='请整理已经发生的放灯动作。';
function prepare(task){
 const input={goal:'整理示例人物和普通灯；设计内容留待确认。',sourceCardRaw:{fields:{name:'示例人物',description:card}},sourceBooks:[],registry:defaultRegistry(),currentRows:[],archiveSource:{key:'host-only-floor-key',floor:2,text:body},userSource:{sources:[{floor:1,role:'user',text:user}]}};
 if(task==='assetAdapt'){
  input.mode='single';input.source={format:'tisya.core-selection/1',objects:[{kind:'character',row:{id:'host-only-object-key',table:'objects',values:{名称:'示例人物',类型:'character',描述:card},access:{readers:['读者'],knowers:[]}},growth:[]}],links:[],instructions:'仅提炼资料已经明确的意义。'};
 }
 return taskRegistry.prepare(task,input).payload;
}
const hash=s=>createHash('sha256').update(s).digest('hex'),save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
fs.mkdirSync(path.join(out,'requests'),{recursive:true});
const originalFetch=globalThis.fetch,results=[];
globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/backends/chat-completions/generate');transportCalls++;sent=JSON.parse(options.body);return {ok:true,json:async()=>({choices:[{message:{content:'【完成】\n1 待处理：中性运输诊断不填答'},finish_reason:'stop'}]})};};
try{
 for(const task of tasks){
  assert(registry.tasks.has(task),'未注册任务 '+task);
  const input=prepare(task),before=JSON.stringify(input),baseCalls=transportCalls;
  await host.request(task,JSON.stringify(input));assert.equal(transportCalls,baseCalls+1);assert.equal(JSON.stringify(input),before);
  const text=sent.messages.map(m=>m.content).join('\n'),supplement='中性任务补充／'+task;
  assert(text.includes(card),task+' 原卡正文丢失或被替换');
  if(task!=='assetAdapt'){assert(text.includes(body),task+' 归档正文丢失');assert(text.includes(user),task+' 连续用户输入丢失');}
  assert.equal(text.split(supplement).length-1,1,task+' 补充要求须恰好出现一次');
  assert(text.includes('【完成】'),task+' 缺少业务完成格');assert(sent.messages.every(m=>['system','user'].includes(m.role)));
  assert.doesNotMatch(text,/\[INNER.LOGIN\]|\[MODE.ANALYZE\]|\[PREPARE_STEP\]|host-only-floor-key|host-only-object-key|schemaChanges|不应替换来源正文/);
  if(input.compactFill)assert(text.includes(input.compactFill.modelInput));else for(const message of input.simpleForm.messages)assert(sent.messages.some(m=>m.role===message.role&&m.content===message.content));
  const request={task,status:'prepared-business-form',fixture:'neutral-only',sourceBytesPreserved:true,supplementOccurrences:1,body:sent};save('requests/'+task+'.json',request);
  const missing=structuredClone(input);delete missing.compactFill;delete missing.simpleForm;const beforeRejected=transportCalls;
  await assert.rejects(()=>host.request(task,JSON.stringify(missing)),/需要.*准备.*表格/);assert.equal(transportCalls,beforeRejected,task+' 缺表请求不得到达运输层');
  results.push({task,status:request.status,messages:sent.messages.length,characters:text.length,requestSha256:hash(JSON.stringify(sent)),missingFormRejectedBeforeTransport:true,sourceBytesPreserved:true,supplementOccurrences:1});
 }
 assert.equal(persistenceCalls,0);assert.equal(transportCalls,tasks.length);
 const report={format:'tisya.prepared-task-audit/1',environment:'production createHost and production form builders; isolated neutral fixture and intercepted local transport',realModelCalls:0,canonicalWrites:0,persistenceCalls,fixtureTransportCalls:transportCalls,results,limits:['Request assembly and missing-form rejection only; no claim of model output quality, application correctness or live network compatibility.','No private input file is accepted; all material is the neutral inline fixture.']};
 save('preset-audit.json',report);console.log(JSON.stringify(report,null,2));
}catch(error){save('failure.json',{error:error.stack,fixtureTransportCalls:transportCalls,persistenceCalls,results});throw error;}
finally{globalThis.fetch=originalFetch;}
