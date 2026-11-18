import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../engine/catalog.json' with {type:'json'};
import {initializeState,materials} from '../engine/materials.mjs';
import {Runtime} from '../engine/runtime.mjs';
import {parseReply} from '../engine/reply.mjs';
import {recallNarrativePassages} from '../engine/narrative-recall.mjs';
import {taskSlots,slotText} from '../tables/slots.js';
import {historySendFixture} from './fixtures/history-send.mjs';
import {prepareMatrixSheets} from '../tables/foundation/engine.js';
import {describeReviewForms,editReviewDocument} from '../engine/review-form-document.mjs';

test('narrative read distinguishes the bound protagonist, focus, minor and offstage characters and keeps write forms identical',()=>{
 const scope={world_ref:'world',session_ref:'chat',branch_ref:'main'};
 const e=new Runtime(initializeState(catalog,scope));
 const actors=[
  ['player','沈川','主控','主控详档'],
  ['focus','陆弥','在场焦点','因果详档'],
  ['minor','候船人','在场次要','次要人物计划'],
  ['absent','离场人','离场索引','未公开离场动机']
 ];
 e.newRecord('T_STATIC_PLACES',{name:'候船棚'},'shed');
 e.newRecord('T_DYN_SCENE_SPACE',{name:'候船',place_ref:'shed',weather:'薄雾'},'scene');
 for(const [id,name,focus_level,short_term_plans]of actors){
  e.newRecord('T_CHAR_DOSSIER',{name,public_identity:id==='minor'?'暂避风的旅人':name,short_term_plans},id);
  e.newRecord('T_SYS_ENTITIES',{name,kind:'character'},id);
  e.newRecord('T_DYN_SCENE_PARTICIPANTS',{scene_ref:'scene',entity_ref:id,focus_level},'presence-'+id);
 }
 e.newRecord('T_CHAR_ANCHORS',{name:'敲木案',char_ref:'focus',actions:'焦点锚点证据'},'anchor');
 e.newRecord('T_DYN_ENTITY_STATE',{name:'当前状态',entity_id:'absent',inner_thought:'离场私密心声',thought_authorization:'用户曾允许'},'state');
 e.newRecord('T_STATIC_ITEMS_SKILLS',{name:'已废弃物品'},'removed');
 const removed=Object.entries(e.rows('X_RECORD_META')).find(([,r])=>r.values.record_id==='removed');
 e.set(['X_RECORD_META',removed[0],'record_status',[]],'废弃');
 const slots=materials(e,{...scope,narrativeReading:true,playerBinding:{database:true,entityId:'player',dossierId:'player'}});
 assert.match(slots.tisya_material_player_archive,/主控详档/);
 assert.match(slots.tisya_material_character_archives,/因果详档[\s\S]*记忆锚点：[\s\S]*焦点锚点证据/);
 assert.match(slots.tisya_material_present_entities,/暂避风的旅人/);
 assert.match(slots.tisya_material_cast_registry,/离场索引：离场人/);
 assert.doesNotMatch(Object.values(slots).join('\n'),/未公开离场动机|次要人物计划|离场私密心声|已废弃物品/);
 assert.match(slots.tisya_material_location_context,/^<SceneAndSpace>\n当前场景在候船棚。[\s\S]*薄雾/);
 assert.doesNotMatch(slots.tisya_material_location_context,/地点底档／已有|｜当前地点：/);
 assert.equal(slots.tisya_material_cell_prompts,materials(e,scope).tisya_material_cell_prompts);
});

test('the final model request receives narrative sentences and the event spine separately from the writable forms',async()=>{
 const e=new Runtime(initializeState(catalog));
 e.newRecord('T_STATIC_PLACES',{name:'候船棚'},'shed');
 e.newRecord('T_DYN_SCENE_SPACE',{name:'夜渡',place_ref:'shed',weather:'河面有雾'},'scene');
 e.newRecord('T_STATIC_ITEMS_SKILLS',{name:'封信',category:'信件',shape:'信背写有青鹭三叩'},'letter');
 e.newRecord('T_SYS_ENTITIES',{instance_name:'陆弥',kind:'unclassified'},'keeper');
 e.newRecord('T_DYN_ENTITY_STATE',{name:'实时状态',entity_id:'keeper',location_ref:'shed',posture:'守着木案'},'state');
 e.newRecord('T_DYN_EVENTS',{short_code:'01',title:'送信索引',time_original_text:'入夜',spine_digest:'陆弥验封后收下了信。',full_process:'冗长过程仅留在归档底表'},'event');
 const fixture=await historySendFixture({initialState:e.data});
 const {accepted,payload}=await fixture.send();
 assert.equal(accepted,true);
 const messages=payload.messages.map(({content})=>content);
 const scene=messages.filter(text=>text.startsWith('<SceneAndSpace>\n'));
 const asset=messages.find(text=>text.startsWith('<AssetContext>\n'));
 const state=messages.find(text=>text.startsWith('<CurrentState>\n'));
 const history=messages.find(text=>text.startsWith('<history_record>\n'));
 const forms=messages.find(text=>text.startsWith('<cells format="form">'));
 assert.equal(scene.length,1);
 assert.match(scene[0],/当前场景在候船棚。\n天气天象：河面有雾/);
 assert.match(asset,/封信（信件）。\n形态：信背写有青鹭三叩/);
 assert.match(state,/陆弥在候船棚，守着木案。/);
 assert.match(history,/e01\[入夜\]：陆弥验封后收下了信。/);
 assert.doesNotMatch([scene[0],asset,state,history].join('\n'),/／已有：|unclassified|送信索引|冗长过程仅留在归档底表/);
 assert.match(forms,/【当前场景与时钟／序号】/);
});

