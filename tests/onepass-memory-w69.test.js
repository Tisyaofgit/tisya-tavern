import test from 'node:test';
import assert from 'node:assert/strict';
import {onePassReply} from './fixtures/onepass-reply.js';
import {parseOnePassReply,readOnePassDetails} from '../onepass/reply.mjs';
import {parsePipeBlock} from '../onepass/pipes.mjs';
import {prepareOnePassBatch} from '../onepass/tables.mjs';
import {defaultRegistry,upgradeRegistry} from '../tables/schema.js';
const access={readers:['读者'],knowers:[]};
const view=()=>({registry:defaultRegistry(),rows:[],last:null,anchors:[]});
function wire({memory='',status='',ids='[]',pending='',before=''}={}){
 let s=onePassReply({basis:'now'});
 for(const [k,text]of Object.entries({memory,status,vars:'',archive:'归档：now|'+ids+(pending?'\n'+pending:'')}))s=s.replace(new RegExp('<'+k+' format="json">[\\s\\S]*?</'+k+'>'),'<'+k+' format="pipes">\n'+text+'\n</'+k+'>');
 return s.replace('历史|E1','历史|E1\n'+before);
}
const state={basis:'now',aliases:{}};
const event=(id='+E1',dialogue='P2',original='P1')=>[id,'~','[]','铃口垫好了','可以继续检修','~',dialogue,'~','~','~','~','~','[]','[]','[]','[]','[]',original].join('|');
const memory='共用：清晨|[]|[]|P1|读者|[]\n事件：'+event();
test('reported optional placeholders and candidate annotations parse without rewriting the source or swallowing real column errors',()=>{
 const source=wire({before:'待定|~|~|~\n解锁|~|~|~'}).replace('候选|可以先把零件送回库房','候选|可以先把零件送回库房|等玩家决定');
 const copy=source,p=parseOnePassReply(source),details=readOnePassDetails(source);
 assert.equal(details.diagnostics.length,0);assert(!p.publicReply.before.some(r=>r.kind==='待定'||r.kind==='解锁'));assert.match(details.rounds.candidates[0].text,/等玩家决定/);assert.equal(source,copy);
 assert.throws(()=>parseOnePassReply(source.replace('待定|~|~|~','待定|缺少日期|未知|来源')),{code:'TISYA_V3_REPLY_BEFORE_LINE_10_COLUMNS'});
 assert.throws(()=>parseOnePassReply(source.replace('设计|宋遥|想把日程说清|留下可以拒绝的空隙','设计|宋遥|多余|想把日程说清|留下可以拒绝的空隙')));
 assert.equal(parsePipeBlock('描述：~|~|~|~|~','status').rows.length,0);
 assert.equal(parsePipeBlock('待定：~|~|~','archive').rows.length,0);
 assert.equal(parsePipeBlock('待定：~|缺少日期|确认日期','archive').rows.length,1);
});
test('dialogue paragraph references retain original wording once and bind IDs to the exact source; pending placeholders create nothing',async()=>{
 const s=wire({memory,status:'描述：~|~|~|~|~',ids:'+E1',pending:'待定：~|~|~'}),v=view(),before=JSON.stringify(v);
 const b=await prepareOnePassBatch(v,parseOnePassReply(s),state,{key:'selected-source'}),e=b.commits[0].changes[0].after;
 assert.equal(b.changes,1);assert.deepEqual(b.pending,[]);assert.equal(e.values.台词,'P2');assert.deepEqual(e.values.原文段号,['P1','P2']);assert.equal(e.values.原文来源,'selected-source');assert.equal(e.values.原文段落[1],'“今天。”她说，“你有空吗？”');assert.equal(JSON.stringify(e.values).split('你有空吗').length-1,1);assert.equal(JSON.stringify(v),before);
 await assert.rejects(prepareOnePassBatch(v,parseOnePassReply(s.replace('~|P2|~','~|P99|~')),state,{key:'selected-source'}),/段号不存在/);
});
test('V3 archive safeguards apply to one-pass changes: locks and newer current-state sources reject whole batches',async()=>{
 const v=view();v.rows=[{id:'event-old',table:'events',rev:1,values:{名称:'旧事件',经过:'已有事实'},access,source:'later',lockedFields:[]}];const snapshot={...state,aliases:{'1':'event-old'}},s=wire({memory:'共用：清晨|[]|[]|P1|~|~\n事件：'+event('1','~','~'),ids:'1'});
 const current=view();current.rows=[{id:'person',table:'objects',rev:1,values:{名称:'宋遥',类型:'character'},access,source:'old',lockedFields:[]},{id:'belief',table:'cognition',rev:1,values:{名称:'判断',主体:'person',认识:'原判断'},access,source:'later',lockedFields:[]}];const update=wire({status:'共用：清晨|[]|P1|~|~\n描述：1|cognition.认识|新判断',ids:'1'});await assert.rejects(prepareOnePassBatch(current,parseOnePassReply(update),{...state,aliases:{'1':'belief'}},{key:'earlier',sourceOrder:{earlier:1,later:2}}),/更晚楼层/);
 v.rows[0].lockedFields=['经过'];await assert.rejects(prepareOnePassBatch(v,parseOnePassReply(s),snapshot,{key:'same'}),/人工锁定/);
});
test('optional original ID/source metadata upgrades without changing saved records or custom fields',()=>{
 const r=defaultRegistry(),fields=r.tables.find(t=>t.id==='events').fields;delete fields.原文来源;delete fields.原文段号;fields.自定义={type:'text'};const before=JSON.stringify(r),next=upgradeRegistry(r);
 assert.equal(JSON.stringify(r),before);const upgraded=next.tables.find(t=>t.id==='events').fields;assert.equal(upgraded.原文来源.type,'text');assert.equal(upgraded.原文段号.type,'texts');assert.equal(upgraded.自定义.type,'text');
});
test('dialogue reference updates preserve their original source or require explicit rebinding instead of silently changing their text',async()=>{
 const v=view(),first=await prepareOnePassBatch(v,parseOnePassReply(wire({memory,ids:'+E1'})),state,{key:'original-source'}),saved=first.commits[0].changes[0].after;
 v.rows=[saved];const snapshot={...state,aliases:{'1':saved.id}},update=wire({memory:'共用：午时|[]|[]|P1|~|~\n事件：'+event('1','~','~'),ids:'1'});
 const next=(await prepareOnePassBatch(v,parseOnePassReply(update),snapshot,{key:'later-source'})).commits[0].changes[0].after;
 assert.equal(next.values.台词,'P2');assert.equal(next.values.原文来源,'original-source');assert.deepEqual(next.values.原文段落,saved.values.原文段落);
 await assert.rejects(prepareOnePassBatch(v,parseOnePassReply(wire({memory:'共用：午时|[]|[]|P1|~|~\n事件：'+event('1','~','P1'),ids:'1'})),snapshot,{key:'later-source'}),/重申或明确清除/);
 const ordered=(await prepareOnePassBatch(view(),parseOnePassReply(wire({memory:'共用：清晨|[]|[]|P2、P1|读者|[]\n事件：'+event('+E1','P2、P1','P2、P1'),ids:'+E1'})),state,{key:'ordered'})).commits[0].changes[0].after;
 assert.deepEqual(ordered.values.原文段号,['P1','P2']);assert.match(ordered.values.原文段落[0],/铜铃/);
});
