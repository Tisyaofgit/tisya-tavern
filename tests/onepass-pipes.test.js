import test from 'node:test';import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {onePassReply} from './fixtures/onepass-reply.js';
import {parseOnePassReply} from '../onepass/reply.mjs';
import {parsePipeBlock,compilePipeRecords} from '../onepass/pipes.mjs';
import {prepareOnePassBatch} from '../onepass/tables.mjs';
import {defaultRegistry,upgradeRegistry} from '../tables/schema.js';
import {inspectMessage} from '../reader.js';
import {mountMessageVisual} from '../message-ui.js';
import {onePassEntries} from '../onepass/preset.mjs';
import {fullDefaultConfiguration,DEFAULT_MOODS} from '../six/preset.mjs';
const acl={readers:['读者'],knowers:[]};
const row=(id,table,values)=>({id,table,values,rev:1,access:structuredClone(acl),lockedFields:[],source:null});
const view=()=>({registry:defaultRegistry(),last:null,anchors:[],rows:[row('person-a','objects',{名称:'宋遥',类型:'character',描述:'整理铜铃'}),row('person-b','objects',{名称:'陆舟',类型:'character'}),row('place-a','objects',{名称:'工坊',类型:'place'}),row('stock','holdings',{名称:'铜铃数量',物品:'person-a',所有者:['person-b'],数量:2}),row('flag','state',{名称:'持灯',对象:'person-a',字段:'持灯',值:true})]});
const snapshot=v=>({basis:'now',aliases:Object.fromEntries(v.rows.map((r,i)=>[String(i+1),r.id]))});
export function pipesReply({basis='now',memory='',status='',vars='',ids='[]',pending=''}={}){
 let s=onePassReply();for(const [k,text]of Object.entries({status,vars,memory,archive:'归档：'+basis+'|'+ids+(pending?'\n'+pending:'')}))s=s.replace(new RegExp('<'+k+' format="json">[\\s\\S]*?</'+k+'>'),'<'+k+' format="pipes">\n'+text+'\n</'+k+'>');return s;
}
const memory='共用：清晨|3|1、2|P1、P2|读者|1\n事件：+E1|~|=|宋遥垫住铃口|铜铃停下\n事实发现：+F1|1、3|擦布可以垫铃|当前场合|=|目击|[]\n伏笔：+C1|1|铜铃放在工具盒里|埋设|读者|再次取用时|+E1\n倒计时：+T1|故事时间|清晨|午时|约定修好|约定取消|无|0|[]|等待\n前史：+F1|1|早年|3|1、2|学习修理|保留手艺\n关系底稿：+F1|1|2|同事|共事|协作|各负其责|仍在工坊\n隐情：+F1|1|磨损痕迹|获准查验|修理工作\n世界设定：+F1|生活|3|本工坊';
test('fixed-column full memory archive maps to the existing event/fact/clue/timer records and stable references',async()=>{
 const v=view(),state=snapshot(v),reply=parseOnePassReply(pipesReply({memory,ids:'+E1、+F1、+C1、+T1'}));
 const before=JSON.stringify(v),batch=await prepareOnePassBatch(v,reply,state,{key:'reply1'});assert.equal(JSON.stringify(v),before);assert.equal(batch.changes,4);const rows=batch.commits[0].changes.map(c=>c.after),event=rows.find(r=>r.table==='events'),fact=rows.find(r=>r.table==='facts');
 assert.equal(event.values.参与者[0],'person-a');assert.equal(event.values.原文段落.length,2);assert.match(event.values.原文段落[0],/铜铃/);assert.equal(fact.values.生效时间,'清晨');assert.equal(fact.values.前史.主体,'person-a');assert.equal(fact.values.关系底稿.对象,'person-b');assert.equal(fact.values.世界设定.领域,'生活');assert.equal(rows.find(r=>r.table==='clues').values.事件[0],event.id);assert.equal(rows.find(r=>r.table==='timers').values.到期轮次,0);
});
test('state owns cognition and all habit fields; values preserve zero and false without a second writer',async()=>{
 const v=view(),state=snapshot(v),habit=['+H1','=','2','+E1','习惯','修理铜铃','先垫软布','专注','紧急时省略','示范','不替人做决定','避免损伤','师傅教过','留意铃口','垫布、扶稳','专注','先放稳','铃口碰响','单方联想','单次观察','有效'].join('|');
 const status='共用：清晨|1|P1|读者|1\n认知：+K1|=|+F1|目击|K3|知道擦布可垫铃|专注|本段直接展示\n习惯锚点：'+habit+'\n描述：1|objects.描述|正在修铃';
 const vars='共用：1|P1\n变量：4|holdings.数量|2|0\n变量：5|state.值|true|false';
 const reply=parseOnePassReply(pipesReply({memory,status,vars,ids:'+E1、+F1、+C1、+T1、+K1、+H1、1、4、5'}));const batch=await prepareOnePassBatch(v,reply,state,{key:'reply2'});assert.equal(batch.changes,9);const rows=batch.commits[0].changes.map(c=>c.after),h=rows.find(r=>r.table==='experiences');assert.equal(h.values.内在动因,'避免损伤');assert.deepEqual(h.values.动作,['垫布','扶稳']);assert.equal(h.values.确定性,'单次观察');assert.equal(rows.find(r=>r.id==='stock').values.数量,0);assert.equal(rows.find(r=>r.id==='flag').values.值,false);
});
test('wire separates records and lists only before decoding escaped literal characters',()=>{
 const r=parsePipeBlock(String.raw`共用：~|[]|[]|P1|读者|[]
事件：+E1|~|[]|甲\|乙\&amp;丙\、丁&amp;事实发现：+F1|[]|小于&lt;三与\&amp;amp;实体`, 'memory');assert.equal(r.rows.length,2);const v=view(),reply=parseOnePassReply(pipesReply({memory:String.raw`共用：~|[]|[]|P1|读者|[]
事件：+E1|~|[]|甲\|乙\&amp;丙\、丁`,ids:'+E1'}));const p=compilePipeRecords(v,reply,snapshot(v));assert.equal(p.changes[0].values.经过,'甲|乙&丙、丁');
});
test('missing references/evidence, mismatched basis, extra columns, wrong enum and stale values reject atomically',async()=>{
 const v=view(),state=snapshot(v),base=pipesReply({memory,ids:'+E1、+F1、+C1、+T1'}),before=JSON.stringify(v);
 for(const bad of [base.replace('归档：now','归档：old'),base.replace('P1、P2','P99'),base.replace('事实发现：+F1|1、3','事实发现：+F1|99'),base.replace('埋设|读者','随便|读者'),base.replace('+C1、+T1</archive>','+C1</archive>'),base.replace('当前场合|=|目击|[]','当前场合|=|目击|[]|额外')].filter(s=>s!==base))await assert.rejects(async()=>prepareOnePassBatch(v,parseOnePassReply(bad),state,{key:'x'}));
 const badVar=pipesReply({vars:'共用：1|P1\n变量：5|state.值|false|true',ids:'5'});await assert.rejects(async()=>prepareOnePassBatch(v,parseOnePassReply(badVar),state,{key:'x'}),/原值/);assert.equal(JSON.stringify(v),before);
});
test('unprovided, explicit clear and actual empty list stay distinct on update',async()=>{
 const v=view();v.rows.push(row('event-old','events',{名称:'旧事',经过:'原经过',结果:'原结果',标签:['旧标签']}));const state=snapshot(v);
 const cells=['6','~','~','~','!','~','~','~','~','~','~','~','~','~','~','~','[]'];const reply=parseOnePassReply(pipesReply({memory:'共用：~|~|~|P1|~|~\n事件：'+cells.join('|'),ids:'6'}));const b=await prepareOnePassBatch(v,reply,state,{key:'x'}),next=b.commits[0].changes[0].after;assert.equal(next.values.经过,'原经过');assert.equal(Object.hasOwn(next.values,'结果'),false);assert.deepEqual(next.values.标签,[]);assert.deepEqual(next.access,acl);
});
test('all old data survives additive optional schema registration',()=>{
 const old=defaultRegistry();delete old.tables.find(t=>t.id==='facts').fields.前史;delete old.tables.find(t=>t.id==='experiences').fields.内在动因;const before=JSON.stringify(old),next=upgradeRegistry(old);assert.equal(JSON.stringify(old),before);assert(next.tables.find(t=>t.id==='facts').fields.前史);assert(next.tables.find(t=>t.id==='experiences').fields.内在动因);
});
test('one malformed before row preserves every valid panel, title, after and original text; it is not accepted for archive',async()=>{
 const source=onePassReply().replace('设计|宋遥|','设计|'),snapshot=source,result=inspectMessage(source);assert.equal(result.details.value.diagnostics.length,1);assert(result.details.value.rounds.tasks.some(x=>x.label==='文风用词'));assert.equal(result.actions.value.length,4);assert.throws(()=>parseOnePassReply(source));
 const w=new Window(),d=w.document,host=d.createElement('div');d.body.append(host);w.IntersectionObserver=class{observe(){}disconnect(){}};const ui=mountMessageVisual(d,host,{source,formatBody:x=>x,getMotion:()=>false});const r=ui.host.shadowRoot;assert(r.querySelector('.draft-ledger'));assert(r.querySelector('.audit-ledger'));assert(r.querySelector('.summary-diagnostic'));assert.match(r.querySelector('.summary-diagnostic').textContent,/COLUMNS/);assert.equal(source,snapshot);ui.dispose();await w.happyDOM.abort();
});
test('approved literary dimensions coexist with the unmodified authority rules and current controls',()=>{
 const c=fullDefaultConfiguration(),m=c.world.modes.narrative;m.summary=false;m.actions=false;m.heartDirections=['输入评价'];m.narrative.缇斯亚叙事信息迷雾=false;m.narrative.缇斯亚叙事步序=['资料承接','成稿总检'];
 const e=onePassEntries(c,DEFAULT_MOODS);assert.match(e.tisya_registry,/CREATIVE.CONTRACT/);assert.match(e.tisya_registry,/<actions\/>/);assert.doesNotMatch(e.tisya_registry,/^文风用词\|/m);assert.doesNotMatch(e.tisya_registry,/^剧情吐槽\|/m);assert.match(e.tisya_inner_chain,/资料承接 —/);assert.doesNotMatch(e.tisya_inner_chain,/人物反应 —/);assert.match(e.tisya_material_rule_material,/PROHIBITED: deifying the player/);assert.match(e.tisya_material_rule_material,/ProhibitedWordsAndPatterns/);
});


