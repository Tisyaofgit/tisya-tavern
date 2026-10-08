'use strict';
const {split:splitRows,AUDIT}=require('./rows-wire.cjs');
const {parse:json}=require('./world/strict-json.cjs');
// Explicit model-wire grammar; persisted JSON and external update interfaces stay strict.
const wireValue=require('./json-parser.cjs').createStrictJSON({bareStrings:true});
const split=(s,sep='|')=>splitRows(s,sep,{bareText:true}).map(x=>x.trim());
const ACL=require('./permission-wire.cjs');
const bad=c=>{throw Object.assign(Error('TISYA_PIPES_'+c),{code:'TISYA_PIPES_'+c});};
const own=(o,k)=>Object.hasOwn(o,k),put=(o,k,v)=>{if(own(o,k))bad('DUPLICATE');Object.defineProperty(o,k,{value:v,writable:true,enumerable:true,configurable:true});};
function text(s){if(s.startsWith('"')){const x=json(s);if(typeof x!=='string')bad('TEXT');return x;}if(!s||s==='~'||s==='[]'||/[\r\n]/.test(s))bad('TEXT');return s;}
function value(s,t){if(t==='s')return text(s);if(t==='e')return s===''?'':text(s);if(t==='?')return s==='~'?null:text(s);if(t==='j')return wireValue(s);if(t==='p')return ACL.validate(wireValue(s));if(t==='i'){if(!/^(?:0|[1-9]\d*)$/.test(s)||!Number.isSafeInteger(+s))bad('INTEGER');return +s;}if(t==='l'||t==='L'){if(s==='[]')return [];if(s==='~'&&t==='L')return null;const a=split(s,'、').map(text);if(new Set(a).size!==a.length)bad('LIST_DUPLICATE');return a;}bad('TYPE');}
function cells(xs,ts){if(xs.length!==ts.length)bad('COLUMNS');return xs.map((s,i)=>value(s,ts[i]));}
// An absent item in these optional collections is distinct from literal quoted text.
const emptyItem=s=>s===''||s==='~'||s==='[]';
function optionalItem(xs){if(xs.length!==1)bad('COLUMNS');return emptyItem(xs[0])?[]:[text(xs[0])];}
// These two observed spellings have explicit meanings in the current M.07 registry.
// Apply only to the certainty cell; never infer or modify a subject's access rights.
function certainty(s){return s==='hearsay'?'听闻':s==='K3'?'确认':s;}
function records(s){return s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{const i=line.indexOf('：');if(i<1)bad('LABEL');return {name:line.slice(0,i).trim(),raw:split(line.slice(i+1))};});}
function heart(b,x){const [status]=cells(x.slice(0,1),'s');if(!['有内容','沉默','关闭'].includes(status))bad('HEART');if(b.heart===null)b.heart={status,items:[]};else if(b.heart.status!==status||status!=='有内容')bad('HEART_DUPLICATE');if(status==='有内容'){const [,type,mood,text]=cells(x,'ss?s');b.heart.items.push({type,mood:x[2]==='null'?null:mood,text});}else if(x.length!==1)bad('COLUMNS');}
function decode(name,source,{body,title}={}){
 const rows=records(source);
 if(name==='title'){if(rows.length!==1||rows[0].name!=='场景')bad('TITLE');const [text,time,places,world]=cells(rows[0].raw,'s?L?');return {text,time,place:places===null?null:places.join('、'),world,places};}
 if(name==='task'||name==='next'||name==='actions'){
  const b=name==='task'?{tasks:[],refs:{style:[],cast:[]},pending:[],characters:[],heart:null,unlocks:[]}:name==='next'?{tasks:[],audit:[],heart:null,delivered:[],candidates:[]}:{actions:[]};
  for(const {name:n,raw:x}of rows){
   if(n==='心声'&&name!=='actions'){heart(b,x);continue;}
   if(name==='task'){
    if(n==='任务'){const [input,plan,stop]=cells(x,'ses');b.tasks.push({input,plan,stop});}
    else if(n==='资料'){if(x.length===1&&emptyItem(x[0]))continue;if(x.length!==2)bad('COLUMNS');const kind=text(x[0]);if(!['文风','人物'].includes(kind))bad('REF');b.refs[kind==='文风'?'style':'cast'].push(...optionalItem(x.slice(1)));}
    else if(n==='待定')b.pending.push(...optionalItem(x));
    else if(n==='人物'){const [status,actor,intent,evidence]=cells(x,'ss?s');b.characters.push({status,actor,intent,evidence});}
    else if(n==='解锁')b.unlocks.push(cells(x,'sss'));
    else bad('TASK_FIELD');
   }else if(name==='next'){
    if(n==='审计'){const [status,kind,evidence]=cells(x,'sss');if(!AUDIT.includes(kind)||b.audit.some(a=>a.kind===kind))bad('AUDIT');b.audit.push({status,kind,evidence});}
    else if(n==='待办'){const [type,trigger,text]=cells(x,'sss');b.tasks.push({type,trigger,text});}
    else if(n==='已交付')b.delivered.push(...optionalItem(x));
    else if(n==='候选')b.candidates.push(...optionalItem(x));
    else bad('NEXT_FIELD');
   }else{if(n!=='行动')bad('ACTIONS_FIELD');const [type,text,source]=cells(x,'sss');b.actions.push({type,text,source});}
  }
  if(name==='task'&&!b.tasks.length)bad('TASK_REQUIRED');
  if(name!=='actions'&&!b.heart)bad('HEART_REQUIRED');
  if(name==='next')b.audit.sort((a,b)=>AUDIT.indexOf(a.kind)-AUDIT.indexOf(b.kind));
  return b;
 }
 if(name==='status'){
  const b={};let current=null;
  for(const {name:n,raw:x}of rows){
   if(n==='原生状态'){const [type,obj,field,v]=cells(x,'sssj');if(type==='叙事状态')bad('RESERVED_TYPE');if(!own(b,type))put(b,type,{});if(!own(b[type],obj))put(b[type],obj,{});put(b[type][obj],field,v);current=null;}
   else if(n==='叙事状态'){if(x.length!==5)bad('COLUMNS');const [obj,permission,field]=cells(x.slice(0,3),'sps');current={权限:permission,知情:[],...(x[3]==='~'?{}:{旧值:wireValue(x[3])}),...(x[4]==='~'?{删除:true}:{新值:wireValue(x[4])})};if(!own(b,'叙事状态'))put(b,'叙事状态',{});if(!own(b.叙事状态,obj))put(b.叙事状态,obj,{});put(b.叙事状态[obj],field,current);}
   else if(n==='知情'){if(!current)bad('KNOWLEDGE_PARENT');const [主体,等级,依据]=cells(x,'sss');if(!['K0','K1','K2','K3'].includes(等级)||current.知情.some(x=>x.主体===主体))bad('KNOWLEDGE');current.知情.push({主体,等级,依据});}
   else bad('STATUS_FIELD');
  }for(const fields of Object.values(b.叙事状态??{}))for(const v of Object.values(fields))require('./status-wire.cjs').validateNarrativeState(v);return b;
 }
 if(name==='memory'){
  const q={protocol:'tisya.lab.memory/5',关联:[],关联权限:null,权限:[],事件:[],未完事项:[],倒计时:[]};let event=null,timer=null,events=false;const seen=new Set();
  for(const {name:n,raw:x}of rows){
   if(['关联','权限','未完','倒计时','条件','失效'].includes(n)){
    if(events)bad('GLOBAL_ORDER');
    if(n==='关联'){if(seen.has(n))bad('DUPLICATE');seen.add(n);[q.关联,q.关联权限]=cells(x,'lp');}
    else if(n==='权限'){const [区块,定位,权限]=cells(x,'sjp');if(!['status','vars','extra'].includes(区块))bad('ACL_LOCATOR');q.权限.push({区块,定位,权限});}
    else if(n==='未完'){const [状态,事项,对象,触发,依据,权限]=cells(x,'sslssp');q.未完事项.push({状态,事项,对象,触发,依据,权限});timer=null;}
    else if(n==='倒计时'){const [计时,延后,对象,地点,内容,权限]=cells(x,'sil?sp');timer={计时,延后,对象,地点,内容,权限,条件:[],失效:[]};q.倒计时.push(timer);}
    else{if(!timer)bad('TIMER_PARENT');const [对象,公开字段,等于,权限]=cells(x,'ssjp');timer[n].push({对象,公开字段,等于,权限});}
    continue;
   }
   if(n==='事件'){events=true;const [参与者,权限,梗概]=cells(x,'lps');event={标题:title.text,时间:{起:title.time,止:null},地点:title.places,世界:title.world,参与者,权限,梗概,结果:[],影响:null,原文:null,段落:null,伏笔:[],认知:[],角色心理:[],设定变动:[],设定原因:null,标签:[]};q.事件.push(event);seen.clear();continue;}
   if(!event)bad('EVENT_PARENT');
   if(['原文','场景','影响','变因','标签'].includes(n)){if(seen.has(n))bad('DUPLICATE');seen.add(n);}
   if(n==='原文'){const [r]=cells(x,'s');event.段落=r;event.原文=require('./numbered-paragraphs.cjs').resolve(r,body);}
   else if(n==='场景'){const [标题,time,地点,世界]=cells(x,'?jL?');if(!Array.isArray(time)||time.length!==2||time.some(t=>t!==null&&typeof t!=='string'))bad('TIME');Object.assign(event,{标题,时间:{起:time[0],止:time[1]},地点,世界});}
   else if(n==='结果')event.结果.push(cells(x,'s')[0]);
   else if(n==='影响')event.影响=cells(x,'s')[0];
   else if(n==='伏笔'){const [动作,对象,词,依据]=cells(x,'slss');event.伏笔.push({动作,对象,词,依据});}
   else if(n==='认知'){const [主体,类别,确信,权限,内容,来源]=cells(x,'sssp ss'.replace(/ /g,''));event.认知.push({主体,类别,确信:certainty(确信),权限,内容,来源});}
   else if(n==='心理'){const [主体,权限,内容,依据]=cells(x,'spss');event.角色心理.push({主体,权限,内容,依据});}
   else if(n==='变动'){if(x.length!==5)bad('COLUMNS');const [对象,字段]=cells(x.slice(0,2),'ss'),权限=value(x[4],'p');event.设定变动.push({对象,字段,权限,...(x[2]==='~'?{}:{旧值:wireValue(x[2])}),...(x[3]==='~'?{删除:true}:{新值:wireValue(x[3])})});}
   else if(n==='变因')event.设定原因=cells(x,'s')[0];
   else if(n==='标签')event.标签=cells(x,'l')[0];
   else bad('MEMORY_FIELD');
  }
  return q;
 }
 bad('BLOCK');
}
function projectEnvelope(e){
 const r={...e,blocks:{...e.blocks},attrs:{...e.attrs},wire:{version:5,order:Object.keys(e.blocks),attrs:JSON.parse(JSON.stringify(e.attrs))}};
 const title=decode('title',e.blocks.title);r.wire.titlePlaces=title.places;const publicTitle={...title};delete publicTitle.places;
 for(const name of ['task','title','next','status','memory','actions']){
  if(e.attrs[name]?.format!=='pipes'&&!(name==='status'||name==='memory')||!['pipes',undefined].includes(e.attrs[name]?.format))bad('FORMAT_'+name);
  const b=name==='title'?publicTitle:decode(name,e.blocks[name],{body:e.blocks.body,title});
  if(name==='task'){r.wire.unlocks=b.unlocks;delete b.unlocks;}
  r.blocks[name]=JSON.stringify(b);r.attrs[name]={...e.attrs[name],format:'json'};
 }
 require('./numbered-paragraphs.cjs').read(e.blocks.body,{required:true});
 return require('./task-handoff-wire.cjs').toInternal(r);
}
module.exports={decode,projectEnvelope,records,value};
