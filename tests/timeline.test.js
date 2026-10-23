import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTimeline,filterTimelineRows,storyTime,timelineLines} from '../tables/timeline.js';
import {defaultRegistry} from '../tables/schema.js';
import {project,prepareCommit} from '../tables/ledger.js';
import {snapshotAnchor,branchSeed} from '../tables/branches.js';
import {createNativeVectors} from '../tables/vectors.js';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
import {mountArchiveAtlas} from '../tables/atlas-ui.js';

const registry=defaultRegistry(),access={readers:['读者'],knowers:['a','b']};
const row=(id,table,values,source='s2')=>({id,table,rev:1,values,source,access,updatedAt:'2026-10-23T09:00:00Z'});
const actor=(id)=>row(id,'objects',{名称:id,类型:'character'});
function fixture(){
 const rows=[actor('a'),actor('b'),row('now','scene',{名称:'当前',当前时间:'2001-10-12 11:36',参与者:['a','b']}),
  row('old','events',{名称:'早年约定',时间:'1999-01-01 08:00',经过:'两人共同立下约定',参与者:['a','b']}),
  row('concurrent','events',{名称:'另一件同时发生的事',时间:'1999-01-01 08:00',参与者:['b']}),
  row('relative','events',{名称:'离开之前',时间:'出道前',参与者:['a'],前置事件:['old']}),
  row('unknown','events',{名称:'记不起日期的事',参与者:['a']}),
  row('memory','experiences',{名称:'约定的记忆',主体:'a',类别:'回忆',内容:'听见钟声便想起那次约定',锚点事件:['old']}),
  row('growth','growth',{名称:'学会等待',主体:'a',方面:'耐性',当前倾向:'愿意等候',锚点事件:['old']}),
  row('state','state',{名称:'伤势',对象:'a',字段:'伤势',值:'擦伤',锚点事件:['old'],生效时间:'2001-10-12 11:30'})];
 const changes=[{id:'old',after:rows.find(r=>r.id==='old')},{id:'state',after:rows.find(r=>r.id==='state')}];
 const anchor={id:'a-state',group:'g',row:'state',table:'state',source:'s2',worldTime:'2001-10-12 11:36',recordedAt:'2026-10-23T09:00:00Z',before:null,after:changes[1].after.values,evidence:'受伤'};
 return {registry,rows,anchors:[anchor],commits:[{id:'c',source:'s2',kind:'archive',changes,anchors:[anchor]}],last:'c',revision:7};
}
const chain=[{key:'s1',floor:1,role:'user'},{key:'s2',floor:2,role:'assistant'}];

