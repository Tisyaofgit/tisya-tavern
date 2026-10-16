import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {KEY,emptyConfig,defaultWorld,worldKey,createStore,contextOwner,compileSelected} from '../config/core.js';
import {createHost} from '../config/host.js';
import {historyWindow} from '../config/history-context.js';
import {isolateComposerDraft} from '../config/composer-draft.js';
import {configureTableContinuity} from '../tables/continuity.js';
import {styleRules,scanStyle} from '../tables/style-rules.js';

function fixture(){
 const d=emptyConfig(),c={chatId:'controlled',characterId:0,name1:'旅人',characters:[{avatar:'test.png',name:'守门人',description:'RAW_CARD_CANARY',data:{description:'RAW_CARD_CANARY',personality:'RAW_PERSONALITY_CANARY',scenario:'RAW_SCENARIO_CANARY',mes_example:'RAW_EXAMPLE_CANARY'}}],chatMetadata:{},powerUserSettings:{persona_description:'RAW_PERSONA_CANARY'},chat:[{is_user:true,mes:'OLD_INPUT_CANARY'},{is_user:false,mes:'<reply><body>上一条实际正文。</body><memory>OLD_MEMORY_CANARY</memory><task>OLD_TASK_CANARY</task><status>OLD_STATUS_CANARY</status><vars>OLD_VARS_CANARY</vars></reply>'},{is_user:true,mes:'他再次轻敲了门框。'}],extensionSettings:{[KEY]:d},chatCompletionSettings:{model:'test-model'},getChatCompletionModel:()=> 'test-model',getRequestHeaders:()=>({}),stopGeneration(){}};
 const key=worldKey(c),w=d.worlds[key]=defaultWorld();w.context.history=1;w.context.owner='native';w.context.books=['unselected'];w.context.entries=[{book:'unselected',uid:1}];w.tables={enabled:true,continuity:'tables',injection:'direct'};
 const prompts=[{identifier:'main',content:'CONTROLLED_SYSTEM'},{identifier:'charDescription',marker:true},{identifier:'charPersonality',marker:true},{identifier:'scenario',marker:true},{identifier:'dialogueExamples',marker:true},{identifier:'personaDescription',marker:true},{identifier:'externalMacro',content:'{{description}}'},{identifier:'material',content:'{{tisya_config_selected}}'},{identifier:'tisya_material_current_state',content:''},{identifier:'chatHistory',marker:true}];
 const source={prompts,order:prompts.map(p=>({identifier:p.identifier,enabled:true}))};
 c.substituteParams=s=>s.replaceAll('{{description}}','RAW_MACRO_CANARY');
 c.getPresetManager=()=>({getAllPresets:()=>['preset'],getSelectedPresetName:()=> 'preset'});
 const store=createStore({getContext:()=>c,persist:async()=>true}),host=createHost({getContext:()=>c,getSource:()=>source,store,createParameters:async(s,model,type,messages)=>({generate_data:{model,messages}})});
 return {d,c,w,key,host};
}
test('tables-only main request carries exactly prior prose plus current user and the assembled identity once',async()=>{
 const f=fixture();f.d.resources=[{id:'bookcopy',name:'外部原书',kind:'requirement',content:'RAW_BOOK_CANARY',source:{book:'unselected',uid:1}},{id:'style',name:'选择文风',kind:'style',content:'SELECTED_STYLE'}];f.w.modes.narrative.selected=['bookcopy','style'];
 assert.equal(contextOwner(f.w),'tisya');assert.deepEqual(compileSelected(f.d,f.w).ids,['style']);
 const saved=structuredClone(f.w);await f.host.before('normal');f.host.attachTableContext({world:f.key,slots:{state:{identity:'EXACT_USER_DEFINITION',knowledge:'仅亲历者知情'}},instructions:'READ_CONFIRMED_TABLES'});
 f.host.attachTableActivation({world:f.key,text:'RAW_RECURSIVE_WORLD_CANARY'});
 const p={messages:[{role:'system',content:'RAW_NATIVE_DEPTH_CANARY'}],tools:[{name:'UNSELECTED_TOOL'}]};await f.host.payloadReady(p);
 const bytes=JSON.stringify(p);assert.doesNotMatch(bytes,/RAW_|OLD_|UNSELECTED_TOOL/);assert.match(bytes,/SELECTED_STYLE/);assert.equal((bytes.match(/EXACT_USER_DEFINITION/g)??[]).length,1);
 assert.deepEqual(p.messages.filter(m=>['assistant','user'].includes(m.role)),[{role:'assistant',content:'上一条实际正文。'},{role:'user',content:'他再次轻敲了门框。'}]);assert.deepEqual(f.w,saved);
});
test('tables-only sends no request when the current table assembly is missing',async()=>{
 const f=fixture();await f.host.before('normal');const p={messages:[]};await assert.rejects(f.host.payloadReady(p),/表单组装尚未就绪/);assert.throws(()=>JSON.stringify(p),/表单组装尚未就绪/);
});
test('history counts each sent user and assistant separately, never inferred pairs',()=>{
 const world={context:{history:2}},chat=[{mes:'a0'},{is_user:true,mes:'u1'},{is_user:true,mes:'u2'},{mes:'a3'},{is_user:true,mes:'current'}];
 assert.deepEqual(historyWindow({chat},world).recent.map(r=>r.message.mes),['u2','a3','current']);
 world.context.history=1;assert.deepEqual(historyWindow({chat:chat.slice(0,-1)},world).recent.map(r=>r.message.mes),['a3']);
 const swipe=[...chat,{mes:'discarded'}];assert.deepEqual(historyWindow({chat:swipe},world,'swipe').recent.map(r=>r.message.mes),['a3','current']);
 world.context.history=0;assert.deepEqual(historyWindow({chat:chat.slice(0,-1)},world,'continue').recent.map(r=>r.message.mes),['a3']);
});
test('continuity configuration keeps explicit native MVU choice while excluding raw context',()=>{
 const w=defaultWorld();w.tables={enabled:true,continuity:'tables'};w.modes.narrative.nativeMvu='auto';configureTableContinuity(w);assert.equal(w.modes.narrative.nativeMvu,'auto');assert.equal(w.context.card,false);assert.equal(w.context.persona,false);assert.equal(w.context.owner,'tisya');
});
test('composer draft isolates commands and bias, restores selection, and restoration runs once',()=>{
 const w=new Window();w.document.body.innerHTML='<textarea id="send_textarea"></textarea>';const input=w.document.querySelector('textarea');input.value='/not-sent {{bias}}';input.setSelectionRange(2,6);
 const restore=isolateComposerDraft(w.document,{text:'configured continuation'});assert.equal(input.value,'configured continuation');assert.equal(input.readOnly,true);input.value='';assert.equal(restore(),true);assert.equal(input.value,'/not-sent {{bias}}');assert.equal(input.selectionStart,2);assert.equal(input.selectionEnd,6);assert.equal(input.readOnly,false);
 input.value='new draft after payload';assert.equal(restore(),false);assert.equal(input.value,'new draft after payload');w.happyDOM.abort();
});
test('composer restoration cannot overwrite the newly selected chat',()=>{
 const w=new Window();w.document.body.innerHTML='<textarea id="send_textarea">old draft</textarea>';let scope='old',unrestored;const restore=isolateComposerDraft(w.document,{scope,getScope:()=>scope,onUnrestored:value=>unrestored=value});scope='new';const input=w.document.querySelector('textarea');input.value='new chat draft';assert.equal(restore(),false);assert.equal(input.value,'new chat draft');assert.equal(unrestored.value,'old draft');w.happyDOM.abort();
});
test('explicit banned words are detected and the saved off switch actually disables them',()=>{
 const rows=styleRules({});assert.deepEqual(scanStyle('极其；生理性',rows).map(h=>h.text).sort(),['极其','生理性'].sort());for(const row of rows)if(['极其','生理性'].includes(row.pattern))row.enabled=false;assert.deepEqual(scanStyle('极其；生理性',styleRules({styleRules:rows})),[]);
});

