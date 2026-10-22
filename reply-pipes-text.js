import {parseSimpleSheet} from './tables/simple-sheet.js';

// A versioned, read-only adapter. Stored legacy pipes keep their original
// backslash/JSON semantics; only text="escaped" opts into this wire grammar.
const blocks=new Set(['task','title','next','status','memory','actions']);
const schemas={
 task:{任务:'ses',资料:'ss',待定:'s',人物:'ss?s',解锁:'sss',引用:'l',新发现:'ssss'},
 title:{场景:'s?L?'},next:{审计:'sss',待办:'sss',已交付:'s',候选:'s'},
 actions:{行动:'sss'},status:{原生状态:'sssv',叙事状态:'spsvv',知情:'sss'},
 memory:{关联:'lp',权限:'sxp',未完:'sslssp',倒计时:'sil?sp',条件:'ssvp',失效:'ssvp',事件:'lps',原文:'s',场景:'??·L?',结果:'s',影响:'s',伏笔:'slss',认知:'ssspss',心理:'spss',变动:'ssvvp',变因:'s',标签:'l'}
};
const fail=reason=>{throw Object.assign(Error('TISYA_PIPES_TEXT_'+reason),{code:'TISYA_PIPES_TEXT_'+reason});};
const xml=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function escapePipeText(text){return String(text).replace(/[\\|、\n\r\t]/g,c=>({'\\':'\\\\','|':'\\|','、':'\\、','\n':'\\n','\r':'\\r','\t':'\\t'}[c]));}
function split(text,separator){
 const out=[];let start=0;
 for(let i=0;i<text.length;i++){if(text[i]==='\\'){if(++i===text.length)fail('ESCAPE');continue;}if(text[i]===separator){out.push(text.slice(start,i).trim());start=i+1;}}
 out.push(text.slice(start).trim());return out;
}
function unescape(text){return text.replace(/\\([\s\S])|\\$/g,(_,c)=>{const escapes={'\\':'\\','|':'|','、':'、',n:'\n',r:'\r',t:'\t'};if(!Object.hasOwn(escapes,c))fail('ESCAPE');return escapes[c];});}
function safeJSON(value){
 const check=v=>{if(v===undefined)fail('MISSING_VALUE');if(v&&typeof v==='object')for(const x of Object.values(v))check(x);};check(value);return JSON.stringify(value);
}
export function decodeEscapedPipeBlock(name,text){
 if(!blocks.has(name)||typeof text!=='string')fail('BLOCK');
 const lines=text.replaceAll('\r\n','\n').split('\n'),at=lines.findIndex(line=>line==='【单元格】');
 let cells={};if(at>=0){cells=parseSimpleSheet(['【结果】',...lines.slice(at+1)].join('\n'));if(!cells||typeof cells!=='object'||Array.isArray(cells)||Object.keys(cells).some((key,index)=>key!==String(index+1)))fail('CELL_TABLE');}
 const used=new Set(),reference=raw=>{
  const match=/^〈格〉([1-9]\d*)$/.exec(raw);if(!match)return {found:false};
  const id=match[1];if(!Object.hasOwn(cells,id)||used.has(id))fail('CELL_REFERENCE');used.add(id);return {found:true,value:cells[id]};
 };
 function value(raw,type,locatorBlock){
  const ref=reference(raw);if(ref.found){
   const v=ref.value;
   if(['s','e','?','·'].includes(type)&&typeof v!=='string'&&!(v===null&&['?','·'].includes(type)))fail('CELL_TYPE');
   if(['l','L'].includes(type)&&!(Array.isArray(v)&&v.every(x=>typeof x==='string'))&&!(type==='L'&&v===null))fail('CELL_TYPE');
   if(type==='i'&&(!Number.isSafeInteger(v)||v<0))fail('CELL_TYPE');
   if(type==='x'&&(locatorBlock==='vars'?typeof v!=='string':!Array.isArray(v)||v.some(x=>typeof x!=='string')))fail('CELL_TYPE');
   return v===null&&['?','·','L'].includes(type)?'~':safeJSON(v);
  }
  if(raw.startsWith('〈文本〉'))return JSON.stringify(unescape(raw.slice(4)));
  if(type==='x')return locatorBlock==='vars'?JSON.stringify(unescape(raw)):safeJSON(split(raw,'、').map(unescape));
  if(type==='l'||type==='L'){
   if(raw==='〈空列〉'||raw==='[]')return '[]';if(raw==='~'&&type==='L')return '~';
   if(/^[\[{]/.test(raw))fail('LIST_REFERENCE');
   return safeJSON(split(raw,'、').map(unescape));
  }
  if(type==='i')return raw;
  if(type==='p'){if(!/^(?:[A-Ea-e]|~)$/.test(raw))fail('PERMISSION_REFERENCE');return raw;}
  if(raw==='~'&&(type==='?'||type==='v'||type==='·'))return '~';
  if(type==='v'){
   if(/^[\[{\"]/.test(raw))fail('VALUE_REFERENCE');
   if(raw==='〈空列〉')return '[]';
   if(raw==='〈空值〉')return 'null';
   if(raw.startsWith('〈数值〉')){const n=raw.slice(4);if(!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(n)||!Number.isFinite(Number(n)))fail('NUMBER');return n;}
   if(raw.startsWith('〈布尔〉')){const b=raw.slice(4);if(!['true','false'].includes(b))fail('BOOLEAN');return b;}
   if(raw.startsWith('〈'))fail('VALUE_TYPE');
  }
  return JSON.stringify(unescape(raw));
 }
 const result=[];
 for(const line of (at<0?lines:lines.slice(0,at)).filter(line=>line.trim())){
  const i=line.indexOf('：');if(i<1)fail('LABEL');const label=line.slice(0,i).trim(),raw=split(line.slice(i+1),'|');
  let schema=schemas[name]?.[label];
  if(label==='心声'&&['task','next'].includes(name))schema=raw.length===1?'s':'ss?s';
  if(['资料','待定','已交付','候选','解锁'].includes(label)&&raw.every(cell=>['','~','[]','〈空列〉'].includes(cell))){result.push(label+'：'+raw.map(()=> '~').join('|'));continue;}
  if(!schema||raw.length!==schema.length)fail('COLUMNS');
  const output=raw.map((cell,index)=>value(cell,schema[index],raw[0]));
  if(name==='memory'&&label==='场景'){
   const time=output.slice(1,3).map(cell=>cell==='~'?null:JSON.parse(cell));output.splice(1,2,safeJSON(time));
  }
  result.push(label+'：'+output.join('|'));
 }
 if(used.size!==Object.keys(cells).length)fail('UNUSED_CELL');
 return result.join('\n');
}

export function normalizeEscapedPipes(source,xmlTokens){
 if(!/\btext\s*=\s*(["'])escaped\1/.test(source))return source;
 const stack=[],edits=[];let current=null;
 for(const token of xmlTokens(source)){
  if(token.kind==='open'){
   if(current)fail('NESTED_BLOCK');
   if(stack.length===1&&blocks.has(token.name)&&token.attrs.text==='escaped'){
    if(token.attrs.format!=='pipes')fail('FORMAT');
    const open=source.slice(token.start,token.end).replace(/\s+text\s*=\s*(["'])escaped\1/,'');
    edits.push({start:token.start,end:token.end,text:open});
    if(!token.selfClose)current={name:token.name,start:token.end,text:''};
   }
   if(!token.selfClose)stack.push(token.name);
  }else if(token.kind==='close'){
   if(stack.at(-1)!==token.name)fail('XML_CLOSE');
   if(current&&stack.length===2){edits.push({start:current.start,end:token.start,text:xml(decodeEscapedPipeBlock(current.name,current.text))});current=null;}
   stack.pop();
  }else if(current&&token.kind==='text')current.text+=token.value;
  else if(current&&token.kind==='comment'&&/填写|占位/.test(token.value))fail('PLACEHOLDER');
 }
 if(stack.length||current)fail('INCOMPLETE');
 for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
 return source;
}
