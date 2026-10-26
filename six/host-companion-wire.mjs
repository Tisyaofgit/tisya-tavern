import {xmlTokens} from '../reader-core.js';
const fail=message=>{throw Object.assign(Error(message),{code:'COMPANION_REPLY'});};
const check=(ok,message)=>{if(!ok)fail(message);};
const prefix='<reply><extra>';
const decode=text=>text.replace(/&([^;\s]+);/g,(_,name)=>{const known={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};if(Object.hasOwn(known,name))return known[name];const value=/^#x[\da-f]+$/i.test(name)?parseInt(name.slice(2),16):/^#\d+$/.test(name)?Number(name.slice(1)):NaN;check(Number.isInteger(value)&&value>0&&value<=0x10ffff&&!(value>=0xd800&&value<=0xdfff),'小缇回复含无效转义');return String.fromCodePoint(value);});
/** Takes an already validated V3 envelope; no storage, lookup, or story writes. */
export function companionSlots(envelope,expected=null){
 check(typeof envelope?.blocks?.extra==='string','小缇回复缺少extra区块');const extra=prefix+envelope.blocks.extra+'</extra></reply>',allowed=expected===null?null:new Set(expected),answers=[],stack=[];let active=null;
 for(const token of xmlTokens(extra)){
  check(!active||token.kind!=='comment'&&!token.cdata,'小缇回复须使用普通XML转义文字');
  if(token.kind==='open'){
   if(token.name==='companion'){check(stack.length===2&&!token.selfClose&&Object.keys(token.attrs).length===1&&typeof token.attrs.id==='string'&&token.attrs.id.trim()&&token.attrs.id.length<=256,'小缇回复结构无效');check((allowed===null||allowed.has(token.attrs.id))&&!answers.some(a=>a.id===token.attrs.id),'小缇回复请求编号不符或重复');active={id:token.attrs.id,start:token.end,open:token.start};}
   else check(!active,'小缇回复须为纯文字');
   if(!token.selfClose)stack.push(token.name);
  }else if(token.kind==='close'){
   check(stack.pop()===token.name,'小缇回复标签不闭合');
   if(token.name==='companion'){const answer=decode(extra.slice(active.start,token.start)).trim();check(answer&&[...answer].length<=1200,'小缇回复须为1—1200字');const offset=(envelope.ranges?.extra?.contentStart??0)-prefix.length;answers.push({id:active.id,answer,start:active.open+offset,end:token.end+offset});active=null;}
  }
 }
 if(allowed)check(answers.length===allowed.size&&answers.every((answer,index)=>answer.id===expected[index]),'正文未按顺序完整回答本轮小缇消息');return answers;
}
