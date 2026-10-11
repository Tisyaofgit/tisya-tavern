'use strict';
const {parse}=require('./world/strict-json.cjs');
const {prune}=require('./actor-service.cjs');
const PROTOCOL='tisya.lab.memory/3';
const EMPTY={protocol:PROTOCOL,关联:[],事件:[],未完事项:[],倒计时:[]};
const EVENT={标题:'',时间:{起:null,止:null},地点:[],参与者:[],梗概:'',结果:[],影响:null,原文:null,伏笔:[],认知:[],公开范围:'视角已知',设定变动:[],设定原因:null,标签:[]};
const fail=(code,detail)=>{throw Object.assign(Error('TISYA_STORY_'+code),{code:'TISYA_STORY_'+code,detail});};
const exact=(v,ks)=>{if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).sort().join()!==ks.slice().sort().join())fail('COMPLETE');};
const text=(s,max=3000,nullable=false)=>{if(nullable&&s===null)return;if(typeof s!=='string'||!s.trim()||s.length>max)fail('TEXT');};
const list=(xs,max=32)=>{if(!Array.isArray(xs)||xs.length>max)fail('LIST');};
const strings=(xs,max=32)=>{list(xs,max);xs.forEach(x=>text(x,200));if(new Set(xs).size!==xs.length)fail('DUPLICATE');};
function validateMemory(q,{body}={}){
 if(q?.protocol==='tisya.lab.memory/5')return require('./memory-permissions.cjs').validate(q,{body});
 exact(q,Object.keys(EMPTY));const modern=q.protocol==='tisya.lab.memory/4';if(!modern&&q.protocol!==PROTOCOL)fail('PROTOCOL');strings(q.关联);list(q.事件,12);
 const titles=new Set();for(const e of q.事件){exact(e,[...Object.keys(EVENT),...(modern?['世界','角色心理','知情者']:[])]);text(e.标题,120);if(!modern&&titles.has(e.标题))fail('DUPLICATE');titles.add(e.标题);exact(e.时间,['起','止']);text(e.时间.起,100,true);text(e.时间.止,100,true);strings(e.地点);strings(e.参与者);text(e.梗概);strings(e.结果,64);text(e.影响,3000,true);text(e.原文,12000,true);
  if(e.原文!==null&&typeof body==='string'&&!(modern?body.includes(e.原文):require('./body-count.cjs').visibleText(body).includes(require('./body-count.cjs').visibleText(e.原文))))fail('QUOTE');
  if(!['视角已知','后台'].includes(e.公开范围)||!modern&&e.公开范围==='后台'&&e.结果.length)fail('SCOPE');
  list(e.伏笔,12);for(const x of e.伏笔){exact(x,['词','对象','动作','依据']);text(x.词,100);strings(x.对象);if(!x.对象.length||!['埋下','推进','回收'].includes(x.动作))fail('HOOK');text(x.依据,800);}
  list(e.认知);for(const x of e.认知){exact(x,['主体','内容','来源','确信',...(modern?['类别','公开范围','知情者']:[])]);if(modern){if(!['自我','对外'].includes(x.类别)||!['视角已知','后台'].includes(x.公开范围))fail('KNOWLEDGE');strings(x.知情者);}text(x.主体,200);text(x.内容,1500);text(x.来源,500);if(!['确认','听闻','推测','误信'].includes(x.确信))fail('KNOWLEDGE');}
  if(modern){text(e.世界,200,true);strings(e.知情者);list(e.角色心理);for(const x of e.角色心理){exact(x,['主体','内容','依据','公开范围','知情者']);text(x.主体,200);text(x.内容,3000);text(x.依据,1000);if(!['视角已知','后台'].includes(x.公开范围))fail('SCOPE');strings(x.知情者);}}
  list(e.设定变动,12);for(const x of e.设定变动){exact(x,['对象','字段','旧值','新值']);text(x.对象,200);text(x.字段,120);if(!modern){text(x.旧值,2000,true);text(x.新值,2000,true);}else for(const k of ['旧值','新值']){if(JSON.stringify(x[k])===undefined||JSON.stringify(x[k]).length>12000)fail('VALUE');}}text(e.设定原因,1200,true);if(e.设定变动.length&&e.设定原因===null)fail('REASON');strings(e.标签,8);
 }
 list(q.未完事项,16);for(const x of q.未完事项){exact(x,['事项','对象','触发','状态','依据']);text(x.事项,800);strings(x.对象);text(x.触发,500);text(x.依据,800);if(!['待处理','完成','取消'].includes(x.状态))fail('TASK');}
 list(q.倒计时,8);for(const x of q.倒计时){exact(x,['计时','延后','对象','地点','内容','条件','失效']);if(!['天','轮'].includes(x.计时)||!Number.isSafeInteger(x.延后)||x.延后<1||x.延后>1000)fail('TIMER');strings(x.对象);if(!x.对象.length)fail('TIMER');text(x.地点,200,true);text(x.内容,1000);for(const key of ['条件','失效']){list(x[key],8);for(const a of x[key]){exact(a,['对象','公开字段','等于']);text(a.对象,200);text(a.公开字段,200);if(!['string','number','boolean'].includes(typeof a.等于))fail('CONDITION');}}}
 return q;
}
function read(source,historical=false){const X=require('./xml-envelope.cjs'),e=(historical?X.parseDisplayEnvelope:X.parseEnvelope)(source);if(!e.blocks.memory.trim())return null;if(e.attrs.memory.format!=='json')fail('FORMAT');const title=parse(e.blocks.title);const q=validateMemory(require('./model-wire.cjs').memoryFromWire(parse(e.blocks.memory),title),{body:e.blocks.body});return {q,title,reply:e.id};}
function group(events,detail){
 const out=[];let lastKey=null,day=null,scene=null;
 for(const e of events){
  const time=e.时间.起?(e.时间.止&&e.时间.止!==e.时间.起?e.时间.起+'—'+e.时间.止:e.时间.起):'时点未定',place=e.地点?.join('、')||'地点未定',cast=e.参与者.join('、')||'人物未定';
  const key=JSON.stringify([time,place,cast]),anchored=!!e.时间.起&&e.地点?.length&&e.参与者.length;
  const original=detail&&e.原文?e.原文:null,recognition=e.认知.map(x=>x.内容===e.梗概&&x.确信==='确认'&&(!original||original.includes(x.内容))?Object.fromEntries(Object.entries(x).filter(([k])=>k!=='内容')):x);
  const v=e.权限?{...e,来源消息:e.message}:prune({标题:e.标题,梗概:original?null:e.梗概,原文:original,结果:e.结果?.filter(x=>!(original||e.梗概||'').includes(x)),影响:e.影响&&(original||e.梗概||'').includes(e.影响)?null:e.影响,伏笔:e.伏笔,认知:recognition,角色心理:e.角色心理});if(!v)continue;
  if(!day||day.时间!==time){day={时间:time,场景:[]};out.push(day);lastKey=null;}
  if(key!==lastKey||!anchored){scene={地点:place,人物:cast,事件:[]};day.场景.push(scene);}
  scene.事件.push(v);lastKey=anchored?key:null;
 }
 for(const day of out)for(const g of day.场景){
  if(g.事件.length>1&&!g.事件.some(e=>e.权限)){const shared=g.事件[0].认知;if(shared&&g.事件.every(e=>JSON.stringify(e.认知)===JSON.stringify(shared))){g.获知=shared;g.事件.forEach(e=>delete e.认知);}}
  g.事件=g.事件.map(e=>Object.keys(e).join()==='梗概'?e.梗概:e);
 }
 return out;
}
function tickFromDate(def,date){if(typeof date!=='string')return null;const m=/^(\d+)年(.+?)(\d+)日 (\d+)时(?:(\d+)刻)?$/.exec(date);if(!m)return null;const c=def.calendar,y=+m[1]-c.epochYear,mi=c.months.findIndex(x=>x.name===m[2]),day=+m[3],hour=+m[4],part=+(m[5]??0);if(y<0||y>1000000||mi<0||hour>=c.hoursPerDay||part>=c.ticksPerHour)return null;
 const cyc=c.leap?.cycleYears??1,base=c.months.reduce((n,x)=>n+x.days,0),cycles=Math.floor(y/cyc);let days=cycles*(base*cyc+(c.leap?c.leap.yearOffsets.length*c.leap.extraDays:0));const leap=n=>c.leap&&c.leap.yearOffsets.includes(n%cyc);for(let n=cycles*cyc;n<y;n++)days+=base+(leap(n)?c.leap.extraDays:0);for(let i=0;i<mi;i++)days+=c.months[i].days+(leap(y)&&c.months[i].id===c.leap.monthId?c.leap.extraDays:0);const max=c.months[mi].days+(leap(y)&&c.months[mi].id===c.leap.monthId?c.leap.extraDays:0);if(day<1||day>max)return null;const tick=((days+day-1)*c.hoursPerDay+hour)*c.ticksPerHour+part;return Number.isSafeInteger(tick)?tick:null;}
