import test from 'node:test';
import assert from 'node:assert/strict';
import {createTableAssistant} from '../tables/assistant.js';
import {createStore,KEY,emptyConfig,defaultWorld,worldKey,resolveRoute} from '../config/core.js';
import {createConfiguration,CONFIG_KEY,matrixPreset} from '../engine/config.mjs';
import {pairedPreset,taskMessages} from '../tables/paired-preset.js';
import {effectivePreferences} from '../engine/preferences.mjs';
import {historySignature} from '../config/history-context.js';
import {interfaceSnapshot} from '../tables/interface-config.js';

const clone=structuredClone;
function fixture(){
 const ctx={chatId:'one',characterId:0,characters:[{avatar:'a',name:'甲'}],chat:[],chatMetadata:{},extensionSettings:{},chatCompletionSettings:{temp_openai:1.37,stream_openai:true,send_if_empty:'继续'},ToolManager:{RECURSE_LIMIT:5}};
 const data=emptyConfig();data.worlds[worldKey(ctx)]=defaultWorld();ctx.extensionSettings[KEY]=data;
 let writes={native:0,matrix:0},failure=null,response=null,lastInput=null,ui={联系人分组:{},动态效果:true},hold=null,nativeHold=null,transform=null;
 const store=createStore({getContext:()=>ctx,persist:async()=>{writes.native++;if(nativeHold)await nativeHold;if(failure==='native')throw Error('native response lost');return true;}});
 const matrix=createConfiguration({getContext:()=>ctx,persist:async()=>{writes.matrix++;if(hold)await hold;if(failure==='matrix')throw Error('matrix response lost');return true;}});
 const interfaces={read:()=>interfaceSnapshot(ui),save:async args=>{assert.equal(args.expected,interfaceSnapshot(ui).stamp);await store.save(args.data,args.revision,args.key);ui=clone(args.value);}};
 const assistant=createTableAssistant({store,matrixConfig:matrix,getContext:()=>ctx,interfaceConfig:interfaces,review:async()=>({rows:[],history:[],chatStamp:historySignature(ctx)}),run:fn=>fn(new AbortController().signal),getChoices:()=>({connections:[{id:'native',name:'原生'}],presets:['custom']}),call:async input=>{lastInput=input;const raw=response??filled(input,transform??[]);if(typeof raw==='function')return raw(input);return raw;}});
 return {ctx,store,matrix,assistant,interfaces,writes,input:()=>lastInput,setEdits:edits=>transform=edits,setResponse:r=>response=r,fail:v=>failure=v,hold:p=>hold=p,holdNative:p=>nativeHold=p,setUI:v=>ui=v};
}
function filled(input,edits){
 const chosen=new Map();for(const [pattern,value]of edits){const rows=input.source.configuration.filter(row=>typeof pattern==='function'?pattern(row):pattern.test(row.label));assert.equal(rows.length,1,'Expected one editable field for '+pattern+', got '+rows.map(r=>r.label));chosen.set(rows[0].row,value);}
 const rows=input.forms.split('待填写：\n').at(-1).split('\n').map(line=>{const m=/^(\d+) /.exec(line);return m&&chosen.has(Number(m[1]))?line+'：'+chosen.get(Number(m[1])):line;}).join('\n');
 return '<reply><task>配置</task><body>核对后应用这些设置。</body><cells>'+rows+'</cells></reply>';
}
const temp=/当前引擎.*generation.*temperature$/;
const localHistory=/当前引擎.*story.*history_messages$/;
const nativeModel=/^API 路由 › 通用 › 模型$/;