test('one historical event anchor is shared by both lifelines and linked effects without copying event prose',()=>{
 const view=fixture(),before=structuredClone(view),t=buildTimeline(view,{sessionId:'branch-a',chain});
 assert.equal(t.entries.filter(e=>e.id==='event:old').length,1);
 assert(t.lifelines.find(l=>l.object==='a').anchors.includes('event:old'));assert(t.lifelines.find(l=>l.object==='b').anchors.includes('event:old'));
 for(const id of ['memory','growth','state'])assert(t.rows[id].anchors.includes('event:old'));
 assert.equal(JSON.stringify(t).includes('两人共同立下约定'),false);assert.deepEqual(view,before);
});
test('occurrence, discovery floor and storage timestamp remain distinct for flashbacks and simultaneous events',()=>{
 const t=buildTimeline(fixture(),{sessionId:'branch-a',chain}),old=t.entries.find(e=>e.id==='event:old'),state=t.entries.find(e=>e.id==='change:a-state');
 assert.equal(old.occurrence[0].value,'1999-01-01 08:00');assert.equal(old.recorded.source.floor,2);assert.equal(old.recorded.at,'2026-10-23T09:00:00Z');
 assert.equal(state.occurrence[0].value,'2001-10-12 11:30');assert.equal(state.recorded.storyTime.value,'2001-10-12 11:36');
 const concurrent=t.entries.find(e=>e.id==='event:concurrent');assert.equal(concurrent.occurrence[0].instant,old.occurrence[0].instant);assert.deepEqual(concurrent.before,[]);assert.deepEqual(concurrent.after,[]);
 assert(t.order.absolute.indexOf('event:old')<t.order.absolute.indexOf('record:state'));
});
test('relative and unknown times remain unresolved rather than borrowing the current story date',()=>{
 const t=buildTimeline(fixture(),{sessionId:'branch-a',chain}),relative=t.entries.find(e=>e.id==='event:relative'),unknown=t.entries.find(e=>e.id==='event:unknown');
 assert.equal(relative.occurrence[0].kind,'relative');assert.equal(relative.occurrence[0].instant,null);assert.deepEqual(relative.after,['event:old']);
 assert.equal(unknown.occurrence[0].kind,'unknown');assert.equal(unknown.recorded.storyTime.kind,'unknown');assert(t.order.unknown.includes('event:unknown'));
 assert.equal(storyTime('2001-02-31 08:00').kind,'unknown');assert.equal(storyTime('年月待核').kind,'unknown');
});
test('metadata range filtering keeps unknowns by default, supports explicit strictness and never compares recording floors to world dates',()=>{
 const view=fixture(),t=buildTimeline(view,{sessionId:'branch-a',chain}),filter={actors:['a'],from:'2001-10-12 00:00',to:'2001-10-13 00:00'};
 const selected=filterTimelineRows(view.rows,t,filter).map(r=>r.id);assert(!selected.includes('old'));assert(selected.includes('unknown'));assert(selected.includes('relative'));assert(selected.includes('state'));assert(!selected.includes('b'));
 assert.deepEqual(filterTimelineRows(view.rows,t,{...filter,includeUnknown:false}).map(r=>r.id),['state']);
 assert.deepEqual(filterTimelineRows(view.rows,t,{branch:'other'}),[]);assert(filterTimelineRows(view.rows,t,{anchors:['event:old']}).some(r=>r.id==='memory'));
 assert.throws(()=>filterTimelineRows(view.rows,t,{from:'明天'}),/明确日期/);assert.throws(()=>filterTimelineRows(view.rows,t,{from:'2001-10-13 00:00',to:'2001-10-12 00:00'}),/起点/);
});
test('real ledger replay and a snapshot fork exclude future events and preserve inherited source floors',()=>{
 const origin={id:'origin',kind:'origin',registry,bases:[actor('a'),actor('b')]},base={id:'branch-a',kind:'session',revision:0,pins:['a@1','b@1'],commits:[]},evidence='甲乙在1999-01-01 08:00作约，后来于2001-10-12 11:36兑现。';
 const op=(id,time,name)=>({id,table:'events',expected:0,values:{名称:name,时间:time,经过:evidence,参与者:['a','b']},access,evidence});
 let view=project(origin,base,['s1','s2']);const first=prepareCommit(view,{changes:[op('new:e1','1999-01-01 08:00','约定')]},{source:'s1',kind:'archive',evidence,allowedTables:['events']});base.commits.push(first.commit);base.revision++;
 view=project(origin,base,['s1','s2']);const second=prepareCommit(view,{changes:[op('new:e2','2001-10-12 11:36','兑现')]},{source:'s2',kind:'archive',evidence,allowedTables:['events']});base.commits.push(second.commit);base.revision++;
 const cut=project(origin,base,['s1']),t=buildTimeline(cut,{sessionId:'branch-a',chain});assert(!t.entries.some(e=>e.title==='兑现'));
 const loaded={origin:{data:origin},session:{data:base},view:project(origin,base,['s1','s2']),chain};
 const anchor=snapshotAnchor(loaded,{name:'约定时',cut:first.commit.id}),fork={...base,id:'branch-b',pins:[],commits:[],branchSeed:branchSeed(anchor)};
 const replay=project(origin,fork,[]),inherited=buildTimeline(replay,{sessionId:'branch-b',chain:[]});assert(!inherited.entries.some(e=>e.title==='兑现'));assert.equal(inherited.entries.find(e=>e.title==='约定').recorded.source.floor,1);assert.equal(inherited.rows[first.rows.find(r=>r.table==='events').id].branch,'branch-b');
});
test('vector indexes branch/time metadata before semantic queries and returns only original rows',async()=>{
 const view=fixture(),timeline=buildTimeline(view,{sessionId:'branch-a',chain}),calls=[],hashes=[];
 const vectors=createNativeVectors({getContext:()=>({extensionSettings:{vectors:{source:'openai',openai_model:'embed'}},getRequestHeaders:()=>({})}),fetcher:async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url,body});if(url.endsWith('/insert'))hashes.push(...body.items.map(i=>i.hash));return {ok:true,json:async()=>url.endsWith('/list')?[]:{hashes:hashes.slice(0,1),metadata:[{text:'外部伪造'}]}};}});
 const filter={actors:['a'],from:'2001-10-12 00:00',to:'2001-10-13 00:00',includeUnknown:false};
 const found=await vectors.search({scope:'branch-a',rows:view.rows,query:'伤势',topK:1,timeline,timelineFilter:filter});assert.deepEqual(found,[view.rows.find(r=>r.id==='state')]);
 const indexed=calls.filter(c=>c.url.endsWith('/insert')).flatMap(c=>c.body.items).map(i=>JSON.parse(i.text));assert.equal(indexed.length,1);assert.equal(indexed[0].timeline.branch,'branch-a');assert(indexed[0].timeline.anchors.includes('event:old'));
 await assert.rejects(vectors.search({scope:'branch-b',rows:view.rows,query:'伤势',topK:1,timeline}),/当前分支/);
 await assert.rejects(vectors.search({scope:'branch-a',rows:[{...view.rows[0],rev:99}],query:'伤势',topK:1,timeline}),/版本/);
});