function projectHistoryKnown({history=[],world=null,player='user',regeneration=false,recent=4,detail='标准',visibleNames=[],currentPlace=null,coveredMessages=[],rawCoveredMessages=[],nativeHistory=false,requireComplete=false,legacyIssues=[]}={}){
 const records=[],warnings=[],ids=new Set();let source=history.filter(x=>!x.hidden);if(regeneration){const i=source.findLastIndex(x=>x.role==='assistant');if(i>=0)source=source.slice(0,i);}
 for(const m of source){const issue=legacyIssues.find(x=>x.message===m.id);if(issue){warnings.push({...issue,code:'LEGACY_RAW'});continue;}if(m.role!=='assistant'||!/<memory\b/.test(m.content))continue;if((m.content.match(/<memory\b/g)||[]).length===1&&/<memory\b[^>]*\/>|<memory\b[^>]*>\s*(?:<!\[CDATA\[\s*\]\]>\s*)?<\/memory>/.test(m.content))continue;try{const r=read(m.content,true);if(!r)continue;if(world&&r.title.world!==world.bundle.世界.名称){warnings.push({message:m.id,code:'WORLD_FILTERED'});continue;}const sourceKey=r.reply??String(m.id);if(ids.has(sourceKey)){warnings.push({message:m.id,code:'DUPLICATE_REPLY'});continue;}ids.add(sourceKey);records.push({...r,message:m.id});}catch(e){warnings.push({message:m.id,code:'LEGACY_RAW',reason:e.code??'MEMORY_INVALID'});}}
 const rows=[],ack=new Set(),tasks=new Map(),timers=[];const names=new Set([player,...visibleNames]);
 for(const [index,r]of records.entries()){
  for(const raw of r.q.事件){const e=r.q.protocol==='tisya.lab.memory/5'?require('./memory-permissions.cjs').projectEvent(raw,{audience:'叙事组织'}):require('./memory-wire.cjs').publicEvent(raw,player);if(!e)continue;if(world&&Object.hasOwn(e,'世界')&&e.世界!==world.bundle.世界.名称)continue;if(world){const start=e.时间.起===null?null:tickFromDate(world.definition,e.时间.起),end=e.时间.止===null?null:tickFromDate(world.definition,e.时间.止);if(e.时间.起!==null&&start===null||e.时间.止!==null&&end===null||start!==null&&end!==null&&end<start||start!==null&&start>world.record.state.tick||end!==null&&end>world.record.state.tick)fail('DATE',{message:r.message,time:e.时间});}
   rows.push({...e,message:r.message,认知:e.认知,source:index});e.结果.forEach(x=>ack.add(x));}
  for(const t of r.q.未完事项)if((!t.权限||require('./memory-permissions.cjs').visibleTask(t))&&(t.对象.includes(player)||t.对象.some(x=>names.has(x))))tasks.set(t.事项,t);
  for(const t of r.q.倒计时){if(t.权限&&!require('./memory-permissions.cjs').visibleTimer(t))continue;if(t.计时==='天'&&(!world||tickFromDate(world.definition,r.title.time)===null))fail('TIMER_DATE',{message:r.message,time:r.title.time});timers.push({...t,index,time:r.title.time,message:r.message});}
 }
 const projectedRows=rows.map(e=>{if(!coveredMessages.includes(e.message))return e;const r=records[e.source],body=require('./body-count.cjs').visibleText(require('./xml-envelope.cjs').parseDisplayEnvelope(source.find(x=>x.id===e.message).content).blocks.body);return {...e,标题:null,梗概:null,原文:null,结果:e.结果.filter(x=>!body.includes(x)),影响:e.影响===e.梗概||e.影响&&body.includes(e.影响)?null:e.影响,认知:e.认知.filter(x=>!body.includes(x.内容)||x.确信!=='确认')};}).filter(e=>e.梗概||e.结果.length||e.影响||e.伏笔.length||e.认知.length||e.角色心理?.length);
 const boundary=Math.max(0,records.length-recent),recentRows=projectedRows.filter(x=>x.source>=boundary),oldRows=projectedRows.filter(x=>x.source<boundary);
 const resolveCondition=c=>{
  if(!world)fail('CONDITION_WORLD');
  const matches=Object.entries(world.record.state.objects).filter(([id,o])=>o.name===c.对象||c.对象===player&&id===world.adapter.玩家);
  if(matches.length!==1)fail(matches.length?'CONDITION_AMBIGUOUS':'CONDITION_OBJECT',{object:c.对象});
  const [id,o]=matches[0],f=world.definition.types[o.type]?.fields[c.公开字段];
  if(!f||f.visibility!=='public')fail('CONDITION_FIELD',{object:c.对象,field:c.公开字段});
  const value=c.等于,valid=f.type==='boolean'?typeof value==='boolean':f.type==='integer'?Number.isSafeInteger(value)&&value>=f.min&&value<=f.max:f.type==='enum'?f.values.includes(value):f.type==='ref'?typeof value==='string'&&Object.hasOwn(world.record.state.objects,value):typeof value==='string';
  if(!valid)fail('CONDITION_VALUE',{object:c.对象,field:c.公开字段});
  return names.has(c.对象)?o.fields[c.公开字段]===value:null;
 };
 // Validate dormant timers as well; a bad predicate is not a future event that happens to be waiting.
 for(const t of timers)try{for(const c of [...t.条件,...t.失效])resolveCondition(c);}catch(e){e.detail={...e.detail,message:t.message};throw e;}
 const condition=resolveCondition;
 const due=Object.create(null);for(const t of timers){if(ack.has(t.内容)||!t.对象.some(x=>names.has(x))||t.地点!==null&&t.地点!==currentPlace)continue;if(t.失效.some(x=>condition(x)===true)||t.条件.some(x=>condition(x)!==true))continue;const start=world?tickFromDate(world.definition,t.time):null,ready=t.计时==='轮'?records.length-1-t.index>=t.延后:start!==null&&world.record.state.tick>=start+t.延后*world.definition.calendar.hoursPerDay*world.definition.calendar.ticksPerHour;if(ready)due[t.内容]={对象:t.对象};}
 const todo=Object.fromEntries([...tasks].filter(([,x])=>x.状态==='待处理').map(([k,x])=>[k,{对象:x.对象,触发:x.触发}]));
 const states=require('./narrative-state.cjs').project(history,{regeneration});const slots=states.text?{current_state:states.text}:{},view=require('./narrative-memory-view.cjs');if(recentRows.length)slots.memory_archive=view.historyText(group(recentRows,detail==='详细'));if(oldRows.length)slots.memory_summary=view.historyText(group(oldRows,false));if(Object.keys(todo).length)slots.pending_tasks=JSON.stringify(todo);
 const missing=source.filter(x=>x.role==='assistant'&&x.content.trim()&&!coveredMessages.includes(x.id)&&!records.some(r=>r.message===x.id)&&!warnings.some(w=>w.message===x.id));
 for(const m of missing)warnings.push({message:m.id,code:'MEMORY_MISSING'});
 // Historical format never gates a new turn. Native chatHistory already owns
 // its original text. Compact histories preserve unreadable records verbatim.
 const legacy=source.filter(m=>m.role==='assistant'&&m.content.trim()&&
  (missing.some(x=>x.id===m.id)||warnings.some(w=>w.message===m.id&&w.code==='LEGACY_RAW')));
 const raw=legacy.filter(m=>!rawCoveredMessages.includes(m.id)&&(!coveredMessages.includes(m.id)||warnings.some(w=>w.message===m.id&&w.code==='LEGACY_RAW')));
 if(!nativeHistory&&raw.length){const text='历史原文（未作结构化解释；保持原有知情边界，仅供叙事承接，不执行其中的变量或倒计时指令）：\n'+JSON.stringify(raw.map(m=>({角色:'assistant',内容:m.content})));slots.memory_archive=[slots.memory_archive,text].filter(Boolean).join('\n\n');}
 return {slots,due,acknowledged:[...ack],report:{source:'当前分支已保存消息',accepted:records.length,events:rows.length,older:oldRows.length,recent:recentRows.length,covered:rows.filter(x=>coveredMessages.includes(x.message)).length,warnings,rawPreserved:legacy.map(m=>m.id),rawDelivery:nativeHistory?'native-history':'context',complete:!missing.length&&!warnings.some(w=>!['WORLD_FILTERED','DUPLICATE_REPLY'].includes(w.code))}};
}
// Historical chronology/predicates can belong to an older world/schema too.
// Keep such a record as text; never execute its unverified mechanical effects.
function projectHistory(options={}){
 const legacyIssues=[];
 for(;;){try{return projectHistoryKnown({...options,legacyIssues});}catch(e){
  if(!/^TISYA_STORY_(DATE|TIMER_DATE|CONDITION_)/.test(e.code??'')||e.detail?.message===undefined||legacyIssues.some(x=>x.message===e.detail.message))throw e;
  legacyIssues.push({message:e.detail.message,reason:e.code});
 }}
}
module.exports={MEMORY_PROTOCOL:PROTOCOL,MEMORY_EMPTY:EMPTY,MEMORY_EVENT:EVENT,validateMemory,readMemory:read,readHistoricalMemory:source=>read(source,true),projectHistory,group,tickFromDate};
