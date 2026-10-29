// Neutral, isolated adapter fixture. It does not call a provider or claim device delivery.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {KEY,emptyConfig,defaultWorld,createStore,worldKey} from '../../../config/core.js';
import {createHost} from '../../../config/host.js';
import {defaultRegistry} from '../../../tables/schema.js';
import {compileFormContext,FORM_CONTEXT_GUIDE} from '../../../onepass/context.mjs';
import {prepareOnePassBatch} from '../../../onepass/tables.mjs';
import {parseOnePassReply} from '../../../onepass/reply.mjs';
import {readTaskResponse} from '../../../config/stream-response.js';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../../../six/preset.mjs';
import {QUALITY_PRESET_SETTINGS} from '../../../config/response-speed.js';
const here=process.env.TISYA_MODEL_RUN_DIR??path.dirname(new URL(import.meta.url).pathname),round=Number(process.argv[2]??1);
if(process.argv[1]===new URL(import.meta.url).pathname){
const userTurns=[
 '窗外下着雨，我坐在沙发上把手伸给小缇：“小缇老板，今天可以预约一次摸摸头吗？”我停在原处，让你自己决定要不要靠过来。',
 '我按约定轻轻摸了摸你的头顶：“好啦，小缇老板，摸头服务已签收。你的爪垫今天是不是也可以碰一下？”我摊开另一只手，等你自己选择。',
 '我轻轻碰了一下你递来的爪垫，笑着把靠里的位置让出来：“成交。窗外还在下雨，要不要陪我坐一会儿？今天不用加班营业了。”'
];
if(!Number.isInteger(round)||round<1||round>3)throw Error('Round must be 1..3');
const row=(id,values)=>({id,table:'objects',values,rev:1,access:{readers:['读者'],knowers:['cat','owner']},lockedFields:[],source:null});
let view=round===1?{registry:defaultRegistry(),last:null,anchors:[],rows:[
 row('cat',{名称:'小缇',类型:'character',描述:'成年、会说话的猫。爱撒娇，也有自己的小主意。用轻松俏皮的中文与主人互动，提出自己的要求，不替主人行动。'}),
 row('owner',{名称:'主人',类型:'character',描述:'成年的人类，由用户控制。'}),
 row('room',{名称:'客厅',类型:'place',描述:'当代安静的家中客厅，有沙发、靠垫和一扇能看见雨的窗。世界没有多语设定。'})
]}:JSON.parse(fs.readFileSync(path.join(here,`view-${round-1}.json`),'utf8'));
const chat=[];
for(let i=1;i<round;i++){
 chat.push({is_user:true,mes:userTurns[i-1]});
 const raw=fs.readFileSync(path.join(here,`response-${i}.json`),'utf8');
 const content=await readTaskResponse(new Response(raw,{headers:{'content-type':'application/json'}}));
 chat.push({is_user:false,mes:content});
}
chat.push({is_user:true,mes:userTurns[round-1]});
const compiled=compileFormContext(view,{sourceKeys:chat.filter(m=>!m.is_user).map((_,i)=>`cat-round-${i+1}`)});
const state={basis:createHash('sha256').update(JSON.stringify(view)).digest('hex'),registry:view.registry,rows:compiled.rows,formContext:compiled.context,plan:null,aliases:Object.fromEntries(compiled.rows.map((r,i)=>[String(i+1),r.id])),focus:[],window:{ready:false,reason:'No offstage adjudication interval in this fixture'},worldSettings:{playerObjects:['owner'],focusObjects:[]},windowKey:null};
const stateText=FORM_CONTEXT_GUIDE+'\n<ONEPASS_STATE>\n'+JSON.stringify(state).replaceAll('<','\\u003c')+'\n</ONEPASS_STATE>';
const preset=JSON.parse(fs.readFileSync(new URL('../../../presets/Tisya.json',import.meta.url),'utf8'));
const source={identity:'Tisya',prompts:preset.prompts,order:preset.prompt_order.find(g=>g.character_id===100001).order};
const data=emptyConfig(),context={extensionSettings:{[KEY]:data},chatMetadata:{},chatId:'neutral-cat-acceptance',characterId:0,characters:[{avatar:'cat.png',name:'小缇',description:view.rows.find(r=>r.id==='cat').values.描述}],chat,powerUserSettings:{persona_description:'用户控制成年主人，使用当前已给定的言行。'},chatCompletionSettings:{model:'gpt-6-sol',function_calling:true,...QUALITY_PRESET_SETTINGS},substituteParams:s=>s.replaceAll('{{user}}','主人').replaceAll('{{char}}','小缇'),getChatCompletionModel:s=>s.model,stopGeneration(){},getPresetManager:()=>({getAllPresets:()=>['Tisya'],getSelectedPresetName:()=> 'Tisya'})};
const key=worldKey(context),world=defaultWorld();world.context.owner='tisya';world.modes.narrative={...world.modes.narrative,...fullDefaultConfiguration().world.modes.narrative,routes:{}};data.worlds[key]=world;data.routes.tasks.main={preset:'native'};
const store=createStore({getContext:()=>context,persist:async()=>true});
let parameterOptions;
const host=createHost({getContext:()=>context,getSource:()=>source,store,getMoods:()=>DEFAULT_MOODS,createParameters:async(settings,model,type,messages,options)=>{parameterOptions=options;return {generate_data:{model,messages,temperature:settings.temperature,reasoning_effort:settings.reasoning_effort,verbosity:settings.verbosity,max_tokens:settings.openai_max_tokens}};}});
await host.before('normal');host.attachTableContext({world:key,onepass:true,text:stateText,instructions:stateText,slots:{}});
const payload={messages:[],stream:false};await host.payloadReady(payload);
const input=JSON.stringify(payload,null,2)+'\n',requestPath=path.join(here,`request-${round}.json`);
fs.writeFileSync(requestPath,input);fs.writeFileSync(path.join(here,`state-${round}.json`),JSON.stringify({view,state},null,2));
const chunks=[],chunkDir=path.join(here,`request-${round}-parts`);fs.mkdirSync(chunkDir,{recursive:true});
for(let at=0;at<input.length;at+=8000){const name=`part-${String(chunks.length+1).padStart(2,'0')}.txt`,text=input.slice(at,at+8000);fs.writeFileSync(path.join(chunkDir,name),text);chunks.push({name,characters:text.length,sha256:createHash('sha256').update(text).digest('hex')});}
const manifest={round,requestPath,characters:input.length,sha256:createHash('sha256').update(input).digest('hex'),chunks,roles:payload.messages.map(m=>m.role),hostSettings:QUALITY_PRESET_SETTINGS,parameterOptions,injection:host.preview().injection,nativeApiDelivery:false,nativeDeviceTest:false};
fs.writeFileSync(path.join(here,`input-${round}.json`),JSON.stringify(manifest,null,2));
console.log(JSON.stringify(manifest));
}

// Each response is checked separately by check-model-reply before calling this helper.
export async function acceptResponse(n){
 const {view,state}=JSON.parse(fs.readFileSync(path.join(here,`state-${n}.json`),'utf8'));
 const content=await readTaskResponse(new Response(fs.readFileSync(path.join(here,`response-${n}.json`),'utf8'),{headers:{'content-type':'application/json'}}));
 const reply=parseOnePassReply(content),batch=await prepareOnePassBatch(view,reply,state,{key:`cat-round-${n}`});
 const rows=new Map(view.rows.map(r=>[r.id,r]));for(const commit of batch.commits)for(const change of commit.changes){if(change.after)rows.set(change.after.id,change.after);else rows.delete(change.id);}
 const next={...view,rows:[...rows.values()]};fs.writeFileSync(path.join(here,`view-${n}.json`),JSON.stringify(next,null,2));fs.writeFileSync(path.join(here,`batch-${n}.json`),JSON.stringify(batch,null,2));return {changes:batch.changes,pending:batch.pending};
}