test('explicit event ranges retain dates, intersect queries and keep overlapping anchors in one unordered group',()=>{
 const corpus=JSON.parse(readFileSync(new URL('./fixtures/generic-event-ranges.json',import.meta.url),'utf8')),names=[...new Set(corpus.events.flatMap(e=>e.participants.split('、')))];
 const rows=[...names.map((name,i)=>row('person'+i,'objects',{名称:name,类型:'character'})),...corpus.events.map((e,i)=>row('ev'+i,'events',{名称:e.name,时间:e.time,参与者:e.participants.split('、').map(n=>'person'+names.indexOf(n))},'s'+e.message))];
 const t=buildTimeline({registry,rows},{sessionId:'ranges',chain:corpus.events.map(e=>({key:'s'+e.message,floor:e.floor,role:'assistant'}))});
 assert.equal(corpus.events.length,10);for(let i=0;i<10;i++){const e=t.entries.find(e=>e.id==='event:ev'+i);assert.equal(e.occurrence[0].kind,'absolute',corpus.events[i].time);assert.equal(e.recorded.source.floor,corpus.events[i].floor);}
 const partial=filterTimelineRows(rows,t,{from:'2001-10-12 10:17',to:'2001-10-12 10:17',includeUnknown:false});assert(partial.some(e=>e.id==='ev0'));
 const overlap=fixture();overlap.rows.push(row('range','events',{名称:'并发窗口',时间:'1999-01-01 07:59—08:01',参与者:['a']}));const merged=buildTimeline(overlap,{sessionId:'b'}),group=merged.order.groups.find(g=>g.anchors.includes('event:range'));assert(group.anchors.includes('event:old'));assert(group.anchors.includes('event:concurrent'));
 assert.equal(storyTime('2001-10-12 23:59—00:01').kind,'unknown');assert.equal(storyTime('10:14—10:18').kind,'relative');assert.equal(storyTime('2001-02-31 10:14—10:18').kind,'unknown');
});