test('real configuration owners receive a complete simple form; asking has zero writes and never exposes old world editors',async()=>{
 const f=fixture(),before=clone(f.ctx.extensionSettings);f.setEdits([[temp,'0'],[/当前引擎.*generation.*stream_openai$/,'否'],[/当前引擎.*generation.*send_if_empty$/,'（空）'],[localHistory,'0'],[nativeModel,'actual-model']]);
 const draft=await f.assistant.ask('把温度和聊天历史设为零，关闭流式，清空续写文字并改模型');
 assert.deepEqual(f.writes,{native:0,matrix:0});assert.deepEqual(f.ctx.extensionSettings,before);assert.equal(f.input().formContract,'tisya.simple-form/1');assert.match(f.input().forms,/【配置】\n1 /);assert.doesNotMatch(JSON.stringify(f.input()),/world\.tables|world\.modes|\/world\/tables|\/world\/modes|editablePaths/);
 assert.equal(f.input().source.configuration.find(r=>temp.test(r.label)).value,1.37);assert.equal(f.input().source.configuration.filter(r=>r.label==='当前会话 › 上下文 › 历史聊天条数').length,0);
 const result=await f.assistant.applyAndContinue(draft);assert.equal(result.count,5);assert.deepEqual(f.writes,{native:1,matrix:1});f.assistant.guard(result.next);
 assert.equal(f.ctx.chatCompletionSettings.temp_openai,0);assert.equal(f.ctx.chatCompletionSettings.stream_openai,false);assert.equal(f.ctx.chatCompletionSettings.send_if_empty,'');assert.equal(effectivePreferences(f.matrix.read()).parameters.history_messages,0);assert.equal(resolveRoute(f.store.read().data,f.store.read().world).model,'actual-model');assert.deepEqual(f.store.read().world.modes,before[KEY].worlds[worldKey(f.ctx)].modes);assert.equal(f.store.read().world.tables,undefined);
});
test('inheritance removes the actual override and restores preference and route inheritance',async()=>{
 const f=fixture(),m=f.matrix.read();m.generation={temperature:.7};m.playDefaults={parameters:{history_messages:12}};m.story.play={parameters:{history_messages:0}};await f.matrix.save(m);
 const s=f.store.read();s.data.routes.global={connection:'native',preset:'custom',model:'override',parameters:{temp_openai:.2}};await f.store.save(s.data,s.revision,s.key);
 f.setEdits([[temp,'（继承）'],[localHistory,'（继承）'],[/^API 路由 › 通用 › API 连接$/,'（继承）'],[/^API 路由 › 通用 › 预设$/,'（继承）'],[nativeModel,'（继承）'],[/^API 路由 › 通用 › 参数 › temp_openai$/,'（继承）']]);
 const d=await f.assistant.ask('恢复继承');await f.assistant.apply(d);assert(!Object.hasOwn(f.matrix.read().generation,'temperature'));assert(!Object.hasOwn(f.matrix.read().story.play.parameters,'history_messages'));assert.equal(effectivePreferences(f.matrix.read()).parameters.history_messages,12);assert.equal(f.ctx.chatCompletionSettings.temp_openai,.7);
 const inherited=f.store.read();for(const key of ['connection','preset','model'])assert(!Object.hasOwn(inherited.data.routes.global,key));assert(!Object.hasOwn(inherited.data.routes.global.parameters??{},'temp_openai'));assert.equal(resolveRoute(inherited.data,inherited.world).model,'');
});
test('configuration generation validation is pure and rejects impossible native types before any owner writes',async()=>{
 const f=fixture(),m=f.matrix.read(),before=clone(f.ctx);m.generation={temperature:'wrong'};assert.throws(()=>f.matrix.validate(m),/生成参数类型/);assert.deepEqual(f.ctx,before);assert.deepEqual(f.writes,{native:0,matrix:0});
 f.setEdits([[temp,'（空）']]);await assert.rejects(f.assistant.ask('错误温度'),e=>/生成参数类型/.test(e.message)&&e.rawResponse.includes('<reply>'));assert.deepEqual(f.writes,{native:0,matrix:0});
});
test('the actual paired assistant preset carries the same readable form and prior discussion through the complete reply scaffold',async()=>{
 const f=fixture();f.setEdits([[temp,'0']]);await f.assistant.ask('温度',[{role:'user',content:'上一条已明确的设置需求'}]);const source=matrixPreset(),preset=pairedPreset({task:'tableAssistant',configuration:f.store.read(),source,formContract:'tisya.simple-form/1'}),messages=taskMessages({preset,task:'tableAssistant',input:f.input()}),text=messages.map(m=>m.content).join('\n');
 assert.match(text,/【配置】/);assert.match(text,/<reply>/);assert.match(text,/上一条已明确的设置需求/);assert.doesNotMatch(text,/JSON Pointer|只返回严格 JSON|changes\":\[/);for(const row of source.prompt_order[0].order)assert(preset.prompt_order[0].order.some(x=>x.identifier===row.identifier));assert.deepEqual(f.writes,{native:0,matrix:0});
});
test('actual native generation edits invalidate both pending model replies and confirmed drafts',async()=>{
 const f=fixture();f.setResponse(input=>{f.ctx.chatCompletionSettings.temp_openai=2;return filled(input,[[temp,'0']]);});await assert.rejects(f.assistant.ask('温度'),e=>/已经改变/.test(e.message)&&e.rawResponse.includes('<reply>'));assert.deepEqual(f.writes,{native:0,matrix:0});
 const g=fixture();g.setEdits([[temp,'0']]);const d=await g.assistant.ask('温度');g.ctx.chatCompletionSettings.temp_openai=2;await assert.rejects(g.assistant.apply(d),/原生生成设置已变化/);assert.deepEqual(g.writes,{native:0,matrix:0});
});
test('unsupported runtime capabilities reject the full plan before either configuration owner writes',async()=>{
 const f=fixture();delete f.ctx.ToolManager;f.setEdits([[/当前引擎.*generation.*tool_call_recurse_limit$/,'2'],[nativeModel,'proposed']]);await assert.rejects(f.assistant.ask('调整工具次数和模型'),e=>e.code==='GENERATION_TOOL_RUNTIME'&&e.rawResponse.includes('<reply>'));assert.deepEqual(f.writes,{native:0,matrix:0});
});
test('unregistered or retired native configuration paths cannot be inserted into a reviewed form draft',async()=>{
 const f=fixture();f.setEdits([[temp,'0']]);const d=await f.assistant.ask('温度');d.changes.push({owner:'native',path:'/world/tables/enabled',value:true,reason:'forged'});
 await assert.rejects(f.assistant.apply(d),/未开放/);assert.deepEqual(f.writes,{native:0,matrix:0});
});
test('JSON, partial cells, stale source and hidden story instructions keep exact model evidence without writing',async()=>{
 for(const raw of ['{"answer":"旧输出","changes":[]}', '<reply><body>方案</body><cells>【配置】\n1 错误字段：0</cells></reply>','<reply><body>方案</body><vars>执行</vars></reply>']){
  const f=fixture();f.setResponse(raw);await assert.rejects(f.assistant.ask('修改'),e=>e.rawResponse===raw);assert.deepEqual(f.writes,{native:0,matrix:0});
 }
 const f=fixture();f.setResponse(input=>{f.ctx.chat.push({is_user:true,mes:'新来源'});return filled(input,[[temp,'0']]);});await assert.rejects(f.assistant.ask('温度'),e=>/已经改变/.test(e.message)&&e.rawResponse.includes('<reply>'));assert.deepEqual(f.writes,{native:0,matrix:0});
});
test('external interface and same-revision engine edits invalidate drafts before any save',async()=>{
 const f=fixture();f.setEdits([[temp,'0']]);const draft=await f.assistant.ask('温度');f.setUI({联系人分组:{},动态效果:false});await assert.rejects(f.assistant.apply(draft),/界面配置已变化/);assert.deepEqual(f.writes,{native:0,matrix:0});
 const g=fixture();g.setEdits([[temp,'0']]);const d=await g.assistant.ask('温度');const changed=g.matrix.read();changed.story.wish='外部修改';delete changed.story;changed.stories[JSON.stringify(['character','0','one'])]={wish:'外部修改'};g.ctx.extensionSettings[CONFIG_KEY]=changed;await assert.rejects(g.assistant.apply(d),/原始来源/);assert.deepEqual(g.writes,{native:0,matrix:0});
});
test('mixed-save failure returns confirmed and unknown receipts and blocks unsafe whole-draft retry',async()=>{
 const f=fixture();f.setEdits([[temp,'0'],[nativeModel,'next']]);const d=await f.assistant.ask('两种设置');f.fail('native');
 await assert.rejects(f.assistant.apply(d),e=>e.configurationReceipts.matrix.revision===1&&e.configurationReceipts.native.status==='unknown'&&/native response lost/.test(e.message));assert.equal(f.matrix.read().generation.temperature,0);assert.deepEqual(f.writes,{native:1,matrix:1});
 f.fail(null);await assert.rejects(f.assistant.apply(d),/保存结果未知/);assert.deepEqual(f.writes,{native:1,matrix:1});
});
test('late competing native edits after the first owner saves do not get overwritten; confirmed partial receipt remains',async()=>{
 const f=fixture();f.setEdits([[temp,'0'],[nativeModel,'suggested']]);const d=await f.assistant.ask('两种设置'),save=f.matrix.save;
 f.matrix.save=async next=>{const result=await save(next),s=f.store.read();s.data.routes.global.model='external';await f.store.save(s.data,s.revision,s.key);return result;};
 await assert.rejects(f.assistant.apply(d),e=>/其他位置/.test(e.message)&&e.configurationReceipts.matrix.revision===1&&!e.configurationReceipts.native);assert.equal(f.store.read().data.routes.global.model,'external');assert.equal(f.matrix.read().generation.temperature,0);assert.deepEqual(f.writes,{native:1,matrix:1});
});
test('Matrix owner blocks overlapping persistence and preserves the first confirmed save',async()=>{
 const f=fixture();let release;f.hold(new Promise(r=>release=r));const first=f.matrix.read();first.generation={temperature:0};const saving=f.matrix.save(first);await Promise.resolve();const second=f.matrix.read();second.generation.temperature=1;
 await assert.rejects(f.matrix.save(second),/保存尚未结束/);release();await saving;assert.equal(f.matrix.read().generation.temperature,0);assert.equal(f.writes.matrix,1);
});
test('Matrix configuration retains its captured chat owner before and during persistence',async()=>{
 const f=fixture(),draft=f.matrix.read();draft.story.wish='属于旧聊天';f.ctx.chatId='two';await assert.rejects(f.matrix.save(draft),e=>e.code==='CONFIG_SCOPE');assert.equal(f.writes.matrix,0);assert.equal(f.matrix.read().story.wish,'');
 const g=fixture();let release;g.hold(new Promise(r=>release=r));const d=g.matrix.read();d.generation={temperature:0};const pending=g.matrix.save(d);await Promise.resolve();g.ctx.chatId='two';release();await assert.rejects(pending,e=>e.code==='CONFIG_SCOPE');assert.equal(g.ctx.chatCompletionSettings.temp_openai,1.37);assert.equal(g.matrix.read().revision,0);assert.equal(g.writes.matrix,2);
});
test('a replacement from another owner during persistence is preserved and reported instead of rolled back over',async()=>{
 const f=fixture(),config=createConfiguration({getContext:()=>f.ctx,persist:async()=>{f.ctx.extensionSettings[CONFIG_KEY]={...clone(f.ctx.extensionSettings[CONFIG_KEY]),revision:8,tags:{...f.matrix.read().tags,body:'externalbody'}};return true;}}),draft=config.read();draft.generation={temperature:0};
 await assert.rejects(config.save(draft),e=>e.code==='CONFIG_ROLLBACK_FAILED'&&/未覆盖/.test(e.message));assert.equal(config.read().revision,8);assert.equal(config.read().tags.body,'externalbody');
});
test('confirmed draft is idempotent and cannot silently change its remaining plan after a partial save',async()=>{
 const f=fixture();f.setEdits([[temp,'0']]);const d=await f.assistant.ask('温度');await f.assistant.apply(d);const count=f.writes.matrix;await f.assistant.apply(d);assert.equal(f.writes.matrix,count);d.changes[0].value=1;await assert.rejects(f.assistant.apply(d),/不能改写/);assert.equal(f.matrix.read().generation.temperature,0);
});

test('confirmed Matrix settings resume the same draft after a native pre-save busy rejection without repeating the first owner',async()=>{
 const f=fixture();let release;f.holdNative(new Promise(resolve=>release=resolve));
 const pending=f.store.read();pending.data.routes.global.model='prior-model';const first=f.store.save(pending.data,pending.revision,pending.key);
 try{
  f.setEdits([[temp,'0'],[nativeModel,'next-model']]);const draft=await f.assistant.ask('应用引擎温度和原生模型');
  await assert.rejects(f.assistant.apply(draft),error=>error.code==='CONFIG_BUSY'&&error.configurationReceipts.matrix.revision===1&&!error.configurationReceipts.native);
  assert.equal(draft.uncertainOwner,undefined);assert.deepEqual(f.writes,{native:1,matrix:1});assert.equal(f.matrix.read().generation.temperature,0);
  release();await first;f.holdNative(null);
  assert.equal(await f.assistant.apply(draft),2);assert.deepEqual(f.writes,{native:2,matrix:1});assert.equal(f.store.read().data.routes.global.model,'next-model');
  await f.assistant.apply(draft);assert.deepEqual(f.writes,{native:2,matrix:1});
 }finally{release();await first;}
});

test('native configuration scope and revision conflicts are typed before any persistence attempt',async()=>{
 const f=fixture(),before=f.store.read();
 await assert.rejects(f.store.save(before.data,before.revision,'another-world'),error=>error.code==='CONFIG_SCOPE');assert.equal(f.writes.native,0);
 const changed=clone(before.data);changed.routes.global.model='confirmed-model';await f.store.save(changed,before.revision,before.key);
 await assert.rejects(f.store.save(before.data,before.revision,before.key),error=>error.code==='CONFIG_CONFLICT');assert.equal(f.writes.native,1);assert.equal(f.store.read().data.routes.global.model,'confirmed-model');
});