test('braced forms confirm a custom unit once and expose it in the next model request',async()=>{
 const e=new Runtime(initializeState(catalog)),f=await historySendFixture({initialState:e.data});
 const forms=prepareMatrixSheets({state:e.data},{task:'main',operationId:'braced-template'});
 const section=(id,values)=>{const t=forms.catalog.templates.find(table=>table.id===id);return '【'+t.label+'／1】\n'+Object.entries(values).map(([key,value])=>t.fields.find(field=>field.key===key).row+'{'+value+'} | P1').join('\n');};
 const dossier=forms.formSections.find(group=>group.tableId==='T_CHAR_DOSSIER').text;
 assert.match(dossier,/^3\{角色对外显示名称\}$/m);
 assert.match(dossier,/^4\{角色真名\}$/m);
 assert.match(dossier,/^5\{知情锁级\}$/m);
 assert.match(dossier,/^13\{年龄数值：N 单位/m);
 const write=async(cells,readArchive=false)=>{
  const archive=readArchive?'<archive format="form">'+section('T_DYN_EVENTS',{spine_digest:'沙桥来客以潮年记龄。'})+'</archive>':'<archive/>';
  f.ctx.chat.push({mes:'<reply><body>1 沙桥来客以潮年记龄。</body><cells format="form">'+cells+'</cells>'+archive+'</reply>'});
  await f.host.sync();const d=await f.host.listTurnReviews();
  await f.host.confirmTurn({...d.reviews.findLast(row=>row.status==='pending'),contextKey:d.contextKey,expectedRevision:d.revision});
 };
 const first=section('T_CHAR_DOSSIER',{name:'沙桥来客',age_raw:'18 潮年'})+'\n'+section('M_UNITS',{label:'潮年',dimension:'time',narrative:'沙桥当地的记龄单位'});
 const editor=describeReviewForms(e.data,{cells:first}).cells,age=editor.groups[0].rows.find(row=>row.key==='age_raw');
 assert.equal(editReviewDocument(editor,{[age.start]:'19 潮年'}),first.replace('18 潮年','19 潮年'));
 await write(first,true);
 f.ctx.chat.push({is_user:true,mes:'继续核对另一位人物。'});
 const next=await f.send(),contract=next.payload.messages.find(msg=>msg.content.startsWith('<cells format="form">')).content;
 assert(next.accepted);
 assert.match(contract,/单位表\n时间与年龄单位\{[^\n}]*潮年/);
 assert.equal((contract.match(/^知情锁级\{L1，L2，L3\}$/gm)??[]).length,1);
 assert(contract.indexOf('单位表\n')<contract.indexOf('【人物原点档案／序号】'));
 await write(section('T_CHAR_DOSSIER',{name:'沙桥长者',age_raw:'60潮年'}));
 const {state} = await f.host.export(),units=Object.entries(state.tables.M_UNITS);
 assert.equal(units.length,1);assert.equal(units[0][1].values.label,'潮年');
 assert.deepEqual(Object.values(state.tables.M_QUANTITIES).filter(row=>row.values.unit_ref===units[0][0]).map(row=>row.values.value).sort(),[18,60]);
});

test('recall returns only the approved matching paragraph from a selected source outside the window',()=>{
 const scope={branch_ref:'main'};
 const e=new Runtime(initializeState(catalog,scope));
 const reply='<reply><body>1 青鹭三叩是暗号。\n\n2 青鹭三叩不是要展示的第二段私话。</body><cells/><archive/></reply>';
 const source={...parseReply(reply,'old',1),branch:'main'};
 const key='main/old@1';
 e.data.runtime.sources[key]=source;
 e.data.runtime.archive_queue.push({status:'formal',source_key:key});
 e.newRecord('T_DYN_EVENTS',{title:'交接'},'event');
 e.record('T_DYN_EVENTS','event').metadata.archive_source={source_key:key,entry_id:'old',revision:1,body_sha256:source.body_sha256,paragraphs:['P1']};
 const history={window:{sourceIds:[]},recentSituation:{currentUser:{text:'青鹭三叩。当时说了什么？'}}};
 const message={id:'old',role:'assistant',floor:2,text:reply};
 const result=recallNarrativePassages(e.data,scope,history,[message]);
 assert.match(result,/第 2 层 P1/);
 assert.match(result,/青鹭三叩是暗号/);
 assert.doesNotMatch(result,/第二段|第 2 层 P2/);
 assert.equal(recallNarrativePassages(e.data,{branch_ref:'fork'},history,[message]),'');
 assert.equal(recallNarrativePassages(e.data,scope,{...history,window:{sourceIds:['old']}},[message]),'');
 assert.equal(recallNarrativePassages(e.data,scope,history,[{...message,hidden:true}]),'');
});

test('auxiliary slots preserve explicitly named external source and selected template once',()=>{
 const source='具名原始证据\n第二行';
 const slots=taskSlots('tableGenesis',{formContract:'tisya.simple-form/1',template:'所选引导',externalEvidence:[{name:'档案 A',text:source},{text:'无名资料'}]});
 assert.deepEqual(slots.evidence,[{name:'档案 A',text:source}]);
 assert.match(slotText('evidence',slots.evidence),/档案 A/);
 assert.equal(slots.genesis,'所选引导');
 assert.equal(slots.source.template,undefined);
});