test('foundation prehistory and explicit state event links preserve ownership without granting knowledge or inferring co-commit causality',()=>{
 const v=fixture();v.rows.push(row('before','facts',{名称:'童年迁居',前史:{主体:'a',时期:'童年',参与者:['b']}}),row('legacy','objects',{名称:'遗留人物',类型:'character',属性:{前史:{时期:'少年时期'}}}));
 delete v.rows.find(r=>r.id==='state').values.锚点事件;delete v.anchors[0].after.锚点事件;
 const t=buildTimeline(v,{sessionId:'b'});for(const id of ['a','b'])assert(t.lifelines.find(l=>l.object===id).anchors.includes('record:before'));assert.equal(t.entries.find(e=>e.id==='record:legacy').occurrence[0].value,'少年时期');
 assert.deepEqual(t.rows.state.anchors.filter(a=>a.startsWith('event:')),[]);assert.equal(JSON.stringify(t).includes('knowers'),false);assert.deepEqual(v.rows[0].access,access);
 const text=timelineLines(t,'a');assert.match(text,/童年迁居/);assert.match(text,/约定的记忆/);assert.match(text,/学会等待/);assert.match(text,/伤势/);assert(!text.includes('event:old'));assert(!text.includes('两人共同立下约定'));
});

test('activities use start through progressed-to as a range while reversed or conflicting event dates stay unresolved',()=>{
 const v=fixture();v.rows.push(row('work','activities',{名称:'准备舞台',主体:'a',开始时间:'2001-10-12 10:00',推进至:'2001-10-12 12:00',状态:'进行'}),row('reversed','activities',{名称:'待核活动',主体:'a',开始时间:'2001-10-12 12:00',推进至:'2001-10-12 10:00',状态:'进行'}),row('conflict','events',{名称:'日期冲突',时间:'2001-10-12 10:00',时间范围:'2001-10-13 10:00',参与者:['a']}));
 const t=buildTimeline(v,{sessionId:'b'}),query={from:'2001-10-12 11:00',to:'2001-10-12 11:00',includeUnknown:false};assert(filterTimelineRows(v.rows,t,query).some(r=>r.id==='work'));assert(!filterTimelineRows(v.rows,t,query).some(r=>['conflict','reversed'].includes(r.id)));assert(t.order.unknown.includes('event:conflict'));assert(t.order.unknown.includes('record:reversed'));
});

test('deleted historical events retain a shared metadata anchor without returning as current facts',()=>{
 const v=fixture(),removed=v.rows.find(r=>r.id==='old');v.rows=v.rows.filter(r=>r.id!=='old');const a={id:'delete-old',row:'old',table:'events',source:'s2',before:removed.values,after:null,worldTime:'2001-10-12 11:36',recordedAt:'2026-10-23T09:00:00Z'};v.commits.push({id:'delete',anchors:[a],changes:[]});
 const t=buildTimeline(v,{sessionId:'b',chain}),event=t.entries.find(e=>e.id==='event:old');assert.equal(event.operation,'delete');assert.equal(event.occurrence[0].value,'1999-01-01 08:00');assert(t.lifelines.every(l=>l.anchors.includes('event:old')));assert(t.rows.memory.anchors.includes('event:old'));assert(!t.rows.old);assert(!JSON.stringify(t).includes(removed.values.经过));
});

test('live author atlas history links shared anchors and exports the same lifeline',async()=>{
 const v=fixture(),timeline=buildTimeline(v,{sessionId:'b',chain}),win=new Window(),root=win.document.createElement('div');win.document.body.append(root);let output;
 const data={live:true,registry,rows:v.rows,originRows:v.rows,originRegistry:registry,world:'测试',branch:'b',trace:[],revision:7,timeline};
 const ui=mountArchiveAtlas(root,data,{download:(name,text)=>output={name,text}});root.querySelector('[aria-label="打开a"]').click();await ui.settled();[...root.querySelectorAll('button')].find(b=>b.textContent==='履历').click();await ui.settled();
 assert.match(root.textContent,/约定的记忆/);assert.match(root.textContent,/学会等待/);assert(root.querySelector('[aria-label="打开早年约定"]'));
 [...root.querySelectorAll('button')].find(b=>b.textContent==='导出生命线').click();await ui.settled();assert.equal(output.text,timelineLines(timeline,'a'));assert.equal(output.name,'a-生命线.txt');
 root.querySelector('[aria-label="打开早年约定"]').click();await ui.settled();assert.equal(ui.state().selected,'old');ui.dispose();await win.happyDOM.close();
});
