import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Runtime} from '../engine/runtime.mjs';
import {initializeState,materials} from '../engine/materials.mjs';
import {applyPersonaEvent} from '../engine/persona.mjs';
import {applyOffstageDelta,offstageDiagnostics,personaRuleTemplates} from '../engine/offstage-life.mjs';
import {readFieldHistory} from '../engine/field-history.mjs';
import {acceptReply} from '../engine/reply.mjs';

const catalog=JSON.parse(readFileSync(new URL('../engine/catalog.json',import.meta.url)));
function fixture(){
 const e=new Runtime(initializeState(catalog,{world_ref:'world-a',branch_ref:'main'}));e.data.runtime.calendar={mode:'MONTH_FIXED',year:1,month:1,day:1};
 for(const [id,name,kind]of [['npc','远行药师','character'],['player','主控旅人','character'],['present','场内守卫','character'],['faction','渡口商会','organization']])e.newRecord('T_SYS_ENTITIES',{name,kind},id);
 e.newRecord('T_DYN_SCENE_SPACE',{name:'渡口'},'scene');e.newRecord('T_DYN_SCENE_PARTICIPANTS',{scene_ref:'scene',entity_ref:'present',focus_level:'在场焦点'},'presence');e.data.runtime.scope.scene_ref='scene';e.offstageContext.playerBinding={database:true,entityId:'player'};
 return e;
}
const base={world_ref:'world-a',dimension_group:'custom',slot_key:'custom.vigil',minimum:0,maximum:100,initial_value:0,rate_per_hour:10,threshold:20,release:10,goal:'守住各自关注的事项',candidate_action:'候选行动仍需前台确认',next_step:'核对线索后决定'};
const gauges=e=>Object.values(e.rows('T_DYN_ENTITY_GAUGES'));
const tasks=e=>Object.values(e.rows('T_DYN_TASKS'));

test('world defaults and object rules advance only eligible actors and push idempotent named candidates',()=>{
 const e=fixture();e.action('OFFSTAGE_RULE_REGISTER',{...base,name:'世界戒备',transaction_name:'世界默认巡查',task_name:'世界默认待办'},'rule:world');
 e.action('OFFSTAGE_RULE_REGISTER',{...base,name:'药师戒备',subject_ref:'npc',rate_per_hour:20,transaction_name:'药师整理药箱',task_name:'查看药师的药箱'},'rule:npc');
 e.action('OFFSTAGE_RULE_REGISTER',{...base,name:'商会戒备',subject_ref:'faction',rate_per_hour:30,task_category:'阵营',transaction_name:'商会盘点货源',task_name:'处理商会货源'},'rule:faction');
 const first=e.transaction('offstage:hour-1',{},()=>e.tick(60));assert.equal(first.status,'COMMITTED');assert.equal(first.result.offstage.skipped_player,1);assert.equal(first.result.offstage.skipped_present,1);assert.equal(first.result.offstage.tasks_created,2);
 assert.equal(gauges(e).length,2);assert.equal(gauges(e).find(row=>row.values.entity_id==='npc').values.value,20);assert.equal(gauges(e).find(row=>row.values.entity_id==='faction').values.value,30);
 assert.deepEqual(tasks(e).map(row=>row.values.name).sort(),['处理商会货源','查看药师的药箱']);assert.deepEqual(Object.values(e.rows('T_DYN_ACTIVITIES_LIFELINES')).map(row=>row.values.name).sort(),['商会盘点货源','药师整理药箱']);assert(tasks(e).every(row=>row.values.status==='发布'));assert(Object.values(e.rows('T_DYN_ACTIVITIES_LIFELINES')).every(row=>row.values.status==='等待'&&row.values.event_ref==null));assert.equal(Object.keys(e.rows('T_DYN_EVENTS')).length,0);
 e.transaction('offstage:hour-2',{},()=>e.tick(60));assert.equal(tasks(e).length,2);assert.equal(gauges(e).find(row=>row.values.entity_id==='npc').values.value,40);
 const before=JSON.stringify(e.data.runtime.receipts['offstage:hour-2']),replay=e.transaction('offstage:hour-2',{},()=>{throw Error('replay must not execute');});assert.equal(replay.status,'REPLAY');assert.equal(JSON.stringify(e.data.runtime.receipts['offstage:hour-2']),before);assert.equal(tasks(e).length,2);
 const projected=materials(new Runtime(e.data),{...e.data.runtime.scope,narrativeReading:true});assert.match(Object.values(projected).join('\n'),/查看药师的药箱/);
 const report=offstageDiagnostics(e.data);assert.deepEqual(Object.keys(report).sort(),['candidate_activities','gauges','pending_tasks','rules','windows'].sort());assert.equal(report.rules,3);assert(!JSON.stringify(report).includes('药师'));
});