test('nested explicit clear removes only the optional field and respects existing manual locks',async()=>{
 const v=view();v.rows.push(row('fact-old','facts',{名称:'旧事实',命题:'修铃手艺',前史:{主体:'person-a',时期:'早年',后果:'仍在练习'}}));const state=snapshot(v),reply=parseOnePassReply(pipesReply({memory:'共用：~|[]|1|P1|~|~\n事实发现：6|=|~\n前史：6|=|!|~|~|~|熟练修铃',ids:'6'}));
 const b=await prepareOnePassBatch(v,reply,state,{key:'nested'}),fact=b.commits[0].changes[0].after;assert.equal(fact.values.前史.主体,'person-a');assert.equal(Object.hasOwn(fact.values.前史,'时期'),false);assert.equal(fact.values.前史.后果,'熟练修铃');v.rows.at(-1).lockedFields=['前史'];await assert.rejects(prepareOnePassBatch(v,reply,state,{key:'locked'}),/锁定/);
});


test('a named but empty archival row and fabricated original quotation cannot count as delivered memory',async()=>{
 const v=view(),state=snapshot(v);
 for(const memory of ['共用：~|[]|[]|P1|读者|[]\n事件：+E1','共用：~|[]|[]|P1|读者|[]\n事实发现：+F1|[]|旧事\n前史：+F1|~|~|~|~|~|~|~|未曾说过的引用']){
  const reply=parseOnePassReply(pipesReply({memory,ids:memory.includes('+F1')?'+F1':'+E1'}));await assert.rejects(prepareOnePassBatch(v,reply,state,{key:'empty'}));
 }
});
