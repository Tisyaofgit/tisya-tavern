'use strict';
// Versioned model transport to the existing JSON contracts. Pure parsing; no writes or evaluation.
const {parse:parseJSON}=require('./world/strict-json.cjs');
const copy=x=>structuredClone(x), same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const fail=(code,detail)=>{throw Object.assign(Error('ROWS_'+code),{code:'ROWS_'+code,detail});};
const AUDIT=['身份与授权','资料与知情','人物与关系','行动与因果','数值与机制','文风与表现','成稿与交付'];
const esc=x=>x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function split(s,sep='|',{bareText=false}={}){
 let a=[],start=0,q=false,e=false,stack=[],atomStart=true;
 for(let i=0;i<s.length;i++){const c=s[i];if(q){if(e)e=false;else if(c==='\\')e=true;else if(c==='"')q=false;continue;}
  if(c==='"'&&(!bareText||atomStart)){q=true;atomStart=false;continue;}
  if((c==='['||c==='{')&&(!bareText||atomStart)){stack.push(c);atomStart=true;continue;}else if((c===']'||c==='}')&&(!bareText||stack.length)){if(stack.pop()!==(c===']'?'[':'{'))fail('BRACKET');atomStart=false;}
  if(c===sep&&!stack.length){a.push(s.slice(start,i));start=i+1;atomStart=true;}
  else if(stack.length&&(c===','||c===':'))atomStart=true;else if(!/\s/.test(c))atomStart=false;
 }if(q||stack.length)fail('UNCLOSED');a.push(s.slice(start));return a;
}
function atom(x){if(typeof x!=='string')fail('STRING');return !x||x==='~'||x==='null'||x.trim()!==x||/[|、\r\n\t"\\\[\]{}<>]/.test(x)||/^[->]/.test(x)||/[·:]$/.test(x)?JSON.stringify(x):x;}
function unatom(s){if(s.startsWith('"')){let v;try{v=JSON.parse(s);}catch(_){fail('QUOTE');}if(typeof v!=='string')fail('STRING');return v;}if(!s||s.trim()!==s||/["\r\n]/.test(s))fail('STRING');return s;}
function cell(v,t){if(t==='l')return v.length?v.map(atom).join('、'):'~';if(t==='j')return JSON.stringify(v);if(t==='a')return v.length?JSON.stringify(v):'~';if(t==='i'){if(!Number.isSafeInteger(v))fail('INTEGER');return String(v);}if(t==='?'&&v===null)return '~';return atom(v);}
function value(s,t){if(t==='l')return s==='~'?[]:split(s,'、').map(unatom);if(t==='j'||t==='a'){if(t==='a'&&s==='~')return [];try{const v=parseJSON(s);if(t==='a'&&!Array.isArray(v))fail('ARRAY');return v;}catch(e){fail('JSON');}}if(t==='i'){if(!/^-?(0|[1-9]\d*)$/.test(s)||!Number.isSafeInteger(+s))fail('INTEGER');return +s;}if(t==='?'&&(s==='~'||s==='null'))return null;return unatom(s);}
const pack=(xs,ts)=>{if(xs.length!==ts.length)fail('COLUMNS');return xs.map((x,i)=>cell(x,ts[i])).join('|');};
const unpack=(s,ts)=>{const xs=split(s);if(xs.length!==ts.length)fail('COLUMNS',{actual:xs.length,expected:ts.length});return xs.map((x,i)=>value(x,ts[i]));};
const R=(s,g,v,gt='',vt='')=>({s,g,v,gt,vt});
function bucket(xs,key){const groups=new Map();for(const x of xs){const k=JSON.stringify(key(x));if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}return [...groups.values()].flat();}
function canonical(input){const b=copy(input);
 b.task.characters=bucket(b.task.characters,x=>x.status);
 b.next.tasks=bucket(b.next.tasks,x=>x.type);b.next.actions=bucket(b.next.actions,x=>x.type);
 for(const e of b.memory.事件){
  const byHook=new Map();let ordered=false;for(const h of e.伏笔){const k=JSON.stringify([h.对象,h.词]);if(byHook.has(k)&&byHook.get(k)!==h.动作)ordered=true;byHook.set(k,h.动作);}
  if(!ordered)e.伏笔=bucket(e.伏笔,x=>x.动作);
  e.认知=bucket(e.认知,x=>[x.主体,x.类别,x.确信,x.公开范围,x.知情者]);
  e.角色心理=bucket(e.角色心理,x=>[x.主体,x.公开范围,x.知情者]);
 }
 b.memory.未完事项=bucket(b.memory.未完事项,x=>x.状态);
 b.memory.倒计时=bucket(b.memory.倒计时,x=>x.计时);
 return b;
}
function paragraphSpans(s){
 // Preserve original offsets; paragraph delimiters inside code are not layout.
 if(/^\s*<p(?:\s|>)/i.test(s)){
  const parts=[...s.matchAll(/<p(?:\s[^>]*)?>[\s\S]*?<\/p\s*>/gi)];
  let at=0,only=true;for(const m of parts){if(s.slice(at,m.index).trim())only=false;at=m.index+m[0].length;}if(s.slice(at).trim())only=false;
  if(only&&parts.length)return parts.map(m=>({raw:m[0],start:m.index,end:m.index+m[0].length}));
 }
 const out=[];let start=0,fence=null,pre=false;const add=(a,b)=>{while(b>a&&/[\r\n]/.test(s[b-1]))b--;if(s.slice(a,b).trim())out.push({raw:s.slice(a,b),start:a,end:b});};
 for(const m of s.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g)){
  if(!m[0])continue;const line=m[0].replace(/[\r\n]+$/,'');
  const mark=/^\s*(`{3,}|~{3,})/.exec(line);
  if(mark){if(fence&&mark[1][0]===fence[0]&&mark[1].length>=fence.length)fence=null;else if(!fence)fence=mark[1];}
  if(/<pre(?:\s|>)/i.test(line))pre=true;
  if(!fence&&!pre&&!line.trim()){
   add(start,m.index);start=m.index+m[0].length;
  }
  if(/<\/pre\s*>/i.test(line))pre=false;
 }
 add(start,s.length);return out;
}
function normalizeParagraph(s){
 s=s.replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'');
 if(/```|~~~|<pre\b|<code\b/i.test(s))return s;
 s=s.replace(/<\/?(?:p|em|strong|b|i|span|u|s|small|mark)(?:\s[^>]*)?>/gi,'');
 s=s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[x]??String.fromCodePoint(x[1]==='x'?parseInt(x.slice(2),16):+x.slice(1))));
 const lines=s.split('\n').map(x=>x.trim());while(lines.length&&!lines[0])lines.shift();while(lines.length&&!lines.at(-1))lines.pop();
 return lines.reduce((a,b)=>!a?b:a+(/[\p{Script=Han}]/u.test(a.at(-1))||/[\p{Script=Han}]/u.test(b[0])?'':' ')+b,'');
}
function paragraphs(s){return paragraphSpans(s).map(x=>normalizeParagraph(x.raw));}
function restoreQuote(quote,body){
 const qs=paragraphs(quote),ps=paragraphSpans(body);if(!qs.length)fail('QUOTE_EMPTY');const matches=[];
 for(let i=0;i+qs.length<=ps.length;i++)if(qs.every((q,j)=>normalizeParagraph(ps[i+j].raw)===q))matches.push(body.slice(ps[i].start,ps[i+qs.length-1].end));
 if(!matches.length)fail('QUOTE_NOT_CONTIGUOUS');if(new Set(matches).size>1)fail('QUOTE_AMBIGUOUS');return matches[0];
}
function heart(h){return h.items.length?h.items.map(x=>R('心声',[h.status],[x.type,x.mood,x.text],'s','s?s')):[R('心声',[h.status],[],'s','')];}
function records(name,b){const out=[],push=r=>out.push(r),lines=(s,xs)=>xs.forEach(x=>push(R(s,[],[x],'','s')));
 if(name==='title')return [R('',[],[b.text,b.time,b.place,b.world],'','s???')];
 if(name==='task'){
  b.tasks.forEach(x=>push(R('任务',[],[x.input,x.plan,x.stop],'','sss')));
  for(const [k,label]of [['style','文风'],['cast','人物']])b.refs[k].forEach(x=>push(R('资料',[label],[x],'s','s')));
  lines('待定',b.pending);out.push(...heart(b.heart));
  bucket(b.audit,x=>x.status).forEach(x=>push(R('审计',[x.status],[x.kind,x.evidence],'s','ss')));
  b.characters.forEach(x=>push(R('人物',[x.status],[x.actor,x.intent,x.evidence],'s','s?s')));
 }else if(name==='next'){
  b.tasks.forEach(x=>push(R('待办',[x.type],[x.trigger,x.text],'s','ss')));
  b.actions.forEach(x=>push(R('行动',[x.type],[x.text,x.source],'s','ss')));
  out.push(...heart(b.heart));lines('已交付',b.delivered);lines('候选',b.candidates);
 }else if(name==='status'){
  for(const [type,objs]of Object.entries(b))for(const [obj,fields]of Object.entries(objs))for(const [k,v]of Object.entries(fields))push(R(type,[obj],[k,v],'s','sj'));
 }else if(name==='vars'){
  if(b===null)return [];
  for(const x of b.operations){const pair=['copy','move'].includes(x.op),remove=x.op==='remove';push(R('',[x.op],pair?[x.from,x.path]:remove?[x.path]:[x.path,x.value],'s',pair?'ss':remove?'s':'sj'));}
 }else if(name==='memory'){
  if(b.关联.length)push(R('关联',[],[b.关联],'','l'));
  for(const e of b.事件){
   push(R('事件',[],[e.参与者,e.公开范围,e.知情者,e.梗概],'','lsls'));
   const d=e.场景.差异;for(const k of ['标题','时间','地点','世界'])if(Object.hasOwn(d,k))push(R('场景',[],k==='时间'?[k,d[k].起,d[k].止]:[k,d[k]],'',k==='时间'?'s??':k==='地点'?'sl':'s?'));
   lines('结果',e.结果);if(e.影响!==null)push(R('影响',[],[e.影响],'','s'));
   if(e.原文!==null)for(const p of paragraphs(e.原文))push(R('原文',[],[p],'','s'));
   const seen=new Map();let ordered=false;for(const x of e.伏笔){const k=JSON.stringify([x.对象,x.词]);if(seen.has(k)&&seen.get(k)!==x.动作)ordered=true;seen.set(k,x.动作);}
   for(const x of e.伏笔)push(ordered?R('伏笔序',[],[x.动作,x.对象,x.词,x.依据],'','slss'):R('伏笔',[x.动作],[x.对象,x.词,x.依据],'s','lss'));
   for(const x of e.认知)push(R('认知',[x.主体,x.类别,x.确信,x.公开范围,x.知情者],[x.内容,x.来源],'ssssl','ss'));
   for(const x of e.角色心理)push(R('心理',[x.主体,x.公开范围,x.知情者],[x.内容,x.依据],'ssl','ss'));
   for(const x of e.设定变动)push(R('变动',[x.对象],[x.字段,x.旧值,x.新值],'s','sjj'));
   if(e.设定原因!==null)push(R('变因',[],[e.设定原因],'','s'));
   if(e.标签.length)push(R('标签',[],[e.标签],'','l'));
  }
  for(const x of b.未完事项)push(R('未完',[x.状态],[x.事项,x.对象,x.触发,x.依据],'s','slss'));
  for(const x of b.倒计时)push(R('倒计时',[x.计时],[x.延后,x.对象,x.地点,x.内容,x.条件,x.失效],'s','il?saa'));
 }else fail('BLOCK',name);
 return out;
}
const forms={
 task:{任务:['','sss'],资料:['s','s'],待定:['','s'],心声:['s','s?s'],审计:['s','ss'],人物:['s','s?s']},
 next:{待办:['s','ss'],行动:['s','ss'],心声:['s','s?s'],已交付:['','s'],候选:['','s']},
 memory:{关联:['','l'],事件:['','lsls'],场景:['','*'],结果:['','s'],影响:['','s'],原文:['','s'],伏笔:['s','lss'],伏笔序:['','slss'],认知:['ssssl','ss'],心理:['ssl','ss'],变动:['s','sjj'],变因:['','s'],标签:['','l'],未完:['s','slss'],倒计时:['s','il?saa']}
};
function encodeBlock(name,b,{grouped=true}={}){
 const rs=records(name,b),out=[];let section=null,group=null;
 for(const r of rs){
  if(!grouped){out.push(pack([...(r.s?[r.s]:[]),...r.g,...r.v],(r.s?'s':'')+r.gt+r.vt));continue;}
  if(name==='title'){out.push(pack(r.v,r.vt));continue;}
  if(r.s!==section||r.s==='事件'){if(r.s)out.push(atom(r.s)+':');section=r.s;group=null;}
  if(r.g.length&&!same(group,r.g)){out.push('- '+pack(r.g,r.gt));group=r.g;}
  if(r.s==='原文'){out.push('>'+atom(r.v[0]));continue;}
  if(r.v.length)out.push(pack(r.v,r.vt));
 }return out.join('\n');
}
function parseRecords(name,text){
 if(name==='title'){const xs=text.trim().split('\n');if(xs.length!==1)fail('TITLE');return [R('',[],unpack(xs[0],'s???'))];}
 const out=[];let s=name==='vars'?'':null,g=null,gt='',vt='',pendingHeader=false,header=0;
 for(const [index,line]of text.split(/\r?\n/).entries()){
  if(!line)continue;if(/^\s/.test(line))fail('INDENT',{line:index+1});
  if(line.startsWith('>')){if(s!=='原文')fail('PARAGRAPH');out.push(R(s,[],[unatom(line.slice(1))]));pendingHeader=false;continue;}
  if(/[·:]$/.test(line)){header++;if(pendingHeader)fail('EMPTY_GROUP');s=unatom(line.slice(0,-1));g=null;
   if(name==='status'){gt='s';vt='sj';}else if(!forms[name]?.[s])fail('SECTION',s);else [gt,vt]=forms[name][s];pendingHeader=true;continue;}
  if(line.startsWith('-')){if(s===null)fail('PARENT');if(pendingHeader&&g!==null)fail('EMPTY_GROUP');if(name==='vars'){gt='s';vt='*';}if(!gt)fail('GROUP');g=unpack(line.slice(1).replace(/^ /,''),gt);pendingHeader=true;
   if(s==='心声'&&['沉默','关闭'].includes(g[0])){out.push(R(s,g,[]));pendingHeader=false;}continue;}
  if(s===null||gt&&!g)fail('PARENT');let types=vt;
  if(vt==='*'){if(name==='vars')types=['copy','move'].includes(g[0])?'ss':g[0]==='remove'?'s':'sj';else{const key=unatom(split(line)[0]);types=key==='时间'?'s??':key==='地点'?'sl':key==='标题'||key==='世界'?'s?':fail('SCENE_KEY');}}
  out.push({...R(s,g||[],unpack(line,types)),header});pendingHeader=false;
 }if(pendingHeader)fail('EMPTY_GROUP');return out;
}
function assign(obj,key,v){if(Object.hasOwn(obj,key))fail('DUPLICATE',key);Object.defineProperty(obj,key,{value:v,enumerable:true,writable:true,configurable:true});}
function decodeBlock(name,text){const rs=parseRecords(name,text);
 if(name==='title'){const [text,time,place,world]=rs[0].v;return {text,time,place,world};}
 if(name==='status'){const b={};for(const {s,g,v}of rs){if(!Object.hasOwn(b,s))assign(b,s,{});if(!Object.hasOwn(b[s],g[0]))assign(b[s],g[0],{});assign(b[s][g[0]],v[0],v[1]);}return b;}
 if(name==='vars')return {protocol:'mvu-json-patch',operations:rs.map(({g,v})=>{const op=g[0];if(!['add','replace','remove','delta','test','copy','move','insert'].includes(op))fail('OP');return ['copy','move'].includes(op)?{op,from:v[0],path:v[1]}:op==='remove'?{op,path:v[0]}:{op,path:v[0],value:v[1]};})};
 const b=name==='task'?{tasks:[],refs:{style:[],cast:[]},pending:[],heart:null,audit:[],characters:[]}:name==='next'?{tasks:[],actions:[],heart:null,delivered:[],candidates:[]}:{关联:[],事件:[],未完事项:[],倒计时:[]};
 let e=null,seen=new Set(),rootSeen=new Set(),scalarHeaders={};const once=k=>{if(seen.has(k))fail('DUPLICATE',k);seen.add(k);};
 for(const {s,g,v,header}of rs){
  if(s==='心声'){if(b.heart===null)b.heart={status:g[0],items:[]};else if(b.heart.status!==g[0]||!v.length)fail('HEART');if(v.length){const [type,mood,text]=v;b.heart.items.push({type,mood,text});}continue;}
  if(name==='task'){
   if(s==='任务'){const [input,plan,stop]=v;b.tasks.push({input,plan,stop});}
   if(s==='资料'){const k=g[0]==='文风'?'style':g[0]==='人物'?'cast':fail('REF');b.refs[k].push(v[0]);}
   if(s==='待定')b.pending.push(v[0]);
   if(s==='审计'){const [kind,evidence]=v;b.audit.push({kind,status:g[0],evidence});}
   if(s==='人物'){const [actor,intent,evidence]=v;b.characters.push({actor,intent,status:g[0],evidence});}
  }else if(name==='next'){
   if(s==='待办'){const [trigger,text]=v;b.tasks.push({type:g[0],trigger,text});}
   if(s==='行动'){const [text,source]=v;b.actions.push({type:g[0],text,source});}
   if(s==='已交付')b.delivered.push(v[0]);if(s==='候选')b.candidates.push(v[0]);
  }else{
   if(s==='关联'){if(rootSeen.has(s))fail('DUPLICATE');rootSeen.add(s);b.关联=v[0];continue;}
   if(s==='未完'){const [事项,对象,触发,依据]=v;b.未完事项.push({事项,对象,触发,依据,状态:g[0]});e=null;continue;}
   if(s==='倒计时'){const [延后,对象,地点,内容,条件,失效]=v;b.倒计时.push({计时:g[0],延后,对象,地点,内容,条件,失效});e=null;continue;}
   if(s==='事件'){const [参与者,公开范围,知情者,梗概]=v;e={场景:{引用:'title',差异:{}},参与者,梗概,结果:[],影响:null,原文:null,伏笔:[],认知:[],角色心理:[],公开范围,知情者,设定变动:[],设定原因:null,标签:[]};b.事件.push(e);seen=new Set();scalarHeaders={};continue;}
   if(!e)fail('EVENT_PARENT');
   if(s==='场景')assign(e.场景.差异,v[0],v[0]==='时间'?{起:v[1],止:v[2]}:v[1]);
   if(s==='结果')e.结果.push(v[0]);if(s==='影响'){if(Object.hasOwn(scalarHeaders,s)&&scalarHeaders[s]!==header)fail('DUPLICATE',s);scalarHeaders[s]=header;e.影响=e.影响===null?v[0]:e.影响+'\n'+v[0];}
   if(s==='原文')e.原文=e.原文===null?v[0]:e.原文+'\n\n'+v[0];
   if(s==='伏笔'){const [对象,词,依据]=v;e.伏笔.push({动作:g[0],对象,词,依据});}
   if(s==='伏笔序'){const [动作,对象,词,依据]=v;e.伏笔.push({动作,对象,词,依据});}
   if(s==='认知'){const [主体,类别,确信,公开范围,知情者]=g,[内容,来源]=v;e.认知.push({主体,类别,确信,公开范围,知情者,内容,来源});}
   if(s==='心理'){const [主体,公开范围,知情者]=g,[内容,依据]=v;e.角色心理.push({主体,公开范围,知情者,内容,依据});}
   if(s==='变动'){const [字段,旧值,新值]=v;e.设定变动.push({对象:g[0],字段,旧值,新值});}
   if(s==='变因'){if(Object.hasOwn(scalarHeaders,s)&&scalarHeaders[s]!==header)fail('DUPLICATE',s);scalarHeaders[s]=header;e.设定原因=e.设定原因===null?v[0]:e.设定原因+'\n'+v[0];}if(s==='标签'){once(s);e.标签=v[0];}
  }
 }
 if(name==='task'){if(!b.heart)fail('HEART_REQUIRED');b.audit.sort((a,b)=>AUDIT.indexOf(a.kind)-AUDIT.indexOf(b.kind));}
 if(name==='next'&&!b.heart)fail('HEART_REQUIRED');return b;
}
const NAMES=['task','title','body','status','extra','vars','archive','memory','next'];
function envelope(b,{grouped=true}={}){return '<reply>\n'+NAMES.map(n=>{
 if(n==='archive'||n==='vars'&&b.vars===null)return '<'+n+'/>';
 if(n==='body')return '<body min="2000" max="5000" unit="字">'+b.body+'</body>';
 if(n==='extra')return '<extra>'+b.extra+'</extra>';
 const attrs=n==='task'?' audit_count="7"':n==='next'?' actions_min="4" actions_max="6"':'';
 return '<'+n+' format="rows"'+attrs+'>\n'+esc(encodeBlock(n,b[n],{grouped}))+'\n</'+n+'>';
 }).join('\n')+'\n</reply>';}
// Reuse the production envelope scanner: do not find/replace blocks in body or extra.
function projectEnvelope(e){const r={...e,blocks:{...e.blocks},attrs:{...e.attrs}};
 for(const n of ['task','title','status','vars','memory','next'])if(e.attrs[n]?.format==='rows'){const v=decodeBlock(n,e.blocks[n]);if(n==='memory')for(const x of v.事件)if(x.原文!==null)x.原文=restoreQuote(x.原文,e.blocks.body);r.blocks[n]=JSON.stringify(v);r.attrs[n]={...e.attrs[n],format:'json'};}
 return r;
}
module.exports={canonical,records,encodeBlock,decodeBlock,envelope,projectEnvelope,paragraphs,restoreQuote,split,AUDIT,NAMES};
