import test from 'node:test';
import assert from 'node:assert/strict';
import {historyBody,projectHistoryLayers,sourceVersion} from '../engine/history-layers.mjs';
import {configureTags} from '../engine/tags.mjs';
const wrap=body=>'<reply><task>不可进入近期</task><body>'+body+'</body><extra>额外区块</extra><archive>机器归档</archive><actions>选项</actions></reply>';
const m=(id,floor,role,text)=>({id,floor,role,text,scope:'s',revision:1});
const messages=[m('u1',1,'user','旧用户秘密甲'),m('a1',2,'assistant',wrap('1 他在第2026号门前留下约定。\n\n2 明日见。')),m('u2',3,'user','旧用户秘密乙'),m('a2',4,'assistant',wrap('1 你抵达渡口。')),m('u3',5,'user','上一条用户原文 <x> &'),m('a3',6,'assistant',wrap('1 沈青接过信。')),m('u4',7,'user','本轮继续，保留格式。')];
const archive=(id,source,text,extra={})=>({id,factId:id,scope:'s',status:'confirmed',text,source:{messageId:source.id,version:sourceVersion(source)},...extra});
test('history keeps only the complete chain head and leaves older prose to timeline recall',()=>{
 const result=projectHistoryLayers({messages,scope:'s',historyCount:4,archives:[archive('old',messages[1],'已确认远史约定。')]});
 assert.deepEqual(result.recentBodies,[]);assert.equal(result.layers.recentBody,'');assert.equal(result.chainHead.assistantBody,'沈青接过信。');assert(result.audit.some(x=>x.id==='a2'&&x.layer==='timeline_source'));
 assert.equal(result.recentSituation.previousUser.text,messages[4].text);assert.equal(result.recentSituation.assistant.text,messages[5].text);assert.equal(result.recentSituation.currentUser.text,messages[6].text);
 const all=Object.values(result.layers).join('');assert(!all.includes('旧用户秘密'));assert(!result.layers.recentBody.includes('额外区块'));assert(!result.layers.recentBody.includes('机器归档'));assert.match(result.layers.recentSituation,/上轮正文\n沈青接过信/);assert.doesNotMatch(all,/额外区块|机器归档|CDATA|<reply>/);
 assert.equal((all.match(/沈青接过信/g)??[]).length,1);assert(all.includes('已确认远史约定'));
});
test('paragraph markers only are removed; source prose digits and fenced content remain',()=>{
 const raw=wrap('1 他带着12枚钱。\r\n\r\n2 ```txt\r\n1 keep this code\r\n```');const body=historyBody(raw);
 assert.equal(body,'他带着12枚钱。\r\n\r\n```txt\r\n1 keep this code\r\n```');assert(raw.includes('1 他带着12枚钱'));
 assert.equal(historyBody(wrap('2026年下雪。')),'2026年下雪。');assert.equal(historyBody('<reply><boby>1 旧拼写。</boby><extra>别录</extra></reply>'),'旧拼写。');
});
test('custom body aliases use the shared envelope reader',()=>{configureTags({body:'storyBody'});try{assert.equal(historyBody('<reply><storyBody>1 正文。</storyBody><extra>旁栏</extra></reply>'),'正文。');}finally{configureTags();}});
test('reviewed fact coverage deduplicates by information identity, preserving independent knowledge',()=>{
 const source=messages[3],coverage=[{reviewed:true,messageId:source.id,version:sourceVersion(source),block:'body',quote:'你抵达渡口。'}];
 const a=archive('arrival',source,'你已经到了渡口。',{coverage}),b=archive('secret',source,'沈青仍不知信件内容。');
 const r=projectHistoryLayers({messages,scope:'s',historyCount:5,archives:[a,b,{...a,id:'duplicate'}]});
 assert.deepEqual(r.archiveUnits.map(x=>x.id),['arrival','secret']);assert(r.audit.some(x=>x.id==='arrival'&&x.layer==='history_record'));
});
test('same source is insufficient to remove independent facts; unreviewed or stale coverage is not trusted',()=>{
 const src=messages[3];const base=archive('keep',src,'单独核对的认知',{coverage:[{reviewed:false,messageId:src.id,version:sourceVersion(src),block:'body',quote:'你抵达渡口。'}]});
 assert.equal(projectHistoryLayers({messages,scope:'s',historyCount:6,archives:[base]}).archiveUnits.length,1);
 const stale={...base,coverage:[{...base.coverage[0],reviewed:true,version:'old'}]};assert.equal(projectHistoryLayers({messages,scope:'s',historyCount:6,archives:[stale]}).archiveUnits.length,1);
});
test('latest full reply owns covered archive facts and is excluded from recent body',()=>{
 const src=messages[5],unit=archive('letter',src,'沈青收到信',{coverage:[{reviewed:true,messageId:src.id,version:sourceVersion(src),block:'body',quote:'沈青接过信。'}]});
 const r=projectHistoryLayers({messages,scope:'s',historyCount:30,archives:[unit]});assert.equal(r.archiveUnits.length,0);assert(!r.recentBodies.some(x=>x.id==='a3'));assert(r.audit.some(x=>x.id==='letter'&&x.layer==='recent_situation'));
});
test('0/1 limits never restore old raw messages; latest triplet remains independently complete',()=>{for(const historyCount of [0,1]){const r=projectHistoryLayers({messages,scope:'s',historyCount});assert.equal(r.recentBodies.length,0);assert.equal(r.recentSituation.assistant.id,'a3');assert(!Object.values(r.layers).join('').includes('旧用户秘密'));}});
test('latest complete reply also carries reviewed evidence spanning numbered paragraphs',()=>{
 const src={...messages[5],text:wrap('1 沈青接过信。\n\n2 她没有拆开。')},text=historyBody(src.text);
 const unit=archive('whole-latest',src,text,{coverage:[{reviewed:true,messageId:src.id,version:sourceVersion(src),block:'body',quote:text}]});
 const r=projectHistoryLayers({messages:messages.map(m=>m.id===src.id?src:m),scope:'s',archives:[unit]});
 assert.equal(r.archiveUnits.length,0);assert.equal(r.recentSituation.assistant.text,src.text);assert.equal((Object.values(r.layers).join('').match(/沈青接过信/g)??[]).length,1);
});
test('old malformed replies stay in the source store without entering chain-head parsing',()=>{const r=projectHistoryLayers({messages:[...messages.map(x=>x.id==='a2'?{...x,text:'纯文本旧回复 <extra>机器内容</extra>'}:x)],scope:'s',historyCount:5});assert(!r.recentBodies.some(x=>x.id==='a2'));assert(r.audit.some(x=>x.id==='a2'&&x.layer==='timeline_source'));});
test('unconfirmed/other-branch/deleted-source archive entries are excluded and conflicting fact IDs rejected',()=>{
 const unit=archive('x',messages[1],'旧约定');const r=projectHistoryLayers({messages,scope:'s',archives:[{...unit,status:'pending'},{...unit,id:'other',scope:'another'},{...unit,id:'stale',source:{...unit.source,version:'old'}}]});assert.equal(r.archiveUnits.length,0);
 assert.throws(()=>projectHistoryLayers({messages,scope:'s',archives:[unit,{...unit,id:'x2',text:'矛盾约定'}]}),/冲突/);
});
test('literal markup is escaped inside one XML block',()=>{
 const r=projectHistoryLayers({messages:[m('u',1,'user','</current_user> ]]> & <command>\n较早正文')],scope:'s',historyCount:10});
 assert.equal(r.recentSituation.assistant,null);assert(!r.layers.recentSituation.includes('<char_reply'));assert.doesNotMatch(Object.values(r.layers).join('\n'),/source=|floor=|missing=/);assert(r.layers.recentSituation.includes(']]&gt; &amp; &lt;command&gt;\n较早正文'));assert.equal(r.layers.historyRecord,'');
});
test('confirmed full archive passage subsumes the same reviewed point while independent knowledge survives',()=>{
 const source=messages[1],text=historyBody(source.text),link={reviewed:true,messageId:source.id,version:sourceVersion(source),block:'body'};
 const small=archive('appointment',source,'明日见。',{coverage:[{...link,quote:'明日见。'}]});
 const full=archive('full',source,text,{sourceFaithful:true,coverage:[{...link,quote:text}]});
 const knowledge=archive('knowledge',source,'另一个人的独立认知。');
 const r=projectHistoryLayers({messages,scope:'s',historyCount:0,archives:[small,full,knowledge]});assert.deepEqual(r.archiveUnits.map(x=>x.id),['full','knowledge']);assert.equal((r.layers.historyRecord.match(/明日见/g)??[]).length,1);
});