test('an evidence-backed delta rearms a full slot and every change retains its legal story window',()=>{
 const e=fixture();const registration=e.action('OFFSTAGE_RULE_REGISTER',{...base,name:'药师戒备',subject_ref:'npc',rate_per_hour:20,transaction_name:'药师整理药箱',task_name:'查看药师的药箱'},'rule:npc');const ruleId=registration.result.rule_id;
 e.transaction('offstage:fill',{},()=>e.tick(60));const gauge=Object.entries(e.rows('T_DYN_ENTITY_GAUGES')).find(([,row])=>row.values.entity_id==='npc'),gaugeId=gauge[0];let result=e.action('OFFSTAGE_DELTA',{subject_ref:'npc',rule_id:ruleId,delta:-30,evidence:'正文明写药师已处理完紧急需求'},'delta:npc');assert.equal(result.status,'COMMITTED');assert.equal(result.result.before,20);assert.equal(result.result.after,0);
 e.transaction('offstage:rearm',{},()=>e.tick(60));assert.equal(tasks(e).length,2);const history=readFieldHistory(e.data,{tableId:'T_DYN_ENTITY_GAUGES',recordId:gaugeId,field:'value'});assert(history.length>=4);assert(history.every(item=>item.storyTime));const timeId=history.at(-1).storyTime,time=e.record('M_WORLD_TIME',timeId).values,advance=e.record('T_SYS_OFFSTAGE_ADVANCES',time.owner_row_uuid).values;assert.equal(time.owner_field,'legal_window_end');assert(advance.legal_window_start&&advance.legal_window_end);assert.equal(advance.actual_progress,'等待');
});

test('five faculties seven emotions and six desires use the unified scheduler without double ticking',()=>{
 const e=fixture();e.newRecord('T_CHAR_DOSSIER',{name:'远行药师',persona_dynamics:{values:{'instincts.食':84},rates:{'instincts.食':2},threshold:85,release:65}},'npc');assert.equal(personaRuleTemplates().length,32);
 const result=e.transaction('persona:hour-1',{},()=>e.tick(60));assert.equal(result.status,'COMMITTED');assert.equal(result.result.offstage.persona_ticks,1);let dynamics=e.rows('T_CHAR_DOSSIER').npc.values.persona_dynamics;assert.equal(dynamics.values['instincts.食'],86);assert.equal(dynamics.elapsedHours,1);assert.equal(dynamics.daily.length,1);assert.equal(tasks(e).length,1);assert.match(tasks(e)[0].values.source,/待办不是已发生事实/);
 e.transaction('persona:hour-2',{},()=>e.tick(60));dynamics=e.rows('T_CHAR_DOSSIER').npc.values.persona_dynamics;assert.equal(dynamics.elapsedHours,2);assert.equal(dynamics.daily.length,1);assert.equal(tasks(e).length,1);
 applyPersonaEvent(e,'npc',{id:'meal-evidence',kind:'delta',deltas:{'instincts.食':-30}});assert.equal(e.rows('T_CHAR_DOSSIER').npc.values.persona_dynamics.values['instincts.食'],58);
});

test('unknown custom slots stay unknown instead of becoming zero',()=>{
 const e=fixture(),input={...base,name:'未登记感受',subject_ref:'npc',initial_value:null};e.action('OFFSTAGE_RULE_REGISTER',input,'rule:unknown');const result=e.transaction('offstage:unknown',{},()=>e.tick(60));assert.equal(result.status,'COMMITTED');assert.equal(result.result.offstage.unknown_slots,1);assert.equal(gauges(e).length,0);assert.equal(tasks(e).length,0);
});

test('reply time settlement accepts executor-owned offstage writes and replays them once',()=>{
 const e=fixture();e.action('OFFSTAGE_RULE_REGISTER',{...base,name:'药师戒备',subject_ref:'npc',rate_per_hour:20,transaction_name:'药师整理药箱',task_name:'查看药师的药箱'},'rule:npc');
 const raw='<reply><body>1 时间经过了一小时。</body><cells>@TIME: tick(+60m)</cells><archive/></reply>',accepted=acceptReply(e,raw,'offstage-entry');assert.equal(accepted.status,'COMMITTED');assert(!accepted.result.warnings.some(warning=>warning.code==='CELL_FAILED'));assert.equal(tasks(e).length,1);const count=Object.keys(e.rows('T_SYS_OFFSTAGE_ADVANCES')).length,replay=acceptReply(e,raw,'offstage-entry');assert.equal(replay.status,'REPLAY');assert.equal(tasks(e).length,1);assert.equal(Object.keys(e.rows('T_SYS_OFFSTAGE_ADVANCES')).length,count);
});
