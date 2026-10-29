import {xmlTokens,countBody} from '../reader-core.js';
import {parseNumberedBody} from './paragraphs.mjs';
import {companionSlots} from './host-companion-wire.mjs';

// V3 wire only. These projections are display data, never archive or MVU writes.
export const V3_REPLY_ORDER=Object.freeze(['before','title','body','after','extra','actions']);
const HEART=new Set(['输入评价','回应用户评价','剧情吐槽']);
const OUTCOMES=new Set(['本轮变化','角色主动','世界动向','关系位移','人物厚度','语言亮点','下一步张力']);
const TODO=new Set(['剧情待处理任务','系统任务','下轮基础任务']);
const BLANKABLE=new Set([...OUTCOMES,...TODO,'候选','已交付']);
export const BEFORE_ROWS=Object.freeze(Object.fromEntries([...['用户偏好','文风用词','情节取向','角色锚点','篇幅重点','信息迷雾','文风','世界观','环境','玩法','世界书','人物','历史','世界推演','伏笔','工具','待定'].map(k=>[k,1]),['设计',3],['解锁',3],...[...HEART].map(k=>[k,2])]));
export const AFTER_ROWS=Object.freeze(Object.fromEntries([...[...OUTCOMES].map(k=>[k,1]),['留白',2],...[...TODO].map(k=>[k,2]),...[...HEART].map(k=>[k,2]),['已交付',1],['候选',1]]));
const BEFORE=new Map(Object.entries(BEFORE_ROWS)),AFTER=new Map(Object.entries(AFTER_ROWS));
const ACTION_TYPES=new Set(['交流','调查','移动','操作','战斗','休整','其他']);
const PUBLIC_LABELS=new Map(Object.entries({Preference:'用户偏好','User preference':'用户偏好','Language choice':'文风用词','Plot direction':'情节取向','Character anchor':'角色锚点','Pacing focus':'篇幅重点',人物设计:'设计',人物推演:'设计',角色设计:'设计',输入点评:'输入评价',回应评价:'回应用户评价',剧情点评:'剧情吐槽',剧情变化:'本轮变化',角色主动性:'角色主动',关系变化:'关系位移',人物塑造:'人物厚度',语言表现:'语言亮点',后续张力:'下一步张力'}));
const publicLine=raw=>{
 let line=raw.trim().replace(/^(?:[-*+]\s+|\d+[.)、]\s*)/,'');
 if(!line.includes('|')&&line.includes('｜'))line=line.replaceAll('｜','|');
 if(line.startsWith('|')&&line.endsWith('|'))line=line.slice(1,-1).trim();
 return line.replace(/^(?:\*\*([^*]+)\*\*|`([^`]+)`)(?=\s*[:：|])/,'$1$2');
};
const fail=code=>{throw Object.assign(Error('TISYA_V3_REPLY_'+code),{code:'TISYA_V3_REPLY_'+code});};
const check=(ok,code)=>{if(!ok)fail(code);};
const attempt=fn=>{try{return {value:fn()};}catch(e){return {error:e?.code??'TISYA_V3_REPLY_INVALID'};}};
const attrs=(value,keys,optional=[])=>check(Object.keys(value).every(k=>keys.includes(k)||optional.includes(k))&&keys.every(k=>Object.hasOwn(value,k)),'ATTR');
const integer=value=>{check(/^(?:0|[1-9]\d*)$/.test(value??'')&&Number.isSafeInteger(+value),'INTEGER');return +value;};
const unxml=text=>text.replace(/&([^;\s]+);/g,(_,name)=>{
 if(Object.hasOwn({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"},name))return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[name];
 const n=/^#x[\da-f]+$/i.test(name)?parseInt(name.slice(2),16):/^#\d+$/.test(name)?Number(name.slice(1)):NaN;
 check(Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff),'ENTITY');return String.fromCodePoint(n);
});
function rawCells(line,separator='|'){
 const cells=[''];let escaped=false;
 for(const c of line){if(escaped){cells[cells.length-1]+='\\'+c;escaped=false;}else if(c==='\\')escaped=true;else if(c===separator)cells.push('');else cells[cells.length-1]+=c;}
 check(!escaped,'ESCAPE');return cells;
}
const decodeCell=text=>unxml(text.replace(/\\(.)/gs,(_,c)=>{check(Object.hasOwn({'\\':'\\','|':'|',n:'\n',r:'\r',t:'\t','、':'、'},c),'ESCAPE');return {'\\':'\\','|':'|',n:'\n',r:'\r',t:'\t','、':'、'}[c];}));
export function splitV3Cells(line){return rawCells(line).map(decodeCell);}

function rows(text,allowed,phase,diagnostics=null){
 const result=[],seen=new Set();
 for(const [index,raw] of text.split(/\r?\n/).entries()){const line=publicLine(raw);if(!line||/^[-:|\s]+$/.test(line))continue;
  try{
  const [label,...cells]=splitV3Cells(line),prefix=phase.toUpperCase()+'_LINE_'+(index+1)+'_';let kind=label.trim().replace(/[:：]$/,'').trim(),wireVariant=null;
  if(PUBLIC_LABELS.has(kind)){kind=PUBLIC_LABELS.get(kind);wireVariant='public-label-alias';}
  if(phase==='after'&&BLANKABLE.has(kind)&&cells[0]?.trim()==='留白'){
   if(cells.length===2){cells.splice(0,1,kind);kind='留白';wireVariant='outcome-first-blank';}
   else if(cells.length===3&&cells[1].trim()===kind){cells.shift();kind='留白';wireVariant='repeated-category-blank';}
   else if(cells.length>=3){cells.splice(0,cells.length,kind,cells.slice(1).join(' · '));kind='留白';wireVariant='qualified-outcome-blank';}
  }
  // Supplementary public notes have no archival, permission or state semantics.
  // Preserve their label and content rather than rejecting an entire digest.
  if(!allowed.has(kind)){
   check(cells.length>0&&cells.some(c=>c.trim())&&/^[\p{L}\p{N}_ .·/（）()：:-]{1,80}$/u.test(kind),prefix+'LABEL');
   result.push({kind,cells:[cells.join(' · ')],wireVariant:'supplemental-public-note'});continue;
  }
  // Optional empty records may use the wider machine-block placeholder shape.
  // Quoted/literal tildes are content; unknown labels and substantive bad rows fail.
  if(['待定','解锁','已交付','候选'].includes(kind)&&cells.length&&cells.every(c=>c.trim()==='~'))continue;
  if(HEART.has(kind)&&cells.length===2&&cells.every(c=>['~',''].includes(c.trim())))continue;
  if(allowed.get(kind)===1&&cells.length>1&&cells[0].trim()!=='留白'){
   check(cells.every(c=>c.trim()),prefix+'EMPTY');const joined=cells.join(' · ');cells.splice(0,cells.length,joined);wireVariant='text-cell-join';
  }
  if((HEART.has(kind)||TODO.has(kind))&&cells.length>2){cells.splice(1,cells.length-1,cells.slice(1).join(' · '));wireVariant='public-note-cell-join';}
  if(kind==='设计'&&cells.length===2&&cells.every(c=>c.trim())){cells.push('');wireVariant='omitted-design-note';}
  if(TODO.has(kind)&&cells.length===1&&cells[0].trim()){cells.unshift('~');wireVariant='unspecified-task-trigger';}
  check(cells.length===allowed.get(kind),prefix+'COLUMNS');check(cells.every((c,i)=>c.trim()||wireVariant==='omitted-design-note'&&i===2),prefix+'EMPTY');
  const unique=HEART.has(kind)||OUTCOMES.has(kind)||['用户偏好','文风用词','情节取向','角色锚点','篇幅重点','信息迷雾'].includes(kind);if(unique)check(!seen.has(kind),'DUPLICATE_ROW');
  // Length is a generation requirement, not a reason to discard a readable aside.
  if(HEART.has(kind)&&[...cells[1]].length>80)wireVariant='long-public-comment';
  if(kind==='留白'){cells[0]=cells[0].trim();check(BLANKABLE.has(cells[0])&&!seen.has(cells[0]),prefix+'OUTCOME');seen.add(cells[0]);}
  if(unique)seen.add(kind);result.push({kind,cells,...(wireVariant?{wireVariant}:{})});
  }catch(error){if(!diagnostics)throw error;diagnostics.push({phase,line:index+1,code:error.code??'TISYA_V3_REPLY_INVALID',raw:line});}
 }
 return result;
}
export function readV3Paragraphs(body,{required=true}={}){
 if(!required&&!/^\s*1(?:\s|$)/.test(body))return null;
 return parseNumberedBody(body).map(p=>({id:p.number,raw:body.slice(p.contentStart,p.contentEnd),start:p.contentStart,end:p.contentEnd,blockStart:p.blockStart,blockEnd:p.blockEnd}));
}
function nativeTail(text){
 if(!text.trim())return {tail:'',statusMarker:false};
 const marker=/<StatusPlaceHolderImpl\s*\/>\s*$/.exec(text),update=marker?text.slice(0,marker.index):text;
 check(!update.trim()||/^\s*<UpdateVariable(?:\s|>)/.test(update),'OUTSIDE');
 // Keep malformed native payloads opaque too: their native owner reports them.
 return {tail:text,statusMarker:!!marker,markerStart:marker?.index??null,markerEnd:marker?marker.index+marker[0].trimEnd().length:null};
}
export function parseV3Envelope(source){
 check(typeof source==='string'&&source.length<=2000000,'SIZE');check(/^\s*<reply(?:\s|>)/.test(source),'ROOT');
 const stack=[],blocks={},blockAttrs={},ranges={},order=[];let current=null,rootEnd=null;
 for(const t of xmlTokens(source)){
  if(t.kind==='open'){
   if(!stack.length){check(t.name==='reply'&&!t.selfClose&&order.length===0,'ROOT');attrs(t.attrs,[],['id']);}
   else if(stack.length===1){
    const name=t.name==='think'?t.attrs.phase:t.name;check(name===V3_REPLY_ORDER[order.length],'ORDER');
    if(t.name==='think')attrs(t.attrs,['phase']);else if(name==='body'){attrs(t.attrs,['min','max','unit']);check(['字','词'].includes(t.attrs.unit)&&integer(t.attrs.min)<=integer(t.attrs.max),'BODY_RANGE');}
    else if(name==='actions'){if(t.selfClose)attrs(t.attrs,[]);else{attrs(t.attrs,['min','max']);check(integer(t.attrs.min)<=integer(t.attrs.max),'ACTION_RANGE');}}
    else attrs(t.attrs,[]);
    check(!t.selfClose||['extra','actions'].includes(name),'SELF_CLOSE');current=name;order.push(name);blocks[name]='';blockAttrs[name]={...t.attrs};ranges[name]={start:t.start,contentStart:t.end,contentEnd:t.end,end:t.end};
   }else {check(current==='body'||current==='extra','NESTED_RECORD');check(!['UpdateVariable','JSONPatch','Analysis'].includes(t.name),'NATIVE_IN_REPLY');if(current==='body')check(!['script','style','iframe','object','embed','form','input','button','select','textarea'].includes(t.name.toLowerCase()),'BODY_MARKUP');}
   if(!t.selfClose)stack.push(t.name);else if(stack.length===1)current=null;
  }else if(t.kind==='close'){
   check(stack.at(-1)===t.name,'CLOSE');
   if(stack.length===2){ranges[current].contentEnd=t.start;ranges[current].end=t.end;blocks[current]=source.slice(ranges[current].contentStart,t.start);current=null;}
   stack.pop();if(!stack.length){check(t.name==='reply','ROOT');rootEnd=t.end;break;}
  }else if(!stack.length||stack.length===1)check(t.kind==='comment'||!t.value.trim(),'OUTSIDE');
 }
 check(rootEnd!==null&&order.length===6&&!stack.length,'INCOMPLETE');
 return {version:3,order,blocks,attrs:blockAttrs,ranges,source:source.slice(0,rootEnd),native:nativeTail(source.slice(rootEnd))};
}
function titleOf(e){
 const lines=e.blocks.title.split(/\r?\n/).filter(x=>x.trim());check(lines.length===1,'TITLE');
 const cells=splitV3Cells(lines[0]);check(cells.length===4&&cells.every(c=>c.trim()),'TITLE');
 const [text,time,place,world]=cells.map(v=>v.trim()==='~'?null:v),places=place?rawCells(rawCells(lines[0])[2],'、').map(decodeCell):[];
 return {text,time,place,places,world};
}
function actionsOf(e){
 const aliases={交谈:'交流',对话:'交流',询问:'交流',探索:'调查',观察:'调查',行动:'操作',互动:'操作',休息:'休整'};
 const actions=e.blocks.actions.split(/\r?\n/).filter(x=>x.trim()).map(raw=>{const line=publicLine(raw);let [type,text,possibility,...rest]=splitV3Cells(line);type=type.trim();let wireVariant=null;const originalType=type;
  if(aliases[type]){type=aliases[type];wireVariant='action-type-alias';}
  if(!ACTION_TYPES.has(type)&&text?.trim()&&/^[\p{L}\p{N}_ .·/（）()-]{1,40}$/u.test(type)){type='其他';wireVariant='custom-action-type';}
  check(ACTION_TYPES.has(type)&&text?.trim(),'ACTION');
  if(possibility===undefined){possibility='';wireVariant='omitted-action-note';}
  if(rest.length){possibility=[possibility,...rest].join(' · ');wireVariant='action-note-cell-join';}
  return {type,text,possibility,...(wireVariant?{wireVariant,originalType}:{})};});
 if(Object.hasOwn(e.attrs.actions,'min'))check(actions.length>=integer(e.attrs.actions.min)&&actions.length<=integer(e.attrs.actions.max),'ACTION_RANGE');else check(!actions.length,'ACTION_RANGE');
 return actions;
}
export function parseV3Reply(source){
 const e=parseV3Envelope(source);return {...e,before:rows(e.blocks.before,BEFORE,'before'),after:rows(e.blocks.after,AFTER,'after'),title:titleOf(e),paragraphs:readV3Paragraphs(e.blocks.body),actions:actionsOf(e)};
}
export const isV3ReplyMessage=source=>typeof source==='string'&&/^\s*<reply(?:\s|>)/.test(source);
export const isV3ReplyCandidate=source=>typeof source==='string'&&/^\s*(?:<!--[\s\S]*?-->\s*)*<(?:reply|output|think|thinking|world_thinking|character_mode|character_thinking|task|next|status|memory|actions)\b/i.test(source);
export const extractV3Body=source=>parseV3Envelope(source).blocks.body;
const heart=rows=>{const items=rows.filter(r=>HEART.has(r.kind)).map(r=>({type:r.kind,mood:r.cells[0],text:r.cells[1]}));return {status:items.length?'有内容':'沉默',items};};
export function readV3Details(source,{tolerant=false}={}){
 const diagnostics=[],envelope=tolerant&&typeof source==='string'?parseV3Envelope(source):null;
 const e=envelope?{...envelope,before:rows(envelope.blocks.before,BEFORE,'before',diagnostics),after:rows(envelope.blocks.after,AFTER,'after',diagnostics)}:typeof source==='string'?parseV3Reply(source):source;
 const audit=e.after.filter(r=>OUTCOMES.has(r.kind)||r.kind==='留白').map(r=>({kind:r.kind==='留白'?r.cells[0]:r.kind,status:r.kind==='留白'?'留白':'落点',evidence:r.cells.at(-1)}));
 return {protocol:3,diagnostics,taskHeart:heart(e.before),nextHeart:heart(e.after),audit,rounds:{error:false,tasks:e.before.filter(r=>!HEART.has(r.kind)).map(r=>({label:r.kind,text:r.cells.join(' · ')})),delivered:e.after.filter(r=>r.kind==='已交付').map(r=>({text:r.cells[0]})),pending:e.after.filter(r=>TODO.has(r.kind)).map(r=>({label:r.kind,status:r.cells[0],text:r.cells[1]})),pendingError:false,candidates:e.after.filter(r=>r.kind==='候选').map(r=>({text:r.cells[0]}))},before:e.before,after:e.after};
}
export function readV3Journey(){return {recordSource:'forms',scene:null,associations:[],memories:[],characters:[],changes:[],player:null};}
export function readV3PublicEnvelope(source,{tolerant=false}={}){
 const e=tolerant?parseV3Envelope(source):parseV3Reply(source),details=readV3Details(tolerant?source:e,{tolerant});if(tolerant){e.title=titleOf(e);e.actions=actionsOf(e);e.paragraphs=readV3Paragraphs(e.blocks.body);e.before=details.before;e.after=details.after;}
 const task={tasks:details.rounds.tasks.map(r=>({type:r.label,plan:r.text})),audit:details.audit,heart:details.taskHeart};
 const next={heart:details.nextHeart,delivered:details.rounds.delivered.map(r=>r.text),tasks:details.rounds.pending.map(r=>({type:r.label,trigger:r.status,text:r.text})),actions:e.actions.map(r=>({...r,source:r.possibility}))};
 return {id:null,blocks:{task:JSON.stringify(task),title:JSON.stringify(e.title),body:e.blocks.body,next:JSON.stringify(next),extra:e.blocks.extra,actions:JSON.stringify({actions:next.actions})},attrs:{task:{format:'json'},title:{format:'json'},next:{format:'json'}},wire:{version:3,order:[...e.order]},projection:'public-ui',v3:e};
}
export function readV3Block(envelope,block){check(['task','title','next'].includes(block)&&typeof envelope?.blocks?.[block]==='string','BLOCK');return JSON.parse(envelope.blocks[block]);}
export function inspectV3Message(source,{tolerant=false}={}){
 const result=attempt(()=>parseV3Envelope(source));if(result.error)return {structured:true,body:{error:result.error},journey:{error:result.error},actions:{error:result.error},details:{error:result.error}};
 const e=result.value,paragraphs=attempt(()=>readV3Paragraphs(e.blocks.body));
 return {structured:true,body:{value:e.blocks.body,paragraphs,count:attempt(()=>countBody(paragraphs.value?paragraphs.value.map(p=>p.raw).join('\n\n'):e.blocks.body,e.attrs.body.unit))},journey:{value:readV3Journey()},actions:attempt(()=>actionsOf(e)),details:attempt(()=>readV3Details(source,{tolerant})),v3:e};
}

function partition(e){
 const result=[],slots=new Map(companionSlots(e).map(slot=>[slot.start,slot]));let depth=0,panel=null,panelCount=0;
 for(const t of xmlTokens(e.source)){
  const name=e.order.find(n=>t.start>=e.ranges[n].start&&t.start<e.ranges[n].end),owner=['body','extra'].includes(name)?name:'machine',range=name&&e.ranges[name],boundary=!!range&&(t.start===range.start||t.end===range.end);
  if(owner==='extra'&&!boundary&&t.kind==='open'&&depth===2)panel={id:'extra-'+(++panelCount),tag:t.name,label:t.attrs.title??t.attrs.name??null,...(slots.has(t.start)?{companion:true,companionSegments:[e.source.slice(t.start,slots.get(t.start).end)]}:{})};
  result.push({text:e.source.slice(t.start,t.end),owner,boundary,panel:owner==='extra'&&!boundary?panel:null});
  if(t.kind==='open'&&!t.selfClose)depth++;else if(t.kind==='close')depth--;
  if(owner==='extra'&&depth===2&&(t.kind==='close'||t.selfClose))panel=null;
 }
 if(e.native.tail){const tail=e.native.tail;if(e.native.statusMarker){const {markerStart:a,markerEnd:b}=e.native;result.push({text:tail.slice(0,a),owner:'machine',boundary:false,panel:null},{text:tail.slice(a,b),owner:'extra',boundary:false,panel:{id:'native-status',tag:'StatusPlaceHolderImpl',label:'角色状态'}},{text:tail.slice(b),owner:'machine',boundary:false,panel:null});}else result.push({text:tail,owner:'machine',boundary:false,panel:null});}
 return result;
}
const sliceRuns=(runs,start,end)=>{const result=[];let at=0;for(const r of runs){const stop=at+r.text.length;if(stop>start&&at<end)result.push({...r,text:r.text.slice(Math.max(0,start-at),end-at)});at=stop;if(at>=end)break;}return result;};
function compile(entry){
 check(typeof entry.findRegex==='string'&&typeof entry.replaceString==='string','RULE_TEXT');
 check(!/<%|\{\{(?!match\}\})/.test(entry.findRegex+'\n'+entry.replaceString)&&!entry.findRegex.includes('{{match}}')&&!/\$(?:`|')/.test(entry.replaceString),'RULE_TEMPLATE');
 check(Array.isArray(entry.trimStrings)&&!entry.trimStrings.length,'RULE_TRIM');
 check(['none','raw','escaped'].includes(entry.substitution),'RULE_SUBSTITUTION');
 const end=entry.findRegex.lastIndexOf('/');try{return entry.findRegex.startsWith('/')&&end>0?new RegExp(entry.findRegex.slice(1,end),entry.findRegex.slice(end+1)):new RegExp(entry.findRegex);}catch{fail('RULE_REGEX');}
}
function expand(template,match){return template.replace(/\{\{match\}\}|\$(\$|&|\d{1,2}|<[^>]*>)/g,(token,key)=>{if(token==='{{match}}'||key==='&')return match[0];if(key==='$')return '$';if(key.startsWith('<'))return match.groups===undefined?token:match.groups[key.slice(1,-1)]??'';const n=Number(key);if(n>0&&n<match.length)return match[n]??'';if(key.length===2&&Number(key[0])>0&&Number(key[0])<match.length)return(match[Number(key[0])]??'')+key[1];return token;});}
function eligible(entry,depth){
 check(typeof entry.enabled==='boolean','RULE_ENABLED');if(!entry.enabled)return 'disabled';
 check(Array.isArray(entry.placements)&&entry.placements.every(x=>['char','user','reasoning','lorebook'].includes(x)),'RULE_PLACEMENT');if(!entry.placements.includes('char'))return 'other-role';
 check(['display','sendAndDisplay','send','receive','editAndReceive'].includes(entry.timing),'RULE_TIMING');if(!['display','sendAndDisplay'].includes(entry.timing))return 'non-display';
 for(const k of ['minDepth','maxDepth'])check(entry[k]==null||Number.isSafeInteger(entry[k])&&entry[k]>=0,'RULE_DEPTH');
 if(entry.minDepth!=null||entry.maxDepth!=null){const d=Number.isSafeInteger(depth)?{min:depth,max:depth}:depth;check(d&&Number.isSafeInteger(d.min)&&d.min>=0&&(d.max===null||Number.isSafeInteger(d.max)&&d.max>=d.min),'DEPTH_REQUIRED');if(entry.minDepth!=null&&d.max!==null&&d.max<entry.minDepth||entry.maxDepth!=null&&d.min>entry.maxDepth)return 'depth';check(!(entry.minDepth!=null&&d.min<entry.minDepth||entry.maxDepth!=null&&(d.max===null||d.max>entry.maxDepth)),'DEPTH_INDETERMINATE');}
 return null;
}
function displayMarkers(html){return html.replace(/<!--[\s\S]*?-->|<(script|style|textarea|pre|code)\b[^>]*>[\s\S]*?<\/\1\s*>|<(\/)?([\p{L}_][\p{L}\p{N}\p{M}_.:-]*)((?:\s+[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*)(\/?)>/giu,(raw,opaque,close,name,a,empty)=>{if(!name||! /[^\x00-\x7f]/.test(name))return raw;return close?'</div>':'<div data-tisya-marker="'+name+'"'+a+'>'+(empty?'</div>':'');});}
export function runV3Display({source,groups=[],depth=null,opening=false,prepareRule=null}){
 check(Array.isArray(groups)&&groups.length<=100,'GROUP_LIMIT');const e=opening?null:parseV3Envelope(source);let runs=opening?[{text:source,owner:'body',boundary:false,panel:null}]:partition(e),total=0;const rules=[];
 for(let g=0;g<groups.length;g++){check(Array.isArray(groups[g].entries),'GROUP_ENTRIES');for(let i=0;i<groups[g].entries.length;i++){
  check(++total<=1000,'RULE_LIMIT');const entry=groups[g].entries[i],label={groupId:groups[g].id,groupIndex:g,entryIndex:i};const reason=eligible(entry,depth);if(reason){rules.push({...label,status:'skipped',reason});continue;}
  const native=prepareRule?.(entry),regex=native?.regex??compile(entry);regex.lastIndex=0;const input=runs.map(r=>r.text).join(''),out=[];let cursor=0,count=0,size=0;
  const append=items=>{for(const r of items){size+=r.text.length;check(size<=2000000,'DISPLAY_SIZE');out.push(r);}};
  for(let match;(match=regex.exec(input));){check(++count<=10000,'MATCH_LIMIT');const start=match.index,end=start+match[0].length,context=sliceRuns(runs,match[0].length?start:Math.max(0,start-1),match[0].length?end:Math.min(input.length,start+1)),owners=new Set(context.map(r=>r.owner));check(owners.size===1,'CROSS_REGION_MATCH');const panels=[...new Map(context.filter(r=>r.panel).map(r=>[r.panel.id,r.panel])).values()];let panel=panels[0]??null;
   if(panels.length>1){const ids=new Set(panels.map(p=>p.id));panel={...panel,tag:null,label:'组合扩展',companion:panels.every(p=>p.companion===true),companionSegments:[...new Set(panels.flatMap(p=>p.companionSegments??[]))]};for(const r of [...runs,...out])if(ids.has(r.panel?.id))r.panel=panel;}
   append(sliceRuns(runs,cursor,start));append([{text:native?native.expand(match,input):expand(entry.replaceString,match),owner:[...owners][0],boundary:false,panel,ruleName:entry.name??entry.scriptName??null}]);cursor=end;if(!regex.global)break;if(!match[0]){const point=input.codePointAt(regex.lastIndex);regex.lastIndex+=(regex.unicode||regex.unicodeSets)&&point>0xffff?2:1;}
  }
  append(sliceRuns(runs,cursor,input.length));runs=out;rules.push({...label,status:'applied',matches:count});
 }}
 const display=owner=>runs.filter(r=>r.owner===owner&&!r.boundary).map(r=>r.text).join('').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,(_,t)=>t);
 const extraPanels=[];let untagged=0;
 for(const r of runs.filter(r=>r.owner==='extra'&&!r.boundary)){const last=extraPanels.at(-1);if(!r.panel&&!r.text.trim()){if(last)last.html+=r.text;continue;}const id=r.panel?.id??(last?.untagged?last.id:'extra-text-'+(++untagged));if(last?.id===id){last.html+=r.text;if(r.ruleName)last.ruleName=r.ruleName;}else extraPanels.push({id,tag:r.panel?.tag??null,label:r.panel?.label??null,ruleName:r.ruleName??null,untagged:!r.panel,companion:r.panel?.companion===true,companionSegments:r.panel?.companionSegments??[],html:r.text});}
 const byId=new Map();for(const p of extraPanels){if(p.companion)continue;for(const segment of p.companionSegments){check(p.html.includes(segment),'COMPANION_DISPLAY_BOUNDARY');p.html=p.html.split(segment).join('');}delete p.companion;delete p.companionSegments;p.html=displayMarkers(p.html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,(_,t)=>t));if(byId.has(p.id))byId.get(p.id).html+=p.html;else byId.set(p.id,p);}
 const body=display('body');let cleanBody=body;try{cleanBody=readV3Paragraphs(body).map(p=>p.raw).join('\n\n');}catch{}
 const panels=[...byId.values()].filter(p=>p.html.trim());for(const p of panels)if(p.tag==='StatusPlaceHolderImpl'&&!p.ruleName)p.nativeHosted=true;
 return {body:cleanBody,extra:panels.map(p=>p.html).join(''),extraPanels:panels,rules,depth,nativeEquivalent:false,version:3};
}
